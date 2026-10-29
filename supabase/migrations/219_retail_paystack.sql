-- 219_retail_paystack.sql
--
-- Lets a retail venue be billed in rand through Paystack, alongside the
-- existing PayPal billing in dollars.
--
--
-- WHY
--
-- Retail launches in South Africa first. A Johannesburg shop paying a rand
-- price by card through a South African processor is the normal case there;
-- being quoted dollars and sent to PayPal is not. Migration 217 gave
-- retail_subscriptions and retail_price_guide a currency, so the row can
-- already say ZAR. This gives the row somewhere to keep the Paystack side of
-- the arrangement, which is the part PayPal's columns cannot hold.
--
-- The two processors live side by side rather than one replacing the other:
-- currency = 'USD' bills through PayPal, currency = 'ZAR' through Paystack,
-- and nothing has to be migrated for either to keep working.
--
--
-- THE TRIAL IS DELIBERATELY DIFFERENT IN RAND
--
-- PayPal's 14 free days are a TRIAL billing cycle inside the plan, so PayPal
-- takes the card up front and starts charging on day 15 by itself.
--
-- Paystack cannot do that. A plan has no trial, and a subscription cannot
-- exist without a saved card authorization, which only an actual charge
-- produces. So a rand trial takes no card at all: the subscription row goes
-- active with trial_ends_at and current_period_end set to the end of the trial
-- and no paystack_subscription_code, the player runs, and the venue is asked
-- for payment before the trial is up.
--
-- That shape has a consequence worth stating plainly, because it is the thing
-- that could leak free access: an expired trial with no subscription behind it
-- is indistinguishable from a paid month only if nobody looks at
-- paystack_subscription_code. retail-artist-payouts.js's access sweep looks.
--
--
-- WHAT EACH COLUMN IS
--
-- The naming follows the PayPal columns already on the table so a reader can
-- pair them up: *_plan_code to paypal_plan_id, *_subscription_code to
-- paypal_subscription_id, *_billed_zar to paypal_billed_usd.

begin;

alter table public.retail_subscriptions
  -- PLN_xxxx. One plan per fee: a Paystack plan's amount is fixed at creation,
  -- so changing a venue's fee means a new plan for the next venue to
  -- subscribe, exactly as on the PayPal side.
  add column if not exists paystack_plan_code text,

  -- SUB_xxxx. The subscription itself. Its presence is what separates a paying
  -- venue from one on a card-less trial, so the access sweep reads it.
  add column if not exists paystack_subscription_code text,

  -- Paystack requires this alongside the subscription code to disable a
  -- subscription, and it is what the customer's own management link is built
  -- from. Readable by the venue owner under retail_subscriptions_self_select,
  -- which is correct: it is the token for their own subscription.
  add column if not exists paystack_email_token text,

  -- CUS_xxxx, so a second subscription for the same venue reuses the customer
  -- rather than creating another one against the same email.
  add column if not exists paystack_customer_code text,

  -- The rand figure the plan actually bills, held separately from monthly_fee
  -- so a fee change can be detected. monthly_fee is what was negotiated;
  -- this is what Paystack was told. When they differ, the plan is stale.
  add column if not exists paystack_billed_zar numeric,

  -- Our own reference for the transaction that starts the subscription. The
  -- webhook arrives before the browser comes back, and this is how the event
  -- is matched to a venue without trusting Paystack's metadata, which its own
  -- docs describe as a string and which comes back empty from some endpoints.
  add column if not exists paystack_reference text;

commit;


-- ── Uniqueness ───────────────────────────────────────────────────────────
--
-- One Paystack subscription belongs to one venue. Without this, a replayed or
-- mis-routed webhook could write the same subscription code onto a second
-- venue's row and switch on a player nobody is paying for.
--
-- Partial, because every row that has no Paystack subscription has NULL here,
-- and a plain unique index would be satisfied by those anyway while a partial
-- one states the intent: the constraint is about real subscriptions.
--
-- This mirrors the index migration 207 put on paypal_subscription_id for the
-- same reason.

create unique index if not exists retail_subscriptions_paystack_sub_uniq
  on public.retail_subscriptions (paystack_subscription_code)
  where paystack_subscription_code is not null;

create index if not exists retail_subscriptions_paystack_ref_idx
  on public.retail_subscriptions (paystack_reference)
  where paystack_reference is not null;


comment on column public.retail_subscriptions.paystack_subscription_code is
  'Paystack SUB_ code. NULL on a venue that has never paid through Paystack, including one on a card-less rand trial, which is how the access sweep tells a lapsed trial from a paid month.';

comment on column public.retail_subscriptions.paystack_billed_zar is
  'The rand amount the Paystack plan bills. Compared against monthly_fee to spot a plan that no longer matches the negotiated fee.';


-- ── Verification ─────────────────────────────────────────────────────────
--
-- Expect: columns_added 6, sub_uniq 1, ref_idx 1, and the status check
-- unchanged (trialing was NOT added; a rand trial is status 'active' with
-- trial_ends_at set, the same as the PayPal trial).

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'retail_subscriptions'
      and column_name in ('paystack_plan_code', 'paystack_subscription_code',
                          'paystack_email_token', 'paystack_customer_code',
                          'paystack_billed_zar', 'paystack_reference'))        as columns_added,
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'retail_subscriptions_paystack_sub_uniq')                as sub_uniq,
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'retail_subscriptions_paystack_ref_idx')                 as ref_idx,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'retail_subscriptions_status_check')                       as status_check;
