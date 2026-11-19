"use strict";

/* ---------------------------------------------------------------------------
   INWARD RUNS
   In some places the camera swings round behind Koda and he runs into the
   picture: three lanes, things to jump, slide under or dodge. Distances are
   metres along the run; the side-on level carries on from the far end.
--------------------------------------------------------------------------- */

const inward = { active: false, sec: null, z: 0, fade: 0, done: new Set() };

const IN_GRAV = 22, IN_JUMP = 7.6;

function resetInward() {
  inward.active = false; inward.sec = null; inward.z = 0; inward.fade = 0; inward.done = new Set();
  // The 3D view loads the first time a mission with an inward run starts.
  if (typeof Inward3D !== "undefined" && mission && (mission.inward || []).length) Inward3D.preload();
}

function inwardSections() { return mission.inward || []; }

function checkInward() {
  if (inward.active) return;
  const lead = leader();
  if (!lead.ground) return;
  for (const sec of inwardSections()) {
    if (inward.done.has(sec.from)) continue;
    if (lead.x >= m(sec.from) && lead.x < m(sec.from + 3)) { startInward(sec); return; }
  }
}

// Inward runs are laid out longer than the stretch of street they replace,
// and run a little quicker, so they last but the song still fits.
const IN_STRETCH = 1.6, IN_PACE = 1.15;

function startInward(sec) {
  inward.active = true; inward.sec = sec; inward.fade = 0.4;
  inward.stretch = IN_STRETCH;
  inward.length = (sec.to - sec.from) * IN_STRETCH;
  inward.items = (sec.obstacles || []).map(o => ({ d: o[0] * IN_STRETCH, lane: o[1], kind: o[2] }));
  // Long empty stretches get a box or barrel in one lane (there is always a way past).
  const ds = inward.items.map(o => o.d).concat([0, inward.length]).sort((a, b) => a - b);
  for (let i = 1; i < ds.length; i++) {
    const gap = ds[i] - ds[i - 1];
    if (gap < 11) continue;
    const d = ds[i - 1] + gap / 2, lane = Math.floor(seeded(d * 3.7 + sec.from) * 3) - 1;
    if (d > 6 && d < inward.length - 4) inward.items.push({ d, lane, kind: "low", extra: true });
  }
  inward.items.sort((a, b) => a.d - b.d);
  inward.pick = (sec.records || []).map(r => ({ d: r[0] * IN_STRETCH, lane: r[1], taken: [] }));
  const lead = leader();
  for (const p of players) {
    p.iz = p === lead ? 0 : Math.max(-6, -(lead.x - p.x) / PX);
    p.lane = p.id === 1 ? 0 : 1; p.laneX = p.lane; p.iy = 0; p.ivy = 0; p.islide = 0; p.istun = 0; p.ijumps = 1;
    p.fightWith = null; p.climb = null; p.move = null; p.vx = 0;
    p.ileftHeld = true; p.irightHeld = true;
  }
  storm.debris = [];
  inward.fade = 0.22; sfx.swing();
  showBanner(sec.name || "RUN", "LEFT AND RIGHT TO SWITCH LANES", 1.8);
}

function endInward(cancel) {
  const sec = inward.sec;
  inward.active = false;
  if (!sec) return;
  inward.done.add(sec.from);
  if (cancel) return;
  const lead = leader();
  for (const p of players) {
    const behind = p === lead ? 0 : Math.max(0, inward.length - p.iz) / (inward.stretch || 1);
    const x = m(sec.to) - m(Math.min(4, behind));
    const f = floorUnder(x, -m(30)) || { y: -m(sec.y || 0) };
    p.x = x; p.y = f.y; p.vx = RUN_SPEED; p.vy = 0; p.ground = null; p.facing = 1;
    p.lastSafe = { x: p.x, y: p.y };
    p.autoRun = 0.9;   // carries on running out of it, whatever is held
    setState(p, "normal");
  }
  cameraX = Math.max(0, Math.min(level.width - W, lead.x - W * 0.36));
  storm.front = Math.min(storm.front, lead.x - m(10));
  inward.fade = 0.22; sfx.swing();
}

// What a runner should press in an inward run (the rival uses it; so does the test bot).
function inwardDecide(p) {
  const want = { left: false, right: false, jump: false, down: false };
  const look = (lane, a, b) => inward.items.filter(o => (o.lane === lane || o.lane === "all") && o.d - p.iz > a && o.d - p.iz < b);
  const near = look(p.lane, -0.2, 2.6);
  const block = near.find(o => o.kind === "block");
  if (block) {
    const free = [-1, 0, 1].filter(l => Math.abs(l - p.lane) === 1 && !look(l, -0.6, 3.2).some(o => o.kind === "block"));
    if (free.length) { if (free[0] < p.lane) want.left = true; else want.right = true; }
  }
  for (const o of near) {
    const ahead = o.d - p.iz;
    if (o.kind === "low" && ahead < 1.5 && ahead > 0.2) want.jump = true;
    if (o.kind === "high" && ahead < 1.9 && ahead > 0.1) want.down = true;
  }
  return want;
}

function updateInward(dt) {
  const sec = inward.sec;
  inward.fade = Math.max(0, inward.fade - dt);
  const lead = leader();
  for (const [i, p] of players.entries()) {
    if (p.finished) continue;
    const c = controlsFor(i);
    p.invuln = Math.max(0, p.invuln - dt);
    p.boostTime = Math.max(0, p.boostTime - dt);
    p.animClock += dt;
    // lanes: one step per press
    if (c.left && !p.ileftHeld && p.lane > -1) { p.lane -= 1; sfx.slide(); }
    if (c.right && !p.irightHeld && p.lane < 1) { p.lane += 1; sfx.slide(); }
    p.ileftHeld = c.left; p.irightHeld = c.right;
    p.laneX += (p.lane - p.laneX) * Math.min(1, dt * 12);
    // jump and slide
    const jumpDown = c.jump && !p.jumpPressed, downDown = c.down && !p.downPressed;
    p.jumpPressed = c.jump; p.downPressed = c.down;
    if (jumpDown && (p.iy <= 0 || p.ijumps > 0)) {
      if (p.iy > 0) p.ijumps -= 1;
      p.ivy = p.iy > 0 ? IN_JUMP * 0.8 : IN_JUMP; p.islide = 0; sfx.jump();
    }
    if (downDown) { if (p.iy > 0) p.ivy = -IN_JUMP * 1.4; else { p.islide = 0.75; sfx.slide(); } }
    p.islide = Math.max(0, p.islide - dt);
    p.ivy -= IN_GRAV * dt; p.iy = Math.max(0, p.iy + p.ivy * dt);
    if (p.iy <= 0) { p.ivy = Math.max(0, p.ivy); p.ijumps = 1; }
    // forward
    p.istun = Math.max(0, p.istun - dt);
    const speed = RUN_SPEED / PX * IN_PACE * (p.boostTime > 0 ? BOOST_SPEED : 1) * (p.istun > 0 ? 0.45 : 1);
    const z0 = p.iz;
    p.iz += speed * dt;
    // things in the way
    for (const o of inward.items) {
      // Hits go by where Koda is on screen, not the lane he is moving towards.
      if (!(o.lane === "all" || Math.abs(p.laneX - o.lane) < 0.5)) continue;
      if (!(o.d >= z0 - 0.05 && o.d < p.iz + 0.05)) continue;
      const clear = o.kind === "low" ? p.iy > 0.7 : o.kind === "high" ? p.islide > 0 : false;
      if (clear || p.invuln > 0) continue;
      p.istun = 0.6; p.invuln = 1.1; sfx.hurt(); shake = Math.max(shake, 0.25); rumble(p.id - 1, 0.7, 220);
      burst(p.x, p.y - m(1), "#ff9a6a", 12, 200);
      if (!twoPlayer) { p.hearts -= 1; if (p.hearts <= 0) { p.hearts = maxHearts(p); p.iz = Math.max(0, p.iz - 6); showBanner("WIPEOUT", "", 1); } }
      else p.records = Math.max(0, p.records - 1);
    }
    // records along the lanes
    for (const r of inward.pick) {
      if (r.taken.includes(p.id) || r.lane !== p.lane || Math.abs(r.d - p.iz) > 0.6 || p.iy > 1.6) continue;
      r.taken.push(p.id); p.records += 1; sfx.record();
    }
    // a little of the side-on position moves with you, for the camera and the storm
    p.x = m(sec.from) + m(Math.min(sec.to - sec.from, Math.max(0, p.iz) / (inward.stretch || 1)));
  }
  if (lead.iz >= inward.length) endInward(false);
}


/* ---------- inward runs: behind Koda, running into the picture ---------- */
const IN_HORIZON = 0.44, IN_FOOT = 0.9, IN_LANE = 190, IN_PXM = 98, IN_CAM = 3.2;

function inProject(dz, lane, hgt) {
  const k = IN_CAM / Math.max(0.35, dz + IN_CAM);
  const hy = H * IN_HORIZON, fy = H * IN_FOOT;
  return { x: W / 2 + lane * IN_LANE * k, y: hy + (fy - hy) * k - (hgt || 0) * IN_PXM * k, k };
}

function renderInward() {
  // The 3D view when it is ready; this 2D drawing when it is not (still loading, or no WebGL).
  if (typeof Inward3D !== "undefined" && Inward3D.draw()) { inwardOverlays(); return; }
  const sec = inward.sec, lead = leader();
  const cz = lead.iz;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
  // the place, getting closer as you run into it
  const img = sec.backdrop ? art.loc[sec.backdrop] : null;
  ctx.fillStyle = "#0a0b10"; ctx.fillRect(0, 0, W, H);
  if (img && img.ready) {
    const grow = 1.08 + 0.3 * Math.min(1, cz / inward.length);
    const h = H * grow, w = img.width * h / img.height;
    ctx.drawImage(img, W / 2 - w / 2, H * IN_HORIZON - h * 0.52, w, h);
  }
  const shade = ctx.createLinearGradient(0, H * IN_HORIZON, 0, H);
  shade.addColorStop(0, "rgba(6, 6, 12, 0.15)"); shade.addColorStop(1, "rgba(6, 6, 12, 0.75)");
  ctx.fillStyle = shade; ctx.fillRect(0, H * IN_HORIZON, W, H);
  // the runway: three glossy lanes with gold lines
  const far = inProject(60, 0, 0), near = inProject(-2.6, 0, 0);
  ctx.fillStyle = "rgba(10, 10, 16, 0.55)";
  ctx.beginPath();
  ctx.moveTo(W / 2 - IN_LANE * 1.5 * far.k, far.y); ctx.lineTo(W / 2 + IN_LANE * 1.5 * far.k, far.y);
  ctx.lineTo(W / 2 + IN_LANE * 1.5 * near.k, near.y); ctx.lineTo(W / 2 - IN_LANE * 1.5 * near.k, near.y); ctx.fill();
  ctx.strokeStyle = "rgba(241, 202, 120, 0.7)"; ctx.lineWidth = 2;
  for (const edge of [-1.5, -0.5, 0.5, 1.5]) {
    ctx.beginPath(); ctx.moveTo(W / 2 + edge * IN_LANE * far.k, far.y); ctx.lineTo(W / 2 + edge * IN_LANE * near.k, near.y); ctx.stroke();
  }
  // dashes rushing past
  ctx.fillStyle = "rgba(255, 220, 150, 0.35)";
  for (let d = -(cz % 3); d < 50; d += 3) {
    for (const lane of [-1, 0, 1]) {
      const a = inProject(d, lane, 0), b = inProject(d + 0.9, lane, 0);
      ctx.fillRect(a.x - 2 * a.k, b.y, 4 * a.k, Math.max(1, a.y - b.y));
    }
  }
  // what's coming, far to near
  const things = [];
  for (const o of inward.items) { const dz = o.d - cz; if (dz > -1.2 && dz < 55) things.push({ dz, o }); }
  for (const r of inward.pick) { const dz = r.d - cz; if (dz > -1 && dz < 45 && !r.taken.includes(lead.id)) things.push({ dz, r }); }
  // Koda sorts a little behind his own spot, so whatever he is about to hit stays in view in front of him.
  for (const p of players) things.push({ dz: p.iz - cz + 0.35, p });
  things.sort((a, b) => b.dz - a.dz);
  for (const t of things) {
    if (t.o) drawInwardObstacle(t.o, t.dz);
    else if (t.r) { const q = inProject(t.dz, t.r.lane, 0.65); drawRecordAt(q.x, q.y, q.k); }
    else drawInwardRunner(t.p, t.dz);
  }
  ctx.restore();
  inwardOverlays();
}

// What is drawn over an inward run, whichever view drew the run itself.
function inwardOverlays() {
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

function drawRecordAt(x, y, k) {
  const r = 14 * k + 2;
  ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f1ca78"; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 0.75, -0.6, 0.6); ctx.stroke();
}

/* Inward obstacles are solid blocks in perspective: a textured front, shaded sides and top,
   ink outlines like the paintings, a contact shadow, and the scene's haze over the far ones. */
const IN_EYE = (IN_FOOT - IN_HORIZON) * 540 / IN_PXM;   // camera height in metres

const hazeCache = {};

function sceneHaze() {
  const img = inward.sec && inward.sec.backdrop ? art.loc[inward.sec.backdrop] : null;
  if (!img || !img.ready) return [20, 18, 24];
  if (hazeCache[img.src]) return hazeCache[img.src];
  try {
    const c = document.createElement("canvas"); c.width = 8; c.height = 8;
    const k = c.getContext("2d"); k.drawImage(img, 0, img.height * 0.3, img.width, img.height * 0.4, 0, 0, 8, 8);
    const d = k.getImageData(0, 0, 8, 8).data; let rr = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
    const n = d.length / 4;
    hazeCache[img.src] = [rr / n, gg / n, bb / n].map(v => Math.round(v * 0.8));
  } catch (e) { hazeCache[img.src] = [20, 18, 24]; }
  return hazeCache[img.src];
}

function hazeOver(dz) { return Math.max(0, Math.min(0.6, (dz - 5) / 40)); }

function quad(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }

function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// One block: lateral u0..u1 (lanes), height h0..h1 (metres), depth z0..z1 (metres ahead).
// look: { front: kit name or colour, side, top, lines } ; the front texture is drawn into the front face.
function box3d(u0, u1, h0, h1, z0, z1, look, dz) {
  const P = (z, u, h) => inProject(z, u, h);
  const f = [P(z0, u0, h0), P(z0, u1, h0), P(z0, u1, h1), P(z0, u0, h1)];
  const b = [P(z1, u0, h0), P(z1, u1, h0), P(z1, u1, h1), P(z1, u0, h1)];
  const k = f[0].k, ink = Math.max(1, 2.4 * k);
  const haze = sceneHaze(), ha = hazeOver(dz);
  const fog = () => { if (ha > 0) { ctx.fillStyle = `rgba(${haze[0]}, ${haze[1]}, ${haze[2]}, ${ha})`; ctx.fill(); } };
  ctx.lineJoin = "round"; ctx.strokeStyle = "#0b0906"; ctx.lineWidth = ink;
  const side = (pts, col, lit) => {
    quad(pts);
    if (look.sidePaint) {
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      const bx = Math.min(...xs), by = Math.min(...ys);
      ctx.save(); ctx.clip(); look.sidePaint(bx, by, Math.max(...xs) - bx, Math.max(...ys) - by); ctx.restore();
      quad(pts);
      const g = ctx.createLinearGradient(pts[0].x, 0, pts[3].x, 0);
      g.addColorStop(0, "rgba(0, 0, 0, 0.35)"); g.addColorStop(1, "rgba(0, 0, 0, 0.62)");
      ctx.fillStyle = g; ctx.fill(); fog(); ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(pts[0].x, 0, pts[3].x, 0);
      g.addColorStop(0, shadeColor(col, lit)); g.addColorStop(1, shadeColor(col, lit * 0.55));
      ctx.fillStyle = g; ctx.fill(); fog(); ctx.stroke();
    }
    if (look.lines) {   // planks or bricks running back along the side
      ctx.save(); quad(pts); ctx.clip();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"; ctx.lineWidth = Math.max(0.6, k);
      for (let t = 1; t < look.lines; t++) {
        const a = { x: pts[0].x + (pts[3].x - pts[0].x) * t / look.lines, y: pts[0].y + (pts[3].y - pts[0].y) * t / look.lines };
        const c = { x: pts[1].x + (pts[2].x - pts[1].x) * t / look.lines, y: pts[1].y + (pts[2].y - pts[1].y) * t / look.lines };
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = ink;
    }
  };
  // sides that face the camera (the left side of anything right of centre, and the other way round)
  if (u0 > 0.02) side([f[0], b[0], b[3], f[3]], look.side, 0.9);
  if (u1 < -0.02) side([f[1], b[1], b[2], f[2]], look.side, 0.9);
  // the top, if it's below eye level
  if (h1 < IN_EYE - 0.05) {
    quad([f[3], f[2], b[2], b[3]]);
    ctx.fillStyle = look.top; ctx.fill(); fog(); ctx.stroke();
  }
  // the front
  const fx = f[0].x, fy = f[3].y, fw = f[1].x - f[0].x, fh = f[0].y - f[3].y;
  quad(f);
  if (typeof look.front === "function") { ctx.save(); ctx.clip(); look.front(fx, fy, fw, fh); ctx.restore(); quad(f); }
  else if (KIT[look.front]) { ctx.save(); ctx.clip(); ctx.fillStyle = look.side; ctx.fillRect(fx, fy, fw, fh); drawKitAt(look.front, fx, fy, fw, fh); ctx.restore(); quad(f); }
  else { ctx.fillStyle = look.front; ctx.fill(); }
  // cel shading: lit from the upper left, darker at the foot
  const sh = ctx.createLinearGradient(0, fy, 0, fy + fh);
  sh.addColorStop(0, "rgba(255, 230, 190, 0.10)"); sh.addColorStop(0.6, "rgba(0, 0, 0, 0)"); sh.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = sh; ctx.fill(); fog(); ctx.stroke();
  // a warm rim of light along the top edge
  ctx.strokeStyle = `rgba(255, 214, 150, ${0.45 * (1 - ha)})`; ctx.lineWidth = Math.max(1, 1.4 * k);
  ctx.beginPath(); ctx.moveTo(f[3].x + ink, f[3].y + ink * 0.6); ctx.lineTo(f[2].x - ink, f[2].y + ink * 0.6); ctx.stroke();
  return { f, b };
}

function contactShadow(u0, u1, z0, z1) {
  const p = [inProject(z0 - 0.15, u0 - 0.05, 0), inProject(z0 - 0.15, u1 + 0.05, 0), inProject(z1 + 0.3, u1 + 0.12, 0), inProject(z1 + 0.3, u0 - 0.12, 0)];
  quad(p); ctx.fillStyle = "rgba(0, 0, 0, 0.42)"; ctx.fill();
}

function drawBarrel3d(uc, rw, h, z0, dz) {
  const P = (z, u, hh) => inProject(z, u, hh);
  const f0 = P(z0, uc - rw, 0), f1 = P(z0, uc + rw, 0), t0 = P(z0, uc - rw, h);
  const fx = f0.x, fw = f1.x - f0.x, fy = t0.y, fh = f0.y - t0.y, k = f0.k;
  const topF = P(z0, uc, h), topB = P(z0 + rw * 1.9, uc, h);
  const haze = sceneHaze(), ha = hazeOver(dz);
  ctx.lineWidth = Math.max(1, 2.4 * k); ctx.strokeStyle = "#0b0906";
  // body
  ctx.beginPath(); ctx.rect(fx, fy, fw, fh);
  ctx.save(); ctx.clip(); drawKitAt("barrel", fx, fy - fh * 0.04, fw, fh * 1.04);
  const g = ctx.createLinearGradient(fx, 0, fx + fw, 0);
  g.addColorStop(0, "rgba(255, 220, 170, 0.18)"); g.addColorStop(0.35, "rgba(0, 0, 0, 0)"); g.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
  if (ha > 0) { ctx.fillStyle = `rgba(${haze[0]}, ${haze[1]}, ${haze[2]}, ${ha})`; ctx.fillRect(fx, fy, fw, fh); }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + fh); ctx.moveTo(fx + fw, fy); ctx.lineTo(fx + fw, fy + fh); ctx.stroke();
  // the lid, seen from above
  const ry = Math.max(1, (topF.y - topB.y) / 2);
  ctx.beginPath(); ctx.ellipse(fx + fw / 2, fy - ry * 0.2, fw / 2, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#3b2a1c"; ctx.fill();
  if (ha > 0) { ctx.fillStyle = `rgba(${haze[0]}, ${haze[1]}, ${haze[2]}, ${ha})`; ctx.fill(); }
  ctx.stroke();
  ctx.beginPath(); ctx.ellipse(fx + fw / 2, fy - ry * 0.2, fw * 0.36, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 210, 150, 0.35)"; ctx.lineWidth = Math.max(0.8, k); ctx.stroke();
}

const WOOD = { side: "#4f3420", top: "#73502d", lines: 4 };

const STEEL = { side: "#2c3038", top: "#454b55" };

function drawInwardObstacle(o, dz) {
  const lanes = o.lane === "all" ? [-1, 1, 0] : [o.lane];   // outer lanes first so the middle one sits in front
  // Far things fade in out of the haze, so nothing pops into view.
  const fade = Math.max(0, Math.min(1, (52 - dz) / 10));
  ctx.save();
  ctx.globalAlpha = fade;
  for (const lane of lanes) {
    const pick = Math.floor(seeded(Math.round(o.d * 10) + lane * 7) * 3);
    const z0 = dz;
    if (o.kind === "low") {
      // waist high: crates, barrels or a cart. Jump it.
      if (pick === 0) {
        contactShadow(lane - 0.46, lane + 0.46, z0, z0 + 0.9);
        box3d(lane - 0.46, lane - 0.01, 0, 0.82, z0, z0 + 0.85, Object.assign({ front: "crate" }, WOOD), dz);
        box3d(lane + 0.01, lane + 0.46, 0, 0.82, z0 + 0.12, z0 + 0.97, Object.assign({ front: "crate" }, WOOD), dz);
        box3d(lane - 0.2, lane + 0.18, 0.82, 1.2, z0 + 0.3, z0 + 0.7, Object.assign({ front: "crate_half" }, WOOD), dz);
      } else if (pick === 1) {
        contactShadow(lane - 0.46, lane + 0.46, z0, z0 + 0.5);
        const order = lane >= 0 ? [-0.3, 0, 0.3] : [0.3, 0, -0.3];
        for (const du of order) drawBarrel3d(lane + du, 0.14, 0.9, z0 + (du === 0 ? 0.1 : 0), dz);
      } else {
        contactShadow(lane - 0.46, lane + 0.46, z0, z0 + 1.5);
        box3d(lane - 0.46, lane + 0.46, 0.12, 0.85, z0, z0 + 1.4, Object.assign({ front: "cart" }, WOOD), dz);
      }
    } else if (o.kind === "high") {
      // a gantry: two posts and a beam at head height. Slide under it.
      contactShadow(lane - 0.48, lane - 0.4, z0, z0 + 0.3); contactShadow(lane + 0.4, lane + 0.48, z0, z0 + 0.3);
      const post = Object.assign({ front: "#3a3f47" }, STEEL);
      box3d(lane - 0.48, lane - 0.41, 0, 2.6, z0, z0 + 0.25, post, dz);
      box3d(lane + 0.41, lane + 0.48, 0, 2.6, z0, z0 + 0.25, post, dz);
      const beam = box3d(lane - 0.5, lane + 0.5, 1.28, 2.45, z0 - 0.05, z0 + 0.35, Object.assign({ front: "#262a31" }, STEEL), dz);
      const f = beam.f, bw = f[1].x - f[0].x, bh = f[0].y - f[3].y, k = f[0].k;
      // the beam carries a real billboard, flipping between the Feelz Machine ads
      const inset = Math.max(2, 5 * k);
      ctx.save();
      ctx.translate(f[0].x + inset, f[3].y + inset);
      ctx.scale((bw - inset * 2) / 340, (bh - inset * 2 - Math.max(2, 6 * k)) / 150);
      drawBillboard(0, 0, 340, 150, Math.round(o.d * 3) + lane + 5);
      ctx.restore();
      const ha = hazeOver(dz), hz = sceneHaze();
      if (ha > 0) { ctx.fillStyle = `rgba(${hz[0]}, ${hz[1]}, ${hz[2]}, ${ha})`; ctx.fillRect(f[0].x, f[3].y, bw, bh); }
      hazardBar(f[0].x + 2, f[0].y - Math.max(2, 6 * k) - 1, bw - 4, Math.max(2, 6 * k));
    } else {
      // a wall across the lane: a real building front with depth. Change lanes.
      contactShadow(lane - 0.48, lane + 0.48, z0, z0 + 2.2);
      // built from the same wall panels as the buildings in the side-on stretches
      const ww = WORLD_WALLS[sectionAt(m(inward.sec.from)).world] || WORLD_WALLS.mc;
      const lit = seeded(Math.round(o.d * 3) + lane) < 0.5 ? "_lit" : "";
      const paint = (x, y, w, h) => {
        const rowH = h / 1.7;
        drawTile("wall_" + ww.wall + "_win" + lit, x, y, w, rowH);
        if (pick === 0) { drawTile("wall_" + ww.wall, x, y + rowH, w, h - rowH); drawTile("shutter", x + w * 0.22, y + rowH + (h - rowH) * 0.25, w * 0.56, (h - rowH) * 0.75); }
        else drawTile("wall_" + ww.wall + "_win", x, y + rowH, w, h - rowH);
        drawTile("cap_metal", x - 2, y, w + 4, Math.max(3, h * 0.05));
        ctx.fillStyle = `rgba(8, 10, 18, ${(1 - ww.shade) * 0.72})`; ctx.fillRect(x, y, w, h);
        const hz = sceneHaze();
        ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = `rgb(${Math.min(255, hz[0] * 2.2)}, ${Math.min(255, hz[1] * 2.2)}, ${Math.min(255, hz[2] * 2.2)})`; ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = "source-over";
      };
      const sidePaint = (x, y, w, h) => { drawTile("wall_" + ww.wall, x, y, w, h); };
      const wall = box3d(lane - 0.48, lane + 0.48, 0, 3.4, z0, z0 + 2.2, { front: paint, sidePaint, side: "#3a3a3e", top: "#1d1e22" }, dz);
      const f = wall.f, k = f[0].k;
      // a warning lamp over the front
      const lx = (f[0].x + f[1].x) / 2, ly = f[3].y + 8 * k;
      ctx.save();
      ctx.fillStyle = `rgba(255, 80, 50, ${0.7 + Math.sin(frameTime * 10) * 0.3})`;
      ctx.shadowColor = "#ff5032"; ctx.shadowBlur = 14 * k;
      ctx.beginPath(); ctx.arc(lx, ly, Math.max(2, 5 * k), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function hazardBar(x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = "#f2b630"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#16161a";
  for (let i = -h; i < w + h; i += h * 2.2) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.lineTo(x + i + h * 2, y); ctx.lineTo(x + i + h, y + h); ctx.fill(); }
  ctx.restore();
}

function drawInwardRunner(p, dz) {
  const B = SPRITES.back;
  const zora = mission.player === "zora";
  let img = zora ? art.back.zora : art.back.koda;
  if (!img.ready) return;
  if (!zora && p.id === 1 && playerOutfit !== "gold" && art.back.koda_mask.ready) {
    backOutfits[playerOutfit] = backOutfits[playerOutfit] || recolorSheet(img, art.back.koda_mask, playerOutfit) || img;
    img = backOutfits[playerOutfit];
  }
  if (p.id === 2) { backTint[zora ? "z" : "k"] = backTint[zora ? "z" : "k"] || tintSheet(img); img = backTint[zora ? "z" : "k"]; }
  if (p.invuln > 0 && Math.floor(frameTime * 14) % 2 === 0) return;
  const q = inProject(Math.max(-1.4, dz), p.laneX, p.iy);
  const ground = inProject(Math.max(-1.4, dz), p.laneX, 0);
  const size = B.metres * IN_PXM * q.k;
  let anim = "run_back", frame = Math.floor(p.animClock * 14) % 10;
  if (p.islide > 0) { anim = "slide_back"; frame = Math.min(5, 2 + Math.floor((0.75 - p.islide) * 8) % 4); }
  else if (p.iy > 0) { anim = p.ivy > 0 ? "jump_back" : "fall_back"; frame = Math.min(3, Math.floor(p.animClock * 8) % 4); }
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 26 * q.k, 6 * q.k, 0, 0, Math.PI * 2); ctx.fill();
  const a = B.animations[anim];
  ctx.drawImage(img, frame * B.cell, a.row * B.cell, B.cell, B.cell, q.x - size / 2, q.y - size * B.footY, size, size);
  if (twoPlayer) {
    ctx.fillStyle = p.id === 1 ? "#f1ca78" : "#7fe3ff";
    ctx.font = "800 14px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(playerName(p), q.x, q.y - size * 0.95);
  }
}

const backOutfits = {}, backTint = {};
