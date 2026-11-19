"use strict";

/* ---------------------------------------------------------------------------
   3D CHARACTERS (Feelz Engine)

   The runner drawn as a real, rigged 3D model instead of a sprite sheet, so
   every move plays at the full frame rate of the screen with its own light,
   rim light and shadow. The side-on world stays 2D: the model is rendered
   into a small offscreen canvas each frame and dropped into the 2D picture
   exactly where the sprite would have gone, so draw order, reflections,
   afterimages and co-op tints all keep working.

   Play is unchanged. This file only draws. Any move the model has no clip
   for, a phone without WebGL, or a model that fails to load, falls straight
   back to the sprite sheet.

   Setup lives in config (CHAR3D): the .glb, its height in metres, and which
   clip in the file plays each move. Turn it off for one browser with
   ?char3d=0 (and on with ?char3d=1 while testing).

     Char3D.preload(def)                     start loading (once)
     Char3D.ready(id)                        the model is in and usable
     Char3D.has(id, anim)                    there is a clip for this move
     Char3D.render(id, key, anim, t, facing) pose and render, answers the canvas
     Char3D.renderProp(id, yaw, pitch, roll) a prop (drone), centred
       t      0..1 through the move (looping moves wrap)
       The canvas is shared: draw it before the next render() call.
--------------------------------------------------------------------------- */

const Char3D = (() => {
  const THREE_URL = "vendor/three-0.160.0/three.module.min.js";
  const LIB_URL = "vendor/three-0.160.0/gltf-lib.js";
  const SIZE = 384;                  // pixels square of each runner's canvas
  let THREE = null, LIB = null, libState = "idle";
  let renderer = null, glCanvas = null, camera = null, scene = null, lights = null;
  const models = {};                 // id -> { state, def, root, mixer, actions, clips, height }

  const flag = (() => { try { return new URLSearchParams(location.search).get("char3d"); } catch (e) { return null; } })();
  const allowed = () => flag !== "0";

  function webgl() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
  }

  function loadLib() {
    if (libState !== "idle") return libState === "ready" ? Promise.resolve() : (loadLib.p || Promise.reject());
    libState = "loading";
    loadLib.p = Promise.all([
      import(new URL(THREE_URL, document.baseURI).href),
      import(new URL(LIB_URL, document.baseURI).href),
    ]).then(([three, lib]) => {
      THREE = three; LIB = lib;
      glCanvas = document.createElement("canvas");
      glCanvas.width = SIZE; glCanvas.height = SIZE;
      // Phones skip the edge smoothing: it is the costliest part and the
      // screens are dense enough not to need it (keeps the phone cooler).
      const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !phone, alpha: true, premultipliedAlpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(1);
      renderer.setSize(SIZE, SIZE, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
      glCanvas.addEventListener("webglcontextlost", e => { e.preventDefault(); libState = "failed"; });
      scene = new THREE.Scene();
      // Side-on, no perspective: the model lines up with the 2D world.
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
      lights = {
        sky: new THREE.HemisphereLight(0xbfd8ff, 0x2a2018, 1.1),
        key: new THREE.DirectionalLight(0xfff1dc, 3.2),
        rim: new THREE.DirectionalLight(0x7fe3ff, 2.2),
        fill: new THREE.DirectionalLight(0xffb070, 0.6),
      };
      lights.key.position.set(2.5, 4, 5);
      lights.rim.position.set(-3, 3, -4);       // from behind: the glossy edge light
      lights.fill.position.set(0, -2, 3);
      Object.values(lights).forEach(l => scene.add(l));
      // A soft studio reflection, for the glossy jacket and boots.
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        scene.environment = pm.fromScene(new LIB.RoomEnvironment(), 0.04).texture;
        pm.dispose();
      } catch (e) { /* plain lights only */ }
      libState = "ready";
    }).catch(err => {
      console.warn("[char3d] 3D characters not available, using sprites:", err && err.message);
      libState = "failed";
      throw err;
    });
    return loadLib.p;
  }

  /** Start loading a model. def: { id, src, metres, clips: { anim: clipName | { clip, loop } } } */
  function preload(def) {
    if (!def || !def.src || !allowed() || models[def.id]) return;
    if (!webgl()) { models[def.id] = { state: "failed" }; return; }
    const m = models[def.id] = { state: "loading", def };
    loadLib().then(() => {
      const loader = new LIB.GLTFLoader();
      loader.setMeshoptDecoder(LIB.MeshoptDecoder);
      loader.load(new URL(def.src, document.baseURI).href, gltf => {
        const root = gltf.scene;
        root.traverse(o => {
          if (o.isMesh) {
            o.frustumCulled = false;
            if (o.material) { o.material.envMapIntensity = 1; o.material.needsUpdate = true; }
          }
        });
        // Measure him by his skeleton (a skinned mesh's own box ignores the
        // bones), then scale him to his height in metres, feet on y = 0.
        const holder = new THREE.Group();
        holder.add(root);
        holder.updateMatrixWorld(true);
        if (def.prop) {
          // A thing with no skeleton (a drone): sized by its width, centred in
          // the canvas so the game can draw it centred on its own position.
          const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
          const k = (def.metres || 1) / Math.max(0.01, Math.max(size.x, size.z));
          root.scale.multiplyScalar(k);
          root.position.set(-mid.x * k, VIEW_METRES * (FOOT - 0.5) - mid.y * k, -mid.z * k);
          holder.visible = false;
          scene.add(holder);
          Object.assign(m, { state: "ready", root, holder, mixer: null, actions: {}, height: def.metres || 1 });
          return;
        }
        let lo = Infinity, hi = -Infinity;
        const v = new THREE.Vector3();
        root.traverse(o => { if (o.isBone) { o.getWorldPosition(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } });
        if (!isFinite(lo)) { const box = new THREE.Box3().setFromObject(root); lo = box.min.y; hi = box.max.y; }
        const scale = (def.metres || 1.8) / Math.max(0.01, hi - lo);
        root.scale.multiplyScalar(scale);
        root.position.y = -lo * scale;
        holder.visible = false;
        scene.add(holder);
        const mixer = new THREE.AnimationMixer(root);
        const byName = {};
        for (const c of gltf.animations) byName[c.name] = c;
        const actions = {};
        for (const [anim, spec] of Object.entries(def.clips || {})) {
          const name = typeof spec === "string" ? spec : spec.clip;
          const clip = byName[name];
          if (!clip) continue;
          const act = mixer.clipAction(clip);
          act.play();
          act.paused = true;               // we set the time ourselves, every frame
          act.enabled = false;
          const o = typeof spec === "object" ? spec : {};
          actions[anim] = { act, clip, loop: o.loop !== false, inPlace: !o.rootMotion,
            y: o.y || (o.holdY ? "hold" : "free"), from: o.from || 0, to: o.to || 0 };
        }
        Object.assign(m, { state: "ready", root, holder, mixer, actions, height: def.metres || 1.8 });
        // Keep the run in place: the game moves him, not the clip.
        // His standing hip height, from the idle: the level the game's feet line is drawn against.
        // (borrowed clips are levelled against the model's own one, def.stand)
        // ("rest": the hips where the model stands in its own rest pose)
        // Which way is up for the hips (Mixamo rigs often stand on their side
        // inside a turned armature): the bob and the height use that axis.
        let hips = null;
        root.traverse(o => { if (!hips && /hips$/i.test(o.name)) hips = o; });
        const up = upAxis(hips);
        const restY = def.stand === "rest" && hips ? up.sign * hips.position.getComponent(up.axis) : 0;
        const own = def.stand && actions[def.stand];
        const standY = restY || hipsStart(own && own.clip, up) || hipsStart(actions.idle && actions.idle.clip, up) || hipsStart(actions.run && actions.run.clip, up) || 1;
        for (const a of Object.values(actions)) if (a.inPlace) stripRootMotion(a.clip, a.y, standY, up);
      }, undefined, err => {
        console.warn("[char3d] could not load", def.src, err && err.message);
        m.state = "failed";
      });
    }).catch(() => { m.state = "failed"; });
  }

  // The hips track carries the clip's travel forward; the game already moves
  // the runner, so keep only the up and down bob.
  //
  // The up and down is set per move (config `y`), because for some moves the
  // game already carries him up or over and the clip must not do it twice:
  //   free   leave it (run, idle, attacks)
  //   hold   take out the steady rise from start to end (mantle: the game
  //          lifts him onto the ledge)
  //   level  hold, and set the hips at standing height (climb: the clip
  //          hangs him far above his feet)
  //   scale  borrowed from another body: hips scaled to this one's height
  //   cap    never above standing height (vault: the game's arc is the jump,
  //          the clip keeps the tuck and the roll)
  const hipsTrack = clip => clip && clip.tracks.find(t => /hips\.position$/i.test(t.name));
  function upAxis(hips) {
    if (!hips || !hips.parent) return { axis: 1, sign: 1 };
    hips.parent.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    hips.parent.getWorldQuaternion(q);
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q.invert());
    const c = [v.x, v.y, v.z], axis = [0, 1, 2].reduce((b, i) => Math.abs(c[i]) > Math.abs(c[b]) ? i : b, 1);
    return { axis, sign: c[axis] < 0 ? -1 : 1 };
  }
  function hipsStart(clip, up) { const t = hipsTrack(clip); return t ? up.sign * t.values[up.axis] : 0; }
  function stripRootMotion(clip, mode, standY, up) {
    const t = hipsTrack(clip);
    if (!t) return;
    const v = t.values, n = v.length / 3, U = up.axis, S = up.sign;
    const flat = [0, 1, 2].filter(i => i !== U);
    // level (the climb): centred right over his hands' line, not wherever the clip started
    const f0 = mode === "level" ? 0 : v[flat[0]], f1 = mode === "level" ? 0 : v[flat[1]];
    const H = i => S * v[i * 3 + U], setH = (i, h) => { v[i * 3 + U] = S * h; };
    const rise = n > 1 ? H(n - 1) - H(0) : 0;
    for (let i = 0; i < n; i++) {
      v[i * 3 + flat[0]] = f0; v[i * 3 + flat[1]] = f1;
      if (mode === "hold" || mode === "level") setH(i, H(i) - rise * (i / Math.max(1, n - 1)));
    }
    if (mode === "level") {
      let sum = 0; for (let i = 0; i < n; i++) sum += H(i);
      const shift = standY - sum / n;
      for (let i = 0; i < n; i++) setH(i, H(i) + shift);
    }
    // scale: a clip borrowed from a taller or shorter body, its hips height scaled to this one's
    if (mode === "scale" && H(0)) { const k = standY / H(0); for (let i = 0; i < n; i++) setH(i, H(i) * k); }
    if (mode === "cap") for (let i = 0; i < n; i++) setH(i, Math.min(H(i), standY));
  }

  // A phone that cannot keep up goes back to the sprites by itself: if the
  // game runs under 40 frames a second for three seconds while the model is
  // drawing, the model switches off for the rest of the visit.
  let slow = 0, lastAt = 0, tooSlow = false;
  const watch = slowWatch(25, 6000);
  function pace() {
    if (!tooSlow && flag !== "1" && watch()) { tooSlow = true; console.warn("[char3d] too slow on this device, using sprites"); }
  }

  const loaded = id => !!(models[id] && models[id].state === "ready" && libState === "ready");
  const ready = id => !tooSlow && loaded(id);
  // Models the game knows about but has not needed yet: each loads the
  // first time something asks for it (the sprite stands in until it is in).
  const known = {};
  function register(def) { if (def && def.id) known[def.id] = def; }
  function has(id, anim) {
    if (!models[id] && known[id]) preload(known[id]);
    return ready(id) && !!models[id].actions[anim];
  }


  /** Lights per world: { sky, ground, key, rim, exposure } as hex numbers. */
  function mood(m) {
    if (!lights || !m) return;
    if (m.sky !== undefined) lights.sky.color.setHex(m.sky);
    if (m.ground !== undefined) lights.sky.groundColor.setHex(m.ground);
    if (m.key !== undefined) lights.key.color.setHex(m.key);
    if (m.rim !== undefined) lights.rim.color.setHex(m.rim);
    if (m.keyPower !== undefined) lights.key.intensity = m.keyPower;
    if (m.rimPower !== undefined) lights.rim.intensity = m.rimPower;
    if (m.exposure !== undefined) renderer.toneMappingExposure = m.exposure;
  }

  /**
   * Pose the model and render it. Answers a canvas SIZE x SIZE with the
   * model's feet at (SIZE/2, SIZE * FOOT) and `metresTall` of world shown, or
   * null when it cannot.
   */
  function render(id, key, anim, t, facing, opts) {
    if (!ready(id)) return null;
    pace();
    const m = models[id], a = m.actions[anim];
    if (!a) return null;
    for (const other of Object.values(m.actions)) other.act.enabled = other === a;
    // A move can use just part of its clip (from/to, in seconds): the leap
    // and roll of the vault without the run-up before it.
    const d = a.clip.duration || 1, t0 = Math.min(a.from, d), t1 = a.to > t0 ? Math.min(a.to, d) : d;
    const k = a.loop ? (((t % 1) + 1) % 1) : Math.max(0, Math.min(0.999, t));
    const tt = t0 + k * (t1 - t0);
    a.act.enabled = true;
    a.act.setEffectiveWeight(1);
    a.act.time = tt;
    m.mixer.update(0);
    m.holder.visible = true;
    m.holder.rotation.y = (facing < 0 ? -1 : 1) * Math.PI / 2 * (opts && opts.turn !== undefined ? opts.turn : 1);
    // Frame the shot: the same metres-per-pixel as the 2D world.
    const view = VIEW_METRES;
    camera.left = -view / 2; camera.right = view / 2;
    camera.top = view * FOOT; camera.bottom = -view * (1 - FOOT);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    for (const k in models) if (models[k].holder && k !== id) models[k].holder.visible = false;
    renderer.render(scene, camera);
    m.holder.visible = false;
    // Handed back as is (no copy, which would stall the GPU on phones): draw
    // it straight away, before rendering the next runner.
    return glCanvas;
  }

  /**
   * Render a prop (no skeleton) turned to yaw / pitch / roll in radians,
   * centred in the canvas. Same canvas and scale as render().
   */
  function renderProp(id, yaw, pitch, roll) {
    if (!loaded(id)) return null;
    const m = models[id];
    m.holder.visible = true;
    m.holder.rotation.set(pitch || 0, yaw || 0, roll || 0, "YXZ");
    const view = VIEW_METRES;
    camera.left = -view / 2; camera.right = view / 2;
    camera.top = view * FOOT; camera.bottom = -view * (1 - FOOT);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    for (const k in models) if (models[k].holder && k !== id) models[k].holder.visible = false;
    renderer.render(scene, camera);
    m.holder.visible = false;
    return glCanvas;
  }
  /**
   * Bake a prop into a flat strip of frames, turned from yaw0 to yaw1 (once),
   * so it can be drawn every frame like a sprite with no 3D work at all.
   * Answers { canvas, frames, cell } (cell px square, the prop centred and
   * shown at the same scale as render()) or null until the model is in.
   */
  const baked = {};
  function bake(id, yaw0, yaw1, frames, extraYaw) {
    const key = id + ":" + yaw0 + ":" + yaw1 + ":" + frames;
    if (baked[key]) return baked[key];
    if (!loaded(id)) return null;
    const cell = Math.round(SIZE * 0.56), off = Math.round((SIZE - cell) / 2);
    const strip = document.createElement("canvas");
    strip.width = cell * frames; strip.height = cell;
    const g = strip.getContext("2d");
    for (let i = 0; i < frames; i++) {
      const yaw = yaw0 + (yaw1 - yaw0) * (i / Math.max(1, frames - 1));
      const c = renderProp(id, yaw + (extraYaw || 0), 0, 0);
      if (c) g.drawImage(c, off, off, cell, cell, i * cell, 0, cell, cell);
    }
    return (baked[key] = { canvas: freeze(strip), frames, cell, yaw0, yaw1 });
  }

  // Load a model the game knows about, without drawing it yet.
  function want(id) { if (!models[id] && known[id]) preload(known[id]); return ready(id); }
  // A prop baked into a strip once (the drones) costs nothing per frame, so it
  // stays 3D even on a device that has gone back to sprites for the runners.
  function wantProp(id) { if (!models[id] && known[id]) preload(known[id]); return loaded(id); }

  const VIEW_METRES = 3.2;           // world metres across each runner's canvas
  const FOOT = 0.86;                 // how far down the canvas the feet sit

  return { preload, register, ready, has, want, wantProp, render, renderProp, bake, mood, SIZE, VIEW_METRES, FOOT };
})();

// Koda loads straight away; Zora and the enemies the first time they appear.
if (typeof CHAR3D !== "undefined") {
  for (const def of [CHAR3D.koda, CHAR3D.zora, ...Object.values(CHAR3D.enemies || {}), ...Object.values(CHAR3D.props || {}), ...Object.values(CHAR3D.townsfolk || {})]) Char3D.register(def);
  if (CHAR3D.koda && Object.keys(CHAR3D.koda.clips || {}).length) Char3D.preload(CHAR3D.koda);
}
