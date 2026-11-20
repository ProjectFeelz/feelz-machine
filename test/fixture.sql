-- test/fixture.sql
--
-- The smallest schema migration 256 touches, built from what the live code
-- demonstrably reads and writes:
--
--   verify-artist-subscription.js  artist_tier_subscriptions, platform_tiers
--   verify-subscription.js         listener_tier_subscriptions
--   paystack-checkout.js           paystack_intents
--
-- listener_tier_subscriptions is created WITHOUT payment_provider, amount_paid
-- or currency on purpose. verify-subscription.js never writes them, so the
-- migration has to be able to add them, and this is where that gets proven.

create table platform_tiers (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  price_monthly numeric(10,2) default 0.00,
  price_yearly  numeric(10,2) default 0.00
);

create table artists (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  artist_name     text,
  current_tier_id uuid references platform_tiers(id),
  tier            text default 'free',
  updated_at      timestamptz default now()
);

create table artist_tier_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  artist_id              uuid not null references artists(id),
  tier_id                uuid references platform_tiers(id),
  status                 text not null default 'active',
  paypal_subscription_id text,
  billing_cycle          text,
  payment_provider       text,
  amount_paid            numeric(10,2) default 0.00,
  currency               text default 'USD',
  started_at             timestamptz default now(),
  expires_at             timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
-- Migration 207's unique index, which the PayPal upsert uses as its conflict
-- target.
create unique index artist_tier_subs_paypal_key
  on artist_tier_subscriptions (paypal_subscription_id);

create table listener_tier_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null,
  tier_id                uuid references platform_tiers(id),
  status                 text not null default 'active',
  paypal_subscription_id text,
  billing_cycle          text,
  started_at             timestamptz default now(),
  expires_at             timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
create unique index listener_tier_subs_paypal_key
  on listener_tier_subscriptions (paypal_subscription_id);

create table paystack_intents (
  reference       text primary key,
  track_id        uuid,
  album_id        uuid,
  artist_id       uuid,
  user_id         uuid,
  buyer_email     text,
  usd_price       numeric(10,2),
  licence_id      uuid,
  zar_amount      numeric(10,2),
  zar_minor       integer,
  fx_rate         numeric(12,4),
  fx_source       text,
  fx_stale        boolean default false,
  subaccount_code text,
  platform_pct    numeric(6,3),
  status          text default 'pending',
  settled_at      timestamptz,
  created_at      timestamptz default now()
);

-- ── Live-shaped data ────────────────────────────────────────────────────────
--
-- The prices are the ones the 10 September audit found: both paid artist tiers
-- priced yearly, with price_monthly left at zero. That zero is the thing the
-- migration's check is meant to shout about, so it has to be here.
insert into platform_tiers (slug, name, price_monthly, price_yearly) values
  ('free',    'Free',    0.00,  0.00),
  ('pro',     'Pro',     0.00, 20.00),
  ('premium', 'Premium', 0.00, 50.00);
-- fan_pro deliberately absent: the September audit found no such row, and the
-- migration has to say so rather than assume it is there.

insert into artists (id, user_id, artist_name)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Test Artist');

insert into artist_tier_subscriptions
  (artist_id, tier_id, status, paypal_subscription_id, billing_cycle, payment_provider, amount_paid, currency)
values
  ('11111111-1111-1111-1111-111111111111',
   (select id from platform_tiers where slug = 'pro'),
   'active', 'I-A2D1U25BVL7C', 'monthly', 'paypal_web', 2.00, 'USD'),
  ('11111111-1111-1111-1111-111111111111',
   (select id from platform_tiers where slug = 'pro'),
   'cancelled', 'I-YDT1F3WJHS7U', 'monthly', 'paypal_web', 0.00, 'USD');

insert into listener_tier_subscriptions (user_id, status, paypal_subscription_id, billing_cycle)
values ('33333333-3333-3333-3333-333333333333', 'active', 'I-FANPRO0001', 'monthly');

insert into paystack_intents (reference, track_id, buyer_email, usd_price, zar_amount, zar_minor, status)
values ('ref_existing_sale_0001', gen_random_uuid(), 'buyer@example.com', 3.00, 57.00, 5700, 'paid');
