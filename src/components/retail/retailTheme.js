// src/components/retail/retailTheme.js
//
// Feelz Retail's palette: black, with DARK versions of violet, blue and red.
//
// The previous attempt read "rustic" as warm brown. Wrong call — brown is a
// colour you notice, and a venue screen should be a black rectangle with a few
// lit edges. Everything here is either near-black or a deep, desaturated
// version of a colour: violet at the darkness of a bruise rather than a
// highlighter, blue like ink, red like a dark cherry. Nothing is bright except
// type and artwork.
//
// Still inline-style values rather than CSS, for two reasons that have not
// changed: index.css globally rewrites Tailwind's purple classes to whatever
// theme a listener picked, and keeping retail's look inside retail means it
// cannot leak into the main app.

export const R = {
  // Surfaces — cool near-blacks
  bg:        '#08080C',
  bgRaised:  '#0E0E15',
  bgPanel:   '#050508',   // the left panel, deliberately darker than the page
  bgSunken:  '#040406',

  surface:   'rgba(255, 255, 255, 0.042)',
  surface2:  'rgba(255, 255, 255, 0.07)',
  surface3:  'rgba(255, 255, 255, 0.11)',

  border:    'rgba(255, 255, 255, 0.085)',
  borderUp:  'rgba(255, 255, 255, 0.15)',

  text:      '#ECECF2',
  textDim:   'rgba(236, 236, 242, 0.58)',
  textFaint: 'rgba(236, 236, 242, 0.34)',
  textGhost: 'rgba(236, 236, 242, 0.17)',

  // Accents — dark, never neon
  violet:     '#5B21B6',
  violetLift: '#6D28D9',
  violetSoft: 'rgba(109, 40, 217, 0.18)',
  violetEdge: 'rgba(124, 58, 237, 0.42)',

  blue:       '#1E3A8A',
  blueLift:   '#2A4CA8',
  blueSoft:   'rgba(30, 58, 138, 0.22)',

  red:        '#7F1D1D',
  redLift:    '#A32B2B',
  redSoft:    'rgba(127, 29, 29, 0.24)',

  green:      '#14532D',
  greenLift:  '#2F7D4F',
};

// A black page with two low, cold lights on it.
export const pageBg =
  'radial-gradient(1100px 620px at 12% -12%, rgba(109,40,217,0.16) 0%, transparent 62%), ' +
  'radial-gradient(900px 560px at 92% 4%, rgba(30,58,138,0.14) 0%, transparent 58%), ' +
  'linear-gradient(180deg, #0A0A11 0%, #08080C 50%, #050508 100%)';

export const card = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)',
  border: `1px solid ${R.border}`,
};