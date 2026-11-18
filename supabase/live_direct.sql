-- supabase/live_direct.sql
-- Direct streaming with Cloudflare Stream: stream from OBS straight into
-- Feelz Machine, no YouTube in between. Run once in the Supabase SQL editor
-- for the feelz-machine project, AFTER live_watch_history.sql. Safe to run
-- again. Nothing here does anything until the Cloudflare keys are in Netlify.

-- Each artist gets one Cloudflare live input, kept for good, so their OBS
-- settings never change between streams. Only the artist can see theirs; the
-- stream key itself is never stored here, it is fetched from Cloudflare when
-- the artist opens their Live Studio.
create table if not exists public.artist_live_inputs (
  artist_id  uuid primary key references public.artists(id) on delete cascade,
  cf_uid     text not null unique,
  created_at timestamptz not null default now()
);
alter table public.artist_live_inputs enable row level security;
drop policy if exists "Artist sees their live input" on public.artist_live_inputs;
create policy "Artist sees their live input" on public.artist_live_inputs for select
  using (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = (select auth.uid())));

-- On the stream: the live input to play (public, it is only a playback id)
-- and, once the stream has ended, the recording to play as the replay.
alter table public.listening_sessions
  add column if not exists cf_live_uid text,
  add column if not exists cf_replay_uid text;
