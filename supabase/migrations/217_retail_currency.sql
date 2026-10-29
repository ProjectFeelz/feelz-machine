-- 217_retail_currency.sql
--
-- Gives retail prices a currency, so the price guide and the venue fee can
-- never drift apart again.
--
--
-- WHAT IS THERE NOW, AND WHY IT IS A TRAP
--
-- retail_subscriptions.monthly_fee is a bare number with no currency beside
-- it. It is USD by convention and nothing more. The column named
-- paypal_plan_fee_zar is not rand either: retail-paypal-subscription.js says
-- so in a comment at line 249, "it once held rand; it now holds the same USD
-- figure". So the schema carries a column whose NAME asserts a currency it
-- does not hold.
--
-- retail_price_guide has no currency column at all.
--
-- That is survivable while everything is USD and one person knows. It stops
-- being survivable the moment South African venues are billed in rand: a
-- guide reading 450 and a fee field reading 450 would mean R450 and $450, and
-- nothing in the database would say which.
--
--
-- WHAT THIS DOES
--
-- Adds `currency` to both tables, defaulting to USD, constrained to the two
-- currencies retail actually bills in. Every existing row is USD, which is
-- what it already was.
--
-- It does NOT rename paypal_plan_fee_zar. That column is read by
-- retail-paypal-subscription.js and renaming it is a separate change with a
-- deploy attached; this migration is safe to run before the code that uses
-- the new column ships, which is the point.
--
--
-- WHY A CHECK CONSTRAINT RATHER THAN FREE TEXT
--
-- A price in a currency the platform cannot bill in is not a price, it is a
-- typo waiting to be quoted to a customer. Two values, both of which have a
-- processor behind them: USD through PayPal, ZAR through Paystack.

begin;

alter table public.retail_price_guide
  add column if not exists currency text not null default 'USD';

alter table public.retail_subscriptions
  add column if not exists currency text not null default 'USD';

alter table public.retail_price_guide
  drop constraint if exists retail_price_guide_currency_check;
alter table public.retail_price_guide
  add constraint retail_price_guide_currency_check
  check (currency in ('USD', 'ZAR'));

alter table public.retail_subscriptions
  drop constraint if exists retail_subscriptions_currency_check;
alter table public.retail_subscriptions
  add constraint retail_subscriptions_currency_check
  check (currency in ('USD', 'ZAR'));

comment on column public.retail_price_guide.currency is
  'The currency suggested_fee_min and suggested_fee_max are stated in. Must match the currency of the venue fee it is guiding, which is why both tables carry it.';

comment on column public.retail_subscriptions.currency is
  'The currency monthly_fee is stated in. USD bills through PayPal, ZAR through Paystack. Note that paypal_plan_fee_zar does NOT hold rand despite its name; it holds the same USD figure as monthly_fee.';

commit;


-- ── Verification ─────────────────────────────────────────────────────────
--
-- Expect: both columns present, both constrained, and every existing row USD.
--
-- rows_without_currency must be 0 on both. A null there would be a price
-- nobody can read, which is the thing this migration exists to prevent.

select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='retail_price_guide' and column_name='currency')    as guide_has_column,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='retail_subscriptions' and column_name='currency')  as subs_has_column,
  (select count(*) from pg_constraint where conname='retail_price_guide_currency_check')           as guide_constrained,
  (select count(*) from pg_constraint where conname='retail_subscriptions_currency_check')         as subs_constrained,
  (select count(*) from public.retail_price_guide   where currency is null)                        as guide_rows_without_currency,
  (select count(*) from public.retail_subscriptions where currency is null)                        as subs_rows_without_currency,
  (select coalesce(string_agg(distinct currency, ', '), 'none') from public.retail_subscriptions)  as subs_currencies;
