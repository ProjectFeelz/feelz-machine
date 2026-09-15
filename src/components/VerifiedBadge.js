/**
 * VerifiedBadge
 *
 * One definition of the verified tick, used everywhere.
 *
 * It was `<Verified className="w-3 h-3 text-blue-400" />` copied into nine
 * files, which meant nine places to change and nine chances for them to
 * drift — and two of them already had: ThemeEditor drew it in the theme's
 * background colour and ArtistProfilePage in `bgColor`, so on some profiles
 * the tick was invisible against its own badge.
 *
 * Gold, not blue. Blue is Twitter's tick and reads as "we copied Twitter".
 * Gold is the colour Feelz already uses for Premium and for competition
 * wins — which is exactly how verification is earned here (AdminBoost grants
 * it, and CompetitionRoomPage grants it to winners). The badge now says the
 * same thing as the rest of the platform's reward language.
 *
 * The shadow is the reason this is a component rather than a className.
 * A flat tick sitting on artwork or a coloured theme disappears into it. A
 * drop-shadow on the SVG itself — not a box-shadow on a wrapper, which would
 * draw a rectangle behind a star-shaped icon — lifts it off whatever is
 * behind it. `filter: drop-shadow()` follows the glyph's actual outline.
 *
 * Usage:
 *   <VerifiedBadge />                 default, 14px
 *   <VerifiedBadge size="sm" />       10px, for dense rows
 *   <VerifiedBadge size="lg" />       18px, for profile headers
 *   <VerifiedBadge className="ml-1" /> extra layout classes still work
 */

import React from 'react';
import { Verified } from 'lucide-react';

const SIZES = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
  lg: 'w-[18px] h-[18px]',
};

export const VERIFIED_GOLD = '#F5C518';

export default function VerifiedBadge({ size = 'md', className = '', title = 'Verified artist' }) {
  return (
    <Verified
      role="img"
      aria-label={title}
      title={title}
      className={`${SIZES[size] || SIZES.md} flex-shrink-0 ${className}`}
      style={{
        color: VERIFIED_GOLD,
        // Two shadows on purpose: a tight dark one so the tick separates from
        // a light background, and a wider warm one so it still reads as gold
        // rather than as a yellow smudge on a dark background. Both follow
        // the glyph outline.
        filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55)) drop-shadow(0 0 4px rgba(245,197,24,0.35))',
      }}
    />
  );
}