-- supabase/migrations/235_plugin_gallery_referrals.sql
--
-- COUNTING ARRIVALS FROM THE PLUGIN GALLERY, WITHOUT TOUCHING THE GALLERY.
--
--
-- WHAT BROKE, AND WHY THE OLD NUMBER WAS NEVER COMING BACK
--
-- The admin panel's "Plugin Gallery Plays" has read the same number since
-- July, because that is when the data stops. 395 plays, every one of them
-- between the 2nd and the 31st of July, all 23 tracks, all Steve's. Nothing
-- has been logged in the three and a half months since.
--
-- log-external-play.js is not at fault, and neither is the panel. The gallery
-- was rebuilt. Pressing "Start listening" on projectfeelz.com now posts to its
-- own /api/track-outbound-click, on its own Supabase project, and sends the
-- visitor here. It no longer plays audio in the page and it no longer calls
-- Feelz Machine at all. The only reason the old rows are all Steve's is that
-- back in July the widget only carried his music.
--
-- So the panel is a photograph of July, and "plays" is now the wrong word for
-- what the gallery does.
--
--
-- THE WAY ROUND IT
--
-- Every link the gallery sends already carries ?ref=plugin-gallery. We do not
-- need the gallery to tell us anything, because the visitor arrives at our own
-- front door holding the receipt. Counting arrivals needs no change on
-- projectfeelz.com, no cross-site call, no CORS, and no second Supabase
-- project.
--
-- It also measures the honest thing. The gallery sends people, not plays, and
-- people are what matters to Steve anyway: 62,000 producers on that site and
-- the question is how many of them walk through.
--
--
-- WHY NOT THE AFFILIATE SYSTEM
--
-- affiliate-track.js already logs ?ref= clicks and would have been free. It
-- refuses any code with no active affiliate row behind it, so this would mean
-- creating an affiliate called "plugin-gallery".
--
-- Not worth it. That table is wired to credits and payouts: a conversion on an
-- affiliate code mints credits_transactions rows. Pointing a marketing counter
-- at the money pipeline to save writing fifteen lines is how an accounting
-- mess starts. app_events is already the place for "somebody did something",
-- it is insert-only, it honours the analytics opt-out, and it has a pruning
-- job. A referral is just another event.

begin;

-- ── 1. A referral is an event like any other ────────────────────────────────
--
-- app_events.kind has been screen, tap and step since 225. A fourth kind costs
-- one constraint and inherits everything else the table already does: the
-- insert-only policy, the opted-out trigger that silently drops rows for
-- people who said no, and prune_app_events().
alter table public.app_events drop constraint if exists app_events_kind_check;
alter table public.app_events add constraint app_events_kind_check
  check (kind = any (array['screen'::text, 'tap'::text, 'step'::text, 'referral'::text]));

create index if not exists app_events_referral_idx
  on public.app_events (name, created_at) where kind = 'referral';

-- ── 2. What the admin screen reads ──────────────────────────────────────────
--
-- One row per source. Visits is what it says: one per browser session, because
-- the capture in index.js only fires once per session, so a reader clicking
-- four plugin pages is one arrival rather than four.
--
-- signed_in matters more than it looks. An arrival with a user_id is somebody
-- who already has an account coming back through the gallery; an arrival
-- without one is a stranger. The gap between those two is the only honest read
-- on whether that site is bringing NEW people.
create or replace function public.admin_referral_report(p_days int default 30)
returns table (
  source      text,
  visits      bigint,
  signed_in   bigint,
  strangers   bigint,
  first_seen  timestamptz,
  last_seen   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;

  return query
  select e.name,
         count(*),
         count(*) filter (where e.user_id is not null),
         count(*) filter (where e.user_id is null),
         min(e.created_at),
         max(e.created_at)
  from public.app_events e
  where e.kind = 'referral'
    and e.created_at > now() - make_interval(days => p_days)
  group by e.name
  order by count(*) desc;
end;
$$;

revoke all on function public.admin_referral_report(int) from public;
grant execute on function public.admin_referral_report(int) to authenticated;

-- ── 3. Where the old number came from, written down ─────────────────────────
--
-- The July rows stay. They are real, they are just finished. This marks the
-- end of that era in the one place somebody will look when the panel confuses
-- them again in six months.
comment on table public.external_plays is
  'Plays logged by the OLD projectfeelz.com widget, which called log-external-play.js. That widget was replaced and stopped sending in July 2026, so this table is a closed record and will not grow. Arrivals from the gallery are now counted as kind=referral in app_events, see admin_referral_report().';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 referral kind allowed' as k,
  case when (select pg_get_constraintdef(oid) from pg_constraint
             where conrelid='public.app_events'::regclass and conname='app_events_kind_check') ilike '%referral%'
  then 'yes' else 'NO' end as v
union all
select '2 report function', case when exists (select 1 from pg_proc where proname='admin_referral_report') then 'ready' else 'MISSING' end
union all
select '3 referrals recorded so far', (select count(*)::text from public.app_events where kind='referral')
union all
select '4 old external plays, frozen', (select count(*)::text from public.external_plays)
union all
select '5 last old play', coalesce((select to_char(max(created_at),'DD Mon YYYY') from public.external_plays), 'none')
order by 1;
