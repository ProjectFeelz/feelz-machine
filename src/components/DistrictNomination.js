// src/components/DistrictNomination.js
// Always-open, no-gate section: any visitor can put their school/district
// forward to host the next School Sessions season, and anyone with a Feelz
// Machine account can vote for one nomination per season. Deliberately
// separate from the current season's entries/votes — this needs to reach
// schools that aren't part of the current run at all.

import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, ThumbsUp, Loader, Check, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export default function DistrictNomination({ nextSeason }) {
  const { user } = useAuth();
  const [nominations, setNominations] = useState([]);
  const [voteCounts, setVoteCounts] = useState({});
  const [myVoteNominationId, setMyVoteNominationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ districtName: '', schoolName: '', name: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: noms } = await supabase
      .from('school_sessions_district_nominations')
      .select('id, district_name, school_name')
      .eq('season_requested', nextSeason)
      .eq('is_approved', true);
    setNominations(noms || []);

    const { data: counts } = await supabase.rpc('get_district_vote_counts', { p_season: nextSeason });
    const countMap = {};
    (counts || []).forEach(c => { countMap[c.nomination_id] = Number(c.votes); });
    setVoteCounts(countMap);

    if (user) {
      const { data: myVote } = await supabase
        .from('school_sessions_district_votes')
        .select('nomination_id')
        .eq('season_requested', nextSeason)
        .eq('user_id', user.id)
        .maybeSingle();
      setMyVoteNominationId(myVote?.nomination_id || null);
    }
    setLoading(false);
  }, [nextSeason, user]);

  useEffect(() => { load(); }, [load]);

  const castVote = async (nominationId) => {
    if (!user) { window.location.href = '/login'; return; }
    setVoting(nominationId);
    try {
      const { error: voteErr } = await supabase.from('school_sessions_district_votes').insert({
        nomination_id: nominationId,
        season_requested: nextSeason,
        user_id: user.id,
      });
      if (voteErr) throw voteErr;
      setMyVoteNominationId(nominationId);
      setVoteCounts(prev => ({ ...prev, [nominationId]: (prev[nominationId] || 0) + 1 }));
    } catch (err) {
      setError(err.message?.includes('duplicate') ? "You've already voted for a district this season." : 'Could not cast your vote — try again.');
    }
    setVoting(null);
  };

  const submitNomination = async () => {
    if (!form.districtName.trim()) { setError('District or area name is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { error: subErr } = await supabase.from('school_sessions_district_nominations').insert({
        district_name: form.districtName.trim(),
        school_name: form.schoolName.trim() || null,
        submitted_by_name: form.name.trim() || null,
        submitted_by_email: form.email.trim() || null,
        season_requested: nextSeason,
      });
      if (subErr) throw subErr;
      setSubmitted(true);
      setShowForm(false);
    } catch (err) {
      setError('Could not submit — try again.');
    }
    setSubmitting(false);
  };

  const sorted = [...nominations].sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-start space-x-2.5">
        <MapPin className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-white">Want School Sessions in your district next?</p>
          <p className="text-xs text-white/40 mt-0.5">
            Put your district forward, get people to vote for it, and it could be where Season {nextSeason} runs.
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <Loader className="w-4 h-4 text-white/30 animate-spin" />
      ) : (
        <>
          {sorted.length > 0 && (
            <div className="space-y-2">
              {sorted.slice(0, 6).map((n) => {
                const votedForThis = myVoteNominationId === n.id;
                return (
                  <div key={n.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{n.district_name}</p>
                      {n.school_name && <p className="text-[11px] text-white/30 truncate">Nominated by {n.school_name}</p>}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                      <span className="text-xs text-white/30">{voteCounts[n.id] || 0}</span>
                      {votedForThis ? (
                        <span className="flex items-center space-x-1 text-xs text-lime-400 font-semibold px-2 py-1"><Check className="w-3.5 h-3.5" /></span>
                      ) : (
                        <button onClick={() => castVote(n.id)} disabled={voting === n.id || !!myVoteNominationId}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.08] text-white/70 text-xs font-semibold disabled:opacity-30">
                          {voting === n.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {submitted ? (
            <p className="text-xs text-lime-400/80">Thanks — your district is in for review, and will show up here for voting once approved.</p>
          ) : showForm ? (
            <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
              <input placeholder="Your district or area" value={form.districtName}
                onChange={e => setForm({ ...form, districtName: e.target.value })}
                className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-xs outline-none" />
              <input placeholder="Your school (optional)" value={form.schoolName}
                onChange={e => setForm({ ...form, schoolName: e.target.value })}
                className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-xs outline-none" />
              <div className="flex space-x-2">
                <input placeholder="Your name" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="flex-1 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-xs outline-none" />
                <input placeholder="Email (optional)" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="flex-1 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-xs outline-none" />
              </div>
              <button onClick={submitNomination} disabled={submitting}
                className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded-lg bg-lime-400 text-black text-xs font-bold disabled:opacity-50">
                {submitting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Submit district</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)}
              className="text-xs text-lime-400 font-semibold">+ Nominate your district</button>
          )}
        </>
      )}
    </div>
  );
}