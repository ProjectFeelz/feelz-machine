-- supabase/live_chat_moderation.sql
-- Live stream moderators, timeouts and bans, slow mode, pinned messages,
-- and safer chat rules. Run once in the Supabase SQL editor for the
-- feelz-machine project. Safe to run again.

-- Moderators belong to the artist, so they carry over to every stream.
create table if not exists public.artist_moderators (
  artist_id  uuid not null references public.artists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_by   uuid,
  created_at timestamptz not null default now(),
  primary key (artist_id, user_id)
);
alter table public.artist_moderators enable row level security;
drop policy if exists "Moderators are public" on public.artist_moderators;
create policy "Moderators are public" on public.artist_moderators for select using (true);
drop policy if exists "Artist adds moderators" on public.artist_moderators;
create policy "Artist adds moderators" on public.artist_moderators for insert
  with check (exists (select 1 from public.artists a where a.id = artist_id and a.user_id = (select auth.uid())));
drop policy if exists "Artist or the moderator removes" on public.artist_moderators;
create policy "Artist or the moderator removes" on public.artist_moderators for delete
  using (user_id = (select auth.uid())
         or exists (select 1 from public.artists a where a.id = artist_id and a.user_id = (select auth.uid())));

create table if not exists public.session_chat_bans (
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  until      timestamptz,             -- null: for the rest of the stream
  banned_by  uuid,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.session_chat_bans enable row level security;

alter table public.listening_sessions
  add column if not exists slow_mode_seconds integer not null default 0,
  add column if not exists pinned_message_id uuid,
  add column if not exists pinned_text text,
  add column if not exists pinned_name text;

-- Host, one of the artist's moderators, or a platform admin.
create or replace function public.is_session_mod(p_session uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from listening_sessions s
     where s.id = p_session
       and (
         exists (select 1 from artists a where a.id = s.artist_id and a.user_id = (select auth.uid()))
         or exists (select 1 from artist_moderators m where m.artist_id = s.artist_id and m.user_id = (select auth.uid()))
         or exists (select 1 from admins ad where ad.user_id = (select auth.uid()))
       )
  );
$$;

drop policy if exists "See own ban, mods see all" on public.session_chat_bans;
create policy "See own ban, mods see all" on public.session_chat_bans for select
  using (user_id = (select auth.uid()) or public.is_session_mod(session_id));

-- Whether the signed-in person may post this message now.
create or replace function public.chat_can_post(p_session uuid, p_is_tip boolean, p_tip numeric)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_s listening_sessions;
  v_mod boolean;
begin
  if v_uid is null then return false; end if;
  select * into v_s from listening_sessions where id = p_session;
  if v_s.id is null then return false; end if;
  if v_s.status = 'ended' and coalesce(v_s.ended_at, now()) < now() - interval '30 minutes' then return false; end if;

  if exists (select 1 from session_chat_bans b
              where b.session_id = p_session and b.user_id = v_uid
                and (b.until is null or b.until > now())) then
    return false;
  end if;

  v_mod := public.is_session_mod(p_session);

  if not v_mod and coalesce(v_s.slow_mode_seconds, 0) > 0 and exists (
       select 1 from session_messages m
        where m.session_id = p_session and m.user_id = v_uid and not coalesce(m.is_tip, false)
          and m.created_at > now() - make_interval(secs => v_s.slow_mode_seconds)) then
    return false;
  end if;

  -- A tip message needs a real tip from this person to this artist.
  if p_is_tip and not exists (
       select 1 from tips t
        where t.from_user_id = v_uid and t.artist_id = v_s.artist_id
          and t.created_at > now() - interval '30 minutes'
          and t.amount >= coalesce(p_tip, 0)) then
    return false;
  end if;

  return true;
end;
$$;

-- People post as themselves only, and only when allowed.
drop policy if exists "Authenticated users can send messages" on public.session_messages;
drop policy if exists "People post as themselves" on public.session_messages;
create policy "People post as themselves" on public.session_messages for insert
  with check (user_id = (select auth.uid())
              and public.chat_can_post(session_id, coalesce(is_tip, false), tip_amount));
drop policy if exists "Author or mods delete messages" on public.session_messages;
create policy "Author or mods delete messages" on public.session_messages for delete
  using (user_id = (select auth.uid()) or public.is_session_mod(session_id));

-- Deletes carry the session id, so a removed message disappears for everyone.
alter table public.session_messages replica identity full;

-- Moderators can run polls and end them early.
drop policy if exists "Mods create polls" on public.session_polls;
create policy "Mods create polls" on public.session_polls for insert
  with check (public.is_session_mod(session_id)
              and artist_id = (select s.artist_id from public.listening_sessions s where s.id = session_id));
drop policy if exists "Mods end polls" on public.session_polls;
create policy "Mods end polls" on public.session_polls for update
  using (public.is_session_mod(session_id)) with check (public.is_session_mod(session_id));

-- Moderator actions

create or replace function public.session_pin(p_session uuid, p_message uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_m session_messages;
begin
  if not public.is_session_mod(p_session) then raise exception 'not allowed'; end if;
  if p_message is null then
    update listening_sessions set pinned_message_id = null, pinned_text = null, pinned_name = null where id = p_session;
    return;
  end if;
  select * into v_m from session_messages where id = p_message and session_id = p_session;
  if v_m.id is null then raise exception 'message not found'; end if;
  update listening_sessions
     set pinned_message_id = v_m.id, pinned_text = left(v_m.content, 300), pinned_name = v_m.name
   where id = p_session;
end;
$$;

create or replace function public.session_set_slow_mode(p_session uuid, p_seconds integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_session_mod(p_session) then raise exception 'not allowed'; end if;
  update listening_sessions set slow_mode_seconds = greatest(0, least(coalesce(p_seconds, 0), 300)) where id = p_session;
end;
$$;

-- p_minutes null removes them for the rest of the stream. Clears their messages too.
create or replace function public.session_ban(p_session uuid, p_user uuid, p_minutes integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_artist uuid; v_host uuid;
begin
  if not public.is_session_mod(p_session) then raise exception 'not allowed'; end if;
  select s.artist_id, a.user_id into v_artist, v_host
    from listening_sessions s join artists a on a.id = s.artist_id where s.id = p_session;
  if p_user = v_host then raise exception 'the host cannot be removed'; end if;
  if v_host is distinct from auth.uid()
     and exists (select 1 from artist_moderators m where m.artist_id = v_artist and m.user_id = p_user) then
    raise exception 'only the host can remove a moderator';
  end if;
  insert into session_chat_bans (session_id, user_id, until, banned_by)
  values (p_session, p_user, case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end, auth.uid())
  on conflict (session_id, user_id) do update set until = excluded.until, banned_by = excluded.banned_by, created_at = now();
  delete from session_messages where session_id = p_session and user_id = p_user and not coalesce(is_tip, false);
end;
$$;

create or replace function public.session_unban(p_session uuid, p_user uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_session_mod(p_session) then raise exception 'not allowed'; end if;
  delete from session_chat_bans where session_id = p_session and user_id = p_user;
end;
$$;

revoke all on function public.session_pin(uuid, uuid) from public, anon;
revoke all on function public.session_set_slow_mode(uuid, integer) from public, anon;
revoke all on function public.session_ban(uuid, uuid, integer) from public, anon;
revoke all on function public.session_unban(uuid, uuid) from public, anon;
grant execute on function public.session_pin(uuid, uuid) to authenticated;
grant execute on function public.session_set_slow_mode(uuid, integer) to authenticated;
grant execute on function public.session_ban(uuid, uuid, integer) to authenticated;
grant execute on function public.session_unban(uuid, uuid) to authenticated;
