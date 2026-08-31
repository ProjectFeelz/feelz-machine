// src/hooks/useSchoolSessions.js
// Fetches whether School Sessions is enabled + whether the current visitor
// is allowed to see it (region/school gate), via the school-sessions-gate
// Netlify function. Used by both the upload panel entry and the landing page.

import { useState, useEffect, useCallback } from 'react';

export default function useSchoolSessions() {
  const [state, setState] = useState({
    loading: true,
    enabled: false,
    allowed: false,
    reason: null,
    config: null,
  });

  const check = useCallback(async (schoolName) => {
    setState(s => ({ ...s, loading: true }));
    try {
      const params = schoolName ? `?school=${encodeURIComponent(schoolName)}` : '';
      const res = await fetch(`/.netlify/functions/school-sessions-gate${params}`);
      const data = await res.json();
      setState({
        loading: false,
        enabled: !!data.enabled,
        allowed: !!data.allowed,
        reason: data.reason || null,
        config: data.config || null,
      });
      return data;
    } catch (err) {
      console.error('useSchoolSessions gate check failed:', err);
      setState({ loading: false, enabled: false, allowed: false, reason: 'error', config: null });
      return { enabled: false, allowed: false };
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Exposed so a "my school isn't recognising me" retry (after picking a
  // school in the form) can re-run the check with that school name.
  return { ...state, recheckWithSchool: check };
}