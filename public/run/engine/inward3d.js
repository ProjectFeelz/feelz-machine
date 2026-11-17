"use strict";

/* ---------------------------------------------------------------------------
   INWARD RUNS IN 3D (Feelz Engine)

   The inward runs (the camera behind the runner, running into the picture)
   drawn as a real 3D scene with three.js: a street or platform with three
   lanes, buildings either side built from the same wall panels as the
   side-on levels, the section's painting at the far end so you run into it,
   and the obstacles, records and runner as solid things with depth.

   Play is unchanged: engine/inward.js still owns the lanes, the jumping,
   the hits and the records. This file only draws what that state says.

   three.js loads the first time a mission has an inward run (it is not
   needed anywhere else). If it cannot load, or WebGL is not available,
   draw() answers false and the 2D inward drawing carries on as before.

   A future inward-running game can use this on its own: it needs the
   `inward` state object (lanes, items, pick, length, sec), the players
   (lane, laneX, iz, iy, islide, animClock, invuln) and a back-view sprite
   sheet laid out like SPRITES.back.
--------------------------------------------------------------------------- */

const Inward3D = (() => {
  const LANE = IN_LANE / IN_PXM;           // metres between lane centres, the same as the 2D view
  const THREE_URL = "vendor/three-0.160.0/three.module.min.js";
  let THREE = null, state = "idle";        // idle | loading | ready | failed
  let renderer = null, glCanvas = null, camera = null, scene = null;
  let built = null;                        // the section the scene was built for
  const dyn = { obstacles: [], records: [], runners: new Map(), boards: [], lamps: [], rain: null };
  const texCache = new Map();

  function preload() {
    if (state !== "idle") return;
    state = "loading";
    let ok = false;
    try { const t = document.createElement("canvas"); ok = !!(t.getContext("webgl2") || t.getContext("webgl")); } catch (e) { ok = false; }
    if (!ok) { state = "failed"; return; }
    import(new URL(THREE_URL, document.baseURI).href)
      .then(mod => { THREE = mod; init(); state = "ready"; })
      .catch(err => { console.warn("[inward3d] 3D not available, using the 2D view:", err && err.message); state = "failed"; });
  }

  function init() {
    glCanvas = document.createElement("canvas");
    glCanvas.width = W; glCanvas.height = H;
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    glCanvas.addEventListener("webglcontextlost", e => { e.preventDefault(); state = "failed"; });
    camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 400);
  }

  /* ---------- textures, cut from the game's own art ---------- */

  function canvasTex(key, w, h, paint, repeat) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    paint(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
    return t;
  }
  const fromSheet = (img, r) => (g, w, h) => { if (img && img.ready !== false && r) g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h); };
  const tileTex = name => canvasTex("tile:" + name, 256, 256, fromSheet(art.tiles, TILES[name]), true);
  const kitTex = (name, w, h) => canvasTex("kit:" + name, w || 256, h || 256, fromSheet(art.kit, KIT[name]), false);
  function repeated(tex, rx, ry) { const t = tex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }

  function floorTex() {
    return canvasTex("floor", 256, 256, (g, w, h) => {
      const r = TILES.street_stone;
      if (art.tiles.ready && r) { g.drawImage(art.tiles, r[0], r[1], r[2], r[3], 0, 0, w, h / 2); g.drawImage(art.tiles, r[0], r[1], r[2], r[3], 0, h / 2, w, h / 2); }
      else { g.fillStyle = "#26252b"; g.fillRect(0, 0, w, h); }
      g.fillStyle = "rgba(8, 8, 14, 0.45)"; g.fillRect(0, 0, w, h);   // wet and dark, like the paintings' streets
    }, true);
  }
  function hazardTex() {
    return canvasTex("hazard", 256, 32, (g, w, h) => {
      g.fillStyle = "#f2b630"; g.fillRect(0, 0, w, h); g.fillStyle = "#16161a";
      for (let i = -h; i < w + h; i += h * 2.2) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.lineTo(i + h * 2, 0); g.lineTo(i + h, h); g.fill(); }
    }, false);
  }
  function recordTex() {
    return canvasTex("record", 128, 128, (g, w) => {
      const c = w / 2;
      g.fillStyle = "#0c0c0e"; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1;
      for (let r = c * 0.45; r < c - 3; r += 3) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = "#f1ca78"; g.beginPath(); g.arc(c, c, c * 0.36, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0c0c0e"; g.beginPath(); g.arc(c, c, c * 0.06, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * 0.75, -0.7, 0.4); g.stroke();
    }, false);
  }
  function glowTex() {
    return canvasTex("glow", 64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,0.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    }, false);
  }
  function backdropTex(sec) {
    const img = sec.backdrop ? art.loc[sec.backdrop] : null;
    if (!img || !img.ready) return null;
    const key = "loc:" + sec.backdrop;
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    texCache.set(key, t);
    return t;
  }

  /* ---------- building the scene for one inward section ---------- */

  function clearScene() {
    if (!scene) return;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.map && !mt.map.userData.shared) mt.map.dispose(); mt.dispose(); });
    });
    scene = null;
    dyn.obstacles = []; dyn.records = []; dyn.runners.clear(); dyn.boards = []; dyn.lamps = []; dyn.rain = null;
  }

  const rgb = c => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
  const lam = (opts) => new THREE.MeshLambertMaterial(opts);

  function build(sec) {
    clearScene();
    built = sec;
    scene = new THREE.Scene();
    const L = inward.length, far = L + 90;
    const worldId = (sectionAt(m(sec.from)) || {}).world || "mc";
    const ww = WORLD_WALLS[worldId] || WORLD_WALLS.mc;
    const voidRun = worldId === "ve";
    const haze = sceneHaze();
    const fogCol = rgb(haze).multiplyScalar(1.15);
    scene.background = fogCol.clone();
    scene.fog = new THREE.Fog(fogCol, 16, Math.min(85, L + 40));

    // light: a warm key from behind the camera, the sky above, the dark street below
    scene.add(new THREE.HemisphereLight(0xffe7c4, 0x2a2633, 2.3));
    const key = new THREE.DirectionalLight(0xffd29a, 2.2); key.position.set(-6, 12, 10); scene.add(key);
    const rim = new THREE.DirectionalLight(rgb(haze).multiplyScalar(2.2), 1.4); rim.position.set(4, 6, -30); scene.add(rim);

    // the painting at the far end: you run into it
    const bt = backdropTex(sec);
    if (bt) {
      const img = bt.image, ph = 70, pw = ph * img.width / img.height;
      const paint = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: bt, fog: false }));
      paint.position.set(0, ph * 0.36, -(L + 70));
      bt.userData.shared = true;
      scene.add(paint);
    }

    // the runway
    const runW = LANE * 3 + 0.4, run = new THREE.Mesh(new THREE.PlaneGeometry(runW, far + 30),
      lam({ map: repeated(floorTex(), runW / 2.2, (far + 30) / 2.2), color: 0xcfc8c0 }));
    run.rotation.x = -Math.PI / 2; run.position.set(0, 0, -(far + 30) / 2 + 12); scene.add(run);
    // gold lane lines that glow, and dashes down the middle of each lane
    const gold = new THREE.MeshBasicMaterial({ color: 0xf1ca78, fog: true });
    for (const e of [-1.5, -0.5, 0.5, 1.5]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(e === -1.5 || e === 1.5 ? 0.09 : 0.05, far + 30), gold);
      line.rotation.x = -Math.PI / 2; line.position.set(e * LANE, 0.012, -(far + 30) / 2 + 12); scene.add(line);
    }
    const dashGeo = new THREE.PlaneGeometry(0.07, 0.9), dashMat = new THREE.MeshBasicMaterial({ color: 0xffdc96, transparent: true, opacity: 0.4 });
    const nD = Math.ceil((far + 20) / 3) * 3, dashes = new THREE.InstancedMesh(dashGeo, dashMat, nD);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (let z = 10; z > -far; z -= 3) for (const l of [-1, 0, 1]) { if (n >= nD) break; M.compose(new THREE.Vector3(l * LANE, 0.011, z), q, one); dashes.setMatrixAt(n++, M); }
    dashes.count = n; scene.add(dashes);

    if (!voidRun) {
      // pavements, then a canyon of buildings either side, from the same wall panels as the side-on streets
      for (const side of [-1, 1]) {
        const pave = new THREE.Mesh(new THREE.PlaneGeometry(3, far + 30), lam({ map: repeated(floorTex(), 1.4, (far + 30) / 2.2), color: 0x8f8a86 }));
        pave.rotation.x = -Math.PI / 2; pave.position.set(side * (runW / 2 + 1.5), 0.04, -(far + 30) / 2 + 12); scene.add(pave);
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, far + 30), lam({ color: 0x3a3632 }));
        kerb.position.set(side * (runW / 2 + 0.09), 0.08, -(far + 30) / 2 + 12); scene.add(kerb);
        let z = 14, i = 0;
        while (z > -(L + 60)) {
          const wdt = 5 + seeded(i * 3.1 + side) * 5, dep = 6 + seeded(i * 5.7 + side) * 6, hgt = 7 + seeded(i * 7.3 + side * 2) * 16;
          const lit = seeded(i * 2.3 + side * 9) < 0.45;
          const wall = tileTex("wall_" + ww.wall + "_win" + (lit ? "_lit" : ""));
          const shade = 0.75 + ww.shade * 0.5;
          const mat = lam({ map: repeated(wall, wdt / 2, hgt / 2), color: new THREE.Color(shade, shade * 0.97, shade * 0.95) });
          if (lit) { mat.emissive = new THREE.Color(0xffb35a); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.06; }
          const b = new THREE.Mesh(new THREE.BoxGeometry(dep, hgt, wdt), mat);
          b.position.set(side * (runW / 2 + 3 + dep / 2), hgt / 2, z - wdt / 2);
          scene.add(b);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(dep + 0.3, 0.35, wdt + 0.3), lam({ color: 0x2a2b30 }));
          cap.position.set(b.position.x, hgt + 0.17, b.position.z); scene.add(cap);
          if (seeded(i * 4.9 + side) < 0.35) {   // a lamp post on the pavement, with a warm pool of light
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), lam({ color: 0x1c1c22 }));
            post.position.set(side * (runW / 2 + 0.9), 2.1, z - wdt / 2); scene.add(post);
            const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            bulb.scale.set(1.6, 1.6, 1); bulb.position.set(post.position.x - side * 0.3, 4.2, post.position.z); scene.add(bulb);
          }
          z -= wdt + 0.3; i++;
        }
      }
    } else {
      // the Veil: no streets, just the runway over the void, with pillars of light far off
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1, z = 8 - i * ((L + 50) / 26), h = 6 + seeded(i * 3.3) * 18;
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 1.2), lam({ color: fogCol.clone().multiplyScalar(0.55), emissive: fogCol, emissiveIntensity: 0.35 }));
        p.position.set(side * (8 + seeded(i * 1.7) * 14), h / 2 - 6, z); scene.add(p);
      }
      const edge = new THREE.MeshBasicMaterial({ color: 0xf1ca78 });
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, far + 30), edge); e.position.set(s * runW / 2, 0.02, -(far + 30) / 2 + 12); scene.add(e); }
    }

    // the obstacles
    for (const o of inward.items) {
      const lanes = o.lane === "all" ? [-1, 0, 1] : [o.lane];
      for (const lane of lanes) {
        const pick = Math.floor(seeded(Math.round(o.d * 10) + lane * 7) * 3);
        const g = new THREE.Group(), x = lane * LANE;
        g.position.set(x, 0, -o.d);
        if (o.kind === "low") addLow(g, pick);
        else if (o.kind === "high") addHigh(g, o, lane);
        else addBlock(g, ww, o, lane, pick);
        addShadow(g, o.kind === "block" ? 2.4 : 1.2);
        scene.add(g);
        dyn.obstacles.push(g);
      }
    }

    // records to collect: spinning vinyl
    const rec = recordTex();
    for (const r of inward.pick) {
      const mat = new THREE.MeshBasicMaterial({ map: rec, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), mat);
      disc.position.set(r.lane * LANE, 0.75, -r.d);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xf1ca78, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.2, 1.2, 1); disc.add(glow);
      scene.add(disc);
      dyn.records.push({ r, disc });
    }

    // rain, when the level has it
    const rainAmt = mission.weather && mission.weather.rain !== undefined ? mission.weather.rain : 0.15;
    if (rainAmt > 0.05 && worldId !== "ve") {
      const N = 900, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 24; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = -Math.random() * 40; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      dyn.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      scene.add(dyn.rain);
    }
  }

  function addShadow(g, len) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 0.98, len), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    s.rotation.x = -Math.PI / 2; s.position.set(0, 0.02, -len / 2 + 0.2); g.add(s);
  }

  const wood = () => lam({ color: 0x6b4a2c });
  function addLow(g, pick) {
    const crate = kitTex("crate", 128, 128), half = kitTex("crate_half", 96, 96);
    if (pick === 0) {   // a stack of crates
      const cm = lam({ map: crate });
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.82, 0.85), cm); a.position.set(-0.45, 0.41, -0.42); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.82, 0.85), cm); b.position.set(0.45, 0.41, -0.55); g.add(b);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.38, 0.4), lam({ map: half })); c.position.set(-0.02, 1.01, -0.5); g.add(c);
    } else if (pick === 1) {   // barrels
      const side = canvasTex("kit:barrel-wrap", 256, 128, (gg, w, h) => { const r = KIT.barrel; if (art.kit.ready) { for (let i = 0; i < 4; i++) gg.drawImage(art.kit, r[0], r[1], r[2], r[3], i * w / 4, 0, w / 4, h); } }, false);
      for (const du of [-0.58, 0, 0.58]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.9, 18), [lam({ map: side }), lam({ color: 0x3b2a1c }), lam({ color: 0x3b2a1c })]);
        bar.position.set(du, 0.45, du === 0 ? -0.3 : -0.1); g.add(bar);
      }
    } else {   // a market cart
      const front = kitTex("cart", 256, 138);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.73, 1.4), [wood(), wood(), lam({ color: 0x73502d }), wood(), lam({ map: front }), wood()]);
      body.position.set(0, 0.48, -0.7); g.add(body);
      for (const s of [-1, 1]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), lam({ color: 0x241a12 })); wheel.rotation.z = Math.PI / 2; wheel.position.set(s * 0.9, 0.22, -0.7); g.add(wheel); }
    }
  }

  function addHigh(g, o, lane) {
    const steel = lam({ color: 0x3a3f47 });
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.25), steel); post.position.set(s * 0.43 * LANE, 1.3, -0.12); g.add(post); }
    // the beam carries a Feelz Machine billboard, flipping between the ads
    const idx = (Math.round(o.d * 3) + lane + 5) % BILLBOARD_ADS.length;
    const panel = billboardPanel(idx, 340, 150);
    const tex = new THREE.CanvasTexture(panel); tex.colorSpace = THREE.SRGBColorSpace;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.98 * LANE, 1.17, 0.4), [steel, steel, lam({ color: 0x262a31 }), steel, new THREE.MeshBasicMaterial({ map: tex }), steel]);
    beam.position.set(0, 1.28 + 1.17 / 2, -0.15); g.add(beam);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.96 * LANE, 0.1), new THREE.MeshBasicMaterial({ map: hazardTex() }));
    stripe.position.set(0, 1.25, 0.06); g.add(stripe);
    dyn.boards.push({ tex, seed: idx, at: idx });
  }

  function addBlock(g, ww, o, lane, pick) {
    const lit = seeded(Math.round(o.d * 3) + lane) < 0.5 ? "_lit" : "";
    const front = canvasTex("blockfront:" + ww.wall + lit + pick, 256, 340, (gg, w, h) => {
      const t = (name, x, y, ww2, hh) => { const r = TILES[name]; if (r && art.tiles.ready) gg.drawImage(art.tiles, r[0], r[1], r[2], r[3], x, y, ww2, hh); };
      const rowH = h / 1.7;
      t("wall_" + ww.wall + "_win" + lit, 0, 0, w, rowH);
      if (pick === 0) { t("wall_" + ww.wall, 0, rowH, w, h - rowH); t("shutter", w * 0.22, rowH + (h - rowH) * 0.25, w * 0.56, (h - rowH) * 0.75); }
      else t("wall_" + ww.wall + "_win", 0, rowH, w, h - rowH);
      t("cap_metal", 0, 0, w, h * 0.05);
      gg.fillStyle = `rgba(8, 10, 18, ${(1 - ww.shade) * 0.6})`; gg.fillRect(0, 0, w, h);
    }, false);
    const side = lam({ map: repeated(tileTex("wall_" + ww.wall), 1.1, 1.7), color: 0x9a9a9e });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.96 * LANE, 3.4, 2.2), [side, side, lam({ color: 0x1d1e22 }), side, lam({ map: front }), side]);
    box.position.set(0, 1.7, -1.1); g.add(box);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff5032, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lamp.scale.set(0.9, 0.9, 1); lamp.position.set(0, 3.15, 0.08); g.add(lamp);
    dyn.lamps.push(lamp);
  }

  /* ---------- the runner: the back-view sprite sheet on a card that faces the camera ---------- */

  function runnerSheet(p) {
    const zora = mission.player === "zora";
    let img = zora ? art.back.zora : art.back.koda;
    if (!img || !img.ready) return null;
    if (!zora && p.id === 1 && playerOutfit !== "gold" && art.back.koda_mask.ready) {
      backOutfits[playerOutfit] = backOutfits[playerOutfit] || recolorSheet(img, art.back.koda_mask, playerOutfit) || img;
      img = backOutfits[playerOutfit];
    }
    if (p.id === 2) { const k = zora ? "z" : "k"; backTint[k] = backTint[k] || tintSheet(img); img = backTint[k]; }
    return img;
  }

  function runnerFor(p) {
    let r = dyn.runners.get(p.id);
    const img = runnerSheet(p);
    if (!img) return null;
    if (!r || r.img !== img) {
      if (r) { scene.remove(r.group); r.tex.dispose(); }
      const B = SPRITES.back;
      const tex = img.tagName === "CANVAS" ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      tex.repeat.set(B.cell / img.width, B.cell / img.height);
      tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const size = B.metres;
      const card = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, fog: false }));
      card.position.y = size / 2 - size * (1 - B.footY);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.32, 1); shadow.position.y = 0.025;
      const group = new THREE.Group(); group.add(card); scene.add(group); scene.add(shadow);
      r = { group, card, shadow, tex, img };
      dyn.runners.set(p.id, r);
    }
    return r;
  }

  function poseRunner(p) {
    const r = runnerFor(p);
    if (!r) return;
    const B = SPRITES.back;
    let anim = "run_back", frame = Math.floor(p.animClock * 14) % 10;
    if (p.islide > 0) { anim = "slide_back"; frame = Math.min(5, 2 + Math.floor((0.75 - p.islide) * 8) % 4); }
    else if (p.iy > 0) { anim = p.ivy > 0 ? "jump_back" : "fall_back"; frame = Math.min(3, Math.floor(p.animClock * 8) % 4); }
    const a = B.animations[anim];
    const cw = B.cell / r.img.width, ch = B.cell / r.img.height;
    r.tex.offset.set(frame * cw, 1 - (a.row + 1) * ch);
    const x = p.laneX * LANE, z = -p.iz;
    r.group.position.set(x, p.iy, z);
    r.shadow.position.set(x, 0.025, z);
    r.shadow.material.opacity = Math.max(0.12, 0.4 - p.iy * 0.12);
    r.group.visible = !(p.invuln > 0 && Math.floor(frameTime * 14) % 2 === 0) && !p.finished;
  }

  /* ---------- each frame ---------- */

  function draw() {
    if (state !== "ready" || !inward.active || !inward.sec) return false;
    try {
      if (built !== inward.sec || !scene) build(inward.sec);
      const lead = leader();
      const cz = -lead.iz;
      for (const p of players) poseRunner(p);
      for (const { r, disc } of dyn.records) {
        disc.visible = !r.taken.includes(lead.id);
        disc.rotation.y = frameTime * 3 + r.d;
        disc.position.y = 0.75 + Math.sin(frameTime * 3 + r.d) * 0.06;
      }
      for (const l of dyn.lamps) l.material.opacity = 0.7 + Math.sin(frameTime * 10) * 0.3;
      for (const b of dyn.boards) {   // flip to the next ad now and then
        const idx = (b.seed + Math.floor((frameTime + b.seed) / 4.2)) % BILLBOARD_ADS.length;
        if (idx !== b.at) { b.at = idx; b.tex.image = billboardPanel(idx, 340, 150); b.tex.needsUpdate = true; }
      }
      if (dyn.rain) {
        const a = dyn.rain.geometry.attributes.position, arr = a.array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= 0.45;
          if (arr[i + 1] < 0 || arr[i + 2] > cz + 4 || arr[i + 2] < cz - 40) { arr[i + 1] = 10 + Math.random() * 4; arr[i + 2] = cz + 2 - Math.random() * 40; arr[i] = (Math.random() - 0.5) * 24; }
        }
        a.needsUpdate = true;
      }
      // the camera: low behind the leader, leaning a little into their lane
      const sxk = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0, syk = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;
      camera.position.set(lead.laneX * LANE * 0.4 + sxk, 2.55 + lead.iy * 0.25 + syk, cz + 4.4);
      camera.lookAt(lead.laneX * LANE * 0.25, 1.05 + lead.iy * 0.2, cz - 12);
      renderer.render(scene, camera);
      ctx.drawImage(glCanvas, 0, 0, W, H);
      return true;
    } catch (e) {
      console.warn("[inward3d] falling back to the 2D view:", e && e.message);
      state = "failed";
      return false;
    }
  }

  return { preload, draw, get state() { return state; } };
})();
