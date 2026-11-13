/*
  FEELZ RUN - DRAWING
  Everything on the canvas: the F.I.L.L. city layers on bright skies, the
  rooftops and streets with their gold edges, the city kit rendered from the
  3D models, Koda and the enforcers from their sprite sheets, the storm.
*/

"use strict";

const sx = x => Math.round(x - cameraX);
const sy = y => Math.round(y - cameraY);
const onScreen = (x, w, margin) => x + (w || 0) > cameraX - (margin || 80) && x < cameraX + W + (margin || 80);

let frameTime = 0;   // seconds, for idle animations

/* ---------- city kit ---------- */

function drawKit(name, x, y, w, h, alpha) {
  const r = KIT[name];
  if (!r || !art.kit.ready) return;
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], sx(x), sy(y), w, h);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

// The same kit pieces, placed straight in screen pixels (for the runs into the picture).
function drawKitAt(name, x, y, w, h) {
  const r = KIT[name];
  if (!r || !art.kit.ready) return;
  ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], x, y, w, h);
}

// One building tile, or part of one (sw, sh: how much of the tile, 0 to 1).
function drawTile(name, x, y, w, h, sw, sh) {
  const r = TILES[name];
  if (!r || !art.tiles.ready) return;
  const fw = sw === undefined ? 1 : sw, fh = sh === undefined ? 1 : sh;
  ctx.drawImage(art.tiles, r[0], r[1], Math.max(1, r[2] * fw), Math.max(1, r[3] * fh), x, y, w, h);
}

// A building front: 2 m wall panels, windows on alternate floors, a metal cap,
// then shaded down into the dusk so it reads as a solid block.
function drawBuilding(s, h, worldId) {
  const ww = WORLD_WALLS[worldId] || WORLD_WALLS.mc;
  const X = sx(s.x), Y = sy(s.y), T = m(2);
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, s.w, h); ctx.clip();
  const cols = Math.ceil(s.w / T);
  const rows = Math.ceil(h / T);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = seeded(s.seed + c * 7 + r * 13);
      let name = "wall_" + ww.wall;
      if (r % 2 === 0 && k > 0.25) name += k > 0.78 ? "_win_lit" : "_win";
      const cw = Math.min(T, s.w - c * T);
      drawTile(name, X + c * T, Y + r * T + m(0.3), cw, T, cw / T, 1);
    }
  }
  // dusk shade, darker lower down
  const g = ctx.createLinearGradient(0, Y, 0, Y + Math.min(h, m(9)));
  g.addColorStop(0, `rgba(8, 10, 18, ${ww.shade * 0.55})`);
  g.addColorStop(1, `rgba(8, 10, 18, ${Math.min(0.92, ww.shade + 0.35)})`);
  ctx.fillStyle = g; ctx.fillRect(X, Y, s.w, h);
  // the ends of the block in shadow, so it has depth
  const e = Math.min(m(0.6), s.w / 4);
  const left = ctx.createLinearGradient(X, 0, X + e, 0);
  left.addColorStop(0, "rgba(0, 0, 0, 0.55)"); left.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = left; ctx.fillRect(X, Y, e, h);
  const right = ctx.createLinearGradient(X + s.w - e, 0, X + s.w, 0);
  right.addColorStop(0, "rgba(0, 0, 0, 0)"); right.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = right; ctx.fillRect(X + s.w - e, Y, e, h);
  // the metal cap along the roof
  for (let c = 0; c < cols; c++) {
    const cw = Math.min(T, s.w - c * T);
    drawTile("cap_metal", X + c * T, Y, cw, m(0.4), cw / T, 1);
  }
  ctx.restore();
}

/* ---------- billboards: a Feelz Machine ad on turning slats, like a real tri-vision board ---------- */

const BILLBOARD_ADS = [
  { label: "", big: "FEELZ MACHINE", small: "MUSIC FROM INDEPENDENT ARTISTS", logo: true },
  { label: "ARTISTS", big: "0% COMMISSION", small: "UPLOAD YOUR MUSIC AT FEELZMACHINE.COM" },
  { label: "LISTENERS", big: "STREAM F.I.L.L.", small: "THE FULL ALBUM AT FEELZMACHINE.COM" }
];
let billboardCache = {};
// Panels are painted once; repaint them when the game fonts finish loading.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { billboardCache = {}; });

function billboardPanel(i, w, h) {
  const key = i + ":" + Math.round(w) + "x" + Math.round(h) + ":" + (art.logo.ready ? 1 : 0);
  if (billboardCache[key]) return billboardCache[key];
  const k = 2, c = document.createElement("canvas");
  c.width = Math.max(4, Math.round(w * k)); c.height = Math.max(4, Math.round(h * k));
  const g = c.getContext("2d"), W2 = c.width, H2 = c.height, ad = BILLBOARD_ADS[i];
  const bg = g.createLinearGradient(0, 0, 0, H2);
  bg.addColorStop(0, i === 1 ? "#1d1606" : "#15171b"); bg.addColorStop(1, "#08090b");
  g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  g.strokeStyle = "#c79a4d"; g.lineWidth = 3; g.strokeRect(4, 4, W2 - 8, H2 - 8);
  const left = H2 * 0.12;
  let top = 0;
  if (ad.logo && art.logo.ready) {
    // logo on top, the name underneath
    const sz = H2 * 0.42;
    g.drawImage(art.logo, (W2 - sz) / 2, H2 * 0.1, sz, sz);
    top = H2 * 0.25;
  }
  const room = W2 - left * 2;
  const fit = (text, weight, size, family) => {
    let fs = size;
    g.font = `${weight} ${fs}px ${family}`;
    while (fs > 6 && g.measureText(text).width > room) { fs -= 1; g.font = `${weight} ${fs}px ${family}`; }
    return fs;
  };
  g.textBaseline = "middle"; g.textAlign = "center";
  const x = W2 / 2;
  const labelSize = ad.label ? fit(ad.label, 800, H2 * 0.16, "'Barlow Condensed', Impact, sans-serif") : 0;
  const bigSize = fit(ad.big, 900, H2 * (ad.logo ? 0.26 : ad.label ? 0.36 : 0.42), "'Barlow Condensed', Impact, sans-serif");
  const smallSize = fit(ad.small, 700, H2 * 0.13, "'DM Sans', Arial, sans-serif");
  let y = top + (H2 - top) / 2 - (labelSize + bigSize + smallSize) * 0.5;
  if (ad.label) {
    g.font = `800 ${labelSize}px 'Barlow Condensed', Impact, sans-serif`; g.fillStyle = "#f1ca78";
    g.fillText(ad.label, x, y + labelSize / 2); y += labelSize;
  }
  g.font = `900 ${bigSize}px 'Barlow Condensed', Impact, sans-serif`;
  const gold = g.createLinearGradient(0, y, 0, y + bigSize);
  gold.addColorStop(0, "#fff3c8"); gold.addColorStop(0.5, "#f5b942"); gold.addColorStop(1, "#b8741a");
  g.fillStyle = i === 0 ? "#ffffff" : gold;
  g.fillText(ad.big, x, y + bigSize / 2); y += bigSize;
  g.font = `700 ${smallSize}px 'DM Sans', Arial, sans-serif`; g.fillStyle = "#d8d4cc";
  g.fillText(ad.small, x, y + smallSize / 2 + 2);
  billboardCache[key] = c;
  return c;
}

function drawBillboard(X, Y, w, h, seed) {
  const HOLD = 3.6, FLIP = 0.55, STAGGER = 0.045, SLATS = Math.max(6, Math.round(w / 34));
  const cycle = HOLD + FLIP + STAGGER * SLATS;
  const t = frameTime + (seed % 7);
  const idx = Math.floor(t / cycle) % BILLBOARD_ADS.length, next = (idx + 1) % BILLBOARD_ADS.length;
  const local = t % cycle;
  const A = billboardPanel(idx, w, h), B = billboardPanel(next, w, h);
  const sw = w / SLATS, k = A.width / w;
  ctx.fillStyle = "#050506"; ctx.fillRect(X, Y, w, h);
  for (let i = 0; i < SLATS; i++) {
    const start = HOLD + i * STAGGER;
    const p = Math.max(0, Math.min(1, (local - start) / FLIP));
    const ang = p * Math.PI, c = Math.cos(ang), src = c >= 0 ? A : B, scale = Math.abs(c);
    const cx = X + i * sw + sw / 2, dw = Math.max(0.5, sw * scale);
    ctx.drawImage(src, i * sw * k, 0, sw * k, src.height, cx - dw / 2, Y, dw, h);
    if (p > 0 && p < 1) { ctx.fillStyle = `rgba(0, 0, 0, ${0.55 * (1 - scale)})`; ctx.fillRect(cx - dw / 2, Y, dw, h); }
  }
  // a little glow on the face, as if lit from below
  const lit = ctx.createLinearGradient(0, Y + h, 0, Y);
  lit.addColorStop(0, "rgba(241, 202, 120, 0.16)"); lit.addColorStop(1, "rgba(241, 202, 120, 0)");
  ctx.fillStyle = lit; ctx.fillRect(X, Y, w, h);
}

/* ---------- the Meshy kit ---------- */

// The industrial blocks are modelled in dark concrete; lift them so they read against the dusk.
const MESHY_LIFT = { mc: "brightness(1.35) saturate(1.1)", lc: "brightness(1.08)", de: "brightness(1.12) saturate(1.05)" };
function meshyReady() { return !!(art.meshyKit && art.meshyKit.ready); }
// A piece stretched into a box, in screen pixels.
function drawMeshy(name, X, Y, w, h) {
  const r = MESHY_KIT[name];
  if (!r || !meshyReady()) return false;
  ctx.drawImage(art.meshyKit, r[0], r[1], r[2], r[3], X, Y, w, h);
  return true;
}
// A piece at its own shape, standing on a point (screen pixels), h tall.
function drawMeshyStand(name, cx, bottom, h) {
  const r = MESHY_KIT[name];
  if (!r || !meshyReady()) return false;
  const w = h * r[2] / r[3];
  ctx.drawImage(art.meshyKit, r[0], r[1], r[2], r[3], cx - w / 2, bottom - h, w, h);
  return true;
}
// A rooftop: one or more modelled building fronts side by side, their flat roofs on the line you run on.
// Taller than the model: the upper floors, then its middle storeys repeated, then its ground floor on the street.
function drawMeshyBuildings(s, world) {
  const list = MESHY_BUILDINGS[world];
  if (!list || !meshyReady()) return false;
  const img = art.meshyKit;
  const n = Math.max(1, Math.round(s.w / m(8))), pw = s.w / n;
  const lift = MESHY_LIFT[world];
  if (lift) { ctx.save(); ctx.filter = lift; }
  const top = sy(s.y), bottom = sy(Math.min(s.y + s.h, 0) > s.y + m(1) ? Math.min(s.y + s.h, 0) : s.y + s.h);
  const bodyH = bottom - top;
  if (bodyH <= 0) return true;
  for (let i = 0; i < n; i++) {
    const r = MESHY_KIT[list[Math.floor(seeded(s.seed * 3.1 + i * 7.7) * list.length) % list.length]];
    const [ax, ay, aw, ah, roof] = r;
    const X = sx(s.x) + i * pw, k = pw / aw;
    if (roof > 0) ctx.drawImage(img, ax, ay, aw, roof, X, top - roof * k, pw, roof * k);
    const bodySrc = ah - roof, bodyNat = bodySrc * k;
    if (bodyH <= bodyNat * 1.08) {
      if (bodyH / bodyNat >= 0.7) ctx.drawImage(img, ax, ay + roof, aw, bodySrc, X, top, pw, bodyH);
      else ctx.drawImage(img, ax, ay + roof, aw, bodyH / k, X, top, pw, bodyH);
    } else {
      const upSrc = bodySrc * 0.42, baseSrc = bodySrc * 0.3, bandSrc = bodySrc * 0.28;
      ctx.drawImage(img, ax, ay + roof, aw, upSrc, X, top, pw, upSrc * k);
      const baseH = baseSrc * k;
      if (bottom - baseH < H + 10) ctx.drawImage(img, ax, ay + ah - baseSrc, aw, baseSrc, X, bottom - baseH, pw, baseH);
      const bandH = bandSrc * k, bandY = ay + roof + upSrc;
      for (let y = top + upSrc * k; y < bottom - baseH && y < H + 10; y += bandH) {
        const hh = Math.min(bandH, bottom - baseH - y);
        ctx.drawImage(img, ax, bandY, aw, hh / k, X, y, pw, hh);
      }
    }
  }
  if (lift) ctx.restore();
  return true;
}

/* ---------- each world's own things: obstacles and street dressing (assets/worlds/props-2d.webp) ---------- */

// An obstacle drawn as the thing that belongs in this world (a marble pedestal uptown, a sandstone block in the desert).
function drawWorldProp(kind, s) {
  const wld = sectionAt(s.x + s.w / 2).world;
  const r = PROP2D[wld + "_" + kind];
  if (!r || !art.props2d || !art.props2d.ready) return false;
  ctx.drawImage(art.props2d, r[0], r[1], r[2], r[3], sx(s.x) - 3, sy(s.y) - 4, s.w + 6, s.h + 5);
  return true;
}
// Street dressing: lamps, bins, plants and the rest, set along the street every few metres behind the action,
// so a stretch of road never looks empty. Never where something stands in the way or at a checkpoint.
function drawSetDressing() {
  if (!art.props2d || !art.props2d.ready || !level.dressing) return;
  for (const d of level.dressing) {
    if (!onScreen(d.x - m(2), m(4), 60)) continue;
    const r = PROP2D[d.name];
    if (!r) continue;
    const h = m(d.h), w = h * r[2] / r[3];
    ctx.save();
    ctx.filter = "brightness(0.82) saturate(0.92)";
    ctx.drawImage(art.props2d, r[0], r[1], r[2], r[3], sx(d.x) - w / 2, sy(d.y) - h + 3, w, h);
    ctx.restore();
  }
}

/* ---------- the desert: sand underfoot, sandstone rock instead of buildings ---------- */

function drawSand(x, y, w, h) {
  const X = sx(x), Y = sy(y);
  const g = ctx.createLinearGradient(0, Y, 0, Y + Math.min(h, m(3.2)));
  g.addColorStop(0, "#e2b06a"); g.addColorStop(0.18, "#b98149"); g.addColorStop(0.55, "#6b4426"); g.addColorStop(1, "#1f140c");
  ctx.fillStyle = g; ctx.fillRect(X, Y, w + 1, h);
  // Wind ripples, fixed to the world so they slide past with the ground.
  ctx.strokeStyle = "rgba(255, 228, 176, 0.32)"; ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const yy = Y + m(0.22) + i * m(0.3);
    ctx.beginPath();
    for (let wx = x; wx <= x + w; wx += 8) {
      const py = yy + Math.sin(wx * 0.045 + i * 1.7) * 2.6 + Math.sin(wx * 0.011 + i) * 2;
      if (wx === x) ctx.moveTo(sx(wx), py); else ctx.lineTo(sx(wx), py);
    }
    ctx.stroke();
  }
}

// Floating stone: in the Veil and over the desert the ground you run on is a broken slab hanging in the air,
// like the ones painted behind it, not a building. A dressed top, a jagged underside, pieces drifting below.
const STONE = {
  ve: { top: "#c4b59a", body: "#6a5d4c", deep: "#1f1a15", crack: "rgba(255, 210, 120, 0.55)" },
  de: { top: "#d8ae6c", body: "#8e6234", deep: "#2c1c0e", crack: "rgba(255, 230, 160, 0.35)" },
  rc: { top: "#c9b896", body: "#6f6450", deep: "#221d16", crack: "rgba(120, 200, 120, 0.35)" }
};
function drawFloatStone(x, y, w, depth, seed, worldId, alpha) {
  const P = STONE[worldId] || STONE.ve;
  const X = sx(x), Y = sy(y), D = Math.min(depth, m(3.2));
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  // the underside: a jagged wedge narrowing downwards
  ctx.beginPath();
  ctx.moveTo(X, Y);
  const n = Math.max(4, Math.round(w / 22));
  for (let i = 0; i <= n; i++) {
    const t = i / n, edge = Math.sin(t * Math.PI);
    const jag = (seeded(seed + i * 3.1) - 0.5) * 14;
    ctx.lineTo(X + w * t, Y + m(0.25) + D * (0.25 + 0.75 * edge) * (0.75 + 0.25 * seeded(seed + i)) + jag * edge);
  }
  ctx.lineTo(X + w, Y);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, Y, 0, Y + D);
  g.addColorStop(0, P.body); g.addColorStop(1, P.deep);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.5; ctx.stroke();
  // strata and cracks in the rock
  ctx.save(); ctx.clip();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)"; ctx.lineWidth = 1.5;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(X, Y + m(0.25) + k * D / 5); ctx.lineTo(X + w, Y + m(0.25) + k * D / 5 + (seeded(seed + k) - 0.5) * 10); ctx.stroke(); }
  ctx.strokeStyle = P.crack; ctx.lineWidth = 1.5;
  for (let k = 0; k < Math.max(1, Math.round(w / 90)); k++) {
    const cx = X + w * seeded(seed + k * 7.7);
    ctx.beginPath(); ctx.moveTo(cx, Y + 4);
    ctx.lineTo(cx + 6, Y + D * 0.25); ctx.lineTo(cx - 4, Y + D * 0.45); ctx.lineTo(cx + 3, Y + D * 0.6); ctx.stroke();
  }
  ctx.restore();
  // the dressed top: worn flagstones
  ctx.fillStyle = P.top; ctx.fillRect(X, Y - 2, w, m(0.25));
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"; ctx.lineWidth = 1;
  for (let px = X + 18 + seeded(seed) * 20; px < X + w - 6; px += 26 + seeded(seed + px) * 20) { ctx.beginPath(); ctx.moveTo(px, Y - 2); ctx.lineTo(px - 3, Y + m(0.25) - 2); ctx.stroke(); }
  ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.5; ctx.strokeRect(X, Y - 2, w, m(0.25));
  // chipped corners
  ctx.fillStyle = P.deep;
  ctx.beginPath(); ctx.moveTo(X - 1, Y + m(0.25)); ctx.lineTo(X + 7, Y + m(0.25)); ctx.lineTo(X - 1, Y + m(0.25) + 9); ctx.fill();
  // take on the light of the painting behind
  const tint = paintingTint(x + (w / 2) / PX * PX);
  if (tint) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${tint[0]}, ${tint[1]}, ${tint[2]})`;
    ctx.beginPath(); ctx.rect(X - 2, Y - 4, w + 4, D + m(0.4)); ctx.fill();
    ctx.restore();
  }
  // pieces breaking away and drifting under it
  for (let k = 0; k < Math.max(2, Math.round(w / 70)); k++) {
    const bx = X + w * (0.15 + 0.7 * seeded(seed + k * 5.3)), by = Y + D + 16 + 20 * seeded(seed + k) + Math.sin(frameTime * 1.3 + k + seed) * 6;
    const r = 4 + 7 * seeded(seed + k * 2.1);
    ctx.fillStyle = P.body; ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx - r, by); ctx.lineTo(bx - r * 0.3, by - r * 0.8); ctx.lineTo(bx + r, by - r * 0.2); ctx.lineTo(bx + r * 0.2, by + r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
const FLOATING_WORLDS = { ve: 1 };

// The average colour of a place's painting, so what you stand on takes on the light of what's behind it.
const locAvg = {};
function paintingTint(x) {
  const sec = sectionAt(x), name = sec && sec.backdrop, img = name ? art.loc[name] : null;
  if (!img || !img.ready) return null;
  if (locAvg[name]) return locAvg[name];
  try {
    const c = document.createElement("canvas"); c.width = 8; c.height = 8;
    const k = c.getContext("2d"); k.drawImage(img, 0, img.height * 0.4, img.width, img.height * 0.6, 0, 0, 8, 8);
    const d = k.getImageData(0, 0, 8, 8).data; let rr = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
    const n = d.length / 4, mx = Math.max(rr, gg, bb) / n || 1;
    // normalised so it tints without darkening
    locAvg[name] = [rr / n, gg / n, bb / n].map(v => Math.round(Math.min(255, 255 * v / mx)));
  } catch (e) { locAvg[name] = [255, 255, 255]; }
  return locAvg[name];
}

function drawMesa(s, h) {
  const X = sx(s.x), Y = sy(s.y);
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, s.w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, Y, 0, Y + Math.min(h, m(10)));
  g.addColorStop(0, "#c48b52"); g.addColorStop(0.3, "#8a5a33"); g.addColorStop(1, "#24170e");
  ctx.fillStyle = g; ctx.fillRect(X, Y, s.w, h);
  // Strata: soft bands of lighter and darker stone, slightly wavy.
  for (let i = 0, yy = m(0.5); yy < h; i++, yy += m(0.55 + seeded(s.seed + i) * 0.5)) {
    ctx.fillStyle = i % 2 ? "rgba(255, 214, 160, 0.10)" : "rgba(40, 20, 8, 0.22)";
    ctx.beginPath();
    ctx.moveTo(X, Y + yy);
    for (let c = 0; c <= s.w; c += 24) ctx.lineTo(X + c, Y + yy + Math.sin((s.x + c) * 0.02 + i) * 3);
    ctx.lineTo(X + s.w, Y + yy + m(0.22)); ctx.lineTo(X, Y + yy + m(0.22)); ctx.closePath(); ctx.fill();
  }
  // Cracks.
  ctx.strokeStyle = "rgba(20, 10, 4, 0.45)"; ctx.lineWidth = 1.5;
  for (let c = m(0.8); c < s.w - m(0.4); c += m(1.6 + seeded(s.seed + c) * 1.8)) {
    let cx = X + c, cy = Y + m(0.3);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (let k = 0; k < 5; k++) { cx += (seeded(s.seed + c + k) - 0.5) * 14; cy += m(0.35 + seeded(c * 3 + k) * 0.4); ctx.lineTo(cx, cy); }
    ctx.stroke();
  }
  // The ends of the rock in shadow.
  const e = Math.min(m(0.6), s.w / 4);
  const left = ctx.createLinearGradient(X, 0, X + e, 0);
  left.addColorStop(0, "rgba(0, 0, 0, 0.5)"); left.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = left; ctx.fillRect(X, Y, e, h);
  const right = ctx.createLinearGradient(X + s.w - e, 0, X + s.w, 0);
  right.addColorStop(0, "rgba(0, 0, 0, 0)"); right.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = right; ctx.fillRect(X + s.w - e, Y, e, h);
  // Sand drifted along the top.
  ctx.fillStyle = "#e0ae68"; ctx.fillRect(X, Y, s.w, m(0.12));
  ctx.restore();
}

/* ---------- the sky and the city behind ---------- */

function drawTiled(img, parallax, y, height, alpha) {
  if (!img.ready || alpha <= 0) return;
  const scale = height / img.height;
  const tileW = img.width * scale;
  const shift = ((cameraX * parallax) % (tileW * 2) + tileW * 2) % (tileW * 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let k = -1, x = -shift; x < W; k++, x += tileW) {
    if (((k % 2) + 2) % 2 === 1) {
      ctx.save(); ctx.translate(x + tileW, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, tileW + 1, height); ctx.restore();
    } else ctx.drawImage(img, x, y, tileW + 1, height);
  }
  ctx.restore();
}

const CLOUD_SLOTS = [
  { piece: 0, x: 80, y: 40, s: 0.9 }, { piece: 3, x: 420, y: 90, s: 0.7 },
  { piece: 5, x: 760, y: 30, s: 1.0 }, { piece: 6, x: 1100, y: 120, s: 0.6 },
  { piece: 2, x: 1420, y: 60, s: 0.8 }
];

// Some cloud pieces are cut off flat at the edge of their cell: fade every piece out towards
// its edges so none of them ever shows a straight side.
function softClouds(img) {
  if (img._soft) return img._soft;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const k = c.getContext("2d");
  k.drawImage(img, 0, 0);
  const cw = img.width / 4, ch = img.height / 2;
  k.globalCompositeOperation = "destination-in";
  const mask = document.createElement("canvas"); mask.width = img.width; mask.height = img.height;
  const mk = mask.getContext("2d");
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    mk.save(); mk.translate(x + cw / 2, y + ch / 2); mk.scale(cw / 2, ch / 2);
    const g = mk.createRadialGradient(0, 0, 0.45, 0, 0, 1);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    mk.fillStyle = g; mk.fillRect(-1, -1, 2, 2);
    mk.restore();
  }
  k.drawImage(mask, 0, 0);
  img._soft = c;
  return c;
}

function drawClouds(img, alpha, speed) {
  if (!img.ready) return;
  img = softClouds(img);
  const cw = img.width / 4, ch = img.height / 2, span = 1700;
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  for (const c of CLOUD_SLOTS) {
    const px = (c.piece % 4) * cw, py = Math.floor(c.piece / 4) * ch;
    let x = c.x - cameraX * 0.05 - cloudDrift * speed * c.s;
    x = ((x % span) + span) % span - 200;
    ctx.drawImage(img, px, py, cw, ch, x, c.y, cw * c.s, ch * c.s);
  }
  ctx.restore();
}

function mixColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (v, s) => (v >> s) & 255;
  const r = Math.round(ch(pa, 16) + (ch(pb, 16) - ch(pa, 16)) * k);
  const g = Math.round(ch(pa, 8) + (ch(pb, 8) - ch(pa, 8)) * k);
  const bl = Math.round(ch(pa, 0) + (ch(pb, 0) - ch(pa, 0)) * k);
  return `rgb(${r},${g},${bl})`;
}

function drawWorld(id, alpha, stormK) {
  const wd = WORLDS[id], layers = art.worlds[id];
  if (!wd || alpha <= 0) return;
  const lift = Math.max(-60, Math.min(80, (cameraY + 410) * 0.08));   // the city sinks a little as you climb
  ctx.save();
  ctx.globalAlpha = alpha;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mixColor(wd.sky[0], wd.storm[0], stormK));
  sky.addColorStop(0.6, mixColor(wd.sky[1], wd.storm[1], stormK));
  sky.addColorStop(1, mixColor(wd.sky[2], wd.storm[2], stormK));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawClouds(layers.clouds, alpha, 7);
  drawTiled(layers.far, 0.12, 4 - lift, 536, alpha * (1 - stormK * 0.35));
  drawTiled(layers.near, 0.35, 250 - lift * 1.6, 230, alpha * (1 - stormK * 0.25));
}

// A location painting behind a stretch of the mission: a wide, slow pan as you move through.
function drawBackdrop(sec, alpha, stormK) {
  const img = art.loc[sec.backdrop];
  if (!img || !img.ready || alpha <= 0) return false;
  const lift = Math.max(-60, Math.min(80, (cameraY + 410) * 0.08));
  const h = Math.max(H * 1.12, (W * 1.04) * img.height / img.width), w = img.width * h / img.height;
  const span = Math.max(1, w - W);
  const len = Math.max(m(20), (sec.toPx || level.width) - sec.fromPx);
  const k = Math.max(0, Math.min(1, (cameraX - sec.fromPx + W * 0.5) / len));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -span * k, -h * 0.06 - lift * 0.4, w, h);
  // keep it behind the action: a touch darker and cooler, darker still in a storm
  ctx.fillStyle = `rgba(8, 10, 22, ${0.28 + stormK * 0.35})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  return true;
}

function drawPlace(sec, alpha, stormK) {
  if (sec.backdrop && art.loc[sec.backdrop] && art.loc[sec.backdrop].ready) {
    const wd = WORLDS[sec.world], layers = art.worlds[sec.world];
    drawBackdrop(sec, alpha, stormK);
    if (layers) drawClouds(layers.clouds, alpha * 0.8, 7);
    if (layers) drawTiled(layers.near, 0.35, 250 - Math.max(-60, Math.min(80, (cameraY + 410) * 0.08)) * 1.6, 230, alpha * 0.55 * (1 - stormK * 0.25));
    void wd;
  } else drawWorld(sec.world, alpha, stormK);
}

function drawBackground() {
  const focus = cameraX + W / 2;
  const secs = level.sections;
  let idx = 0;
  secs.forEach((s, i) => { if (focus >= s.fromPx) idx = i; s.toPx = secs[i + 1] ? secs[i + 1].fromPx : level.width; });
  const cur = secs[idx];
  const stormK = Math.min(1, storm.strength);
  drawPlace(cur, 1, stormK);
  // Cross-fade from the last place over the first 10 metres of a new one.
  const prev = secs[idx - 1];
  if (prev && (prev.world !== cur.world || prev.backdrop !== cur.backdrop)) {
    const into = (focus - cur.fromPx) / m(10);
    if (into < 1) drawPlace(prev, 1 - into, stormK);
  }
  if (lightningBolt) drawBolt(lightningBolt, 0.6 * stormK + 0.2, true);
  // Darken the lower band so the platforms and pickups always read clearly.
  const shade = ctx.createLinearGradient(0, 260, 0, H);
  shade.addColorStop(0, "#0b0d0c00");
  shade.addColorStop(1, "#0b0d0c99");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 260, W, H - 260);
}

/* ---------- the level ---------- */

function seeded(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

// A glossy neon gold lip along the top of every surface you can stand on.
function goldEdge(x, y, w) {
  const X = sx(x), Y = sy(y);
  const glow = ctx.createLinearGradient(0, Y - 12, 0, Y + 8);
  glow.addColorStop(0, "rgba(242, 158, 31, 0)");
  glow.addColorStop(0.6, "rgba(242, 158, 31, 0.28)");
  glow.addColorStop(1, "rgba(242, 158, 31, 0)");
  ctx.fillStyle = glow; ctx.fillRect(X, Y - 12, w, 20);
  const lip = ctx.createLinearGradient(0, Y, 0, Y + 4);
  lip.addColorStop(0, "#fff3c8"); lip.addColorStop(0.45, "#f5b942"); lip.addColorStop(1, "#9c5a0c");
  ctx.fillStyle = lip; ctx.fillRect(X, Y, w, 4);
}

// Wet, glossy top of a slab: a lacquer band, a soft reflection and light streaks that slide with the camera.
function glossTop(x, y, w, h) {
  const X = sx(x), Y = sy(y), depth = Math.min(h, 46);
  const band = ctx.createLinearGradient(0, Y, 0, Y + depth);
  band.addColorStop(0, "#3a4446"); band.addColorStop(0.18, "#1b2224"); band.addColorStop(1, "rgba(17, 22, 21, 0)");
  ctx.fillStyle = band; ctx.fillRect(X, Y, w, depth);
  const sheen = ctx.createLinearGradient(0, Y + 4, 0, Y + 22);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.16)"); sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen; ctx.fillRect(X, Y + 4, w, 18);
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y + 4, w, depth - 4); ctx.clip();
  const step = 320, off = (cameraX * 0.45) % step;
  for (let gx = Math.floor((X - 120) / step) * step - off; gx < X + w + 120; gx += step) {
    const streak = ctx.createLinearGradient(gx, 0, gx + 90, 0);
    streak.addColorStop(0, "rgba(255, 236, 200, 0)"); streak.addColorStop(0.5, "rgba(255, 236, 200, 0.1)"); streak.addColorStop(1, "rgba(255, 236, 200, 0)");
    ctx.fillStyle = streak;
    ctx.beginPath(); ctx.moveTo(gx + 30, Y + 4); ctx.lineTo(gx + 90, Y + 4); ctx.lineTo(gx + 60, Y + depth); ctx.lineTo(gx, Y + depth); ctx.fill();
  }
  ctx.restore();
}

function drawSolid(s) {
  const viewBottom = cameraY + H + 4;
  switch (s.kind) {
    case "ground": {
      const h = Math.min(s.h, viewBottom - s.y);
      if (h <= 0) return;
      // The street: a stone kerb, then dark ground below it.
      ctx.fillStyle = "#0e1211";
      ctx.fillRect(sx(s.x), sy(s.y), s.w, h);
      {
        const T = m(2), X0 = Math.max(s.x, cameraX - T) - ((Math.max(s.x, cameraX - T) - s.x) % T);
        ctx.save(); ctx.beginPath(); ctx.rect(sx(s.x), sy(s.y), s.w, h); ctx.clip();
        const g = ctx.createLinearGradient(0, sy(s.y), 0, sy(s.y) + m(1.6));
        g.addColorStop(0, "rgba(8, 10, 16, 0.35)"); g.addColorStop(0.6, "rgba(8, 10, 16, 0.8)"); g.addColorStop(1, "rgba(8, 10, 16, 1)");
        for (let x = X0; x < Math.min(s.x + s.w, cameraX + W + T); x += T) {
          // In the desert the street gives way to sand.
          if (sectionAt(x + T / 2).world === "de") { drawSand(x, s.y, T, h); continue; }
          drawTile("street_stone", sx(x), sy(s.y), T, m(1));
          ctx.fillStyle = g; ctx.fillRect(sx(x), sy(s.y), T, m(1.6));
        }
        ctx.restore();
      }
      glossTop(s.x, s.y, s.w, h);
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "roof": {
      { const fw = sectionAt(s.x + s.w / 2).world; if (FLOATING_WORLDS[fw]) { drawFloatStone(s.x, s.y, s.w, Math.min(m(3), s.w * 0.45), s.seed, fw); return; } }
      const h = Math.min(s.h, viewBottom - s.y);
      if (h <= 0) return;
      // A building: a modelled front where the world has them, else wall panels, windows and a metal cap.
      const roofWorld = sectionAt(s.x + s.w / 2).world;
      // the desert mixes ruins in with its rock
      if ((roofWorld !== "de" || seeded(s.seed * 1.7) < 0.55) && drawMeshyBuildings(s, roofWorld)) { goldEdge(s.x, s.y, s.w); return; }
      ctx.fillStyle = "#0f1214";
      ctx.fillRect(sx(s.x), sy(s.y), s.w, h);
      if (roofWorld === "de") drawMesa(s, h); else drawBuilding(s, h, roofWorld);
      glossTop(s.x, s.y, s.w, Math.min(h, 30));
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "container": {
      // A shipping container: corrugated steel, end doors, the yard's grime.
      const pal = ["#7d3524", "#2c5659", "#8c6d29", "#43506a", "#5f2a33", "#3f5a35"];
      const col = pal[(s.seed + s.tier * 3) % pal.length];
      const X = sx(s.x), Y = sy(s.y), w = s.w, h = s.h;
      if (meshyReady()) {
        // the modelled container, its paint shifted per box so the stacks aren't all one colour
        const hue = [0, 170, 40, 210, 320, 95][(s.seed + s.tier * 3) % 6];
        ctx.save(); if (hue) ctx.filter = `hue-rotate(${hue}deg)`;
        drawMeshy("p_container", X - 2, Y - 2, w + 4, h + 4);
        ctx.restore();
        goldEdge(s.x, s.y, s.w);
        return;
      }
      ctx.save();
      ctx.fillStyle = col; ctx.fillRect(X, Y, w, h);
      ctx.beginPath(); ctx.rect(X, Y, w, h); ctx.clip();
      const rib = m(0.24);
      for (let x = X + rib / 2; x < X + w; x += rib) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.07)"; ctx.fillRect(x, Y, rib * 0.35, h);
        ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; ctx.fillRect(x + rib * 0.45, Y, rib * 0.25, h);
      }
      // doors at one end, with their locking bars
      const dx = (s.seed % 2) ? X + w - m(1.2) : X + m(0.1);
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; ctx.fillRect(dx, Y + m(0.15), m(1.1), h - m(0.3));
      ctx.strokeStyle = "rgba(20, 20, 20, 0.7)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const bx = dx + m(0.18) + i * m(0.36); ctx.beginPath(); ctx.moveTo(bx, Y + m(0.2)); ctx.lineTo(bx, Y + h - m(0.2)); ctx.stroke(); }
      // dirt and dusk
      const g = ctx.createLinearGradient(0, Y, 0, Y + h);
      g.addColorStop(0, "rgba(255, 220, 160, 0.10)"); g.addColorStop(1, "rgba(10, 8, 14, 0.55)");
      ctx.fillStyle = g; ctx.fillRect(X, Y, w, h);
      const cw = WORLD_WALLS[sectionAt(s.x + s.w / 2).world] || WORLD_WALLS.mc;
      ctx.fillStyle = `rgba(8, 10, 18, ${(1 - cw.shade) * 0.6})`; ctx.fillRect(X, Y, w, h);
      ctx.restore();
      ctx.fillStyle = "#16181b"; ctx.fillRect(X, Y, w, m(0.12)); ctx.fillRect(X, Y + h - m(0.12), w, m(0.12));
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.5; ctx.strokeRect(X, Y, w, h);
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "carriage": {
      // A train carriage: livery, a row of lit windows, a rounded roof, bogies underneath.
      const X = sx(s.x), Y = sy(s.y), w = s.w, h = s.h;
      if (drawMeshy("p_carriage", X - 4, Y - 3, w + 8, h * 1.22)) { goldEdge(s.x, s.y, s.w); return; }
      ctx.save();
      ctx.fillStyle = "#1a1c20";
      for (const bx of [X + m(1.4), X + w - m(1.4)]) {
        for (const o of [-m(0.45), m(0.45)]) { ctx.beginPath(); ctx.arc(bx + o, Y + h + m(0.2), m(0.24), 0, Math.PI * 2); ctx.fill(); }
        ctx.fillRect(bx - m(0.8), Y + h - 2, m(1.6), m(0.18));
      }
      ctx.beginPath(); ctx.roundRect(X, Y, w, h, [m(0.5), m(0.5), 4, 4]);
      const g = ctx.createLinearGradient(0, Y, 0, Y + h);
      g.addColorStop(0, "#56636b"); g.addColorStop(0.5, "#37424a"); g.addColorStop(1, "#1d2328");
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "#b8862e"; ctx.fillRect(X, Y + h * 0.66, w, m(0.14));
      const wy = Y + h * 0.24, wh = h * 0.3;
      for (let x = X + m(0.6); x < X + w - m(1); x += m(1.25)) {
        ctx.fillStyle = (Math.floor(x / 7) + s.car) % 3 ? "rgba(255, 196, 110, 0.75)" : "rgba(40, 46, 52, 0.95)";
        ctx.fillRect(x, wy, m(0.85), wh);
        ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 1.5; ctx.strokeRect(x, wy, m(0.85), wh);
      }
      ctx.beginPath(); ctx.roundRect(X, Y, w, h, [m(0.5), m(0.5), 4, 4]);
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "booth": {
      // The guards' booth: concrete, a lit window, a red beacon on the roof.
      const X = sx(s.x), Y = sy(s.y), w = s.w, h = s.h;
      if (drawMeshy("p_booth", X - m(0.15), Y - m(0.55), w + m(0.3), h + m(0.55))) {
        ctx.save(); ctx.fillStyle = `rgba(255, 70, 50, ${0.6 + Math.sin(frameTime * 6) * 0.4})`; ctx.shadowColor = "#ff4632"; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(X + w / 2, Y - m(0.45), 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        return;
      }
      ctx.fillStyle = "#3b3f44"; ctx.fillRect(X, Y, w, h);
      drawTile("wall_concrete", X, Y, w, h, Math.min(1, w / m(2)), Math.min(1, h / m(2)));
      ctx.fillStyle = "rgba(8, 10, 18, 0.35)"; ctx.fillRect(X, Y, w, h);
      ctx.fillStyle = "rgba(120, 210, 255, 0.55)"; ctx.fillRect(X + w * 0.2, Y + h * 0.22, w * 0.6, h * 0.3);
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(X + w * 0.2, Y + h * 0.22, w * 0.6, h * 0.3);
      hazardBar(X, Y + h - m(0.22), w, m(0.22));
      ctx.fillStyle = "#1a1c20"; ctx.fillRect(X - 4, Y - m(0.18), w + 8, m(0.2));
      ctx.save(); ctx.fillStyle = `rgba(255, 70, 50, ${0.6 + Math.sin(frameTime * 6) * 0.4})`; ctx.shadowColor = "#ff4632"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(X + w / 2, Y - m(0.3), 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.5; ctx.strokeRect(X, Y, w, h);
      return;
    }
    case "turnstile": {
      const X = sx(s.x), Y = sy(s.y), h = s.h;
      const tr = MESHY_KIT.p_turnstile;
      if (tr && meshyReady()) {
        const gw = h * (tr[2] / 3) / tr[3];
        ctx.drawImage(art.meshyKit, tr[0], tr[1], tr[2] / 3, tr[3], X + s.w / 2 - gw / 2, Y, gw, h);
        return;
      }
      ctx.fillStyle = "#5b636b"; ctx.fillRect(X, Y, s.w, h);
      ctx.fillStyle = "#c7cdd2"; ctx.fillRect(X - m(0.3), Y + h * 0.35, m(0.95), 4);
      ctx.fillStyle = `rgba(255, 70, 50, 0.9)`; ctx.fillRect(X + 2, Y + 3, s.w - 4, 4);
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(X, Y, s.w, h);
      return;
    }
    case "garden": {
      // A garden roof: the building below, a planted bed along the top.
      const h = Math.min(s.h, viewBottom - s.y);
      if (h <= 0) return;
      const gw = sectionAt(s.x + s.w / 2).world;
      if (FLOATING_WORLDS[gw]) drawFloatStone(s.x, s.y, s.w, Math.min(m(3), s.w * 0.45), s.seed, gw);
      else if (!drawMeshyBuildings(s, gw === "rc" ? "rc" : "uc")) { ctx.fillStyle = "#0f1214"; ctx.fillRect(sx(s.x), sy(s.y), s.w, h); drawBuilding(s, h, "uc"); }
      const X = sx(s.x), Y = sy(s.y);
      ctx.fillStyle = "#cfc6b4"; ctx.fillRect(X, Y, s.w, m(0.18));
      ctx.fillStyle = "#2f5a2c";
      for (let x = X + 6; x < X + s.w - 6; x += 9) { ctx.beginPath(); ctx.arc(x, Y - 2, 6 + ((x * 7) % 4), Math.PI, 0); ctx.fill(); }
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "glass": {
      // A glass bridge: you can see the drop through it.
      const X = sx(s.x), Y = sy(s.y), w = s.w;
      ctx.fillStyle = "rgba(150, 220, 255, 0.28)"; ctx.fillRect(X, Y, w, m(0.16));
      ctx.strokeStyle = "rgba(220, 245, 255, 0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + w, Y); ctx.stroke();
      ctx.fillStyle = "rgba(150, 220, 255, 0.14)"; ctx.fillRect(X, Y - m(0.95), w, m(0.95));
      ctx.strokeStyle = "rgba(220, 245, 255, 0.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X, Y - m(0.95)); ctx.lineTo(X + w, Y - m(0.95)); ctx.stroke();
      for (let x = X; x <= X + w + 1; x += m(1.2)) { ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x, Y - m(0.95)); ctx.stroke(); }
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      for (let x = X + 8; x < X + w; x += m(1.2)) { ctx.beginPath(); ctx.moveTo(x, Y - m(0.85)); ctx.lineTo(x + 10, Y - m(0.85)); ctx.lineTo(x + 2, Y - m(0.1)); ctx.lineTo(x - 6, Y - m(0.1)); ctx.fill(); }
      return;
    }
    case "ceiling": {
      ctx.fillStyle = "#121513";
      ctx.fillRect(sx(s.x), sy(s.y), s.w, s.h);
      drawBuilding({ x: s.x, y: s.y, w: s.w, seed: s.seed || s.x }, s.h, "ve");
      ctx.fillStyle = "#c79a4d";
      ctx.fillRect(sx(s.x), sy(s.y + s.h) - 3, s.w, 3);
      for (let x = s.x + 30; x < s.x + s.w; x += 90) {
        const t = (frameTime * 0.7 + seeded(x)) % 1;
        ctx.fillStyle = `rgba(150, 190, 255, ${0.6 * (1 - t)})`;
        ctx.fillRect(sx(x), sy(s.y + s.h) + t * 50, 2, 5);
      }
      return;
    }
    case "catwalk": case "awning": {
      if (s.kind === "awning" && s.art) drawKit(s.art, s.x - m(0.1), s.y - m(0.35), s.w + m(0.2), -s.y + m(0.35));
      if (s.kind === "awning" && !s.art) return;   // a market stall draws its own awning
      if (s.kind === "awning") return;
      // In the Veil and the desert a hanging slab of stone; everywhere else a steel catwalk with its handrail.
      { const cw0 = sectionAt(s.x + s.w / 2).world; if (FLOATING_WORLDS[cw0] || cw0 === "de") { drawFloatStone(s.x, s.y, s.w, Math.min(m(2.2), s.w * 0.4), s.seed, cw0); return; } }
      {
        const T = m(2), th = m(1.6), deck = m(0.92);
        ctx.save(); ctx.beginPath(); ctx.rect(sx(s.x), sy(s.y) - deck, s.w, th); ctx.clip();
        for (let x = s.x; x < s.x + s.w; x += T) {
          const cw = Math.min(T, s.x + s.w - x);
          drawTile("catwalk", sx(x), sy(s.y) - deck, cw, th, cw / T, 1);
        }
        ctx.fillStyle = "rgba(8, 10, 18, 0.35)"; ctx.fillRect(sx(s.x), sy(s.y) - deck, s.w, th);
        ctx.restore();
      }
      goldEdge(s.x, s.y, s.w);
      return;
    }
    case "grate": {
      // A drain grate in the street: down and jump to drop through it into the tunnel.
      const X = sx(s.x), Y = sy(s.y);
      ctx.fillStyle = "#0b0b0d"; ctx.fillRect(X, Y, s.w, Math.max(6, s.h));
      ctx.fillStyle = "#4a4740";
      for (let gx = X + 3; gx < X + s.w - 2; gx += 7) ctx.fillRect(gx, Y, 3, Math.max(6, s.h));
      ctx.fillStyle = "#6c665a"; ctx.fillRect(X, Y, s.w, 3);
      const near = players.some(p => Math.abs(p.x - (s.x + s.w / 2)) < m(2.5) && Math.abs(p.y - s.y) < m(0.5));
      if (near && s.y >= -2) {
        ctx.fillStyle = `rgba(241, 202, 120, ${0.6 + Math.sin(frameTime * 6) * 0.3})`;
        ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("▼ + JUMP: DROP IN", X + s.w / 2, Y - m(2.2));
      }
      return;
    }
    case "counter": {
      const top = s.y - m(1.75), bottom = s.y + s.h;
      drawKit("stall", s.x - m(0.25), top, s.w + m(0.5), bottom - top);
      return;
    }
    case "crate": if (!drawWorldProp(s.art === "crate_half" ? "crate_half" : "crate", s)) drawKit(s.art || "crate", s.x, s.y - 2, s.w, s.h + 2); return;
    case "barrel": if (!drawWorldProp("barrel", s)) drawKit("barrel", s.x, s.y - 2, s.w, s.h + 2); return;
    case "cart": if (!drawWorldProp("cart", s)) drawKit("cart", s.x, s.y - 4, s.w, s.h + 4); return;
    case "vent": drawKit("vent", s.x - 4, s.y - 4, s.w + 8, s.h + 4); return;
    case "overhang": {
      if (s.art === "sign") {
        drawBillboard(sx(s.x), sy(s.y), s.w, s.h, s.x);
      } else {
        ctx.fillStyle = "#151a18";
        ctx.fillRect(sx(s.x), sy(s.y), s.w, s.h - m(0.3));
        goldEdge(s.x, s.y, s.w);
        drawKit("pipe", s.x - 10, s.y + s.h - m(0.32), s.w + 20, m(0.32));
      }
      return;
    }
    case "gate": {
      const full = s.gate.floor - s.y;
      // The shutter hangs in a gatehouse: two pillars set back, a lit header with the Feelz Machine sign.
      const px0 = sx(s.x) - m(0.7), px1 = sx(s.x + s.w) + m(0.7) - m(0.45), pw = m(0.45), top = sy(s.y) - m(1.1);
      const pill = ctx.createLinearGradient(0, top, 0, sy(s.gate.floor));
      pill.addColorStop(0, "#2a2f36"); pill.addColorStop(1, "#14171c");
      ctx.fillStyle = pill;
      ctx.fillRect(px0, top, pw, sy(s.gate.floor) - top);
      ctx.fillRect(px1, top, pw, sy(s.gate.floor) - top);
      ctx.fillStyle = "#101318";
      ctx.fillRect(px0 - 6, top - 8, px1 + pw - px0 + 12, m(1.0));
      goldEdge(s.x - 0.7 * PX - 6 / 1, s.y - m(1.1) - 8, (px1 + pw - px0 + 12));
      if (art.logo.ready) {
        const size = m(0.62);
        ctx.globalAlpha = 0.85 + Math.sin(frameTime * 5 + s.x) * 0.1;
        ctx.drawImage(art.logo, (px0 + px1 + pw) / 2 - size / 2, top - 8 + (m(1.0) - size) / 2, size, size);
        ctx.globalAlpha = 1;
      }
      if (s.gate.pulse) {
        const open = pulseOpen(s), soon = !open && pulseOpen(s, gateClock() + 0.6);
        ctx.fillStyle = open ? "#5cff9a" : soon ? "#ffd25a" : "#ff5a3c";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(px0 + pw / 2, top + m(0.5), 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px1 + pw / 2, top + m(0.5), 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = "#c79a4d";
      ctx.fillRect(sx(s.x) - 10, sy(s.y) - 10, s.w + 20, 4);
      // The rolling shutter itself, unrolled as far as it has come down.
      ctx.fillStyle = "#3a3f3c";
      ctx.fillRect(sx(s.x) - 2, sy(s.y), s.w + 4, s.h);
      drawTile("shutter", sx(s.x) - 2, sy(s.y), s.w + 4, s.h, 0.2, Math.min(1, s.h / m(2)));
      ctx.fillStyle = "rgba(8, 10, 18, 0.25)"; ctx.fillRect(sx(s.x) - 2, sy(s.y), s.w + 4, s.h);
      ctx.fillStyle = "#f1ca78";
      ctx.fillRect(sx(s.x) - 2, sy(s.y + s.h) - 6, s.w + 4, 6);
      if (s.gate.closing && s.h < full - 2) {
        ctx.fillStyle = `rgba(255, 80, 40, ${0.5 + Math.sin(frameTime * 20) * 0.4})`;
        ctx.beginPath(); ctx.arc(sx(s.x + s.w / 2), sy(s.y) - 18, 5, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
  }
}

function drawClimbs() {
  for (const c of level.climbs) {
    if (!onScreen(c.x, 0)) continue;
    const h = c.bottom - c.top;
    if (!c.strip) drawKit("pipe_climb", c.x - 8, c.top - 6, 16, h + 6);
    // Gold chevrons: climb here. Only when someone is close enough to use it, so the street stays clean.
    const near = Math.min(...players.map(p => Math.abs(p.x - c.x) / m(1) + (p.y < c.top - m(0.5) || p.y > c.bottom + m(1.2) ? 99 : 0)));
    const show = Math.max(0, Math.min(1, (4 - near) / 1.5));
    if (show <= 0) continue;
    const pulse = (0.55 + Math.sin(frameTime * 4 + c.x) * 0.3) * show;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#f1ca78"; ctx.lineWidth = 2.5;
    ctx.shadowColor = "#f1ca78"; ctx.shadowBlur = 8;
    const cx = c.strip ? sx(c.x) - 8 : sx(c.x) + 16;
    ctx.beginPath();
    for (let y = c.top + 14; y < c.bottom - 6; y += 26) { ctx.moveTo(cx - 5, sy(y) + 5); ctx.lineTo(cx, sy(y)); ctx.lineTo(cx + 5, sy(y) + 5); }
    ctx.stroke();
    ctx.restore();
  }
}

function drawMud() {
  for (const mu of level.mud) {
    if (!onScreen(mu.x, mu.w)) continue;
    const x = sx(mu.x), y = sy(0);
    ctx.fillStyle = "#3a2a1b";
    ctx.beginPath(); ctx.ellipse(x + mu.w / 2, y + 2, mu.w / 2 + 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(241, 202, 120, 0.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const t = (frameTime * 0.6 + i / 3) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath(); ctx.ellipse(x + mu.w * (0.25 + i * 0.25), y + 1, 6 + t * 18, 2 + t * 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawNpcs() {
  const N = SPRITES.npcs;
  for (const n of level.npcs || []) {
    const x = m(n.x), footY = -m(n.y);
    if (n.gone || !onScreen(x, 0, 120)) continue;
    if (n.who === "ZORA" || n.who === "KODA") {
      const sheet = n.who === "ZORA" ? art.zora : art.koda;
      if (!sheet.ready) continue;
      const f = frameFor(SPRITES.koda, "idle", frameTime + n.x);
      ctx.save(); if (n.ghost) ctx.globalAlpha = 0.45;
      drawSheetFrame(sheet, SPRITES.koda, "idle", f, x, footY, n.facing || -1, { glow: "rgba(255, 200, 230, 0.35)", blur: 4 });
      ctx.restore();
      continue;
    }
    // The people in the lockup are townsfolk with a walk: standing in the cage, walking off when freed.
    const caged = (level.cages || []).some(c => level.npcs[c.npc] === n);
    if (caged && art.walkers && art.walkers.ready && WALKER_FOR[n.who] !== undefined) {
      const WK = SPRITES.walkers, size = WK.metres * PX * 0.93;
      const wf = n.running ? Math.floor((n.walked || 0) / WK.stride) % WK.frames : 4;
      ctx.save();
      ctx.translate(sx(x), sy(footY));
      if ((n.facing || 1) < 0) ctx.scale(-1, 1);
      if (n.running) ctx.globalAlpha = Math.max(0, Math.min(1, 1.6 - (n.walked || 0) / 8));
      ctx.drawImage(art.walkers, wf * WK.cell, WALKER_FOR[n.who] * WK.cell, WK.cell, WK.cell, -size / 2, -size * WK.footY, size, size);
      ctx.restore();
      continue;
    }
    const w = N.who[n.who];
    if (!w || !art.npcs.ready) continue;
    const size = w.metres * PX, f = Math.floor((frameTime + n.x * 0.37) * N.fps) % N.frames;
    ctx.save();
    ctx.translate(sx(x), sy(footY));
    if ((n.facing || 1) < 0) ctx.scale(-1, 1);
    ctx.scale(NPC_WIDEN, 1);
    if (n.ghost) { ctx.globalAlpha = 0.42 + Math.sin(frameTime * 1.3 + n.x) * 0.08; ctx.filter = "sepia(0.8) brightness(1.15) blur(0.6px)"; }
    ctx.drawImage(art.npcs, f * N.cell, w.row * N.cell, N.cell, N.cell, -size / 2, -size * w.footY, size, size);
    ctx.restore();
  }
}

function drawDecor() {
  drawNpcs();
  for (const d of level.decor || []) {
    const r = KIT[d.art];
    if (!r) continue;
    const x = m(d.x), footY = -m(d.y), h = m(d.h), w = h * r[2] / r[3];
    if (!onScreen(x - w / 2, w)) continue;
    if (d.glow) {
      const gx = sx(x), gy = sy(footY - h * 0.5);
      const glow = ctx.createRadialGradient(gx, gy, 2, gx, gy, 80);
      glow.addColorStop(0, d.glow + "88"); glow.addColorStop(1, d.glow + "00");
      ctx.fillStyle = glow; ctx.fillRect(gx - 80, gy - 80, 160, 160);
    }
    drawKit(d.art, x - w / 2, footY - h, w, h, 0.95);
  }
}

// Checkpoints are mic stands, lit gold once reached. The next one shows the part of the song it ends.
// The missed-checkpoint countdown and an arrow pointing back to the post.
function drawCheckpointMiss() {
  const p = players[0];
  if (!p || !p.cpMissT) return;
  const next = level.checkpoints[p.cp + 1];
  if (!next) return;
  const t = Math.ceil(p.cpMissT), urgent = p.cpMissT < 5;
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(8, 8, 12, 0.6)"; ctx.beginPath(); ctx.roundRect(W / 2 - 150, 150, 300, 58, 14); ctx.fill();
  ctx.fillStyle = urgent ? (Math.floor(frameTime * 6) % 2 ? "#ff5a3c" : "#ffb08a") : "#f1ca78";
  ctx.font = "900 34px 'Barlow Condensed', Impact, sans-serif"; ctx.fillText(t + "", W / 2, 186);
  ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.fillText("GO BACK AND TOUCH THE CHECKPOINT", W / 2, 202);
  // arrow towards it, at the screen edge if it's off screen
  const tx = Math.max(40, Math.min(W - 40, sx(next.x))), ty = Math.max(90, Math.min(H - 40, sy(next.y) - m(1.5)));
  const ang = Math.atan2(ty - sy(p.y - m(1)), tx - sx(p.x));
  ctx.translate(tx, ty); ctx.rotate(ang);
  ctx.fillStyle = `rgba(241, 202, 120, ${0.7 + Math.sin(frameTime * 8) * 0.3})`;
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCheckpoints() {
  const lead = leader();
  for (const cp of level.checkpoints) {
    if (cp.index === 0 || cp.finish || !onScreen(cp.x, 0)) continue;
    const x = sx(cp.x), y = sy(cp.y);
    const lit = players.some(p => p.cp >= cp.index);
    ctx.fillStyle = lit ? "#d7a64c" : "#8a8f8a";
    ctx.fillRect(x - 12, y - 4, 24, 4);
    ctx.fillRect(x - 1.5, y - 62, 3, 60);
    ctx.save();
    ctx.translate(x, y - 64);
    ctx.rotate(-0.5);
    ctx.fillRect(-2, -16, 4, 16);
    ctx.fillStyle = lit ? "#f1ca78" : "#b0b5ae";
    ctx.beginPath(); ctx.ellipse(0, -21, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (lit) {
      ctx.fillStyle = `rgba(241, 202, 120, ${0.12 * (0.5 + Math.sin(frameTime * 3) * 0.2)})`;
      ctx.beginPath(); ctx.arc(x - 8, y - 82, 22, 0, Math.PI * 2); ctx.fill();
    } else if (cp.index === lead.cp + 1) {
      // The next checkpoint: a beacon of light and the part it closes.
      const beam = ctx.createLinearGradient(0, y - 260, 0, y);
      beam.addColorStop(0, "rgba(241, 202, 120, 0)"); beam.addColorStop(1, "rgba(241, 202, 120, 0.35)");
      ctx.fillStyle = beam;
      ctx.fillRect(x - 16, y - 260, 32, 260);
      ctx.fillStyle = "#f1ca78";
      ctx.font = "800 13px 'Barlow Condensed', Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("END OF " + mission.parts[cp.part].name, x, y - 98);
    }
  }
}

function drawGoal() {
  const g = level.goal;
  if (!onScreen(g.x, g.w, 200)) return;
  const x = sx(g.x), y = sy(g.y), w = g.w, h = g.h;
  const pulse = 0.7 + Math.sin(frameTime * 3) * 0.2;
  const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, 170);
  glow.addColorStop(0, `rgba(255, 210, 120, ${0.5 * pulse})`); glow.addColorStop(1, "rgba(255, 210, 120, 0)");
  ctx.fillStyle = glow; ctx.fillRect(x - 170, y - 120, w + 340, h + 240);
  // Warm light through the doorway, then the door frame from the kit, darkened to sit in the night.
  const dx = g.x - m(0.3), dw = w + m(0.6), dh = h + m(0.4), dy = g.y - m(0.4);
  const light = ctx.createLinearGradient(0, sy(dy), 0, sy(dy) + dh);
  light.addColorStop(0, `rgba(255, 214, 130, ${0.75 * pulse + 0.2})`); light.addColorStop(1, "rgba(242, 158, 31, 0.95)");
  ctx.fillStyle = light;
  ctx.fillRect(sx(dx) + dw * 0.22, sy(dy) + dh * 0.26, dw * 0.54, dh * 0.74);
  ctx.save(); ctx.filter = "brightness(0.5) saturate(0.8)";
  drawKit("wall_door", dx, dy, dw, dh);
  ctx.restore();
  ctx.fillStyle = "#f29e1f"; ctx.fillRect(sx(dx), sy(dy), dw, 3);
  // a billboard on two posts over the door, flipping between the ads
  const bw = m(2.6), bh = m(1.0), bx = x + w / 2 - bw / 2, by = sy(dy) - m(1.5);
  ctx.fillStyle = "#1c1f24"; ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2;
  for (const px of [bx + bw * 0.2, bx + bw * 0.8]) { ctx.fillRect(px - 3, by + bh, 6, sy(dy) - by - bh); ctx.strokeRect(px - 3, by + bh, 6, sy(dy) - by - bh); }
  drawBillboard(bx, by, bw, bh, 11);
  ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = "#f1ca78";
  ctx.font = "800 15px 'Barlow Condensed', Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FINISH", x + w / 2, by - 8);
}

/* ---------- pickups ---------- */

function drawRecord(x, y) {
  const rim = ctx.createLinearGradient(x, y - 14, x, y + 14);
  rim.addColorStop(0, "#fff0bf"); rim.addColorStop(0.5, "#f2a62a"); rim.addColorStop(1, "#8a4e08");
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  const disc = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 11);
  disc.addColorStop(0, "#3a3f46"); disc.addColorStop(1, "#0b0c10");
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f5b942"; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  // specular arc
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 9.5, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
}

const NOTE_STYLE = {
  low:  { color: "#f0c46d", glow: "rgba(240, 196, 109, 0.35)", glyph: "♪", size: 30 },
  mid:  { color: "#7fe3ff", glow: "rgba(127, 227, 255, 0.55)", glyph: "♫", size: 32 },
  high: { color: "#ffe28a", glow: "rgba(255, 212, 106, 0.85)", glyph: "♫", size: 38 }
};

function drawNote(n) {
  const st = NOTE_STYLE[n.tier];
  const x = sx(n.x), y = sy(n.y) + Math.sin(frameTime * 3.8 + n.x) * 4;
  const r = n.tier === "high" ? 32 : n.tier === "mid" ? 26 : 18;
  const glow = ctx.createRadialGradient(x, y, 2, x, y, r);
  glow.addColorStop(0, st.glow); glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.fillStyle = st.color;
  ctx.font = `bold ${st.size}px Arial`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(st.glyph, x, y);
  ctx.textBaseline = "alphabetic";
  if (n.tier === "high") {
    ctx.fillStyle = "#fff6d8";
    ctx.globalAlpha = Math.sin(frameTime * 6 + n.x) * 0.5 + 0.5;
    ctx.fillRect(x + 10, y - 15, 2, 6); ctx.fillRect(x + 8, y - 13, 6, 2);
    ctx.globalAlpha = 1;
  }
}

// FEELZ BOOST (blue) and TIME REWIND (magenta) share one icon.
function drawBoltIcon(x, y, kind) {
  const rewind = kind === "rewind";
  const main = rewind ? "#ff5ad8" : "#7fe3ff";
  const pulse = 1 + Math.sin(frameTime * 7) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
  glow.addColorStop(0, main + "aa"); glow.addColorStop(1, main + "00");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rewind ? "#331029" : "#0e2a33";
  ctx.strokeStyle = main; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rewind ? "#ffe0f6" : "#f1ca78";
  ctx.beginPath();
  ctx.moveTo(3, -12); ctx.lineTo(-7, 2); ctx.lineTo(-1, 2); ctx.lineTo(-4, 12); ctx.lineTo(7, -3); ctx.lineTo(1, -3);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// A hidden gem (free roam): a cut crystal turning in its own light.
function drawGem(X, Y) {
  ctx.save();
  const glow = ctx.createRadialGradient(X, Y, 2, X, Y, 46);
  glow.addColorStop(0, "rgba(160, 250, 255, 0.55)"); glow.addColorStop(1, "rgba(160, 250, 255, 0)");
  ctx.fillStyle = glow; ctx.fillRect(X - 46, Y - 46, 92, 92);
  const t = frameTime * 2, w = 14 * (0.55 + 0.45 * Math.abs(Math.cos(t)));
  ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#0b0906";
  ctx.beginPath(); ctx.moveTo(X, Y - 18); ctx.lineTo(X + w, Y - 6); ctx.lineTo(X, Y + 18); ctx.lineTo(X - w, Y - 6); ctx.closePath();
  const g = ctx.createLinearGradient(X - w, Y - 18, X + w, Y + 18);
  g.addColorStop(0, "#e9fdff"); g.addColorStop(0.45, "#6fe0ff"); g.addColorStop(1, "#2b6fd6");
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(X - w, Y - 6); ctx.lineTo(X + w, Y - 6); ctx.moveTo(X, Y - 18); ctx.lineTo(X - w * 0.3, Y - 6); ctx.lineTo(X, Y + 18); ctx.stroke();
  if (Math.sin(frameTime * 5 + X) > 0.92) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X + w * 0.4, Y - 10, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawPickups() {
  for (const r of level.records) if (!r.taken && onScreen(r.x, 0, 30)) drawRecord(sx(r.x), sy(r.y) + Math.sin(frameTime * 3.8 + r.x) * 4);
  for (const n of level.notes) if (!n.taken && onScreen(n.x, 0, 40)) drawNote(n);
  for (const b of level.boosts) if (!b.taken && onScreen(b.x, 0)) drawBoltIcon(sx(b.x), sy(b.y) + Math.sin(frameTime * 4.5 + b.x) * 5, "boost");
  for (const b of level.rewinds) if (!b.taken && onScreen(b.x, 0)) drawBoltIcon(sx(b.x), sy(b.y) + Math.sin(frameTime * 4.5 + b.x) * 5, "rewind");
  for (const g of level.gems || []) if (!g.taken && onScreen(g.x, 0, 60)) drawGem(sx(g.x), sy(g.y) + Math.sin(frameTime * 2.6 + g.x) * 5);
  const c = level.coin;
  if (c && !c.taken && onScreen(c.x, 0) && art.coin.ready) {
    const s = SPRITES.coin, f = Math.floor(frameTime * s.fps) % s.frames, size = 38;
    const glow = ctx.createRadialGradient(sx(c.x), sy(c.y), 2, sx(c.x), sy(c.y), 40);
    glow.addColorStop(0, "rgba(255, 212, 106, 0.6)"); glow.addColorStop(1, "rgba(255, 212, 106, 0)");
    ctx.fillStyle = glow; ctx.fillRect(sx(c.x) - 40, sy(c.y) - 40, 80, 80);
    ctx.drawImage(art.coin, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, sx(c.x) - size / 2, sy(c.y) - size / 2 + Math.sin(frameTime * 3) * 3, size, size);
  }
  for (const j of level.journal) {
    if (j.taken || !onScreen(j.x, 0)) continue;
    const x = sx(j.x), y = sy(j.y) + Math.sin(frameTime * 2.5 + j.x) * 3;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 34);
    glow.addColorStop(0, "rgba(240, 225, 190, 0.7)"); glow.addColorStop(1, "rgba(240, 225, 190, 0)");
    ctx.fillStyle = glow; ctx.fillRect(x - 34, y - 34, 68, 68);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(frameTime * 2 + j.x) * 0.15);
    ctx.fillStyle = "#f2e6c9"; ctx.fillRect(-10, -13, 20, 26);
    ctx.fillStyle = "#8a6a45"; for (let i = 0; i < 4; i++) ctx.fillRect(-6, -8 + i * 5, 12, 1.5);
    ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(5, 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/* ---------- characters ---------- */

// Outfits: the gold sheet recoloured once per outfit, using the mask sheet rendered
// alongside it (red = hoodie and boots, green = trousers, blue = skin and hair).
let playerOutfit = "gold";
const outfitSheets = {};
function recolorSheet(color, mask, outfitId) {
  const o = OUTFITS[outfitId];
  if (!o || !o.jacket || !color || !mask) return null;
  const c = document.createElement("canvas");
  c.width = color.width; c.height = color.height;
  const k = c.getContext("2d", { willReadFrequently: true });
  k.drawImage(mask, 0, 0, c.width, c.height);
  const md = k.getImageData(0, 0, c.width, c.height).data;
  k.clearRect(0, 0, c.width, c.height);
  k.drawImage(color, 0, 0);
  const img = k.getImageData(0, 0, c.width, c.height), d = img.data;
  const [jd, jl] = o.jacket, [pd, pl] = o.pants;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = md[i], g = md[i + 1], b = md[i + 2], sum = r + g + b;
    if (sum < 8) continue;
    const wr = r / sum, wg = g / sum, wb = b / sum;
    if (wr + wg < 0.02) continue;
    const lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const jt = Math.min(1, Math.max(0, (lum - 0.15) / 0.75)), pt = Math.min(1, lum / 0.45);
    for (let ch = 0; ch < 3; ch++) {
      const jacket = (jd[ch] + (jl[ch] - jd[ch]) * jt) * 255;
      const pants = (pd[ch] + (pl[ch] - pd[ch]) * pt) * 255;
      d[i + ch] = d[i + ch] * wb + jacket * wr + pants * wg;
    }
  }
  k.putImageData(img, 0, 0);
  return c;
}
function kodaSheet(outfitId) {
  if (!outfitId || outfitId === "gold" || !art.koda.ready || !art.kodaMask.ready) return art.koda;
  if (!outfitSheets[outfitId]) outfitSheets[outfitId] = recolorSheet(art.koda, art.kodaMask, outfitId) || art.koda;
  return outfitSheets[outfitId];
}

let tintedKoda = null;   // Player 2 in blue and black, made once
let tintedZora = null;
function tintSheet(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const k = c.getContext("2d");
  k.drawImage(img, 0, 0);
  k.globalCompositeOperation = "source-atop";
  k.fillStyle = "rgba(40, 190, 255, 0.38)";
  k.fillRect(0, 0, c.width, c.height);
  return c;
}
const ZORA_SCALE = 1.15, ZORA_WIDEN = 1.1, NPC_WIDEN = 1.12;
function kodaSheetFor(p) {
  if (mission && mission.player === "zora" && art.zora.ready) {
    if (p.id === 1) return art.zora;
    if (!tintedZora) tintedZora = tintSheet(art.zora);
    return tintedZora;
  }
  if (!art.koda.ready) return art.koda;
  if (p.id === 1) return kodaSheet(playerOutfit);
  if (!tintedKoda) {
    const c = document.createElement("canvas");
    c.width = art.koda.width; c.height = art.koda.height;
    const k = c.getContext("2d");
    k.drawImage(art.koda, 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = "rgba(40, 190, 255, 0.4)";
    k.fillRect(0, 0, c.width, c.height);
    tintedKoda = c;
  }
  return tintedKoda;
}

function drawSheetFrame(img, def, anim, frame, footX, footY, facing, opts) {
  const a = def.animations[anim];
  if (!a || !img || img.ready === false) return;
  const cell = def.cell, size = def.metres * PX;
  const f = Math.max(0, Math.min(a.frames - 1, frame));
  ctx.save();
  ctx.translate(sx(footX), sy(footY));
  if (facing < 0) ctx.scale(-1, 1);
  if (opts && opts.mirror) ctx.scale(1, -1);
  // Zora's renders were framed wider than Koda's: bring her up to her real size, and not so narrow.
  if (img === art.zora || img === tintedZora || (opts && opts.zora)) ctx.scale(ZORA_SCALE * ZORA_WIDEN, ZORA_SCALE);
  if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts && opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.blur || 7; }
  ctx.drawImage(img, f * cell, a.row * cell, cell, cell, -size / 2, -size * def.footY, size, size);
  ctx.restore();
}

// The lowest solid pixel row of each frame of one animation, read once from the sheet.
function sheetBottoms(img, def, anim) {
  if (!img || img.ready === false || !img.naturalWidth) return null;
  img._bottoms = img._bottoms || {};
  if (img._bottoms[anim] !== undefined) return img._bottoms[anim];
  let out = null;
  try {
    const a = def.animations[anim], c = def.cell, cw = c * a.frames;
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = c;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, a.row * c, cw, c, 0, 0, cw, c);
    const d = g.getImageData(0, 0, cw, c).data;
    out = [];
    for (let f = 0; f < a.frames; f++) {
      let bottom = -1;
      for (let y = c - 1; y >= 0 && bottom < 0; y--) {
        for (let x = f * c; x < (f + 1) * c; x++) if (d[(y * cw + x) * 4 + 3] > 40) { bottom = y; break; }
      }
      out.push(bottom);
    }
  } catch (e) { out = null; }
  img._bottoms[anim] = out;
  return out;
}

function frameFor(def, anim, clock, loopOverride) {
  const a = def.animations[anim];
  const n = Math.floor(clock * (a.fps || 10));
  const loop = loopOverride !== undefined ? loopOverride : a.loop !== false;
  return loop ? n % a.frames : Math.min(a.frames - 1, n);
}

function kodaPose(p) {
  const def = SPRITES.koda, A = def.animations;
  if (p.zip) return ["climb", 2];
  if (p.state === "dance") return ["idle", frameFor(def, "idle", frameTime)];
  if (p.move) {
    const k = Math.min(0.999, p.move.t / p.move.dur);
    return [p.move.kind, Math.floor(k * A[p.move.kind].frames)];
  }
  if (p.climb) return ["climb", Math.floor((-p.y) / 16) % A.climb.frames];
  // Bonus moves.
  if (p.pounding) return ["pound", 0];
  if (p.state === "pound") return ["pound", 1 + Math.min(4, Math.floor((1 - p.stateT / 0.35) * 5))];
  if (p.state === "dash") return ["dash", Math.min(A.dash.frames - 1, Math.floor(p.animClock / 0.36 * A.dash.frames))];
  if (p.kickT > 0) return ["wallkick", Math.min(A.wallkick.frames - 1, Math.floor((1 - p.kickT / 0.45) * A.wallkick.frames))];
  if (ATTACK_STATES.has(p.state)) {
    const anim = p.state === "finisher" ? "kick" : p.state;
    const atk = ATTACKS[p.state];
    return [anim, Math.min(A[anim].frames - 1, Math.floor((1 - p.stateT / atk.dur) * A[anim].frames))];
  }
  if (p.fightWith && p.ground) return ["punch", 0];
  if (p.state === "stun") return ["stun", frameFor(def, "stun", p.animClock)];
  if (p.state === "hurt") return ["hurt", frameFor(def, "hurt", p.animClock)];
  if (p.state === "slide") {
    // Drop into the slide, then hold the low pose for as long as the slide lasts.
    const n = Math.floor(p.animClock * A.slide.fps);
    return ["slide", n < 2 ? n : 2 + (n - 2) % (A.slide.frames - 2)];
  }
  if (!p.ground) {
    if (p.flipTime > 0) return ["flip", Math.floor((1 - p.flipTime / 0.45) * A.flip.frames)];
    if (p.vy < 0) return ["jump", Math.min(3, Math.floor((1 + p.vy / JUMP_SPEED) * 4))];
    return ["fall", frameFor(def, "fall", p.animClock)];
  }
  if (p.crouch) {
    if (Math.abs(p.vx) > 1) return ["crouch_walk", Math.floor(p.runPhase / A.crouch_walk.phasePerCycle * A.crouch_walk.frames) % A.crouch_walk.frames];
    return ["crouch_idle", frameFor(def, "crouch_idle", frameTime)];
  }
  if (Math.abs(p.vx) > 1) {
    const anim = p.boostTime > 0 ? "sprint" : "run";
    const a = A[anim];
    return [anim, Math.floor(p.runPhase / a.phasePerCycle * a.frames) % a.frames];
  }
  return ["idle", frameFor(def, "idle", frameTime)];
}

// Thin tapered streaks of air tearing past Koda, thick near him and thinning out behind.
function drawSpeedWind(p) {
  const k = Math.min(1, p.boostTime / 0.6), cx = sx(p.x), cy = sy(p.y) - p.h * 0.55, dir = p.facing;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 14; i++) {
    const seed = seeded(i * 7.3 + 1);
    const speed = 900 + seed * 700;
    const len = 60 + seeded(i * 3.1) * 140;
    const life = ((frameTime * speed + seed * 997) % 520) / 520;          // 0..1 as the streak passes him
    const yy = cy + (seeded(i * 11.7) - 0.5) * p.h * 1.5;
    const x0 = cx + dir * (60 - life * 420);
    const g = ctx.createLinearGradient(x0, 0, x0 - dir * len, 0);
    const a = (0.55 - Math.abs(yy - cy) / (p.h * 2)) * k * Math.sin(life * Math.PI);
    if (a <= 0.02) continue;
    g.addColorStop(0, `rgba(230, 250, 255, ${a})`); g.addColorStop(1, "rgba(127, 227, 255, 0)");
    ctx.strokeStyle = g; ctx.lineWidth = 1 + seeded(i * 5.9) * 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - dir * len, yy); ctx.stroke();
  }
  // a soft bow wave of air in front of him
  const bow = ctx.createRadialGradient(cx + dir * 26, cy, 4, cx + dir * 26, cy, 70);
  bow.addColorStop(0, `rgba(160, 235, 255, ${0.18 * k})`); bow.addColorStop(1, "rgba(160, 235, 255, 0)");
  ctx.fillStyle = bow; ctx.beginPath(); ctx.arc(cx + dir * 26, cy, 70, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayers() {
  for (const p of players) {
    if (p.invuln > 0 && !p.finished && Math.floor(frameTime * 14) % 2 === 0) continue;
    const [anim, frame] = kodaPose(p);
    const img = kodaSheetFor(p);
    if (!art.koda.ready) continue;
    const floor = p.ground ? p.ground.y : (floorBelow(p.x, p.y, true) || { y: p.y }).y;
    const lift = Math.max(0, floor - p.y);
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.08, 0.35 - lift / 600)})`;
    ctx.beginPath(); ctx.ellipse(sx(p.x), sy(floor) - 1, Math.max(8, 20 - lift / 20), 4, 0, 0, Math.PI * 2); ctx.fill();
    // Feelz Boost: afterimages of Koda trailing behind him, and wind rushing past.
    p.ghosts = p.ghosts || [];
    if (p.boostTime > 0 && gameState === "playing" && !reading) {
      p.ghosts.unshift({ x: p.x, y: p.y, anim, frame, facing: p.climb ? p.climb.side : p.facing });
      if (p.ghosts.length > 16) p.ghosts.length = 16;
    } else if (p.boostTime <= 0 && p.ghosts.length) p.ghosts.pop();
    if (p.ghosts.length > 3) {
      const fadeOut = Math.min(1, p.boostTime / 0.6 + (p.boostTime > 0 ? 0 : 0));
      for (let i = p.ghosts.length - 1; i >= 3; i -= 3) {
        const g = p.ghosts[i], a = (1 - i / 17) * 0.38 * (p.boostTime > 0 ? Math.max(0.25, fadeOut) : 0.4);
        drawSheetFrame(img, SPRITES.koda, g.anim, g.frame, g.x, g.y, g.facing, { alpha: a, glow: "rgba(110, 220, 255, 0.9)", blur: 10 });
      }
    }
    if (p.boostTime > 0) drawSpeedWind(p);
    // The climb frames face left in the sheet, so face him into whatever he's climbing.
    const facing = p.climb ? p.climb.side : p.facing;
    // A soft reflection in the wet, glossy floor.
    if (p.ground && (p.ground.kind === "ground" || p.ground.kind === "roof")) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx(p.x) - 80, sy(p.ground.y) + 4, 160, 44); ctx.clip();
      drawSheetFrame(img, SPRITES.koda, anim, frame, p.x, p.ground.y + 4, facing, { mirror: true, alpha: 0.2 });
      ctx.restore();
    }
    if (p.shield) {
      ctx.save();
      ctx.strokeStyle = `rgba(127, 227, 255, ${0.35 + Math.sin(frameTime * 5) * 0.15})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y) - p.h / 2 - 6, 30, p.h / 2 + 18, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    drawSheetFrame(img, SPRITES.koda, anim, frame, p.x, p.y + (p.state === "slide" ? 3 : 0), facing,
      { glow: p.id === 1 ? "rgba(255, 186, 70, 0.22)" : "rgba(110, 220, 255, 0.4)", blur: 3 });
    if (twoPlayer) {
      ctx.fillStyle = p.id === 1 ? "#f1ca78" : "#7fe3ff";
      ctx.font = "800 14px 'Barlow Condensed', Impact, sans-serif";
      ctx.textAlign = "center";
      const top = sy(p.y) - m(1.9);
      ctx.fillText(playerName(p), sx(p.x), top - 6);
      ctx.beginPath(); ctx.moveTo(sx(p.x) - 5, top); ctx.lineTo(sx(p.x) + 5, top); ctx.lineTo(sx(p.x), top + 5); ctx.fill();
    }
  }
}

function drawWardens() {
  for (const wd of level.wardens) {
    const def = SPRITES.enemies[wd.kind] || SPRITES.warden;
    const sheet = art.enemies[wd.kind] && art.enemies[wd.kind].ready ? art.enemies[wd.kind] : art.warden;
    const sdef = sheet === art.warden ? SPRITES.warden : def;
    if (!onScreen(wd.x, 0, 200)) continue;
    let anim, frame;
    if (!wd.alive) { anim = "ko"; frame = frameFor(sdef, "ko", wd.animT, false); if (wd.animT > 3) continue; }
    else if (wd.stagger > 0) { anim = "hit"; frame = Math.min(3, Math.floor((0.38 - Math.min(0.38, wd.stagger)) / 0.38 * 4)); }
    else if (wd.windUp > 0) { anim = "punch"; frame = 1; }
    else if (wd.punchT > 0) { anim = "punch"; frame = 2 + Math.floor((0.3 - wd.punchT) / 0.3 * 4); }
    else if (players.some(o => o.fightWith === wd)) { anim = "fight_idle"; frame = frameFor(sdef, "fight_idle", wd.animT); }
    else if (wd.state === "run" && sdef.animations.run) { anim = "run"; frame = Math.floor(wd.walkPhase / 26) % sdef.animations.run.frames; }
    else { anim = "walk"; frame = Math.floor(wd.walkPhase / 22) % sdef.animations.walk.frames; }
    drawWardenSight(wd);
    // Street Wardens glow red, Sentinels (Upper City) blue, Veil Hunters violet. All of them turn red to swing.
    const calm = wd.kind === "sentinel" ? "rgba(90, 184, 255, 0.9)" : wd.kind === "hunter" ? "rgba(181, 140, 255, 0.9)" : "rgba(224, 83, 60, 0.85)";
    const glow = wd.windUp > 0 ? "rgba(255, 60, 40, 1)" : calm;
    // Lying-down frames sit higher in the cell than the feet do, so drop each one onto the ground.
    let drop = 0;
    if (!wd.alive) {
      const b = sheetBottoms(sheet, sdef, "ko");
      if (b && b[frame] > 0) drop = Math.max(0, sdef.footY * sdef.cell - 1 - b[frame]) / sdef.cell * sdef.metres * PX;
    }
    drawSheetFrame(sheet, sdef, anim, frame, wd.x, wd.y + drop, wd.facing,
      { glow, blur: wd.windUp > 0 ? 16 : 5, alpha: wd.alive ? 1 : Math.max(0, 1 - (wd.animT - 2) ) });
    // Rank: one gold chevron for a veteran, two for an elite.
    const tier = wd.alive ? enemyKind(wd).tier : 0;
    if (tier > 0) {
      const cx = sx(wd.x), cy = sy(wd.y - m(2.25)) + Math.sin(frameTime * 3 + wd.x) * 2;
      ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.shadowColor = tier === 2 ? "#ff5a3c" : "#ffcf6a"; ctx.shadowBlur = 8;
      for (let i = 0; i < tier; i++) {
        const y = cy + i * 7;
        ctx.strokeStyle = "#1a1208"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(cx - 9, y - 4); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 9, y - 4); ctx.stroke();
        ctx.strokeStyle = tier === 2 ? "#ffb04a" : "#ffd98a"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx - 9, y - 4); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 9, y - 4); ctx.stroke();
      }
      ctx.restore();
    }
    if (wd.guardT > 0 && wd.alive) {
      ctx.save(); ctx.strokeStyle = `rgba(150, 215, 255, ${0.5 + Math.sin(frameTime * 20) * 0.2})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(wd.x + wd.facing * m(0.35)), sy(wd.y - m(1.15)), m(0.55), -1.1, 1.1); ctx.stroke(); ctx.restore();
    }
  }
}

function drawDrones() {
  const s = SPRITES.drone;
  if (!art.drone.ready) return;
  for (const dr of level.drones) {
    if (!dr.alive || !onScreen(dr.x, 0, 200)) continue;
    const f = Math.floor(frameTime * s.fps) % s.frames, w = m(1.5), h = w * s.frameHeight / s.frameWidth;
    // its scanning light
    const beam = ctx.createLinearGradient(0, sy(dr.y), 0, sy(dr.y) + 140);
    beam.addColorStop(0, "rgba(224, 83, 60, 0.35)"); beam.addColorStop(1, "rgba(224, 83, 60, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(sx(dr.x) - 8, sy(dr.y) + 10); ctx.lineTo(sx(dr.x) + 8, sy(dr.y) + 10); ctx.lineTo(sx(dr.x) + 44, sy(dr.y) + 140); ctx.lineTo(sx(dr.x) - 44, sy(dr.y) + 140); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.translate(sx(dr.x), sy(dr.y));
    if (dr.facing < 0) ctx.scale(-1, 1);
    ctx.shadowColor = "#e0533c"; ctx.shadowBlur = 10;
    ctx.drawImage(art.drone, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

/* ---------- the storm ---------- */

function drawDebris() {
  for (const d of storm.debris) {
    // a warning arrow on the left edge before it comes on screen
    if (d.x < cameraX - 20) {
      const y = sy(d.y);
      const a = 0.6 + Math.sin(frameTime * 18) * 0.4;
      ctx.fillStyle = `rgba(255, 138, 42, ${a})`;
      ctx.beginPath(); ctx.moveTo(10, y - 14); ctx.lineTo(34, y); ctx.lineTo(10, y + 14); ctx.closePath(); ctx.fill();
      ctx.font = "900 15px 'Barlow Condensed', Impact, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(d.low ? "JUMP" : "DUCK", 40, y + 5);
      continue;
    }
    if (!onScreen(d.x, 0, 200)) continue;
    ctx.save();
    for (let i = 0; i < d.trail.length; i++) {
      const t = d.trail[i];
      ctx.globalAlpha = (i / d.trail.length) * 0.5;
      ctx.fillStyle = "#ff8a2a";
      ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), 4 + i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(sx(d.x), sy(d.y), 4, sx(d.x), sy(d.y), d.size);
    glow.addColorStop(0, "rgba(255, 140, 40, 0.65)"); glow.addColorStop(1, "rgba(255, 120, 30, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx(d.x) - d.size, sy(d.y) - d.size, d.size * 2, d.size * 2);
    const r = KIT[d.art];
    ctx.save();
    ctx.translate(sx(d.x), sy(d.y));
    ctx.rotate(d.rot);
    ctx.shadowColor = "#ff7a1a"; ctx.shadowBlur = 16;
    const w = d.size, h = d.low ? d.size : d.half * 2.2;
    if (r && art.kit.ready) ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawBolt(bolt, alpha, behind) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha) * Math.min(1, bolt.t / 0.15);
  ctx.strokeStyle = behind ? "#dfe6ff" : "#ffffff";
  ctx.shadowColor = "#9fb4ff"; ctx.shadowBlur = 18;
  ctx.lineWidth = behind ? 2.5 : 3.5;
  for (const path of [bolt.pts, bolt.branch]) {
    ctx.beginPath();
    path.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.lineWidth = 1.5;
  }
  ctx.restore();
}

const drops = Array.from({ length: 360 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 }));

function drawRain(amount) {
  if (amount <= 0.02) return;
  const n = Math.floor(drops.length * Math.min(1, amount));
  const wind = 0.2 + 0.4 * storm.strength;
  ctx.save();
  ctx.strokeStyle = "rgba(210, 225, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const d = drops[i];
    const speed = 900 * d.s;
    const y = (d.y + frameTime * speed) % (H + 40) - 20;
    const x = ((d.x + frameTime * speed * wind - cameraX * 0.2) % (W + 60) + W + 60) % (W + 60) - 30;
    ctx.moveTo(x, y); ctx.lineTo(x + 10 * wind * d.s, y + 16 * d.s);
  }
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const q of particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    if (q.text) {
      ctx.fillStyle = q.color;
      ctx.font = "800 15px 'Barlow Condensed', Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(q.text, sx(q.x), sy(q.y));
    } else {
      ctx.fillStyle = q.color;
      ctx.fillRect(sx(q.x) - q.size / 2, sy(q.y) - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
}

// A fight: red at the edges of the screen while it lasts.
function drawFightMood() {
  if (fightLevel < 0.02) return;
  const k = fightLevel * (0.85 + Math.sin(frameTime * 10) * 0.15);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, "rgba(224, 40, 30, 0)");
  g.addColorStop(1, `rgba(224, 40, 30, ${0.38 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawScreenFx() {
  drawFightMood();
  if (flash > 0) { ctx.fillStyle = `rgba(235, 240, 255, ${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (rewindFx > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, rewindFx / 0.3) * 0.6;
    ctx.fillStyle = "rgba(255, 90, 216, 0.18)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255, 220, 248, 0.5)";
    for (let i = 0; i < 6; i++) ctx.fillRect(0, (i * 97 + frameTime * 900) % H, W, 2 + (i % 3));
    ctx.fillStyle = "#ffe0f6";
    ctx.font = "900 34px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("◀◀", 24, 96);
    ctx.restore();
  }
}

/* ---------- the storm front ---------- */

// The storm clouds, darkened once per world from that world's own cloud art.
const stormClouds = {};
function stormCloudSheet() {
  const id = sectionAt(cameraX + W / 2).world;
  const src = art.worlds[id] && art.worlds[id].clouds;
  if (!src || !src.ready) return null;
  if (!stormClouds[id]) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const k = c.getContext("2d");
    k.drawImage(softClouds(src), 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = "rgba(22, 16, 40, 0.82)";
    k.fillRect(0, 0, c.width, c.height);
    stormClouds[id] = c;
  }
  return stormClouds[id];
}

function drawStormFront() {
  if (!mission || !mission.stormChase) return;
  const fx = sx(storm.front);
  if (fx < -460) return;
  ctx.save();
  // The storm leans into the run: its top rolls forward over you, its foot drags behind.
  // It's true to the danger at Koda's height, where it matters.
  const pivot = sy(leader().y - m(1));
  ctx.translate(0, pivot); ctx.transform(1, 0, -0.42, 1, 0, 0); ctx.translate(0, -pivot);
  // Everything the storm has swallowed.
  const body = ctx.createLinearGradient(fx - 300, 0, fx + 60, 0);
  body.addColorStop(0, "rgba(6, 4, 14, 0.97)");
  body.addColorStop(0.6, "rgba(16, 10, 34, 0.9)");
  body.addColorStop(1, "rgba(30, 20, 60, 0)");
  ctx.fillStyle = body;
  ctx.fillRect(-W, -40, Math.max(0, fx + 60) + W, H + 80);
  // Rain driven sideways inside it.
  ctx.strokeStyle = "rgba(190, 200, 255, 0.28)"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const rx = fx - ((i * 53 + frameTime * 900) % 300);
    const ry = (i * 97 + frameTime * 1300) % (H + 40) - 20;
    if (rx < -10) continue;
    ctx.moveTo(rx, ry); ctx.lineTo(rx + 16, ry + 22);
  }
  ctx.stroke();
  // The churning wall of cloud along its edge.
  const sheet = stormCloudSheet();
  if (sheet) {
    const cw = sheet.width / 4, ch = sheet.height / 2;
    // Two rows of rolling cloud: a back row set deeper in, and the leading edge.
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 10; i++) {
        const piece = (i * 3 + row * 5) % 8;
        const sc = (row ? 1.0 : 1.25) + seeded(i * 7 + row) * 0.45;
        const bob = Math.sin(storm.roll * (1.4 + row * 0.6) + i) * 16;
        const lean = Math.sin(storm.roll * 0.8 + i * 2 + row) * 14;
        const y = -60 + i * (H / 8.5) + bob;
        const x = fx - cw * sc * (row ? 0.78 : 1.15) + lean;
        ctx.drawImage(sheet, (piece % 4) * cw, Math.floor(piece / 4) * ch, cw, ch, x, y - ch * sc * 0.5, cw * sc, ch * sc);
      }
    }
  }
  // A neon rim where the storm meets the air: you can always see where it is.
  const rim = ctx.createLinearGradient(fx - 16, 0, fx + 22, 0);
  rim.addColorStop(0, "rgba(181, 140, 255, 0)");
  rim.addColorStop(0.55, `rgba(150, 130, 200, ${0.08 + Math.sin(frameTime * 4) * 0.03})`);
  rim.addColorStop(1, "rgba(181, 140, 255, 0)");
  ctx.fillStyle = rim;
  ctx.fillRect(fx - 16, 0, 38, H);
  // Lightning inside the cloud.
  if (Math.sin(frameTime * 3.1) > 0.985 || flash > 0.2) {
    ctx.fillStyle = "rgba(220, 210, 255, 0.35)";
    ctx.fillRect(Math.max(0, fx - 220), 0, Math.min(fx, 220), H);
  }
  ctx.restore();
}

/* ---------- words on screen ---------- */

const lyricBar = document.getElementById("lyricBar");
let lyricBarText = "";

function drawLyrics() {
  const current = lyricsOn && lyrics.length && !taunt ? currentLyric() : null;
  const alpha = current ? Math.max(0, Math.min(1, (current.t - current.line.start) / 0.25, (current.line.end - current.t) / 0.25)) : 0;
  if (lyricBar) {
    lyricBar.classList.toggle("off", !lyricsOn || !lyrics.length);
    if (lyricBar.offsetParent !== null) {
      const text = current ? current.line.text : "";
      if (text !== lyricBarText) { lyricBar.textContent = text; lyricBarText = text; }
      lyricBar.style.opacity = String(current ? Math.max(0.15, alpha) : 1);
      return;
    }
  }
  if (!current) return;
  const shownScale = canvas.clientWidth ? canvas.clientWidth / W : 1;
  let size = Math.min(34, Math.max(20, 13 / shownScale));
  ctx.save();
  ctx.font = `700 ${size}px "DM Sans", Arial, sans-serif`;
  let width = ctx.measureText(current.line.text).width;
  if (width > W - 80) { size = size * (W - 80) / width; ctx.font = `700 ${size}px "DM Sans", Arial, sans-serif`; width = ctx.measureText(current.line.text).width; }
  const y = H - 16 - size * 0.9;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#0a0b0ab8";
  const boxH = size * 1.55, boxW = width + 36;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(W / 2 - boxW / 2, y - boxH / 2, boxW, boxH, boxH / 2); else ctx.rect(W / 2 - boxW / 2, y - boxH / 2, boxW, boxH);
  ctx.fill();
  ctx.fillStyle = "#f4f0e8";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(current.line.text, W / 2, y + 1);
  ctx.restore();
}

function drawBanner() {
  if (banner.time <= 0 || taunt) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, banner.time / 0.4);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "italic 900 62px 'Barlow Condensed', Impact, sans-serif";
  glossText(banner.text, W / 2, 150, 62);
  const bar = ctx.createLinearGradient(W / 2 - 50, 0, W / 2 + 50, 0);
  bar.addColorStop(0, "rgba(242, 158, 31, 0)"); bar.addColorStop(0.5, "#ffd27a"); bar.addColorStop(1, "rgba(242, 158, 31, 0)");
  ctx.fillStyle = bar; ctx.fillRect(W / 2 - 60, 188, 120, 3);
  if (banner.sub) {
    ctx.fillStyle = "#f4f0e8";
    ctx.font = "700 14px 'DM Sans', Arial, sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    ctx.fillText(banner.sub, W / 2, 210);
  }
  ctx.restore();
}

// Chrome gold lettering with a neon glow, for the big words on screen.
function glossText(text, x, y, size, colors) {
  const c = colors || ["#fff6d6", "#ffd27a", "#f29e1f", "#a8600c"];
  const g = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45);
  g.addColorStop(0, c[0]); g.addColorStop(0.42, c[1]); g.addColorStop(0.55, c[2]); g.addColorStop(1, c[3]);
  ctx.save();
  ctx.shadowColor = c === colors ? c[2] : "rgba(242, 158, 31, 0.75)"; ctx.shadowBlur = 22;
  ctx.fillStyle = g; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.strokeText(text, x, y - 1);
  ctx.restore();
}

// Missed a checkpoint: the game lets you hear about it.
function drawTaunt() {
  if (!taunt) return;
  const k = 1 - taunt.t / TAUNT_SECONDS;
  ctx.save();
  ctx.fillStyle = `rgba(20, 4, 4, ${Math.min(0.72, k * 3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const wobble = Math.sin(frameTime * 30) * (1 - k) * 6;
  ctx.fillStyle = "#e0533c";
  ctx.font = "900 26px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillText("MISSED THE " + mission.parts[taunt.part].name.replace(/ \d$/, "") + " CHECKPOINT", W / 2, H / 2 - 70);
  ctx.fillStyle = "#f4f0e8";
  let size = 56;
  ctx.font = `900 ${size}px 'Barlow Condensed', Impact, sans-serif`;
  while (ctx.measureText(taunt.text).width > W - 80 && size > 28) { size -= 2; ctx.font = `900 ${size}px 'Barlow Condensed', Impact, sans-serif`; }
  glossText(taunt.text, W / 2 + wobble, H / 2, size, ["#ffffff", "#ffd9cf", "#ff5a3c", "#7a1408"]);
  ctx.fillStyle = "#f1ca78";
  ctx.font = "700 14px 'DM Sans', Arial, sans-serif";
  ctx.fillText("THE SONG TAKES YOU BACK 15 SECONDS", W / 2, H / 2 + 52);
  ctx.restore();
}

function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawToast() {
  if (toast.time <= 0 || taunt) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, toast.time / 0.4);
  const w = 360, x = W - w - 18, y = 70;
  ctx.font = "500 12px 'DM Sans', Arial, sans-serif";
  const lines = toast.text ? wrapText(toast.text, w - 28) : [];
  const h = 40 + lines.length * 16;
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, "rgba(40, 36, 28, 0.9)"); glass.addColorStop(1, "rgba(10, 11, 14, 0.9)");
  ctx.fillStyle = glass;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 12); else ctx.rect(x, y, w, h); ctx.fill();
  ctx.strokeStyle = "rgba(255, 214, 140, 0.35)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x + 1, y + 1, w - 2, h / 2, [11, 11, 0, 0]); else ctx.rect(x + 1, y + 1, w - 2, h / 2); ctx.fill();
  ctx.fillStyle = toast.kind === "journal" ? "#f2e6c9" : "#f5b942";
  ctx.fillRect(x + 8, y + 12, 3, h - 24);
  ctx.font = "800 13px 'DM Sans', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(toast.title, x + 14, y + 22);
  ctx.fillStyle = "#cfc9bc";
  ctx.font = "500 12px 'DM Sans', Arial, sans-serif";
  lines.forEach((l, i) => ctx.fillText(l, x + 14, y + 42 + i * 16));
  ctx.restore();
}

// The song bar: how far through the current part, and how long until its checkpoint closes.
let hudCache = { t: -1, v: 0 };
function hudBottom() {
  if (frameTime - hudCache.t < 1) return hudCache.v;
  hudCache.t = frameTime;
  const hud = document.querySelector(".hud"), cv = ctx.canvas;
  const r = cv.getBoundingClientRect();
  hudCache.v = hud && r.height ? hud.getBoundingClientRect().height * (cv.height / r.height) / (cv.height / H) : 0;
  return hudCache.v;
}

function drawSongBar() {
  if (!mission || taunt) return;
  const idx = currentPartIndex();
  const part = mission.parts[idx];
  const left = part.end - songClock;
  // Sit just under the HUD, however big the HUD is on this screen.
  const bw = 300, bx = W / 2 - bw / 2, by = Math.max(62, hudBottom() + 10);
  const k = Math.max(0, Math.min(1, (songClock - part.start) / (part.end - part.start)));
  const danger = left < 6;
  // in the red, the clock ticks out loud: once a second, sharper for the last three
  if (danger && left > 0 && gameState === "playing" && !reading && !songAudio.paused && !freeRoam) {
    const sec = Math.ceil(left);
    if (sec !== drawSongBar.lastTick) { drawSongBar.lastTick = sec; sfx.tick(sec <= 3); }
  } else if (!danger) drawSongBar.lastTick = -1;
  if (freeRoam) return;
  ctx.save();
  const pill = (x, y, w, h) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h); };
  ctx.fillStyle = "rgba(8, 10, 14, 0.7)"; pill(bx - 3, by - 3, bw + 6, 12); ctx.fill();
  ctx.strokeStyle = "rgba(255, 214, 140, 0.25)"; ctx.lineWidth = 1; ctx.stroke();
  const base = danger ? (Math.floor(frameTime * 6) % 2 ? "#e0533c" : "#ff8a5a") : (part.storm ? "#b58cff" : "#f5b942");
  if (k > 0.01) {
    ctx.save();
    ctx.shadowColor = base; ctx.shadowBlur = 10;
    ctx.fillStyle = base; pill(bx, by, bw * k, 6); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)"; pill(bx + 2, by + 0.5, Math.max(0, bw * k - 4), 2); ctx.fill();
  }
  if (twoPlayer) {
    for (const p of players) {
      const pk = Math.max(0, Math.min(1, p.x / level.goal.x));
      ctx.fillStyle = p.id === 1 ? "#f1ca78" : "#7fe3ff";
      ctx.beginPath(); ctx.arc(bx + pk * bw, by + 16, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (raceEndsAt !== null) {
    ctx.fillStyle = "#ff8a5a";
    ctx.font = "900 30px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.ceil(Math.max(0, raceEndsAt - runTime)) + "", W / 2, by + 52);
  }
  ctx.restore();
}

/* ---------- the finish: bloom, vignette and fine scanlines ---------- */

const fx = { bloom: typeof ctx.filter === "string", small: null, sk: null, vignette: null, lines: null, last: 0, slow: 0 };

function postBloom() {
  if (!fx.bloom) return;
  // Drop the bloom on devices that can't keep up.
  const now = performance.now();
  if (fx.last) { const dt = now - fx.last; fx.slow = dt > 26 ? fx.slow + 1 : Math.max(0, fx.slow - 2); if (fx.slow > 90) { fx.bloom = false; return; } }
  fx.last = now;
  if (!fx.small) {
    fx.small = document.createElement("canvas");
    fx.small.width = Math.round(W / 4); fx.small.height = Math.round(H / 4);
    fx.sk = fx.small.getContext("2d");
  }
  const k = fx.sk;
  k.globalCompositeOperation = "copy";
  k.filter = "brightness(0.72) contrast(3) saturate(1.4) blur(2.5px)";
  k.drawImage(canvas, 0, 0, fx.small.width, fx.small.height);
  k.filter = "none";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.26;
  ctx.drawImage(fx.small, 0, 0, W, H);
  ctx.restore();
}

function postFinish() {
  if (!fx.vignette) {
    const v = document.createElement("canvas"); v.width = W; v.height = H;
    const vk = v.getContext("2d");
    const g = vk.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H / 2, W * 0.68);
    g.addColorStop(0, "rgba(0, 0, 0, 0)"); g.addColorStop(1, "rgba(4, 3, 10, 0.55)");
    vk.fillStyle = g; vk.fillRect(0, 0, W, H);
    // fine scanlines for the retro screen feel
    vk.fillStyle = "rgba(0, 0, 0, 0.07)";
    for (let y = 0; y < H; y += 3) vk.fillRect(0, y, W, 1);
    // a glass reflection across the top of the screen
    const top = vk.createLinearGradient(0, 0, 0, H * 0.32);
    top.addColorStop(0, "rgba(255, 255, 255, 0.05)"); top.addColorStop(1, "rgba(255, 255, 255, 0)");
    vk.fillStyle = top; vk.fillRect(0, 0, W, H * 0.32);
    fx.vignette = v;
  }
  ctx.drawImage(fx.vignette, 0, 0);
}

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
  drawDecor();
  drawSetDressing();
  drawTunnels();
  drawMud();
  for (const s of level.solids) {
    if (!onScreen(s.x, s.w, 200)) continue;
    if (s.kind === "awning" && level.stalls.length) continue;   // drawn with the stalls
    drawSolid(s);
  }
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
  drawStallFronts();
  drawHedges();
  drawCrowds("front");
  drawDebris();
  drawStormFront();
  drawParticles();
  drawDarkness();
  drawShadowFront();
  const indoors = sectionAt(cameraX + W / 2).world === "ve";
  const baseRain = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
  drawRain(indoors ? 0 : baseRain + storm.strength * 0.9);
  if (mirror) { ctx.restore(); ctx.save(); ctx.fillText = rawFillText; }
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

/* ---------- a find: a picture held up, flipped over to read ---------- */
function drawCover(img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function drawReadingFront(e, x, y, cw, ch) {
  // a worn print in a cream border, like a photo found in a pocket
  ctx.fillStyle = "#e9dfc8";
  ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 6); ctx.fill();
  const b = 16, px = x + b, py = y + b, pw = cw - b * 2, ph = ch - b - 54;
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  const pic = journalImage(e.image);
  if (pic && pic.ready) drawCover(pic, px, py, pw, ph);
  else {
    // no picture drawn for this find yet: a faded view of the place it was found
    ctx.fillStyle = "#2a241c"; ctx.fillRect(px, py, pw, ph);
    // the painting of the place where this one was found, so each find looks different until its picture exists
    const jf = level.journal.find(j => j.id === (reading && reading.id));
    const sec = jf ? sectionAt(jf.x) : null;
    const place = sec && sec.backdrop ? locImage(sec.backdrop) : journalImage("assets/missions/" + mission.id + ".webp");
    if (place && place.ready) { ctx.filter = "sepia(0.85) contrast(0.9) brightness(0.8)"; drawCover(place, px, py, pw, ph); ctx.filter = "none"; }
  }
  const v = ctx.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.3, px + pw / 2, py + ph / 2, pw * 0.75);
  v.addColorStop(0, "rgba(40, 25, 10, 0)"); v.addColorStop(1, "rgba(40, 25, 10, 0.55)");
  ctx.fillStyle = v; ctx.fillRect(px, py, pw, ph);
  ctx.restore();
  ctx.strokeStyle = "rgba(60, 45, 25, 0.35)"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.fillStyle = "#4a3a24";
  ctx.font = "800 15px 'Barlow Condensed', Impact, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText((e.kind || "A find").toUpperCase(), px + 2, y + ch - 22);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(74, 58, 36, 0.7)";
  ctx.fillText((mission.title || "").toUpperCase(), px + pw - 2, y + ch - 22);
}

function drawReadingBack(e, x, y, cw, ch) {
  const pad = 30, tw = cw - pad * 2;
  const g = ctx.createLinearGradient(0, y, 0, y + ch);
  g.addColorStop(0, "#1c1c20"); g.addColorStop(1, "#0d0d10");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 6); ctx.fill();
  ctx.strokeStyle = "rgba(241, 202, 120, 0.55)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = "800 34px 'Barlow Condensed', Impact, sans-serif";
  const titleLines = wrapText(e.title || "", tw).slice(0, 3);
  ctx.font = "500 20px 'DM Sans', Arial, sans-serif";
  const bodyLines = wrapText(e.text || "", tw).slice(0, 6);
  const block = 24 + titleLines.length * 37 + 16 + bodyLines.length * 29;
  let ty = y + Math.max(36, (ch - block) / 2);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f1ca78";
  ctx.font = "800 14px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillText((e.kind || "JOURNAL").toUpperCase() + " · " + (mission.title || "").toUpperCase(), x + pad, ty);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px 'Barlow Condensed', Impact, sans-serif";
  ty += 40;
  titleLines.forEach((l, i) => ctx.fillText(l, x + pad, ty + i * 37));
  ty += titleLines.length * 37 + 8;
  ctx.fillStyle = "#d8d4cc";
  ctx.font = "500 20px 'DM Sans', Arial, sans-serif";
  bodyLines.forEach((l, i) => ctx.fillText(l, x + pad, ty + i * 29));
}

function drawReading() {
  if (!reading) return;
  const k = Math.min(1, reading.t / 0.35);
  const e = reading.entry || {};
  ctx.save();
  ctx.fillStyle = `rgba(4, 4, 8, ${0.78 * k})`;
  ctx.fillRect(0, 0, W, H);
  const cw = 500, ch = 380;
  const cx = W / 2, cy = H / 2 - 14 + (1 - k) * 30;
  // the turn: squash to an edge, swap faces, open back out, with a little lift
  const f = reading.flipped && e.image ? reading.flip : (e.image ? 0 : 1);
  const sx = Math.max(0.02, Math.abs(Math.cos(f * Math.PI)));
  const lift = Math.sin(f * Math.PI) * 0.06;
  ctx.globalAlpha = k;
  ctx.translate(cx, cy);
  ctx.rotate((f < 0.5 ? -0.025 : 0.012) * (1 - Math.sin(f * Math.PI)));
  ctx.scale(sx * (1 + lift), 1 + lift);
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 6); ctx.fill();
  ctx.shadowColor = "transparent";
  if (f < 0.5) drawReadingFront(e, -cw / 2, -ch / 2, cw, ch);
  else drawReadingBack(e, -cw / 2, -ch / 2, cw, ch);
  ctx.restore(); ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = `rgba(241, 202, 120, ${0.6 + Math.sin(frameTime * 4) * 0.3})`;
  ctx.font = "800 13px 'Barlow Condensed', Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(f < 0.5 ? "THE SONG WAITS · JUMP, HIT OR TAP TO TURN IT OVER" : "JUMP, HIT OR TAP TO CARRY ON", W / 2, cy + ch / 2 + 30);
  ctx.restore();
}

/* ---------- inward runs: behind Koda, running into the picture ---------- */
const IN_HORIZON = 0.44, IN_FOOT = 0.9, IN_LANE = 190, IN_PXM = 98, IN_CAM = 3.2;
function inProject(dz, lane, hgt) {
  const k = IN_CAM / Math.max(0.35, dz + IN_CAM);
  const hy = H * IN_HORIZON, fy = H * IN_FOOT;
  return { x: W / 2 + lane * IN_LANE * k, y: hy + (fy - hy) * k - (hgt || 0) * IN_PXM * k, k };
}

function renderInward() {
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
