/**
 * useStreak.js
 *
 * Tracks a daily app-open streak for both artists and listeners.
 * - Reads/writes the `user_streaks` table in Supabase.
 * - Called once on app mount (from useActivityPing or AppLayout).
 * - Sends an in-app notification when a streak milestone is hit
 *   (3, 7, 14, 30, 60, 100 days).
 *
 * Returns: { streak, longestStreak, loading }
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const MILESTONE_DAYS = [3, 7, 14, 30, 60, 100];

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth() &&
    da.getDate()     === db.getDate()
  );
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

export function useStreak(user) {
  const [streak, setStreak]               = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [loading, setLoading]             = useState(true);

  const checkAndUpdateStreak = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }

    try {
      // 1. Fetch existing streak row
      const { data: row } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const now       = new Date();
      const today     = now.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!row) {
        // First ever open — create row
        const { data: created } = await supabase
          .from('user_streaks')
          .insert({
            user_id:        user.id,
            current_streak: 1,
            longest_streak: 1,
            last_active_date: today,
          })
          .select()
          .single();
        setStreak(1);
        setLongestStreak(1);
        setLoading(false);
        return;
      }

      const lastActive = new Date(row.last_active_date + 'T00:00:00');

      // Already logged today — no update needed
      if (isSameDay(lastActive, now)) {
        setStreak(row.current_streak);
        setLongestStreak(row.longest_streak);
        setLoading(false);
        return;
      }

      let newStreak;
      if (isYesterday(lastActive)) {
        // Consecutive day — increment
        newStreak = (row.current_streak || 1) + 1;
      } else {
        // Missed a day — reset to 1
        newStreak = 1;
      }

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

      // 2. Fire milestone notification if applicable
      if (MILESTONE_DAYS.includes(newStreak)) {
        const milestoneMessages = {
          3:   { title: '3-day streak 🔥',            body: "You're on a roll — 3 days straight on Feelz Machine." },
          7:   { title: 'One week streak! 🔥🔥',      body: "Seven days running. The music doesn't stop with you." },
          14:  { title: '2 weeks straight 🔥🔥🔥',   body: "Two week streak. You're becoming a regular here." },
          30:  { title: '30-day streak 💿',            body: "A whole month on Feelz Machine. You're part of this now." },
          60:  { title: '60 days! 🎯',                body: "Two months of daily Feelz. Legendary behaviour." },
          100: { title: '100-day streak 🏆',           body: "One hundred consecutive days. You are Feelz Machine." },
        };
        const msg = milestoneMessages[newStreak];
        if (msg) {
          await supabase.from('notifications').insert({
            user_id:  user.id,
            type:     'streak',
            title:    msg.title,
            message:  msg.body,
            metadata: { streak_days: newStreak, milestone: true },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Streak check error:', err);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    checkAndUpdateStreak();
  }, [checkAndUpdateStreak]);

  return { streak, longestStreak, loading };
}