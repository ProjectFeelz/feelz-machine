// src/hooks/useSchoolSessions.js
// Fetches whether School Sessions is enabled + whether the current visitor
// is allowed to see it (region/school gate), via the school-sessions-gate
// Netlify function. Used by both the upload panel entry and the landing page.
//
// Admin bypass: the gate function is public and unauthenticated on purpose,
// it has no way to know "this caller is an admin". So rather than touch
// that function, an admin whose status is confirmed by a real authenticated
// Supabase query (RLS-backed, not something a non-admin could fake from the
// browser) gets the config fetched directly instead, letting them test the
// whole flow, entries, judging, voting, while the public toggle stays off
// for everyone else.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export default function useSchoolSessions() {
  const { rawIsAdmin: isAdmin, user } = useAuth();
  const [state, setState] = useState({
    loading: true,
    enabled: false,
    allowed: false,
    reason: null,
    config: null,
    adminPreview: false,
  });

  const fetchConfigAsAdmin = useCallback(async () => {
    const { data: config } = await supabase
      .from('school_sessions_config')
      .select('*, competition:competitions(*)')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    if (!config) return null;
    return {
      allowed_country_code: config.allowed_country_code,
      require_school_allowlist: config.require_school_allowlist,
      season: config.season,
      target_level: config.target_level,
      viral_course_url: config.viral_course_url,
      platform_course_url: config.platform_course_url,
      youtube_playlist_url: config.youtube_playlist_url,
      competition: config.competition,
    };
  }, []);

  const isJudge = useCallback(async () => {
    if (!user) return false;
    const { data } = await supabase.from('school_sessions_judges').select('id').eq('user_id', user.id).limit(1);
    return (data || []).length > 0;
  }, [user]);

  const check = useCallback(async (schoolName) => {
    setState(s => ({ ...s, loading: true }));
    try {
      const params = schoolName ? `?school=${encodeURIComponent(schoolName)}` : '';
      const res = await fetch(`/.netlify/functions/school-sessions-gate${params}`);
      const data = await res.json();

      if (!data.enabled && (isAdmin || await isJudge())) {
        const adminConfig = await fetchConfigAsAdmin();
        if (adminConfig) {
          setState({
            loading: false, enabled: true, allowed: true,
            reason: 'admin_preview', config: adminConfig, adminPreview: true,
          });
          return { enabled: true, allowed: true, config: adminConfig, adminPreview: true };
        }
      }

      setState({
        loading: false,
        enabled: !!data.enabled,
        allowed: !!data.allowed,
        reason: data.reason || null,
        config: data.config || null,
        adminPreview: false,
      });
      return data;
    } catch (err) {
      console.error('useSchoolSessions gate check failed:', err);
      setState({ loading: false, enabled: false, allowed: false, reason: 'error', config: null, adminPreview: false });
      return { enabled: false, allowed: false };
    }
  }, [isAdmin, fetchConfigAsAdmin, isJudge]);

  useEffect(() => { check(); }, [check]);

  // Exposed so a "my school isn't recognising me" retry (after picking a
  // school in the form) can re-run the check with that school name.
  return { ...state, recheckWithSchool: check };
}