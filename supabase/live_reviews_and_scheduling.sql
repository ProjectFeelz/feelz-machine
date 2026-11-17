-- supabase/live_reviews_and_scheduling.sql
-- Live track reviews and scheduled streams. Run once in the Supabase SQL
-- editor for the feelz-machine project, AFTER live_chat_moderation.sql.
-- Safe to run again.

-- ── Live reviews ──────────────────────────────────────────────────────────

alter table public.session_review_submissions
  add column if not exists review_started_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists verdict jsonb;

alter table public.listening_sessions
  add column if not exists reviews_open boolean not null default true,
  add column if not exists reviewing_submission_id uuid,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists replay_hidden boolean not null default false;

-- How many of your tracks are waiting in a stream's queue. A function, so the
-- submit rule below can count without reading its own table under RLS.
create or replace function public.review_slots_used(p_session uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from session_review_submissions
   where session_id = p_session and user_id = auth.uid() and status in ('pending', 'reviewing');
$$;
grant execute on function public.review_slots_used(uuid) to authenticated;

-- Artists submit their own published tracks, while the stream is on, up to
-- two waiting at a time.
drop policy if exists "Logged in users can submit their own tracks" on public.session_review_submissions;
drop policy if exists "Artists submit their own tracks" on public.session_review_submissions;
create policy "Artists submit their own tracks" on public.session_review_submissions for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.artists a where a.id = artist_id and a.user_id = (select auth.uid()))
    and exists (select 1 from public.tracks t where t.id = track_id and t.artist_id = session_review_submissions.artist_id and t.is_published)
    and exists (select 1 from public.listening_sessions s where s.id = session_id and s.status in ('live', 'scheduled') and s.reviews_open)
    and public.review_slots_used(session_id) < 2
  );

-- Moderators see and manage the queue too.
drop policy if exists "Mods view submissions" on public.session_review_submissions;
create policy "Mods view submissions" on public.session_review_submissions for select
  using (public.is_session_mod(session_id));
drop policy if exists "Mods update submissions" on public.session_review_submissions;
create policy "Mods update submissions" on public.session_review_submissions for update
  using (public.is_session_mod(session_id)) with check (public.is_session_mod(session_id));

-- The queue as everyone sees it: what is waiting, in order, and which are yours.
create or replace function public.session_review_queue(p_session uuid)
returns table(id uuid, track_id uuid, track_title text, cover_url text, artist_name text,
              status text, is_priority boolean, place integer, is_mine boolean, verdict jsonb)
language sql stable security definer set search_path to 'public' as $$
  select q.id, q.track_id, t.title, t.cover_artwork_url, a.artist_name, q.status, q.is_priority,
         case when q.status = 'pending'
              then (row_number() over (partition by (q.status = 'pending')
                                       order by q.is_priority desc, q.boosted_at nulls last, q.submitted_at))::int
         end as place,
         q.user_id = auth.uid() as is_mine,
         q.verdict
    from session_review_submissions q
    join tracks t on t.id = q.track_id
    join artists a on a.id = q.artist_id
   where q.session_id = p_session
     and q.status in ('pending', 'reviewing', 'reviewed')
   order by case q.status when 'reviewing' then 0 when 'pending' then 1 else 2 end,
            q.is_priority desc, q.boosted_at nulls last, q.submitted_at;
$$;
grant execute on function public.session_review_queue(uuid) to anon, authenticated;

-- Start reviewing a track: it goes on stage, everyone gets a rating poll,
-- and the artist who sent it is told to come and watch.
create or replace function public.session_start_review(p_submission uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_sub session_review_submissions;
  v_s listening_sessions;
  v_title text; v_artist text; v_host_name text;
  v_poll uuid;
begin
  select * into v_sub from session_review_submissions where id = p_submission;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not public.is_session_mod(v_sub.session_id) then raise exception 'not allowed'; end if;
  select * into v_s from listening_sessions where id = v_sub.session_id;

  -- One track on stage at a time: anything still on stage goes back in line.
  update session_review_submissions set status = 'pending'
   where session_id = v_sub.session_id and status = 'reviewing' and id <> v_sub.id;

  update session_review_submissions set status = 'reviewing', review_started_at = now() where id = v_sub.id;
  update listening_sessions set reviewing_submission_id = v_sub.id where id = v_sub.session_id;

  select t.title into v_title from tracks t where t.id = v_sub.track_id;
  select a.artist_name into v_artist from artists a where a.id = v_sub.artist_id;
  select a.artist_name into v_host_name from artists a where a.id = v_s.artist_id;

  -- Close earlier rating polls so only this one is open.
  update session_polls set expires_at = now()
   where session_id = v_sub.session_id and poll_type = 'track_review' and expires_at > now();

  insert into session_polls (session_id, artist_id, poll_type, track_id, track_title, track_artist, question, options, expires_at)
  values (v_sub.session_id, v_s.artist_id, 'track_review', v_sub.track_id, v_title, v_artist,
          'Rate "' || v_title || '"',
          '[{"id":"fire","text":"Fire","votes":0},{"id":"solid","text":"Solid","votes":0},{"id":"mid","text":"Mid","votes":0},{"id":"skip","text":"Skip","votes":0}]'::jsonb,
          now() + interval '30 minutes')
  returning id into v_poll;

  insert into notifications (user_id, type, title, message, metadata)
  values (v_sub.user_id, 'session_live',
          coalesce(v_host_name, 'The host') || ' is reviewing your track live',
          '"' || v_title || '" is on stage now. Come and hear what everyone thinks.',
          jsonb_build_object('url', '/session/' || v_sub.session_id, 'session_id', v_sub.session_id, 'kind', 'live_review_started'));

  return v_poll;
end;
$$;

-- Finish the review: the rating closes, the result is kept, and the artist
-- gets it.
create or replace function public.session_finish_review(p_submission uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_sub session_review_submissions;
  v_poll uuid;
  v_tally jsonb;
  v_total int;
  v_good int;
  v_title text; v_host_name text;
begin
  select * into v_sub from session_review_submissions where id = p_submission;
  if v_sub.id is null then raise exception 'submission not found'; end if;
  if not public.is_session_mod(v_sub.session_id) then raise exception 'not allowed'; end if;

  select p.id into v_poll from session_polls p
   where p.session_id = v_sub.session_id and p.poll_type = 'track_review' and p.track_id = v_sub.track_id
   order by p.created_at desc limit 1;

  select coalesce(jsonb_object_agg(option_id, n), '{}'::jsonb), coalesce(sum(n), 0)::int,
         coalesce(sum(n) filter (where option_id in ('fire', 'solid')), 0)::int
    into v_tally, v_total, v_good
    from (select option_id, count(*) n from session_poll_votes where poll_id = v_poll group by option_id) x;

  update session_polls set expires_at = now() where id = v_poll and expires_at > now();

  update session_review_submissions
     set status = 'reviewed', reviewed_at = now(),
         verdict = jsonb_build_object('votes', v_tally, 'total', v_total,
                                      'good_pct', case when v_total > 0 then round(100.0 * v_good / v_total) else null end)
   where id = v_sub.id;

  update listening_sessions set reviewing_submission_id = null
   where id = v_sub.session_id and reviewing_submission_id = v_sub.id;

  select t.title into v_title from tracks t where t.id = v_sub.track_id;
  select a.artist_name into v_host_name from listening_sessions s join artists a on a.id = s.artist_id where s.id = v_sub.session_id;

  insert into notifications (user_id, type, title, message, metadata)
  values (v_sub.user_id, 'session_live',
          'Your live review: "' || v_title || '"',
          case when v_total > 0
               then round(100.0 * v_good / v_total) || '% of ' || v_total || ' listeners rated it Fire or Solid on ' || coalesce(v_host_name, 'the') || ' stream.'
               else 'Reviewed live on ' || coalesce(v_host_name, 'the') || ' stream.' end,
          jsonb_build_object('url', '/session/' || v_sub.session_id, 'session_id', v_sub.session_id, 'kind', 'live_review_result', 'votes', v_tally));

  return jsonb_build_object('votes', v_tally, 'total', v_total,
                            'good_pct', case when v_total > 0 then round(100.0 * v_good / v_total) else null end);
end;
$$;

revoke all on function public.session_start_review(uuid) from public, anon;
revoke all on function public.session_finish_review(uuid) from public, anon;
grant execute on function public.session_start_review(uuid) to authenticated;
grant execute on function public.session_finish_review(uuid) to authenticated;

-- ── Scheduled streams ─────────────────────────────────────────────────────

-- "Remind me" on a scheduled stream.
create table if not exists public.session_reminders (
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.session_reminders enable row level security;
drop policy if exists "Own reminders" on public.session_reminders;
create policy "Own reminders" on public.session_reminders for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- How many people are waiting for a stream, for the "23 people are coming" line.
create or replace function public.session_reminder_count(p_session uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from session_reminders where session_id = p_session;
$$;
grant execute on function public.session_reminder_count(uuid) to anon, authenticated;

-- Streams starting within 15 minutes whose reminder has not gone out. Marks
-- them sent in the same step, so two runs never both send.
create or replace function public.claim_session_reminders()
returns table(session_id uuid, artist_id uuid, title text, scheduled_at timestamptz)
language sql security definer set search_path to 'public' as $$
  update listening_sessions s
     set reminder_sent_at = now()
   where s.status = 'scheduled'
     and s.reminder_sent_at is null
     and s.scheduled_at <= now() + interval '15 minutes'
     and s.scheduled_at > now() - interval '30 minutes'
  returning s.id, s.artist_id, s.title, s.scheduled_at;
$$;
revoke all on function public.claim_session_reminders() from public, anon, authenticated;

-- Artist accounts that belong to platform admins. Their streams are Feelz
-- Machine shows: everyone hears about them, and they sit first on the Live page.
create or replace function public.platform_host_artist_ids()
returns table(artist_id uuid) language sql stable security definer set search_path to 'public' as $$
  select a.id from artists a join admins ad on ad.user_id = a.user_id;
$$;
grant execute on function public.platform_host_artist_ids() to anon, authenticated;
