"use strict";

const canvas = document.getElementById("gameCanvas");

const ctx = canvas.getContext("2d");

const W = canvas.width;

const H = canvas.height;

const PX = 68;                      // pixels per metre

const K = PX / 68;

const m = v => v * PX;

const GRAVITY = 1900;

const RUN_SPEED = 360;          // about 5.3 m/s: urgent, not floaty

const CROUCH_SPEED = 160;

const CLIMB_SPEED = 170;

const JUMP_SPEED = 690;

const JUMP_CUT_SPEED = 260;

const DOUBLE_JUMP_SPEED = 620;

const MAX_FALL_SPEED = 1150;

const STOMP_BOUNCE = 520;

const AUTO_VAULT_MAX = 1.05;   // metres: the tallest thing he hops on his own while running

const COYOTE_TIME = 0.09;

const JUMP_BUFFER = 0.12;

const INVULNERABLE = 1.4;

// Koda's body: standing, crouched and sliding heights, and width.
const STAND_H = Math.round(m(1.55)), CROUCH_H = Math.round(m(1.3)), SLIDE_H = Math.round(m(0.6)), BODY_W = Math.round(m(0.62));

const MUSIC_VOLUME = 0.7;

/* ---------------------------------------------------------------------------
   GAME STATE
--------------------------------------------------------------------------- */

let gameState = "ready";     // ready, playing, paused, finished

let twoPlayer = false;

let players = [];

let lastTime = 0;

let runTime = 0;

let realTime = 0;            // seconds since the run started

let songClock = 0;           // where the song is, in seconds (the audio, or this clock when the audio can't play)

let rewindsUsed = 0;

let misses = 0;              // checkpoints missed (the song got there first)

let spareSeconds = 0;        // time to spare, added up over every checkpoint reached in time

let taunt = null;            // { text, part, t } while the game is taunting you

let banner = { text: "", sub: "", time: 0 };

let toast = { title: "", text: "", kind: "", time: 0 };

let cameraX = 0, cameraY = -410;

let finishedAt = 0;

let raceEndsAt = null;

let shake = 0;

let rewindFx = 0;

let flash = 0;

const look = { x: 0, y: 0 };   // right-stick camera nudge, -1..1 each way

let lightningBolt = null;

let particles = [];

let runToken = null;

let lastResult = null;

let hitStop = 0;          // a few frames of near-freeze when a big hit lands

let worldPace = 1;        // how fast the world breathes: clouds, wind, drift (eased, never jumps)

let cloudDrift = 0;       // integrated cloud travel, so a change of pace never snaps the clouds back

let reading = null;       // a journal page being read: the world holds still until it's put away

let trail = [];           // where the leader stood, by song time, for the 15 second rewind

let mirrorInput = true;   // right-to-left missions: the controls follow the screen

// Online co-op (coop.js): this phone runs one Koda, the partner is drawn from the network.
function coopOn() { return typeof Coop !== "undefined" && Coop.on; }

// A canvas painted once and then only drawn from (soft clouds, fog, tinted
// sheets): turned into a plain picture as soon as it's made. On some PCs
// Chrome re-paints such a canvas, every step of it, each time it is drawn,
// which took the game down to a few frames a second; a picture costs nothing.
// Until the picture is ready the canvas itself is drawn.
const frozenArt = new WeakMap();
function freeze(c) {
  if (!c || !c.toBlob || frozenArt.has(c)) return c;
  frozenArt.set(c, null);
  try {
    c.toBlob(b => {
      if (!b) return;
      const im = new Image();
      im.onload = () => frozenArt.set(c, im);
      im.src = URL.createObjectURL(b);
    }, "image/png");
  } catch (e) { /* a canvas that can't be read: keep drawing it as it is */ }
  return c;
}
// SHRINK A PIECE ONCE, THEN DRAW IT AT ITS OWN SIZE.   ?prescale=0 turns it off
//
// The painted artwork lives on big sheets: meshy-kit is 4096x3120, which is
// 12.8 megapixels, and props-2d is 3.1. The game canvas is 960x540, which is
// half a megapixel. So a building is a small piece of an enormous sheet, drawn
// shrunk, sixty times a second.
//
// A desktop GPU swallows that. A phone's does not. There are no mip levels on
// a 2D canvas, so every pixel drawn pulls from texels scattered across a 51MB
// texture, the texture cache misses on nearly all of them, and the GPU falls
// behind while the processor sits idle. That is exactly what the Samsung
// measured: every part of the game under a millisecond of its own work, and
// 110ms owed to the GPU.
//
// So the first time a piece is drawn at a given size it is shrunk once into a
// small tile of its own, and after that the tile is drawn at its natural size
// with nothing to shrink. The picture is the same. If anything it is slightly
// better, because one careful downscale beats sampling the same shrink afresh
// on every frame.
//
// This is NOT a quality setting. Nothing is drawn smaller, softer or at lower
// resolution: the same pixels end up in the same places.
//
// Bounded on both sides. Only sheets over two megapixels, only draws that
// shrink by half or more, only pieces big enough to be worth keeping and small
// enough to be cheap, and the oldest tiles are dropped once there are
// TILE_MAX.
// On, because every tile now proves itself identical on the device before it
// is used, and a piece that cannot prove it is drawn the old way for ever.
// The worst this can do is nothing. ?prescale=0 switches it off entirely.
const PRESCALE = (() => { try { return new URLSearchParams(location.search).get("prescale") !== "0"; } catch (e) { return true; } })();
// Lowered from 2e6 after the first Samsung reading came back "tiles 0 / 0MP".
// Nothing in the lower city is over two megapixels: lower-city-kit is 1.0,
// city-kit 1.26, lc-far 0.80. The sheet I built the threshold around,
// meshy-kit at 12.8, is not used in that mission at all.
const BIG_SHEET = 2.4e5;        // source pixels before a sheet counts as big
// Two, not the 1.75 a first sweep suggested. Measured on a real device, the
// browser picks different resampling paths at different ratios and 1.75 came
// back identical in one sweep and off by 37 in another. Two was the only
// figure that held every time. The check below is what actually guarantees it;
// this is just a cheap first filter.
const SHRINK_MIN = 2.0;
const TILE_MIN = 24 * 24;       // below this a tile costs more than it saves
const TILE_MAX_AREA = 360 * 360;
const TILE_BUDGET = 6e6;        // about 24MB of tiles, oldest dropped first
const tiles = new Map();
let tilePixels = 0;
// The real drawImage, captured below. Tiles are built with THIS, never with
// the wrapper: the wrapper would see a big sheet being shrunk, decide it
// wanted a tile, and call back into here for ever.
let rawDrawImage = null;

// ?diag only: how many times a frame asks to draw a picture, and how many
// different pictures it asks for. Thirty milliseconds spread over five calls
// means something costs a fortune per call, most likely the picture being
// decoded again. Thirty over five hundred means it is simply a lot of work.
// Without that split there is no way to tell them apart from the outside.
let COUNTING = false;
const drawCount = { n: 0, srcs: new Set() };
window.setDrawCounting = v => { COUNTING = !!v; };
window.readDrawCount = () => { const r = { n: drawCount.n, u: drawCount.srcs.size }; drawCount.n = 0; drawCount.srcs.clear(); return r; };

function tileFor(img, sx, sy, sw, sh, dw, dh) {
  const w = Math.round(dw), h = Math.round(dh);
  const key = (img.src || img.id || "") + "|" + Math.round(sx) + "," + Math.round(sy) + ","
            + Math.round(sw) + "," + Math.round(sh) + "|" + w + "x" + h;
  if (noTile.has(key)) return null;
  const hit = tiles.get(key);
  if (hit) { tiles.delete(key); tiles.set(key, hit); return hit; }   // keep the fresh ones

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  try { g.imageSmoothingQuality = "high"; } catch (e) {}
  rawDrawImage.call(g, img, sx, sy, sw, sh, 0, 0, w, h);

  // ── DOES THE TILE LOOK THE SAME? ─────────────────────────────────────────
  //
  // Asked once per piece, on the device that is actually drawing it, instead
  // of trusted from a rule. Three other routes to the same speed-up all
  // changed the picture and only measuring caught them: an ImageBitmap
  // resamples differently (worst channel 101 over a background), so does a
  // full-size canvas copy (worst 153), and a shallow shrink through a tile
  // does too (worst 76).
  //
  // So the tile is drawn both ways and compared. If a single channel differs
  // the piece is never tiled again and the original draw is used for ever.
  // That makes "it looks the same" true by construction rather than by my
  // sampling a few sizes and hoping.
  if (!verify(img, sx, sy, sw, sh, w, h)) { noTile.add(key); return null; }

  tiles.set(key, c);
  tilePixels += w * h;
  // Kept to a budget by area, not by how many: one big tile costs as much as
  // many small ones, and counting tiles would let a handful of large ones eat
  // a phone's memory.
  while (tilePixels > TILE_BUDGET && tiles.size > 1) {
    const oldestKey = tiles.keys().next().value;
    const old = tiles.get(oldestKey);
    tiles.delete(oldestKey);
    tilePixels -= old.width * old.height;
  }
  // Same reason as everything else here: a canvas used as a source is redrawn
  // step by step on some drivers, a picture is not.
  return freeze(c);
}

// Pieces that failed the check, and the scratch canvases it uses.
const noTile = new Set();
let checks = 0;
const CHECK_MAX = 240;          // after this many, nothing new is tiled
let scratchA = null, scratchB = null;

function verify(img, sx, sy, sw, sh, w, h) {
  if (checks >= CHECK_MAX) return false;
  checks++;
  try {
    if (!scratchA) { scratchA = document.createElement("canvas"); scratchB = document.createElement("canvas"); }
    scratchA.width = scratchB.width = w; scratchA.height = scratchB.height = h;
    const ga = scratchA.getContext("2d", { willReadFrequently: true });
    const gb = scratchB.getContext("2d", { willReadFrequently: true });
    // Over a mid tone, so anything bleeding at a soft edge shows up rather
    // than hiding in a transparent corner nobody can see.
    ga.fillStyle = gb.fillStyle = "#4a6b8a";
    ga.fillRect(0, 0, w, h); gb.fillRect(0, 0, w, h);
    rawDrawImage.call(ga, img, sx, sy, sw, sh, 0, 0, w, h);            // as it is drawn today
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    const tg = tmp.getContext("2d");
    tg.imageSmoothingEnabled = true;
    try { tg.imageSmoothingQuality = "high"; } catch (e) {}
    rawDrawImage.call(tg, img, sx, sy, sw, sh, 0, 0, w, h);
    rawDrawImage.call(gb, tmp, 0, 0, w, h, 0, 0, w, h);                 // through a tile
    const pa = ga.getImageData(0, 0, w, h).data, pb = gb.getImageData(0, 0, w, h).data;
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return false;
    return true;
  } catch (e) {
    return false;        // could not check it, so do not change it
  }
}

function worthTiling(img, sw, sh, dw, dh) {
  if (!PRESCALE || !rawDrawImage) return false;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih || iw * ih < BIG_SHEET) return false;
  if (!(dw > 0 && dh > 0 && sw > 0 && sh > 0)) return false;
  if (sw / dw < SHRINK_MIN || sh / dh < SHRINK_MIN) return false;
  const area = dw * dh;
  return area >= TILE_MIN && area <= TILE_MAX_AREA;
}

// How much of the artwork is being sampled, for the ?diag panel.
window.tileStats = () => ({ tiles: tiles.size, mp: +(tilePixels / 1e6).toFixed(2), on: PRESCALE, refused: noTile.size });

// THE SAME SWAP, WITHOUT BUILDING AN ARRAY ON EVERY SINGLE DRAW.
//
// This used to be written with a rest parameter, `function (src, ...rest)`,
// and then called on with `raw.call(this, im || src, ...rest)`. A rest
// parameter builds a fresh array every time the function runs, and a 2D game
// calls drawImage hundreds of times a frame. That is hundreds of throwaway
// arrays a frame, on every device, in the hottest path there is, and it is
// what the rubbish collector keeps waking up to clear: the little catches that
// have nothing to do with how much is on screen.
//
// drawImage only ever takes 3, 5 or 9 arguments, so each is spelled out and
// handed straight on. No array, no spread.
(() => {
  const P = CanvasRenderingContext2D.prototype, raw = P.drawImage;
  rawDrawImage = raw;
  P.drawImage = function (src, a, b, c, d, e, f, g, h) {
    const im = src && src.toBlob ? frozenArt.get(src) : null;
    const s = im || src;
    if (COUNTING) { drawCount.n++; drawCount.srcs.add(src); }
    switch (arguments.length) {
      case 3: return raw.call(this, s, a, b);
      case 5: return raw.call(this, s, a, b, c, d);
      case 9: {
        // A small piece of a big sheet, shrunk: draw the tile instead.
        if (s && s.src !== undefined && worthTiling(s, c, d, g, h)) {
          const t = tileFor(s, a, b, c, d, g, h);
          if (t) {
            const ti = frozenArt.get(t) || t;
            return raw.call(this, ti, 0, 0, t.width, t.height, e, f, g, h);
          }
        }
        return raw.call(this, s, a, b, c, d, e, f, g, h);
      }
      default: return raw.call(this, s, a, b, c, d, e, f, g, h);
    }
  };
})();

// Is this device keeping up? Each effect asks once a frame. It answers yes
// (too slow) only when the average frame has stayed over `limit` ms for `hold`
// ms of play, never in the first few seconds of a run or after a pause, when
// loading makes a few frames slow on any machine. Only frames of play count:
// the menus draw at a calm pace on purpose.
function slowWatch(limit, hold) {
  let avg = 16.7, last = 0, since = 0, bad = 0;
  return () => {
    if ((typeof gameState !== "undefined" && gameState !== "playing") || (typeof runGate !== "undefined" && runGate.phase !== "go")) { since = 0; bad = 0; last = 0; return false; }
    const now = performance.now(), dt = now - last;
    if (dt < 4) return false;                 // asked again in the same frame
    last = now;
    if (dt > 250) { since = now; bad = 0; avg = 16.7; return false; }   // a load or a hidden tab: start over
    if (!since) since = now;
    avg += (dt - avg) * 0.05;
    if (now - since < 5000) return false;
    bad = avg > limit ? bad + dt : 0;
    return bad > hold;
  };
}

// A filtered copy of part of a picture, made once and kept. Drawing with
// ctx.filter on every frame is very slow on many devices (each filtered draw
// can cost several milliseconds); a copy made once costs nothing after.
//   ctx.drawImage(baked(img, sx, sy, sw, sh, "brightness(0.8)"), 0, 0, sw, sh, dx, dy, dw, dh)
// Answers the picture itself, unfiltered, when it isn't loaded yet or the
// browser has no canvas filters.
const bakedCache = new Map();
function baked(img, sx, sy, sw, sh, filter) {
  if (!filter || !img || !(img.naturalWidth || img.width)) return null;
  const key = (img.src || img.id || "") + "|" + sx + "," + sy + "," + sw + "," + sh + "|" + filter;
  let c = bakedCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  const g = c.getContext("2d");
  g.filter = filter;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  bakedCache.set(key, freeze(c));
  return c;
}
// Draw part of a picture with a filter, from the copy made once.
function drawBaked(img, sx, sy, sw, sh, dx, dy, dw, dh, filter) {
  const c = baked(img, sx, sy, sw, sh, filter);
  if (c) ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, dw, dh);
  else ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
