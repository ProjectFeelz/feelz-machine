-- NOTIFY-ENTRANTS-TIKTOK.sql
--
-- Tell the 14 entrants their TikTok now plays inside the app.
--
-- In app and by email in one insert: email_requested = true is what the
-- mailer picks up, so there is no second list to keep in step with this one.
--
-- Addressed to the ARTIST ACCOUNT behind the entry, not to entrant_email.
-- The entry email is what somebody typed into a form; the account is where
-- their notifications already go, and it is the one they are signed in to.
--
-- Safe to run twice. The guard is on metadata->>'kind', so a second run finds
-- everybody already told and inserts nothing.

insert into public.notifications
  (user_id, artist_id, type, title, message, email_requested, metadata)
select
  ar.user_id,
  e.artist_id,
  'admin_message',
  'Your TikTok now plays on the Sessions page',
  'The TikTok you posted with your entry now plays right on the Sessions page. People can watch your performance without leaving, and the judges see it too, next to your song. '
  || 'You do not need to do anything, it is already there. '
  || 'If yours does not show up, open your entry and check the link you pasted is the post itself.',
  true,
  jsonb_build_object('kind', 'sessions_tiktok_live', 'entry_id', e.id)
from public.school_sessions_entries e
join public.artists ar on ar.id = e.artist_id
where ar.user_id is not null
  and e.tiktok_video_url is not null
  and not exists (
    select 1 from public.notifications n
    where n.metadata->>'kind' = 'sessions_tiktok_live'
      and n.metadata->>'entry_id' = e.id::text
  );

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect one notice per entrant, all with an email queued.
select 'entrants told' as k, count(*)::text as v
from notifications where metadata->>'kind' = 'sessions_tiktok_live'
union all
select 'emails queued', count(*)::text
from notifications
where metadata->>'kind' = 'sessions_tiktok_live' and email_requested = true
union all
select 'entries with a link', count(*)::text
from school_sessions_entries where tiktok_video_url is not null
union all
select 'tiktoks resolved and playable', count(*)::text
from school_sessions_entries where tiktok_video_id is not null
order by 1;
