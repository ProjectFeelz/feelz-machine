// src/components/retail/RetailGlass.js
//
// The dust cover.
//
// Everything in Feelz Retail is meant to read as a machine in a room rather
// than a website on a screen, and the one thing every record player has that
// we did not was the smoked perspex lid you look through. This is that lid:
// a fixed sheet over the whole player page, with the light of the room
// crossing it on the diagonal, a lit chrome edge along the top where the lip
// catches it, and the faintest darkening towards the corners so it reads as a
// panel with thickness rather than a tint.
//
// THREE RULES, all of which matter more than the look:
//
//   pointer-events: none — nothing here can ever swallow a tap. A venue
//   tablet that stops responding because of a decorative layer is a dead
//   product, and this is the one bug this component could plausibly cause.
//
//   aria-hidden — it is glass. There is nothing to read out.
//
//   z-index 100 — above the page and its sticky header (z-10) and the advert
//   bar (z-30), below the account, admin and inbox sheets (z-200). A modal is
//   a thing you have opened and are working in; putting glass over it would
//   just make it look dirty.
//
// The values are deliberately low. On an OLED tablet running all day, a sheen
// heavy enough to admire is a sheen that will annoy someone by Thursday.

import React from 'react';

export default function RetailGlass() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[100]"
    >
      {/* 1. The pane itself: a cool wash, darker at the edges, with a lit top
             lip and a hairline of light along the bottom of the frame. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 95% at 50% 42%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.34) 100%), ' +
            'linear-gradient(168deg, rgba(196,204,232,0.030) 0%, rgba(255,255,255,0.008) 34%, rgba(0,0,0,0.045) 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(214,222,245,0.22), ' +
            'inset 0 -1px 0 rgba(255,255,255,0.045), ' +
            'inset 0 0 160px rgba(0,0,0,0.30)',
        }}
      />

      {/* 2. The room crossing the pane. Screen blend so it can only add light
             — over artwork it lifts, it never greys anything out. Two bands:
             a wide soft one high up, a narrow hard one lower down, which is
             what a flat sheet under a ceiling light actually does. */}
      <div
        className="absolute inset-0"
        style={{
          mixBlendMode: 'screen',
          opacity: 0.85,
          background:
            'linear-gradient(112deg, ' +
              'rgba(255,255,255,0) 0%, rgba(255,255,255,0) 15%, ' +
              'rgba(226,232,255,0.055) 22%, rgba(226,232,255,0.125) 29%, ' +
              'rgba(226,232,255,0.095) 32%, rgba(226,232,255,0.030) 38%, ' +
              'rgba(255,255,255,0) 46%, rgba(255,255,255,0) 60%, ' +
              'rgba(226,232,255,0.060) 67%, rgba(226,232,255,0.020) 72%, ' +
              'rgba(255,255,255,0) 78%)',
        }}
      />

      {/* 3. The corner bloom — where the lid meets the hinge, and the violet
             the rest of retail is lit by, picked up in the glass. */}
      <div
        className="absolute inset-0"
        style={{
          mixBlendMode: 'screen',
          background:
            'radial-gradient(760px 420px at 2% -10%, rgba(233,238,255,0.090) 0%, rgba(233,238,255,0) 62%), ' +
            'radial-gradient(560px 340px at 99% 0%, rgba(139,92,246,0.085) 0%, rgba(139,92,246,0) 58%)',
        }}
      />

      {/* 4. The lip. A chrome hairline across the very top, brighter in the
             middle where the light hits it square, so the top of the screen
             reads as an edge you could get a fingernail under. */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '2px',
          background:
            'linear-gradient(90deg, rgba(198,202,212,0.10) 0%, rgba(232,236,248,0.55) 38%, ' +
            'rgba(232,236,248,0.62) 52%, rgba(198,202,212,0.12) 100%)',
        }}
      />
    </div>
  );
}