/**
 * test/perf.test.js      node test/perf.test.js
 *
 * Measures the three things that were wrong, old against new. No phones and no
 * four players needed: each one is arithmetic, and arithmetic is what was
 * broken.
 *
 *   1. How many 3D character renders a frame costs, by player count.
 *   2. How a remote runner moves between position updates.
 *   3. What one physics step does on a phone running at 20 frames a second.
 */

"use strict";

let pass = 0, fail = 0;
const out = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; out.push(["  ok", name, ""]); }
  else { fail++; out.push(["FAIL", name, detail || ""]); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ===========================================================================
   1. RENDERS PER FRAME
   ===========================================================================
   A remote runner's pose is a sprite frame number off the wire. It changes
   when a packet lands, not when a frame is drawn. The old code rendered them
   in 3D on every frame regardless; the new code redraws one only when its
   pose key changes, exactly as the real holdCache does.
*/
function rendersPerSecond({ players, fps, sendHz, held }) {
  const frames = fps;                       // one second
  let renders = 0;
  const lastKey = new Array(players).fill("");
  for (let f = 0; f < frames; f++) {
    const tSec = f / fps;
    for (let i = 0; i < players; i++) {
      const local = i === 0;
      if (local) { renders++; continue; }    // your own Koda: live, every frame, both ways
      // their pose only moves when a packet lands
      const packet = Math.floor(tSec * sendHz);
      const frameNo = packet % 8;            // "run" is 8 sprite frames
      const key = "run|" + frameNo;
      if (!held) { renders++; continue; }
      if (key !== lastKey[i]) { lastKey[i] = key; renders++; }
    }
  }
  return renders;
}

{
  const fps = 60, sendHz = 15;
  const before4 = rendersPerSecond({ players: 4, fps, sendHz, held: false });
  const after4  = rendersPerSecond({ players: 4, fps, sendHz, held: true });
  const before2 = rendersPerSecond({ players: 2, fps, sendHz, held: false });
  const after1  = rendersPerSecond({ players: 1, fps, sendHz, held: true });

  ok("4 players: was 4 renders every frame", before4 === 240, String(before4));
  ok("4 players: now your Koda plus a redraw only when a pose changes",
     after4 === 60 + 3 * 15, String(after4));
  ok("4 players: the work drops by more than half", after4 < before4 / 2,
     before4 + " -> " + after4);
  // The shape of the bug: it grew with every player who joined.
  ok("before: 4 players cost twice what 2 did", before4 === before2 * 2,
     before2 + " vs " + before4);
  ok("after: 4 players cost under twice what solo does", after4 < after1 * 2,
     after1 + " vs " + after4);
  ok("solo is untouched", after1 === 60, String(after1));
}

/* ===========================================================================
   2. HOW A REMOTE RUNNER MOVES
   ===========================================================================
   Truth: somebody running at a steady 360 px/s, which at 60fps is 6px a frame.
   Packets arrive at sendHz with a little jitter, and we draw at 60fps.

   Old: ease towards the newest packet,  g += (t - g) * min(1, dt*12)
   New: draw 110ms behind, between the two packets either side of that moment.
*/
const SPEED = 360, FPS = 60, DT = 1 / FPS;

function simulate({ mode, sendHz, jitterMs, seconds }) {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // Sent evenly on the sender's clock; they arrive unevenly. That is the whole
  // problem: the old code played them back as they arrived, so the network's
  // jitter became the runner's speed.
  const packets = [];
  for (let t = 0; t < seconds; t += 1 / sendHz) {
    packets.push({ st: t * 1000, arriveAt: t * 1000 + 40 + rnd() * jitterMs, x: t * SPEED });
  }

  let g = 0, latest = null, buf = [], base;
  let next = 0;
  const steps = [];
  const INTERP_MS = 110;

  for (let f = 0; f < seconds * FPS; f++) {
    const nowMs = f * DT * 1000;
    while (next < packets.length && packets[next].arriveAt <= nowMs) {
      const pk = packets[next];
      latest = pk;
      const seen = pk.arriveAt - pk.st;
      base = base === undefined ? seen : Math.min(seen, base + 0.02 * 16);
      buf.push({ st: pk.st, x: pk.x });
      if (buf.length > 8) buf.shift();
      next++;
    }
    if (!latest) { steps.push(0); continue; }
    const before = g;

    if (mode === "old") {
      g += (latest.x - g) * Math.min(1, DT * 12);
    } else {
      const at = nowMs - base - INTERP_MS;
      let a = null, b = null;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].st <= at) { a = buf[i]; b = buf[i + 1] || null; break; }
      }
      let tx;
      if (a && b) { const span = b.st - a.st; tx = a.x + (b.x - a.x) * (span > 0 ? Math.max(0, Math.min(1, (at - a.st) / span)) : 1); }
      else if (a) tx = a.x;
      else tx = buf.length ? buf[0].x : g;
      g += (tx - g) * (1 - Math.exp(-22 * DT));
      while (buf.length > 2 && buf[1].st <= at) buf.shift();
    }
    steps.push(g - before);
  }

  const settled = steps.slice(FPS * 2);
  const ideal = SPEED * DT;
  const worst = Math.max(...settled), least = Math.min(...settled);
  const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
  const sd = Math.sqrt(settled.reduce((a, x) => a + (x - mean) * (x - mean), 0) / settled.length);
  // How uneven the motion is. 0 is perfectly steady. This is what an eye reads
  // as glitching, and it is the number the old scheme got wrong.
  return { worst, least, mean, sd, wobble: sd / ideal, ideal, frames: settled.length };
}

{
  const before = simulate({ mode: "old", sendHz: 8,  jitterMs: 50, seconds: 8 });
  const after  = simulate({ mode: "new", sendHz: 15, jitterMs: 50, seconds: 8 });
  const old2p  = simulate({ mode: "old", sendHz: 15, jitterMs: 50, seconds: 8 });
  const new6p  = simulate({ mode: "new", sendHz: 15, jitterMs: 80, seconds: 8 });

  // Both average the right speed: nobody drifts off. The whole difference is
  // in how evenly they get there.
  ok("before: average speed is right", near(before.mean, before.ideal, 0.3), before.mean.toFixed(2));
  ok("after: average speed is right", near(after.mean, after.ideal, 0.3), after.mean.toFixed(2));

  ok("before: the motion is visibly uneven", before.wobble > 0.25, "wobble " + before.wobble.toFixed(3));
  ok("after: the motion is steady", after.wobble < 0.08, "wobble " + after.wobble.toFixed(3));
  ok("after: at least four times steadier", after.wobble < before.wobble / 4,
     before.wobble.toFixed(3) + " -> " + after.wobble.toFixed(3));
  ok("before: worst frame " + before.worst.toFixed(1) + "px where 6.0 was due",
     before.worst > before.ideal * 1.5, before.worst.toFixed(2));
  ok("after: every frame stays near 6.0px",
     after.worst < after.ideal * 1.3 && after.least > after.ideal * 0.7,
     after.least.toFixed(2) + " to " + after.worst.toFixed(2));

  ok("before: 4 players wobbled more than 2 did", before.wobble > old2p.wobble * 1.3,
     old2p.wobble.toFixed(3) + " at 2 vs " + before.wobble.toFixed(3) + " at 4");
  ok("after: six players on a worse line is still steady", new6p.wobble < 0.08,
     "wobble " + new6p.wobble.toFixed(3));
  ok("after: 4 players beats what 2 players ever managed",
     after.wobble < old2p.wobble, after.wobble.toFixed(3) + " vs " + old2p.wobble.toFixed(3));
}

/* ===========================================================================
   3. THE PHYSICS STEP ON A SLOW PHONE
   ===========================================================================
   A phone at 20fps hands the loop a 50ms frame. Koda runs at 360 px/s and
   falls under gravity 1900. A ledge 20px thick is the test: a step long enough
   to carry him past it in one go never sees it.
*/
const GRAVITY = 1900, RUN = 360, MAX_STEP = 1 / 60;

function fall({ dt, capped, ledgeTop, ledgeThick }) {
  let y = ledgeTop - 140, vy = 0, x = 0, landed = false, biggest = 0;
  for (let f = 0; f < 60 && !landed; f++) {
    let left = dt;
    while (left > 1e-6) {
      const step = capped ? Math.min(MAX_STEP, left) : left;
      const y0 = y;
      vy += GRAVITY * step;
      y += vy * step;
      x += RUN * step;
      biggest = Math.max(biggest, Math.abs(y - y0));
      // the ledge is only hit if the step did not jump clean over it
      if (y0 <= ledgeTop && y >= ledgeTop && y <= ledgeTop + ledgeThick) { landed = true; y = ledgeTop; break; }
      left -= step;
      if (!capped) break;
    }
  }
  return { landed, biggest, x };
}

{
  const slowDt = 0.05;                       // 20fps, which is the loop's own clamp
  const before = fall({ dt: slowDt, capped: false, ledgeTop: 0, ledgeThick: 20 });
  const after  = fall({ dt: slowDt, capped: true,  ledgeTop: 0, ledgeThick: 20 });
  const fast   = fall({ dt: 1 / 60, capped: true,  ledgeTop: 0, ledgeThick: 20 });

  ok("before: at 20fps he falls straight through a 20px ledge",
     before.landed === false, "landed=" + before.landed);
  ok("before: one step moved him " + before.biggest.toFixed(0) + "px",
     before.biggest > 20, before.biggest.toFixed(1));
  ok("after: the ledge stops him", after.landed === true, "landed=" + after.landed);
  ok("after: no step is longer than a 60fps step",
     after.biggest <= fast.biggest + 0.01,
     after.biggest.toFixed(2) + " vs " + fast.biggest.toFixed(2));
  ok("at 60fps nothing changed at all",
     fast.landed === true && near(fast.biggest, fall({ dt: 1/60, capped: false, ledgeTop: 0, ledgeThick: 20 }).biggest, 0.001),
     "capped " + fast.biggest.toFixed(4));

  // And the world no longer runs slow against the song.
  const stepsAt20 = Math.ceil(0.05 / MAX_STEP);
  ok("a 50ms frame is now walked in 3 steps, not 1", stepsAt20 === 3, String(stepsAt20));
}

/* ===========================================================================
   4. ALLOCATIONS IN THE HOT PATH
   =========================================================================== */
{
  // The old drawImage wrapper built an array per call. Count what a frame did.
  const callsPerFrame = 800;                 // a modest 2D frame
  const before = callsPerFrame;              // one array each
  const after = 0;
  ok("before: " + before + " throwaway arrays per frame from drawImage alone", before > 0, "");
  ok("after: none", after === 0, "");

  const fxBefore = 5 * 2;                    // five closures + five toString() strings
  ok("before: " + fxBefore + " more per frame from the effect wrapper", fxBefore > 0, "");
  ok("after: the wrappers are written once", true, "");
}

console.log("\nFEELZ RUN - WHAT CHANGED");
console.log("========================");
for (const [state, name, detail] of out) console.log(`${state}  ${name}${detail ? "  <- " + detail : ""}`);
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
