"use strict";

/* ---------- the frame ---------- */

// Right-to-left missions: the world is drawn mirrored, words stay readable.
const rawFillText = ctx.fillText.bind(ctx);

function mirroredText(t, x, y, w) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); if (w !== undefined) rawFillText(t, 0, 0, w); else rawFillText(t, 0, 0); ctx.restore(); }

function render() {
  if (inward.active) { renderInward(); return; }
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
  const mirror = mission && mission.mirror;
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.fillText = mirroredText; }
  drawBackground();
  if (typeof World3D !== "undefined") World3D.draw();
  if (typeof Atmos !== "undefined") Atmos.back();
  drawDecor();
  drawSetDressing();
  drawTunnels();
  drawMud();
  for (const s of level.solids) {
    if (!onScreen(s.x, s.w, 200)) continue;
    if (s.kind === "awning" && level.stalls.length) continue;   // drawn with the stalls
    drawSolid(s);
  }
  if (typeof Atmos !== "undefined") Atmos.reflect();
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
  if (typeof Atmos !== "undefined") Atmos.front();
  drawDebris();
  drawStormFront();
  drawParticles();
  drawDarkness();
  drawShadowFront();
  const indoors = sectionAt(cameraX + W / 2).world === "ve";
  const baseRain = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
  drawRain(indoors ? 0 : baseRain + storm.strength * 0.9);
  if (mirror) { ctx.restore(); ctx.save(); ctx.fillText = rawFillText; }
  if (typeof Atmos !== "undefined") Atmos.grade();
  drawScreenFx();
  ctx.restore();
  ctx.fillText = rawFillText;
  drawSystemsHud();
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
