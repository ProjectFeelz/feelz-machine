-- Feelz Run: runs bank half their score as RP to spend, and skills cost twice as much.
-- The leaderboard score (game_runs.rp, best) is unchanged.
CREATE OR REPLACE FUNCTION public.game_submit_run(run_id uuid, mission text, run_time numeric, records integer, notes_low integer, notes_mid integer, notes_high integer, kos integer, journals text[], coin integer, misses integer, spare_seconds numeric, wipeouts integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  g public.game_missions;
  tok public.game_run_tokens;
  elapsed numeric;
  journal_count int;
  new_pages int;
  full_set boolean;
  rp int;
  rp_earned int;
  xp_gain int;
  prof public.game_players;
  old_best int;
  new_best boolean;
  my_rank int;
begin
  prof := public.game_ensure_player();
  select * into g from public.game_missions where id = mission;
  if g.id is null then raise exception 'Unknown mission.'; end if;

  select * into tok from public.game_run_tokens where id = run_id for update;
  if tok.id is null or tok.used or tok.user_id <> me or tok.mission <> mission then
    raise exception 'This run has already been posted or could not be verified.';
  end if;
  if tok.started_at < now() - interval '30 minutes' then raise exception 'This run is too old to post.'; end if;

  elapsed := extract(epoch from (now() - tok.started_at));
  if run_time < g.min_run_seconds or run_time > elapsed + 5 then raise exception 'This run could not be verified.'; end if;
  journals := coalesce(journals, '{}');
  journal_count := cardinality(journals);
  if records < 0 or notes_low < 0 or notes_mid < 0 or notes_high < 0 or kos < 0
     or coin < 0 or misses < 0 or misses > 500 or spare_seconds is null or spare_seconds < 0 or wipeouts < 0
     or records > g.total_records or notes_low > g.total_notes_low or notes_mid > g.total_notes_mid
     or notes_high > g.total_notes_high or kos > g.total_enemies or coin > g.total_coin
     or spare_seconds > g.max_spare_seconds
     or journal_count > cardinality(g.journal_ids)
     or not (journals <@ g.journal_ids)
     or journal_count <> (select count(distinct j) from unnest(journals) j) then
    raise exception 'This run could not be verified.';
  end if;

  update public.game_run_tokens set used = true where id = run_id;

  full_set := records >= g.total_records and notes_low >= g.total_notes_low and notes_mid >= g.total_notes_mid
    and notes_high >= g.total_notes_high and journal_count >= cardinality(g.journal_ids) and coin >= g.total_coin;
  rp := records * 5 + notes_low * 10 + notes_mid * 25 + notes_high * 50
      + kos * 25 + journal_count * 50 + coin * 100
      + floor(spare_seconds)::int * 4
      + case when misses = 0 then 300 else 0 end
      + case when wipeouts = 0 then 200 else 0 end
      + case when full_set then 500 else 0 end;
  rp_earned := ceil(rp / 2.0)::int;
  xp_gain := 50 + notes_low * 5 + notes_mid * 15 + notes_high * 30 + records + kos * 10 + 100;
  select count(*) into new_pages from unnest(journals) j where not (j = any (prof.journal));

  insert into public.game_runs (user_id, mission, rp, run_time, records, notes, kos, journals, misses, wipeouts)
  values (me, mission, rp, run_time, records, notes_low + notes_mid + notes_high, kos, journal_count, misses, wipeouts);

  old_best := coalesce((prof.best -> mission ->> 'rp')::int, 0);
  new_best := rp > old_best;
  update public.game_players p set
    xp = p.xp + xp_gain,
    rp_bank = p.rp_bank + rp_earned,
    stash_records = p.stash_records + records,
    stash_notes = p.stash_notes + notes_low + notes_mid + notes_high,
    stash_pages = p.stash_pages + new_pages,
    stash_coins = p.stash_coins + coin,
    vinyl_total = p.vinyl_total + records,
    notes_total = p.notes_total + notes_low + notes_mid + notes_high,
    kos_total = p.kos_total + kos,
    coins_total = p.coins_total + coin,
    journal = (select coalesce(array_agg(distinct j order by j), '{}') from unnest(p.journal || journals) j),
    runs = p.runs + 1,
    best = case when new_best then p.best || jsonb_build_object(mission, jsonb_build_object('rp', rp, 'time', run_time)) else p.best end
  where p.user_id = me;

  select count(*) + 1 into my_rank
  from (select r.user_id, max(r.rp) as top from public.game_runs r where r.mission = game_submit_run.mission group by r.user_id) b
  where b.top > greatest(old_best, rp);

  return json_build_object('rp', rp, 'rp_earned', rp_earned, 'xp_gained', xp_gain, 'new_best', new_best, 'rank', my_rank);
end;
$function$;

-- skill prices, set to the exact values in config.js (safe to run twice)
update public.game_skills s set rp_cost = v.cost
from (values
  ('air_dash', 5000),
  ('triple_jump', 11000),
  ('power_slide', 9000),
  ('wall_kick', 18000),
  ('ground_pound', 24000),
  ('takedown', 7000),
  ('flying_kick', 16000),
  ('spin_kick', 22000),
  ('heavy_smash', 28000),
  ('record_magnet', 6000),
  ('storm_shield', 14000),
  ('long_boost', 12000),
  ('extra_heart', 32000),
  ('dance_bboy', 3000),
  ('dance_swing', 8000),
  ('dance_robot', 15000),
  ('outfit_ice', 4000),
  ('outfit_crimson', 7000),
  ('outfit_violet', 13000),
  ('outfit_emerald', 20000)
) as v(id, cost)
where s.id = v.id;
