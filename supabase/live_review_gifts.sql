-- supabase/live_review_gifts.sql
-- Paid live reviews, as gifts. An artist sends the host a gift (a tip through
-- the normal tip flow, straight to the host) and their track moves up the
-- review queue: bigger gifts go first. Run once in the Supabase SQL editor for
-- the feelz-machine project, AFTER live_reviews_and_scheduling.sql.
-- Safe to run again.

alter table public.session_review_submissions
  add column if not exists gift_amount numeric,
  add column if not exists gift_tip_id uuid;
create unique index if not exists session_review_submissions_gift_tip_key
  on public.session_review_submissions (gift_tip_id) where gift_tip_id is not null;

-- A free submission cannot claim a gift, and can only jump the queue with the
-- Pro or Premium boost (once per stream).
drop policy if exists "Artists submit their own tracks" on public.session_review_submissions;
create policy "Artists submit their own tracks" on public.session_review_submissions for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.artists a where a.id = artist_id and a.user_id = (select auth.uid()))
    and exists (select 1 from public.tracks t where t.id = track_id and t.artist_id = session_review_submissions.artist_id and t.is_published)
    and exists (select 1 from public.listening_sessions s where s.id = session_id and s.status in ('live', 'scheduled') and s.reviews_open)
    and public.review_slots_used(session_id) < 2
    and gift_amount is null and gift_tip_id is null
    and (not coalesce(is_priority, false) or (
          exists (select 1 from public.artists a where a.id = artist_id and a.tier in ('pro', 'premium'))
          and not exists (select 1 from public.session_priority_boosts b
                           where b.session_id = session_review_submissions.session_id and b.user_id = (select auth.uid()))))
  );

-- Send a track in with a gift, or add a gift to one already waiting. Uses the
-- most recent tip from you to the host in the last 30 minutes that has not
-- already paid for a review.
create or replace function public.submit_review_with_gift(p_session uuid, p_track uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_s listening_sessions;
  v_artist uuid;
  v_tip tips;
  v_id uuid;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  select * into v_s from listening_sessions where id = p_session;
  if v_s.id is null or v_s.status not in ('live', 'scheduled') then raise exception 'this stream is not taking tracks'; end if;

  select t.artist_id into v_artist from tracks t join artists a on a.id = t.artist_id
   where t.id = p_track and t.is_published and a.user_id = v_uid;
  if v_artist is null then raise exception 'you can only send your own published tracks'; end if;

  select * into v_tip from tips t
   where t.from_user_id = v_uid and t.artist_id = v_s.artist_id
     and t.created_at > now() - interval '30 minutes'
     and not exists (select 1 from session_review_submissions q where q.gift_tip_id = t.id)
   order by t.created_at desc limit 1;
  if v_tip.id is null then raise exception 'no gift found'; end if;

  -- Already waiting: the gift lifts it. New: it joins with the gift.
  update session_review_submissions
     set gift_amount = v_tip.amount, gift_tip_id = v_tip.id, is_priority = true, boosted_at = now()
   where session_id = p_session and track_id = p_track and status = 'pending'
  returning id into v_id;

  if v_id is null then
    if not v_s.reviews_open then raise exception 'the host has paused submissions'; end if;
    if public.review_slots_used(p_session) >= 2 then raise exception 'you already have two tracks waiting'; end if;
    insert into session_review_submissions (session_id, user_id, artist_id, track_id, is_priority, boosted_at, gift_amount, gift_tip_id)
    values (p_session, v_uid, v_artist, p_track, true, now(), v_tip.amount, v_tip.id)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.submit_review_with_gift(uuid, uuid) from public, anon;
grant execute on function public.submit_review_with_gift(uuid, uuid) to authenticated;

-- The public queue, now ordered by gift first.
drop function if exists public.session_review_queue(uuid);
create function public.session_review_queue(p_session uuid)
returns table(id uuid, track_id uuid, track_title text, cover_url text, artist_name text,
              status text, is_priority boolean, place integer, is_mine boolean, verdict jsonb, gift_amount numeric)
language sql stable security definer set search_path to 'public' as $$
  select q.id, q.track_id, t.title, t.cover_artwork_url, a.artist_name, q.status, q.is_priority,
         case when q.status = 'pending'
              then (row_number() over (partition by (q.status = 'pending')
                                       order by q.gift_amount desc nulls last, q.is_priority desc, q.boosted_at nulls last, q.submitted_at))::int
         end as place,
         q.user_id = auth.uid() as is_mine,
         q.verdict,
         q.gift_amount
    from session_review_submissions q
    join tracks t on t.id = q.track_id
    join artists a on a.id = q.artist_id
   where q.session_id = p_session
     and q.status in ('pending', 'reviewing', 'reviewed')
   order by case q.status when 'reviewing' then 0 when 'pending' then 1 else 2 end,
            q.gift_amount desc nulls last, q.is_priority desc, q.boosted_at nulls last, q.submitted_at;
$$;
grant execute on function public.session_review_queue(uuid) to anon, authenticated;
