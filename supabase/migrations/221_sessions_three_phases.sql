-- supabase/migrations/221_sessions_three_phases.sql
--
-- THREE PHASES, SO THE CROWD HAS A HAND IN IT.
--
-- Today there is one phase wearing two hats. Every entry is on the vote page,
-- anybody with an account casts one vote, and separately a judge can flip
-- is_finalist or is_winner on any entry at any time, in any number, with no
-- relation to the votes at all. The public vote is called "a separate
-- recognition", which is a polite way of saying it decides nothing.
--
-- What this builds instead:
--
--   1. PEOPLE'S CHOICE.  Everyone votes. The votes produce a ranked list and
--                        the top 20 go through. The public did that, not us.
--   2. FINALISTS.        On the stream, judges cut those 20 down to 10. A
--                        finalist can only come from the 20, and there can
--                        only be 10 of them. Both enforced here, not in a
--                        screen somebody can get around.
--   3. THE WINNER.       Picked from the 10, live. A non finalist cannot be
--                        made the winner.
--
-- The two numbers live in school_sessions_config so a future season can run
-- 30 and 12 without a deploy.
--
-- WHY THE RULES ARE IN THE DATABASE
--
-- judge_set_finalist is callable by any judge account. A cap enforced only in
-- the panel is a cap until somebody opens the console, and on a live stream
-- the one thing you cannot do is pause to fix a rule that was never real.

begin;

-- ── The two numbers ─────────────────────────────────────────────────────────
alter table public.school_sessions_config
  add column if not exists shortlist_size int not null default 20,
  add column if not exists finalist_cap   int not null default 10;

comment on column public.school_sessions_config.shortlist_size is
  'How many entries the public vote puts through. Phase 1 to phase 2.';
comment on column public.school_sessions_config.finalist_cap is
  'How many of those become finalists. Phase 2 to phase 3.';

-- ── Phase 1: the ranking the public made ────────────────────────────────────
--
-- Ties broken by who got there first. Two entries on four votes each is common
-- early on, and a ranking that reshuffles on every page load looks rigged.
create or replace function public.sessions_vote_ranking(p_competition_id uuid)
returns table(entry_id uuid, votes bigint, rank bigint)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select e.id,
         count(v.id) as votes,
         row_number() over (order by count(v.id) desc, e.created_at asc) as rank
  from school_sessions_entries e
  left join school_sessions_votes v on v.entry_id = e.id
  where e.competition_id = p_competition_id
    and coalesce(e.is_rejected, false) = false
  group by e.id, e.created_at
$fn$;

grant execute on function public.sessions_vote_ranking(uuid) to authenticated, anon;

-- ── Phase 2: finalists, from the shortlist, capped ──────────────────────────
create or replace function public.judge_set_finalist(p_entry_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_comp      uuid;
  v_shortlist int;
  v_cap       int;
  v_rank      bigint;
  v_count     int;
begin
  select competition_id into v_comp
  from school_sessions_entries where id = p_entry_id;

  if v_comp is null then
    raise exception 'No such entry';
  end if;

  -- Unchanged: an admin, or a judge for THIS competition. Judging one season
  -- does not carry over to the next.
  if not exists (select 1 from admins where user_id = auth.uid())
     and not exists (
       select 1 from school_sessions_judges j
       where j.user_id = auth.uid() and j.competition_id = v_comp
     )
  then
    raise exception 'Unauthorized';
  end if;

  select coalesce(shortlist_size, 20), coalesce(finalist_cap, 10)
    into v_shortlist, v_cap
  from school_sessions_config
  where competition_id = v_comp
  limit 1;

  v_shortlist := coalesce(v_shortlist, 20);
  v_cap       := coalesce(v_cap, 10);

  if p_value then
    -- THE PUBLIC'S CUT COMES FIRST.
    --
    -- Only checked when there are votes to check. With nothing cast yet every
    -- entry ranks by created_at, and refusing a finalist on the strength of a
    -- ranking nobody voted in would make the panel unusable before voting
    -- opens, which is exactly when it gets tested.
    if exists (select 1 from school_sessions_votes v
               join school_sessions_entries e on e.id = v.entry_id
               where e.competition_id = v_comp)
    then
      select r.rank into v_rank
      from sessions_vote_ranking(v_comp) r
      where r.entry_id = p_entry_id;

      if v_rank is null or v_rank > v_shortlist then
        raise exception 'Only the top % of the public vote can be made finalists. This entry is number %.',
          v_shortlist, coalesce(v_rank::text, 'unranked');
      end if;
    end if;

    select count(*) into v_count
    from school_sessions_entries
    where competition_id = v_comp
      and is_finalist = true
      and id is distinct from p_entry_id;

    if v_count >= v_cap then
      raise exception 'There are already % finalists. Take one off before adding another.', v_cap;
    end if;

    if exists (select 1 from school_sessions_entries
               where id = p_entry_id and coalesce(is_rejected, false) = true)
    then
      raise exception 'That entry was rejected. Undo the NAH before making it a finalist.';
    end if;
  end if;

  update school_sessions_entries
  set is_finalist = p_value,
      -- Dropping a finalist drops the winner with it. A winner who is not a
      -- finalist is a state the vote page cannot draw and nobody can explain
      -- on a stream.
      is_winner = case when p_value then is_winner else false end
  where id = p_entry_id;
end;
$fn$;

grant execute on function public.judge_set_finalist(uuid, boolean) to authenticated;

-- ── Phase 3: the winner, from the finalists ─────────────────────────────────
create or replace function public.judge_set_winner(p_entry_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_comp uuid;
begin
  select competition_id into v_comp
  from school_sessions_entries where id = p_entry_id;

  if v_comp is null then
    raise exception 'No such entry';
  end if;

  if not exists (select 1 from admins where user_id = auth.uid())
     and not exists (
       select 1 from school_sessions_judges j
       where j.user_id = auth.uid() and j.competition_id = v_comp
     )
  then
    raise exception 'Unauthorized';
  end if;

  if p_value then
    if not exists (select 1 from school_sessions_entries
                   where id = p_entry_id and is_finalist = true)
    then
      raise exception 'Only a finalist can win. Make this one a finalist first.';
    end if;

    -- ONE WINNER. The old version set a flag and left any previous winner
    -- standing, so two winners was one mis-click away, on camera.
    update school_sessions_entries
    set is_winner = false
    where competition_id = v_comp and is_winner = true and id is distinct from p_entry_id;
  end if;

  update school_sessions_entries
  set is_winner = p_value
  where id = p_entry_id;
end;
$fn$;

grant execute on function public.judge_set_winner(uuid, boolean) to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select 'shortlist_size' as k, shortlist_size::text as v from school_sessions_config
union all
select 'finalist_cap', finalist_cap::text from school_sessions_config
union all
select 'ranking returns', count(*)::text from sessions_vote_ranking(
  (select competition_id from school_sessions_config limit 1))
union all
select 'finalists now', count(*)::text from school_sessions_entries where is_finalist = true
union all
select 'winners now', count(*)::text from school_sessions_entries where is_winner = true
order by 1;
