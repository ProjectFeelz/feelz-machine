-- supabase/migrations/249_sessions_dates_for_launch.sql
--
-- VOTING OPENS ON THE FIRST, THE WINNER IS ANNOUNCED ON THE FIFTEENTH.
--
--
-- WHY
--
-- Feelz Machine comes out of beta on 1 December and expects traffic from that
-- day. Voting should open with it, so the first thing new arrivals find is
-- something to do rather than a competition that opened without them.
--
-- winner_announced_at was never set. The voting page and every countdown read
-- these columns, so an unset date is a countdown with nothing to count to.
--
--   entries close      30 Nov   unchanged
--   voting opens        1 Dec   was 30 Nov
--   voting closes      15 Dec   unchanged
--   winner announced   15 Dec   was not set
--
-- Times are SAST, which is UTC+2, written as UTC here because that is what the
-- column stores. Voting opens at midnight on the first. The announcement is set
-- to 18:00 SAST on the fifteenth, a reasonable hour for a stream; move it if
-- the stream is at a different time, it is one update.
--
--
-- THE ORDER IS CHECKED, NOT ASSUMED
--
-- These four dates drive which phase the app believes it is in, and phase
-- decides whether the entry form appears, whether the vote page accepts a
-- vote, and what the Sessions button says. A set of dates out of order does
-- not error, it just puts the competition in a phase nobody intended. The
-- check at the end reads the phase back.

begin;

update public.competitions
set voting_open_at      = timestamptz '2026-11-30 22:00:00+00',  -- 1 Dec 00:00 SAST
    winner_announced_at = timestamptz '2026-12-15 16:00:00+00',  -- 15 Dec 18:00 SAST
    updated_at          = now()
where id = (select competition_id from public.school_sessions_config limit 1);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
with c as (
  select * from public.competitions
  where id = (select competition_id from public.school_sessions_config limit 1)
)
select '1 entries close' as k, (select to_char(entries_close_at at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c) as v
union all
select '2 voting opens',   (select to_char(voting_open_at    at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c)
union all
select '3 voting closes',  (select to_char(voting_close_at   at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c)
union all
select '4 winner announced', (select to_char(winner_announced_at at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c)
union all
select '5 dates in order',
  (select case
     when entries_close_at <= voting_open_at
      and voting_open_at   <  voting_close_at
      and voting_close_at  <= winner_announced_at
     then 'yes' else 'NO, CHECK THIS' end from c)
union all
select '6 phase the app will show today',
  (select case
     when now() < entries_open_at  then 'before entries'
     when now() < entries_close_at then 'submissions open'
     when now() < voting_open_at   then 'between entries and voting'
     when now() < voting_close_at  then 'voting'
     else 'results' end from c)
union all
select '7 phase on 1 December',
  (select case
     when timestamptz '2026-12-01 10:00:00+02' < entries_close_at then 'submissions open'
     when timestamptz '2026-12-01 10:00:00+02' < voting_open_at   then 'between, NOTHING TO DO'
     when timestamptz '2026-12-01 10:00:00+02' < voting_close_at  then 'VOTING, correct'
     else 'results' end from c)
union all
select '8 entries in, winner marked',
  (select count(*)::text from public.school_sessions_entries) || ' entries, winner: ' ||
  coalesce((select entrant_full_name from public.school_sessions_entries where is_winner limit 1), 'not marked yet')
order by 1;
