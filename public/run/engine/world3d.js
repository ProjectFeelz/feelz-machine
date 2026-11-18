"use strict";

/* ---------------------------------------------------------------------------
   3D BUILDINGS (Feelz Engine)

   The buildings you run across, and a row of buildings further back, drawn
   as real modelled 3D (the Meshy set in assets/models/world) through one
   perspective camera that follows the game camera. The play plane (z = 0)
   lines up with the 2D world to the pixel, so the roofs sit exactly where
   the game's floors are; everything behind it shrinks and slides by with
   real depth, and the storm's lightning lights them.

   Play is unchanged. The 2D roof drawing hands over to this file only for
   the missions and worlds set in config (WORLD3D); anything not loaded yet,
   a device without WebGL, or ?world3d=0 keeps the painted 2D buildings.

     World3D.draw()       render the layer and drop it into the 2D picture
                          (call it straight after the background)
     World3D.covers(s)    a roof solid this frame drew in 3D (skip its 2D body)
--------------------------------------------------------------------------- */

const World3D = (() => {
  const THREE_URL = "vendor/three-0.160.0/three.module.min.js";
  const LIB_URL = "vendor/three-0.160.0/gltf-lib.js";
  const D = 14;                       // metres from the camera to the play plane
  let THREE = null, LIB = null, state = "idle";
  let renderer = null, glCanvas = null, scene = null, camera = null, lights = null;
  const models = {};                  // name -> { state, proto, deck, width, depth, low }
  const fronts = new Map();           // roof solid -> { group, world }
  const backs = new Map();            // slot key -> object
  const drawn = new Set();            // roof solids drawn in 3D this frame
  let fillMat = null, fillGeo = null;
  let slow = 0, lastAt = 0;

  const flag = (() => { try { return new URLSearchParams(location.search).get("world3d"); } catch (e) { return null; } })();
  const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  const QUALITY = phone ? 0.6 : 1;    // render size against the game canvas

  function config() { return typeof WORLD3D !== "undefined" ? WORLD3D : null; }
  function worldSet(world) {
    const c = config();
    if (!c || flag === "0" || !mission || !(c.missions || []).includes(mission.id)) return null;
    return c.worlds[world] || null;
  }

  function webgl() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
  }

  function start() {
    if (state !== "idle") return;
    if (!webgl()) { state = "failed"; return; }
    state = "loading";
    Promise.all([import(new URL(THREE_URL, document.baseURI).href), import(new URL(LIB_URL, document.baseURI).href)]).then(([three, lib]) => {
      THREE = three; LIB = lib;
      glCanvas = document.createElement("canvas");
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !phone, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(W * QUALITY), Math.round(H * QUALITY), false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      glCanvas.addEventListener("webglcontextlost", e => { e.preventDefault(); state = "failed"; });
      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x2a2620, D + 5, D + 50);
      camera = new THREE.PerspectiveCamera(2 * Math.atan((H / 2 / PX) / D) * 180 / Math.PI, W / H, 0.5, 400);
      lights = {
        sky: new THREE.HemisphereLight(0xc4ccd8, 0x3a3024, 1.6),
        key: new THREE.DirectionalLight(0xffe2c0, 2.0),
        flash: new THREE.DirectionalLight(0xdfe8ff, 0),
      };
      lights.key.position.set(-6, 10, 8);
      lights.flash.position.set(4, 12, 10);
      Object.values(lights).forEach(l => scene.add(l));
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        scene.environment = pm.fromScene(new LIB.RoomEnvironment(), 0.04).texture;
        pm.dispose();
      } catch (e) { /* lights only */ }
      fillGeo = new THREE.BoxGeometry(1, 1, 1);
      fillMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
      state = "ready";
      // Load the whole set for this mission now, so a roof never waits on its model.
      const c = config();
      for (const ws of Object.values((c && c.worlds) || {})) for (const n of [...(ws.fronts || []), ...((ws.back && ws.back.models) || [])]) model(n);
    }).catch(err => { console.warn("[world3d] not available:", err && err.message); state = "failed"; });
  }

  // Load a building once: measure it, find its roof deck (the level you
  // stand on, not the water tank on top) and keep it as the one to copy.
  function model(name) {
    const m = models[name];
    if (m) return m.state === "ready" ? m : null;
    const rec = models[name] = { state: "loading" };
    const loader = new LIB.GLTFLoader();
    loader.setMeshoptDecoder(LIB.MeshoptDecoder);
    loader.load(new URL("assets/models/world/" + name + ".glb", document.baseURI).href, gltf => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
      // Rays straight down over the middle of the roof: the most common height is the deck.
      const ray = new THREE.Raycaster(), hits = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        const x = box.min.x + size.x * (0.2 + i * 0.15), z = box.min.z + size.z * (0.2 + j * 0.15);
        ray.set(new THREE.Vector3(x, box.max.y + 1, z), new THREE.Vector3(0, -1, 0));
        const h = ray.intersectObject(root, true)[0];
        if (h) hits.push(h.point.y);
      }
      hits.sort((a, b) => a - b);
      const deck = hits.length ? hits[Math.floor(hits.length * 0.5)] : box.max.y;
      root.traverse(o => {
        if (!o.isMesh || !o.material) return;
        o.material.envMapIntensity = 0.55;
        // rain soaked: a little more sheen than Meshy gives them
        if (o.material.roughness !== undefined) o.material.roughness = Math.min(o.material.roughness, 0.78);
      });
      // Centred on x, the front face on z = 0, the deck at y = 0.
      const holder = new THREE.Group();
      root.position.set(-(box.min.x + box.max.x) / 2, -deck, -box.max.z);
      holder.add(root);
      Object.assign(rec, { state: "ready", proto: holder, deck, width: size.x, depth: size.z, low: box.min.y - deck, height: size.y });
    }, undefined, () => { rec.state = "failed"; });
    return null;
  }

  function tintCopy(proto, tint) {
    const g = proto.clone(true);
    if (tint !== undefined) {
      g.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(tint));
      });
    }
    return g;
  }

  // A roof you run on: the 2D game splits it into panels about 8 m wide;
  // each panel is one building, sized to the panel, its deck on the floor.
  function buildFront(s, set) {
    const list = set.fronts, n = Math.max(1, Math.round(s.w / m(8))), pw = s.w / n / PX;
    const names = [];
    for (let i = 0; i < n; i++) names.push(list[Math.floor(seeded(s.seed * 3.1 + i * 7.7) * list.length) % list.length]);
    const ms = names.map(model);
    if (ms.some(x => !x)) return null;     // not all in yet: 2D this frame
    const group = new THREE.Group();
    const top = -s.y / PX, bottomY = -(s.y + Math.min(s.h, m(60))) / PX;
    ms.forEach((md, i) => {
      const k = pw / md.width;
      const b = tintCopy(md.proto, set.tint);
      b.scale.setScalar(k);
      b.position.set(s.x / PX + pw * (i + 0.5), top, 0);
      group.add(b);
      // Taller than the building: dark wall the rest of the way down.
      const under = top + md.low * k;
      if (under > bottomY + 0.05) {
        const f = new THREE.Mesh(fillGeo, fillMat);
        const dpt = md.depth * k * 0.9;
        f.scale.set(pw * 0.96, under - bottomY, dpt);
        f.position.set(s.x / PX + pw * (i + 0.5), (under + bottomY) / 2, -dpt / 2 - 0.05);
        group.add(f);
      }
    });
    scene.add(group);
    return group;
  }

  // The row further back: buildings on the street at depth, slots every
  // `gap` metres, picked from the world's set by the slot's seed.
  function placeBacks(set, world, camXm, viewW, used) {
    const row = set.back;
    if (!row) return;
    const z = -row.depth, spread = (D + row.depth) / D;    // how much wider the view is that far back
    const from = Math.floor((camXm - viewW * spread * 0.6) / row.gap), to = Math.ceil((camXm + viewW * spread * 0.6) / row.gap);
    for (let k = from; k <= to; k++) {
      const key = world + ":" + k;
      used.add(key);
      if (backs.has(key)) { backs.get(key).visible = true; continue; }
      const list = row.models || set.fronts;
      const name = list[Math.floor(seeded(k * 5.3 + 11) * list.length) % list.length];
      const md = model(name);
      if (!md) continue;
      const w = row.width * (0.85 + seeded(k * 2.7) * 0.3), sc = w / md.width;
      const b = tintCopy(md.proto, row.tint !== undefined ? row.tint : set.tint);
      b.scale.setScalar(sc);
      // standing on the street: the model's bottom on y = 0
      b.position.set(k * row.gap + (seeded(k * 9.1) - 0.5) * row.gap * 0.3, -md.low * sc + (row.y || 0), z - seeded(k * 4.4) * 6);
      scene.add(b);
      backs.set(key, b);
    }
  }

  function draw() {
    drawn.clear();
    const sec = sectionAt(cameraX + W / 2);
    const set = sec && worldSet(sec.world);
    if (!set) { hideAll(); return; }
    if (state === "idle") start();
    if (state !== "ready") return;
    // A device that can't keep up goes back to the painted buildings by itself.
    const now = performance.now(), dt = now - lastAt;
    lastAt = now;
    if (dt > 0 && dt < 250) slow = dt > 28 ? slow + dt : Math.max(0, slow - dt * 0.5);
    if (slow > 4000 && flag !== "1") { console.warn("[world3d] too slow on this device, using the painted buildings"); state = "failed"; hideAll(); drawn.clear(); return; }
    const camXm = (cameraX + W / 2) / PX, camYm = -(cameraY + H / 2) / PX, viewW = W / PX;
    camera.position.set(camXm, camYm, D);
    camera.lookAt(camXm, camYm, 0);
    // Weather: darker the harder the storm, a cold flash with the lightning.
    const sk = Math.min(1, storm.strength || 0);
    scene.fog.color.setHex(set.fog);
    lights.sky.intensity = 1.6 - sk * 0.5;
    lights.key.intensity = 2.0 - sk * 0.9;
    lights.flash.intensity = Math.min(1, flash || 0) * 2.4 + (lightningBolt ? 1.2 : 0);
    // The roofs on screen (and a little either side).
    const live = new Set();
    for (const s of level.solids) {
      if (s.kind !== "roof" || !onScreen(s.x, s.w, 300)) continue;
      const w = sectionAt(s.x + s.w / 2).world, ws = worldSet(w);
      if (!ws || !ws.fronts) continue;
      let f = fronts.get(s);
      if (!f) { const g = buildFront(s, ws); if (!g) continue; f = { group: g }; fronts.set(s, f); }
      f.group.visible = true;
      live.add(s);
      drawn.add(s);
    }
    for (const [s, f] of fronts) if (!live.has(s)) f.group.visible = false;
    const used = new Set();
    placeBacks(set, sec.world, camXm, viewW, used);
    for (const [k, b] of backs) if (!used.has(k)) { b.visible = false; if (!onScreenM(b.position.x, viewW * 4, camXm)) { scene.remove(b); backs.delete(k); } }
    renderer.render(scene, camera);
    ctx.drawImage(glCanvas, 0, 0, glCanvas.width, glCanvas.height, cameraShakeX(), cameraShakeY(), W, H);
  }
  const onScreenM = (x, span, cx) => Math.abs(x - cx) < span;
  // the 2D picture is already shifted by the shake (ctx.translate), so nothing to add here
  const cameraShakeX = () => 0, cameraShakeY = () => 0;

  function hideAll() {
    for (const f of fronts.values()) f.group.visible = false;
    for (const b of backs.values()) b.visible = false;
  }

  // A new run: drop everything built for the last level.
  function reset() {
    for (const f of fronts.values()) scene && scene.remove(f.group);
    for (const b of backs.values()) scene && scene.remove(b);
    fronts.clear(); backs.clear(); drawn.clear();
  }

  const debug = () => ({ state, fronts: fronts.size, backs: backs.size, drawn: drawn.size, mission: mission && mission.id, world: sectionAt(cameraX + W / 2).world,
    models: Object.fromEntries(Object.entries(models).map(([k, v]) => [k, v.state])) });
  return { draw, covers: s => drawn.has(s), reset, debug };
})();
