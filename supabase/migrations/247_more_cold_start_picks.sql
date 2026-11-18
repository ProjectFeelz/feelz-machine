-- supabase/migrations/247_more_cold_start_picks.sql
--
-- FIVE PICKS IS NOT A ROTATION, IT IS A PLAYLIST.
--
--
-- WHY THIS IS NEEDED
--
-- cold_start_picks leads the For You feed, and ForYouPage takes a window of
-- four from it. With five active picks, four of the same five songs opened the
-- app on every single load: the rotation changed their order and almost
-- nothing else. One track opened the app six times in a day for the same
-- listener.
--
-- The code half is fixed in the same batch: the window is now never more than
-- half the list, picks a listener has already played three times this week are
-- held out of it, and the recommender's own choices lead the feed with a pick
-- slipped in three cards down instead of taking position one.
--
-- That last change makes this list what it was always meant to be: the
-- fallback for a listener the recommender cannot help yet. Which makes the
-- list's contents a brand new listener's first impression of the platform.
--
--
-- WHAT I DID NOT ADD, AND WHY
--
-- Sorted by engagement, the top of the candidate pool is almost entirely
-- Steve's own accounts: Steve C-SA, Big Feelz, Sweet melodyz. Of course it is,
-- they have the most listening behind them.
--
-- They are excluded here on purpose. A new listener's first screen should not
-- be the owner's catalogue, however well it performs. That is how a platform
-- reads as a vanity project to the one person whose first impression matters.
--
-- Three more were excluded: "Started from 0" by Daash.Rsa, "Zero To Hero" by
-- Tragic KID and "Zero to Hero (Cover)" by 2CHIL. They are covers of the
-- Sessions song uploaded without entering, so they carry no competition_id and
-- 233 cannot see them. Putting them here would show a stranger the same song
-- three times in their first few cards, which is the exact thing 233 exists to
-- prevent.
--
--
-- WHAT WENT IN
--
-- One track per artist, six artists, nobody already on the list: R&B, Hip Hop,
-- Amapiano, Afrobeat and one Other. Named one at a time rather than selected
-- by a rule, because a rule that happens to pick these today will pick
-- something nobody checked tomorrow.
--
-- Five become eleven. With the window capped at half the list, four lead and
-- seven rotate through, so no pick can own the top of the app again.

begin;

insert into public.cold_start_picks (track_id, position, is_active, note)
select t.id, v.pos, true, v.note
from (values
  ('Waiting To Exhale',          'SAHM_za',          8,  'R&B'),
  ('Siyamthanda',                'Doped Uzzy',       9,  'Hip Hop'),
  ('Congolese Girl (wash)',      'KEEDACID',         10, 'Afrobeat'),
  ('Rave bootsology',            'Armaniroyal',      11, 'Amapiano'),
  ('No Tears (Feat. KC Namxz)',  'Eon Jams',         12, 'Hip Hop'),
  ('Tiki Taka',                  'uVasko Yidammit',  13, 'Other')
) as v(title, artist_name, pos, note)
join public.artists a on a.artist_name = v.artist_name
join public.tracks  t on t.artist_id = a.id and t.title = v.title
where t.is_published
  and coalesce(t.is_podcast, false) = false
  and coalesce(t.is_beat, false) = false
  and t.competition_id is null
  and t.cover_artwork_url is not null
  and t.file_url is not null
  -- re-running must not duplicate a pick
  and not exists (select 1 from public.cold_start_picks p where p.track_id = t.id);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 active picks now' as k, (select count(*)::text from public.cold_start_picks where is_active) as v
union all
select '2 distinct artists represented',
  (select count(distinct t.artist_id)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id where p.is_active)
union all
select '3 lead window the app will use',
  (select greatest(1, least(4, floor(count(*) / 2)))::text from public.cold_start_picks where is_active)
  || ' of ' || (select count(*)::text from public.cold_start_picks where is_active)
union all
select '4 any pick that is a competition entry',
  (select count(*)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
    where p.is_active and t.competition_id is not null) || ' (should be 0)'
union all
select '5 any pick not published or missing audio',
  (select count(*)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
    where p.is_active and (not t.is_published or t.file_url is null)) || ' (should be 0)'
union all
select '6 picks belonging to Steve''s own accounts',
  (select count(*)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
     join public.artists a on a.id = t.artist_id
    where p.is_active
      and a.artist_name in ('Steve C-SA','Big Feelz','Sweet melodyz','Feelz Machine'))
  || ' (the 5 originals are yours to judge; nothing new was added)'
union all
select '7 the full list',
  (select string_agg(a.artist_name || ' - ' || t.title, '  |  ' order by p.position)
     from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
     join public.artists a on a.id = t.artist_id
    where p.is_active)
order by 1;
