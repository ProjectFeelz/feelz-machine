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
  const watch = slowWatch(34, 8000);   // the last thing to drop: only when play is truly below 30 fps
  function pace() {
    if (!tooSlow && flag !== "1" && watch()) { tooSlow = true; console.warn("[char3d] too slow on this device, using sprites"); }
  }

  // A browser can drop the 3D drawing (most often a phone short of memory)
  // and only say so later: check before every draw, so the game goes back
  // to the drawn sheets at once instead of showing an empty picture.
  function alive() {
    if (libState !== "ready") return false;
    try { if (renderer.getContext().isContextLost()) { libState = "failed"; console.warn("[char3d] 3D drawing lost, using sprites"); return false; } } catch (e) { libState = "failed"; return false; }
    return true;
  }
  const loaded = id => !!(models[id] && models[id].state === "ready") && alive();
  const ready = id => !tooSlow && loaded(id);
  // Finished loading one way or the other (in, failed, or never asked for).
  const settled = id => libState === "failed" || !models[id] || models[id].state === "ready" || models[id].state === "failed";
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
// Bones the game turns by hand go back to where they were before each frame, so a
// bone the clip doesn't move can't keep turning further frame after frame.
function keepRest(root, bone) {
  const list = root.userData.rest || (root.userData.rest = []);
  if (!list.some(r => r.bone === bone)) list.push({ bone, q: bone.quaternion.clone() });
}
function restoreRest(root) { for (const r of root.userData.rest || []) r.bone.quaternion.copy(r.q); }
const ARM_SWING = 0.3, ARM_OUT = 0, ARM_FORE = 0;
  // Running arms: the run clips hold his arms almost still at his chest, so swing
  // them from the shoulder, each arm opposite its own leg, the way a runner pumps.
  // (amount is the swing in radians either side; 0 leaves the clip as it is)
  const _sw = { v: null, a: null, b: null, q: null, pq: null, axis: null };
  function armSwing(root, amount) {
    if (!amount) return;
    if (!_sw.v) { _sw.v = new THREE.Vector3(); _sw.a = new THREE.Vector3(); _sw.b = new THREE.Vector3(); _sw.q = new THREE.Quaternion(); _sw.pq = new THREE.Quaternion(); _sw.axis = new THREE.Vector3(); _sw.rq = new THREE.Quaternion(); _sw.fwd = new THREE.Vector3(); _sw.q2 = new THREE.Quaternion(); }
    if (!root.userData.swing) {
      const find = re => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); if (f) keepRest(root, f); return f; };
      root.userData.swing = ["Left", "Right"].map(s => ({ arm: find(new RegExp(s + "Arm$")), fore: find(new RegExp(s + "ForeArm$")), hip: find(new RegExp(s + "UpLeg$")), knee: find(new RegExp(s + "Leg$")) }));
    }
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_sw.rq);
    _sw.axis.set(1, 0, 0).applyQuaternion(_sw.rq).normalize();     // across his body
    for (const side of root.userData.swing) {
      if (!side.arm || !side.hip || !side.knee) continue;
      side.hip.getWorldPosition(_sw.a); side.knee.getWorldPosition(_sw.b);
      root.worldToLocal(_sw.a); root.worldToLocal(_sw.b);
      const len = Math.max(1e-4, _sw.a.distanceTo(_sw.b));
      const legFwd = Math.max(-1, Math.min(1, (_sw.b.z - _sw.a.z) / len / 0.6));   // + when this leg is out in front
      const ang = legFwd * amount;                                                  // the arm goes the other way
      // and out from his side a little, so it swings past his body, not through it
      side.arm.getWorldPosition(_sw.b); root.worldToLocal(_sw.b);
      const out = (_sw.b.x >= 0 ? 1 : -1) * ARM_OUT;
      side.arm.parent.getWorldQuaternion(_sw.pq);
      _sw.q.setFromAxisAngle(_sw.axis, ang);
      _sw.fwd.set(0, 0, 1).applyQuaternion(_sw.rq).normalize();
      _sw.q2.setFromAxisAngle(_sw.fwd, out);
      _sw.q.multiply(_sw.q2);
      // turn about a world axis, expressed in the bone's own frame
      const local = _sw.pq.clone().invert().multiply(_sw.q).multiply(_sw.pq);
      side.arm.quaternion.premultiply(local);
      side.arm.updateMatrixWorld(true);
      // the clip folds the forearms across his chest; open them out so the hands pass his sides
      if (side.fore && ARM_FORE) {
        side.fore.parent.getWorldQuaternion(_sw.pq);
        _sw.q2.setFromAxisAngle(_sw.fwd, (_sw.b.x >= 0 ? 1 : -1) * ARM_FORE);
        side.fore.quaternion.premultiply(_sw.pq.clone().invert().multiply(_sw.q2).multiply(_sw.pq));
        side.fore.updateMatrixWorld(true);
      }
    }
  }

// Arms clear of the body, in every move: the moves were made on a body with
// narrower shoulders, so his elbows sink into his chest. Each frame, any upper
// arm whose elbow sits inside the line of his shoulders is turned out until the
// elbow is beside his body (no more than ARM_CLEAR_MAX). The collarbone takes a
// share of the turn so the shoulder moves with the arm and stays joined to it.
// Measured in his chest's own frame, so it works whichever way the move turns him.
const ARM_CLEAR = 1.05, ARM_CLEAR_MAX = 0.7, ARM_CLAVICLE = 0.3, HAND_CLEAR = 0.85, HAND_CLEAR_MAX = 0.9, BODY_DEPTH = 0.55;
// crouched, he keeps his arms spread wide for balance, well clear of his knees
const ARM_WIDE = 1.9, ARM_WIDE_MAX = 1.1, ARM_WIDE_LIFT = 0.45;
const _ac = {};
function armClear(root, wide, back) {
  if (!_ac.c) for (const k of ["c", "l", "r", "e", "s", "lat", "up", "fwd", "n", "t"]) _ac[k] = new THREE.Vector3();
  if (!_ac.q) { _ac.q = new THREE.Quaternion(); _ac.pq = new THREE.Quaternion(); }
  if (!root.userData.clear) {
    const find = re => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); if (f) keepRest(root, f); return f; };
    const chest = find(/Spine2$/) || find(/Spine1$/), neck = find(/Neck$/);
    root.userData.clear = { chest, neck, sides: ["Left", "Right"].map(sd => ({ clav: find(new RegExp(sd + "Shoulder$")), arm: find(new RegExp(sd + "Arm$")), fore: find(new RegExp(sd + "ForeArm$")) })) };
  }
  const C = root.userData.clear;
  if (!C.chest || !C.neck || C.sides.some(sd => !sd.arm || !sd.fore)) return;
  root.updateMatrixWorld(true);
  const W = (b, v) => b.getWorldPosition(v);
  W(C.sides[0].arm, _ac.l); W(C.sides[1].arm, _ac.r);
  const sw = _ac.l.distanceTo(_ac.r) / 2;
  if (sw < 1e-5) return;
  _ac.c.addVectors(_ac.l, _ac.r).multiplyScalar(0.5);
  _ac.lat.subVectors(_ac.l, _ac.r).normalize();                       // towards his left
  W(C.neck, _ac.up); W(C.chest, _ac.t); _ac.up.sub(_ac.t);
  _ac.up.addScaledVector(_ac.lat, -_ac.up.dot(_ac.lat)).normalize();   // up his spine
  _ac.fwd.crossVectors(_ac.lat, _ac.up).normalize();
  const outOf = (sd, k) => { W(sd.fore, _ac.e); return k * _ac.e.sub(_ac.c).dot(_ac.lat) / sw; };
  const turn = (bone, ang) => {
    bone.parent.getWorldQuaternion(_ac.pq);
    _ac.q.setFromAxisAngle(_ac.fwd, ang);
    bone.quaternion.premultiply(_ac.pq.clone().invert().multiply(_ac.q).multiply(_ac.pq));
    bone.updateMatrixWorld(true);
  };
  C.sides.forEach((sd, i) => {
    const k = i === 0 ? 1 : -1;
    W(sd.arm, _ac.s); W(sd.fore, _ac.e);
    _ac.n.subVectors(_ac.e, _ac.s);
    if (_ac.n.dot(_ac.up) > 0) return;                                 // arm raised: leave it
    const ex = outOf(sd, k);
    const want = wide ? ARM_WIDE : back ? BACK_CLEAR : ARM_CLEAR;
    if (ex >= want) return;
    // well in front of him or behind him, the elbow is clear of his body already
    if (!wide && Math.abs(_ac.e.copy(_ac.n).add(_ac.s).sub(_ac.c).dot(_ac.fwd)) / sw > BODY_DEPTH) return;
    const upper = Math.max(0.2, Math.hypot(_ac.n.dot(_ac.lat), _ac.n.dot(_ac.up)) / sw);
    const ang = Math.min(wide ? ARM_WIDE_MAX : ARM_CLEAR_MAX, (want - ex) / upper);
    // which way is "out" for this arm: try it, and turn back the other way if it went in
    const share = sd.clav ? ARM_CLAVICLE : 0;
    if (sd.clav) turn(sd.clav, ang * share);
    turn(sd.arm, ang * (1 - share));
    if (outOf(sd, k) < ex) { if (sd.clav) turn(sd.clav, -2 * ang * share); turn(sd.arm, -2 * ang * (1 - share)); }
  });
  // and the hands: a forearm folded in across his middle is turned out at the
  // elbow, so the hand passes in front of his side instead of through his body
  C.sides.forEach((sd, i) => {
    const k = i === 0 ? 1 : -1;
    const hand = sd.hand || (sd.hand = (() => { let f = null; sd.fore.traverse(o => { if (!f && o !== sd.fore && o.isBone && /Hand$/.test(o.name)) f = o; }); return f; })());
    if (!hand) return;
    const handOut = () => { W(hand, _ac.e); return k * _ac.e.sub(_ac.c).dot(_ac.lat) / sw; };
    const hx = handOut();
    const handWant = back ? BACK_CLEAR : HAND_CLEAR;
    if (hx >= handWant) return;
    W(hand, _ac.e); if (Math.abs(_ac.e.sub(_ac.c).dot(_ac.fwd)) / sw > BODY_DEPTH + 0.15) return;   // out in front: clear
    W(sd.fore, _ac.s); W(hand, _ac.e);
    const fore = Math.max(0.2, _ac.s.distanceTo(_ac.e) / sw);
    const ang = Math.min(HAND_CLEAR_MAX, (handWant - hx) / fore);
    // turn the forearm about the axis that swings the hand sideways, whichever
    // way the forearm points (forward, down, or back behind him)
    _ac.n.subVectors(_ac.e, _ac.s).normalize();
    _ac.t.crossVectors(_ac.n, _ac.lat);
    if (_ac.t.lengthSq() < 1e-6) return;
    _ac.t.normalize();
    const spin = (bone, a) => { bone.parent.getWorldQuaternion(_ac.pq); _ac.q.setFromAxisAngle(_ac.t, a); bone.quaternion.premultiply(_ac.pq.clone().invert().multiply(_ac.q).multiply(_ac.pq)); bone.updateMatrixWorld(true); };
    spin(sd.fore, ang);
    if (handOut() < hx) spin(sd.fore, -2 * ang);
  });
  // crouched: swing both arms forward a little too, so the hands ride out in
  // front of his knees, not down beside them
  if (wide) for (const sd of C.sides) {
    const hand = sd.hand || (sd.hand = (() => { let f = null; sd.fore.traverse(o => { if (!f && o !== sd.fore && o.isBone && /Hand$/.test(o.name)) f = o; }); return f; })());
    if (!hand) continue;
    const ahead = () => { W(hand, _ac.e); W(sd.arm, _ac.s); return _ac.e.sub(_ac.s).dot(_ac.fwd); };
    const before = ahead();
    const swing = a => { sd.arm.parent.getWorldQuaternion(_ac.pq); _ac.q.setFromAxisAngle(_ac.lat, a); sd.arm.quaternion.premultiply(_ac.pq.clone().invert().multiply(_ac.q).multiply(_ac.pq)); sd.arm.updateMatrixWorld(true); };
    swing(ARM_WIDE_LIFT);
    if (ahead() < before) swing(-2 * ARM_WIDE_LIFT);
  }
}

// Seen from behind (the inward runs): a lighter arm swing, a lean into the run
// (the card stands upright in a scene seen from above, so an upright runner reads
// as leaning back), and each foot kept in line under its hip instead of flicking
// out to the side.
// from behind his body hides anything in front of it, so his arms and hands are kept out past his sides
const BACK_SWING = 0.15, BACK_LEAN = 0.12, BACK_FOOT = 0.25, BACK_CLEAR = 1.7;
const _bk = {};
function backRun(root) {
  if (!_bk.l) for (const k of ["l", "r", "c", "lat", "up", "fwd", "a", "b", "t"]) _bk[k] = new THREE.Vector3();
  if (!_bk.q) { _bk.q = new THREE.Quaternion(); _bk.pq = new THREE.Quaternion(); }
  if (!root.userData.back) {
    const find = re => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); if (f) keepRest(root, f); return f; };
    root.userData.back = { spine: find(/Spine$/), neck: find(/Neck$/), chest: find(/Spine2$/) || find(/Spine1$/),
      legs: ["Left", "Right"].map(sd => ({ hip: find(new RegExp(sd + "UpLeg$")), knee: find(new RegExp(sd + "Leg$")), foot: find(new RegExp(sd + "Foot$")) })) };
  }
  const K = root.userData.back;
  if (!K.spine || !K.neck || !K.chest || K.legs.some(l => !l.hip || !l.foot)) return;
  const W = (b, v) => b.getWorldPosition(v);
  const rot = (bone, axis, ang) => { bone.parent.getWorldQuaternion(_bk.pq); _bk.q.setFromAxisAngle(axis, ang); bone.quaternion.premultiply(_bk.pq.clone().invert().multiply(_bk.q).multiply(_bk.pq)); bone.updateMatrixWorld(true); };
  const frame = () => {
    root.updateMatrixWorld(true);
    W(K.legs[0].hip, _bk.l); W(K.legs[1].hip, _bk.r);
    _bk.lat.subVectors(_bk.l, _bk.r).normalize();
    W(K.neck, _bk.up); W(K.spine, _bk.t); _bk.up.sub(_bk.t);
    _bk.up.addScaledVector(_bk.lat, -_bk.up.dot(_bk.lat)).normalize();
    _bk.fwd.crossVectors(_bk.lat, _bk.up).normalize();
  };
  frame();
  // lean into it: whichever way takes the neck forward
  W(K.neck, _bk.a); const n0 = _bk.a.dot(_bk.fwd);
  rot(K.spine, _bk.lat, BACK_LEAN);
  W(K.neck, _bk.a); if (_bk.a.dot(_bk.fwd) < n0) rot(K.spine, _bk.lat, -2 * BACK_LEAN);
  frame();
  // feet under the hips
  const hw = _bk.l.distanceTo(_bk.r) / 2;
  K.legs.forEach((lg, i) => {
    const k = i === 0 ? 1 : -1;
    W(lg.hip, _bk.a); W(lg.foot, _bk.b);
    const off = k * _bk.b.clone().sub(_bk.a).dot(_bk.lat) / Math.max(1e-5, hw);   // + = out to his side
    if (Math.abs(off) <= BACK_FOOT) return;
    // the lower leg flicks out from the knee: turn it back in at the knee
    const pivot = lg.knee || lg.hip;
    W(pivot, _bk.t);
    const len = Math.max(1e-5, _bk.t.distanceTo(_bk.b) / hw);
    const ang = Math.min(0.8, (Math.abs(off) - BACK_FOOT) / len);
    const was = Math.abs(off);
    rot(pivot, _bk.fwd, ang);
    W(lg.hip, _bk.a); W(lg.foot, _bk.b);
    if (Math.abs(k * _bk.b.clone().sub(_bk.a).dot(_bk.lat) / hw) > was) rot(pivot, _bk.fwd, -2 * ang);
  });
}

const FLY_POSE = { lean: 1.2, backLeg: 0.3, backKnee: 0.05, frontLeg: -1.2, frontKnee: 1.7, armOut: 1.0, armFwd: -2.1, armBack: 1.3, foreOut: 0, head: -1.0 };
  // Flying, superhero style: body leaning forward almost level, arms spread wide,
  // one leg trailing straight behind, the other knee drawn up. Built on her idle pose
  // by turning bones about her own axes (the clips have no flying move).
  const _fp = {};
  function flyPose(root, P) {
    if (!_fp.q) { _fp.q = new THREE.Quaternion(); _fp.pq = new THREE.Quaternion(); _fp.rq = new THREE.Quaternion(); _fp.v = new THREE.Vector3(); _fp.ax = new THREE.Vector3(); }
    if (!root.userData.fly) {
      const find = re => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); if (f) keepRest(root, f); return f; };
      root.userData.fly = { hips: find(/Hips$/), spine: find(/Spine1$/), head: find(/Head$/),
        la: find(/LeftArm$/), ra: find(/RightArm$/), lf: find(/LeftForeArm$/), rf: find(/RightForeArm$/),
        lu: find(/LeftUpLeg$/), ru: find(/RightUpLeg$/), ll: find(/LeftLeg$/), rl: find(/RightLeg$/) };
    }
    const b = root.userData.fly;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_fp.rq);
    // turn a bone by `ang` about one of the model's own axes (x across, y up, z forward)
    const turn = (bone, axis, ang) => {
      if (!bone || !ang) return;
      _fp.ax.set(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0).applyQuaternion(_fp.rq).normalize();
      bone.parent.getWorldQuaternion(_fp.pq);
      _fp.q.setFromAxisAngle(_fp.ax, ang);
      bone.quaternion.premultiply(_fp.pq.clone().invert().multiply(_fp.q).multiply(_fp.pq));
      bone.updateMatrixWorld(true);
    };
    const side = bone => { bone.getWorldPosition(_fp.v); root.worldToLocal(_fp.v); return _fp.v.x >= 0 ? 1 : -1; };
    // legs first (before the body tips, so their axes are the standing ones)
    turn(b.lu, "x", P.backLeg); turn(b.ll, "x", P.backKnee);
    turn(b.ru, "x", P.frontLeg); turn(b.rl, "x", P.frontKnee);
    // arms out wide, a little back, straight
    // one arm reaching forward into the flight, the other swept back
    for (const [arm, fore, swing] of [[b.ra, b.rf, P.armFwd], [b.la, b.lf, P.armBack]]) {
      if (!arm) continue;
      const s = side(arm);
      turn(arm, "z", s * P.armOut); turn(arm, "x", swing);
      if (fore) turn(fore, "z", s * P.foreOut);
    }
    turn(b.head, "x", P.head);
    // and the whole body tips forward into the flight
    turn(b.hips, "x", P.lean);
  }

  const frameCache = new Map(), FRAME_CACHE_MAX = 48;

  // ONE CANVAS PER RUNNER, REDRAWN ONLY WHEN THEIR POSE CHANGES.
  //
  // Everyone else in a co-op run is drawn from a position that arrives 15 times
  // a second. Their pose is a sprite frame number off the wire, so it takes a
  // handful of values and sits still between updates. Rendering them in 3D on
  // every one of 60 frames draws the same pose four times over, and at four
  // runners that is four full renders a frame for three frames' worth of
  // nothing.
  //
  // So each runner keeps a canvas and it is redrawn only when their pose
  // actually changes. The picture is identical, because the pose it is made
  // from is identical. This is not a quality setting and it cannot be seen.
  //
  // Bounded by how many runners there are, six at most, rather than by how many
  // poses they pass through, which is what frameCache is for.
  const holdCache = new Map();
  function render(id, key, anim, t, facing, opts) {
    // the menu draws at a calm pace, so it always gets the 3D model once it's in
    if (!(opts && opts.menu ? loaded(id) : ready(id))) return null;
    pace();
    const m = models[id], a = m.actions[anim];
    if (!a) return null;
    // Reused frames (opts.cache = frames per move): the people in the background (enforcers,
    // townsfolk, Zora flying) are drawn once per pose and the same picture is used again next
    // time they reach it, so a phone isn't drawing every one of them in 3D every frame.
    let cacheKey = null;
    if (opts && opts.cache) {
      const n = opts.cache, kk = a.loop ? (((t % 1) + 1) % 1) : Math.max(0, Math.min(0.999, t));
      const fi = a.loop ? Math.floor(kk * n) % n : Math.min(n - 1, Math.floor(kk * n));
      t = (fi + 0.5) / n;
      cacheKey = id + "|" + anim + "|" + fi + "|" + (facing < 0 ? -1 : 1) + "|" + (opts.turn !== undefined ? opts.turn : "") + "|" + (opts.outfit ? JSON.stringify(opts.outfit) : "") + "|" + (opts.fly ? 1 : 0);
      const hit = frameCache.get(cacheKey);
      if (hit) { frameCache.delete(cacheKey); frameCache.set(cacheKey, hit); return hit; }
    }
    // Held runners: hand back the canvas we already have unless the pose moved.
    let holdSlot = null;
    if (opts && opts.hold) {
      const poseKey = id + "|" + anim + "|" + t.toFixed(4) + "|" + (facing < 0 ? -1 : 1)
                    + "|" + (opts.turn !== undefined ? opts.turn : "")
                    + "|" + (opts.outfit ? JSON.stringify(opts.outfit) : "");
      holdSlot = holdCache.get(opts.hold);
      if (holdSlot && holdSlot.key === poseKey) return holdSlot.canvas;
      if (!holdSlot) {
        const c = document.createElement("canvas");
        c.width = glCanvas.width; c.height = glCanvas.height;
        holdSlot = { key: "", canvas: c, g: c.getContext("2d") };
        holdCache.set(opts.hold, holdSlot);
      }
      holdSlot.key = poseKey;
    }
    outfitMap(m, opts && opts.outfit);
    for (const other of Object.values(m.actions)) other.act.enabled = other === a;
    // A move can use just part of its clip (from/to, in seconds): the leap
    // and roll of the vault without the run-up before it.
    const d = a.clip.duration || 1, t0 = Math.min(a.from, d), t1 = a.to > t0 ? Math.min(a.to, d) : d;
    const k = a.loop ? (((t % 1) + 1) % 1) : Math.max(0, Math.min(0.999, t));
    const tt = t0 + k * (t1 - t0);
    a.act.enabled = true;
    a.act.setEffectiveWeight(1);
    a.act.time = tt;
    restoreRest(m.root);
    m.mixer.update(0);
    const back = !!(opts && opts.turn === 2), running = a.clip.name === "run" || a.clip.name === "sprint";
    if (running) armSwing(m.root, back ? BACK_SWING : ARM_SWING);
    if (back && running) backRun(m.root);
    if (opts && opts.fly) flyPose(m.root, FLY_POSE);
    else armClear(m.root, /^crouch/.test(a.clip.name), back);
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
    if (holdSlot) {
      holdSlot.g.clearRect(0, 0, holdSlot.canvas.width, holdSlot.canvas.height);
      holdSlot.g.drawImage(glCanvas, 0, 0);
      return holdSlot.canvas;
    }
    // Handed back as is (no copy, which would stall the GPU on phones): draw
    // it straight away, before rendering the next runner.
    if (cacheKey) {
      // keep a copy of this pose; the oldest are dropped once there are FRAME_CACHE_MAX
      let c = frameCache.size >= FRAME_CACHE_MAX ? frameCache.get(frameCache.keys().next().value) : null;
      if (c) frameCache.delete(frameCache.keys().next().value);
      else { c = document.createElement("canvas"); c.width = glCanvas.width; c.height = glCanvas.height; }
      const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height); g.drawImage(glCanvas, 0, 0);
      frameCache.set(cacheKey, c);
      return c;
    }
    return glCanvas;
  }

  // Outfit colours on the 3D model: the cloth (the dark, plain parts of its
  // texture) recoloured once per outfit; skin, gold trim and shine stay as
  // they are. outfit is [[r, g, b] dark, [r, g, b] light] (0 to 1), or none.
  function outfitMap(m, outfit) {
    if (m.mat === undefined) {
      m.mat = null;
      m.root.traverse(o => { if (!m.mat && o.isMesh && o.material && o.material.map) m.mat = o.material; });
      m.baseMap = m.mat ? m.mat.map : null; m.maps = {};
    }
    if (!m.mat || !m.baseMap) return;
    if (!outfit) { if (m.mat.map !== m.baseMap) m.mat.map = m.baseMap; return; }
    const key = JSON.stringify(outfit);
    let t = m.maps[key];
    if (!t) {
      const src = m.baseMap.image, w = src && (src.width || src.naturalWidth), h = src && (src.height || src.naturalHeight);
      if (!w || !h) return;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, w, h), px = d.data, [dk, lt] = outfit;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i + 1], b = px[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        if ((mx ? (mx - mn) / mx : 0) > 0.28 || mx > 200) continue;
        const k = Math.min(1, ((0.3 * r + 0.59 * gg + 0.11 * b) / 255) / 0.42);
        for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round((dk[ch] + (lt[ch] - dk[ch]) * k) * 255);
      }
      g.putImageData(d, 0, 0);
      t = new THREE.CanvasTexture(c);
      t.flipY = m.baseMap.flipY; t.colorSpace = m.baseMap.colorSpace;
      t.wrapS = m.baseMap.wrapS; t.wrapT = m.baseMap.wrapT; t.channel = m.baseMap.channel;
      m.maps[key] = t;
    }
    if (m.mat.map !== t) m.mat.map = t;
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
  // Made a few frames at a time (never all at once, which can be too much
  // for a phone in one go); answers null, and the drawn sprite stands in,
  // until the strip is finished.
  const baked = {}, baking = {};
  function bake(id, yaw0, yaw1, frames, extraYaw) {
    const key = id + ":" + yaw0 + ":" + yaw1 + ":" + frames;
    if (baked[key]) return baked[key];
    if (!loaded(id)) return null;
    const cell = Math.round(SIZE * 0.56), off = Math.round((SIZE - cell) / 2);
    let b = baking[key];
    if (!b) {
      const strip = document.createElement("canvas");
      strip.width = cell * frames; strip.height = cell;
      b = baking[key] = { strip, g: strip.getContext("2d"), next: 0, at: -1 };
    }
    if (b.at === frameStamp()) return null;        // one batch per frame, however many drones ask
    b.at = frameStamp();
    for (let n = 0; n < 4 && b.next < frames; n++, b.next++) {
      const i = b.next, yaw = yaw0 + (yaw1 - yaw0) * (i / Math.max(1, frames - 1));
      const c = renderProp(id, yaw + (extraYaw || 0), 0, 0);
      if (!c) return null;
      b.g.drawImage(c, off, off, cell, cell, i * cell, 0, cell, cell);
    }
    if (b.next < frames) return null;
    delete baking[key];
    return (baked[key] = { canvas: freeze(b.strip), frames, cell, yaw0, yaw1 });
  }
  const frameStamp = () => Math.round(performance.now() / 8);

  // Load a model the game knows about, without drawing it yet.
  function want(id) { if (!models[id] && known[id]) preload(known[id]); return ready(id); }
  // A prop baked into a strip once (the drones) costs nothing per frame, so it
  // stays 3D even on a device that has gone back to sprites for the runners.
  function wantProp(id) { if (!models[id] && known[id]) preload(known[id]); return loaded(id); }

  const VIEW_METRES = 3.2;           // world metres across each runner's canvas
  const FOOT = 0.86;                 // how far down the canvas the feet sit


  // When each foot lands in a looping move, as parts of its cycle (0 to 1): the
  // footsteps sound on these, so what you hear is what you see. Worked out once
  // per move by stepping through the clip and watching each foot come down.
  const footCache = {};
  function footfalls(id, anim) {
    const key = id + ":" + anim;
    if (footCache[key]) return footCache[key];
    const m = models[id];
    if (!loaded(id) || !m.actions[anim]) return null;
    const a = m.actions[anim];
    const find = re => { let f = null; m.root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; };
    const feet = [find(/LeftFoot$/), find(/RightFoot$/)].filter(Boolean);
    if (!feet.length) return null;
    for (const other of Object.values(m.actions)) other.act.enabled = other === a;
    a.act.enabled = true; a.act.setEffectiveWeight(1);
    const d = a.clip.duration || 1, t0 = Math.min(a.from, d), t1 = a.to > t0 ? Math.min(a.to, d) : d;
    const N = 96, v = new THREE.Vector3(), hs = feet.map(() => []);
    for (let i = 0; i < N; i++) {
      a.act.time = t0 + (i / N) * (t1 - t0);
      restoreRest(m.root); m.mixer.update(0); m.root.updateMatrixWorld(true);
      feet.forEach((f, j) => { f.getWorldPosition(v); m.root.worldToLocal(v); hs[j].push(v.y); });
    }
    const out = [];
    for (const h of hs) {
      const lo = Math.min(...h), hi = Math.max(...h), thr = lo + 0.18 * (hi - lo);
      for (let i = 0; i < N; i++) {
        const prev = h.at(i - 1);
        if (h[i] <= thr && prev > thr) out.push(i / N);
      }
    }
    out.sort((x, y) => x - y);
    footCache[key] = out.length ? out : [0, 0.5];
    return footCache[key];
  }

  // A runner who has left: let their canvas go.
  function drop(holdKey) { holdCache.delete(holdKey); }

  return { footfalls, preload, register, ready, settled, has, want, wantProp, render, renderProp, bake, drop, mood, SIZE, VIEW_METRES, FOOT };
})();

// Koda loads straight away; Zora and the enemies the first time they appear.
if (typeof CHAR3D !== "undefined") {
  for (const def of [CHAR3D.koda, CHAR3D.zora, ...Object.values(CHAR3D.enemies || {}), ...Object.values(CHAR3D.props || {}), ...Object.values(CHAR3D.townsfolk || {})]) Char3D.register(def);
  if (CHAR3D.koda && Object.keys(CHAR3D.koda.clips || {}).length) Char3D.preload(CHAR3D.koda);
}
