-- supabase/migrations/244_recover_the_skips_that_were_overwritten.sql
--
-- THE SKIP HISTORY WAS NEVER LOST. IT WAS JUST NEVER COUNTED.
--
--
-- WHY 243 ALONE DOES NOTHING FOR ANYBODY TODAY
--
-- 243 added skip_count and set every existing skip to 1, because that was all
-- listener_feedback could tell us: the row is upserted, so twenty skips left
-- one row behind.
--
-- A count of 1 earns a one day rest. Steve's skips of the tracks he has been
-- complaining about are sixty-one days old, so their rest expired two months
-- ago and they are eligible again right now. He would have to skip each of
-- them three more times before they stopped returning, which is the same
-- complaint he started with, only slower.
--
-- The real history is in listening_events, which keeps one row per play and
-- was never overwritten. 52 plays of one artist, 26 of them under fifteen
-- seconds. He has been saying no for two months in a table nobody asked.
--
--
-- THE RULE, AND THE SONG THAT PROVES IT IS NEEDED
--
-- The obvious backfill is "count every fast play as a skip". Run that and
-- High Rises gets a skip_count of 14 and stops being recommended for good.
-- Steve likes High Rises. He has played it 26 times.
--
-- So a fast play is not evidence on its own. What separates the two cases is
-- whether the listener has EVER stayed to the end:
--
--   Against The Storm   109 plays   39 fast skips   44 full listens
--   God is My Woman      70 plays   15 fast skips   33 full listens
--   High Rises           26 plays   14 fast skips    6 full listens
--   I Choose You          6 plays    6 fast skips    0 full listens
--   One Of Those Days     6 plays    6 fast skips    0 full listens
--
-- Every track he keeps has full listens. Every track he is sick of has none.
-- Skipping a song you have finished before is about timing. Skipping one you
-- have never finished, over and over, is about the song.
--
-- So this only counts skips on tracks the listener has never once played to
-- 70% or more. That threshold is not invented here: it is the same number
-- ForYouPage uses to call a play a deep listen, so the two cannot disagree.
--
--
-- WHAT IT WILL NOT DO
--
-- It never lowers a count, never touches a 'not_interested' row, and never
-- creates feedback for a track the listener has finished even once. A listener
-- who skips the same song forever but did sit through it in March keeps it.

begin;

-- ── 1. Recover the counts ───────────────────────────────────────────────────
create temp table skips_recovered_244 as
with fast as (
  select user_id, track_id, count(*) as skips, max(created_at) as last_skip
  from public.listening_events
  where user_id is not null
    and coalesce(listened_seconds, 0) < 15
    and coalesce(completion_pct, 0) < 10
  group by user_id, track_id
),
finished as (
  select user_id, track_id
  from public.listening_events
  where user_id is not null
    and coalesce(completion_pct, 0) >= 70
  group by user_id, track_id
),
genuine as (
  select f.*
  from fast f
  where f.skips >= 2                      -- one fast play is not a pattern
    and not exists (                      -- and they never stayed to the end
      select 1 from finished d
      where d.user_id = f.user_id and d.track_id = f.track_id
    )
),
upserted as (
  insert into public.listener_feedback (user_id, track_id, artist_id, signal, listen_pct, skip_count, updated_at)
  select g.user_id, g.track_id,
         (select t.artist_id from public.tracks t where t.id = g.track_id),
         'skip', 0, g.skips, g.last_skip
  from genuine g
  on conflict (user_id, track_id) do update
    set skip_count = greatest(public.listener_feedback.skip_count, excluded.skip_count),
        updated_at = greatest(public.listener_feedback.updated_at, excluded.updated_at)
    where public.listener_feedback.signal <> 'not_interested'
  returning user_id, track_id, skip_count
)
select * from upserted;

commit;

-- ── 2. A song you have finished can never be banned outright ────────────────
--
-- The backfill above is careful about this, but record_skip() runs from now
-- on and knows nothing about it. Without this a track somebody loves could
-- still climb to 4 over a long enough stretch of bad timing and disappear.
--
-- Capped at 3, so a finished song can still rest for thirty days, but it
-- always comes back.
create or replace function public.record_skip(
  p_track_id   uuid,
  p_artist_id  uuid,
  p_listen_pct numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finished boolean;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select exists (
    select 1 from public.listening_events le
    where le.user_id = auth.uid()
      and le.track_id = p_track_id
      and coalesce(le.completion_pct, 0) >= 70
  ) into v_finished;

  insert into public.listener_feedback (user_id, track_id, artist_id, signal, listen_pct, skip_count, updated_at)
  values (auth.uid(), p_track_id, p_artist_id, 'skip', greatest(0, least(100, coalesce(p_listen_pct, 0))), 1, now())
  on conflict (user_id, track_id) do update
    set skip_count = case
                       when v_finished then least(3, public.listener_feedback.skip_count + 1)
                       else public.listener_feedback.skip_count + 1
                     end,
        listen_pct = least(public.listener_feedback.listen_pct, excluded.listen_pct),
        signal     = 'skip',
        updated_at = now()
  where public.listener_feedback.signal <> 'not_interested';
end;
$$;

revoke all on function public.record_skip(uuid, uuid, numeric) from public;
grant execute on function public.record_skip(uuid, uuid, numeric) to authenticated;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 feedback rows given a real count' as k, (select count(*)::text from skips_recovered_244) as v
union all
select '2 of those, now 4+ (stop returning)', (select count(*)::text from skips_recovered_244 where skip_count >= 4)
union all
select '3 High Rises for Steve, must stay low',
  coalesce((select 'skip_count=' || f.skip_count::text from public.listener_feedback f
     join public.tracks t on t.id = f.track_id
    where f.user_id = '8633f6a3-a33e-4ed8-ac98-f61f3a47240f' and t.title = 'High Rises'), 'no row')
union all
select '4 tracks he finished at least once, now 4+',
  (select count(*)::text from public.listener_feedback f
    where f.skip_count >= 4
      and exists (select 1 from public.listening_events le
                   where le.user_id = f.user_id and le.track_id = f.track_id
                     and coalesce(le.completion_pct,0) >= 70))
  || ' (should be 0)'
union all
select '5 not_interested rows, untouched', (select count(*)::text from public.listener_feedback where signal='not_interested')
union all
select '6 his Nostalgic Unit counts now',
  coalesce((select string_agg(t.title || ' x' || f.skip_count::text, ', ' order by f.skip_count desc)
     from public.listener_feedback f
     join public.tracks t on t.id = f.track_id
     join public.artists a on a.id = t.artist_id
    where f.user_id = '8633f6a3-a33e-4ed8-ac98-f61f3a47240f'
      and a.artist_name ilike '%nostalgic%' and f.skip_count >= 2), 'none')
order by 1;
