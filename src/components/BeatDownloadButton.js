// src/components/BeatDownloadButton.js
//
// Downloads a Sessions beat without leaving the app. The file is
// fetched and saved from this page (see src/utils/downloadInApp.js), so no tab
// is opened and nothing navigates away mid-entry.

import React, { useState } from 'react';
import { Download, Loader, Check } from 'lucide-react';
import { downloadInApp } from '../utils/downloadInApp';

// Sessions beats live in feelz-samples alongside the track masters, so the
// stored public URL stops resolving the day that bucket is made private, and
// nothing else in this path signs it. The server signs it by row id instead.
// Any failure falls back to the stored URL, which is what this did before and
// still works while the bucket is public.
async function resolveBeatUrl(song) {
  if (!song?.id) return song?.beat_url || null;
  try {
    const res = await fetch('/.netlify/functions/stream-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beatIds: [song.id] }),
    });
    if (!res.ok) throw new Error(`stream-url ${res.status}`);
    const { beats } = await res.json();
    return beats?.[song.id]?.url || song.beat_url || null;
  } catch (err) {
    console.error('[beat] signing failed, using stored URL:', err.message);
    return song.beat_url || null;
  }
}

const prettySize = (bytes) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
};

export default function BeatDownloadButton({ song, label = 'Beat', showSize = false, className = '' }) {
  const [state, setState] = useState('idle'); // idle | busy | done | error
  const [pct, setPct] = useState(0);

  if (!song?.beat_url) return null;

  const name = song.beat_filename
    || `${(song.title || 'beat').replace(/[^a-zA-Z0-9 _-]/g, '')} (beat).mp3`;

  const go = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setState('busy'); setPct(0);
    const url = await resolveBeatUrl(song);
    const ok = await downloadInApp(url, name, setPct);
    setState(ok ? 'done' : 'error');
    if (ok) setTimeout(() => setState('idle'), 4000);
  };

  return (
    <button onClick={go} disabled={state === 'busy'}
      title={state === 'error' ? 'That did not download. Check your connection and try again.' : `Download ${name}`}
      className={`text-[11px] font-semibold flex items-center flex-shrink-0 transition disabled:opacity-60 ${
        state === 'error' ? 'text-red-300' : state === 'done' ? 'text-lime-400' : 'text-sky-300 hover:text-sky-200'
      } ${className}`}>
      {state === 'busy'
        ? <Loader className="w-3 h-3 mr-1 animate-spin" />
        : state === 'done'
          ? <Check className="w-3 h-3 mr-1" />
          : <Download className="w-3 h-3 mr-1" />}
      <span>
        {state === 'busy' ? (pct > 0 ? `${Math.round(pct * 100)}%` : 'Saving...')
          : state === 'done' ? 'Saved'
            : state === 'error' ? 'Try again'
              : label}
      </span>
      {showSize && state === 'idle' && song.beat_size_bytes
        ? <span className="text-white/25 ml-1">{prettySize(song.beat_size_bytes)}</span>
        : null}
    </button>
  );
}