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
const DIAG = /[?&]diag=1\b/.test(location.search);
const diag = { hist: {}, med: {}, n: 0, line2: "" };

function T(name, fn) {
  if (!DIAG) { fn(); return; }
  const t0 = performance.now();
  fn();
  const d = performance.now() - t0;
  const h = diag.hist[name] || (diag.hist[name] = []);
  h.push(d);
  if (h.length > 90) h.shift();
}
// shell.js hands in the parts that happen outside render().
if (DIAG) window.diagNote = (name, ms) => { if (!DIAG) return; const h = diag.hist[name] || (diag.hist[name] = []); h.push(ms); if (h.length > 90) h.shift(); };

function diagPanel() {
  diag.n++;
  // The GPU is allowed to run behind. Asking for one pixel back makes it
  // finish, so "gpuWait" is the work the timings above could not see.
  const g0 = performance.now();
  try { ctx.getImageData(0, 0, 1, 1); } catch (e) {}
  window.diagNote("gpuWait", performance.now() - g0);

  if (diag.n % 20 === 0) {
    diag.med = {};
    for (const k in diag.hist) {
      const a = diag.hist[k].slice().sort((x, y) => x - y);
      diag.med[k] = a[Math.floor(a.length / 2)] || 0;
    }
    if (!diag.line2) {
      let gpu = "?";
      try {
        const c = document.createElement("canvas"), gl = c.getContext("webgl");
        const e = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)).slice(0, 46);
      } catch (e) {}
      diag.line2 = gpu;
    }
  }
  const order = ["frame", "update", "world3d", "atmos", "scenery", "runners", "weather", "overlays", "gpuWait"];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(6, 6, 12, 0.82)";
  ctx.fillRect(6, 6, 212, 20 + order.length * 15);
  ctx.font = "600 12px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#8ff0a8";
  ctx.fillText(diag.line2 || "", 14, 18);
  let y = 36;
  for (const k of order) {
    const v = diag.med[k];
    if (v === undefined) continue;
    ctx.fillStyle = v > 8 ? "#ff9a9a" : v > 3 ? "#ffc46a" : "#9fb4c7";
    ctx.fillText(k.padEnd(9) + v.toFixed(1) + " ms", 14, y);
    y += 15;
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
  if (inward.active) { renderInward(); return; }
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
  const mirror = mission && mission.mirror;
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillText = mirroredText; }
  T("scenery", drawBackground);
  T("world3d", () => safeFx("world3d", FX.world3d));
  T("atmos", () => safeFx("atmos.back", FX.back));
  drawDecor();
  drawTunnels();
  drawMud();
  // The street first, then what stands on it, then everything else: so the street
  // dressing sits on the road surface instead of behind its edge.
  for (const s of level.solids) if (s.kind === "ground" && onScreen(s.x, s.w, 200)) drawSolid(s);
  drawSetDressing();
  for (const s of level.solids) {
    if (s.kind === "ground" || !onScreen(s.x, s.w, 200)) continue;
    if (s.kind === "awning" && level.stalls.length) continue;   // drawn with the stalls
    drawSolid(s);
  }
  T("atmos", () => safeFx("atmos.reflect", FX.reflect));
  drawBeatSolids();
  drawValves();
  drawClimbs();
  drawZiplines();
  drawCrowds("back");
  drawCheckpoints();
  drawGoal();
  drawPickups();
  T("runners", drawWardens);
  drawStalls();      // enforcers walk the back of the market, behind the stalls
  drawDrones();
  drawCages();
  drawScanners();
  drawTails();
  drawZoraCompanion();
  drawHound();
  drawDogs();
  T("runners", drawPlayers);
  T("runners", drawCoopPartner);
  drawStallFronts();
  drawHedges();
  drawCrowds("front");
  T("atmos", () => safeFx("atmos.front", FX.front));
  T("weather", () => { drawDebris(); drawStormFront(); drawParticles(); });
  drawDarkness();
  drawShadowFront();
  const indoors = sectionAt(cameraX + W / 2).world === "ve";
  const baseRain = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
  drawRain(indoors ? 0 : baseRain + storm.strength * 0.9);
  if (mirror) { ctx.restore(); ctx.save(); ctx.fillText = rawFillText; }
  T("atmos", () => safeFx("atmos.grade", FX.grade));
  drawPrayer();
  drawScreenFx();
  ctx.restore();
  ctx.fillText = rawFillText;
  drawSystemsHud();
  if (typeof drawTutorial === "function") drawTutorial();
  drawCheckpointMiss();
  postBloom();
  drawSongBar();
  drawLyrics();
  drawBanner();
  drawToast();
  drawTaunt();
  drawTransition();
  drawReading();
  T("overlays", postFinish);
  if (DIAG) diagPanel();
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
