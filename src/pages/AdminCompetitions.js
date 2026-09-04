import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Trophy, Plus, Loader, Crown, ChevronRight, Clock, Check,
  AlertCircle, Upload, DollarSign, Users, X, Edit2, Zap, Play, ArrowLeft, Music, RefreshCw,
} from 'lucide-react';

const STATUS_OPTIONS = ['upcoming', 'open', 'voting', 'closed', 'completed'];

const BLANK_COMP = {
  title: '',
  description: '',
  brief: '',
  genre: '',
  bpm: '',
  key: '',
  stem_pack_url: '',
  mp3_preview_url: '',
  prize_description: 'Featured placement + Verified status',
  cash_prize_amount: 0,
  cash_prize_currency: 'ZAR',
  status: 'upcoming',
  entries_open_at: '',
  entries_close_at: '',
  voting_open_at: '',
  voting_close_at: '',
  competition_type: 'standard', // 'standard' | 'wheel' | 'paid_collab'
  max_votes_per_user: 3,
};

const PAID_COLLAB_DEFAULTS = {
  prize_description: '$50 USD cash + collab credit on both profiles',
  cash_prize_amount: 50,
  cash_prize_currency: 'USD',
  competition_type: 'paid_collab',
  max_votes_per_user: 2,
};

function CompetitionForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || BLANK_COMP);
  const [stemUploading, setStemUploading]       = useState(false);
  const [previewUploading, setPreviewUploading] = useState(false);
  const [stemFileName, setStemFileName]         = useState('');
  const [previewFileName, setPreviewFileName]   = useState('');
  const stemRef    = useRef(null);
  const previewRef = useRef(null);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const uploadStem = async (file) => {
    if (!file) return;
    setStemUploading(true);
    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const name = `competition-stems/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
      const { error } = await supabase.storage.from('feelz-samples').upload(name, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(name);
      set('stem_pack_url', publicUrl);
      setStemFileName(file.name);
    } catch (err) { alert('Stem upload failed: ' + err.message); }
    setStemUploading(false);
  };

  const uploadPreview = async (file) => {
    if (!file) return;
    setPreviewUploading(true);
    try {
      const name = `competition-previews/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
      const { error } = await supabase.storage.from('feelz-samples').upload(name, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(name);
      set('mp3_preview_url', publicUrl);
      setPreviewFileName(file.name);
    } catch (err) { alert('Preview upload failed: ' + err.message); }
    setPreviewUploading(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">

        {/* Competition type */}
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Competition Type</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'standard',   label: '🏆 Standard',         sub: 'Regular competition' },
              { key: 'paid_collab', label: '💰 Paid Collaboration', sub: '$50 USD · stems provided' },
            ].map(({ key, label, sub }) => (
              <button key={key} type="button"
                onClick={() => {
                  if (key === 'paid_collab') {
                    setForm(prev => ({ ...prev, ...PAID_COLLAB_DEFAULTS, competition_type: key }));
                  } else {
                    set('competition_type', key);
                  }
                }}
                className={`p-3 rounded-xl border text-left transition active:scale-[0.98] ${
                  form.competition_type === key
                    ? key === 'paid_collab'
                      ? 'border-yellow-500/40 bg-yellow-500/10'
                      : 'border-white/20 bg-white/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}>
                <p className={`text-xs font-bold ${form.competition_type === key ? 'text-white' : 'text-white/40'}`}>{label}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
          {form.competition_type === 'paid_collab' && (
            <div className="mt-2 p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20">
              <p className="text-xs text-yellow-300 font-semibold mb-1">💰 Paid Collaboration</p>
              <p className="text-[10px] text-yellow-400/60 leading-relaxed">
                Upload your stems/beat/hook below. Artists complete the missing piece. Fans vote. Winner gets $50 USD automatically paid via PayPal + collab credit on both profiles. Free tier artists can enter.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder={form.competition_type === 'paid_collab' ? 'e.g. Need a Vocalist for Second Verse — Afrobeats' : 'e.g. Best Feature — Afrobeats Banger'}
            className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="What is this competition about?"
            rows={2}
            className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20 resize-none" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Brief — What are you looking for?</label>
          <input value={form.brief} onChange={e => set('brief', e.target.value)}
            placeholder="e.g. Best feature verse, hook section only"
            className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Genre</label>
            <input value={form.genre} onChange={e => set('genre', e.target.value)}
              placeholder="Afrobeats"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">BPM</label>
            <input type="number" value={form.bpm} onChange={e => set('bpm', e.target.value)}
              placeholder="100"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Key</label>
            <input value={form.key} onChange={e => set('key', e.target.value)}
              placeholder="C minor"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
          </div>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Stem Pack / Beat File</label>
          <input ref={stemRef} type="file" accept=".mp3,.wav,.zip,.aiff,.flac" className="hidden"
            onChange={e => uploadStem(e.target.files[0])} />
          <button type="button" onClick={() => stemRef.current?.click()}
            disabled={stemUploading}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition text-left disabled:opacity-50">
            {stemUploading
              ? <Loader className="w-4 h-4 text-white/40 animate-spin flex-shrink-0" />
              : <Upload className="w-4 h-4 text-white/30 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              {stemFileName || form.stem_pack_url
                ? <p className="text-sm text-green-400 truncate">{stemFileName || 'File uploaded ✓'}</p>
                : <p className="text-sm text-white/20">Upload ZIP, MP3, WAV or AIFF stems</p>}
            </div>
          </button>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Preview Track <span className="text-white/20 normal-case">· private reference for artists entering</span></label>
          <input ref={previewRef} type="file" accept=".mp3,.wav,.aiff,.flac,.m4a" className="hidden"
            onChange={e => uploadPreview(e.target.files[0])} />
          <button type="button" onClick={() => previewRef.current?.click()}
            disabled={previewUploading}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition text-left disabled:opacity-50">
            {previewUploading
              ? <Loader className="w-4 h-4 text-white/40 animate-spin flex-shrink-0" />
              : <Music className="w-4 h-4 text-white/30 flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              {previewFileName || form.mp3_preview_url
                ? <p className="text-sm text-green-400 truncate">{previewFileName || 'File uploaded ✓'}</p>
                : <p className="text-sm text-white/20">Upload MP3, WAV or M4A</p>}
            </div>
          </button>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Prize Description</label>
          <input value={form.prize_description} onChange={e => set('prize_description', e.target.value)}
            placeholder="Featured placement + Verified status"
            className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Cash Prize Amount</label>
            <input type="number" min="0" step="50" value={form.cash_prize_amount}
              onChange={e => set('cash_prize_amount', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Currency</label>
            <select value={form.cash_prize_currency} onChange={e => set('cash_prize_currency', e.target.value)}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]">
              {['ZAR', 'USD', 'GBP', 'EUR', 'NGN', 'GHS', 'KES'].map(c => (
                <option key={c} value={c} className="bg-neutral-900">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Votes Per Fan</label>
            <select value={form.max_votes_per_user || 3} onChange={e => set('max_votes_per_user', parseInt(e.target.value))}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]">
              {[1,2,3,5].map(n => <option key={n} value={n} className="bg-neutral-900">{n} vote{n>1?'s':''}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}
            className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white outline-none border border-white/[0.06]">
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s} className="bg-neutral-900 capitalize">{s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Entries Open</label>
            <input type="datetime-local" value={form.entries_open_at}
              onChange={e => set('entries_open_at', e.target.value)}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Entries Close</label>
            <input type="datetime-local" value={form.entries_close_at}
              onChange={e => set('entries_close_at', e.target.value)}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Voting Opens</label>
            <input type="datetime-local" value={form.voting_open_at}
              onChange={e => set('voting_open_at', e.target.value)}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]" />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Voting Closes</label>
            <input type="datetime-local" value={form.voting_close_at}
              onChange={e => set('voting_close_at', e.target.value)}
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white outline-none border border-white/[0.06]" />
          </div>
        </div>
      </div>

      <div className="flex space-x-3 pt-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-white/50 hover:text-white/70 transition">
          Cancel
        </button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}
          className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-black font-bold text-sm flex items-center justify-center space-x-2 disabled:opacity-40 transition hover:bg-yellow-400">
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : 'Save Competition'}</span>
        </button>
      </div>
    </div>
  );
}

// ── Payout Modal ──────────────────────────────────────────────
function PayoutModal({ competition, onClose }) {
  const [winnerEntry, setWinnerEntry] = useState(null);
  const [paypalEmail, setPaypalEmail] = useState('');
  const [sending, setSending]         = useState(false);
  const [result, setResult]           = useState('');
  const [error, setError]             = useState('');

  useEffect(() => {
    const load = async () => {
      if (!competition.winner_entry_id) return;
      const { data } = await supabase
        .from('competition_entries')
        .select('*, artists(id, artist_name, paypal_email)')
        .eq('id', competition.winner_entry_id)
        .single();
      setWinnerEntry(data);
      if (data?.artists?.paypal_email) setPaypalEmail(data.artists.paypal_email);
    };
    load();
  }, [competition]);

  const handlePayout = async () => {
    if (!paypalEmail.trim()) { setError('PayPal email required'); return; }
    setSending(true);
    setError('');
    try {
      // Call Netlify function for PayPal payout
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/paypal-payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          email: paypalEmail.trim(),
          amount: competition.cash_prize_amount,
          currency: competition.cash_prize_currency,
          note: `Prize: ${competition.title} — Feelz Machine`,
          competition_id: competition.id,
          entry_id: competition.winner_entry_id,
          artist_id: winnerEntry?.artist_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payout failed');
      setResult(`✅ Payout sent! Batch ID: ${data.batch_id}`);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-white/[0.08] p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            <span>Send Cash Prize</span>
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-yellow-300 font-semibold">{competition.title}</p>
            <p className="text-lg font-bold text-yellow-400 mt-1">
              {competition.cash_prize_currency} {competition.cash_prize_amount?.toFixed(2)}
            </p>
            {winnerEntry && (
              <p className="text-xs text-yellow-400/60 mt-1">Winner: {winnerEntry.artists?.artist_name}</p>
            )}
          </div>

          <div>
            <label className="text-xs text-white/40 uppercase tracking-wide block mb-1.5">Winner's PayPal Email</label>
            <input value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)}
              placeholder="winner@example.com"
              className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
            <p className="text-[10px] text-white/20 mt-1">
              Pre-filled from artist profile if they've added their PayPal email.
            </p>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {result && <p className="text-xs text-green-400">{result}</p>}

          <button onClick={handlePayout} disabled={sending || !paypalEmail.trim() || !!result}
            className="w-full py-3 rounded-xl bg-yellow-500 text-black font-bold text-sm flex items-center justify-center space-x-2 disabled:opacity-40 transition hover:bg-yellow-400">
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            <span>{sending ? 'Processing...' : 'Send via PayPal'}</span>
          </button>

          <p className="text-[10px] text-white/20 text-center">
            This sends from your PayPal business account balance. Ensure sufficient funds first.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Competitions Page ──────────────────────────────
export default function AdminCompetitions({ embedded = false }) {
  const navigate  = useNavigate();
  const { isAdmin } = useAuth();

  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showCreate, setShowCreate]     = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [spinning, setSpinning]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState('');
  const [payoutComp, setPayoutComp]     = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('competitions')
      .select('*')
      .order('created_at', { ascending: false });
    setCompetitions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        bpm: form.bpm ? parseInt(form.bpm) : null,
        cash_prize_amount: parseFloat(form.cash_prize_amount) || 0,
        entries_open_at: form.entries_open_at || null,
        entries_close_at: form.entries_close_at || null,
        voting_open_at: form.voting_open_at || null,
        voting_close_at: form.voting_close_at || null,
        competition_type: form.competition_type || 'standard',
        paid_collab: form.competition_type === 'paid_collab',
        max_votes_per_user: parseInt(form.max_votes_per_user) || 3,
      };
      const { error } = await supabase.from('competitions').insert(payload);
      if (error) throw error;
      showToast('Competition created!');
      setShowCreate(false);
      load();
    } catch (err) {
      showToast('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleUpdate = async (form) => {
    if (!editingId) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        bpm: form.bpm ? parseInt(form.bpm) : null,
        cash_prize_amount: parseFloat(form.cash_prize_amount) || 0,
        entries_open_at: form.entries_open_at || null,
        entries_close_at: form.entries_close_at || null,
        voting_open_at: form.voting_open_at || null,
        voting_close_at: form.voting_close_at || null,
        competition_type: form.competition_type || 'standard',
        paid_collab: form.competition_type === 'paid_collab',
        max_votes_per_user: parseInt(form.max_votes_per_user) || 3,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('competitions').update(payload).eq('id', editingId);
      if (error) throw error;
      showToast('Competition updated!');
      setEditingId(null);
      load();
    } catch (err) {
      showToast('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id, status) => {
    await supabase.from('competitions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setCompetitions(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    showToast(`Status → ${status}`);
  };

  const handleNewWeek = async () => {
    if (!window.confirm('Start a new week? This will close the current wheel competition and create a fresh one.')) return;
    setSpinning(true);
    try {
      const current = competitions.find(comp => comp.wheel_challenge && comp.status === 'open');
      if (current) {
        await supabase.from('competitions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', current.id);
      }
      await supabase.from('wheel_challenges').update({ is_current: false }).eq('is_current', true);

      const now          = new Date();
      const entriesClose = new Date(now.getTime() + 7 * 86400000);
      const votingClose  = new Date(now.getTime() + 9 * 86400000);
      const weekNum      = competitions.filter(comp => comp.wheel_challenge).length + 1;

      const { data: newComp, error: compErr } = await supabase
        .from('competitions')
        .insert({
          title:              `Collab Roulette — Week ${weekNum}`,
          description:        'First official Feelz Machine wheel challenge',
          prize_description:  'Win 3 months Pro or Premium',
          status:             'open',
          wheel_challenge:    true,
          entries_open_at:    now.toISOString(),
          entries_close_at:   entriesClose.toISOString(),
          voting_open_at:     entriesClose.toISOString(),
          voting_close_at:    votingClose.toISOString(),
          max_votes_per_user: 2,
        })
        .select('id')
        .single();

      if (compErr) throw compErr;

      // Create a placeholder wheel challenge — artist will see it spin on the wheel page
      await supabase.from('wheel_challenges').insert({
        competition_id: newComp.id,
        prompt:         'New week — challenge prompt coming soon',
        mode:           'Beats',
        is_current:     true,
        spun_at:        now.toISOString(),
      });

      showToast('✓ New week started');
      load();
    } catch (err) {
      showToast('Error: ' + err.message);
    }
    setSpinning(false);
  };

  if (!isAdmin) return null;

  return (
    <div className={embedded ? "pb-8" : "min-h-screen pb-24"}>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      {!embedded && (
      <div className="flex items-center justify-between px-5 pt-14 md:pt-4 pb-4 sticky top-0 z-20 bg-black/90 backdrop-blur-sm border-b border-white/[0.04]">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h1 className="text-base font-bold text-white">Competitions</h1>
          </div>
          <button
            onClick={handleNewWeek}
            disabled={spinning}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/15 transition disabled:opacity-40"
          >
            {spinning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>New Week</span>
          </button>
          <div className="flex items-center space-x-2">
          </div>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-semibold transition hover:bg-yellow-500/30">
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        )}
      </div>

      )}
      <div className="px-5 pt-5 space-y-5">
        {/* Create form */}
        {showCreate && (
          <div className="rounded-2xl bg-white/[0.02] border border-yellow-500/20 p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span>New Competition</span>
            </h3>
            <CompetitionForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-white/20" />
          </div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">No competitions yet</p>
          </div>
        ) : (
          competitions.map(comp => (
            <div key={comp.id} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              {editingId === comp.id ? (
                <div className="p-5">
                  <CompetitionForm
                    initial={comp}
                    onSave={handleUpdate}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="text-sm font-bold text-white truncate">{comp.title}</p>
                          {comp.paid_collab && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-yellow-500/20 text-yellow-300 flex-shrink-0">💰 PAID COLLAB</span>}
                          {comp.wheel_challenge && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-pink-500/20 text-pink-300 flex-shrink-0">🎲 WHEEL</span>}
                        </div>
                        {comp.brief && <p className="text-xs text-white/40 mt-0.5 truncate">{comp.brief}</p>}
                      </div>
                      <div className="flex items-center space-x-2 ml-3">
                        <button onClick={() => setEditingId(comp.id)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                          <Edit2 className="w-3.5 h-3.5 text-white/30" />
                        </button>
                        <button onClick={() => navigate(`/competition/${comp.id}`)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                          <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center space-x-3 mb-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        comp.status === 'open' ? 'bg-green-500/10 text-green-400' :
                        comp.status === 'voting' ? 'bg-purple-500/10 text-purple-400' :
                        comp.status === 'completed' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-white/[0.06] text-white/40'
                      }`}>{comp.status}</span>
                      <span className="text-[10px] text-white/30">
                        {comp.competition_entries?.[0]?.count || 0} entries
                      </span>
                      {comp.cash_prize_amount > 0 && (
                        <span className="text-[10px] text-yellow-400/70">
                          {comp.cash_prize_currency} {comp.cash_prize_amount}
                        </span>
                      )}
                    </div>

                    {/* Quick status controls */}
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map(s => (
                        <button key={s}
                          onClick={() => handleStatusChange(comp.id, s)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition capitalize ${
                            comp.status === s
                              ? 'bg-white text-black'
                              : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
                          }`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payout button if winner + cash prize */}
                  {comp.winner_entry_id && comp.cash_prize_amount > 0 && (
                    <div className="px-4 pb-4">
                      <button onClick={() => setPayoutComp(comp)}
                        className="w-full py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold flex items-center justify-center space-x-2 hover:bg-yellow-500/20 transition">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Send Cash Prize via PayPal</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {payoutComp && (
        <PayoutModal competition={payoutComp} onClose={() => setPayoutComp(null)} />
      )}
    </div>
  );
}