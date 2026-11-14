-- supabase/migrations/222_tiktok_video_id.sql
--
-- RESOLVE THE SHORT LINKS ONCE, NOT ON EVERY PAGE LOAD.
--
-- Measured on the live season: of 14 entries, ONE pasted a link an embed can
-- read. The other 13 are vm.tiktok.com short links, because that is what
-- TikTok's share button hands you on a phone, which is where every one of
-- these was recorded.
--
-- A short link hides the video id behind a redirect, so it cannot be embedded
-- from the browser. It has to be followed server side. Following it on every
-- page load would mean thirteen redirects chased every time a judge opens the
-- panel, so the answer is stored the first time and never looked up again.
--
-- The raw URL stays exactly as the entrant typed it. This column is derived,
-- and if it is ever wrong it can be set back to null and resolved again.

alter table public.school_sessions_entries
  add column if not exists tiktok_video_id text;

comment on column public.school_sessions_entries.tiktok_video_id is
  'TikTok video id, resolved from tiktok_video_url by the tiktok-resolve function. Derived; safe to null out and rebuild.';

-- This table is granted column by column because it holds entrant emails and
-- guardian details. A new column lands with no grant at all, which is a 403 on
-- the whole request rather than a null on one field. That is how the judges
-- page broke last time.
grant select (tiktok_video_id) on public.school_sessions_entries to authenticated, anon;

-- Backfill the one link that was already in a readable shape, so the resolver
-- only has the genuinely short ones left to chase.
update public.school_sessions_entries
set tiktok_video_id = substring(tiktok_video_url from 'tiktok\.com/(?:@[^/]+/)?(?:video|photo)/([0-9]{6,})')
where tiktok_video_id is null
  and tiktok_video_url ~* 'tiktok\.com/(@[^/]+/)?(video|photo)/[0-9]{6,}';

-- ── Check ───────────────────────────────────────────────────────────────────
select 'entries with a link' as k, count(*)::text as v
from school_sessions_entries where tiktok_video_url is not null
union all
select 'already resolved', count(*)::text
from school_sessions_entries where tiktok_video_id is not null
union all
select 'left for the resolver', count(*)::text
from school_sessions_entries
where tiktok_video_url is not null and tiktok_video_id is null
union all
select 'column readable by visitors', coalesce(string_agg(distinct grantee, ', '), 'NOBODY, FIX THIS')
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'school_sessions_entries'
  and column_name = 'tiktok_video_id' and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated')
order by 1;
