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
(() => {
  const P = CanvasRenderingContext2D.prototype, raw = P.drawImage;
  P.drawImage = function (src, ...rest) {
    const im = src && src.toBlob ? frozenArt.get(src) : null;
    return raw.call(this, im || src, ...rest);
  };
})();

// Is this device keeping up? Each effect asks once a frame. It answers yes
// (too slow) only when the average frame has stayed over `limit` ms for `hold`
// ms of play, never in the first few seconds of a run or after a pause, when
// loading makes a few frames slow on any machine.
function slowWatch(limit, hold) {
  let avg = 16.7, last = 0, since = 0, bad = 0;
  return () => {
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
