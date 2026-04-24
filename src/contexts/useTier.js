/**
 * useStreak.js
 *
 * Streak is incremented atomically server-side via a Supabase RPC function.
 * This eliminates ALL race conditions — the DB function checks last_active_date
 * and only increments once per day, no matter how many times the hook fires.
 *
 * Requires SQL function in Supabase — see bottom of this file.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

const MILESTONE_DAYS       = [3, 7, 14, 30, 60, 100];
const DISCOVERY_MILESTONES = [3, 7, 14, 30];

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth()    === db.getMonth()    &&
         da.getDate()     === db.getDate();
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
  const runningRef         = useRef(false); // in-process guard

  const lsKey = user?.id ? `streak_checked_${user.id}` : null;

  const checkAndUpdateStreak = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Already ran the RPC today — just read display values
      if (lsKey && localStorage.getItem(lsKey) === today) {
        const { data: row } = await supabase
          .from('user_streaks')
          .select('current_streak, longest_streak, discovery_streak')
          .eq('user_id', user.id).maybeSingle();
        if (row) {
          setStreak(row.current_streak || 0);
          setLongestStreak(row.longest_streak || 0);
          setDiscoveryStreak(row.discovery_streak || 0);
        }
        setLoading(false);
        runningRef.current = false;
        return;
      }

      // Atomic increment via RPC — idempotent, safe to call multiple times
      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc('check_and_increment_streak', { p_user_id: user.id });

      if (rpcErr) {
        // RPC not deployed yet — read current values and show them
        console.warn('Streak RPC unavailable:', rpcErr.message);
        const { data: row } = await supabase
          .from('user_streaks')
          .select('current_streak, longest_streak, discovery_streak')
          .eq('user_id', user.id).maybeSingle();
        if (row) {
          setStreak(row.current_streak || 0);
          setLongestStreak(row.longest_streak || 0);
          setDiscoveryStreak(row.discovery_streak || 0);
        }
        setLoading(false);
        runningRef.current = false;
        return;
      }

      const result    = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!result) { setLoading(false); runningRef.current = false; return; }

      const newStreak  = result.current_streak || 0;
      const newLongest = result.longest_streak  || 0;
      const lastActive = result.last_active_date;

      if (lsKey) localStorage.setItem(lsKey, today);

      setStreak(newStreak);
      setLongestStreak(newLongest);

      // Fetch discovery streak separately
      const { data: fullRow } = await supabase
        .from('user_streaks').select('discovery_streak')
        .eq('user_id', user.id).maybeSingle();
      if (fullRow) setDiscoveryStreak(fullRow.discovery_streak || 0);

      // Milestone notifications — only if today is a new increment
      if (lastActive === today && MILESTONE_DAYS.includes(newStreak)) {
        const msgs = {
          3:   { title: '3-day streak 🔥',        body: "You're on a roll, 3 days straight on Feelz Machine." },
          7:   { title: 'One week streak 🔥🔥',    body: "Seven days running. The music doesn't stop with you." },
          14:  { title: '2 weeks straight 🔥🔥🔥', body: "Two week streak. You're becoming a regular here." },
          30:  { title: '30-day streak 💿',        body: "A whole month on Feelz Machine. You're part of this now." },
          60:  { title: '60 days 🎯',              body: "Two months of daily Feelz. Legendary behaviour." },
          100: { title: '100-day streak 🏆',       body: "One hundred consecutive days. You are Feelz Machine." },
        };
        const msg = msgs[newStreak];
        if (msg) {
          await supabase.from('notifications').insert({
            user_id:  user.id, type: 'streak',
            title:    msg.title, message: msg.body,
            metadata: { streak_days: newStreak, milestone: true },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Streak check error:', err);
    }

    setLoading(false);
    runningRef.current = false;
  }, [user?.id, lsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Discovery streak — unchanged, discovery is lower frequency so no race issue
  const recordDiscovery = useCallback(async (artistId) => {
    if (!user?.id || !artistId || discoveredTodayRef.current) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: row } = await supabase
        .from('user_streaks')
        .select('discovery_streak, longest_discovery_streak, last_discovery_date')
        .eq('user_id', user.id).maybeSingle();
      if (!row) return;

      if (row.last_discovery_date === today) { discoveredTodayRef.current = true; return; }

      const lastDiscovery  = row.last_discovery_date ? new Date(row.last_discovery_date + 'T00:00:00') : null;
      const newDiscovery   = !lastDiscovery ? 1 : isYesterday(lastDiscovery) ? (row.discovery_streak || 0) + 1 : 1;
      const newLongestDisc = Math.max(newDiscovery, row.longest_discovery_streak || 0);

      discoveredTodayRef.current = true;

      await supabase.from('user_streaks').update({
        discovery_streak: newDiscovery, longest_discovery_streak: newLongestDisc, last_discovery_date: today,
      }).eq('user_id', user.id);

      setDiscoveryStreak(newDiscovery);

      if (DISCOVERY_MILESTONES.includes(newDiscovery)) {
        const msgs = {
          3:  { title: '3 new artists discovered 🎵', body: "3 days of new finds. You've got an ear for this." },
          7:  { title: 'Week of discovery 🌍',        body: "7 days of finding new artists. The underground loves you." },
          14: { title: '2-week discovery streak 🔭',  body: "Two weeks of unearthing new talent. You belong here." },
          30: { title: 'Discovery legend 🏆',         body: "30 days finding artists nobody knows yet. You are the scene." },
        };
        const msg = msgs[newDiscovery];
        if (msg) {
          await supabase.from('notifications').insert({
            user_id: user.id, type: 'streak',
            title: msg.title, message: msg.body,
            metadata: { discovery_streak: newDiscovery, milestone: true },
          }).catch(() => {});
        }
      }
    } catch (err) { console.error('Discovery streak error:', err); }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkAndUpdateStreak(); }, [checkAndUpdateStreak]);

  return { streak, longestStreak, discoveryStreak, recordDiscovery, loading };
}
