import React from 'react';

/**
 * VinylRecord
 *
 * Spinning vinyl with track artwork embedded as the centre label.
 * Grooves shimmer subtly. Spins when isPlaying, pauses cleanly.
 *
 * Props:
 *   coverUrl    - track cover artwork URL
 *   isPlaying   - controls spin
 *   size        - diameter px (default 300)
 */
export default function VinylRecord({ coverUrl, isPlaying, size = 300 }) {
  const r         = size / 2;
  const labelR    = r * 0.30;   // centre label radius
  const innerRing = labelR + 6; // accent ring just outside label
  const spindleR  = r * 0.025; // tiny centre hole
  const grooveCount = 22;

  // IDs must be unique per instance
  const uid = React.useId().replace(/:/g, '');
  const clipId  = `vc-${uid}`;
  const bodyGid = `vb-${uid}`;
  const shineId = `vs-${uid}`;
  const labelGid = `vl-${uid}`;

  const grooves = Array.from({ length: grooveCount }, (_, i) => {
    // spread grooves between inner ring and outer edge
    const min = innerRing + 4;
    const max = r - 6;
    return min + ((max - min) / grooveCount) * i;
  });

  return (
    <div
      style={{
        width: size,
        height: size,
        filter: 'drop-shadow(0 32px 64px rgba(0,0,0,0.8)) drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          animation: 'vinyl-spin 2.4s linear infinite',
          animationPlayState: isPlaying ? 'running' : 'paused',
          willChange: 'transform',
          display: 'block',
        }}
      >
        <defs>
          {/* Clip for label artwork */}
          <clipPath id={clipId}>
            <circle cx={r} cy={r} r={labelR} />
          </clipPath>

          {/* Record body gradient — deep black with a hint of warmth */}
          <radialGradient id={bodyGid} cx="38%" cy="32%" r="75%">
            <stop offset="0%"   stopColor="#1c1c1c" />
            <stop offset="35%"  stopColor="#0e0e0e" />
            <stop offset="100%" stopColor="#060606" />
          </radialGradient>

          {/* Shine overlay */}
          <radialGradient id={shineId} cx="28%" cy="22%" r="55%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.09)" />
            <stop offset="50%"  stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Label edge vignette */}
          <radialGradient id={labelGid} cx="50%" cy="50%" r="50%">
            <stop offset="60%"  stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
          </radialGradient>
        </defs>

        {/* ── Record body ── */}
        <circle cx={r} cy={r} r={r - 1} fill={`url(#${bodyGid})`} />

        {/* ── Grooves ── */}
        {grooves.map((gr, i) => (
          <circle
            key={i}
            cx={r} cy={r} r={gr}
            fill="none"
            stroke={
              i % 4 === 0
                ? 'rgba(255,255,255,0.055)'
                : i % 2 === 0
                  ? 'rgba(255,255,255,0.025)'
                  : 'rgba(255,255,255,0.015)'
            }
            strokeWidth={i % 4 === 0 ? 0.7 : 0.35}
          />
        ))}

        {/* ── Outer edge ── */}
        <circle cx={r} cy={r} r={r - 2}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1.5} />

        {/* ── Accent ring around label ── */}
        <circle cx={r} cy={r} r={innerRing}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
        <circle cx={r} cy={r} r={innerRing - 2}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />

        {/* ── Label: artwork or fallback ── */}
        {coverUrl ? (
          <image
            href={coverUrl}
            x={r - labelR}
            y={r - labelR}
            width={labelR * 2}
            height={labelR * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <circle cx={r} cy={r} r={labelR} fill="rgba(139,92,246,0.3)" />
        )}

        {/* ── Label vignette overlay ── */}
        <circle cx={r} cy={r} r={labelR} fill={`url(#${labelGid})`} />

        {/* ── Label border ── */}
        <circle cx={r} cy={r} r={labelR}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={0.8}
        />

        {/* ── Record shine ── */}
        <circle cx={r} cy={r} r={r - 1} fill={`url(#${shineId})`} />

        {/* ── Spindle hole ── */}
        <circle cx={r} cy={r} r={spindleR}
          fill="#000"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={0.6}
        />
      </svg>

      <style>{`
        @keyframes vinyl-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
