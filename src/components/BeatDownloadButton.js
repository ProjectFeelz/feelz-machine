// src/components/BeatDownloadButton.js
//
// Downloads a School Sessions beat without leaving the app. The file is
// fetched and saved from this page (see src/utils/downloadInApp.js), so no tab
// is opened and nothing navigates away mid-entry.

import React, { useState } from 'react';
import { Download, Loader, Check } from 'lucide-react';
import { downloadInApp } from '../utils/downloadInApp';

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
    const ok = await downloadInApp(song.beat_url, name, setPct);
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