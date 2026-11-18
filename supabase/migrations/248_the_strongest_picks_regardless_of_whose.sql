-- supabase/migrations/248_the_strongest_picks_regardless_of_whose.sql
--
-- PUTTING THE BEST MUSIC BACK IN, INCLUDING STEVE'S.
--
--
-- WHY THIS REVERSES PART OF 247
--
-- 247 excluded Steve C-SA, Big Feelz and Sweet melodyz from the candidate list
-- on the grounds that a stranger's first screen should not be the owner's
-- catalogue.
--
-- That reasoning was about how the list LOOKS. Steve's answer was about what
-- the list is FOR, and it is the better argument: cold start picks are a first
-- impression, and a first impression made of weaker songs is worse than one
-- made of the owner's stronger ones. The numbers are not close. Started From
-- Zero has 291 streams. The strongest track by anybody else in the pool has 11.
--
-- So the rule here is simply the best music, and whose it is does not come
-- into it.
--
--
-- THE ONE THING WORTH WATCHING, SAID ONCE
--
-- After this the list is 14 picks, 4 of them Steve's or family. That is a bit
-- over a quarter, which reads as a founder who makes good music rather than a
-- platform that only plays its owner. If it ever grows past about half, the
-- reading changes, and the artists on the supply side are the ones who notice
-- first. Not a problem at 4 of 14.
--
--
-- WHAT WENT IN
--
--   Started From Zero   Steve C-SA   291 streams, and the Sessions song
--                                    itself, which is pointed on the way into
--                                    the winner stream
--   Call Me             Steve C-SA    70 streams
--   Hold Me Down        Big Feelz     36 streams, and a different voice from
--                                    the two above
--
-- Still one track per artist from 247's six, so the list gains range rather
-- than losing it. Named one at a time, same as 247, so nothing unintended can
-- be swept in by a rule.

begin;

insert into public.cold_start_picks (track_id, position, is_active, note)
select t.id, v.pos, true, v.note
from (values
  ('Started From Zero', 'Steve C-SA', 14, 'Sessions song, strongest on the platform'),
  ('Call Me',           'Steve C-SA', 15, 'R&B'),
  ('Hold Me Down',      'Big Feelz',  16, 'Different voice')
) as v(title, artist_name, pos, note)
join public.artists a on a.artist_name = v.artist_name
join public.tracks  t on t.artist_id = a.id and t.title = v.title
where t.is_published
  and coalesce(t.is_podcast, false) = false
  and coalesce(t.is_beat, false) = false
  and t.competition_id is null
  and t.cover_artwork_url is not null
  and t.file_url is not null
  and not exists (select 1 from public.cold_start_picks p where p.track_id = t.id);

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 active picks now' as k, (select count(*)::text from public.cold_start_picks where is_active) as v
union all
select '2 lead window the app will use',
  (select greatest(1, least(4, floor(count(*) / 2)))::text from public.cold_start_picks where is_active)
  || ' lead, ' ||
  (select (count(*) - greatest(1, least(4, floor(count(*) / 2))))::text from public.cold_start_picks where is_active)
  || ' rotate through'
union all
select '3 distinct artists',
  (select count(distinct t.artist_id)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id where p.is_active)
union all
select '4 share that is Steve or family',
  (select count(*)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
     join public.artists a on a.id = t.artist_id
    where p.is_active and a.artist_name in ('Steve C-SA','Big Feelz','Sweet melodyz','Feelz Machine'))
  || ' of ' || (select count(*)::text from public.cold_start_picks where is_active)
union all
select '5 any competition entry slipped in',
  (select count(*)::text from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
    where p.is_active and t.competition_id is not null) || ' (should be 0)'
union all
select '6 the full list, in order',
  (select string_agg(a.artist_name || ' - ' || t.title, '  |  ' order by p.position)
     from public.cold_start_picks p
     join public.tracks t on t.id = p.track_id
     join public.artists a on a.id = t.artist_id
    where p.is_active)
order by 1;
