/**
 * PreorderTag.js
 *
 * "Out 12 Oct" on a track that is listed but not yet playable.
 *
 * There is no shared track card in this app — TrackCard.js exists but is
 * imported nowhere, and every feed inlines its own markup. So the badge is the
 * shared piece instead of the card, which keeps the wording and the date
 * format identical across For You, Browse, Home and the artist profile rather
 * than four near-copies that drift.
 *
 * Renders nothing for a released or non-pre-order track, and nothing for a
 * viewer entitled to play it early, so it can be dropped into a card
 * unconditionally without a surrounding check.
 *
 * Props:
 *   track    - the track row
 *   variant  - 'overlay' sits on artwork, 'inline' sits in a text block
 *   style    - extra styles, for themed pages that pass their own colours
 */

import React from 'react';
import { Clock } from 'lucide-react';
import { isUnreleasedPreorder, formatReleaseDate, getViewerEntitlement } from '../utils/trackAccess';

export default function PreorderTag({ track, variant = 'overlay', style = {} }) {
  if (!isUnreleasedPreorder(track)) return null;

  // Fan Pro can play it, so telling them it is unavailable would be wrong.
  // They still see the date, just without the "not yet" framing.
  const { isListenerPro } = getViewerEntitlement();
  const when = formatReleaseDate(track);
  if (!when) return null;

  const base = 'inline-flex items-center gap-1 font-bold rounded-full whitespace-nowrap';

  if (variant === 'inline') {
    return (
      <span
        className={`${base} text-[10px] px-1.5 py-0.5`}
        style={{
          background: 'rgba(251,191,36,0.14)',
          color: '#fbbf24',
          border: '1px solid rgba(251,191,36,0.28)',
          ...style,
        }}
      >
        <Clock style={{ width: 9, height: 9 }} />
        <span>{isListenerPro ? `Early · out ${when}` : `Out ${when}`}</span>
      </span>
    );
  }

  return (
    <span
      className={`${base} absolute bottom-1.5 left-1.5 z-10 text-[10px] px-2 py-0.5 backdrop-blur-sm`}
      style={{
        background: 'rgba(0,0,0,0.72)',
        color: '#fbbf24',
        border: '1px solid rgba(251,191,36,0.35)',
        ...style,
      }}
    >
      <Clock style={{ width: 9, height: 9 }} />
      <span>{isListenerPro ? 'Early' : `Out ${when}`}</span>
    </span>
  );
}