-- 257_fans_can_build_worlds.sql
--
-- A listener paying for Fan Pro can build and keep worlds in G.I.L.L., the
-- same as an artist on Premium.
--
-- WHY ONLY THIS ONE FUNCTION CHANGES
--
-- The gate is already in the right place. Both of the policies that matter
-- call it rather than restating the rule:
--
--   gill_worlds       · "paid owner creates" · INSERT
--       WITH CHECK (owner = auth.uid() AND gill_can_save_worlds())
--   gill_world_items  · "paid owner adds"    · INSERT
--       WITH CHECK (EXISTS (... w.owner = auth.uid()) AND gill_can_save_worlds())
--
-- So replacing the function extends the gate everywhere at once, and the
-- policies need no edit. Owner reads, renames and deletes are unchanged: they
-- were never gated on paying, only on owning, which is right - somebody whose
-- subscription lapses must not lose the worlds they already made.
--
-- WHAT IS PRESERVED, EXACTLY
--
-- language sql, STABLE, SECURITY DEFINER, and search_path pinned to
-- 'public', 'pg_temp'. This function decides who may write, so quietly
-- dropping SECURITY DEFINER or the pinned search_path would be a security
-- change wearing a feature's clothes. Read from pg_get_functiondef before
-- writing this, not assumed.
--
-- THE FAN CHECK
--
-- Read from listener_tier_subscriptions joined to platform_tiers, which is
-- exactly what ListenerUpgradePage reads to decide whether somebody already
-- has Fan Pro. One source of truth for "is this fan paying", rather than a
-- second opinion that can drift from the first.
--
-- 'premium' is in the list as well as 'fan_pro'. There is no Fan Premium yet,
-- but LISTENER_TIER_ACCESS in useTier.js already has no 'premium' entry while
-- isListenerPro already counts one, so the slug is half-wired in two
-- directions. If a Fan Premium is ever sold, this refuses it silently unless
-- the slug is named here - and silently refusing somebody who has paid is the
-- exact failure migration 112 was written to prevent.
--
-- ROLLBACK
--   Re-run the body below without the third exists() block. Nothing else in
--   this migration writes, so there is nothing else to undo.

begin;

-- Refuse rather than guess. A missing table or column here would otherwise
-- produce a function that returns false for every fan and an INSERT policy
-- that refuses them with no error anybody can see.
do $$
begin
  if to_regclass('public.listener_tier_subscriptions') is null then
    raise exception 'listener_tier_subscriptions is missing: refusing to change the worlds gate';
  end if;
  if to_regclass('public.platform_tiers') is null then
    raise exception 'platform_tiers is missing: refusing to change the worlds gate';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listener_tier_subscriptions'
      and column_name in ('user_id', 'status', 'tier_id')
    group by table_name having count(distinct column_name) = 3
  ) then
    raise exception 'listener_tier_subscriptions needs user_id, status and tier_id';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_tiers' and column_name = 'slug'
  ) then
    raise exception 'platform_tiers.slug is missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'gill_can_save_worlds'
  ) then
    raise exception 'gill_can_save_worlds does not exist: nothing to replace';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'artist_tier_at_least'
  ) then
    raise exception 'artist_tier_at_least is missing: the artist half of the gate would break';
  end if;
end $$;

create or replace function public.gill_can_save_worlds()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.admins ad where ad.user_id = (select auth.uid()))
    or exists (select 1 from public.artists a
                where a.user_id = (select auth.uid())
                  and public.artist_tier_at_least(a.id, 'premium'))
    -- Fans build too. Same worlds, same limits, bought on the fan plan.
    or exists (select 1
                 from public.listener_tier_subscriptions ls
                 join public.platform_tiers pt on pt.id = ls.tier_id
                where ls.user_id = (select auth.uid())
                  and ls.status = 'active'
                  and pt.slug in ('fan_pro', 'premium'))
  );
$function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- WHO CAN BUILD NOW.
--
-- One grid, on purpose. The Supabase editor returns only the last statement's
-- result, which is how the migration 109 report was lost: two result-producing
-- blocks, and only the second one ever reached anybody.
-- ─────────────────────────────────────────────────────────────────────────
select 'admins' as route, count(*)::bigint as people
  from public.admins
union all
select 'fans on an active paid plan',
       count(distinct ls.user_id)::bigint
  from public.listener_tier_subscriptions ls
  join public.platform_tiers pt on pt.id = ls.tier_id
 where ls.status = 'active'
   and pt.slug in ('fan_pro', 'premium')
union all
select 'artist subscriptions active (premium among them)',
       count(*)::bigint
  from public.artist_tier_subscriptions
 where status = 'active'
order by 1;
