-- 258_admin_can_see_platform_revenue.sql
--
-- The revenue tab reports one artist's money as if it were the platform's.
--
-- WHY
--
-- tips, downloads, beat_purchases, artist_tier_subscriptions and
-- listener_tier_subscriptions have no admin SELECT policy. Their policies are
-- owner-scoped - "artists see tips they received", "auth.uid() = user_id" -
-- and AdminAnalytics queries with the admin's own authenticated JWT, not the
-- service role. So every one of those five reads the signed-in admin's own
-- rows. An admin who has received two tips sees two tips, and the platform's
-- total is whatever they personally earned.
--
-- A refused read returns [] AND an error, so "0.00" and "you may not see this"
-- looked identical until the page started reading the error.
--
-- THE SHAPE OF THE FIX
--
-- Not a wider policy. A policy letting an admin SELECT every tip is a policy
-- that is one mistaken role-grant away from letting anyone, and these tables
-- carry amounts against named people. Instead: two functions that return
-- AGGREGATES only, each refusing to return a single row unless the caller is
-- an admin. Nobody can read an individual tip or subscription through these.
--
-- The gate is `where public.is_platform_admin()`, the same function the
-- gill_world_pieces policies use. A non-admin gets ZERO ROWS rather than
-- zeroes, so the page can still tell "no revenue" from "not allowed".
--
-- EXECUTE is revoked from public. The September audit took anon-callable
-- SECURITY DEFINER functions from 94 down to 32; these two do not join them.
--
-- COLUMNS ARE READ FROM THE APP, NOT GUESSED
--   tips                      amount, currency, created_at
--   downloads                 amount_paid, created_at
--   beat_purchases            amount_paid, status, created_at
--   artist_tier_subscriptions tier_id, amount_paid, currency, billing_cycle,
--                             payment_provider, status
--   listener_tier_subscriptions tier_id, billing_cycle, status, user_id
--   platform_tiers            id, slug, price_monthly, price_yearly
-- Every one of those is a column AdminAnalytics.js already selects.
--
-- MRR IS COMPUTED HERE, ONCE
--
-- monthlyOf() in AdminAnalytics.js is reproduced exactly below, grant rule and
-- price fallback included, so there is one piece of arithmetic rather than two
-- that can drift. Its result is the same number the page shows today.
--
-- ONE THING THIS DELIBERATELY DOES NOT CHANGE: fan subscriptions are counted
-- but are NOT in MRR, which is how the page already behaves. Changing that is
-- a decision about what MRR means, not a bug fix, so fan_mrr is returned
-- separately and the page can show it next to the artist figure.
--
-- ROLLBACK
--   drop function public.admin_revenue_totals(timestamptz);
--   drop function public.admin_subscription_summary();
--   AdminAnalytics falls back to the owner-scoped reads it uses today, which
--   under-report but do not break.

begin;

-- Refuse rather than guess. Every table and every column the functions below
-- read is named here, so a rename fails this migration loudly instead of
-- producing a revenue reader that quietly returns the wrong number.
do $$
declare
  missing text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_platform_admin'
  ) then
    raise exception 'is_platform_admin() is missing: refusing to create an ungated revenue reader';
  end if;

  select string_agg(t, ', ') into missing
    from unnest(array[
      'tips', 'downloads', 'beat_purchases',
      'artist_tier_subscriptions', 'listener_tier_subscriptions',
      'platform_tiers'
    ]) t
   where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'missing tables: %', missing;
  end if;

  select string_agg(tc.t || '.' || tc.c, ', ') into missing
    from (values
      ('tips','amount'), ('tips','currency'), ('tips','created_at'),
      ('downloads','amount_paid'), ('downloads','created_at'),
      ('beat_purchases','amount_paid'), ('beat_purchases','status'),
      ('beat_purchases','created_at'),
      ('artist_tier_subscriptions','tier_id'),
      ('artist_tier_subscriptions','amount_paid'),
      ('artist_tier_subscriptions','billing_cycle'),
      ('artist_tier_subscriptions','payment_provider'),
      ('artist_tier_subscriptions','status'),
      ('listener_tier_subscriptions','tier_id'),
      ('listener_tier_subscriptions','billing_cycle'),
      ('listener_tier_subscriptions','status'),
      ('listener_tier_subscriptions','user_id'),
      ('platform_tiers','slug'),
      ('platform_tiers','price_monthly'),
      ('platform_tiers','price_yearly')
    ) as tc(t, c)
   where not exists (
     select 1 from information_schema.columns ic
      where ic.table_schema = 'public'
        and ic.table_name = tc.t
        and ic.column_name = tc.c
   );
  if missing is not null then
    raise exception 'missing columns: %', missing;
  end if;
end $$;

-- What the platform took, since p_since. Aggregates only.
create or replace function public.admin_revenue_totals(p_since timestamptz)
 returns table (
   tips_total       numeric,
   tips_count       bigint,
   tips_currencies  text,
   downloads_total  numeric,
   downloads_count  bigint,
   beats_total      numeric,
   beats_count      bigint
 )
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select
    coalesce((select sum(t.amount)      from public.tips t
               where t.created_at >= p_since), 0)::numeric,
    coalesce((select count(*)           from public.tips t
               where t.created_at >= p_since), 0)::bigint,
    -- Currencies named, never converted. A made-up FX rate would be the same
    -- class of mistake as the made-up MRR this page already had to lose.
    -- With DISTINCT, ORDER BY must name the aggregated expression itself.
    coalesce((select string_agg(distinct t.currency, ', ' order by t.currency)
                from public.tips t where t.created_at >= p_since), '')::text,
    coalesce((select sum(d.amount_paid) from public.downloads d
               where d.amount_paid > 0 and d.created_at >= p_since), 0)::numeric,
    coalesce((select count(*)           from public.downloads d
               where d.amount_paid > 0 and d.created_at >= p_since), 0)::bigint,
    coalesce((select sum(b.amount_paid) from public.beat_purchases b
               where b.status = 'completed' and b.created_at >= p_since), 0)::numeric,
    coalesce((select count(*)           from public.beat_purchases b
               where b.status = 'completed' and b.created_at >= p_since), 0)::bigint
  where public.is_platform_admin();
$function$;

-- Active subscriptions and what they are worth a month. Counts and sums only;
-- not one subscription row leaves this function.
create or replace function public.admin_subscription_summary()
 returns table (
   artist_pro      bigint,
   artist_premium  bigint,
   artist_other    bigint,
   fan_subs        bigint,
   comps           bigint,
   artist_mrr      numeric,
   fan_mrr         numeric
 )
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with t as (
    select id, slug,
           coalesce(price_monthly, 0)::numeric as pm,
           coalesce(price_yearly,  0)::numeric as py
      from public.platform_tiers
  ),
  -- monthlyOf() from AdminAnalytics.js, line for line:
  --   grant              -> 0
  --   paid > 0           -> annual ? paid/12 : paid
  --   no tier row        -> 0        (the left join leaves pm/py null)
  --   annual, unpaid     -> price_yearly / 12
  --   monthly, unpaid    -> price_monthly, or price_yearly / 12 when unset
  -- The live tier table has price_monthly 0.00 on both paid tiers, so that
  -- last branch is the one that actually runs.
  a as (
    select s.tier_id,
           t.slug,
           s.payment_provider,
           case
             when s.payment_provider = 'admin_grant' then 0
             when coalesce(s.amount_paid, 0) > 0 then
               case when s.billing_cycle = 'annual'
                    then coalesce(s.amount_paid, 0) / 12
                    else coalesce(s.amount_paid, 0) end
             when t.id is null then 0
             when s.billing_cycle = 'annual' then t.py / 12
             when t.pm > 0 then t.pm
             else t.py / 12
           end::numeric as monthly
      from public.artist_tier_subscriptions s
      left join t on t.id = s.tier_id
     where s.status = 'active'
  ),
  f as (
    select t.slug,
           case
             when t.id is null then 0
             when ls.billing_cycle = 'annual' then t.py / 12
             when t.pm > 0 then t.pm
             else t.py / 12
           end::numeric as monthly
      from public.listener_tier_subscriptions ls
      left join t on t.id = ls.tier_id
     where ls.status = 'active'
  )
  select
    (select count(*) from a where a.slug = 'pro')::bigint,
    (select count(*) from a where a.slug = 'premium')::bigint,
    (select count(*) from a where a.slug is null or a.slug not in ('pro', 'premium'))::bigint,
    (select count(*) from f)::bigint,
    (select count(*) from a where a.payment_provider = 'admin_grant')::bigint,
    coalesce((select sum(a.monthly) from a), 0)::numeric,
    coalesce((select sum(f.monthly) from f), 0)::numeric
  where public.is_platform_admin();
$function$;

-- Not for the signed-out public. Admins reach these as authenticated users and
-- the gate inside decides; anon has no business holding the door at all.
revoke all on function public.admin_revenue_totals(timestamptz) from public;
revoke all on function public.admin_subscription_summary() from public;
grant execute on function public.admin_revenue_totals(timestamptz) to authenticated;
grant execute on function public.admin_subscription_summary() to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ONE GRID.
--
-- Read DIRECTLY, not through the functions. In the Supabase SQL editor
-- auth.uid() is null, so is_platform_admin() is false and the functions
-- correctly return nothing - which would print an empty grid and look like a
-- failure. The editor runs with full rights, so reading the tables here shows
-- the real platform figures, and the last row proves the gate is shut.
--
-- One statement, on purpose: the editor returns only the last statement's
-- result, which is how the migration 109 report was lost.
-- ─────────────────────────────────────────────────────────────────────────
select 'tips (30d)' as line,
       to_char(coalesce(sum(amount), 0), 'FM999999990.00') as value
  from public.tips where created_at >= now() - interval '30 days'
union all
select 'downloads (30d)',
       to_char(coalesce(sum(amount_paid), 0), 'FM999999990.00')
  from public.downloads
 where amount_paid > 0 and created_at >= now() - interval '30 days'
union all
select 'beats (30d)',
       to_char(coalesce(sum(amount_paid), 0), 'FM999999990.00')
  from public.beat_purchases
 where status = 'completed' and created_at >= now() - interval '30 days'
union all
select 'active artist subscriptions', count(*)::text
  from public.artist_tier_subscriptions where status = 'active'
union all
select 'active fan subscriptions', count(*)::text
  from public.listener_tier_subscriptions where status = 'active'
union all
-- Must say 0. Anything else means the gate is open to a caller with no admin
-- row, which is the whole thing this migration is for.
select 'GATE CHECK: rows returned to a non-admin caller (must be 0)',
       (select count(*) from public.admin_revenue_totals(now() - interval '30 days'))::text
order by 1;
