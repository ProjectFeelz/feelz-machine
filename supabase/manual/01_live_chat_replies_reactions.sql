-- Live chat: reply-to, reactions on messages, reactions on the stream.
-- Also fixes chat needing a refresh: the chat's realtime channel listens to
-- session_message_reactions, and while that table is missing the whole
-- channel fails to subscribe.
alter table public.session_messages
  add column if not exists reply_to_id uuid references public.session_messages(id) on delete set null,
  add column if not exists reply_to_name text,
  add column if not exists reply_to_content text;

create or replace function public.session_message_fill_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to_id is not null then
    select m.name, left(m.content, 140) into new.reply_to_name, new.reply_to_content
      from session_messages m where m.id = new.reply_to_id and m.session_id = new.session_id;
    if new.reply_to_name is null and new.reply_to_content is null then new.reply_to_id := null; end if;
  else
    new.reply_to_name := null; new.reply_to_content := null;
  end if;
  return new;
end; $$;

drop trigger if exists session_message_fill_reply on public.session_messages;
create trigger session_message_fill_reply before insert on public.session_messages
  for each row execute function public.session_message_fill_reply();

create table if not exists public.session_message_reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  message_id uuid not null references public.session_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_smr_session on public.session_message_reactions(session_id);
alter table public.session_message_reactions enable row level security;

drop policy if exists "Anyone reads message reactions" on public.session_message_reactions;
create policy "Anyone reads message reactions" on public.session_message_reactions for select using (true);
drop policy if exists "React as yourself" on public.session_message_reactions;
create policy "React as yourself" on public.session_message_reactions for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.session_messages m where m.id = message_id and m.session_id = session_message_reactions.session_id)
    and not exists (select 1 from public.session_chat_bans b where b.session_id = session_message_reactions.session_id
                     and b.user_id = (select auth.uid()) and (b.until is null or b.until > now()))
  );
drop policy if exists "Remove your own reaction" on public.session_message_reactions;
create policy "Remove your own reaction" on public.session_message_reactions for delete
  using (user_id = (select auth.uid()));

create table if not exists public.session_reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.listening_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now()
);
create index if not exists idx_sr_session on public.session_reactions(session_id, created_at);
alter table public.session_reactions enable row level security;
drop policy if exists "Anyone reads stream reactions" on public.session_reactions;
create policy "Anyone reads stream reactions" on public.session_reactions for select using (true);
drop policy if exists "Stream react as yourself" on public.session_reactions;
create policy "Stream react as yourself" on public.session_reactions for insert
  with check (user_id = (select auth.uid()));

grant select on public.session_message_reactions, public.session_reactions to anon, authenticated;
grant insert, delete on public.session_message_reactions to authenticated;
grant insert on public.session_reactions to authenticated;

alter table public.session_messages replica identity full;
alter table public.session_message_reactions replica identity full;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='session_message_reactions') then
    alter publication supabase_realtime add table public.session_message_reactions;
  end if;
end $$;
