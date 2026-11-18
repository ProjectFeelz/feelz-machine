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
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: "high-performance" });
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
          actions[anim] = { act, clip, loop: o.loop !== false, inPlace: !o.rootMotion, holdY: !!o.holdY };
        }
        Object.assign(m, { state: "ready", root, holder, mixer, actions, height: def.metres || 1.8 });
        // Keep the run in place: the game moves him, not the clip.
        for (const a of Object.values(actions)) if (a.inPlace) stripRootMotion(a.clip, a.holdY);
      }, undefined, err => {
        console.warn("[char3d] could not load", def.src, err && err.message);
        m.state = "failed";
      });
    }).catch(() => { m.state = "failed"; });
  }

  // The hips track carries the clip's travel forward; the game already moves
  // the runner, so keep only the up and down bob.
  // holdY also takes out any steady rise over the clip (a climb cycle that
  // climbs), keeping the bob, because the game does the climbing.
  function stripRootMotion(clip, holdY) {
    for (const t of clip.tracks) {
      if (!/hips\.position$/i.test(t.name)) continue;
      const v = t.values, n = v.length / 3;
      const x0 = v[0], z0 = v[2], rise = n > 1 ? v[v.length - 2] - v[1] : 0;
      for (let i = 0; i < n; i++) {
        v[i * 3] = x0; v[i * 3 + 2] = z0;
        if (holdY) v[i * 3 + 1] -= rise * (i / (n - 1));
      }
    }
  }

  // A phone that cannot keep up goes back to the sprites by itself: if the
  // game runs under 40 frames a second for three seconds while the model is
  // drawing, the model switches off for the rest of the visit.
  let slow = 0, lastAt = 0, tooSlow = false;
  function pace() {
    const now = performance.now(), dt = now - lastAt;
    lastAt = now;
    if (dt > 0 && dt < 250) {
      slow = dt > 25 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 3000 && flag !== "1") { tooSlow = true; console.warn("[char3d] too slow on this device, using sprites"); }
    }
  }

  const ready = id => !tooSlow && !!(models[id] && models[id].state === "ready" && libState === "ready");
  const has = (id, anim) => ready(id) && !!models[id].actions[anim];


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
    const d = a.clip.duration || 1;
    const tt = a.loop ? (((t % 1) + 1) % 1) * d : Math.max(0, Math.min(0.999, t)) * d;
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

  const VIEW_METRES = 3.2;           // world metres across each runner's canvas
  const FOOT = 0.86;                 // how far down the canvas the feet sit

  return { preload, ready, has, render, mood, SIZE, VIEW_METRES, FOOT };
})();

// Start loading as soon as the game has a model with at least one move set up.
if (typeof CHAR3D !== "undefined" && CHAR3D.koda && Object.keys(CHAR3D.koda.clips || {}).length) Char3D.preload(CHAR3D.koda);
