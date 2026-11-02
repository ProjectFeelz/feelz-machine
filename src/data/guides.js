// src/data/guides.js
//
// Answer pages, at /guides/:slug.
//
//
// WHY THESE EXIST
//
// projectfeelz.com takes roughly 8,600 clicks a fortnight from 1,000 distinct
// queries, and its top ones are "fresh air plugin", "keyzone classic", "vital
// vst", "saturation knob". Every one is a product name somebody already knew
// before they typed it. That site does not create demand, it answers demand
// that already exists in volume, because a page exists for the exact thing
// being searched.
//
// Feelz Machine has no equivalent yet. Nobody is searching for the artists on
// it, so the artist pages are a long tail that fills in once the domain has
// any standing at all. 48 clicks in ninety days, against projectfeelz's 8,600
// in eighteen days.
//
// What this platform CAN answer today, honestly and better than most, is the
// set of questions a South African artist actually types into Google: what
// distribution costs, how to get paid in rand, whether it is worth it. There
// is real volume behind those, almost no competition on the local versions of
// them, and Feelz Machine is a genuine answer rather than one of fifty.
//
//
// THE RULE THESE PAGES FOLLOW
//
// Every figure here is either a published figure from the platform it belongs
// to, or a figure from this platform's own mechanics, which is to say
// something the code in this repository actually does. Nothing is estimated,
// extrapolated or rounded up to sound better.
//
// Where a number would be useful and is not reliably knowable, these pages say
// what varies and why, instead of printing one. A guide that is wrong about
// what something costs is worse than no guide: it is read once, acted on, and
// then held against you.
//
// Each guide also ends with the thing it is honest about. The comparison pages
// in src/data/platformComparisons.js do the same, for the same reason: a page
// that only argues one way reads as an advert and is treated like one.

// ── Why the content is in guides.json next door ─────────────────────────────
//
// Both the React app and netlify/functions/seo-links.js need this content. The
// function injects it into the document before React mounts, which is the
// entire reason these pages will be crawlable, and a Netlify function cannot
// import an ES module out of src/.
//
// src/data/platformComparisons.js hit the same wall and solved it by repeating
// four titles into netlify/lib/comparisons.js. That is tolerable for four
// strings that never change and intolerable for several pages of prose, so
// this one keeps the data in JSON that both sides read, and the reasoning in
// the comment above, where a reader will actually find it.

import guides from './guides.json';

export default guides;
