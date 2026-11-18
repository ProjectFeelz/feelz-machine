-- supabase/live_thumbnails.sql
-- A thumbnail of the host's own for each stream, shown everywhere in Feelz
-- Machine (Feelz Live, Home, the stream page, the replay, Library and shared
-- link previews) without touching the video's thumbnail on YouTube.
-- Run once in the Supabase SQL editor for the feelz-machine project.
-- Safe to run again.

alter table public.listening_sessions
  add column if not exists thumbnail_url text;

alter table public.listening_sessions
  drop constraint if exists listening_sessions_thumbnail_url_check;
alter table public.listening_sessions
  add constraint listening_sessions_thumbnail_url_check
  check (thumbnail_url is null or (thumbnail_url ~ '^https://' and char_length(thumbnail_url) <= 1000));
