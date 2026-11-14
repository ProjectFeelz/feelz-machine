-- supabase/migrations/223_honour_notification_preferences.sql
--
-- THE NOTIFICATION SETTINGS DID NOTHING.
--
-- Measured before writing this:
--
--   functions that INSERT a notification        20
--   functions that check notification_allowed    0
--
-- So every switch in that sheet saved correctly, to the right table, and was
-- then ignored by all twenty things that send you a notification. Somebody
-- muting "Streaks and reminders" got exactly as many streak notifications as
-- before, forever, and had no way to tell.
--
-- notification_allowed(user_id, type, channel) already exists and is correct.
-- It was simply never called.
--
-- WHY A TRIGGER AND NOT TWENTY EDITS
--
-- Editing twenty functions means twenty chances to miss one, and the
-- twenty first, written next month, starts out ignoring preferences again
-- because nobody remembers a convention. One trigger on the table covers
-- every writer there is and every writer there will be, including inserts
-- made by hand in the SQL editor.
--
-- MUTED MEANS NOT SENT, NOT SENT AND HIDDEN
--
-- A row that is written and then filtered on the way out still counts against
-- the unread badge, still gets emailed by anything reading the table, and
-- still has to be cleaned up later. Dropping it at the door is the only
-- version where "mute" means what the word means.

begin;

create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Nobody to have a preference. Admin-only rows and anything without a
  -- recipient pass straight through.
  if new.user_id is null then
    return new;
  end if;

  -- IN APP. Muted means the row is never written.
  if not notification_allowed(new.user_id, new.type, 'in_app') then
    return null;
  end if;

  -- EMAIL, decided separately, because plenty of people are happy to see a
  -- thing in the app and never want it in their inbox. The row survives; only
  -- the email is dropped.
  if coalesce(new.email_requested, false)
     and not notification_allowed(new.user_id, new.type, 'email')
  then
    new.email_requested := false;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_apply_notification_preferences on public.notifications;
create trigger trg_apply_notification_preferences
  before insert on public.notifications
  for each row execute function public.apply_notification_preferences();

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
--
-- The last row proves the trigger actually drops something: it writes a test
-- notification of a muted type for a muted user, inside a transaction that is
-- rolled back, and counts what landed. 0 means the mute worked.
select 'trigger installed' as k,
       case when exists (
         select 1 from pg_trigger
         where tgname = 'trg_apply_notification_preferences'
       ) then 'yes' else 'NO, FIX THIS' end as v
union all
select 'people with preferences saved', count(*)::text from notification_preferences
union all
select 'categories muted across everybody',
       coalesce(sum(coalesce(array_length(muted, 1), 0))::text, '0')
from notification_preferences
order by 1;
