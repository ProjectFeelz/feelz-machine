/**
 * useStreak.js
 *
 * Tracks two streaks for both artists and listeners:
 *   1. Daily app-open streak (current_streak / longest_streak)
 *   2. Daily artist discovery streak (discovery_streak / longest_discovery_streak)
 *      — incremented by calling recordDiscovery() when a user plays an artist
 *        they've never streamed before.
 *
 * Returns: { streak, longestStreak, discoveryStreak, recordDiscovery, loading }
 *
 * Double-increment fix:
 *   localStorage key is written BEFORE the DB await so that any concurrent
 *   call (React StrictMode double-invoke, route remount, auth re-render) that
 *   reads the key while the first write is still in-flight will bail out
 *   immediately instead of proceeding with a stale row.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

const MILESTONE_DAYS        = [3, 7, 14, 30, 60, 100];
const DISCOVERY_MILESTONES  = [3, 7, 14, 30];

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth()    &&
    da.getDate()     === db.getDate()
  );
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

export function useStreak(user) {
  const [streak,          setStreak]          = useState(0);
  const [longestStreak,   setLongestStreak]   = useState(0);
  const [discoveryStreak, setDiscoveryStreak] = useState(0);
  const [loading,         setLoading]         = useState(true);
  const discoveredTodayRef = useRef(false);
  const incrementingRef     = useRef(false); // in-memory lock for double-invoke

  // One key per user per day — written BEFORE the DB update to prevent
  // a second concurrent call from slipping through while the first is awaiting.
  const sessionKey = `streak_written_${user?.id}`;

  const checkAndUpdateStreak = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }

    try {
      const now   = new Date();
      const today = now.toISOString().split('T')[0];

      // ── Already ran for this user today ─────────────────────────────────────
      if (localStorage.getItem(sessionKey) === today) {
        // Still need to read + display the current values
        const { data: row } = await supabase
          .from('user_streaks').select('current_streak, longest_streak, discovery_streak')
          .eq('user_id', user.id).maybeSingle();
        if (row) {
          setStreak(row.current_streak || 0);
          setLongestStreak(row.longest_streak || 0);
          setDiscoveryStreak(row.discovery_streak || 0);
        }
        setLoading(false);
        return;
      }

      const { data: row } = await supabase
        .from('user_streaks').select('*')
        .eq('user_id', user.id).maybeSingle();

      // ── First ever visit — create the row ───────────────────────────────────
      if (!row) {
        // Claim the session slot BEFORE the insert to prevent double-insert
        localStorage.setItem(sessionKey, today);
        await supabase.from('user_streaks').insert({
          user_id:                  user.id,
          current_streak:           1,
          longest_streak:           1,
          last_active_date:         today,
          discovery_streak:         0,
          longest_discovery_streak: 0,
        });
        setStreak(1);
        setLongestStreak(1);
        setDiscoveryStreak(0);
        setLoading(false);
        return;
      }

      // Always show current values immediately
      setStreak(row.current_streak        || 0);
      setLongestStreak(row.longest_streak || 0);
      setDiscoveryStreak(row.discovery_streak || 0);

      const lastActive = new Date(row.last_active_date + 'T00:00:00');

      // ── Already active today per DB — nothing to increment ──────────────────
      if (isSameDay(lastActive, now)) {
        // Mark session so we skip the DB fetch next time too
        localStorage.setItem(sessionKey, today);
        setLoading(false);
        return;
      }

      // ── New day: claim the session slot BEFORE the DB write ─────────────────
      // incrementingRef is an in-memory lock to handle React StrictMode double-invoke
      if (incrementingRef.current) { setLoading(false); return; }
      incrementingRef.current = true;
      localStorage.setItem(sessionKey, today);

      const newStreak  = isYesterday(lastActive) ? (row.current_streak || 1) + 1 : 1;
      const newLongest = Math.max(newStreak, row.longest_streak || 0);

      await supabase
        .from('user_streaks')
        .update({
          current_streak:   newStreak,
          longest_streak:   newLongest,
          last_active_date: today,
        })
        .eq('user_id', user.id);

      setStreak(newStreak);
      setLongestStreak(newLongest);

      // ── Milestone notifications ──────────────────────────────────────────────
      if (MILESTONE_DAYS.includes(newStreak)) {
        const msgs = {
          3:   { title: '3-day streak 🔥',         body: "You're on a roll, 3 days straight on Feelz Machine." },
          7:   { title: 'One week streak 🔥🔥',     body: "Seven days running. The music doesn't stop with you." },
          14:  { title: '2 weeks straight 🔥🔥🔥',  body: "Two week streak. You're becoming a regular here." },
          30:  { title: '30-day streak 💿',         body: "A whole month on Feelz Machine. You're part of this now." },
          60:  { title: '60 days 🎯',               body: "Two months of daily Feelz. Legendary behaviour." },
          100: { title: '100-day streak 🏆',        body: "One hundred consecutive days. You are Feelz Machine." },
        };
        const msg = msgs[newStreak];
        if (msg) {
          await supabase.from('notifications').insert({
            user_id:  user.id,
            type:     'streak',
            title:    msg.title,
            message:  msg.body,
            metadata: { streak_days: newStreak, milestone: true },
          });
        }
      }
    } catch (err) {
      console.error('Streak check error:', err);
    }

    setLoading(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Discovery streak ─────────────────────────────────────────────────────────
  const recordDiscovery = useCallback(async (artistId) => {
    if (!user?.id || !artistId || discoveredTodayRef.current) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: row } = await supabase
        .from('user_streaks')
        .select('discovery_streak, longest_discovery_streak, last_discovery_date')
        .eq('user_id', user.id).maybeSingle();
      if (!row) return;

      // Already recorded a discovery today
      if (row.last_discovery_date === today) {
        discoveredTodayRef.current = true;
        return;
      }

      const lastDiscovery   = row.last_discovery_date ? new Date(row.last_discovery_date + 'T00:00:00') : null;
      const newDiscovery    = !lastDiscovery ? 1 : isYesterday(lastDiscovery) ? (row.discovery_streak || 0) + 1 : 1;
      const newLongestDisc  = Math.max(newDiscovery, row.longest_discovery_streak || 0);

      // Mark before the await
      discoveredTodayRef.current = true;

      await supabase.from('user_streaks').update({
        discovery_streak:         newDiscovery,
        longest_discovery_streak: newLongestDisc,
        last_discovery_date:      today,
      }).eq('user_id', user.id);

      setDiscoveryStreak(newDiscovery);

      if (DISCOVERY_MILESTONES.includes(newDiscovery)) {
        const msgs = {
          3:  { title: '3 new artists discovered 🎵', body: "You've found 3 new artists 3 days running. You've got an ear for this." },
          7:  { title: 'Week of discovery 🌍',         body: "7 days of finding new artists. The underground loves you." },
          14: { title: '2-week discovery streak 🔭',   body: "Two weeks of unearthing new talent. You belong here." },
          30: { title: 'Discovery legend 🏆',          body: "30 days finding artists nobody knows yet. You are the scene." },
        };
        const msg = msgs[newDiscovery];
        if (msg) {
          await supabase.from('notifications').insert({
            user_id:  user.id,
            type:     'streak',
            title:    msg.title,
            message:  msg.body,
            metadata: { discovery_streak: newDiscovery, milestone: true },
          });
        }
      }
    } catch (err) {
      console.error('Discovery streak error:', err);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkAndUpdateStreak();
  }, [checkAndUpdateStreak]);

  return { streak, longestStreak, discoveryStreak, recordDiscovery, loading };
}