-- supabase/migrations/227_update_drafts_for_davu.sql
--
-- IN-APP UPDATE POSTS, WRITTEN AND PARKED.
--
-- Three posts covering what changed this week. They go in UNPUBLISHED, so
-- Davu can read them, change the wording, and release each one when Steve
-- says. Nothing reaches anybody until is_published is set to true.
--
-- WRITING RULES THESE FOLLOW
--
-- Plain words, short sentences, no dashes. Say what changed and what it means
-- for the person reading, not what we did. An artist does not care that a
-- query asked for the wrong columns; they care that their links work now.
--
-- Run this once. The guard is on the title, so running it twice changes
-- nothing.

begin;

insert into public.platform_news (title, body, is_published, created_at)
select v.title, v.body, false, now()
from (values

  ('Your song links work for everyone now',
   'If you shared a song and somebody said they got "Track not found", that was us, and it is fixed.' || chr(10) || chr(10) ||
   'Any link to a song opened fine if you were signed in, and showed nothing if you were not. So every link you sent to a friend, put in your bio, or posted on WhatsApp was dead for anybody who did not already have an account. The people it broke for were exactly the people you were trying to reach.' || chr(10) || chr(10) ||
   'Nothing was wrong with your songs. You do not need to re-upload anything or share anything again, though old links are worth sending once more now that they open. Sorry, this one was a long time coming.'),

  ('Everything you need is in the plus button',
   'The plus button at the bottom used to be for making things. Now it is the whole app.' || chr(10) || chr(10) ||
   'Tap it and you will find, under Account: what you have earned and who is listening, Feelz Retail for getting your music into venues, your collab splits, the affiliate programme, and your email settings. Under Reach your fans there is now Collab Radar, for finding artists to work with.' || chr(10) || chr(10) ||
   'None of this is new. All of it was already there, buried in places you had to already know about. Several of those pages are the ones that pay you, so it is worth a look even if you think you have seen everything.'),

  ('Sessions: watch the TikToks without leaving',
   'Every Sessions entry comes with a TikTok post. Until now that was a link that took you to TikTok and lost your place.' || chr(10) || chr(10) ||
   'Now the video plays on the page, under the song. The judges see it the same way while they are listening, so your performance counts as much as your recording does.' || chr(10) || chr(10) ||
   'The public vote also decides more than it used to. Your votes pick the top 20. On the livestream the judges cut those to 10 finalists, and the winner comes out of that 10 on the day. So voting is the first round, not a side prize.')

) as v(title, body)
where not exists (
  select 1 from public.platform_news n where n.title = v.title
);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
-- Three drafts, none of them live.
select 'drafts waiting' as k, count(*)::text as v
from platform_news where is_published = false
union all
select 'published by mistake', count(*)::text
from platform_news
where is_published = true and created_at > now() - interval '10 minutes'
order by 1;
