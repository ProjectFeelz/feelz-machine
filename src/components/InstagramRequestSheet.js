// src/components/InstagramRequestSheet.js
//
// Artist asks for a track to go into Instagram and Facebook's music library.
// Everything is checked again in the database by submit_distribution_request()
// (migration 151); this sheet only collects it clearly.

import React, { useState } from 'react';
import { X, Loader, Plus, Trash2, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

const STATEMENTS = [
  { key: 'own_recording',        text: 'I own this recording, or have the right to release it.' },
  { key: 'original_song',        text: 'It is an original song, not a cover, remix or sound-alike.' },
  { key: 'no_uncleared_samples', text: 'It has no samples, loops or stock sounds I do not have exclusive rights to.' },
  { key: 'not_a_type_beat',      text: 'It is not built on a purchased or free type beat.' },
];

export default function InstagramRequestSheet({ track, onClose, onSent }) {
  const [writers, setWriters] = useState([{ name: '', share: 100 }]);
  const [ticks, setTicks]     = useState({});
  const [isrc, setIsrc]       = useState(track?.isrc || '');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  const total = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
  const allTicked = STATEMENTS.every(s => ticks[s.key]);
  const ready = allTicked && total === 100 && writers.every(w => w.name.trim().length >= 2 && Number(w.share) > 0);

  const setWriter = (i, key, val) => setWriters(ws => ws.map((w, j) => (j === i ? { ...w, [key]: val } : w)));

  const send = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('submit_distribution_request', {
      p_track_id: track.id,
      p_songwriters: writers.map(w => ({ name: w.name.trim(), share: Number(w.share) })),
      p_confirmations: { ...ticks, wording: 'v1-2026-09' },
      p_isrc: isrc.trim() || null,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onSent?.();
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl overflow-y-auto overscroll-contain p-5 space-y-4"
        style={{ maxHeight: 'calc(100dvh - 48px)', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-white">Put "{track.title}" on Instagram</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              People can add it to their Stories and Reels. Meta pays per use, through our distributor.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Confirm</p>
          {STATEMENTS.map(s => (
            <button key={s.key} type="button" onClick={() => setTicks(t => ({ ...t, [s.key]: !t[s.key] }))}
              className="w-full flex items-start space-x-2.5 text-left">
              <span className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border ${ticks[s.key] ? 'bg-purple-500 border-purple-500' : 'border-white/20'}`}>
                {ticks[s.key] && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="text-xs text-white/60 leading-relaxed">{s.text}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Songwriters (shares add up to 100)</p>
          {writers.map((w, i) => (
            <div key={i} className="flex items-center space-x-2">
              <input value={w.name} onChange={e => setWriter(i, 'name', e.target.value)} placeholder="Full name"
                className="flex-1 min-w-0 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
              <input value={w.share} onChange={e => setWriter(i, 'share', e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-16 px-2 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none text-right" />
              <span className="text-xs text-white/30">%</span>
              {writers.length > 1 && (
                <button onClick={() => setWriters(ws => ws.filter((_, j) => j !== i))} className="text-white/30 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setWriters(ws => [...ws, { name: '', share: 0 }])}
              className="text-xs text-purple-300 flex items-center"><Plus className="w-3 h-3 mr-1" />Add songwriter</button>
            <span className={`text-xs ${total === 100 ? 'text-emerald-300' : 'text-amber-300'}`}>{total}%</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1.5">ISRC (if you already have one)</p>
          <input value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="ZA-ABC-26-00001" disabled={!!track?.isrc}
            className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none disabled:opacity-50" />
          <p className="text-[11px] text-white/30 mt-1">No ISRC? Leave it empty and we assign one.</p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button onClick={send} disabled={!ready || busy}
          className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition disabled:opacity-40 flex items-center justify-center">
          {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Send for review'}
        </button>
        <p className="text-[11px] text-white/30 text-center leading-relaxed">
          We check it, then send it to Meta. Songs with type beats, loops or uncleared samples get the whole release refused.
        </p>
      </div>
    </div>
  );
}