-- supabase/live_watch_history.sql
-- Streams you have watched (the Library's Streams tab) and the numbers for a
-- host's Live Studio. Run once in the Supabase SQL editor for the
-- feelz-machine project, AFTER live_review_gifts.sql. Safe to run again.

create table if not exists public.session_views (
  session_id       uuid not null references public.listening_sessions(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  first_watched_at timestamptz not null default now(),
  last_watched_at  timestamptz not null default now(),
  watched_live     boolean not null default false,
  primary key (session_id, user_id)
);
alter table public.session_views enable row level security;
drop policy if exists "Own watch history" on public.session_views;
create policy "Own watch history" on public.session_views for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists session_views_user_recent on public.session_views (user_id, last_watched_at desc);

-- Record a visit to a stream page: once per person per stream, with the time
-- of the latest visit and whether they ever watched it live.
create or replace function public.mark_stream_watched(p_session uuid)
returns void language sql security definer set search_path to 'public' as $$
  insert into session_views (session_id, user_id, watched_live)
  select p_session, auth.uid(), s.status = 'live'
    from listening_sessions s where s.id = p_session and auth.uid() is not null
  on conflict (session_id, user_id) do update
    set last_watched_at = now(),
        watched_live = session_views.watched_live or excluded.watched_live;
$$;
revoke all on function public.mark_stream_watched(uuid) from public, anon;
grant execute on function public.mark_stream_watched(uuid) to authenticated;

-- A host's streams with their numbers, newest first, for the Live Studio.
create or replace function public.my_stream_stats()
returns table(id uuid, title text, status text, mode text, youtube_url text, scheduled_at timestamptz,
              started_at timestamptz, ended_at timestamptz, replay_hidden boolean,
              viewers integer, live_viewers integer, messages integer, reviewed integer,
              waiting integer, reminders integer, gifts numeric)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.title, s.status, s.mode, s.youtube_url, s.scheduled_at, s.started_at, s.ended_at, s.replay_hidden,
         (select count(*) from session_views v where v.session_id = s.id)::int,
         (select count(*) from session_views v where v.session_id = s.id and v.watched_live)::int,
         (select count(*) from session_messages m where m.session_id = s.id)::int,
         (select count(*) from session_review_submissions q where q.session_id = s.id and q.status = 'reviewed')::int,
         (select count(*) from session_review_submissions q where q.session_id = s.id and q.status = 'pending')::int,
         (select count(*) from session_reminders r where r.session_id = s.id)::int,
         coalesce((select sum(q.gift_amount) from session_review_submissions q where q.session_id = s.id), 0)
    from listening_sessions s
    join artists a on a.id = s.artist_id
   where a.user_id = auth.uid()
   order by coalesce(s.started_at, s.scheduled_at) desc nulls last
   limit 100;
$$;
revoke all on function public.my_stream_stats() from public, anon;
grant execute on function public.my_stream_stats() to authenticated;
