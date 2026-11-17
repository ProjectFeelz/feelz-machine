"use strict";

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
