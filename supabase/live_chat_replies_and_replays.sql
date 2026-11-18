-- supabase/live_chat_replies_and_replays.sql
-- Live stream chat replies and message reactions, reactions kept for replays,
-- and Sessions entries plugged straight into the live review queue.
-- Run once in the Supabase SQL editor for the feelz-machine project, AFTER
-- live_review_gifts.sql. Safe to run again.

-- ── 1. Replies ────────────────────────────────────────────────────────────────
alter table public.session_messages
  add column if not exists reply_to_id uuid references public.session_messages(id) on delete set null,
  add column if not exists reply_to_name text,
  add column if not exists reply_to_content text;

-- The quoted name and text always come from the real message, never from the
-- person replying.
create or replace function public.session_messages_fill_reply()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_parent session_messages;
begin
  new.reply_to_name := null;
  new.reply_to_content := null;
  if new.reply_to_id is not null then
    select * into v_parent from session_messages where id = new.reply_to_id and session_id = new.session_id;
    if v_parent.id is null then
      new.reply_to_id := null;
    else
      new.reply_to_name := v_parent.name;
      new.reply_to_content := left(coalesce(v_parent.content, ''), 140);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists session_messages_fill_reply on public.session_messages;
create trigger session_messages_fill_reply before insert on public.session_messages
  for each row execute function public.session_messages_fill_reply();

-- ── 2. Reactions on chat messages ─────────────────────────────────────────────
create table if not exists public.session_message_reactions (
  message_id uuid not null references public.session_messages(id) on delete cascade,
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('🔥','❤️','😂','👏','💯','😮')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists session_message_reactions_session_idx on public.session_message_reactions (session_id);
alter table public.session_message_reactions enable row level security;
alter table public.session_message_reactions replica identity full;

drop policy if exists "Anyone can read message reactions" on public.session_message_reactions;
create policy "Anyone can read message reactions" on public.session_message_reactions
  for select using (true);

drop policy if exists "People react as themselves" on public.session_message_reactions;
create policy "People react as themselves" on public.session_message_reactions
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.session_messages m where m.id = message_id and m.session_id = session_message_reactions.session_id)
    and not exists (select 1 from public.session_chat_bans b
                     where b.session_id = session_message_reactions.session_id and b.user_id = (select auth.uid())
                       and (b.until is null or b.until > now()))
  );

drop policy if exists "People remove their own reactions" on public.session_message_reactions;
create policy "People remove their own reactions" on public.session_message_reactions
  for delete using (user_id = (select auth.uid()));

grant select, insert, delete on public.session_message_reactions to authenticated;
grant select on public.session_message_reactions to anon;

-- ── 3. Stream reactions kept, so replays can play them back ───────────────────
create table if not exists public.session_reactions (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now()
);
create index if not exists session_reactions_session_idx on public.session_reactions (session_id, created_at);
alter table public.session_reactions enable row level security;

drop policy if exists "Anyone can read stream reactions" on public.session_reactions;
create policy "Anyone can read stream reactions" on public.session_reactions
  for select using (true);

drop policy if exists "People react to live streams as themselves" on public.session_reactions;
create policy "People react to live streams as themselves" on public.session_reactions
  for insert with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.listening_sessions s where s.id = session_id and s.status = 'live')
  );

grant select, insert on public.session_reactions to authenticated;
grant select on public.session_reactions to anon;

-- How far to shift the chat in a replay, when the video started a little
-- before or after the stream was opened in the app. Set by the host.
alter table public.listening_sessions
  add column if not exists replay_offset_seconds integer not null default 0;

-- When the stream actually went live. started_at moves with every track in a
-- listening party, so replays line up against this instead.
alter table public.listening_sessions
  add column if not exists live_started_at timestamptz;

create or replace function public.listening_sessions_mark_live()
returns trigger language plpgsql as $$
begin
  if new.status = 'live' and new.live_started_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    new.live_started_at := now();
  end if;
  return new;
end $$;

drop trigger if exists listening_sessions_mark_live on public.listening_sessions;
create trigger listening_sessions_mark_live before insert or update of status on public.listening_sessions
  for each row execute function public.listening_sessions_mark_live();

-- Streams from before this: the earlier of their start and their first message.
update public.listening_sessions s
   set live_started_at = least(s.started_at, (select min(m.created_at) from public.session_messages m where m.session_id = s.id))
 where s.live_started_at is null and s.status in ('live', 'ended');

-- ── 4. Sessions entries in the live review queue ──────────────────────────────
alter table public.session_review_submissions
  add column if not exists source text not null default 'live';

-- A platform admin hosting the stream adds every current Sessions entry to this stream's review queue.
-- They then work like any other submission: preview, review live, finish,
-- and the verdict goes to the artist. Returns how many were added.
create or replace function public.session_add_sessions_entries(p_session uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_comp uuid;
  v_n integer;
begin
  if not exists (select 1 from listening_sessions s join artists a on a.id = s.artist_id
                  where s.id = p_session and a.user_id = auth.uid() and s.status in ('live', 'scheduled'))
     or not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Only a platform host can do that';
  end if;
  select competition_id into v_comp from school_sessions_config where id = '00000000-0000-0000-0000-000000000001';

  insert into session_review_submissions (session_id, user_id, artist_id, track_id, status, source)
  select distinct on (e.track_id) p_session, a.user_id, a.id, e.track_id, 'pending', 'sessions'
    from school_sessions_entries e
    join tracks t on t.id = e.track_id
    join artists a on a.id = coalesce(e.artist_id, t.artist_id)
   where e.track_id is not null
     and not coalesce(e.is_rejected, false)
     and (v_comp is null or e.competition_id = v_comp)
   order by e.track_id, e.created_at
  on conflict (session_id, track_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function public.session_add_sessions_entries(uuid) to authenticated;

-- The queue now says where each track came from and carries the artist's
-- picture and bio, for the on-screen card while it plays.
drop function if exists public.session_review_queue(uuid);
create function public.session_review_queue(p_session uuid)
returns table(id uuid, track_id uuid, track_title text, cover_url text, artist_name text, status text,
              is_priority boolean, place integer, is_mine boolean, verdict jsonb, gift_amount numeric,
              source text, artist_image text, artist_bio text, artist_slug text)
language sql stable security definer set search_path to 'public' as $$
  select q.id, q.track_id, t.title, t.cover_artwork_url, a.artist_name, q.status, q.is_priority,
         case when q.status = 'pending'
              then (row_number() over (partition by (q.status = 'pending')
                                       order by q.gift_amount desc nulls last, q.is_priority desc, q.boosted_at nulls last, q.submitted_at))::int
         end as place,
         q.user_id = auth.uid() as is_mine,
         q.verdict,
         q.gift_amount,
         q.source,
         a.profile_image_url,
         left(a.bio, 400),
         a.slug
    from session_review_submissions q
    join tracks t on t.id = q.track_id
    join artists a on a.id = q.artist_id
   where q.session_id = p_session
     and q.status in ('pending', 'reviewing', 'reviewed')
   order by case q.status when 'reviewing' then 0 when 'pending' then 1 else 2 end,
            q.gift_amount desc nulls last, q.is_priority desc, q.boosted_at nulls last, q.submitted_at;
$$;
grant execute on function public.session_review_queue(uuid) to anon, authenticated;

-- ── 5. Realtime ───────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'session_message_reactions') then
    alter publication supabase_realtime add table public.session_message_reactions;
  end if;
end $$;
