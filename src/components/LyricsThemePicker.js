// src/components/LyricsThemePicker.js
//
// Picking the colour the lyrics light up in, at upload and in edit.
//
// Shown as swatches of the actual effect rather than named colours, because
// "Violet" tells an artist nothing about what a half-sung word looks like on
// a black screen. Each swatch is a real word in three states: sung, mid-sweep
// and not yet sung, which is exactly what the player draws.
//
// Only offered once there are lyrics to colour. A colour picker above an
// empty textarea is a decision about nothing.

import React from 'react';
import { LYRIC_THEMES, DEFAULT_LYRIC_THEME } from '../utils/lyrics';

export default function LyricsThemePicker({ value, onChange, disabled }) {
  const active = value || DEFAULT_LYRIC_THEME;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold text-white/50 mb-0.5">Lyric colour</p>
      <p className="text-[10px] text-white/25 mb-2">
        How the words light up as they are sung. Shown on a black player, so light colours read best.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(LYRIC_THEMES).map(([key, t]) => {
          const on = key === active;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              aria-pressed={on}
              className={`rounded-xl px-2.5 py-2 text-left transition border ${
                on ? 'border-white/40 bg-white/[0.07]' : 'border-white/[0.07] bg-black/40 hover:bg-white/[0.04]'
              } disabled:opacity-40`}
            >
              {/* The effect itself: one word sung, one mid-sweep, one to come. */}
              <p className="text-[13px] font-bold leading-tight" style={{ textShadow: `0 0 12px ${t.glow}` }}>
                <span style={{ color: t.sung }}>Me </span>
                <span
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${t.singing} 55%, ${t.unsung} 55%)`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    display: 'inline-block',
                    whiteSpace: 'pre',
                  }}
                >against </span>
                <span style={{ color: t.unsung }}>the storm</span>
              </p>
              <p className={`text-[10px] mt-1 ${on ? 'text-white/70' : 'text-white/30'}`}>{t.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}