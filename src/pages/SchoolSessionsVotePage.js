// src/pages/SchoolSessionsVotePage.js
// /schoolsessions/vote — public voting page. Judges (announced separately)
// narrow entries to finalists and pick the winner directly in admin; this
// page lets anyone with a Feelz Machine account cast one vote for their
// favourite as a "People's Choice" pick — a secondary signal, not what
// decides the main winner. Same enable/region gate as the rest of School
// Sessions, since people not taking part shouldn't see this either.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, Loader, Play, Check, ThumbsUp, Trophy } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useSchoolSessions from '../hooks/useSchoolSessions';

function phaseFromDates(comp) {
  if (!comp) return 'unknown';
  const now = Date.now();
  const votingOpen = comp.voting_open_at ? new Date(comp.voting_open_at).getTime() : null;
  const votingClose = comp.voting_close_at ? new Date(comp.voting_close_at).getTime() : null;
  if (votingClose && now > votingClose) return 'closed';
  if (votingOpen && now < votingOpen) return 'not_open';
  return 'open';
}

export default function SchoolSessionsVotePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const gate = useSchoolSessions();
  const [finalists, setFinalists] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});
  const [hasVoted, setHasVoted] = useState(false);
  const [votedEntryId, setVotedEntryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(null);
  const [error, setError] = useState('');

  const comp = gate.config?.competition;
  const phase = phaseFromDates(comp);

  const load = useCallback(async () => {
    if (!comp?.id) return;
    setLoading(true);

    const { data: entries } = await supabase
      .from('school_sessions_entries')
      .select('id, entrant_full_name, is_winner, is_group, entrant_tiktok_handle, song:school_sessions_shortlist_songs(title), track:tracks(title, slug, cover_artwork_url), school:school_sessions_schools(name), school_name_freetext, members:school_sessions_entry_members(member_name)')
      .eq('competition_id', comp.id)
      .eq('is_finalist', true);
    setFinalists(entries || []);

    const { data: counts } = await supabase.rpc('get_school_sessions_vote_counts', { p_competition_id: comp.id });
    const countMap = {};
    (counts || []).forEach(c => { countMap[c.entry_id] = Number(c.votes); });
    setVoteCounts(countMap);

    if (user) {
      const { data: myVote } = await supabase
        .from('school_sessions_votes')
        .select('entry_id')
        .eq('competition_id', comp.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (myVote) { setHasVoted(true); setVotedEntryId(myVote.entry_id); }
    }

    setLoading(false);
  }, [comp?.id, user]);

  useEffect(() => { load(); }, [load]);

  const castVote = async (entryId) => {
    if (!user) { navigate('/login'); return; }
    setVoting(entryId);
    setError('');
    try {
      const { error: voteErr } = await supabase.from('school_sessions_votes').insert({
        competition_id: comp.id,
        entry_id: entryId,
        user_id: user.id,
      });
      if (voteErr) throw voteErr;
      setHasVoted(true);
      setVotedEntryId(entryId);
      setVoteCounts(prev => ({ ...prev, [entryId]: (prev[entryId] || 0) + 1 }));
    } catch (err) {
      setError(err.message?.includes('duplicate') ? "You've already voted." : 'Could not cast your vote — try again.');
    }
    setVoting(null);
  };

  if (gate.loading || (gate.allowed && loading)) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;
  }

  if (!gate.enabled || !gate.allowed) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center space-y-3">
        <GraduationCap className="w-8 h-8 text-white/20" />
        <h1 className="text-lg font-bold text-white">Voting isn't open here</h1>
        <p className="text-sm text-white/40 max-w-xs">
          <Link to="/schoolsessions" className="text-lime-400">Back to School Sessions</Link>
        </p>
      </div>
    );
  }

  const sorted = [...finalists].sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-6 pt-14 pb-24 space-y-6">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg border border-lime-400 flex items-center justify-center text-lime-400 font-bold text-xs">FM</div>
          <div>
            <p className="font-bold text-sm leading-none">FEELZ MACHINE</p>
            <p className="text-[10px] text-white/30 tracking-wider mt-0.5">SCHOOL SESSIONS</p>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">People's Choice vote</h1>
          <p className="text-sm text-white/50">
            Judges pick the finalists and the winner. This vote is a separate People's Choice pick — one vote per person.
          </p>
          {totalVotes > 0 && <p className="text-xs text-white/30">{totalVotes} vote{totalVotes === 1 ? '' : 's'} so far</p>}
        </div>

        {phase === 'not_open' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
            Voting opens {comp?.voting_open_at ? new Date(comp.voting_open_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : 'soon'} — check back then.
          </div>
        )}

        {finalists.length === 0 && phase !== 'not_open' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
            Finalists haven't been announced yet.
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="space-y-3">
          {sorted.map((f, i) => {
            const peoplesChoice = i === 0 && (voteCounts[f.id] || 0) > 0;
            const votedForThis = votedEntryId === f.id;
            return (
              <div key={f.id} className={`rounded-xl border p-4 ${f.is_winner ? 'border-lime-400 bg-lime-400/[0.06]' : 'border-white/[0.06] bg-white/[0.03]'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {f.is_winner && (
                        <span className="flex items-center space-x-1 text-[10px] font-bold text-lime-400 bg-lime-400/10 px-1.5 py-0.5 rounded">
                          <Trophy className="w-3 h-3" /><span>WINNER</span>
                        </span>
                      )}
                      {peoplesChoice && (
                        <span className="text-[10px] font-bold text-pink-300 bg-pink-400/10 px-1.5 py-0.5 rounded">PEOPLE'S CHOICE</span>
                      )}
                    </div>
                    <p className="font-bold text-sm text-white truncate mt-1">{f.song?.title || f.track?.title || 'Untitled cover'}</p>
                    <p className="text-xs text-white/40 mt-0.5 truncate">
                      {f.entrant_full_name}{f.is_group && f.members?.length > 0 ? ` + ${f.members.length} more` : ''} · {f.school?.name || f.school_name_freetext}
                    </p>
                    {f.entrant_tiktok_handle && (
                      <a href={`https://tiktok.com/@${f.entrant_tiktok_handle}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-lime-400/70 mt-1 inline-block">@{f.entrant_tiktok_handle} on TikTok</a>
                    )}
                  </div>
                  {f.track?.slug && (
                    <Link to={`/track/${f.track.slug}`} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 ml-2">
                      <Play className="w-3.5 h-3.5 text-white/60" />
                    </Link>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                  <span className="text-xs text-white/40">{voteCounts[f.id] || 0} vote{(voteCounts[f.id] || 0) === 1 ? '' : 's'}</span>
                  {phase === 'open' && (
                    hasVoted ? (
                      votedForThis ? (
                        <span className="flex items-center space-x-1 text-xs text-lime-400 font-semibold"><Check className="w-3.5 h-3.5" /><span>Your vote</span></span>
                      ) : (
                        <span className="text-xs text-white/20">Voted</span>
                      )
                    ) : (
                      <button onClick={() => castVote(f.id)} disabled={voting === f.id}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-lime-400 text-black text-xs font-bold disabled:opacity-50">
                        {voting === f.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        <span>Vote</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}