-- 259_set_the_monthly_prices_that_were_never_set.sql
--
-- Nobody can buy a monthly plan in rand. They never could.
--
-- WHY
--
-- tier-paystack-subscription.js reads the price for the chosen cycle and
-- refuses to continue rather than invent one:
--
--   const usd = Number(cycle === 'annual' ? tier.price_yearly : tier.price_monthly);
--   if (!Number.isFinite(usd) || usd <= 0) return { error: 'no_price', tier };
--
-- price_monthly is 0.00 on both paid tiers, so every monthly Paystack checkout
-- has been turned away with "This plan does not have a rand price yet." Annual
-- works, because price_yearly is set. Refusing was the right call - charging
-- somebody a number the code made up would be far worse - but the price was
-- never set, so the refusal has been permanent.
--
-- This is not a price change. It writes down the price already advertised on
-- /upgrade, which is held in src/data/tiers.js:
--
--   BASE_USD = {
--     pro:     { monthly: 2.00, annual: 17.00 },
--     premium: { monthly: 5.00, annual: 42.00 },
--   }
--
-- Nobody currently pays a Paystack monthly plan, because none could be
-- created, so no existing subscriber's price moves.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--
-- price_yearly, which DISAGREES with the advertised price:
--
--   pro      advertised 17.00 / yr, table says 20.00
--   premium  advertised 42.00 / yr, table says 50.00
--
-- Annual buyers in rand are being charged more than the page quotes them. One
-- of those two numbers is stale and I cannot tell which from the code: if the
-- table is right the page is under-quoting, and if the page is right every
-- annual rand customer has been overcharged by 3 or 8 dollars. Guessing picks
-- somebody's pocket either way. The grid at the end prints all four pairs so
-- the call can be made on the numbers.
--
-- EXISTING SUBSCRIBERS ARE SAFE FROM ANY PRICE CHANGE, INCLUDING A RISE
--
-- Worth stating because it is the thing a price rise usually breaks, and here
-- it is already handled:
--
--   Paystack - a plan's amount cannot change once created. planFor() reuses a
--     cached plan only while its rand amount is within 5% of today's converted
--     price. Move the dollar price and the drift blows past 5%, so a NEW plan
--     is built and everyone already subscribed stays on their old plan code at
--     their old amount.
--   PayPal - the plan ids are env vars (REACT_APP_PAYPAL_*_PLAN_ID) pointing
--     at fixed PayPal plans. This table does not feed them at all. Raising a
--     PayPal price means creating new plans and swapping the env vars; old
--     subscribers keep the old plan.
--
-- So a rise grandfathers early payers automatically, on both providers, with
-- no code change. It is the reporting that needed fixing, not the billing.
--
-- ROLLBACK
--   update public.platform_tiers set price_monthly = 0
--    where slug in ('pro', 'premium');
--   Monthly rand checkout goes back to being refused.

begin;

do $$
declare
  n int;
begin
  if to_regclass('public.platform_tiers') is null then
    raise exception 'platform_tiers is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'platform_tiers'
       and column_name in ('slug', 'price_monthly', 'price_yearly')
     group by table_name having count(distinct column_name) = 3
  ) then
    raise exception 'platform_tiers needs slug, price_monthly and price_yearly';
  end if;

  -- Both rows must exist. Writing one and not the other would leave half the
  -- paid tiers still unbuyable by the month, which is the bug being fixed.
  select count(*) into n from public.platform_tiers where slug in ('pro', 'premium');
  if n <> 2 then
    raise exception 'expected 2 paid tier rows (pro, premium), found %', n;
  end if;
end $$;

-- The advertised monthly prices, written where the checkout actually looks.
update public.platform_tiers set price_monthly = 2.00 where slug = 'pro';
update public.platform_tiers set price_monthly = 5.00 where slug = 'premium';

-- Assert it, rather than trust it.
do $$
declare
  bad text;
begin
  select string_agg(slug || ' = ' || coalesce(price_monthly::text, 'null'), ', ')
    into bad
    from public.platform_tiers
   where (slug = 'pro'     and price_monthly is distinct from 2.00)
      or (slug = 'premium' and price_monthly is distinct from 5.00);
  if bad is not null then
    raise exception 'monthly price did not take: %', bad;
  end if;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THE TABLE CHARGES vs WHAT THE PAGE QUOTES.
--
-- The advertised column is src/data/tiers.js, typed in here because this is
-- SQL and cannot read a React file. If that file changes, this grid lies -
-- which is the deeper problem: the price lives in two places and nothing
-- checks they agree. Worth making platform_tiers the only source and having
-- the page read it, as a separate job.
--
-- Monthly rows should now match. The annual rows will not, and that is the
-- decision waiting for you.
-- ─────────────────────────────────────────────────────────────────────────
select t.slug || ' ' || a.cycle                                  as plan,
       to_char(a.advertised, 'FM990.00')                         as page_quotes,
       to_char(case when a.cycle = 'monthly' then t.price_monthly
                    else t.price_yearly end, 'FM990.00')         as table_charges,
       case when (case when a.cycle = 'monthly' then t.price_monthly
                       else t.price_yearly end) = a.advertised
            then 'match'
            else 'MISMATCH - rand buyers pay the table, not the page'
       end                                                       as verdict
  from public.platform_tiers t
  join (values
    ('pro',     'monthly',  2.00::numeric),
    ('pro',     'annual',  17.00::numeric),
    ('premium', 'monthly',  5.00::numeric),
    ('premium', 'annual',  42.00::numeric)
  ) as a(slug, cycle, advertised) on a.slug = t.slug
 order by t.slug, a.cycle;
