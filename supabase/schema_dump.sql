


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activate_home_hero"("p_hero_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  update home_hero set is_active = false where is_active = true;
  update home_hero set is_active = true where id = p_hero_id;
end;
$$;


ALTER FUNCTION "public"."activate_home_hero"("p_hero_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_email_subscriber_after_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE user_email text;
BEGIN
  user_email := auth.jwt() ->> 'email';
  INSERT INTO email_subscribers (user_id, email, name, source)
  VALUES (NEW.user_id, user_email, NEW.name, 'signup')
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."add_email_subscriber_after_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_approve_affiliate"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  if not exists (select 1 from affiliates where user_id = p_user_id) then
    raise exception 'This account has not signed up for the affiliate program yet';
  end if;

  update affiliates
  set is_eligible = true, status = 'active', eligibility_met_at = now()
  where user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_approve_affiliate"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_find_user_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result uuid;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select user_id into v_result from user_profiles where lower(email) = lower(p_email) limit 1;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_find_user_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_fulfill_redemption"("p_redemption_id" "uuid", "p_approve" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_r record;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select * into v_r from affiliate_credit_redemptions where id = p_redemption_id and status = 'pending';
  if v_r is null then
    raise exception 'Not found or already handled';
  end if;

  if p_approve then
    if v_r.reward_key = 'fan_pro_month' then
      update listeners
      set tier = 'fan_pro',
          tier_expires_at = greatest(coalesce(tier_expires_at, now()), now()) + interval '30 days'
      where user_id = v_r.user_id;
    end if;
    -- founding_fan_badge and social_shoutout have no automatic system
    -- action, they're fulfilled by a person; marking the row fulfilled is
    -- the record that it happened.
    update affiliate_credit_redemptions
    set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
    where id = p_redemption_id;
  else
    update affiliates set credits_balance = credits_balance + v_r.cost where id = v_r.affiliate_id;
    update affiliate_credit_redemptions
    set status = 'rejected', fulfilled_at = now(), fulfilled_by = auth.uid()
    where id = p_redemption_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_fulfill_redemption"("p_redemption_id" "uuid", "p_approve" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_remove_track"("p_track_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM streams WHERE track_id = p_track_id;
  DELETE FROM track_likes WHERE track_id = p_track_id;
  DELETE FROM tracks WHERE id = p_track_id;
END; $$;


ALTER FUNCTION "public"."admin_remove_track"("p_track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_suspend_artist"("p_artist_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only admins can call this
  IF auth.uid() NOT IN (SELECT user_id FROM admins) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE artists
  SET
    is_suspended      = true,
    suspension_reason = p_reason,
    suspended_at      = NOW(),
    suspended_by      = auth.uid(),
    updated_at        = NOW()
  WHERE id = p_artist_id;
END;
$$;


ALTER FUNCTION "public"."admin_suspend_artist"("p_artist_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unsuspend_artist"("p_artist_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() NOT IN (SELECT user_id FROM admins) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE artists
  SET
    is_suspended      = false,
    suspension_reason = NULL,
    suspended_at      = NULL,
    suspended_by      = NULL,
    updated_at        = NOW()
  WHERE id = p_artist_id;
END;
$$;


ALTER FUNCTION "public"."admin_unsuspend_artist"("p_artist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_playlist_proposal"("p_proposal_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_proposal record;
  v_playlist_id uuid;
  v_track_id uuid;
  v_pos integer := 0;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select * into v_proposal from retail_playlist_proposals where id = p_proposal_id and status = 'pending';
  if v_proposal is null then
    raise exception 'Proposal not found or already decided';
  end if;

  insert into retail_playlists (title, mood, created_by)
  values (v_proposal.title, v_proposal.mood, auth.uid())
  returning id into v_playlist_id;

  foreach v_track_id in array v_proposal.track_ids loop
    insert into retail_playlist_tracks (playlist_id, track_id, position)
    values (v_playlist_id, v_track_id, v_pos)
    on conflict (playlist_id, track_id) do nothing;
    v_pos := v_pos + 1;
  end loop;

  update retail_playlist_proposals
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_proposal_id;

  return v_playlist_id;
end;
$$;


ALTER FUNCTION "public"."approve_playlist_proposal"("p_proposal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."artist_can"("p_artist_id" "uuid", "p_feature" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_tier RECORD;
BEGIN
  SELECT pt.* INTO v_tier FROM artists a JOIN platform_tiers pt ON pt.id = a.current_tier_id WHERE a.id = p_artist_id;
  IF NOT FOUND THEN RETURN false; END IF;
  CASE p_feature
    WHEN 'upload_lyrics' THEN RETURN v_tier.can_upload_lyrics;
    WHEN 'customize_theme' THEN RETURN v_tier.can_customize_theme;
    WHEN 'create_chat_rooms' THEN RETURN v_tier.can_create_chat_rooms;
    WHEN 'download_contacts' THEN RETURN v_tier.can_download_contacts;
    WHEN 'collaborate' THEN RETURN v_tier.can_collaborate;
    WHEN 'sell_music' THEN RETURN v_tier.can_sell_music;
    WHEN 'access_analytics' THEN RETURN v_tier.can_access_analytics;
    ELSE RETURN false;
  END CASE;
END; $$;


ALTER FUNCTION "public"."artist_can"("p_artist_id" "uuid", "p_feature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."artist_can_upload"("p_artist_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_max_singles INTEGER; v_current_tracks INTEGER;
BEGIN
  SELECT pt.max_singles INTO v_max_singles FROM artists a JOIN platform_tiers pt ON pt.id = a.current_tier_id WHERE a.id = p_artist_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_max_singles = -1 THEN RETURN true; END IF;
  SELECT COUNT(*) INTO v_current_tracks FROM tracks WHERE artist_id = p_artist_id;
  RETURN v_current_tracks < v_max_singles;
END; $$;


ALTER FUNCTION "public"."artist_can_upload"("p_artist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_flag_stream_abuse"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count
  FROM streams
  WHERE track_id = NEW.track_id
    AND user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';
  IF v_count > 500 THEN
    PERFORM public.create_fraud_flag(
      'track', NEW.track_id, 'stream_abuse', 'high',
      jsonb_build_object('user_id', NEW.user_id, 'stream_count_1h', v_count)
    );
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."auto_flag_stream_abuse"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ban_user"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  update auth.users
  set banned_until = '2999-12-31T23:59:59Z'
  where id = target_user_id;
end;
$$;


ALTER FUNCTION "public"."ban_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_explicit_retail_catalog"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_is_explicit boolean;
  v_title text;
begin
  select is_explicit, title into v_is_explicit, v_title
  from tracks where id = new.track_id;

  if coalesce(v_is_explicit, false) then
    raise exception 'Cannot approve explicit track "%" into the retail catalogue.', coalesce(v_title, new.track_id::text);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_explicit_retail_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_explicit_retail_track"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_is_explicit boolean;
  v_title text;
begin
  select is_explicit, title into v_is_explicit, v_title
  from tracks where id = new.track_id;

  if coalesce(v_is_explicit, false) then
    raise exception 'Cannot add explicit track "%" to a retail playlist. Retail plays in public venues.', coalesce(v_title, new.track_id::text);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_explicit_retail_track"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_artist_id uuid;
  v_user_id uuid;
  v_inserted integer := 0;
  i integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Allow track owner or admin
  SELECT t.artist_id INTO v_artist_id
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  WHERE t.id = p_track_id AND a.user_id = v_user_id;

  IF v_artist_id IS NULL THEN
    SELECT t.artist_id INTO v_artist_id
    FROM tracks t
    WHERE t.id = p_track_id
      AND EXISTS (SELECT 1 FROM admins WHERE user_id = v_user_id);
  END IF;

  IF v_artist_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Track not found or not authorized');
  END IF;

  p_count := LEAST(p_count, 10000);

  FOR i IN 1..p_count LOOP
    INSERT INTO streams (
      track_id,
      user_id,        -- NULL so abuse trigger is skipped
      duration_played,
      completed,
      platform,
      created_at
    ) VALUES (
      p_track_id,
      NULL,           -- anonymous boost stream
      30 + (random() * 150)::integer,
      (random() > 0.3),
      'web',
      now() - (random() * interval '24 hours')
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'inserted', v_inserted, 'track_id', p_track_id);
END;
$$;


ALTER FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_engagement_score"("p_track_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_streams      integer;
  v_likes        integer;
  v_completed    integer;
  v_comp_rate    numeric;
  v_days_old     numeric;
  v_recency_mult numeric;
  v_score        numeric;
BEGIN
  -- Stream count from tracks table
  SELECT COALESCE(stream_count, 0) INTO v_streams
  FROM tracks WHERE id = p_track_id;
 
  -- Like count
  SELECT COUNT(*) INTO v_likes
  FROM track_likes WHERE track_id = p_track_id;
 
  -- Completion rate from streams table
  SELECT
    COUNT(*),
    COALESCE(ROUND(100.0 * SUM(CASE WHEN completed THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0)
  INTO v_streams, v_comp_rate
  FROM streams WHERE track_id = p_track_id;
 
  -- Days since upload
  SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 86400
  INTO v_days_old FROM tracks WHERE id = p_track_id;
 
  -- Recency multiplier: new tracks (< 7 days) get a boost
  v_recency_mult := CASE
    WHEN v_days_old < 1  THEN 3.0
    WHEN v_days_old < 3  THEN 2.0
    WHEN v_days_old < 7  THEN 1.5
    WHEN v_days_old < 14 THEN 1.2
    ELSE 1.0
  END;
 
  -- Score formula:
  -- streams * completion_rate weight + likes * 5 + recency boost
  -- completion_rate above 50% is a signal of quality
  v_score := (
    (v_streams * (COALESCE(v_comp_rate, 0) / 100.0)) +
    (v_likes * 5) +
    CASE WHEN v_comp_rate >= 50 THEN 10 ELSE 0 END
  ) * v_recency_mult;
 
  -- Tracks with < 3 streams and > 30 days old score near 0
  IF v_streams < 3 AND v_days_old > 30 THEN
    v_score := v_score * 0.1;
  END IF;
 
  RETURN ROUND(v_score, 4);
END;
$$;


ALTER FUNCTION "public"."calc_engagement_score"("p_track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_retail_payout"("p_period_start" "date", "p_period_end" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sub_revenue numeric(10,2);
  v_ad_revenue numeric(10,2);
  v_pool numeric(10,2);
  v_total_plays integer;
  v_period_id uuid;
  v_artist record;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select coalesce(sum(rs.monthly_fee), 0) into v_sub_revenue
  from retail_subscriptions rs
  where rs.status = 'active'
    and rs.started_at::date <= p_period_end;

  select coalesce(sum(rar.amount), 0) into v_ad_revenue
  from retail_ad_revenue rar
  where rar.period_start = p_period_start and rar.period_end = p_period_end;

  v_pool := round(v_sub_revenue * 0.5 + v_ad_revenue * 0.3, 2);

  select count(*) into v_total_plays
  from retail_play_logs
  where played_at::date between p_period_start and p_period_end;

  insert into retail_payout_periods (
    period_start, period_end, subscription_revenue, ad_revenue,
    artist_pool, total_qualifying_plays, calculated_by
  ) values (
    p_period_start, p_period_end, v_sub_revenue, v_ad_revenue,
    v_pool, v_total_plays, auth.uid()
  )
  returning id into v_period_id;

  if v_total_plays > 0 then
    for v_artist in
      select t.artist_id as artist_id, count(*) as play_count
      from retail_play_logs rpl
      join tracks t on t.id = rpl.track_id
      where rpl.played_at::date between p_period_start and p_period_end
      group by t.artist_id
    loop
      insert into retail_artist_payouts (period_id, artist_id, play_count, share_pct, amount)
      values (
        v_period_id,
        v_artist.artist_id,
        v_artist.play_count,
        round(100.0 * v_artist.play_count / v_total_plays, 3),
        round(v_pool * v_artist.play_count / v_total_plays, 2)
      );
    end loop;
  end if;

  return v_period_id;
end;
$$;


ALTER FUNCTION "public"."calculate_retail_payout"("p_period_start" "date", "p_period_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_affiliate_eligibility"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role      text;
  v_artist_id uuid;
  v_tracks    integer;
  v_follows   integer;
  v_streams   integer;
  v_days_old  numeric;
BEGIN
  -- Get role
  SELECT role INTO v_role FROM artists WHERE user_id = p_user_id;
  SELECT id INTO v_artist_id FROM artists WHERE user_id = p_user_id;

  SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 86400
  INTO v_days_old FROM auth.users WHERE id = p_user_id;

  IF v_role IN ('artist', 'beatmaker') THEN
    -- Artists: 1+ published track, account 30+ days old
    SELECT COUNT(*) INTO v_tracks FROM tracks
    WHERE artist_id = v_artist_id AND is_published = true;
    RETURN v_days_old >= 30 AND v_tracks >= 1;

  ELSE
    -- Listeners: 20+ streams, following 10+ artists, account 14+ days old
    SELECT COUNT(*) INTO v_streams FROM streams WHERE user_id = p_user_id;
    SELECT COUNT(*) INTO v_follows FROM follows WHERE follower_id = p_user_id;
    RETURN v_days_old >= 14 AND v_streams >= 20 AND v_follows >= 10;
  END IF;
END;
$$;


ALTER FUNCTION "public"."check_affiliate_eligibility"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_streak"("p_user_id" "uuid") RETURNS TABLE("current_streak" integer, "longest_streak" integer, "last_active_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row user_streaks%ROWTYPE;
  v_today date := CURRENT_DATE;
  v_new_streak int;
  v_new_longest int;
BEGIN
  SELECT * INTO v_row FROM user_streaks WHERE user_id = p_user_id;

  -- First ever visit
  IF NOT FOUND THEN
    INSERT INTO user_streaks(user_id, current_streak, longest_streak, last_active_date, discovery_streak, longest_discovery_streak)
    VALUES (p_user_id, 1, 1, v_today, 0, 0);
    RETURN QUERY SELECT 1::int, 1::int, v_today;
    RETURN;
  END IF;

  -- Already ran today — return existing values, no change
  IF v_row.last_active_date = v_today THEN
    RETURN QUERY SELECT v_row.current_streak, v_row.longest_streak, v_row.last_active_date;
    RETURN;
  END IF;

  -- Consecutive day = increment, otherwise reset
  IF v_row.last_active_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_new_longest := GREATEST(v_new_streak, COALESCE(v_row.longest_streak, 0));

  UPDATE user_streaks
    SET current_streak   = v_new_streak,
        longest_streak   = v_new_longest,
        last_active_date = v_today
    WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_new_streak, v_new_longest, v_today;
END;
$$;


ALTER FUNCTION "public"."check_and_increment_streak"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_follower_milestones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_count int; v_milestone text; v_artist RECORD; v_user_id uuid;
BEGIN
  SELECT id, artist_name, follower_count, user_id INTO v_artist FROM artists WHERE id = NEW.artist_id;
  v_count := COALESCE(v_artist.follower_count, 0);
  
  IF v_count = 100 THEN v_milestone := 'milestone_100';
  ELSIF v_count = 500 THEN v_milestone := 'milestone_500';
  ELSIF v_count = 1000 THEN v_milestone := 'milestone_1k';
  ELSIF v_count = 10000 THEN v_milestone := 'milestone_10k';
  ELSE RETURN NEW; END IF;

  IF v_artist.user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO notifications (user_id, artist_id, type, title, metadata)
      VALUES (v_artist.user_id, NEW.artist_id, v_milestone, 
        v_artist.artist_name || ' just hit ' || v_count || ' followers!', 
        jsonb_build_object('follower_count', v_count, 'milestone_type', 'followers'))
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_follower_milestones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_listener_like_milestones"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int; v_milestone text;
BEGIN
  SELECT COUNT(*) INTO v_count FROM track_likes WHERE user_id = NEW.user_id;
  IF v_count = 10 THEN v_milestone := 'milestone_100';
  ELSIF v_count = 50 THEN v_milestone := 'milestone_500';
  ELSIF v_count = 100 THEN v_milestone := 'milestone_1k';
  ELSE RETURN NEW; END IF;
  INSERT INTO notifications (user_id, type, title, metadata)
  VALUES (NEW.user_id, v_milestone, 'You have liked ' || v_count || ' tracks! Great taste!', jsonb_build_object('listener_likes', v_count, 'milestone_type', 'listener_likes'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."check_listener_like_milestones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_listener_stream_milestones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE 
  v_count int; 
  v_milestone text;
  v_artist_id uuid;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT COUNT(*) INTO v_count FROM streams WHERE user_id = NEW.user_id;
  
  IF v_count = 10 THEN v_milestone := 'milestone_100';
  ELSIF v_count = 50 THEN v_milestone := 'milestone_500';
  ELSIF v_count = 100 THEN v_milestone := 'milestone_1k';
  ELSIF v_count = 500 THEN v_milestone := 'milestone_10k';
  ELSE RETURN NEW; END IF;

  SELECT artist_id INTO v_artist_id FROM tracks WHERE id = NEW.track_id;
  
  IF v_artist_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO notifications (user_id, artist_id, type, title, metadata)
    VALUES (
      NEW.user_id, v_artist_id, v_milestone,
      'You just listened to ' || v_count || ' tracks! Keep discovering!',
      jsonb_build_object('listener_streams', v_count, 'milestone_type', 'listener_streams')
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_listener_stream_milestones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_stream_milestones"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE 
  v_milestone text; 
  v_count int;
  v_user_id uuid;
BEGIN
  v_count := NEW.stream_count;
  IF v_count = 100 THEN v_milestone := 'milestone_100';
  ELSIF v_count = 500 THEN v_milestone := 'milestone_500';
  ELSIF v_count = 1000 THEN v_milestone := 'milestone_1k';
  ELSIF v_count = 10000 THEN v_milestone := 'milestone_10k';
  ELSE RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM artists WHERE id = NEW.artist_id;

  IF NEW.artist_id IS NOT NULL AND v_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO notifications (user_id, artist_id, type, title, track_id, metadata)
      VALUES (
        v_user_id, NEW.artist_id, v_milestone,
        NEW.title || ' just hit ' || v_count || ' streams!',
        NEW.id, jsonb_build_object('stream_count', v_count)
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_stream_milestones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_venue_signup"("p_token" "text", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_venue_id uuid;
begin
  select id into v_venue_id from retail_venues
  where signup_token = p_token
    and signup_token_expires_at > now()
    and user_id is null;

  if v_venue_id is null then
    raise exception 'This invite link is invalid or has expired';
  end if;

  update retail_venues
  set user_id = p_user_id, signup_token = null, signup_token_expires_at = null
  where id = v_venue_id;

  return v_venue_id;
end;
$$;


ALTER FUNCTION "public"."complete_venue_signup"("p_token" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_artist_to_listener"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_artist       record;
  v_track_count  int;
  v_payout_count int;
  v_display      text;
begin
  select * into v_artist from artists where user_id = auth.uid();

  if v_artist is null then
    -- Already not an artist. Make sure a listener row exists and stop.
    insert into listeners (user_id, display_name)
    values (auth.uid(), coalesce((select email from auth.users where id = auth.uid()), 'Listener'))
    on conflict (user_id) do nothing;
    return jsonb_build_object('converted', true, 'reason', 'already_listener');
  end if;

  select count(*) into v_track_count  from tracks where artist_id = v_artist.id;
  select count(*) into v_payout_count from retail_artist_payouts where artist_id = v_artist.id;

  -- Refuse to destroy real creator history.
  if v_track_count > 0 or v_payout_count > 0 or coalesce(v_artist.follower_count, 0) > 0 then
    return jsonb_build_object(
      'converted', false,
      'reason', 'has_creator_activity',
      'tracks', v_track_count,
      'payouts', v_payout_count,
      'followers', coalesce(v_artist.follower_count, 0)
    );
  end if;

  v_display := coalesce(nullif(v_artist.artist_name, ''), 'Listener');

  insert into listeners (user_id, display_name)
  values (auth.uid(), v_display)
  on conflict (user_id) do nothing;

  delete from artists where id = v_artist.id;

  return jsonb_build_object('converted', true, 'reason', 'converted');
end;
$$;


ALTER FUNCTION "public"."convert_artist_to_listener"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_fraud_flag"("p_entity_type" "text", "p_entity_id" "uuid", "p_flag_type" "text", "p_severity" "text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO fraud_flags (entity_type, entity_id, flag_type, severity, details, resolved)
  VALUES (p_entity_type, p_entity_id, p_flag_type, p_severity, p_details, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;


ALTER FUNCTION "public"."create_fraud_flag"("p_entity_type" "text", "p_entity_id" "uuid", "p_flag_type" "text", "p_severity" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_story_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE artist_stories SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.story_id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."decrement_story_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_bpm_from_filename"("filename" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE bpm_match TEXT;
BEGIN
  bpm_match := substring(filename FROM '(\d{2,3})[\-_\s]?bpm');
  IF bpm_match IS NULL THEN bpm_match := substring(filename FROM 'bpm[\-_\s]?(\d{2,3})'); END IF;
  IF bpm_match IS NOT NULL THEN RETURN bpm_match::INTEGER; END IF;
  RETURN NULL;
END; $$;


ALTER FUNCTION "public"."extract_bpm_from_filename"("filename" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_key_from_filename"("filename" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE key_match TEXT;
BEGIN
  key_match := substring(filename FROM '([A-G][\#b]?)[\-_\s]?(maj|major|min|minor)');
  IF key_match IS NOT NULL THEN RETURN initcap(key_match); END IF;
  RETURN NULL;
END; $$;


ALTER FUNCTION "public"."extract_key_from_filename"("filename" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_playlist_proposals"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_mood record;
  v_count integer := 0;
  v_track_ids uuid[];
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  for v_mood in
    select t.mood, count(*) as track_count
    from retail_catalog rc
    join tracks t on t.id = rc.track_id
    where rc.is_active = true and t.mood is not null and t.mood != ''
    group by t.mood
    having count(*) >= 5
  loop
    if exists (select 1 from retail_playlist_proposals where mood = v_mood.mood and status = 'pending') then
      continue;
    end if;
    if exists (select 1 from retail_playlists where mood = v_mood.mood and is_active = true) then
      continue;
    end if;

    select array_agg(track_id) into v_track_ids
    from (
      select rc.track_id,
        coalesce((select count(*) from retail_play_logs where track_id = rc.track_id), 0)
        + coalesce((select count(*) from retail_venue_likes where track_id = rc.track_id), 0) * 3 as score
      from retail_catalog rc
      join tracks t on t.id = rc.track_id
      where rc.is_active = true and t.mood = v_mood.mood
      order by score desc
      limit 15
    ) ranked;

    insert into retail_playlist_proposals (title, mood, track_ids)
    values ('Feelz for ' || initcap(v_mood.mood), v_mood.mood, v_track_ids);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."generate_playlist_proposals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_venue_signup_token"("p_venue_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_token text;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  v_token := substring(md5(random()::text || clock_timestamp()::text || p_venue_id::text) from 1 for 12)
          || substring(md5(random()::text || clock_timestamp()::text) from 1 for 12);

  update retail_venues
  set signup_token = v_token, signup_token_expires_at = now() + interval '14 days'
  where id = p_venue_id;

  return v_token;
end;
$$;


ALTER FUNCTION "public"."generate_venue_signup_token"("p_venue_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_verification_codes"("p_count" integer, "p_school_id" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  i integer;
  v_code text;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;
  if p_count < 1 or p_count > 500 then
    raise exception 'Count must be between 1 and 500';
  end if;

  for i in 1..p_count loop
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    insert into school_sessions_verification_codes (code, school_id, created_by)
    values (v_code, p_school_id, auth.uid());
    return next v_code;
  end loop;
  return;
end;
$$;


ALTER FUNCTION "public"."generate_verification_codes"("p_count" integer, "p_school_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_district_vote_counts"("p_season" integer) RETURNS TABLE("nomination_id" "uuid", "votes" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select nomination_id, count(*) as votes
  from school_sessions_district_votes
  where season_requested = p_season
  group by nomination_id;
$$;


ALTER FUNCTION "public"."get_district_vote_counts"("p_season" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_school_sessions_vote_counts"("p_competition_id" "uuid") RETURNS TABLE("entry_id" "uuid", "votes" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select entry_id, count(*) as votes
  from school_sessions_votes
  where competition_id = p_competition_id
  group by entry_id;
$$;


ALTER FUNCTION "public"."get_school_sessions_vote_counts"("p_competition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_venue_by_signup_token"("p_token" "text") RETURNS TABLE("business_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select business_name from retail_venues
  where signup_token = p_token and signup_token_expires_at > now() and user_id is null;
$$;


ALTER FUNCTION "public"."get_venue_by_signup_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_venue_playlist_recommendations"() RETURNS TABLE("playlist_id" "uuid", "title" "text", "mood" "text", "score" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_venue_id uuid;
begin
  select id into v_venue_id from retail_venues where user_id = auth.uid();
  if v_venue_id is null then
    return;
  end if;

  return query
  with my_likes as (
    select track_id from retail_venue_likes where venue_id = v_venue_id
  ),
  similar_venues as (
    select rvl.venue_id, count(*) as shared_likes
    from retail_venue_likes rvl
    join my_likes ml on ml.track_id = rvl.track_id
    where rvl.venue_id != v_venue_id
    group by rvl.venue_id
  ),
  similar_venue_likes as (
    select rvl.track_id, sum(sv.shared_likes) as weight
    from retail_venue_likes rvl
    join similar_venues sv on sv.venue_id = rvl.venue_id
    where rvl.track_id not in (select track_id from my_likes)
    group by rvl.track_id
  )
  select rp.id, rp.title, rp.mood, sum(svl.weight)::integer as score
  from similar_venue_likes svl
  join retail_playlist_tracks rpt on rpt.track_id = svl.track_id
  join retail_playlists rp on rp.id = rpt.playlist_id and rp.is_active = true
  group by rp.id, rp.title, rp.mood
  order by score desc
  limit 5;
end;
$$;


ALTER FUNCTION "public"."get_venue_playlist_recommendations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_listener"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.listeners (user_id, created_at)
  VALUES (NEW.id, NOW())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_listener"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO user_profiles (user_id, name, email, avatar_url, profile_completed, created_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'User'), NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'), false, NOW())
  ON CONFLICT (user_id) DO UPDATE SET avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_voted_school_sessions"("p_competition_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from school_sessions_votes
    where competition_id = p_competition_id and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."has_voted_school_sessions"("p_competition_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment"("x" integer) RETURNS integer
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $_$
  SELECT COALESCE($1, 0) + 1;
$_$;


ALTER FUNCTION "public"."increment"("x" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_affiliate_clicks"("p_affiliate_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE affiliates
  SET total_clicks = COALESCE(total_clicks, 0) + 1
  WHERE id = p_affiliate_id;
END;
$$;


ALTER FUNCTION "public"."increment_affiliate_clicks"("p_affiliate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_affiliate_stats"("p_affiliate_id" "uuid", "p_signups" integer DEFAULT 0, "p_conversions" integer DEFAULT 0, "p_credits" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE affiliates SET
    total_signups     = COALESCE(total_signups, 0) + p_signups,
    total_conversions = COALESCE(total_conversions, 0) + p_conversions,
    credits_balance   = COALESCE(credits_balance, 0) + p_credits,
    credits_lifetime  = COALESCE(credits_lifetime, 0) + p_credits
  WHERE id = p_affiliate_id;
END;
$$;


ALTER FUNCTION "public"."increment_affiliate_stats"("p_affiliate_id" "uuid", "p_signups" integer, "p_conversions" integer, "p_credits" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_artist_streams"("artist_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE artists
  SET total_streams = total_streams + 1
  WHERE id = artist_id;
END;
$$;


ALTER FUNCTION "public"."increment_artist_streams"("artist_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_chat_member_count"("room_id_input" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE chat_rooms SET member_count = COALESCE(member_count, 0) + 1 WHERE id = room_id_input;
END; $$;


ALTER FUNCTION "public"."increment_chat_member_count"("room_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_competition_entry_votes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update competition_entries set vote_count = vote_count + 1 where id = new.entry_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."increment_competition_entry_votes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_decimal"("x" numeric) RETURNS numeric
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $_$
  SELECT COALESCE($1, 0) + x;
$_$;


ALTER FUNCTION "public"."increment_decimal"("x" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_download_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks SET download_count = COALESCE(download_count, 0) + 1 WHERE id = NEW.track_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_download_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_download_count"("track_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks SET download_count = COALESCE(download_count, 0) + 1 WHERE id = track_id;
END;
$$;


ALTER FUNCTION "public"."increment_download_count"("track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_entry_votes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE competition_entries
  SET vote_count = vote_count + 1
  WHERE id = NEW.entry_id;

  INSERT INTO competition_user_votes (competition_id, user_id, votes_cast)
  VALUES (NEW.competition_id, NEW.user_id, 1)
  ON CONFLICT (competition_id, user_id)
  DO UPDATE SET votes_cast = competition_user_votes.votes_cast + 1;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_entry_votes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_external_play"("p_track_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  update public.tracks
  set external_play_count = external_play_count + 1
  where id = p_track_id;
$$;


ALTER FUNCTION "public"."increment_external_play"("p_track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_pending_balance"("p_artist_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO artist_payment_profiles (artist_id, payout_threshold)
  VALUES (p_artist_id, 10)
  ON CONFLICT (artist_id) DO NOTHING;
  -- Actual pending balance tracking can be added here if you add a pending_balance column
  -- For now this is a no-op placeholder so the RPC call doesn't error
END;
$$;


ALTER FUNCTION "public"."increment_pending_balance"("p_artist_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_plays"("sample_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE samples SET plays = COALESCE(plays, 0) + 1 WHERE id = sample_id;
END; $$;


ALTER FUNCTION "public"."increment_plays"("sample_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_story_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE artist_stories SET like_count = like_count + 1 WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_story_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_story_views"("story_id_input" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE artist_stories
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = story_id_input;
END;
$$;


ALTER FUNCTION "public"."increment_story_views"("story_id_input" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_stream_count"("track_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  UPDATE tracks SET stream_count = stream_count + 1 WHERE id = track_id;
$$;


ALTER FUNCTION "public"."increment_stream_count"("track_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_track_download_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks SET download_count = COALESCE(download_count, 0) + 1 WHERE id = NEW.track_id;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."increment_track_download_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_retail_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from admins        where user_id = auth.uid())
      or exists (select 1 from retail_admins where user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_retail_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_vip_candidate"("p_name" "text", "p_ref_code" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cap integer;
  v_next integer;
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'Unauthorized';
  end if;

  select vip_candidate_cap into v_cap from school_sessions_config limit 1;
  select coalesce(max(candidate_number), 0) + 1 into v_next from school_sessions_vip_candidates;

  if v_next > v_cap then
    raise exception 'VIP candidate cap (%) reached', v_cap;
  end if;

  insert into school_sessions_vip_candidates (candidate_number, name, ref_code, issued_by)
  values (v_next, p_name, p_ref_code, auth.uid());

  return v_next;
end;
$$;


ALTER FUNCTION "public"."issue_vip_candidate"("p_name" "text", "p_ref_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."judge_set_finalist"("p_entry_id" "uuid", "p_value" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_competition_id uuid;
  v_authorized boolean;
begin
  select competition_id into v_competition_id
  from school_sessions_entries where id = p_entry_id;

  if v_competition_id is null then
    raise exception 'Entry not found';
  end if;

  v_authorized := exists (select 1 from admins where user_id = auth.uid())
    or exists (
      select 1 from school_sessions_judges
      where user_id = auth.uid() and competition_id = v_competition_id
    );

  if not v_authorized then
    raise exception 'Unauthorized';
  end if;

  update school_sessions_entries set is_finalist = p_value where id = p_entry_id;
end;
$$;


ALTER FUNCTION "public"."judge_set_finalist"("p_entry_id" "uuid", "p_value" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."judge_set_winner"("p_entry_id" "uuid", "p_value" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_competition_id uuid;
  v_authorized boolean;
begin
  select competition_id into v_competition_id
  from school_sessions_entries where id = p_entry_id;

  if v_competition_id is null then
    raise exception 'Entry not found';
  end if;

  v_authorized := exists (select 1 from admins where user_id = auth.uid())
    or exists (
      select 1 from school_sessions_judges
      where user_id = auth.uid() and competition_id = v_competition_id
    );

  if not v_authorized then
    raise exception 'Unauthorized';
  end if;

  update school_sessions_entries set is_winner = p_value where id = p_entry_id;
end;
$$;


ALTER FUNCTION "public"."judge_set_winner"("p_entry_id" "uuid", "p_value" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_stream"("p_track_id" "uuid", "p_user_id" "uuid", "p_duration_played" integer, "p_completed" boolean, "p_platform" "text", "p_device_type" "text", "p_source" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_artist_id uuid;
  v_owner_id uuid;
  v_prior_stream_count integer;
  v_collab record;
begin
  select t.artist_id, t.stream_count
    into v_artist_id, v_prior_stream_count
  from tracks t
  where t.id = p_track_id;
 
  if v_artist_id is null then
    return jsonb_build_object('logged', false, 'reason', 'track_not_found');
  end if;
 
  select user_id into v_owner_id from artists where id = v_artist_id for update;
 
  if v_owner_id = p_user_id then
    return jsonb_build_object('logged', false, 'reason', 'self_stream');
  end if;
 
  -- 1. Insert the stream row (source of truth). This alone now correctly
  --    increments tracks.stream_count via the on_stream_insert_score trigger
  --    — no separate manual update needed here anymore.
  insert into streams (
    track_id, user_id, artist_id, duration_played, completed,
    platform, device_type, source
  ) values (
    p_track_id, p_user_id, v_artist_id, p_duration_played, p_completed,
    p_platform, p_device_type, p_source
  );
 
  -- 2. Increment artist total_streams
  update artists set total_streams = total_streams + 1 where id = v_artist_id;
 
  -- 3. Increment accepted collaborators' total_streams (excluding the listener and the owner)
  for v_collab in
    select c.artist_id
    from collaborations c
    join artists ca on ca.id = c.artist_id
    where c.track_id = p_track_id
      and c.status = 'accepted'
      and c.artist_id <> v_artist_id
      and ca.user_id is distinct from p_user_id
  loop
    update artists set total_streams = total_streams + 1 where id = v_collab.artist_id;
  end loop;
 
  return jsonb_build_object(
    'logged', true,
    'artist_id', v_artist_id,
    'owner_user_id', v_owner_id,
    'prior_stream_count', v_prior_stream_count
  );
end;
$$;


ALTER FUNCTION "public"."log_stream"("p_track_id" "uuid", "p_user_id" "uuid", "p_duration_played" integer, "p_completed" boolean, "p_platform" "text", "p_device_type" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_first_listener"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  prior_count integer;
BEGIN
  SELECT COUNT(*) INTO prior_count
  FROM streams
  WHERE track_id = NEW.track_id
    AND id != NEW.id;

  IF prior_count = 0 THEN
    UPDATE streams SET is_first_listener = true WHERE id = NEW.id;
    INSERT INTO notifications (user_id, type, title, message, track_id, metadata)
    SELECT NEW.user_id, 'first_listener',
      'You were first 🎯',
      'You are the first person to listen to this track.',
      NEW.track_id,
      jsonb_build_object('track_id', NEW.track_id)
    WHERE NEW.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."mark_first_listener"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_artist_new_stream"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_artist_id         UUID;
  v_artist_user_id    UUID;
  v_track_title       TEXT;
  v_track_artwork     TEXT;
  v_track_file_url    TEXT;
  v_artist_name       TEXT;
  v_artist_slug       TEXT;
  v_track_slug        TEXT;
  v_stream_count      INTEGER;
BEGIN
  SELECT
    t.artist_id, t.title, t.cover_artwork_url, t.file_url, t.slug,
    a.user_id, a.artist_name, a.slug
  INTO
    v_artist_id, v_track_title, v_track_artwork, v_track_file_url, v_track_slug,
    v_artist_user_id, v_artist_name, v_artist_slug
  FROM tracks t
  JOIN artists a ON a.id = t.artist_id
  WHERE t.id = NEW.track_id;

  -- Don't notify if artist is streaming their own track
  IF v_artist_user_id = NEW.user_id THEN RETURN NEW; END IF;

  -- Count actual streams for this track (not cached column)
  SELECT COUNT(*) INTO v_stream_count
  FROM streams WHERE track_id = NEW.track_id;

  -- Notify every 5 streams
  IF (v_stream_count % 5) = 0 THEN
    INSERT INTO notifications (user_id, artist_id, type, title, message, track_id, metadata, created_at)
    VALUES (
      v_artist_user_id, v_artist_id, 'new_stream',
      'New stream on ' || COALESCE(v_track_title, 'your track'),
      'Someone streamed your track',
      NEW.track_id,
      jsonb_build_object(
        'track_id',      NEW.track_id,
        'track_title',   v_track_title,
        'track_slug',    v_track_slug,
        'track_artwork', v_track_artwork,
        'file_url',      v_track_file_url,
        'artist_name',   v_artist_name,
        'artist_slug',   v_artist_slug,
        'stream_count',  v_stream_count
      ),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_artist_new_stream"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_artist_suspended"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO notifications (user_id, artist_id, type, title, message, metadata)
  SELECT 
    a.user_id,
    NEW.id,
    'announcement',
    'Account suspended',
    'Your account has been suspended. Please contact support.',
    jsonb_build_object('suspended', true)
  FROM artists a
  WHERE a.id = NEW.id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_artist_suspended"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_followers_artist_milestone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  milestones int[] := ARRAY[1000, 5000, 10000, 50000, 100000];
  m int;
BEGIN
  FOREACH m IN ARRAY milestones LOOP
    IF OLD.total_streams < m AND NEW.total_streams >= m THEN
      INSERT INTO notifications (user_id, type, title, message, from_artist_id, metadata)
      SELECT
        f.follower_id,
        'milestone_stream',
        NEW.artist_name || ' just hit ' ||
          CASE WHEN m >= 1000 THEN (m/1000)::text || 'K' ELSE m::text END || ' streams!',
        'You helped make this happen. Keep supporting.',
        NEW.id,
        jsonb_build_object('milestone', m, 'artist_slug', NEW.slug)
      FROM follows f
      WHERE f.artist_id = NEW.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_followers_artist_milestone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_followers_new_track"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.is_published = true AND (OLD.is_published IS DISTINCT FROM true) THEN
    INSERT INTO notifications (user_id, type, title, message, track_id, from_artist_id, metadata)
    SELECT
      f.follower_id,
      'new_track',
      a.artist_name || ' dropped something new',
      NEW.title,
      NEW.id,
      a.id,
      jsonb_build_object('artist_slug', a.slug, 'cover_artwork_url', NEW.cover_artwork_url)
    FROM follows f
    JOIN artists a ON a.id = NEW.artist_id
    WHERE f.artist_id = a.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_followers_new_track"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_track"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_artist_name TEXT;
  v_artist_slug TEXT;
BEGIN
  IF NEW.is_published = true AND (OLD IS NULL OR OLD.is_published IS DISTINCT FROM true) THEN
    SELECT a.artist_name, a.slug INTO v_artist_name, v_artist_slug
    FROM artists a WHERE a.id = NEW.artist_id;

    INSERT INTO notifications (user_id, type, title, message, from_artist_id, track_id, metadata)
    SELECT
      f.follower_id,
      'new_track',
      v_artist_name || ' released a new track!',
      NEW.title,
      NEW.artist_id,
      NEW.id,
      jsonb_build_object(
        'track_id',      NEW.id,
        'track_title',   NEW.title,
        'track_slug',    NEW.slug,
        'track_artwork', NEW.cover_artwork_url,
        'artist_name',   v_artist_name,
        'artist_slug',   v_artist_slug,
        'file_url',      NEW.file_url
      )
    FROM follows f
    WHERE f.artist_id = NEW.artist_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_new_track"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_track_like"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_track RECORD; v_liker RECORD; v_artist_user_id uuid;
BEGIN
  SELECT id, title, artist_id INTO v_track FROM tracks WHERE id = NEW.track_id;
  SELECT id, artist_name INTO v_liker FROM artists WHERE user_id = NEW.user_id;
  
  IF v_track.artist_id IS NOT NULL AND v_liker.id IS DISTINCT FROM v_track.artist_id THEN
    SELECT user_id INTO v_artist_user_id FROM artists WHERE id = v_track.artist_id;
    
    IF v_artist_user_id IS NOT NULL THEN
      BEGIN
        INSERT INTO notifications (user_id, artist_id, type, title, track_id, from_artist_id)
        VALUES (v_artist_user_id, v_track.artist_id, 'track_liked', 
          COALESCE(v_liker.artist_name, 'Someone') || ' liked ' || v_track.title, 
          NEW.track_id, v_liker.id)
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_track_like"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_stream_update_score"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks SET
    stream_count = COALESCE(stream_count, 0) + 1,
    engagement_score = (COALESCE(stream_count,0)+1)*1 + COALESCE(like_count,0)*3 + COALESCE(save_count,0)*4
      + COALESCE(favorite_count,0)*5 + COALESCE(playlist_add_count,0)*6 + COALESCE(download_count,0)*2,
    last_score_update = now()
  WHERE id = NEW.track_id;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."on_stream_update_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_stream_spam"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM streams
    WHERE user_id  = NEW.user_id
      AND track_id = NEW.track_id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_stream_spam"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_privilege_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_is_admin boolean;
begin
  caller_is_admin := (
    auth.role() = 'service_role'
    or auth.uid() in (select user_id from admins)
  );

  if not caller_is_admin then
    if TG_TABLE_NAME = 'artists' then
      new.is_master := old.is_master;
    elsif TG_TABLE_NAME = 'profiles' then
      new.is_admin := old.is_admin;
    elsif TG_TABLE_NAME = 'user_profiles' then
      new.is_admin := old.is_admin;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_privilege_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_engagement_scores"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks SET
    engagement_score = COALESCE(stream_count,0)*1 + COALESCE(like_count,0)*3 + COALESCE(save_count,0)*4
      + COALESCE(favorite_count,0)*5 + COALESCE(playlist_add_count,0)*6 + COALESCE(download_count,0)*2,
    last_score_update = now()
  WHERE is_published = true;
  WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY engagement_score DESC) as rank FROM tracks WHERE is_published = true AND engagement_score > 0)
  UPDATE tracks SET trending_rank = ranked.rank FROM ranked WHERE tracks.id = ranked.id;
  UPDATE tracks SET trending_rank = NULL WHERE is_published = false OR engagement_score = 0 OR engagement_score IS NULL;
END; $$;


ALTER FUNCTION "public"."recalculate_engagement_scores"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_verification_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  update school_sessions_verification_codes
  set is_used = true, used_at = now()
  where code = upper(trim(p_code)) and is_used = false
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."redeem_verification_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_engagement_scores"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks t
  SET
    engagement_score = calc_engagement_score(t.id),
    completion_rate  = (
      SELECT COALESCE(ROUND(100.0 * SUM(CASE WHEN completed THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0)
      FROM streams WHERE track_id = t.id
    )
  WHERE is_published = true;
END;
$$;


ALTER FUNCTION "public"."refresh_engagement_scores"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_global_analytics"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN REFRESH MATERIALIZED VIEW global_sample_analytics; END; $$;


ALTER FUNCTION "public"."refresh_global_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_newly_explicit_from_retail"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if coalesce(new.is_explicit, false) and not coalesce(old.is_explicit, false) then
    delete from retail_playlist_tracks where track_id = new.id;
    delete from retail_catalog where track_id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."remove_newly_explicit_from_retail"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_credit_redemption"("p_reward_key" "text", "p_reward_label" "text", "p_cost" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_affiliate record;
  v_redemption_id uuid;
begin
  select * into v_affiliate from affiliates where user_id = auth.uid();
  if v_affiliate is null then
    raise exception 'Not an affiliate';
  end if;
  if coalesce(v_affiliate.credits_balance, 0) < p_cost then
    raise exception 'Not enough credits';
  end if;

  update affiliates set credits_balance = credits_balance - p_cost where id = v_affiliate.id;

  insert into affiliate_credit_redemptions (affiliate_id, user_id, reward_key, reward_label, cost)
  values (v_affiliate.id, auth.uid(), p_reward_key, p_reward_label, p_cost)
  returning id into v_redemption_id;

  return v_redemption_id;
end;
$$;


ALTER FUNCTION "public"."request_credit_redemption"("p_reward_key" "text", "p_reward_label" "text", "p_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retail_play_to_stream"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_venue_user uuid;
begin
  -- Only qualifying plays count, same 30-second threshold used for payouts.
  if coalesce(new.duration_played, 0) < 30 then
    return new;
  end if;

  -- Attribute to the venue's own account. log_stream() rejects self-streams,
  -- so a venue owner who is also the artist won't inflate their own numbers.
  select user_id into v_venue_user from retail_venues where id = new.venue_id;

  perform log_stream(
    p_track_id        => new.track_id,
    p_user_id         => v_venue_user,
    p_duration_played => new.duration_played,
    p_completed       => true,
    p_platform        => 'retail',
    p_device_type     => 'venue',
    p_source          => 'retail'
  );

  return new;
exception when others then
  -- A failure here must never block the retail play log itself, since that
  -- is the record payouts are calculated from.
  return new;
end;
$$;


ALTER FUNCTION "public"."retail_play_to_stream"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text") RETURNS TABLE("post_id" "uuid", "post_slug" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_authorized boolean;
  v_post_id uuid;
  v_slug text;
begin
  v_authorized := exists (select 1 from admins where user_id = auth.uid())
    or exists (select 1 from newsletter_editors where user_id = auth.uid());
  if not v_authorized then
    raise exception 'Unauthorized';
  end if;

  if p_audience not in ('main_app', 'retail') then
    raise exception 'Invalid audience';
  end if;

  v_slug := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(gen_random_uuid()::text, 1, 6);

  insert into newsletter_posts (slug, title, excerpt, body, audience, sent_by)
  values (v_slug, p_title, p_excerpt, p_body, p_audience, auth.uid())
  returning id into v_post_id;

  if p_audience = 'retail' then
    insert into retail_notifications (title, body, sent_by, newsletter_post_id)
    values (p_title, p_excerpt, auth.uid(), v_post_id);
  else
    insert into notifications (artist_id, user_id, type, title, message, metadata)
    select a.id, a.user_id, 'announcement', p_title, p_excerpt,
      jsonb_build_object('link_url', '/newsletter/' || v_slug, 'link_label', 'Read more')
    from artists a
    where a.user_id is not null;
  end if;

  return query select v_post_id, v_slug;
end;
$$;


ALTER FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text", "p_youtube_url" "text" DEFAULT NULL::"text") RETURNS TABLE("post_id" "uuid", "post_slug" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_authorized boolean;
  v_post_id uuid;
  v_slug text;
begin
  v_authorized := exists (select 1 from admins where user_id = auth.uid())
    or exists (select 1 from newsletter_editors where user_id = auth.uid());
  if not v_authorized then
    raise exception 'Unauthorized';
  end if;

  if p_audience not in ('main_app', 'retail') then
    raise exception 'Invalid audience';
  end if;

  v_slug := lower(regexp_replace(p_title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(gen_random_uuid()::text, 1, 6);

  insert into newsletter_posts (slug, title, excerpt, body, audience, sent_by, youtube_url)
  values (v_slug, p_title, p_excerpt, p_body, p_audience, auth.uid(), nullif(p_youtube_url, ''))
  returning id into v_post_id;

  if p_audience = 'retail' then
    insert into retail_notifications (title, body, sent_by, newsletter_post_id)
    values (p_title, p_excerpt, auth.uid(), v_post_id);
  else
    insert into notifications (artist_id, user_id, type, title, message, metadata)
    select a.id, a.user_id, 'announcement', p_title, p_excerpt,
      jsonb_build_object('link_url', '/newsletter/' || v_slug, 'link_label', 'Read more')
    from artists a
    where a.user_id is not null;
  end if;

  return query select v_post_id, v_slug;
end;
$$;


ALTER FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text", "p_youtube_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."streams_set_artist_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  SELECT artist_id INTO NEW.artist_id FROM tracks WHERE id = NEW.track_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."streams_set_artist_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_artist_follower_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE artists SET follower_count = follower_count + 1 WHERE id = NEW.artist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE artists SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.artist_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_artist_follower_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_artist_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE artists SET tier = (
    SELECT pt.slug FROM artist_tier_subscriptions ats
    JOIN platform_tiers pt ON pt.id = ats.tier_id
    WHERE ats.artist_id = NEW.artist_id AND ats.status = 'active'
    ORDER BY pt.sort_order DESC LIMIT 1
  ) WHERE id = NEW.artist_id;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."sync_artist_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_artist_total_streams"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE v_artist_id uuid;
BEGIN
  SELECT artist_id INTO v_artist_id FROM tracks WHERE id = COALESCE(NEW.track_id, OLD.track_id);
  IF v_artist_id IS NOT NULL THEN
    UPDATE artists SET total_streams = (
      SELECT COUNT(*) FROM streams s
      JOIN tracks t ON t.id = s.track_id
      WHERE t.artist_id = v_artist_id
    ) WHERE id = v_artist_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_artist_total_streams"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_artist_track_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if (TG_OP = 'INSERT') then
    update artists set track_count = track_count + 1 where id = NEW.artist_id;
    return NEW;
  elsif (TG_OP = 'DELETE') then
    update artists set track_count = greatest(track_count - 1, 0) where id = OLD.artist_id;
    return OLD;
  elsif (TG_OP = 'UPDATE' and NEW.artist_id is distinct from OLD.artist_id) then
    update artists set track_count = greatest(track_count - 1, 0) where id = OLD.artist_id;
    update artists set track_count = track_count + 1 where id = NEW.artist_id;
    return NEW;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."sync_artist_track_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_download_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE tracks
  SET download_count = (SELECT COUNT(*) FROM downloads WHERE track_id = NEW.track_id)
  WHERE id = NEW.track_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_download_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_follow_to_contacts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO artist_contacts (artist_id, user_id, source) VALUES (NEW.artist_id, NEW.follower_id, 'follow') ON CONFLICT (artist_id, user_id) DO NOTHING;
  INSERT INTO global_contacts (user_id, total_follows, last_active) VALUES (NEW.follower_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE SET total_follows = global_contacts.total_follows + 1, last_active = now();
  UPDATE artists SET follower_count = follower_count + 1 WHERE id = NEW.artist_id;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."sync_follow_to_contacts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_follower_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE artists
    SET follower_count = (
      SELECT COUNT(*) FROM follows WHERE artist_id = NEW.artist_id
    )
    WHERE id = NEW.artist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE artists
    SET follower_count = (
      SELECT COUNT(*) FROM follows WHERE artist_id = OLD.artist_id
    )
    WHERE id = OLD.artist_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_follower_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE artist_posts
  SET comment_count = (SELECT COUNT(*) FROM artist_post_comments WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_post_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE artist_posts
  SET like_count = (SELECT COUNT(*) FROM artist_post_likes WHERE post_id = COALESCE(NEW.post_id, OLD.post_id))
  WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_post_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_play"("p_sample_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_genre TEXT; v_mood TEXT; v_bpm INTEGER; v_key TEXT;
BEGIN
  SELECT genre, mood, bpm, key INTO v_genre, v_mood, v_bpm, v_key FROM samples WHERE id = p_sample_id;
  INSERT INTO sample_interactions (sample_id, user_id, interaction_type, genre, mood, bpm, key, created_at)
  VALUES (p_sample_id, p_user_id, 'play', v_genre, v_mood, v_bpm, v_key, NOW());
  UPDATE samples SET plays = COALESCE(plays, 0) + 1 WHERE id = p_sample_id;
END; $$;


ALTER FUNCTION "public"."track_play"("p_sample_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_engagement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE tracks
  SET engagement_score = calc_engagement_score(NEW.track_id)
  WHERE id = NEW.track_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_engagement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_engagement_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := COALESCE(NEW.track_id, OLD.track_id);
  UPDATE tracks SET engagement_score = calc_engagement_score(v_tid) WHERE id = v_tid;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trigger_update_engagement_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_collaborations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_collaborations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_seen"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE artists SET last_seen_at = NOW()
  WHERE user_id = p_user_id;

  UPDATE listeners SET last_seen_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."update_last_seen"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_track_favorite_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE tracks SET favorite_count = favorite_count + 1 WHERE id = NEW.track_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE tracks SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = OLD.track_id; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."update_track_favorite_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_track_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE tracks SET like_count = like_count + 1 WHERE id = NEW.track_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE tracks SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.track_id; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."update_track_like_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_track_save_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE tracks SET save_count = save_count + 1 WHERE id = NEW.track_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE tracks SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.track_id; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."update_track_save_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_listening_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO user_listening_stats (user_id, total_plays, total_downloads)
    VALUES (NEW.user_id, CASE WHEN NEW.interaction_type = 'play' THEN 1 ELSE 0 END, CASE WHEN NEW.interaction_type = 'download' THEN 1 ELSE 0 END)
    ON CONFLICT (user_id) DO UPDATE SET
      total_plays = user_listening_stats.total_plays + CASE WHEN NEW.interaction_type = 'play' THEN 1 ELSE 0 END,
      total_downloads = user_listening_stats.total_downloads + CASE WHEN NEW.interaction_type = 'download' THEN 1 ELSE 0 END,
      last_active = NOW(), updated_at = NOW();
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."update_user_listening_stats"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "level" integer DEFAULT 1
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "artist_id" "uuid",
    "track_id" "uuid",
    "credits_reward" integer DEFAULT 50,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "total_clicks" integer DEFAULT 0 NOT NULL,
    "total_conversions" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "affiliate_campaigns_target_type_check" CHECK (("target_type" = ANY (ARRAY['all'::"text", 'artists'::"text", 'listeners'::"text", 'beatmakers'::"text"])))
);


ALTER TABLE "public"."affiliate_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "ref_code" "text" NOT NULL,
    "page" "text",
    "ip_hash" "text",
    "user_agent" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "converted_at" timestamp with time zone,
    "conversion_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."affiliate_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "click_id" "uuid",
    "type" "text" NOT NULL,
    "track_id" "uuid",
    "referred_user_id" "uuid",
    "sale_amount_zar" numeric(10,2) DEFAULT 0,
    "sale_amount_usd" numeric(10,2) DEFAULT 0,
    "service_fee_zar" numeric(10,2) DEFAULT 0,
    "service_fee_usd" numeric(10,2) DEFAULT 0,
    "commission_zar" numeric(10,2) DEFAULT 0,
    "commission_usd" numeric(10,2) DEFAULT 0,
    "credits_earned" integer DEFAULT 0,
    "renewal_number" integer DEFAULT 1,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "currency" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "affiliate_conversions_currency_check" CHECK (("currency" = ANY (ARRAY['ZAR'::"text", 'USD'::"text"]))),
    CONSTRAINT "affiliate_conversions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'paid'::"text", 'rejected'::"text"]))),
    CONSTRAINT "affiliate_conversions_type_check" CHECK (("type" = ANY (ARRAY['signup'::"text", 'beat_purchase'::"text", 'subscription'::"text"])))
);


ALTER TABLE "public"."affiliate_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_credit_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reward_key" "text" NOT NULL,
    "reward_label" "text" NOT NULL,
    "cost" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fulfilled_at" timestamp with time zone,
    "fulfilled_by" "uuid",
    CONSTRAINT "affiliate_credit_redemptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'fulfilled'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."affiliate_credit_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "amount_zar" numeric(10,2) DEFAULT 0 NOT NULL,
    "amount_usd" numeric(10,2) DEFAULT 0 NOT NULL,
    "method" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "payout_ref" "text",
    "admin_note" "text",
    "requested_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    CONSTRAINT "affiliate_payouts_method_check" CHECK (("method" = ANY (ARRAY['payfast'::"text", 'paypal'::"text", 'bank'::"text"]))),
    CONSTRAINT "affiliate_payouts_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'processing'::"text", 'paid'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."affiliate_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid",
    "ref_code" "text" NOT NULL,
    "role" "text" DEFAULT 'artist'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_eligible" boolean DEFAULT false NOT NULL,
    "eligibility_met_at" timestamp with time zone,
    "total_earned_zar" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_earned_usd" numeric(10,2) DEFAULT 0 NOT NULL,
    "pending_zar" numeric(10,2) DEFAULT 0 NOT NULL,
    "pending_usd" numeric(10,2) DEFAULT 0 NOT NULL,
    "paid_out_zar" numeric(10,2) DEFAULT 0 NOT NULL,
    "credits_balance" integer DEFAULT 0 NOT NULL,
    "credits_lifetime" integer DEFAULT 0 NOT NULL,
    "total_clicks" integer DEFAULT 0 NOT NULL,
    "total_signups" integer DEFAULT 0 NOT NULL,
    "total_conversions" integer DEFAULT 0 NOT NULL,
    "payout_method" "text",
    "payout_email" "text",
    "payout_bank_name" "text",
    "payout_account" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "affiliates_role_check" CHECK (("role" = ANY (ARRAY['artist'::"text", 'beatmaker'::"text", 'listener'::"text", 'venue'::"text"]))),
    CONSTRAINT "affiliates_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."affiliates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."albums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "cover_artwork_url" "text",
    "release_date" "date",
    "release_type" "text" DEFAULT 'album'::"text",
    "is_published" boolean DEFAULT false,
    "price" numeric DEFAULT 0.00,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "featured" boolean DEFAULT false,
    "pay_what_you_want" boolean DEFAULT false NOT NULL,
    "minimum_price" numeric(10,2) DEFAULT NULL::numeric,
    CONSTRAINT "albums_release_type_check" CHECK (("release_type" = ANY (ARRAY['single'::"text", 'ep'::"text", 'album'::"text", 'mixtape'::"text", 'live'::"text", 'compilation'::"text"])))
);


ALTER TABLE "public"."albums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."artist_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_behavior_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "upload_frequency" numeric(5,2),
    "upload_consistency" "text",
    "days_since_upload" integer,
    "stream_velocity" numeric(8,2),
    "collab_activity" "text",
    "uses_live_sessions" boolean DEFAULT false,
    "competition_entries" integer DEFAULT 0,
    "follower_growth_7d" integer DEFAULT 0,
    "follower_growth_30d" integer DEFAULT 0,
    "streams_7d" integer DEFAULT 0,
    "streams_30d" integer DEFAULT 0,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "behavior_summary" "text",
    "computed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."artist_behavior_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "name" "text",
    "source" "text" DEFAULT 'follow'::"text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "opted_in" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."artist_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_guestbook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "pinned" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."artist_guestbook" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_payment_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "paypal_email" "text",
    "paypal_merchant_id" "text",
    "payment_verified" boolean DEFAULT false,
    "payout_threshold" numeric(10,2) DEFAULT 5.00,
    "payout_currency" "text" DEFAULT 'USD'::"text",
    "total_earned" numeric(10,2) DEFAULT 0,
    "total_paid_out" numeric(10,2) DEFAULT 0,
    "pending_balance" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payshap_number" "text"
);


ALTER TABLE "public"."artist_payment_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_pinned" boolean DEFAULT false,
    CONSTRAINT "artist_post_comments_content_check" CHECK ((("char_length"("content") > 0) AND ("char_length"("content") <= 500)))
);


ALTER TABLE "public"."artist_post_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_post_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."artist_post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "tagged_artist_ids" "uuid"[],
    "youtube_id" "text",
    "track_id" "uuid",
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."artist_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "media_url" "text" NOT NULL,
    "media_type" "text" NOT NULL,
    "caption" "text",
    "duration_sec" integer,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tagged_track_id" "uuid",
    "like_count" integer DEFAULT 0,
    CONSTRAINT "artist_stories_media_type_check" CHECK (("media_type" = ANY (ARRAY['audio'::"text", 'video'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."artist_stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "primary_color" "text" DEFAULT '#FFFFFF'::"text",
    "secondary_color" "text" DEFAULT '#8B5CF6'::"text",
    "accent_color" "text" DEFAULT '#3B82F6'::"text",
    "background_color" "text" DEFAULT '#000000'::"text",
    "text_color" "text" DEFAULT '#FFFFFF'::"text",
    "heading_font" "text" DEFAULT 'Inter'::"text",
    "body_font" "text" DEFAULT 'Inter'::"text",
    "banner_image_url" "text",
    "background_image_url" "text",
    "theme_preset" "text" DEFAULT 'default'::"text",
    "custom_css" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."artist_themes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_thoughts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "post_date" "date" DEFAULT CURRENT_DATE,
    CONSTRAINT "artist_thoughts_content_check" CHECK (("char_length"("content") <= 280))
);


ALTER TABLE "public"."artist_thoughts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_tier_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "tier_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "payment_method" "text" DEFAULT 'paypal'::"text",
    "paypal_subscription_id" "text",
    "paypal_payer_id" "text",
    "amount_paid" numeric(10,2) DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "auto_renew" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "billing_cycle" "text" DEFAULT 'annual'::"text",
    "payment_provider" "text" DEFAULT 'paypal_web'::"text",
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    CONSTRAINT "artist_tier_subscriptions_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text", 'iap_ios'::"text", 'iap_android'::"text"]))),
    CONSTRAINT "artist_tier_subscriptions_payment_provider_check" CHECK (("payment_provider" = ANY (ARRAY['paypal_web'::"text", 'iap_ios'::"text", 'iap_android'::"text", 'admin_grant'::"text"])))
);


ALTER TABLE "public"."artist_tier_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artist_voice_memos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "title" "text",
    "audio_url" "text" NOT NULL,
    "duration" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."artist_voice_memos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "artist_name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "bio" "text",
    "profile_image_url" "text",
    "banner_image_url" "text",
    "is_master" boolean DEFAULT false,
    "is_verified" boolean DEFAULT false,
    "is_approved" boolean DEFAULT true,
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_tier_id" "uuid",
    "track_count" integer DEFAULT 0,
    "follower_count" integer DEFAULT 0,
    "total_streams" integer DEFAULT 0,
    "tier" "text" DEFAULT 'free'::"text",
    "is_suspended" boolean DEFAULT false,
    "suspension_reason" "text",
    "suspended_at" timestamp with time zone,
    "suspended_by" "uuid",
    "genre" "text",
    "mood" "text",
    "paypal_email" "text",
    "last_seen_at" timestamp with time zone,
    "onboarding_step" integer DEFAULT 0,
    "engagement_segment" "text" DEFAULT 'new'::"text",
    "printful_store_id" "text",
    "printful_access_token" "text",
    "merch_enabled" boolean DEFAULT false,
    "role" "text" DEFAULT 'artist'::"text",
    "genre_preferences" "text"[],
    "is_published" boolean DEFAULT false,
    "paypal_merchant_id" "text",
    "tier_expires_at" timestamp with time zone,
    "tier_started_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "paypal_subscription_id" "text",
    "role_confirmed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "artists_engagement_segment_check" CHECK (("engagement_segment" = ANY (ARRAY['new'::"text", 'active'::"text", 'dormant'::"text", 'churned'::"text"]))),
    CONSTRAINT "artists_role_check" CHECK (("role" = ANY (ARRAY['artist'::"text", 'beatmaker'::"text", 'listener'::"text"]))),
    CONSTRAINT "artists_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'pro'::"text", 'premium'::"text"])))
);


ALTER TABLE "public"."artists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."beat_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "buyer_user_id" "uuid" NOT NULL,
    "licence_type" "text" NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "paypal_order_id" "text",
    "paypal_capture_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "beat_purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."beat_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bug_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "challenge_id" "text" NOT NULL,
    "challenge_tier" "text" NOT NULL,
    "challenge_points" integer NOT NULL,
    "challenge_prompt" "text" NOT NULL,
    "track_id" "uuid",
    "completed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "challenge_completions_challenge_tier_check" CHECK (("challenge_tier" = ANY (ARRAY['Common'::"text", 'Rare'::"text", 'Epic'::"text", 'Legendary'::"text"])))
);


ALTER TABLE "public"."challenge_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_xp" (
    "user_id" "uuid" NOT NULL,
    "total_xp" integer DEFAULT 0,
    "common_count" integer DEFAULT 0,
    "rare_count" integer DEFAULT 0,
    "epic_count" integer DEFAULT 0,
    "legendary_count" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "challenge_id" "text",
    "last_challenge" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "artist_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."challenge_xp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "is_deleted" boolean DEFAULT false,
    "deleted_by" "uuid",
    "deleted_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reply_to_id" "uuid",
    "reply_to_content" "text",
    "reply_to_name" "text",
    "is_pinned" boolean DEFAULT false
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_room_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "is_muted" boolean DEFAULT false,
    "muted_until" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "is_subscribers_only" boolean DEFAULT false,
    "max_members" integer DEFAULT 500,
    "member_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "room_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "accent_color" "text",
    "is_pinned" boolean DEFAULT false,
    "is_subscriber_only" boolean DEFAULT false,
    CONSTRAINT "chat_rooms_room_type_check" CHECK (("room_type" = ANY (ARRAY['standard'::"text", 'competition'::"text"])))
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_word_filters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "word" "text" NOT NULL,
    "severity" "text" DEFAULT 'block'::"text",
    "is_regex" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_word_filters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collab_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "collab_messages_content_check" CHECK (("char_length"("content") <= 500))
);


ALTER TABLE "public"."collab_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collab_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collaboration_id" "uuid",
    "from_artist_id" "uuid" NOT NULL,
    "to_artist_id" "uuid" NOT NULL,
    "track_id" "uuid",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "read" boolean DEFAULT false,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "collab_type" "text" DEFAULT 'featured'::"text",
    CONSTRAINT "collab_requests_collab_type_check" CHECK (("collab_type" = ANY (ARRAY['featured'::"text", 'beat'::"text", 'co-write'::"text", 'remix'::"text", 'mix'::"text", 'other'::"text"]))),
    CONSTRAINT "collab_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."collab_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collaborations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid",
    "artist_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'featured'::"text" NOT NULL,
    "split_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "album_id" "uuid",
    CONSTRAINT "collaborations_split_percent_check" CHECK ((("split_percent" >= (0)::numeric) AND ("split_percent" <= (100)::numeric))),
    CONSTRAINT "collaborations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);


ALTER TABLE "public"."collaborations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "track_id" "uuid",
    "audio_url" "text" NOT NULL,
    "cover_url" "text",
    "title" "text" NOT NULL,
    "note" "text",
    "vote_count" integer DEFAULT 0 NOT NULL,
    "is_winner" boolean DEFAULT false NOT NULL,
    "is_visible" boolean DEFAULT false NOT NULL,
    "disqualified" boolean DEFAULT false NOT NULL,
    "disqualified_reason" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."competition_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "paypal_email" "text",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "paypal_payout_batch_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "initiated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    CONSTRAINT "competition_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."competition_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_user_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "votes_cast" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."competition_user_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "voted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."competition_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "brief" "text",
    "genre" "text",
    "bpm" integer,
    "key" "text",
    "stem_pack_url" "text",
    "mp3_preview_url" "text",
    "prize_description" "text",
    "cash_prize_amount" numeric(10,2) DEFAULT 0,
    "cash_prize_currency" "text" DEFAULT 'ZAR'::"text",
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "entries_open_at" timestamp with time zone,
    "entries_close_at" timestamp with time zone,
    "voting_open_at" timestamp with time zone,
    "voting_close_at" timestamp with time zone,
    "winner_entry_id" "uuid",
    "winner_announced_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "wheel_challenge" boolean DEFAULT false,
    "max_votes_per_user" integer DEFAULT 3,
    "paid_collab" boolean DEFAULT false,
    "competition_type" "text" DEFAULT 'standard'::"text",
    "is_school_sessions" boolean DEFAULT false NOT NULL,
    "ep_prize_enabled" boolean DEFAULT false NOT NULL,
    "ep_prize_description" "text",
    "ep_prize_track_count" integer DEFAULT 3,
    "prize_breakdown_text" "text",
    CONSTRAINT "competitions_competition_type_check" CHECK (("competition_type" = ANY (ARRAY['standard'::"text", 'wheel'::"text", 'paid_collab'::"text"]))),
    CONSTRAINT "competitions_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'open'::"text", 'voting'::"text", 'closed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."competitions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."competitions"."is_school_sessions" IS 'True for the School Sessions competition row — lets generic competition UI (voting, wheel, etc.) ignore it if needed.';



COMMENT ON COLUMN "public"."competitions"."ep_prize_enabled" IS 'When true, the winning singer + beatmaker also get a joint EP released with the platform founder, as a bonus prize.';



COMMENT ON COLUMN "public"."competitions"."ep_prize_description" IS 'Free-text description of the EP prize shown on the landing page / flyer copy, e.g. "3-song joint EP with Steve C-SA, released on Feelz Machine".';



COMMENT ON COLUMN "public"."competitions"."prize_breakdown_text" IS 'Plain-language breakdown shown as subtext under the big "R20,000 CASH" headline, e.g. "R7,000 Best School + R7,000 Best Singer + R6,000 Best Beatmaker".';



CREATE TABLE IF NOT EXISTS "public"."credits_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "affiliate_id" "uuid",
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "description" "text",
    "ref_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "credits_transactions_type_check" CHECK (("type" = ANY (ARRAY['earned'::"text", 'redeemed'::"text", 'expired'::"text", 'bonus'::"text"])))
);


ALTER TABLE "public"."credits_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_artist_spotlight" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "spotlight_date" "date" DEFAULT CURRENT_DATE NOT NULL
);


ALTER TABLE "public"."daily_artist_spotlight" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."downloads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "download_type" "text" DEFAULT 'free'::"text",
    "amount_paid" numeric DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "downloads_download_type_check" CHECK (("download_type" = ANY (ARRAY['free'::"text", 'paid'::"text", 'subscriber'::"text"])))
);


ALTER TABLE "public"."downloads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_subscribers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "name" "text",
    "subscribed" boolean DEFAULT true,
    "subscribed_at" timestamp with time zone DEFAULT "now"(),
    "unsubscribed_at" timestamp with time zone,
    "source" "text" DEFAULT 'download'::"text"
);


ALTER TABLE "public"."email_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engagement_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engagement_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engagement_learning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "segment" "text" NOT NULL,
    "tag_combo" "text" NOT NULL,
    "total_sends" integer DEFAULT 0,
    "total_conversions" integer DEFAULT 0,
    "conversion_rate" numeric(5,4) DEFAULT 0,
    "avg_session_quality" numeric(5,2) DEFAULT 0,
    "best_signals" "text"[] DEFAULT '{}'::"text"[],
    "worst_signals" "text"[] DEFAULT '{}'::"text"[],
    "best_hour_to_send" smallint,
    "top_converting_titles" "text"[] DEFAULT '{}'::"text"[],
    "recent_sends" integer DEFAULT 0,
    "recent_conversions" integer DEFAULT 0,
    "recent_conversion_rate" numeric(5,4) DEFAULT 0,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engagement_learning" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engagement_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid",
    "segment" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "clicked" boolean DEFAULT false,
    "signals_used" "text"[] DEFAULT '{}'::"text"[],
    "notification_id" "uuid"
);


ALTER TABLE "public"."engagement_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engagement_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_id" "uuid",
    "sent_at" timestamp with time zone NOT NULL,
    "segment" "text" NOT NULL,
    "tags_at_send" "text"[] DEFAULT '{}'::"text"[],
    "signals_used" "text"[] DEFAULT '{}'::"text"[],
    "converted" boolean DEFAULT false,
    "converted_at" timestamp with time zone,
    "session_streams" integer DEFAULT 0,
    "session_quality" "text",
    "days_dormant_at_send" integer DEFAULT 0,
    "is_baseline_active" boolean DEFAULT false,
    "scored" boolean DEFAULT false,
    "scored_at" timestamp with time zone
);


ALTER TABLE "public"."engagement_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_plays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'plugin_gallery'::"text" NOT NULL,
    "ip_hash" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_plays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fraud_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "flag_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'low'::"text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "resolution_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fraud_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."global_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text",
    "name" "text",
    "total_follows" integer DEFAULT 0,
    "total_purchases" integer DEFAULT 0,
    "total_streams" integer DEFAULT 0,
    "first_seen" timestamp with time zone DEFAULT "now"(),
    "last_active" timestamp with time zone DEFAULT "now"(),
    "opted_in" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."global_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_hero" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "eyebrow" "text",
    "title" "text" NOT NULL,
    "subtitle" "text",
    "image_url" "text",
    "cta_label" "text",
    "cta_path" "text",
    "accent" "text" DEFAULT 'lime'::"text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_hero" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listener_behavior_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "peak_hour" smallint,
    "peak_day" smallint,
    "session_type" "text",
    "skip_rate" numeric(5,2),
    "repeat_rate" numeric(5,2),
    "like_rate" numeric(5,4),
    "download_rate" numeric(5,4),
    "genre_loyalty" numeric(5,2),
    "artist_loyalty" numeric(5,2),
    "top_genres" "text"[],
    "top_moods" "text"[],
    "followed_artists" "text"[],
    "total_streams_30d" integer DEFAULT 0,
    "total_streams_7d" integer DEFAULT 0,
    "total_downloads" integer DEFAULT 0,
    "total_likes" integer DEFAULT 0,
    "total_follows" integer DEFAULT 0,
    "days_since_last" integer,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "behavior_summary" "text",
    "computed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."listener_behavior_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listener_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "artist_id" "uuid",
    "signal" "text" NOT NULL,
    "listen_pct" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "listener_feedback_signal_check" CHECK (("signal" = ANY (ARRAY['skip'::"text", 'deep_listen'::"text", 'not_interested'::"text"])))
);


ALTER TABLE "public"."listener_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."streams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "duration_played" integer DEFAULT 0,
    "completed" boolean DEFAULT false,
    "country" "text",
    "city" "text",
    "device_type" "text",
    "platform" "text" DEFAULT 'web'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ip_hash" "text",
    "fingerprint" "text",
    "is_first_listener" boolean DEFAULT false,
    "source" "text",
    "artist_id" "uuid"
);


ALTER TABLE "public"."streams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "album_id" "uuid",
    "artist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "duration" integer,
    "file_url" "text",
    "cover_artwork_url" "text",
    "track_number" integer DEFAULT 1,
    "lyrics" "text",
    "genre" "text",
    "mood" "text",
    "is_explicit" boolean DEFAULT false,
    "is_downloadable" boolean DEFAULT true,
    "is_published" boolean DEFAULT false,
    "is_premium" boolean DEFAULT false,
    "download_price" numeric DEFAULT 0.00,
    "currency" "text" DEFAULT 'USD'::"text",
    "has_versions" boolean DEFAULT false,
    "stream_count" integer DEFAULT 0,
    "download_count" integer DEFAULT 0,
    "likes_count" integer DEFAULT 0,
    "featured" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "engagement_score" numeric(12,2) DEFAULT 0,
    "trending_rank" integer,
    "last_score_update" timestamp with time zone,
    "save_count" integer DEFAULT 0,
    "favorite_count" integer DEFAULT 0,
    "playlist_add_count" integer DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "pay_what_you_want" boolean DEFAULT false NOT NULL,
    "pwyw_minimum_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "minimum_price" numeric(10,2) DEFAULT NULL::numeric,
    "is_preorder" boolean DEFAULT false NOT NULL,
    "release_date" timestamp with time zone,
    "youtube_url" "text",
    "is_early_access" boolean DEFAULT false NOT NULL,
    "early_access_until" timestamp with time zone,
    "is_beat" boolean DEFAULT false,
    "bpm" integer,
    "beat_key" "text",
    "beat_scale" "text",
    "beat_licence" "text",
    "completion_rate" numeric(5,2) DEFAULT 0,
    "service_fee_pct" numeric(5,2) DEFAULT 15.00,
    "velocity_score" numeric DEFAULT 0,
    "external_play_count" integer DEFAULT 0 NOT NULL,
    "ai_content" "text",
    "ai_content_admin_override" "text",
    CONSTRAINT "require_artwork_to_publish" CHECK ((("is_published" = false) OR (("is_published" = true) AND ("cover_artwork_url" IS NOT NULL) AND ("cover_artwork_url" <> ''::"text")))),
    CONSTRAINT "tracks_ai_content_admin_override_check" CHECK (("ai_content_admin_override" = ANY (ARRAY['human'::"text", 'ai_assisted'::"text", 'ai_generated'::"text"]))),
    CONSTRAINT "tracks_ai_content_check" CHECK (("ai_content" = ANY (ARRAY['human'::"text", 'ai_assisted'::"text", 'ai_generated'::"text"])))
);


ALTER TABLE "public"."tracks" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."listener_monthly_stats" WITH ("security_invoker"='true') AS
 SELECT "s"."user_id",
    ("date_trunc"('month'::"text", "s"."created_at"))::"date" AS "month",
    "count"(*) AS "total_streams",
    "count"(DISTINCT "s"."track_id") AS "unique_tracks",
    "count"(DISTINCT "t"."artist_id") AS "unique_artists",
    "sum"("s"."duration_played") AS "total_seconds",
    "mode"() WITHIN GROUP (ORDER BY "t"."artist_id") AS "top_artist_id"
   FROM ("public"."streams" "s"
     JOIN "public"."tracks" "t" ON (("t"."id" = "s"."track_id")))
  WHERE ("s"."user_id" IS NOT NULL)
  GROUP BY "s"."user_id", (("date_trunc"('month'::"text", "s"."created_at"))::"date");


ALTER VIEW "public"."listener_monthly_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listener_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "score" numeric DEFAULT 0 NOT NULL,
    "reason" "text" DEFAULT 'recommended'::"text" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"(),
    "position" integer DEFAULT 0
);


ALTER TABLE "public"."listener_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listener_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "theme_slug" "text" DEFAULT 'default'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."listener_themes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listener_tier_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "tier_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "paypal_subscription_id" "text",
    "billing_cycle" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."listener_tier_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listeners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_seen_at" timestamp with time zone,
    "engagement_segment" "text" DEFAULT 'new'::"text",
    "top_supporter_rank" integer,
    "top_supporter_month" "text",
    "avatar_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tier" "text" DEFAULT 'free'::"text",
    "tier_expires_at" timestamp with time zone,
    "tier_started_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "paypal_subscription_id" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "listeners_engagement_segment_check" CHECK (("engagement_segment" = ANY (ARRAY['new'::"text", 'active'::"text", 'dormant'::"text", 'churned'::"text"])))
);


ALTER TABLE "public"."listeners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listening_session_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "played_at" timestamp with time zone
);


ALTER TABLE "public"."listening_session_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listening_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "mode" "text" DEFAULT 'audio'::"text" NOT NULL,
    "youtube_url" "text",
    "status" "text" DEFAULT 'live'::"text" NOT NULL,
    "current_track_id" "uuid",
    "playback_pos" numeric DEFAULT 0 NOT NULL,
    "is_playing" boolean DEFAULT false NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "listener_count" integer DEFAULT 0 NOT NULL,
    "scheduled_at" timestamp with time zone
);


ALTER TABLE "public"."listening_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_wrapped_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year_month" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "payload" "jsonb"
);


ALTER TABLE "public"."monthly_wrapped_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_editors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "editor_name" "text",
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."newsletter_editors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "excerpt" "text" NOT NULL,
    "body" "text" NOT NULL,
    "audience" "text" NOT NULL,
    "sent_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "youtube_url" "text",
    CONSTRAINT "newsletter_posts_audience_check" CHECK (("audience" = ANY (ARRAY['main_app'::"text", 'retail'::"text"])))
);


ALTER TABLE "public"."newsletter_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "read" boolean DEFAULT false,
    "from_artist_id" "uuid",
    "track_id" "uuid",
    "collaboration_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "segment" "text",
    "message_type" "text",
    "admin_only" boolean DEFAULT false,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['collab_request'::"text", 'collab_accepted'::"text", 'collab_declined'::"text", 'new_follower'::"text", 'track_liked'::"text", 'track_commented'::"text", 'milestone_100'::"text", 'milestone_500'::"text", 'milestone_1k'::"text", 'milestone_10k'::"text", 'download'::"text", 'announcement'::"text", 'mention'::"text", 'new_post'::"text", 'tier_granted'::"text", 'new_track'::"text", 'tip'::"text", 'session_live'::"text", 'playlist_add'::"text", 'admin_message'::"text", 'competition_result'::"text", 'competition_winner'::"text", 'engagement'::"text", 'streak'::"text", 'weekly_report'::"text", 'monthly_wrapped'::"text", 'top_supporter'::"text", 'first_listener'::"text", 'new_stream'::"text", 'payout_pending'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "track_id" "uuid",
    "transaction_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "split_percentage" numeric(5,2),
    "paypal_payout_id" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    CONSTRAINT "payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'paid'::"text", 'failed'::"text", 'payout_failed'::"text", 'no_paypal_email'::"text"])))
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "price_yearly" numeric(10,2) DEFAULT 0,
    "price_monthly" numeric(10,2) DEFAULT 0,
    "max_singles" integer DEFAULT 2,
    "max_albums" integer DEFAULT 0,
    "can_upload_lyrics" boolean DEFAULT false,
    "can_customize_theme" boolean DEFAULT false,
    "can_create_chat_rooms" boolean DEFAULT false,
    "can_download_contacts" boolean DEFAULT false,
    "can_collaborate" boolean DEFAULT false,
    "can_sell_music" boolean DEFAULT false,
    "can_access_analytics" boolean DEFAULT false,
    "features" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playlist_collaborators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "playlist_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "can_edit" boolean DEFAULT false NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."playlist_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playlist_tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "playlist_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."playlist_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."playlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cover_url" "text",
    "is_public" boolean DEFAULT true,
    "is_collaborative" boolean DEFAULT false,
    "track_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_shared" boolean DEFAULT false NOT NULL,
    "share_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(12), 'hex'::"text"),
    "invite_token" "text"
);


ALTER TABLE "public"."playlists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'User'::"text" NOT NULL,
    "age" integer,
    "country" "text",
    "city" "text",
    "favorite_genres" "text"[],
    "production_experience" "text",
    "daw" "text",
    "profile_completed" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false,
    "email" "text",
    "avatar_url" "text",
    "genre_preferences" "text"[] DEFAULT '{}'::"text"[],
    "genre" "text",
    "mood" "text",
    "terms_accepted_at" timestamp with time zone,
    "age_confirmed" boolean DEFAULT false,
    "bio" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "onboarding_done" boolean DEFAULT false
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."popular_genres_by_country" AS
 SELECT "up"."country",
    "genre"."genre",
    "count"(*) AS "genre_count"
   FROM ("public"."user_profiles" "up"
     CROSS JOIN LATERAL "unnest"("up"."favorite_genres") "genre"("genre"))
  WHERE ("up"."country" IS NOT NULL)
  GROUP BY "up"."country", "genre"."genre"
  ORDER BY "up"."country", ("count"(*)) DESC
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."popular_genres_by_country" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "is_admin" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "track_id" "uuid",
    "album_id" "uuid",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text",
    "paypal_transaction_id" "text",
    "paypal_payer_email" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "purchased_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_ad_plays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ad_id" "uuid" NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "played_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_ad_plays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_ad_revenue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "note" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_ad_revenue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_name" "text",
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid",
    "advertiser_name" "text" NOT NULL,
    "audio_url" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_ads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_artist_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "play_count" integer NOT NULL,
    "share_pct" numeric(6,3) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_artist_payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "pitch_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_notification_reads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "newsletter_post_id" "uuid"
);


ALTER TABLE "public"."retail_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_payout_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "subscription_revenue" numeric(10,2) DEFAULT 0 NOT NULL,
    "ad_revenue" numeric(10,2) DEFAULT 0 NOT NULL,
    "artist_pool" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_qualifying_plays" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "calculated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retail_payout_periods_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'finalized'::"text"])))
);


ALTER TABLE "public"."retail_payout_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_pitches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "pitch_note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retail_pitches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."retail_pitches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_play_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "track_id" "uuid" NOT NULL,
    "playlist_id" "uuid",
    "played_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_played" integer
);


ALTER TABLE "public"."retail_play_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_playlist_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "mood" "text",
    "track_ids" "uuid"[] NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retail_playlist_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."retail_playlist_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_playlist_tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "playlist_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_playlist_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_playlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "mood" "text",
    "description" "text",
    "cover_image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_playlists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_price_guide" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_type" "text" NOT NULL,
    "suggested_fee_min" numeric(10,2),
    "suggested_fee_max" numeric(10,2),
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_price_guide" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "tier" "text" DEFAULT 'standard'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "monthly_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "paypal_subscription_id" "text",
    "paypal_plan_id" "text",
    "paypal_product_id" "text",
    "paypal_billed_usd" numeric(10,2),
    CONSTRAINT "retail_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."retail_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_venue_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_venue_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_venue_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "location_name" "text" NOT NULL,
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retail_venue_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retail_venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "business_name" "text" NOT NULL,
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ads_enabled" boolean DEFAULT true NOT NULL,
    "signup_token" "text",
    "signup_token_expires_at" timestamp with time zone,
    CONSTRAINT "retail_venues_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."retail_venues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_config" (
    "id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "competition_id" "uuid",
    "allowed_country_code" "text" DEFAULT 'ZA'::"text" NOT NULL,
    "require_school_allowlist" boolean DEFAULT true NOT NULL,
    "target_level" "text" DEFAULT 'high_school'::"text" NOT NULL,
    "season" integer DEFAULT 1 NOT NULL,
    "viral_course_url" "text",
    "platform_course_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "youtube_playlist_url" "text",
    "vip_candidate_cap" integer DEFAULT 50 NOT NULL,
    CONSTRAINT "school_sessions_config_singleton" CHECK (("id" = '00000000-0000-0000-0000-000000000001'::"uuid"))
);


ALTER TABLE "public"."school_sessions_config" OWNER TO "postgres";


COMMENT ON COLUMN "public"."school_sessions_config"."target_level" IS 'Who this season is open to — "high_school" for now; kept as text so future seasons can widen it without a migration.';



COMMENT ON COLUMN "public"."school_sessions_config"."season" IS 'Increment each time you re-run this competition (roughly every 6 months) so past seasons/entries stay attributable.';



COMMENT ON COLUMN "public"."school_sessions_config"."viral_course_url" IS '"How to make viral content" course, hosted on projectfeelz.com.';



COMMENT ON COLUMN "public"."school_sessions_config"."platform_course_url" IS '"How to use Feelz Machine" course, hosted on projectfeelz.com.';



CREATE TABLE IF NOT EXISTS "public"."school_sessions_district_nominations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "district_name" "text" NOT NULL,
    "school_name" "text",
    "submitted_by_name" "text",
    "submitted_by_email" "text",
    "notes" "text",
    "season_requested" integer DEFAULT 1 NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_district_nominations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_district_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nomination_id" "uuid" NOT NULL,
    "season_requested" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_district_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "school_name_freetext" "text",
    "candidate_card_no" "text",
    "entrant_full_name" "text" NOT NULL,
    "entrant_email" "text" NOT NULL,
    "entrant_tiktok_handle" "text" NOT NULL,
    "entrant_is_minor" boolean DEFAULT true NOT NULL,
    "is_finalist" boolean DEFAULT false NOT NULL,
    "is_winner_school" boolean DEFAULT false NOT NULL,
    "is_winner_singer" boolean DEFAULT false NOT NULL,
    "is_winner_beatmaker" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "song_id" "uuid",
    "is_group" boolean DEFAULT false NOT NULL,
    "is_winner" boolean DEFAULT false NOT NULL,
    "tiktok_video_url" "text",
    "tiktok_tagged_confirmed" boolean DEFAULT false NOT NULL,
    "instagram_followed_confirmed" boolean DEFAULT false NOT NULL,
    "youtube_subscribed_confirmed" boolean DEFAULT false NOT NULL,
    "needs_school_verification" boolean GENERATED ALWAYS AS (("school_id" IS NULL)) STORED,
    "verification_code_id" "uuid"
);


ALTER TABLE "public"."school_sessions_entries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."school_sessions_entries"."is_winner" IS 'Judges'' decision — set directly in admin, separate from is_finalist and from the public vote count. The public vote is a People''s Choice signal, not the primary decider.';



CREATE TABLE IF NOT EXISTS "public"."school_sessions_entry_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "member_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_entry_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_guardian_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "guardian_name" "text" NOT NULL,
    "guardian_contact" "text" NOT NULL,
    "relationship" "text",
    "consented" boolean DEFAULT false NOT NULL,
    "consented_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_guardian_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_judges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "judge_name" "text",
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_judges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "region" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_shortlist_songs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "reference_track_id" "uuid",
    "reference_url" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_shortlist_songs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."school_sessions_shortlist_songs"."reference_track_id" IS 'If the original is uploaded to Feelz Machine as a track, link it here so entrants can listen in-app.';



COMMENT ON COLUMN "public"."school_sessions_shortlist_songs"."reference_url" IS 'Fallback external link (e.g. a Suno share link) if the original isn''t uploaded as a track.';



CREATE TABLE IF NOT EXISTS "public"."school_sessions_verification_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "school_id" "uuid",
    "is_used" boolean DEFAULT false NOT NULL,
    "used_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_verification_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_vip_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "ref_code" "text",
    "issued_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_vip_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_sessions_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_sessions_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "name" "text",
    "avatar" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_tip" boolean DEFAULT false,
    "tip_amount" numeric
);


ALTER TABLE "public"."session_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "artist_id" "uuid",
    "poll_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "track_id" "uuid",
    "track_title" "text",
    "track_artist" "text",
    "question" "text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_priority_boosts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_priority_boosts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_review_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_priority" boolean DEFAULT false NOT NULL,
    "boosted_at" timestamp with time zone
);


ALTER TABLE "public"."session_review_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."story_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."story_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "tier_id" "uuid" NOT NULL,
    "paypal_subscription_id" "text",
    "status" "text" DEFAULT 'active'::"text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text", 'past_due'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."thought_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thought_id" "uuid",
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."thought_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."thought_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thought_id" "uuid",
    "user_id" "uuid",
    "emoji" "text" DEFAULT 'like'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."thought_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tip_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_usd" numeric(10,2) NOT NULL,
    "current_usd" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "achieved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tip_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "paypal_order_id" "text",
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payout_status" "text" DEFAULT 'pending'::"text",
    "payout_batch_id" "text",
    "payout_error" "text"
);


ALTER TABLE "public"."tips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_collaborations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid",
    "artist_id" "uuid",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_collaborations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_comment_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid",
    "user_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_comment_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "parent_comment_id" "uuid",
    CONSTRAINT "track_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 300)))
);


ALTER TABLE "public"."track_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_presaves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "track_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notified" boolean DEFAULT false
);


ALTER TABLE "public"."track_presaves" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_stems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_size" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_stems" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "version_name" "text" NOT NULL,
    "version_type" "text" DEFAULT 'remix'::"text",
    "file_url" "text" NOT NULL,
    "duration" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "track_versions_version_type_check" CHECK (("version_type" = ANY (ARRAY['original'::"text", 'radio_edit'::"text", 'acoustic'::"text", 'live'::"text", 'remix'::"text", 'instrumental'::"text", 'acapella'::"text", 'extended'::"text", 'clean'::"text"])))
);


ALTER TABLE "public"."track_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_bans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "banned_until" timestamp with time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_bans" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."user_demographics" AS
 SELECT "country",
    "production_experience",
    "count"(*) AS "user_count",
    "avg"("age") AS "avg_age",
    "count"(*) FILTER (WHERE ("production_experience" = 'beginner'::"text")) AS "beginners",
    "count"(*) FILTER (WHERE ("production_experience" = 'intermediate'::"text")) AS "intermediate_users",
    "count"(*) FILTER (WHERE ("production_experience" = 'advanced'::"text")) AS "advanced_users",
    "count"(*) FILTER (WHERE ("production_experience" = 'professional'::"text")) AS "professionals"
   FROM "public"."user_profiles"
  GROUP BY "country", "production_experience"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."user_demographics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "feedback_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text",
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "admin_reply" "text",
    "replied_at" timestamp with time zone,
    "content" "text",
    CONSTRAINT "user_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['feature'::"text", 'bug'::"text", 'other'::"text"]))),
    CONSTRAINT "user_feedback_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_streaks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "current_streak" integer DEFAULT 1 NOT NULL,
    "longest_streak" integer DEFAULT 1 NOT NULL,
    "last_active_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "discovery_streak" integer DEFAULT 0 NOT NULL,
    "longest_discovery_streak" integer DEFAULT 0 NOT NULL,
    "last_discovery_date" "date",
    "freeze_used_month" "text",
    "freeze_available" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_streaks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wheel_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "competition_id" "uuid",
    "is_current" boolean DEFAULT false NOT NULL,
    "spun_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wheel_challenges_mode_check" CHECK (("mode" = ANY (ARRAY['singer'::"text", 'beatmaker'::"text"])))
);


ALTER TABLE "public"."wheel_challenges" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."affiliate_campaigns"
    ADD CONSTRAINT "affiliate_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_credit_redemptions"
    ADD CONSTRAINT "affiliate_credit_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_ref_code_key" UNIQUE ("ref_code");



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_artist_id_slug_key" UNIQUE ("artist_id", "slug");



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_alerts"
    ADD CONSTRAINT "artist_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_alerts"
    ADD CONSTRAINT "artist_alerts_user_id_artist_id_key" UNIQUE ("user_id", "artist_id");



ALTER TABLE ONLY "public"."artist_behavior_profiles"
    ADD CONSTRAINT "artist_behavior_profiles_artist_id_key" UNIQUE ("artist_id");



ALTER TABLE ONLY "public"."artist_behavior_profiles"
    ADD CONSTRAINT "artist_behavior_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_contacts"
    ADD CONSTRAINT "artist_contacts_artist_id_user_id_key" UNIQUE ("artist_id", "user_id");



ALTER TABLE ONLY "public"."artist_contacts"
    ADD CONSTRAINT "artist_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_guestbook"
    ADD CONSTRAINT "artist_guestbook_artist_id_user_id_key" UNIQUE ("artist_id", "user_id");



ALTER TABLE ONLY "public"."artist_guestbook"
    ADD CONSTRAINT "artist_guestbook_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_payment_profiles"
    ADD CONSTRAINT "artist_payment_profiles_artist_id_key" UNIQUE ("artist_id");



ALTER TABLE ONLY "public"."artist_payment_profiles"
    ADD CONSTRAINT "artist_payment_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_post_comments"
    ADD CONSTRAINT "artist_post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_post_likes"
    ADD CONSTRAINT "artist_post_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_post_likes"
    ADD CONSTRAINT "artist_post_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."artist_posts"
    ADD CONSTRAINT "artist_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_stories"
    ADD CONSTRAINT "artist_stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_themes"
    ADD CONSTRAINT "artist_themes_artist_id_key" UNIQUE ("artist_id");



ALTER TABLE ONLY "public"."artist_themes"
    ADD CONSTRAINT "artist_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_thoughts"
    ADD CONSTRAINT "artist_thoughts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_tier_subscriptions"
    ADD CONSTRAINT "artist_tier_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artist_voice_memos"
    ADD CONSTRAINT "artist_voice_memos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_artist_name_key" UNIQUE ("artist_name");



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."beat_purchases"
    ADD CONSTRAINT "beat_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_completions"
    ADD CONSTRAINT "challenge_completions_challenge_id_user_id_key" UNIQUE ("challenge_id", "user_id");



ALTER TABLE ONLY "public"."challenge_completions"
    ADD CONSTRAINT "challenge_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_xp"
    ADD CONSTRAINT "challenge_xp_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_poll_id_user_id_key" UNIQUE ("poll_id", "user_id");



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_word_filters"
    ADD CONSTRAINT "chat_word_filters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_word_filters"
    ADD CONSTRAINT "chat_word_filters_word_key" UNIQUE ("word");



ALTER TABLE ONLY "public"."collab_messages"
    ADD CONSTRAINT "collab_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collab_requests"
    ADD CONSTRAINT "collab_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_track_id_artist_id_key" UNIQUE ("track_id", "artist_id");



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "competition_entries_competition_id_artist_id_key" UNIQUE ("competition_id", "artist_id");



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_payouts"
    ADD CONSTRAINT "competition_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_user_votes"
    ADD CONSTRAINT "competition_user_votes_competition_id_user_id_key" UNIQUE ("competition_id", "user_id");



ALTER TABLE ONLY "public"."competition_user_votes"
    ADD CONSTRAINT "competition_user_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_votes"
    ADD CONSTRAINT "competition_votes_competition_id_entry_id_user_id_key" UNIQUE ("competition_id", "entry_id", "user_id");



ALTER TABLE ONLY "public"."competition_votes"
    ADD CONSTRAINT "competition_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits_transactions"
    ADD CONSTRAINT "credits_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_artist_spotlight"
    ADD CONSTRAINT "daily_artist_spotlight_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_artist_spotlight"
    ADD CONSTRAINT "daily_artist_spotlight_user_id_spotlight_date_key" UNIQUE ("user_id", "spotlight_date");



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_user_track_unique" UNIQUE ("user_id", "track_id");



ALTER TABLE ONLY "public"."email_subscribers"
    ADD CONSTRAINT "email_subscribers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."email_subscribers"
    ADD CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engagement_config"
    ADD CONSTRAINT "engagement_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."engagement_learning"
    ADD CONSTRAINT "engagement_learning_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engagement_learning"
    ADD CONSTRAINT "engagement_learning_segment_tag_combo_key" UNIQUE ("segment", "tag_combo");



ALTER TABLE ONLY "public"."engagement_messages"
    ADD CONSTRAINT "engagement_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engagement_outcomes"
    ADD CONSTRAINT "engagement_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engagement_outcomes"
    ADD CONSTRAINT "engagement_outcomes_user_id_notification_id_key" UNIQUE ("user_id", "notification_id");



ALTER TABLE ONLY "public"."external_plays"
    ADD CONSTRAINT "external_plays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_artist_id_key" UNIQUE ("follower_id", "artist_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fraud_flags"
    ADD CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_contacts"
    ADD CONSTRAINT "global_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_contacts"
    ADD CONSTRAINT "global_contacts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."home_hero"
    ADD CONSTRAINT "home_hero_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listener_behavior_profiles"
    ADD CONSTRAINT "listener_behavior_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listener_behavior_profiles"
    ADD CONSTRAINT "listener_behavior_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."listener_feedback"
    ADD CONSTRAINT "listener_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listener_feedback"
    ADD CONSTRAINT "listener_feedback_user_id_track_id_key" UNIQUE ("user_id", "track_id");



ALTER TABLE ONLY "public"."listener_recommendations"
    ADD CONSTRAINT "listener_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listener_recommendations"
    ADD CONSTRAINT "listener_recommendations_user_id_track_id_key" UNIQUE ("user_id", "track_id");



ALTER TABLE ONLY "public"."listener_themes"
    ADD CONSTRAINT "listener_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listener_themes"
    ADD CONSTRAINT "listener_themes_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."listener_tier_subscriptions"
    ADD CONSTRAINT "listener_tier_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listeners"
    ADD CONSTRAINT "listeners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listeners"
    ADD CONSTRAINT "listeners_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."listening_session_queue"
    ADD CONSTRAINT "listening_session_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listening_sessions"
    ADD CONSTRAINT "listening_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_wrapped_log"
    ADD CONSTRAINT "monthly_wrapped_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_wrapped_log"
    ADD CONSTRAINT "monthly_wrapped_log_user_id_year_month_key" UNIQUE ("user_id", "year_month");



ALTER TABLE ONLY "public"."newsletter_editors"
    ADD CONSTRAINT "newsletter_editors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_editors"
    ADD CONSTRAINT "newsletter_editors_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."newsletter_posts"
    ADD CONSTRAINT "newsletter_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_posts"
    ADD CONSTRAINT "newsletter_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."platform_tiers"
    ADD CONSTRAINT "platform_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_tiers"
    ADD CONSTRAINT "platform_tiers_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."playlist_collaborators"
    ADD CONSTRAINT "playlist_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playlist_collaborators"
    ADD CONSTRAINT "playlist_collaborators_playlist_id_user_id_key" UNIQUE ("playlist_id", "user_id");



ALTER TABLE ONLY "public"."playlist_tracks"
    ADD CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playlist_tracks"
    ADD CONSTRAINT "playlist_tracks_playlist_id_track_id_key" UNIQUE ("playlist_id", "track_id");



ALTER TABLE ONLY "public"."playlists"
    ADD CONSTRAINT "playlists_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."playlists"
    ADD CONSTRAINT "playlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playlists"
    ADD CONSTRAINT "playlists_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."retail_ad_plays"
    ADD CONSTRAINT "retail_ad_plays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_ad_revenue"
    ADD CONSTRAINT "retail_ad_revenue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_admins"
    ADD CONSTRAINT "retail_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_admins"
    ADD CONSTRAINT "retail_admins_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."retail_ads"
    ADD CONSTRAINT "retail_ads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_artist_payouts"
    ADD CONSTRAINT "retail_artist_payouts_period_id_artist_id_key" UNIQUE ("period_id", "artist_id");



ALTER TABLE ONLY "public"."retail_artist_payouts"
    ADD CONSTRAINT "retail_artist_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_catalog"
    ADD CONSTRAINT "retail_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_catalog"
    ADD CONSTRAINT "retail_catalog_track_id_key" UNIQUE ("track_id");



ALTER TABLE ONLY "public"."retail_notification_reads"
    ADD CONSTRAINT "retail_notification_reads_notification_id_venue_id_key" UNIQUE ("notification_id", "venue_id");



ALTER TABLE ONLY "public"."retail_notification_reads"
    ADD CONSTRAINT "retail_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_notifications"
    ADD CONSTRAINT "retail_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_payout_periods"
    ADD CONSTRAINT "retail_payout_periods_period_start_period_end_key" UNIQUE ("period_start", "period_end");



ALTER TABLE ONLY "public"."retail_payout_periods"
    ADD CONSTRAINT "retail_payout_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_pitches"
    ADD CONSTRAINT "retail_pitches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_play_logs"
    ADD CONSTRAINT "retail_play_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_playlist_proposals"
    ADD CONSTRAINT "retail_playlist_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_playlist_tracks"
    ADD CONSTRAINT "retail_playlist_tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_playlist_tracks"
    ADD CONSTRAINT "retail_playlist_tracks_playlist_id_track_id_key" UNIQUE ("playlist_id", "track_id");



ALTER TABLE ONLY "public"."retail_playlists"
    ADD CONSTRAINT "retail_playlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_price_guide"
    ADD CONSTRAINT "retail_price_guide_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_subscriptions"
    ADD CONSTRAINT "retail_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_venue_likes"
    ADD CONSTRAINT "retail_venue_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_venue_likes"
    ADD CONSTRAINT "retail_venue_likes_venue_id_track_id_key" UNIQUE ("venue_id", "track_id");



ALTER TABLE ONLY "public"."retail_venue_locations"
    ADD CONSTRAINT "retail_venue_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_venues"
    ADD CONSTRAINT "retail_venues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retail_venues"
    ADD CONSTRAINT "retail_venues_signup_token_key" UNIQUE ("signup_token");



ALTER TABLE ONLY "public"."school_sessions_config"
    ADD CONSTRAINT "school_sessions_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_district_nominations"
    ADD CONSTRAINT "school_sessions_district_nominations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_district_votes"
    ADD CONSTRAINT "school_sessions_district_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_district_votes"
    ADD CONSTRAINT "school_sessions_district_votes_season_requested_user_id_key" UNIQUE ("season_requested", "user_id");



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_track_id_key" UNIQUE ("track_id");



ALTER TABLE ONLY "public"."school_sessions_entry_members"
    ADD CONSTRAINT "school_sessions_entry_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_guardian_consents"
    ADD CONSTRAINT "school_sessions_guardian_consents_entry_id_key" UNIQUE ("entry_id");



ALTER TABLE ONLY "public"."school_sessions_guardian_consents"
    ADD CONSTRAINT "school_sessions_guardian_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_judges"
    ADD CONSTRAINT "school_sessions_judges_competition_id_user_id_key" UNIQUE ("competition_id", "user_id");



ALTER TABLE ONLY "public"."school_sessions_judges"
    ADD CONSTRAINT "school_sessions_judges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_schools"
    ADD CONSTRAINT "school_sessions_schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_shortlist_songs"
    ADD CONSTRAINT "school_sessions_shortlist_songs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_verification_codes"
    ADD CONSTRAINT "school_sessions_verification_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."school_sessions_verification_codes"
    ADD CONSTRAINT "school_sessions_verification_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_vip_candidates"
    ADD CONSTRAINT "school_sessions_vip_candidates_candidate_number_key" UNIQUE ("candidate_number");



ALTER TABLE ONLY "public"."school_sessions_vip_candidates"
    ADD CONSTRAINT "school_sessions_vip_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_sessions_votes"
    ADD CONSTRAINT "school_sessions_votes_competition_id_user_id_key" UNIQUE ("competition_id", "user_id");



ALTER TABLE ONLY "public"."school_sessions_votes"
    ADD CONSTRAINT "school_sessions_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_messages"
    ADD CONSTRAINT "session_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_poll_votes"
    ADD CONSTRAINT "session_poll_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_poll_votes"
    ADD CONSTRAINT "session_poll_votes_poll_id_user_id_key" UNIQUE ("poll_id", "user_id");



ALTER TABLE ONLY "public"."session_polls"
    ADD CONSTRAINT "session_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_priority_boosts"
    ADD CONSTRAINT "session_priority_boosts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_priority_boosts"
    ADD CONSTRAINT "session_priority_boosts_session_id_user_id_key" UNIQUE ("session_id", "user_id");



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_session_id_track_id_key" UNIQUE ("session_id", "track_id");



ALTER TABLE ONLY "public"."story_likes"
    ADD CONSTRAINT "story_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_likes"
    ADD CONSTRAINT "story_likes_story_id_user_id_key" UNIQUE ("story_id", "user_id");



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_user_id_key" UNIQUE ("story_id", "user_id");



ALTER TABLE ONLY "public"."streams"
    ADD CONSTRAINT "streams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_artist_id_key" UNIQUE ("user_id", "artist_id");



ALTER TABLE ONLY "public"."thought_comments"
    ADD CONSTRAINT "thought_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thought_reactions"
    ADD CONSTRAINT "thought_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."thought_reactions"
    ADD CONSTRAINT "thought_reactions_thought_id_user_id_emoji_key" UNIQUE ("thought_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."thought_reactions"
    ADD CONSTRAINT "thought_reactions_thought_id_user_id_key" UNIQUE ("thought_id", "user_id");



ALTER TABLE ONLY "public"."tip_goals"
    ADD CONSTRAINT "tip_goals_artist_id_key" UNIQUE ("artist_id");



ALTER TABLE ONLY "public"."tip_goals"
    ADD CONSTRAINT "tip_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_collaborations"
    ADD CONSTRAINT "track_collaborations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_collaborations"
    ADD CONSTRAINT "track_collaborations_track_id_artist_id_key" UNIQUE ("track_id", "artist_id");



ALTER TABLE ONLY "public"."track_comment_reactions"
    ADD CONSTRAINT "track_comment_reactions_comment_id_user_id_key" UNIQUE ("comment_id", "user_id");



ALTER TABLE ONLY "public"."track_comment_reactions"
    ADD CONSTRAINT "track_comment_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_comments"
    ADD CONSTRAINT "track_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_likes"
    ADD CONSTRAINT "track_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_likes"
    ADD CONSTRAINT "track_likes_track_id_user_id_key" UNIQUE ("track_id", "user_id");



ALTER TABLE ONLY "public"."track_presaves"
    ADD CONSTRAINT "track_presaves_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_presaves"
    ADD CONSTRAINT "track_presaves_track_id_user_id_key" UNIQUE ("track_id", "user_id");



ALTER TABLE ONLY "public"."track_presaves"
    ADD CONSTRAINT "track_presaves_user_id_track_id_key" UNIQUE ("user_id", "track_id");



ALTER TABLE ONLY "public"."track_stems"
    ADD CONSTRAINT "track_stems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_versions"
    ADD CONSTRAINT "track_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_artist_id_slug_key" UNIQUE ("artist_id", "slug");



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "uniq_entry_per_artist_competition" UNIQUE ("competition_id", "artist_id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_streaks"
    ADD CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_streaks"
    ADD CONSTRAINT "user_streaks_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."wheel_challenges"
    ADD CONSTRAINT "wheel_challenges_pkey" PRIMARY KEY ("id");



CREATE INDEX "affiliate_clicks_affiliate_idx" ON "public"."affiliate_clicks" USING "btree" ("affiliate_id");



CREATE INDEX "affiliate_clicks_created_idx" ON "public"."affiliate_clicks" USING "btree" ("created_at");



CREATE INDEX "affiliate_clicks_ref_code_idx" ON "public"."affiliate_clicks" USING "btree" ("ref_code");



CREATE INDEX "affiliate_conv_affiliate_idx" ON "public"."affiliate_conversions" USING "btree" ("affiliate_id");



CREATE INDEX "affiliate_conv_status_idx" ON "public"."affiliate_conversions" USING "btree" ("status");



CREATE INDEX "affiliate_conv_user_idx" ON "public"."affiliate_conversions" USING "btree" ("referred_user_id");



CREATE INDEX "affiliate_payouts_affiliate_idx" ON "public"."affiliate_payouts" USING "btree" ("affiliate_id");



CREATE INDEX "affiliate_payouts_status_idx" ON "public"."affiliate_payouts" USING "btree" ("status");



CREATE INDEX "affiliates_ref_code_idx" ON "public"."affiliates" USING "btree" ("ref_code");



CREATE UNIQUE INDEX "affiliates_user_id_idx" ON "public"."affiliates" USING "btree" ("user_id");



CREATE INDEX "artists_is_suspended_idx" ON "public"."artists" USING "btree" ("is_suspended");



CREATE INDEX "artists_role_idx" ON "public"."artists" USING "btree" ("role");



CREATE INDEX "beat_purchases_buyer_idx" ON "public"."beat_purchases" USING "btree" ("buyer_user_id");



CREATE INDEX "beat_purchases_track_id_idx" ON "public"."beat_purchases" USING "btree" ("track_id");



CREATE INDEX "challenge_completions_track_id_idx" ON "public"."challenge_completions" USING "btree" ("track_id");



CREATE INDEX "challenge_completions_user_id_idx" ON "public"."challenge_completions" USING "btree" ("user_id");



CREATE INDEX "challenge_xp_total_xp_idx" ON "public"."challenge_xp" USING "btree" ("total_xp" DESC);



CREATE INDEX "collab_requests_from_artist_id_idx" ON "public"."collab_requests" USING "btree" ("from_artist_id");



CREATE INDEX "collab_requests_status_idx" ON "public"."collab_requests" USING "btree" ("status");



CREATE INDEX "collab_requests_to_artist_id_idx" ON "public"."collab_requests" USING "btree" ("to_artist_id");



CREATE INDEX "competition_entries_competition_idx" ON "public"."competition_entries" USING "btree" ("competition_id");



CREATE UNIQUE INDEX "competition_payouts_entry_success_idx" ON "public"."competition_payouts" USING "btree" ("entry_id") WHERE ("status" = ANY (ARRAY['processing'::"text", 'success'::"text"]));



CREATE INDEX "credits_tx_user_idx" ON "public"."credits_transactions" USING "btree" ("user_id");



CREATE INDEX "email_subscribers_email_idx" ON "public"."email_subscribers" USING "btree" ("email");



CREATE INDEX "email_subscribers_subscribed_idx" ON "public"."email_subscribers" USING "btree" ("subscribed");



CREATE INDEX "engagement_messages_sent_at_idx" ON "public"."engagement_messages" USING "btree" ("sent_at");



CREATE INDEX "engagement_messages_user_id_idx" ON "public"."engagement_messages" USING "btree" ("user_id");



CREATE INDEX "external_plays_dedupe_idx" ON "public"."external_plays" USING "btree" ("track_id", "ip_hash", "created_at");



CREATE INDEX "external_plays_track_id_idx" ON "public"."external_plays" USING "btree" ("track_id");



CREATE INDEX "idx_abp_artist_id" ON "public"."artist_behavior_profiles" USING "btree" ("artist_id");



CREATE INDEX "idx_abp_tags" ON "public"."artist_behavior_profiles" USING "gin" ("tags");



CREATE INDEX "idx_albums_artist_id" ON "public"."albums" USING "btree" ("artist_id");



CREATE INDEX "idx_albums_release_date" ON "public"."albums" USING "btree" ("release_date");



CREATE INDEX "idx_albums_slug" ON "public"."albums" USING "btree" ("slug");



CREATE INDEX "idx_artist_contacts_artist" ON "public"."artist_contacts" USING "btree" ("artist_id");



CREATE INDEX "idx_artist_post_comments_post_id" ON "public"."artist_post_comments" USING "btree" ("post_id");



CREATE INDEX "idx_artist_posts_artist_id" ON "public"."artist_posts" USING "btree" ("artist_id");



CREATE INDEX "idx_artist_posts_created_at" ON "public"."artist_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_artist_thoughts_artist_id" ON "public"."artist_thoughts" USING "btree" ("artist_id");



CREATE INDEX "idx_artist_thoughts_created_at" ON "public"."artist_thoughts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_artist_tier_sub_artist" ON "public"."artist_tier_subscriptions" USING "btree" ("artist_id");



CREATE INDEX "idx_artist_tier_sub_status" ON "public"."artist_tier_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_artists_created_at" ON "public"."artists" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_artists_follower_count" ON "public"."artists" USING "btree" ("follower_count" DESC);



CREATE INDEX "idx_artists_slug" ON "public"."artists" USING "btree" ("slug");



CREATE INDEX "idx_artists_user_id" ON "public"."artists" USING "btree" ("user_id");



CREATE INDEX "idx_beat_purchases_buyer" ON "public"."beat_purchases" USING "btree" ("buyer_user_id");



CREATE INDEX "idx_beat_purchases_track_id" ON "public"."beat_purchases" USING "btree" ("track_id");



CREATE INDEX "idx_challenge_xp_user" ON "public"."challenge_xp" USING "btree" ("user_id");



CREATE INDEX "idx_challenge_xp_user_challenge" ON "public"."challenge_xp" USING "btree" ("user_id", "challenge_id");



CREATE INDEX "idx_chat_members_room" ON "public"."chat_room_members" USING "btree" ("room_id");



CREATE INDEX "idx_chat_members_user" ON "public"."chat_room_members" USING "btree" ("user_id");



CREATE INDEX "idx_chat_messages_room" ON "public"."chat_messages" USING "btree" ("room_id", "created_at");



CREATE INDEX "idx_chat_messages_user" ON "public"."chat_messages" USING "btree" ("user_id");



CREATE INDEX "idx_chat_rooms_artist" ON "public"."chat_rooms" USING "btree" ("artist_id");



CREATE INDEX "idx_collab_messages_request" ON "public"."collab_messages" USING "btree" ("request_id", "created_at");



CREATE INDEX "idx_collab_requests_from" ON "public"."collab_requests" USING "btree" ("from_artist_id");



CREATE INDEX "idx_collab_requests_to" ON "public"."collab_requests" USING "btree" ("to_artist_id", "status");



CREATE INDEX "idx_collab_requests_track" ON "public"."collab_requests" USING "btree" ("track_id");



CREATE INDEX "idx_collaborations_artist" ON "public"."collaborations" USING "btree" ("artist_id");



CREATE INDEX "idx_collaborations_status" ON "public"."collaborations" USING "btree" ("status");



CREATE INDEX "idx_collaborations_track" ON "public"."collaborations" USING "btree" ("track_id");



CREATE INDEX "idx_comment_reactions_comment" ON "public"."track_comment_reactions" USING "btree" ("comment_id");



CREATE INDEX "idx_credit_redemptions_status" ON "public"."affiliate_credit_redemptions" USING "btree" ("status");



CREATE INDEX "idx_downloads_track_id" ON "public"."downloads" USING "btree" ("track_id");



CREATE INDEX "idx_downloads_user_id" ON "public"."downloads" USING "btree" ("user_id");



CREATE INDEX "idx_el_segment" ON "public"."engagement_learning" USING "btree" ("segment");



CREATE INDEX "idx_el_tag_combo" ON "public"."engagement_learning" USING "btree" ("tag_combo");



CREATE INDEX "idx_engagement_msgs_sent_at" ON "public"."engagement_messages" USING "btree" ("sent_at");



CREATE INDEX "idx_engagement_msgs_user_id" ON "public"."engagement_messages" USING "btree" ("user_id");



CREATE INDEX "idx_eo_scored" ON "public"."engagement_outcomes" USING "btree" ("scored");



CREATE INDEX "idx_eo_segment" ON "public"."engagement_outcomes" USING "btree" ("segment");



CREATE INDEX "idx_eo_sent_at" ON "public"."engagement_outcomes" USING "btree" ("sent_at");



CREATE INDEX "idx_eo_tags" ON "public"."engagement_outcomes" USING "gin" ("tags_at_send");



CREATE INDEX "idx_eo_user_id" ON "public"."engagement_outcomes" USING "btree" ("user_id");



CREATE INDEX "idx_follows_artist_id" ON "public"."follows" USING "btree" ("artist_id");



CREATE INDEX "idx_follows_follower_id" ON "public"."follows" USING "btree" ("follower_id");



CREATE INDEX "idx_fraud_entity" ON "public"."fraud_flags" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_fraud_unresolved" ON "public"."fraud_flags" USING "btree" ("resolved") WHERE ("resolved" = false);



CREATE INDEX "idx_global_contacts_email" ON "public"."global_contacts" USING "btree" ("email");



CREATE INDEX "idx_lbp_tags" ON "public"."listener_behavior_profiles" USING "gin" ("tags");



CREATE INDEX "idx_lbp_user_id" ON "public"."listener_behavior_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_listener_subs_user_id" ON "public"."listener_tier_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_newsletter_posts_slug" ON "public"."newsletter_posts" USING "btree" ("slug");



CREATE INDEX "idx_notifications_artist" ON "public"."notifications" USING "btree" ("artist_id", "created_at" DESC);



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_track_id" ON "public"."notifications" USING "btree" ("track_id");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_payouts_artist" ON "public"."payouts" USING "btree" ("artist_id");



CREATE INDEX "idx_payouts_artist_id" ON "public"."payouts" USING "btree" ("artist_id");



CREATE INDEX "idx_payouts_status" ON "public"."payouts" USING "btree" ("status");



CREATE INDEX "idx_payouts_transaction_id" ON "public"."payouts" USING "btree" ("transaction_id");



CREATE INDEX "idx_playlist_tracks_playlist_id" ON "public"."playlist_tracks" USING "btree" ("playlist_id");



CREATE INDEX "idx_playlist_tracks_track_id" ON "public"."playlist_tracks" USING "btree" ("track_id");



CREATE INDEX "idx_playlists_user_id" ON "public"."playlists" USING "btree" ("user_id");



CREATE INDEX "idx_purchases_track_id" ON "public"."purchases" USING "btree" ("track_id");



CREATE INDEX "idx_purchases_user_id" ON "public"."purchases" USING "btree" ("user_id");



CREATE INDEX "idx_push_subs_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_retail_ad_plays_venue" ON "public"."retail_ad_plays" USING "btree" ("venue_id");



CREATE INDEX "idx_retail_ads_venue" ON "public"."retail_ads" USING "btree" ("venue_id");



CREATE INDEX "idx_retail_artist_payouts_artist" ON "public"."retail_artist_payouts" USING "btree" ("artist_id");



CREATE INDEX "idx_retail_artist_payouts_period" ON "public"."retail_artist_payouts" USING "btree" ("period_id");



CREATE INDEX "idx_retail_notif_reads_notif" ON "public"."retail_notification_reads" USING "btree" ("notification_id");



CREATE INDEX "idx_retail_notif_reads_venue" ON "public"."retail_notification_reads" USING "btree" ("venue_id");



CREATE INDEX "idx_retail_pitches_artist" ON "public"."retail_pitches" USING "btree" ("artist_id");



CREATE INDEX "idx_retail_pitches_status" ON "public"."retail_pitches" USING "btree" ("status");



CREATE INDEX "idx_retail_play_logs_track" ON "public"."retail_play_logs" USING "btree" ("track_id");



CREATE INDEX "idx_retail_play_logs_venue_played" ON "public"."retail_play_logs" USING "btree" ("venue_id", "played_at");



CREATE INDEX "idx_retail_playlist_tracks_playlist" ON "public"."retail_playlist_tracks" USING "btree" ("playlist_id");



CREATE UNIQUE INDEX "idx_retail_subs_paypal_sub_id" ON "public"."retail_subscriptions" USING "btree" ("paypal_subscription_id") WHERE ("paypal_subscription_id" IS NOT NULL);



CREATE INDEX "idx_retail_subscriptions_venue" ON "public"."retail_subscriptions" USING "btree" ("venue_id");



CREATE INDEX "idx_retail_venue_likes_track" ON "public"."retail_venue_likes" USING "btree" ("track_id");



CREATE INDEX "idx_retail_venue_likes_venue" ON "public"."retail_venue_likes" USING "btree" ("venue_id");



CREATE INDEX "idx_retail_venue_locations_venue" ON "public"."retail_venue_locations" USING "btree" ("venue_id");



CREATE UNIQUE INDEX "idx_school_sessions_entries_one_per_email" ON "public"."school_sessions_entries" USING "btree" ("competition_id", "lower"("entrant_email"));



CREATE INDEX "idx_streams_artist_id" ON "public"."streams" USING "btree" ("artist_id");



CREATE INDEX "idx_streams_created_at" ON "public"."streams" USING "btree" ("created_at");



CREATE INDEX "idx_streams_track_id" ON "public"."streams" USING "btree" ("track_id");



CREATE INDEX "idx_streams_user_id" ON "public"."streams" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_artist_id" ON "public"."subscriptions" USING "btree" ("artist_id");



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_tips_artist_id" ON "public"."tips" USING "btree" ("artist_id");



CREATE INDEX "idx_track_comments_parent" ON "public"."track_comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_track_likes_track_id" ON "public"."track_likes" USING "btree" ("track_id");



CREATE INDEX "idx_track_likes_user_id" ON "public"."track_likes" USING "btree" ("user_id");



CREATE INDEX "idx_track_versions_track_id" ON "public"."track_versions" USING "btree" ("track_id");



CREATE INDEX "idx_tracks_album_id" ON "public"."tracks" USING "btree" ("album_id");



CREATE INDEX "idx_tracks_artist_id" ON "public"."tracks" USING "btree" ("artist_id");



CREATE INDEX "idx_tracks_created_at" ON "public"."tracks" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tracks_engagement" ON "public"."tracks" USING "btree" ("engagement_score" DESC);



CREATE INDEX "idx_tracks_featured" ON "public"."tracks" USING "btree" ("featured");



CREATE INDEX "idx_tracks_genre" ON "public"."tracks" USING "btree" ("genre");



CREATE INDEX "idx_tracks_is_published" ON "public"."tracks" USING "btree" ("is_published");



CREATE INDEX "idx_tracks_slug" ON "public"."tracks" USING "btree" ("slug");



CREATE INDEX "idx_tracks_stream_count" ON "public"."tracks" USING "btree" ("stream_count" DESC);



CREATE INDEX "idx_tracks_trending" ON "public"."tracks" USING "btree" ("trending_rank");



CREATE INDEX "idx_user_profiles_created_at" ON "public"."user_profiles" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_profiles_email" ON "public"."user_profiles" USING "btree" ("email");



CREATE INDEX "idx_verification_codes_school" ON "public"."school_sessions_verification_codes" USING "btree" ("school_id");



CREATE INDEX "idx_verification_codes_unused" ON "public"."school_sessions_verification_codes" USING "btree" ("is_used") WHERE ("is_used" = false);



CREATE INDEX "listener_rec_computed_idx" ON "public"."listener_recommendations" USING "btree" ("computed_at");



CREATE INDEX "listener_rec_user_idx" ON "public"."listener_recommendations" USING "btree" ("user_id", "score" DESC);



CREATE UNIQUE INDEX "notifications_unique_new_track" ON "public"."notifications" USING "btree" ("user_id", "track_id") WHERE (("type" = 'new_track'::"text") AND ("track_id" IS NOT NULL));



CREATE UNIQUE INDEX "one_live_session_per_artist" ON "public"."listening_sessions" USING "btree" ("artist_id") WHERE ("status" = 'live'::"text");



CREATE INDEX "school_sessions_district_votes_nom_idx" ON "public"."school_sessions_district_votes" USING "btree" ("nomination_id");



CREATE INDEX "school_sessions_entries_artist_idx" ON "public"."school_sessions_entries" USING "btree" ("artist_id");



CREATE INDEX "school_sessions_entries_competition_idx" ON "public"."school_sessions_entries" USING "btree" ("competition_id");



CREATE INDEX "school_sessions_entries_finalist_idx" ON "public"."school_sessions_entries" USING "btree" ("competition_id", "is_finalist");



CREATE INDEX "school_sessions_entry_members_entry_idx" ON "public"."school_sessions_entry_members" USING "btree" ("entry_id");



CREATE INDEX "school_sessions_nominations_season_idx" ON "public"."school_sessions_district_nominations" USING "btree" ("season_requested", "is_approved");



CREATE UNIQUE INDEX "school_sessions_schools_name_idx" ON "public"."school_sessions_schools" USING "btree" ("lower"("name"));



CREATE INDEX "school_sessions_shortlist_songs_comp_idx" ON "public"."school_sessions_shortlist_songs" USING "btree" ("competition_id", "is_active", "display_order");



CREATE INDEX "school_sessions_votes_entry_idx" ON "public"."school_sessions_votes" USING "btree" ("entry_id");



CREATE INDEX "streams_device_idx" ON "public"."streams" USING "btree" ("device_type");



CREATE INDEX "streams_source_idx" ON "public"."streams" USING "btree" ("source");



CREATE INDEX "streams_track_created_idx" ON "public"."streams" USING "btree" ("track_id", "created_at");



CREATE INDEX "streams_user_created_idx" ON "public"."streams" USING "btree" ("user_id", "created_at");



CREATE INDEX "track_comments_track_idx" ON "public"."track_comments" USING "btree" ("track_id", "created_at" DESC);



CREATE INDEX "track_comments_user_idx" ON "public"."track_comments" USING "btree" ("user_id");



CREATE INDEX "track_stems_track_id_idx" ON "public"."track_stems" USING "btree" ("track_id");



CREATE INDEX "tracks_engagement_idx" ON "public"."tracks" USING "btree" ("engagement_score" DESC);



CREATE INDEX "tracks_is_beat_idx" ON "public"."tracks" USING "btree" ("is_beat") WHERE ("is_beat" = true);



CREATE INDEX "tracks_published_engagement_idx" ON "public"."tracks" USING "btree" ("is_published", "engagement_score" DESC);



CREATE INDEX "tracks_youtube_url_idx" ON "public"."tracks" USING "btree" ("youtube_url") WHERE ("youtube_url" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_milestone_per_track" ON "public"."notifications" USING "btree" ("artist_id", "type", (("metadata" ->> 'track_id'::"text"))) WHERE (("type" = ANY (ARRAY['milestone_100'::"text", 'milestone_500'::"text", 'milestone_1k'::"text", 'milestone_10k'::"text", 'milestone_stream'::"text"])) AND (("metadata" ->> 'track_id'::"text") IS NOT NULL));



CREATE INDEX "user_profiles_country_idx" ON "public"."user_profiles" USING "btree" ("country");



CREATE INDEX "user_profiles_user_id_idx" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE INDEX "user_streaks_user_id_idx" ON "public"."user_streaks" USING "btree" ("user_id");



CREATE UNIQUE INDEX "wheel_challenges_current_idx" ON "public"."wheel_challenges" USING "btree" ("is_current") WHERE ("is_current" = true);



CREATE INDEX "wheel_challenges_spun_at_idx" ON "public"."wheel_challenges" USING "btree" ("spun_at" DESC);



CREATE INDEX "wrapped_log_user_idx" ON "public"."monthly_wrapped_log" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "add_to_email_list_after_profile" AFTER INSERT ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."add_email_subscriber_after_profile"();



CREATE OR REPLACE TRIGGER "notify_new_stream" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."notify_artist_new_stream"();



CREATE OR REPLACE TRIGGER "on_artist_milestone" AFTER UPDATE ON "public"."artists" FOR EACH ROW EXECUTE FUNCTION "public"."notify_followers_artist_milestone"();



CREATE OR REPLACE TRIGGER "on_artist_suspended" AFTER UPDATE ON "public"."artists" FOR EACH ROW WHEN (("new"."is_suspended" IS DISTINCT FROM "old"."is_suspended")) EXECUTE FUNCTION "public"."notify_artist_suspended"();



CREATE OR REPLACE TRIGGER "on_competition_vote" AFTER INSERT ON "public"."competition_votes" FOR EACH ROW EXECUTE FUNCTION "public"."increment_entry_votes"();



CREATE OR REPLACE TRIGGER "on_download_insert" AFTER INSERT ON "public"."downloads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_download_count"();



CREATE OR REPLACE TRIGGER "on_first_listener" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."mark_first_listener"();



CREATE OR REPLACE TRIGGER "on_follow_sync_contacts" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."sync_follow_to_contacts"();



CREATE OR REPLACE TRIGGER "on_like_update_engagement" AFTER INSERT OR DELETE ON "public"."track_likes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_engagement_likes"();



CREATE OR REPLACE TRIGGER "on_post_comment_change" AFTER INSERT OR DELETE ON "public"."artist_post_comments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_post_comment_count"();



CREATE OR REPLACE TRIGGER "on_post_like_change" AFTER INSERT OR DELETE ON "public"."artist_post_likes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_post_like_count"();



CREATE OR REPLACE TRIGGER "on_stream_insert_score" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."on_stream_update_score"();



CREATE OR REPLACE TRIGGER "on_stream_update_engagement" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_engagement"();



CREATE OR REPLACE TRIGGER "on_track_like_count" AFTER INSERT OR DELETE ON "public"."track_likes" FOR EACH ROW EXECUTE FUNCTION "public"."update_track_like_count"();



CREATE OR REPLACE TRIGGER "set_collaborations_updated_at" BEFORE UPDATE ON "public"."collaborations" FOR EACH ROW EXECUTE FUNCTION "public"."update_collaborations_updated_at"();



CREATE OR REPLACE TRIGGER "sync_follower_count_trigger" AFTER INSERT OR DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."sync_follower_count"();



CREATE OR REPLACE TRIGGER "trg_auto_flag_stream_abuse" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."auto_flag_stream_abuse"();



CREATE OR REPLACE TRIGGER "trg_block_explicit_catalog" BEFORE INSERT ON "public"."retail_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."block_explicit_retail_catalog"();



CREATE OR REPLACE TRIGGER "trg_block_explicit_playlist_track" BEFORE INSERT ON "public"."retail_playlist_tracks" FOR EACH ROW EXECUTE FUNCTION "public"."block_explicit_retail_track"();



CREATE OR REPLACE TRIGGER "trg_download_count" AFTER INSERT ON "public"."downloads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_download_count"();



CREATE OR REPLACE TRIGGER "trg_follower_milestones" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."check_follower_milestones"();



CREATE OR REPLACE TRIGGER "trg_increment_competition_entry_votes" AFTER INSERT ON "public"."competition_votes" FOR EACH ROW EXECUTE FUNCTION "public"."increment_competition_entry_votes"();



CREATE OR REPLACE TRIGGER "trg_increment_download_count" AFTER INSERT ON "public"."downloads" FOR EACH ROW EXECUTE FUNCTION "public"."increment_download_count"();



CREATE OR REPLACE TRIGGER "trg_listener_like_milestones" AFTER INSERT ON "public"."track_likes" FOR EACH ROW EXECUTE FUNCTION "public"."check_listener_like_milestones"();



CREATE OR REPLACE TRIGGER "trg_listener_stream_milestones" AFTER INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."check_listener_stream_milestones"();



CREATE OR REPLACE TRIGGER "trg_notify_new_track" AFTER INSERT ON "public"."tracks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_track"();



CREATE OR REPLACE TRIGGER "trg_prevent_stream_spam" BEFORE INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_stream_spam"();



CREATE OR REPLACE TRIGGER "trg_protect_artists_privilege" BEFORE UPDATE ON "public"."artists" FOR EACH ROW EXECUTE FUNCTION "public"."protect_privilege_columns"();



CREATE OR REPLACE TRIGGER "trg_protect_profiles_privilege" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_privilege_columns"();



CREATE OR REPLACE TRIGGER "trg_protect_user_profiles_privilege" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_privilege_columns"();



CREATE OR REPLACE TRIGGER "trg_remove_newly_explicit" AFTER UPDATE OF "is_explicit" ON "public"."tracks" FOR EACH ROW EXECUTE FUNCTION "public"."remove_newly_explicit_from_retail"();



CREATE OR REPLACE TRIGGER "trg_retail_play_to_stream" AFTER INSERT ON "public"."retail_play_logs" FOR EACH ROW EXECUTE FUNCTION "public"."retail_play_to_stream"();



CREATE OR REPLACE TRIGGER "trg_story_like_dec" AFTER DELETE ON "public"."story_likes" FOR EACH ROW EXECUTE FUNCTION "public"."decrement_story_likes"();



CREATE OR REPLACE TRIGGER "trg_story_like_inc" AFTER INSERT ON "public"."story_likes" FOR EACH ROW EXECUTE FUNCTION "public"."increment_story_likes"();



CREATE OR REPLACE TRIGGER "trg_stream_milestones" AFTER UPDATE OF "stream_count" ON "public"."tracks" FOR EACH ROW WHEN (("new"."stream_count" IS DISTINCT FROM "old"."stream_count")) EXECUTE FUNCTION "public"."check_stream_milestones"();



CREATE OR REPLACE TRIGGER "trg_streams_artist_id" BEFORE INSERT ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."streams_set_artist_id"();



CREATE OR REPLACE TRIGGER "trg_sync_artist_tier" AFTER INSERT OR UPDATE ON "public"."artist_tier_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_artist_tier"();



CREATE OR REPLACE TRIGGER "trg_sync_artist_total_streams" AFTER INSERT OR DELETE ON "public"."streams" FOR EACH ROW EXECUTE FUNCTION "public"."sync_artist_total_streams"();



CREATE OR REPLACE TRIGGER "trg_sync_artist_track_count" AFTER INSERT OR DELETE OR UPDATE OF "artist_id" ON "public"."tracks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_artist_track_count"();



CREATE OR REPLACE TRIGGER "trg_sync_follower_count" AFTER INSERT OR DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."sync_artist_follower_count"();



CREATE OR REPLACE TRIGGER "update_user_feedback_updated_at" BEFORE UPDATE ON "public"."user_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_campaigns"
    ADD CONSTRAINT "affiliate_campaigns_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_campaigns"
    ADD CONSTRAINT "affiliate_campaigns_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_clicks"
    ADD CONSTRAINT "affiliate_clicks_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_click_id_fkey" FOREIGN KEY ("click_id") REFERENCES "public"."affiliate_clicks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_conversions"
    ADD CONSTRAINT "affiliate_conversions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_credit_redemptions"
    ADD CONSTRAINT "affiliate_credit_redemptions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_credit_redemptions"
    ADD CONSTRAINT "affiliate_credit_redemptions_fulfilled_by_fkey" FOREIGN KEY ("fulfilled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."affiliate_credit_redemptions"
    ADD CONSTRAINT "affiliate_credit_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_alerts"
    ADD CONSTRAINT "artist_alerts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_alerts"
    ADD CONSTRAINT "artist_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_behavior_profiles"
    ADD CONSTRAINT "artist_behavior_profiles_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_behavior_profiles"
    ADD CONSTRAINT "artist_behavior_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_contacts"
    ADD CONSTRAINT "artist_contacts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_contacts"
    ADD CONSTRAINT "artist_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."artist_guestbook"
    ADD CONSTRAINT "artist_guestbook_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_guestbook"
    ADD CONSTRAINT "artist_guestbook_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_payment_profiles"
    ADD CONSTRAINT "artist_payment_profiles_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_post_comments"
    ADD CONSTRAINT "artist_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."artist_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_post_comments"
    ADD CONSTRAINT "artist_post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_post_likes"
    ADD CONSTRAINT "artist_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."artist_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_post_likes"
    ADD CONSTRAINT "artist_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_posts"
    ADD CONSTRAINT "artist_posts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_stories"
    ADD CONSTRAINT "artist_stories_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_stories"
    ADD CONSTRAINT "artist_stories_tagged_track_id_fkey" FOREIGN KEY ("tagged_track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."artist_themes"
    ADD CONSTRAINT "artist_themes_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_thoughts"
    ADD CONSTRAINT "artist_thoughts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_tier_subscriptions"
    ADD CONSTRAINT "artist_tier_subscriptions_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artist_tier_subscriptions"
    ADD CONSTRAINT "artist_tier_subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."platform_tiers"("id");



ALTER TABLE ONLY "public"."artist_voice_memos"
    ADD CONSTRAINT "artist_voice_memos_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_current_tier_id_fkey" FOREIGN KEY ("current_tier_id") REFERENCES "public"."platform_tiers"("id");



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."artists"
    ADD CONSTRAINT "artists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beat_purchases"
    ADD CONSTRAINT "beat_purchases_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."beat_purchases"
    ADD CONSTRAINT "beat_purchases_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_completions"
    ADD CONSTRAINT "challenge_completions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."challenge_completions"
    ADD CONSTRAINT "challenge_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_xp"
    ADD CONSTRAINT "challenge_xp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."chat_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_poll_votes"
    ADD CONSTRAINT "chat_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_polls"
    ADD CONSTRAINT "chat_polls_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reactions"
    ADD CONSTRAINT "chat_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_room_members"
    ADD CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_word_filters"
    ADD CONSTRAINT "chat_word_filters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."collab_messages"
    ADD CONSTRAINT "collab_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."collab_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collab_messages"
    ADD CONSTRAINT "collab_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collab_requests"
    ADD CONSTRAINT "collab_requests_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "public"."collaborations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collab_requests"
    ADD CONSTRAINT "collab_requests_from_artist_id_fkey" FOREIGN KEY ("from_artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collab_requests"
    ADD CONSTRAINT "collab_requests_to_artist_id_fkey" FOREIGN KEY ("to_artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collab_requests"
    ADD CONSTRAINT "collab_requests_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collaborations"
    ADD CONSTRAINT "collaborations_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "competition_entries_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "competition_entries_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_entries"
    ADD CONSTRAINT "competition_entries_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."competition_payouts"
    ADD CONSTRAINT "competition_payouts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_payouts"
    ADD CONSTRAINT "competition_payouts_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_payouts"
    ADD CONSTRAINT "competition_payouts_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_user_votes"
    ADD CONSTRAINT "competition_user_votes_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_user_votes"
    ADD CONSTRAINT "competition_user_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_votes"
    ADD CONSTRAINT "competition_votes_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_votes"
    ADD CONSTRAINT "competition_votes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_votes"
    ADD CONSTRAINT "competition_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_winner_entry_fkey" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credits_transactions"
    ADD CONSTRAINT "credits_transactions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credits_transactions"
    ADD CONSTRAINT "credits_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_artist_spotlight"
    ADD CONSTRAINT "daily_artist_spotlight_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_artist_spotlight"
    ADD CONSTRAINT "daily_artist_spotlight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."downloads"
    ADD CONSTRAINT "downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_subscribers"
    ADD CONSTRAINT "email_subscribers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."engagement_messages"
    ADD CONSTRAINT "engagement_messages_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."engagement_messages"
    ADD CONSTRAINT "engagement_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."engagement_outcomes"
    ADD CONSTRAINT "engagement_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_plays"
    ADD CONSTRAINT "external_plays_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id");



ALTER TABLE ONLY "public"."artist_tier_subscriptions"
    ADD CONSTRAINT "fk_platform_tier" FOREIGN KEY ("tier_id") REFERENCES "public"."platform_tiers"("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "fk_winner_entry" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."competition_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fraud_flags"
    ADD CONSTRAINT "fraud_flags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."global_contacts"
    ADD CONSTRAINT "global_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."home_hero"
    ADD CONSTRAINT "home_hero_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."listener_behavior_profiles"
    ADD CONSTRAINT "listener_behavior_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_feedback"
    ADD CONSTRAINT "listener_feedback_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_feedback"
    ADD CONSTRAINT "listener_feedback_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_feedback"
    ADD CONSTRAINT "listener_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_recommendations"
    ADD CONSTRAINT "listener_recommendations_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_recommendations"
    ADD CONSTRAINT "listener_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_themes"
    ADD CONSTRAINT "listener_themes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listener_tier_subscriptions"
    ADD CONSTRAINT "listener_tier_subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."platform_tiers"("id");



ALTER TABLE ONLY "public"."listener_tier_subscriptions"
    ADD CONSTRAINT "listener_tier_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listeners"
    ADD CONSTRAINT "listeners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listening_session_queue"
    ADD CONSTRAINT "listening_session_queue_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listening_session_queue"
    ADD CONSTRAINT "listening_session_queue_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id");



ALTER TABLE ONLY "public"."listening_sessions"
    ADD CONSTRAINT "listening_sessions_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listening_sessions"
    ADD CONSTRAINT "listening_sessions_current_track_id_fkey" FOREIGN KEY ("current_track_id") REFERENCES "public"."tracks"("id");



ALTER TABLE ONLY "public"."monthly_wrapped_log"
    ADD CONSTRAINT "monthly_wrapped_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_editors"
    ADD CONSTRAINT "newsletter_editors_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."newsletter_editors"
    ADD CONSTRAINT "newsletter_editors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."newsletter_posts"
    ADD CONSTRAINT "newsletter_posts_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "public"."collaborations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_from_artist_id_fkey" FOREIGN KEY ("from_artist_id") REFERENCES "public"."artists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "archive"."transactions"("id");



ALTER TABLE ONLY "public"."playlist_collaborators"
    ADD CONSTRAINT "playlist_collaborators_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playlist_collaborators"
    ADD CONSTRAINT "playlist_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playlist_tracks"
    ADD CONSTRAINT "playlist_tracks_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playlist_tracks"
    ADD CONSTRAINT "playlist_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playlists"
    ADD CONSTRAINT "playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_ad_plays"
    ADD CONSTRAINT "retail_ad_plays_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "public"."retail_ads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_ad_plays"
    ADD CONSTRAINT "retail_ad_plays_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."retail_venue_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retail_ad_plays"
    ADD CONSTRAINT "retail_ad_plays_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_ad_revenue"
    ADD CONSTRAINT "retail_ad_revenue_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_admins"
    ADD CONSTRAINT "retail_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_admins"
    ADD CONSTRAINT "retail_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_ads"
    ADD CONSTRAINT "retail_ads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_ads"
    ADD CONSTRAINT "retail_ads_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_artist_payouts"
    ADD CONSTRAINT "retail_artist_payouts_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_artist_payouts"
    ADD CONSTRAINT "retail_artist_payouts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."retail_payout_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_catalog"
    ADD CONSTRAINT "retail_catalog_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_catalog"
    ADD CONSTRAINT "retail_catalog_pitch_id_fkey" FOREIGN KEY ("pitch_id") REFERENCES "public"."retail_pitches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retail_catalog"
    ADD CONSTRAINT "retail_catalog_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_notification_reads"
    ADD CONSTRAINT "retail_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."retail_notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_notification_reads"
    ADD CONSTRAINT "retail_notification_reads_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_notifications"
    ADD CONSTRAINT "retail_notifications_newsletter_post_id_fkey" FOREIGN KEY ("newsletter_post_id") REFERENCES "public"."newsletter_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retail_notifications"
    ADD CONSTRAINT "retail_notifications_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_payout_periods"
    ADD CONSTRAINT "retail_payout_periods_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_pitches"
    ADD CONSTRAINT "retail_pitches_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_pitches"
    ADD CONSTRAINT "retail_pitches_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_pitches"
    ADD CONSTRAINT "retail_pitches_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_play_logs"
    ADD CONSTRAINT "retail_play_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."retail_venue_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retail_play_logs"
    ADD CONSTRAINT "retail_play_logs_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."retail_playlists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."retail_play_logs"
    ADD CONSTRAINT "retail_play_logs_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_play_logs"
    ADD CONSTRAINT "retail_play_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_playlist_proposals"
    ADD CONSTRAINT "retail_playlist_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_playlist_tracks"
    ADD CONSTRAINT "retail_playlist_tracks_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "public"."retail_playlists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_playlist_tracks"
    ADD CONSTRAINT "retail_playlist_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_playlists"
    ADD CONSTRAINT "retail_playlists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_subscriptions"
    ADD CONSTRAINT "retail_subscriptions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_venue_likes"
    ADD CONSTRAINT "retail_venue_likes_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_venue_likes"
    ADD CONSTRAINT "retail_venue_likes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_venue_locations"
    ADD CONSTRAINT "retail_venue_locations_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."retail_venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retail_venues"
    ADD CONSTRAINT "retail_venues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retail_venues"
    ADD CONSTRAINT "retail_venues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_sessions_config"
    ADD CONSTRAINT "school_sessions_config_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_sessions_district_votes"
    ADD CONSTRAINT "school_sessions_district_votes_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "public"."school_sessions_district_nominations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_district_votes"
    ADD CONSTRAINT "school_sessions_district_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."school_sessions_schools"("id");



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "public"."school_sessions_shortlist_songs"("id");



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_entries"
    ADD CONSTRAINT "school_sessions_entries_verification_code_id_fkey" FOREIGN KEY ("verification_code_id") REFERENCES "public"."school_sessions_verification_codes"("id");



ALTER TABLE ONLY "public"."school_sessions_entry_members"
    ADD CONSTRAINT "school_sessions_entry_members_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."school_sessions_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_guardian_consents"
    ADD CONSTRAINT "school_sessions_guardian_consents_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."school_sessions_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_judges"
    ADD CONSTRAINT "school_sessions_judges_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_judges"
    ADD CONSTRAINT "school_sessions_judges_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_sessions_judges"
    ADD CONSTRAINT "school_sessions_judges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_shortlist_songs"
    ADD CONSTRAINT "school_sessions_shortlist_songs_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_shortlist_songs"
    ADD CONSTRAINT "school_sessions_shortlist_songs_reference_track_id_fkey" FOREIGN KEY ("reference_track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_sessions_verification_codes"
    ADD CONSTRAINT "school_sessions_verification_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_sessions_verification_codes"
    ADD CONSTRAINT "school_sessions_verification_codes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."school_sessions_schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."school_sessions_vip_candidates"
    ADD CONSTRAINT "school_sessions_vip_candidates_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."school_sessions_votes"
    ADD CONSTRAINT "school_sessions_votes_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_votes"
    ADD CONSTRAINT "school_sessions_votes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."school_sessions_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_sessions_votes"
    ADD CONSTRAINT "school_sessions_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_messages"
    ADD CONSTRAINT "session_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_messages"
    ADD CONSTRAINT "session_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_poll_votes"
    ADD CONSTRAINT "session_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."session_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_poll_votes"
    ADD CONSTRAINT "session_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_polls"
    ADD CONSTRAINT "session_polls_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_polls"
    ADD CONSTRAINT "session_polls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_polls"
    ADD CONSTRAINT "session_polls_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_priority_boosts"
    ADD CONSTRAINT "session_priority_boosts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_priority_boosts"
    ADD CONSTRAINT "session_priority_boosts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."listening_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_review_submissions"
    ADD CONSTRAINT "session_review_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_likes"
    ADD CONSTRAINT "story_likes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."artist_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_likes"
    ADD CONSTRAINT "story_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."artist_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."streams"
    ADD CONSTRAINT "streams_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."streams"
    ADD CONSTRAINT "streams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "archive"."subscription_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thought_comments"
    ADD CONSTRAINT "thought_comments_thought_id_fkey" FOREIGN KEY ("thought_id") REFERENCES "public"."artist_thoughts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thought_comments"
    ADD CONSTRAINT "thought_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thought_reactions"
    ADD CONSTRAINT "thought_reactions_thought_id_fkey" FOREIGN KEY ("thought_id") REFERENCES "public"."artist_thoughts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thought_reactions"
    ADD CONSTRAINT "thought_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tip_goals"
    ADD CONSTRAINT "tip_goals_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id");



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."track_collaborations"
    ADD CONSTRAINT "track_collaborations_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_collaborations"
    ADD CONSTRAINT "track_collaborations_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_comment_reactions"
    ADD CONSTRAINT "track_comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."track_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_comment_reactions"
    ADD CONSTRAINT "track_comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_comments"
    ADD CONSTRAINT "track_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."track_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_comments"
    ADD CONSTRAINT "track_comments_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_comments"
    ADD CONSTRAINT "track_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_likes"
    ADD CONSTRAINT "track_likes_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_likes"
    ADD CONSTRAINT "track_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_presaves"
    ADD CONSTRAINT "track_presaves_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_presaves"
    ADD CONSTRAINT "track_presaves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_stems"
    ADD CONSTRAINT "track_stems_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_versions"
    ADD CONSTRAINT "track_versions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tracks"
    ADD CONSTRAINT "tracks_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_bans"
    ADD CONSTRAINT "user_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_streaks"
    ADD CONSTRAINT "user_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wheel_challenges"
    ADD CONSTRAINT "wheel_challenges_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL;



CREATE POLICY "Admin can manage tier subscriptions" ON "public"."artist_tier_subscriptions" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "Admins can delete any artist" ON "public"."artists" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can delete any track" ON "public"."tracks" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can manage fraud flags" ON "public"."fraud_flags" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can read all affiliates" ON "public"."affiliates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can read all conversions" ON "public"."affiliate_conversions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can read all feedback" ON "public"."user_feedback" FOR SELECT USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "Admins can read all payouts" ON "public"."affiliate_payouts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can update all feedback" ON "public"."user_feedback" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "Admins can update any artist" ON "public"."artists" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can update any track" ON "public"."tracks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can update messages" ON "public"."chat_messages" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE (("chat_room_members"."user_id" = "auth"."uid"()) AND ("chat_room_members"."role" = ANY (ARRAY['admin'::"text", 'moderator'::"text"])))))));



CREATE POLICY "Admins can view all global contacts" ON "public"."global_contacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins manage members" ON "public"."chat_room_members" FOR UPDATE USING (("room_id" IN ( SELECT "chat_room_members_1"."room_id"
   FROM "public"."chat_room_members" "chat_room_members_1"
  WHERE (("chat_room_members_1"."user_id" = "auth"."uid"()) AND ("chat_room_members_1"."role" = ANY (ARRAY['admin'::"text", 'moderator'::"text"]))))));



CREATE POLICY "Admins manage user bans" ON "public"."user_bans" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "Anon insert clicks" ON "public"."affiliate_clicks" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Anyone can read comments" ON "public"."thought_comments" FOR SELECT USING (true);



CREATE POLICY "Anyone can read filters" ON "public"."chat_word_filters" FOR SELECT USING (true);



CREATE POLICY "Anyone can read guestbook" ON "public"."artist_guestbook" FOR SELECT USING (true);



CREATE POLICY "Anyone can read likes" ON "public"."artist_post_likes" FOR SELECT USING (true);



CREATE POLICY "Anyone can read live sessions" ON "public"."listening_sessions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read queue" ON "public"."listening_session_queue" FOR SELECT USING (true);



CREATE POLICY "Anyone can read reactions" ON "public"."thought_reactions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read reactions" ON "public"."track_comment_reactions" FOR SELECT USING (true);



CREATE POLICY "Anyone can read session messages" ON "public"."session_messages" FOR SELECT USING (true);



CREATE POLICY "Anyone can read thoughts" ON "public"."artist_thoughts" FOR SELECT USING (true);



CREATE POLICY "Anyone can read track comments" ON "public"."track_comments" FOR SELECT USING (true);



CREATE POLICY "Anyone can subscribe" ON "public"."email_subscribers" FOR INSERT TO "anon" WITH CHECK ((("email" IS NOT NULL) AND ("email" <> ''::"text")));



CREATE POLICY "Anyone can view active rooms" ON "public"."chat_rooms" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view themes" ON "public"."artist_themes" FOR SELECT USING (true);



CREATE POLICY "Anyone reads active campaigns" ON "public"."affiliate_campaigns" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Artist can create polls for their session" ON "public"."session_polls" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "artists"."user_id"
   FROM "public"."artists"
  WHERE ("artists"."id" = "session_polls"."artist_id"))));



CREATE POLICY "Artists can create own albums" ON "public"."albums" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can create own tracks" ON "public"."tracks" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can delete own albums" ON "public"."albums" FOR DELETE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can delete own track versions" ON "public"."track_versions" FOR DELETE USING (("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Artists can delete own tracks" ON "public"."tracks" FOR DELETE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can delete stems" ON "public"."track_stems" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."tracks"
     JOIN "public"."artists" ON (("artists"."id" = "tracks"."artist_id")))
  WHERE (("tracks"."id" = "track_stems"."track_id") AND ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Artists can insert collaborations" ON "public"."collaborations" FOR INSERT WITH CHECK (("invited_by" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can insert own track versions" ON "public"."track_versions" FOR INSERT WITH CHECK (("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Artists can insert stems" ON "public"."track_stems" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."tracks"
     JOIN "public"."artists" ON (("artists"."id" = "tracks"."artist_id")))
  WHERE (("tracks"."id" = "track_stems"."track_id") AND ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Artists can manage own voice memos" ON "public"."artist_voice_memos" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))) WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can read downloads of their tracks" ON "public"."downloads" FOR SELECT TO "authenticated" USING ((("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Artists can read streams of their tracks" ON "public"."streams" FOR SELECT TO "authenticated" USING ((("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Artists can read their beat purchases" ON "public"."beat_purchases" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."tracks"
     JOIN "public"."artists" ON (("artists"."id" = "tracks"."artist_id")))
  WHERE (("tracks"."id" = "beat_purchases"."track_id") AND ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Artists can read tips they received" ON "public"."tips" FOR SELECT USING ((("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() = "from_user_id")));



CREATE POLICY "Artists can update own albums" ON "public"."albums" FOR UPDATE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can update own notifications" ON "public"."notifications" FOR UPDATE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can update own profile" ON "public"."artists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Artists can update own track versions" ON "public"."track_versions" FOR UPDATE USING (("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Artists can update own tracks" ON "public"."tracks" FOR UPDATE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can update their collaborations" ON "public"."collaborations" FOR UPDATE USING ((("artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("invited_by" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Artists can view downloads on their tracks" ON "public"."downloads" FOR SELECT USING (("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" = ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Artists can view own albums" ON "public"."albums" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can view own notifications" ON "public"."notifications" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can view own tracks" ON "public"."tracks" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists can view their own collaborations" ON "public"."collaborations" FOR SELECT USING ((("artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("invited_by" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Artists can view their subscribers" ON "public"."subscriptions" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists delete own notifications" ON "public"."notifications" FOR DELETE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own goals" ON "public"."tip_goals" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own payment profile" ON "public"."artist_payment_profiles" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own rooms" ON "public"."chat_rooms" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own sessions" ON "public"."listening_sessions" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own stories" ON "public"."artist_stories" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own subscription" ON "public"."artist_tier_subscriptions" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own theme" ON "public"."artist_themes" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage own thoughts" ON "public"."artist_thoughts" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists manage queue" ON "public"."listening_session_queue" USING (("session_id" IN ( SELECT "listening_sessions"."id"
   FROM "public"."listening_sessions"
  WHERE ("listening_sessions"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Artists manage their own sessions" ON "public"."listening_sessions" USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))) WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists see own contacts" ON "public"."artist_contacts" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists see own payment profile" ON "public"."artist_payment_profiles" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists see own payouts" ON "public"."payouts" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists see own subscription" ON "public"."artist_tier_subscriptions" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists see tips they received" ON "public"."tips" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists update own notifications" ON "public"."notifications" FOR UPDATE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists view own notifications" ON "public"."notifications" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Artists view own track collabs" ON "public"."track_collaborations" FOR SELECT USING ((("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Auth insert clicks" ON "public"."affiliate_clicks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Auth users can comment" ON "public"."thought_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Auth users can react" ON "public"."thought_reactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can comment" ON "public"."track_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can create artist profiles" ON "public"."artists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can read all listeners" ON "public"."listeners" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can send messages" ON "public"."session_messages" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users manage own subscription" ON "public"."email_subscribers" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Buyers can read own purchases" ON "public"."beat_purchases" FOR SELECT TO "authenticated" USING (("buyer_user_id" = "auth"."uid"()));



CREATE POLICY "Collaborators can read their memberships" ON "public"."playlist_collaborators" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Follows are publicly viewable" ON "public"."follows" FOR SELECT USING (true);



CREATE POLICY "Host and submitter can view submissions" ON "public"."session_review_submissions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = ( SELECT "artists"."user_id"
   FROM "public"."artists"
  WHERE ("artists"."id" = ( SELECT "listening_sessions"."artist_id"
           FROM "public"."listening_sessions"
          WHERE ("listening_sessions"."id" = "session_review_submissions"."session_id")
         LIMIT 1))))));



CREATE POLICY "Host can update submission status" ON "public"."session_review_submissions" FOR UPDATE USING (("auth"."uid"() = ( SELECT "artists"."user_id"
   FROM "public"."artists"
  WHERE ("artists"."id" = ( SELECT "listening_sessions"."artist_id"
           FROM "public"."listening_sessions"
          WHERE ("listening_sessions"."id" = "session_review_submissions"."session_id")
         LIMIT 1)))));



CREATE POLICY "Invited artist update collab" ON "public"."collaborations" FOR UPDATE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Involved artists view all collabs" ON "public"."collaborations" FOR SELECT USING ((("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("invited_by" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Likes are publicly viewable" ON "public"."track_likes" FOR SELECT USING (true);



CREATE POLICY "Listeners are publicly viewable" ON "public"."listeners" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Logged in users can submit their own tracks" ON "public"."session_review_submissions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("auth"."uid"() = ( SELECT "artists"."user_id"
   FROM "public"."artists"
  WHERE ("artists"."id" = "session_review_submissions"."artist_id")))));



CREATE POLICY "Logged in users can vote once" ON "public"."session_poll_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Members can insert messages" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE ("chat_room_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can read room messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE ("chat_room_members"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."artists"
  WHERE (("artists"."user_id" = "auth"."uid"()) AND ("artists"."is_master" = true))))));



CREATE POLICY "Members can send messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE ("chat_room_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view room members" ON "public"."chat_room_members" FOR SELECT USING (true);



CREATE POLICY "Members see room members" ON "public"."chat_room_members" FOR SELECT USING (true);



CREATE POLICY "Only admins can update settings" ON "public"."platform_settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "Only admins insert filters" ON "public"."chat_word_filters" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "Playlist owner can manage collaborators" ON "public"."playlist_collaborators" USING (("playlist_id" IN ( SELECT "playlists"."id"
   FROM "public"."playlists"
  WHERE ("playlists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Playlist tracks viewable with playlist" ON "public"."playlist_tracks" FOR SELECT USING (true);



CREATE POLICY "Poll votes are publicly viewable" ON "public"."session_poll_votes" FOR SELECT USING (true);



CREATE POLICY "Pro/Premium users can insert one boost per session" ON "public"."session_priority_boosts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (( SELECT "artists"."tier"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())
 LIMIT 1) = ANY (ARRAY['pro'::"text", 'premium'::"text"]))));



CREATE POLICY "Public can read voice memos" ON "public"."artist_voice_memos" FOR SELECT USING (true);



CREATE POLICY "Public can view live sessions" ON "public"."listening_sessions" FOR SELECT USING (("status" = 'live'::"text"));



CREATE POLICY "Public playlist tracks viewable" ON "public"."playlist_tracks" FOR SELECT USING (("playlist_id" IN ( SELECT "playlists"."id"
   FROM "public"."playlists"
  WHERE (("playlists"."is_public" = true) OR ("playlists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Public playlists viewable by all" ON "public"."playlists" FOR SELECT USING ((("is_public" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Public read active stories" ON "public"."artist_stories" FOR SELECT USING (("expires_at" > "now"()));



CREATE POLICY "Public read presave counts" ON "public"."track_presaves" FOR SELECT USING (true);



CREATE POLICY "Public read tip goals" ON "public"."tip_goals" FOR SELECT USING (true);



CREATE POLICY "Public read track stems" ON "public"."track_stems" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tracks"
  WHERE (("tracks"."id" = "track_stems"."track_id") AND ("tracks"."is_published" = true)))));



CREATE POLICY "Public view accepted collabs" ON "public"."collaborations" FOR SELECT USING (("status" = 'accepted'::"text"));



CREATE POLICY "Published albums are publicly viewable" ON "public"."albums" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Published tracks are publicly viewable" ON "public"."tracks" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Room members read messages" ON "public"."chat_messages" FOR SELECT USING (("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE ("chat_room_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Service role can insert" ON "public"."beat_purchases" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can update" ON "public"."beat_purchases" FOR UPDATE TO "service_role" USING (true);



CREATE POLICY "Service role manages affiliates" ON "public"."affiliates" TO "service_role" USING (true);



CREATE POLICY "Service role manages bug reports" ON "public"."bug_reports" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages campaigns" ON "public"."affiliate_campaigns" TO "service_role" USING (true);



CREATE POLICY "Service role manages clicks" ON "public"."affiliate_clicks" TO "service_role" USING (true);



CREATE POLICY "Service role manages conversions" ON "public"."affiliate_conversions" TO "service_role" USING (true);



CREATE POLICY "Service role manages credits" ON "public"."credits_transactions" TO "service_role" USING (true);



CREATE POLICY "Service role manages listener subscriptions" ON "public"."listener_tier_subscriptions" TO "service_role" USING (true);



CREATE POLICY "Service role manages payouts" ON "public"."affiliate_payouts" TO "service_role" USING (true);



CREATE POLICY "Session polls are publicly viewable" ON "public"."session_polls" FOR SELECT USING (true);



CREATE POLICY "Settings are public" ON "public"."platform_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Streams are viewable by owner" ON "public"."streams" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."tracks" "t"
     JOIN "public"."artists" "a" ON (("a"."id" = "t"."artist_id")))
  WHERE (("t"."id" = "streams"."track_id") AND ("a"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Track owner delete collab" ON "public"."collaborations" FOR DELETE USING (("invited_by" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Track owner insert collabs" ON "public"."collaborations" FOR INSERT WITH CHECK (("invited_by" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Track owner manages collabs" ON "public"."track_collaborations" USING (("track_id" IN ( SELECT "tracks"."id"
   FROM "public"."tracks"
  WHERE ("tracks"."artist_id" IN ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Track versions are publicly viewable" ON "public"."track_versions" FOR SELECT USING (true);



CREATE POLICY "Users can add to own playlists" ON "public"."playlist_tracks" FOR INSERT WITH CHECK (("playlist_id" IN ( SELECT "playlists"."id"
   FROM "public"."playlists"
  WHERE ("playlists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can cancel own subscriptions" ON "public"."subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can count their own notifications" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create playlists" ON "public"."playlists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create purchases" ON "public"."purchases" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create subscriptions" ON "public"."subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own comments" ON "public"."thought_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own comments" ON "public"."track_comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own likes" ON "public"."track_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own listener profile" ON "public"."listeners" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own playlists" ON "public"."playlists" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can follow artists" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can insert own downloads" ON "public"."downloads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own feedback" ON "public"."user_feedback" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own likes" ON "public"."track_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own listener profile" ON "public"."listeners" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own tips" ON "public"."tips" FOR INSERT WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "Users can log their own streams" ON "public"."streams" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own likes" ON "public"."artist_post_likes" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own downloads" ON "public"."downloads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own feedback" ON "public"."user_feedback" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own spotlight" ON "public"."daily_artist_spotlight" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove from own playlists" ON "public"."playlist_tracks" FOR DELETE USING (("playlist_id" IN ( SELECT "playlists"."id"
   FROM "public"."playlists"
  WHERE ("playlists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can remove their reaction" ON "public"."thought_reactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can unfollow artists" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "Users can unlike tracks" ON "public"."track_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own listener profile" ON "public"."listeners" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own playlists" ON "public"."playlists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own subscriptions" ON "public"."subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own global contact record" ON "public"."global_contacts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own purchases" ON "public"."purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own boosts" ON "public"."session_priority_boosts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert notifications about themselves" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users insert own affiliate" ON "public"."affiliates" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert own payout request" ON "public"."affiliate_payouts" FOR INSERT TO "authenticated" WITH CHECK (("affiliate_id" IN ( SELECT "affiliates"."id"
   FROM "public"."affiliates"
  WHERE ("affiliates"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users insert own reports" ON "public"."bug_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users leave rooms" ON "public"."chat_room_members" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own alerts" ON "public"."artist_alerts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own entry" ON "public"."artist_guestbook" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own feedback" ON "public"."listener_feedback" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own listener subscription" ON "public"."listener_tier_subscriptions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own membership" ON "public"."chat_room_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own playlist tracks" ON "public"."playlist_tracks" USING (("playlist_id" IN ( SELECT "playlists"."id"
   FROM "public"."playlists"
  WHERE ("playlists"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users manage own playlists" ON "public"."playlists" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own presaves" ON "public"."track_presaves" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own reactions" ON "public"."chat_reactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own reactions" ON "public"."track_comment_reactions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own story views" ON "public"."story_views" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own streak" ON "public"."user_streaks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own theme" ON "public"."listener_themes" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own xp" ON "public"."challenge_xp" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own affiliate" ON "public"."affiliates" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own bug reports" ON "public"."bug_reports" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own clicks" ON "public"."affiliate_clicks" FOR SELECT TO "authenticated" USING (("affiliate_id" IN ( SELECT "affiliates"."id"
   FROM "public"."affiliates"
  WHERE ("affiliates"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users read own conversions" ON "public"."affiliate_conversions" FOR SELECT TO "authenticated" USING (("affiliate_id" IN ( SELECT "affiliates"."id"
   FROM "public"."affiliates"
  WHERE ("affiliates"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users read own credits" ON "public"."credits_transactions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own payouts" ON "public"."affiliate_payouts" FOR SELECT TO "authenticated" USING (("affiliate_id" IN ( SELECT "affiliates"."id"
   FROM "public"."affiliates"
  WHERE ("affiliates"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users read own recommendations" ON "public"."listener_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read reactions" ON "public"."chat_reactions" FOR SELECT USING (true);



CREATE POLICY "Users send own messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("room_id" IN ( SELECT "chat_room_members"."room_id"
   FROM "public"."chat_room_members"
  WHERE ("chat_room_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users update own affiliate" ON "public"."affiliates" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "abp_admin_read" ON "public"."artist_behavior_profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "abp_service_write" ON "public"."artist_behavior_profiles" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_select" ON "public"."admins" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "admins_write_service_role" ON "public"."admins" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."affiliate_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_credit_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."albums" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone can like" ON "public"."story_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."artist_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_behavior_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_guestbook" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_payment_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_post_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_post_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artist_posts_delete" ON "public"."artist_posts" FOR DELETE USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "artist_posts_insert" ON "public"."artist_posts" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "artist_posts_select" ON "public"."artist_posts" FOR SELECT USING (true);



ALTER TABLE "public"."artist_stories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_themes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_thoughts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_tier_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artist_voice_memos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."artists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artists_retail_admin_read" ON "public"."artists" FOR SELECT USING ("public"."is_retail_admin"());



CREATE POLICY "artists_select" ON "public"."artists" FOR SELECT USING (true);



ALTER TABLE "public"."beat_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_xp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_room_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_word_filters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collab_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "collab_messages_insert" ON "public"."collab_messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) AND ("request_id" IN ( SELECT "collab_requests"."id"
   FROM "public"."collab_requests"
  WHERE (("collab_requests"."status" = 'accepted'::"text") AND (("collab_requests"."from_artist_id" = ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("collab_requests"."to_artist_id" = ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "collab_messages_select" ON "public"."collab_messages" FOR SELECT USING (("request_id" IN ( SELECT "collab_requests"."id"
   FROM "public"."collab_requests"
  WHERE (("collab_requests"."from_artist_id" = ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("collab_requests"."to_artist_id" = ( SELECT "artists"."id"
           FROM "public"."artists"
          WHERE ("artists"."user_id" = "auth"."uid"())))))));



ALTER TABLE "public"."collab_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "collab_requests_insert" ON "public"."collab_requests" FOR INSERT WITH CHECK (("from_artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "collab_requests_select" ON "public"."collab_requests" FOR SELECT USING ((("from_artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("to_artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "collab_requests_update" ON "public"."collab_requests" FOR UPDATE USING ((("to_artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("from_artist_id" = ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."collaborations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete_own_or_admin" ON "public"."artist_post_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"())))));



CREATE POLICY "comments_insert_own" ON "public"."artist_post_comments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "comments_select_public" ON "public"."artist_post_comments" FOR SELECT USING (true);



ALTER TABLE "public"."competition_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competition_entries_insert" ON "public"."competition_entries" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "competition_entries_select" ON "public"."competition_entries" FOR SELECT USING ((("is_visible" = true) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "competition_entries_write" ON "public"."competition_entries" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."competition_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competition_user_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competition_user_votes_read" ON "public"."competition_user_votes" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "competition_user_votes_select" ON "public"."competition_user_votes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "competition_user_votes_upsert" ON "public"."competition_user_votes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."competition_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competition_votes_insert" ON "public"."competition_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "competition_votes_select" ON "public"."competition_votes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competitions_read" ON "public"."competitions" FOR SELECT USING (true);



CREATE POLICY "competitions_write" ON "public"."competitions" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "completions_insert_own" ON "public"."challenge_completions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "completions_select_all" ON "public"."challenge_completions" FOR SELECT USING (true);



CREATE POLICY "credit_redemptions_admin_all" ON "public"."affiliate_credit_redemptions" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "credit_redemptions_self_select" ON "public"."affiliate_credit_redemptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."credits_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_artist_spotlight" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."downloads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "el_admin_read" ON "public"."engagement_learning" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "el_service_write" ON "public"."engagement_learning" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."email_subscribers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engagement_admin_insert" ON "public"."engagement_messages" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "engagement_admin_read" ON "public"."engagement_messages" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."engagement_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engagement_config_admin" ON "public"."engagement_config" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "engagement_config_read" ON "public"."engagement_config" FOR SELECT USING (true);



ALTER TABLE "public"."engagement_learning" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."engagement_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."engagement_outcomes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engagement_read_own" ON "public"."engagement_messages" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "entries_admin_all" ON "public"."competition_entries" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "entries_insert_own" ON "public"."competition_entries" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "entries_read_public" ON "public"."competition_entries" FOR SELECT USING ((("is_visible" = true) OR ("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"())))));



CREATE POLICY "eo_admin_read" ON "public"."engagement_outcomes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "eo_service_write" ON "public"."engagement_outcomes" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."external_plays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fraud_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."global_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_hero" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_hero_admin_all" ON "public"."home_hero" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "home_hero_read_active" ON "public"."home_hero" FOR SELECT USING (("is_active" = true));



CREATE POLICY "judges_admin_write" ON "public"."school_sessions_judges" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "judges_select" ON "public"."school_sessions_judges" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "lbp_admin_read" ON "public"."listener_behavior_profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."user_id" = "auth"."uid"()))));



CREATE POLICY "lbp_own_read" ON "public"."listener_behavior_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "lbp_service_write" ON "public"."listener_behavior_profiles" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."listener_behavior_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listener_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listener_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listener_themes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listener_tier_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listeners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listening_session_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listening_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_wrapped_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_editors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "newsletter_editors_admin_write" ON "public"."newsletter_editors" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "newsletter_editors_select" ON "public"."newsletter_editors" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



ALTER TABLE "public"."newsletter_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "newsletter_posts_admin_all" ON "public"."newsletter_posts" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "newsletter_posts_public_select" ON "public"."newsletter_posts" FOR SELECT USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own likes visible" ON "public"."story_likes" FOR SELECT USING (true);



ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payouts_admin" ON "public"."competition_payouts" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "payouts_admin_only" ON "public"."competition_payouts" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."playlist_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."playlist_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."playlists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "polls_insert" ON "public"."chat_polls" FOR INSERT TO "authenticated" WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "polls_read" ON "public"."chat_polls" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (true);



ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retail_ad_plays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_ad_plays_admin_all" ON "public"."retail_ad_plays" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_ad_plays_retail_admin_all" ON "public"."retail_ad_plays" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_ad_plays_venue_insert" ON "public"."retail_ad_plays" FOR INSERT WITH CHECK (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text")))));



ALTER TABLE "public"."retail_ad_revenue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_ad_revenue_admin_all" ON "public"."retail_ad_revenue" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."retail_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_admins_platform_admin_all" ON "public"."retail_admins" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_admins_self_read" ON "public"."retail_admins" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."retail_ads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_ads_admin_all" ON "public"."retail_ads" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_ads_retail_admin_all" ON "public"."retail_ads" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_ads_venue_select" ON "public"."retail_ads" FOR SELECT USING ((("is_active" = true) AND (("venue_id" IS NULL) OR ("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text"))))));



ALTER TABLE "public"."retail_artist_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_artist_payouts_admin_all" ON "public"."retail_artist_payouts" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_artist_payouts_artist_select" ON "public"."retail_artist_payouts" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_catalog_admin_all" ON "public"."retail_catalog" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_catalog_retail_admin_all" ON "public"."retail_catalog" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_locations_admin_all" ON "public"."retail_venue_locations" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_locations_self_select" ON "public"."retail_venue_locations" FOR SELECT USING (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_notification_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_notification_reads_admin_all" ON "public"."retail_notification_reads" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_notification_reads_venue_manage" ON "public"."retail_notification_reads" USING (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"())))) WITH CHECK (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_notifications_admin_all" ON "public"."retail_notifications" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_notifications_retail_admin_all" ON "public"."retail_notifications" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_notifications_venue_select" ON "public"."retail_notifications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text")))));



ALTER TABLE "public"."retail_payout_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_payout_periods_admin_all" ON "public"."retail_payout_periods" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."retail_pitches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_pitches_admin_all" ON "public"."retail_pitches" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_pitches_artist_insert" ON "public"."retail_pitches" FOR INSERT WITH CHECK (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "retail_pitches_artist_select" ON "public"."retail_pitches" FOR SELECT USING (("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))));



CREATE POLICY "retail_pitches_retail_admin_all" ON "public"."retail_pitches" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



ALTER TABLE "public"."retail_play_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_play_logs_admin_all" ON "public"."retail_play_logs" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_play_logs_retail_admin_all" ON "public"."retail_play_logs" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_play_logs_venue_insert" ON "public"."retail_play_logs" FOR INSERT WITH CHECK (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text")))));



CREATE POLICY "retail_play_logs_venue_select" ON "public"."retail_play_logs" FOR SELECT USING (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_playlist_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_playlist_proposals_admin_all" ON "public"."retail_playlist_proposals" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_playlist_proposals_retail_admin_all" ON "public"."retail_playlist_proposals" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



ALTER TABLE "public"."retail_playlist_tracks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_playlist_tracks_admin_all" ON "public"."retail_playlist_tracks" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_playlist_tracks_retail_admin_all" ON "public"."retail_playlist_tracks" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_playlist_tracks_venue_select" ON "public"."retail_playlist_tracks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text")))));



ALTER TABLE "public"."retail_playlists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_playlists_admin_all" ON "public"."retail_playlists" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_playlists_retail_admin_all" ON "public"."retail_playlists" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_playlists_venue_select" ON "public"."retail_playlists" FOR SELECT USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."retail_venues"
  WHERE (("retail_venues"."user_id" = "auth"."uid"()) AND ("retail_venues"."status" = 'active'::"text"))))));



ALTER TABLE "public"."retail_price_guide" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_price_guide_admin_all" ON "public"."retail_price_guide" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_price_guide_retail_admin_all" ON "public"."retail_price_guide" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



ALTER TABLE "public"."retail_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_subscriptions_admin_all" ON "public"."retail_subscriptions" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_subscriptions_retail_admin_all" ON "public"."retail_subscriptions" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_subscriptions_self_select" ON "public"."retail_subscriptions" FOR SELECT USING (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_venue_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_venue_likes_admin_all" ON "public"."retail_venue_likes" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_venue_likes_retail_admin_all" ON "public"."retail_venue_likes" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_venue_likes_venue_manage" ON "public"."retail_venue_likes" USING (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"())))) WITH CHECK (("venue_id" IN ( SELECT "retail_venues"."id"
   FROM "public"."retail_venues"
  WHERE ("retail_venues"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."retail_venue_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_venue_locations_retail_admin_all" ON "public"."retail_venue_locations" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



ALTER TABLE "public"."retail_venues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "retail_venues_admin_all" ON "public"."retail_venues" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "retail_venues_retail_admin_all" ON "public"."retail_venues" USING ("public"."is_retail_admin"()) WITH CHECK ("public"."is_retail_admin"());



CREATE POLICY "retail_venues_self_select" ON "public"."retail_venues" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."school_sessions_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_config_select" ON "public"."school_sessions_config" FOR SELECT USING (true);



CREATE POLICY "school_sessions_config_write" ON "public"."school_sessions_config" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "school_sessions_consents_insert" ON "public"."school_sessions_guardian_consents" FOR INSERT WITH CHECK ((("entry_id" IN ( SELECT "e"."id"
   FROM ("public"."school_sessions_entries" "e"
     JOIN "public"."artists" "a" ON (("a"."id" = "e"."artist_id")))
  WHERE ("a"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "school_sessions_consents_select" ON "public"."school_sessions_guardian_consents" FOR SELECT USING ((("entry_id" IN ( SELECT "e"."id"
   FROM ("public"."school_sessions_entries" "e"
     JOIN "public"."artists" "a" ON (("a"."id" = "e"."artist_id")))
  WHERE ("a"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



ALTER TABLE "public"."school_sessions_district_nominations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_sessions_district_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_district_votes_insert" ON "public"."school_sessions_district_votes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("nomination_id" IN ( SELECT "school_sessions_district_nominations"."id"
   FROM "public"."school_sessions_district_nominations"
  WHERE (("school_sessions_district_nominations"."is_approved" = true) AND ("school_sessions_district_nominations"."season_requested" = "school_sessions_district_votes"."season_requested"))))));



CREATE POLICY "school_sessions_district_votes_select" ON "public"."school_sessions_district_votes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



ALTER TABLE "public"."school_sessions_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_entries_insert" ON "public"."school_sessions_entries" FOR INSERT WITH CHECK ((("artist_id" IN ( SELECT "artists"."id"
   FROM "public"."artists"
  WHERE ("artists"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "school_sessions_entries_select" ON "public"."school_sessions_entries" FOR SELECT USING (true);



CREATE POLICY "school_sessions_entries_update" ON "public"."school_sessions_entries" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."school_sessions_entry_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_entry_members_delete" ON "public"."school_sessions_entry_members" FOR DELETE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "school_sessions_entry_members_insert" ON "public"."school_sessions_entry_members" FOR INSERT WITH CHECK ((("entry_id" IN ( SELECT "e"."id"
   FROM ("public"."school_sessions_entries" "e"
     JOIN "public"."artists" "a" ON (("a"."id" = "e"."artist_id")))
  WHERE ("a"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "school_sessions_entry_members_select" ON "public"."school_sessions_entry_members" FOR SELECT USING (true);



CREATE POLICY "school_sessions_entry_members_write" ON "public"."school_sessions_entry_members" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."school_sessions_guardian_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_sessions_judges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_nominations_delete" ON "public"."school_sessions_district_nominations" FOR DELETE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "school_sessions_nominations_insert" ON "public"."school_sessions_district_nominations" FOR INSERT WITH CHECK (true);



CREATE POLICY "school_sessions_nominations_select" ON "public"."school_sessions_district_nominations" FOR SELECT USING ((("is_approved" = true) OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



CREATE POLICY "school_sessions_nominations_update" ON "public"."school_sessions_district_nominations" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."school_sessions_schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_schools_select" ON "public"."school_sessions_schools" FOR SELECT USING (true);



CREATE POLICY "school_sessions_schools_write" ON "public"."school_sessions_schools" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "school_sessions_shortlist_select" ON "public"."school_sessions_shortlist_songs" FOR SELECT USING (true);



ALTER TABLE "public"."school_sessions_shortlist_songs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_shortlist_write" ON "public"."school_sessions_shortlist_songs" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



ALTER TABLE "public"."school_sessions_verification_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_sessions_vip_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_sessions_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_sessions_votes_insert" ON "public"."school_sessions_votes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("entry_id" IN ( SELECT "school_sessions_entries"."id"
   FROM "public"."school_sessions_entries"
  WHERE (("school_sessions_entries"."competition_id" = "school_sessions_votes"."competition_id") AND ("school_sessions_entries"."is_finalist" = true))))));



CREATE POLICY "school_sessions_votes_select" ON "public"."school_sessions_votes" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))));



ALTER TABLE "public"."session_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_priority_boosts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_review_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."story_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "streaks_own_insert" ON "public"."user_streaks" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "streaks_own_select" ON "public"."user_streaks" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "streaks_own_update" ON "public"."user_streaks" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."streams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."thought_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."thought_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tiers_read" ON "public"."platform_tiers" FOR SELECT USING (true);



ALTER TABLE "public"."tip_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_collaborations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_comment_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_presaves" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_stems" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracks_retail_admin_read" ON "public"."tracks" FOR SELECT USING (("public"."is_retail_admin"() AND ("is_published" = true)));



CREATE POLICY "unlike own" ON "public"."story_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_insert" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_profiles_select" ON "public"."user_profiles" FOR SELECT USING (true);



CREATE POLICY "user_profiles_update" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_streaks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_votes_admin" ON "public"."competition_user_votes" FOR SELECT USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "verification_codes_admin_all" ON "public"."school_sessions_verification_codes" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "vip_candidates_admin_all" ON "public"."school_sessions_vip_candidates" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "votes_insert" ON "public"."chat_poll_votes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_insert" ON "public"."competition_votes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "votes_read" ON "public"."chat_poll_votes" FOR SELECT USING (true);



CREATE POLICY "votes_read_own" ON "public"."competition_votes" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wheel_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wheel_challenges_read" ON "public"."wheel_challenges" FOR SELECT USING (true);



CREATE POLICY "wheel_challenges_select" ON "public"."wheel_challenges" FOR SELECT USING (true);



CREATE POLICY "wheel_challenges_service_write" ON "public"."wheel_challenges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "wheel_challenges_write" ON "public"."wheel_challenges" USING (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins"))) WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "wrapped_admin_insert" ON "public"."monthly_wrapped_log" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "admins"."user_id"
   FROM "public"."admins")));



CREATE POLICY "wrapped_own_select" ON "public"."monthly_wrapped_log" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "xp_insert_own" ON "public"."challenge_xp" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "xp_select_all" ON "public"."challenge_xp" FOR SELECT USING (true);



CREATE POLICY "xp_update_own" ON "public"."challenge_xp" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_home_hero"("p_hero_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_home_hero"("p_hero_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_home_hero"("p_hero_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_email_subscriber_after_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_email_subscriber_after_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_email_subscriber_after_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_approve_affiliate"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_approve_affiliate"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_approve_affiliate"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_find_user_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_find_user_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_find_user_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_fulfill_redemption"("p_redemption_id" "uuid", "p_approve" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_fulfill_redemption"("p_redemption_id" "uuid", "p_approve" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_fulfill_redemption"("p_redemption_id" "uuid", "p_approve" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_remove_track"("p_track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_remove_track"("p_track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_remove_track"("p_track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_suspend_artist"("p_artist_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_suspend_artist"("p_artist_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_suspend_artist"("p_artist_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unsuspend_artist"("p_artist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unsuspend_artist"("p_artist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unsuspend_artist"("p_artist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_playlist_proposal"("p_proposal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_playlist_proposal"("p_proposal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_playlist_proposal"("p_proposal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."artist_can"("p_artist_id" "uuid", "p_feature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."artist_can"("p_artist_id" "uuid", "p_feature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."artist_can"("p_artist_id" "uuid", "p_feature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."artist_can_upload"("p_artist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."artist_can_upload"("p_artist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."artist_can_upload"("p_artist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_flag_stream_abuse"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_flag_stream_abuse"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_flag_stream_abuse"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ban_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ban_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ban_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."block_explicit_retail_catalog"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_explicit_retail_catalog"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_explicit_retail_catalog"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_explicit_retail_track"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_explicit_retail_track"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_explicit_retail_track"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."boost_track_streams"("p_track_id" "uuid", "p_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_engagement_score"("p_track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_engagement_score"("p_track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_engagement_score"("p_track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_retail_payout"("p_period_start" "date", "p_period_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_retail_payout"("p_period_start" "date", "p_period_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_retail_payout"("p_period_start" "date", "p_period_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_affiliate_eligibility"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_affiliate_eligibility"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_affiliate_eligibility"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_increment_streak"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_increment_streak"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_increment_streak"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_follower_milestones"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_follower_milestones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_follower_milestones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_listener_like_milestones"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_listener_like_milestones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_listener_like_milestones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_listener_stream_milestones"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_listener_stream_milestones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_listener_stream_milestones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_stream_milestones"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_stream_milestones"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_stream_milestones"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_venue_signup"("p_token" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_venue_signup"("p_token" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_venue_signup"("p_token" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_artist_to_listener"() TO "anon";
GRANT ALL ON FUNCTION "public"."convert_artist_to_listener"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_artist_to_listener"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_fraud_flag"("p_entity_type" "text", "p_entity_id" "uuid", "p_flag_type" "text", "p_severity" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_fraud_flag"("p_entity_type" "text", "p_entity_id" "uuid", "p_flag_type" "text", "p_severity" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fraud_flag"("p_entity_type" "text", "p_entity_id" "uuid", "p_flag_type" "text", "p_severity" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_story_likes"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_story_likes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_story_likes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_bpm_from_filename"("filename" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_bpm_from_filename"("filename" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_bpm_from_filename"("filename" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_key_from_filename"("filename" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_key_from_filename"("filename" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_key_from_filename"("filename" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_playlist_proposals"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_playlist_proposals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_playlist_proposals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_venue_signup_token"("p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_venue_signup_token"("p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_venue_signup_token"("p_venue_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_verification_codes"("p_count" integer, "p_school_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_verification_codes"("p_count" integer, "p_school_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_verification_codes"("p_count" integer, "p_school_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_district_vote_counts"("p_season" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_district_vote_counts"("p_season" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_district_vote_counts"("p_season" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_school_sessions_vote_counts"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_school_sessions_vote_counts"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_school_sessions_vote_counts"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_venue_by_signup_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_venue_by_signup_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_venue_by_signup_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_venue_playlist_recommendations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_venue_playlist_recommendations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_venue_playlist_recommendations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_listener"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_listener"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_listener"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_voted_school_sessions"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_voted_school_sessions"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_voted_school_sessions"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment"("x" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment"("x" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment"("x" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_affiliate_clicks"("p_affiliate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_affiliate_clicks"("p_affiliate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_affiliate_clicks"("p_affiliate_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_affiliate_stats"("p_affiliate_id" "uuid", "p_signups" integer, "p_conversions" integer, "p_credits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_affiliate_stats"("p_affiliate_id" "uuid", "p_signups" integer, "p_conversions" integer, "p_credits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_affiliate_stats"("p_affiliate_id" "uuid", "p_signups" integer, "p_conversions" integer, "p_credits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_artist_streams"("artist_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_artist_streams"("artist_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_artist_streams"("artist_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_chat_member_count"("room_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_chat_member_count"("room_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_chat_member_count"("room_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_competition_entry_votes"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_competition_entry_votes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_competition_entry_votes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_decimal"("x" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_decimal"("x" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_decimal"("x" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_download_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_download_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_download_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_download_count"("track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_download_count"("track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_download_count"("track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_entry_votes"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_entry_votes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_entry_votes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_external_play"("p_track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_external_play"("p_track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_external_play"("p_track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_pending_balance"("p_artist_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_pending_balance"("p_artist_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_pending_balance"("p_artist_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_plays"("sample_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_plays"("sample_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_plays"("sample_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_story_likes"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_story_likes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_story_likes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_story_views"("story_id_input" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_story_views"("story_id_input" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_story_views"("story_id_input" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_stream_count"("track_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_stream_count"("track_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_stream_count"("track_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_track_download_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_track_download_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_track_download_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_retail_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_retail_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_retail_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."issue_vip_candidate"("p_name" "text", "p_ref_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_vip_candidate"("p_name" "text", "p_ref_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_vip_candidate"("p_name" "text", "p_ref_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."judge_set_finalist"("p_entry_id" "uuid", "p_value" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."judge_set_finalist"("p_entry_id" "uuid", "p_value" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."judge_set_finalist"("p_entry_id" "uuid", "p_value" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."judge_set_winner"("p_entry_id" "uuid", "p_value" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."judge_set_winner"("p_entry_id" "uuid", "p_value" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."judge_set_winner"("p_entry_id" "uuid", "p_value" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_stream"("p_track_id" "uuid", "p_user_id" "uuid", "p_duration_played" integer, "p_completed" boolean, "p_platform" "text", "p_device_type" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_stream"("p_track_id" "uuid", "p_user_id" "uuid", "p_duration_played" integer, "p_completed" boolean, "p_platform" "text", "p_device_type" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_stream"("p_track_id" "uuid", "p_user_id" "uuid", "p_duration_played" integer, "p_completed" boolean, "p_platform" "text", "p_device_type" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_first_listener"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_first_listener"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_first_listener"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_artist_new_stream"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_artist_new_stream"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_artist_new_stream"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_artist_suspended"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_artist_suspended"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_artist_suspended"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_followers_artist_milestone"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_followers_artist_milestone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_followers_artist_milestone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_followers_new_track"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_followers_new_track"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_followers_new_track"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_track"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_track"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_track"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_track_like"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_track_like"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_track_like"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_stream_update_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_stream_update_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_stream_update_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_stream_spam"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_stream_spam"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_stream_spam"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_privilege_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_privilege_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_privilege_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_engagement_scores"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_engagement_scores"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_engagement_scores"() TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_verification_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_verification_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_verification_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_engagement_scores"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_engagement_scores"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_engagement_scores"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_global_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_global_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_global_analytics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_newly_explicit_from_retail"() TO "anon";
GRANT ALL ON FUNCTION "public"."remove_newly_explicit_from_retail"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_newly_explicit_from_retail"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_credit_redemption"("p_reward_key" "text", "p_reward_label" "text", "p_cost" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."request_credit_redemption"("p_reward_key" "text", "p_reward_label" "text", "p_cost" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_credit_redemption"("p_reward_key" "text", "p_reward_label" "text", "p_cost" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."retail_play_to_stream"() TO "anon";
GRANT ALL ON FUNCTION "public"."retail_play_to_stream"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."retail_play_to_stream"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text", "p_youtube_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text", "p_youtube_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_newsletter"("p_title" "text", "p_excerpt" "text", "p_body" "text", "p_audience" "text", "p_youtube_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."streams_set_artist_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."streams_set_artist_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."streams_set_artist_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_artist_follower_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_artist_follower_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_artist_follower_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_artist_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_artist_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_artist_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_artist_total_streams"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_artist_total_streams"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_artist_total_streams"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_artist_track_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_artist_track_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_artist_track_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_download_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_download_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_download_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_follow_to_contacts"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_follow_to_contacts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_follow_to_contacts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_follower_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_follower_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_follower_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_post_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_post_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_post_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_post_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_play"("p_sample_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."track_play"("p_sample_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_play"("p_sample_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_engagement"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_engagement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_engagement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_engagement_likes"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_engagement_likes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_engagement_likes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_collaborations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_collaborations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_collaborations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_seen"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_seen"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_seen"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_track_favorite_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_track_favorite_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_track_favorite_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_track_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_track_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_track_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_track_save_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_track_save_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_track_save_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_listening_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_listening_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_listening_stats"() TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_clicks" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_conversions" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_credit_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_credit_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_credit_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_payouts" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."affiliates" TO "anon";
GRANT ALL ON TABLE "public"."affiliates" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliates" TO "service_role";



GRANT ALL ON TABLE "public"."albums" TO "anon";
GRANT ALL ON TABLE "public"."albums" TO "authenticated";
GRANT ALL ON TABLE "public"."albums" TO "service_role";



GRANT ALL ON TABLE "public"."artist_alerts" TO "anon";
GRANT ALL ON TABLE "public"."artist_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."artist_behavior_profiles" TO "anon";
GRANT ALL ON TABLE "public"."artist_behavior_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_behavior_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."artist_contacts" TO "anon";
GRANT ALL ON TABLE "public"."artist_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."artist_guestbook" TO "anon";
GRANT ALL ON TABLE "public"."artist_guestbook" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_guestbook" TO "service_role";



GRANT ALL ON TABLE "public"."artist_payment_profiles" TO "anon";
GRANT ALL ON TABLE "public"."artist_payment_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_payment_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."artist_post_comments" TO "anon";
GRANT ALL ON TABLE "public"."artist_post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."artist_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."artist_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."artist_posts" TO "anon";
GRANT ALL ON TABLE "public"."artist_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_posts" TO "service_role";



GRANT ALL ON TABLE "public"."artist_stories" TO "anon";
GRANT ALL ON TABLE "public"."artist_stories" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_stories" TO "service_role";



GRANT ALL ON TABLE "public"."artist_themes" TO "anon";
GRANT ALL ON TABLE "public"."artist_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_themes" TO "service_role";



GRANT ALL ON TABLE "public"."artist_thoughts" TO "anon";
GRANT ALL ON TABLE "public"."artist_thoughts" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_thoughts" TO "service_role";



GRANT ALL ON TABLE "public"."artist_tier_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."artist_tier_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_tier_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."artist_voice_memos" TO "anon";
GRANT ALL ON TABLE "public"."artist_voice_memos" TO "authenticated";
GRANT ALL ON TABLE "public"."artist_voice_memos" TO "service_role";



GRANT ALL ON TABLE "public"."artists" TO "anon";
GRANT ALL ON TABLE "public"."artists" TO "authenticated";
GRANT ALL ON TABLE "public"."artists" TO "service_role";



GRANT ALL ON TABLE "public"."beat_purchases" TO "anon";
GRANT ALL ON TABLE "public"."beat_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."beat_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_completions" TO "anon";
GRANT ALL ON TABLE "public"."challenge_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_completions" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_xp" TO "anon";
GRANT ALL ON TABLE "public"."challenge_xp" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_xp" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."chat_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."chat_polls" TO "anon";
GRANT ALL ON TABLE "public"."chat_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_polls" TO "service_role";



GRANT ALL ON TABLE "public"."chat_reactions" TO "anon";
GRANT ALL ON TABLE "public"."chat_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_room_members" TO "anon";
GRANT ALL ON TABLE "public"."chat_room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_room_members" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."chat_word_filters" TO "anon";
GRANT ALL ON TABLE "public"."chat_word_filters" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_word_filters" TO "service_role";



GRANT ALL ON TABLE "public"."collab_messages" TO "anon";
GRANT ALL ON TABLE "public"."collab_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."collab_messages" TO "service_role";



GRANT ALL ON TABLE "public"."collab_requests" TO "anon";
GRANT ALL ON TABLE "public"."collab_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."collab_requests" TO "service_role";



GRANT ALL ON TABLE "public"."collaborations" TO "anon";
GRANT ALL ON TABLE "public"."collaborations" TO "authenticated";
GRANT ALL ON TABLE "public"."collaborations" TO "service_role";



GRANT ALL ON TABLE "public"."competition_entries" TO "anon";
GRANT ALL ON TABLE "public"."competition_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_entries" TO "service_role";



GRANT ALL ON TABLE "public"."competition_payouts" TO "anon";
GRANT ALL ON TABLE "public"."competition_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."competition_user_votes" TO "anon";
GRANT ALL ON TABLE "public"."competition_user_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_user_votes" TO "service_role";



GRANT ALL ON TABLE "public"."competition_votes" TO "anon";
GRANT ALL ON TABLE "public"."competition_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_votes" TO "service_role";



GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";



GRANT ALL ON TABLE "public"."credits_transactions" TO "anon";
GRANT ALL ON TABLE "public"."credits_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credits_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_artist_spotlight" TO "anon";
GRANT ALL ON TABLE "public"."daily_artist_spotlight" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_artist_spotlight" TO "service_role";



GRANT ALL ON TABLE "public"."downloads" TO "anon";
GRANT ALL ON TABLE "public"."downloads" TO "authenticated";
GRANT ALL ON TABLE "public"."downloads" TO "service_role";



GRANT ALL ON TABLE "public"."email_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."email_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."email_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."engagement_config" TO "anon";
GRANT ALL ON TABLE "public"."engagement_config" TO "authenticated";
GRANT ALL ON TABLE "public"."engagement_config" TO "service_role";



GRANT ALL ON TABLE "public"."engagement_learning" TO "anon";
GRANT ALL ON TABLE "public"."engagement_learning" TO "authenticated";
GRANT ALL ON TABLE "public"."engagement_learning" TO "service_role";



GRANT ALL ON TABLE "public"."engagement_messages" TO "anon";
GRANT ALL ON TABLE "public"."engagement_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."engagement_messages" TO "service_role";



GRANT ALL ON TABLE "public"."engagement_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."engagement_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."engagement_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."external_plays" TO "anon";
GRANT ALL ON TABLE "public"."external_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."external_plays" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."fraud_flags" TO "anon";
GRANT ALL ON TABLE "public"."fraud_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."fraud_flags" TO "service_role";



GRANT ALL ON TABLE "public"."global_contacts" TO "anon";
GRANT ALL ON TABLE "public"."global_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."global_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."home_hero" TO "anon";
GRANT ALL ON TABLE "public"."home_hero" TO "authenticated";
GRANT ALL ON TABLE "public"."home_hero" TO "service_role";



GRANT ALL ON TABLE "public"."listener_behavior_profiles" TO "anon";
GRANT ALL ON TABLE "public"."listener_behavior_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_behavior_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."listener_feedback" TO "anon";
GRANT ALL ON TABLE "public"."listener_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."streams" TO "anon";
GRANT ALL ON TABLE "public"."streams" TO "authenticated";
GRANT ALL ON TABLE "public"."streams" TO "service_role";



GRANT ALL ON TABLE "public"."tracks" TO "anon";
GRANT ALL ON TABLE "public"."tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."tracks" TO "service_role";



GRANT ALL ON TABLE "public"."listener_monthly_stats" TO "anon";
GRANT ALL ON TABLE "public"."listener_monthly_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_monthly_stats" TO "service_role";



GRANT ALL ON TABLE "public"."listener_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."listener_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."listener_themes" TO "anon";
GRANT ALL ON TABLE "public"."listener_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_themes" TO "service_role";



GRANT ALL ON TABLE "public"."listener_tier_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."listener_tier_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."listener_tier_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."listeners" TO "anon";
GRANT ALL ON TABLE "public"."listeners" TO "authenticated";
GRANT ALL ON TABLE "public"."listeners" TO "service_role";



GRANT ALL ON TABLE "public"."listening_session_queue" TO "anon";
GRANT ALL ON TABLE "public"."listening_session_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."listening_session_queue" TO "service_role";



GRANT ALL ON TABLE "public"."listening_sessions" TO "anon";
GRANT ALL ON TABLE "public"."listening_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."listening_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_wrapped_log" TO "anon";
GRANT ALL ON TABLE "public"."monthly_wrapped_log" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_wrapped_log" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_editors" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_editors" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_editors" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_posts" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_posts" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_tiers" TO "anon";
GRANT ALL ON TABLE "public"."platform_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."playlist_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."playlist_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."playlist_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."playlist_tracks" TO "anon";
GRANT ALL ON TABLE "public"."playlist_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."playlist_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."playlists" TO "anon";
GRANT ALL ON TABLE "public"."playlists" TO "authenticated";
GRANT ALL ON TABLE "public"."playlists" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."popular_genres_by_country" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."popular_genres_by_country" TO "authenticated";
GRANT ALL ON TABLE "public"."popular_genres_by_country" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."retail_ad_plays" TO "anon";
GRANT ALL ON TABLE "public"."retail_ad_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_ad_plays" TO "service_role";



GRANT ALL ON TABLE "public"."retail_ad_revenue" TO "anon";
GRANT ALL ON TABLE "public"."retail_ad_revenue" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_ad_revenue" TO "service_role";



GRANT ALL ON TABLE "public"."retail_admins" TO "anon";
GRANT ALL ON TABLE "public"."retail_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_admins" TO "service_role";



GRANT ALL ON TABLE "public"."retail_ads" TO "anon";
GRANT ALL ON TABLE "public"."retail_ads" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_ads" TO "service_role";



GRANT ALL ON TABLE "public"."retail_artist_payouts" TO "anon";
GRANT ALL ON TABLE "public"."retail_artist_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_artist_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."retail_catalog" TO "anon";
GRANT ALL ON TABLE "public"."retail_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."retail_notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."retail_notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."retail_notifications" TO "anon";
GRANT ALL ON TABLE "public"."retail_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."retail_payout_periods" TO "anon";
GRANT ALL ON TABLE "public"."retail_payout_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_payout_periods" TO "service_role";



GRANT ALL ON TABLE "public"."retail_pitches" TO "anon";
GRANT ALL ON TABLE "public"."retail_pitches" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_pitches" TO "service_role";



GRANT ALL ON TABLE "public"."retail_play_logs" TO "anon";
GRANT ALL ON TABLE "public"."retail_play_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_play_logs" TO "service_role";



GRANT ALL ON TABLE "public"."retail_playlist_proposals" TO "anon";
GRANT ALL ON TABLE "public"."retail_playlist_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_playlist_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."retail_playlist_tracks" TO "anon";
GRANT ALL ON TABLE "public"."retail_playlist_tracks" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_playlist_tracks" TO "service_role";



GRANT ALL ON TABLE "public"."retail_playlists" TO "anon";
GRANT ALL ON TABLE "public"."retail_playlists" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_playlists" TO "service_role";



GRANT ALL ON TABLE "public"."retail_price_guide" TO "anon";
GRANT ALL ON TABLE "public"."retail_price_guide" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_price_guide" TO "service_role";



GRANT ALL ON TABLE "public"."retail_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."retail_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."retail_venue_likes" TO "anon";
GRANT ALL ON TABLE "public"."retail_venue_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_venue_likes" TO "service_role";



GRANT ALL ON TABLE "public"."retail_venue_locations" TO "anon";
GRANT ALL ON TABLE "public"."retail_venue_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_venue_locations" TO "service_role";



GRANT ALL ON TABLE "public"."retail_venues" TO "anon";
GRANT ALL ON TABLE "public"."retail_venues" TO "authenticated";
GRANT ALL ON TABLE "public"."retail_venues" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_config" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_config" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_config" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_district_nominations" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_district_nominations" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_district_nominations" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_district_votes" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_district_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_district_votes" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_entries" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_entries" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_entry_members" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_entry_members" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_entry_members" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_guardian_consents" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_guardian_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_guardian_consents" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_judges" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_judges" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_judges" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_schools" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_schools" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_schools" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_shortlist_songs" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_shortlist_songs" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_shortlist_songs" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_verification_codes" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_verification_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_verification_codes" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_vip_candidates" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_vip_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_vip_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."school_sessions_votes" TO "anon";
GRANT ALL ON TABLE "public"."school_sessions_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."school_sessions_votes" TO "service_role";



GRANT ALL ON TABLE "public"."session_messages" TO "anon";
GRANT ALL ON TABLE "public"."session_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."session_messages" TO "service_role";



GRANT ALL ON TABLE "public"."session_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."session_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."session_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."session_polls" TO "anon";
GRANT ALL ON TABLE "public"."session_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."session_polls" TO "service_role";



GRANT ALL ON TABLE "public"."session_priority_boosts" TO "anon";
GRANT ALL ON TABLE "public"."session_priority_boosts" TO "authenticated";
GRANT ALL ON TABLE "public"."session_priority_boosts" TO "service_role";



GRANT ALL ON TABLE "public"."session_review_submissions" TO "anon";
GRANT ALL ON TABLE "public"."session_review_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."session_review_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."story_likes" TO "anon";
GRANT ALL ON TABLE "public"."story_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."story_likes" TO "service_role";



GRANT ALL ON TABLE "public"."story_views" TO "anon";
GRANT ALL ON TABLE "public"."story_views" TO "authenticated";
GRANT ALL ON TABLE "public"."story_views" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."thought_comments" TO "anon";
GRANT ALL ON TABLE "public"."thought_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."thought_comments" TO "service_role";



GRANT ALL ON TABLE "public"."thought_reactions" TO "anon";
GRANT ALL ON TABLE "public"."thought_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."thought_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."tip_goals" TO "anon";
GRANT ALL ON TABLE "public"."tip_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."tip_goals" TO "service_role";



GRANT ALL ON TABLE "public"."tips" TO "anon";
GRANT ALL ON TABLE "public"."tips" TO "authenticated";
GRANT ALL ON TABLE "public"."tips" TO "service_role";



GRANT ALL ON TABLE "public"."track_collaborations" TO "anon";
GRANT ALL ON TABLE "public"."track_collaborations" TO "authenticated";
GRANT ALL ON TABLE "public"."track_collaborations" TO "service_role";



GRANT ALL ON TABLE "public"."track_comment_reactions" TO "anon";
GRANT ALL ON TABLE "public"."track_comment_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."track_comment_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."track_comments" TO "anon";
GRANT ALL ON TABLE "public"."track_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."track_comments" TO "service_role";



GRANT ALL ON TABLE "public"."track_likes" TO "anon";
GRANT ALL ON TABLE "public"."track_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."track_likes" TO "service_role";



GRANT ALL ON TABLE "public"."track_presaves" TO "anon";
GRANT ALL ON TABLE "public"."track_presaves" TO "authenticated";
GRANT ALL ON TABLE "public"."track_presaves" TO "service_role";



GRANT ALL ON TABLE "public"."track_stems" TO "anon";
GRANT ALL ON TABLE "public"."track_stems" TO "authenticated";
GRANT ALL ON TABLE "public"."track_stems" TO "service_role";



GRANT ALL ON TABLE "public"."track_versions" TO "anon";
GRANT ALL ON TABLE "public"."track_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."track_versions" TO "service_role";



GRANT ALL ON TABLE "public"."user_bans" TO "anon";
GRANT ALL ON TABLE "public"."user_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_bans" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_demographics" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_demographics" TO "authenticated";
GRANT ALL ON TABLE "public"."user_demographics" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_streaks" TO "anon";
GRANT ALL ON TABLE "public"."user_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_streaks" TO "service_role";



GRANT ALL ON TABLE "public"."wheel_challenges" TO "anon";
GRANT ALL ON TABLE "public"."wheel_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."wheel_challenges" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







