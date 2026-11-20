-- supabase/migrations/255_recover_the_pro_subscription_that_was_never_recorded.sql
--
-- SOMEBODY PAID FOR PRO ON 18 NOVEMBER AND HAS BEEN ON FREE EVER SINCE.
--
--
-- WHAT PAYPAL HOLDS, READ OFF THE DASHBOARD ON 20 NOVEMBER
--
--   Subscription   I-A2D1U25BVL7C
--   Subscriber     sbudasteezy761@gmail.com
--   Account here   Xbudasteezy, currently tier free
--   Plan           Feelz Machine Pro / Pro Monthly
--   Plan ID        P-66374937H9417714PNHQMLUQ
--   Price          $2.00 USD, every 1 month
--   Started        18 November 2026
--   Next payment   18 December 2026
--   Cycles taken   1
--   Custom ID      empty
--
-- artist_tier_subscriptions has no row for it. Neither does anything else.
--
--
-- WHY IT WAS LOST
--
-- The row is written by verify-artist-subscription, which the browser calls
-- in onApprove after PayPal takes the money. If the buyer closes the tab,
-- that call never happens.
--
-- The webhook could not rescue it. BILLING.SUBSCRIPTION.ACTIVATED only ran an
-- UPDATE matching paypal_subscription_id, and an update that matches no rows
-- is not an error in PostgREST: no error, no change, nothing logged. And the
-- subscription carried no custom_id, so even a webhook that noticed had no
-- way to know whose payment it was. That empty Custom ID field above is the
-- proof.
--
-- Both halves are fixed in code now. custom_id is set when the subscription
-- is created, and the webhook counts the rows it changed and raises an admin
-- alert when the answer is zero. This file is only about the person who
-- already paid.
--
--
-- WRITTEN AS A PAYMENT, NOT A GRANT
--
-- payment_provider is 'paypal_web' and amount_paid is the real $2.00, the
-- same shape verify-artist-subscription writes. An admin_grant row would make
-- them whole and quietly understate MRR by the one real subscription on the
-- platform, which is the opposite of what the revenue reporting needs.
--
-- artists.tier is derived by trg_sync_artist_tier from the active
-- subscription, so it is not set here. current_tier_id is set, exactly as the
-- function does.

begin;

do $$
declare
  v_artist_id uuid;
  v_tier_id   uuid;
  v_user_id   uuid;
  v_existing  int;
begin
  select u.id, a.id
    into v_user_id, v_artist_id
  from auth.users u
  join public.artists a on a.user_id = u.id
  where lower(u.email) = 'sbudasteezy761@gmail.com'
  limit 1;

  if v_artist_id is null then
    raise exception 'No artist profile found for sbudasteezy761@gmail.com. Nothing written.';
  end if;

  select id into v_tier_id from public.platform_tiers where slug = 'pro' limit 1;
  if v_tier_id is null then
    raise exception 'No platform_tiers row with slug pro. Nothing written.';
  end if;

  -- Idempotent. If the webhook or a re-run of the page has since written it,
  -- this must not create a second row or overwrite a real one.
  select count(*) into v_existing
  from public.artist_tier_subscriptions
  where paypal_subscription_id = 'I-A2D1U25BVL7C';

  if v_existing > 0 then
    raise notice 'Already recorded. Nothing written.';
    return;
  end if;

  insert into public.artist_tier_subscriptions (
    artist_id, tier_id, status, paypal_subscription_id,
    billing_cycle, payment_provider, amount_paid, currency,
    started_at, expires_at, updated_at
  ) values (
    v_artist_id, v_tier_id, 'active', 'I-A2D1U25BVL7C',
    'monthly', 'paypal_web', 2.00, 'USD',
    timestamptz '2026-11-18 00:00:00+02',
    timestamptz '2026-12-18 00:00:00+02',
    now()
  );

  update public.artists
  set current_tier_id = v_tier_id,
      updated_at      = now()
  where id = v_artist_id;

  -- They paid two days ago and heard nothing. This is the receipt they should
  -- have had on the eighteenth.
  insert into public.notifications (
    artist_id, user_id, type, title, message, email_requested, metadata
  ) values (
    v_artist_id, v_user_id, 'subscription',
    'Artist Pro is live',
    'Your Pro plan is active and your new upload and payout limits are on. '
    || 'Sorry for the delay in switching it on, that was our fault and not yours. '
    || 'Renews 18 December 2026.',
    true,
    jsonb_build_object(
      'audience', 'artist',
      'tier', 'pro',
      'billing_cycle', 'monthly',
      'expires_at', '2026-12-18',
      'subscription', 'I-A2D1U25BVL7C',
      'recovered', true
    )
  );
end $$;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 the subscription is recorded' as k,
  coalesce((select status || ', ' || coalesce(amount_paid::text,'no amount') || ' ' || coalesce(currency,'')
              || ', provider ' || coalesce(payment_provider,'?')
            from public.artist_tier_subscriptions
            where paypal_subscription_id = 'I-A2D1U25BVL7C'), 'NOT RECORDED') as v
union all
select '2 what tier the artist is on now',
  coalesce((select a.artist_name || ': ' || coalesce(a.tier,'?')
            from public.artists a
            join auth.users u on u.id = a.user_id
            where lower(u.email) = 'sbudasteezy761@gmail.com'), '?')
union all
select '3 current_tier_id points at pro',
  coalesce((select case when a.current_tier_id = (select id from public.platform_tiers where slug='pro')
                        then 'yes' else 'NO, CHECK THIS' end
            from public.artists a
            join auth.users u on u.id = a.user_id
            where lower(u.email) = 'sbudasteezy761@gmail.com'), '?')
union all
select '4 active artist subs by tier',
  coalesce((select string_agg(slug || ': ' || n::text, ' | ') from (
     select coalesce(pt.slug,'unknown') slug, count(*) n
     from public.artist_tier_subscriptions s
     left join public.platform_tiers pt on pt.id = s.tier_id
     where s.status = 'active' group by 1) z), 'none')
union all
select '5 real money vs comps, active subs',
  (select count(*)::text from public.artist_tier_subscriptions
    where status='active' and coalesce(payment_provider,'') <> 'admin_grant')
  || ' paid, '
  || (select count(*)::text from public.artist_tier_subscriptions
       where status='active' and coalesce(payment_provider,'') = 'admin_grant')
  || ' granted'
union all
select '6 STILL OUTSTANDING',
  'I-616NY2WF7KES, cengimboanda@gmail.com, Feelz Retail Monthly, also has no row anywhere. Different table, not fixed by this file.'
order by 1;
