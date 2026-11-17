-- Countries and cities now say how many people as well as how many plays,
-- and every top-N list is ordered before it is cut, so the list shows the
-- biggest groups rather than whichever rows came back first.
CREATE OR REPLACE FUNCTION public.get_platform_listener_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_min_group constant integer := 3;
  v_event_total integer;
  v_result jsonb;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select count(*) into v_event_total
  from listening_events where created_at >= v_since;

  select jsonb_build_object(
    'window_days', p_days,
    'min_group_size', v_min_group,
    'events_sampled', v_event_total,
    'plays', (
      select jsonb_build_object('total', count(*), 'unique_listeners', count(distinct s.user_id))
      from streams s where s.created_at >= v_since
    ),
    'by_device', (
      select coalesce(jsonb_agg(x order by x.plays desc), '[]'::jsonb) from (
        select coalesce(s.device_type, 'unknown') as name, count(*) as plays
        from streams s where s.created_at >= v_since
        group by 1 having count(*) >= v_min_group) x
    ),
    'by_platform', (
      select coalesce(jsonb_agg(x order by x.plays desc), '[]'::jsonb) from (
        select coalesce(s.platform, 'unknown') as name, count(*) as plays
        from streams s where s.created_at >= v_since
        group by 1 having count(*) >= v_min_group) x
    ),
    'by_source', (
      select coalesce(jsonb_agg(x order by x.plays desc), '[]'::jsonb) from (
        select coalesce(s.source, 'unknown') as name, count(*) as plays
        from streams s where s.created_at >= v_since
        group by 1 having count(*) >= v_min_group) x
    ),
    'completion', case when v_event_total >= 5 then (
      select jsonb_build_object(
        'avg_pct', round(avg(completion_pct)::numeric, 1),
        'finished_pct', round(100.0 * count(*) filter (where completion_pct >= 80) / nullif(count(*), 0), 1),
        'abandoned_pct', round(100.0 * count(*) filter (where completion_pct < 10) / nullif(count(*), 0), 1),
        'avg_seconds', round(avg(listened_seconds)::numeric, 0))
      from listening_events
      where created_at >= v_since and completion_pct is not null
    ) else null end,
    'by_country', (
      select coalesce(jsonb_agg(x order by x.listeners desc, x.plays desc), '[]'::jsonb) from (
        select coalesce(country_name, country) as name, country as code,
               count(distinct user_id) as listeners, count(*) as plays
        from listening_events
        where created_at >= v_since and country is not null
        group by 1, 2 having count(distinct user_id) >= v_min_group) x
    ),
    'by_city', (
      select coalesce(jsonb_agg(x order by x.listeners desc, x.plays desc), '[]'::jsonb) from (
        select city as name, coalesce(country_name, country) as country,
               count(distinct user_id) as listeners, count(*) as plays
        from listening_events
        where created_at >= v_since and city is not null
        group by 1, 2 having count(distinct user_id) >= v_min_group
        order by 3 desc, 4 desc
        limit 50) x
    ),
    'by_genre', (
      select coalesce(jsonb_agg(x order by x.plays desc), '[]'::jsonb) from (
        select genre as name, count(*) as plays
        from listening_events
        where created_at >= v_since and genre is not null and genre <> ''
        group by 1 having count(*) >= v_min_group
        order by 2 desc limit 20) x
    ),
    'by_mood', (
      select coalesce(jsonb_agg(x order by x.plays desc), '[]'::jsonb) from (
        select mood as name, count(*) as plays
        from listening_events
        where created_at >= v_since and mood is not null and mood <> ''
        group by 1 having count(*) >= v_min_group
        order by 2 desc limit 20) x
    ),
    'listener_countries', (
      select coalesce(jsonb_agg(x order by x.listeners desc), '[]'::jsonb) from (
        select coalesce(country_name, country) as name, count(distinct user_id) as listeners
        from listening_events
        where created_at >= v_since and country is not null
        group by 1 having count(distinct user_id) >= v_min_group
        order by 2 desc limit 20) x
    )
  ) into v_result;

  return v_result;
end;
$function$;
