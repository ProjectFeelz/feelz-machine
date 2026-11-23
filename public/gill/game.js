/* ---------------------------------------------------------------------------
   G.I.L.L. (Good Intentions Last Longest)

   A top-down action game on the Feelz Engine's 3D pieces: the same three.js
   build, models and moves as Feelz Run, seen from an angled 3/4 camera.
   One open city, twelve zones, one song per zone as the sound bed.

   Story words live in story.js (GILL_STORY). This file is the game.
--------------------------------------------------------------------------- */

import * as THREE from "../run/vendor/three-0.160.0/three.module.min.js";
import { GLTFLoader, MeshoptDecoder, RoomEnvironment } from "../run/vendor/three-0.160.0/gltf-lib.js";

const S = window.GILL_STORY;
const MODELS = "../run/assets/models/";
const $ = id => document.getElementById(id);
const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

/* ---------- city layout ---------- */
const ZONE = 56;           // metres across one zone
const ROAD = 10;           // the street between zones
const COLS = 4, ROWS = 3;
const zoneOrigin = z => new THREE.Vector2(z.grid[0] * (ZONE + ROAD), z.grid[1] * (ZONE + ROAD));
const zoneCenter = z => zoneOrigin(z).addScalar(ZONE / 2);
const WORLD_W = COLS * (ZONE + ROAD) - ROAD, WORLD_H = ROWS * (ZONE + ROAD) - ROAD;

const BUILDINGS = ["tenement", "hostel", "kodas-building", "lc-b1", "lc-b2", "lc-b4", "lc-b5", "lc-b6", "lc-b7",
  "mc-b2", "mc-b4", "mc-b6", "mc-b7", "mc-b8", "rc-b1", "rc-b3", "rc-b4", "rc-b5", "uc-b1", "uc-b2", "uc-b3", "uc-b4",
  "de-b1", "de-b3", "de-b4"];
const ENEMIES = { sentinel: 2.1, guard: 1.85, "street-warden": 1.9, hunter: 1.85, handler: 1.9, gilded: 2.0 };
const TOWNSFOLK = ["neighbour_1_elder", "neighbour_2_woman", "neighbour_3_man", "family_mother", "dock_foreman",
  "musician_street", "musician_can_drum", "musician_wire_guitar", "koda_brother", "crew_4_heavy"];

/* ---------- small helpers ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function zoneAt(x, z) {
  for (const zn of S.zones) { const o = zoneOrigin(zn); if (x >= o.x && x <= o.x + ZONE && z >= o.y && z <= o.y + ZONE) return zn; }
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15121c);
scene.fog = new THREE.Fog(0x15121c, 38, 90);
try {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
} catch (e) { /* lights only */ }

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 220);
const CAM_OFFSET = new THREE.Vector3(0, 21, 15.5);

const hemi = new THREE.HemisphereLight(0xb9c8ff, 0x3a2a1c, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
const SH = 26;
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
function buildGround() {
  const asphalt = groundTexture("asphalt");
  asphalt.repeat.set((WORLD_W + 80) / 8, (WORLD_H + 80) / 8);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 80, WORLD_H + 80),
    new THREE.MeshStandardMaterial({ color: 0x8a8790, map: asphalt, roughness: 0.92 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(WORLD_W / 2, -0.01, WORLD_H / 2);
  road.receiveShadow = true;
  scene.add(road);
  for (const z of S.zones) {
    const o = zoneOrigin(z);
    const paving = groundTexture("paving");
    paving.repeat.set(ZONE / 6, ZONE / 6);
    const tint = new THREE.Color(z.tint).multiplyScalar(0.75);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(ZONE, ZONE),
      new THREE.MeshStandardMaterial({ color: tint, map: paving, roughness: 0.85 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(o.x + ZONE / 2, 0, o.y + ZONE / 2);
    pad.receiveShadow = true;
    scene.add(pad);
  }
  // Street lamps along the roads, for light and a sense of place.
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
const blockers = [];        // { minX, maxX, minZ, maxZ, mesh, mats, faded }
async function placeBuilding(name, x, z, yaw, height) {
  const src = await staticModel(name);
  if (!src) return;
  const m = src.clone(true);
  m.rotation.y = yaw;
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const k = height / Math.max(0.001, size.y);
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
  for (const z of S.zones) {
    const r = rng(z.id.charCodeAt(1) * 977 + z.id.charCodeAt(2) * 131);
    const o = zoneOrigin(z);
    const pick = () => BUILDINGS[Math.floor(r() * BUILDINGS.length)];
    const inset = 7.5, a = ZONE / 2;
    // Two buildings on each side of the zone, the middle of each side left open as a way in.
    const slots = [];
    for (const off of [-16, 16]) {
      slots.push([a + off, inset, 0], [a + off, ZONE - inset, Math.PI], [inset, a + off, Math.PI / 2], [ZONE - inset, a + off, -Math.PI / 2]);
    }
    // Corners.
    slots.push([inset, inset, Math.PI / 4], [ZONE - inset, inset, -Math.PI / 4], [inset, ZONE - inset, Math.PI * 0.75], [ZONE - inset, ZONE - inset, -Math.PI * 0.75]);
    // A little cover inside, not in the final zone (it needs room to run).
    if (!z.final) slots.push([a - 10 + r() * 4, a + 9 + r() * 3, r() * Math.PI], [a + 9 + r() * 3, a - 11 + r() * 4, r() * Math.PI]);
    for (const [sx, sz, yaw] of slots) jobs.push(() => placeBuilding(pick(), o.x + sx, o.y + sz, yaw, 7 + r() * 7));
  }
  let done = 0;
  // A few at a time, so a phone is never asked to parse everything at once.
  const queue = jobs.slice();
  const worker = async () => { while (queue.length) { await queue.shift()(); done++; onProgress && onProgress(done / jobs.length); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

/* Fade any building standing between the camera and Koda. */
function updateOcclusion() {
  if (!koda) return;
  const kx = koda.pos.x, kz = koda.pos.z;
  for (const b of blockers) {
    const hides = b.minZ > kz - 1 && b.minZ < kz + 14 && kx > b.minX - 2 && kx < b.maxX + 2;
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
  // Axis by axis, so a wall slides you along it instead of stopping you dead.
  if (!blocked(pos.x + dx, pos.z, r)) pos.x += dx;
  if (!blocked(pos.x, pos.z + dz, r)) pos.z += dz;
  pos.x = clamp(pos.x, -ROAD + 1, WORLD_W + ROAD - 1);
  pos.z = clamp(pos.z, -ROAD + 1, WORLD_H + ROAD - 1);
}
// Line of sight: does the segment cross a building box? (2D slab test)
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

/* ---------- animated characters ---------- */
function stripRootMotion(clip) {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
}
class Actor {
  constructor(gltf, metres) {
    this.root = new THREE.Group();
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const h = box.getSize(new THREE.Vector3()).y || 1;
    model.scale.setScalar(metres / h);
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y = -box2.min.y;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    for (const c of gltf.animations) { stripRootMotion(c); this.clips[c.name] = this.mixer.clipAction(c); }
    this.current = null;
    this.pos = this.root.position;
    this.yaw = 0;
  }
  has(name) { return !!this.clips[name]; }
  play(name, { once = false, fade = 0.18, speed = 1 } = {}) {
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
  update(dt) { this.mixer.update(dt); }
}
async function makeActor(file, metres) { return new Actor(await loadGLB(MODELS + file), metres); }

/* ---------- input ---------- */
const keys = new Set();
const input = { x: 0, z: 0, mag: 0, sneak: false };
addEventListener("keydown", e => {
  if (e.repeat) return;
  keys.add(e.code);
  if (state !== "play") {
    if (state === "cutscene" && (e.code === "Space" || e.code === "Enter")) advanceCutscene();
    if (state === "paused" && e.code === "Escape") resume();
    return;
  }
  if (e.code === "KeyC" || e.code === "ControlLeft") toggleSneak();
  if (e.code === "KeyJ" || e.code === "Space") attack();
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
  tap("btnAttack", attack); tap("btnAction", action); tap("btnSneak", toggleSneak);
})();
function readInput() {
  const k = keyVector();
  const s = stick.mag ? stick : k;
  input.x = s.x; input.z = s.z; input.mag = s.mag;
}
function toggleSneak() { input.sneak = !input.sneak; $("btnSneak").classList.toggle("on", input.sneak); }

/* ---------- game state ---------- */
let state = "title";            // title | play | paused | cutscene
let koda = null, zora = null;
const enemies = [], npcs = [], clues = [];
let save = loadSave();
let health = 5, invuln = 0, attackLock = 0, comboStep = 0;
let currentZone = null, race = null, escape = null;
const spawnedZones = new Set();

function loadSave() {
  try { return Object.assign({ clues: [], done: [], finished: false }, JSON.parse(localStorage.getItem("gill.save") || "{}")); }
  catch (e) { return { clues: [], done: [], finished: false }; }
}
function writeSave() { try { localStorage.setItem("gill.save", JSON.stringify(save)); } catch (e) { /* private mode */ } }

/* ---------- HUD ---------- */
let toastT = 0;
function toast(text, secs = 3) { const t = $("toast"); t.textContent = text; t.classList.add("show"); toastT = secs; }
function setObjective(text) { $("objective").textContent = text; }
function drawHearts() { $("hearts").textContent = "♥".repeat(Math.max(0, health)) + "♡".repeat(Math.max(0, 5 - health)); }
function drawClues() { $("clueCount").textContent = save.clues.length; $("clueTotal").textContent = S.cluesToFinal; }
function refreshObjective() {
  if (escape) return setObjective("Get Zora out of the city. Run!");
  if (finalOpen() && !save.finished) return setObjective("Zora is in the last zone, \"" + S.zones.find(z => z.final).song + "\". Go.");
  const z = currentZone;
  if (z && !z.final && !save.clues.includes(z.id)) {
    if (z.focus === "race") return setObjective(race ? "Reach the light before the time runs out." : "Step into the gold ring to start the run.");
    if (z.focus === "fight" && zoneEnemiesLeft(z) > 0) return setObjective("Clear the wardens out of " + z.song + " (" + zoneEnemiesLeft(z) + " left).");
    return setObjective("Find the clue hidden in " + z.song + ".");
  }
  setObjective(`Find clues across the city (${save.clues.length}/${S.cluesToFinal}).`);
}

/* ---------- music ---------- */
const music = { a: $("musicA"), b: $("musicB"), front: null, urls: {}, zoneId: null, muted: false, vol: 0.8 };
async function songUrl(trackId) {
  if (music.urls[trackId]) return music.urls[trackId];
  const res = await fetch("/.netlify/functions/stream-url", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId })
  });
  const data = await res.json().catch(() => ({}));
  const t = data && data.tracks && data.tracks[trackId];
  if (!res.ok || !t || !t.url) throw new Error("no url");
  music.urls[trackId] = t.url;
  return t.url;
}
async function playZoneMusic(z) {
  if (!z || music.zoneId === z.id) return;
  music.zoneId = z.id;
  let url;
  try { url = await songUrl(z.trackId); } catch (e) { return; }
  if (music.zoneId !== z.id) return;
  const next = music.front === music.a ? music.b : music.a, prev = music.front;
  next.src = url; next.volume = 0; next.currentTime = 0;
  if (!music.muted && state !== "paused") next.play().catch(() => {});
  music.front = next;
  const t0 = performance.now();
  const fade = () => {
    const k = Math.min(1, (performance.now() - t0) / 1500);
    next.volume = music.vol * k;
    if (prev) prev.volume = music.vol * (1 - k);
    if (k < 1) requestAnimationFrame(fade); else if (prev) prev.pause();
  };
  fade();
}
function setMusicPaused(p) {
  if (!music.front) return;
  if (p || music.muted) music.front.pause(); else music.front.play().catch(() => {});
}

/* ---------- cutscenes ---------- */
let csLines = [], csIndex = 0, csDone = null, csPrevState = "play";
function playCutscene(name) {
  const lines = S.cutscenes[name];
  if (!lines || !lines.length) return Promise.resolve();
  return new Promise(resolve => {
    csLines = lines; csIndex = 0; csDone = resolve; csPrevState = state === "cutscene" ? "play" : state;
    state = "cutscene";
    $("cutscene").classList.remove("hidden");
    $("touch").classList.add("hidden");
    showLine();
  });
}
function showLine() {
  const l = csLines[csIndex], sp = S.speakers[l.who] || S.speakers[""];
  $("csWho").textContent = l.who; $("csWho").style.color = sp.colour;
  $("csSay").textContent = l.say;
}
function advanceCutscene() {
  if (state !== "cutscene") return;
  csIndex++;
  if (csIndex < csLines.length) return showLine();
  endCutscene();
}
function endCutscene() {
  $("cutscene").classList.add("hidden");
  if (phone) $("touch").classList.remove("hidden");
  state = csPrevState === "title" ? "play" : csPrevState;
  lastT = performance.now();
  const d = csDone; csDone = null; d && d();
}
$("cutscene").addEventListener("pointerdown", e => { if (e.target.id !== "csSkip") advanceCutscene(); });
$("csSkip").addEventListener("pointerdown", e => { e.stopPropagation(); endCutscene(); });

/* ---------- spawning per zone ---------- */
async function spawnZone(z) {
  if (spawnedZones.has(z.id)) return;
  spawnedZones.add(z.id);
  const r = rng(z.id.charCodeAt(2) * 7919 + 17);
  const c = zoneCenter(z);
  const names = Object.keys(ENEMIES);
  const count = z.final ? 4 : z.focus === "fight" ? 4 : z.focus === "sneak" ? 3 : z.focus === "race" ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const kind = z.focus === "fight" && i === 0 ? "gilded" : names[Math.floor(r() * names.length)];
    const ang = (i / count) * Math.PI * 2 + r();
    const rad = 9 + r() * 8;
    const route = [];
    for (let k = 0; k < 4; k++) {
      const a2 = ang + k * Math.PI / 2;
      route.push(new THREE.Vector3(c.x + Math.cos(a2) * rad, 0, c.y + Math.sin(a2) * rad));
    }
    makeActor(kind + ".glb", ENEMIES[kind]).then(a => {
      a.pos.copy(route[0]);
      scene.add(a.root);
      a.play("walk");
      enemies.push({ a, zone: z.id, route, leg: 1, state: "patrol", meter: 0, hp: kind === "gilded" ? 5 : 3,
        cool: 0, hitT: 0, lastSeen: new THREE.Vector3(), searchT: 0, speed: 1.6 + r() * 0.4 });
      if (state === "play") refreshObjective();
    }).catch(() => {});
  }
  // People of the city in the calmer zones.
  if (z.focus === "explore") {
    for (let i = 0; i < 2; i++) {
      const who = TOWNSFOLK[Math.floor(r() * TOWNSFOLK.length)];
      makeActor("townsfolk/" + who + ".glb", 1.65).then(a => {
        a.pos.set(c.x - 6 + r() * 12, 0, c.y - 6 + r() * 12);
        a.face(r() * Math.PI * 2, 1);
        scene.add(a.root); a.play("idle");
        npcs.push({ a, line: S.npcLines[Math.floor(r() * S.npcLines.length)] });
      }).catch(() => {});
    }
  }
  // The clue (fight and race zones earn theirs).
  if (z.clue && !save.clues.includes(z.id) && z.focus !== "fight" && z.focus !== "race") {
    const o = zoneOrigin(z);
    let x, zz, tries = 0;
    do { x = o.x + 8 + r() * (ZONE - 16); zz = o.y + 8 + r() * (ZONE - 16); tries++; } while (blocked(x, zz, 1.2) && tries < 40);
    addClue(z, x, zz);
  }
  if (z.focus === "race" && !z.final && !save.clues.includes(z.id)) setupRace(z);
}

/* ---------- clues ---------- */
const clueGeo = new THREE.OctahedronGeometry(0.42);
const clueMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xf2a73c, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.25 });
const ringGeo = new THREE.RingGeometry(0.7, 0.95, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
function addClue(z, x, zz) {
  if (clues.some(c => c.zone === z.id)) return;
  const g = new THREE.Group();
  const gem = new THREE.Mesh(clueGeo, clueMat); gem.position.y = 1.1; gem.castShadow = true;
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  g.add(gem, ring); g.position.set(x, 0, zz);
  scene.add(g);
  clues.push({ zone: z.id, g, gem });
}
async function takeClue(c) {
  scene.remove(c.g);
  clues.splice(clues.indexOf(c), 1);
  if (!save.clues.includes(c.zone)) save.clues.push(c.zone);
  writeSave(); drawClues();
  const z = S.zones.find(q => q.id === c.zone);
  toast("Clue: " + z.clue, 5);
  const n = save.clues.length;
  if (n === 1) await playCutscene("firstClue");
  else if (n === Math.ceil(S.cluesToFinal / 2)) await playCutscene("vision");
  if (n === S.cluesToFinal) { await playCutscene("finalOpen"); openFinal(); }
  refreshObjective();
}
const finalOpen = () => save.clues.length >= S.cluesToFinal;

/* ---------- races ---------- */
const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
function ringAt(x, z, r) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 48), markerMat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 6, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(x, 3, z);
  scene.add(m, beam);
  return [m, beam];
}
const raceSpots = {};
function setupRace(z) {
  const o = zoneOrigin(z);
  const start = new THREE.Vector2(o.x + ZONE / 2, o.y + 4);
  const end = new THREE.Vector2(o.x + ZONE / 2, o.y + ZONE - 4);
  raceSpots[z.id] = { z, start, end, startMesh: ringAt(start.x, start.y, 1.8), endMesh: null };
}
function updateRaces(dt) {
  if (race) {
    race.t -= dt;
    $("race").textContent = Math.max(0, race.t).toFixed(1);
    if (Math.hypot(koda.pos.x - race.spot.end.x, koda.pos.z - race.spot.end.y) < 2.2) {
      const z = race.spot.z;
      race.spot.endMesh.forEach(m => scene.remove(m));
      race = null; $("race").textContent = "";
      toast(S.zoneLines.race, 3);
      addClue(z, koda.pos.x, koda.pos.z + 1.5);
      refreshObjective();
    } else if (race.t <= 0) {
      race.spot.endMesh.forEach(m => scene.remove(m));
      race.spot.startMesh.forEach(m => m.visible = true);
      race = null; $("race").textContent = "";
      toast("Too slow. Back to the ring and run it again.", 3);
      refreshObjective();
    }
    return;
  }
  for (const id in raceSpots) {
    const s = raceSpots[id];
    if (save.clues.includes(id) || clues.some(c => c.zone === id)) continue;
    if (Math.hypot(koda.pos.x - s.start.x, koda.pos.z - s.start.y) < 1.8) {
      s.startMesh.forEach(m => m.visible = false);
      s.endMesh = ringAt(s.end.x, s.end.y, 2.2);
      race = { spot: s, t: (s.z.race && s.z.race.seconds) || 40 };
      toast("Run!", 1.5);
      refreshObjective();
    }
  }
}

/* ---------- the final zone ---------- */
async function openFinal() {
  const z = S.zones.find(q => q.final);
  await spawnZone(z);
  if (zora) return;
  const c = zoneCenter(z);
  try {
    zora = await makeActor("zora.glb", 1.58);
    zora.pos.set(c.x, 0, c.y); scene.add(zora.root);
    zora.play(zora.has("stun") ? "stun" : "idle");
    zora.waiting = true;
  } catch (e) { /* the story still finishes without her model */ }
  refreshObjective();
}
function updateFinal(dt) {
  if (!zora) return;
  zora.update(dt);
  if (zora.waiting) {
    if (Math.hypot(koda.pos.x - zora.pos.x, koda.pos.z - zora.pos.z) < 2.2) {
      zora.waiting = false;
      playCutscene("found").then(() => {
        // Out the far side of the city, every warden after you.
        escape = { t: 60, exit: new THREE.Vector2(WORLD_W + ROAD - 3, WORLD_H / 2) };
        escape.mesh = ringAt(escape.exit.x, escape.exit.y, 3);
        for (const e of enemies) if (e.state !== "ko") alertEnemy(e);
        refreshObjective();
      });
    }
    return;
  }
  // Zora follows a step behind.
  const dx = koda.pos.x - zora.pos.x, dz = koda.pos.z - zora.pos.z, d = Math.hypot(dx, dz);
  if (d > 1.8) {
    const sp = Math.min(d - 1.8, 6.4 * dt);
    moveWithCollision(zora.pos, dx / d * sp, dz / d * sp, 0.4);
    zora.play(d > 4 ? "sprint" : "run");
    zora.face(Math.atan2(dx, dz), 0.25);
  } else zora.play("idle");
  if (escape) {
    escape.t -= dt;
    $("race").textContent = Math.max(0, escape.t).toFixed(1);
    if (Math.hypot(koda.pos.x - escape.exit.x, koda.pos.z - escape.exit.y) < 3.2) {
      escape.mesh.forEach(m => scene.remove(m));
      escape = null; $("race").textContent = "";
      save.finished = true; writeSave();
      playCutscene("ending").then(() => toTitle(true));
    } else if (escape.t <= 0) {
      escape.t = 60;
      toast("They're closing in. Keep going!", 2.5);
    }
  }
}

/* ---------- Koda ---------- */
function updateKoda(dt) {
  readInput();
  invuln = Math.max(0, invuln - dt);
  if (attackLock > 0) { attackLock -= dt; koda.update(dt); return; }
  const sneaking = input.sneak;
  const sprint = !sneaking && input.mag > 0.93;
  const speed = input.mag === 0 ? 0 : sneaking ? 1.9 : sprint ? 6.8 : 4.3;
  if (speed > 0) {
    moveWithCollision(koda.pos, input.x * speed * dt, input.z * speed * dt, 0.45);
    koda.face(Math.atan2(input.x, input.z), Math.min(1, dt * 14));
    koda.play(sneaking ? "crouch_walk" : sprint ? "sprint" : "run");
  } else koda.play(sneaking ? "crouch_idle" : "idle");
  koda.moving = speed > 0; koda.sprinting = sprint; koda.sneaking = sneaking;
  koda.update(dt);
}
function forward(a) { return new THREE.Vector2(Math.sin(a.yaw), Math.cos(a.yaw)); }
function attack() {
  if (!koda || attackLock > 0) return;
  const move = comboStep++ % 2 ? "kick" : "punch";
  attackLock = Math.min(0.55, koda.play(move, { once: true, speed: 1.35 }) || 0.45);
  setTimeout(() => {
    const f = forward(koda);
    for (const e of enemies) {
      if (e.state === "ko") continue;
      const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && (dx * f.x + dz * f.y) / (d || 1) > 0.35) hitEnemy(e, 1);
    }
  }, 180);
}
function action() {
  if (!koda || attackLock > 0) return;
  // A takedown: from behind, unseen.
  for (const e of enemies) {
    if (e.state === "ko" || e.state === "alert") continue;
    const dx = koda.pos.x - e.a.pos.x, dz = koda.pos.z - e.a.pos.z, d = Math.hypot(dx, dz);
    const ef = forward(e.a);
    if (d < 1.9 && (dx * ef.x + dz * ef.y) / (d || 1) < -0.3) {
      koda.face(Math.atan2(-dx, -dz), 1);
      attackLock = Math.min(1.4, koda.play("takedown", { once: true, speed: 1.2 }) || 1);
      setTimeout(() => knockOut(e), 450);
      return;
    }
  }
  for (const c of clues) {
    if (Math.hypot(koda.pos.x - c.g.position.x, koda.pos.z - c.g.position.z) < 2) return takeClue(c);
  }
  for (const n of npcs) {
    if (Math.hypot(koda.pos.x - n.a.pos.x, koda.pos.z - n.a.pos.z) < 2.6) {
      n.a.face(Math.atan2(koda.pos.x - n.a.pos.x, koda.pos.z - n.a.pos.z), 1);
      return toast("\"" + n.line + "\"", 4);
    }
  }
}
function hurtKoda(n) {
  if (invuln > 0 || state !== "play") return;
  health -= n; invuln = 1.1; drawHearts();
  koda.play("hurt", { once: true }); attackLock = 0.35;
  if (health <= 0) respawn();
}
function respawn() {
  const z = currentZone || S.zones[0];
  const c = zoneCenter(z);
  koda.pos.set(c.x, 0, c.y - ZONE / 2 + 3);
  health = 5; drawHearts();
  for (const e of enemies) if (e.state !== "ko") { e.state = "patrol"; e.meter = 0; }
  if (race) { race.t = 0; }
  toast("Back on your feet. Go quieter this time.", 3);
}

/* ---------- enemies ---------- */
function alertEnemy(e) { if (e.state === "ko") return; e.state = "alert"; e.meter = 1; e.a.play(e.a.has("alert") ? "alert" : "run", { once: true }); e.cool = 0.6; }
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  if (e.hp <= 0) return knockOut(e);
  e.a.play("hit", { once: true }); e.hitT = 0.4;
  if (e.state !== "alert") alertEnemy(e);
}
function knockOut(e) {
  if (e.state === "ko") return;
  e.state = "ko"; e.a.play("ko", { once: true });
  const z = S.zones.find(q => q.id === e.zone);
  if (z && z.focus === "fight" && zoneEnemiesLeft(z) === 0 && !save.clues.includes(z.id)) {
    toast(S.zoneLines.fight, 3);
    const c = zoneCenter(z);
    addClue(z, c.x, c.y);
  }
  refreshObjective();
}
const zoneEnemiesLeft = z => enemies.filter(e => e.zone === z.id && e.state !== "ko").length;

let anySeen = false, anySus = false;
function updateEnemies(dt) {
  anySeen = false; anySus = false;
  for (const e of enemies) {
    const a = e.a;
    const d = Math.hypot(koda.pos.x - a.pos.x, koda.pos.z - a.pos.z);
    a.root.visible = d < 60;
    if (d > 55) continue;
    a.update(dt);
    if (e.state === "ko") continue;
    e.cool = Math.max(0, e.cool - dt); e.hitT = Math.max(0, e.hitT - dt);
    if (e.hitT > 0) continue;

    // Can it see Koda?
    const f = forward(a), dx = koda.pos.x - a.pos.x, dz = koda.pos.z - a.pos.z;
    const range = koda.sneaking ? 6.5 : 12;
    const inCone = d < range && (dx * f.x + dz * f.y) / (d || 1) > 0.42;
    const heard = koda.sprinting && d < 5.5;
    const sees = (inCone || heard || d < 1.4) && sightClear(a.pos.x, a.pos.z, koda.pos.x, koda.pos.z);

    if (e.state !== "alert") {
      if (sees) {
        e.meter += dt * (koda.sneaking ? 0.7 : 1.6) * (1.4 - d / range);
        e.lastSeen.copy(koda.pos);
        if (e.state === "patrol") { e.state = "suspicious"; a.play(a.has("alert") ? "alert" : "walk"); }
        a.face(Math.atan2(dx, dz), Math.min(1, dt * 4));
        if (e.meter >= 1) alertEnemy(e);
      } else {
        e.meter = Math.max(0, e.meter - dt * 0.35);
        if (e.state === "suspicious" && e.meter <= 0) { e.state = "patrol"; a.play("walk"); }
        if (e.state === "suspicious") a.play("walk");
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

    // Alerted: chase and fight.
    anySeen = true;
    if (sees) { e.lastSeen.copy(koda.pos); e.searchT = 6; } else e.searchT -= dt;
    if (e.searchT <= 0) { e.state = "suspicious"; e.meter = 0.6; a.play("walk"); continue; }
    if (e.cool > 0) continue;
    if (d > 1.45) {
      const tx = e.lastSeen.x - a.pos.x, tz = e.lastSeen.z - a.pos.z, td = Math.hypot(tx, tz) || 1;
      moveWithCollision(a.pos, tx / td * 4.6 * dt, tz / td * 4.6 * dt, 0.45);
      a.face(Math.atan2(tx, tz), Math.min(1, dt * 8));
      a.play("run");
    } else {
      a.face(Math.atan2(dx, dz), 1);
      a.play("punch", { once: true }); e.cool = 1.25;
      setTimeout(() => {
        if (e.state === "alert" && Math.hypot(koda.pos.x - a.pos.x, koda.pos.z - a.pos.z) < 1.9) hurtKoda(1);
      }, 320);
    }
  }
  const al = $("alert");
  al.className = "alert" + (anySeen ? " seen" : anySus ? " sus" : "");
  al.textContent = anySeen ? "SEEN" : anySus ? "?" : "";
}

/* ---------- NPCs ---------- */
function updateNpcs(dt) {
  for (const n of npcs) {
    const d = Math.hypot(koda.pos.x - n.a.pos.x, koda.pos.z - n.a.pos.z);
    n.a.root.visible = d < 60;
    if (d < 45) n.a.update(dt);
  }
}

/* ---------- zones ---------- */
function updateZone() {
  const z = zoneAt(koda.pos.x, koda.pos.z);
  if (z && z !== currentZone) {
    currentZone = z;
    $("zoneName").textContent = "ZONE " + String(S.zones.indexOf(z) + 1).padStart(2, "0");
    $("zoneSong").textContent = z.song;
    playZoneMusic(z);
    if (z.final && !finalOpen()) toast("Something's here. Not yet. Keep finding clues.", 3);
    refreshObjective();
  }
  // Load the zones around Koda ahead of time.
  for (const q of S.zones) {
    const c = zoneCenter(q);
    if (Math.hypot(c.x - koda.pos.x, c.y - koda.pos.z) < ZONE * 1.25) spawnZone(q);
  }
}

/* ---------- minimap ---------- */
const mm = $("minimap").getContext("2d");
function drawMinimap() {
  const W = 160, H = 120, k = Math.min(W / (WORLD_W + 8), H / (WORLD_H + 8)), ox = (W - WORLD_W * k) / 2, oz = (H - WORLD_H * k) / 2;
  mm.clearRect(0, 0, W, H);
  for (const z of S.zones) {
    const o = zoneOrigin(z);
    const got = save.clues.includes(z.id);
    mm.fillStyle = z === currentZone ? "rgba(242,181,68,.45)" : got ? "rgba(120,200,140,.3)" : "rgba(255,255,255,.1)";
    mm.fillRect(ox + o.x * k, oz + o.y * k, ZONE * k, ZONE * k);
  }
  if (finalOpen() && !save.finished) {
    const c = zoneCenter(S.zones.find(q => q.final));
    mm.fillStyle = "#d58cff"; mm.beginPath(); mm.arc(ox + c.x * k, oz + c.y * k, 3.5, 0, 7); mm.fill();
  }
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

/* ---------- the loop ---------- */
let lastT = performance.now(), mmT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (state === "play" && koda) {
    tick(dt, now);
  } else if (koda && state === "cutscene") {
    koda.update(dt); if (zora) zora.update(dt);
  }
  renderer.render(scene, camera);
}
function tick(dt, now) {
  {
    updateKoda(dt);
    updateEnemies(dt);
    updateNpcs(dt);
    updateZone();
    updateRaces(dt);
    updateFinal(dt);
    for (const c of clues) { c.gem.rotation.y += dt * 1.6; c.gem.position.y = 1.1 + Math.sin(now / 400) * 0.12;
      if (Math.hypot(koda.pos.x - c.g.position.x, koda.pos.z - c.g.position.z) < 1.4) { takeClue(c); break; } }
    updateOcclusion();
    if ((mmT -= dt) <= 0) { drawMinimap(); mmT = 0.1; }
    if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
    updateCamera(dt);
  }
}

/* ---------- screens ---------- */
function pause() { if (state !== "play") return; state = "paused"; $("pause").classList.remove("hidden"); setMusicPaused(true); }
function resume() { $("pause").classList.add("hidden"); state = "play"; lastT = performance.now(); setMusicPaused(false); }
$("pauseBtn").addEventListener("click", pause);
$("resumeBtn").addEventListener("click", resume);
$("muteBtn").addEventListener("click", () => {
  music.muted = !music.muted; $("muteBtn").textContent = "Music: " + (music.muted ? "off" : "on");
});
$("quitBtn").addEventListener("click", () => { $("pause").classList.add("hidden"); toTitle(false); });

function toTitle(won) {
  state = "title";
  setMusicPaused(true);
  $("hud").classList.add("hidden"); $("touch").classList.add("hidden");
  $("title").classList.remove("hidden");
  $("playBtn").textContent = save.clues.length || save.finished ? "Continue" : "Play";
  $("newBtn").classList.toggle("hidden", !(save.clues.length || save.finished));
  if (won) $("loading").textContent = "You brought her home. The story continues soon.";
}

async function startGame(fresh) {
  if (fresh) { save = { clues: [], done: [], finished: false }; writeSave(); location.reload(); return; }
  $("title").classList.add("hidden");
  $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  drawHearts(); drawClues();
  state = "play";
  // Start in the first zone, at its open south side.
  const first = S.zones[0], c = zoneCenter(first);
  if (!koda.placed) { koda.pos.set(c.x, 0, c.y + ZONE / 2 - 4); koda.face(Math.PI, 1); koda.placed = true; }
  updateCamera(0, true);
  updateZone();
  if (!save.clues.length && !save.seenOpening) {
    save.seenOpening = true; writeSave();
    await playCutscene("opening");
  }
  if (finalOpen() && !save.finished) openFinal();
  if (music.front && !music.muted) music.front.play().catch(() => {});
  refreshObjective();
}
$("playBtn").addEventListener("click", () => startGame(false));
$("newBtn").addEventListener("click", () => startGame(true));

/* ---------- boot ---------- */
(async function boot() {
  $("playBtn").disabled = true;
  buildGround();
  requestAnimationFrame(frame);
  try {
    koda = await makeActor("koda.glb", 1.62);
    scene.add(koda.root);
    koda.play("idle");
    const c = zoneCenter(S.zones[0]);
    koda.pos.set(c.x, 0, c.y + ZONE / 2 - 4); koda.face(Math.PI, 1); koda.placed = true;
    updateCamera(0, true);
  } catch (e) {
    $("loading").textContent = "Koda couldn't load. Check your connection and reload.";
    console.error(e);
    return;
  }
  await buildCity(p => { $("loading").textContent = "Building the city… " + Math.round(p * 100) + "%"; });
  $("loading").textContent = "";
  $("playBtn").disabled = false;
  toTitle(false);
  // Expose a little for testing from the console.
  window.GILL = { get koda() { return koda; }, get zora() { return zora; }, enemies, clues, npcs, get state() { return state; }, save: () => save, blockers, keys, input,
    sim(seconds) { let t = performance.now(); for (let i = 0; i < seconds * 30; i++) { t += 33; tick(1 / 30, t); } } };
})();
