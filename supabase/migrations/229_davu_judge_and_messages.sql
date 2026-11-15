-- supabase/migrations/229_davu_judge_and_messages.sql
--
-- Three things I left as instructions instead of doing them.
--
--   1. Add Davu as a judge.
--   2. Tell Davu her drafts are waiting.
--   3. Ask the three Sessions entrants whose TikTok link cannot be played to
--      send a working one.
--
-- All of it is guarded, so running it twice does nothing the second time.

begin;

-- ── 1. Davu, as a judge ─────────────────────────────────────────────────────
--
-- Looked up rather than hardcoded, because I do not know which address she
-- signed up with. The match is deliberately narrow: an email that begins
-- "davu", and ONLY IF EXACTLY ONE ACCOUNT MATCHES. Two matches means I would
-- be guessing which colleague gets judging rights on a live competition, and
-- that is not a guess worth making, so it does nothing and says so at the end.
insert into public.school_sessions_judges (user_id, competition_id)
select u.id, (select competition_id from public.school_sessions_config limit 1)
from auth.users u
where lower(u.email) like 'davu%'
  and (select count(*) from auth.users x where lower(x.email) like 'davu%') = 1
  and not exists (
    select 1 from public.school_sessions_judges j where j.user_id = u.id
  );

-- ── 2. Davu's drafts are ready ──────────────────────────────────────────────
insert into public.notifications (user_id, artist_id, type, title, message, email_requested, metadata)
select u.id, null, 'admin_message',
  'Your drafts are ready',
  'There are three update posts waiting for you in the platform updates, and a newsletter sitting in your composer drafts called "Everything you need is in the plus button". '
  || 'Nothing is scheduled and nothing has been sent. Read them, change whatever you want, and hold them until Steve gives you the word. '
  || 'The newsletter has a picture to go with it. Steve has it, it is called create-menu-update.png, and there is a marker in the body showing where it goes.',
  true,
  jsonb_build_object('kind', 'davu_drafts_ready')
from auth.users u
where lower(u.email) like 'davu%'
  and not exists (
    select 1 from public.notifications n
    where n.user_id = u.id and n.metadata->>'kind' = 'davu_drafts_ready'
  );

-- ── 3. The three entrants with a link that will not play ────────────────────
--
-- One message per person, and each one says what is actually wrong with THEIR
-- link. "Your link does not work" makes somebody check a link that looks fine
-- to them; "you sent us your profile instead of the post" they can act on in
-- ten seconds.
--
-- Worth saying plainly: they have done nothing wrong and their entry still
-- counts. The TikTok is how people watch them, not whether they are in.
insert into public.notifications (user_id, artist_id, type, title, message, email_requested, metadata)
select
  ar.user_id,
  e.artist_id,
  'admin_message',
  'Can you send us your TikTok link again?',
  'Your Sessions entry is fine and it still counts. This is only about the TikTok.' || chr(10) || chr(10) ||
  case
    when e.tiktok_video_url ~* 'tiktok\.com/@[^/]+/?$'
      then 'The link on your entry goes to your TikTok profile rather than to the post itself. We need the link to the actual video, so it can play on your entry page where people vote.'
    when e.tiktok_video_url !~* 'tiktok\.com'
      then 'The link on your entry is not a TikTok address, so there is nothing for us to play. It may have been pasted in half.'
    else 'The link on your entry does not open any more. The video may have been deleted, set to private, or posted from an account that is now private.'
  end
  || chr(10) || chr(10) ||
  'To get the right one: open your post on TikTok, tap Share, then Copy link. Send that to us and we will put it on your entry.' || chr(10) || chr(10) ||
  'Everyone else''s video plays on their entry page and the judges watch it while they listen. Yours should too.',
  true,
  jsonb_build_object('kind', 'sessions_tiktok_broken', 'entry_id', e.id)
from public.school_sessions_entries e
join public.artists ar on ar.id = e.artist_id
where ar.user_id is not null
  and e.tiktok_video_url is not null
  and e.tiktok_video_id is null          -- the resolver could not read it
  and not exists (
    select 1 from public.notifications n
    where n.metadata->>'kind' = 'sessions_tiktok_broken'
      and n.metadata->>'entry_id' = e.id::text
  );

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select 'judges now' as k, coalesce(string_agg(u.email, ', '), 'nobody') as v
from school_sessions_judges j join auth.users u on u.id = j.user_id
union all
select 'accounts starting with davu', count(*)::text
from auth.users where lower(email) like 'davu%'
union all
select 'davu told about drafts', count(*)::text
from notifications where metadata->>'kind' = 'davu_drafts_ready'
union all
select 'entrants asked for a new link', count(*)::text
from notifications where metadata->>'kind' = 'sessions_tiktok_broken'
union all
select 'entries still unplayable', count(*)::text
from school_sessions_entries
where tiktok_video_url is not null and tiktok_video_id is null
order by 1;
