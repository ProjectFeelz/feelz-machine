"use strict";

/* ---------------------------------------------------------------------------
   ATMOSPHERE (Feelz Engine)

   The air between you and the world: layered fog that drifts at its own
   depth, shafts of light through the cloud, rain at three distances with
   splashes where it lands, wet floors that mirror the lights, the lightning
   lighting the whole street, out-of-focus things right in front of the
   camera, dust in the air, and a colour grade and vignette per world.

   Play is unchanged. This only draws, at four points in the frame:
     Atmos.back()     after the background (behind everything you touch)
     Atmos.reflect()  after the floors (their wet shine)
     Atmos.front()    after the runners (in front of everything)
     Atmos.grade()    last, over the whole picture
   Set per mission and world in config (ATMOS). Phones get the light
   version (no mirrored floors, fewer layers). ?fx=0 turns it all off.
--------------------------------------------------------------------------- */

const Atmos = (() => {
  const flag = (() => { try { return new URLSearchParams(location.search).get("fx"); } catch (e) { return null; } })();
  const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  let fogArt = null, blurArt = null, moteArt = null;
  const splashes = [];

  function look() {
    if (flag === "0" || typeof ATMOS === "undefined" || !mission || !(ATMOS.missions || []).includes(mission.id) || !level) return null;
    const sec = sectionAt(cameraX + W / 2);
    return sec ? ATMOS.worlds[sec.world] || null : null;
  }
  const stormK = () => Math.min(1, (storm && storm.strength) || 0);
  const flashK = () => Math.min(1, (flash || 0) + (lightningBolt ? 0.5 : 0));

  // Soft cloud sheet: overlapping blurred blobs, painted once, tiled sideways.
  function fogSheet() {
    if (fogArt) return fogArt;
    const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
    const g = c.getContext("2d");
    for (let i = 0; i < 70; i++) {
      const x = seeded(i * 3.7) * 1024, y = 60 + seeded(i * 5.1) * 150, r = 50 + seeded(i * 7.3) * 120;
      for (const dx of [-1024, 0, 1024]) {   // wraps at the edges
        const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        gr.addColorStop(0, "rgba(255, 255, 255, 0.16)"); gr.addColorStop(1, "rgba(255, 255, 255, 0)");
        g.fillStyle = gr; g.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    return (fogArt = c);
  }

  // Things right in front of the lens, out of focus: a sagging cable, a
  // pipe, a chain, a railing post. Painted once, already blurred.
  function blurKit() {
    if (blurArt) return blurArt;
    const c = document.createElement("canvas"); c.width = 1200; c.height = 600;
    const g = c.getContext("2d");
    g.filter = "blur(7px)";
    g.fillStyle = g.strokeStyle = "#07080a";
    // 0: cable sagging across the top (0..600 x 0..200)
    g.lineWidth = 9; g.beginPath(); g.moveTo(-20, 40); g.quadraticCurveTo(300, 210, 620, 30); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(-20, 80); g.quadraticCurveTo(320, 190, 620, 90); g.stroke();
    // 1: a fat pipe up the side (600..800 x 0..600)
    g.fillRect(660, -10, 70, 620); g.fillRect(640, 180, 110, 26); g.fillRect(640, 420, 110, 26);
    // 2: a hanging chain (800..900)
    for (let y = 0; y < 380; y += 26) { g.beginPath(); g.ellipse(850, y, 9, 15, 0, 0, Math.PI * 2); g.lineWidth = 6; g.stroke(); }
    // 3: railing posts and rail along the bottom (0..600 x 400..600)
    g.fillRect(0, 470, 600, 16);
    for (let x = 30; x < 600; x += 140) g.fillRect(x, 470, 16, 140);
    // 4: a bundle of wires (900..1200 x 0..300)
    g.lineWidth = 4;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(900, 20 + i * 14); g.quadraticCurveTo(1050, 150 + i * 20, 1220, 40 + i * 10); g.stroke(); }
    return (blurArt = c);
  }
  const BLUR_PARTS = [[0, 0, 620, 220, "top"], [620, 0, 160, 600, "side"], [800, 0, 100, 400, "top"], [0, 440, 600, 160, "bottom"], [880, 0, 320, 260, "top"]];

  function motes() {
    if (moteArt) return moteArt;
    const c = document.createElement("canvas"); c.width = 32; c.height = 32;
    const g = c.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255, 236, 200, 0.9)"); gr.addColorStop(0.35, "rgba(255, 220, 170, 0.35)"); gr.addColorStop(1, "rgba(255, 220, 170, 0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return (moteArt = c);
  }

  // Fog sheets at a depth: `par` how fast it slides with the camera, `y` its band.
  function fogLayer(par, y, h, alpha, drift) {
    const art = fogSheet(), w = 1024 * (h / 256);
    const off = (((cameraX * par + frameTime * drift) % w) + w) % w;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = -off; x < W; x += w) ctx.drawImage(art, x, y, w, h);
    ctx.restore();
  }

  function back() {
    const L = look();
    if (!L) return;
    const sk = stormK();
    ctx.save();
    // Light shafts down through the cloud, swaying slowly; fewer as the storm closes in.
    if (L.shafts && !phone) {
      ctx.globalCompositeOperation = "lighter";
      const n = 4;
      for (let i = 0; i < n; i++) {
        const base = ((i * 263 - cameraX * 0.12) % (W + 400) + (W + 400)) % (W + 400) - 200;
        const sway = Math.sin(frameTime * 0.25 + i * 1.7) * 30, wdt = 60 + seeded(i * 4.1) * 90;
        const a = L.shafts * (0.55 + Math.sin(frameTime * 0.4 + i) * 0.25) * (1 - sk * 0.6);
        const gr = ctx.createLinearGradient(0, 0, 0, H * 0.9);
        gr.addColorStop(0, `rgba(${L.light}, ${a})`); gr.addColorStop(1, `rgba(${L.light}, 0)`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(base + sway, -10); ctx.lineTo(base + sway + wdt * 0.5, -10);
        ctx.lineTo(base + sway + wdt * 2.4 + 140, H * 0.9); ctx.lineTo(base + sway + 140, H * 0.9);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // Far fog: two sheets at different depths, drifting with the wind.
    fogLayer(0.18, H * 0.3, 260, L.fog * (0.7 + sk * 0.5), 6);
    if (!phone) fogLayer(0.42, H * 0.5, 220, L.fog * 0.8, 14);
    // Distant rain: fine, slow, behind everything.
    const rain = rainAmount();
    if (rain > 0.05) {
      ctx.strokeStyle = `rgba(190, 205, 225, ${0.12 + rain * 0.1})`; ctx.lineWidth = 1;
      ctx.beginPath();
      const count = Math.round((phone ? 40 : 90) * rain);
      for (let i = 0; i < count; i++) {
        const x = ((seeded(i * 1.31) * (W + 60) - cameraX * 0.3 - frameTime * 40) % (W + 60) + (W + 60)) % (W + 60) - 30;
        const y = ((seeded(i * 2.17) * H + frameTime * 380) % H);
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 11);
      }
      ctx.stroke();
    }
    // The lightning lights the far city for a moment.
    const fk = flashK();
    if (fk > 0.02) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(150, 170, 220, ${fk * 0.1})`; ctx.fillRect(0, 0, W, H * 0.75); }
    ctx.restore();
  }

  function rainAmount() {
    const indoors = sectionAt(cameraX + W / 2).world === "ve";
    const base = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
    return indoors ? 0 : Math.min(1, base + stormK() * 0.9);
  }

  // The floors you can see, top edge on screen, widest first.
  function floorsOnScreen(max) {
    const out = [];
    for (const s of level.solids) {
      if (!WALKABLE[s.kind] || s.kind === "wall" || !onScreen(s.x, s.w, 0)) continue;
      const Y = sy(s.y);
      if (Y < 40 || Y > H - 6) continue;
      const x0 = Math.max(0, sx(s.x)), x1 = Math.min(W, sx(s.x) + s.w);
      if (x1 - x0 > 40) out.push({ s, Y, x0, x1 });
    }
    out.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
    return out.slice(0, max);
  }

  // Wet floors: what stands above them, mirrored in the water, rippling.
  function reflect() {
    const L = look();
    if (!L || !L.wet || mission.mirror) return;
    const rain = rainAmount(), fk = flashK();
    const floors = floorsOnScreen(phone ? 0 : 3);
    for (const f of floors) {
      const depth = Math.min(46, H - f.Y);
      if (depth < 8) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(f.x0, f.Y + 3, f.x1 - f.x0, depth); ctx.clip();
      ctx.globalAlpha = L.wet * (0.6 + fk * 0.6);
      // in slices, each nudged sideways a little: the rain on the water
      for (let y = 0; y < depth; y += 4) {
        const wob = Math.sin(frameTime * 6 + y * 0.7 + f.x0 * 0.01) * (1 + rain * 2) * (y / depth + 0.3);
        const srcY = f.Y - y - 4;
        if (srcY < 0) break;
        ctx.drawImage(canvas, f.x0, srcY, f.x1 - f.x0, 4, f.x0 + wob, f.Y + 3 + y, f.x1 - f.x0, 4);
      }
      ctx.restore();
      // fade it into the dark of the floor
      const g = ctx.createLinearGradient(0, f.Y + 3, 0, f.Y + 3 + depth);
      g.addColorStop(0, "rgba(6, 8, 12, 0.1)"); g.addColorStop(1, "rgba(6, 8, 12, 0.85)");
      ctx.fillStyle = g; ctx.fillRect(f.x0, f.Y + 3, f.x1 - f.x0, depth);
    }
  }

  function front() {
    const L = look();
    if (!L) return;
    const rain = rainAmount();
    ctx.save();
    // Splashes where the rain lands on the floors.
    if (rain > 0.1) {
      const floors = floorsOnScreen(4);
      const want = Math.round((phone ? 10 : 26) * rain);
      while (splashes.length < want && floors.length) {
        const f = floors[Math.floor(Math.random() * floors.length)];
        splashes.push({ x: f.x0 + Math.random() * (f.x1 - f.x0) + cameraX, y: f.s.y, t: 0, life: 0.25 + Math.random() * 0.2 });
      }
      ctx.strokeStyle = "rgba(205, 220, 240, 0.55)"; ctx.lineWidth = 1;
      for (let i = splashes.length - 1; i >= 0; i--) {
        const p = splashes[i];
        p.t += 1 / 60;
        if (p.t > p.life) { splashes.splice(i, 1); continue; }
        const k = p.t / p.life, X = p.x - cameraX, Y = sy(p.y);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(X, Y, 2 + k * 7, 1 + k * 1.5, 0, Math.PI, Math.PI * 2); ctx.stroke();
        if (k < 0.5) { ctx.beginPath(); ctx.moveTo(X - 2, Y - k * 8); ctx.lineTo(X - 3, Y - k * 8 - 2); ctx.moveTo(X + 2, Y - k * 7); ctx.lineTo(X + 3, Y - k * 7 - 2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    } else splashes.length = 0;
    // Dust (or spray) floating in the light.
    if (L.motes) {
      const art = motes(), n = phone ? 10 : 24;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const par = 0.6 + seeded(i * 3.3) * 0.8, size = 3 + seeded(i * 1.9) * 9;
        const x = ((seeded(i * 7.1) * (W + 100) - cameraX * par + Math.sin(frameTime * 0.3 + i) * 30) % (W + 100) + (W + 100)) % (W + 100) - 50;
        const y = ((seeded(i * 5.7) * H - frameTime * (6 + seeded(i) * 10)) % H + H) % H;
        ctx.globalAlpha = L.motes * (0.4 + Math.sin(frameTime * 1.3 + i * 2) * 0.3);
        ctx.drawImage(art, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // Close to the lens: things slide past faster than the world, out of focus.
    if (L.foreground) {
      const art = blurKit(), gap = 1500, par = 1.45;
      const first = Math.floor((cameraX * par) / gap) - 1;
      for (let k = first; k <= first + 2; k++) {
        if (seeded(k * 2.9) > L.foreground) continue;
        const [px, py, pw, ph, where] = BLUR_PARTS[Math.floor(seeded(k * 6.1) * BLUR_PARTS.length)];
        const X = k * gap + seeded(k * 1.3) * 600 - cameraX * par;
        if (X > W + 50 || X + pw * 1.6 < -50) continue;
        const s = 1.6, Y = where === "top" ? -20 : where === "bottom" ? H - ph * s + 30 : -40;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(art, px, py, pw, ph, X, Y, pw * s, ph * s);
      }
      ctx.globalAlpha = 1;
    }
    // Near fog hugging the ground.
    fogLayer(1.2, H - 150, 200, L.fog * 0.55, 22);
    ctx.restore();
  }

  function grade() {
    const L = look();
    if (!L) return;
    ctx.save();
    // The world's colour: a soft wash over everything (multiply), then the
    // lightning's cold white for a beat.
    if (L.grade) { ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = L.grade; ctx.fillRect(0, 0, W, H); }
    if (L.lift) { ctx.globalCompositeOperation = "screen"; ctx.fillStyle = L.lift; ctx.fillRect(0, 0, W, H); }
    const fk = flashK();
    if (fk > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(170, 190, 255, ${fk * 0.14})`); g.addColorStop(1, `rgba(170, 190, 255, ${fk * 0.03})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // Vignette: the corners fall away into the dark.
    ctx.globalCompositeOperation = "source-over";
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75);
    v.addColorStop(0, "rgba(0, 0, 0, 0)"); v.addColorStop(1, `rgba(0, 0, 0, ${L.vignette || 0.5})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return { back, reflect, front, grade };
})();
