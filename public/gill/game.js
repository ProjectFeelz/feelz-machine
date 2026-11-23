/* ---------------------------------------------------------------------------
   G.I.L.L. (Good Intentions Last Longest)

   A top-down action game on the Feelz Engine's 3D pieces: the same three.js
   build, models and moves as Feelz Run, seen from an angled 3/4 camera.

   The game is played mission by mission, one song each, in album order. A
   mission lights up four quadrants of the city. Each quadrant holds one part
   of the song; finish its task and the part joins the mix. The order you
   finish them in is the order the song builds up, so every run produces its
   own version of the track. Missions are scored and graded.

   Story words and mission data live in story.js (GILL_STORY).
--------------------------------------------------------------------------- */

import * as THREE from "../run/vendor/three-0.160.0/three.module.min.js";
import { GLTFLoader, MeshoptDecoder, RoomEnvironment } from "../run/vendor/three-0.160.0/gltf-lib.js";

const S = window.GILL_STORY;
const MODELS = "../run/assets/models/";
const $ = id => document.getElementById(id);
const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

/* ---------- city layout ---------- */
const ZONE = 56;           // metres across one quadrant
const ROAD = 10;           // the street between quadrants
const COLS = 4, ROWS = 3;
const zoneOrigin = z => new THREE.Vector2(z.grid[0] * (ZONE + ROAD), z.grid[1] * (ZONE + ROAD));
const zoneCenter = z => zoneOrigin(z).addScalar(ZONE / 2);
const WORLD_W = COLS * (ZONE + ROAD) - ROAD, WORLD_H = ROWS * (ZONE + ROAD) - ROAD;
const Q = id => S.quadrants.find(q => q.id === id);

const BUILDINGS = ["tenement", "hostel", "kodas-building", "lc-b1", "lc-b2", "lc-b4", "lc-b5", "lc-b6", "lc-b7",
  "mc-b2", "mc-b4", "mc-b6", "mc-b7", "mc-b8", "rc-b1", "rc-b3", "rc-b4", "rc-b5", "uc-b1", "uc-b2", "uc-b3", "uc-b4",
  "de-b1", "de-b3", "de-b4"];
const ENEMIES = { sentinel: 2.1, guard: 1.85, "street-warden": 1.9, hunter: 1.85, handler: 1.9, gilded: 2.0 };
const TOWNSFOLK = ["neighbour_1_elder", "neighbour_2_woman", "neighbour_3_man", "family_mother", "dock_foreman",
  "musician_street", "musician_can_drum", "musician_wire_guitar", "koda_brother", "crew_4_heavy"];
const PART_COLOURS = [0x5ad1ff, 0xf2b544, 0xd58cff, 0x7fe39a];

/* ---------- small helpers ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function zoneAt(x, z) {
  for (const q of S.quadrants) { const o = zoneOrigin(q); if (x >= o.x && x <= o.x + ZONE && z >= o.y && z <= o.y + ZONE) return q; }
  return null;
}

/* ---------- loading ---------- */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const buffers = {};
function fetchBuffer(url) {
  if (!buffers[url]) buffers[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.arrayBuffer(); });
  return buffers[url];
}
async function loadGLB(url) {
  const buf = await fetchBuffer(url);
  return loader.parseAsync(buf.slice(0), new URL(url, location.href).href);
}
const staticCache = {};
function staticModel(name) {
  if (!staticCache[name]) staticCache[name] = loadGLB(MODELS + "world/" + name + ".glb").then(g => g.scene).catch(() => null);
  return staticCache[name];
}

/* ---------- renderer and scene ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = phone ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
$("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15121c);
scene.fog = new THREE.Fog(0x15121c, 28, 70);
try {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
} catch (e) { /* lights only */ }

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 220);
const CAM_OFFSET = new THREE.Vector3(0, 11.5, 8.5);

const hemi = new THREE.HemisphereLight(0xb9c8ff, 0x3a2a1c, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
const SH = 22;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x7fb8ff, 0.8);
rim.position.set(-30, 25, -40);
scene.add(rim);

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

/* ---------- ground and streets ---------- */
// Paving and asphalt, drawn once on a canvas and tiled, so the ground reads as a street rather than a flat colour.
function groundTexture(kind) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = rng(kind === "paving" ? 7 : 11);
  g.fillStyle = kind === "paving" ? "#8a8a8a" : "#3a3a3e"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(r() * 60) - 30;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  if (kind === "paving") {
    g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const pads = {};   // quadrant id -> its ground material (lit up when it is part of the mission)
function buildGround() {
  const asphalt = groundTexture("asphalt");
  asphalt.repeat.set((WORLD_W + 80) / 8, (WORLD_H + 80) / 8);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 80, WORLD_H + 80),
    new THREE.MeshStandardMaterial({ color: 0x8a8790, map: asphalt, roughness: 0.92 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(WORLD_W / 2, -0.01, WORLD_H / 2);
  road.receiveShadow = true;
  scene.add(road);
  for (const q of S.quadrants) {
    const o = zoneOrigin(q);
    const paving = groundTexture("paving");
    paving.repeat.set(ZONE / 6, ZONE / 6);
    const tint = new THREE.Color(q.tint).multiplyScalar(0.75);
    const mat = new THREE.MeshStandardMaterial({ color: tint, map: paving, roughness: 0.85, emissive: 0x000000 });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(ZONE, ZONE), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(o.x + ZONE / 2, 0, o.y + ZONE / 2);
    pad.receiveShadow = true;
    scene.add(pad);
    pads[q.id] = { mat, base: tint.clone() };
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, metalness: 0.6, roughness: 0.4 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb04a, emissiveIntensity: 2.2 });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), bulbGeo = new THREE.SphereGeometry(0.22, 10, 8);
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const x = c * (ZONE + ROAD) - ROAD / 2, z = r * (ZONE + ROAD) + ZONE / 2;
    for (const [px, pz] of [[x, z - 12], [x, z + 12]]) {
      if (px < 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(px, 2.1, pz); pole.castShadow = true;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(px, 4.3, pz);
      scene.add(pole, bulb);
    }
  }
}

/* ---------- buildings (static, with collision boxes) ---------- */
const blockers = [];
// Square to the streets only, so a building's collision box is its real footprint.
// `maxFoot` caps how wide it can be, so ways into each quadrant stay open.
async function placeBuilding(name, x, z, yaw, height, maxFoot = 13) {
  const src = await staticModel(name);
  if (!src) return;
  const m = src.clone(true);
  m.rotation.y = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min(height / Math.max(0.001, size.y), maxFoot / Math.max(0.001, size.x, size.z));
  m.scale.setScalar(k);
  const box2 = new THREE.Box3().setFromObject(m);
  const c = box2.getCenter(new THREE.Vector3());
  m.position.set(x - c.x, -box2.min.y, z - c.z);
  const mats = [];
  m.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      o.material = o.material.clone();
      mats.push(o.material);
    }
  });
  scene.add(m);
  const b = new THREE.Box3().setFromObject(m);
  blockers.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, top: b.max.y, mesh: m, mats, faded: false });
}

async function buildCity(onProgress) {
  const jobs = [];
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(1) * 977 + q.id.charCodeAt(2) * 131);
    const o = zoneOrigin(q);
    const pick = () => BUILDINGS[Math.floor(r() * BUILDINGS.length)];
    const inset = 7.5, a = ZONE / 2;
    const slots = [];
    for (const off of [-16, 16]) {
      slots.push([a + off, inset, 0], [a + off, ZONE - inset, Math.PI], [inset, a + off, Math.PI / 2], [ZONE - inset, a + off, -Math.PI / 2]);
    }
    slots.push([inset, inset, 0], [ZONE - inset, inset, 0], [inset, ZONE - inset, Math.PI], [ZONE - inset, ZONE - inset, Math.PI]);
    const cover = [[a - 11, a + 11, Math.floor(r() * 4) * Math.PI / 2], [a + 11, a - 11, Math.floor(r() * 4) * Math.PI / 2]];
    for (const [sx, sz, yaw] of slots) jobs.push(() => placeBuilding(pick(), o.x + sx, o.y + sz, yaw, 7 + r() * 7, 12));
    for (const [sx, sz, yaw] of cover) jobs.push(() => placeBuilding(pick(), o.x + sx, o.y + sz, yaw, 4 + r() * 3, 7));
  }
  let done = 0;
  const queue = jobs.slice();
  const worker = async () => { while (queue.length) { await queue.shift()(); done++; onProgress && onProgress(done / jobs.length); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

/* Fade any building standing between the camera and Koda. */
function updateOcclusion() {
  if (!koda) return;
  const kx = koda.pos.x, kz = koda.pos.z;
  for (const b of blockers) {
    const hides = b.minZ > kz - 1 && b.minZ < kz + 12 && kx > b.minX - 2 && kx < b.maxX + 2;
    if (hides !== b.faded) {
      b.faded = hides;
      for (const m of b.mats) { m.transparent = hides; m.opacity = hides ? 0.28 : 1; m.depthWrite = !hides; m.needsUpdate = true; }
    }
  }
}

/* ---------- collision ---------- */
function blocked(x, z, r) {
  for (const b of blockers) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return b;
  return null;
}
function moveWithCollision(pos, dx, dz, r) {
  if (!blocked(pos.x + dx, pos.z, r)) pos.x += dx;
  if (!blocked(pos.x, pos.z + dz, r)) pos.z += dz;
  pos.x = clamp(pos.x, -ROAD + 1, WORLD_W + ROAD - 1);
  pos.z = clamp(pos.z, -ROAD + 1, WORLD_H + ROAD - 1);
}
function sightClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  for (const b of blockers) {
    let t0 = 0, t1 = 1;
    for (const [p, d, mn, mx] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-6) { if (p < mn || p > mx) { t0 = 2; break; } continue; }
      let ta = (mn - p) / d, tb = (mx - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1) return false;
  }
  return true;
}
// A free spot near (x, z), not inside a building.
function freeSpot(x, z, r = 1.2, rand = Math.random) {
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2, d = i * 0.35;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!blocked(px, pz, r)) return { x: px, z: pz };
  }
  return { x, z };
}

/* ---------- arm correction (ported from Feelz Run's char3d.js) ----------
   The moves were made on bodies with narrower shoulders, so arms sink into
   chests and hands fold across the middle. After each animation step the arms
   are turned out until elbows and hands sit beside the body, and running arms
   swing opposite the legs. Same numbers as Feelz Run. */
function keepRest(root, bone) {
  const list = root.userData.rest || (root.userData.rest = []);
  if (!list.some(r => r.bone === bone)) list.push({ bone, q: bone.quaternion.clone() });
}
function restoreRest(root) { for (const r of root.userData.rest || []) r.bone.quaternion.copy(r.q); }
const findBone = (root, re) => { let f = null; root.traverse(o => { if (!f && o.isBone && re.test(o.name)) f = o; }); if (f) keepRest(root, f); return f; };
const ARM_SWING = 0.3;
const _sw = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), axis: new THREE.Vector3(), rq: new THREE.Quaternion() };
function armSwing(root, amount) {
  if (!root.userData.swing) root.userData.swing = ["Left", "Right"].map(sd => ({ arm: findBone(root, new RegExp(sd + "Arm$")), hip: findBone(root, new RegExp(sd + "UpLeg$")), knee: findBone(root, new RegExp(sd + "Leg$")) }));
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_sw.rq);
  _sw.axis.set(1, 0, 0).applyQuaternion(_sw.rq).normalize();
  for (const side of root.userData.swing) {
    if (!side.arm || !side.hip || !side.knee) continue;
    side.hip.getWorldPosition(_sw.a); side.knee.getWorldPosition(_sw.b);
    root.worldToLocal(_sw.a); root.worldToLocal(_sw.b);
    const len = Math.max(1e-4, _sw.a.distanceTo(_sw.b));
    const legFwd = Math.max(-1, Math.min(1, (_sw.b.z - _sw.a.z) / len / 0.6));
    side.arm.parent.getWorldQuaternion(_sw.pq);
    _sw.q.setFromAxisAngle(_sw.axis, legFwd * amount);
    side.arm.quaternion.premultiply(_sw.pq.clone().invert().multiply(_sw.q).multiply(_sw.pq));
    side.arm.updateMatrixWorld(true);
  }
}
const ARM_CLEAR = 1.05, ARM_CLEAR_MAX = 0.7, ARM_CLAVICLE = 0.3, HAND_CLEAR = 0.85, HAND_CLEAR_MAX = 0.9, BODY_DEPTH = 0.55;
const ARM_WIDE = 1.9, ARM_WIDE_MAX = 1.1, ARM_WIDE_LIFT = 0.45;
const _ac = {};
for (const k of ["c", "l", "r", "e", "s", "lat", "up", "fwd", "n", "t"]) _ac[k] = new THREE.Vector3();
_ac.q = new THREE.Quaternion(); _ac.pq = new THREE.Quaternion();
function armClear(root, wide) {
  if (!root.userData.clear) {
    const chest = findBone(root, /Spine2$/) || findBone(root, /Spine1$/), neck = findBone(root, /Neck$/);
    root.userData.clear = { chest, neck, sides: ["Left", "Right"].map(sd => ({ clav: findBone(root, new RegExp(sd + "Shoulder$")), arm: findBone(root, new RegExp(sd + "Arm$")), fore: findBone(root, new RegExp(sd + "ForeArm$")) })) };
  }
  const C = root.userData.clear;
  if (!C.chest || !C.neck || C.sides.some(sd => !sd.arm || !sd.fore)) return;
  root.updateMatrixWorld(true);
  const W = (b, v) => b.getWorldPosition(v);
  W(C.sides[0].arm, _ac.l); W(C.sides[1].arm, _ac.r);
  const sw = _ac.l.distanceTo(_ac.r) / 2;
  if (sw < 1e-5) return;
  _ac.c.addVectors(_ac.l, _ac.r).multiplyScalar(0.5);
  _ac.lat.subVectors(_ac.l, _ac.r).normalize();
  W(C.neck, _ac.up); W(C.chest, _ac.t); _ac.up.sub(_ac.t);
  _ac.up.addScaledVector(_ac.lat, -_ac.up.dot(_ac.lat)).normalize();
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
    if (_ac.n.dot(_ac.up) > 0) return;
    const ex = outOf(sd, k);
    const want = wide ? ARM_WIDE : ARM_CLEAR;
    if (ex >= want) return;
    // Seen from above, an elbow in front of the chest still reads as folded in, so no exception for depth here.
    const upper = Math.max(0.2, Math.hypot(_ac.n.dot(_ac.lat), _ac.n.dot(_ac.up)) / sw);
    const ang = Math.min(wide ? ARM_WIDE_MAX : ARM_CLEAR_MAX, (want - ex) / upper);
    const share = sd.clav ? ARM_CLAVICLE : 0;
    if (sd.clav) turn(sd.clav, ang * share);
    turn(sd.arm, ang * (1 - share));
    if (outOf(sd, k) < ex) { if (sd.clav) turn(sd.clav, -2 * ang * share); turn(sd.arm, -2 * ang * (1 - share)); }
  });
  const handOf = sd => sd.hand || (sd.hand = (() => { let f = null; sd.fore.traverse(o => { if (!f && o !== sd.fore && o.isBone && /Hand$/.test(o.name)) f = o; }); return f; })());
  C.sides.forEach((sd, i) => {
    const k = i === 0 ? 1 : -1;
    const hand = handOf(sd);
    if (!hand) return;
    const handOut = () => { W(hand, _ac.e); return k * _ac.e.sub(_ac.c).dot(_ac.lat) / sw; };
    const hx = handOut();
    if (hx >= HAND_CLEAR) return;
    W(sd.fore, _ac.s); W(hand, _ac.e);
    const fore = Math.max(0.2, _ac.s.distanceTo(_ac.e) / sw);
    const ang = Math.min(HAND_CLEAR_MAX, (HAND_CLEAR - hx) / fore);
    _ac.n.subVectors(_ac.e, _ac.s).normalize();
    _ac.t.crossVectors(_ac.n, _ac.lat);
    if (_ac.t.lengthSq() < 1e-6) return;
    _ac.t.normalize();
    const spin = (bone, a) => { bone.parent.getWorldQuaternion(_ac.pq); _ac.q.setFromAxisAngle(_ac.t, a); bone.quaternion.premultiply(_ac.pq.clone().invert().multiply(_ac.q).multiply(_ac.pq)); bone.updateMatrixWorld(true); };
    spin(sd.fore, ang);
    if (handOut() < hx) spin(sd.fore, -2 * ang);
  });
  if (wide) for (const sd of C.sides) {
    const hand = handOf(sd);
    if (!hand) continue;
    const ahead = () => { W(hand, _ac.e); W(sd.arm, _ac.s); return _ac.e.sub(_ac.s).dot(_ac.fwd); };
    const before = ahead();
    const swing = a => { sd.arm.parent.getWorldQuaternion(_ac.pq); _ac.q.setFromAxisAngle(_ac.lat, a); sd.arm.quaternion.premultiply(_ac.pq.clone().invert().multiply(_ac.q).multiply(_ac.pq)); sd.arm.updateMatrixWorld(true); };
    swing(ARM_WIDE_LIFT);
    if (ahead() < before) swing(-2 * ARM_WIDE_LIFT);
  }
}

/* ---------- animated characters ---------- */
// Keep moves in place: the game moves the body, not the clip. The hips are held
// at their resting spot on the ground plane in EVERY clip, so changing from one
// move to another never makes a body jump (the guards' "glitch back").
function stripRootMotion(clip, restX, restZ) {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = restX; v[i + 2] = restZ; }
  }
}
class Actor {
  constructor(gltf, metres) {
    this.root = new THREE.Group();
    const model = gltf.scene;
    this.root.add(model);
    this.root.updateMatrixWorld(true);
    // Measured by the skeleton, the way Feelz Run does it.
    let lo = Infinity, hi = -Infinity, hips = null;
    const v = new THREE.Vector3();
    model.traverse(o => {
      if (o.isBone) { o.getWorldPosition(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); if (!hips && /hips$/i.test(o.name)) hips = o; }
    });
    if (!isFinite(lo)) { const box = new THREE.Box3().setFromObject(model); lo = box.min.y; hi = box.max.y; }
    const k = metres / Math.max(0.01, hi - lo);
    model.scale.multiplyScalar(k);
    model.position.y = -lo * k;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    const rx = hips ? hips.position.x : 0, rz = hips ? hips.position.z : 0;
    for (const c of gltf.animations) { stripRootMotion(c, rx, rz); this.clips[c.name] = this.mixer.clipAction(c); }
    this.current = null;
    this.model = model;
    this.pos = this.root.position;
    this.yaw = 0;
  }
  has(name) { return !!this.clips[name]; }
  play(name, { once = false, fade = 0.15, speed = 1 } = {}) {
    const a = this.clips[name];
    if (!a) return 0;
    if (this.current === a && !once) { a.timeScale = speed; return a.getClip().duration; }
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    return a.getClip().duration / speed;
  }
  face(yaw, t) { this.yaw = angleLerp(this.yaw, yaw, t); this.root.rotation.y = this.yaw; }
  faceTo(x, z, t = 1) { this.face(Math.atan2(x - this.pos.x, z - this.pos.z), t); }
  update(dt) {
    restoreRest(this.model);
    this.mixer.update(dt);
    const name = this.current ? this.current.getClip().name : "";
    if (/^(run|sprint)$/.test(name)) armSwing(this.model, ARM_SWING);
    if (!/^(punch|kick|takedown|hit|ko|alert|flykick|jump|spinkick)$/.test(name)) armClear(this.model, /^crouch/.test(name));
  }
}
async function makeActor(file, metres) { return new Actor(await loadGLB(MODELS + file), metres); }
const forward = a => new THREE.Vector2(Math.sin(a.yaw), Math.cos(a.yaw));

/* ---------- input ---------- */
const keys = new Set();
const input = { x: 0, z: 0, mag: 0, sneak: false };
addEventListener("keydown", e => {
  if (e.repeat) return;
  keys.add(e.code);
  if (state === "card" && (e.code === "Space" || e.code === "Enter" || e.code === "KeyJ")) return cardContinue();
  if (state === "paused" && (e.code === "Escape" || e.code === "KeyP")) return resume();
  if (state !== "play") return;
  if (e.code === "KeyC" || e.code === "ControlLeft") toggleSneak();
  if (e.code === "KeyJ" || e.code === "KeyK") attack();
  if (e.code === "Space") jump();
  if (e.code === "KeyE") action();
  if (e.code === "Escape" || e.code === "KeyP") pause();
});
addEventListener("keyup", e => keys.delete(e.code));
function keyVector() {
  let x = 0, z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const m = Math.hypot(x, z);
  return m ? { x: x / m, z: z / m, mag: keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 : 0.8 } : { x: 0, z: 0, mag: 0 };
}
const stick = { id: null, x: 0, z: 0, mag: 0 };
(function touchSetup() {
  const el = $("stick"), knob = $("knob");
  const R = 52;
  const setFrom = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, d / R);
    stick.x = d ? dx / (d * k) : 0; stick.z = d ? dy / (d * k) : 0; stick.mag = m < 0.15 ? 0 : m;
  };
  el.addEventListener("pointerdown", e => { stick.id = e.pointerId; el.setPointerCapture(e.pointerId); setFrom(e); });
  el.addEventListener("pointermove", e => { if (e.pointerId === stick.id) setFrom(e); });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.mag = 0; knob.style.transform = ""; };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  const tap = (id, fn) => $(id).addEventListener("pointerdown", e => { e.preventDefault(); if (state === "play") fn(); });
  tap("btnAttack", attack); tap("btnAction", action); tap("btnSneak", toggleSneak); tap("btnJump", jump);
})();
/* Game controllers: left stick or d-pad moves, A jumps, X hits, Y is the action,
   B sneaks, RT sprints, Start pauses. A carries on from a card. */
const pad = { x: 0, z: 0, mag: 0, prev: [] };
function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  const g = [...list].find(q => q && q.connected);
  pad.x = 0; pad.z = 0; pad.mag = 0;
  if (!g) return;
  const btn = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
  let x = g.axes[0] || 0, z = g.axes[1] || 0;
  if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) z = -1; if (btn(13)) z = 1;
  const m = Math.hypot(x, z);
  if (m > 0.22) { pad.x = x / m; pad.z = z / m; pad.mag = btn(7) || btn(10) ? 1 : Math.min(0.9, m); }
  const press = i => btn(i) && !pad.prev[i];
  if (state === "title") { if ((press(0) || press(9)) && !$("playBtn").disabled) $("playBtn").click(); }
  else if (state === "card") { if (press(0) || press(9) || press(2)) cardContinue(); }
  else if (state === "score") { if (press(0)) $("nextBtn").click(); }
  else if (state === "paused") { if (press(9) || press(1)) resume(); }
  else if (state === "play") {
    if (press(0)) jump();
    if (press(2)) attack();
    if (press(3)) action();
    if (press(1)) toggleSneak();
    if (press(9)) pause();
  }
  pad.prev = g.buttons.map((b, i) => btn(i));
}
function readInput() {
  const k = keyVector();
  const s = stick.mag ? stick : pad.mag ? pad : k;
  input.x = s.x; input.z = s.z; input.mag = s.mag;
}
function toggleSneak() { input.sneak = !input.sneak; $("btnSneak").classList.toggle("on", input.sneak); }

/* ---------- save ---------- */
function loadSave() {
  const empty = { unlocked: 0, best: {}, tips: {}, finished: false };
  try { return Object.assign(empty, JSON.parse(localStorage.getItem("gill.save2") || "{}")); }
  catch (e) { return empty; }
}
let save = loadSave();
function writeSave() { try { localStorage.setItem("gill.save2", JSON.stringify(save)); } catch (e) { /* private mode */ } }

/* ---------- HUD ---------- */
let toastT = 0, tipT = 0;
function toast(text, secs = 3) { const t = $("toast"); t.textContent = text; t.classList.add("show"); toastT = secs; }
const tipQueue = [];
function tip(key) {
  if (save.tips[key] || !S.tips[key]) return;
  save.tips[key] = true; writeSave();
  tipQueue.push(S.tips[key]);
  if (tipT <= 0) nextTip();
}
function nextTip() {
  const t = $("tip");
  if (!tipQueue.length) { t.classList.remove("show"); tipT = 0; return; }
  t.textContent = tipQueue.shift(); t.classList.add("show"); tipT = 6;
}
function setObjective(text) {
  const el = $("objective");
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
}
function drawHearts() { $("hearts").textContent = "♥".repeat(Math.max(0, health)) + "♡".repeat(Math.max(0, 5 - health)); }
function drawMixer() {
  const el = $("mixer");
  if (!mission) { el.innerHTML = ""; return; }
  el.innerHTML = mission.quads.map((qd, i) => {
    const c = "#" + PART_COLOURS[i].toString(16).padStart(6, "0");
    return `<div class="ch${qd.done ? " on" : ""}" style="--c:${c}"><span class="bar"><i></i></span><b>${qd.partName}</b></div>`;
  }).join("");
}
function refreshObjective() {
  if (!mission) return;
  const m = mission, left = m.quads.filter(q => !q.done);
  if (escape) return setObjective("Get Zora out. Reach the gold light!");
  if (zora && zora.waiting) return setObjective("Find Zora in the Old Tower.");
  if (!left.length) return setObjective("The song is complete.");
  const here = currentQuad && m.quads.find(q => q.q === currentQuad && !q.done);
  if (here) {
    const p = here.partName;
    if (here.q.focus === "race") return setObjective(race ? `Reach ${p} before time runs out!` : `Step into the gold ring to race for ${p}.`);
    if (here.q.focus === "fight") return setObjective(`Put down the guards to free ${p} (${quadEnemiesLeft(here)} left).`);
    if (here.q.focus === "sneak") return setObjective(`Sneak to ${p} without being seen.`);
    return setObjective(`Find ${p} in ${here.q.name}.`);
  }
  setObjective(`Mission ${m.index + 1}: ${m.def.song}. Unlock the parts in the lit quadrants (${m.quads.length - left.length}/${m.quads.length}).`);
}

/* ---------- music: the song, built up part by part ---------- */
const music = { ac: null, master: null, buffer: null, stems: null, sources: [], parts: [], hint: null, muted: false, key: null, loading: null };
function audioCtx() {
  if (!music.ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    music.ac = new AC();
    music.master = music.ac.createGain(); music.master.gain.value = 0.9;
    music.master.connect(music.ac.destination);
  }
  if (music.ac.state === "suspended") music.ac.resume().catch(() => {});
  return music.ac;
}
async function songUrl(trackId) {
  try {
    const res = await fetch("/.netlify/functions/stream-url", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId })
    });
    const data = await res.json().catch(() => ({}));
    const t = data && data.tracks && data.tracks[trackId];
    if (res.ok && t && t.url) return t.url;
  } catch (e) { /* fall through */ }
  // Testing away from feelzmachine.com: any song from Feelz Run will do.
  if (/localhost|127\.0\.0\.1/.test(location.hostname)) return "../run/assets/audio/m01-against-the-storm.mp3";
  throw new Error("no song");
}
async function decode(url) {
  const ac = audioCtx();
  const buf = await (await fetch(url)).arrayBuffer();
  return await new Promise((res, rej) => ac.decodeAudioData(buf, res, rej));
}
function stopMusic() {
  for (const s of music.sources) { try { s.stop(); } catch (e) { /* stopped */ } try { s.disconnect(); } catch (e) { /* gone */ } }
  music.sources = []; music.parts = []; music.hint = null;
}
// Four placeholder parts cut from the full song by sound, until real stems exist.
const BANDS = [
  [["lowpass", 180]],
  [["highpass", 180], ["lowpass", 900]],
  [["highpass", 900], ["lowpass", 4200]],
  [["highpass", 4200]]
];
async function loadMissionMusic(m) {
  const key = m.def.trackId;
  if (music.key === key && (music.buffer || music.stems)) return;
  music.key = key; music.buffer = null; music.stems = null;
  try {
    if (m.def.stems && m.def.stems.length) music.stems = await Promise.all(m.def.stems.map(s => decode(s.src)));
    else music.buffer = await decode(await songUrl(key));
  } catch (e) { console.warn("[gill] music not available", e && e.message); }
}
function startMusic(m) {
  const ac = audioCtx();
  stopMusic();
  if (!ac || (!music.buffer && !music.stems)) return;
  const t0 = ac.currentTime + 0.1;
  const n = m.quads.length;
  for (let i = 0; i < n; i++) {
    const src = ac.createBufferSource();
    src.buffer = music.stems ? music.stems[i] : music.buffer;
    src.loop = true;
    let node = src;
    if (!music.stems) for (const [type, f] of BANDS[i % BANDS.length]) {
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = 0.7;
      node.connect(fl); node = fl;
    }
    const g = ac.createGain(); g.gain.value = m.quads[i].done ? 1 : 0;
    node.connect(g); g.connect(music.master);
    src.start(t0);
    music.sources.push(src); music.parts.push(g);
  }
  // Before any part is in, the song is heard faintly, as if through a wall.
  const hs = ac.createBufferSource(); hs.buffer = music.stems ? music.stems[0] : music.buffer; hs.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
  const hg = ac.createGain(); hg.gain.value = 0.22;
  hs.connect(lp); lp.connect(hg); hg.connect(music.master); hs.start(t0);
  music.sources.push(hs); music.hint = hg;
  setHint();
}
function setHint() {
  if (!music.hint || !mission) return;
  const doneCount = mission.quads.filter(q => q.done).length;
  music.hint.gain.setTargetAtTime(0.22 * (1 - doneCount / mission.quads.length), music.ac.currentTime, 0.4);
}
function partIn(i) {
  const g = music.parts[i];
  if (g) { g.gain.cancelScheduledValues(music.ac.currentTime); g.gain.setTargetAtTime(1, music.ac.currentTime + 0.05, 0.25); }
  setHint();
  sfxUnlock();
}
function setMuted(m) { music.muted = m; if (music.master) music.master.gain.value = m ? 0 : 0.9; }
// A short rising chime for a part coming in.
function sfxUnlock() {
  const ac = music.ac; if (!ac) return;
  [523, 784, 1047].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.07 + 0.5);
    o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + i * 0.07); o.stop(ac.currentTime + i * 0.07 + 0.55);
  });
}
function sfxHit(strong) {
  const ac = music.ac; if (!ac) return;
  const len = 0.12, b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = strong ? 900 : 1600;
  const g = ac.createGain(); g.gain.value = strong ? 0.5 : 0.32;
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
}

/* ---------- cards: mission intros, placeholder cutscenes ---------- */
let cardDone = null;
function showCard({ kicker, title, lines, goal, button }) {
  return new Promise(resolve => {
    state = "card";
    $("cardKicker").textContent = kicker || "";
    $("cardTitle").textContent = title || "";
    $("cardLines").innerHTML = (lines || []).map(l => {
      const sp = S.speakers[l.who] || S.speakers[""];
      return `<p>${l.who ? `<b style="color:${sp.colour}">${l.who}</b> ` : ""}${l.say}</p>`;
    }).join("");
    $("cardLines").classList.toggle("hidden", !(lines && lines.length));
    $("cardPlaceholder").classList.toggle("hidden", !(lines && lines.length));
    $("cardGoal").textContent = goal || "";
    $("cardGoal").classList.toggle("hidden", !goal);
    $("cardBtn").textContent = button || "Start";
    $("card").classList.remove("hidden");
    $("touch").classList.add("hidden");
    cardDone = resolve;
  });
}
function cardContinue() {
  if (state !== "card") return;
  $("card").classList.add("hidden");
  if (phone) $("touch").classList.remove("hidden");
  state = "play";
  lastT = performance.now();
  const d = cardDone; cardDone = null; d && d();
}
$("card").addEventListener("click", cardContinue);   // a tap anywhere on the card carries on

/* ---------- game-time events (follow the game clock, pause with it) ---------- */
const timers = [];
function later(secs, fn) { timers.push({ t: secs, fn }); }
function runTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= dt) <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); }
}

/* ---------- game state ---------- */
let state = "title";            // title | card | play | paused | score
let koda = null, zora = null, mission = null, currentQuad = null, race = null, escape = null;
const enemies = [], npcs = [];
let health = 5, invuln = 0, attackLock = 0, comboStep = 0, lunge = null, air = null;

/* ---------- missions ---------- */
const orbGeo = new THREE.IcosahedronGeometry(0.45, 1);
function makeOrb(colour) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 2, metalness: 0.2, roughness: 0.3 });
  const gem = new THREE.Mesh(orbGeo, mat); gem.position.y = 1.2; gem.castShadow = true;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 4.5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(gem, beam, ring);
  g.userData.gem = gem;
  scene.add(g);
  return g;
}
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
function ringAt(x, z, r) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 48), ringMat);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 6, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 3;
  g.add(m, beam); g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
function clearMission() {
  timers.length = 0;
  for (const e of enemies) scene.remove(e.a.root);
  enemies.length = 0;
  for (const n of npcs) scene.remove(n.a.root);
  npcs.length = 0;
  if (mission) for (const qd of mission.quads) { if (qd.orb) scene.remove(qd.orb); if (qd.ring) scene.remove(qd.ring); }
  if (zora) { scene.remove(zora.root); zora = null; }
  if (escape && escape.mesh) scene.remove(escape.mesh);
  race = null; escape = null; $("race").textContent = "";
  for (const id in pads) { pads[id].mat.emissive.setHex(0x000000); }
}
async function startMission(i, { showIntro = true } = {}) {
  clearMission();
  const def = S.missions[i];
  const names = def.stems && def.stems.length ? def.stems.map(s => s.name) : S.defaultParts;
  mission = {
    index: i, def, t: 0,
    quads: def.quads ? def.quads : def.quadrants.map((id, k) => ({ q: Q(id), partName: names[k % names.length], done: false, seen: false, spawned: false, orb: null })),
    stats: { kos: 0, takedowns: 0, seenCount: 0, hurt: 0 }, order: [], finished: false
  };
  mission.quads.forEach((qd, k) => { qd.k = k; pads[qd.q.id].mat.emissive.setHex(PART_COLOURS[k]).multiplyScalar(0.08); });
  health = 5; drawHearts(); drawMixer();
  lunge = null; air = null; attackLock = 0; invuln = 0; comboStep = 0; race = null; currentQuad = null;
  $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  // Start at the south edge of the mission's first quadrant.
  const c = zoneCenter(mission.quads[0].q);
  const spot = freeSpot(c.x, c.y + ZONE / 2 - 3);
  koda.pos.set(spot.x, 0, spot.z); koda.face(Math.PI, 1); koda.play("idle");
  updateCamera(0, true);
  const loading = loadMissionMusic(mission);
  if (showIntro) {
    const cs = def.cutscene && S.cutscenes[def.cutscene];
    await showCard({ kicker: `MISSION ${i + 1} OF ${S.missions.length}`, title: def.song, lines: cs, goal: def.goal + " Each lit quadrant holds one part of the song: unlock them in any order to build your own mix.", button: "Start the mission" });
  }
  await loading;
  if (mission && mission.index === i) startMusic(mission);
  tip("start");
  refreshObjective();
}

/* What each quadrant asks for, set up the first time Koda comes near it. */
async function spawnQuad(qd) {
  if (qd.spawned) return;
  qd.spawned = true;
  const m = mission, q = qd.q, r = rng(q.id.charCodeAt(2) * 7919 + m.index * 131 + 17);
  const c = zoneCenter(q), o = zoneOrigin(q);
  const tougher = Math.floor(m.index / 4);
  const count = q.focus === "fight" ? 3 + tougher : q.focus === "sneak" ? 3 + tougher : q.focus === "race" ? 1 : 2;
  const names = Object.keys(ENEMIES).filter(n => n !== "gilded");
  for (let i = 0; i < count; i++) {
    const kind = q.focus === "fight" && i === 0 && m.index >= 2 ? "gilded" : names[Math.floor(r() * names.length)];
    const ang = (i / count) * Math.PI * 2 + r(), rad = 8 + r() * 8;
    const route = [];
    for (let k = 0; k < 4; k++) {
      const a2 = ang + k * Math.PI / 2;
      const s = freeSpot(c.x + Math.cos(a2) * rad, c.y + Math.sin(a2) * rad, 0.6, r);
      route.push(new THREE.Vector3(s.x, 0, s.z));
    }
    makeActor(kind + ".glb", ENEMIES[kind]).then(a => {
      if (mission !== m) return;
      a.pos.copy(route[0]); scene.add(a.root); a.play("walk");
      enemies.push({ a, qd, route, leg: 1, state: "patrol", meter: 0, hp: kind === "gilded" ? 5 : 3,
        cool: 0.5, hitT: 0, lastSeen: new THREE.Vector3(), searchT: 0, speed: 2 + r() * 0.5, kind });
      refreshObjective();
    }).catch(() => {});
  }
  if (q.focus === "explore") {
    for (let i = 0; i < 2; i++) {
      const who = TOWNSFOLK[Math.floor(r() * TOWNSFOLK.length)];
      makeActor("townsfolk/" + who + ".glb", 1.65).then(a => {
        if (mission !== m) return;
        const s = freeSpot(c.x - 6 + r() * 12, c.y - 6 + r() * 12, 0.8, r);
        a.pos.set(s.x, 0, s.z); a.face(r() * Math.PI * 2, 1);
        scene.add(a.root); a.play("idle");
        npcs.push({ a, line: S.npcLines[Math.floor(r() * S.npcLines.length)] });
      }).catch(() => {});
    }
  }
  const colour = PART_COLOURS[qd.k];
  if (q.focus === "explore" || q.focus === "sneak") {
    const s = freeSpot(o.x + 10 + r() * (ZONE - 20), o.y + 10 + r() * (ZONE - 20), 1.2, r);
    qd.orb = makeOrb(colour); qd.orb.position.set(s.x, 0, s.z);
  }
  if (q.focus === "race") {
    // The ring at the edge nearest Koda, the part across the quadrant.
    const fromSouth = koda.pos.z > c.y;
    const start = freeSpot(c.x, fromSouth ? o.y + ZONE - 5 : o.y + 5, 1.2);
    const end = freeSpot(c.x + (r() - 0.5) * 20, fromSouth ? o.y + 6 : o.y + ZONE - 6, 1.2);
    qd.ring = ringAt(start.x, start.z, 1.8);
    qd.raceEnd = end;
  }
}
const quadEnemiesLeft = qd => enemies.filter(e => e.qd === qd && e.state !== "ko").length;

function unlockPart(qd) {
  if (qd.done) return;
  qd.done = true;
  if (qd.orb) { scene.remove(qd.orb); qd.orb = null; }
  if (qd.ring) { scene.remove(qd.ring); qd.ring = null; }
  mission.order.push(qd.partName);
  pads[qd.q.id].mat.emissive.setHex(0x000000);
  partIn(qd.k);
  drawMixer();
  const unseen = !qd.seen;
  toast(`${qd.partName} joins the mix${unseen ? ". Unseen!" : "."}`, 3);
  refreshObjective();
  if (mission.quads.every(x => x.done)) songComplete();
}
async function songComplete() {
  const m = mission;
  if (m.def.final) {
    // The last song is whole: Zora is in the Old Tower.
    const c = zoneCenter(Q("q11"));
    try {
      zora = await makeActor("zora.glb", 1.58);
      const s = freeSpot(c.x, c.y);
      zora.pos.set(s.x, 0, s.z); scene.add(zora.root);
      zora.play(zora.has("stun") ? "stun" : "idle");
      zora.waiting = true;
    } catch (e) { return finishMission(); }
    toast("The song is whole. Zora is in the Old Tower!", 4);
    refreshObjective();
    return;
  }
  toast(`${m.def.song} is complete.`, 3);
  later(3.5, () => { if (mission === m) finishMission(); });
}

/* ---------- score ---------- */
function scoreFor(m) {
  const parts = m.quads.filter(q => q.done).length * 1000;
  const time = Math.max(0, Math.round(3000 - m.t * 8));
  const stealth = m.quads.filter(q => q.done && !q.seen).length * 400;
  const takedowns = m.stats.takedowns * 200, kos = m.stats.kos * 100, hurt = -m.stats.hurt * 150;
  const total = Math.max(0, parts + time + stealth + takedowns + kos + hurt);
  const grade = total >= 7500 ? "S" : total >= 6000 ? "A" : total >= 4500 ? "B" : "C";
  return { rows: [["Parts unlocked", parts], ["Time bonus", time], ["Unseen quadrants", stealth], ["Takedowns", takedowns], ["Guards put down", kos], ["Hits taken", hurt]], total, grade };
}
function finishMission() {
  const m = mission;
  if (!m || m.finished) return;
  m.finished = true;
  state = "score";
  const sc = scoreFor(m);
  const prev = save.best[m.index];
  const isBest = !prev || sc.total > prev.total;
  if (isBest) save.best[m.index] = { total: sc.total, grade: sc.grade, order: m.order };
  save.unlocked = Math.max(save.unlocked, Math.min(S.missions.length - 1, m.index + 1));
  if (m.def.final) save.finished = true;
  writeSave();
  $("scoreTitle").textContent = `Mission ${m.index + 1}: ${m.def.song}`;
  $("scoreGrade").textContent = sc.grade;
  $("scoreRows").innerHTML = sc.rows.map(([k, v]) => `<div><span>${k}</span><b>${v >= 0 ? "" : "-"}${Math.abs(v)}</b></div>`).join("") +
    `<div class="total"><span>Total${isBest ? " · new best" : ""}</span><b>${sc.total}</b></div>`;
  $("scoreMix").textContent = "Your mix: " + m.order.join(" → ");
  const last = m.index >= S.missions.length - 1;
  $("nextBtn").textContent = last ? "Back to the title" : `Next: ${S.missions[m.index + 1].song}`;
  $("score").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("touch").classList.add("hidden");
}
$("nextBtn").addEventListener("click", () => {
  $("score").classList.add("hidden");
  const m = mission;
  if (!m || m.index >= S.missions.length - 1) return toTitle();
  state = "play";
  startMission(m.index + 1);
});
$("replayBtn").addEventListener("click", () => {
  $("score").classList.add("hidden");
  state = "play";
  startMission(mission.index, { showIntro: false });
});

/* ---------- the final escape ---------- */
function updateZora(dt) {
  if (!zora) return;
  zora.update(dt);
  if (zora.waiting) {
    if (dist2(koda.pos, zora.pos) < 2.2) {
      zora.waiting = false;
      showCard({ kicker: "CUTSCENE", title: "Zora", lines: S.cutscenes.found, button: "Run" }).then(() => {
        const ex = new THREE.Vector2(WORLD_W + ROAD - 3, zoneCenter(Q("q12")).y);
        escape = { t: 60, exit: ex, mesh: ringAt(ex.x, ex.y, 3) };
        for (const e of enemies) if (e.state !== "ko") alertEnemy(e);
        refreshObjective();
      });
    }
    return;
  }
  const dx = koda.pos.x - zora.pos.x, dz = koda.pos.z - zora.pos.z, d = Math.hypot(dx, dz);
  if (d > 1.8) {
    const sp = Math.min(d - 1.8, 7 * dt);
    moveWithCollision(zora.pos, dx / d * sp, dz / d * sp, 0.4);
    zora.play(d > 4 ? "sprint" : "run");
    zora.face(Math.atan2(dx, dz), 0.25);
  } else zora.play("idle");
  if (escape) {
    escape.t -= dt;
    $("race").textContent = Math.max(0, escape.t).toFixed(1);
    if (Math.hypot(koda.pos.x - escape.exit.x, koda.pos.z - escape.exit.y) < 3.2) {
      scene.remove(escape.mesh); escape = null; $("race").textContent = "";
      showCard({ kicker: "CUTSCENE", title: "Home", lines: S.cutscenes.ending, button: "See your score" }).then(finishMission);
    } else if (escape.t <= 0) {
      escape.t = 45;
      toast("They're closing in. Keep going!", 2.5);
    }
  }
}

/* ---------- Koda ---------- */
const CONTACT = 1.05;      // how close a hit lands: fists meet faces
function updateKoda(dt) {
  readInput();
  invuln = Math.max(0, invuln - dt);
  // In the air: a simple jump arc. You can steer while airborne.
  if (air) {
    air.vy -= 22 * dt; koda.pos.y += air.vy * dt;
    if (input.mag) moveWithCollision(koda.pos, input.x * air.speed * dt, input.z * air.speed * dt, 0.45);
    if (koda.pos.y <= 0) {
      koda.pos.y = 0;
      if (air.kick) landKick();
      air = null; attackLock = Math.max(attackLock, 0.12);
    }
    koda.update(dt);
    return;
  }
  // A strike pulls him in to contact range with the guard he is hitting.
  if (lunge) {
    lunge.t -= dt;
    const k = Math.min(1, dt / Math.max(0.01, lunge.t + dt));
    const nx = koda.pos.x + (lunge.x - koda.pos.x) * k, nz = koda.pos.z + (lunge.z - koda.pos.z) * k;
    moveWithCollision(koda.pos, nx - koda.pos.x, nz - koda.pos.z, 0.45);
    if (lunge.t <= 0) lunge = null;
  }
  if (attackLock > 0) { attackLock -= dt; koda.update(dt); return; }
  const sneaking = input.sneak;
  const sprint = !sneaking && input.mag > 0.93;
  const speed = input.mag === 0 ? 0 : sneaking ? 2.6 : sprint ? 8.2 : 5.4;
  if (speed > 0) {
    moveWithCollision(koda.pos, input.x * speed * dt, input.z * speed * dt, 0.45);
    koda.face(Math.atan2(input.x, input.z), Math.min(1, dt * 14));
    koda.play(sneaking ? "crouch_walk" : sprint ? "sprint" : "run");
  } else koda.play(sneaking ? "crouch_idle" : "idle");
  koda.moving = speed > 0; koda.sprinting = sprint; koda.sneaking = sneaking;
  koda.update(dt);
}
function jump() {
  if (!koda || air || attackLock > 0) return;
  const speed = input.mag ? (input.mag > 0.93 ? 7.5 : 5) : 0;
  air = { vy: 7.2, speed, kick: false };
  koda.play("jump", { once: true, speed: 1.3 });
  tip("jump");
}
// The guard to strike: the nearest one in reach, favouring the one he faces.
function strikeTarget(reach) {
  let best = null, bs = Infinity;
  const f = forward(koda);
  for (const e of enemies) {
    if (e.state === "ko") continue;
    const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
    if (d > reach) continue;
    const facing = (dx * f.x + dz * f.y) / (d || 1);
    const s = d - facing * 1.2;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function attack() {
  if (!koda || attackLock > 0) return;
  if (air) {
    if (air.kick) return;
    air.kick = true; air.vy = Math.max(air.vy, 3);
    koda.play(koda.has("flykick") ? "flykick" : "kick", { once: true, speed: 1.4 });
    const t = strikeTarget(4);
    if (t) { koda.faceTo(t.a.pos.x, t.a.pos.z); air.speed = 6; input.x = Math.sin(koda.yaw); input.z = Math.cos(koda.yaw); }
    return;
  }
  const t = strikeTarget(3.2);
  if (t) {
    // Turn to him and close in, so the blow lands where it is aimed.
    koda.faceTo(t.a.pos.x, t.a.pos.z);
    const dx = t.a.pos.x - koda.pos.x, dz = t.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d > CONTACT) lunge = { x: t.a.pos.x - dx / d * CONTACT, z: t.a.pos.z - dz / d * CONTACT, t: 0.14 };
  }
  const move = comboStep++ % 3 === 2 ? "kick" : "punch";
  attackLock = Math.min(0.5, koda.play(move, { once: true, speed: 1.5 }) || 0.42);
  later(0.17, () => {
    const f = forward(koda);
    for (const e of enemies) {
      if (e.state === "ko") continue;
      const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.6 && (dx * f.x + dz * f.y) / (d || 1) > 0.3) hitEnemy(e, move === "kick" ? 2 : 1, dx / (d || 1), dz / (d || 1));
    }
  });
}
function landKick() {
  for (const e of enemies) {
    if (e.state === "ko") continue;
    const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.9) hitEnemy(e, 2, dx / (d || 1), dz / (d || 1));
  }
}
function action() {
  if (!koda || attackLock > 0 || air) return;
  // A takedown: from behind, unseen.
  for (const e of enemies) {
    if (e.state === "ko" || e.state === "alert") continue;
    const dx = koda.pos.x - e.a.pos.x, dz = koda.pos.z - e.a.pos.z, d = Math.hypot(dx, dz);
    const ef = forward(e.a);
    if (d < 2 && (dx * ef.x + dz * ef.y) / (d || 1) < -0.2) {
      koda.faceTo(e.a.pos.x, e.a.pos.z);
      lunge = { x: e.a.pos.x - ef.x * 0.7, z: e.a.pos.z - ef.y * 0.7, t: 0.15 };
      attackLock = Math.min(1.3, koda.play("takedown", { once: true, speed: 1.25 }) || 1);
      mission.stats.takedowns++;
      later(0.42, () => { knockOut(e); sfxHit(true); });
      return;
    }
  }
  for (const n of npcs) {
    if (dist2(koda.pos, n.a.pos) < 2.6) {
      n.a.faceTo(koda.pos.x, koda.pos.z);
      return toast("\"" + n.line + "\"", 4);
    }
  }
}
function hurtKoda(n, fromX, fromZ) {
  if (invuln > 0 || state !== "play" || air) return;
  health -= n; invuln = 1.0; drawHearts();
  mission.stats.hurt += n;
  sfxHit(true);
  const dx = koda.pos.x - fromX, dz = koda.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
  moveWithCollision(koda.pos, dx / d * 0.45, dz / d * 0.45, 0.45);
  koda.faceTo(fromX, fromZ);
  koda.play("hurt", { once: true }); attackLock = 0.3;
  if (health <= 0) respawn();
}
function respawn() {
  const qd = mission.quads.find(q => !q.done) || mission.quads[0];
  const c = zoneCenter(qd.q);
  const s = freeSpot(c.x, c.y + ZONE / 2 - 3);
  koda.pos.set(s.x, 0, s.z);
  health = 5; drawHearts();
  for (const e of enemies) if (e.state !== "ko") { e.state = "patrol"; e.meter = 0; }
  if (race) failRace();
  toast("Back on your feet. Go quieter this time.", 3);
}

/* ---------- enemies ---------- */
function alertEnemy(e) {
  if (e.state === "ko" || e.state === "alert") return;
  e.state = "alert"; e.meter = 1; e.cool = 0.5;
  e.a.play(e.a.has("alert") ? "alert" : "run", { once: true });
  if (e.qd && !e.qd.done) {
    if (!e.qd.seen) mission.stats.seenCount++;
    e.qd.seen = true;
    // Seen in a sneak quadrant: the part moves somewhere else.
    if (e.qd.q.focus === "sneak" && e.qd.orb && !e.qd.moved) {
      e.qd.moved = true;
      const o = zoneOrigin(e.qd.q);
      const s = freeSpot(o.x + 10 + Math.random() * (ZONE - 20), o.y + 10 + Math.random() * (ZONE - 20));
      e.qd.orb.position.set(s.x, 0, s.z);
      toast(`They saw you. ${e.qd.partName} has moved.`, 3);
    }
  }
  tip("seen");
}
function hitEnemy(e, dmg, nx, nz) {
  e.hp -= dmg;
  sfxHit(dmg > 1);
  // Knocked back a step, and turned to face his attacker.
  moveWithCollision(e.a.pos, nx * 0.5, nz * 0.5, 0.45);
  e.a.faceTo(koda.pos.x, koda.pos.z);
  if (e.hp <= 0) return knockOut(e);
  e.a.play("hit", { once: true }); e.hitT = 0.4; e.cool = Math.max(e.cool, 0.6);
  if (e.state !== "alert") alertEnemy(e);
}
function knockOut(e) {
  if (e.state === "ko") return;
  e.state = "ko"; e.a.play("ko", { once: true });
  mission.stats.kos++;
  const qd = e.qd;
  if (qd && qd.q.focus === "fight" && !qd.done && quadEnemiesLeft(qd) === 0) {
    const s = freeSpot(e.a.pos.x, e.a.pos.z, 1);
    qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(s.x, 0, s.z);
    toast(`The last guard is down. Grab ${qd.partName}!`, 3);
  }
  refreshObjective();
}

let anySeen = false, anySus = false, swingGap = 0;   // guards take turns to swing
function updateEnemies(dt) {
  anySeen = false; anySus = false; swingGap = Math.max(0, swingGap - dt);
  for (const e of enemies) {
    const a = e.a;
    const d = dist2(koda.pos, a.pos);
    a.root.visible = d < 60;
    if (d > 55) continue;
    a.update(dt);
    if (e.state === "ko") continue;
    e.cool = Math.max(0, e.cool - dt); e.hitT = Math.max(0, e.hitT - dt);
    if (e.hitT > 0) continue;
    if (d < 14 && e.state === "patrol") tip("guard");

    const f = forward(a), dx = koda.pos.x - a.pos.x, dz = koda.pos.z - a.pos.z;
    const range = koda.sneaking ? 6.5 : 12;
    const inCone = d < range && (dx * f.x + dz * f.y) / (d || 1) > 0.42;
    const heard = (koda.sprinting || air) && d < 5.5;
    const sees = (inCone || heard || d < 1.3) && sightClear(a.pos.x, a.pos.z, koda.pos.x, koda.pos.z);

    if (e.state !== "alert") {
      if (sees) {
        e.meter += dt * (koda.sneaking ? 0.7 : 1.6) * (1.4 - d / range);
        e.lastSeen.copy(koda.pos);
        if (e.state === "patrol") { e.state = "suspicious"; a.play(a.has("alert") ? "alert" : "walk"); }
        a.face(Math.atan2(dx, dz), Math.min(1, dt * 4));
        if (e.meter >= 1) alertEnemy(e);
      } else {
        e.meter = Math.max(0, e.meter - dt * 0.35);
        if (e.state === "suspicious" && e.meter <= 0) e.state = "patrol";
      }
      if (e.state === "patrol" || (e.state === "suspicious" && !sees)) {
        const tgt = e.state === "patrol" ? e.route[e.leg] : e.lastSeen;
        const tx = tgt.x - a.pos.x, tz = tgt.z - a.pos.z, td = Math.hypot(tx, tz);
        if (td < 0.6) { if (e.state === "patrol") e.leg = (e.leg + 1) % e.route.length; }
        else {
          moveWithCollision(a.pos, tx / td * e.speed * dt, tz / td * e.speed * dt, 0.45);
          a.face(Math.atan2(tx, tz), Math.min(1, dt * 5));
          a.play("walk");
        }
      }
      if (e.meter > 0.15) anySus = true;
      continue;
    }

    // Alerted: chase, square up, and swing only when face to face.
    anySeen = true;
    if (sees) { e.lastSeen.copy(koda.pos); e.searchT = 6; } else e.searchT -= dt;
    if (e.searchT <= 0) { e.state = "suspicious"; e.meter = 0.6; a.play("walk"); continue; }
    if (d > 1.7) {
      const tx = e.lastSeen.x - a.pos.x, tz = e.lastSeen.z - a.pos.z, td = Math.hypot(tx, tz) || 1;
      if (td > 0.3) moveWithCollision(a.pos, tx / td * 5.2 * dt, tz / td * 5.2 * dt, 0.45);
      a.face(Math.atan2(tx, tz), Math.min(1, dt * 8));
      if (e.cool <= 0.2) a.play("run");
      continue;
    }
    // In range: always face him, hold contact distance.
    a.face(Math.atan2(dx, dz), Math.min(1, dt * 12));
    if (d > CONTACT + 0.1) moveWithCollision(a.pos, dx / d * 2.5 * dt, dz / d * 2.5 * dt, 0.45);
    if (e.cool <= 0 && swingGap > 0) e.cool = 0.25;
    if (e.cool > 0) { if (a.current && /run|walk/.test(a.current.getClip().name)) a.play(a.has("fight_idle") ? "fight_idle" : "walk"); continue; }
    a.play("punch", { once: true, speed: 1.1 }); e.cool = 1.35;
    swingGap = mission.index < 3 ? 1.1 : mission.index < 8 ? 0.8 : 0.55;
    later(0.36, () => {
      if (e.state !== "alert") return;
      const ddx = koda.pos.x - a.pos.x, ddz = koda.pos.z - a.pos.z, dd = Math.hypot(ddx, ddz);
      const ef = forward(a);
      if (dd < 1.6 && (ddx * ef.x + ddz * ef.y) / (dd || 1) > 0.5) hurtKoda(1, a.pos.x, a.pos.z);
    });
  }
  // Guards don't stand inside each other.
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const p = enemies[i].a.pos, q = enemies[j].a.pos;
    if (enemies[i].state === "ko" || enemies[j].state === "ko") continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.9) { const push = (0.9 - d) / 2; p.x -= dx / d * push; p.z -= dz / d * push; q.x += dx / d * push; q.z += dz / d * push; }
  }
  const al = $("alert");
  al.className = "alert" + (anySeen ? " seen" : anySus ? " sus" : "");
  al.textContent = anySeen ? "SEEN" : anySus ? "?" : "";
}

function updateNpcs(dt) {
  for (const n of npcs) {
    const d = dist2(koda.pos, n.a.pos);
    n.a.root.visible = d < 60;
    if (d < 45) n.a.update(dt);
  }
}

/* ---------- quadrants, parts and races ---------- */
function failRace() {
  if (!race) return;
  const qd = race.qd;
  if (qd.orb) { scene.remove(qd.orb); qd.orb = null; }
  qd.ring.visible = true;
  race = null; $("race").textContent = "";
}
function updateQuads(dt, now) {
  const q = zoneAt(koda.pos.x, koda.pos.z);
  if (q !== currentQuad) {
    currentQuad = q;
    const qd = q && mission.quads.find(x => x.q === q);
    $("zoneName").textContent = q ? q.name.toUpperCase() : "THE STREETS";
    $("zoneSong").textContent = qd ? (qd.done ? `${qd.partName} ✓` : `Holds: ${qd.partName}`) : mission.def.song;
    if (qd && !qd.done) tip(q.focus);
    refreshObjective();
  }
  for (const qd of mission.quads) {
    if (!qd.done) { const c = zoneCenter(qd.q); if (Math.hypot(c.x - koda.pos.x, c.y - koda.pos.z) < ZONE * 1.1) spawnQuad(qd); }
    if (qd.orb) {
      const g = qd.orb.userData.gem; g.rotation.y += dt * 1.6; g.position.y = 1.2 + Math.sin(now / 380) * 0.15;
      if (!qd.done && dist2(koda.pos, qd.orb.position) < 1.5) unlockPart(qd);
    }
    // Races: step in the ring and the part appears across the quadrant, against the clock.
    if (qd.ring && qd.ring.visible && !race && dist2(koda.pos, qd.ring.position) < 1.9) {
      qd.ring.visible = false;
      qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(qd.raceEnd.x, 0, qd.raceEnd.z);
      race = { qd, t: 22 + Math.max(0, 6 - mission.index) };
      toast("Run!", 1.5);
      refreshObjective();
    }
  }
  if (race) {
    race.t -= dt;
    $("race").textContent = Math.max(0, race.t).toFixed(1);
    if (race.qd.done) { race = null; $("race").textContent = ""; }
    else if (race.t <= 0) { failRace(); toast("Too slow. Back to the ring and run it again.", 3); refreshObjective(); }
  }
}

/* ---------- where to go next ---------- */
const guide = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.6); shape.lineTo(0.55, 0.7); shape.lineTo(0.2, 0.7); shape.lineTo(0.2, 0); shape.lineTo(-0.2, 0); shape.lineTo(-0.2, 0.7); shape.lineTo(-0.55, 0.7); shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group(); g.add(m); g.visible = false; scene.add(g);
  return g;
})();
function objectiveTarget() {
  if (escape) return { x: escape.exit.x, z: escape.exit.y };
  if (zora && zora.waiting) return { x: zora.pos.x, z: zora.pos.z };
  if (race && race.qd.orb) return { x: race.qd.orb.position.x, z: race.qd.orb.position.z };
  const here = currentQuad && mission.quads.find(x => x.q === currentQuad && !x.done);
  const targetIn = qd => {
    if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z };
    if (qd.ring && qd.ring.visible) return { x: qd.ring.position.x, z: qd.ring.position.z };
    if (qd.q.focus === "fight") { const e = enemies.find(x => x.qd === qd && x.state !== "ko"); if (e) return { x: e.a.pos.x, z: e.a.pos.z }; }
    return null;
  };
  if (here) { const t = targetIn(here); if (t) return t; }
  let best = null, bd = Infinity;
  for (const qd of mission.quads) {
    if (qd.done) continue;
    const c = zoneCenter(qd.q), d = Math.hypot(c.x - koda.pos.x, c.y - koda.pos.z);
    if (d < bd) { bd = d; best = { x: c.x, z: c.y }; }
  }
  return best;
}

/* ---------- finding a way round buildings (for the guide arrow) ---------- */
const NAV = { cell: 1, ox: -ROAD + 1, oz: -ROAD + 1, w: 0, h: 0, grid: null };
function buildNav() {
  NAV.w = Math.ceil((WORLD_W + 2 * ROAD - 2) / NAV.cell); NAV.h = Math.ceil((WORLD_H + 2 * ROAD - 2) / NAV.cell);
  NAV.grid = new Uint8Array(NAV.w * NAV.h);
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++)
    NAV.grid[j * NAV.w + i] = blocked(NAV.ox + (i + 0.5) * NAV.cell, NAV.oz + (j + 0.5) * NAV.cell, 0.8) ? 1 : 0;
}
const navCell = (x, z) => [clamp(Math.floor((x - NAV.ox) / NAV.cell), 0, NAV.w - 1), clamp(Math.floor((z - NAV.oz) / NAV.cell), 0, NAV.h - 1)];
function nearestOpen(i, j) {
  if (!NAV.grid[j * NAV.w + i]) return [i, j];
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < NAV.w && b < NAV.h && !NAV.grid[b * NAV.w + a]) return [a, b];
  }
  return [i, j];
}
// A line a body can walk along: clear at both shoulders, not just the middle.
function wideClear(ax, az, bx, bz, r = 0.6) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1, px = -dz / d * r, pz = dx / d * r;
  return sightClear(ax, az, bx, bz) && sightClear(ax + px, az + pz, bx + px, bz + pz) && sightClear(ax - px, az - pz, bx - px, bz - pz);
}
// The next point to head for on the way from (x, z) to (tx, tz).
function pathNext(x, z, tx, tz) {
  if (!NAV.grid || wideClear(x, z, tx, tz)) return { x: tx, z: tz };
  const [si, sj] = nearestOpen(...navCell(x, z)), [ti, tj] = nearestOpen(...navCell(tx, tz));
  const W = NAV.w, N = W * NAV.h, start = sj * W + si, goal = tj * W + ti;
  const came = new Int32Array(N).fill(-1), g = new Float32Array(N).fill(Infinity);
  const heap = [[0, start]]; g[start] = 0; came[start] = start;
  const push = (f, n) => { heap.push([f, n]); let c = heap.length - 1; while (c > 0) { const pr = (c - 1) >> 1; if (heap[pr][0] <= heap[c][0]) break; [heap[pr], heap[c]] = [heap[c], heap[pr]]; c = pr; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  let found = false, guard = 0;
  while (heap.length && guard++ < 60000) {
    const [, n] = pop();
    if (n === goal) { found = true; break; }
    const ni = n % W, nj = (n / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = ni + di, b = nj + dj;
      if (a < 0 || b < 0 || a >= W || b >= NAV.h) continue;
      const m = b * W + a;
      if (NAV.grid[m] || (di && dj && (NAV.grid[nj * W + a] || NAV.grid[b * W + ni]))) continue;
      const ng = g[n] + (di && dj ? 1.414 : 1);
      if (ng < g[m]) { g[m] = ng; came[m] = n; push(ng + Math.hypot(ti - a, tj - b), m); }
    }
  }
  if (!found) return { x: tx, z: tz };
  // Walk back from the goal; return the furthest point still in plain sight.
  const path = [];
  for (let n = goal; n !== start; n = came[n]) path.push(n);
  path.reverse();
  let pick = path[0];
  for (const n of path) {
    const px = NAV.ox + ((n % W) + 0.5) * NAV.cell, pz = NAV.oz + (((n / W) | 0) + 0.5) * NAV.cell;
    if (wideClear(x, z, px, pz)) pick = n; else break;
  }
  return { x: NAV.ox + ((pick % W) + 0.5) * NAV.cell, z: NAV.oz + (((pick / W) | 0) + 0.5) * NAV.cell };
}
let guideStep = null, guideT = 0;
function updateGuide(now, dt) {
  const goal = objectiveTarget();
  if ((guideT -= dt) <= 0 || !guideStep) { guideStep = goal && pathNext(koda.pos.x, koda.pos.z, goal.x, goal.z); guideT = 0.4; }
  const t = goal && guideStep;
  const d = goal ? Math.hypot(goal.x - koda.pos.x, goal.z - koda.pos.z) : 0;
  guide.visible = !!t && d > 3 && Math.hypot(t.x - koda.pos.x, t.z - koda.pos.z) > 0.3;
  if (!guide.visible) return;
  guide.position.set(koda.pos.x, 0.06, koda.pos.z);
  guide.rotation.y = Math.atan2(t.x - koda.pos.x, t.z - koda.pos.z);
  guide.children[0].position.set(0, 0, 1.4 + Math.sin(now / 260) * 0.15);
}

/* ---------- minimap ---------- */
const mm = $("minimap").getContext("2d");
function drawMinimap() {
  const W = 160, H = 120, k = Math.min(W / (WORLD_W + 8), H / (WORLD_H + 8)), ox = (W - WORLD_W * k) / 2, oz = (H - WORLD_H * k) / 2;
  mm.clearRect(0, 0, W, H);
  for (const q of S.quadrants) {
    const o = zoneOrigin(q);
    const qd = mission && mission.quads.find(x => x.q === q);
    const col = qd ? "#" + PART_COLOURS[qd.k].toString(16).padStart(6, "0") : null;
    mm.fillStyle = qd ? (qd.done ? "rgba(255,255,255,.18)" : col + "88") : "rgba(255,255,255,.06)";
    mm.fillRect(ox + o.x * k, oz + o.y * k, ZONE * k, ZONE * k);
    if (q === currentQuad) { mm.strokeStyle = "#fff"; mm.lineWidth = 1.5; mm.strokeRect(ox + o.x * k + 1, oz + o.y * k + 1, ZONE * k - 2, ZONE * k - 2); }
    if (qd && qd.done) { mm.fillStyle = "#7fe39a"; mm.font = "bold 12px sans-serif"; mm.textAlign = "center"; mm.fillText("✓", ox + (o.x + ZONE / 2) * k, oz + (o.y + ZONE / 2) * k + 4); }
  }
  if (zora && zora.waiting) { mm.fillStyle = "#d58cff"; mm.beginPath(); mm.arc(ox + zora.pos.x * k, oz + zora.pos.z * k, 3.5, 0, 7); mm.fill(); }
  if (escape) { mm.fillStyle = "#ffd27a"; mm.beginPath(); mm.arc(ox + escape.exit.x * k, oz + escape.exit.y * k, 3.5, 0, 7); mm.fill(); }
  for (const e of enemies) if (e.state === "alert") { mm.fillStyle = "#ff5a46"; mm.fillRect(ox + e.a.pos.x * k - 1, oz + e.a.pos.z * k - 1, 2.5, 2.5); }
  mm.fillStyle = "#fff"; mm.beginPath(); mm.arc(ox + koda.pos.x * k, oz + koda.pos.z * k, 3, 0, 7); mm.fill();
}

/* ---------- camera ---------- */
const camTarget = new THREE.Vector3();
function updateCamera(dt, snap) {
  const lead = koda.moving ? 1.6 : 0;
  camTarget.set(koda.pos.x + Math.sin(koda.yaw) * lead, 0.8, koda.pos.z + Math.cos(koda.yaw) * lead);
  const want = camTarget.clone().add(CAM_OFFSET);
  if (snap) camera.position.copy(want); else camera.position.lerp(want, Math.min(1, dt * 4));
  camera.lookAt(camera.position.clone().sub(CAM_OFFSET));
  sun.position.set(koda.pos.x + 14, 30, koda.pos.z + 8);
  sun.target.position.set(koda.pos.x, 0, koda.pos.z);
}

/* ---------- debug readout (?debug=1) ---------- */
const debugOn = /[?&]debug=1/.test(location.search);
const dbgEl = debugOn ? Object.assign(document.body.appendChild(document.createElement("div")), { style: "position:fixed;left:8px;bottom:8px;z-index:50;font:600 12px monospace;color:#7fe39a;background:rgba(0,0,0,.7);padding:6px 8px;border-radius:6px;pointer-events:none" }) : null;
const dbg = { t: 0, n: 0, worst: 0 };
function drawDebug(real) {
  dbg.t += real; dbg.n++; dbg.worst = Math.max(dbg.worst, real);
  if (dbg.t >= 1) {
    dbgEl.textContent = `${dbg.n} fps · worst ${Math.round(dbg.worst * 1000)} ms · ${innerWidth}x${innerHeight} @${renderer.getPixelRatio().toFixed(2)} · ${renderer.info.render.calls} draws`;
    dbg.t = 0; dbg.n = 0; dbg.worst = 0;
  }
}

/* ---------- the loop ---------- */
let lastT = performance.now(), mmT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  pollPad();
  if (debugOn) drawDebug(real);
  if (state === "play" && koda && mission && !window.GILL_HOLD) {
    if (real > 0.05) { tick(real / 2, now); tick(real / 2, now); } else tick(real, now);
  } else if (koda && (state === "card" || state === "score")) {
    koda.update(real); if (zora) zora.update(real);
  }
  if (!window.GILL_NORENDER) renderer.render(scene, camera);
}
function tick(dt, now) {
  mission.t += dt;
  runTimers(dt);
  updateKoda(dt);
  updateEnemies(dt);
  updateNpcs(dt);
  updateQuads(dt, now);
  updateZora(dt);
  updateOcclusion();
  updateGuide(now, dt);
  if ((mmT -= dt) <= 0) { drawMinimap(); mmT = 0.1; }
  if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
  if (tipT > 0 && (tipT -= dt) <= 0) nextTip();
  $("timer").textContent = Math.floor(mission.t / 60) + ":" + String(Math.floor(mission.t % 60)).padStart(2, "0");
  updateCamera(dt);
}

/* ---------- screens ---------- */
function pause() { if (state !== "play") return; state = "paused"; $("pause").classList.remove("hidden"); if (music.ac) music.ac.suspend(); }
function resume() { $("pause").classList.add("hidden"); state = "play"; lastT = performance.now(); if (music.ac) music.ac.resume(); }
$("pauseBtn").addEventListener("click", pause);
$("resumeBtn").addEventListener("click", resume);
$("muteBtn").addEventListener("click", () => { setMuted(!music.muted); $("muteBtn").textContent = "Music: " + (music.muted ? "off" : "on"); });
$("quitBtn").addEventListener("click", () => { $("pause").classList.add("hidden"); toTitle(); });

function toTitle() {
  state = "title";
  stopMusic();
  $("hud").classList.add("hidden"); $("touch").classList.add("hidden"); $("score").classList.add("hidden");
  $("title").classList.remove("hidden");
  const next = save.unlocked;
  $("playBtn").textContent = next > 0 ? `Continue: Mission ${next + 1}` : "Play";
  $("missionList").innerHTML = S.missions.map((m, i) => {
    const b = save.best[i];
    const open = i <= save.unlocked;
    return `<button class="mission${open ? "" : " locked"}" data-i="${i}" ${open ? "" : "disabled"}><span>${i + 1}</span><b>${m.song}</b><em>${b ? b.grade : open ? "" : "locked"}</em></button>`;
  }).join("");
  $("missionList").querySelectorAll("button.mission:not(.locked)").forEach(btn => btn.addEventListener("click", () => begin(+btn.dataset.i)));
}
function begin(i) {
  audioCtx();               // sound has to start from a tap
  $("title").classList.add("hidden");
  $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  state = "play";
  startMission(i);
}
$("playBtn").addEventListener("click", () => begin(save.unlocked));

/* ---------- boot ---------- */
(async function boot() {
  $("playBtn").disabled = true;
  buildGround();
  requestAnimationFrame(frame);
  try {
    koda = await makeActor("koda.glb", 1.62);
    scene.add(koda.root);
    koda.play("idle");
    const c = zoneCenter(S.quadrants[0]);
    koda.pos.set(c.x, 0, c.y + ZONE / 2 - 4); koda.face(Math.PI, 1);
    updateCamera(0, true);
  } catch (e) {
    $("loading").textContent = "Koda couldn't load. Check your connection and reload.";
    console.error(e);
    return;
  }
  await buildCity(p => { $("loading").textContent = "Building the city… " + Math.round(p * 100) + "%"; });
  buildNav();
  $("loading").textContent = "";
  $("playBtn").disabled = false;
  toTitle();
  window.GILL = { guide, camera, CAM_OFFSET, get koda() { return koda; }, get zora() { return zora; }, get mission() { return mission; },
    enemies, npcs, get state() { return state; }, save: () => save, blockers, keys, input, cardContinue, pathNext, stick, attack, jump, action, objectiveTarget, get health() { return health; }, get music() { return music; },
    sim(seconds) { let t = performance.now(); for (let i = 0; i < seconds * 30; i++) { t += 33; tick(1 / 30, t); } } };
})();
