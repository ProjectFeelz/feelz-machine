-- supabase/migrations/256_paystack_tier_subscriptions.sql
--
-- PAID TIERS CAN NOW BE PAID FOR IN RAND. ARTIST PLANS AND FAN PRO.
--
--
-- WHY THIS EXISTS
--
-- Artist tiers are sold through PayPal, in dollars. Most of the artists on
-- this platform are South African, and PayPal cannot take rand at all: it
-- supports 23 currencies and ZAR is not one of them. So a local artist pays a
-- dollar price on a card that charges them a conversion fee, if their bank
-- lets the payment through at all.
--
-- Paystack already handles rand on this platform for one-off sales and for
-- retail venue subscriptions. retail-paystack-subscription.js has been doing
-- recurring billing properly for weeks. This migration opens the same road for
-- artist tiers, so artist_tier_subscriptions can hold a Paystack subscription
-- the same way it holds a PayPal one.
--
-- Nothing here changes or removes anything PayPal does. A row is one or the
-- other, decided by payment_provider.
--
--
-- WHY paystack_status IS A SEPARATE COLUMN
--
-- Paystack has five subscription states. Two of them, 'attention' and
-- 'non-renewing', have no equal in the status column this table uses, which
-- in practice only ever holds 'active' or 'cancelled'.
--
-- Writing a new value into a constrained column that nothing in the code has
-- ever written is how a migration breaks a screen at the moment somebody
-- pays. So Paystack's own word goes in its own column, untranslated, and
-- status keeps the two values the rest of the app already understands.
--
-- That also means a failed renewal does not take a tier away on the spot. The
-- artist keeps what they paid for until expires_at passes, and the daily
-- expiry job does the rest, which is the same rule the retail player follows.
--
--
-- WHY A PLAN CACHE TABLE
--
-- A Paystack plan is a fixed amount in a fixed currency. The retail side
-- builds one plan per venue, because every venue has its own negotiated fee.
-- Artist tiers are the same price for everybody, so building a plan per
-- artist would litter the Paystack dashboard with hundreds of identical plans
-- and make the first real pricing question impossible to answer.
--
-- So plans are cached by what makes them different: the tier, the cycle, and
-- the rand amount. The first artist to subscribe at a given price creates the
-- plan. Everybody after that reuses it. When the rand moves far enough that a
-- new price is set, a new plan is created and the people already paying keep
-- the plan they agreed to, because moving a paying customer to a new price is
-- a conversation, not a deploy.

begin;

-- ── Paystack's half of a tier subscription ──────────────────────────────────
--
-- Both tables, because both kinds of subscriber are billed the same way.
alter table public.artist_tier_subscriptions
  add column if not exists paystack_subscription_code text,
  add column if not exists paystack_plan_code         text,
  add column if not exists paystack_email_token       text,
  add column if not exists paystack_customer_code     text,
  add column if not exists paystack_reference         text,
  add column if not exists paystack_billed_zar        numeric(10,2),
  add column if not exists paystack_status            text;

alter table public.listener_tier_subscriptions
  add column if not exists paystack_subscription_code text,
  add column if not exists paystack_plan_code         text,
  add column if not exists paystack_email_token       text,
  add column if not exists paystack_customer_code     text,
  add column if not exists paystack_reference         text,
  add column if not exists paystack_billed_zar        numeric(10,2),
  add column if not exists paystack_status            text,
  -- FAN PRO HAS NEVER RECORDED A SINGLE RAND, AND NOT BY ACCIDENT.
  --
  -- verify-subscription.js writes user_id, tier_id, status, the PayPal id, the
  -- cycle and the dates. It writes nothing about money, because there was
  -- nowhere to write it. So every Fan Pro subscription ever sold is invisible
  -- to any revenue figure, and would have stayed invisible on Paystack too.
  --
  -- `if not exists` on all three, because one or more may already be there.
  add column if not exists payment_provider           text,
  add column if not exists amount_paid                numeric(10,2),
  add column if not exists currency                   text;

comment on column public.listener_tier_subscriptions.amount_paid is
  'What the subscriber actually paid, in the currency named by the currency column. Added in 256. Rows written before that hold null, which means "never recorded", not "free".';

comment on column public.artist_tier_subscriptions.paystack_reference is
  'Our own art_ reference for the first charge. It is written onto a paystack_intents row BEFORE the artist leaves for the checkout, and copied here when the money is confirmed. This is how the webhook knows whose payment it is. The PayPal side learned that the hard way: a subscription created without custom_id could not be matched to anybody, and a paid Pro plan sat unrecorded for two days.';

comment on column public.artist_tier_subscriptions.paystack_status is
  'Paystack''s own subscription status, stored untranslated: active, non-renewing, attention, completed or cancelled. The status column keeps the two values the rest of the app understands.';

-- Plain unique indexes, not partial ones. Postgres allows many NULLs in a
-- unique index, so every PayPal row sits happily with these empty, and a
-- plain index can be used as an upsert conflict target where a partial one
-- cannot. Same shape as the paypal_subscription_id index from 207.
create unique index if not exists artist_tier_subs_paystack_sub_code_key
  on public.artist_tier_subscriptions (paystack_subscription_code);

create unique index if not exists artist_tier_subs_paystack_reference_key
  on public.artist_tier_subscriptions (paystack_reference);

create unique index if not exists listener_tier_subs_paystack_sub_code_key
  on public.listener_tier_subscriptions (paystack_subscription_code);

create unique index if not exists listener_tier_subs_paystack_reference_key
  on public.listener_tier_subscriptions (paystack_reference);

-- ── Intents learn about tiers ───────────────────────────────────────────────
--
-- paystack_intents already does exactly the job a tier subscription needs
-- doing: a row written before the buyer leaves, saying what this payment is
-- supposed to be, so the webhook is never guessing. It was built for track and
-- album sales, so it knows nothing about tiers yet.
--
-- Three nullable columns, and the one-off sale path is untouched: it writes
-- none of them and reads none of them.
--
-- This is also WHY no subscription row is created before payment. A row in
-- artist_tier_subscriptions with status 'active' is a tier granted, and the
-- only safe moment to write one is after Paystack confirms the money. Using an
-- intent instead means nothing is granted early and nothing has to be cleaned
-- up when somebody opens the checkout and closes the tab.
alter table public.paystack_intents
  add column if not exists tier_id       uuid references public.platform_tiers(id),
  add column if not exists billing_cycle text,
  add column if not exists plan_code     text;

comment on column public.paystack_intents.tier_id is
  'Set only on an artist tier subscription intent, whose reference starts art_. Null on a track or album sale.';

-- ── The plan cache ──────────────────────────────────────────────────────────
create table if not exists public.paystack_tier_plans (
  id            bigserial   primary key,
  tier_id       uuid        not null references public.platform_tiers(id) on delete cascade,
  billing_cycle text        not null check (billing_cycle in ('monthly', 'annual')),
  zar_amount    numeric(10,2) not null check (zar_amount > 0),
  plan_code     text        not null unique,
  usd_at_build  numeric(10,2),
  rate_at_build numeric(12,4),
  created_at    timestamptz not null default now(),
  unique (tier_id, billing_cycle, zar_amount)
);

comment on table public.paystack_tier_plans is
  'Paystack plans built for artist tiers, cached so one plan serves every artist on the same tier, cycle and rand price. usd_at_build and rate_at_build record what the price was derived from, so a later argument about why somebody is paying what they are paying can be settled from the row.';

-- Nothing reaches this through the API. Only the service role writes it, and
-- the service role bypasses RLS. Enabled anyway so it is not an unprotected
-- public table, which is a Supabase lint warning waiting to happen.
alter table public.paystack_tier_plans enable row level security;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 paystack columns on artist subscriptions' as k,
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'artist_tier_subscriptions'
      and column_name like 'paystack%')
  || ' of 7' as v
union all
select '2 the plan cache exists',
  case when to_regclass('public.paystack_tier_plans') is null then 'NO, CHECK THIS' else 'yes, empty until the first rand subscriber' end
union all
select '2b intents can carry a tier',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'paystack_intents'
      and column_name in ('tier_id', 'billing_cycle', 'plan_code'))
  || ' of 3'
union all
select '3 nothing existing was disturbed',
  (select count(*)::text from public.artist_tier_subscriptions) || ' subscription rows, '
  || (select count(*)::text from public.artist_tier_subscriptions where paypal_subscription_id is not null)
  || ' of them PayPal'
union all
select '3b paystack columns on listener subscriptions',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'listener_tier_subscriptions'
      and column_name like 'paystack%')
  || ' of 7'
union all
select '3c CAN FAN PRO BE SOLD AT ALL',
  case when exists (select 1 from public.platform_tiers where slug = 'fan_pro')
       then 'yes, the fan_pro tier row exists'
       else 'NO FAN_PRO TIER ROW. Fan Pro is broken on PayPal too, not only Paystack: '
            || 'verify-subscription.js looks it up by slug and refuses without it.' end
union all
select '3d Fan Pro money recorded so far',
  (select count(*)::text from public.listener_tier_subscriptions) || ' listener subscriptions, '
  || (select count(*)::text from public.listener_tier_subscriptions where amount_paid is not null)
  || ' with an amount recorded (it was never possible before this migration)'
union all
-- THE ONE THING THAT STILL NEEDS A DECISION FROM A PERSON.
--
-- The rand price is worked out from the dollar price on the tier. If the
-- dollar price for a cycle is zero, there is nothing to work out from and the
-- subscribe button refuses rather than inventing a number.
select '4 PRICES THAT STILL NEED SETTING',
  coalesce((select string_agg(
      slug || ': monthly $' || coalesce(price_monthly::text, 'null')
           || ', yearly $'  || coalesce(price_yearly::text, 'null')
           || case when coalesce(price_monthly, 0) <= 0 then '  <= MONTHLY NOT SET' else '' end,
      '   |   ' order by slug)
    from public.platform_tiers
    where slug in ('pro', 'premium', 'fan_pro')), 'no paid tier rows at all')
union all
select '5 what to do about it',
  'If a monthly price reads 0, set it before anybody tries to pay in rand. '
  || 'The live PayPal plan charges $2.00 a month for Pro, so that is the figure to match. '
  || 'The rand price is worked out from the dollar price at the live rate, so setting the '
  || 'dollar figure is the only decision needed.'
order by 1;


-- ── ROLLBACK, if this needs to come back out ────────────────────────────────
--
--   begin;
--   drop table if exists public.paystack_tier_plans;
--   alter table public.paystack_intents
--     drop column if exists tier_id,
--     drop column if exists billing_cycle,
--     drop column if exists plan_code;
--   drop index if exists public.artist_tier_subs_paystack_sub_code_key;
--   drop index if exists public.artist_tier_subs_paystack_reference_key;
--   drop index if exists public.listener_tier_subs_paystack_sub_code_key;
--   drop index if exists public.listener_tier_subs_paystack_reference_key;
--   alter table public.artist_tier_subscriptions
--     drop column if exists paystack_subscription_code,
--     drop column if exists paystack_plan_code,
--     drop column if exists paystack_email_token,
--     drop column if exists paystack_customer_code,
--     drop column if exists paystack_reference,
--     drop column if exists paystack_billed_zar,
--     drop column if exists paystack_status;
--   alter table public.listener_tier_subscriptions
--     drop column if exists paystack_subscription_code,
--     drop column if exists paystack_plan_code,
--     drop column if exists paystack_email_token,
--     drop column if exists paystack_customer_code,
--     drop column if exists paystack_reference,
--     drop column if exists paystack_billed_zar,
--     drop column if exists paystack_status;
--   commit;
--
-- payment_provider, amount_paid and currency are deliberately NOT dropped from
-- listener_tier_subscriptions. They are not Paystack's: they are the money
-- columns Fan Pro never had, and the PayPal path should be filling them in
-- too. Taking them out again would put that hole back.
--
-- Safe while no artist has subscribed in rand. Once one has, dropping these
-- columns loses the only link between that artist and the money Paystack is
-- taking from them every month, so check paystack_tier_plans is still empty
-- before running it.
