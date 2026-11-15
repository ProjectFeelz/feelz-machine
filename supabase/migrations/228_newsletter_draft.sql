-- supabase/migrations/228_newsletter_draft.sql
--
-- THE NEWSLETTER, SEEDED AS A DRAFT.
--
-- Goes into newsletter_drafts, which is where the composer looks, so Davu
-- opens /newsletter/compose, picks it from her drafts, and it loads into the
-- editor exactly as if she had typed it.
--
-- Nothing is scheduled and nothing is sent. sent_at and scheduled_at are both
-- null, which is what the composer treats as "still a draft".
--
-- audience is left null ON PURPOSE. The composer makes you choose who it goes
-- to before it will send, and that is a decision for Steve, not a default
-- buried in a migration. A newsletter that goes to the wrong list cannot be
-- taken back.
--
-- The illustration is NOT in here. It lives on the Desktop as
-- create-menu-update.png and Davu adds it in the editor, under the first
-- paragraph, where the marker says so.
--
-- Safe to run twice; the guard is on the title.

begin;

insert into public.newsletter_drafts (title, excerpt, body, audience, youtube_url, created_by, note)
select
  'Everything you need is in the plus button',

  'The plus button used to be for making things. Now it is the whole app. Plus an apology about shared links.',

  -- Body. Plain paragraphs, no dashes, short sentences.
  'The plus button at the bottom of the app used to be for making things. Upload a track, add a story, go live. From today it is the whole app.' || chr(10) || chr(10) ||
  '[ ILLUSTRATION GOES HERE: create-menu-update.png ]' || chr(10) || chr(10) ||
  'Open it and you will find, under Account:' || chr(10) || chr(10) ||
  'Earnings and stats. What you have made and who is listening. One tap, instead of hunting for the right tab on your dashboard.' || chr(10) || chr(10) ||
  'Feelz Retail. Getting your music into shops, bars and venues, which pays separately from streaming.' || chr(10) || chr(10) ||
  'Splits. What collaborators owe you, and what you owe them.' || chr(10) || chr(10) ||
  'Affiliate Programme. Earn when you bring people to Feelz Machine.' || chr(10) || chr(10) ||
  'Email preferences. Decide what reaches your inbox.' || chr(10) || chr(10) ||
  'And under Reach your fans, there is now Collab Radar, for finding other artists to work with.' || chr(10) || chr(10) ||
  'Here is the honest part. None of this is new. All of it was already built and already working. It was sitting in places you had to already know about, which meant most of you never saw it. Three of those pages are the ones that pay you.' || chr(10) || chr(10) ||
  'If you have been here for months and have never opened Feelz Retail or your affiliate link, that is on us, not on you. Have a look now.' || chr(10) || chr(10) ||
  'One more thing, and we owe you an apology for it.' || chr(10) || chr(10) ||
  'If you ever shared one of your songs and somebody told you the link said Track not found, that was our fault. Song links opened perfectly if you were already signed in, and showed nothing at all if you were not. So every link you put in your bio, sent on WhatsApp, or posted for your fans was broken for anyone without an account. The people it failed for were exactly the people you were trying to reach.' || chr(10) || chr(10) ||
  'It is fixed. Nothing was ever wrong with your music and there is nothing for you to redo. But it is worth sharing those links again now that they open for everybody.',

  null,   -- audience: Steve chooses
  null,   -- no video

  (select user_id from public.admins limit 1),

  'DRAFT for Davu. Do not send until Steve says.' || chr(10) ||
  'Add create-menu-update.png where the marker is, it is on the Desktop in Claude outputs.' || chr(10) ||
  'The apology section matters more than the feature list. If you cut anything, cut the features.' || chr(10) ||
  'Keep "that is on us, not on you". People have been apologising for not finding things that were genuinely hidden.' || chr(10) ||
  'If this goes to listeners as well as artists, add: "Listeners, your plus button has your listening stats and your email settings in it now too."' || chr(10) ||
  'House style: no dashes, short sentences, nothing anybody needs a second read for.'
where not exists (
  select 1 from public.newsletter_drafts d
  where d.title = 'Everything you need is in the plus button'
);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
-- One draft, unsent, unscheduled, with a note on it.
select 'draft saved' as k, count(*)::text as v
from newsletter_drafts
where title = 'Everything you need is in the plus button'
union all
select 'sent or scheduled by mistake', count(*)::text
from newsletter_drafts
where title = 'Everything you need is in the plus button'
  and (sent_at is not null or scheduled_at is not null)
union all
select 'has an author', case when exists (
  select 1 from newsletter_drafts
  where title = 'Everything you need is in the plus button' and created_by is not null
) then 'yes' else 'NO, set created_by by hand' end
order by 1;
