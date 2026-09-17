// src/components/retail/RetailTonearm.js
//
// The tonearm.
//
// A record on its own is a black circle. The thing that makes a picture of a
// record read as a RECORD PLAYER is the arm lying across it — and the arm is
// also the one part of a deck that has obvious depth: a tube with a lit top
// edge and a dark underside, a pivot you could put a finger on, a counterweight
// hanging off the back, and a shadow falling on the vinyl underneath.
//
// HOW IT IS BUILT
//
// One SVG, drawn in the record's own coordinates: the viewBox is 0–100 on both
// axes and 100 IS the diameter of the record, so the arm scales with it exactly
// and cannot drift the way it would if it were sized in pixels next to
// something sized in percentages. The pivot sits at x=110 — outside the box, to
// the right of the record, where a real one sits beside the platter — which is
// why the <svg> carries overflow:visible.
//
// The depth is four things, none of them a bevel filter:
//
//   1. A gradient ACROSS the tube rather than along it, running bright at the
//      top edge through mid grey to near-black underneath. That is what makes a
//      flat rectangle read as a cylinder.
//   2. A specular hairline sitting just inside the top edge.
//   3. The pivot as three stacked discs of decreasing size, each with its own
//      off-centre radial highlight, so the assembly reads as a stepped machined
//      column rather than a printed circle.
//   4. A blurred, offset copy of the whole arm painted on the record first —
//      the shadow is what puts the arm ABOVE the vinyl instead of on it.
//
// It moves once: when nothing is playing the arm is parked out to the right,
// clear of the record. When the music starts it swings in and sets down. That
// is the whole animation, it takes about a second, and it is the only thing on
// this screen that moves other than the record turning.

import React from 'react';

export default function RetailTonearm({ playing = false, uid = 'a' }) {
  // Unique gradient ids — two players on one page would otherwise share, and
  // the second would inherit the first's fills.
  const g = (n) => `ta-${n}-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ overflow: 'visible', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        {/* The tube, lit from above. Bright edge, fast falloff, dark belly. */}
        <linearGradient id={g('tube')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#F4F7FF" />
          <stop offset="16%"  stopColor="#D2D9E8" />
          <stop offset="38%"  stopColor="#9AA3B6" />
          <stop offset="62%"  stopColor="#5A6274" />
          <stop offset="86%"  stopColor="#2E3440" />
          <stop offset="100%" stopColor="#1B1F27" />
        </linearGradient>

        {/* The machined column. Highlight off to the upper left, so every disc
            in the stack agrees about where the light is. */}
        <radialGradient id={g('pivot')} cx="34%" cy="28%" r="78%">
          <stop offset="0%"   stopColor="#F2F5FD" />
          <stop offset="26%"  stopColor="#C2C9D8" />
          <stop offset="58%"  stopColor="#767E90" />
          <stop offset="82%"  stopColor="#3A4050" />
          <stop offset="100%" stopColor="#1D212B" />
        </radialGradient>

        <radialGradient id={g('cap')} cx="36%" cy="26%" r="72%">
          <stop offset="0%"   stopColor="#FFFFFF" />
          <stop offset="34%"  stopColor="#D8DEEC" />
          <stop offset="72%"  stopColor="#828A9C" />
          <stop offset="100%" stopColor="#2A2F3A" />
        </radialGradient>

        {/* The counterweight — same light, heavier material. */}
        <linearGradient id={g('weight')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#C8CEDC" />
          <stop offset="30%"  stopColor="#8A92A4" />
          <stop offset="70%"  stopColor="#3C424F" />
          <stop offset="100%" stopColor="#1A1E25" />
        </linearGradient>

        {/* The headshell is plastic, not chrome: flatter, warmer, less specular. */}
        <linearGradient id={g('shell')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#4A4256" />
          <stop offset="45%"  stopColor="#2A2634" />
          <stop offset="100%" stopColor="#14121A" />
        </linearGradient>

        <filter id={g('soft')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* Everything pivots about the post at (110, 86). Parked out to the right
          when silent, set down on the record when playing. */}
      <g
        style={{
          transform: playing ? 'rotate(0deg)' : 'rotate(7.5deg)',
          transformOrigin: '103px 79px',
          transformBox: 'view-box',
          transition: 'transform 1.05s cubic-bezier(0.25, 0.9, 0.25, 1)',
        }}
      >
        {/* 1. THE SHADOW, on the vinyl. Drawn first, offset down and left of
               the light, blurred. This is the single element doing most of the
               work of lifting the arm off the record. */}
        <g opacity="0.55" filter={`url(#${g('soft')})`} transform="translate(-1.6, 3.2)">
          <rect x="33" y="74.2" width="71" height="3.8" rx="1.9" fill="#000" />
          <circle cx="103" cy="79" r="9.4" fill="#000" />
          <rect x="27" y="73.6" width="11" height="6.4" rx="1.6" fill="#000"
            transform="rotate(-17, 33, 76.8)" />
        </g>

        {/* 2. THE ARM. A straight tube from the pivot out over the record,
               almost level — the angle is small on purpose: an arm drawn at a
               dramatic diagonal stops looking like it is resting and starts
               looking like it is falling. */}
        <g transform="rotate(-2.3, 103, 79)">
          <rect x="36" y="77.2" width="67" height="3.6" rx="1.8" fill={`url(#${g('tube')})`} />
          {/* the lit edge */}
          <rect x="38" y="77.7" width="62" height="0.8" rx="0.4" fill="#FFFFFF" opacity="0.52" />
          {/* the seam where the tube meets its underside */}
          <rect x="38" y="79.7" width="62" height="0.42" rx="0.21" fill="#000" opacity="0.35" />
          {/* the collar where the arm enters the pivot */}
          <rect x="94.4" y="76.4" width="4.6" height="5.2" rx="1.3" fill={`url(#${g('pivot')})`} />
        </g>

        {/* 3. THE HEADSHELL, angled off the end of the tube the way a real one
               is, with the cartridge under it and the stylus touching down. */}
        <g transform="rotate(-2.3, 103, 79)">
          <g transform="rotate(-17, 36, 79)">
            <rect x="25.6" y="75.4" width="12.6" height="7.2" rx="1.9" fill={`url(#${g('shell')})`} />
            <rect x="26.9" y="76.1" width="9.8" height="1.25" rx="0.62" fill="#FFF" opacity="0.24" />
            <rect x="26.2" y="75.6" width="11.4" height="0.55" rx="0.28" fill="#E6EAF6" opacity="0.45" />
            {/* the two fixing screws */}
            <circle cx="28.9" cy="80.6" r="0.68" fill="#0C0B10" opacity="0.85" />
            <circle cx="34.4" cy="80.6" r="0.68" fill="#0C0B10" opacity="0.85" />
            {/* cartridge body */}
            <rect x="26.4" y="81.9" width="7.6" height="3.2" rx="0.8" fill="#17141D" />
            <rect x="26.4" y="81.9" width="7.6" height="0.8" rx="0.4" fill="#8B5CF6" opacity="0.60" />
            {/* the stylus itself, the one point where the machine touches the
                music. Deliberately the brightest thing in the drawing. */}
            <path d="M 29.3 85.0 L 28.8 86.9" stroke="#D6DCEA" strokeWidth="0.5" strokeLinecap="round" />
            <ellipse cx="28.8" cy="87.1" rx="1.5" ry="0.5" fill="#000" opacity="0.5" />
            <circle cx="28.8" cy="86.95" r="0.42" fill="#FFFFFF" opacity="0.92" />
          </g>
        </g>

        {/* 4. THE PIVOT, last so it sits on top of the arm it carries.
               Drawn as a COLUMN rather than a circle: a wide flat base plate,
               a short cylindrical wall with the same across-the-tube shading as
               the arm, and a cap disc on top. A single radial-gradient circle
               at this size reads as a ball bearing; three flattened ellipses
               with a wall between them read as a machined post seen from
               slightly above, which is what the rest of the drawing implies. */}
        <g>
          {/* the column wall first, then the base plate over its foot — that
              order is what stops the rectangle's corners showing as a square
              block sitting on a disc. */}
          <rect x="96.4" y="77.2" width="13.2" height="4.6" fill={`url(#${g('tube')})`} />
          {/* base plate on the plinth */}
          <ellipse cx="103" cy="82.2" rx="8.8" ry="3.4" fill={`url(#${g('pivot')})`} />
          <ellipse cx="103" cy="82.2" rx="8.8" ry="3.4" fill="none" stroke="#0E1117" strokeWidth="0.35" opacity="0.65" />
          {/* cap */}
          <ellipse cx="103" cy="77.2" rx="6.6" ry="2.8" fill={`url(#${g('cap')})`} />
          <ellipse cx="103" cy="76.9" rx="3.4" ry="1.45" fill={`url(#${g('pivot')})`} />
          <circle cx="103" cy="76.8" r="0.7" fill="#0B0E13" opacity="0.8" />
          {/* the glint on the near shoulder of the column */}
          <ellipse cx="99.4" cy="79.2" rx="1.5" ry="2.1" fill="#FFFFFF" opacity="0.20" />
        </g>


        {/* 6. THE COUNTERWEIGHT, on the back of the arm. A short thick cylinder on a
               stub, which is what balances a real arm and what tells the eye
               this object has mass. */}
        <g transform="rotate(-15, 103, 79)">
          <rect x="99" y="77.8" width="14.5" height="2.6" rx="1.3" fill={`url(#${g('tube')})`} />
          <rect x="108.6" y="73.4" width="11.4" height="11.4" rx="4.1" fill={`url(#${g('weight')})`} />
          <rect x="110.3" y="74.7" width="7.8" height="1.6" rx="0.8" fill="#FFF" opacity="0.32" />
          <rect x="112.7" y="73.4" width="1" height="11.4" fill="#000" opacity="0.30" />
        </g>

      </g>
    </svg>
  );
}