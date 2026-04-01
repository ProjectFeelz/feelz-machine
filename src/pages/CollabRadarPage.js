import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import {
  Radio, Loader, Verified, Send, Check,
  Music, Mic2, Headphones, PenLine, Shuffle, Blend, MoreHorizontal,
  ChevronRight, Zap,
} from 'lucide-react';

// ── Collab type options ───────────────────────────────────────────────────────
const COLLAB_TYPES = [
  { key: 'featured', label: 'Featured',  icon: Mic2,       desc: 'Guest verse or hook' },
  { key: 'beat',     label: 'Beat',      icon: Headphones, desc: 'I need a beat / I make beats' },
  { key: 'co-write', label: 'Co-write',  icon: PenLine,    desc: 'Write together' },
  { key: 'remix',    label: 'Remix',     icon: Shuffle,    desc: 'Remix one of my tracks' },
  { key: 'mix',      label: 'Mix/Master',icon: Blend,      desc: 'Audio engineering' },
  { key: 'other',    label: 'Other',     icon: MoreHorizontal, desc: 'Something else' },
];

// ── Match scoring ─────────────────────────────────────────────────────────────
// Compares two artists and returns 0–100 compatibility score + shared tags
function scoreMatch(me, them) {
  const myGenres   = (me.genre   ? [me.genre]   : []).concat(me.tags   || []);
  const myMoods    = (me.mood    ? [me.mood]     : []).concat(me.moods  || []);
  const themGenres = (them.genre ? [them.genre]  : []).concat(them.tags || []);
  const themMoods  = (them.mood  ? [them.mood]   : []).concat(them.moods|| []);

  const sharedGenres = myGenres.filter(g => themGenres.includes(g));
  const sharedMoods  = myMoods.filter(m => themMoods.includes(m));
  const shared       = [...new Set([...sharedGenres, ...sharedMoods])];

  // Score components
  const genreScore    = sharedGenres.length * 25;   // up to ~75 for 3 shared genres
  const moodScore     = sharedMoods.length  * 15;   // up to ~30 for 2 shared moods
  const tierBonus     = them.tier === 'premium' ? 5 : them.tier === 'pro' ? 3 : 0;
  const followerBonus = Math.min(Math.log10((them.follower_count || 1) + 1) * 3, 10);

  const raw   = genreScore + moodScore + tierBonus + followerBonus;
  const score = Math.min(Math.round(raw), 99); // cap at 99 — 100 is reserved

  return { score, shared };
}

// ── Small components ──────────────────────────────────────────────────────────
function MatchBadge({ score }) {
  const color = score >= 70 ? '#8B5CF6' : score >= 45 ? '#06B6D4' : '#6B7280';
  return (
    <div
      className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      <Zap className="w-2.5 h-2.5" />
      <span>{score}% match</span>
    </div>
  );
}

function SharedTags({ tags }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.slice(0, 3).map(t => (
        <span key={t}
          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.06] text-white/40 uppercase tracking-wide">
          {t}
        </span>
      ))}
    </div>
  );
}

// ── Send Request Modal ────────────────────────────────────────────────────────
function SendRequestModal({ target, onClose, onSent, myArtistId }) {
  const { tap, success } = useHaptics();
  const [collabType, setCollabType] = useState('featured');
  const [pitch, setPitch]           = useState('');
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState('');
  const MAX_PITCH = 140;

  const handleSend = async () => {
    if (!pitch.trim()) { setError('Add a short pitch so they know what you have in mind'); return; }
    setSending(true);
    try {
      // Insert the collab request
      const { data: req, error: reqErr } = await supabase
        .from('collab_requests')
        .insert({
          from_artist_id: myArtistId,
          to_artist_id:   target.id,
          collab_type:    collabType,
          message:        pitch.trim(),
          status:         'pending',
        })
        .select('id')
        .single();

      if (reqErr) throw reqErr;

      // Fire a notification to the receiving artist
      await supabase.from('notifications').insert({
        artist_id:      target.id,
        type:           'collab_request',
        title:          'New Collab Request',
        message:        `${pitch.trim().slice(0, 80)}${pitch.length > 80 ? '…' : ''}`,
        from_artist_id: myArtistId,
        metadata:       { request_id: req.id, collab_type: collabType },
      });

      success();
      onSent();
    } catch (err) {
      console.error(err);
      setError('Failed to send — please try again');
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center space-x-3 p-4 border-b border-white/[0.06]">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
            {target.profile_image_url
              ? <img src={target.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center">
                  <span className="text-sm font-bold text-white/40">{target.artist_name?.[0]}</span>
                </div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{target.artist_name}</p>
            <p className="text-xs text-white/30">Send collab request</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <span className="text-white/40 text-sm leading-none">✕</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Collab type */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2.5">
              What are you looking for?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {COLLAB_TYPES.map(({ key, label, icon: Icon, desc }) => (
                <button key={key}
                  onClick={() => { tap(); setCollabType(key); }}
                  className={`flex flex-col items-center p-2.5 rounded-xl border text-center transition-all ${
                    collabType === key
                      ? 'border-purple-500/50 bg-purple-500/10'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className={`w-4 h-4 mb-1 ${collabType === key ? 'text-purple-400' : 'text-white/30'}`} />
                  <span className={`text-[10px] font-semibold ${collabType === key ? 'text-white' : 'text-white/50'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Pitch */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">
              Your pitch
            </p>
            <textarea
              value={pitch}
              onChange={e => { setPitch(e.target.value.slice(0, MAX_PITCH)); setError(''); }}
              placeholder={`Tell ${target.artist_name} why you'd vibe together…`}
              rows={3}
              className="w-full bg-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none resize-none border border-white/[0.06] focus:border-white/20 transition leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1">
              {error
                ? <p className="text-xs text-red-400">{error}</p>
                : <span />}
              <span className={`text-[10px] tabular-nums ${pitch.length > MAX_PITCH * 0.9 ? 'text-orange-400' : 'text-white/20'}`}>
                {pitch.length}/{MAX_PITCH}
              </span>
            </div>
          </div>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={sending || !pitch.trim()}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all active:scale-98 disabled:opacity-40 bg-purple-600 hover:bg-purple-500 text-white"
          >
            {sending
              ? <Loader className="w-4 h-4 animate-spin" />
              : <><Send className="w-4 h-4" /><span>Send Request</span></>}
          </button>
        </div>

        {/* Safe area */}
        <div className="h-5" />
      </div>
    </div>
  );
}

// ── Artist match card ─────────────────────────────────────────────────────────
function MatchCard({ match, myArtistId, alreadySent, onRequestSent }) {
  const navigate = useNavigate();
  const { tap }  = useHaptics();
  const [showModal, setShowModal] = useState(false);
  const [sent, setSent]          = useState(alreadySent);

  const handleSent = () => {
    setSent(true);
    setShowModal(false);
    onRequestSent(match.id);
  };

  return (
    <>
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] overflow-hidden">
        {/* Top: avatar + name + match score */}
        <div className="flex items-center space-x-3 p-4 pb-3">
          <button
            onClick={() => { tap(); navigate(`/artist/${match.slug}`); }}
            className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0"
          >
            {match.profile_image_url
              ? <img src={match.profile_image_url} alt={match.artist_name}
                  className="w-full h-full object-cover" loading="lazy" />
              : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                  <span className="text-xl font-bold text-white/40">{match.artist_name?.[0]}</span>
                </div>}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5 mb-0.5">
              <p className="text-sm font-semibold text-white truncate">{match.artist_name}</p>
              {match.is_verified && <Verified className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
            </div>
            <MatchBadge score={match._score} />
            <SharedTags tags={match._shared} />
          </div>

          {/* Profile arrow */}
          <button onClick={() => { tap(); navigate(`/artist/${match.slug}`); }}
            className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-white/50 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center space-x-3 px-4 pb-3 text-[10px] text-white/25 uppercase tracking-wider">
          <span>{match.total_streams ? `${(match.total_streams / 1000).toFixed(1)}K streams` : '—'}</span>
          <span>·</span>
          <span>{match.follower_count ? `${match.follower_count} followers` : '—'}</span>
          {match.tier && match.tier !== 'free' && (
            <><span>·</span>
            <span className="text-purple-400 capitalize">{match.tier}</span></>
          )}
        </div>

        {/* CTA */}
        <div className="px-4 pb-4">
          <button
            onClick={() => { if (!sent) { tap(); setShowModal(true); } }}
            disabled={sent}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-98 ${
              sent
                ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {sent
              ? <><Check className="w-4 h-4" /><span>Request Sent</span></>
              : <><Radio className="w-4 h-4" /><span>Send Collab Request</span></>}
          </button>
        </div>
      </div>

      {showModal && (
        <SendRequestModal
          target={match}
          myArtistId={myArtistId}
          onClose={() => setShowModal(false)}
          onSent={handleSent}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CollabRadarPage() {
  const { user, artist } = useAuth();
  const navigate         = useNavigate();
  const { tap }          = useHaptics();

  const [matches, setMatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [sentIds, setSentIds]       = useState(new Set()); // artist IDs we've already sent to
  const [genreFilter, setGenreFilter] = useState('all');
  const [genres, setGenres]         = useState([]);

  // ── Load matches ────────────────────────────────────────────────────────────
  const loadMatches = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      // Fetch all pro/premium artists except myself
      const { data: artists } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url, is_verified, genre, mood, tags, moods, tier, follower_count, total_streams')
        .in('tier', ['pro', 'premium'])
        .neq('id', artist.id)
        .limit(100);

      // Fetch requests I've already sent
      const { data: sent } = await supabase
        .from('collab_requests')
        .select('to_artist_id')
        .eq('from_artist_id', artist.id);

      const alreadySent = new Set((sent || []).map(r => r.to_artist_id));
      setSentIds(alreadySent);

      // Score and sort
      const scored = (artists || [])
        .map(a => {
          const { score, shared } = scoreMatch(artist, a);
          return { ...a, _score: score, _shared: shared };
        })
        .filter(a => a._score > 0) // only show artists with at least something in common
        .sort((a, b) => b._score - a._score);

      setMatches(scored);

      // Build genre filter list from results
      const allGenres = [...new Set(scored.map(a => a.genre).filter(Boolean))];
      setGenres(allGenres.slice(0, 6));

    } catch (err) {
      console.error('CollabRadar load error:', err);
    }
    setLoading(false);
  }, [artist]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const handleRequestSent = (artistId) => {
    setSentIds(prev => new Set([...prev, artistId]));
  };

  // Guard: only pro/premium artists can send requests
  const canSend = artist?.tier === 'pro' || artist?.tier === 'premium';

  const filtered = genreFilter === 'all'
    ? matches
    : matches.filter(m => m.genre === genreFilter || (m._shared || []).includes(genreFilter));

  if (!user || !artist) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Radio className="w-12 h-12 text-white/10 mb-4" />
      <p className="text-white/40 text-sm">You need an artist account to use Collab Radar</p>
      <button onClick={() => navigate('/hub')} className="mt-4 text-xs text-white/30 hover:text-white/50 transition">
        ← Back to Hub
      </button>
    </div>
  );

  return (
    <div className="min-h-screen pb-32">
      <Helmet>
        <title>Collab Radar · Feelz Machine</title>
      </Helmet>

      {/* Header */}
      <div className="px-6 pt-12 md:pt-6 pb-6">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Radio className="w-4 h-4 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Collab Radar</h1>
        </div>
        <p className="text-sm text-white/30 ml-11">
          Artists who vibe with your sound
        </p>

        {/* Tier gate notice */}
        {!canSend && (
          <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-start space-x-2.5">
            <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-yellow-300">Pro or Premium required to send requests</p>
              <button onClick={() => navigate('/upgrade')}
                className="text-[11px] text-yellow-400/60 hover:text-yellow-400 transition mt-0.5 underline">
                Upgrade your plan →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Genre filter pills */}
      {genres.length > 0 && (
        <div className="flex space-x-2 overflow-x-auto scrollbar-hide px-6 pb-4">
          <button
            onClick={() => { tap(); setGenreFilter('all'); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              genreFilter === 'all' ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:text-white/70'
            }`}>
            All
          </button>
          {genres.map(g => (
            <button key={g}
              onClick={() => { tap(); setGenreFilter(g); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition capitalize ${
                genreFilter === g ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:text-white/70'
              }`}>
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center space-y-3">
            <Radio className="w-8 h-8 text-purple-400 animate-pulse" />
            <p className="text-sm text-white/30">Scanning for matches…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 px-6">
          <Music className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/30">No matches yet</p>
          <p className="text-xs text-white/15 mt-1">
            Add genres and moods to your profile to improve matching
          </p>
          <button onClick={() => navigate('/profile/edit')}
            className="mt-4 text-xs text-purple-400 hover:text-purple-300 transition">
            Update your profile →
          </button>
        </div>
      ) : (
        <div className="px-6 space-y-3">
          <p className="text-[10px] text-white/20 uppercase tracking-widest mb-3">
            {filtered.length} artist{filtered.length !== 1 ? 's' : ''} found
          </p>
          {filtered.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              myArtistId={artist.id}
              alreadySent={sentIds.has(match.id)}
              onRequestSent={handleRequestSent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
