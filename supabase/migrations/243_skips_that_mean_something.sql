-- supabase/migrations/243_skips_that_mean_something.sql
--
-- A SKIP AT ONE PERCENT AND A SKIP AT SIXTY-NINE COUNT THE SAME. SO DOES THE
-- FIRST SKIP AND THE TWENTIETH.
--
--
-- WHAT IS WRONG
--
-- listener_feedback already stores listen_pct, the share of the song somebody
-- heard before leaving. compute-recommendations never selects that column, so
-- the scorer cannot see it. It applies a flat score -= 40 to any track in the
-- skipped set and that is the whole of it.
--
-- The table also holds one row per user and track, upserted. Skip a song
-- twenty times and the row is overwritten twenty times, so the twentieth skip
-- teaches the engine exactly what the first did.
--
-- The result is visible in Steve's own feed. His skips average 2% of a song.
-- Five tracks he abandoned after roughly one second are still recommended to
-- him, because from_following is worth 63 points and a skip costs 40:
--
--   High Rises                   skipped at 1%   from_following   63 -> 23
--   No Tears (Feat. KC Namxz)    skipped at 1%   from_following   27.6
--   Demon Girl                   skipped at 1%   new_release      16.5
--
-- Following somebody outweighs walking out of their song in one second, every
-- time, no matter how many times you walk out.
--
--
-- WHAT THIS ADDS
--
-- Two things the scorer can read: how many times, and how badly.
--
-- skip_count, so a repeated skip accumulates instead of overwriting itself.
-- listen_pct was already there and is simply never read; the code half of this
-- change starts selecting it.
--
--
-- WHY AN RPC AND NOT A BIGGER UPSERT IN THE PAGE
--
-- Incrementing from the browser means reading the row, adding one and writing
-- it back. Two round trips with a gap in the middle, and skips arrive in
-- bursts, so the gap is exactly when the next one lands. The count would drift
-- low and nobody would ever notice.
--
-- The upsert below does it in one statement, in the database, where the
-- increment cannot interleave.
--
-- It also carries a guard the page currently has to remember: a row whose
-- signal is 'not_interested' is never overwritten. That is a hard rejection
-- and it shares this row. ForYouPage checks a ref before writing, which works
-- until some other screen forgets. Now the rule lives where the data lives.

begin;

-- ── 1. How many times ───────────────────────────────────────────────────────
alter table public.listener_feedback
  add column if not exists skip_count int not null default 0;

comment on column public.listener_feedback.skip_count is
  'How many separate times this listener skipped this track. Incremented by record_skip(). A repeated skip is a stronger signal than a single one, and the row is upserted, so without this the count was always effectively 1.';

comment on column public.listener_feedback.listen_pct is
  'How much of the track was heard before leaving, 0 to 100. On a repeat skip record_skip() keeps the LOWEST, because the fastest walkout is the clearest statement of taste.';

-- Every skip already on file happened at least once.
update public.listener_feedback
set skip_count = 1
where signal = 'skip' and skip_count = 0;

-- ── 2. One statement, no gap to interleave in ───────────────────────────────
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
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  insert into public.listener_feedback (user_id, track_id, artist_id, signal, listen_pct, skip_count, updated_at)
  values (auth.uid(), p_track_id, p_artist_id, 'skip', greatest(0, least(100, coalesce(p_listen_pct, 0))), 1, now())
  on conflict (user_id, track_id) do update
    set skip_count = public.listener_feedback.skip_count + 1,
        -- the harshest reading of the two, see the column comment
        listen_pct = least(public.listener_feedback.listen_pct, excluded.listen_pct),
        signal     = 'skip',
        updated_at = now()
  -- NEVER walk over a hard rejection. This is the guard the page should not
  -- have to remember, and the reason hidden songs came back once already.
  where public.listener_feedback.signal <> 'not_interested';
end;
$$;

revoke all on function public.record_skip(uuid, uuid, numeric) from public;
grant execute on function public.record_skip(uuid, uuid, numeric) to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 skip_count column' as k,
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='listener_feedback' and column_name='skip_count'
  ) then 'added' else 'MISSING' end as v
union all
select '2 record_skip function', case when exists (select 1 from pg_proc where proname='record_skip') then 'ready' else 'MISSING' end
union all
select '3 existing skips backfilled to 1', (select count(*)::text from public.listener_feedback where signal='skip' and skip_count=1)
union all
select '4 any skip still on zero', (select count(*)::text from public.listener_feedback where signal='skip' and skip_count=0)
union all
select '5 not_interested rows, untouched', (select count(*)::text from public.listener_feedback where signal='not_interested')
union all
select '6 average listen_pct on skips', (select round(avg(listen_pct))::text || '%' from public.listener_feedback where signal='skip')
union all
select '7 tracks that will now be dropped from a feed',
  (select count(*)::text from public.listener_recommendations r
     join public.listener_feedback f on f.user_id=r.user_id and f.track_id=r.track_id
    where f.signal='skip'
      and r.score - (40 * greatest(0, least(1, (70 - coalesce(f.listen_pct,0)) / 70.0)) * least(coalesce(f.skip_count,1), 4)) <= 0)
  || ' of ' ||
  (select count(*)::text from public.listener_recommendations r
     join public.listener_feedback f on f.user_id=r.user_id and f.track_id=r.track_id
    where f.signal='skip')
  || ' currently-recommended skipped tracks'
order by 1;
