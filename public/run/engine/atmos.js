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
  // How much it draws: 0 everything, 1 the lighter set, 2 the bare minimum.
  // Phones start on 2 (fog, dust and the vignette only). Any device that falls under about 48 frames a second
  // for four and a half seconds steps down a level (and stays there for the visit), so the
  // look never costs the game its speed. ?fx=full keeps 0 for testing.
  let quality = phone ? 2 : 0, watch = slowWatch(21, 4500);
  function pace() {
    if (flag === "full" || quality >= 2) return;
    if (watch()) { quality += 1; watch = slowWatch(21, 4500); console.warn("[atmos] lighter effects for this device, level", quality); }
  }
  let fogArt = null, blurArt = null;
  const splashes = [];

  // The look for where the camera is: the world's own, then this mission's
  // changes to it, then the painting's (a night scene in a day world).
  let lookKey = "", lookVal = null;
  function look() {
    if (flag === "0" || typeof ATMOS === "undefined" || !mission || !level) return null;
    const ms = ATMOS.missions;
    if (ms !== "all" && !(ms || []).includes(mission.id)) return null;
    const sec = sectionAt(cameraX + W / 2);
    if (!sec) return null;
    const key = mission.id + "|" + sec.world + "|" + (sec.backdrop || "");
    if (key === lookKey) return lookVal;
    const base = ATMOS.worlds[sec.world];
    lookKey = key;
    lookVal = base ? Object.assign({}, base,
      ((ATMOS.byMission || {})[mission.id] || {})[sec.world] || {},
      (ATMOS.byBackdrop || {})[sec.backdrop] || {}) : null;
    return lookVal;
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
    return (fogArt = freeze(c));
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
    return (blurArt = freeze(c));
  }
  const BLUR_PARTS = [[0, 0, 620, 220, "top"], [620, 0, 160, 600, "side"], [800, 0, 100, 400, "top"], [0, 440, 600, 160, "bottom"], [880, 0, 320, 260, "top"]];

  // One small soft sprite per kind of thing in the air.
  const moteArts = {};
  function motes(kind) {
    kind = kind || "dust";
    if (moteArts[kind]) return moteArts[kind];
    const c = document.createElement("canvas"); c.width = 32; c.height = 32;
    const g = c.getContext("2d");
    const col = { dust: [255, 228, 186], spark: [170, 225, 255], sand: [236, 196, 140], petal: [235, 120, 140] }[kind] || [255, 228, 186];
    if (kind === "petal") {
      g.fillStyle = `rgba(${col}, 0.9)`;
      g.beginPath(); g.ellipse(16, 16, 14, 8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255, 200, 210, 0.6)"; g.beginPath(); g.ellipse(13, 13, 6, 3, 0, 0, Math.PI * 2); g.fill();
    } else {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, `rgba(${col}, 0.9)`); gr.addColorStop(0.35, `rgba(${col}, 0.35)`); gr.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    }
    return (moteArts[kind] = freeze(c));
  }

  // Fog sheets at a depth: `par` how fast it slides with the camera, `y` its band.
  // Fog in a colour (sand haze in the desert, violet in the Veil): tinted once, kept.
  const tinted = {};
  function fogArtFor(tint) {
    if (!tint) return fogSheet();
    if (tinted[tint]) return tinted[tint];
    const src = fogSheet(), c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
    return (tinted[tint] = freeze(c));
  }
  let fogTint = null;
  function fogLayer(par, y, h, alpha, drift) {
    const art = fogArtFor(fogTint), w = 1024 * (h / 256);
    const off = (((cameraX * par + frameTime * drift) % w) + w) % w;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = -off; x < W; x += w) ctx.drawImage(art, x, y, w, h);
    ctx.restore();
  }

  function back() {
    const L = look();
    if (!L) return;
    pace();
    fogTint = L.fogTint || null;
    const sk = stormK();
    ctx.save();
    // Light shafts down through the cloud, swaying slowly; fewer as the storm closes in.
    if (L.shafts && quality === 0) {
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
    fogLayer(0.18, H * 0.3, 260, L.fog * (0.7 + sk * 0.15), 6);
    if (quality === 0) fogLayer(0.42, H * 0.5, 220, L.fog * 0.8, 14);
    // Distant rain: fine, slow, behind everything.
    const rain = rainAmount();
    if (rain > 0.05 && quality < 2) {
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
    // (The lightning's flash is the game's own: nothing added here, so it never strobes twice.)
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

  // Wet floors: a cold shine on the water and a few ripples of light,
  // brighter in the lightning. (Painted, not copied from the screen: copying
  // the game's own canvas back onto itself stalls many PCs.)
  function reflect() {
    const L = look();
    if (!L || mission.mirror) { return; }
    if (L.wet && quality === 0) {
      const rain = rainAmount(), fk = flashK();
      ctx.save();
      for (const f of floorsOnScreen(3)) {
        const depth = Math.min(40, H - f.Y - 3), w = f.x1 - f.x0;
        if (depth < 8 || w < 8) continue;
        const a = L.wet * (0.35 + fk * 0.7);
        const g = ctx.createLinearGradient(0, f.Y + 3, 0, f.Y + 3 + depth);
        g.addColorStop(0, `rgba(${L.light || "200, 215, 235"}, ${0.16 * a})`); g.addColorStop(1, `rgba(${L.light || "200, 215, 235"}, 0)`);
        ctx.fillStyle = g; ctx.fillRect(f.x0, f.Y + 3, w, depth);
        // ripples of light that slide as you run
        ctx.strokeStyle = `rgba(225, 235, 255, ${0.18 * a})`; ctx.lineWidth = 1;
        ctx.beginPath();
        const step = 46, off = ((cameraX * 0.9 + frameTime * (10 + rain * 30)) % step + step) % step;
        for (let x = f.x0 - off; x < f.x1; x += step) {
          for (let row = 0; row < 3; row++) {
            const y = f.Y + 7 + row * 9 + Math.sin(frameTime * 3 + x * 0.05 + row) * 1.2, len = 14 - row * 3;
            const x0 = Math.max(f.x0, x + row * 13), x1 = Math.min(f.x1, x0 + len);
            if (x1 > x0) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (typeof drawSludgeAll === "function") drawSludgeAll();
  }

  function front() {
    const L = look();
    if (!L || quality >= 2) return;
    const rain = rainAmount();
    ctx.save();
    // Splashes where the rain lands on the floors.
    if (rain > 0.1) {
      const floors = floorsOnScreen(4);
      const want = Math.round((quality ? 10 : 26) * rain);
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
      const kind = L.mote || "dust", n = quality ? 10 : (kind === "sand" ? 40 : 24);
      ctx.globalCompositeOperation = kind === "petal" ? "source-over" : "lighter";
      const art = motes(kind);
      for (let i = 0; i < n; i++) {
        const par = 0.6 + seeded(i * 3.3) * 0.8, size = (kind === "sand" ? 2 : 3) + seeded(i * 1.9) * (kind === "petal" ? 7 : 9);
        let x, y;
        if (kind === "sand") {            // blown sideways, fast, low
          x = ((seeded(i * 7.1) * (W + 200) - cameraX * par - frameTime * (260 + seeded(i) * 220)) % (W + 200) + (W + 200)) % (W + 200) - 100;
          y = H * 0.35 + seeded(i * 5.7) * H * 0.65 + Math.sin(frameTime * 3 + i) * 6;
        } else if (kind === "petal") {    // drifting down, swaying
          x = ((seeded(i * 7.1) * (W + 100) - cameraX * par + Math.sin(frameTime * 0.8 + i) * 50 - frameTime * 20) % (W + 100) + (W + 100)) % (W + 100) - 50;
          y = ((seeded(i * 5.7) * H + frameTime * (25 + seeded(i) * 25)) % (H + 40)) - 20;
        } else {                          // dust floats, sparks rise
          x = ((seeded(i * 7.1) * (W + 100) - cameraX * par + Math.sin(frameTime * 0.3 + i) * 30) % (W + 100) + (W + 100)) % (W + 100) - 50;
          y = ((seeded(i * 5.7) * H - frameTime * (kind === "spark" ? 30 + seeded(i) * 30 : 6 + seeded(i) * 10)) % H + H) % H;
        }
        ctx.globalAlpha = L.motes * (0.4 + Math.sin(frameTime * 1.3 + i * 2) * 0.3);
        if (kind === "petal") {
          ctx.save(); ctx.translate(x, y); ctx.rotate(frameTime * (1 + seeded(i)) + i);
          ctx.drawImage(art, -size / 2, -size / 4, size, size / 2); ctx.restore();
        } else if (kind === "sand") ctx.drawImage(art, x - size * 3, y - size / 2, size * 6, size);
        else ctx.drawImage(art, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // Close to the lens: things slide past faster than the world, out of focus.
    if (L.foreground && quality === 0) {
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

  // The colour wash eases from one place to the next over a second or two, so
  // walking into a new painting never snaps the whole picture to a new colour.
  const hexRgb = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const ease = { grade: null, lift: null, vig: 0.5 };
  function easeTo(cur, want, k) { if (!cur) return want.slice(); for (let i = 0; i < 3; i++) cur[i] += (want[i] - cur[i]) * k; return cur; }
  function grade() {
    const L = look();
    if (!L) return;
    ctx.save();
    const k = 0.035;
    ease.grade = easeTo(ease.grade, L.grade ? hexRgb(L.grade) : [255, 255, 255], k);
    ease.lift = easeTo(ease.lift, L.lift ? hexRgb(L.lift) : [0, 0, 0], k);
    ease.vig += ((L.vignette || 0.5) - ease.vig) * k;
    // The world's colour: a soft wash over everything (multiply), then a lift of the darks.
    const rgb = c => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
    if (quality === 0) { ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = rgb(ease.grade); ctx.fillRect(0, 0, W, H); }
    if (quality === 0 && (ease.lift[0] + ease.lift[1] + ease.lift[2]) > 1) { ctx.globalCompositeOperation = "screen"; ctx.fillStyle = rgb(ease.lift); ctx.fillRect(0, 0, W, H); }
    // Vignette: the corners fall away into the dark.
    ctx.globalCompositeOperation = "source-over";
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75);
    v.addColorStop(0, "rgba(0, 0, 0, 0)"); v.addColorStop(1, `rgba(0, 0, 0, ${ease.vig.toFixed(3)})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  return { back, reflect, front, grade, quality: () => quality };
})();
