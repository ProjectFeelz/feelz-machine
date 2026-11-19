"use strict";

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
  billboardCache[key] = freeze(c);
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

// A tall, narrow board hanging over the way: chains up into the dark, the Feelz
// Machine logo and the name down its face, warning stripes along the bottom edge.
let bannerCache = {};
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { bannerCache = {}; });
function bannerPanel(w, h) {
  const key = Math.round(w) + "x" + Math.round(h) + ":" + (art.logo.ready ? 1 : 0);
  if (bannerCache[key]) return bannerCache[key];
  const k = 2, c = document.createElement("canvas");
  c.width = Math.max(4, Math.round(w * k)); c.height = Math.max(4, Math.round(h * k));
  const g = c.getContext("2d"), W2 = c.width, H2 = c.height;
  const bg = g.createLinearGradient(0, 0, W2, 0);
  bg.addColorStop(0, "#0c0d10"); bg.addColorStop(0.5, "#1b1a17"); bg.addColorStop(1, "#0c0d10");
  g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  g.strokeStyle = "#c79a4d"; g.lineWidth = 3; g.strokeRect(3, 3, W2 - 6, H2 - 6);
  const stripeH = Math.min(H2 * 0.12, W2 * 0.5);
  let y = W2 * 0.18;
  if (art.logo.ready) { const sz = W2 * 0.72; g.drawImage(art.logo, (W2 - sz) / 2, y, sz, sz); y += sz + W2 * 0.12; }
  const letters = "FEELZ".split(""), room = H2 - stripeH - y - W2 * 0.15, step = room / letters.length;
  const fs = Math.min(step * 0.92, W2 * 0.7);
  g.font = `900 ${fs}px 'Barlow Condensed', Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const gold = g.createLinearGradient(0, y, 0, y + room);
  gold.addColorStop(0, "#fff3c8"); gold.addColorStop(0.5, "#f5b942"); gold.addColorStop(1, "#b8741a");
  g.fillStyle = gold;
  letters.forEach((ch, i) => g.fillText(ch, W2 / 2, y + step * (i + 0.5)));
  // warning stripes: duck under this
  g.save(); g.beginPath(); g.rect(3, H2 - stripeH - 3, W2 - 6, stripeH); g.clip();
  g.fillStyle = "#f5b942"; g.fillRect(0, H2 - stripeH - 3, W2, stripeH);
  g.fillStyle = "#15130f";
  for (let x = -stripeH; x < W2 + stripeH; x += stripeH * 0.8) { g.beginPath(); g.moveTo(x, H2); g.lineTo(x + stripeH * 0.4, H2); g.lineTo(x + stripeH * 0.4 + stripeH, H2 - stripeH - 3); g.lineTo(x + stripeH, H2 - stripeH - 3); g.fill(); }
  g.restore();
  bannerCache[key] = freeze(c);
  return c;
}

function drawHangingBanner(s) {
  const X = sx(s.x), Y = sy(s.y);
  // chains up out of sight
  ctx.strokeStyle = "#3a352c"; ctx.lineWidth = 2;
  for (const cx of [X + s.w * 0.22, X + s.w * 0.78]) { ctx.beginPath(); ctx.moveTo(cx, Math.min(Y, 0) - 10); ctx.lineTo(cx, Y); ctx.stroke(); }
  ctx.drawImage(bannerPanel(s.w, s.h), X, Y, s.w, s.h);
  const lit = ctx.createLinearGradient(0, Y + s.h, 0, Y);
  lit.addColorStop(0, "rgba(241, 202, 120, 0.18)"); lit.addColorStop(1, "rgba(241, 202, 120, 0)");
  ctx.fillStyle = lit; ctx.fillRect(X, Y, s.w, s.h);
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

// A rooftop: modelled building fronts side by side, their flat roofs on the line you run on.
// Neighbours are never the same building, widths and shading vary a little, and a
// building taller than its model stands on the storeys of others (a different one
// for each band, with a ledge between), so a street never repeats one pattern.
function drawMeshyBuildings(s, world) {
  const list = MESHY_BUILDINGS[world];
  if (!list || !meshyReady()) return false;
  const img = art.meshyKit;
  const n = Math.max(1, Math.round(s.w / m(8)));
  const lift = MESHY_LIFT[world];
  const top = sy(s.y), bottom = sy(Math.min(s.y + s.h, 0) > s.y + m(1) ? Math.min(s.y + s.h, 0) : s.y + s.h);
  const bodyH = bottom - top;
  if (bodyH <= 0) return true;
  const SHADES = [0.88, 1, 1.08];
  const piece = (name, shade) => {
    const r = MESHY_KIT[name];
    const filter = [lift, shade !== 1 ? "brightness(" + shade + ")" : ""].filter(Boolean).join(" ");
    // made once per building and shade, never a filter on every draw (very slow)
    const c = filter ? baked(img, r[0], r[1], r[2], r[3], filter) : null;
    return c ? { src: c, ax: 0, ay: 0, aw: r[2], ah: r[3], roof: r[4] } : { src: img, ax: r[0], ay: r[1], aw: r[2], ah: r[3], roof: r[4] };
  };
  // widths that vary but fill the roof exactly
  const wts = []; let tot = 0;
  for (let i = 0; i < n; i++) { const w = 0.78 + seeded(s.seed * 5.3 + i * 2.9) * 0.44; wts.push(w); tot += w; }
  let X = sx(s.x), prev = -1;
  for (let i = 0; i < n; i++) {
    const pw = s.w * wts[i] / tot;
    let idx = Math.floor(seeded(s.seed * 3.1 + i * 7.7) * list.length) % list.length;
    if (idx === prev && list.length > 1) idx = (idx + 1) % list.length;
    prev = idx;
    const shade = SHADES[Math.floor(seeded(s.seed * 1.9 + i * 4.1) * SHADES.length)];
    const P = piece(list[idx], shade);
    const { src, ax, ay, aw, ah, roof } = P, k = pw / aw;
    if (roof > 0) ctx.drawImage(src, ax, ay, aw, roof, X, top - roof * k, pw, roof * k);
    const bodySrc = ah - roof, bodyNat = bodySrc * k;
    if (bodyH <= bodyNat * 1.08) {
      if (bodyH / bodyNat >= 0.7) ctx.drawImage(src, ax, ay + roof, aw, bodySrc, X, top, pw, bodyH);
      else ctx.drawImage(src, ax, ay + roof, aw, bodyH / k, X, top, pw, bodyH);
    } else {
      // its own upper floors, then the storeys of other buildings, then a ground floor on the street
      const upSrc = bodySrc * 0.55;
      ctx.drawImage(src, ax, ay + roof, aw, upSrc, X, top, pw, upSrc * k);
      const base = piece(list[(idx + 2) % list.length], shade), bk = pw / base.aw, baseSrc = (base.ah - base.roof) * 0.32, baseH = baseSrc * bk;
      let y = top + upSrc * k, j = 0;
      while (y < bottom - baseH && y < H + 10) {
        const B = piece(list[(idx + 1 + j) % list.length], SHADES[(j + i) % SHADES.length]), bk2 = pw / B.aw;
        const bSrc = (B.ah - B.roof) * 0.5, bH = bSrc * bk2, hh = Math.min(bH, bottom - baseH - y);
        ctx.drawImage(B.src, B.ax, B.ay + B.roof + (B.ah - B.roof) * 0.2, B.aw, hh / bk2, X, y, pw, hh);
        ctx.fillStyle = "rgba(10, 10, 14, 0.55)"; ctx.fillRect(X, y, pw, Math.max(2, pw * 0.012));   // the ledge between
        y += hh; j++;
      }
      if (bottom - baseH < H + 10) ctx.drawImage(base.src, base.ax, base.ay + base.ah - baseSrc, base.aw, baseSrc, X, bottom - baseH, pw, baseH);
    }
    X += pw;
  }
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
// Small things (cans, buckets, tyres, pots) come from assets/worlds/props-small.webp.
function drawSetDressing() {
  if (!level.dressing) return;
  const big = art.props2d && art.props2d.ready, small = art.propsSmall && art.propsSmall.ready;
  if (!big && !small) return;
  for (const d of level.dressing) {
    if (!onScreen(d.x - m(2), m(4), 60)) continue;
    const img = d.small ? art.propsSmall : art.props2d;
    if (d.small ? !small : !big) continue;
    const r = (d.small ? PROPS_SMALL : PROP2D)[d.name];
    if (!r) continue;
    const h = m(d.h), w = h * r[2] / r[3];
    drawBaked(img, r[0], r[1], r[2], r[3], sx(d.x) - w / 2, sy(d.y) - h + 3, w, h, "brightness(0.82) saturate(0.92)");
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
  if (Array.isArray(img)) return drawTiledSet(img, parallax, y, height, alpha);
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

// Several pictures of the same kind of street, laid end to end in a seeded order,
// each at its own width, so the strip never repeats one picture side by side.
function drawTiledSet(imgs, parallax, y, height, alpha) {
  const ready = imgs.filter(i => i.ready);
  if (!ready.length || alpha <= 0) return;
  if (ready.length === 1) return drawTiled(ready[0], parallax, y, height, alpha);
  const seq = [];
  for (let k = 0; k < 8; k++) {
    let i = Math.floor(seeded(k * 7.3 + 11) * ready.length) % ready.length;
    if (k && ready[i] === seq[k - 1]) i = (i + 1) % ready.length;
    seq.push(ready[i]);
  }
  const ws = seq.map(i => i.width * height / i.height), period = ws.reduce((a, b) => a + b, 0);
  let x = -((((cameraX * parallax) % period) + period) % period), k = 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  while (x < W) {
    const i = k % seq.length;
    if (x + ws[i] > 0) ctx.drawImage(seq[i], x, y, ws[i] + 1, height);
    x += ws[i]; k++;
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
  img._soft = freeze(c);
  return c;
}

// Which pieces of each world's cloud sheet are real clouds: the tall smoke plumes,
// wisps, rain, tornado, birds, lanterns and kites read as shapes or figures in the sky.
const CLOUD_PIECES = { lc: [0, 1, 2, 3], mc: [0, 1, 3, 5, 6], uc: [0, 1, 2, 3, 4, 6, 7], de: [0, 2, 3, 6, 1], rc: [0, 1, 2, 3], ve: [0, 1, 4, 5, 6] };
function drawClouds(img, alpha, speed, world) {
  if (!img.ready) return;
  const pieces = CLOUD_PIECES[world];
  img = softClouds(img);
  const cw = img.width / 4, ch = img.height / 2, span = 1700;
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  CLOUD_SLOTS.forEach((c, i) => {
    const piece = pieces ? pieces[(c.piece + i) % pieces.length] : c.piece;
    const px = (piece % 4) * cw, py = Math.floor(piece / 4) * ch;
    let x = c.x - cameraX * 0.05 - cloudDrift * speed * c.s;
    x = ((x % span) + span) % span - 200;
    ctx.drawImage(img, px, py, cw, ch, x, c.y, cw * c.s, ch * c.s);
  });
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
  drawClouds(layers.clouds, alpha, 7, id);
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
    if (layers) drawClouds(layers.clouds, alpha * 0.8, 7, sec.world);
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
      // Drawn in real 3D already (engine/world3d.js): just its gold lip here.
      if (typeof World3D !== "undefined" && World3D.covers(s)) { goldEdge(s.x, s.y, s.w); return; }
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
        const cr = MESHY_KIT.p_container;
        if (hue && cr) drawBaked(art.meshyKit, cr[0], cr[1], cr[2], cr[3], X - 2, Y - 2, w + 4, h + 4, `hue-rotate(${hue}deg)`);
        else drawMeshy("p_container", X - 2, Y - 2, w + 4, h + 4);
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
      // Every board you duck under carries something: a flipping billboard when it's wide,
      // a hanging Feelz Machine banner when it's narrow.
      if (s.art === "sign" || s.w >= m(1.5)) {
        drawBillboard(sx(s.x), sy(s.y), s.w, s.h, s.x);
      } else drawHangingBanner(s);
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

// A steel ladder bolted to the wall: two rails, rungs, rust and a wet shine.
// Each one is painted once into its own little canvas and reused.
function drawLadder(c, h) {
  const wpx = Math.round(m(0.62)), hpx = Math.round(h + 10);
  if (!c.ladderArt || c.ladderArt.height !== hpx) {
    const cv = document.createElement("canvas");
    cv.width = wpx + 8; cv.height = hpx;
    const g = cv.getContext("2d"), rail = Math.max(4, Math.round(m(0.07))), L = 4, R = 4 + wpx - rail;
    // its shadow on the wall
    g.fillStyle = "rgba(0, 0, 0, 0.35)";
    g.fillRect(L + 3, 4, rail, hpx - 4); g.fillRect(R + 3, 4, rail, hpx - 4);
    // rungs
    const step = Math.round(m(0.3));
    for (let y = hpx - Math.round(step * 0.6); y > 6; y -= step) {
      g.fillStyle = "rgba(0, 0, 0, 0.35)"; g.fillRect(L + rail, y + 3, R - L - rail, 3);
      const rg = g.createLinearGradient(0, y, 0, y + 4);
      rg.addColorStop(0, "#a9a39a"); rg.addColorStop(0.5, "#5f5a54"); rg.addColorStop(1, "#2a2724");
      g.fillStyle = rg; g.fillRect(L + rail - 1, y, R - L - rail + 2, 4);
    }
    // rails: steel, rust towards the bottom, a bright wet edge
    for (const x of [L, R]) {
      const gr = g.createLinearGradient(x, 0, x + rail, 0);
      gr.addColorStop(0, "#2b2826"); gr.addColorStop(0.35, "#8f8a82"); gr.addColorStop(0.55, "#d4cfc4"); gr.addColorStop(1, "#3a3532");
      g.fillStyle = gr; g.fillRect(x, 0, rail, hpx);
      const rust = g.createLinearGradient(0, hpx * 0.4, 0, hpx);
      rust.addColorStop(0, "rgba(120, 60, 25, 0)"); rust.addColorStop(1, "rgba(120, 60, 25, 0.55)");
      g.fillStyle = rust; g.fillRect(x, 0, rail, hpx);
      // brackets into the wall
      for (let y = 18; y < hpx - 6; y += Math.round(m(1.4))) { g.fillStyle = "#1c1a18"; g.fillRect(x - 2, y, rail + 4, 5); g.fillStyle = "#6d675f"; g.fillRect(x - 2, y, rail + 4, 1); }
    }
    c.ladderArt = freeze(cv);
  }
  ctx.drawImage(c.ladderArt, Math.round(sx(c.x) - c.ladderArt.width / 2), Math.round(sy(c.top) - 10));
}

function drawClimbs() {
  for (const c of level.climbs) {
    if (!onScreen(c.x, 0)) continue;
    const h = c.bottom - c.top;
    drawLadder(c, h);
    // Gold chevrons: climb here. Only when someone is close enough to use it, so the street stays clean.
    const near = Math.min(...players.map(p => Math.abs(p.x - c.x) / m(1) + (p.y < c.top - m(0.5) || p.y > c.bottom + m(1.2) ? 99 : 0)));
    const show = Math.max(0, Math.min(1, (4 - near) / 1.5));
    if (show <= 0) continue;
    const pulse = (0.55 + Math.sin(frameTime * 4 + c.x) * 0.3) * show;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = "#f1ca78"; ctx.lineWidth = 2.5;
    ctx.shadowColor = "#f1ca78"; ctx.shadowBlur = 8;
    const cx = sx(c.x) + m(0.55);
    ctx.beginPath();
    for (let y = c.top + 14; y < c.bottom - 6; y += 26) { ctx.moveTo(cx - 5, sy(y) + 5); ctx.lineTo(cx, sy(y)); ctx.lineTo(cx + 5, sy(y) + 5); }
    ctx.stroke();
    ctx.restore();
  }
}

// The Lower City's sludge: a painted mud texture (assets/worlds/tex-mud.webp),
// laid flat and seen at a low angle, so it is squashed top to bottom.
let mudArt = null, mudPat = null;
function mudPattern() {
  if (!mudArt) { mudArt = new Image(); mudArt.src = "assets/worlds/tex-mud.webp"; }
  if (!mudArt.complete || !mudArt.naturalWidth) return null;
  if (!mudPat) mudPat = ctx.createPattern(mudArt, "repeat");
  return mudPat;
}
function mudFill(x0, y0, w, h, alpha) {
  const pat = mudPattern();
  if (!pat) return false;
  // squashed to the ground's angle, sliding with the world
  pat.setTransform(new DOMMatrix().translateSelf(-(cameraX % (512 * 0.8)), y0, 0).scaleSelf(0.8, 0.32));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(x0, y0, w, h);
  ctx.restore();
  return true;
}
// Sludge along the top of the Lower City street (Mission 1's dusty mud).
function drawSludge(s, h) {
  if (!mission || typeof ATMOS === "undefined" || (ATMOS.missions !== "all" && !(ATMOS.missions || []).includes(mission.id))) return;
  const X0 = Math.max(sx(s.x), 0), X1 = Math.min(sx(s.x) + s.w, W), Y = sy(s.y);
  if (X1 <= X0) return;
  const band = Math.min(h, m(0.55)), top = Y + 5;      // under the gold lip, which always stays clear
  if (!(band > 2)) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, top, X1 - X0, band); ctx.clip();
  // patchy, soft-edged pools of sludge: thick in places, none in others
  for (let x = X0 - (X0 + cameraX) % 96 - 96; x < X1 + 96; x += 96) {
    const k = seeded(Math.floor((x + cameraX) / 96) * 1.7);
    if (sectionAt(x + cameraX).world !== "lc" || k < 0.3) continue;
    const rw = 60 + k * 50, rh = band * (0.45 + k * 0.5);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x + 48, top, rw, rh, 0, 0, Math.PI); ctx.clip();
    mudFill(x - rw, top, rw * 2 + 96, rh, 0.7 + k * 0.3);
    ctx.restore();
  }
  ctx.restore();
}

// Called after the wet floors are drawn: mud doesn't mirror anything.
function drawSludgeAll() {
  const viewBottom = cameraY + H + 4;
  for (const s of level.solids) if (s.kind === "ground" && onScreen(s.x, s.w, 0)) drawSludge(s, Math.min(s.h, viewBottom - s.y));
}

function drawMud() {
  for (const mu of level.mud) {
    if (!onScreen(mu.x, mu.w)) continue;
    const x = sx(mu.x), y = sy(0);
    ctx.save();
    // a wide lens of sludge lying on the street
    ctx.beginPath(); ctx.ellipse(x + mu.w / 2, y + 3, mu.w / 2 + 10, 9, 0, 0, Math.PI * 2); ctx.clip();
    if (!mudFill(x - 12, y - 8, mu.w + 24, 24, 1)) { ctx.fillStyle = "#3a2a1b"; ctx.fillRect(x - 12, y - 8, mu.w + 24, 24); }
    ctx.fillStyle = "rgba(40, 28, 16, 0.35)"; ctx.fillRect(x - 12, y - 8, mu.w + 24, 24);
    ctx.restore();
    // a wet shine along its top, and rings where the rain lands
    ctx.strokeStyle = "rgba(220, 200, 160, 0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + mu.w / 2, y + 1, mu.w / 2 + 2, 4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = "rgba(241, 202, 120, 0.35)";
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
    const cage = (level.cages || []).find(c => level.npcs[c.npc] === n), caged = !!cage;
    // In 3D when their model is in: waiting, a cheer as the cage lifts, then away up the street.
    const tf = !n.ghost && typeof Char3D !== "undefined" && CHAR3D.townsfolk && CHAR3D.townsfolk[n.who];
    if (tf && Char3D.want(tf.id)) {
      const cheering = cage && cage.open && cage.t < 0.7;
      const anim = cheering ? "cheer" : n.running ? "walk" : "idle";
      const t = cheering ? 0.25 + cage.t / 2.2 : n.running ? (n.walked || 0) / 2.2 : (frameTime + n.x * 0.37) / 9.9;
      // facing the street while they wait, turned a little toward us
      const c3 = Char3D.render(tf.id, "npc", anim, t, n.running ? (n.facing || 1) : (n.facing || 1), n.running ? undefined : { turn: 0.55 });
      if (c3) {
        ctx.save();
        if (n.running) ctx.globalAlpha = Math.max(0, Math.min(1, 1.6 - (n.walked || 0) / 8));
        drawModelFrame(c3, x, footY);
        ctx.restore();
        continue;
      }
    }
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
    if (n.ghost) {
      ctx.globalAlpha = 0.42 + Math.sin(frameTime * 1.3 + n.x) * 0.08;
      drawBaked(art.npcs, f * N.cell, w.row * N.cell, N.cell, N.cell, -size / 2, -size * w.footY, size, size, "sepia(0.8) brightness(1.15) blur(0.6px)");
    } else ctx.drawImage(art.npcs, f * N.cell, w.row * N.cell, N.cell, N.cell, -size / 2, -size * w.footY, size, size);
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
  { const kr = KIT.wall_door; if (kr && art.kit.ready) drawBaked(art.kit, kr[0], kr[1], kr[2], kr[3], sx(dx), sy(dy), dw, dh, "brightness(0.5) saturate(0.8)"); }
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
    // A rare find, so it shines: a warm pulsing glow, a glint across the face and sparkles round it.
    const s = SPRITES.coin, f = Math.floor(frameTime * s.fps) % s.frames, size = 48;
    const X = sx(c.x), Y = sy(c.y) + Math.sin(frameTime * 3) * 3, pulse = 0.75 + Math.sin(frameTime * 4) * 0.25;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(X, Y, 2, X, Y, 64);
    glow.addColorStop(0, `rgba(255, 214, 110, ${0.75 * pulse})`); glow.addColorStop(0.45, `rgba(255, 170, 40, ${0.28 * pulse})`); glow.addColorStop(1, "rgba(255, 170, 40, 0)");
    ctx.fillStyle = glow; ctx.fillRect(X - 64, Y - 64, 128, 128);
    ctx.restore();
    ctx.drawImage(art.coin, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, X - size / 2, Y - size / 2, size, size);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // the glint: a bright band sweeping across every couple of seconds
    const gt = (frameTime % 2.2) / 0.5;
    if (gt < 1) {
      ctx.beginPath(); ctx.arc(X, Y, size * 0.44, 0, Math.PI * 2); ctx.clip();
      const gx = X - size + gt * size * 2;
      const band = ctx.createLinearGradient(gx - 10, Y - 20, gx + 10, Y + 20);
      band.addColorStop(0, "rgba(255, 255, 255, 0)"); band.addColorStop(0.5, "rgba(255, 252, 230, 0.85)"); band.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = band; ctx.fillRect(X - size, Y - size, size * 2, size * 2);
    }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 4; k++) {
      const t = (frameTime * 0.9 + k * 0.25) % 1, a = Math.sin(t * Math.PI);
      const ang = k * 1.7 + Math.floor(frameTime * 0.9 + k * 0.25) * 2.3, r = size * (0.55 + 0.25 * seeded(k + Math.floor(frameTime * 0.9 + k * 0.25)));
      const px = X + Math.cos(ang) * r, py = Y + Math.sin(ang) * r, l = 3 + a * 5;
      ctx.strokeStyle = `rgba(255, 246, 200, ${a * 0.95})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - l, py); ctx.lineTo(px + l, py); ctx.moveTo(px, py - l); ctx.lineTo(px, py + l); ctx.stroke();
    }
    ctx.restore();
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
    ctx.save();
    ctx.translate(sx(d.x), sy(d.y));
    ctx.rotate(d.rot);
    drawDebrisPiece(d.art, d.size, d.low ? d.size : String(d.art).startsWith("s_") ? m(0.9) : d.half * 2.2);
    ctx.restore();
  }
}

// One piece of storm debris, centred on (0, 0): a small thing off the street
// (assets/worlds/props-small.webp), a painted crate or barrel, or the kit's pipes and grates.
const DEBRIS_PROP = { crate: "mc_crate_half", barrel: "mc_barrel", crate_half: "mc_crate_half", vent: "rc_barrel" };
function drawDebrisPiece(name, w, h) {
  const sr = PROPS_SMALL[name];
  if (sr) {
    const im = art.propsSmall;
    if (im && im.ready) { const k = Math.min(w / sr[2], h / sr[3]) * 1.1, pw = sr[2] * k, ph = sr[3] * k; ctx.drawImage(im, sr[0], sr[1], sr[2], sr[3], -pw / 2, -ph / 2, pw, ph); }
    return;
  }
  const pr = PROP2D[DEBRIS_PROP[name]];
  if (pr && art.props2d && art.props2d.ready) {
    const k = Math.min(w / pr[2], h / pr[3]) * 1.15, pw = pr[2] * k, ph = pr[3] * k;
    ctx.drawImage(art.props2d, pr[0], pr[1], pr[2], pr[3], -pw / 2, -ph / 2, pw, ph);
    return;
  }
  const r = KIT[name];
  if (r && art.kit.ready) ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
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
    stormClouds[id] = freeze(c);
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
