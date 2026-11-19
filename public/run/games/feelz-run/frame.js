"use strict";

/* ---------- the frame ---------- */

// Right-to-left missions: the world is drawn mirrored, words stay readable.
const rawFillText = ctx.fillText.bind(ctx);

function mirroredText(t, x, y, w) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); if (w !== undefined) rawFillText(t, 0, 0, w); else rawFillText(t, 0, 0); ctx.restore(); }

// The look (3D buildings, weather, light) never stops a frame: if any of it
// fails, it is skipped and the game draws on. A part that keeps failing is
// switched off for the visit.
const fxFails = {};
function safeFx(fn) {
  const key = fn.toString();
  if (fxFails[key] > 5) return;
  ctx.save();
  try { fn(); } catch (e) { fxFails[key] = (fxFails[key] || 0) + 1; if (fxFails[key] === 1) console.warn("[fx] skipped:", e && e.message); }
  ctx.restore();
}

function render() {
  if (inward.active) { renderInward(); return; }
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
  const mirror = mission && mission.mirror;
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillText = mirroredText; }
  drawBackground();
  safeFx(() => World3D.draw());
  safeFx(() => Atmos.back());
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
  safeFx(() => Atmos.reflect());
  drawBeatSolids();
  drawValves();
  drawClimbs();
  drawZiplines();
  drawCrowds("back");
  drawCheckpoints();
  drawGoal();
  drawPickups();
  drawWardens();
  drawStalls();      // enforcers walk the back of the market, behind the stalls
  drawDrones();
  drawCages();
  drawScanners();
  drawTails();
  drawZoraCompanion();
  drawHound();
  drawDogs();
  drawPlayers();
  drawCoopPartner();
  drawStallFronts();
  drawHedges();
  drawCrowds("front");
  safeFx(() => Atmos.front());
  drawDebris();
  drawStormFront();
  drawParticles();
  drawDarkness();
  drawShadowFront();
  const indoors = sectionAt(cameraX + W / 2).world === "ve";
  const baseRain = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
  drawRain(indoors ? 0 : baseRain + storm.strength * 0.9);
  if (mirror) { ctx.restore(); ctx.save(); ctx.fillText = rawFillText; }
  safeFx(() => Atmos.grade());
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
  postFinish();
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
