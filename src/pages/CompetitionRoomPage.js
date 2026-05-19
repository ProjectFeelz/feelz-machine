import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import {
  ArrowLeft, Trophy, Download, Music, ChevronUp, ChevronDown, Loader, Clock,
  Upload, AlertCircle, Check, Crown, Zap, Lock, Play, Pause,
  Star, Shield, X, Info
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────
function timeLeft(date) {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function StatusBadge({ status }) {
  const map = {
    upcoming: { label: 'Coming Soon', color: '#6B7280', bg: 'bg-gray-500/10' },
    open:     { label: 'Entries Open', color: '#10B981', bg: 'bg-green-500/10' },
    voting:   { label: 'Voting Open', color: '#8B5CF6', bg: 'bg-purple-500/10' },
    closed:   { label: 'Judging', color: '#F59E0B', bg: 'bg-yellow-500/10' },
    completed:{ label: 'Complete', color: '#3B82F6', bg: 'bg-blue-500/10' },
  };
  const s = map[status] || map.upcoming;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.bg}`}
      style={{ color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Entry Card (anonymous until winner revealed) ──────────────
function EntryCard({ entry, index, myVotes, totalVotesAllowed, onVote, voting, isAdmin, onDisqualify, status, competition }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const hasVoted = myVotes?.voted_entries?.includes(entry.id);
  const votesLeft = totalVotesAllowed - (myVotes?.votes_cast || 0);
  const canVote = status === 'voting' && !hasVoted && votesLeft > 0;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(console.error); setPlaying(true); }
  };

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      entry.is_winner
        ? 'border-yellow-500/40 bg-gradient-to-b from-yellow-500/10 to-transparent'
        : 'border-white/[0.06] bg-white/[0.02]'
    }`}>
      {entry.is_winner && (
        <div className="flex items-center space-x-2 px-4 pt-3 pb-1">
          <Crown className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Winner</span>
        </div>
      )}

      <div className="p-4">
        {/* Audio player row */}
        <div className="flex items-center space-x-3 mb-3">
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0">
            {playing
              ? <Pause className="w-5 h-5 text-white" />
              : <Play className="w-5 h-5 text-white ml-0.5" />}
          </button>
          <audio ref={audioRef} src={entry.audio_url} onEnded={() => setPlaying(false)} />

          <div className="flex-1 min-w-0">
            {/* Anonymous label — number only until winner revealed */}
            <p className="text-sm font-semibold text-white">
              {entry.is_winner && entry.artists?.artist_name
                ? entry.artists.artist_name
                : `Entry #${index + 1}`}
            </p>
            {entry.is_winner && entry.artists?.artist_name && (
              <p className="text-xs text-white/40">{entry.title}</p>
            )}
          </div>

          {/* Vote count */}
          <div className="flex flex-col items-center flex-shrink-0">
            <button
              onClick={() => canVote && onVote(entry.id)}
              disabled={!canVote || voting === entry.id}
              className={`flex flex-col items-center px-3 py-2 rounded-xl transition-all active:scale-95 ${
                hasVoted
                  ? 'bg-purple-500/20 border border-purple-500/40'
                  : canVote
                    ? 'bg-white/[0.06] hover:bg-purple-500/10 hover:border-purple-500/30 border border-white/[0.06]'
                    : 'bg-white/[0.03] border border-white/[0.04] opacity-50 cursor-default'
              }`}>
              {voting === entry.id
                ? <Loader className="w-4 h-4 animate-spin text-purple-400" />
                : <ChevronUp className={`w-4 h-4 ${hasVoted ? 'text-purple-400' : 'text-white/40'}`} />}
              <span className={`text-xs font-bold mt-0.5 ${hasVoted ? 'text-purple-400' : 'text-white/50'}`}>
                {entry.vote_count || 0}
              </span>
            </button>
          </div>
        </div>

        {/* Admin controls */}
        {isAdmin && !entry.is_winner && !entry.disqualified && (
          <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-white/[0.04]">
            <span className="text-[10px] text-white/20 flex-1">
              Submitted by artist (ID hidden from public)
            </span>
            <button
              onClick={() => onDisqualify(entry.id)}
              className="text-[10px] text-red-400/60 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-500/10">
              Disqualify
            </button>
          </div>
        )}

        {entry.disqualified && (
          <div className="mt-2 pt-2 border-t border-white/[0.04]">
            <p className="text-[10px] text-red-400/60">Disqualified</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Entry submission modal ────────────────────────────────────
function SubmitEntryModal({ competition, artistId, onClose, onSubmitted }) {
  const [audioFile, setAudioFile]   = useState(null);
  const [title, setTitle]           = useState('');
  const [note, setNote]             = useState('');
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState('');

  const handleSubmit = async () => {
    if (!audioFile || !title.trim()) {
      setError('Please add a title and upload your audio file');
      return;
    }
    setUploading(true);
    setError('');
    try {
      // Upload audio to Supabase Storage (public bucket — URLs never expire)
      const ext = audioFile.name.split('.').pop();
      const path = `${artistId}/${competition.id}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('competition-entries')
        .upload(path, audioFile, { contentType: audioFile.type, upsert: false });
      if (uploadErr) throw uploadErr;

      // Get permanent public URL
      const { data: urlData } = supabase.storage
        .from('competition-entries')
        .getPublicUrl(path);

      const { error: insertErr } = await supabase.from('competition_entries').insert({
        competition_id: competition.id,
        artist_id: artistId,
        audio_url: urlData.publicUrl,
        title: title.trim(),
        note: note.trim() || null,
        is_visible: false,
        is_winner: false,
      });
      if (insertErr) throw insertErr;

      onSubmitted();
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl overflow-hidden bg-neutral-900 border-t border-white/[0.08]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-bold text-white">Submit Your Entry</h3>
            <p className="text-xs text-white/30 mt-0.5">Your name stays hidden until a winner is picked</p>
          </div>
          <button onClick={onClose}>
            <X className="w-4 h-4 text-white/30" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stem pack reminder */}
          {competition.stem_pack_url && (
            <a href={competition.stem_pack_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center space-x-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Download className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-purple-300">Download Stem Pack</p>
                <p className="text-[10px] text-purple-400/60">
                  {competition.bpm && `${competition.bpm} BPM`}
                  {competition.key && ` · ${competition.key}`}
                </p>
              </div>
            </a>
          )}

          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Entry Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give your entry a name..."
              maxLength={80}
              className="w-full bg-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20 transition"
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">
              Audio File <span className="text-white/20">(MP3, WAV, AAC)</span>
            </label>
            <label className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-white/[0.1] hover:border-purple-500/40 transition cursor-pointer bg-white/[0.02]">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={e => setAudioFile(e.target.files?.[0] || null)}
              />
              {audioFile ? (
                <div className="text-center">
                  <Music className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                  <p className="text-xs text-white/70 truncate max-w-[200px]">{audioFile.name}</p>
                  <p className="text-[10px] text-white/30">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-5 h-5 text-white/20 mx-auto mb-1" />
                  <p className="text-xs text-white/30">Tap to upload your audio</p>
                </div>
              )}
            </label>
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">
              Note to Judges <span className="text-white/20">(optional, private)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Anything you want the judges to know..."
              rows={2}
              maxLength={300}
              className="w-full bg-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none resize-none border border-white/[0.06] focus:border-white/20 transition"
            />
          </div>

          {error && (
            <div className="flex items-center space-x-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={uploading || !audioFile || !title.trim()}
            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition active:scale-95 disabled:opacity-40 bg-purple-600 hover:bg-purple-500 text-white">
            {uploading
              ? <><Loader className="w-4 h-4 animate-spin" /><span>Uploading...</span></>
              : <><Upload className="w-4 h-4" /><span>Submit Entry</span></>}
          </button>

          <p className="text-[10px] text-white/20 text-center leading-relaxed">
            By submitting you confirm this is your original work and grant Feelz Machine
            the right to publish the winning version on the platform.
          </p>
        </div>
        <div className="h-6" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
// ── How It Works Panel ───────────────────────────────────────
function HowItWorksPanel({ type, mode, votesAllowed, prize }) {
  const [open, setOpen] = useState(false);

  const steps = type === 'paid_collab' ? [
    { icon: '🎧', title: 'Listen to the track',       body: "Download the stems or beat provided. Get familiar with what's been built so far." },
    { icon: '🎤', title: 'Record your part',           body: 'Create your verse, hook, drums — whatever the brief asks for. Brand new recording only, no existing tracks.' },
    { icon: '📤', title: 'Upload your entry',          body: 'Give it a title and submit before entries close. Your name stays hidden until the winner is revealed.' },
    { icon: '🗳️', title: 'Fans vote',                  body: `Each fan gets ${votesAllowed} vote${votesAllowed > 1 ? 's' : ''}. Most votes wins. Voting opens when entries close.` },
    { icon: '💰', title: 'Winner gets paid',           body: `${prize} paid automatically via PayPal — make sure your PayPal email is set in your profile. Both artists get collab credit on their profiles.` },
  ] : [
    { icon: '🎲', title: "This week's prompt",        body: `The wheel landed on a ${mode === 'singer' ? 'vocalist' : 'beatmaker'} challenge. Your track must be inspired by the prompt — original work only.` },
    { icon: '🎵', title: 'Make something new',         body: 'Record or produce a brand new track for this challenge. No existing uploads — fresh work only.' },
    { icon: '📤', title: 'Submit before deadline',     body: 'Upload your entry with a title. Your name stays anonymous until a winner is crowned — judged purely on the music.' },
    { icon: '🗳️', title: 'Community votes',            body: `Every listener gets ${votesAllowed} vote${votesAllowed > 1 ? 's' : ''}. Most votes wins. Voting opens Sunday 5pm and closes Sunday 11:59pm.` },
    { icon: '🏆', title: "Winner's reward",           body: prize || '3 months Pro or Premium automatically applied — plus Verified badge on your profile.' },
  ];

  const rules = type === 'paid_collab' ? [
    "Entries must be original, newly recorded for this competition",
    "The provided stems/beat must be used as the base",
    "Free, Pro and Premium accounts can all enter",
    "One entry per artist",
    "Winner's PayPal email must be set in their profile before payout",
    "Disqualified entries do not receive the prize",
  ] : [
    "Entries must be original, newly created for this challenge",
    "Track must be genuinely inspired by the prompt — not a stretch",
    'Free, Pro and Premium accounts can all enter',
    "One entry per artist per week",
    "Entries are anonymous until the winner is revealed",
    "Admin can disqualify entries that don't follow the brief",
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition">
        <div className="flex items-center space-x-2">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs font-bold text-white">
            {type === 'paid_collab' ? 'How Paid Collaborations Work' : 'How Collab Roulette Works'}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
          {/* Steps */}
          <div className="space-y-3 pt-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0 text-base">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-xs font-bold text-white mb-0.5">{step.title}</p>
                  <p className="text-xs text-white/40 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Rules */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Rules</p>
            <ul className="space-y-1.5">
              {rules.map((rule, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <span className="text-white/20 text-xs mt-0.5 flex-shrink-0">·</span>
                  <p className="text-xs text-white/40 leading-relaxed">{rule}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompetitionRoomPage() {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  const { user, artist, isAdmin } = useAuth();
  const { isPro, isPremium } = useTier();

  const [competition, setCompetition] = useState(null);
  const [entries, setEntries]         = useState([]);
  const [myVotes, setMyVotes]         = useState({ votes_cast: 0, voted_entries: [] });
  const [loading, setLoading]         = useState(true);
  const [voting, setVoting]           = useState(null);
  const [showSubmit, setShowSubmit]   = useState(false);
  const [myEntry, setMyEntry]         = useState(null);
  const [error, setError]             = useState('');
  const [toast, setToast]             = useState('');

  // Wheel challenges use 2 votes, others use competition setting or 3
  const MAX_VOTES = competition?.max_votes_per_user || (competition?.wheel_challenge ? 2 : 3);
  // Free tier can enter wheel and paid collab competitions
  // Standard competitions still require Pro or Premium
  const canEnter = isPro || isPremium ||
    (competition?.wheel_challenge || competition?.paid_collab ? !!user : false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    if (!competitionId) return;
    setLoading(true);
    try {
      // Load competition
      const { data: comp, error: compErr } = await supabase
        .from('competitions')
        .select('*')
        .eq('id', competitionId)
        .single();
      if (compErr) throw compErr;
      setCompetition(comp);

      // Load entries — public sees only visible (winners) + own entry
      // Admin sees all
      let entryQuery = supabase
        .from('competition_entries')
        .select('*, artists(id, artist_name, profile_image_url, slug, user_id)')
        .eq('competition_id', competitionId)
        .eq('disqualified', false)
        .order('vote_count', { ascending: false });

      if (!isAdmin) {
        // Non-admins: visible entries OR own entry
        if (artist) {
          entryQuery = entryQuery.or(`is_visible.eq.true,artist_id.eq.${artist.id}`);
        } else {
          entryQuery = entryQuery.eq('is_visible', true);
        }
      }

      const { data: entryData } = await entryQuery;
      // Randomise order during voting to prevent position bias
      const raw = entryData || [];
      const shuffled = competition?.status === 'voting' && !isAdmin
        ? [...raw].sort(() => Math.random() - 0.5)
        : raw;
      setEntries(shuffled);

      // Find my entry
      if (artist) {
        const mine = (entryData || []).find(e => e.artist_id === artist.id);
        setMyEntry(mine || null);
      }

      // Load my vote data
      if (user) {
        const { data: voteTracker } = await supabase
          .from('competition_user_votes')
          .select('votes_cast')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: myVoteRows } = await supabase
          .from('competition_votes')
          .select('entry_id')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id);

        setMyVotes({
          votes_cast: voteTracker?.votes_cast || 0,
          voted_entries: (myVoteRows || []).map(v => v.entry_id),
        });
      }
    } catch (err) {
      console.error('Load competition error:', err);
      setError('Failed to load competition');
    }
    setLoading(false);
  }, [competitionId, user, artist, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleVote = async (entryId) => {
    if (!user) { navigate('/login'); return; }
    if (myVotes.votes_cast >= MAX_VOTES) {
      showToast(`You've used all ${MAX_VOTES} votes`);
      return;
    }
    setVoting(entryId);
    try {
      const { error: voteErr } = await supabase.from('competition_votes').insert({
        competition_id: competitionId,
        entry_id: entryId,
        user_id: user.id,
      });
      if (voteErr) {
        if (voteErr.code === '23505') { showToast('Already voted for this entry'); }
        else throw voteErr;
      } else {
        // Keep the vote tracker table in sync so the limit survives page refresh
        await supabase.from('competition_user_votes').upsert(
          { competition_id: competitionId, user_id: user.id, votes_cast: myVotes.votes_cast + 1 },
          { onConflict: 'competition_id,user_id' }
        );
        setMyVotes(prev => ({
          votes_cast: prev.votes_cast + 1,
          voted_entries: [...prev.voted_entries, entryId],
        }));
        setEntries(prev => prev.map(e =>
          e.id === entryId ? { ...e, vote_count: (e.vote_count || 0) + 1 } : e
        ));
        showToast(`Vote cast! ${MAX_VOTES - myVotes.votes_cast - 1} votes remaining`);
      }
    } catch (err) {
      console.error('Vote error:', err);
      showToast('Failed to vote. Try again.');
    }
    setVoting(null);
  };

  const handleDisqualify = async (entryId) => {
    if (!isAdmin) return;
    if (!window.confirm('Disqualify this entry?')) return;
    try {
      await supabase.from('competition_entries')
        .update({ disqualified: true })
        .eq('id', entryId);
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, disqualified: true } : e));
      showToast('Entry disqualified');
    } catch (err) {
      showToast('Failed to disqualify');
    }
  };

  const handleCrownWinner = async (entryId) => {
    if (!isAdmin) return;
    if (!window.confirm('Crown this entry as the winner? This will make their name public and grant them Verified status.')) return;
    try {
      // 1. Mark entry as winner and visible
      await supabase.from('competition_entries')
        .update({ is_winner: true, is_visible: true })
        .eq('id', entryId);

      // 2. Update competition
      await supabase.from('competitions')
        .update({
          winner_entry_id: entryId,
          winner_announced_at: new Date().toISOString(),
          status: 'completed',
        })
        .eq('id', competitionId);

      // 3. Grant verified status to winner artist
      const winnerEntry = entries.find(e => e.id === entryId);
      if (winnerEntry?.artist_id) {
        await supabase.from('artists')
          .update({ is_verified: true })
          .eq('id', winnerEntry.artist_id);

        // 4. Grant tier reward if this is a wheel challenge — upgrade based on current tier
        if (competition?.wheel_challenge) {
          try {
            const now = new Date();
            const { data: existingSub } = await supabase
              .from('artist_tier_subscriptions')
              .select('id, tier_id, platform_tiers(slug)')
              .eq('artist_id', winnerEntry.artist_id).eq('status', 'active').maybeSingle();
            const currentSlug = existingSub?.platform_tiers?.slug || 'free';
            const expiry = new Date(now); expiry.setDate(expiry.getDate() + 90);

            if (currentSlug === 'free') {
              const { data: proTier } = await supabase
                .from('platform_tiers').select('id').eq('slug', 'pro').maybeSingle();
              if (proTier) await supabase.from('artist_tier_subscriptions').insert({
                artist_id: winnerEntry.artist_id, tier_id: proTier.id,
                status: 'active', started_at: now.toISOString(), expires_at: expiry.toISOString(),
              });
            } else if (currentSlug === 'pro') {
              const { data: premTier } = await supabase
                .from('platform_tiers').select('id').eq('slug', 'premium').maybeSingle();
              if (premTier) {
                await supabase.from('artist_tier_subscriptions')
                  .update({ status: 'superseded', updated_at: now.toISOString() })
                  .eq('id', existingSub.id);
                await supabase.from('artist_tier_subscriptions').insert({
                  artist_id: winnerEntry.artist_id, tier_id: premTier.id,
                  status: 'active', started_at: now.toISOString(), expires_at: expiry.toISOString(),
                });
              }
            } else if (currentSlug === 'premium') {
              // Already Premium — featured placement for 7 days
              await supabase.from('artists').update({
                featured: true,
                featured_until: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
              }).eq('id', winnerEntry.artist_id);
            }
          } catch(e) { console.error('Tier grant error:', e); }
        }

        // 5. Notify winner
        const tierRewardMsg = competition?.wheel_challenge
          ? ' Your tier reward has been applied automatically — check your profile.'
          : '';
        await supabase.from('notifications').insert({
          artist_id: winnerEntry.artist_id,
          user_id: winnerEntry.artists?.user_id,
          type: 'competition_winner',
          title: '🏆 You won the competition!',
          message: `You've been crowned winner of "${competition?.title}". You're now Verified on Feelz Machine!${tierRewardMsg}`,
          metadata: { competition_id: competitionId, competition_title: competition?.title, wheel_challenge: !!competition?.wheel_challenge },
        }).catch(() => {});
      }

      showToast(competition?.wheel_challenge ? '🏆 Winner crowned! Verified + tier reward granted.' : '🏆 Winner crowned! Verified status granted.');
      load();
    } catch (err) {
      console.error('Crown winner error:', err);
      showToast('Failed to crown winner');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Trophy className="w-8 h-8 text-yellow-400/30 animate-pulse" />
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <Trophy className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-white/40">Competition not found</p>
        <button onClick={() => navigate('/chat')} className="mt-4 text-xs text-white/30">← Back to rooms</button>
      </div>
    );
  }

  const visibleEntries = isAdmin
    ? entries.filter(e => !e.disqualified)
    : entries.filter(e => !e.disqualified);

  const isOpen = competition.status === 'open';
  const isVoting = competition.status === 'voting';
  const isCompleted = competition.status === 'completed';

  return (
    <div className="min-h-screen pb-32">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/90 backdrop-blur-sm px-5 pt-14 md:pt-4 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/competitions')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <Trophy className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <h1 className="text-base font-bold text-white truncate">{competition.title}</h1>
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <StatusBadge status={competition.status} />
              {competition.entries_close_at && isOpen && (
                <span className="text-[10px] text-white/30 flex items-center space-x-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{timeLeft(competition.entries_close_at)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Competition brief */}
      <div className="px-5 pt-5 pb-3 space-y-4">
        {competition.description && (
          <p className="text-sm text-white/60 leading-relaxed">{competition.description}</p>
        )}

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2">
          {competition.brief && (
            <div className="col-span-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Looking For</p>
              <p className="text-sm text-white">{competition.brief}</p>
            </div>
          )}
          {competition.bpm && (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">BPM</p>
              <p className="text-sm font-bold text-white">{competition.bpm}</p>
            </div>
          )}
          {competition.key && (
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Key</p>
              <p className="text-sm font-bold text-white">{competition.key}</p>
            </div>
          )}
        </div>

        {/* Prize */}
        {competition.prize_description && (
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-yellow-300">Prize</p>
              <p className="text-xs text-yellow-400/70">{competition.prize_description}</p>
              {competition.cash_prize_amount > 0 && (
                <p className="text-xs font-bold text-yellow-300 mt-0.5">
                  + {competition.cash_prize_currency} {competition.cash_prize_amount.toFixed(0)} cash
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── How It Works panel ── */}
        {(() => {
          const isWheel = competition?.wheel_challenge;
          const isPaidCollab = competition?.paid_collab;
          if (!isWheel && !isPaidCollab) return null;
          return (
            <HowItWorksPanel
              type={isPaidCollab ? 'paid_collab' : 'wheel'}
              mode={competition?.mode}
              votesAllowed={MAX_VOTES}
              prize={isPaidCollab ? '$50 USD cash' : competition?.prize_description}
            />
          );
        })()}

        {/* Stem pack download */}
        {competition.stem_pack_url && (
          <a href={competition.stem_pack_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center space-x-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Download className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-purple-300">Download Stem Pack / Beat</p>
              <p className="text-[10px] text-purple-400/60">
                Use this to create your entry
                {competition.bpm && ` · ${competition.bpm} BPM`}
                {competition.key && ` · ${competition.key}`}
              </p>
            </div>
          </a>
        )}

        {/* MP3 preview */}
        {competition.mp3_preview_url && (
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Music className="w-4 h-4 text-white/40 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-white/70">Preview Track</p>
              <audio controls src={competition.mp3_preview_url} className="w-full mt-1 h-8" />
            </div>
          </div>
        )}

        {/* Votes remaining */}
        {isVoting && user && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center space-x-2">
              <ChevronUp className="w-4 h-4 text-purple-400" />
              <p className="text-xs text-white/60">Your votes</p>
            </div>
            <div className="flex items-center space-x-1">
              {Array.from({ length: MAX_VOTES }).map((_, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full ${
                  i < myVotes.votes_cast ? 'bg-purple-500' : 'bg-white/[0.1]'
                }`} />
              ))}
              <span className="text-xs text-white/30 ml-1">
                {MAX_VOTES - myVotes.votes_cast} left
              </span>
            </div>
          </div>
        )}

        {/* Submit entry CTA */}
        {isOpen && (
          <div>
            {!user ? (
              <button onClick={() => navigate('/login')}
                className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition">
                Sign in to Enter
              </button>
            ) : !canEnter ? (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center space-x-2 mb-2">
                  <Lock className="w-4 h-4 text-yellow-400" />
                  <p className="text-xs font-bold text-yellow-300">
                    {competition?.wheel_challenge || competition?.paid_collab
                      ? 'Sign in to enter this challenge'
                      : 'Pro or Premium required to enter'}
                  </p>
                </div>
                {!(competition?.wheel_challenge || competition?.paid_collab) && (
                  <button onClick={() => navigate('/upgrade')}
                    className="text-xs text-yellow-400/70 hover:text-yellow-400 transition underline">
                    Upgrade your plan →
                  </button>
                )}
              </div>
            ) : myEntry ? (
              <div className="flex items-center space-x-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-green-300">Entry submitted!</p>
                  <p className="text-[10px] text-green-400/60">"{myEntry.title}" — awaiting judging</p>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowSubmit(true)}
                className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm flex items-center justify-center space-x-2 transition active:scale-[0.98]">
                <Upload className="w-4 h-4" />
                <span>Submit Your Entry</span>
              </button>
            )}
          </div>
        )}

        {competition.status === 'upcoming' && (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
            <Clock className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/40">Competition opens soon</p>
            {competition.entries_open_at && (
              <p className="text-xs text-white/20 mt-1">
                Opens {new Date(competition.entries_open_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Entries section */}
      {(isVoting || isCompleted || isAdmin) && visibleEntries.length > 0 && (
        <div className="px-5 pt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
              {isCompleted ? 'Winning Entry' : `${visibleEntries.length} Entr${visibleEntries.length !== 1 ? 'ies' : 'y'}`}
            </p>
            {isAdmin && (
              <span className="text-[10px] text-purple-400/60 font-medium">Admin view — names visible</span>
            )}
          </div>

          {/* Entry count + share */}
          {visibleEntries.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs text-white/40">
                {visibleEntries.length} {visibleEntries.length === 1 ? 'artist' : 'artists'} entered
                {competition.status === 'voting' && ' · order randomised'}
              </p>
              <button
                onClick={() => {
                  const url = window.location.origin + '/competitions';
                  if (navigator.share) {
                    navigator.share({ title: competition.title, text: 'Check out this challenge on Feelz Machine', url }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => {});
                  }
                }}
                className="text-[10px] text-purple-400/60 hover:text-purple-400 transition">
                Share challenge →
              </button>
            </div>
          )}

          <div className="space-y-3">
            {visibleEntries.map((entry, i) => (
              <div key={entry.id}>
                <EntryCard
                  entry={entry}
                  index={i}
                  myVotes={myVotes}
                  totalVotesAllowed={MAX_VOTES}
                  onVote={handleVote}
                  voting={voting}
                  isAdmin={isAdmin}
                  onDisqualify={handleDisqualify}
                  status={competition.status}
                  competition={competition}
                />
                {/* Admin crown button */}
                {isAdmin && !entry.is_winner && !isCompleted && (
                  <button
                    onClick={() => handleCrownWinner(entry.id)}
                    className="mt-2 w-full py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-xs font-bold text-yellow-400 hover:bg-yellow-500/10 transition flex items-center justify-center space-x-2">
                    <Crown className="w-3.5 h-3.5" />
                    <span>Crown as Winner</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isVoting && visibleEntries.length === 0 && !isAdmin && (
        <div className="px-5 py-12 text-center">
          <Music className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">Entries are being reviewed</p>
          <p className="text-xs text-white/15 mt-1">Voting opens soon</p>
        </div>
      )}

      {/* Submit modal */}
      {showSubmit && competition && artist && (
        <SubmitEntryModal
          competition={competition}
          artistId={artist.id}
          onClose={() => setShowSubmit(false)}
          onSubmitted={() => { showToast('Entry submitted! 🎉'); load(); }}
        />
      )}
    </div>
  );
}