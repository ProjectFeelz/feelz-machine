-- 260_the_price_rise.sql
--
-- New prices. Pro goes to 5 a month, Premium to 12, with the annual discount
-- kept at roughly 30%.
--
--   pro      2.00 -> 5.00 / month      17.00 -> 42.00 / year
--   premium  5.00 -> 12.00 / month     42.00 -> 100.00 / year
--
-- 259 set the monthly prices to the ones already advertised so monthly rand
-- checkout would work at all. This is the actual rise, decided on the numbers
-- 259 surfaced: eight active artist subscriptions, six of them admin grants
-- worth nothing, and two real payers at 2 dollars.
--
-- NOBODY'S BILL CHANGES
--
-- Checked in the PayPal dashboard rather than assumed:
--
--   Pro Monthly     P-66374937H9417714PNHQMLUQ   $2/mo    2 subscribers
--   Pro Yearly      P-5DG68591UK192342GNHJC5AQ   $17/yr   0
--   Premium Monthly P-9H349938C1655153WNHQMNRI   $5/mo    0
--   Premium Yearly  P-8G28203436621033DNHJC54Y   $42/yr   0
--
-- Only one plan has subscribers. PayPal says plainly that updating a plan's
-- value "will change the value of all subscriptions on that plan", so the
-- three empty plans were edited in place and the one with the two payers was
-- left exactly as it is. A NEW plan carries the 5 dollar price:
--
--   Pro Monthly     P-8WX35198832977429NMDWTVY   $5/mo    0, ON
--
-- So REACT_APP_PAYPAL_PRO_MONTHLY_PLAN_ID must be swapped to that id. The
-- other three plan ids are unchanged, because those plans were edited rather
-- than replaced.
--
-- Paystack needs no dashboard work at all. planFor() creates plans itself and
-- a plan's amount cannot change once created, so it reuses a cached plan only
-- while its rand amount is within 5% of today's converted price. These rises
-- are far past 5%, so the next checkout builds a new plan and anybody already
-- subscribed stays on their old plan code at their old amount.
--
-- THE ANNUAL MISMATCH IS SETTLED, NOT INHERITED
--
-- 259 found platform_tiers charging 20 and 50 a year while the page quoted 17
-- and 42. PayPal's own plans said 17 and 42, so platform_tiers was the stale
-- one and the page was right. No annual subscriber has ever existed on either
-- provider, so nobody was ever overcharged. The new numbers replace both.
--
-- src/data/tiers.js is updated in the same commit. The price still lives in
-- two places and nothing checks they agree, which is how the 20-versus-17 gap
-- opened in the first place. Making the page read platform_tiers is the real
-- fix and is deliberately not bundled into a price change.
--
-- ROLLBACK
--   update public.platform_tiers set price_monthly = 2.00,  price_yearly = 17.00 where slug = 'pro';
--   update public.platform_tiers set price_monthly = 5.00,  price_yearly = 42.00 where slug = 'premium';
--   Then put REACT_APP_PAYPAL_PRO_MONTHLY_PLAN_ID back to
--   P-66374937H9417714PNHQMLUQ and set the three edited PayPal plans back by
--   hand. Paystack self-corrects on the next checkout.

begin;

do $$
declare
  n int;
begin
  if to_regclass('public.platform_tiers') is null then
    raise exception 'platform_tiers is missing';
  end if;
  select count(*) into n from public.platform_tiers where slug in ('pro', 'premium');
  if n <> 2 then
    raise exception 'expected 2 paid tier rows (pro, premium), found %', n;
  end if;

  -- 259 must have run. Raising from a price that was never set would leave
  -- monthly rand checkout refused and look like the rise had failed.
  if exists (select 1 from public.platform_tiers
              where slug in ('pro', 'premium')
                and coalesce(price_monthly, 0) <= 0) then
    raise exception 'a paid tier still has no monthly price: run 259 first';
  end if;
end $$;

update public.platform_tiers
   set price_monthly = 5.00,  price_yearly = 42.00
 where slug = 'pro';

update public.platform_tiers
   set price_monthly = 12.00, price_yearly = 100.00
 where slug = 'premium';

-- Assert it, rather than trust it.
do $$
declare
  bad text;
begin
  select string_agg(slug || ' = ' || price_monthly || ' / ' || price_yearly, ', ')
    into bad
    from public.platform_tiers
   where (slug = 'pro'     and (price_monthly is distinct from 5.00
                            or price_yearly  is distinct from 42.00))
      or (slug = 'premium' and (price_monthly is distinct from 12.00
                            or price_yearly  is distinct from 100.00));
  if bad is not null then
    raise exception 'the rise did not take: %', bad;
  end if;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- THE NEW PRICES, AND WHAT THE TWO EARLY PAYERS STILL PAY.
--
-- amount_paid is what each subscriber was actually charged, so the last two
-- rows are the proof that grandfathering held. They must still say 2.00.
--
-- One statement, on purpose: the editor returns only the last result.
-- ─────────────────────────────────────────────────────────────────────────
select 'NEW ' || t.slug || ' monthly' as line,
       to_char(t.price_monthly, 'FM990.00') as usd
  from public.platform_tiers t where t.slug in ('pro', 'premium')
union all
select 'NEW ' || t.slug || ' annual',
       to_char(t.price_yearly, 'FM990.00')
  from public.platform_tiers t where t.slug in ('pro', 'premium')
union all
select 'STILL PAYING (must be 2.00): ' || coalesce(pt.slug, '?')
         || ' ' || coalesce(s.billing_cycle, 'monthly')
         || ' via ' || coalesce(s.payment_provider, '?'),
       to_char(coalesce(s.amount_paid, 0), 'FM990.00')
  from public.artist_tier_subscriptions s
  left join public.platform_tiers pt on pt.id = s.tier_id
 where s.status = 'active'
   and coalesce(s.amount_paid, 0) > 0
 order by 1;
