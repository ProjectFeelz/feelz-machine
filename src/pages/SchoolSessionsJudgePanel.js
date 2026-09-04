// src/pages/SchoolSessionsJudgePanel.js
// Judge-facing view for School Sessions. Distinct from AdminSchoolSessions —
// judges are NOT admins, and every action here goes through judge_set_finalist
// / judge_set_winner, which only ever touch those two columns and check
// judge/admin status server-side. There's no raw table update in this file.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Loader, Trophy, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';
import { supabase } from '../supabaseClient';

export default function SchoolSessionsJudgePanel() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const gate = useSchoolSessions();
  const [checking, setChecking] = React.useState(true);
  const [isJudge, setIsJudge] = React.useState(false);
  const [entries, setEntries] = React.useState([]);
  const [loadingEntries, setLoadingEntries] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [actionError, setActionError] = React.useState(null);

  const compId = gate.config?.competition?.id;

  React.useEffect(() => {
    if (!user || !compId) return;
    if (isAdmin) { setIsJudge(true); setChecking(false); return; }
    supabase.from('school_sessions_judges')
      .select('id')
      .eq('user_id', user.id)
      .eq('competition_id', compId)
      .maybeSingle()
      .then(({ data }) => { setIsJudge(!!data); setChecking(false); });
  }, [user, compId, isAdmin]);

  const loadEntries = React.useCallback(() => {
    if (!compId) return;
    setLoadingEntries(true);
    supabase.from('school_sessions_entries')
      .select('id, entrant_full_name, is_group, is_finalist, is_winner, created_at, school:school_sessions_schools(name), school_name_freetext, song:school_sessions_shortlist_songs(title), track:tracks(title, slug), members:school_sessions_entry_members(member_name)')
      .eq('competition_id', compId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEntries(data || []); setLoadingEntries(false); });
  }, [compId]);

  React.useEffect(() => {
    if (isJudge) loadEntries();
  }, [isJudge, loadEntries]);

  const toggleFinalist = async (entry) => {
    setBusyId(entry.id);
    setActionError(null);
    const { error } = await supabase.rpc('judge_set_finalist', { p_entry_id: entry.id, p_value: !entry.is_finalist });
    if (error) {
      setActionError('Could not update — try again.');
    } else {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_finalist: !e.is_finalist } : e));
    }
    setBusyId(null);
  };

  const toggleWinner = async (entry) => {
    setBusyId(entry.id);
    setActionError(null);
    const { error } = await supabase.rpc('judge_set_winner', { p_entry_id: entry.id, p_value: !entry.is_winner });
    if (error) {
      setActionError('Could not update — try again.');
    } else {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_winner: !e.is_winner } : e));
    }
    setBusyId(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">Log in to access the judge panel.</p>
      </div>
    );
  }

  if (checking || gate.loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!isJudge) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">You don't have judge access for the current School Sessions competition.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet><title>Judge Panel, School Sessions</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="px-5 pt-8 pb-24">
        <div className="flex items-start space-x-3 mb-1">
          <button onClick={() => navigate('/hub')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0 mt-1">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-1">School Sessions</p>
            <h1 className="text-2xl font-bold">Judge Panel</h1>
          </div>
        </div>
        <p className="text-sm text-white/40 mb-6">Mark entries as finalists, then pick the winner once finalists are set.</p>

        {gate.adminPreview && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-2.5">
            <p className="text-xs text-yellow-400">Admin preview: the public toggle is off. Judging still works normally for testing.</p>
          </div>
        )}

        {actionError && (
          <p className="text-xs text-red-400 mb-4">{actionError}</p>
        )}

        {loadingEntries ? (
          <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-12">No entries yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className={`px-4 py-3 rounded-xl text-sm border ${e.is_winner ? 'bg-lime-400/[0.08] border-lime-400/40' : e.is_finalist ? 'bg-lime-400/[0.04] border-lime-400/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {e.entrant_full_name}{e.is_group && e.members?.length > 0 ? ` + ${e.members.length} more` : ''}
                    </p>
                    <p className="text-xs text-white/40 truncate">
                      {e.school?.name || e.school_name_freetext} · covering "{e.song?.title || e.track?.title}"
                    </p>
                  </div>
                  {e.track?.slug && (
                    <a href={`/track/${e.track.slug}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-lime-400/70 flex-shrink-0">Listen</a>
                  )}
                </div>
                <div className="flex items-center space-x-2 mt-2.5">
                  <button onClick={() => toggleFinalist(e)} disabled={busyId === e.id}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition disabled:opacity-40 ${e.is_finalist ? 'bg-lime-400/20 text-lime-400' : 'bg-white/[0.06] text-white/40'}`}>
                    {e.is_finalist ? 'Finalist' : 'Mark finalist'}
                  </button>
                  <button onClick={() => toggleWinner(e)} disabled={busyId === e.id}
                    className={`flex items-center space-x-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition disabled:opacity-40 ${e.is_winner ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/40'}`}>
                    <Trophy className="w-2.5 h-2.5" /><span>{e.is_winner ? 'Winner' : 'Mark winner'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}