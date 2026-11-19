-- supabase/migrations/253_drop_the_candidate_card_number.sql
--
-- SAFE TO RUN NOW. Read the rollback at the bottom first, it is two commands.
--
--
-- WHY THIS SAYS "NOW" WHEN THE LAST VERSION SAID "AFTER 1 DECEMBER"
--
-- The old advice was caution, not a specific danger: this touches the
-- function behind the admin Sessions screen, and that screen must work while
-- 22 entries are live. But advice that depends on somebody remembering in two
-- weeks is worth less than making the change reversible. So it is reversible
-- now, and the waiting is no longer necessary.
--
-- What makes it reversible: before anything changes, the current definition
-- of the function is copied into a table. If the admin page misbehaves
-- afterwards, the rollback at the bottom puts the function and the column
-- back exactly as they were, in two commands, with no guessing.
--
-- The column's values were already wiped by 252, so putting the column back
-- restores the real state, not an empty imitation of it. There is nothing
-- left in it to lose.
--
--
-- WHY THE PREVIOUS ATTEMPT FAILED, AND WHY IT COST NOTHING
--
-- It used a regular expression ending in a newline. The definition uses
-- carriage returns, so the line really ends "candidate_card_no,\r\n" and the
-- pattern never matched. It raised inside the transaction, so the rollback
-- was automatic and nothing was committed.
--
-- The clue had already been on screen: an earlier check printed the line as
-- "e.candidate_card_no,<br>", and that line break was the stray \r.
--
-- This version has no regular expression. It splits the definition into
-- lines, drops the one line whose content is the column, and joins it back.
-- btrim strips spaces, tabs and carriage returns, so indentation and line
-- endings stop mattering.
--
--
-- NOBODY RETYPES THE FUNCTION
--
-- admin_school_entries_impl is the function 245 deliberately never opened, so
-- its body would never be retyped from a reading that might be truncated.
-- 246 exists because that truncation hid three functions. Here the definition
-- goes from Postgres, through one array filter, straight back to Postgres. It
-- never passes through a person, a chat window or an editor.
--
-- Bounded on both sides. Before: the column must be named exactly once in the
-- whole definition, which also proves it is only in the select list and not
-- in a declared return type. After: exactly one line removed, the column
-- gone, the result shorter, and it must compile, or nothing commits.

begin;

-- ── Somewhere to put the old copy ───────────────────────────────────────────
create table if not exists public.migration_function_backups (
  id            bigserial primary key,
  migration     text        not null,
  function_name text        not null,
  definition    text        not null,
  note          text,
  saved_at      timestamptz not null default now()
);

-- Nothing reaches this through the API. It holds function bodies, which are
-- not secret but are nobody's business, and an unprotected table is a
-- Supabase lint warning waiting to happen. No policies on purpose: the
-- service role bypasses RLS, which is the only thing that needs it.
alter table public.migration_function_backups enable row level security;

do $outer$
declare
  fn        regprocedure := 'public.admin_school_entries_impl(uuid)';
  old_def   text;
  new_def   text;
  old_lines text[];
  new_lines text[];
  hits      int;
  coltype   text;
  sample    text;
begin
  old_def   := pg_get_functiondef(fn);
  old_lines := string_to_array(old_def, E'\n');

  hits := (length(old_def) - length(replace(old_def, 'candidate_card_no', '')))
          / length('candidate_card_no');

  if hits <> 1 then
    raise exception
      'Expected the column named exactly once in %, found % times. Stopping rather than guessing.',
      fn, hits;
  end if;

  -- The column's type, kept with the backup so the rollback can put it back
  -- as it was rather than as somebody remembers it.
  select format_type(a.atttypid, a.atttypmod)
    into coltype
  from pg_attribute a
  where a.attrelid = 'public.school_sessions_entries'::regclass
    and a.attname  = 'candidate_card_no'
    and a.attnum > 0 and not a.attisdropped;

  -- SAVED BEFORE ANYTHING CHANGES. This is the whole reason it is safe to run
  -- today rather than in two weeks.
  insert into public.migration_function_backups (migration, function_name, definition, note)
  values ('253', 'admin_school_entries_impl(uuid)', old_def,
          'column candidate_card_no was ' || coalesce(coltype, 'text') || ', all values already null after 252');

  new_lines := array(
    select l
    from unnest(old_lines) with ordinality as t(l, n)
    where btrim(l, E' \t\r') <> 'e.candidate_card_no,'
    order by n
  );

  if array_length(new_lines, 1) <> array_length(old_lines, 1) - 1 then
    select string_agg('[' || replace(replace(replace(l, E'\r', '\r'), E'\t', '\t'), ' ', '.') || ']', '  ')
      into sample
    from unnest(old_lines) as l
    where l ilike '%candidate_card_no%';

    raise exception
      'Removed % lines, expected 1. The line as stored, dots for spaces: %',
      array_length(old_lines, 1) - coalesce(array_length(new_lines, 1), 0), sample;
  end if;

  new_def := array_to_string(new_lines, E'\n');

  if position('candidate_card_no' in new_def) > 0 then
    raise exception 'Still names the column after the edit. Nothing changed.';
  end if;

  if length(new_def) >= length(old_def) then
    raise exception 'Rebuilt definition is not shorter (% vs %). Nothing changed.',
      length(new_def), length(old_def);
  end if;

  execute new_def;
end
$outer$;

-- Re-asserted rather than assumed. CREATE OR REPLACE keeps existing
-- privileges, so this should be a no-op, and a no-op that costs nothing beats
-- a guarantee nobody checked. This body returns entrant_email, and there are
-- 22 entrants behind it, five of them minors.
revoke all on function public.admin_school_entries_impl(uuid) from public, anon, authenticated;

-- If anything else picked up a reference since 252, this still refuses.
do $outer$
declare
  offenders text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into offenders
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and pg_get_functiondef(p.oid) ilike '%candidate_card_no%';

  if offenders is not null then
    raise exception 'Not dropping it. These functions still read candidate_card_no: %.', offenders;
  end if;

  select string_agg(table_name, ', ')
    into offenders
  from information_schema.views
  where table_schema = 'public'
    and view_definition ilike '%candidate_card_no%';

  if offenders is not null then
    raise exception 'Not dropping it. These views still read candidate_card_no: %.', offenders;
  end if;
end
$outer$;

alter table public.school_sessions_entries
  drop column if exists candidate_card_no;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 column is gone' as k,
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='school_sessions_entries'
      and column_name='candidate_card_no'
  ) then 'NO, STILL THERE' else 'yes' end as v
union all
select '2 nothing anywhere still names it',
  coalesce((select string_agg(p.proname, ', ') from pg_proc p
     where p.pronamespace='public'::regnamespace
       and pg_get_functiondef(p.oid) ilike '%candidate_card_no%'), 'nothing')
union all
select '3 every entry survived',
  (select count(*)::text from public.school_sessions_entries) || ' entries, '
  || (select count(*)::text from public.school_sessions_entries where track_id is not null)
  || ' still holding their track'
union all
select '4 the admin wrapper is still guarded',
  case when pg_get_functiondef('public.admin_school_entries(uuid)'::regprocedure) ilike '%admins only%'
       then 'yes' else 'NO, CHECK THIS' end
union all
select '5 entrant emails still sealed off',
  case when has_function_privilege('authenticated', 'public.admin_school_entries_impl(uuid)', 'EXECUTE')
       then 'YES, CHECK THIS' else 'no, sealed' end
union all
select '6 the old copy is saved',
  coalesce((select 'yes, ' || length(definition)::text || ' characters, saved ' ||
            to_char(saved_at at time zone 'Africa/Johannesburg', 'DD Mon HH24:MI')
            from public.migration_function_backups
            where migration = '253' order by saved_at desc limit 1), 'NO, CHECK THIS')
union all
select '7 now open the page',
  'Open the admin Sessions page and confirm it renders. The checks above cannot tell you that.'
order by 1;


-- ── ROLLBACK, if the admin Sessions page misbehaves ─────────────────────────
--
-- Run these two together. The column comes back empty, which is exactly how
-- 252 left it, so nothing is lost.
--
--   begin;
--   alter table public.school_sessions_entries
--     add column if not exists candidate_card_no text;
--   do $r$
--   declare body text;
--   begin
--     select definition into body
--     from public.migration_function_backups
--     where migration = '253'
--     order by saved_at desc
--     limit 1;
--     if body is null then
--       raise exception 'No saved copy found. Do not continue, ask before improvising.';
--     end if;
--     execute body;
--   end $r$;
--   revoke all on function public.admin_school_entries_impl(uuid)
--     from public, anon, authenticated;
--   commit;
--
-- Then reload the admin Sessions page. If the type in the backup's note is
-- not text, use that type on the add column line instead.
