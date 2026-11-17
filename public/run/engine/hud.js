"use strict";

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
  const ch = cv.clientHeight;   // layout sizes: right even when the page is drawn sideways
  hudCache.v = hud && ch ? hud.offsetHeight * (cv.height / ch) / (cv.height / H) : 0;
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
