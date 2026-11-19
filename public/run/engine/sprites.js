"use strict";

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
  return freeze(c);
}

function tintSheet(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const k = c.getContext("2d");
  k.drawImage(img, 0, 0);
  k.globalCompositeOperation = "source-atop";
  k.fillStyle = "rgba(40, 190, 255, 0.38)";
  k.fillRect(0, 0, c.width, c.height);
  return freeze(c);
}

// Co-op: each other runner in their own colour, each sheet made once.
const coopSheets = {};

function coopTinted(img, tint) {
  const key = (img === art.zora ? "z:" : "k:") + tint;
  if (!coopSheets[key] && img && img.ready !== false && img.width) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const k = c.getContext("2d");
    k.drawImage(img, 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = tint;
    k.fillRect(0, 0, c.width, c.height);
    if (img === art.zora) c._zora = true;
    coopSheets[key] = freeze(c);
  }
  return coopSheets[key] || img;
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
  if (img === art.zora || img === tintedZora || (img && img._zora) || (opts && opts.zora)) ctx.scale(ZORA_SCALE * ZORA_WIDEN, ZORA_SCALE);
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
