// src/components/retail/retailTheme.js
//
// Feelz Retail's own palette: dark rustic, warm, with purple demoted to an
// accent instead of being the personality of the whole product.
//
// Two reasons this is a JS object of inline-style values rather than CSS:
//
//   1. index.css globally overrides Tailwind's purple classes to the listener
//      theme accent (`.bg-purple-500 { background: var(--app-accent) !important }`).
//      Any retail styling built on Tailwind purple would inherit whatever
//      theme a listener happened to pick. Inline values are immune to that.
//
//   2. It keeps retail's look entirely inside retail. Nothing here can change
//      how the main app renders, which after today is a property worth having.
//
// The palette is warm-black and brass rather than cool-black and violet:
// worn wood, an amp in a corner, a record sleeve that has been handled. Rust
// is the primary accent, brass the secondary, purple appears roughly twice a
// screen and never as a surface.

export const R = {
  // Surfaces — warm blacks, not blue-blacks
  bg:        '#0C0A09',
  bgRaised:  '#141110',
  bgSunken:  '#080706',

  surface:   'rgba(255, 244, 232, 0.035)',
  surface2:  'rgba(255, 244, 232, 0.065)',
  surface3:  'rgba(255, 244, 232, 0.10)',

  border:    'rgba(255, 233, 209, 0.10)',
  borderUp:  'rgba(255, 233, 209, 0.17)',

  // Type — bone rather than pure white, which reads warmer against brown-black
  text:      '#F3EDE5',
  textDim:   'rgba(243, 237, 229, 0.58)',
  textFaint: 'rgba(243, 237, 229, 0.32)',
  textGhost: 'rgba(243, 237, 229, 0.18)',

  // Accents
  rust:      '#B5613A',
  rustBright:'#CE7245',
  rustSoft:  'rgba(181, 97, 58, 0.15)',
  rustEdge:  'rgba(181, 97, 58, 0.38)',

  brass:     '#C9973F',
  brassSoft: 'rgba(201, 151, 63, 0.14)',

  // Kept, and used sparingly — a highlight, never a background
  violet:    '#8B5CF6',

  green:     '#4E9A6B',
  red:       '#B4503F',
};

// The page background: a warm gradient rather than flat black, so the record
// and the artwork have something to sit on.
export const pageBg =
  'radial-gradient(1200px 700px at 15% -10%, rgba(181,97,58,0.10) 0%, transparent 60%), ' +
  'radial-gradient(900px 600px at 95% 10%, rgba(201,151,63,0.06) 0%, transparent 55%), ' +
  'linear-gradient(180deg, #100D0B 0%, #0C0A09 55%, #080706 100%)';

// Card surfaces, used often enough to be worth naming.
export const card = {
  background: 'linear-gradient(160deg, rgba(255,244,232,0.055) 0%, rgba(255,244,232,0.02) 100%)',
  border: `1px solid ${R.border}`,
};

export const cardRaised = {
  background: 'linear-gradient(160deg, rgba(38,28,22,0.95) 0%, rgba(16,13,11,0.97) 100%)',
  border: `1px solid ${R.borderUp}`,
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
};