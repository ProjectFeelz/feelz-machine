"use strict";

/* ---------- the frame ---------- */

// Right-to-left missions: the world is drawn mirrored, words stay readable.
const rawFillText = ctx.fillText.bind(ctx);

function mirroredText(t, x, y, w) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); if (w !== undefined) rawFillText(t, 0, 0, w); else rawFillText(t, 0, 0); ctx.restore(); }

// The look (3D buildings, weather, light) never stops a frame: if any of it
// fails, it is skipped and the game draws on. A part that keeps failing is
// switched off for the visit.
// Counted by name rather than by reading the function back as text.
//
// This used to do `const key = fn.toString()` on every call. That turns the
// function into a string every time, five times a frame, and the five
// functions were themselves written fresh at each call site on every frame.
// Both are gone: the name is passed in, and the five calls below hand over
// the function that already exists instead of wrapping it in a new one.
const fxFails = {};
function safeFx(name, fn) {
  if (fxFails[name] > 5) return;
  ctx.save();
  try { fn(); } catch (e) { fxFails[name] = (fxFails[name] || 0) + 1; if (fxFails[name] === 1) console.warn("[fx] skipped:", name, e && e.message); }
  ctx.restore();
}

/* ---------------------------------------------------------------------------
   A STOPWATCH ON EACH PART OF A FRAME.  Open the game with ?diag=1
   ---------------------------------------------------------------------------
   Off unless the address ends in ?diag=1, and when it is off it costs one
   boolean test per frame and nothing else. It draws a small panel of numbers
   over the game: this is a measuring tool, not a graphics setting, and it
   changes nothing about how the game looks or plays without that switch.

   Why it exists: the same build runs smoothly on an iPhone and badly on a
   Samsung, and guessing which part of a frame is to blame from another
   continent is how people end up turning the graphics down for no reason. The
   phone can simply say which part is slow.

   The numbers are milliseconds, the middle value of the last 90 frames. A
   frame has 16.7ms to play with at 60fps.
--------------------------------------------------------------------------- */
const DIAG_LEVEL = (() => { const m = /[?&]diag=([12])\b/.exec(location.search); return m ? +m[1] : 0; })();
const DIAG = DIAG_LEVEL > 0;
const diag = { hist: {}, calls: {}, med: {}, medCalls: {}, n: 0, line2: "" };

// THE MEASUREMENT USED TO CHANGE WHAT IT MEASURED.
//
// Level 2 called getImageData after every phase to make the GPU finish, so the
// waiting could be charged to the phase that caused it. But Chrome watches for
// a canvas being read back, and past a few reads it stops drawing that canvas
// on the GPU and rasterises it on the processor instead. Sixteen reads a frame
// guarantees that. So the panel was timing a canvas it had itself demoted, and
// every figure it gave for a slow phase was the cost of software drawing
// rather than the cost of the game. A phase showing twenty milliseconds for a
// single drawImage was the tool, not the game.
//
// Nothing reads the canvas back any more. The per-phase numbers are now only
// the work the game hands over, which is honest but cannot see what the GPU
// does afterwards. "real" is the number that matters and cannot be faked: the
// true gap between frames. ?skip= leaves phases out, so the one that owns the
// time is found by its absence rather than by a readback.
function sync() {}

// ?skip=solids,decor leaves those phases undrawn, so what a part costs shows
// up as its absence in "real". A measuring tool, not a graphics setting:
// without the switch in the address nothing is ever skipped.
const SKIP = new Set((/[?&]skip=([^&]*)/.exec(location.search) || ["", ""])[1].split(",").filter(Boolean));
function T(name, fn) {
  if (SKIP.has(name)) return;
  if (!DIAG) { fn(); return; }
  if (window.readDrawCount) window.readDrawCount();     // zero it for this phase
  if (window.readOpCount) window.readOpCount();
  const t0 = performance.now();
  fn();
  sync();
  const d = performance.now() - t0;
  const h = diag.hist[name] || (diag.hist[name] = []);
  h.push(d);
  if (h.length > 90) h.shift();
  // Calls and distinct pictures, so an expensive call can be told from a lot
  // of cheap ones.
  if (window.readDrawCount) {
    const c = window.readDrawCount();
    const q = diag.calls[name] || (diag.calls[name] = { n: [], u: [], names: [] });
    q.n.push(c.n); q.u.push(c.u);
    if (c.names && c.names.length) q.names = c.names;
    if (window.readOpCount) {
      const o = window.readOpCount();
      const s = Object.keys(o).map(k => o[k] + k).join(" ");
      if (s) q.ops = s;
    }
    if (q.n.length > 90) { q.n.shift(); q.u.shift(); }
  }
}
// shell.js hands in the parts that happen outside render().
if (DIAG) window.diagNote = (name, ms) => { if (!DIAG) return; const h = diag.hist[name] || (diag.hist[name] = []); h.push(ms); if (h.length > 90) h.shift(); };

function diagPanel() {
  diag.n++;
  // The true gap from one frame to the next. shell.js reports "frame", but
  // that is dt, and the loop clamps dt at 50ms: it stops counting at 20fps, so
  // a 200ms frame and a 51ms frame both read 50.0. This one does not clamp.
  const nowMs = performance.now();
  if (diag.lastFrame) window.diagNote("real", nowMs - diag.lastFrame);
  diag.lastFrame = nowMs;

  if (diag.n % 20 === 0) {
    diag.med = {};
    for (const k in diag.hist) {
      const a = diag.hist[k].slice().sort((x, y) => x - y);
      diag.med[k] = a[Math.floor(a.length / 2)] || 0;
    }
    diag.medCalls = {};
    for (const k in diag.calls) {
      const n = diag.calls[k].n.slice().sort((x, y) => x - y);
      const u = diag.calls[k].u.slice().sort((x, y) => x - y);
      diag.medCalls[k] = (n[Math.floor(n.length / 2)] || 0) + "/" + (u[Math.floor(u.length / 2)] || 0);
    }
    if (!diag.line2) {
      let gpu = "?";
      try {
        const c = document.createElement("canvas"), gl = c.getContext("webgl");
        const e = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \(|\)$/g, "").slice(0, 40);
      } catch (e) {}
      diag.line2 = gpu;
    }
  }
  const order = ["real", "render", "hudDom", "frame", "update", "inward", "bg", "world3d", "decor", "solids", "props", "runners", "atmos", "weather", "dark", "rain", "screenfx", "hud", "cards", "bloom", "song", "overlays", "panel"];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(6, 6, 12, 0.82)";
  const PY0 = 74;                       // clear of the records pill at the top
  ctx.fillRect(6, PY0 - 16, 560, 32 + (order.length + 5) * 14);
  ctx.font = "600 11px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#8ff0a8";
  ctx.fillText(diag.line2 || "", 12, PY0 - 4);
  ctx.fillStyle = "#9fb4c7";
  if (window.setDrawCounting) window.setDrawCounting(true);
  const ts = window.tileStats ? window.tileStats() : null;
  ctx.fillText("canvas " + W + "x" + H + "  L" + DIAG_LEVEL
             + (ts ? "  tiles " + (ts.on ? ts.tiles + "/" + ts.mp + "MP  refused " + ts.refused : "OFF") : ""), 12, PY0 + 10);
  let y = PY0 + 28;
  for (const k of order) {
    const v = diag.med[k];
    if (v === undefined) continue;
    const hi = k === "real" || k === "frame" ? [33, 20] : [8, 3];
    ctx.fillStyle = v > hi[0] ? "#ff9a9a" : v > hi[1] ? "#ffc46a" : "#9fb4c7";
    const c = diag.medCalls[k];
    ctx.fillText(k.padEnd(9) + v.toFixed(1).padStart(5) + (c ? "   " + c : ""), 12, y);
    y += 14;
  }
  // The three slowest phases name the artwork they were reading, and the tiler
  // says which pieces it turned down. Both are questions a timing cannot answer.
  ctx.font = "600 9px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "#c8b48f";
  const slow = order.filter(k => diag.med[k] > 3 && diag.calls[k]
                              && (diag.calls[k].names.length || diag.calls[k].ops)).slice(0, 4);
  for (const k of slow) {
    const q = diag.calls[k];
    ctx.fillText((k + ": " + (q.ops || "") + "  " + q.names.join(" ")).slice(0, 104), 12, y);
    y += 12;
  }
  if (ts && ts.why && ts.why.length) {
    ctx.fillStyle = "#e09a9a";
    ctx.fillText("refused: " + ts.why.join("  ").slice(0, 86), 12, y);
  }
  ctx.restore();
}

// Written once, here, instead of five new functions on every frame.
//
// Still wrappers rather than the methods themselves: World3D and Atmos are
// defined in other files that may load after this one, and calling through a
// wrapper also keeps each method's own `this`.
const FX = {
  world3d: () => World3D.draw(),
  back:    () => Atmos.back(),
  reflect: () => Atmos.reflect(),
  front:   () => Atmos.front(),
  grade:   () => Atmos.grade()
};

function render() {
  if (inward.active) {
    // Timed at last. When this runs, render returns before a single phase, so
    // every phase row below keeps its last value: the panel shows a frame that
    // looks free while render reads a hundred and twenty.
    if (!DIAG) { renderInward(); return; }
    const i0 = performance.now();
    renderInward();
    window.diagNote("inward", performance.now() - i0);
    return;
  }
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
  const mirror = mission && mission.mirror;
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillText = mirroredText; }
  T("bg", drawBackground);
  T("world3d", () => safeFx("world3d", FX.world3d));
  T("atmos", () => safeFx("atmos.back", FX.back));
  T("decor", () => { drawDecor(); drawTunnels(); drawMud(); });
  // The street first, then what stands on it, then everything else: so the street
  // dressing sits on the road surface instead of behind its edge.
  T("solids", () => {
    for (const s of level.solids) if (s.kind === "ground" && onScreen(s.x, s.w, 200)) drawSolid(s);
    drawSetDressing();
    for (const s of level.solids) {
      if (s.kind === "ground" || !onScreen(s.x, s.w, 200)) continue;
      if (s.kind === "awning" && level.stalls.length) continue;   // drawn with the stalls
      drawSolid(s);
    }
  });
  T("atmos", () => safeFx("atmos.reflect", FX.reflect));
  T("props", () => { drawBeatSolids(); drawValves(); drawClimbs(); drawZiplines();
                     drawCrowds("back"); drawCheckpoints(); drawGoal(); drawPickups(); });
  T("runners", drawWardens);
  T("props", () => { drawStalls(); drawDrones(); drawCages(); drawScanners();
                     drawTails(); drawZoraCompanion(); drawHound(); drawDogs(); });
  T("runners", drawPlayers);
  T("runners", drawCoopPartner);
  T("props", () => { drawStallFronts(); drawHedges(); drawCrowds("front"); });
  T("atmos", () => safeFx("atmos.front", FX.front));
  T("weather", () => { drawDebris(); drawStormFront(); drawParticles(); });
  T("dark", () => { drawDarkness(); drawShadowFront(); });
  const indoors = sectionAt(cameraX + W / 2).world === "ve";
  const baseRain = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
  T("rain", () => drawRain(indoors ? 0 : baseRain + storm.strength * 0.9));
  if (mirror) { ctx.restore(); ctx.save(); ctx.fillText = rawFillText; }
  T("atmos", () => safeFx("atmos.grade", FX.grade));
  T("screenfx", () => { drawPrayer(); drawScreenFx(); });
  ctx.restore();
  ctx.fillText = rawFillText;
  T("hud", drawSystemsHud);
  // These were drawn outside every phase, so they have never appeared in a
  // reading. The tutorial card and the missed-checkpoint banner are both on
  // screen in the run that takes 142ms a frame.
  T("cards", () => { if (typeof drawTutorial === "function") drawTutorial(); drawCheckpointMiss(); });
  T("bloom", postBloom);
  T("song", () => { drawSongBar(); drawLyrics(); drawBanner(); drawToast(); drawTaunt(); drawTransition(); drawReading(); });
  T("overlays", postFinish);
  // The panel is drawn inside render and so far has timed everything except
  // itself. Twenty lines of text a frame is not free, and a measuring tool
  // that hides its own cost is the reason this hunt took as long as it did.
  if (DIAG) { const p0 = performance.now(); diagPanel(); window.diagNote("panel", performance.now() - p0); }
}

function drawTransition() {
  if (inward.fade <= 0) return;
  // a quick swing of the camera: a soft dip and a streak of motion, not a stop
  const k = Math.min(1, inward.fade / 0.22);
  ctx.fillStyle = `rgba(6, 6, 12, ${k * 0.55})`;
  ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = k * 0.35; ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 14; i++) { const y = (i * 97 + frameTime * 900) % H; ctx.fillStyle = "rgba(255, 214, 150, 0.5)"; ctx.fillRect(0, y, W, 2); }
  ctx.restore();
}
