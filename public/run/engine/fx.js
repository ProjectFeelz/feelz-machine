"use strict";

/* ---------------------------------------------------------------------------
   EFFECTS
--------------------------------------------------------------------------- */

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

function floatText(x, y, text, color) {
  particles.push({ x, y, vx: 0, vy: -50, life: 0.9, max: 0.9, color, text });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) { particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (!q.text) q.vy += 600 * dt;
  }
}

function showBanner(text, sub, seconds) { banner = { text, sub: sub || "", time: seconds || 1.5 }; }

function showToast(title, text, kind, seconds) { toast = { title, text, kind, time: seconds || 2.2 }; }

/* ---------- the finish: bloom, vignette and fine scanlines ---------- */

const fx = { bloom: !SMOOTH && typeof ctx.filter === "string", small: null, sk: null, vignette: null, lines: null, last: 0, slow: 0 };

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
  // The glow is soft and a quarter size, so working it out every other frame looks the same and halves the cost.
  fx.n = (fx.n || 0) + 1;
  if (fx.n % 2 === 1 || !fx.made) {
    k.globalCompositeOperation = "copy";
    k.filter = "brightness(0.72) contrast(3) saturate(1.4) blur(2.5px)";
    k.drawImage(canvas, 0, 0, fx.small.width, fx.small.height);
    k.filter = "none";
    fx.made = true;
  }
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
    fx.vignette = freeze(v);
  }
  ctx.drawImage(fx.vignette, 0, 0);
}
