-- supabase/migrations/250_voting_closes_before_the_stream.sql
--
-- THE WINNER CANNOT BE ANNOUNCED WHILE VOTING IS STILL OPEN.
--
--
-- WHAT 249's CHECK CAUGHT
--
-- 249 set the announcement to 15 Dec 18:00 and left voting closing at 15 Dec
-- 23:59. Its own check block answered "5 dates in order: NO, CHECK THIS", and
-- it was right:
--
--   voting closes      15 Dec 23:59
--   winner announced   15 Dec 18:00   <- six hours EARLIER
--
-- That is not a cosmetic ordering problem. The stream announces a winner while
-- the vote page is still accepting votes, so for six hours the site is taking
-- votes in a competition that has already been decided. The first person to
-- notice is an entrant who voted after the stream.
--
--
-- WHICH DATE MOVED, AND WHY THAT ONE
--
-- The announcement did not move. 15 December at 18:00 is the stream, it is
-- what has been said publicly, and it is the fixed point.
--
-- So voting closes at midday on the fifteenth instead of midnight:
--
--   entries close      30 Nov 23:59   unchanged
--   voting opens        1 Dec 00:00   unchanged
--   voting closes      15 Dec 12:00   was 23:59
--   winner announced   15 Dec 18:00   unchanged
--
-- Voting still runs the full fourteen days and the morning of the fifteenth.
-- Six hours between the close and the stream is enough to read the final
-- count, check it against the judge scores, and tell the winner before the
-- rest of the country hears it, which is a better way for them to find out.
--
-- The other way round works too: leave voting at 23:59 and move the stream to
-- the sixteenth. That is one update if the stream time changes.

begin;

update public.competitions
set voting_close_at = timestamptz '2026-12-15 10:00:00+00',  -- 15 Dec 12:00 SAST
    updated_at      = now()
where id = (select competition_id from public.school_sessions_config limit 1);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
--
-- Same question 249 asked, asked again in full rather than checking the one
-- column this file touched. That is what found the problem.
with c as (
  select * from public.competitions
  where id = (select competition_id from public.school_sessions_config limit 1)
)
select '1 entries close' as k, (select to_char(entries_close_at at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c) as v
union all
select '2 voting opens',     (select to_char(voting_open_at      at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c)
union all
select '3 voting closes',    (select to_char(voting_close_at     at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI') from c)
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
select '6 gap between close and stream',
  (select round(extract(epoch from (winner_announced_at - voting_close_at)) / 3600)::text || ' hours' from c)
union all
select '7 phase the app will show today',
  (select case
     when now() < entries_open_at  then 'before entries'
     when now() < entries_close_at then 'submissions open'
     when now() < voting_open_at   then 'between entries and voting'
     when now() < voting_close_at  then 'voting'
     else 'results' end from c)
union all
select '8 phase at 10:00 on 1 December',
  (select case
     when timestamptz '2026-12-01 10:00:00+02' < voting_open_at  then 'NOTHING TO DO'
     when timestamptz '2026-12-01 10:00:00+02' < voting_close_at then 'VOTING, correct'
     else 'results' end from c)
union all
select '9a phase at 18:00 on 15 December',
  (select case
     when timestamptz '2026-12-15 18:00:00+02' < voting_close_at then 'STILL VOTING, WRONG'
     else 'results, correct' end from c)
union all
select '9b entries in, winner marked',
  (select count(*)::text from public.school_sessions_entries) || ' entries, winner: ' ||
  coalesce((select entrant_full_name from public.school_sessions_entries where is_winner limit 1), 'not marked yet')
order by 1;
