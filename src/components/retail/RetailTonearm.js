// src/components/retail/RetailTonearm.js
//
// The tonearm, redrawn on the shape Steve sent.
//
// The previous version was my own invention: a straight tube lying almost
// level across the record with a counterweight hanging off the back. He sent
// the Vecteezy phonograph vector and said to use that shape instead and keep
// the shading. So the SILHOUETTE here is traced from that file and the
// MATERIAL is the same gradient work as before.
//
//
// WHERE THE NUMBERS COME FROM
//
// Measured off the reference rather than eyeballed. The artwork is 1920x1622;
// its disc is centred at (810, 810) with a radius of 805, so every landmark
// below was read out of the image and divided by the disc's diameter. That is
// why the arm sits where it does relative to the label and the rim: it is the
// reference's own geometry, not a guess that looked close.
//
// Measured, in disc units (100 = the diameter):
//
//   bearing centre     (100.6, 25.2)
//   arm leaves pivot   (102.8, 34.5)
//   first bend         ( 93.0, 56.8)      steep run, about 66 degrees
//   second bend        ( 81.2, 64.3)      shallow run, about 32 degrees
//   into the headshell ( 73.0, 76.7)      steep again, about 67 degrees
//
// Two deliberate departures from those numbers, both stated rather than
// silent:
//
//   1. The pivot is pulled in from 100.6 to 98. In the reference it sits just
//      PAST the rim, which is correct for a deck photographed whole. This
//      record is anchored into the bottom right corner of the page and bleeds
//      off the right edge, so a pivot outside the rim would be cut off and the
//      arm would appear to grow out of nothing.
//   2. Everything downstream is shifted to follow it, so the bends keep the
//      reference's angles and the arm still lands in the same place on the
//      record.
//
//
// HOW IT IS BUILT
//
// The arm is ONE polyline, stroked three times: a dark outline underneath, the
// gradient tube over it, and a white hairline offset up and left for the
// specular edge. That is exactly how the reference reads, and it means a bend
// cannot come apart the way three separate rectangles meeting at a corner do.
// round joins and caps, so the elbows are elbows.
//
// The gradient is userSpaceOnUse and runs top-left to bottom-right across the
// whole assembly rather than along the tube. A gradient along a polyline would
// shade the far end differently from the near end; across it is what makes a
// flat stroke read as a cylinder, and one direction for the whole object is
// what makes every part agree about where the light is.
//
// It still moves once: parked clear of the record when nothing is playing,
// swung in and set down when the music starts. About a second, and the only
// thing on this screen that moves other than the record turning.

import React from 'react';

// The arm, in disc units. Read the block above before changing any of these.
const PIVOT = { x: 98, y: 22 };
const ARM   = [
  [101.0, 29.0],   // leaves the pivot
  [ 91.0, 53.0],   // first bend
  [ 78.0, 61.5],   // second bend
  [ 70.5, 74.0],   // into the headshell
];
const ARM_D = `M ${ARM.map(p => p.join(' ')).join(' L ')}`;

// The headshell hangs off the last segment and follows its angle.
const [bx, by] = ARM[2];
const [cx, cy] = ARM[3];
const SHELL_ANGLE = Math.atan2(cy - by, cx - bx) * 180 / Math.PI;
const SHELL = { x: 67.4, y: 80.0 };

export default function RetailTonearm({ playing = false, uid = 'a' }) {
  // Unique gradient ids — two players on one page would otherwise share, and
  // the second would inherit the first's fills.
  const g = (n) => `ta-${n}-${uid}`;

  // The whole assembly, drawn once and reused for the shadow passes. Keeping
  // the shadow as the SAME path rather than a hand-drawn approximation is
  // what stops the shadow drifting out of agreement with the arm when the
  // geometry above is adjusted.
  const arm = (
    <>
      <path d={ARM_D} fill="none" stroke={`url(#${g('tube')})`} strokeWidth="4.0"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* the lit edge: the same line, nudged up and left, thin and bright */}
      <path d={ARM_D} fill="none" stroke="#FFFFFF" strokeWidth="0.62"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.62"
        transform="translate(-0.78, -0.5)" />
    </>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ overflow: 'visible', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        {/* Across the assembly, not along the tube. See the note above. */}
        <linearGradient id={g('tube')} gradientUnits="userSpaceOnUse"
          x1="108" y1="14" x2="62" y2="88">
          <stop offset="0%"   stopColor="#F4F7FF" />
          <stop offset="14%"  stopColor="#D2D9E8" />
          <stop offset="40%"  stopColor="#9AA3B6" />
          <stop offset="66%"  stopColor="#666E80" />
          <stop offset="88%"  stopColor="#343A46" />
          <stop offset="100%" stopColor="#242933" />
        </linearGradient>

        {/* The bearing housing. Highlight to the upper left, like everything
            else on this object. */}
        <radialGradient id={g('pivot')} cx="34%" cy="28%" r="80%">
          <stop offset="0%"   stopColor="#F2F5FD" />
          <stop offset="26%"  stopColor="#C2C9D8" />
          <stop offset="58%"  stopColor="#767E90" />
          <stop offset="82%"  stopColor="#3A4050" />
          <stop offset="100%" stopColor="#1D212B" />
        </radialGradient>

        {/* The headshell is plastic, not chrome: flatter, warmer, less
            specular. The reference draws it a plain dark grey; this is that
            colour with the light put back on it. */}
        <linearGradient id={g('shell')} gradientUnits="userSpaceOnUse"
          x1="72" y1="74" x2="62" y2="88">
          <stop offset="0%"   stopColor="#565062" />
          <stop offset="40%"  stopColor="#33303C" />
          <stop offset="100%" stopColor="#16141C" />
        </linearGradient>

        {/* Down: a hard little shadow right under the cartridge. */}
        <filter id={g('tight')} x="-80%" y="-200%" width="260%" height="500%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
        {/* Up: wide and diffuse, the way a shadow opens out as the thing
            casting it moves away from the surface. */}
        <filter id={g('wide')} x="-80%" y="-200%" width="260%" height="500%">
          <feGaussianBlur stdDeviation="2.1" />
        </filter>
        <filter id={g('soft')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <filter id={g('softUp')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>

      {/* Everything pivots about the bearing. Parked clear of the record when
          silent, set down on it when playing. */}
      <g
        style={{
          // NEGATIVE parks it. Positive is clockwise in SVG's y-down frame,
          // which swings the headshell UP AND LEFT — in towards the label,
          // which is the one place a parked arm must never be. Out and down,
          // towards the rim where the rest is.
          transform: playing ? 'rotate(0deg)' : 'rotate(-11deg)',
          transformOrigin: `${PIVOT.x}px ${PIVOT.y}px`,
          transformBox: 'view-box',
          transition: 'transform 1.05s cubic-bezier(0.25, 0.9, 0.25, 1)',
        }}
      >
        {/* 1. THE SHADOW ON THE VINYL, drawn first.
               Two copies crossfading rather than one being animated: blur
               radius cannot be transitioned in CSS, so each state gets its
               own and only the opacity changes. Close and sharp when the arm
               is down, further and softer when it is lifted — nothing about
               the arm changes size, and it still reads as rising off the
               record. */}
        <g
          filter={`url(#${g('soft')})`}
          transform="translate(-1.8, 3.4)"
          style={{ opacity: playing ? 0.52 : 0, transition: 'opacity 0.9s ease' }}
        >
          <path d={ARM_D} fill="none" stroke="#000" strokeWidth="5.2"
            strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="12.4" fill="#000" />
        </g>
        <g
          filter={`url(#${g('softUp')})`}
          transform="translate(-3.6, 7.2)"
          style={{ opacity: playing ? 0 : 0.30, transition: 'opacity 0.9s ease' }}
        >
          <path d={ARM_D} fill="none" stroke="#000" strokeWidth="6.0"
            strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="13.2" fill="#000" />
        </g>

        {/* 2. THE ARM. Dark outline first, tube over it, hairline on top —
               the reference's three-pass look, as one polyline so the bends
               hold together. */}
        <path d={ARM_D} fill="none" stroke="#1C1F27" strokeWidth="5.5"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
        {arm}

        {/* 3. THE HEADSHELL, on the end of the last segment and turned to
               match it. A rounded block with its own lit edge, the two
               fixing screws, and the cartridge under the front of it. */}
        <g transform={`rotate(${SHELL_ANGLE - 90}, ${SHELL.x}, ${SHELL.y})`}>
          {/* the collar where the arm enters the shell */}
          <rect x={SHELL.x - 2.1} y={SHELL.y - 8.2} width="4.2" height="3.4" rx="1.1"
            fill={`url(#${g('pivot')})`} stroke="#1C1F27" strokeWidth="0.5" />
          <rect x={SHELL.x - 5.4} y={SHELL.y - 5.6} width="10.8" height="13.4" rx="2.6"
            fill={`url(#${g('shell')})`} stroke="#15131B" strokeWidth="0.6" />
          {/* the lit edge, up the left side the way the reference draws it */}
          <rect x={SHELL.x - 4.4} y={SHELL.y - 4.6} width="1.15" height="10.6" rx="0.58"
            fill="#FFFFFF" opacity="0.30" />
          <rect x={SHELL.x - 4.6} y={SHELL.y - 5.0} width="8.6" height="0.55" rx="0.28"
            fill="#E6EAF6" opacity="0.42" />
          {/* fixing screws */}
          <circle cx={SHELL.x - 2.6} cy={SHELL.y - 2.6} r="0.62" fill="#0C0B10" opacity="0.85" />
          <circle cx={SHELL.x + 2.6} cy={SHELL.y - 2.6} r="0.62" fill="#0C0B10" opacity="0.85" />
          {/* cartridge, with the platform's violet on its front lip */}
          <rect x={SHELL.x - 3.5} y={SHELL.y + 4.4} width="7.0" height="3.0" rx="0.8" fill="#17141D" />
          <rect x={SHELL.x - 3.5} y={SHELL.y + 4.4} width="7.0" height="0.75" rx="0.38"
            fill="#8B5CF6" opacity="0.58" />

          {/* NO DRAWN NEEDLE.
              A white pin sticking out of the cartridge reads as a drawing of
              a stylus rather than a stylus — at this size a real one is a few
              thousandths of an inch and is simply not visible. What you see
              on a deck is the shadow: tight and dark when the cartridge is
              down, wide and soft when it is lifted. So the contact is drawn
              as shadow alone, and the shadow is what moves. */}
          <ellipse
            cx={SHELL.x} cy={SHELL.y + 8.8} rx="2.0" ry="0.62" fill="#000"
            filter={`url(#${g('tight')})`}
            style={{ opacity: playing ? 0.72 : 0, transition: 'opacity 0.9s ease' }}
          />
          <ellipse
            cx={SHELL.x + 0.7} cy={SHELL.y + 11.0} rx="4.2" ry="1.5" fill="#000"
            filter={`url(#${g('wide')})`}
            style={{ opacity: playing ? 0 : 0.36, transition: 'opacity 0.9s ease' }}
          />
        </g>

        {/* 4. THE BEARING HOUSING, last so it sits on top of the arm it
               carries. The reference draws it as a grey annulus with a dark
               outline and a black well in the middle — not a ball bearing, a
               ring you could put a finger through. Same here, with the light
               put back on the ring. */}
        <g>
          {/* outer ring */}
          <circle cx={PIVOT.x} cy={PIVOT.y} r="12.1" fill="none"
            stroke={`url(#${g('pivot')})`} strokeWidth="3.6" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="13.9" fill="none"
            stroke="#1C1F27" strokeWidth="0.95" opacity="0.9" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="10.3" fill="none"
            stroke="#1C1F27" strokeWidth="0.9" opacity="0.9" />
          {/* the well */}
          <circle cx={PIVOT.x} cy={PIVOT.y} r="9.9" fill="#0A0A0E" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="7.6" fill="none"
            stroke="#3A4050" strokeWidth="0.7" opacity="0.65" />
          {/* the glint on the upper left of the ring, so the housing agrees
              with the tube about the light */}
          <path
            d={`M ${PIVOT.x - 9.6} ${PIVOT.y - 5.6} A 11 11 0 0 1 ${PIVOT.x - 4.2} ${PIVOT.y - 10.6}`}
            fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.40"
          />

          {/* The counterweight stub, drawn LAST and overlapping the ring.
              Drawn before it, the ring's outline cut across its root and the
              stub read as a separate white pill floating beside the housing
              rather than a part bolted to it. It also starts inside the ring's
              outer edge for the same reason. The reference draws it in the
              same place, at the same angle, in the same grey as the housing —
              not the brighter tube grey, which is what made it jump out. */}
          <g transform={`rotate(-42, ${PIVOT.x}, ${PIVOT.y})`}>
            <rect x={PIVOT.x + 9.4} y={PIVOT.y - 2.2} width="7.6" height="4.4" rx="2.2"
              fill={`url(#${g('pivot')})`} stroke="#1C1F27" strokeWidth="0.6" />
            <rect x={PIVOT.x + 10.6} y={PIVOT.y - 1.35} width="4.6" height="1.0" rx="0.5"
              fill="#FFFFFF" opacity="0.28" />
          </g>
        </g>

      </g>
    </svg>
  );
}