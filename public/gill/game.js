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
const REAL = window.GILL_REAL || {};   // real street layouts (real.js), from OpenStreetMap
const MODELS = "../run/assets/models/";
const $ = id => document.getElementById(id);
const phone = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

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
  for (const q of S.quadrants) if (x >= q.x0 && x <= q.x0 + q.w && z >= q.z0 && z <= q.z0 + q.d) return q;
  return null;
}

/* ---------- the map ----------
   The City of Good Intentions, laid out in world.js (GILL_WORLD): named places (the
   zones missions happen in), roads, the mud river and its bridges. The land rises and
   falls between places; inside a place the ground is flat at its own height. */
const WD = window.GILL_WORLD;
const WORLD_W = WD.size[0], WORLD_H = WD.size[1];
const ROAD = 0;
for (const z of WD.zones) {
  const q = S.quadrants.find(k => k.id === z.id);
  if (q) Object.assign(q, { x0: z.x, z0: z.z, w: z.w, d: z.d, elev: z.elev, district: z.district, region: z.region, about: z.about, name: z.name });
}
// Streets through every place: each road that reaches a place carries on straight through it
// to the far side, so the roads make one network and running through never breaks off.
(function streetsThroughPlaces() {
  const add = [];
  for (const q of S.quadrants) {
    // Real places: their own streets, from the real map (Vilakazi Street, Fox Street, Leyds Street...).
    const real = REAL[q.id];
    if (real && real.streets.length) {
      for (const st of real.streets) add.push({ name: st.name || q.name + " Lane", width: st.width, points: st.points, street: true, place: q.id, kind: st.type });
      // Places with only short lanes still get one way through.
      if (real.streets.some(st => st.width >= 7)) continue;
    }
    const xs = new Set(), zs = new Set();
    for (const r of WD.roads) for (const [px, pz] of r.points) {
      const dx = Math.max(q.x0 - px, 0, px - (q.x0 + q.w)), dz = Math.max(q.z0 - pz, 0, pz - (q.z0 + q.d));
      if (Math.hypot(dx, dz) > 12) continue;
      // Which side of the place it comes in from decides the street's direction.
      const onX = px < q.x0 + 4 || px > q.x0 + q.w - 4, onZ = pz < q.z0 + 4 || pz > q.z0 + q.d - 4;
      if (onX && !onZ) zs.add(Math.round(clamp(pz, q.z0 + 8, q.z0 + q.d - 8)));
      else if (onZ && !onX) xs.add(Math.round(clamp(px, q.x0 + 8, q.x0 + q.w - 8)));
    }
    // Every place gets at least one street each way through its middle.
    if (!xs.size) xs.add(Math.round(q.x0 + q.w / 2));
    if (!zs.size) zs.add(Math.round(q.z0 + q.d / 2));
    for (const z of zs) add.push({ name: q.name + " Street", width: 9, points: [[q.x0 - 2, z], [q.x0 + q.w + 2, z]], street: true, place: q.id });
    for (const x of xs) add.push({ name: q.name + " Avenue", width: 9, points: [[x, q.z0 - 2], [x, q.z0 + q.d + 2]], street: true, place: q.id });
  }
  WD.roads.push(...add);
})();
const zoneOrigin = q => new THREE.Vector2(q.x0, q.z0);
const zoneCenter = q => new THREE.Vector2(q.x0 + q.w / 2, q.z0 + q.d / 2);
const Q = id => S.quadrants.find(q => q.id === id);
const MUD = -999;   // groundAt's answer for open mud

// Land height: flat inside each place, blending smoothly between places over 60 m.
const TH = { cell: 2, w: 0, h: 0, data: null };
function terrainRaw(x, z) {
  let sw = 0, se = 0, mx = 0;
  for (const q of S.quadrants) {
    const dx = Math.max(0, q.x0 - x, x - q.x0 - q.w), dz = Math.max(0, q.z0 - z, z - q.z0 - q.d);
    if (dx === 0 && dz === 0) return q.elev;
    let w = 1 - Math.hypot(dx, dz) / 60; if (w <= 0) continue; w = w * w * (3 - 2 * w);
    sw += w; se += w * q.elev; if (w > mx) mx = w;
  }
  return se / (sw + 0.15 * (1 - mx) + 1e-6);
}
// Borders: every place is ringed by rocky ridges (sand dunes out east), so you come and go
// by its roads. Where the mud river runs past, the river is the border instead.
const RG = { data: null };
function ridgeRaw(x, z) {
  if (inZoneRaw(x, z)) return 0;
  let h = 0;
  for (const q of S.quadrants) {
    const d = Math.hypot(Math.max(0, q.x0 - x, x - q.x0 - q.w), Math.max(0, q.z0 - z, z - q.z0 - q.d));
    if (d < 3 || d > 16) continue;
    const t = (d - 3) / 13, peak = 6.5 + 2.5 * Math.sin(x * 0.07 + z * 0.05) + 1.5 * Math.sin(x * 0.19 - z * 0.13);
    h = Math.max(h, peak * Math.pow(Math.sin(Math.PI * t), 0.6));
  }
  if (!h) return 0;
  // Gaps where the roads come through, and none along the river.
  const r = roadDistRaw(x, z), gate = clamp((r.d - r.half - 3) / 6, 0, 1);
  let river = 1e9; for (const [x0, z0, x1, z1] of WD.river) river = Math.min(river, Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1)));
  const bank = clamp((river - 14) / 10, 0, 1);
  return h * gate * gate * (3 - 2 * gate) * bank;
}
const inZoneRaw = (x, z) => S.quadrants.some(q => x >= q.x0 && x <= q.x0 + q.w && z >= q.z0 && z <= q.z0 + q.d);
function roadDistRaw(x, z) {
  let best = 1e9, half = 0;
  for (const r of WD.roads) for (let k = 0; k + 1 < r.points.length; k++) {
    const [ax, az] = r.points[k], [bx, bz] = r.points[k + 1];
    const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz || 1;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / L, 0, 1);
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d - r.width / 2 < best - half) { best = d; half = r.width / 2; }
  }
  return { d: best, half };
}
(function bakeTerrain() {
  TH.w = Math.ceil(WORLD_W / TH.cell) + 2; TH.h = Math.ceil(WORLD_H / TH.cell) + 2;
  TH.data = new Float32Array(TH.w * TH.h); RG.data = new Float32Array(TH.w * TH.h);
  for (let j = 0; j < TH.h; j++) for (let i = 0; i < TH.w; i++) {
    const x = i * TH.cell, z = j * TH.cell, rg = ridgeRaw(x, z);
    RG.data[j * TH.w + i] = rg; TH.data[j * TH.w + i] = terrainRaw(x, z) + rg;
  }
})();
// How high the border ridge rises here (0 off the ridges).
function ridgeAt(x, z) {
  const fx = clamp(x / TH.cell, 0, TH.w - 1.001), fz = clamp(z / TH.cell, 0, TH.h - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, D = RG.data, W = TH.w;
  return (D[j * W + i] * (1 - u) + D[j * W + i + 1] * u) * (1 - v) + (D[(j + 1) * W + i] * (1 - u) + D[(j + 1) * W + i + 1] * u) * v;
}
const RIDGE = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 999, base: 0, walk: false, ridge: true, mats: [] };
function terrainAt(x, z) {
  for (const q of S.quadrants) if (x >= q.x0 && x <= q.x0 + q.w && z >= q.z0 && z <= q.z0 + q.d) return q.elev;
  const fx = clamp(x / TH.cell, 0, TH.w - 1.001), fz = clamp(z / TH.cell, 0, TH.h - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, D = TH.data, W = TH.w;
  return (D[j * W + i] * (1 - u) + D[j * W + i + 1] * u) * (1 - v) + (D[(j + 1) * W + i] * (1 - u) + D[(j + 1) * W + i + 1] * u) * v;
}
const roadDist = roadDistRaw;
const onRoad = (x, z, pad = 0) => { const r = roadDist(x, z); return r.d < r.half + pad; };
const onRiver = (x, z, pad = 0) => WD.river.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
const inZone = (x, z, pad = 0) => S.quadrants.find(q => x > q.x0 - pad && x < q.x0 + q.w + pad && z > q.z0 - pad && z < q.z0 + q.d + pad) || null;

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
// G.I.L.L.'s own pieces (from the F.I.L.L. kit) live with the game; the rest come from Feelz Run.
const OWN_MODELS = new Set(["stall", "booth", "billboard", "container", "carriage", "hedge", "mast", "turnstile", "valve", "filter", "shrine", "cage", "scanner", "glass",
  "mc-b3", "uc-b5", "de-b2", "generator", "handcart", "washline", "chimney", "vent", "hauler", "shuttle", "skiff", "conveyor", "fountain", "firepit", "rocks",
  "commtower", "lockup", "shelter", "station", "elevator", "skydeck", "tenement2", "hostel2",
  "k-corner", "k-pillar", "k-wall", "k-win-open", "k-win-closed", "k-win-half", "k-roof-flat", "k-roof-gentle", "k-roof-steep", "k-switchback", "k-walkway", "k-lift", "k-washpost",
  "obelisk", "climbtower", "checkpoint", "veilheart",
  "pump", "lampfall", "trafficfall", "carwreck", "cat", "cat2", "busstop", "watertank", "produce", "dish", "phonebox", "barrels", "planter",
  "matchbox", "rdp", "spaza", "taxi", "towers", "union", "lukasrand", "mallgate", "tuscan", "jacaranda", "warehouse"]);
// Made for the real places in Meshy: they keep their own colours (no district tint).
const OWN_LOOK = new Set(["matchbox", "rdp", "spaza", "taxi", "towers", "union", "lukasrand", "mallgate", "tuscan", "jacaranda", "warehouse", "station"]);
function staticModel(name) {
  if (!staticCache[name]) staticCache[name] = loadGLB((OWN_MODELS.has(name) ? "models/world/" : MODELS + "world/") + name + ".glb").then(g => g.scene).catch(() => null);
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
const SH = phone ? 34 : 46;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 260 });
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
// The ground of each Feelz Run district, painted once on a canvas and tiled.
//   asphalt  the streets        lc dusty dirt and broken asphalt   mc concrete slabs
//   uc polished stone tiles     rc grass and garden paving          de wind-rippled sand
function groundTexture(kind) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = rng(kind.length * 977 + kind.charCodeAt(0));
  const base = { land: "#e6e2da", asphalt: "#3a3a3e", lc: "#a97a58", mc: "#8e9094", uc: "#9c9488", rc: "#4f6a3a", de: "#d6b27a", sandroad: "#c9a46e" }[kind] || "#8a8a8a";
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const speck = (n, a, sz) => { for (let i = 0; i < n; i++) { const v = r() > 0.5; g.fillStyle = `rgba(${v ? 255 : 0},${v ? 255 : 0},${v ? 255 : 0},${r() * a})`; g.fillRect(r() * 256, r() * 256, 1 + r() * sz, 1 + r() * sz); } };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  if (kind === "asphalt") speck(2600, 0.08, 3);
  else if (kind === "land") {
    // Fine dry earth: soft, wide shading and tiny grit, so nothing on the ground reads bigger than a pebble.
    for (let i = 0; i < 6; i++) { const x = r() * 256, y = r() * 256, rad = 60 + r() * 80, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${0.025 + r() * 0.025})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    speck(14000, 0.09, 0.6);
  }
  else if (kind === "lc") {
    // Packed township dirt: soft darker wear, fine grit and a few hairline cracks.
    for (let i = 0; i < 8; i++) { const x = r() * 256, y = r() * 256, rad = 50 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(30,24,18,${0.06 + r() * 0.06})`); gr.addColorStop(1, "rgba(30,24,18,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    speck(16000, 0.12, 0.6);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() > 0.5 ? "190,170,140" : "40,32,24"},${0.25 + r() * 0.3})`; g.fillRect(r() * 256, r() * 256, 1, 1); }
    g.strokeStyle = "rgba(20,16,12,.25)"; g.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  } else if (kind === "mc") {
    // Big concrete slabs with joints and stains.
    speck(2200, 0.07, 3);
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(60,60,64,${0.08 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 20 + r() * 30, 14 + r() * 20, r() * 3, 0, 7); g.fill(); }
    g.strokeStyle = "rgba(40,40,44,.55)"; g.lineWidth = 2;
    for (let y = 0; y <= 256; y += 128) line(0, y, 256, y);
    for (let x = 0; x <= 256; x += 128) line(x, 0, x, 256);
  } else if (kind === "uc") {
    // Polished stone tiles with fine joints and a soft sheen.
    speck(900, 0.05, 2);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { g.fillStyle = `rgba(255,255,255,${r() * 0.07})`; g.fillRect(x + 1, y + 1, 62, 62); }
    g.strokeStyle = "rgba(90,80,70,.45)"; g.lineWidth = 1;
    for (let y = 0; y <= 256; y += 64) line(0, y, 256, y);
    for (let x = 0; x <= 256; x += 64) line(x, 0, x, 256);
  } else if (kind === "rc") {
    // Grass, with worn garden paving stones through it.
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${60 + r() * 60},${90 + r() * 70},${40 + r() * 30},.5)`; g.fillRect(r() * 256, r() * 256, 1, 2 + r() * 3); }
    for (let i = 0; i < 10; i++) { const x = 40 + (i % 5) * 44 + r() * 8, y = i < 5 ? 110 : 150; g.fillStyle = "rgba(170,160,140,.9)"; g.beginPath(); g.ellipse(x, y + r() * 8, 16, 11, r(), 0, 7); g.fill(); }
  } else if (kind === "de" || kind === "sandroad") {
    // Sand, rippled by the wind.
    speck(2500, 0.08, 2);
    g.strokeStyle = "rgba(150,110,60,.35)"; g.lineWidth = 2;
    for (let y = 8; y < 256; y += 14) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 24 + y) * 4); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const districtOf = q => q.district || "mc";
// Buildings by district, from the Feelz Run kits.
const DISTRICT_BUILDINGS = {
  lc: ["tenement", "hostel", "kodas-building", "lc-b1", "lc-b2", "lc-b4", "lc-b5", "lc-b6", "lc-b7", "tenement2", "hostel2"],
  mc: ["mc-b2", "mc-b3", "mc-b4", "mc-b6", "mc-b7", "mc-b8", "station", "lockup"],
  uc: ["uc-b1", "uc-b2", "uc-b3", "uc-b4", "uc-b5", "skydeck"],
  rc: ["rc-b1", "rc-b3", "rc-b4", "rc-b5", "uc-b5"],
  de: ["de-b1", "de-b2", "de-b3", "de-b4", "shelter"]
};
const pads = {};   // place id -> its ground material (lit up when it is part of the mission)
const DCOLOUR = { lc: 0x8c7556, mc: 0x8d9096, uc: 0x9a90a6, rc: 0x6f8a58, de: 0xcfb07a };
const lamps = [];  // street lamps: lit at night
const lampBulbMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb04a, emissiveIntensity: 0.2 });
function ribbon(points, width, y, mat, step = 3) {
  // A strip laid over the land along a path of points.
  const pos = [], uv = [], idx = [];
  let run = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k], [bx, bz] = points[k + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let s = 0; s <= n; s++) {
      if (k > 0 && s === 0) continue;
      const t = s / n, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      for (const side of [-1, 1]) {
        const px = cx + nx * width / 2 * side, pz = cz + nz * width / 2 * side;
        pos.push(px, terrainAt(px, pz) + y, pz);
        uv.push(side < 0 ? 0 : 1, (run + L * t) / width);
      }
    }
    run += L;
  }
  const rows = pos.length / 6;
  // Wind the triangles so they face up whichever way the strip runs.
  const P = i => [pos[i * 3], pos[i * 3 + 2]];
  const [ax0, az0] = P(0), [bx0, bz0] = P(2), [cx0, cz0] = P(1);
  const up = (bz0 - az0) * (cx0 - ax0) - (bx0 - ax0) * (cz0 - az0) > 0;
  for (let r = 0; r + 1 < rows; r++) { const a = r * 2; if (up) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  return m;
}
// Photo textures (ambientCG, free to use): colour, bumps and shine for real sand and mud.
const texLoader = new THREE.TextureLoader();
function photoTex(name) {
  const load = (suf, srgb) => { const t = texLoader.load(`textures/${name}_${suf}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  return { map: load("color", true), normalMap: load("normal", false), roughnessMap: load("rough", false) };
}
const SAND = photoTex("sand"), MUDTEX = photoTex("mud");
function buildGround() {
  // The land: one sheet that rises and falls with the places on it.
  const pad = 120, W = WORLD_W + pad * 2, H = WORLD_H + pad * 2, sx = Math.round(W / 4), sz = Math.round(H / 4);
  const geo = new THREE.PlaneGeometry(W, H, sx, sz); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = [], sandy = [];
  // Open land is dry grass; ridges are grey rock, pale at the top; sand dunes out east.
  const cGrass = new THREE.Color(0x8a9455), cDry = new THREE.Color(0xa99a6a), cSand = new THREE.Color(0xe2c58a), cRock = new THREE.Color(0x8f8a83), cPeak = new THREE.Color(0xc9c4bb), cDune = new THREE.Color(0xe8cc90), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + WORLD_W / 2, z = p.getZ(i) + WORLD_H / 2;
    p.setY(i, terrainAt(clamp(x, 0, WORLD_W), clamp(z, 0, WORLD_H)) - 0.05);
    // Colour by the nearest place's district; sand out past the East Gate.
    let best = null, bd = 1e9;
    for (const q of S.quadrants) { const d = Math.hypot(Math.max(0, q.x0 - x, x - q.x0 - q.w), Math.max(0, q.z0 - z, z - q.z0 - q.d)); if (d < bd) { bd = d; best = q; } }
    tmp.copy(cGrass).lerp(cDry, 0.5 + 0.5 * Math.sin(x * 0.013 + z * 0.021));
    if (best.district === "de" || x > 740) tmp.lerp(cSand, clamp((x - 700) / 120, 0, 1));
    const rg = ridgeAt(clamp(x, 0, WORLD_W), clamp(z, 0, WORLD_H));
    const desert = best.district === "de" || x > 740;
    if (rg > 0.3) { tmp.lerp(desert ? cDune : cRock, clamp(rg / 2.5, 0, 1)); if (!desert && rg > 4.5) tmp.lerp(cPeak, clamp((rg - 4.5) / 4, 0, 0.8)); }
    col.push(tmp.r, tmp.g, tmp.b);
    // This is a desert city: open land is sand. Only near the green districts does it turn to grass.
    const green = (best.district === "rc" || best.district === "uc") ? clamp(1 - bd / 40, 0, 1) : 0;
    sandy.push(desert ? 1 : 1 - green);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute("sandy", new THREE.Float32BufferAttribute(sandy, 1)); geo.computeVertexNormals();
  const dirt = groundTexture("land"); dirt.repeat.set(W / 8, H / 8);
  const landMat = new THREE.MeshStandardMaterial({ map: dirt, vertexColors: true, roughness: 0.95 });
  // Out east the land turns to real photographed sand, blended in where the desert begins.
  landMat.onBeforeCompile = sh => {
    sh.uniforms.sandMap = { value: SAND.map };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float sandy;\nvarying float vSandy;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvSandy = sandy;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D sandMap;\nvarying float vSandy;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nif (vSandy > 0.001) { vec3 sandC = pow(mix(texture2D(sandMap, vMapUv * 12.0).rgb, texture2D(sandMap, vec2(vMapUv.y, -vMapUv.x) * 4.1).rgb, 0.35), vec3(2.2)) * vec3(1.0, 0.8, 0.66); diffuseColor.rgb = mix(diffuseColor.rgb, sandC, vSandy); }");
  };
  const land = new THREE.Mesh(geo, landMat);
  land.position.set(WORLD_W / 2, 0, WORLD_H / 2); land.receiveShadow = true; scene.add(land);
  // Each place has its own paving, flat at its height.
  for (const q of S.quadrants) {
    const kind = districtOf(q), st = kind === "de" ? photoTex("sand") : null, paving = st ? st.map : groundTexture(kind);
    const tileM = { lc: 8, mc: 8, uc: 5, rc: 9, de: 0.7 }[kind] || 6;   // the photo sand ripples, at their real size
    paving.repeat.set(q.w / tileM, q.d / tileM);
    const tint = (kind === "de" ? new THREE.Color(0xf0c8a8) : new THREE.Color(0xffffff)).multiplyScalar(kind === "uc" ? 0.78 : kind === "de" ? 0.9 : 0.95);
    const mat = kind === "de"
      ? new THREE.MeshStandardMaterial({ color: tint, map: paving, normalMap: st.normalMap, roughnessMap: st.roughnessMap, roughness: 1, emissive: 0x000000 })
      : new THREE.MeshStandardMaterial({ color: tint, map: paving, roughness: 0.85, emissive: 0x000000 });
    if (st) { st.normalMap.repeat.copy(paving.repeat); st.roughnessMap.repeat.copy(paving.repeat); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(q.x0 + q.w / 2, q.elev + 0.02, q.z0 + q.d / 2); m.receiveShadow = true;
    scene.add(m);
    pads[q.id] = { mat, base: tint.clone() };
  }
  // Roads, with a dashed centre line.
  const asphalt = groundTexture("asphalt"); asphalt.repeat.set(1, 1);
  // Roads are worn tar with concrete kerbs, the same as any Joburg street.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8e, map: asphalt, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xa8a39c, map: SAND.map, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const dash = (() => { const c = document.createElement("canvas"); c.width = 8; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#f2d27a"; g.fillRect(2, 0, 4, 34); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const dashMat = new THREE.MeshBasicMaterial({ map: dash, transparent: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, depthWrite: false });
  for (const r of WD.roads) {
    // Laid right on the land, so feet stand on the road, not in it.
    ribbon(r.points, r.width + 1.2, 0.09, kerbMat);
    ribbon(r.points, r.width, 0.13, roadMat);
    const dm = ribbon(r.points, 0.25, 0.16, dashMat, 3); dm.receiveShadow = false;
    dm.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * 0.25 / 6; });
  }
  // Boulders along the rocky ridges, so the borders read as mountains.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0), rockMat = new THREE.MeshStandardMaterial({ color: 0xc09a6c, roughness: 1, flatShading: true });   // sandstone
  const spots = [], rr = rng(31337);
  for (let z = 4; z < WORLD_H; z += 6) for (let x = 4; x < WORLD_W; x += 6) {
    const jx = x + (rr() - 0.5) * 5, jz = z + (rr() - 0.5) * 5, h = ridgeAt(jx, jz);
    if (h > 3.5 && jx < 740 && rr() < 0.3) spots.push([jx, jz, h]);
  }
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, spots.length), M = new THREE.Matrix4(), Qr = new THREE.Quaternion(), E = new THREE.Euler(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3();
  spots.forEach(([x, z, h], i) => {
    const k = 1.2 + rr() * 2.2 + h * 0.15;
    Sv.set(k * (0.8 + rr() * 0.6), k * (0.6 + rr() * 0.6), k * (0.8 + rr() * 0.6)); E.set(rr() * 3, rr() * 3, rr() * 3); Qr.setFromEuler(E);
    Pv.set(x, terrainAt(x, z) - k * 0.25, z); M.compose(Pv, Qr, Sv); rocks.setMatrixAt(i, M);
  });
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  // Lamps along every road, lit at night.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, metalness: 0.6, roughness: 0.4 });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), bulbGeo = new THREE.SphereGeometry(0.24, 10, 8);
  for (const r of WD.roads) for (let k = 0; k + 1 < r.points.length; k++) {
    const [ax, az] = r.points[k], [bx, bz] = r.points[k + 1], L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let s = 14, side = 1; s < L - 4; s += 30, side = -side) {
      const px = ax + (bx - ax) * s / L + nx * (r.width / 2 + 1.2) * side, pz = az + (bz - az) * s / L + nz * (r.width / 2 + 1.2) * side;
      if (onRiver(px, pz, 1) || ridgeAt(px, pz) > 0.3) continue;
      const y = terrainAt(px, pz);
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(px, y + 2.1, pz); pole.castShadow = true;
      const bulb = new THREE.Mesh(bulbGeo, lampBulbMat); bulb.position.set(px, y + 4.3, pz);
      scene.add(pole, bulb); lamps.push({ x: px, y: y + 4.3, z: pz });
    }
  }
}

/* ---------- buildings (static, with collision boxes) ----------
   Every solid thing is a box with a floor (`base`) and a `top`. They are kept in a
   grid of 8 m cells so a lookup only checks what is nearby. */
const BCELL = 8, bgrid = new Map();
let bstamp = 1;
const bkey = (i, j) => (i + 1000) * 4096 + (j + 1000);
function bindex(b) {
  if (b.base === undefined) b.base = terrainAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  b._k = [];
  for (let i = Math.floor(b.minX / BCELL); i <= Math.floor(b.maxX / BCELL); i++)
    for (let j = Math.floor(b.minZ / BCELL); j <= Math.floor(b.maxZ / BCELL); j++) {
      const k = bkey(i, j); let c = bgrid.get(k); if (!c) bgrid.set(k, c = []); c.push(b); b._k.push(k);
    }
}
function bunindex(b) {
  for (const k of b._k || []) { const c = bgrid.get(k); if (!c) continue; const i = c.indexOf(b); if (i >= 0) c.splice(i, 1); }
  b._k = [];
}
class BlockList extends Array {
  static get [Symbol.species]() { return Array; }
  push(...bs) { for (const b of bs) bindex(b); return super.push(...bs); }
  splice(start, n, ...add) { const out = super.splice(start, n, ...add); for (const b of out) bunindex(b); for (const b of add) bindex(b); return out; }
}
const blockers = new BlockList();
// Everything whose box overlaps the rectangle.
function inBox(minX, minZ, maxX, maxZ) {
  const out = [], s = ++bstamp;
  for (let i = Math.floor(minX / BCELL); i <= Math.floor(maxX / BCELL); i++)
    for (let j = Math.floor(minZ / BCELL); j <= Math.floor(maxZ / BCELL); j++) {
      const c = bgrid.get(bkey(i, j)); if (!c) continue;
      for (const b of c) if (b._s !== s) { b._s = s; out.push(b); }
    }
  return out;
}
const nearBlocks = (x, z, r) => inBox(x - r, z - r, x + r, z + r);

// Square to the streets only, so a building's collision box is its real footprint.
// `maxFoot` caps how wide it can be. It sits on the land at its lowest corner.
const BUILDING_TINT = { lc: 0xc9a07a, mc: 0xa9a7a2, uc: 0xe2dccd, rc: 0x9fb08a, de: 0xe0c08a };
const tmpTint = new THREE.Color();
// Buildings out past the fog are hidden, so the whole city costs only what's near.
const FAR_CULL = [];
async function placeBuilding(name, x, z, yaw, height, maxFoot = 13, force = false, freeYaw = false) {
  if (!force && (ridgeAt(x, z) > 0.3 || ridgeAt(x - 8, z - 8) > 0.6 || ridgeAt(x + 8, z + 8) > 0.6 || ridgeAt(x - 8, z + 8) > 0.6 || ridgeAt(x + 8, z - 8) > 0.6)) return;
  const src = await staticModel(name);
  if (!src) return;
  const m = src.clone(true);
  m.rotation.y = freeYaw ? yaw : Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min(height / Math.max(0.001, size.y), maxFoot / Math.max(0.001, size.x, size.z));
  m.scale.setScalar(k);
  const box2 = new THREE.Box3().setFromObject(m);
  const c = box2.getCenter(new THREE.Vector3());
  const hx = (box2.max.x - box2.min.x) / 2, hz = (box2.max.z - box2.min.z) / 2;
  const base = (force ? terrainAt(x, z) : Math.min(terrainAt(x - hx, z - hz), terrainAt(x + hx, z - hz), terrainAt(x - hx, z + hz), terrainAt(x + hx, z + hz))) - 0.15;
  m.position.set(x - c.x, base - box2.min.y, z - c.z);
  const mats = [];
  // Every building takes on its district's colour, so a street reads as one place:
  // warm brick in the Lower City, grey concrete in the Middle, pale stone Upper, green Restored, sand out east.
  let near = S.quadrants[0], nd = Infinity;
  for (const q of S.quadrants) { const d = Math.hypot(Math.max(0, q.x0 - x, x - q.x0 - q.w), Math.max(0, q.z0 - z, z - q.z0 - q.d)); if (d < nd) { nd = d; near = q; } }
  const tint = new THREE.Color(BUILDING_TINT[districtOf(near)] || 0xffffff);
  m.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      o.material = o.material.clone();
      if (o.material.color && !OWN_LOOK.has(name)) {
        // Pull the colour toward the district's own: its grey level stays, the hue follows the district.
        const c = o.material.color, l = (c.r + c.g + c.b) / 3;
        c.lerp(tmpTint.copy(tint).multiplyScalar(Math.max(0.35, l * 1.6)), 0.45);
      }
      mats.push(o.material);
    }
  });
  scene.add(m); FAR_CULL.push(m);
  const b = new THREE.Box3().setFromObject(m);
  blockers.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, top: b.max.y, base, mesh: m, mats, faded: false, building: name, cells: buildingCells(m, base, b) });
}
/* What a body bumps into, from the building's real shape: every bit of wall, pillar or
   stair at body height (knee to head) is marked on a fine grid, and the marks are joined
   into boxes. Open ground floors, archways and doorways stay open to walk through. */
function buildingCells(root, base, box) {
  const C = 0.6, lo = base + 0.35, hi = base + 1.9;
  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / C)), nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / C));
  const grid = new Uint8Array(nx * nz);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), P = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      A.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      B.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      Cc.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      if (Math.max(A.y, B.y, Cc.y) < lo || Math.min(A.y, B.y, Cc.y) > hi) continue;
      const L = Math.max(A.distanceTo(B), B.distanceTo(Cc), Cc.distanceTo(A));
      const steps = Math.min(80, Math.max(1, Math.ceil(L / (C * 0.5))));
      for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
        const u = i / steps, v = j / steps;
        P.copy(A).addScaledVector(B.clone().sub(A), u).addScaledVector(Cc.clone().sub(A), v);
        if (P.y < lo || P.y > hi) continue;
        const gx = Math.floor((P.x - box.min.x) / C), gz = Math.floor((P.z - box.min.z) / C);
        if (gx >= 0 && gz >= 0 && gx < nx && gz < nz) grid[gz * nx + gx] = 1;
      }
    }
  });
  let marked = 0; for (const g of grid) marked += g;
  // Hardly anything at body height (an odd model): treat the whole footprint as solid.
  if (marked < (nx + nz) * 0.6) return null;
  // Join marked cells into boxes: runs along each row, then stack matching runs.
  const boxes = [], open = new Map();
  for (let z = 0; z <= nz; z++) {
    const runs = [];
    if (z < nz) for (let x = 0; x < nx; x++) if (grid[z * nx + x]) { const x0 = x; while (x < nx && grid[z * nx + x]) x++; runs.push(x0 + ":" + x); }
    const next = new Map();
    for (const k of runs) { if (open.has(k)) next.set(k, open.get(k)); else next.set(k, z); }
    for (const [k, z0] of open) if (!next.has(k) || next.get(k) !== z0) {
      const [x0, x1] = k.split(":").map(Number);
      boxes.push({ minX: box.min.x + x0 * C, maxX: box.min.x + x1 * C, minZ: box.min.z + z0 * C, maxZ: box.min.z + z * C });
    }
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  return boxes;
}
const inCells = (cells, x, z, r) => cells.some(c => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r);
// A Meshy tree, standing on the ground, with a trunk you bump into.
async function placeTree(e) {
  const src = await staticModel(e.model); if (!src) return;
  const m = src.clone(true), box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
  m.scale.setScalar(e.h / Math.max(0.01, sz.y)); m.rotation.y = e.yaw;
  const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3()), base = terrainAt(e.x, e.z);
  m.position.set(e.x - c.x, base - b2.min.y, e.z - c.z);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(m); FAR_CULL.push(m);
  blockers.push({ minX: e.x - 0.35, maxX: e.x + 0.35, minZ: e.z - 0.35, maxZ: e.z + 0.35, top: base + e.h, base, mats: [] });
}
async function buildCity(onProgress) {
  const jobs = [];
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(1) * 977 + q.id.charCodeAt(2) * 131);
    const set = DISTRICT_BUILDINGS[districtOf(q)] || BUILDINGS;
    const real = REAL[q.id];
    if (real) {
      // The real place: its landmark, buildings where the map has them, and houses or blocks
      // along its real streets, each facing the street. Koda's own building stays on his street.
      const STYLE_SET = { township: ["matchbox"], rdp: ["rdp"], tuscan: ["tuscan"], maboneng: set, cbd: DISTRICT_BUILDINGS.uc || set, suburb: set, hatfield: set, pretoria: DISTRICT_BUILDINGS.uc || set, mall: set };
      const pickR = () => { const ss = STYLE_SET[real.style] || set; return ss[Math.floor(r() * ss.length)]; };
      let kodaDone = q.id !== "q01";
      for (const b of real.buildings) {
        const model = b.model || pickR();
        if (!kodaDone && b.model === "matchbox") { kodaDone = true; jobs.push(() => placeBuilding("kodas-building", b.x, b.z, b.yaw, 12, 16, true, true)); continue; }
        jobs.push(() => placeBuilding(model, b.x, b.z, b.yaw, b.h, b.foot, !!b.landmark, true));
      }
      for (const e of real.extras) jobs.push(() => e.model === "jacaranda" ? placeTree(e) : placeBuilding(e.model, e.x, e.z, e.yaw, e.h, e.model === "taxi" ? 5.5 : 9, true, true));
      // Fill the edges where the real streets left gaps, so no place looks empty.
      const inset = 16, edge = (len) => { const out = []; for (let s = 18; s < len - 16; s += 36 + r() * 6) out.push(s); return out; };
      const fill = [];
      for (const s of edge(q.w)) fill.push([q.x0 + s, q.z0 + inset, 0], [q.x0 + s, q.z0 + q.d - inset, Math.PI]);
      for (const s of edge(q.d)) fill.push([q.x0 + inset, q.z0 + s, Math.PI / 2], [q.x0 + q.w - inset, q.z0 + s, -Math.PI / 2]);
      const small = real.style === "township" || real.style === "rdp";
      for (const [x, z, yaw] of fill) {
        if (onRoad(x, z, small ? 6 : 12) || Math.hypot(x - (q.x0 + q.w / 2), z - (q.z0 + q.d / 2)) < 28) continue;
        if (real.buildings.some(b => Math.hypot(b.x - x, b.z - z) < (b.foot || 10) / 2 + (small ? 6 : 12))) continue;
        jobs.push(() => placeBuilding(pickR(), x, z, yaw, small ? 4.2 : 14 + r() * 10, small ? 8.5 : 24, false, false));
      }
      continue;
    }
    const pick = () => set[Math.floor(r() * set.length)];
    // Life-size: a storey is about 3.2 m, so a three-storey block stands near 10 m and Koda
    // (1.62 m) reaches about halfway up its ground floor.
    const inset = 16;
    // Buildings around the edges of each place, facing in, with gaps for the roads.
    const edge = (len) => { const out = []; for (let s = 18; s < len - 16; s += 34 + r() * 6) out.push(s); return out; };
    const slots = [];
    for (const s of edge(q.w)) slots.push([q.x0 + s, q.z0 + inset, 0], [q.x0 + s, q.z0 + q.d - inset, Math.PI]);
    for (const s of edge(q.d)) slots.push([q.x0 + inset, q.z0 + s, Math.PI / 2], [q.x0 + q.w - inset, q.z0 + s, -Math.PI / 2]);
    // A few low buildings for cover further in.
    if (districtOf(q) !== "de") for (let i = 0; i < 3; i++) slots.push([q.x0 + 30 + r() * (q.w - 60), q.z0 + 30 + r() * (q.d - 60), Math.floor(r() * 4) * Math.PI / 2, true]);
    for (const [x, z, yaw, low] of slots) {
      if (onRoad(x, z, 12)) continue;
      // The middle of every place stays open: that's where the arena, the rooftop course and the stalls go.
      if (Math.hypot(x - (q.x0 + q.w / 2), z - (q.z0 + q.d / 2)) < 26) continue;
      if (q.id === "q01" && x === slots[0][0] && z === slots[0][1]) { jobs.push(() => placeBuilding("kodas-building", x, z, yaw, 24, 30)); continue; }
      jobs.push(() => placeBuilding(pick(), x, z, yaw, districtOf(q) === "de" ? 7 + r() * 4 : low ? 11 + r() * 4 : 20 + r() * 14, districtOf(q) === "de" ? 16 : low ? 18 : 32));
    }
  }
  // Houses and shops along the roads between places.
  const r = rng(4242);
  for (const road of WD.roads) {
    if (road.name === "N1") continue;
    for (let k = 0; k + 1 < road.points.length; k++) {
      const [ax, az] = road.points[k], [bx, bz] = road.points[k + 1], L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 16; s < L - 12; s += 34) for (const side of [-1, 1]) {
        const x = ax + (bx - ax) * s / L + nx * (road.width / 2 + 16) * side, z = az + (bz - az) * s / L + nz * (road.width / 2 + 16) * side;
        if (inZone(x, z, 10) || onRiver(x, z, 14)) continue;
        const near = S.quadrants.reduce((a, q) => Math.hypot(q.x0 + q.w / 2 - x, q.z0 + q.d / 2 - z) < Math.hypot(a.x0 + a.w / 2 - x, a.z0 + a.d / 2 - z) ? q : a);
        const set = DISTRICT_BUILDINGS[districtOf(near)] || BUILDINGS;
        const yaw = Math.abs(nx) > Math.abs(nz) ? (side * nx > 0 ? -Math.PI / 2 : Math.PI / 2) : (side * nz > 0 ? Math.PI : 0);
        jobs.push(() => placeBuilding(set[Math.floor(r() * set.length)], x, z, yaw, 14 + r() * 8, 26));
      }
    }
  }
  let done = 0;
  const queue = jobs.slice();
  const worker = async () => { while (queue.length) { await queue.shift()(); done++; onProgress && onProgress(done / jobs.length); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

/* ---------- street obstacles: things to jump over, hide behind and run around ----------
   Low ones (barriers, crates, benches) can be jumped. Guards can't jump, so going over
   one is a way to lose them. Tall ones (dumpsters, crate stacks) are cover for sneaking. */
function stripeTexture() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#9a978f"; g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#e0b02a"; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 20, 18); g.lineTo(i * 16 + 12, 18); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function woodTexture() {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#7a5634"; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#4e3520"; g.lineWidth = 4; g.strokeRect(2, 2, 60, 60);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.moveTo(60, 4); g.lineTo(4, 60); g.stroke();
  g.fillStyle = "rgba(0,0,0,.12)"; for (let y = 10; y < 64; y += 12) g.fillRect(0, y, 64, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PROPS = (() => {
  const concrete = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2f5a45, roughness: 0.6, metalness: 0.4 });
  const bench = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.8 });
  const bin = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.55, metalness: 0.5 });
  return [
    { kind: "barrier", w: 2.6, d: 0.6, h: 0.85, mat: concrete, low: true, weight: 4 },
    { kind: "crate", w: 1.1, d: 1.1, h: 0.95, mat: wood, low: true, weight: 3 },
    { kind: "bench", w: 2.0, d: 0.7, h: 0.6, mat: bench, low: true, weight: 2 },
    { kind: "dumpster", w: 2.2, d: 1.3, h: 1.5, mat: metal, low: false, weight: 2 },
    { kind: "stack", w: 1.2, d: 1.2, h: 2.0, mat: wood, low: false, weight: 1 },
    { kind: "bin", w: 0.7, d: 0.7, h: 1.0, mat: bin, low: true, weight: 2 }
  ];
})();
const PROP = kind => PROPS.find(p => p.kind === kind);
// Things you can search: a part of the song can be hidden inside one.
const SEARCHABLE = { bin: "the bin", dumpster: "the dumpster", stack: "the stacked crates", crate: "the crate" };
const propGeo = new THREE.BoxGeometry(1, 1, 1);
function addProp(type, x, z, rot) {
  const w = rot ? type.d : type.w, d = rot ? type.w : type.d;
  if (blocked(x, z, Math.max(w, d) / 2 + 1.2) || onRoad(x, z, 0.5) || onRiver(x, z, 1) || ridgeAt(x, z) > 0.2) return null;
  const base = terrainAt(x, z);
  const m = new THREE.Mesh(propGeo, type.mat);
  m.scale.set(w, type.h, d); m.position.set(x, base + type.h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: base + type.h, base, low: type.low, walk: true, mesh: m, mats: [], faded: false, prop: type.kind };
  blockers.push(b);
  return b;
}
function buildProps() {
  const total = PROPS.reduce((a, p) => a + p.weight, 0);
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(2) * 4241 + 99);
    const pick = () => { let n = r() * total; for (const p of PROPS) if ((n -= p.weight) < 0) return p; return PROPS[0]; };
    // Scattered through the place; the middle 12 metres stay open for arenas, races and puzzles.
    const cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2, want = Math.round(q.w * q.d / 420);
    let placed = 0;
    for (let tries = 0; tries < want * 8 && placed < want; tries++) {
      const x = q.x0 + 10 + r() * (q.w - 20), z = q.z0 + 10 + r() * (q.d - 20);
      if (Math.hypot(x - cx, z - cz) < 12.5) continue;
      if (addProp(pick(), x, z, r() < 0.5)) placed++;
    }
    // Bins by the buildings: somewhere to look for what's hidden.
    for (let i = 0, n = 0; i < 40 && n < 6; i++) {
      const side = Math.floor(r() * 4), t = 0.15 + r() * 0.7;
      const x = side < 2 ? q.x0 + t * q.w : (side === 2 ? q.x0 + 17 : q.x0 + q.w - 17);
      const z = side >= 2 ? q.z0 + t * q.d : (side === 0 ? q.z0 + 17 : q.z0 + q.d - 17);
      if (addProp(PROP(r() < 0.7 ? "bin" : "dumpster"), x, z, false)) n++;
    }
  }
  // Crates and barriers along the roads between places.
  const r = rng(77);
  for (const road of WD.roads) for (let k = 0; k + 1 < road.points.length; k++) {
    const [ax, az] = road.points[k], [bx, bz] = road.points[k + 1], L = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let s = 20; s < L - 10; s += 35 + r() * 20) {
      const side = r() < 0.5 ? -1 : 1, off = road.width / 2 + 2.2;
      const x = ax + (bx - ax) * s / L + nx * off * side, z = az + (bz - az) * s / L + nz * off * side;
      if (!inZone(x, z, 2)) addProp(PROPS[Math.floor(r() * PROPS.length)], x, z, Math.abs(nx) > Math.abs(nz));
    }
  }
}

/* ---------- the mud river, its bridges and floating crates ----------
   Guards can't cross the mud. Koda can: over a bridge, or jumping from crate to crate.
   Step in the mud and it washes him back. */
const muds = [], floats = [], roofs = [];
function mudTexture() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#4a3523"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},${35 + Math.random() * 20},.35)`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 10, 1 + Math.random() * 3, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const mudMap = mudTexture();
const floatMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.85 });
const causewayMat = new THREE.MeshStandardMaterial({ color: 0x7fb3aa, roughness: 0.18, metalness: 0.25, emissive: 0x0b2320, emissiveIntensity: 0.6 });
const kerbStoneMat = new THREE.MeshStandardMaterial({ color: 0xd8c49c, roughness: 0.9 });
function buildRivers() {
  for (const [x0, z0, x1, z1] of WD.river) {
    const w = x1 - x0, d = z1 - z0, along = d > w ? "z" : "x";
    // Wet river mud from a photo: its own bumps, with a wet shine on top.
    const mat = new THREE.MeshStandardMaterial({ map: MUDTEX.map, normalMap: MUDTEX.normalMap, roughnessMap: MUDTEX.roughnessMap, roughness: 0.55, metalness: 0.05, color: 0xa08a6c, normalScale: new THREE.Vector2(1.4, 1.4), polygonOffset: true, polygonOffsetFactor: -3 });
    const pts = along === "z" ? [[x0 + w / 2, z0], [x0 + w / 2, z1]] : [[x0, z0 + d / 2], [x1, z0 + d / 2]];
    ribbon(pts, (along === "z" ? w : d) + 7, 0.04, new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), 4);
    const m = ribbon(pts, along === "z" ? w : d, 0.1, mat, 4);
    m.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * (along === "z" ? w : d) / 1.6; else a[i] = v * (along === "z" ? w : d) / 1.6; });
    const rv = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: 0, base: 0, mud: true, along, mat, mesh: m, mats: [] };
    muds.push(rv); blockers.push(rv);
    // A crossing of three crates every 60 metres, away from the bridges.
    const len = along === "z" ? d : w;
    for (let s = 30; s < len - 10; s += 60) {
      const sx = along === "z" ? x0 + w / 2 : x0 + s, sz = along === "z" ? z0 + s : z0 + d / 2;
      if (WD.bridges.some(([bx0, bz0, bx1, bz1]) => sx > bx0 - 20 && sx < bx1 + 20 && sz > bz0 - 20 && sz < bz1 + 20)) continue;
      for (let k = 0; k < 4; k++) {
        const across = (k - 1.5) * ((along === "z" ? w : d) / 4.2);
        const cx = along === "z" ? sx + across : sx, cz = along === "z" ? sz : sz + across;
        const fw = along === "z" ? 2.3 : 1.8, fd = along === "z" ? 1.8 : 2.3;
        const mesh = new THREE.Mesh(propGeo, floatMat);
        mesh.scale.set(fw, 0.35, fd); mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        const y = terrainAt(cx, cz);
        floats.push({ mesh, bx: cx, bz: cz, x: cx, z: cz, y, w: fw, d: fd, top: y + 0.3, along, phase: s * 0.7 + k * 2.1, amp: 1.2 + (k % 2) * 0.5, dx: 0, dz: 0 });
      }
    }
  }
  for (const [x0, z0, x1, z1] of WD.bridges) {
    // The road carries straight over the river as a causeway: it lies on the land the whole way,
    // so it meets the road at both ends with no step, and low stone kerbs keep you on it.
    const top = terrainAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.07;
    blockers.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top, base: top - 0.5, walk: true, bridge: true, ramp: { follow: true }, mats: [] });
    const along = (x1 - x0) > (z1 - z0) ? "x" : "z", len = along === "x" ? x1 - x0 : z1 - z0, n = Math.ceil(len / 2);
    for (const side of [0, 1]) {
      let topK = -1e9;
      for (let i = 0; i < n; i++) {
        const a = (along === "x" ? x0 : z0) + (i + 0.5) * len / n;
        const kx = along === "x" ? a : (side ? x1 - 0.25 : x0 + 0.25), kz = along === "x" ? (side ? z1 - 0.25 : z0 + 0.25) : a;
        const g = terrainAt(kx, kz), rail = new THREE.Mesh(propGeo, kerbStoneMat); topK = Math.max(topK, g);
        if (along === "x") rail.scale.set(len / n + 0.05, 0.45, 0.5); else rail.scale.set(0.5, 0.45, len / n + 0.05);
        rail.position.set(kx, g + 0.2, kz); rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
      }
      // Kerbs stop you: you can't walk off the side.
      const kx0 = along === "x" ? x0 : (side ? x1 - 0.5 : x0), kx1 = along === "x" ? x1 : (side ? x1 : x0 + 0.5);
      const kz0 = along === "x" ? (side ? z1 - 0.5 : z0) : z0, kz1 = along === "x" ? (side ? z1 : z0 + 0.5) : z1;
      blockers.push({ minX: kx0 - 0.1, maxX: kx1 + 0.1, minZ: kz0 - 0.1, maxZ: kz1 + 0.1, top: topK + 1.1, base: topK - 2, rail: true, mats: [] });
    }
  }
}
function updateFloats(t) {
  for (const f of floats) {
    const off = Math.sin(t * 0.6 + f.phase) * f.amp;
    const nx = f.along === "z" ? f.bx : f.bx + off, nz = f.along === "z" ? f.bz + off : f.bz;
    f.dx = nx - f.x; f.dz = nz - f.z; f.x = nx; f.z = nz;
    f.mesh.position.set(f.x, f.y + 0.14 + Math.sin(t * 2 + f.phase) * 0.04, f.z);
    f.mesh.rotation.y = Math.sin(t * 0.8 + f.phase) * 0.06;
  }
  for (const m of muds) { m.mat.map.offset[m.along === "z" ? "y" : "x"] = t * 0.02; }
}
const inMud = (x, z) => muds.some(m => x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ);
function floatAt(x, z) { for (const f of floats) if (Math.abs(x - f.x) < f.w / 2 + 0.1 && Math.abs(z - f.z) < f.d / 2 + 0.1) return f; return null; }
// Height of whatever is under (x, z): the land, the top of a crate, roof or bridge, a
// floating crate, or MUD for open mud.
function groundAt(x, z) {
  let g = terrainAt(x, z);
  if (inMud(x, z)) { const f = floatAt(x, z); g = f ? f.top : MUD; }
  for (const b of nearBlocks(x, z, 0.1)) if (b.walk && x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05) g = Math.max(g, b.ramp ? rampTop(b, x, z) : b.top);
  return g;
}
// The land and bridges only, for people who don't climb: guards and townsfolk.
function floorAt(x, z) {
  let g = terrainAt(x, z);
  for (const b of nearBlocks(x, z, 0.1)) if (b.bridge && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) g = Math.max(g, b.top);
  return g;
}
// Awnings: roofs on posts to hide under. Drones can't see you there and guards see less.
const awningMat = new THREE.MeshStandardMaterial({ color: 0x7a2f2f, roughness: 0.8, side: THREE.DoubleSide, transparent: true });
const postMat = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6, metalness: 0.4 });
const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3, 6);
function addAwning(x, z, w = 4.5, d = 3.2, colour, force = false) {
  if (!force && (blocked(x, z, Math.max(w, d) / 2 + 0.6) || onRoad(x, z, 2))) return null;
  const g = new THREE.Group();
  const mat = awningMat.clone(); if (colour) mat.color.setHex(colour);
  const roof = new THREE.Mesh(propGeo, mat); roof.scale.set(w, 0.12, d); roof.position.y = 3; roof.castShadow = true;
  g.add(roof);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(px * (w / 2 - 0.15), 1.5, pz * (d / 2 - 0.15)); g.add(p); }
  g.position.set(x, terrainAt(x, z), z);
  scene.add(g);
  const a = { x, z, w, d, group: g, mat };
  roofs.push(a);
  return a;
}
const underRoof = (x, z) => roofs.some(a => Math.abs(x - a.x) < a.w / 2 && Math.abs(z - a.z) < a.d / 2);
function buildAwnings() {
  const colours = [0x7a2f2f, 0x2f4f7a, 0x2f6a4a, 0x7a5a2f];
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(2) * 911 + 7), cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2;
    let n = 0; const want = Math.max(3, Math.round(q.w * q.d / 3500));
    for (let t = 0; t < 60 && n < want; t++) {
      const x = q.x0 + 9 + r() * (q.w - 18), z = q.z0 + 9 + r() * (q.d - 18);
      if (Math.hypot(x - cx, z - cz) < 13) continue;
      if (addAwning(x, z, 4 + r() * 2, 3 + r(), colours[Math.floor(r() * 4)])) n++;
    }
  }
}
function updateAwnings() {
  if (!koda) return;
  for (const a of roofs) {
    const under = Math.abs(koda.pos.x - a.x) < a.w / 2 + 1 && Math.abs(koda.pos.z - a.z) < a.d / 2 + 2.5;
    const want = under ? 0.3 : 1;
    if (a.mat.opacity !== want) { a.mat.opacity = want; a.mat.depthWrite = !under; }
  }
}

/* Fade any building standing between the camera and Koda, whichever way the camera looks. */
const fadedNow = new Set();
function updateOcclusion() {
  if (!koda) return;
  const ax = camera.position.x, az = camera.position.z, bx = koda.pos.x, bz = koda.pos.z, ky = koda.pos.y;
  const hit = new Set(), dx = bx - ax, dz = bz - az;
  for (const b of inBox(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1)) {
    if (b.mud || b.top - b.base < 2.5 || b.top < ky + 1.2) continue;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, d, mn, mx] of [[ax, dx, b.minX - 0.6, b.maxX + 0.6], [az, dz, b.minZ - 0.6, b.maxZ + 0.6]]) {
      if (Math.abs(d) < 1e-6) { if (p < mn || p > mx) { ok = false; break; } continue; }
      let ta = (mn - p) / d, tb = (mx - p) / d; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < 0.97) hit.add(b);
  }
  for (const b of new Set([...fadedNow, ...hit])) {
    const hides = hit.has(b);
    if (hides !== b.faded) {
      b.faded = hides;
      for (const m of b.mats) { m.transparent = hides; m.opacity = hides ? 0.28 : 1; m.depthWrite = !hides; m.needsUpdate = true; }
    }
  }
  fadedNow.clear(); for (const b of hit) fadedNow.add(b);
}

/* ---------- collision ---------- */
// Everything has a top. `y` is how high the body's feet are: anything whose top is at or
// below the feet (plus a small step) is stood on, not walked into. Guards stay on the ground.
// Mud stops guards; Koda can wade in (and gets washed back), so `isKoda` lets him through.
function blocked(x, z, r, y = null, isKoda = false) {
  if (y === null) y = terrainAt(x, z);
  // Hills and dunes are walls: checked across the body's width, not just at its middle.
  if (ridgeAt(x, z) > 0.9 || ridgeAt(x + r, z) > 0.9 || ridgeAt(x - r, z) > 0.9 || ridgeAt(x, z + r) > 0.9 || ridgeAt(x, z - r) > 0.9) return RIDGE;
  for (const b of nearBlocks(x, z, r + 0.1)) {
    if (b.interior && isKoda) continue;   // a building with an inside: he walks in
    if (b.mud) { if (isKoda) continue; if (b.bridgeOver) continue; if (onBridge(x, z)) continue; }
    else if ((b.ramp ? rampTop(b, x, z) : b.top) <= y + 0.35) continue;
    if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) { if (!b.cells || inCells(b.cells, x, z, r)) return b; }
  }
  return null;
}
const onBridge = (x, z) => WD.bridges.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
// Too steep to walk up: more than about 40 degrees.
const tooSteep = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az); return d > 1e-4 && (terrainAt(bx, bz) - terrainAt(ax, az)) / d > 0.85; };
function moveWithCollision(pos, dx, dz, r, isKoda = false) {
  // Already up on a hill somehow: every step that leads down off it is allowed.
  const ok = (nx, nz) => {
    const b = blocked(nx, nz, r, pos.y, isKoda);
    if (b === RIDGE) return ridgeAt(nx, nz) < ridgeAt(pos.x, pos.z) - 1e-4;
    return !b && !tooSteep(pos.x, pos.z, nx, nz);
  };
  if (ok(pos.x + dx, pos.z)) pos.x += dx;
  if (ok(pos.x, pos.z + dz)) pos.z += dz;
  pos.x = clamp(pos.x, 1, WORLD_W - 1);
  pos.z = clamp(pos.z, 1, WORLD_H - 1);
}
// Eyes see over low obstacles; feet don't walk through them (`walking`).
// `minTop`: how tall something must be to hide what's behind it. A crouching Koda hides
// behind a crate; standing up, only something chest-high or taller hides him.
function sightClear(ax, az, bx, bz, walking = false, minTop = 1.6) {
  const dx = bx - ax, dz = bz - az;
  const eye = Math.max(terrainAt(ax, az), terrainAt(bx, bz));
  if (!walking) { const L = Math.hypot(dx, dz); for (let s = 1; s < L; s += 2) if (ridgeAt(ax + dx * s / L, az + dz * s / L) > 2.2) return false; }
  for (const b of inBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))) {
    if (!walking && (b.mud || b.top - Math.max(b.base, eye - 0.5) < minTop)) continue;   // eyes see over low things and mud
    if (walking && b.mud && onBridge((ax + bx) / 2, (az + bz) / 2)) continue;
    for (const c of (walking && b.cells) ? b.cells : [b]) {
      let t0 = 0, t1 = 1;
      for (const [p, d, mn, mx] of [[ax, dx, c.minX, c.maxX], [az, dz, c.minZ, c.maxZ]]) {
        if (Math.abs(d) < 1e-6) { if (p < mn || p > mx) { t0 = 2; break; } continue; }
        let ta = (mn - p) / d, tb = (mx - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < 1) return false;
    }
  }
  return true;
}
// A free spot near (x, z), not inside a building.
function freeSpot(x, z, r = 1.2, rand = Math.random) {
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2, d = i * 0.35;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    // Out in the open: not tucked inside a building's walls, where nobody could reach.
    if (!blocked(px, pz, r) && !onRiver(px, pz, r) && !nearBlocks(px, pz, 0.1).some(b => b.cells && px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ)) return { x: px, z: pz };
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
// Keep moves in place: the game moves the body, not the clip. Each clip's sideways and
// forward hip motion is centred on the resting spot, so changing moves never makes a body
// jump, but the sway inside a clip is kept: the hips carry the legs, so flattening the sway
// makes planted feet slide from side to side. Moves that travel (flips, vaults) have their
// travel taken out in a straight line from first frame to last, so they land where they began.
// Some skeletons stand with Y up, others were built with Z up. The axis the hips sit
// furthest along at rest is "up"; the bounce on that axis stays as it is.
function stripRootMotion(clip, rest) {
  const r = [rest.x, rest.y, rest.z];
  const up = r.map(Math.abs).indexOf(Math.max(...r.map(Math.abs)));
  const tall = Math.abs(r[up]) || 1;
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values, n = v.length / 3;
    // Jumps and climbs where the game itself lifts the body: the clip's own rise is taken out
    // (crouches stay), so he doesn't go up twice.
    if (/^(bigjump|wallclimb)$/.test(clip.name)) for (let i = 0; i < n; i++) { const k = i * 3 + up; if (Math.abs(v[k]) > Math.abs(r[up])) v[k] = r[up]; }
    for (let a = 0; a < 3; a++) {
      if (a === up || n < 1) continue;
      const first = v[a], last = v[(n - 1) * 3 + a];
      if (Math.abs(last - first) > 0.25 * tall) {
        for (let i = 0; i < n; i++) v[i * 3 + a] += r[a] - (first + (last - first) * i / Math.max(1, n - 1));
      } else {
        let m = 0;
        for (let i = 0; i < n; i++) m += v[i * 3 + a];
        m /= n;
        for (let i = 0; i < n; i++) v[i * 3 + a] += r[a] - m;
      }
    }
  }
}
// How fast a walking or running clip carries the body, in metres a second at this body's size:
// the speed a planted foot slides back while it is on the ground. Playing the clip at
// (ground speed / this) keeps the feet locked to the ground instead of skating.
const STRIDE_CLIPS = /^(walk|run|sprint|crouch_walk|jog)$/;
function measureStride(actor, name) {
  const act = actor.clips[name], clip = act.getClip(), feet = [];
  actor.model.traverse(o => { if (o.isBone && /(Left|Right)Foot$/.test(o.name)) feet.push(o); });
  if (feet.length < 2 || clip.duration <= 0) return 0;
  act.reset(); act.play();
  const v = new THREE.Vector3(), rows = [], step = 1 / 60;
  for (let t = 0; t <= clip.duration + 1e-4; t += step) {
    actor.mixer.setTime(t);
    actor.root.updateMatrixWorld(true);
    rows.push(feet.map(f => { f.getWorldPosition(v); return [v.x, v.y, v.z]; }));
  }
  act.stop();
  actor.mixer.setTime(0);
  const sp = [];
  for (let k = 0; k < feet.length; k++) {
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) { lo = Math.min(lo, r[k][1]); hi = Math.max(hi, r[k][1]); }
    const near = lo + Math.max(0.02, (hi - lo) * 0.15);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1][k], b = rows[i][k];
      if (a[1] < near && b[1] < near) sp.push(Math.hypot(b[0] - a[0], b[2] - a[2]) / step);
    }
  }
  if (!sp.length) return 0;
  sp.sort((a, b) => a - b);
  return sp[Math.floor(sp.length * 0.9)];   // the steady part of the stance, not the lift-off and landing
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
    // How high the hips are standing: a rider's hips sit on the saddle.
    if (hips) { this.root.updateMatrixWorld(true); hips.getWorldPosition(v); this.hipsH = v.y; }
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    const rest = hips ? hips.position.clone() : new THREE.Vector3(0, 1, 0);
    for (const c of gltf.animations) { stripRootMotion(c, rest); this.clips[c.name] = this.mixer.clipAction(c); }
    this.current = null;
    this.model = model;
    this.baseY = model.position.y;
    this.pos = this.root.position;
    this.yaw = 0;
    this.stride = {};
    for (const n in this.clips) if (STRIDE_CLIPS.test(n)) { const s = measureStride(this, n); if (s > 0.3) this.stride[n] = s; }
    this.last = this.pos.clone();
    this.vel = 0;
  }
  has(name) { return !!this.clips[name]; }
  play(name, { once = false, fade = 0.15, speed = 1, from = 0 } = {}) {
    // In the saddle the legs belong to the horse: walking and running moves become sitting.
    if (this.seated && /^(walk|run|sprint|crouch_walk|crouch_idle|swim|tread|turn180)$/.test(name)) name = this.has("idle") ? "idle" : "fight_idle";
    const a = this.clips[name];
    if (!a) return 0;
    if (this.current === a && !once) { a.timeScale = speed; return a.getClip().duration; }
    // Looping moves don't swap back and forth faster than this: that flicker reads as a glitch.
    if (!once && this.current && this.held < 0.22 && this.current.loop !== THREE.LoopOnce) return a.getClip().duration;
    this.held = 0;
    a.reset();
    if (from) a.time = from;
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
    this.held = (this.held || 0) + dt;
    // The feet keep pace with the ground: a walk or run plays as fast as the body really moves.
    if (dt > 0) {
      const moved = Math.hypot(this.pos.x - this.last.x, this.pos.z - this.last.z) / dt;
      this.vel += (Math.min(moved, 20) - this.vel) * Math.min(1, dt * 10);
      this.last.copy(this.pos);
      const cur = this.current, nm = cur && cur.getClip().name, st = nm && this.stride[nm];
      if (st && cur.loop !== THREE.LoopOnce) cur.timeScale = clamp(this.vel / st, 0.55, 2.2);
    }
    restoreRest(this.model);
    this.mixer.update(dt);
    const name = this.current ? this.current.getClip().name : "";
    if (this.native) { if (this.armIn) armsIn(this.model, this.armIn); if (this.reach > 0.01 && !this.seated) armsReach(this.model, this.reach); }   // rigged and animated in Mixamo: only the arm width is tuned
    else if (!window.GILL_RAW) {
      if (/^(run|sprint)$/.test(name)) armSwing(this.model, ARM_SWING);
      if (!/^(punch|kick|takedown|hit|ko|alert|flykick|jump|spinkick)$/.test(name)) armClear(this.model, /^crouch/.test(name));
    }
    if (this.seated) { seatPose(this.model); this.model.position.y = this.baseY + this.seated.lift; this.model.position.z = -0.12; }
  }
}
// The moves were downloaded with wide arm space so the arms clear his jacket. That reads a little
// too wide on his frame, so each upper arm is brought in toward the body by this much (radians).
const KODA_ARM_IN = 0.2;
const _ai = { f: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), rq: new THREE.Quaternion() };
function armsIn(root, ang) {
  if (!root.userData.armsIn) root.userData.armsIn = ["Left", "Right"].map(sd => { let f = null; root.traverse(o => { if (!f && o.isBone && new RegExp("mixamorig:?" + sd + "Arm$").test(o.name)) f = o; }); return f; });
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_ai.rq);
  _ai.f.set(0, 0, 1).applyQuaternion(_ai.rq).normalize();   // the way he faces
  root.userData.armsIn.forEach((bone, i) => {
    if (!bone) return;
    bone.parent.getWorldQuaternion(_ai.pq);
    _ai.q.setFromAxisAngle(_ai.f, (i === 0 ? -1 : 1) * ang);
    bone.quaternion.premultiply(_ai.pq.clone().invert().multiply(_ai.q).multiply(_ai.pq));
  });
}
// Hands out in front on the cart's handles while he walks it: upper arms swing forward,
// elbows bend a little. `amt` 0 to 1 eases in and out.
function armsReach(root, amt) {
  if (!root.userData.reach) root.userData.reach = ["Arm", "ForeArm"].map(part => ["Left", "Right"].map(sd => { let f = null; root.traverse(o => { if (!f && o.isBone && new RegExp("mixamorig:?" + sd + part + "$").test(o.name)) f = o; }); return f; }));
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_ai.rq);
  _ai.f.set(1, 0, 0).applyQuaternion(_ai.rq).normalize();   // across his body
  const [uppers, fores] = root.userData.reach;
  const turn = (bone, ang) => { if (!bone) return; bone.parent.getWorldQuaternion(_ai.pq); _ai.q.setFromAxisAngle(_ai.f, ang); bone.quaternion.premultiply(_ai.pq.clone().invert().multiply(_ai.q).multiply(_ai.pq)); bone.updateMatrixWorld(true); };
  for (const b of uppers) turn(b, -0.3 * amt);
  for (const b of fores) turn(b, -0.85 * amt);
}
// Characters re-rigged in Mixamo with moves made for their own bodies live with the game.
const NATIVE = { "koda.glb": "models/koda.glb?v=10", "guard.glb": "models/guard.glb" };   // ?v= changes with each new set of moves, so browsers fetch the new one
/* Everyone else moves with Koda's and the guard's moves, retargeted onto their own bodies.
   Their own moves were keyed against a different resting arm pose, which is what folded arms
   across chests and into sides (the same fault Koda had). Retargeting copies each bone's pose
   as it looks, not its raw numbers: for every frame, each bone is turned to point the way the
   source bone points, allowing for how the two bodies differ at rest. Done once per character
   kind, when it first loads. */
const MOVES_FROM = file => /^townsfolk\//.test(file) ? "koda.glb" : file === "zora.glb" ? "koda.glb" : ENEMIES[file.replace(/\.glb$/, "")] ? "guard.glb" : null;
const moveSource = {}, retargeted = {};
const boneKey = n => n.replace(/^mixamorig\d*:?/, "");
function retargetClips(src, dst, keepOwn) {
  const S = src.scene, D = dst.scene;
  S.updateMatrixWorld(true); D.updateMatrixWorld(true);
  const sb = {}, db = [];
  S.traverse(o => { if (o.isBone) sb[boneKey(o.name)] = o; });
  D.traverse(o => { if (o.isBone) db.push(o); });   // parents before children
  const qInv = new THREE.Quaternion(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3();
  const rootQ = (root) => root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const sRoot = rootQ(S), dRoot = rootQ(D);
  const rel = (bone, rootInv) => rootInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  // At rest: how each target bone sits relative to its source twin.
  const corr = {}, dRestRel = new Map(), dParentRest = new Map();
  for (const b of db) {
    dRestRel.set(b, rel(b, dRoot));
    if (!b.parent.isBone) dParentRest.set(b, rel(b.parent, dRoot));
    const s0 = sb[boneKey(b.name)]; if (s0) corr[b.name] = rel(s0, sRoot).invert().multiply(dRestRel.get(b));
  }
  const sHips = sb.Hips, dHips = db.find(b => boneKey(b.name) === "Hips");
  const hipH = (bone, root) => { bone.getWorldPosition(tv); root.worldToLocal(tv); return tv.clone(); };
  const sHip0 = sHips && hipH(sHips, S), dHip0 = dHips && hipH(dHips, D);
  const k = sHip0 && dHip0 ? dHip0.y / Math.max(1e-4, sHip0.y) : 1;
  const mixer = new THREE.AnimationMixer(S), out = [];
  // Only the moves this character uses: the ones it came with, plus standing, walking and running.
  const need = new Set(dst.animations.map(c => c.name).concat(["idle", "walk", "run"]));
  for (const clip of src.animations) {
    if (!need.has(clip.name) || (keepOwn && keepOwn.has(clip.name))) continue;
    const act = mixer.clipAction(clip); mixer.stopAllAction(); act.reset(); act.play();
    const n = Math.max(2, Math.round(clip.duration * 20) + 1), times = new Float32Array(n);
    const qv = new Map(db.filter(b => corr[b.name]).map(b => [b, new Float32Array(n * 4)])), pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / 20); times[i] = t;
      mixer.setTime(t); S.updateMatrixWorld(true);
      const want = new Map();
      for (const b of db) {
        const s0 = sb[boneKey(b.name)];
        const w = s0 && corr[b.name] ? rel(s0, sRoot).multiply(corr[b.name]) : null;
        const parentW = b.parent.isBone ? want.get(b.parent) : dParentRest.get(b);
        const self = w || (parentW ? parentW.clone().multiply(b.quaternion) : dRestRel.get(b));
        want.set(b, self);
        if (w && qv.has(b)) { tq.copy(parentW).invert().multiply(w); tq.toArray(qv.get(b), i * 4); }
      }
      if (sHips && dHips) {
        const p = hipH(sHips, S).sub(sHip0).multiplyScalar(k).add(dHip0);   // in the target's root space
        tv.copy(p); D.localToWorld(tv); dHips.parent.worldToLocal(tv); tv.toArray(pv, i * 3);
      }
    }
    const tracks = [];
    for (const [b, v] of qv) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + ".quaternion", times, v));
    if (sHips && dHips) tracks.push(new THREE.VectorKeyframeTrack(dHips.name + ".position", times, pv));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  mixer.stopAllAction();
  // Moves only the character had (a dance, a cheer) stay its own.
  return out.concat(dst.animations.filter(c => !out.some(o => o.name === c.name)));
}
async function makeActor(file, metres) {
  const own = NATIVE[file], from = !own && MOVES_FROM(file);
  const g = await loadGLB(own || MODELS + file);
  if (from) {
    try {
      if (!moveSource[from]) moveSource[from] = loadGLB(NATIVE[from]);
      const src = await moveSource[from];
      if (!retargeted[file]) retargeted[file] = retargetClips(src, g, null);
      g.animations = retargeted[file].map(c => c.clone());
    } catch (e) { console.warn("retarget", file, e); }
  }
  const a = new Actor(g, metres);
  a.native = !!own || !!from;
  return a;
}
const forward = a => new THREE.Vector2(Math.sin(a.yaw), Math.cos(a.yaw));

/* ---------- input ---------- */
const keys = new Set();
const input = { x: 0, z: 0, mag: 0, sneak: false };
addEventListener("keydown", e => {
  if (e.repeat) return;
  keys.add(e.code);
  if (state === "card" && (e.code === "Space" || e.code === "Enter" || e.code === "KeyJ")) return cardContinue();
  if (state === "paused" && (e.code === "Escape" || e.code === "KeyP")) return resume();
  if (e.code === "KeyV" && (state === "play" || state === "build")) return setView(cam.view + 1);
  if (e.code === "KeyB" && state === "play" && mission && mission.def.free) return startBuild();
  if (state !== "play") return;
  if (e.code === "KeyC" || e.code === "ControlLeft") toggleSneak();
  if (e.code === "KeyJ" || e.code === "KeyK") attack();
  if (e.code === "Space") jump();
  if (e.code === "KeyE") action();
  if (e.code === "Escape" || e.code === "KeyP") pause();
});
addEventListener("keyup", e => keys.delete(e.code));
// Alt is the walk key: stop the browser using it to jump to its menu.
addEventListener("keydown", e => { if (e.key === "Alt" && state === "play") e.preventDefault(); });
addEventListener("keyup", e => { if (e.key === "Alt" && state === "play") e.preventDefault(); });
Object.defineProperty(input, "actionHeld", { get: () => keys.has("KeyE") || pad.action || input.touchAction });
function keyVector() {
  let x = 0, z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  const m = Math.hypot(x, z);
  // Shift sprints, Alt walks.
  return m ? { x: x / m, z: z / m, mag: keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 : keys.has("AltLeft") || keys.has("AltRight") ? 0.45 : 0.8 } : { x: 0, z: 0, mag: 0 };
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
  const hold = (id, key) => { const b = $(id); b.addEventListener("pointerdown", e => { e.preventDefault(); input[key] = true; }); for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => { input[key] = false; }); };
  hold("btnAction", "touchAction"); hold("btnBoost", "boostHeld");
})();
/* Menus with a controller: the d-pad or left stick moves a highlight between the buttons on
   screen, A presses the highlighted one. With nothing highlighted yet, A presses the main
   button (Play, Start, Next, Resume). */
const MENU_OF = { title: "title", card: "card", score: "score", paused: "pause" };
const menuId = () => state === "title" && !$("coop").classList.contains("hidden") ? "coop" : state === "title" && !$("worlds").classList.contains("hidden") ? "worlds" : MENU_OF[state];
const padNav = { dir: "", t: 0, el: null, last: 0 };
function menuButtons(id) {
  return [...$(id).querySelectorAll("button, a.exit-link")].filter(b => !b.disabled && b.offsetParent !== null && !b.closest(".hidden"));
}
function padFocus(b) {
  if (padNav.el) padNav.el.classList.remove("padfocus");
  padNav.el = b;
  if (!b) return;
  b.classList.add("padfocus");
  b.focus({ preventScroll: true });
  b.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function padMenu(id, x, z, mag, pressA) {
  const list = menuButtons(id);
  if (padNav.el && !list.includes(padNav.el)) padFocus(null);
  const now = performance.now();
  const dir = mag > 0.5 ? (Math.abs(x) > Math.abs(z) ? (x > 0 ? "r" : "l") : (z > 0 ? "d" : "u")) : "";
  // A fresh push moves at once; holding it repeats after a short wait.
  if (dir && (dir !== padNav.dir || now - padNav.t > (padNav.rep ? 140 : 380))) {
    padNav.rep = dir === padNav.dir; padNav.t = now;
    if (!padNav.el) padFocus(list.find(b => b.classList.contains("primary")) || list[0]);
    else {
      const r0 = padNav.el.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
      const want = { r: [1, 0], l: [-1, 0], d: [0, 1], u: [0, -1] }[dir];
      let best = null, score = Infinity;
      for (const b of list) {
        if (b === padNav.el) continue;
        const r = b.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        const along = dx * want[0] + dy * want[1];
        if (along <= 4) continue;
        const across = Math.abs(dx * want[1] - dy * want[0]);
        const sc = along + across * 2.5;
        if (sc < score) { score = sc; best = b; }
      }
      if (best) padFocus(best);
    }
  }
  if (!dir) padNav.dir = "", padNav.rep = false; else padNav.dir = dir;
  if (pressA) {
    const b = padNav.el || { title: $("playBtn"), card: $("cardBtn"), score: $("nextBtn"), pause: $("resumeBtn"), coop: $("coopMake"), worlds: $("worldNew") }[id];
    if (b && !b.disabled) b.click();
  }
}
/* Game controllers: left stick or d-pad moves, A jumps, X hits, Y is the action,
   B sneaks, RT sprints, Start pauses. A carries on from a card. */
const pad = { x: 0, z: 0, mag: 0, prev: [] };
function pollPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  const g = [...list].find(q => q && q.connected);
  pad.x = 0; pad.z = 0; pad.mag = 0; pad.rx = 0; pad.ry = 0;
  if (!g) return;
  const btn = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
  let x = g.axes[0] || 0, z = g.axes[1] || 0;
  // In build mode the d-pad picks pieces, so only the stick walks.
  if (state !== "build") { if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) z = -1; if (btn(13)) z = 1; }
  const m = Math.hypot(x, z);
  if (m > 0.22) { pad.x = x / m; pad.z = z / m; pad.mag = btn(7) || btn(10) ? 1 : Math.min(0.9, m); }
  const press = i => btn(i) && !pad.prev[i];
  const menu = menuId();
  if (menu) padMenu(menu, x, z, m, press(0));
  if (state === "title") { if (press(9) && !$("playBtn").disabled) $("playBtn").click(); }
  else if (state === "card") { if (press(9) || press(2)) cardContinue(); }
  else if (state === "paused") { if (press(9) || press(1)) resume(); }
  else if (state === "build") {
    if (press(0)) buildPlace();
    if (press(2)) buildPickUp(B.near);
    if (press(3)) buildToggleInterior();
    if (press(1)) buildUndo();
    if (press(6)) buildTurn();
    if (press(15)) buildPick(null, (B.i + 1) % catPieces().length);
    if (press(14)) buildPick(null, (B.i - 1 + catPieces().length) % catPieces().length);
    if (press(12) || press(13)) { const cs = catList(), ci = cs.indexOf(B.cat); buildPick(cs[(ci + (press(13) ? 1 : -1) + cs.length) % cs.length], 0); }
    if (press(9)) stopBuild();
  }
  else if (state === "play") {
    if (press(0)) jump();
    if (press(2)) attack();
    if (press(3)) action();
    if (press(1)) toggleSneak();
    if (press(9)) pause();
  }
  if ((state === "play" || state === "build") && press(8)) setView(cam.view + 1);
  pad.rx = g.axes[2] || 0; pad.ry = g.axes[3] || 0;
  pad.action = btn(3); pad.boost = state === "play" && btn(6);
  // LB and RB, held: zoom the camera out and in.
  pad.zoom = (btn(4) ? 1 : 0) - (btn(5) ? 1 : 0);
  pad.prev = g.buttons.map((b, i) => btn(i));
}
function readInput() {
  const k = keyVector();
  const s = stick.mag ? stick : pad.mag ? pad : k;
  // Up on the stick is always away from the camera, whichever way it faces.
  const a = cam.heading - Math.PI, c = Math.cos(a), sn = Math.sin(a);
  input.x = s.x * c + s.z * sn; input.z = -s.x * sn + s.z * c; input.mag = s.mag;
}
/* ---------- camera views ----------
   V (or the VIEW button, or the controller's View button) switches between:
     Distance  the 3/4 view from above and behind, zooming in for fights
     Close     low behind Koda's shoulder, turning with him; drag or use the right stick to look round
     Top       straight down from high above, to see the whole neighbourhood   */
const VIEWS = ["Distance", "Close", "Top"];
const cam = { view: 0, heading: Math.PI, look: 0, pitch: 0, yawV: 0, pitchV: 0, zoom: 1, zoomV: 0 };
// The right stick, gently: a dead zone, then a curve so small pushes turn slowly, and the turn
// eases in and out instead of snapping.
const stickCurve = v => { const a = Math.abs(v); return a < 0.22 ? 0 : Math.sign(v) * ((a - 0.22) / 0.78) ** 2.4; };
let arenaView = null;   // the view to go back to when an arena gate opens
function setView(i, forArena = false) {
  if (!forArena) arenaView = null;
  cam.view = ((i % VIEWS.length) + VIEWS.length) % VIEWS.length;
  if (cam.view !== 1) cam.heading = Math.PI;
  else if (koda) cam.heading = koda.yaw;
  if (!forArena) try { save.view = cam.view; writeSave(); } catch (e) { /* no save yet */ }
  const b = $("btnView"); if (b) b.textContent = VIEWS[cam.view];
  if (state === "play" || state === "build") popText(VIEWS[cam.view].toUpperCase() + " VIEW");
  if (koda) updateCamera(0, true);
}
addEventListener("wheel", e => { if ((state === "play" || state === "build") && e.target === renderer.domElement) cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 0.45, 2.2); }, { passive: true });
// Close view: drag anywhere on the game (not on a button) to look round.
(() => {
  let drag = null;
  addEventListener("pointerdown", e => { if (cam.view === 1 && e.target === renderer.domElement && e.pointerId !== stick.id) drag = { id: e.pointerId, x: e.clientX }; });
  addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) { cam.heading -= (e.clientX - drag.x) * 0.0035; cam.look = 4; drag.x = e.clientX; } });
  addEventListener("pointerup", e => { if (drag && e.pointerId === drag.id) drag = null; });
})();
function toggleSneak() { if (state === "play" && dodge()) return; input.sneak = !input.sneak; $("btnSneak").classList.toggle("on", input.sneak); }

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
  music.started = false; music.radioToken = null;
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
  music.t0 = t0; music.started = true;
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
function songLength() {
  if (music.stems) return Math.max(...music.stems.map(b => b.duration));
  return music.buffer ? music.buffer.duration : 0;
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

// Free roam radio: the album plays song after song, with a low city hum under it.
async function roamRadio() {
  const ac = audioCtx(); if (!ac) return;
  stopMusic();
  const token = music.radioToken = {};
  const live = () => music.radioToken === token && mission && mission.def.free;
  // City hum: soft filtered noise, like distant traffic and wind.
  const len = 4, nb = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), nd = nb.getChannelData(0);
  let last = 0; for (let i = 0; i < nd.length; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; nd[i] = last * 6; }
  const hum = ac.createBufferSource(); hum.buffer = nb; hum.loop = true;
  const hf = ac.createBiquadFilter(); hf.type = "lowpass"; hf.frequency.value = 500;
  const hg = ac.createGain(); hg.gain.value = 0.18;
  hum.connect(hf); hf.connect(hg); hg.connect(music.master); hum.start();
  music.sources.push(hum);
  const list = S.missions.filter(d => d.trackId);
  music.radio = music.radio || Math.floor(Math.random() * list.length);
  for (let tries = 0; tries < list.length * 50 && live(); tries++) {
    const d = list[music.radio++ % list.length];
    let buf; try { buf = await decode(await songUrl(d.trackId)); } catch (e) { await new Promise(r => setTimeout(r, 1500)); continue; }
    if (!live()) return;
    const src = ac.createBufferSource(); src.buffer = buf;
    const g = ac.createGain(); g.gain.value = 0.85; src.connect(g); g.connect(music.master);
    music.buffer = buf; music.t0 = ac.currentTime + 0.05; music.started = true;
    src.start(music.t0); music.sources.push(src);
    toast("Now playing: " + d.song, 2.5);
    await new Promise(r => { src.onended = r; });
    music.sources = music.sources.filter(s => s !== src);
  }
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
    if (music.ac && music.sources.length) music.ac.suspend();
    cardDone = resolve;
  });
}
function cardContinue() {
  if (state !== "card") return;
  $("card").classList.add("hidden");
  if (phone) $("touch").classList.remove("hidden");
  state = "play";
  lastT = performance.now();
  if (music.ac) music.ac.resume();
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
let state = "title";            // title | card | play | paused | score | build
let koda = null, zora = null, mission = null, currentQuad = null, race = null, escape = null;
const enemies = [], npcs = [];
let health = 5, invuln = 0, attackLock = 0, comboStep = 0, lunge = null, air = null;

/* ---------- the beat ----------
   Each song's tempo and sections. Until the real numbers are in story.js (bpm,
   offset, sections), they are worked out from the song itself when it loads. */
const beat = { bpm: 0, spb: 0.5, offset: 0, sections: [], last: -1, guessed: true };
function analyseBeat(buf) {
  const sr = buf.sampleRate, hop = 512, a = buf.getChannelData(0), b2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const n = Math.floor(a.length / hop), env = new Float32Array(n), lin = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0; const o = i * hop;
    for (let j = 0; j < hop; j += 2) { const v = a[o + j] + (b2 ? b2[o + j] : 0); e += v * v; }
    lin[i] = e; env[i] = Math.log(1e-6 + e);
  }
  const on = new Float32Array(n);
  for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
  const fps = sr / hop;
  const at = (i) => { const k = Math.floor(i), f = i - k; return k + 1 < n ? on[k] * (1 - f) + on[k + 1] * f : 0; };
  // Tempo: the lag where the onsets line up best with themselves, 75 to 165 BPM.
  let best = -1, bpm = 110;
  for (let t = 75; t <= 165; t += 0.5) {
    const lag = fps * 60 / t; let s = 0;
    for (let i = 0; i + lag * 2 < n; i += 2) s += on[i] * (at(i + lag) + 0.5 * at(i + lag * 2));
    if (s > best) { best = s; bpm = t; }
  }
  const lag = fps * 60 / bpm;
  // Where the beats fall: the phase that lands on the most onsets.
  let bo = 0, bs = -1;
  for (let o = 0; o < lag; o += 0.5) { let s = 0; for (let i = o; i < n; i += lag) s += at(i); if (s > bs) { bs = s; bo = o; } }
  const offset = bo / fps, spb = 60 / bpm;
  // Sections: where the loudness of a bar jumps, at least 8 bars apart.
  const bars = []; const barLen = spb * 4;
  for (let t = offset; t < a.length / sr; t += barLen) {
    const i0 = Math.floor(t * fps), i1 = Math.min(n, Math.floor((t + barLen) * fps)); let e = 0;
    for (let i = i0; i < i1; i++) e += lin[i];
    bars.push({ t, e: Math.log(1e-6 + e / Math.max(1, i1 - i0)) });
  }
  const sections = [];
  let lastB = 0;
  for (let k = 2; k < bars.length - 1; k++) {
    const prev = (bars[k - 1].e + bars[k - 2].e) / 2, next = (bars[k].e + bars[k + 1].e) / 2;
    if ((Math.abs(next - prev) > 0.45 && k - lastB >= 8) || k - lastB >= 16) { sections.push(+bars[k].t.toFixed(2)); lastB = k; }
  }
  return { bpm, offset: +offset.toFixed(3), sections };
}
function setupBeat(m) {
  const d = m.def;
  const buf = music.stems ? music.stems[0] : music.buffer;
  let g = { bpm: 110, offset: 0, sections: [] };
  if (buf && !(d.bpm && d.sections)) { try { g = analyseBeat(buf); } catch (e) { /* keep the default */ } }
  beat.bpm = d.bpm || g.bpm; beat.spb = 60 / beat.bpm;
  beat.offset = d.offset != null ? d.offset : g.offset;
  beat.sections = d.sections || g.sections;
  beat.guessed = !(d.bpm && d.sections);
  beat.last = -1;
  console.info(`[gill] ${d.song}: ${beat.bpm} BPM, first beat ${beat.offset}s, sections ${beat.sections.join(", ")}${beat.guessed ? " (guessed from the audio)" : ""}`);
}
// How far into the song we are. The song loops for as long as the mission takes, so this
// wraps back to 0 at the end; songClock() keeps counting up.
function songClock() {
  // Test recordings step the game slower than real time: follow the game clock there.
  if (window.GILL_HOLD && mission) return mission.t;
  return music.ac && music.started ? Math.max(0, music.ac.currentTime - music.t0) : (mission ? mission.t : 0);
}
function songTime() {
  const t = songClock(), L = mission && mission.limit;
  return L ? t % L : t;
}
function nearBeat(win = 0.11) {
  if (!beat.bpm) return false;
  const p = (songTime() - beat.offset) / beat.spb;
  return Math.abs(p - Math.round(p)) * beat.spb < win;
}
function nextSection(after) {
  for (const s of beat.sections) if (s > after) return s;
  return Math.max(after + 16 * beat.spb, (mission && mission.limit) || after + 30);
}
// Called every frame: fires once per beat.
function updateBeat() {
  if (!beat.bpm || !music.started) return;
  const n = Math.floor((songTime() - beat.offset) / beat.spb);
  if (n <= beat.last) return;
  beat.last = n;
  const el = $("beat"); el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
  el.classList.toggle("bar", n % 4 === 0);
  onBeat(n);
}
// What the music drives.
let shiftLeft = 0;
function onBeat(n) {
  for (const d of drones) d.pulse = 1;
  // Every 8 bars the guards change shift: for 2 bars they stop and look away.
  if (n > 0 && n % 32 === 0 && mission && !mission.def.calm) {
    let near = false;
    for (const e of enemies) if (e.state === "patrol" || e.state === "suspicious") { e.shiftT = beat.spb * 8; e.state = "patrol"; e.meter = 0; if (dist2(koda.pos, e.a.pos) < 30) near = true; }
    if (near && !enemies.some(e => e.state === "alert")) { toast("Shift change. Move now!", beat.spb * 6); tip("shift"); }
  }
  // Pads and puzzles play their notes on the beat.
  for (const qd of (mission ? mission.quads : [])) if (qd.onBeat) qd.onBeat(n);
}

/* ---------- small sounds ---------- */
const NOTE = (semi) => 261.63 * Math.pow(2, semi / 12);
function playNote(semi, len = 0.35, type = "triangle", vol = 0.16, detune = 0, when = 0) {
  const ac = music.ac; if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = NOTE(semi); o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + len + 0.05);
}
function sfxBuzz() { playNote(-17, 0.3, "sawtooth", 0.08); playNote(-16, 0.3, "sawtooth", 0.08); }
function popText(text, cls = "") {
  const el = $("pop"); el.textContent = text; el.className = "pop show " + cls;
  clearTimeout(popText.t); popText.t = setTimeout(() => el.classList.remove("show"), 700);
}

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
  g.userData = { gem, beam, ring };
  scene.add(g);
  return g;
}
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
function ringAt(x, z, r, y = null) {
  if (y === null) y = terrainAt(x, z);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 48), ringMat);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 6, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 3;
  g.add(m, beam); g.position.set(x, y, z);
  scene.add(g);
  return g;
}
// Things a quadrant adds for a mission, removed when the mission ends.
function own(qd, obj) { (qd.things || (qd.things = [])).push(obj); if (!obj.parent) scene.add(obj); return obj; }
function addBlock(qd, b) {
  blockers.push(b); (qd.blocks || (qd.blocks = [])).push(b);
  if (b.mesh && !b.mesh.parent) scene.add(b.mesh);
  navMark(b);
  return b;
}
function removeBlock(qd, b) {
  const i = blockers.indexOf(b); if (i >= 0) blockers.splice(i, 1);
  if (qd.blocks) { const k = qd.blocks.indexOf(b); if (k >= 0) qd.blocks.splice(k, 1); }
  if (b.mesh) scene.remove(b.mesh);
  navMark(b);
}
const boxBlock = (x, z, w, d, h, mat, walk = true) => {
  const base = terrainAt(x, z);
  const mesh = new THREE.Mesh(propGeo, mat); mesh.scale.set(w, h, d); mesh.position.set(x, base + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: base + h, base, walk, mesh, mats: [] };
};

function clearMission() {
  timers.length = 0;
  sleepPlacedEnforcers();
  if (koda) koda.pushing = null;
  if (arenaView !== null) { const v = arenaView; arenaView = null; cam.view = v; cam.heading = v === 1 && koda ? koda.yaw : Math.PI; const b = $("btnView"); if (b) b.textContent = VIEWS[cam.view]; }
  if (koda && koda.riding && koda.riding.owner !== "town") dismount();
  for (const e of enemies) scene.remove(e.a.root);
  enemies.length = 0;
  for (const h of horses.filter(h => h.owner === "enemy")) removeHorse(h);
  for (const n of npcs) scene.remove(n.a.root);
  npcs.length = 0;
  for (const d of drones) { scene.remove(d.group); scene.remove(d.light); }
  drones.length = 0;
  if (mission) for (const qd of mission.quads) {
    if (qd.orb) scene.remove(qd.orb);
    for (const t of qd.things || []) { scene.remove(t); if (t.userData && t.userData.roof) roofs.splice(roofs.indexOf(t.userData.roof), 1); }
    for (const b of (qd.blocks || []).slice()) removeBlock(qd, b);
  }
  if (zora) { scene.remove(zora.root); zora = null; }
  if (escape && escape.mesh) scene.remove(escape.mesh);
  race = null; escape = null; carrying = null; $("race").textContent = "";
  for (const id in pads) { pads[id].mat.emissive.setHex(0x000000); }
  applyTheme(null, 0, true);
}
function focusOf(m, k) { return (m.def.focus && m.def.focus[k]) || m.quads[k].q.focus; }
async function startMission(i, { showIntro = true } = {}) {
  clearMission();
  const def = S.missions[i];
  const names = def.stems && def.stems.length ? def.stems.map(s => s.name) : S.defaultParts;
  mission = {
    index: i, def, t: 0,
    quads: def.quadrants.map((id, k) => ({ q: Q(id), k, partName: names[k % names.length], done: false, seen: false, spawned: false, orb: null })),
    stats: { kos: 0, takedowns: 0, seenCount: 0, hurt: 0, onBeat: 0 }, order: [], finished: false
  };
  mission.quads.forEach((qd, k) => { qd.focus = focusOf(mission, k); pads[qd.q.id].mat.emissive.setHex(PART_COLOURS[k]).multiplyScalar(0.08); });
  health = 5; drawHearts(); drawMixer();
  $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  $("btnBoost").classList.toggle("hidden", !(save.superspeed && !def.noBoost));
  lunge = null; air = null; attackLock = 0; invuln = 0; comboStep = 0; race = null; currentQuad = null; boost.meter = 1; koda.sinking = null;
  const q0 = mission.quads[0].q, c = zoneCenter(q0);
  const spot = freeSpot(c.x, c.y + q0.d / 2 - 6);
  koda.pos.set(spot.x, groundAt(spot.x, spot.z), spot.z); koda.face(Math.PI, 1); koda.play("idle");
  lastSafe.copy(koda.pos);
  updateCamera(0, true);
  applyTheme(def.theme, 0, true);
  // Each song starts at its own time of day.
  DAY.hour = def.hour ?? [17, 21, 10, 14, 19, 22, 9, 23, 16, 13, 1, 20][mission.index % 12];
  updateDayNight(0);
  const loading = loadMissionMusic(mission);
  if (showIntro) {
    const cs = def.cutscene && S.cutscenes[def.cutscene];
    await showCard({ kicker: `MISSION ${i + 1} OF ${S.missions.length}`, title: def.song, lines: cs,
      goal: def.goal + " Each lit place on the map holds one part of the song. Unlock them in any order to build your own mix. Take your time: the song plays until it's complete.", button: "Start the mission" });
  }
  await loading;
  if (mission && mission.index === i) {
    startMusic(mission);
    setupBeat(mission);
    mission.t = 0;
    mission.limit = songLength() || 210;
  }
  tip("start");
  if (def.theme && S.tips["theme_" + def.theme]) tip("theme_" + def.theme);
  refreshObjective();
}

/* ---------- guards for a quadrant ---------- */
function spawnGuards(qd, count, { radius = [8, 16], kinds, hidden = false, alert = false, near = null } = {}) {
  const m = mission, c = zoneCenter(qd.q), r = qd.r;
  // ?enemies=guard (testing): only these kinds of enemy.
  const only = (new URLSearchParams(location.search).get("enemies") || "").split(",").filter(k => ENEMIES[k]);
  const names = only.length ? only : kinds || Object.keys(ENEMIES).filter(n => n !== "gilded");
  const made = [];
  for (let i = 0; i < count; i++) {
    const kind = names[Math.floor(r() * names.length)];
    const ang = (i / count) * Math.PI * 2 + r(), rad = radius[0] + r() * (radius[1] - radius[0]);
    const cx = near ? near.x : c.x, cz = near ? near.z : c.y;
    const route = [];
    for (let k = 0; k < 4; k++) {
      const a2 = ang + k * Math.PI / 2;
      const s = freeSpot(cx + Math.cos(a2) * rad, cz + Math.sin(a2) * rad, 0.6, r);
      route.push(new THREE.Vector3(s.x, floorAt(s.x, s.z), s.z));
    }
    // Out in the open, one of the patrol rides a horse.
    if (i === 0 && count >= 3 && !hidden && !alert && !near && kind !== "gilded" && ["explore", "rubble", "help", "pads", "race", "sneak"].includes(qd.focus) && r() < 0.6) {
      made.push(makeRider(kind, route[0].x, route[0].z, route, { qd, speed: 2.1 }).then(e => { if (mission !== m) { scene.remove(e.a.root); removeHorse(e.horse); enemies.splice(enemies.indexOf(e), 1); return null; } refreshObjective(); return e; }).catch(() => null));
      continue;
    }
    made.push(makeActor(kind + ".glb", ENEMIES[kind]).then(a => {
      if (mission !== m) return null;
      a.pos.copy(route[0]); scene.add(a.root); a.play("walk");
      const e = { a, qd, route, leg: 1, state: "patrol", meter: 0, hp: kind === "gilded" ? 5 : 3, hidden,
        cool: 0.5, hitT: 0, lastSeen: new THREE.Vector3(), searchT: 0, speed: 2 + r() * 0.5, kind, shiftT: 0 };
      enemies.push(e);
      if (alert) { e.lastSeen.copy(koda.pos); alertEnemy(e); e.searchT = 99; }
      refreshObjective();
      return e;
    }).catch(() => null));
  }
  return Promise.all(made);
}
async function spawnPerson(qd, who, x, z, line) {
  const m = mission;
  const a = await makeActor("townsfolk/" + who + ".glb", 1.65).catch(() => null);
  if (!a || mission !== m) return null;
  a.pos.set(x, floorAt(x, z), z); a.faceTo(koda.pos.x, koda.pos.z); scene.add(a.root); a.play("idle");
  const n = { a, line, qd };
  npcs.push(n);
  return n;
}
// A place in the quadrant, described the way a neighbour would.
function describeSpot(qd, x, z) {
  const c = zoneCenter(qd.q), dx = x - c.x, dz = z - c.y;
  const side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "east" : "west") : (dz > 0 ? "south" : "north");
  for (const b of nearBlocks(x, z, 0.5)) if (b.holds && SEARCHABLE[b.prop] && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return `in ${SEARCHABLE[b.prop]} on the ${side} side`;
  if (underRoof(x, z)) return `under an awning on the ${side} side`;
  let best = null, bd = 7;
  for (const b of blockers) {
    if (!b.prop) continue;
    const d = Math.hypot((b.minX + b.maxX) / 2 - x, (b.minZ + b.maxZ) / 2 - z);
    if (d < bd) { bd = d; best = b; }
  }
  const names = { barrier: "the striped barrier", crate: "the crates", bench: "the bench", dumpster: "the green dumpster", stack: "the stacked crates", bin: "the bin" };
  return best ? `near ${names[best.prop]} on the ${side} side` : `out in the open on the ${side} side`;
}
// Somewhere to hide a part: usually inside a bin, dumpster or crate stack you have to
// search; now and then it's just lying somewhere, a lucky find.
function stashSpot(qd) {
  const q = qd.q, c = zoneCenter(q);
  // Hand-placed clue spots in this place come first.
  const o = zoneOrigin(q), spots = CLUE_MADE.filter(m => !m.gone && m.rec.x > o.x && m.rec.x < o.x + q.w && m.rec.z > o.y && m.rec.z < o.y + q.d);
  if (spots.length) {
    const m = spots[Math.floor(qd.r() * spots.length)], x = m.rec.x, z = m.rec.z;
    // Inside a building he can walk into: the part waits right there, indoors.
    if (nearBlocks(x, z, 0.5).some(b => b.interior && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) return { x, z };
    return freeSpot(x, z, 1.2, qd.r);
  }
  if (qd.r() < 0.85) {
    const boxes = inBox(q.x0 + 4, q.z0 + 4, q.x0 + q.w - 4, q.z0 + q.d - 4).filter(b => SEARCHABLE[b.prop] && !b.holds && Math.hypot((b.minX + b.maxX) / 2 - c.x, (b.minZ + b.maxZ) / 2 - c.y) > 12);
    if (boxes.length) {
      const b = boxes[Math.floor(qd.r() * boxes.length)];
      b.holds = qd;
      return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, in: b };
    }
  }
  return hiddenSpot(qd);
}
// Put a part in its spot: inside a container (hidden until searched) or on the ground.
function stashPart(qd, s) {
  qd.orb = makeOrb(PART_COLOURS[qd.k]);
  qd.orb.position.set(s.x, s.in ? s.in.top : terrainAt(s.x, s.z), s.z);
  if (s.in) { qd.stash = s.in; qd.orb.visible = false; }
}
function searchNear() {
  // Search the bin, dumpster or crates Koda is standing at.
  let best = null, bd = 1.9;
  for (const b of nearBlocks(koda.pos.x, koda.pos.z, 2)) {
    if (!SEARCHABLE[b.prop]) continue;
    const d = Math.hypot(Math.max(0, b.minX - koda.pos.x, koda.pos.x - b.maxX), Math.max(0, b.minZ - koda.pos.z, koda.pos.z - b.maxZ));
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return false;
  koda.faceTo((best.minX + best.maxX) / 2, (best.minZ + best.maxZ) / 2);
  attackLock = Math.max(attackLock, koda.play(koda.has("pound") ? "pound" : "idle", { once: true, speed: 2.2 }) * 0.45 || 0.4);
  const qd = best.holds;
  if (qd && qd.stash === best && !qd.done) {
    later(0.4, () => {
      qd.stash = null; best.holds = null;
      const s = freeSpot((best.minX + best.maxX) / 2 + forward(koda).x * -1.2, (best.minZ + best.maxZ) / 2 + forward(koda).y * -1.2, 0.5);
      qd.orb.position.set(s.x, terrainAt(s.x, s.z), s.z); qd.orb.visible = true; qd.hidden = false;
      popText(`FOUND ${qd.partName.toUpperCase()}`, "good"); sfxUnlock(); refreshObjective();
    });
  } else later(0.4, () => popText(`NOTHING IN ${SEARCHABLE[best.prop].replace("the ", "").toUpperCase()}`));
  return true;
}
function hiddenSpot(qd) {
  const o = zoneOrigin(qd.q), c = zoneCenter(qd.q);
  for (let t = 0; t < 40; t++) {
    const s = freeSpot(o.x + 9 + qd.r() * (qd.q.w - 18), o.y + 9 + qd.r() * (qd.q.d - 18), 1.2, qd.r);
    if (Math.hypot(s.x - c.x, s.z - c.y) > 10) return s;
  }
  return freeSpot(c.x + 12, c.y);
}
function entrySpot(qd) {
  // Just inside the quadrant on the side Koda is coming from.
  const c = zoneCenter(qd.q), dx = koda.pos.x - c.x, dz = koda.pos.z - c.y, d = Math.hypot(dx, dz) || 1;
  const k = Math.min(qd.q.w, qd.q.d) / 2 - 10;
  return freeSpot(c.x + dx / d * k, c.y + dz / d * k, 1, qd.r);
}

/* ---------- drones with searchlights ---------- */
const drones = [];
let droneModel = null;
function loadDrone() { return droneModel || (droneModel = loadGLB(MODELS + "drone-watcher.glb").then(g => g.scene).catch(() => null)); }
const lightGeo = new THREE.CircleGeometry(2.6, 32);
async function spawnDrone(qd, idx) {
  const m = mission, o = zoneOrigin(qd.q), r = qd.r;
  const src = await loadDrone();
  if (mission !== m) return;
  const group = new THREE.Group();
  if (src) {
    const body = src.clone(true);
    const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3());
    body.scale.setScalar(1.4 / Math.max(size.x, size.y, size.z));
    group.add(body);
  } else group.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), postMat));
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.2, 24, 1, true), beamMat); cone.position.y = -2.6;
  group.add(cone);
  const lmat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35, depthWrite: false });
  const light = new THREE.Mesh(lightGeo, lmat); light.rotation.x = -Math.PI / 2;
  scene.add(group); scene.add(light);
  const route = [];
  const inset = 8 + idx * 5;
  const zw = qd.q.w, zd = qd.q.d;
  for (const [px, pz] of [[inset, inset], [zw - inset, inset], [zw - inset, zd - inset], [inset, zd - inset]]) route.push(new THREE.Vector2(o.x + px, o.y + pz));
  if (idx % 2) route.reverse();
  const start = route[Math.floor(r() * 4)];
  drones.push({ qd, group, light, lmat, beamMat, cone, route, leg: 0, x: start.x, z: start.y, meter: 0, spotted: 0, pulse: 0, speed: 3 + idx * 0.4 });
}
function updateDrones(dt, now) {
  for (const d of drones) {
    const tgt = d.route[d.leg];
    const dx = tgt.x - d.x, dz = tgt.y - d.z, dd = Math.hypot(dx, dz);
    if (d.spotted > 0) d.spotted -= dt;
    else if (dd < 0.5) d.leg = (d.leg + 1) % d.route.length;
    else { d.x += dx / dd * d.speed * dt; d.z += dz / dd * d.speed * dt; }
    // Drones fly over the rooftops, never through them: they climb ahead of anything tall.
    let roof = terrainAt(d.x, d.z) + 5.2;
    for (const b of nearBlocks(d.x, d.z, 4)) if (!b.mud && b !== RIDGE) roof = Math.max(roof, b.top + 3);
    d.alt = d.alt === undefined ? roof : d.alt + (roof - d.alt) * Math.min(1, dt * (roof > d.alt ? 4 : 1.2));
    d.group.position.set(d.x, d.alt + Math.sin(now / 500 + d.leg) * 0.15, d.z);
    d.group.rotation.y += dt * 0.8;
    d.pulse = Math.max(0, d.pulse - dt * 4);
    const s = 1 + d.pulse * 0.12;
    d.light.position.set(d.x, terrainAt(d.x, d.z) + 0.06, d.z); d.light.scale.set(s, s, 1);
    if (d.qd.done) { d.lmat.opacity = 0.12; d.lmat.color.setHex(0x9fd3ff); continue; }
    // Caught in the light, out in the open: the meter fills.
    const inLight = Math.hypot(koda.pos.x - d.x, koda.pos.z - d.z) < 2.6 * s && !underRoof(koda.pos.x, koda.pos.z) && kUp() < 2.6;
    d.meter = clamp(d.meter + (inLight ? dt * 2.4 : -dt), 0, 1);
    const red = d.spotted > 0 || d.meter > 0.5;
    d.lmat.color.setHex(red ? 0xff5a46 : 0xfff1a8); d.beamMat.color.setHex(red ? 0xff5a46 : 0xfff1a8);
    d.lmat.opacity = 0.3 + d.meter * 0.4;
    if (d.meter >= 1 && d.spotted <= 0) {
      d.spotted = 2; d.meter = 0;
      popText("SPOTTED", "bad");
      // The drone calls the nearest guards to where it saw him.
      const near = enemies.filter(e => e.state !== "ko" && dist2(e.a.pos, koda.pos) < 20).sort((a, b) => dist2(a.a.pos, koda.pos) - dist2(b.a.pos, koda.pos)).slice(0, 2);
      for (const e of near) { e.lastSeen.copy(koda.pos); alertEnemy(e); e.searchT = 6; }
      if (!near.length) seenIn(d.qd);
    }
  }
}
function seenIn(qd) {
  if (!qd || qd.done) return;
  if (!qd.seen) mission.stats.seenCount++;
  qd.seen = true;
  // Seen while sneaking: the part moves somewhere else.
  if (qd.focus === "sneak" && qd.orb && !qd.moved) {
    qd.moved = true;
    if (qd.stash) { qd.stash.holds = null; qd.stash = null; }
    scene.remove(qd.orb);
    stashPart(qd, stashSpot(qd));
    toast(`They saw you. ${qd.partName} has moved.`, 3);
  }
}

/* ---------- each kind of quadrant ---------- */
const arenaMat = new THREE.MeshStandardMaterial({ color: 0x3a2430, roughness: 0.6, metalness: 0.5, emissive: 0x401010, emissiveIntensity: 0.4 });
// Rooftops: weathered concrete with a dark ledge, so each one reads as a building top.
const roofTopMat = (() => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#6d675f"; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 64, Math.random() * 64, 3, 3); }
  g.strokeStyle = "#2b2824"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.strokeStyle = "rgba(242,181,68,.55)"; g.lineWidth = 2; g.strokeRect(8, 8, 48, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
})();
const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 1 });
const cartMat = new THREE.MeshStandardMaterial({ color: 0x3d5a6b, roughness: 0.6, metalness: 0.4 });
const skipMat = new THREE.MeshStandardMaterial({ color: 0xd9a21a, roughness: 0.7, metalness: 0.3 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
// A builder's barrow: a tray on a wheel with two handles. It shows what's in it.
function makeCart(x, z) {
  const group = new THREE.Group();
  const tray = new THREE.Mesh(propGeo, cartMat); tray.scale.set(0.9, 0.45, 1.2); tray.position.set(0, 0.6, 0.1); tray.castShadow = true; group.add(tray);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 16), tyreMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(0, 0.28, 0.75); wheel.castShadow = true; group.add(wheel);
  for (const sx of [-0.35, 0.35]) {
    const h = new THREE.Mesh(propGeo, postMat); h.scale.set(0.06, 0.06, 1.1); h.position.set(sx, 0.92, -0.72); h.rotation.x = -0.45; group.add(h);
    const leg = new THREE.Mesh(propGeo, postMat); leg.scale.set(0.06, 0.45, 0.06); leg.position.set(sx, 0.22, -0.3); group.add(leg);
  }
  const load = new THREE.Group(); group.add(load);
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(propGeo, rubbleMat); const sz = 0.25 + Math.random() * 0.2; m.scale.set(sz, sz, sz); m.position.set((Math.random() - 0.5) * 0.55, 0.85 + (k >> 1) * 0.08, (Math.random() - 0.5) * 0.8 + 0.1); m.rotation.set(Math.random(), Math.random() * 3, Math.random()); m.castShadow = true; load.add(m); }
  scene.add(group);
  // The wooden hand cart from the F.I.L.L. kit replaces the plain shapes once it's loaded.
  staticModel("handcart").then(src => {
    if (!src) return;
    const m = src.clone(true), box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
    m.scale.setScalar(2.2 / Math.max(sz.x, sz.z)); m.rotation.y = sz.x > sz.z ? Math.PI / 2 : 0;
    const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3()); m.position.set(-c.x, -b2.min.y, -c.z + 0.1);
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    for (const o of group.children.slice()) if (o !== load) o.visible = false;
    group.add(m); load.position.y = 0.05;
  });
  const cart = { group, x, z, yaw: 0, loads: 0,
    place() { group.position.set(cart.x, terrainAt(cart.x, cart.z), cart.z); group.rotation.y = cart.yaw; },
    roll(d) { wheel.rotation.x += d / 0.28; },
    refresh() { load.children.forEach((m, i) => { m.visible = i < cart.loads * 2; }); } };
  cart.place(); cart.refresh();
  return cart;
}
// A yellow skip to tip the rubble into. It fills up as you dump.
function makeSkip(x, z) {
  const group = new THREE.Group();
  const add = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(propGeo, skipMat); m.scale.set(w, h, d); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; group.add(m); };
  add(3.2, 0.15, 2.0, 0, 0.1, 0); add(3.2, 1.4, 0.12, 0, 0.8, 0.95); add(3.2, 1.4, 0.12, 0, 0.8, -0.95); add(0.12, 1.4, 2.0, 1.55, 0.8, 0); add(0.12, 1.4, 2.0, -1.55, 0.8, 0);
  const heap = new THREE.Mesh(propGeo, rubbleMat); heap.scale.set(2.9, 0.01, 1.7); heap.position.y = 0.2; group.add(heap);
  group.position.set(x, terrainAt(x, z), z); scene.add(group);
  return { group, x, z, fill(n) { const h = Math.min(1.2, n * 0.14); heap.scale.y = Math.max(0.01, h); heap.position.y = 0.2 + h / 2; } };
}
const padColours = [0xff5a46, 0x5ad1ff, 0xf2b544, 0x7fe39a, 0xd58cff, 0xffffff, 0xff9ad5];
let carrying = null;

const FOCUS = {
  /* Find the part from a townsperson's clue. It doesn't glow until you're close, and
     its part of the song gets louder as you get near it. */
  explore: {
    spawn(qd) {
      const s = stashSpot(qd);
      stashPart(qd, s); qd.hidden = true;
      qd.clue = describeSpot(qd, s.x, s.z);
      const e = entrySpot(qd);
      spawnPerson(qd, TOWNSFOLK[Math.floor(qd.r() * TOWNSFOLK.length)], e.x, e.z,
        `I saw something glowing ${qd.clue}. Listen. You'll hear it before you see it.`).then(n => { if (n) { n.clue = true; qd.giver = n; } });
      if (!mission.def.calm) spawnGuards(qd, 2);
    },
    talk(qd, n) { qd.talked = true; setObjective(`Search ${qd.clue}. Follow the music.`); },
    target(qd) {
      if (!qd.talked && qd.giver) return { x: qd.giver.a.pos.x, z: qd.giver.a.pos.z, label: "TALK TO HIM" };
      if (qd.orb && dist2(koda.pos, qd.orb.position) < 7) return { x: qd.orb.position.x, z: qd.orb.position.z, label: qd.stash ? "SEARCH " + SEARCHABLE[qd.stash.prop].replace("the ", "").toUpperCase() : "GRAB " + qd.partName.toUpperCase() };
      if (qd.talked) return { x: qd.orb.position.x + qd.fx, z: qd.orb.position.z + qd.fz, label: "SEARCH AROUND HERE", rough: true };
      return null;
    },
    objective(qd) { return qd.talked ? `Search ${qd.clue}. Follow the music.` : `Ask around in ${qd.q.name}. Someone saw ${qd.partName}.`; }
  },

  /* Reach the part unseen: drones with searchlights, guards, tall cover and awnings. */
  sneak: {
    spawn(qd) {
      const s = stashSpot(qd);
      stashPart(qd, s);
      const o = zoneOrigin(qd.q);
      for (let i = 0; i < 4; i++) {
        const x = o.x + 10 + qd.r() * (qd.q.w - 20), z = o.y + 10 + qd.r() * (qd.q.d - 20);
        if (!blocked(x, z, 2.2)) addBlock(qd, Object.assign(boxBlock(x, z, 1.3, 1.3, 2.1, PROPS[4].mat), { prop: "stack" }));
      }
      for (let i = 0; i < 2; i++) { const a = addAwning(o.x + 12 + qd.r() * (qd.q.w - 24), o.y + 12 + qd.r() * (qd.q.d - 24)); if (a) { a.group.userData.roof = a; own(qd, a.group); } }
      const drones = mission.def.noDrones ? 0 : 2 + (mission.index >= 5 ? 1 : 0);
      for (let i = 0; i < drones; i++) spawnDrone(qd, i);
      spawnGuards(qd, 2 + Math.floor(mission.index / 5));
    },
    target(qd) { return qd.orb ? { x: qd.orb.position.x, z: qd.orb.position.z, label: qd.stash && dist2(koda.pos, qd.orb.position) < 7 ? "SEARCH " + SEARCHABLE[qd.stash.prop].replace("the ", "").toUpperCase() : "SNEAK TO " + qd.partName.toUpperCase() } : null; },
    objective(qd) { return `Sneak to ${qd.partName}. Stay out of the searchlights. Hide under the awnings.`; }
  },

  /* An arena. Walk in, the gate shuts, waves of guards come. The part drops after the last. */
  fight: {
    spawn(qd) {
      const c = zoneCenter(qd.q);
      qd.arena = { x: c.x, z: c.y, r: 10, wave: 0, waves: 2 + (mission.index >= 5 ? 1 : 0), open: true, started: false };
      const ring = new THREE.Mesh(new THREE.RingGeometry(9.6, 10, 64), new THREE.MeshBasicMaterial({ color: 0xff5a46, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, terrainAt(c.x, c.y) + 0.05, c.y); own(qd, ring);
    },
    update(qd, dt) {
      const A = qd.arena; if (!A || qd.done) return;
      const d = Math.hypot(koda.pos.x - A.x, koda.pos.z - A.z);
      if (!A.started && d < 8) {
        A.started = true; A.open = false; A.walls = [];
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2, x = A.x + Math.cos(a) * A.r, z = A.z + Math.sin(a) * A.r;
          A.walls.push(addBlock(qd, boxBlock(x, z, 3.3, 3.3, 2.4, arenaMat, false)));
        }
        toast("The gate is shut. Fight!", 2.5); tip("fight");
        // The camera swings round behind Koda for the fight, close in, inside the ring.
        if (cam.view !== 1) { const was = cam.view; setView(1, true); arenaView = was; }
        this.wave(qd);
      }
      // Nobody fights from inside the wall: a guard pushed, knocked or spawned out past the ring
      // is put back inside it, where Koda can reach him.
      if (A.started && !A.open) for (const e of enemies) {
        if (e.qd !== qd || e.state === "ko") continue;
        const dx = e.a.pos.x - A.x, dz = e.a.pos.z - A.z, dd = Math.hypot(dx, dz), lim = A.r - 1.4;
        if (dd > lim) { const k = (lim - 0.3) / (dd || 1); e.a.pos.x = A.x + dx * k; e.a.pos.z = A.z + dz * k; e.a.pos.y = floorAt(e.a.pos.x, e.a.pos.z); }
        for (const p of e.route || []) { const px = p.x - A.x, pz = p.z - A.z, pd = Math.hypot(px, pz); if (pd > lim) { p.x = A.x + px * (lim - 1) / pd; p.z = A.z + pz * (lim - 1) / pd; } }
      }
      if (A.started && !A.open && A.spawning === false && enemies.filter(e => e.qd === qd && e.state !== "ko").length === 0) {
        if (A.wave < A.waves) { A.spawning = true; later(1.4, () => this.wave(qd)); toast(`Wave ${A.wave + 1} of ${A.waves}`, 1.6); }
        else {
          A.open = true;
          for (const w of A.walls) removeBlock(qd, w);
          qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(A.x, terrainAt(A.x, A.z), A.z);
          toast(`The gate opens. Grab ${qd.partName}!`, 3);
          if (arenaView !== null) setView(arenaView, true);
          arenaView = null;
          refreshObjective();
        }
      }
    },
    wave(qd) {
      const A = qd.arena; A.spawning = true; A.wave++;
      const n = 2 + A.wave - 1 + Math.floor(mission.index / 5);
      const kinds = A.wave === A.waves && mission.index >= 2 ? ["gilded", "handler"] : null;
      spawnGuards(qd, n, { radius: [3, 6], near: { x: A.x, z: A.z }, alert: true, kinds }).then(() => { A.spawning = false; refreshObjective(); });
    },
    reset(qd) {
      const A = qd.arena; if (!A || A.open) return;
      for (const e of enemies.filter(e => e.qd === qd)) { scene.remove(e.a.root); enemies.splice(enemies.indexOf(e), 1); }
      for (const w of A.walls) removeBlock(qd, w);
      Object.assign(A, { wave: 0, open: true, started: false, spawning: undefined });
    },
    target(qd) {
      const A = qd.arena;
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      if (!A.started) return { x: A.x, z: A.z, label: "ENTER THE ARENA" };
      const e = enemies.find(x => x.qd === qd && x.state !== "ko");
      return e ? { x: e.a.pos.x, z: e.a.pos.z, label: `BEAT HIM (WAVE ${A.wave}/${A.waves})` } : null;
    },
    objective(qd) {
      const A = qd.arena;
      if (!A.started) return `Walk into the arena in ${qd.q.name}. Hit on the beat for double damage.`;
      if (!A.open) return `Survive the waves (${A.wave}/${A.waves}). Hit on the beat for double damage.`;
      return `Grab ${qd.partName}.`;
    }
  },

  /* A rooftop course. Reach each checkpoint before the song moves into its next section. */
  race: {
    spawn(qd) {
      const c = zoneCenter(qd.q);
      const dir = koda.pos.z > c.y ? 1 : -1;   // start on the side Koda comes from
      const course = [[0, 14, 0.9, 2.6], [0, 10, 1.8, 3], [1.5, 6, 1.8, 3], [1.5, 2, 2.4, 3], [-1, -3.5, 2.4, 3], [-1, -7.5, 1.8, 3], [0.5, -11.5, 1.8, 3], [0.5, -15.5, 0.9, 2.6]];
      // The course is built from real things: shipping containers to run along and leap between,
      // crates for the low steps.
      qd.course = course.map(([x, z, h, s], i) => {
        const b = addBlock(qd, boxBlock(c.x + x, c.y + z * dir, s, s, h, h < 1 ? PROPS[1].mat : roofTopMat));
        if (h >= 1) staticModel("container").then(src => {
          if (!src || !b.mesh || !b.mesh.parent) return;
          const m = src.clone(true), box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
          m.scale.set(s / sz.x, h / sz.y, s / sz.z); if (i % 2) m.rotation.y = Math.PI / 2;
          const b2 = new THREE.Box3().setFromObject(m), cc = b2.getCenter(new THREE.Vector3());
          m.position.set(b.mesh.position.x - cc.x, b.base - b2.min.y, b.mesh.position.z - cc.z);
          m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          b.mesh.visible = false; own(qd, m);
        });
        return { x: c.x + x, z: c.y + z * dir, top: b.top };
      });
      qd.start = freeSpot(c.x, c.y + 18.5 * dir, 1);
      qd.ring = ringAt(qd.start.x, qd.start.z, 1.8); own(qd, qd.ring);
      qd.cps = [2, 4, 6].map(i => { const p = qd.course[i]; const r = ringAt(p.x, p.z, 1.3, p.top); r.visible = false; own(qd, r); return { ...p, ring: r }; });
      qd.cp = 0;
    },
    update(qd, dt) {
      if (qd.done) return;
      if (!race && qd.ring.visible && dist2(koda.pos, qd.ring.position) < 1.9) {
        qd.ring.visible = false; qd.cp = 0;
        race = { qd, deadline: songClock() + (nextSection(songTime() + 10) - songTime()) };
        qd.cps[0].ring.visible = true;
        toast("Go! Reach the first rooftop ring before the song changes.", 2.5); tip("race");
        refreshObjective();
      }
      if (!race || race.qd !== qd) return;
      const left = race.deadline - songClock();
      $("race").textContent = Math.max(0, left).toFixed(1);
      const cp = qd.cps[qd.cp];
      if (cp && Math.hypot(koda.pos.x - cp.x, koda.pos.z - cp.z) < 1.5 && Math.abs(koda.pos.y - cp.top) < 0.6) {
        cp.ring.visible = false; qd.cp++; sfxUnlock();
        race.deadline = songClock() + (nextSection(songTime() + 7) - songTime());
        if (qd.cp < qd.cps.length) { qd.cps[qd.cp].ring.visible = true; popText("CHECKPOINT"); }
        else {
          const last = qd.course[qd.course.length - 1];
          qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(last.x, last.top, last.z);
          popText("LAST ONE");
        }
        refreshObjective();
      }
      if (left <= 0) {
        race = null; $("race").textContent = "";
        for (const c of qd.cps) c.ring.visible = false;
        if (qd.orb) { scene.remove(qd.orb); qd.orb = null; }
        qd.ring.visible = true;
        toast("The song moved on. Back to the start ring.", 3);
        refreshObjective();
      }
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      if (race && race.qd === qd) { const cp = qd.cps[qd.cp]; return cp ? { x: cp.x, z: cp.z, label: "CHECKPOINT" } : null; }
      return { x: qd.ring.position.x, z: qd.ring.position.z, label: "START THE RACE" };
    },
    objective(qd) {
      if (race && race.qd === qd) return `Over the rooftops: reach each ring before the song moves on (${qd.cp}/${qd.cps.length}).`;
      return `Step into the gold ring to race over the rooftops of ${qd.q.name}.`;
    }
  },

  /* Put It On Me: rubble from the Veil coming down. Wheel the cart to a pile, load it up
     (hold ACTION by the pile), push it to the skip and tip it out (ACTION by the skip).
     Tap ACTION by the cart's handle to take hold of it or let go. People help you load. */
  rubble: {
    spawn(qd) {
      const c = zoneCenter(qd.q);
      qd.piles = [];
      for (let i = 0; i < 3; i++) {
        const a = qd.r() * Math.PI * 2, rad = 6 + qd.r() * 8;
        const x = c.x + Math.cos(a) * rad, z = c.y + Math.sin(a) * rad;
        if (blocked(x, z, 2.2)) continue;
        const group = new THREE.Group();
        for (let k = 0; k < 7; k++) {
          const m = new THREE.Mesh(propGeo, rubbleMat);
          const sz = 0.6 + qd.r() * 1.1; m.scale.set(sz, sz * 0.7, sz);
          m.position.set((qd.r() - 0.5) * 2, sz * 0.3, (qd.r() - 0.5) * 2); m.rotation.set(qd.r(), qd.r() * 3, qd.r());
          m.castShadow = true; group.add(m);
        }
        // A street light or traffic light the Veil brought down, lying across the pile.
        staticModel(i % 2 ? "trafficfall" : "lampfall").then(src => {
          if (!src) return;
          const m = src.clone(true), bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3());
          m.scale.setScalar(4.5 / Math.max(sz.x, sz.y, sz.z)); m.rotation.set(0, qd.r() * 6, 0);
          const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3()); m.position.set(-c.x, -b2.min.y - 0.2, -c.z);
          m.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(m);
        });
        group.position.set(x, terrainAt(x, z), z);
        const b = addBlock(qd, { minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4, top: 1.3, walk: true, mesh: group, mats: [] });
        qd.piles.push({ x, z, b, loads: 3, total: 3, dig: 0 });
      }
      // The cart, by the first pile, and the skip a walk away across the square.
      const p0 = qd.piles[0] || { x: c.x, z: c.y };
      const cs = freeSpot(p0.x + 3.5, p0.z, 1.2, qd.r);
      qd.cart = makeCart(cs.x, cs.z); own(qd, qd.cart.group);
      const ang = Math.atan2(p0.z - c.y, p0.x - c.x) + Math.PI;
      const ss = freeSpot(c.x + Math.cos(ang) * 16, c.y + Math.sin(ang) * 16, 2, qd.r);
      qd.skip = makeSkip(ss.x, ss.z); own(qd, qd.skip.group);
      qd.skip.b = addBlock(qd, { minX: ss.x - 1.6, maxX: ss.x + 1.6, minZ: ss.z - 1.1, maxZ: ss.z + 1.1, top: 1.5, mats: [] });
      const helper = freeSpot(c.x + 3, c.y + 3, 1, qd.r);
      spawnPerson(qd, TOWNSFOLK[Math.floor(qd.r() * TOWNSFOLK.length)], helper.x, helper.z, "We've been digging since the Veil came down. Bring the cart over and I'll load with you.").then(n => { if (n) qd.helper = n; });
      if (!mission.def.calm) spawnGuards(qd, 1);
    },
    // ACTION taps: take or let go of the cart, tip it into the skip.
    tap(qd) {
      const cart = qd.cart; if (!cart || qd.done) return false;
      if (qd.skip && cart.loads > 0 && Math.hypot(cart.x - qd.skip.x, cart.z - qd.skip.z) < 4.2 && Math.hypot(koda.pos.x - qd.skip.x, koda.pos.z - qd.skip.z) < 5) {
        qd.dumped += cart.loads; cart.loads = 0; cart.refresh(); qd.skip.fill(qd.dumped); sfxHit(true); popText("DUMPED");
        this.checkDone(qd); refreshObjective(); return true;
      }
      if (koda.pushing === cart) { koda.pushing = null; popText("LET GO"); refreshObjective(); return true; }
      // Standing at the cart (nearer it than any pile), ACTION takes hold of it; at a pile it's for loading.
      const dc = Math.hypot(koda.pos.x - cart.x, koda.pos.z - cart.z);
      const dp = Math.min(99, ...qd.piles.filter(p => p.loads > 0).map(p => Math.hypot(koda.pos.x - p.x, koda.pos.z - p.z)));
      if (dc < 2.2 && (dc < dp - 0.3 || cart.loads >= 3)) { koda.pushing = cart; popText("PUSH"); refreshObjective(); return true; }
      return false;
    },
    checkDone(qd) {
      const left = qd.piles.reduce((a, p) => a + p.loads, 0);
      if (left === 0 && qd.cart.loads === 0 && !qd.orb) {
        const p = qd.piles[qd.piles.length - 1];
        qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(p.x, terrainAt(p.x, p.z), p.z);
        koda.pushing = null;
        toast(`The way is clear. ${qd.partName} was under there!`, 3);
      }
    },
    update(qd, dt) {
      if (qd.done || !qd.piles) return;
      qd.dumped = qd.dumped || 0;
      const cart = qd.cart;
      // Pushing: the cart rolls just ahead of him and goes where he goes.
      if (cart && koda.pushing === cart && Math.hypot(koda.pos.x - cart.x, koda.pos.z - cart.z) > 3) koda.pushing = null;   // too far away: he's let go
      if (cart && koda.pushing === cart) {
        const f = forward(koda), tx = koda.pos.x + f.x * 1.05, tz = koda.pos.z + f.y * 1.05;
        const before = { x: cart.x, z: cart.z };
        const pos = { x: cart.x, y: terrainAt(cart.x, cart.z), z: cart.z };
        moveWithCollision(pos, tx - cart.x, tz - cart.z, 0.7);
        cart.x = pos.x; cart.z = pos.z;
        // Stuck against something: he can't walk through it either.
        const sx = tx - cart.x, sz = tz - cart.z, sd = Math.hypot(sx, sz);
        if (sd > 0.6) { const k = Math.min(sd, 0.5) / sd * 0.6; moveWithCollision(koda.pos, -sx * k, -sz * k, 0.45, true); }
        cart.yaw = koda.yaw; cart.place();
        if (Math.hypot(cart.x - before.x, cart.z - before.z) > 0.001) cart.roll(Math.hypot(cart.x - before.x, cart.z - before.z));
      }
      const p = qd.piles.find(p => p.loads > 0 && Math.hypot(koda.pos.x - p.x, koda.pos.z - p.z) < 2.8);
      qd.near = p;
      if (p && input.actionHeld && !air && !koda.pushing) {
        const cartNear = cart && Math.hypot(cart.x - p.x, cart.z - p.z) < 4.5;
        if (!cartNear) { if (!qd.warned) { popText("BRING THE CART"); qd.warned = 1.5; } }
        else if (cart.loads >= 3) { if (!qd.warned) { popText("CART FULL: TIP IT IN THE SKIP"); qd.warned = 1.5; } }
        else {
          const helped = qd.helper && dist2(qd.helper.a.pos, koda.pos) < 8;
          if (helped) { qd.helper.a.play(qd.helper.a.has("cheer") ? "cheer" : "idle"); qd.helper.a.faceTo(p.x, p.z); }
          koda.faceTo(p.x, p.z); koda.play(koda.has("pound") ? "pound" : "punch");
          p.dig += dt / (helped ? 1.2 : 1.8);
          if (p.dig >= 1) {
            p.dig = 0; p.loads--; cart.loads++; cart.refresh(); sfxHit(false); popText("+1 LOAD");
            p.b.mesh.scale.setScalar(0.35 + 0.65 * p.loads / p.total);
            if (p.loads <= 0) { removeBlock(qd, p.b); popText("PILE CLEARED"); }
            refreshObjective();
          }
        }
      }
      if (qd.warned) qd.warned = Math.max(0, qd.warned - dt) || 0;
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      const cart = qd.cart; if (!cart) return null;
      const p = (qd.piles || []).find(p => p.loads > 0);
      if (cart.loads >= 3 || (!p && cart.loads > 0)) return koda.pushing === cart ? { x: qd.skip.x, z: qd.skip.z, label: "PUSH TO THE SKIP, ACTION TO TIP" } : { x: cart.x, z: cart.z, label: "ACTION: TAKE THE CART" };
      if (!p) return null;
      if (Math.hypot(cart.x - p.x, cart.z - p.z) >= 4.5) return koda.pushing === cart ? { x: p.x, z: p.z, label: "PUSH THE CART TO THE PILE" } : { x: cart.x, z: cart.z, label: "ACTION: TAKE THE CART" };
      if (koda.pushing === cart) return { x: p.x, z: p.z, label: "ACTION: LET GO, THEN HOLD ACTION TO LOAD" };
      return { x: p.x, z: p.z, label: qd.near === p && input.actionHeld ? `LOADING ${Math.round(p.dig * 100)}%` : `HOLD ACTION TO LOAD (CART ${cart.loads}/3)` };
    },
    objective(qd) {
      const left = (qd.piles || []).reduce((a, p) => a + p.loads, 0);
      return left || (qd.cart && qd.cart.loads) ? `Clear the rubble in ${qd.q.name}: wheel the cart to a pile, load it, push it to the skip and tip it out (${left} loads left).` : `Grab ${qd.partName}.`;
    }
  },

  /* To My Angels: people ask for help. Fetch what they need; they give you the part. */
  help: {
    spawn(qd) {
      const e = entrySpot(qd);
      const who = mission.quads.indexOf(qd) === 0 ? "koda_brother" : TOWNSFOLK[Math.floor(qd.r() * TOWNSFOLK.length)];
      const ask = who === "koda_brother"
        ? "Koda. I heard about Zora. I hid some of her things by the old crates for you. Bring the box here, I'll keep it safe."
        : "Our parcel came down with the Veil. Bring it back to me and I'll tell you what I know.";
      spawnPerson(qd, who, e.x, e.z, ask).then(n => { if (n) { n.help = true; qd.giver = n; if (who === "koda_brother") n.name = "Brother"; } });
      const s = hiddenSpot(qd);
      const box = new THREE.Group();
      const m = new THREE.Mesh(propGeo, PROPS[1].mat); m.scale.set(0.6, 0.45, 0.6); m.position.y = 0.23; m.castShadow = true; box.add(m);
      box.position.set(s.x, terrainAt(s.x, s.z), s.z); box.visible = false; own(qd, box);
      qd.parcel = box; qd.parcelSpot = describeSpot(qd, s.x, s.z);
    },
    talk(qd, n) {
      if (!qd.asked) { qd.asked = true; qd.parcel.visible = true; qd.parcelRing = own(qd, ringAt(qd.parcel.position.x, qd.parcel.position.z, 1)); setObjective(`Fetch the box ${qd.parcelSpot}.`); return; }
      if (carrying === qd.parcel) {
        carrying = null; scene.remove(qd.parcel); koda.root.remove(qd.parcel);
        qd.orb = makeOrb(PART_COLOURS[qd.k]); const s = freeSpot(n.a.pos.x + 1.5, n.a.pos.z, 0.6); qd.orb.position.set(s.x, terrainAt(s.x, s.z), s.z);
        n.a.play(n.a.has("cheer") ? "cheer" : "idle");
        toast(`"Thank you. Here. They dropped this when they took her."`, 3.5);
      }
    },
    update(qd) {
      if (qd.asked && carrying !== qd.parcel && !qd.orb && !qd.done && qd.parcel.parent === scene && dist2(koda.pos, qd.parcel.position) < 1.3) {
        carrying = qd.parcel; scene.remove(qd.parcelRing);
        koda.root.add(qd.parcel); qd.parcel.position.set(0, 1.65, -0.2);
        toast("Got it. Take it back.", 2);
        refreshObjective();
      }
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "TAKE " + qd.partName.toUpperCase() };
      if (!qd.giver) return null;
      if (!qd.asked) return { x: qd.giver.a.pos.x, z: qd.giver.a.pos.z, label: "TALK" };
      if (carrying === qd.parcel) return { x: qd.giver.a.pos.x, z: qd.giver.a.pos.z, label: "BRING IT BACK" };
      return { x: qd.parcel.position.x, z: qd.parcel.position.z, label: "THE BOX" };
    },
    objective(qd) { return !qd.asked ? `Someone in ${qd.q.name} needs a hand.` : carrying === qd.parcel ? "Take the box back." : `Fetch the box ${qd.parcelSpot}.`; }
  },

  /* Not at All: the patrols can't be seen. A neighbour shows you their routes, briefly. */
  blind: {
    spawn(qd) {
      const s = hiddenSpot(qd);
      qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(s.x, terrainAt(s.x, s.z), s.z);
      const e = entrySpot(qd);
      spawnPerson(qd, TOWNSFOLK[Math.floor(qd.r() * TOWNSFOLK.length)], e.x, e.z, "You can't see them, but they're here. Look quick, I'll show you where they walk.").then(n => { if (n) { n.reveal = true; qd.giver = n; } });
      spawnGuards(qd, 3 + Math.floor(mission.index / 6), { hidden: true });
    },
    talk(qd) {
      qd.revealT = 6; qd.talked = true;
      for (const e of enemies.filter(e => e.qd === qd)) {
        const pts = e.route.concat([e.route[0]]).map(p => new THREE.Vector3(p.x, p.y + 0.08, p.z));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.9 }));
        line.computeLineDistances(); own(qd, line); (qd.chalk || (qd.chalk = [])).push(line);
      }
      toast("Remember their routes. They vanish in a moment.", 3);
    },
    update(qd, dt) {
      if (qd.revealT > 0 && (qd.revealT -= dt) <= 0) for (const l of qd.chalk || []) l.visible = false;
    },
    target(qd) {
      if (!qd.talked && qd.giver) return { x: qd.giver.a.pos.x, z: qd.giver.a.pos.z, label: "ASK THE NEIGHBOUR" };
      return qd.orb ? { x: qd.orb.position.x, z: qd.orb.position.z, label: qd.partName.toUpperCase() } : null;
    },
    objective(qd) { return qd.talked ? `Get to ${qd.partName} without walking into the patrols.` : `The patrols here can't be seen. Find the neighbour who knows their routes.`; }
  },

  /* Can't Copy You: four Zoras, one real. She hums her tune in tune; the copies don't. */
  copies: {
    spawn(qd) {
      const c = zoneCenter(qd.q), m = mission;
      qd.motif = m.def.motif || [0, 4, 7, 9, 7];
      qd.real = Math.floor(qd.r() * 4);
      qd.zoras = [];
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4, s = freeSpot(c.x + Math.cos(a) * 5, c.y + Math.sin(a) * 5, 0.8);
        makeActor("zora.glb", 1.58).then(z => {
          if (mission !== m) return;
          z.pos.set(s.x, 0, s.z); z.face(a, 1); scene.add(z.root); z.play("idle");
          own(qd, z.root); qd.zoras.push({ z, i, gone: false });
        }).catch(() => {});
      }
    },
    hum(qd, zi) {
      const real = zi === qd.real;
      qd.motif.forEach((n, k) => playNote(n + 12, 0.32, "sine", 0.18, real ? 0 : (k % 2 ? 60 : -45), k * beat.spb * 0.5));
    },
    update(qd, dt) {
      for (const zz of qd.zoras || []) if (!zz.gone) zz.z.update(dt);
      if (qd.done) return;
      const c = zoneCenter(qd.q);
      if (!qd.heard && Math.hypot(koda.pos.x - c.x, koda.pos.z - c.y) < 13) {
        qd.heard = true;
        qd.motif.forEach((n, k) => playNote(n + 12, 0.32, "sine", 0.2, 0, 0.3 + k * beat.spb * 0.5));
        toast("Her tune. Only the real Zora hums it in tune.", 3.5); tip("copies");
      }
    },
    talkZora(qd, zz) {
      if (qd.listened !== zz) { qd.listened = zz; this.hum(qd, zz.i); popText("LISTEN"); return; }
      if (zz.i === qd.real) {
        for (const o of qd.zoras) if (o !== zz) { o.gone = true; o.z.root.visible = false; }
        qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(zz.z.pos.x + 1.2, terrainAt(zz.z.pos.x + 1.2, zz.z.pos.z), zz.z.pos.z);
        zz.z.root.visible = false; zz.gone = true;
        toast(`It was her, for a moment. She left ${qd.partName} behind.`, 3.5);
      } else {
        zz.gone = true; zz.z.root.visible = false; sfxBuzz(); popText("A COPY", "bad");
        spawnGuards(qd, 1, { radius: [3, 5], alert: true, near: { x: zz.z.pos.x, z: zz.z.pos.z } });
      }
      qd.listened = null;
      refreshObjective();
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      const left = (qd.zoras || []).filter(z => !z.gone);
      const near = left.sort((a, b) => dist2(a.z.pos, koda.pos) - dist2(b.z.pos, koda.pos))[0];
      if (!near) { const c = zoneCenter(qd.q); return { x: c.x, z: c.y, label: "ZORA?" }; }
      return { x: near.z.pos.x, z: near.z.pos.z, label: qd.listened === near ? "TAKE HER HAND (ACTION)" : "LISTEN (ACTION)" };
    },
    objective(qd) { return `Four Zoras. Press ACTION by one to hear her hum, again to take her hand. Only one hums in tune.`; }
  },

  /* Music puzzles: watch the pads light up with the melody, then step on them in order. */
  pads: {
    spawn(qd) { buildPads(qd, 4, "pads"); },
    update(qd, dt) { updatePads(qd, dt); },
    target(qd) { return padTarget(qd); },
    objective(qd) { return padObjective(qd); }
  },
  piano: {
    spawn(qd) { buildPads(qd, 7, "piano"); },
    update(qd, dt) { updatePads(qd, dt); },
    target(qd) { return padTarget(qd); },
    objective(qd) { return padObjective(qd); }
  },

  /* Thinking of You: chase the thing that took her through the dark water. */
  chase: {
    async spawn(qd) {
      const m = mission, c = zoneCenter(qd.q), src = await loadDrone();
      if (mission !== m) return;
      const g = new THREE.Group();
      if (src) {
        const b = src.clone(true); const box = new THREE.Box3().setFromObject(b), sz = box.getSize(new THREE.Vector3());
        b.scale.setScalar(2.2 / Math.max(sz.x, sz.y, sz.z));
        b.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color && o.material.color.multiplyScalar(0.25); o.material.emissive && o.material.emissive.setHex(0x0a3a4a); } });
        g.add(b);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fffe0 })); eye.position.set(0, 0.2, 0.9); g.add(eye);
      const s = hiddenSpot(qd);
      g.position.set(s.x, terrainAt(s.x, s.z) + 1.3, s.z);
      own(qd, g); qd.thing = g; qd.thingV = new THREE.Vector2();
    },
    update(qd, dt, now) {
      const g = qd.thing; if (!g || qd.done || qd.orb) return;
      const o = zoneOrigin(qd.q);
      const dx = g.position.x - koda.pos.x, dz = g.position.z - koda.pos.z, d = Math.hypot(dx, dz) || 1;
      g.position.y = terrainAt(g.position.x, g.position.z) + 1.3 + Math.sin(now / 300) * 0.3;
      if (d < 2.4) {
        qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(g.position.x, terrainAt(g.position.x, g.position.z), g.position.z);
        g.visible = false; sfxHit(true);
        toast(`It let go of ${qd.partName} and slipped into the dark.`, 3);
        refreshObjective(); return;
      }
      // It flees when he's close, drifts when he's far, and turns along walls.
      const speed = d < 14 ? 5.4 : 1.5;
      let ax = dx / d, az = dz / d;
      for (let k = 0; k < 8; k++) {
        const ang = Math.atan2(az, ax) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
        const nx = g.position.x + Math.cos(ang) * 1.5, nz = g.position.z + Math.sin(ang) * 1.5;
        if (!blocked(nx, nz, 0.8) && nx > o.x + 3 && nx < o.x + qd.q.w - 3 && nz > o.y + 3 && nz < o.y + qd.q.d - 3) { ax = Math.cos(ang); az = Math.sin(ang); break; }
      }
      const nx = g.position.x + ax * speed * dt, nz = g.position.z + az * speed * dt;
      if (!blocked(nx, nz, 0.6)) { g.position.x = clamp(nx, o.x + 2, o.x + qd.q.w - 2); g.position.z = clamp(nz, o.y + 2, o.y + qd.q.d - 2); }
      g.rotation.y = Math.atan2(ax, az);
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      return qd.thing ? { x: qd.thing.position.x, z: qd.thing.position.z, label: "CATCH IT" } : null;
    },
    objective(qd) { return `Something is moving in the dark water of ${qd.q.name}. Catch it. Sprint.`; }
  }
};

/* pads and piano */
function buildPads(qd, n, kind) {
  const c = zoneCenter(qd.q);
  qd.pads = [];
  const piano = kind === "piano";
  const scale = piano ? [0, 2, 4, 5, 7, 9, 11] : [0, 4, 7, 12];
  for (let i = 0; i < n; i++) {
    const x = piano ? c.x + (i - (n - 1) / 2) * 1.55 : c.x + (i % 2 ? 1.3 : -1.3);
    const z = piano ? c.y : c.y + (i < 2 ? -1.3 : 1.3);
    const col = piano ? 0xf4efe6 : padColours[i];
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, roughness: 0.5 });
    const m = new THREE.Mesh(propGeo, mat); m.scale.set(piano ? 1.4 : 2.4, 0.08, piano ? 3 : 2.4); m.position.set(x, terrainAt(x, z) + 0.04, z); m.receiveShadow = true;
    own(qd, m);
    qd.pads.push({ x, z, w: piano ? 1.4 : 2.4, d: piano ? 3 : 2.4, mat, note: scale[i], lit: 0 });
  }
  const len = piano ? 5 : 4 + Math.floor(mission.index / 6);
  qd.seq = Array.from({ length: len }, () => Math.floor(qd.r() * n));
  qd.step = 0; qd.playing = -1; qd.kind = kind; qd.onPad = -1;
  // The melody plays on the beat, one pad per beat.
  qd.onBeat = (bn) => {
    if (qd.done || qd.solved || qd.playing < 0) return;
    if (qd.playing < qd.seq.length) { const p = qd.pads[qd.seq[qd.playing]]; p.lit = 1; playNote(p.note, 0.4, piano ? "triangle" : "square", piano ? 0.2 : 0.07); qd.playing++; }
    else qd.playing = -1;
  };
}
function updatePads(qd, dt) {
  if (!qd.pads) return;
  for (const p of qd.pads) { p.lit = Math.max(0, p.lit - dt * 2.5); p.mat.emissiveIntensity = 0.15 + p.lit * 1.6; }
  if (qd.done || qd.solved) return;
  const c = zoneCenter(qd.q);
  const near = Math.hypot(koda.pos.x - c.x, koda.pos.z - c.y) < 10;
  if (near && !qd.started) { qd.started = true; qd.playing = 0; tip("pads"); toast("Watch and listen. Then step on the pads in the same order.", 3.5); }
  if (!qd.started || qd.playing >= 0) return;
  const on = qd.pads.findIndex(p => Math.abs(koda.pos.x - p.x) < p.w / 2 && Math.abs(koda.pos.z - p.z) < p.d / 2 && kUp() < 0.3);
  if (on === qd.onPad) return;
  qd.onPad = on;
  if (on < 0) return;
  const p = qd.pads[on]; p.lit = 1; playNote(p.note, 0.4, qd.kind === "piano" ? "triangle" : "square", qd.kind === "piano" ? 0.2 : 0.07);
  if (on === qd.seq[qd.step]) {
    qd.step++;
    if (qd.step >= qd.seq.length) {
      qd.solved = true; sfxUnlock();
      qd.orb = makeOrb(PART_COLOURS[qd.k]); { const oz = c.y + (qd.kind === "piano" ? 3 : 3.5); qd.orb.position.set(c.x, terrainAt(c.x, oz), oz); }
      const clue = (mission.def.puzzleClues || [])[mission.quads.filter(x => x.solved).length - 1] || "Scratched into the pads: \"The water remembers.\"";
      toast(clue, 5);
      refreshObjective();
    }
  } else {
    sfxBuzz(); popText("WRONG NOTE", "bad"); qd.step = 0; qd.onPad = -1;
    later(beat.spb * 2, () => { qd.playing = 0; });
  }
}
function padTarget(qd) {
  if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
  const c = zoneCenter(qd.q);
  if (!qd.started) return { x: c.x, z: c.y, label: qd.kind === "piano" ? "THE PIANO" : "THE PADS" };
  if (qd.playing >= 0) return { x: c.x, z: c.y, label: "LISTEN" };
  return { x: c.x, z: c.y, label: `YOUR TURN ${qd.step}/${qd.seq.length}` };
}
function padObjective(qd) {
  if (qd.solved) return `Grab ${qd.partName}.`;
  return qd.kind === "piano" ? `Play the riff back on the giant piano in ${qd.q.name}.` : `Copy the melody on the pads in ${qd.q.name}.`;
}

/* What each quadrant asks for, set up the first time Koda comes near it. */
function spawnQuad(qd) {
  if (qd.spawned) return;
  qd.spawned = true;
  qd.r = rng(qd.q.id.charCodeAt(2) * 7919 + mission.index * 131 + 17);
  qd.fx = (qd.r() - 0.5) * 8; qd.fz = (qd.r() - 0.5) * 8;   // how rough a clue's area is
  const F = FOCUS[qd.focus] || FOCUS.explore;
  Promise.resolve(F.spawn(qd)).then(() => refreshObjective());
}
const quadEnemiesLeft = qd => enemies.filter(e => e.qd === qd && e.state !== "ko").length;

function unlockPart(qd) {
  if (qd.done) return;
  qd.done = true;
  if (qd.orb) { scene.remove(qd.orb); qd.orb = null; }
  mission.order.push(qd.partName);
  pads[qd.q.id].mat.emissive.setHex(0x000000);
  partIn(qd.k);
  drawMixer();
  const unseen = !qd.seen;
  toast(`${qd.partName} joins the mix${unseen ? ". Unseen!" : "."}`, 3);
  if (race && race.qd === qd) { race = null; $("race").textContent = ""; }
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
    toast(`The song is whole. Zora is at ${Q("q11").name}!`, 4);
    refreshObjective();
    return;
  }
  toast(`${m.def.song} is complete.`, 3);
  later(2.5, async () => {
    if (mission !== m) return;
    if (m.def.outro && S.cutscenes[m.def.outro]) await showCard({ kicker: "CUTSCENE", title: m.def.song, lines: S.cutscenes[m.def.outro], button: "See your score" });
    if (mission === m) finishMission();
  });
}

/* ---------- each frame: the quadrants ---------- */
function updateQuads(dt, now) {
  const q = zoneAt(koda.pos.x, koda.pos.z);
  if (q !== currentQuad) {
    currentQuad = q;
    const qd = q && mission.quads.find(x => x.q === q);
    $("zoneName").textContent = q ? q.name.toUpperCase() : "THE STREETS";
    $("zoneSong").textContent = qd ? (qd.done ? `${qd.partName} ✓` : `Holds: ${qd.partName}`) : mission.def.song;
    if (qd && !qd.done) tip(qd.focus);
    refreshObjective();
  }
  for (const qd of mission.quads) {
    if (!qd.done) { const q = qd.q, ex = Math.max(0, q.x0 - koda.pos.x, koda.pos.x - q.x0 - q.w), ez = Math.max(0, q.z0 - koda.pos.z, koda.pos.z - q.z0 - q.d); if (Math.hypot(ex, ez) < 35) spawnQuad(qd); }
    if (!qd.spawned) continue;
    const F = FOCUS[qd.focus];
    if (F && F.update) F.update(qd, dt, now);
    if (qd.orb) {
      const u = qd.orb.userData, d = dist2(koda.pos, qd.orb.position);
      // A hidden part shows itself only when you're close.
      if (qd.stash) qd.orb.visible = false;
      else if (qd.hidden) { const show = d < 6; u.gem.visible = show; u.beam.visible = false; u.ring.visible = show; }
      u.gem.rotation.y += dt * 1.6; u.gem.position.y = 1.2 + Math.sin(now / 380) * 0.15;
      if (!qd.done && !qd.stash && d < 1.5 && Math.abs(koda.pos.y - qd.orb.position.y) < 1.2) unlockPart(qd);
    }
  }
  // The part you're near plays a little louder before you have it: find it by ear.
  if (music.parts.length && music.ac) {
    for (const qd of mission.quads) {
      if (qd.done || !qd.orb || !music.parts[qd.k]) continue;
      const d = dist2(koda.pos, qd.orb.position);
      const want = qd.hidden || qd.focus === "explore" ? clamp(1 - d / 28, 0, 1) * 0.5 : 0;
      music.parts[qd.k].gain.setTargetAtTime(want, music.ac.currentTime, 0.3);
    }
  }
}

/* ---------- where to go next ---------- */
function currentTarget() {
  if (escape) return { x: escape.exit.x, z: escape.exit.y, label: "EXIT" };
  if (zora && zora.waiting) return { x: zora.pos.x, z: zora.pos.z, label: "ZORA" };
  if (race) { const t = FOCUS.race.target(race.qd); if (t) return t; }
  const here = currentQuad && mission.quads.find(x => x.q === currentQuad && !x.done && x.spawned);
  if (here) { const F = FOCUS[here.focus]; const t = F && F.target(here); if (t) return t; }
  let best = null, bd = Infinity;
  for (const qd of mission.quads) {
    if (qd.done) continue;
    const c = zoneCenter(qd.q), d = Math.hypot(c.x - koda.pos.x, c.y - koda.pos.z);
    if (d < bd) { bd = d; best = { x: c.x, z: c.y, label: "GO TO " + qd.q.name.toUpperCase() }; }
  }
  return best;
}
const objectiveTarget = () => currentTarget();
function refreshObjective() {
  if (!mission) return;
  if (mission.def.free) return setObjective("Free roam. Walk the city, light the prayer points, talk to people. Pause for the map.");
  const m = mission, left = m.quads.filter(q => !q.done);
  if (escape) return setObjective(`Get Zora out. Reach the gold light at ${Q("q12").name}!`);
  if (zora && zora.waiting) return setObjective(`Find Zora at ${Q("q11").name}.`);
  if (!left.length) return setObjective("The song is complete.");
  if (race) return setObjective(FOCUS.race.objective(race.qd));
  const here = currentQuad && m.quads.find(q => q.q === currentQuad && !q.done && q.spawned);
  if (here) return setObjective(FOCUS[here.focus].objective(here));
  setObjective(`Mission ${m.index + 1}: ${m.def.song}. Unlock the parts in the lit places (${m.quads.length - left.length}/${m.quads.length}).`);
}

/* ---------- mission looks: the wobble, the grey, the water ---------- */
const themeState = { roll: 0 };
let waterSurface = null;
const WATER_Y = 1.05;
const swimming = () => !!(mission && mission.def.theme === "water" && koda && koda.has("swim") && kUp() < 0.6);
function applyTheme(theme, dt, reset) {
  const cv = renderer.domElement;
  if (reset) {
    cv.style.filter = ""; camera.rotation.z = 0; camera.fov = 42; camera.updateProjectionMatrix();
    scene.fog.color.setHex(0x15121c); scene.background.setHex(0x15121c); scene.fog.near = 28; scene.fog.far = 70;
    hemi.intensity = 0.7; sun.intensity = 2.6;
    $("tint").className = "tint";
    if (waterSurface) waterSurface.visible = false;
    if (!theme) return;
  }
  const t = mission ? mission.t : 0;
  if (theme === "wobble") {
    // Selina: he can't stop seeing her. The world sways and breathes.
    const k = 0.6 + 0.4 * Math.sin(t * 0.21);
    camera.fov = 42 + Math.sin(t * 0.9) * 3 * k; camera.updateProjectionMatrix();
    cv.style.filter = `hue-rotate(${Math.sin(t * 0.4) * 28}deg) saturate(${1.15 + Math.sin(t * 0.7) * 0.25})`;
    themeState.roll = Math.sin(t * 0.7) * 0.08 * k;
  } else if (theme === "grey") {
    // That Juice: no colour until the song comes back together.
    const done = mission ? mission.quads.filter(q => q.done).length : 0;
    cv.style.filter = `grayscale(${Math.max(0, 1 - done / mission.quads.length)})`;
  } else if (theme === "water") {
    $("tint").className = "tint water";
    // The streets are flooded: a dark surface he swims through.
    if (!waterSurface) {
      waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 120, WORLD_H + 120),
        new THREE.MeshStandardMaterial({ color: 0x0b3a4a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false }));
      waterSurface.rotation.x = -Math.PI / 2; waterSurface.position.set(WORLD_W / 2, WATER_Y, WORLD_H / 2); waterSurface.renderOrder = 2;
      scene.add(waterSurface);
    }
    waterSurface.visible = true;
    if (koda) waterSurface.position.set(koda.pos.x, terrainAt(koda.pos.x, koda.pos.z) + WATER_Y, koda.pos.z);
    waterSurface.material.opacity = 0.62 + Math.sin(t * 1.3) * 0.04;
    // Thinking of You: dark water that gets darker as the song goes on.
    const p = mission ? mission.quads.filter(q => q.done).length / mission.quads.length : 0;
    scene.fog.color.setRGB(0.02, 0.12 - p * 0.08, 0.16 - p * 0.1); scene.background.copy(scene.fog.color);
    scene.fog.near = 6 - p * 3; scene.fog.far = 34 - p * 14;
    $("tint").style.opacity = (0.55 + p * 0.35).toFixed(2);
    hemi.intensity = 0.55 - p * 0.25; sun.intensity = 1.6 - p * 0.9;
    cv.style.filter = "hue-rotate(-12deg) saturate(1.2)";
  }
}
// Selina: Zora appears at the edge of sight and is gone when you get close.
let ghost = null;
async function updateGhost(dt) {
  if (!mission || mission.def.theme !== "wobble") return;
  if (!ghost) {
    ghost = { loading: true };
    try {
      const a = await makeActor("zora.glb", 1.58);
      a.root.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.castShadow = false; } });
      ghost = { a, t: 4 };
    } catch (e) { ghost = { t: 1e9 }; }
    return;
  }
  if (!ghost.a) return;
  ghost.t -= dt;
  const a = ghost.a;
  if (ghost.t <= 0) {
    const ang = Math.random() * Math.PI * 2, s = freeSpot(koda.pos.x + Math.cos(ang) * 16, koda.pos.z + Math.sin(ang) * 16);
    a.pos.set(s.x, 0, s.z); a.faceTo(koda.pos.x, koda.pos.z); a.play("idle");
    if (!a.root.parent) scene.add(a.root);
    a.root.visible = true; ghost.t = 14 + Math.random() * 10;
  }
  if (a.root.visible) { a.update(dt); if (dist2(a.pos, koda.pos) < 8) a.root.visible = false; }
}

/* ---------- superspeed (earned in Put It On Me) ---------- */
const boost = { meter: 1, on: false };
function updateBoost(dt) {
  const want = save.superspeed && !mission.def.noBoost && boost.meter > 0.02 && (keys.has("KeyQ") || pad.boost || input.boostHeld) && input.mag > 0.2;
  boost.on = !!want;
  boost.meter = clamp(boost.meter + (boost.on ? -dt / 3.2 : dt / 6), 0, 1);
  $("btnBoost").style.setProperty("--m", boost.meter.toFixed(2));
}


/* ---------- score ---------- */
function scoreFor(m) {
  const parts = m.quads.filter(q => q.done).length * 1000;
  const time = Math.max(0, Math.round((m.limit ? m.limit * 2 - m.t : 0) * 8));
  const stealth = m.quads.filter(q => q.done && !q.seen).length * 400;
  const takedowns = m.stats.takedowns * 200, kos = m.stats.kos * 100, hurt = -m.stats.hurt * 150, beats = (m.stats.onBeat || 0) * 50;
  const total = Math.max(0, parts + time + stealth + takedowns + kos + beats + hurt);
  const grade = total >= 7500 ? "S" : total >= 6000 ? "A" : total >= 4500 ? "B" : "C";
  return { rows: [["Parts unlocked", parts], ["Quick work", time], ["Unseen quadrants", stealth], ["Takedowns", takedowns], ["Guards put down", kos], ["Hits on the beat", beats], ["Hits taken", hurt]], total, grade };
}
function failMission() {
  const m = mission;
  if (!m || m.finished) return;
  m.finished = true;
  state = "score";
  stopMusic();
  const got = m.quads.filter(q => q.done).length;
  $("scoreKicker").textContent = "THE SONG ENDED";
  $("scoreTitle").textContent = `Mission ${m.index + 1}: ${m.def.song}`;
  $("scoreGrade").textContent = `${got}/${m.quads.length}`;
  $("scoreRows").innerHTML = `<p class="fail">${m.def.final && got === m.quads.length ? "Get Zora out before the song ends." : "Unlock every part before the song ends."} Finish this mission to open the next one.</p>`;
  $("scoreMix").textContent = got ? "Your mix so far: " + m.order.join(" → ") : "";
  m.failed = true;
  $("nextBtn").textContent = "Back to the title";
  $("nextBtn").className = "ghost";
  $("replayBtn").textContent = "Try again";
  $("replayBtn").className = "primary";
  $("replayBtn").parentNode.prepend($("replayBtn"));
  $("score").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("touch").classList.add("hidden");
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
  const earned = m.def.grants === "superspeed" && !save.superspeed;
  if (m.def.grants === "superspeed") save.superspeed = true;
  writeSave();
  stopMusic();
  $("scoreKicker").textContent = "MISSION COMPLETE";
  $("nextBtn").className = "primary";
  $("replayBtn").textContent = "Play it again";
  $("replayBtn").className = "ghost";
  $("replayBtn").parentNode.append($("replayBtn"));
  $("scoreTitle").textContent = `Mission ${m.index + 1}: ${m.def.song}`;
  $("scoreGrade").textContent = sc.grade;
  $("scoreRows").innerHTML = sc.rows.map(([k, v]) => `<div><span>${k}</span><b>${v >= 0 ? "" : "-"}${Math.abs(v)}</b></div>`).join("") +
    `<div class="total"><span>Total${isBest ? " · new best" : ""}</span><b>${sc.total}</b></div>`;
  $("scoreMix").textContent = "Your mix: " + m.order.join(" → ") + (earned ? "  ·  SUPERSPEED UNLOCKED: hold BOOST (Q, LB) to run like the wind." : "");
  const last = m.index >= S.missions.length - 1;
  $("nextBtn").textContent = last ? "Back to the title" : `Next: ${S.missions[m.index + 1].song}`;
  $("score").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("touch").classList.add("hidden");
}
$("nextBtn").addEventListener("click", () => {
  $("score").classList.add("hidden");
  const m = mission;
  if (!m || m.failed || m.index >= S.missions.length - 1) return toTitle();
  state = "play";
  startMission(m.index + 1);
});
$("replayBtn").addEventListener("click", () => {
  $("score").classList.add("hidden");
  state = "play";
  startMission(mission.index, { showIntro: false });
});

/* ---------- the final escape ---------- */
// Everyone who doesn't climb walks on the land (and bridges), up and down the hills.
function settleCrowd() {
  for (const e of enemies) e.a.pos.y = floorAt(e.a.pos.x, e.a.pos.z);
  for (const n of npcs) n.a.pos.y = floorAt(n.a.pos.x, n.a.pos.z);
  if (zora && zora.pos) zora.pos.y = floorAt(zora.pos.x, zora.pos.z);
  if (mission) for (const qd of mission.quads) if (qd.zoras) for (const z of qd.zoras) if (z.z && z.z.pos) z.z.pos.y = floorAt(z.z.pos.x, z.z.pos.z);
}
function updateZora(dt) {
  if (!zora) return;
  zora.update(dt);
  if (zora.waiting) {
    if (dist2(koda.pos, zora.pos) < 2.2) {
      zora.waiting = false;
      showCard({ kicker: "CUTSCENE", title: "Zora", lines: S.cutscenes.found, button: "Run" }).then(() => {
        const ex = new THREE.Vector2(Q("q12").x0 + Q("q12").w - 4, zoneCenter(Q("q12")).y);
        escape = { exit: ex, mesh: ringAt(ex.x, ex.y, 3) };
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
    if (Math.hypot(koda.pos.x - escape.exit.x, koda.pos.z - escape.exit.y) < 3.2) {
      scene.remove(escape.mesh); escape = null; $("race").textContent = ""; mission.homeFree = true;
      showCard({ kicker: "CUTSCENE", title: "Home", lines: S.cutscenes.ending, button: "See your score" }).then(finishMission);
    }
  }
}

/* ---------- Koda ---------- */
const CONTACT = 1.05;      // how close a hit lands: fists meet faces
const lastSafe = new THREE.Vector3();
const kUp = () => koda.pos.y - terrainAt(koda.pos.x, koda.pos.z);
function startSink() {
  if (koda.sinking) return;
  koda.sinking = { t: 0.7 }; air = null;
  koda.play(koda.has("fall") ? "fall" : "hurt", { once: true });
  sfxHit(false);
  tip("mud");
}
function updateKoda(dt) {
  readInput();
  invuln = Math.max(0, invuln - dt);
  if (koda.riding) { ride(dt); return; }
  // In the mud: he goes under and comes back up on the bank he jumped from.
  if (koda.sinking) {
    koda.sinking.t -= dt; koda.pos.y -= dt * 1.4;
    if (koda.sinking.t <= 0) {
      koda.sinking = null; koda.pos.copy(lastSafe); koda.pos.y = groundAt(lastSafe.x, lastSafe.z);
      popText("WASHED BACK", "bad");
    }
    koda.update(dt);
    return;
  }
  const water = mission && mission.def.theme === "water" ? 0.8 : 1;
  // Climbing: up the face, then over the top onto it.
  if (koda.climb) {
    const c = koda.climb; c.t += dt;
    const k = Math.min(1, c.t / c.dur), up = Math.min(1, k / 0.75), over = Math.max(0, (k - 0.7) / 0.3);
    koda.pos.y = c.y0 + (c.y1 - c.y0) * (1 - Math.pow(1 - up, 2));
    koda.pos.x = c.x0 + (c.x1 - c.x0) * over; koda.pos.z = c.z0 + (c.z1 - c.z0) * over;
    if (k >= 1) { koda.pos.set(c.x1, c.y1, c.z1); koda.climb = null; attackLock = 0; koda.held = 1; koda.play("idle", { fade: 0.1 }); }
    koda.update(dt); return;
  }
  // In the air: a jump arc. You can steer while airborne, and land on anything you clear.
  if (air) {
    air.t = (air.t || 0) + dt;
    air.vy -= 22 * dt; koda.pos.y += air.vy * dt;
    let mx = 0, mz = 0;
    if (air.vault) { const f = forward(koda); mx = f.x; mz = f.y; }
    else if (air.back) { mx = air.back.x; mz = air.back.z; }
    else if (input.mag) { mx = input.x; mz = input.z; koda.face(Math.atan2(input.x, input.z), Math.min(1, dt * 8)); }
    if (mx || mz) {
      const bx = koda.pos.x, bz = koda.pos.z;
      moveWithCollision(koda.pos, mx * air.speed * dt, mz * air.speed * dt, 0.45, true);
      // Caught the edge of a roof just short: pull up onto it.
      const want = Math.hypot(mx, mz) * air.speed * dt, got = Math.hypot(koda.pos.x - bx, koda.pos.z - bz);
      if (got < want * 0.5) {
        const b = blocked(bx + mx * 0.6, bz + mz * 0.6, 0.45, koda.pos.y, true);
        if (b && b.walk && b.top > koda.pos.y && b.top - koda.pos.y < 0.8) {
          koda.pos.x = clamp(bx + mx * 0.9, b.minX + 0.3, b.maxX - 0.3); koda.pos.z = clamp(bz + mz * 0.9, b.minZ + 0.3, b.maxZ - 0.3);
          koda.pos.y = b.top; air = null; attackLock = 0.25;
          koda.play(koda.has("mantle") ? "mantle" : "idle", { once: true, speed: 1.8 });
          koda.update(dt); return;
        }
      }
    }
    const g = groundAt(koda.pos.x, koda.pos.z);
    if (air.vy <= 0 && koda.pos.y <= (g === MUD ? terrainAt(koda.pos.x, koda.pos.z) : g)) {
      if (g === MUD) { koda.pos.y = terrainAt(koda.pos.x, koda.pos.z); air = null; startSink(); koda.update(dt); return; }
      koda.pos.y = g;
      if (air.kick) landKick();
      const fromJump = koda.current && koda.current.getClip().name === "bigjump";
      air = null; attackLock = Math.max(attackLock, 0.08);
      // Land on his feet. Standing still, the jump plays out its landing (he sinks into it and
      // rises); moving, he runs straight on.
      if (fromJump && !input.mag) { koda.landT = 0.5; koda.current.timeScale = 1; }
      else { koda.held = 1; koda.play(input.mag ? "run" : "idle", { fade: 0.08 }); }
    }
    koda.update(dt);
    return;
  }
  // Standing on a floating crate: it carries him.
  if (inMud(koda.pos.x, koda.pos.z)) { const f = floatAt(koda.pos.x, koda.pos.z); if (f) { koda.pos.x += f.dx; koda.pos.z += f.dz; } }
  // A strike pulls him in to contact range with the guard he is hitting.
  if (lunge) {
    lunge.t -= dt;
    const k = Math.min(1, dt / Math.max(0.01, lunge.t + dt));
    const nx = koda.pos.x + (lunge.x - koda.pos.x) * k, nz = koda.pos.z + (lunge.z - koda.pos.z) * k;
    moveWithCollision(koda.pos, nx - koda.pos.x, nz - koda.pos.z, 0.45, true);
    if (lunge.t <= 0) lunge = null;
  }
  if (attackLock > 0) { attackLock -= dt; koda.update(dt); settle(); return; }
  if (koda.landT > 0) { koda.landT -= dt; if (!input.mag) { koda.update(dt); settle(); return; } koda.landT = 0; }
  // Free roam: standing still and holding ACTION by a tree, rocks or sand gathers it.
  if (mission && mission.def.free && input.actionHeld && !input.mag && !air && updateGather(dt, true)) { koda.update(dt); settle(); return; }
  const sneaking = input.sneak;
  const sprint = !sneaking && input.mag > 0.93;
  // A light push walks, further runs, all the way (or RT / Shift) sprints.
  const walking = !sneaking && !sprint && !boost.on && input.mag > 0 && input.mag < 0.55 && koda.has("walk");
  // Two paces: a walk and one quick run (no separate sprint).
  let speed = input.mag === 0 ? 0 : sneaking ? 2.6 : walking ? 1.7 : 6.8;
  if (boost.on && !sneaking) speed = 13;
  if (koda.pushing) speed = Math.min(speed, 2.4);
  speed *= water;
  // Running and you pull the stick the other way: a proper turn on the spot.
  const want = Math.atan2(input.x, input.z);
  if (speed > 5 && koda.moving && koda.has("turn180") && Math.abs(angleLerp(0, want - koda.yaw, 1)) > 2.5) {
    koda.play("turn180", { once: true, speed: 1.5 }); koda.face(want, 1); attackLock = 0.22; koda.update(dt); return;
  }
  if (speed > 0) {
    moveWithCollision(koda.pos, input.x * speed * dt, input.z * speed * dt, 0.45, true);
    koda.face(want, Math.min(1, dt * 14));
    if (swimming()) koda.play("swim", { speed: sprint ? 1.35 : 1 });
    else koda.play(sneaking ? "crouch_walk" : boost.on ? "sprint" : walking || koda.pushing ? "walk" : "run", { speed: boost.on ? 1.4 : 1 });
  } else if (swimming()) koda.play(koda.has("tread") ? "tread" : "swim");
  // In cover he crouches with his back to the box (facing away from it, set below).
  else koda.play(sneaking ? "crouch_idle" : koda.has("fight_idle") && fightFoe() ? "fight_idle" : "idle");
  // In the water his body floats up to the surface, head above it.
  const lift = swimming() ? (speed > 0 ? WATER_Y - 0.8 : WATER_Y - 1.45) : 0;
  koda.model.position.y += (koda.baseY + lift - koda.model.position.y) * Math.min(1, dt * 6);
  koda.moving = speed > 0; koda.sprinting = sprint || boost.on; koda.sneaking = sneaking;
  koda.reach += ((koda.pushing ? 1 : 0) - (koda.reach || 0)) * Math.min(1, dt * 8);
  // Crouched beside a crate, wall or dumpster: he presses his back to it and is much harder to see.
  koda.inCover = null;
  if (sneaking && kUp() < 0.3) {
    for (const b of blockers) {
      if (b.mud || b.top < 0.75) continue;
      const cx = clamp(koda.pos.x, b.minX, b.maxX), cz = clamp(koda.pos.z, b.minZ, b.maxZ);
      const dd = Math.hypot(koda.pos.x - cx, koda.pos.z - cz);
      if (dd < 0.75) { koda.inCover = b; if (!speed && dd > 0.01) koda.face(Math.atan2(koda.pos.x - cx, koda.pos.z - cz), Math.min(1, dt * 8)); break; }
    }
  }
  $("cover").classList.toggle("show", !!koda.inCover);
  koda.update(dt);
  settle();
}
// People are solid. Koda steps round guards and townsfolk instead of walking through them,
// and Zora steps aside for him (she never blocks the way).
function keepApart() {
  if (attackLock > 0 || lunge) return;
  const p = koda.pos;
  const push = (o, min, share) => {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d >= min || Math.abs(p.y - o.y) > 1.4) return;
    const nx = d > 1e-3 ? dx / d : Math.sin(koda.yaw + Math.PI / 2), nz = d > 1e-3 ? dz / d : Math.cos(koda.yaw + Math.PI / 2);
    const gap = min - d;
    if (share < 1) moveWithCollision(p, nx * gap * (1 - share), nz * gap * (1 - share), 0.45, true);
    if (share > 0) moveWithCollision(o, -nx * gap * share, -nz * gap * share, 0.4);
  };
  for (const e of enemies) if (e.state !== "ko" && e.a.root.parent) push(e.a.pos, 0.72, 0);
  for (const n of npcs) if (n.a && n.a.root.parent) push(n.a.pos, 0.75, 0.3);
  for (const p of ambient) push(p.a.pos, 0.75, p.job === "sell" ? 0 : 0.5);
  for (const o of coop.others.values()) if (o.a) push(o.root.position, 0.8, 0);
  if (zora && zora.root.parent) push(zora.pos, 0.75, 1);
}
// After moving on the ground: step off an edge and fall, step into the mud and sink.
function settle() {
  keepApart();
  const g = groundAt(koda.pos.x, koda.pos.z);
  if (g === MUD) { if (koda.pos.y <= terrainAt(koda.pos.x, koda.pos.z) + 0.05) startSink(); else air = { vy: 0, speed: 3, kick: false, fall: true }; return; }
  if (koda.pos.y > g + 0.05) { air = { vy: 0, speed: koda.moving ? 4 : 0, kick: false, fall: true }; return; }
  koda.pos.y = g;
  // Remember solid ground a step back from any mud, to come back to after a dunk.
  const x = koda.pos.x, z = koda.pos.z;
  if (!inMud(x, z) && !inMud(x + 1.2, z) && !inMud(x - 1.2, z) && !inMud(x, z + 1.2) && !inMud(x, z - 1.2)) lastSafe.copy(koda.pos);
}
function jump() {
  if (!koda || attackLock > 0 || koda.sinking) return;
  if (koda.riding) { dismount(); return; }
  koda.pushing = null;
  // Just walked off an edge: a moment's grace to still jump.
  if (air && !(air.fall && air.t < 0.16)) return;
  readInput();
  const speed = (input.mag ? (boost.on ? 10 : input.mag > 0.93 ? 7.5 : 5) : 0) * (mission && mission.def.theme === "water" ? 0.85 : 1);
  air = { vy: 7.2, speed, kick: false };
  // Something low just ahead: vault it rather than a plain jump.
  const f = forward(koda);
  let low = null;
  for (let i = 4; i <= 16 && !low; i += 2) { const b = blocked(koda.pos.x + f.x * i * 0.1, koda.pos.z + f.y * i * 0.1, 0.3, koda.pos.y); if (b && b.low && b.top - koda.pos.y < 1.1 && Math.min(b.maxX - b.minX, b.maxZ - b.minZ) < 0.9) low = b; }   // thin things only: jump onto crates, vault over barriers
  // A wall, container or stack taller than a vault and no higher than he can reach: run up it.
  let tall = null;
  for (let i = 4; i <= 12 && !tall; i += 2) { const b = blocked(koda.pos.x + f.x * i * 0.1, koda.pos.z + f.y * i * 0.1, 0.3, koda.pos.y); if (b && b.walk && !b.ramp && b.top - koda.pos.y >= 1.1 && b.top - koda.pos.y <= 5.2) tall = b; }
  if (tall && koda.has("wallclimb") && !low) {
    air = null;
    const tx = clamp(koda.pos.x + f.x * 1.2, tall.minX + 0.35, tall.maxX - 0.35), tz = clamp(koda.pos.z + f.y * 1.2, tall.minZ + 0.35, tall.maxZ - 0.35);
    const dur = Math.min(2.2, koda.play("wallclimb", { once: true, speed: 1.4 }) || 1.6);
    koda.climb = { t: 0, dur, y0: koda.pos.y, y1: tall.top, x0: koda.pos.x, z0: koda.pos.z, x1: tx, z1: tz };
    attackLock = dur; tip("jump"); return;
  }
  if (low && koda.has("vault")) { air.speed = Math.max(speed, 5.5); air.vault = true; input.x = f.x; input.z = f.y; koda.play("vault", { once: true, speed: 1.6 }); }
  else if (speed >= 7.5 && koda.has("frontflip")) koda.play("frontflip", { once: true, speed: 1.35, from: 0.25 });
  else if (!input.mag && fightFoe() && koda.has("backflip")) { koda.play("backflip", { once: true, speed: 1.5, from: 0.35 }); const f = forward(koda); air.speed = 3; air.back = { x: -f.x, z: -f.y }; }
  // The jump is timed to the arc: its push-off starts now and its feet touch down when he lands
  // (in the clip he leaves the ground at 0.5 s and is back on it at 1.12 s).
  else if (koda.has("bigjump")) koda.play("bigjump", { once: true, from: 0.5, speed: 0.62 / (2 * air.vy / 22) });
  else koda.play("jump", { once: true, speed: 1.3 });
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
  if (!koda || attackLock > 0 || koda.riding) return;
  koda.pushing = null;
  if (air) {
    if (air.kick) return;
    air.kick = true; air.vy = Math.max(air.vy, 3);
    const alt = koda.has("crescent") && (comboStep++ % 2);
    koda.play(alt ? "crescent" : koda.has("flykick") ? "flykick" : "kick", alt ? { once: true, speed: 1.6, from: 0.7 } : { once: true, speed: 1.4 });
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
  // The ninja string: cross, jab-to-elbow, elbow-uppercut, roundhouse. Land the finisher on
  // the beat and it becomes a hurricane kick that hits everyone around him. Sprinting in, the
  // first blow is a flying knee. Times are seconds into each move, where the fist or foot lands.
  const ninja = koda.has("roundhouse");
  const STRING = ninja
    ? [{ clip: "punch", from: 0.6, speed: 1.6, lock: 0.45, hits: [0.93], dmg: 1 },
       { clip: "combo", from: 0.5, speed: 1.7, lock: 0.75, hits: [0.87, 1.35], dmg: 1 },
       { clip: "elbowup", from: 0.3, speed: 1.6, lock: 0.7, hits: [0.6, 1.0], dmg: 1, body: true },
       { clip: "roundhouse", from: 0.6, speed: 1.6, lock: 0.7, hits: [1.27], dmg: 2, push: 2.6 }]   // the spinning kick: his foot comes round at 1.27 s
    : koda.native
      ? [{ clip: "punch", speed: 1.5, lock: 0.5, hits: [0.22], dmg: 1 }, { clip: "combo", speed: 1.6, lock: 0.8, hits: [0.24, 0.55], dmg: 1 }, { clip: "kick", speed: 1.4, lock: 0.7, hits: [0.42], dmg: 2, body: true }]
      : [{ clip: "punch", speed: 1.5, lock: 0.42, hits: [0.17], dmg: 1 }, { clip: "punch", speed: 1.5, lock: 0.42, hits: [0.17], dmg: 1 }, { clip: "kick", speed: 1.5, lock: 0.5, hits: [0.17], dmg: 2 }];
  // On the beat: double damage.
  const onBeatHit = nearBeat(0.12);
  if (onBeatHit) { popText("ON BEAT x2", "good"); mission.stats.onBeat++; }
  let mv = STRING[comboStep++ % STRING.length];
  if (ninja && koda.sprinting && comboStep === 1 && koda.has("knee")) mv = { clip: "knee", from: 0.4, speed: 1.5, lock: 0.9, hits: [0.97, 1.5], dmg: 1, dash: 3.2 };
  // On the beat, the spinning kick catches everyone around him, not just the one in front.
  if (ninja && mv.clip === "roundhouse" && onBeatHit) mv = Object.assign({}, mv, { radial: 2.4, push: 2.6 });
  koda.play(mv.clip, { once: true, speed: mv.speed, from: mv.from || 0 });
  attackLock = mv.lock;
  if (mv.dash) { const f = forward(koda); lunge = { x: koda.pos.x + f.x * mv.dash, z: koda.pos.z + f.y * mv.dash, t: 0.35 }; }
  for (const at of mv.hits) later((at - (mv.from || 0)) / mv.speed, () => {
    const f = forward(koda);
    for (const e of enemies) {
      if (e.state === "ko") continue;
      const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
      const inFront = (dx * f.x + dz * f.y) / (d || 1) > 0.3;
      if (Math.abs(kUp()) < 0.7 && (mv.radial ? d < mv.radial : d < 1.7 && inFront)) {
        hitEnemy(e, mv.dmg * (onBeatHit ? 2 : 1), dx / (d || 1), dz / (d || 1), mv.body);
        if (mv.push && e.state !== "ko") moveWithCollision(e.a.pos, dx / (d || 1) * mv.push * 0.5, dz / (d || 1) * mv.push * 0.5, 0.4);
      }
    }
  });
}
// Dodge: in a fight, the sneak button rolls him out of the way (forward if he's moving,
// a jump back if he isn't). He can't be hit while he rolls.
function dodge() {
  if (!koda || attackLock > 0 || air || koda.sinking) return false;
  if (!fightFoe() || !koda.has("roll")) return false;
  readInput();
  const moving = input.mag > 0.2, f = forward(koda);
  const dir = moving ? { x: input.x, z: input.z } : { x: -f.x, z: -f.y };
  if (moving) koda.face(Math.atan2(input.x, input.z), 1);
  const len = moving ? 4.2 : 2.8;
  lunge = { x: koda.pos.x + dir.x * len, z: koda.pos.z + dir.z * len, t: moving ? 0.45 : 0.4 };
  koda.play(moving ? "roll" : (koda.has("dodge") ? "dodge" : "roll"), { once: true, speed: moving ? 1.3 : 1.7, from: moving ? 0 : 0.45 });
  attackLock = moving ? 0.55 : 0.5; invuln = Math.max(invuln, 0.6);
  return true;
}
function landKick() {
  for (const e of enemies) {
    if (e.state === "ko") continue;
    const dx = e.a.pos.x - koda.pos.x, dz = e.a.pos.z - koda.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.9) hitEnemy(e, nearBeat(0.15) ? 4 : 2, dx / (d || 1), dz / (d || 1));
  }
}
function action() {
  if (!koda || attackLock > 0 || air) return;
  if (koda.riding) { dismount(); return; }
  if (mission) for (const qd of mission.quads) if (qd.focus === "rubble" && FOCUS.rubble.tap(qd)) return;
  if (prayNear()) return;
  { const st = storeNear(); if (st) { openShop(st); return; } }
  { const h = !koda.pushing && nearHorse(); if (h) { mount(h); return; } }
  if (!npcs.some(n => dist2(koda.pos, n.a.pos) < 2.6) && talkToAmbient()) return;
  if (npcs.some(n => dist2(koda.pos, n.a.pos) < 2.6) || (mission && mission.quads.some(q => q.focus === "copies" && q.zoras && q.zoras.some(z => !z.gone && dist2(z.z.pos, koda.pos) < 2.4)))) return talkOrListen();
  if (searchNear()) return;
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
  talkOrListen();
}
function talkOrListen() {
  for (const n of npcs) {
    if (dist2(koda.pos, n.a.pos) < 2.6) {
      n.a.faceTo(koda.pos.x, koda.pos.z);
      const qd = n.qd;
      if (qd && !qd.done) {
        if (n.clue) FOCUS.explore.talk(qd, n);
        if (n.reveal) FOCUS.blind.talk(qd, n);
        if (n.help) { const before = qd.asked; FOCUS.help.talk(qd, n); if (before && !qd.orb) return toast("\"Still need that box.\"", 2.5); if (qd.orb) return refreshObjective(); }
        refreshObjective();
      }
      return toast((n.name ? n.name + ": " : "") + "\"" + n.line + "\"", 5);
    }
  }
  // Can't Copy You: listen to a Zora, then take her hand.
  if (mission) for (const qd of mission.quads) {
    if (qd.focus !== "copies" || qd.done || qd.orb || !qd.zoras) continue;
    const zz = qd.zoras.filter(z => !z.gone).find(z => dist2(z.z.pos, koda.pos) < 2.4);
    if (zz) { koda.faceTo(zz.z.pos.x, zz.z.pos.z); return FOCUS.copies.talkZora(qd, zz); }
  }
}
// A red flash on the edge of the screen the blow came from.
function sideFlash(fromX, fromZ) {
  dV.set(fromX, 1, fromZ).project(camera);
  const el = $("hitside");
  const ang = Math.atan2(-dV.y, dV.x);
  el.style.background = `radial-gradient(ellipse 60% 60% at ${50 + Math.cos(ang) * 55}% ${50 + Math.sin(ang) * 55}%, rgba(255,40,30,.7), rgba(255,40,30,0) 70%)`;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
}
function hurtKoda(n, fromX, fromZ) {
  if (invuln > 0 || state !== "play" || air) return;
  if (koda.riding) dismount(true);   // knocked out of the saddle
  health -= n; invuln = 1.0; drawHearts();
  mission.stats.hurt += n;
  sfxHit(true);
  const dx = koda.pos.x - fromX, dz = koda.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
  moveWithCollision(koda.pos, dx / d * 0.45, dz / d * 0.45, 0.45, true);
  koda.faceTo(fromX, fromZ);
  impact(koda.pos.x + (fromX - koda.pos.x) / d * 0.3, 1.4, koda.pos.z + (fromZ - koda.pos.z) / d * 0.3, dx / d, dz / d, true, 0xff6a50);
  sideFlash(fromX, fromZ);
  koda.play("hurt", { once: true, speed: koda.native ? 1.6 : 1 }); attackLock = 0.3;
  if (health <= 0) respawn();
}
function respawn() {
  const qd = mission.quads.find(q => !q.done) || mission.quads[0] || { q: S.quadrants[0] };
  const c = zoneCenter(qd.q);
  const s = freeSpot(c.x, c.y + qd.q.d / 2 - 6);
  koda.pos.set(s.x, groundAt(s.x, s.z), s.z); lastSafe.copy(koda.pos); air = null; koda.sinking = null;
  health = 5; drawHearts();
  for (const q of mission.quads) if (q.focus === "fight" && q.arena) FOCUS.fight.reset(q);
  for (const e of enemies) if (e.state !== "ko") { e.state = "patrol"; e.meter = 0; }
  if (race) { const rq = race.qd; race = null; $("race").textContent = ""; for (const c of rq.cps) c.ring.visible = false; if (rq.orb) { scene.remove(rq.orb); rq.orb = null; } rq.ring.visible = true; }
  toast("Back on your feet. Go quieter this time.", 3);
}

/* ---------- enemies ---------- */
function alertEnemy(e) {
  if (e.state === "ko" || e.state === "alert") return;
  e.state = "alert"; e.meter = 1; e.cool = 0.5;
  // He stops for his "there you are" moment, then gives chase. He never slides while posing.
  e.holdT = e.a.has("alert") ? Math.min(0.7, e.a.play("alert", { once: true, speed: 1.3 })) : 0;
  seenIn(e.qd);
  tip("seen");
}
function hitEnemy(e, dmg, nx, nz, body = false) {
  if (e.horse) riderOff(e);   // knocked out of the saddle
  e.hp -= dmg;
  e.flash = 0.12;
  impact(e.a.pos.x - nx * 0.3, body ? 1.05 : 1.55, e.a.pos.z - nz * 0.3, nx, nz, dmg > 1);
  sfxHit(dmg > 1);
  // Knocked back a step, and turned to face his attacker.
  moveWithCollision(e.a.pos, nx * 0.5, nz * 0.5, 0.45);
  e.a.faceTo(koda.pos.x, koda.pos.z);
  if (e.hp <= 0) return knockOut(e);
  // Head shots snap the head back; kicks and body blows fold him at the middle.
  e.a.play(body && e.a.has("hit_body") ? "hit_body" : "hit", { once: true, speed: e.a.native ? 1.6 : 1 }); e.hitT = 0.4; e.holdT = 0; e.cool = Math.max(e.cool, 0.6);
  if (e.state !== "alert") alertEnemy(e);
}
function knockOut(e) {
  if (e.state === "ko") return;
  if (e.horse) riderOff(e);
  e.state = "ko"; e.a.play("ko", { once: true });
  // He falls flat: slide him clear of crates, rubble and walls so the body lies on open ground.
  const f = forward(e.a), lie = freeSpot(e.a.pos.x + f.x * 0.9, e.a.pos.z + f.y * 0.9, 1.3);
  e.koTo = { x: lie.x - f.x * 0.9, z: lie.z - f.y * 0.9 };
  if (attacker === e) attacker = null;
  mission.stats.kos++;
  refreshObjective();
}

let anySeen = false, anySus = false, swingGap = 0;   // guards take turns to swing
let attacker = null;                                 // the one guard allowed to come at Koda
function pickAttacker() {
  if (attacker && (attacker.state !== "alert" || !enemies.includes(attacker) || dist2(attacker.a.pos, koda.pos) > 10)) attacker = null;
  if (attacker) return;
  let best = null, bd = 10;
  for (const e of enemies) { if (e.state !== "alert") continue; const d = dist2(e.a.pos, koda.pos); if (d < bd) { bd = d; best = e; } }
  attacker = best;
}
function updateEnemies(dt) {
  anySeen = false; anySus = false; swingGap = Math.max(0, swingGap - dt);
  pickAttacker();
  for (const e of enemies) {
    const a = e.a;
    const d = dist2(koda.pos, a.pos);
    // Not at All: these patrols can't be seen until they find you, or a neighbour shows you.
    const shown = !e.hidden || e.state === "alert" || e.state === "ko" || (e.qd && e.qd.revealT > 0);
    a.root.visible = d < 60 && shown;
    if (d > 55) continue;
    a.update(dt);
    if (e.state === "ko") {
      if (e.koTo) { const k = Math.min(1, dt * 6); a.pos.x += (e.koTo.x - a.pos.x) * k; a.pos.z += (e.koTo.z - a.pos.z) * k; a.pos.y = floorAt(a.pos.x, a.pos.z); if (Math.hypot(e.koTo.x - a.pos.x, e.koTo.z - a.pos.z) < 0.02) e.koTo = null; }
      continue;
    }
    e.cool = Math.max(0, e.cool - dt); e.hitT = Math.max(0, e.hitT - dt);
    if (e.hitT > 0) continue;
    if (d < 14 && e.state === "patrol" && shown) tip("guard");

    // Shift change (on the beat, every 8 bars): he stands and looks away.
    if (e.shiftT > 0 && e.state !== "alert") {
      e.shiftT -= dt;
      a.play(a.has("fight_idle") ? "fight_idle" : "walk");
      const back = e.route[(e.leg + 2) % e.route.length];
      a.face(Math.atan2(back.x - a.pos.x, back.z - a.pos.z) + Math.PI, Math.min(1, dt * 3));
      continue;
    }

    const f = forward(a), dx = koda.pos.x - a.pos.x, dz = koda.pos.z - a.pos.z;
    // Under a roof or sneaking: much harder to spot. Up on a rooftop: guards look along the street, not up.
    const covered = underRoof(koda.pos.x, koda.pos.z);
    const range = (koda.sneaking ? 4 : 7.5) * (covered ? 0.5 : 1) * (kUp() > 1.5 ? 0.6 : 1) * (koda.inCover ? 0.6 : 1) * (litBy(koda.pos.x, koda.pos.z) ? 1 : 0.65) * (e.horse ? 1.4 : 1);
    const inCone = d < range && (dx * f.x + dz * f.y) / (d || 1) > 0.55;
    const heard = (koda.sprinting || air) && d < 4;
    // Crouched, anything waist-high hides him; standing, it has to be chest-high.
    // Once he's after you he looks all round, further: break his line of sight (round a corner,
    // behind a wall, over the river) and stay out of it for a few seconds to lose him, like GTA.
    const chasing = e.state === "alert" && d < 18;
    const sees = (inCone || heard || d < 1.3 || chasing) && sightClear(a.pos.x, a.pos.z, koda.pos.x, koda.pos.z, false, koda.sneaking ? 0.75 : 1.35);
    e.sees = sees;

    if (e.state !== "alert") {
      if (sees) {
        e.meter += dt * (koda.sneaking ? 0.5 : 1.1) * (1.3 - d / range);
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
        if (steer(e, tgt.x, tgt.z, e.speed, dt)) a.play("walk");
        else if (e.state === "patrol") { e.leg = (e.leg + 1) % e.route.length; e.wp = null; }
      }
      if (e.meter > 0.15) anySus = true;
      continue;
    }

    // Alerted: chase, square up, and swing only when face to face.
    anySeen = true;
    if (sees) { e.lastSeen.copy(koda.pos); e.searchT = Math.max(e.searchT, 4); } else e.searchT -= dt;
    if (e.searchT <= 0) { e.state = "suspicious"; e.meter = 0.6; a.play("walk"); if (attacker === e) attacker = null; continue; }
    // Mid-swing or mid-shout: plant the feet and keep facing him.
    if ((e.holdT = Math.max(0, (e.holdT || 0) - dt)) > 0) { a.face(Math.atan2(dx, dz), Math.min(1, dt * 10)); continue; }
    // A rider gallops up, then jumps down to fight on foot.
    if (e.horse && d < 3.4 && !koda.riding) { riderOff(e); e.holdT = Math.min(0.7, a.play("alert", { once: true, speed: 1.3 }) || 0.4); continue; }
    // One at a time: only the main attacker comes in. The rest wait their turn in a ring
    // around Koda, shuffling sideways, until it's theirs.
    if (attacker !== e && d < 8 && !e.horse) {
      const ringR = 3.4, ang = Math.atan2(a.pos.x - koda.pos.x, a.pos.z - koda.pos.z) + dt * 0.35 * (e.orbit || (e.orbit = Math.random() < 0.5 ? -1 : 1));
      const tx = koda.pos.x + Math.sin(ang) * ringR, tz = koda.pos.z + Math.cos(ang) * ringR;
      const mx = tx - a.pos.x, mz = tz - a.pos.z, md = Math.hypot(mx, mz);
      if (md > 0.15) moveWithCollision(a.pos, mx / md * Math.min(md, 3 * dt), mz / md * Math.min(md, 3 * dt), 0.45);
      a.face(Math.atan2(dx, dz), Math.min(1, dt * 8));
      a.play(md > 0.6 ? "walk" : a.has("fight_idle") ? "fight_idle" : "walk");
      continue;
    }
    // In reach from 1.6 m, out of reach past 2.1 m: no flicking between chasing and squaring up.
    e.inReach = e.inReach ? d < 2.1 : d < 1.6;
    if (!e.inReach) {
      if (steer(e, e.lastSeen.x, e.lastSeen.z, e.horse ? 9.5 : 5.2, dt, e.horse ? 3 : 8)) a.play("run");
      else { a.play(a.has("fight_idle") ? "fight_idle" : "walk"); a.face(Math.atan2(dx, dz), Math.min(1, dt * 8)); }
      continue;
    }
    // In range: always face him, hold contact distance.
    a.face(Math.atan2(dx, dz), Math.min(1, dt * 12));
    e.closing = e.closing ? d > CONTACT + 0.05 : d > CONTACT + 0.3;
    const closing = e.closing;
    if (closing) moveWithCollision(a.pos, dx / d * 2.5 * dt, dz / d * 2.5 * dt, 0.45);
    if (e.cool <= 0 && swingGap > 0) e.cool = 0.25;
    if (e.cool > 0) { a.play(closing ? "walk" : a.has("fight_idle") ? "fight_idle" : "walk"); continue; }
    // Guards mix it up: a jab, a combo or a kick.
    const roll = Math.random(), gm = a.native ? (roll < 0.5 ? "punch" : roll < 0.8 ? "combo" : "kick") : "punch";
    e.holdT = Math.min(gm === "combo" ? 1.1 : 0.8, a.play(gm, { once: true, speed: a.native ? 1.4 : 1.1 }) || 0.6); e.cool = gm === "combo" ? 1.7 : 1.35;
    swingGap = mission.index < 3 ? 1.1 : mission.index < 8 ? 0.8 : 0.55;
    later(0.36, () => {
      if (e.state !== "alert") return;
      const ddx = koda.pos.x - a.pos.x, ddz = koda.pos.z - a.pos.z, dd = Math.hypot(ddx, ddz);
      const ef = forward(a);
      if (dd < 1.6 && kUp() < 0.6 && (ddx * ef.x + ddz * ef.y) / (dd || 1) > 0.5) hurtKoda(1, a.pos.x, a.pos.z);
    });
  }
  // Guards don't stand inside each other.
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const p = enemies[i].a.pos, q = enemies[j].a.pos;
    if (enemies[i].state === "ko" || enemies[j].state === "ko") continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.9) { const push = (0.9 - d) / 2; p.x -= dx / d * push; p.z -= dz / d * push; q.x += dx / d * push; q.z += dz / d * push; }
  }
  // Koda and the guards are solid to each other.
  if (!air && kUp() < 0.5) for (const e of enemies) {
    if (e.state === "ko") continue;
    const p = e.a.pos, dx = koda.pos.x - p.x, dz = koda.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.001 && d < 0.85) {
      const push = 0.85 - d;
      moveWithCollision(koda.pos, dx / d * push * 0.6, dz / d * push * 0.6, 0.45, true);
      moveWithCollision(p, -dx / d * push * 0.4, -dz / d * push * 0.4, 0.45);
    }
  }
  drawEdge();
  drawDanger();
  const al = $("alert");
  al.className = "alert" + (anySeen ? " seen" : anySus ? " sus" : "");
  al.textContent = anySeen ? "SEEN" : anySus ? "?" : "";
}

// The screen edge glows on the side a threat is: yellow when someone is getting
// suspicious, red when they've seen you, deeper the closer they are.
const edgeEls = {};
function drawEdge() {
  const side = { top: [0, 0], right: [0, 0], bottom: [0, 0], left: [0, 0] };   // [yellow, red]
  const add = (x, z, level, red) => {
    const dx = x - koda.pos.x, dz = z - koda.pos.z, d = Math.hypot(dx, dz) || 1;
    const w = { right: dx / d, left: -dx / d, bottom: dz / d, top: -dz / d };
    for (const k in w) { const v = Math.max(0, w[k]) ** 0.7 * level; if (v > side[k][red ? 1 : 0]) side[k][red ? 1 : 0] = v; }
  };
  for (const e of enemies) {
    if (e.state === "ko") continue;
    const d = dist2(e.a.pos, koda.pos);
    if (e.state === "alert") add(e.a.pos.x, e.a.pos.z, clamp(1.15 - d / 16, 0.3, 1), true);
    else if (e.meter > 0.05) add(e.a.pos.x, e.a.pos.z, clamp(e.meter, 0.2, 0.9), false);
  }
  for (const dr of drones) if (dr.meter > 0.05 || dr.spotted > 0) add(dr.x, dr.z, dr.spotted > 0 ? 0.9 : clamp(dr.meter, 0.2, 0.9), dr.spotted > 0);
  for (const k in side) {
    const el = edgeEls[k] || (edgeEls[k] = $("edge-" + k));
    const [y, r] = side[k], red = r >= y * 0.8 && r > 0.02;
    const a = Math.max(y, r);
    el.style.opacity = a.toFixed(2);
    if (el.dataset.red !== String(red)) { el.dataset.red = String(red); el.classList.toggle("red", red); }
  }
}
// Edges of the screen glow yellow when a guard is getting suspicious and red when one
// is onto you, and an arc on the edge points to where each one is coming from.
const dangerCv = $("danger"), dangerCx = dangerCv.getContext("2d");
const dV = new THREE.Vector3();
function drawDanger() {
  const W = innerWidth, H = innerHeight;
  if (dangerCv.width !== W || dangerCv.height !== H) { dangerCv.width = W; dangerCv.height = H; }
  dangerCx.clearRect(0, 0, W, H);
  let level = 0, red = false;
  for (const e of enemies) {
    if (e.state === "ko") continue;
    const d = dist2(e.a.pos, koda.pos);
    const alerted = e.state === "alert";
    if (!alerted && e.meter < 0.08) continue;
    if (d > 26) continue;
    const near = clamp(1 - d / 26, 0, 1);
    const k = alerted ? 0.45 + near * 0.55 : Math.min(1, e.meter) * (0.4 + near * 0.6);
    level = Math.max(level, k); if (alerted) red = true;
    // Where he is, as seen on screen, pushed out to the edge.
    dV.set(e.a.pos.x, 1, e.a.pos.z).project(camera);
    let sx = dV.x, sy = -dV.y; if (dV.z > 1) { sx = -sx; sy = -sy; }
    const ang = Math.atan2(sy * H, sx * W);
    const onScreen = dV.z < 1 && Math.abs(dV.x) < 0.9 && Math.abs(dV.y) < 0.85;
    const rx = W / 2 - 14, ry = H / 2 - 14;
    dangerCx.beginPath();
    dangerCx.ellipse(W / 2, H / 2, rx, ry, 0, ang - 0.28, ang + 0.28);
    dangerCx.lineWidth = 7 + near * 9;
    dangerCx.lineCap = "round";
    dangerCx.strokeStyle = alerted ? `rgba(255,70,50,${(0.35 + k * 0.65).toFixed(2)})` : `rgba(242,181,68,${(0.3 + k * 0.6).toFixed(2)})`;
    dangerCx.shadowColor = alerted ? "rgba(255,40,30,.9)" : "rgba(242,181,68,.9)"; dangerCx.shadowBlur = 18;
    if (!onScreen || d > 4) dangerCx.stroke();
  }
  const edge = $("edge");
  edge.style.opacity = level.toFixed(2);
  edge.classList.toggle("red", red);
}
const queueRingGeo = new THREE.RingGeometry(0.55, 0.72, 32);
const queueRingMat = new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
function tintActor(a, r, g, b, k) {
  if (!a.mats) { a.mats = []; a.model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); a.mats.push(o.material); } }); }
  for (const m of a.mats) { if (m.emissive) { m.emissive.setRGB(r, g, b); m.emissiveIntensity = k; } }
}
function updateFightMarks(now) {
  for (const e of enemies) {
    const a = e.a;
    const waiting = e.state === "alert" && attacker && attacker !== e && dist2(a.pos, koda.pos) < 8;
    if (waiting) {
      if (!e.ring) { e.ring = new THREE.Mesh(queueRingGeo, queueRingMat); e.ring.rotation.x = -Math.PI / 2; scene.add(e.ring); }
      e.ring.visible = a.root.visible; e.ring.position.set(a.pos.x, a.pos.y + 0.06, a.pos.z);
    } else if (e.ring) e.ring.visible = false;
    // The one coming at you burns red; a hit flashes white for a moment.
    if (e.flash > 0) { e.flash -= 1 / 60; tintActor(a, 1, 1, 1, 1.2 * Math.max(0, e.flash) / 0.12); e.tinted = true; }
    else if (attacker === e && e.state === "alert") { tintActor(a, 1, 0.08, 0.05, 0.55 + 0.25 * Math.sin(now / 120)); e.tinted = true; }
    else if (e.tinted) { tintActor(a, 0, 0, 0, 0); e.tinted = false; }
  }
}

/* ---------- impacts: sparks on the side that was hit, a shake, a split-second freeze ---------- */
const sparkGeo = new THREE.PlaneGeometry(0.09, 0.09);
const sparks = [];
let hitStop = 0, shake = 0;
function impact(x, y, z, dirX, dirZ, strong, colour = 0xfff1b0) {
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const n = strong ? 16 : 10;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, mat.clone());
    m.position.set(x, y, z);
    // They fly out of the struck side, away from the blow.
    const spread = (Math.random() - 0.5) * 1.6, up = Math.random() * 3 + 1;
    const vx = dirX * (3 + Math.random() * 4) + -dirZ * spread * 3, vz = dirZ * (3 + Math.random() * 4) + dirX * spread * 3;
    sparks.push({ m, vx, vy: up, vz, t: 0.28 + Math.random() * 0.15 });
    scene.add(m);
  }
  // A ring of air where the blow landed.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.12, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.set(x, y, z); ring.lookAt(x + dirX, y, z + dirZ);
  sparks.push({ m: ring, ring: true, t: 0.22 });
  scene.add(ring);
  hitStop = strong ? 0.07 : 0.045; shake = strong ? 0.22 : 0.12;
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s2 = sparks[i]; s2.t -= dt;
    if (s2.ring) { s2.m.scale.multiplyScalar(1 + dt * 14); s2.m.material.opacity = Math.max(0, s2.t / 0.22); }
    else { s2.vy -= 9 * dt; s2.m.position.x += s2.vx * dt; s2.m.position.y += s2.vy * dt; s2.m.position.z += s2.vz * dt; s2.m.material.opacity = Math.max(0, s2.t / 0.3); s2.m.lookAt(camera.position); }
    if (s2.t <= 0) { scene.remove(s2.m); sparks.splice(i, 1); }
  }
}
function updateNpcs(dt) {
  for (const n of npcs) {
    const d = dist2(koda.pos, n.a.pos);
    n.a.root.visible = d < 60;
    if (d < 45) n.a.update(dt);
  }
}

/* ---------- where to go next ---------- */
// The way to go: a dashed gold line along the ground that pulses with the song.
// On each beat it brightens and a glow runs along it, then it fades back.
const pathLine = (() => {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uPhase: { value: 0 }, uLen: { value: 1 }, uColor: { value: new THREE.Color(0xffd27a) } },
    vertexShader: "attribute float along; varying float vA; void main() { vA = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uPhase; uniform float uLen; uniform vec3 uColor; varying float vA;
      void main() {
        float head = uPhase * 16.0;
        float wave = exp(-pow(vA - head, 2.0) / 4.0);
        float beatA = pow(1.0 - uPhase, 2.0);
        float fade = (1.0 - smoothstep(uLen - 6.0, uLen, vA)) * smoothstep(0.6, 2.0, vA);
        float dash = step(0.4, fract(vA / 1.2));
        float a = (0.08 + 0.5 * beatA + 0.55 * wave) * fade * dash;
        gl_FragColor = vec4(uColor * (1.0 + wave * 0.6), a);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);
  return { mesh, geo, mat };
})();
function buildPathLine(points) {
  // Resample every half metre, up to 32 metres out.
  const pts = [], along = [];
  let total = 0;
  for (let i = 0; i < points.length - 1 && total < 32; i++) {
    const a = points[i], b = points[i + 1], seg = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < seg && total < 60; d += 0.5, total += 0.5) { const t = d / seg; pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]); along.push(total); }
  }
  const last = points[points.length - 1]; pts.push([last.x, last.z]); along.push(total);
  const pos = new Float32Array(pts.length * 6), al = new Float32Array(pts.length * 2), idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const w = 0.07;   // a fine line, not a road marking
    const py = groundAt(p[0], p[1]); const ly = (py === MUD ? terrainAt(p[0], p[1]) : py) + 0.07;
    pos.set([p[0] - dz * w, ly, p[1] + dx * w, p[0] + dz * w, ly, p[1] - dx * w], i * 6);
    al[i * 2] = al[i * 2 + 1] = along[i];
    if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  pathLine.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pathLine.geo.setAttribute("along", new THREE.BufferAttribute(al, 1));
  pathLine.geo.setIndex(idx);
  pathLine.mat.uniforms.uLen.value = Math.max(2, total);
}
/* ---------- finding a way round buildings (for the guide arrow) ---------- */
const NAV = { cell: 1, ox: -ROAD + 1, oz: -ROAD + 1, w: 0, h: 0, grid: null };
function buildNav() {
  NAV.w = Math.ceil((WORLD_W + 2 * ROAD - 2) / NAV.cell); NAV.h = Math.ceil((WORLD_H + 2 * ROAD - 2) / NAV.cell);
  NAV.grid = new Uint8Array(NAV.w * NAV.h);
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++)
    NAV.grid[j * NAV.w + i] = blocked(NAV.ox + (i + 0.5) * NAV.cell, NAV.oz + (j + 0.5) * NAV.cell, 0.8) ? 1 : 0;
}
function navMark(b) {
  if (!NAV.grid) return;
  const i0 = Math.max(0, Math.floor((b.minX - 1.5 - NAV.ox) / NAV.cell)), i1 = Math.min(NAV.w - 1, Math.ceil((b.maxX + 1.5 - NAV.ox) / NAV.cell));
  const j0 = Math.max(0, Math.floor((b.minZ - 1.5 - NAV.oz) / NAV.cell)), j1 = Math.min(NAV.h - 1, Math.ceil((b.maxZ + 1.5 - NAV.oz) / NAV.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
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
  return sightClear(ax, az, bx, bz, true) && sightClear(ax + px, az + pz, bx + px, bz + pz, true) && sightClear(ax - px, az - pz, bx - px, bz - pz, true);
}
// The next point to head for on the way from (x, z) to (tx, tz).
function pathNext(x, z, tx, tz, full = false) {
  if (!NAV.grid || wideClear(x, z, tx, tz)) return full ? [{ x: tx, z: tz }] : { x: tx, z: tz };
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
  if (!found) return full ? [{ x: tx, z: tz }] : { x: tx, z: tz };
  // Walk back from the goal; return the furthest point still in plain sight.
  const path = [];
  for (let n = goal; n !== start; n = came[n]) path.push(n);
  path.reverse();
  if (full) {
    // The whole way, with straight runs merged.
    const out = []; let from = { x, z };
    const at = n => ({ x: NAV.ox + ((n % W) + 0.5) * NAV.cell, z: NAV.oz + (((n / W) | 0) + 0.5) * NAV.cell });
    let i = 0;
    while (i < path.length) {
      let j = i;
      while (j + 1 < path.length && wideClear(from.x, from.z, at(path[j + 1]).x, at(path[j + 1]).z, 0.4)) j++;
      from = at(path[j]); out.push(from); i = j + 1;
      if (out.length > 40) break;
    }
    out.push({ x: tx, z: tz });
    return out;
  }
  let pick = path[0];
  for (const n of path) {
    const px = NAV.ox + ((n % W) + 0.5) * NAV.cell, pz = NAV.oz + (((n / W) | 0) + 0.5) * NAV.cell;
    if (wideClear(x, z, px, pz)) pick = n; else break;
  }
  return { x: NAV.ox + ((pick % W) + 0.5) * NAV.cell, z: NAV.oz + (((pick / W) | 0) + 0.5) * NAV.cell };
}
let guideStep = null, guideT = 0;
// Walk a guard toward (tx, tz) the long way round anything in between. Returns false once there.
function steer(e, tx, tz, speed, dt, turn = 5) {
  const a = e.a;
  if (Math.hypot(tx - a.pos.x, tz - a.pos.z) < 0.6) return false;
  if ((e.wpT = (e.wpT || 0) - dt) <= 0 || !e.wp || Math.hypot(e.wp.x - a.pos.x, e.wp.z - a.pos.z) < 0.5) {
    e.wp = pathNext(a.pos.x, a.pos.z, tx, tz); e.wpT = 0.5;
  }
  const wx = e.wp.x - a.pos.x, wz = e.wp.z - a.pos.z, wd = Math.hypot(wx, wz) || 1;
  moveWithCollision(a.pos, wx / wd * speed * dt, wz / wd * speed * dt, 0.45);
  a.face(Math.atan2(wx, wz), Math.min(1, dt * turn));
  return true;
}
let guidePath = null;
/* ---------- the way there, by road ----------
   Places are walled in by ridges, so the way from one to the next is by road. The roads
   and places make a small network: every road point is a stop, and each place is a stop
   joined to the roads that come into it. The guide follows that network for the long way,
   and steps round things nearby on its own. */
const RN = { nodes: [], edges: [] };
function buildRoadNet() {
  const add = (x, z, zone = null) => { RN.nodes.push({ x, z, zone }); RN.edges.push([]); return RN.nodes.length - 1; };
  const link = (a, b) => { const d = Math.hypot(RN.nodes[a].x - RN.nodes[b].x, RN.nodes[a].z - RN.nodes[b].z); RN.edges[a].push([b, d]); RN.edges[b].push([a, d]); };
  const zoneNode = {};
  for (const q of S.quadrants) zoneNode[q.id] = add(q.x0 + q.w / 2, q.z0 + q.d / 2, q);
  const roadNodes = [];
  for (const r of WD.roads) {
    let prev = null;
    for (let k = 0; k + 1 < r.points.length; k++) {
      const [ax, az] = r.points[k], [bx, bz] = r.points[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 12));
      for (let i = k ? 1 : 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, id = add(x, z);
        roadNodes.push(id); if (prev !== null) link(prev, id); prev = id;
      }
    }
  }
  // Crossings and joins between roads, and road ends that reach into a place.
  for (let i = 0; i < roadNodes.length; i++) for (let j = i + 1; j < roadNodes.length; j++) {
    const a = RN.nodes[roadNodes[i]], b = RN.nodes[roadNodes[j]];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 9 && !RN.edges[roadNodes[i]].some(e => e[0] === roadNodes[j])) link(roadNodes[i], roadNodes[j]);
  }
  for (const id of roadNodes) {
    const n = RN.nodes[id];
    for (const q of S.quadrants) {
      const d = Math.hypot(Math.max(0, q.x0 - n.x, n.x - q.x0 - q.w), Math.max(0, q.z0 - n.z, n.z - q.z0 - q.d));
      if (d < 7) link(id, zoneNode[q.id]);
    }
  }
}
// The stop to start from: the place he's in, or the nearest road point he can walk to.
function nearestStop(x, z) {
  const q = zoneAt(x, z); if (q) return RN.nodes.findIndex(n => n.zone === q);
  let best = 0, bd = 1e9;
  RN.nodes.forEach((n, i) => { if (n.zone) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}
function roadRoute(x, z, tx, tz) {
  const a = nearestStop(x, z), b = nearestStop(tx, tz);
  if (a === b) return [];
  const N = RN.nodes.length, dist = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[a] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const [v, w] of RN.edges[u]) if (ud + w < dist[v]) { dist[v] = ud + w; came[v] = u; }
  }
  if (came[b] < 0) return [];
  const out = [];
  for (let n = b; n !== a; n = came[n]) out.push(RN.nodes[n]);
  out.reverse();
  // Skip the middle of the place he's in and the place he's going to: go straight for the road.
  const keep = out.filter(n => !n.zone);
  return keep.map(n => ({ x: n.x, z: n.z }));
}
function guideRoute(x, z, tx, tz) {
  const here = zoneAt(x, z), there = zoneAt(tx, tz);
  if ((here && here === there) || (Math.hypot(tx - x, tz - z) < 40 && wideClear(x, z, tx, tz))) return pathNext(x, z, tx, tz, true);
  const way = roadRoute(x, z, tx, tz);
  if (!way.length) return pathNext(x, z, tx, tz, true);
  // Drop road points already behind him, then find a way round anything to the next one.
  while (way.length > 1 && Math.hypot(way[0].x - x, way[0].z - z) < 10) way.shift();
  const lead = pathNext(x, z, way[0].x, way[0].z, true);
  return lead.concat(way.slice(1), [{ x: tx, z: tz }]);
}
function updateGuide(now, dt) {
  // Walk up to an unlit prayer point: a hint to pray.
  const sh = shrines.find(x => Math.hypot(koda.pos.x - x.x, koda.pos.z - x.z) < 3 && !(save.shrines && save.shrines[x.q.id]));
  if (sh && sh !== updateGuide.hinted) { updateGuide.hinted = sh; popText("ACTION: PRAY"); }
  for (const x of shrines) x.flame.rotation.y += dt * 1.2;
  updateSway(now);
  updateAmbient(dt);
  updateHorses(dt);
  updateCritters(performance.now());
  updateDust(dt);
  updateFlyers(dt);
  const goal = objectiveTarget();
  const d = goal ? Math.hypot(goal.x - koda.pos.x, goal.z - koda.pos.z) : 0;
  // The route shows on the radar, GTA style; nothing is drawn on the ground.
  pathLine.mesh.visible = false;
  if (!goal || d <= 3) { guidePath = null; return; }
  if ((guideT -= dt) <= 0 || !guidePath) {
    guidePath = guideRoute(koda.pos.x, koda.pos.z, goal.x, goal.z);
    guideT = 0.35;
  }
  return;
  // Pulse with the song: phase 0 on the beat.
  const spb = beat.bpm ? beat.spb : 0.55;
  const ph = beat.bpm && music.started ? (((songTime() - beat.offset) / spb) % 1 + 1) % 1 : (now / 1000 / spb) % 1;
  pathLine.mat.uniforms.uPhase.value = ph;
}

/* ---------- the marker over what to do next ---------- */
const markerV = new THREE.Vector3(), markerK = new THREE.Vector3(), markerFwd = new THREE.Vector3(), markerRight = new THREE.Vector3();
function updateMarker() {
  const el = $("marker"), t = objectiveTarget();
  if (!t || state !== "play") { el.classList.add("hidden"); return; }
  const d = Math.hypot(t.x - koda.pos.x, t.z - koda.pos.z);
  // Pinned to the ground it marks: places sit at different heights, so a fixed height would
  // make the pin slide about as the camera turns.
  markerV.set(t.x, floorAt(t.x, t.z) + 2.2, t.z).project(camera);
  const W = innerWidth, H = innerHeight, m = 46;
  let x = (markerV.x + 1) / 2 * W, y = (1 - markerV.y) / 2 * H;
  const behind = markerV.z > 1;
  const off = behind || x < m || x > W - m || y < 90 || y > H - m;
  const half = Math.max(m, ($("markerText").offsetWidth || 120) / 2 + 10);
  if (off) {
    // Off screen: pin it to the edge in the direction of the goal as seen from above, measured
    // from Koda on screen. Projecting a point behind the camera flips it to the wrong side,
    // so the direction comes from the camera's own left-right and forward along the ground.
    camera.getWorldDirection(markerFwd); markerFwd.y = 0; if (markerFwd.lengthSq() < 1e-6) markerFwd.set(0, 0, -1); markerFwd.normalize();
    markerRight.set(-markerFwd.z, 0, markerFwd.x);
    const gx = t.x - koda.pos.x, gz = t.z - koda.pos.z;
    const sx = gx * markerRight.x + gz * markerRight.z, sy = -(gx * markerFwd.x + gz * markerFwd.z);
    markerK.set(koda.pos.x, koda.pos.y + 1, koda.pos.z).project(camera);
    const kx = (markerK.x + 1) / 2 * W, ky = (1 - markerK.y) / 2 * H, L = Math.hypot(sx, sy) || 1;
    const ux = sx / L, uy = sy / L, top = 150, bottom = H - m;
    // Walk out from Koda along that direction until the edge of the safe area.
    const tx = ux > 0 ? (W - half - kx) / ux : ux < 0 ? (half - kx) / ux : 1e9, ty = uy > 0 ? (bottom - ky) / uy : uy < 0 ? (top - ky) / uy : 1e9;
    const k = Math.max(0, Math.min(tx, ty));
    x = kx + ux * k; y = ky + uy * k;
  }
  x = clamp(x, half, W - half); y = clamp(y, off ? 150 : 90, H - m);   // clear of the HUD and tips when pinned to the edge
  el.classList.remove("hidden");
  el.classList.toggle("edge", off);
  el.style.transform = `translate(${x}px, ${y}px)`;
  $("markerText").textContent = (t.label || "") + (d > 6 && !t.rough ? ` · ${Math.round(d)}m` : "");
  if (off) {
    const ang = Math.atan2(y - (1 - markerK.y) / 2 * H, x - (markerK.x + 1) / 2 * W);   // points away from Koda, toward the goal
    $("markerArrow").style.transform = `rotate(${ang}rad)`;
  }
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
    mm.fillRect(ox + o.x * k, oz + o.y * k, q.w * k, q.d * k);
    if (q === currentQuad) { mm.strokeStyle = "#fff"; mm.lineWidth = 1.5; mm.strokeRect(ox + o.x * k + 1, oz + o.y * k + 1, q.w * k - 2, q.d * k - 2); }
    if (qd && qd.done) { mm.fillStyle = "#7fe39a"; mm.font = "bold 12px sans-serif"; mm.textAlign = "center"; mm.fillText("✓", ox + (o.x + q.w / 2) * k, oz + (o.y + q.d / 2) * k + 4); }
  }
  mm.fillStyle = "rgba(140,96,56,.9)";
  for (const m of muds) mm.fillRect(ox + m.minX * k, oz + m.minZ * k, (m.maxX - m.minX) * k, (m.maxZ - m.minZ) * k);
  if (zora && zora.waiting) { mm.fillStyle = "#d58cff"; mm.beginPath(); mm.arc(ox + zora.pos.x * k, oz + zora.pos.z * k, 3.5, 0, 7); mm.fill(); }
  if (escape) { mm.fillStyle = "#ffd27a"; mm.beginPath(); mm.arc(ox + escape.exit.x * k, oz + escape.exit.y * k, 3.5, 0, 7); mm.fill(); }
  for (const e of enemies) if (e.state === "alert") { mm.fillStyle = "#ff5a46"; mm.fillRect(ox + e.a.pos.x * k - 1, oz + e.a.pos.z * k - 1, 2.5, 2.5); }
  mm.fillStyle = "#fff"; mm.beginPath(); mm.arc(ox + koda.pos.x * k, oz + koda.pos.z * k, 3, 0, 7); mm.fill();
}

/* ---------- the round radar (left): turns with the camera, so up is the way the screen looks ---------- */
const radarCv = $("radar"), rc = radarCv.getContext("2d");
let radarYaw = 0;
const hexCol = n => "#" + n.toString(16).padStart(6, "0");
function drawRadar(dt) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), css = radarCv.clientWidth || 140;
  if (radarCv.width !== Math.round(css * dpr)) { radarCv.width = radarCv.height = Math.round(css * dpr); }
  const S2 = radarCv.width, R0 = S2 / 2, range = 42, k = (R0 - 4) / range;
  radarYaw = angleLerp(radarYaw, cam.heading, Math.min(1, dt * 6));
  rc.setTransform(1, 0, 0, 1, 0, 0);
  rc.clearRect(0, 0, S2, S2);
  rc.save();
  rc.beginPath(); rc.arc(R0, R0, R0 - 2, 0, 7); rc.clip();
  rc.fillStyle = "rgba(10,10,14,.78)"; rc.fillRect(0, 0, S2, S2);
  // World to radar: centred on Koda, turned so his heading points up.
  rc.translate(R0, R0); rc.rotate(Math.PI + radarYaw); rc.scale(k, k); rc.translate(-koda.pos.x, -koda.pos.z);
  rc.fillStyle = "rgba(255,255,255,.05)";
  for (const q of S.quadrants) {
    const o = zoneOrigin(q), qd = mission && mission.quads.find(x => x.q === q);
    rc.fillStyle = qd ? (qd.done ? "rgba(255,255,255,.10)" : hexCol(PART_COLOURS[qd.k]) + "44") : "rgba(255,255,255,.05)";
    rc.fillRect(o.x, o.y, q.w, q.d);
  }
  rc.lineCap = "round"; rc.lineJoin = "round";
  const roadLine = r => { rc.beginPath(); r.points.forEach(([x, z], i) => i ? rc.lineTo(x, z) : rc.moveTo(x, z)); };
  for (const r of WD.roads) { rc.strokeStyle = "rgba(0,0,0,.7)"; rc.lineWidth = r.width + 2.5 / k; roadLine(r); rc.stroke(); }
  for (const r of WD.roads) { rc.strokeStyle = "rgba(225,222,214,.55)"; rc.lineWidth = r.width; roadLine(r); rc.stroke(); }
  rc.fillStyle = "rgba(140,96,56,.95)";
  for (const m of muds) rc.fillRect(m.minX, m.minZ, m.maxX - m.minX, m.maxZ - m.minZ);
  for (const b of nearBlocks(koda.pos.x, koda.pos.z, range + 10)) {
    if (b.mud) continue;
    rc.fillStyle = b.top - b.base >= 3 ? "rgba(190,190,200,.55)" : "rgba(190,190,200,.22)";
    rc.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
  }
  rc.fillStyle = "rgba(255,210,122,.25)";
  for (const a of roofs) rc.fillRect(a.x - a.w / 2, a.z - a.d / 2, a.w, a.d);
  // Parts you can see, people to talk to, guards.
  const dot = (x, z, r, col) => { rc.fillStyle = col; rc.beginPath(); rc.arc(x, z, r / k, 0, 7); rc.fill(); };
  if (mission) for (const qd of mission.quads) if (qd.orb && !qd.hidden && !qd.done) dot(qd.orb.position.x, qd.orb.position.z, 4, hexCol(PART_COLOURS[qd.k]));
  for (const n of npcs) dot(n.a.pos.x, n.a.pos.z, 3, "#9fd3ff");
  for (const e of enemies) {
    if (e.state === "ko") continue;
    if (e.hidden && e.state !== "alert" && !(e.qd && e.qd.revealT > 0)) continue;
    dot(e.a.pos.x, e.a.pos.z, 3.2, e.state === "alert" ? "#ff5a46" : e.meter > 0.1 ? "#f2b544" : "rgba(255,120,100,.6)");
  }
  for (const d of drones) dot(d.x, d.z, 3, d.spotted > 0 ? "#ff5a46" : "#fff1a8");
  for (const sh of shrines) dot(sh.x, sh.z, 3.5, save.shrines && save.shrines[sh.q.id] ? "#ffd27a" : "#8a8578");
  // The way to go, along the roads, like a GTA route.
  if (guidePath && guidePath.length) {
    const line = [{ x: koda.pos.x, z: koda.pos.z }, ...guidePath];
    for (const [col, w] of [["rgba(20,4,30,.9)", 7], ["#c86bff", 4]]) {
      rc.strokeStyle = col; rc.lineWidth = w * dpr / k; rc.beginPath();
      line.forEach((p, i) => i ? rc.lineTo(p.x, p.z) : rc.moveTo(p.x, p.z)); rc.stroke();
    }
  }
  rc.restore();
  // The objective: on the radar if it's in range, pinned to the rim if not.
  const t = objectiveTarget();
  if (t) {
    let dx = t.x - koda.pos.x, dz = t.z - koda.pos.z;
    const c = Math.cos(Math.PI + radarYaw), s2 = Math.sin(Math.PI + radarYaw);
    let px = (dx * c - dz * s2) * k, pz = (dx * s2 + dz * c) * k;
    const len = Math.hypot(px, pz), lim = R0 - 9;
    if (len > lim) { px *= lim / len; pz *= lim / len; }
    rc.save(); rc.translate(R0 + px, R0 + pz); rc.rotate(Math.PI / 4);
    rc.fillStyle = "#ffd27a"; rc.strokeStyle = "#1b1203"; rc.lineWidth = 2 * dpr;
    rc.fillRect(-5 * dpr, -5 * dpr, 10 * dpr, 10 * dpr); rc.strokeRect(-5 * dpr, -5 * dpr, 10 * dpr, 10 * dpr);
    rc.restore();
  }
  // North, on the rim.
  const nA = Math.atan2(-Math.cos(Math.PI + radarYaw), Math.sin(Math.PI + radarYaw));
  rc.fillStyle = "#fff"; rc.font = `900 ${10 * dpr}px Inter, sans-serif`; rc.textAlign = "center"; rc.textBaseline = "middle";
  rc.fillText("N", R0 + Math.cos(nA) * (R0 - 10 * dpr), R0 + Math.sin(nA) * (R0 - 10 * dpr));
  // Koda: an arrow in the middle, pointing the way he faces.
  {
    const A = Math.PI + radarYaw, fx = Math.sin(koda.yaw), fz = Math.cos(koda.yaw);
    const sx = fx * Math.cos(A) - fz * Math.sin(A), sy = fx * Math.sin(A) + fz * Math.cos(A);
    rc.save(); rc.translate(R0, R0); rc.rotate(Math.atan2(sx, -sy));
    rc.fillStyle = "#fff"; rc.strokeStyle = "#000"; rc.lineWidth = 1.5 * dpr; rc.beginPath();
    rc.moveTo(0, -8 * dpr); rc.lineTo(6 * dpr, 6 * dpr); rc.lineTo(0, 2.5 * dpr); rc.lineTo(-6 * dpr, 6 * dpr); rc.closePath(); rc.stroke(); rc.fill();
    rc.restore();
  }
  rc.strokeStyle = "rgba(255,255,255,.3)"; rc.lineWidth = 1 * dpr; rc.beginPath(); rc.arc(R0, R0, R0 - 1, 0, 7); rc.stroke();
}

/* ---------- the big map (pause) ---------- */
/* The pause map fills the screen. It opens on Koda; drag to look round, pinch, scroll or
   use + and - to zoom, the target button to come back to Koda. Roads are drawn bright
   with a dark edge so the way through is always clear, and the route to the next goal
   runs along them in purple. */
const MAPV = { zoom: 2.2, cx: 0, cz: 0, hills: null };
function mapHills() {
  if (MAPV.hills) return MAPV.hills;
  const step = 3, w = Math.ceil((WORLD_W + 2 * ROAD) / step), h = Math.ceil((WORLD_H + 2 * ROAD) / step);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = -ROAD + i * step, z = -ROAD + j * step, r = ridgeAt(x, z), o = (j * w + i) * 4;
    if (r < 0.6) { img.data[o + 3] = 0; continue; }
    const t = Math.min(1, r / 7);
    img.data[o] = 58 + 52 * t; img.data[o + 1] = 58 + 48 * t; img.data[o + 2] = 56 + 40 * t; img.data[o + 3] = 110 + 145 * t;
  }
  g.putImageData(img, 0, 0);
  return (MAPV.hills = c);
}
function mapCentreOnKoda() { if (koda) { MAPV.cx = koda.pos.x; MAPV.cz = koda.pos.z; } }
function drawBigMap() {
  const cv = $("bigmap"), dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || innerWidth, cssH = cv.clientHeight || innerHeight;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  const g = cv.getContext("2d");
  const fit = Math.min(cv.width / (WORLD_W + 2 * ROAD), cv.height / (WORLD_H + 2 * ROAD)) * 0.94;
  MAPV.zoom = clamp(MAPV.zoom, 1, 10);
  const k = fit * MAPV.zoom;
  // Keep the city on screen however far it's dragged.
  const halfW = cv.width / 2 / k, halfH = cv.height / 2 / k;
  const span = (lo, hi, half) => hi - lo <= half * 2 ? [(lo + hi) / 2, (lo + hi) / 2] : [lo + half, hi - half];
  const [ax, bx] = span(-ROAD, WORLD_W + ROAD, halfW), [az, bz] = span(-ROAD, WORLD_H + ROAD, halfH);
  MAPV.cx = clamp(MAPV.cx, ax, bx); MAPV.cz = clamp(MAPV.cz, az, bz);
  const X = x => cv.width / 2 + (x - MAPV.cx) * k, Z = z => cv.height / 2 + (z - MAPV.cz) * k;
  MAPV.toWorld = (px, pz) => ({ x: MAPV.cx + (px * dpr - cv.width / 2) / k, z: MAPV.cz + (pz * dpr - cv.height / 2) / k });
  MAPV.k = k / dpr;
  g.fillStyle = "#0c0b10"; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#2a2c30"; g.fillRect(X(-ROAD), Z(-ROAD), (WORLD_W + 2 * ROAD) * k, (WORLD_H + 2 * ROAD) * k);
  // Hills and the dunes: the borders you can't cross.
  g.imageSmoothingEnabled = true;
  g.drawImage(mapHills(), X(-ROAD), Z(-ROAD), (WORLD_W + 2 * ROAD) * k, (WORLD_H + 2 * ROAD) * k);
  for (const q of S.quadrants) {
    const o = zoneOrigin(q), qd = mission && mission.quads.find(x => x.q === q);
    g.fillStyle = qd ? (qd.done ? "#2f4334" : hexCol(PART_COLOURS[qd.k]) + "38") : "#34363c";
    g.fillRect(X(o.x), Z(o.y), q.w * k, q.d * k);
    if (qd) { g.strokeStyle = qd.done ? "#7fe39a" : hexCol(PART_COLOURS[qd.k]); g.lineWidth = 2 * dpr; g.strokeRect(X(o.x), Z(o.y), q.w * k, q.d * k); }
  }
  g.fillStyle = "#7a5a3c"; for (const m of muds) g.fillRect(X(m.minX), Z(m.minZ), (m.maxX - m.minX) * k, (m.maxZ - m.minZ) * k);
  g.fillStyle = "#b08850"; for (const f of floats) g.fillRect(X(f.x - f.w / 2), Z(f.z - f.d / 2), f.w * k, f.d * k);
  // Roads: a dark edge, then the bright road on top, so every street reads at a glance.
  g.lineCap = "round"; g.lineJoin = "round";
  const roadPath = r => { g.beginPath(); r.points.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); };
  for (const r of WD.roads) { g.strokeStyle = "#08080a"; g.lineWidth = Math.max(4 * dpr, r.width * k) + 3 * dpr; roadPath(r); g.stroke(); }
  for (const r of WD.roads) { g.strokeStyle = /bridge/i.test(r.name) ? "#cdb68a" : "#e8e3d6"; g.lineWidth = Math.max(4 * dpr, r.width * k); roadPath(r); g.stroke(); }
  for (const b of blockers) {
    if (b.mud || (b.top - b.base) < 2.5) continue;
    g.fillStyle = b.building ? "#5d5b68" : "#4a4952";
    g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
  }
  // The way to the next goal, along the roads.
  const t = objectiveTarget();
  if (t && koda) {
    let pts = null;
    try { pts = guideRoute(koda.pos.x, koda.pos.z, t.x, t.z); } catch (e) { pts = null; }
    if (pts && pts.length) {
      const line = [{ x: koda.pos.x, z: koda.pos.z }, ...pts];
      for (const [col, w] of [["#1a0626", 8], ["#c86bff", 4.5]]) {
        g.strokeStyle = col; g.lineWidth = w * dpr; g.beginPath();
        line.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.stroke();
      }
    }
  }
  // Names and what each lit place holds.
  g.textAlign = "center"; g.textBaseline = "middle";
  const fs = clamp(k * 6, 11 * dpr, 18 * dpr), fs2 = fs * 0.82;
  for (const q of S.quadrants) {
    const c = zoneCenter(q), qd = mission && mission.quads.find(x => x.q === q);
    g.font = `900 ${fs}px Inter, sans-serif`; g.lineWidth = 4 * dpr; g.strokeStyle = "rgba(0,0,0,.85)";
    g.fillStyle = qd ? "#fff" : "rgba(255,255,255,.7)";
    g.strokeText(q.name.toUpperCase(), X(c.x), Z(c.y) - (qd ? fs * 0.8 : 0)); g.fillText(q.name.toUpperCase(), X(c.x), Z(c.y) - (qd ? fs * 0.8 : 0));
    if (qd) {
      const kind = { explore: "clue", sneak: "sneak", fight: "arena", race: "rooftops", rubble: "rubble", help: "help", blind: "hidden patrols", copies: "find her", pads: "pads", piano: "piano", chase: "chase" }[qd.focus] || qd.focus;
      g.font = `800 ${fs2}px Inter, sans-serif`; g.fillStyle = qd.done ? "#7fe39a" : hexCol(PART_COLOURS[qd.k]);
      const l1 = qd.done ? `${qd.partName} \u2713` : qd.partName;
      g.strokeText(l1, X(c.x), Z(c.y) + fs * 0.8); g.fillText(l1, X(c.x), Z(c.y) + fs * 0.8);
      if (!qd.done) { g.strokeText(kind, X(c.x), Z(c.y) + fs * 0.8 + fs2 * 1.2); g.fillText(kind, X(c.x), Z(c.y) + fs * 0.8 + fs2 * 1.2); }
    }
  }
  const pin = (x, z, col, label) => {
    g.fillStyle = col; g.strokeStyle = "#000"; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(X(x), Z(z), 7 * dpr, 0, 7); g.fill(); g.stroke();
    if (label) { g.font = `800 ${12 * dpr}px Inter, sans-serif`; g.lineWidth = 4 * dpr; g.strokeText(label, X(x), Z(z) - 15 * dpr); g.fillText(label, X(x), Z(z) - 15 * dpr); }
  };
  for (const sh of shrines) { const lit = save.shrines && save.shrines[sh.q.id]; g.fillStyle = lit ? "#ffd27a" : "#55524a"; g.strokeStyle = "#000"; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(X(sh.x), Z(sh.z), 6 * dpr, 0, 7); g.fill(); g.stroke(); }
  if (zora && zora.waiting) pin(zora.pos.x, zora.pos.z, "#d58cff", "ZORA");
  if (escape) pin(escape.exit.x, escape.exit.y, "#ffd27a", "EXIT");
  if (t) { g.save(); g.translate(X(t.x), Z(t.z)); g.rotate(Math.PI / 4); g.fillStyle = "#ffd27a"; g.strokeStyle = "#000"; g.lineWidth = 2 * dpr; g.fillRect(-8 * dpr, -8 * dpr, 16 * dpr, 16 * dpr); g.strokeRect(-8 * dpr, -8 * dpr, 16 * dpr, 16 * dpr); g.restore(); }
  // Koda, pointing the way he faces.
  if (koda) {
    g.save(); g.translate(X(koda.pos.x), Z(koda.pos.z)); g.rotate(-koda.yaw + Math.PI);
    g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 2.5 * dpr; g.beginPath();
    g.moveTo(0, -12 * dpr); g.lineTo(8 * dpr, 8 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-8 * dpr, 8 * dpr); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
  $("mapSong").textContent = mission && mission.def.free ? "Free roam" : mission ? `Mission ${mission.index + 1}: ${mission.def.song}  \u00b7  ${mission.quads.filter(q => q.done).length}/${mission.quads.length} parts` : "";
}
(function mapControls() {
  const cv = $("bigmap"), pts = new Map();
  let pinch = 0;
  const redraw = () => { if (state === "paused") drawBigMap(); };
  const zoomAt = (f, px, pz) => {
    const before = MAPV.toWorld ? MAPV.toWorld(px, pz) : null;
    MAPV.zoom = clamp(MAPV.zoom * f, 1, 10);
    drawBigMap();
    if (before) { const after = MAPV.toWorld(px, pz); MAPV.cx += before.x - after.x; MAPV.cz += before.z - after.z; }
    redraw();
  };
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  cv.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { MAPV.cx -= (e.clientX - p.x) / (MAPV.k || 1); MAPV.cz -= (e.clientY - p.y) / (MAPV.k || 1); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); }
      pinch = d; return;
    }
    redraw();
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });
  $("mapIn").addEventListener("click", () => zoomAt(1.4, innerWidth / 2, innerHeight / 2));
  $("mapOut").addEventListener("click", () => zoomAt(1 / 1.4, innerWidth / 2, innerHeight / 2));
  $("mapMe").addEventListener("click", () => { mapCentreOnKoda(); redraw(); });
  $("pauseToggle").addEventListener("click", () => $("pause").querySelector(".pause-bar").classList.toggle("closed"));
  addEventListener("resize", redraw);
})();

/* ---------- camera ---------- */
const camTarget = new THREE.Vector3();
let camZoom = 1;
const camOff = new THREE.Vector3();
// The guard Koda is fighting, if any: the nearest alerted one close by.
function fightFoe() {
  let best = null, bd = 6;
  for (const e of enemies) {
    if (e.state !== "alert") continue;
    const d = dist2(koda.pos, e.a.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/* ---------- day and night ----------
   The city has its own clock: a full day passes every 16 minutes of play. The sun
   swings across the sky, the street lamps come on at dusk, and at night guards see
   less unless you're under a lamp. Each mission starts at its own hour. */
const DAY = { hour: 18, speed: 24 / (16 * 60), light: 1, dir: new THREE.Vector3(14, 30, 8) };
const C_NIGHT = new THREE.Color(0x0b0d18), C_DUSK = new THREE.Color(0x3f2a45), C_DAY = new THREE.Color(0x7d93ad);
const S_NIGHT = new THREE.Color(0x8fa6ff), S_DUSK = new THREE.Color(0xff9a5a), S_DAY = new THREE.Color(0xfff0d8);
const tmpC = new THREE.Color();
function updateDayNight(dt) {
  DAY.hour = (DAY.hour + dt * DAY.speed + 24) % 24;
  const h = DAY.hour, up = Math.sin((h - 6) / 12 * Math.PI);   // 1 at noon, 0 at 6:00 and 18:00, below 0 at night
  const day = clamp(up * 1.8 + 0.25, 0, 1), dusk = clamp(1 - Math.abs(up) * 3, 0, 1);
  DAY.light = day;
  // Sun by day, moon by night: always some light to play by.
  const az = (h / 24) * Math.PI * 2;
  DAY.dir.set(Math.cos(az) * 22, 14 + Math.max(0, up) * 22, Math.sin(az) * 12 + 8);
  if (up > 0) tmpC.copy(S_DUSK).lerp(S_DAY, clamp(up * 2.5, 0, 1)); else tmpC.copy(S_DUSK).lerp(S_NIGHT, clamp(-up * 4, 0, 1));
  sun.color.copy(tmpC); sun.intensity = 0.55 + 2.3 * day;
  hemi.intensity = 0.32 + 0.5 * day;
  if (up > 0) tmpC.copy(C_DUSK).lerp(C_DAY, clamp(up * 2.2, 0, 1)); else tmpC.copy(C_DUSK).lerp(C_NIGHT, clamp(-up * 4, 0, 1));
  scene.fog.color.copy(tmpC); scene.background.copy(tmpC);
  scene.fog.near = 30 + 10 * day; scene.fog.far = 75 + 35 * day;
  lampBulbMat.emissiveIntensity = 0.15 + 2.6 * (1 - day);
  renderer.toneMappingExposure = 0.42 + 0.63 * day;
  lampBulbMat.emissiveIntensity *= 1.6 - 0.6 * day;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
  const el = $("dayClock"); if (el) { el.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; el.dataset.night = day < 0.35 ? "1" : ""; }
}
// Near a lit lamp at night you're as easy to see as by day.
const litBy = (x, z) => DAY.light > 0.6 || lamps.some(l => Math.abs(l.x - x) < 7 && Math.abs(l.z - z) < 7);
let kodaRing = null;
function updateCamera(dt, snap) {
  if (window.GILL_NOCAM) return;
  // In a fight the camera moves in on the two of them, and pulls back out once he's down.
  const foe = state === "play" ? fightFoe() : null;
  camZoom += ((foe ? 0.5 : 1) - camZoom) * Math.min(1, dt * (foe ? 3 : 1.5));
  if (snap) camZoom = foe ? 0.5 : 1;
  const lead = koda.moving && !foe ? 1.6 : 0;
  if (foe) camTarget.set((koda.pos.x + foe.a.pos.x) / 2, 0.9, (koda.pos.z + foe.a.pos.z) / 2);
  else camTarget.set(koda.pos.x + Math.sin(koda.yaw) * lead, terrainAt(koda.pos.x, koda.pos.z) + 0.8 + Math.max(0, kUp()) * 0.7, koda.pos.z + Math.cos(koda.yaw) * lead);
  {
    // Slow and steady: a full push turns about 50 degrees a second, and it eases in and out.
    const wantYaw = -stickCurve(pad.rx || 0) * 0.85, wantPitch = stickCurve(pad.ry || 0) * 0.4;
    cam.yawV += (wantYaw - cam.yawV) * Math.min(1, dt * 3.5);
    cam.pitchV += (wantPitch - cam.pitchV) * Math.min(1, dt * 3.5);
    // Zoom: LB and RB on a controller, - and = on the keyboard, the mouse wheel.
    const zin = (pad.zoom || 0) + (keys.has("Minus") ? 1 : 0) - (keys.has("Equal") ? 1 : 0);
    cam.zoomV += (zin * 0.9 - cam.zoomV) * Math.min(1, dt * 8);
    if (Math.abs(cam.zoomV) > 0.005) cam.zoom = clamp(cam.zoom * Math.exp(cam.zoomV * dt), 0.45, 2.2);
    if (cam.view === 1) {
      if (Math.abs(cam.yawV) > 0.01) { cam.heading += cam.yawV * dt; cam.look = 4; }
      if (Math.abs(cam.pitchV) > 0.01) cam.pitch = clamp(cam.pitch + cam.pitchV * dt, -0.25, 0.9);
    }
  }
  if (cam.view === 1) {
    // Close: follow behind him. When he runs, the camera swings round behind him; after you look
    // round yourself it waits a moment first.
    cam.look = Math.max(0, cam.look - dt);
    // The camera only drifts back behind him slowly while he runs, and never for a few
    // seconds after you've turned it yourself: you aim it, it doesn't pull.
    if (koda.moving && !cam.look && !foe) { const d = angleLerp(cam.heading, koda.yaw, 1) - cam.heading; if (Math.abs(d) < 2.4) cam.heading = angleLerp(cam.heading, koda.yaw, Math.min(1, dt * 0.45)); }
    const dist = (4.6 + (foe ? 0.8 : 0)) * cam.zoom, fx = Math.sin(cam.heading), fz = Math.cos(cam.heading);
    const ty = terrainAt(koda.pos.x, koda.pos.z) + Math.max(0, kUp()) + 1.5;
    camTarget.set(koda.pos.x + fx * 2.2, ty, koda.pos.z + fz * 2.2);
    // Up and down on the right stick tilt the camera over him, or down to his shoulder.
    const el = 0.19 + cam.pitch, reach = Math.hypot(dist + 2.2, 1.3);
    camOff.set(-fx * reach * Math.cos(el), reach * Math.sin(el), -fz * reach * Math.cos(el));
    // Don't sit inside a hill or a building behind him.
    const cx = camTarget.x + camOff.x, cz = camTarget.z + camOff.z;
    const floor = Math.max(terrainAt(cx, cz), ...nearBlocks(cx, cz, 0.5).filter(b => !b.mud && cx > b.minX && cx < b.maxX && cz > b.minZ && cz < b.maxZ).map(b => b.top));
    if (ty + camOff.y < floor + 1.2) camOff.y = floor + 1.2 - ty;
  } else if (cam.view === 2) {
    camOff.set(0, 21 * cam.zoom, 0.4);
  } else camOff.copy(CAM_OFFSET).multiplyScalar(camZoom * cam.zoom);
  const want = camTarget.clone().add(camOff);
  // Never inside the land: the camera rides over hills and slopes instead of through them.
  for (let s = 0.25; s <= 1.001; s += 0.25) {
    const px = camTarget.x + camOff.x * s, pz = camTarget.z + camOff.z * s, py = camTarget.y + camOff.y * s;
    const floor = terrainAt(px, pz) + 0.9;
    if (py < floor) want.y += (floor - py) / s;
  }
  if (snap) camera.position.copy(want); else camera.position.lerp(want, Math.min(1, dt * (cam.view === 1 ? 8 : 5)));
  camera.lookAt(camera.position.clone().sub(camOff));
  if (cam.view === 2) { scene.fog.near = Math.max(scene.fog.near, 60); scene.fog.far = Math.max(scene.fog.far, 140); }
  if (themeState.roll) camera.rotation.z += themeState.roll;
  if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake * 0.6; }
  // From the top he gets a ring on the ground, so he's easy to find on any surface.
  if (!kodaRing) { kodaRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })); kodaRing.rotation.x = -Math.PI / 2; kodaRing.renderOrder = 2; scene.add(kodaRing); }
  kodaRing.visible = cam.view === 2 && state !== "title";
  if (kodaRing.visible) kodaRing.position.set(koda.pos.x, koda.pos.y + 0.06, koda.pos.z);
  sun.position.set(koda.pos.x + DAY.dir.x * 3, koda.pos.y + DAY.dir.y * 3, koda.pos.z + DAY.dir.z * 3);
  sun.target.position.set(koda.pos.x, terrainAt(koda.pos.x, koda.pos.z), koda.pos.z);
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
  } else if (state === "build" && koda) {
    updateBuild(real);
  } else if (koda && (state === "card" || state === "score")) {
    koda.update(real); if (zora) zora.update(real);
  }
  if (state === "play" || state === "build") updateCoop(real);
  if ((frame.n = (frame.n || 0) + 1) % 30 === 0) { showHudBuild(); showRoomButtons(); }
  if (state === "build") { updateSway(now); updateAmbient(real); updateFlyers(real); updateHorses(real); }
  if (!window.GILL_NORENDER) renderer.render(scene, camera);
}
// Time left on the song. Red for the last 20 seconds.
function drawClock() {
  const el = $("timer");
  // How long you've been at it. There's no time limit: the song loops until it's complete.
  const t = Math.floor(mission.t);
  el.textContent = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  el.classList.remove("low");
}
// Indoors, the building he is in turns see-through so he and the camera can see the room.
let insideB = null;
function updateInside() {
  let now = null;
  if (koda) for (const b of nearBlocks(koda.pos.x, koda.pos.z, 0.5)) if (b.interior && koda.pos.x > b.minX && koda.pos.x < b.maxX && koda.pos.z > b.minZ && koda.pos.z < b.maxZ) { now = b; break; }
  if (now === insideB) return;
  const see = (b, on) => { if (b) for (const m of b.mats || []) { m.transparent = on; m.opacity = on ? 0.15 : 1; m.depthWrite = !on; m.needsUpdate = true; } };
  see(insideB, false); see(now, true); insideB = now;
  if (now) popText("INSIDE");
}
function tick(dt, now) {
  updateInside();
  for (const m of CLUE_MADE) if (m.clueMesh) m.clueMesh.visible = B.on;
  if (!(tick.cullT > now - 250)) {
    tick.cullT = now;
    const cx = camera.position.x, cz = camera.position.z, r = (scene.fog ? scene.fog.far : 110) + 40;
    for (const m of FAR_CULL) m.visible = (m.position.x - cx) ** 2 + (m.position.z - cz) ** 2 < r * r;
  }
  if (hitStop > 0) { hitStop -= dt; updateSparks(dt); updateCamera(dt); return; }
  mission.t += dt;
  runTimers(dt);
  updateBeat();
  updateDayNight(dt);
  if (mission.def.theme) applyTheme(mission.def.theme, dt);
  updateFloats(mission.t);
  updateBoost(dt);
  updateKoda(dt);
  updateDrones(dt, now);
  updateGhost(dt);
  updateAwnings();
  updateEnemies(dt);
  updateFightMarks(now);
  updateSparks(dt);
  updateNpcs(dt);
  updateQuads(dt, now);
  updateZora(dt);
  settleCrowd();
  updateOcclusion();
  updateGuide(now, dt);
  updateMarker();
  if ((mmT -= dt) <= 0) { drawMinimap(); mmT = 0.1; }
  drawRadar(dt);
  if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
  if (tipT > 0 && (tipT -= dt) <= 0) nextTip();
  drawClock();
  updateCamera(dt);
}

/* ---------- screens ---------- */
function pause() { if (state !== "play") return; state = "paused"; $("marker").classList.add("hidden"); $("pause").classList.remove("hidden"); if (music.ac) music.ac.suspend(); mapCentreOnKoda(); renderTravel(); drawBigMap(); }
function resume() { $("pause").classList.add("hidden"); state = "play"; lastT = performance.now(); if (music.ac) music.ac.resume(); }
$("pauseBtn").addEventListener("click", pause);
$("resumeBtn").addEventListener("click", resume);
$("muteBtn").addEventListener("click", () => { setMuted(!music.muted); $("muteBtn").textContent = "Music: " + (music.muted ? "off" : "on"); });
$("quitBtn").addEventListener("click", () => { $("pause").classList.add("hidden"); toTitle(); });

/* Title backdrop: Koda's moves, one after another, each slowly zooming in and fading through. */
const SHOW = ["flying_kick", "takedown", "spin_kick", "power_slide", "ground_pound", "wall_kick", "heavy_smash", "air_dash", "storm_shield", "triple_jump", "long_boost", "record_magnet"];
const show = { i: 0, timer: 0 };
function titleShowStep() {
  const box = $("titleShow");
  if (!box || $("title").classList.contains("hidden")) { show.timer = 0; return; }
  const img = new Image();
  img.alt = ""; img.decoding = "async";
  img.src = "../run/assets/cards/" + SHOW[show.i++ % SHOW.length] + ".webp";
  box.appendChild(img);
  while (box.children.length > 2) box.firstChild.remove();
  show.timer = setTimeout(titleShowStep, 8000);
}
function titleShowStart() { if (!show.timer) titleShowStep(); }
function showBuildBtn() {
  const b = $("buildBtn");
  if (canBuild || (typeof coop !== "undefined" && coop.ch) || (typeof myWorld !== "undefined" && myWorld)) { b.classList.remove("hidden"); b.disabled = false; b.textContent = coop && coop.ch ? "Build together" : myWorld ? "Build my world" : "Build the city"; return; }
  const why = /[?&]build=1/.test(location.search) && buildWhyNot;
  b.classList.toggle("hidden", !why); b.disabled = true; if (why) b.textContent = buildWhyNot;
}
function toTitle() {
  state = "title";
  if (myWorld) leaveWorld();
  stopMusic();
  $("hud").classList.add("hidden"); $("touch").classList.add("hidden"); $("score").classList.add("hidden");
  $("title").classList.remove("hidden");
  titleShowStart();
  showBuildBtn();
  const next = save.unlocked;
  $("playBtn").textContent = next > 0 ? `Continue: Mission ${next + 1}` : "Play";
  $("missionList").innerHTML = S.missions.map((m, i) => {
    const b = save.best[i];
    const open = i <= save.unlocked;
    return `<button class="mission${open ? "" : " locked"}" data-i="${i}" ${open ? "" : "disabled"}><span>${i + 1}</span><b>${m.song}</b><em>${b ? b.grade : open ? "" : "locked"}</em></button>`;
  }).join("");
  $("missionList").querySelectorAll("button.mission:not(.locked)").forEach(btn => btn.addEventListener("click", () => begin(+btn.dataset.i)));
}
// On phones the game takes the whole screen and turns sideways, so you see more of the city.
function goLandscape() {
  if (!phone) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const lock = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* not supported */ } };
  if (req && !document.fullscreenElement) { try { const r = req.call(el); if (r && r.then) r.then(lock).catch(() => {}); else lock(); } catch (e) { /* not allowed */ } }
  else lock();
}
// Held upright, the game pauses behind the "turn your phone" card.
if (phone && window.matchMedia) { const mq = matchMedia("(orientation: portrait)"); const onTurn = () => { if (mq.matches) pause(); }; mq.addEventListener ? mq.addEventListener("change", onTurn) : mq.addListener(onTurn); }
// No pinch or double-tap zoom anywhere in the game.
for (const ev of ["gesturestart", "gesturechange", "dblclick"]) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", e => { const t = performance.now(); if (t - lastTouchEnd < 320 && !e.target.closest(".screen")) e.preventDefault(); lastTouchEnd = t; }, { passive: false });
function begin(i) {
  audioCtx();               // sound has to start from a tap
  goLandscape();
  $("title").classList.add("hidden");
  $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  state = "play";
  startMission(i);
}
$("playBtn").addEventListener("click", () => begin(save.unlocked));
// Free roam: the whole city, no mission. Walk, explore, light prayer points, meet people, build with a room.
function startFreeRoam() {
  audioCtx(); goLandscape();
  $("title").classList.add("hidden"); $("hud").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  clearMission();
  mission = { index: -1, def: { song: "Free roam", quadrants: [], free: true }, t: 0, limit: 1e9, quads: [], stats: { kos: 0, takedowns: 0, seenCount: 0, hurt: 0, onBeat: 0 }, order: [], finished: false };
  health = 5; drawHearts(); drawMixer();
  lunge = null; air = null; attackLock = 0; invuln = 0; comboStep = 0; race = null; currentQuad = null; koda.sinking = null; koda.pushing = null;
  if (!koda.parent) scene.add(koda.root);
  const q0 = S.quadrants[0], c = zoneCenter(q0), spot = freeSpot(c.x, c.y + q0.d / 2 - 6);
  koda.pos.set(spot.x, groundAt(spot.x, spot.z), spot.z); koda.face(Math.PI, 1); koda.play("idle");
  lastSafe.copy(koda.pos);
  applyTheme(null, 0, true);
  DAY.hour = 16; updateDayNight(0);
  state = "play";
  updateCamera(0, true);
  refreshObjective();
  loadInv(); drawInventory();
  wakePlacedEnforcers();
  spawnRoadRiders();
  showRoomButtons(); showHudBuild();
  toast("Free roam. The city is yours. Hold ACTION by trees, rocks and sand to gather.", 3.5);
  setTimeout(roamRadio, 3600);
}
$("roamBtn").addEventListener("click", startFreeRoam);
$("btnView").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); setView(cam.view + 1); });
// In free roam: a Build button when this player can build here (their world, a room, or an admin).
$("btnBuildHud").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (state === "play" && mission && mission.def.free) startBuild(); });
function showHudBuild() { $("btnBuildHud").classList.toggle("hidden", !(state === "play" && mission && mission.def.free)); }

/* ---------- the city's own pieces, and build mode ----------
   Pieces placed in build mode are kept on Feelz Machine (table gill_world_pieces) and
   built into everyone's city when the game loads. Only Feelz Machine admins can build.

   Build mode: walk around as Koda. A see-through copy of the chosen piece sits a few
   metres in front of him, on the ground. Turn it, drop it, or pick up the piece it's
   touching. Pieces snap to half-metre steps and quarter turns. */
const ONLINE = (() => {
  // Any real web address (feelzmachine.com, www., previews). Only a copy on this computer stays offline.
  const local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local || !window.supabase || !window.supabase.createClient) return null;
  return window.supabase.createClient("https://bycdnwenbjusxpowojdb.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Y2Rud2VuYmp1c3hwb3dvamRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjIzOTYsImV4cCI6MjA4NTA5ODM5Nn0.ixUISqTydgNOKJn9w_p7po15mG9kE25yL0HbHprRHj4",
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
})();
let canBuild = false;
let buildWhyNot = "";
async function checkBuilder() {
  if (/[?&]build=1/.test(location.search) && !ONLINE) return (canBuild = true);   // trying it out offline: nothing is saved
  if (!ONLINE) return false;
  try {
    const { data: s } = await ONLINE.auth.getSession();
    if (!s || !s.session) { buildWhyNot = `Sign in to Feelz Machine at ${location.host} in this browser, then reload.`; return false; }
    const { data } = await ONLINE.rpc("is_platform_admin");
    canBuild = data === true;
    if (!canBuild) buildWhyNot = "This Feelz Machine account isn't an admin, so it can't build.";
  } catch (e) { canBuild = false; buildWhyNot = "Couldn't reach Feelz Machine to check."; }
  return canBuild;
}

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a736b, roughness: 1, flatShading: true });
const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 0.9, flatShading: true });
const palmMat = new THREE.MeshStandardMaterial({ color: 0x5b8a3a, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8279, roughness: 0.95 });
const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3b3a40, metalness: 0.5, roughness: 0.5 });
const stepMat = new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.9 });
const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, metalness: 0.6, roughness: 0.4 });

// Everything you can place. w, d, h in metres.
const ENFORCER_NAMES = { sentinel: "Sentinel", guard: "Guard", "street-warden": "Street warden", hunter: "Hunter", handler: "Handler", gilded: "Gilded" };
const PIECES = [
  ...BUILDINGS.map(m => ({ kind: "building", model: m, name: { tenement: "Tenement", hostel: "Hostel", "kodas-building": "Koda's building" }[m] || m.toUpperCase(), cat: "Buildings", w: 20, d: 20, h: 16 })),
  { kind: "clue", name: "Clue spot", cat: "Story", w: 1, d: 1, h: 1.2 },
  { kind: "crate", name: "Crate", cat: "Cover", w: 1.1, d: 1.1, h: 0.95, prop: "crate" },
  { kind: "stack", name: "Crate stack", cat: "Cover", w: 1.2, d: 1.2, h: 2, prop: "stack" },
  { kind: "bin", name: "Bin", cat: "Cover", w: 0.7, d: 0.7, h: 1, prop: "bin" },
  { kind: "dumpster", name: "Dumpster", cat: "Cover", w: 2.2, d: 1.3, h: 1.5, prop: "dumpster" },
  { kind: "barrier", name: "Barrier", cat: "Cover", w: 2.6, d: 0.6, h: 0.85, prop: "barrier" },
  { kind: "bench", name: "Bench", cat: "Cover", w: 2, d: 0.7, h: 0.6, prop: "bench" },
  { kind: "wall", name: "Wall", cat: "Cover", w: 6, d: 0.5, h: 2.4 },
  { kind: "fence", name: "Fence", cat: "Cover", w: 6, d: 0.2, h: 1.8 },
  { kind: "stairs", name: "Stairs", cat: "Climb", w: 3, d: 6, h: 3 },
  { kind: "stairs", name: "Tall stairs", cat: "Climb", w: 3, d: 10, h: 6 },
  { kind: "platform", name: "Platform", cat: "Climb", w: 6, d: 6, h: 3 },
  { kind: "platform", name: "Ledge", cat: "Climb", w: 4, d: 2, h: 1.5 },
  { kind: "awning", name: "Awning", cat: "Climb", w: 4.5, d: 3.2, h: 3 },
  { kind: "rubble", name: "Rubble", cat: "Cover", w: 3, d: 3, h: 1.2 },
  { kind: "tree", name: "Tree", cat: "Nature", w: 1, d: 1, h: 7 },
  { kind: "palm", name: "Palm", cat: "Nature", w: 1, d: 1, h: 8 },
  { kind: "bush", name: "Bush", cat: "Nature", w: 2, d: 2, h: 1.3 },
  { kind: "rock", name: "Rock", cat: "Nature", w: 3, d: 2.5, h: 1.8 },
  { kind: "boulder", name: "Boulder", cat: "Nature", w: 6, d: 5, h: 4 },
  { kind: "lamp", name: "Street lamp", cat: "Nature", w: 0.4, d: 0.4, h: 4.4 },
  // Blocks: one metre cubes that stack, Minecraft style. Tiles: ground to lay down.
  { kind: "block", name: "Wood", cat: "Blocks", w: 1, d: 1, h: 1, mat: "wood", cost: { wood: 1 } },
  { kind: "block", name: "Stone", cat: "Blocks", w: 1, d: 1, h: 1, mat: "stone", cost: { stone: 1 } },
  { kind: "block", name: "Brick", cat: "Blocks", w: 1, d: 1, h: 1, mat: "brick", cost: { stone: 1, sand: 1 } },
  { kind: "block", name: "Sandstone", cat: "Blocks", w: 1, d: 1, h: 1, mat: "sandstone", cost: { sand: 2 } },
  { kind: "block", name: "Glass", cat: "Blocks", w: 1, d: 1, h: 1, mat: "glass", cost: { sand: 3 } },
  { kind: "block", name: "Leaves", cat: "Blocks", w: 1, d: 1, h: 1, mat: "leaves", cost: { wood: 1 } },
  { kind: "tile", name: "Grass", cat: "Ground", w: 2, d: 2, h: 0.12, mat: "grass", cost: { wood: 1 } },
  { kind: "tile", name: "Sand", cat: "Ground", w: 2, d: 2, h: 0.12, mat: "sand", cost: { sand: 1 } },
  { kind: "tile", name: "Paving", cat: "Ground", w: 2, d: 2, h: 0.12, mat: "stone", cost: { stone: 1 } },
  { kind: "tile", name: "Glass road", cat: "Ground", w: 2, d: 2, h: 0.12, mat: "glassroad", cost: { sand: 2 } },
  { kind: "tile", name: "Water", cat: "Ground", w: 2, d: 2, h: 0.12, mat: "water", cost: { stone: 1 } },
  // The F.I.L.L. kit: real stonework, doors, windows and roofs that snap together.
  { kind: "kit", model: "k-corner", name: "Cut stone", cat: "Walls", w: 1, d: 1, h: 1, grid: 1, stack: true, cost: { stone: 2 } },
  { kind: "kit", model: "k-wall", name: "Stone wall", cat: "Walls", w: 2, d: 1, h: 1.2, grid: 1, stack: true, cost: { stone: 3 } },
  { kind: "kit", model: "k-pillar", name: "Pillar", cat: "Walls", w: 0.5, d: 0.5, h: 3, grid: 0.5, stack: true, cost: { stone: 2 } },
  { kind: "kit", model: "k-win-closed", name: "Blue door", cat: "Walls", w: 1.4, d: 0.5, h: 2.4, grid: 0.5, stack: true, pass: true, cost: { wood: 2, metal: 1 } },
  { kind: "kit", model: "k-win-half", name: "Wooden door", cat: "Walls", w: 1.2, d: 0.5, h: 2.3, grid: 0.5, stack: true, pass: true, cost: { wood: 2 } },
  { kind: "kit", model: "k-win-open", name: "Arched window", cat: "Walls", w: 1.6, d: 0.6, h: 2.2, grid: 0.5, stack: true, cost: { stone: 2, wood: 1 } },
  { kind: "kit", model: "k-roof-flat", name: "Tin roof", cat: "Walls", w: 3, d: 3, h: 0.3, grid: 1, stack: true, walk: true, cost: { metal: 2 } },
  { kind: "kit", model: "k-roof-gentle", name: "Lean-to roof", cat: "Walls", w: 3, d: 3, h: 2.2, grid: 1, stack: true, cost: { wood: 3 } },
  { kind: "kit", model: "k-roof-steep", name: "Sloped tin roof", cat: "Walls", w: 3, d: 3, h: 1.5, grid: 1, stack: true, cost: { metal: 3 } },
  { kind: "kit", model: "k-walkway", name: "Plank walkway", cat: "Climb", w: 4, d: 2, h: 0.4, grid: 1, stack: true, walk: true, cost: { wood: 2 } },
  { kind: "kit", model: "k-switchback", name: "Metal stairs", cat: "Climb", w: 6, d: 6, h: 6, grid: 1, walk: true, cost: { metal: 6 } },
  { kind: "kit", model: "k-lift", name: "Lift cage", cat: "Climb", w: 3, d: 3, h: 3, grid: 1, walk: true, cost: { metal: 4 } },
  { kind: "kit", model: "climbtower", name: "Climbing tower", cat: "Climb", w: 4, d: 4, h: 16, grid: 1, walk: true, cost: { metal: 10, stone: 6 } },
  { kind: "kit", model: "k-washpost", name: "Post", cat: "Market", w: 0.5, d: 0.5, h: 2.5, grid: 0.5, cost: { wood: 1 } },
  { kind: "kit", model: "stall", name: "Food stall", cat: "Market", w: 4.2, d: 3.2, h: 3.2, grid: 0.5, cost: { wood: 4 } },
  { kind: "kit", model: "booth", name: "Kiosk", cat: "Market", w: 2.4, d: 2, h: 3, grid: 0.5, cost: { metal: 3 } },
  { kind: "kit", model: "billboard", name: "Billboard", cat: "Market", w: 10, d: 1.2, h: 10, grid: 0.5, cost: { metal: 4, wood: 2 } },
  { kind: "kit", model: "handcart", name: "Hand cart", cat: "Market", w: 2.4, d: 1.4, h: 1.2, grid: 0.5, walk: true, low: true, cost: { wood: 2 } },
  { kind: "kit", model: "container", name: "Container", cat: "Industrial", w: 6, d: 2.5, h: 2.6, grid: 0.5, stack: true, walk: true, cost: { metal: 6 } },
  { kind: "kit", model: "generator", name: "Generator", cat: "Industrial", w: 2.4, d: 1.6, h: 1.8, grid: 0.5, walk: true, cost: { metal: 4 } },
  { kind: "kit", model: "conveyor", name: "Conveyor", cat: "Industrial", w: 4, d: 1.6, h: 1.1, grid: 0.5, walk: true, low: true, cost: { metal: 3 } },
  { kind: "kit", model: "valve", name: "Pipe valve", cat: "Industrial", w: 2, d: 1, h: 2, grid: 0.5, walk: true, cost: { metal: 2 } },
  { kind: "kit", model: "chimney", name: "Steam chimney", cat: "Industrial", w: 1, d: 1, h: 6, grid: 0.5, cost: { metal: 3 } },
  { kind: "kit", model: "vent", name: "Steam vent", cat: "Industrial", w: 2.2, d: 2.2, h: 1.5, grid: 0.5, walk: true, low: true, cost: { metal: 2 } },
  { kind: "kit", model: "turnstile", name: "Turnstile", cat: "Industrial", w: 3, d: 3, h: 1.6, grid: 0.5, cost: { metal: 2 } },
  { kind: "kit", model: "hedge", name: "Planted hedge", cat: "Nature", w: 3, d: 1.4, h: 1.5, grid: 0.5, walk: true, low: true, cost: { wood: 1, stone: 1 } },
  { kind: "kit", model: "fountain", name: "Fountain", cat: "Nature", w: 7, d: 7, h: 3.5, grid: 0.5, walk: true, cost: { stone: 8 } },
  { kind: "kit", model: "firepit", name: "Fire pit", cat: "Nature", w: 6, d: 6, h: 1.4, grid: 0.5, pass: true, cost: { stone: 3, wood: 2 } },
  { kind: "kit", model: "rocks", name: "Rock spire", cat: "Nature", w: 3, d: 2, h: 8, grid: 0.5, cost: { stone: 4 } },
  { kind: "kit", model: "obelisk", name: "Rune obelisk", cat: "Landmarks", w: 1.2, d: 1.2, h: 6, grid: 0.5, cost: { stone: 6 } },
  { kind: "kit", model: "checkpoint", name: "City gate", cat: "Landmarks", w: 10, d: 4, h: 7, grid: 0.5, gate: true, cost: { stone: 10, metal: 6 } },
  { kind: "kit", model: "veilheart", name: "Veil ring", cat: "Landmarks", w: 5, d: 0.8, h: 5, grid: 0.5, pass: true, cost: { glass: 6 } },
  { kind: "kit", model: "commtower", name: "Comm tower", cat: "Landmarks", w: 3, d: 3, h: 16, grid: 0.5, cost: { metal: 10 } },
  // Stores: what a place sells, for credits from Feelz Run. Walk up and press ACTION to shop.
  ...[["general", "General store"], ["wood", "Timber yard"], ["stone", "Quarry"], ["sand", "Sand pit"], ["metal", "Scrap yard"], ["glass", "Glassworks"]].map(([sells, name]) =>
    ({ kind: "store", model: sells === "general" ? "booth" : "stall", sells, name, cat: "Stores", w: sells === "general" ? 2.6 : 4.2, d: sells === "general" ? 2.2 : 3.2, h: 3.2, grid: 0.5 })),
  // Enforcers: stand one where it should patrol. In free roam and your worlds they come alive.
  ...Object.keys(ENEMIES).map(k => ({ kind: "enforcer", model: k, name: ENFORCER_NAMES[k] || k, cat: "Enforcers", w: 1, d: 1, h: 2 })),
  // On horseback: they patrol further and faster, and ride you down.
  ...Object.keys(ENEMIES).filter(k => k !== "gilded").map(k => ({ kind: "enforcer", model: "horse:" + k, name: "Mounted " + (ENFORCER_NAMES[k] || k).toLowerCase(), cat: "Enforcers", w: 1, d: 2.4, h: 2.6 })),
  // Street furniture, Veil wreckage and more, made in Meshy. These keep their own shape (scaled to height).
  { kind: "kit", model: "busstop", name: "Bus shelter", cat: "Street", w: 4, d: 2, h: 3, grid: 0.5, uniform: true, cost: { metal: 3, glass: 2 } },
  { kind: "kit", model: "phonebox", name: "Phone box", cat: "Street", w: 1.2, d: 1.2, h: 2.4, grid: 0.5, uniform: true, cost: { metal: 2, glass: 2 } },
  { kind: "kit", model: "pump", name: "Petrol pump", cat: "Street", w: 1, d: 0.8, h: 2, grid: 0.5, uniform: true, cost: { metal: 3 } },
  { kind: "kit", model: "planter", name: "Planter", cat: "Street", w: 1.4, d: 1.4, h: 1.6, grid: 0.5, uniform: true, cost: { stone: 1, wood: 1 } },
  { kind: "kit", model: "produce", name: "Produce table", cat: "Market", w: 2, d: 1.2, h: 1.4, grid: 0.5, uniform: true, cost: { wood: 2 } },
  { kind: "kit", model: "watertank", name: "Water tank", cat: "Industrial", w: 3, d: 3, h: 6, grid: 0.5, uniform: true, cost: { metal: 6 } },
  { kind: "kit", model: "barrels", name: "Oil drums", cat: "Industrial", w: 2.4, d: 2, h: 1.2, grid: 0.5, uniform: true, walk: true, cost: { metal: 2 } },
  { kind: "kit", model: "dish", name: "Satellite dish", cat: "Industrial", w: 2.5, d: 2.5, h: 4, grid: 0.5, uniform: true, cost: { metal: 4 } },
  { kind: "kit", model: "lampfall", name: "Fallen street light", cat: "Wreckage", w: 5, d: 1.6, h: 1.4, grid: 0.5, uniform: true, walk: true, cost: { metal: 1 } },
  { kind: "kit", model: "trafficfall", name: "Toppled traffic light", cat: "Wreckage", w: 4.5, d: 1.6, h: 1.4, grid: 0.5, uniform: true, walk: true, cost: { metal: 1 } },
  { kind: "kit", model: "carwreck", name: "Car wreck", cat: "Wreckage", w: 4, d: 2, h: 1.5, grid: 0.5, uniform: true, walk: true, cost: { metal: 2 } },
  { kind: "kit", model: "cat", name: "Cat (sitting)", cat: "Animals", w: 0.3, d: 0.45, h: 0.42, grid: 0.25, uniform: true, pass: true, critter: true },
  { kind: "kit", model: "cat2", name: "Cat (resting)", cat: "Animals", w: 0.3, d: 0.55, h: 0.25, grid: 0.25, uniform: true, pass: true, critter: true },
  // Animals: a horse to ride, or a rail with horses tied to it.
  { kind: "horse", name: "Horse", cat: "Animals", w: 0.8, d: 2.4, h: 2.2 },
  { kind: "hitch", name: "Hitched horses", cat: "Animals", w: 4, d: 3.6, h: 2.2, cost: { wood: 3 } }
];
const BLOCK_MATS = {
  wood: new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: 0.95, flatShading: true }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa4503a, roughness: 0.9 }),
  sandstone: new THREE.MeshStandardMaterial({ color: 0xd8c08e, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd8e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.85, flatShading: true }),
  grass: new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 0.95 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xe0c48e, roughness: 1 }),
  glassroad: new THREE.MeshStandardMaterial({ color: 0x7fb3aa, roughness: 0.18, metalness: 0.25 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3f8fb5, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 })
};
const pieceDef = rec => PIECES.find(p => p.kind === rec.kind && (rec.kind === "store" ? p.name === rec.label || p.sells === rec.sells : (rec.kind !== "building" && rec.kind !== "kit" && rec.kind !== "enforcer") || p.model === rec.model) && (rec.kind !== "block" && rec.kind !== "tile" || p.name === rec.label)) || PIECES.find(p => p.kind === rec.kind);

// Stairs: a slope you walk up. Height at (x, z) on them.
function rampTop(b, x, z) {
  const r = b.ramp;
  if (r.follow) return terrainAt(x, z) + 0.07;   // a causeway: it lies on the land like the road
  const t = clamp(r.axis === "x" ? (x - b.minX) / (b.maxX - b.minX) : (z - b.minZ) / (b.maxZ - b.minZ), 0, 1);
  return b.base + r.h * (r.up > 0 ? t : 1 - t);
}

// Build one piece into the world. Returns what it made, so it can be taken away again.
async function makePiece(rec) {
  const def = pieceDef(rec) || {};
  const turn = Math.round((rec.rot || 0) / (Math.PI / 2)) & 3;
  const w = turn % 2 ? rec.d : rec.w, d = turn % 2 ? rec.w : rec.d, h = rec.h;
  const x = rec.x, z = rec.z, base = rec.y != null ? rec.y : terrainAt(x, z);
  const made = { rec, meshes: [], blocks: [], roofs: [], lamps: [] };
  const box = (mat, bw, bh, bd, ox = 0, oy = 0, oz = 0) => {
    const m = new THREE.Mesh(propGeo, mat); m.scale.set(bw, bh, bd); m.position.set(x + ox, base + oy + bh / 2, z + oz);
    m.castShadow = true; m.receiveShadow = true; scene.add(m); made.meshes.push(m); return m;
  };
  const block = extra => { const b = Object.assign({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: base + h, base, mats: [], faded: false, piece: made }, extra); blockers.push(b); navMark(b); made.blocks.push(b); return b; };
  if (rec.kind === "clue") {
    // A hidden song part's spot: a gold marker seen only while building.
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0xf2b544 }));
    m.position.set(x, base + 1.1, z); m.visible = B.on; scene.add(m); made.meshes.push(m); made.clueMesh = m;
    CLUE_MADE.push(made);
    return made;
  }
  if (rec.kind === "building") {
    const before = blockers.length;
    await placeBuilding(rec.model, x, z, rec.rot || 0, h, Math.max(w, d), true);
    for (const b of blockers.slice(before)) { b.piece = made; made.blocks.push(b); made.meshes.push(b.mesh); navMark(b); if (rec.interior) b.interior = true; }
  } else if (rec.kind === "kit" || rec.kind === "store") {
    // A kit piece, fitted exactly to its size so pieces line up and stack.
    const mdl = rec.model || def.model;
    staticModel(mdl).then(src => {
      if (!src || made.gone) return;
      const m = src.clone(true), box0 = new THREE.Box3().setFromObject(m), sz = box0.getSize(new THREE.Vector3());
      if (def.uniform) m.scale.setScalar(rec.h / Math.max(0.01, sz.y));   // its own shape, at its real height
      else m.scale.set(rec.w / Math.max(0.01, sz.x), rec.h / Math.max(0.01, sz.y), rec.d / Math.max(0.01, sz.z));
      m.rotation.y = (def.uniform ? (rec.rot || 0) : turn * Math.PI / 2);
      const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
      m.position.set(x - c.x, base - b2.min.y, z - c.z);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (rec.kind === "store") tintStall(m, ["general", "wood", "stone", "sand", "metal", "glass"].indexOf(def.sells) % STALL_TINTS.length);
      scene.add(m); made.meshes.push(m);
      if (def.critter) critters.push({ m, base: m.scale.y, ph: Math.random() * 6, made });
      // Its real footprint, once its shape is known.
      if (def.uniform && made.blocks[0]) { const b = made.blocks[0], bb = new THREE.Box3().setFromObject(m); b.minX = bb.min.x; b.maxX = bb.max.x; b.minZ = bb.min.z; b.maxZ = bb.max.z; b.top = bb.max.y; navMark(b); }
    });
    if (rec.kind === "store") { made.store = def.sells; stores.push(made); }
    if (!def.pass) block({ walk: !!def.walk || !!def.stack, low: !!def.low || h <= 1.2, store: rec.kind === "store" ? def.sells : undefined });
  } else if (rec.kind === "enforcer") {
    // Shown standing at its post (or sat on its horse); in free roam a real one patrols from here.
    const mounted = /^horse:/.test(rec.model || ""), kind = mounted ? rec.model.slice(6) : rec.model;
    const hidden = state === "play" && mission && mission.def.free;
    if (mounted) { made.horse = makeHorse(x, z, rec.rot || 0, { coat: HORSE_COATS[Math.abs(Math.round(x * 3 + z)) % HORSE_COATS.length], cloth: ENFORCER_CLOTH, owner: "piece" }); made.horse.hidden = hidden; }
    makeActor(kind + ".glb", ENEMIES[kind] || 1.9).then(a => {
      if (!a || made.gone) return;
      a.pos.set(x, base, z); a.face(rec.rot || 0, 1); if (mounted) { seat(a, true); made.horse.rider = a; }
      a.play(a.has("fight_idle") ? "fight_idle" : "walk"); a.update(0.01); a.root.visible = !hidden; scene.add(a.root); made.meshes.push(a.root); made.actor = a;
    }).catch(() => null);
  } else if (rec.kind === "horse") {
    made.horse = makeHorse(x, z, rec.rot || 0, { coat: HORSE_COATS[Math.abs(Math.round(x * 3 + z)) % HORSE_COATS.length], cloth: HORSE_CLOTHS[Math.abs(Math.round(x + z * 5)) % HORSE_CLOTHS.length], owner: "piece" });
  } else if (rec.kind === "hitch") {
    const hb = addHitch(x, z, rec.rot || 0, 2);
    made.meshes.push(hb.g); hb.b.piece = made; made.blocks.push(hb.b); navMark(hb.b); made.hitch = hb.horses;
    for (const h of hb.horses) h.owner = "piece";
  } else if (rec.kind === "block" || rec.kind === "tile") {
    const m = box(BLOCK_MATS[(def && def.mat) || "stone"] || BLOCK_MATS.stone, w, h, d);
    if (rec.kind === "tile") m.castShadow = false;
    block({ walk: true, low: rec.kind === "tile" || h <= 1 });
  } else if (def.prop) {
    const P = PROP(def.prop);
    box(P.mat, w, h, d);
    block({ walk: true, low: P.low, prop: def.prop });
  } else if (rec.kind === "wall") { box(wallMat, w, h, d); block({ walk: true }); }
  else if (rec.kind === "fence") { box(fenceMat, w, h, d); block({ walk: false }); }
  else if (rec.kind === "platform") { box(roofTopMat, w, h, d); block({ walk: true }); }
  else if (rec.kind === "rubble") { for (let i = 0; i < 6; i++) box(rubbleMat, w * (0.3 + (i % 3) * 0.15), h * (0.4 + (i % 2) * 0.5), d * (0.35 + (i % 2) * 0.2), (i % 3 - 1) * w * 0.25, 0, ((i >> 1) % 3 - 1) * d * 0.25); block({ walk: true, low: true }); }
  else if (rec.kind === "stairs") {
    // Steps rise along the piece's depth, toward where it faces.
    const along = turn % 2 ? "x" : "z", up = turn === 0 || turn === 1 ? 1 : -1, n = Math.max(4, Math.round(h / 0.3));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, sh = h * (i + 1) / n;
      const off = ((t0 + 0.5 / n) - 0.5) * (along === "x" ? w : d) * up;
      if (along === "x") box(stepMat, w / n, sh, d, off, 0, 0); else box(stepMat, w, sh, d / n, 0, 0, off);
    }
    block({ walk: true, ramp: { axis: along, up, h } });
  } else if (rec.kind === "awning") {
    const a = addAwning(x, z, w, d, 0x7a5a2f, true);
    if (a) { made.roofs.push(a); made.meshes.push(a.group); }
  } else if (rec.kind === "tree" || rec.kind === "palm") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.6, 7), barkMat); trunk.position.set(x, base + h * 0.3, z); trunk.castShadow = true; scene.add(trunk); made.meshes.push(trunk);
    const top = rec.kind === "tree" ? new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.32, 1), leafMat) : new THREE.Mesh(new THREE.ConeGeometry(h * 0.35, h * 0.18, 7), palmMat);
    top.position.set(x, base + h * (rec.kind === "tree" ? 0.72 : 0.62), z); top.castShadow = true; scene.add(top); made.meshes.push(top);
    block({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, walk: false });
  } else if (rec.kind === "bush") {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), leafMat); m.scale.set(w / 2, h / 2, d / 2); m.position.set(x, base + h / 2, z); m.castShadow = true; scene.add(m); made.meshes.push(m);
    block({ walk: true, low: true });
  } else if (rec.kind === "rock" || rec.kind === "boulder") {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stoneMat); m.scale.set(w / 2, h / 1.6, d / 2); m.position.set(x, base + h * 0.35, z); m.rotation.y = (x * 7 + z * 3) % 6; m.castShadow = true; m.receiveShadow = true; scene.add(m); made.meshes.push(m);
    block({ walk: true });
  } else if (rec.kind === "lamp") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), lampPoleMat); pole.position.set(x, base + 2.1, z); pole.castShadow = true; scene.add(pole); made.meshes.push(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lampBulbMat); bulb.position.set(x, base + 4.3, z); scene.add(bulb); made.meshes.push(bulb);
    const l = { x, y: base + 4.3, z }; lamps.push(l); made.lamps.push(l);
    block({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, walk: false });
  }
  if (rec.interior && made.meshes.length) {
    // A lit doorway on the wall it was set on (the side Koda stood at), on the building's real outline.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshBasicMaterial({ color: 0x7fe39a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    const bb = made.blocks[0] || { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    const a = rec.door != null ? rec.door : (rec.rot || 0), fx = Math.sin(a), fz = Math.cos(a);
    // Walk out from the middle in that direction until the outline: the door sits there.
    const hx = (bb.maxX - bb.minX) / 2, hz = (bb.maxZ - bb.minZ) / 2, cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
    const t = Math.min(Math.abs(fx) > 1e-3 ? hx / Math.abs(fx) : 1e9, Math.abs(fz) > 1e-3 ? hz / Math.abs(fz) : 1e9);
    const onX = Math.abs(fx) * t >= hx - 1e-3;
    door.position.set(cx + fx * t + (onX ? Math.sign(fx) * 0.06 : 0), base + 1.2, cz + fz * t + (onX ? 0 : Math.sign(fz) * 0.06));
    door.rotation.y = onX ? Math.sign(fx) * Math.PI / 2 : (fz > 0 ? 0 : Math.PI);
    scene.add(door); made.meshes.push(door);
  }
  return made;
}
function unmakePiece(made) {
  made.gone = true;
  for (const h of [made.horse, ...(made.hitch || [])]) if (h) { if (koda && koda.riding === h) dismount(); removeHorse(h); }
  for (let i = critters.length - 1; i >= 0; i--) if (critters[i].made === made) critters.splice(i, 1);
  if (made.store) { const i = stores.indexOf(made); if (i >= 0) stores.splice(i, 1); }
  for (const m of made.meshes) if (m && m.parent) m.parent.remove(m);
  for (const b of made.blocks) { const i = blockers.indexOf(b); if (i >= 0) blockers.splice(i, 1); navMark(b); }
  for (const a of made.roofs) { const i = roofs.indexOf(a); if (i >= 0) roofs.splice(i, 1); }
  for (const l of made.lamps) { const i = lamps.indexOf(l); if (i >= 0) lamps.splice(i, 1); }
}

const CLUE_MADE = [];   // clue spot pieces, saved or from clues.js
// The starting clue spots from clues.js, unless one has been moved (a saved spot with its name).
async function seedClues() {
  const moved = new Set(placed.filter(p => p.rec.kind === "clue" || p.rec.interior).map(p => p.rec.label));
  const all = window.GILL_CLUES || {};
  for (const r of all.rooms || []) if (!moved.has(r.id)) placed.push(await makePiece({ kind: "building", model: r.model, label: r.id, x: r.x, z: r.z, rot: 0, w: r.w, d: r.d, h: r.h, interior: true, door: r.door, y: null }));
  for (const id in all) if (id !== "rooms") for (const s of all[id]) if (!moved.has(s.id)) placed.push(await makePiece({ kind: "clue", label: s.id, x: s.x, z: s.z, rot: 0, w: 1, d: 1, h: 1.2, interior: false, y: null }));
}
const placed = [];   // pieces from Feelz Machine and the ones placed this visit
const stores = [];   // store pieces: walk up to one to shop
async function loadPieces() {
  if (!ONLINE) return;
  try {
    const { data, error } = await ONLINE.from("gill_world_pieces").select("id,kind,model,label,x,z,rot,w,d,h,interior,door,y").limit(5000);
    if (error || !data) return;
    for (const rec of data) placed.push(await makePiece(rec));
  } catch (e) { /* the city still plays without them */ }
}

/* Build mode itself. */
const B = { on: false, cat: "Buildings", i: 0, rot: 0, ghost: null, ghostKey: "", spot: null, near: null, saving: 0, undo: [] };
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a46, transparent: true, opacity: 0.35, depthWrite: false });
const ghostEdge = new THREE.LineBasicMaterial({ color: 0xffd27a });
const pickMat = new THREE.MeshBasicMaterial({ color: 0xff5a46, transparent: true, opacity: 0.25, depthWrite: false });
const catList = () => [...new Set(PIECES.map(p => p.cat))];
const catPieces = () => PIECES.filter(p => p.cat === B.cat);
function startBuild() {
  if (!canBuild && !coop.ch && !myWorld && !(mission && mission.def.free)) return;
  audioCtx(); goLandscape();
  $("title").classList.add("hidden"); $("hud").classList.remove("hidden"); document.body.classList.add("building");
  $("build").classList.remove("hidden");
  if (phone) $("touch").classList.remove("hidden");
  // From free roam, building pauses the roam and Done comes back to it.
  B.roam = mission && mission.def.free ? mission : null;
  mission = null; state = "build"; B.on = true;
  applyTheme(null, 0, true); if (!B.roam) { DAY.hour = 14; updateDayNight(0); }
  if (!koda.parent) scene.add(koda.root);
  koda.pos.y = groundAt(koda.pos.x, koda.pos.z);
  renderBuildBar(); updateCamera(0, true);
  if (myWorld) toast(saveTable() ? `Building in ${myWorld.name}. Everything you place is kept.` : "Building in your world. Keeping your builds comes with Feelz Machine Premium.", 3.5);
  else if (!canBuild && !coop.ch) toast("Building in free roam. Gather materials for blocks. Keep what you build in My worlds.", 3.5);
  else toast(canBuild && ONLINE ? (coop.ch ? "Building together. Your pieces are saved to the city and the room sees them." : "Build mode. Everything you place is saved to the city.") : coop.ch ? "Building together. Everyone in the room sees what you place." : "Build mode (trying it out: nothing is saved here).", 3.5);
}
function stopBuild() {
  B.on = false; if (B.ghost) { scene.remove(B.ghost); B.ghost = null; B.ghostKey = ""; }
  if (B.pick) { scene.remove(B.pick); B.pick = null; }
  $("build").classList.add("hidden"); document.body.classList.remove("building");
  if (B.roam) { mission = B.roam; B.roam = null; state = "play"; wakePlacedEnforcers(); lastT = performance.now(); refreshObjective(); updateCamera(0, true); return; }
  toTitle();
}
function renderBuildBar() {
  $("buildCats").innerHTML = catList().map(c => `<button class="bcat${c === B.cat ? " on" : ""}" data-c="${c}">${c}</button>`).join("");
  $("buildItems").innerHTML = catPieces().map((p, i) => `<button class="bitem${i === B.i ? " on" : ""}" data-i="${i}">${p.kind === "building" && p.model ? `<img src="thumbs/${p.model}.webp" alt="" onerror="this.remove()">` : p.model && p.kind !== "enforcer" ? `<img src="thumbs/${p.model}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'), { textContent: '■' }))">` : `<i>${{ Cover: "▣", Climb: "☰", Nature: "♣", Blocks: "◼", Ground: "▦", Enforcers: "☗", Stores: "$", Animals: "♞", Street: "▥", Wreckage: "✕" }[p.cat] || "■"}</i>`}<span>${p.name}</span></button>`).join("");
  $("buildName").textContent = (catPieces()[B.i] || {}).name || "";
}
function buildPick(cat, i) {
  // Choosing from the bar while holding a moved piece puts that piece back where it was.
  if (B.carry) { const c = B.carry; B.carry = null; makePiece(c.rec).then(m => { placed.push(m); if (c.inWorld) worldMade.push(m); }); }
  if (cat) B.cat = cat; B.i = i || 0; B.ghostKey = ""; renderBuildBar();
}
// The copy shown before placing is the real thing, see-through, at the size it will be built.
const ghostModelMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.4, depthWrite: false });
function fitBuilding(p, src) {
  const box = new THREE.Box3().setFromObject(src), sz = box.getSize(new THREE.Vector3());
  const k = Math.min(p.h / Math.max(0.001, sz.y), Math.max(p.w, p.d) / Math.max(0.001, sz.x, sz.z));
  p.fw = sz.x * k; p.fd = sz.z * k; p.fh = sz.y * k; p.fk = k;
}
function ghostFor(p) {
  const g = new THREE.Group();
  if (p.kind === "building" && p.model) staticModel(p.model).then(src => {
    if (!src || !g.parent) return;
    fitBuilding(p, src);
    const m = src.clone(true); m.scale.setScalar(p.fk);
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    m.traverse(o => { if (o.isMesh) { o.material = ghostModelMat; o.castShadow = false; } });
    g.userData.box.visible = false; g.userData.edge.scale.set(p.fw, p.fh, p.fd); g.userData.edge.position.y = p.fh / 2; g.add(m);
  });
  const m = new THREE.Mesh(propGeo, ghostMat); m.scale.set(p.w, Math.max(0.2, p.h), p.d); m.position.y = Math.max(0.2, p.h) / 2; g.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), ghostEdge); e.scale.copy(m.scale); e.position.copy(m.position); g.add(e); g.userData.edge = e;
  // A little arrow on the ground showing which way it faces (stairs climb that way, buildings open that way).
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 3), ghostMat); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.1, p.d / 2 + 0.7); g.add(arrow);
  g.userData.box = m; return g;
}
// What's in hand: the piece picked from the bar, or a placed piece picked up to move.
const handPiece = () => B.carry ? B.carry.def : catPieces()[B.i];
const raycaster = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function mouseGround() {
  if (!B.mouse || performance.now() - B.mouse.t > 4000) return null;
  _ndc.set(B.mouse.x / innerWidth * 2 - 1, -(B.mouse.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const r = raycaster.ray, y = koda.pos.y;
  if (Math.abs(r.direction.y) < 1e-3) return null;
  let t = (y - r.origin.y) / r.direction.y;
  if (t < 0) return null;
  // Settle onto the land under the cursor (a couple of passes is plenty).
  for (let i = 0; i < 2; i++) { const px = r.origin.x + r.direction.x * t, pz = r.origin.z + r.direction.z * t; t = (terrainAt(px, pz) - r.origin.y) / r.direction.y; }
  return { x: r.origin.x + r.direction.x * t, z: r.origin.z + r.direction.z * t };
}
function pieceUnderMouse() {
  if (!B.mouse || performance.now() - B.mouse.t > 4000) return null;
  _ndc.set(B.mouse.x / innerWidth * 2 - 1, -(B.mouse.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const near = placed.filter(m => Math.hypot(m.rec.x - koda.pos.x, m.rec.z - koda.pos.z) < 60);
  const hits = raycaster.intersectObjects(near.flatMap(m => m.meshes.filter(Boolean)), true);
  if (!hits.length) return null;
  for (const m of near) { let o = hits[0].object; while (o) { if (m.meshes.includes(o)) return m; o = o.parent; } }
  return null;
}
function pieceSize(p, rot) {
  const turn = Math.round(rot / (Math.PI / 2)) & 3, pw = p.fw || p.w, pd = p.fd || p.d;
  return { w: turn % 2 ? pd : pw, d: turn % 2 ? pw : pd };
}
function updateBuild(dt) {
  readInput();
  if (!input.mag && updateGather(dt, keys.has("KeyE") || B.gathering)) koda.update(dt); else updateKoda(dt);
  const p = handPiece(); if (!p) return;
  const key = (B.carry ? "carry:" : "") + p.kind + (p.model || "") + p.name;
  if (B.ghostKey !== key) { if (B.ghost) scene.remove(B.ghost); B.ghost = ghostFor(p); scene.add(B.ghost); B.ghostKey = key; }
  const { w, d } = pieceSize(p, B.rot);
  // Where it goes: under the mouse if you're using one, otherwise a few metres in front of Koda.
  const mg = mouseGround();
  let x, z;
  if (mg) { x = mg.x; z = mg.z; }
  else { const f = forward(koda), reach = Math.max(w, d) / 2 + 1.6; x = koda.pos.x + f.x * reach; z = koda.pos.z + f.y * reach; }
  // Blocks snap to a one-metre grid and stack on what's below; tiles to two metres; the rest to half metres.
  const grid = p.grid || (p.kind === "block" ? 1 : p.kind === "tile" ? 2 : 0.5);
  x = (Math.floor(x / grid) + (grid >= 1 ? 0.5 : 0)) * grid; z = (Math.floor(z / grid) + (grid >= 1 ? 0.5 : 0)) * grid;
  let y = terrainAt(x, z);
  if (p.kind === "block" || p.kind === "tile" || p.stack) { const g = groundAt(x, z); if (g !== MUD) y = Math.max(y, g); }
  const ok = !onRiver(x, z, Math.max(w, d) / 2) && ridgeAt(x, z) < 1 && x > 4 && z > 4 && x < WORLD_W - 4 && z < WORLD_H - 4 && Math.hypot(x - koda.pos.x, z - koda.pos.z) < 70;
  B.spot = { x, z, y, ok };
  B.ghost.position.set(x, y, z); B.ghost.rotation.y = B.rot;
  B.ghost.userData.box.material = ok ? ghostMat : ghostBad;
  // The placed piece to pick up: the one under the mouse, or the one the copy is touching.
  let near = B.carry ? null : pieceUnderMouse();
  if (!near && !B.carry && !mg) {
    let nd = 1e9;
    for (const m of placed) {
      const bb = m.blocks[0], r = m.rec;
      const dd = bb ? Math.hypot(Math.max(0, bb.minX - x, x - bb.maxX), Math.max(0, bb.minZ - z, z - bb.maxZ)) : Math.hypot(r.x - x, r.z - z);
      if (dd < 1.2 && dd < nd) { nd = dd; near = m; }
    }
  }
  if (near !== B.near) {
    B.near = near;
    if (B.pick) { scene.remove(B.pick); B.pick = null; }
    if (near) {
      const bb = near.blocks[0], r = near.rec;
      B.pick = new THREE.Mesh(propGeo, pickMat);
      if (bb) { B.pick.scale.set(bb.maxX - bb.minX + 0.3, (bb.top - bb.base) + 0.3, bb.maxZ - bb.minZ + 0.3); B.pick.position.set((bb.minX + bb.maxX) / 2, (bb.top + bb.base) / 2, (bb.minZ + bb.maxZ) / 2); }
      else { B.pick.scale.set(r.w + 0.3, r.h + 0.3, r.d + 0.3); B.pick.position.set(r.x, terrainAt(r.x, r.z) + r.h / 2, r.z); }
      scene.add(B.pick);
    }
    $("bPickUp").disabled = !near;
  }
  $("bPlace").disabled = !ok;
  $("bPlace").textContent = B.carry ? "Put down" : "Place";
  drawInventory();
  updateDayNight(dt); updateAwnings(); updateOcclusion(); updateCamera(dt);
}
async function buildPlace() {
  const p = handPiece(); if (!p || !B.spot || !B.spot.ok) return;
  const carry = B.carry;
  // In your own world and in free roam, blocks and ground cost what you've gathered.
  if (!carry && usesMaterials() && p.cost && !spend(p.cost)) return;
  const stacks = p.kind === "block" || p.kind === "tile" || !!p.stack;
  const rec = carry ? Object.assign({}, carry.rec, { x: B.spot.x, z: B.spot.z, rot: B.rot, y: stacks ? B.spot.y : null })
    : { kind: p.kind, model: p.model || null, label: p.name, x: B.spot.x, z: B.spot.z, rot: B.rot, w: p.w, d: p.d, h: p.h, interior: false, y: stacks ? B.spot.y : null };
  B.carry = null;
  const made = await makePiece(rec); placed.push(made); B.near = undefined; sfxUnlock();
  B.undo.push(made);
  if (carry && carry.inWorld) worldMade.push(made);
  // A moved piece keeps its saved row: only where it stands changes.
  if (carry && rec.id) {
    if (coop.ch) coop.ch.send({ type: "broadcast", event: "piece", payload: { rec } });
    const table = saveTable();
    if (table) { const { error } = await ONLINE.from(table).update({ x: rec.x, z: rec.z, rot: rec.rot, y: rec.y }).eq("id", rec.id); $("buildSave").textContent = error ? "Couldn't save the move. Try again." : "Saved"; }
    return;
  }
  // In a room, everyone sees it straight away.
  if (coop.ch) { coop.ch.send({ type: "broadcast", event: "piece", payload: { rec } }); coopPiece(rec, made); }
  const table = saveTable();
  if (!table) return;
  if (table === "gill_world_items") { rec.world_id = myWorld.id; worldMade.push(made); }
  B.saving++; $("buildSave").textContent = "Saving…";
  const { data, error } = await ONLINE.from(table).insert(rec).select("id").single();
  B.saving--;
  if (error) { $("buildSave").textContent = "Couldn't save that piece. Check you're signed in to Feelz Machine."; unmakePiece(made); placed.splice(placed.indexOf(made), 1); return; }
  rec.id = data.id; $("buildSave").textContent = B.saving ? "Saving…" : "Saved";
}
// Pick up: the piece comes into your hand to put down somewhere else. Undo or a new piece from the bar drops it.
function buildPickUp(made) {
  if (!made) return;
  if (B.carry) return;
  const inWorld = worldMade.includes(made);
  unmakePiece(made); placed.splice(placed.indexOf(made), 1); if (inWorld) worldMade.splice(worldMade.indexOf(made), 1);
  if (coop.ch) coop.ch.send({ type: "broadcast", event: "unpiece", payload: { key: coopPieceKey(made.rec) } });
  B.carry = { rec: Object.assign({}, made.rec), def: pieceDef(made.rec), inWorld };
  B.rot = made.rec.rot || 0; B.near = undefined; sfxHit(false); popText("MOVING");
}
async function buildRemove(made) {
  if (!made) return;
  unmakePiece(made); placed.splice(placed.indexOf(made), 1); B.near = undefined; sfxHit(false);
  if (coop.ch) { const key = coopPieceKey(made.rec); coop.ch.send({ type: "broadcast", event: "unpiece", payload: { key } }); const i = coop.pieces.findIndex(p => coopPieceKey(p.rec) === key); if (i >= 0) coop.pieces.splice(i, 1); }
  if (worldMade.includes(made)) worldMade.splice(worldMade.indexOf(made), 1);
  const table = saveTable();
  if (ONLINE && table && made.rec.id) {
    const { error } = await ONLINE.from(table).delete().eq("id", made.rec.id);
    $("buildSave").textContent = error ? "Couldn't remove it from the city. Try again." : "Saved";
  }
}
async function buildToggleInterior() {
  const made = B.near; if (!made || made.rec.kind !== "building") return;
  const rec = Object.assign({}, made.rec, { interior: !made.rec.interior, door: Math.atan2(koda.pos.x - made.rec.x, koda.pos.z - made.rec.z) });
  unmakePiece(made); placed.splice(placed.indexOf(made), 1);
  const again = await makePiece(rec); placed.push(again); B.near = undefined;
  popText(rec.interior ? "HAS AN INSIDE" : "NO INSIDE");
  if (worldMade.includes(made)) worldMade[worldMade.indexOf(made)] = again;
  const table = saveTable();
  if (ONLINE && table && rec.id) { const { error } = await ONLINE.from(table).update(table === "gill_world_pieces" ? { interior: rec.interior, door: rec.door, updated_at: new Date().toISOString() } : { interior: rec.interior, door: rec.door }).eq("id", rec.id); $("buildSave").textContent = error ? "Couldn't save that. Try again." : "Saved"; }
}
function buildTurn() { B.rot = (B.rot + Math.PI / 2) % (Math.PI * 2); }
function buildUndo() { const m = B.undo.pop(); if (m && placed.includes(m)) buildRemove(m); }
// Mouse in build mode: the copy follows the cursor; click a piece to pick it up and move it,
// click again to put it down; right click turns it.
addEventListener("pointermove", e => { if (state === "build" && e.pointerType === "mouse") B.mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; });
addEventListener("pointerdown", e => {
  if (state !== "build" || e.pointerType !== "mouse" || e.target !== renderer.domElement) return;
  B.mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (e.button === 2) { buildTurn(); return; }
  if (e.button !== 0) return;
  if (!B.carry && B.near && pieceUnderMouse() === B.near) buildPickUp(B.near); else buildPlace();
});
addEventListener("contextmenu", e => { if (state === "build") e.preventDefault(); });
(function buildControls() {
  $("buildCats").addEventListener("click", e => { const b = e.target.closest("button"); if (b) buildPick(b.dataset.c, 0); });
  $("buildItems").addEventListener("click", e => { const b = e.target.closest("button"); if (b) buildPick(null, +b.dataset.i); });
  const tap = (id, fn) => $(id).addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (state === "build") fn(); });
  tap("bTurn", buildTurn); tap("bPlace", buildPlace); tap("bPickUp", () => buildPickUp(B.near)); tap("bDelete", () => { if (B.carry) { B.carry = null; B.ghostKey = ""; popText("BINNED"); } else buildRemove(B.near); }); tap("bInside", buildToggleInterior); tap("bUndo", buildUndo); tap("bDone", stopBuild); tap("bView", () => setView(cam.view + 1));
  $("buildBtn").addEventListener("click", startBuild);
  const gb = $("bGather");
  gb.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); B.gathering = true; });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) gb.addEventListener(ev, () => { B.gathering = false; });
  addEventListener("keydown", e => {
    if (state !== "build" || e.repeat) return;
    if (e.code === "KeyR") buildTurn();
    else if (e.code === "Enter" || e.code === "KeyF") buildPlace();
    else if (e.code === "KeyX") buildPickUp(B.near);
    else if (e.code === "Delete" || e.code === "Backspace") { if (B.carry) { B.carry = null; B.ghostKey = ""; } else buildRemove(B.near); }
    else if (e.code === "KeyI") buildToggleInterior();
    else if (e.code === "KeyZ") buildUndo();
    else if (e.code === "Space") jump();
    else if (e.code === "Escape") stopBuild();
    else if (e.code === "BracketRight" || e.code === "Period") buildPick(null, (B.i + 1) % catPieces().length);
    else if (e.code === "BracketLeft" || e.code === "Comma") buildPick(null, (B.i - 1 + catPieces().length) % catPieces().length);
    else if (/^Digit[1-9]$/.test(e.code)) { const c = catList()[+e.code.slice(5) - 1]; if (c) buildPick(c, 0); }
  });
})();

/* ---------- town planning ----------
   Every place gets what a real neighbourhood has, set back from its open middle:
   a market row with a seller at every stall, a kiosk, a billboard by the road, and
   its district's own life: washing lines and hand carts in the Lower City, a freight
   depot in the Middle City, fountains and planted beds up the hill, gardens in the
   Restored City, rock spires and a fuel stop in the desert. */
const stalls = [];      // { x, z, yaw, q }: someone stands behind each one
const swayers = [];     // trees and plants that move in the wind
const leafMats = [0x3f6a34, 0x4f7d3a, 0x5d8f43, 0x2f5a2c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
const flowerMats = [0xd9475a, 0xf2b544, 0xe7e1f2, 0xb16cd9, 0xf58b3c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
// Stalls in different colours: the awnings and paint take a tint, so no two look the same.
const STALL_TINTS = [0xffffff, 0x8fd18a, 0x86b6ff, 0xffd06b, 0xd59cff, 0xff9c7a, 0x7fe0d0];
function tintStall(root, i) {
  const t = new THREE.Color(STALL_TINTS[i]);
  root.traverse(o => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiply(t); } });
}
async function placeThing(name, x, z, yaw, size, { h = null, solid = true, walk = false, low = false, pad = 0.6 } = {}) {
  if (onRoad(x, z, size * 0.45) || onRiver(x, z, size * 0.6) || ridgeAt(x, z) > 0.3 || blocked(x, z, size * 0.5 + pad)) return null;
  const src = await staticModel(name);
  if (!src) return null;
  const m = src.clone(true);
  m.rotation.y = yaw;
  const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
  m.scale.setScalar(h ? h / Math.max(0.01, sz.y) : size / Math.max(0.01, sz.x, sz.z));
  const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
  const base = terrainAt(x, z);
  m.position.set(x - c.x, base - b2.min.y, z - c.z);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(m);
  const bb = new THREE.Box3().setFromObject(m);
  let blk = null;
  if (solid) { blk = { minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, top: bb.max.y, base, walk, low, mesh: m, mats: [], faded: false, prop: name }; blockers.push(blk); }
  return { m, b: blk, x, z };
}
// A tree that sways: a trunk and a few overlapping leaf clumps, each its own green.
function addTree(x, z, h, r) {
  if (onRoad(x, z, 2) || onRiver(x, z, 3) || ridgeAt(x, z) > 0.3 || blocked(x, z, 1.2)) return;
  const g = new THREE.Group(), base = terrainAt(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * h / 6, 0.3 * h / 6, h * 0.6, 7), barkMat); trunk.position.y = h * 0.3; trunk.castShadow = true; g.add(trunk);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = h * (0.2 + r() * 0.14), a = r() * Math.PI * 2, d = h * 0.12 * r();
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMats[Math.floor(r() * leafMats.length)]);
    blob.position.set(Math.cos(a) * d, h * (0.62 + r() * 0.22), Math.sin(a) * d); blob.castShadow = true; g.add(blob);
  }
  g.position.set(x, base, z); scene.add(g);
  blockers.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, top: base + h, base, mats: [] });
  swayers.push({ g, ph: r() * 6.28, amp: 0.025 + r() * 0.02 });
}
// A flower bed: a low bush with flowers dotted over it.
function addBed(x, z, w, r) {
  if (onRoad(x, z, w) || onRiver(x, z, 2) || ridgeAt(x, z) > 0.3 || blocked(x, z, w * 0.6)) return;
  const g = new THREE.Group(), base = terrainAt(x, z);
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), leafMats[Math.floor(r() * leafMats.length)]); bush.scale.set(w / 2, 0.5, w / 3); bush.position.y = 0.35; bush.castShadow = true; g.add(bush);
  const fm = flowerMats[Math.floor(r() * flowerMats.length)];
  for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), fm); f.position.set((r() - 0.5) * w * 0.85, 0.7 + r() * 0.15, (r() - 0.5) * w * 0.55); g.add(f); }
  g.position.set(x, base, z); scene.add(g);
  blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - w / 3, maxZ: z + w / 3, top: base + 0.8, base, walk: true, low: true, mats: [] });
  swayers.push({ g, ph: r() * 6.28, amp: 0.012 });
}
// Dust: running on sand kicks up little clouds at his feet.
const dust = { pool: [], t: 0, tex: null };
function dustTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,240,215,.9)"); gr.addColorStop(1, "rgba(255,240,215,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function onSand(x, z) { const q = zoneAt(x, z); return q ? districtOf(q) === "de" : !(S.quadrants.some(k => (districtOf(k) === "rc" || districtOf(k) === "uc") && Math.hypot(Math.max(0, k.x0 - x, x - k.x0 - k.w), Math.max(0, k.z0 - z, z - k.z0 - k.d)) < 30)) && !onRoad(x, z, 0); }
function updateDust(dt) {
  if (!dust.tex) dust.tex = dustTex();
  dust.t -= dt;
  if (koda && koda.moving && !air && dust.t <= 0 && onSand(koda.pos.x, koda.pos.z)) {
    dust.t = koda.sneaking ? 0.3 : 0.08;
    let p = dust.pool.find(p => p.life <= 0);
    if (!p && dust.pool.length < 40) { p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: dust.tex, color: 0xd9b98a, transparent: true, depthWrite: false })), life: 0 }; scene.add(p.s); dust.pool.push(p); }
    if (p) { const f = forward(koda); p.s.position.set(koda.pos.x - f.x * 0.3 + (Math.random() - 0.5) * 0.4, koda.pos.y + 0.15, koda.pos.z - f.y * 0.3 + (Math.random() - 0.5) * 0.4); p.life = 0.9; p.s.visible = true; }
  }
  for (const p of dust.pool) {
    if (p.life <= 0) { p.s.visible = false; continue; }
    p.life -= dt; const k = 1 - p.life / 0.9;
    p.s.scale.setScalar(0.5 + k * 1.6); p.s.position.y += dt * 0.5; p.s.material.opacity = 0.55 * (1 - k);
  }
}
function updateSway(now) {
  const t = now / 1000;
  for (const s of swayers) { s.g.rotation.z = Math.sin(t * 1.3 + s.ph) * s.amp; s.g.rotation.x = Math.sin(t * 0.9 + s.ph * 1.7) * s.amp * 0.7; }
}
async function buildTownPlan() {
  const jobs = [];
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(2) * 911 + 31), cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2, dist = districtOf(q);
    const face = (x, z) => Math.atan2(cx - x, cz - z);   // turned to look into the middle
    // Food stalls along the pavements of this place's streets, facing the road, each one different.
    // The place's longest street stretches (real ones bend), longest first, four stalls in all.
    const runs = [];
    for (const st of WD.roads.filter(rd => rd.street && rd.place === q.id && rd.width >= 6)) for (let i = 0; i + 1 < st.points.length; i++) {
      const [ax, az] = st.points[i], [bx, bz] = st.points[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L > 24) runs.push({ st, ax, az, bx, bz, L });
    }
    runs.sort((a, b) => b.L - a.L);
    for (let k = 0; k < 4 && runs.length; k++) {
      const { st, ax, az, bx, bz, L } = runs[k % runs.length];
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux, off = st.width / 2 + 2.6;
      {
        const side = k % 2 ? 1 : -1, t = L * (0.2 + 0.6 * ((k * 0.37 + r() * 0.2) % 1));
        const x = ax + ux * t + nx * off * side, z = az + uz * t + nz * off * side;
        if (Math.hypot(x - cx, z - cz) < 14) continue;   // the crossing in the middle stays clear
        const yaw = Math.atan2(-nx * side, -nz * side);   // counter to the road
        const kind = r() < 0.75 ? "stall" : "booth";
        jobs.push(placeThing(kind, x, z, yaw, kind === "stall" ? 3.6 + r() * 1.2 : 2.4, { pad: 0.2 }).then(t => {
          if (!t) return;
          tintStall(t.m, Math.floor(r() * STALL_TINTS.length));
          if (!q.hasTrade && t.b) { q.hasTrade = true; t.b.store = { lc: "wood", mc: "metal", uc: "glass", rc: "stone", de: "sand" }[dist] || "general"; }
          const fx = -nx * side, fz = -nz * side;   // the seller stands on the far side, facing the road
          stalls.push({ x: x - fx * 2.2, z: z - fz * 2.2, yaw: Math.atan2(fx, fz) + Math.PI, q });
        }));
      }
    }
    // Every place has a general store (the kiosk), and its first stall is its own trade.
    jobs.push(placeThing("booth", cx + 20, cz - 15, face(cx + 20, cz - 15), 2.6).then(t => { if (t && t.b) t.b.store = "general"; }));
    jobs.push(placeThing("billboard", cx - 24, cz - 20, face(cx - 24, cz - 20), 12, { h: 10 }));
    if (dist === "lc") {
      for (let i = 0; i < 3; i++) { const x = q.x0 + 14 + r() * (q.w - 28), z = q.z0 + 14 + r() * (q.d - 28); if (Math.hypot(x - cx, z - cz) > 22) jobs.push(placeThing("washline", x, z, r() * 3, 5, { solid: false })); }
      jobs.push(placeThing("handcart", cx - 14, cz + 10, r() * 6, 2.4, { walk: true, low: true }));
      jobs.push(placeThing("chimney", cx + 24, cz + 8, 0, 1.2, { h: 6 }));
      jobs.push(placeThing("vent", cx + 22, cz + 22, 0, 2.2, { walk: true, low: true }));
      jobs.push(placeThing("generator", cx - 22, cz + 6, face(cx - 22, cz + 6), 2.6, { walk: true }));
      jobs.push(placeThing("firepit", cx - 4, cz - 22, 0, 7, { solid: false }));
      jobs.push(placeThing("cage", cx + 6, cz - 24, r() * 3, 2.2, { walk: true }));
    } else if (dist === "mc") {
      // A freight depot: stacked containers, a conveyor and a hauler parked up.
      for (let i = 0; i < 4; i++) jobs.push(placeThing("container", cx - 26 + (i % 2) * 7, cz - 8 + Math.floor(i / 2) * 3.2, Math.PI / 2 * 0, 6.2, { walk: true, pad: 0.1 }));
      jobs.push(placeThing("conveyor", cx - 18, cz + 4, 0, 4, { walk: true, low: true }));
      jobs.push(placeThing("turnstile", cx + 10, cz - 22, 0, 3.2));
      jobs.push(placeThing("valve", cx + 24, cz - 6, 0, 2.2, { walk: true }));
      jobs.push(placeThing("filter", cx - 6, cz - 24, 0, 2.2, { walk: true }));
      jobs.push(placeThing("mast", cx + 2, cz + 26, 0, 1.4, { h: 8 }));
    } else if (dist === "uc" || dist === "rc") {
      jobs.push(placeThing("fountain", cx + 22, cz - 2, 0, 8, { walk: true }));
      const trees = dist === "rc" ? 16 : 9, beds = dist === "rc" ? 12 : 8, hedges = dist === "rc" ? 6 : 8;
      for (let i = 0; i < trees; i++) { const a = r() * Math.PI * 2, d = 18 + r() * Math.min(q.w, q.d) * 0.35; jobs.push(Promise.resolve(addTree(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 5 + r() * 4, r))); }
      for (let i = 0; i < beds; i++) { const a = r() * Math.PI * 2, d = 16 + r() * Math.min(q.w, q.d) * 0.35; jobs.push(Promise.resolve(addBed(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 2 + r() * 1.5, r))); }
      for (let i = 0; i < hedges; i++) { const a = i / hedges * Math.PI * 2, d = 15; jobs.push(placeThing("hedge", cx + Math.cos(a) * d, cz + Math.sin(a) * d, a, 3, { walk: true, low: true, pad: 0.2 })); }
      if (dist === "uc") jobs.push(placeThing("commtower", cx - 26, cz + 22, 0, 3, { h: 16 }));
    } else if (dist === "de") {
      for (let i = 0; i < 4; i++) { const x = q.x0 + 10 + r() * (q.w - 20), z = q.z0 + 10 + r() * (q.d - 20); if (Math.hypot(x - cx, z - cz) > 24) jobs.push(placeThing("rocks", x, z, r() * 6, 3, { h: 6 + r() * 5 })); }
      jobs.push(placeThing("skiff", cx - 22, cz + 8, r() * 6, 7));
      jobs.push(placeThing("firepit", cx + 4, cz - 22, 0, 7, { solid: false }));
      // A fuel stop: the shelter, a generator and two pumps, with a hauler filling up.
      jobs.push(placeThing("shelter", cx + 24, cz + 6, face(cx + 24, cz + 6), 7));
      jobs.push(placeThing("pump", cx + 18, cz + 12, -Math.PI / 2, 1, { h: 2 }));
      jobs.push(placeThing("pump", cx + 18, cz + 16, -Math.PI / 2, 1, { h: 2 }));
      jobs.push(placeThing("barrels", cx + 30, cz + 10, r() * 6, 2.4, { h: 1.2, walk: true }));
      jobs.push(placeThing("generator", cx + 28, cz + 16, 0, 2.4, { walk: true }));
    }
    // Street life everywhere: a bus shelter by the road, a phone box, a produce table by the kiosk,
    // and each district's own bits (water tanks and drums down the hill, dishes and planters up it).
    if (runs.length) { const { st, ax, az, bx, bz, L } = runs[0], ux = (bx - ax) / L, uz = (bz - az) / L, off = st.width / 2 + 2.2;
      const x = ax + ux * L * 0.72 + uz * off, z = az + uz * L * 0.72 - ux * off; jobs.push(placeThing("busstop", x, z, Math.atan2(-uz, ux) + Math.PI / 2, 4, { h: 3, pad: 0.3 })); }
    jobs.push(placeThing("phonebox", cx + 16, cz - 19, face(cx + 16, cz - 19), 1.2, { h: 2.4 }));
    jobs.push(placeThing("produce", cx + 23, cz - 12, face(cx + 23, cz - 12), 2, { h: 1.4, walk: true, pad: 0.2 }));
    if (dist === "lc" || dist === "mc") {
      jobs.push(placeThing("watertank", cx - 26, cz - 24, r() * 6, 3, { h: 6 }));
      for (let i = 0; i < 2; i++) jobs.push(placeThing("barrels", cx - 18 + i * 30, cz + 24 - i * 6, r() * 6, 2.4, { h: 1.2, walk: true }));
    }
    if (dist === "mc" || dist === "uc") jobs.push(placeThing("dish", cx + 26, cz + 24, r() * 6, 2.5, { h: 4 }));
    if (dist === "uc" || dist === "rc") for (let i = 0; i < (dist === "rc" ? 6 : 4); i++) { const a = i / (dist === "rc" ? 6 : 4) * Math.PI * 2 + 0.4, d = 12; jobs.push(placeThing("planter", cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * 6, 1.4, { h: 1.6, pad: 0.2 })); }
    // Street cats: one sat up, one curled, somewhere quiet.
    for (let i = 0; i < 2; i++) { const a = r() * Math.PI * 2, d = 10 + r() * 16; jobs.push(placeThing(i ? "cat2" : "cat", cx + Math.cos(a) * d, cz + Math.sin(a) * d, r() * 6, 0.4, { h: i ? 0.25 : 0.42, solid: false }).then(t => { if (t) critters.push({ m: t.m, base: t.m.scale.y, ph: r() * 6 }); })); }
    // A few palms and shrubs out in the dry places too, so nowhere is bare.
    if (dist === "de" || dist === "lc") for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2, d = 20 + r() * 18; jobs.push(Promise.resolve(addTree(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 4 + r() * 2, r))); }
  }
  await Promise.all(jobs);
  // Wreckage left by the Veil: toppled masts and chimneys, split containers, scrap. Gather metal from it.
  const dr = rng(777);
  for (const q of S.quadrants) for (let i = 0; i < 2; i++) {
    const cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2, a = dr() * 6.28, d = 20 + dr() * Math.min(q.w, q.d) * 0.3;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (onRoad(x, z, 5) || blocked(x, z, 3.5) || onRiver(x, z, 4)) continue;
    const g = new THREE.Group(), base = terrainAt(x, z);
    const hero = ["carwreck", "lampfall", "trafficfall"][(S.quadrants.indexOf(q) + i) % 3];
    for (const [name, size, rx, rz, ox, oz] of [[hero, hero === "carwreck" ? 4 : 5, 0, 0, 0.5, -0.4], ["container", 5, 0.25, 0.5, 2.2, 1.5], ["chimney", 5, 1.45, 0.6, -2, -1.4]]) {
      const src = await staticModel(name); if (!src) continue;
      const m = src.clone(true), bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3());
      m.scale.setScalar(size / Math.max(sz.x, sz.y, sz.z)); m.rotation.set(rx, dr() * 6, rz);
      const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3()); m.position.set(ox - c.x, -b2.min.y - 0.3, oz - c.z);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.color.multiplyScalar(0.7); } });
      g.add(m);
    }
    for (let k = 0; k < 8; k++) { const ch = new THREE.Mesh(propGeo, rubbleMat); const sz = 0.3 + dr() * 0.7; ch.scale.set(sz, sz * 0.6, sz); ch.position.set((dr() - 0.5) * 5, sz * 0.25, (dr() - 0.5) * 4); ch.rotation.set(dr(), dr() * 3, dr()); ch.castShadow = true; g.add(ch); }
    g.position.set(x, base, z); scene.add(g);
    blockers.push({ minX: x - 2.6, maxX: x + 2.6, minZ: z - 2.2, maxZ: z + 2.2, top: base + 1.4, base, walk: true, low: false, mesh: g, mats: [], prop: "debris" });
  }
  // Air traffic: haulers and shuttles fly loops high over the city.
  const fr = rng(2024);
  for (const [name, size, n] of [["hauler", 24, 2], ["shuttle", 20, 2]]) for (let i = 0; i < n; i++) {
    const src = await staticModel(name); if (!src) continue;
    const m = src.clone(true), box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
    m.scale.setScalar(size / Math.max(sz.x, sz.z));
    const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); m.position.sub(c);
    const g = new THREE.Group(); g.add(m); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
    const q = S.quadrants[Math.floor(fr() * S.quadrants.length)];
    flyers.push({ g, cx: q.x0 + q.w / 2, cz: q.z0 + q.d / 2, r: 70 + fr() * 90, y: 38 + fr() * 22, w: (0.06 + fr() * 0.05) * (fr() < 0.5 ? -1 : 1), a: fr() * 6.28 });
  }
}
// Cats breathe, and now and then look round.
const critters = [];
function updateCritters(now) {
  const t = now / 1000;
  for (const c of critters) { if (!c.m.parent) continue; c.m.scale.y = c.base * (1 + Math.sin(t * 2.4 + c.ph) * 0.025); }
}
const flyers = [];
function updateFlyers(dt) {
  for (const f of flyers) {
    f.a += f.w * dt;
    const x = f.cx + Math.cos(f.a) * f.r, z = f.cz + Math.sin(f.a) * f.r;
    const dx = -Math.sin(f.a) * Math.sign(f.w), dz = Math.cos(f.a) * Math.sign(f.w);
    f.g.position.set(x, f.y + Math.sin(f.a * 3) * 1.5, z);
    f.g.rotation.set(0, Math.atan2(dx, dz), 0); f.g.rotateZ(-Math.sign(f.w) * 0.18);
  }
}

/* ---------- horses ----------
   Horses stand hitched at a rail in every place, and some enforcers ride: they patrol on
   horseback, see further from up there, and gallop after Koda, jumping down to fight once
   they reach him. Walk up to any horse without a rider and press ACTION to ride it; ACTION
   or JUMP gets off. A hit knocks a rider (Koda too) out of the saddle.
   Each horse is one mesh on its own little skeleton, built here from simple shapes, and it
   walks, trots and gallops with its legs in a real horse's order. */
const horses = [];
const HORSE_SEAT = 1.6;   // the saddle, above the ground
// Bay, chestnut, black, dapple grey, palomino, dark bay, liver chestnut: kept deep enough to read against the sand.
const HORSE_COATS = [0x5a3018, 0x7a3a1c, 0x1e1813, 0x6a655e, 0x9a7440, 0x3a2212, 0x5e3a22];
const HORSE_CLOTHS = [0x2f5d8a, 0x8a6a2f, 0x3f6a34, 0x6a2f5d, 0x2f2f2f];
const ENFORCER_CLOTH = 0x7a1515;
const horseMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
const horseGeoCache = {};
// The skeleton at rest: [name, parent, x, y, z]. Legs are front left, front right, hind left, hind right.
const HORSE_BONES = [["root", -1, 0, 0, 0], ["body", 0, 0, 1.2, 0], ["neck", 1, 0, 1.38, 0.68], ["head", 2, 0, 1.86, 1.32], ["tail", 1, 0, 1.4, -0.92],
  ["lf", 1, 0.19, 1.02, 0.6], ["lf2", 5, 0.19, 0.55, 0.6], ["rf", 1, -0.19, 1.02, 0.6], ["rf2", 7, -0.19, 0.55, 0.6],
  ["lh", 1, 0.19, 1.02, -0.62], ["lh2", 9, 0.19, 0.55, -0.62], ["rh", 1, -0.19, 1.02, -0.62], ["rh2", 11, -0.19, 0.55, -0.62]];
function horseGeometry(coat, cloth) {
  const key = coat + ":" + cloth;
  if (horseGeoCache[key]) return horseGeoCache[key];
  const parts = [], dark = 0x1c1612, hoof = 0x2a2420, leather = 0x4a2e1a;
  const put = (g, bone, colour, fn) => { if (fn) fn(g); parts.push([g, bone, colour]); };
  put(new THREE.CapsuleGeometry(0.37, 1.2, 6, 14), 1, coat, g => { g.rotateX(Math.PI / 2); g.scale(0.95, 1.12, 1); g.translate(0, 1.2, 0); });
  put(new THREE.SphereGeometry(0.36, 12, 10), 1, coat, g => { g.scale(0.9, 1.05, 0.8); g.translate(0, 1.3, 0.62); });   // chest
  put(new THREE.CylinderGeometry(0.15, 0.3, 0.86, 12), 2, coat, g => { g.rotateX(0.95); g.translate(0, 1.62, 1.01); });
  put(new THREE.CylinderGeometry(0.08, 0.14, 0.58, 12), 3, coat, g => { g.rotateX(2.45); g.translate(0, 1.65, 1.52); });
  put(new THREE.SphereGeometry(0.15, 10, 8), 3, coat, g => { g.scale(0.85, 1, 1.2); g.translate(0, 1.88, 1.38); });
  put(new THREE.SphereGeometry(0.09, 8, 6), 3, dark, g => { g.scale(1, 0.8, 1); g.translate(0, 1.44, 1.69); });   // muzzle
  for (const s of [1, -1]) put(new THREE.ConeGeometry(0.04, 0.15, 6), 3, coat, g => { g.rotateX(-0.3); g.translate(s * 0.07, 2.04, 1.3); });
  put(new THREE.BoxGeometry(0.07, 0.2, 0.9), 2, dark, g => { g.rotateX(0.95 - Math.PI / 2); g.translate(0, 1.72, 0.95); });
  put(new THREE.CylinderGeometry(0.035, 0.1, 0.8, 7), 4, dark, g => { g.rotateX(-0.3); g.translate(0, 1.06, -1.04); });
  for (const [i, x, z] of [[5, 0.19, 0.6], [7, -0.19, 0.6], [9, 0.19, -0.62], [11, -0.19, -0.62]]) {
    put(new THREE.CylinderGeometry(0.08, z > 0 ? 0.1 : 0.13, 0.5, 8), i, coat, g => g.translate(x, 0.8, z));
    put(new THREE.CylinderGeometry(0.045, 0.06, 0.48, 7), i + 1, coat, g => g.translate(x, 0.32, z));
    put(new THREE.CylinderGeometry(0.068, 0.075, 0.09, 8), i + 1, hoof, g => g.translate(x, 0.045, z));
  }
  put(new THREE.BoxGeometry(0.72, 0.05, 0.86), 1, cloth, g => g.translate(0, 1.58, -0.06));
  put(new THREE.BoxGeometry(0.5, 0.12, 0.6), 1, leather, g => g.translate(0, 1.63, -0.06));
  put(new THREE.BoxGeometry(0.34, 0.16, 0.1), 1, leather, g => g.translate(0, 1.71, 0.22));
  // One geometry for the whole horse: positions, normals, a colour per part, and the bone it rides on.
  let nv = 0, ni = 0;
  for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
  let v = 0, k = 0;
  const c = new THREE.Color();
  for (const [g, bone, colour] of parts) {
    c.setHex(colour);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], (v + i) * 3); nor.set([n.getX(i), n.getY(i), n.getZ(i)], (v + i) * 3);
      col.set([c.r, c.g, c.b], (v + i) * 3); si[(v + i) * 4] = bone; sw[(v + i) * 4] = 1;
    }
    for (let i = 0; i < g.index.count; i++) idx[k + i] = g.index.getX(i) + v;
    v += p.count; k += g.index.count; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4)); geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return (horseGeoCache[key] = geo);
}
function makeHorse(x, z, yaw, { coat = HORSE_COATS[0], cloth = HORSE_CLOTHS[0], owner = "town" } = {}) {
  const bones = HORSE_BONES.map(([name]) => Object.assign(new THREE.Bone(), { name }));
  HORSE_BONES.forEach(([, p, bx, by, bz], i) => {
    if (p < 0) bones[i].position.set(bx, by, bz);
    else { const q = HORSE_BONES[p]; bones[i].position.set(bx - q[2], by - q[3], bz - q[4]); bones[p].add(bones[i]); }
  });
  const mesh = new THREE.SkinnedMesh(horseGeometry(coat, cloth), horseMat);
  mesh.add(bones[0]); mesh.castShadow = true; mesh.frustumCulled = false;
  const root = new THREE.Group(); root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const B = {}; bones.forEach(b => { B[b.name] = b; });
  const h = { root, mesh, B, pos: new THREE.Vector3(x, terrainAt(x, z), z), yaw, v: 0, ph: Math.random(), t: Math.random() * 10, graze: 0, rider: null, owner, last: new THREE.Vector3(x, 0, z), hitched: false };
  h.pos.y = groundAt(x, z);
  root.position.copy(h.pos); root.rotation.y = yaw;
  scene.add(root); horses.push(h);
  return h;
}
function removeHorse(h) { scene.remove(h.root); const i = horses.indexOf(h); if (i >= 0) horses.splice(i, 1); }
// The gaits: which leg steps when (as a share of one stride) and how far the legs reach.
const GAITS = {
  walk: { stride: 1.7, amp: 0.32, lift: 0.7, off: { lf: 0.25, rf: 0.75, lh: 0, rh: 0.5 }, bob: 0.02 },
  trot: { stride: 2.6, amp: 0.48, lift: 1.0, off: { lf: 0, rh: 0, rf: 0.5, lh: 0.5 }, bob: 0.05 },
  gallop: { stride: 4.6, amp: 0.78, lift: 1.3, off: { lh: 0, rh: 0.1, lf: 0.45, rf: 0.55 }, bob: 0.09 }
};
function poseHorse(h, dt) {
  const B = h.B, v = h.v, t = (h.t += dt);
  const gait = v > 7 ? GAITS.gallop : v > 3.2 ? GAITS.trot : GAITS.walk;
  const moving = Math.min(1, v / 0.6);
  h.ph = (h.ph + dt * v / gait.stride) % 1;
  for (const leg of ["lf", "rf", "lh", "rh"]) {
    const s = (h.ph + gait.off[leg]) * Math.PI * 2, front = leg[1] === "f";
    B[leg].rotation.x = -gait.amp * Math.sin(s) * moving;
    // The leg folds while it swings forward through the air.
    B[leg + "2"].rotation.x = (front ? 1 : 0.6) * gait.lift * Math.max(0, Math.cos(s)) * moving;
  }
  const s2 = h.ph * Math.PI * 4;
  B.body.position.y = 1.2 + Math.abs(Math.sin(s2)) * gait.bob * moving;
  B.body.rotation.x = v > 7 ? Math.sin(h.ph * Math.PI * 2) * 0.06 : 0;
  // Standing: the head goes down to graze now and then, the tail swishes, an ear-flick nod.
  if (v < 0.3 && !h.rider) { h.graze -= dt; if (h.graze < -9) h.graze = 4 + Math.random() * 3; }
  else h.graze = Math.min(h.graze, 0);
  const down = h.graze > 0 ? 1 : 0;
  B.neck.rotation.x += ((h.graze > 0 ? 0.95 : v > 7 ? 0.25 : 0) + Math.sin(t * 1.3) * 0.03 - B.neck.rotation.x) * Math.min(1, dt * 2.5);
  B.head.rotation.x = Math.sin(t * 0.8) * 0.05 + down * 0.2;
  B.tail.rotation.z = Math.sin(t * (v > 3 ? 3 : 1.6)) * 0.28;
  B.tail.rotation.x = -0.25 - Math.min(0.7, v * 0.07);
}
function updateHorses(dt) {
  for (const h of horses) {
    if (h.rider) { h.pos.copy(h.rider.pos); h.yaw = h.rider.yaw; }
    const near = koda && Math.hypot(h.pos.x - koda.pos.x, h.pos.z - koda.pos.z) < 70;
    h.root.visible = near && !h.hidden;
    if (!near) { h.last.copy(h.pos); continue; }
    // Speed measured from how far it really moved, so the legs never slide.
    const moved = dt > 0 ? Math.hypot(h.pos.x - h.last.x, h.pos.z - h.last.z) / dt : 0;
    h.last.copy(h.pos);
    h.v += (Math.min(moved, 14) - h.v) * Math.min(1, dt * 8);
    h.root.position.copy(h.pos); h.root.rotation.y = h.yaw;
    poseHorse(h, dt);
  }
}
// A rider's pose: thighs out and forward over the saddle, knees bent, hands on the reins.
function seatPose(root) {
  if (!root.userData.seat) root.userData.seat = ["UpLeg", "Leg"].map(part => ["Left", "Right"].map(sd => { let f = null; root.traverse(o => { if (!f && o.isBone && new RegExp("mixamorig:?" + sd + part + "$").test(o.name)) f = o; }); return f; }));
  root.updateMatrixWorld(true);
  root.getWorldQuaternion(_ai.rq);
  const across = new THREE.Vector3(1, 0, 0).applyQuaternion(_ai.rq).normalize(), ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(_ai.rq).normalize();
  const turn = (bone, axis, ang) => { if (!bone) return; bone.parent.getWorldQuaternion(_ai.pq); _ai.q.setFromAxisAngle(axis, ang); bone.quaternion.premultiply(_ai.pq.clone().invert().multiply(_ai.q).multiply(_ai.pq)); bone.updateMatrixWorld(true); };
  const [thighs, shins] = root.userData.seat;
  thighs.forEach((b, i) => { turn(b, ahead, (i === 0 ? 1 : -1) * 0.42); turn(b, across, -1.35); });
  shins.forEach(b => turn(b, across, 1.45));
  armsReach(root, 0.55);
}
function seat(a, on) {
  a.seated = on ? { lift: HORSE_SEAT - (a.hipsH || 0.95) + 0.02 } : null;
  if (!on) { a.model.position.y = a.baseY; a.model.position.z = 0; }
}
// Koda gets on and off.
function nearHorse(r = 2.6) {
  let best = null, bd = r;
  for (const h of horses) { if (h.rider) continue; const d = Math.hypot(h.pos.x - koda.pos.x, h.pos.z - koda.pos.z); if (d < bd) { bd = d; best = h; } }
  return best;
}
function mount(h) {
  koda.pushing = null; input.sneak = false; $("btnSneak").classList.remove("on");
  h.hitched = false; h.rider = koda; koda.riding = h; h.v = 0;
  koda.pos.set(h.pos.x, groundAt(h.pos.x, h.pos.z), h.pos.z); koda.face(h.yaw, 1);
  seat(koda, true); koda.play("idle", { fade: 0.1 });
  if (!save.rodeOnce) { save.rodeOnce = true; writeSave(); toast("Riding. Push further to trot, all the way (or Shift / RT) to gallop. ACTION or JUMP to get off.", 4); }
}
function dismount(knocked = false) {
  const h = koda.riding; if (!h) return;
  koda.riding = null; h.rider = null; h.v = 0; seat(koda, false);
  const sx = Math.cos(koda.yaw), sz = -Math.sin(koda.yaw);   // off to his left
  const s = freeSpot(koda.pos.x + sx * 1.1, koda.pos.z + sz * 1.1, 0.5);
  koda.pos.set(s.x, groundAt(s.x, s.z), s.z);
  if (knocked) { koda.play("hurt", { once: true }); attackLock = 0.5; }
  else koda.play("idle", { fade: 0.1 });
}
function ride(dt) {
  const h = koda.riding;
  const gallop = input.mag > 0.93 || boost.on;
  const target = !input.mag ? 0 : input.mag < 0.55 ? 1.8 : gallop ? 10.5 : 5.2;
  h.cmd = (h.cmd || 0) + (target - (h.cmd || 0)) * Math.min(1, dt * (target > (h.cmd || 0) ? 1.5 : 2.8));
  if (input.mag) koda.face(Math.atan2(input.x, input.z), Math.min(1, dt * (h.cmd > 6 ? 2.2 : 3.6)));
  if (h.cmd > 0.05) {
    const bx = koda.pos.x, bz = koda.pos.z;
    moveWithCollision(koda.pos, Math.sin(koda.yaw) * h.cmd * dt, Math.cos(koda.yaw) * h.cmd * dt, 0.6, true);
    const got = Math.hypot(koda.pos.x - bx, koda.pos.z - bz) / dt;
    if (got < h.cmd * 0.4) h.cmd = Math.max(got, h.cmd * 0.6);   // walked into something: pull up
  }
  const g = groundAt(koda.pos.x, koda.pos.z);
  if (g === MUD || swimming()) { dismount(); air = { vy: 0, speed: 0, kick: false, fall: true }; return; }
  koda.pos.y = g;
  koda.moving = h.cmd > 0.3; koda.sprinting = h.cmd > 7; koda.sneaking = false; koda.inCover = null;
  koda.play("idle");
  koda.update(dt);
}
// Enforcers on horseback.
function riderOff(e) {
  const h = e.horse; if (!h) return;
  e.horse = null; h.rider = null; h.v = 0; seat(e.a, false);
  const f = forward(e.a), s = freeSpot(e.a.pos.x + f.y * 1.1, e.a.pos.z - f.x * 1.1, 0.5);
  e.a.pos.set(s.x, floorAt(s.x, s.z), s.z);
  e.speed = 2 + Math.random() * 0.5;
}
function makeRider(kind, x, z, route, extra = {}) {
  return makeActor(kind + ".glb", ENEMIES[kind] || 1.9).then(a => {
    const h = makeHorse(x, z, 0, { coat: HORSE_COATS[Math.floor(Math.random() * HORSE_COATS.length)], cloth: ENFORCER_CLOTH, owner: "enemy" });
    a.pos.set(x, floorAt(x, z), z); scene.add(a.root); seat(a, true); a.play("fight_idle");
    h.rider = a;
    const e = Object.assign({ a, qd: null, route, leg: 1, state: "patrol", meter: 0, hp: kind === "gilded" ? 5 : 3, hidden: false, cool: 0.5, hitT: 0, lastSeen: new THREE.Vector3(), searchT: 0, speed: 2.1, kind, shiftT: 0, horse: h }, extra);
    enemies.push(e);
    return e;
  });
}
// A hitching rail: two posts and a bar, with horses tied to it, heads to the rail.
const railMat = new THREE.MeshStandardMaterial({ color: 0x6e4a2a, roughness: 0.9 });
function addHitch(x, z, yaw, n, r = Math.random) {
  const len = 1.6 * n + 0.6, base = terrainAt(x, z);
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.15, 7), railMat); p.position.set(s * len / 2, 0.57, 0); p.castShadow = true; g.add(p); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len + 0.1, 7), railMat); bar.rotation.z = Math.PI / 2; bar.position.y = 1.05; bar.castShadow = true; g.add(bar);
  const trough = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.35, 0.45), railMat); trough.position.set(0, 0.18, 0.5); trough.castShadow = true; g.add(trough);
  g.position.set(x, base, z); g.rotation.y = yaw; scene.add(g);
  const cx = Math.cos(yaw), sx = Math.sin(yaw);
  // Solid round the rail and the trough: the corners of that strip, turned with the rail.
  const pts = [[-len / 2, -0.1], [len / 2, -0.1], [-len / 2, 0.75], [len / 2, 0.75]].map(([lx, lz]) => [x + cx * lx + sx * lz, z - sx * lx + cx * lz]);
  const b = { minX: Math.min(...pts.map(q => q[0])), maxX: Math.max(...pts.map(q => q[0])), minZ: Math.min(...pts.map(q => q[1])), maxZ: Math.max(...pts.map(q => q[1])), top: base + 1.1, base, walk: false, low: true, mesh: g, mats: [] };
  blockers.push(b);
  const made = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 1.6, ax = x + cx * off + sx * 2.1, az = z - sx * off + cx * 2.1;
    const h = makeHorse(ax, az, yaw + Math.PI, { coat: HORSE_COATS[Math.floor(r() * HORSE_COATS.length)], cloth: HORSE_CLOTHS[Math.floor(r() * HORSE_CLOTHS.length)] });
    h.hitched = true; made.push(h);
  }
  return { g, horses: made, b };
}
function buildHitches() {
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(2) * 313 + 7), cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2;
    for (let tries = 0; tries < 14; tries++) {
      const a = r() * Math.PI * 2, d = 17 + r() * Math.min(q.w, q.d) * 0.25, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (onRoad(x, z, 4) || onRiver(x, z, 5) || ridgeAt(x, z) > 0.2 || blocked(x, z, 4.2)) continue;
      addHitch(x, z, Math.atan2(cx - x, cz - z) + Math.PI, 2 + (r() < 0.4 ? 1 : 0), r);
      break;
    }
  }
}
// Free roam: riders patrol the roads, two to a district.
function spawnRoadRiders() {
  const r = rng(4242), kinds = Object.keys(ENEMIES).filter(k => k !== "gilded"), m = mission;
  for (const q of S.quadrants) {
    if (r() < 0.45) continue;
    const cx = q.x0 + q.w / 2, cz = q.z0 + q.d / 2, route = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + r(), s = freeSpot(cx + Math.cos(a) * 24, cz + Math.sin(a) * 24, 1); route.push(new THREE.Vector3(s.x, floorAt(s.x, s.z), s.z)); }
    makeRider(kinds[Math.floor(r() * kinds.length)], route[0].x, route[0].z, route, { roam: true }).then(e => { if (mission !== m) { scene.remove(e.a.root); removeHorse(e.horse); enemies.splice(enemies.indexOf(e), 1); } }).catch(() => null);
  }
}

/* ---------- townsfolk at work ----------
   The place Koda is in comes alive: a seller behind every stall and people walking
   between spots, stopping to stand a while. Only nearby places are filled, to keep it smooth. */
const ambient = [];   // { a, job: "sell" | "walk", q, to, wait, line }
const SELLER_LINES = ["Fresh bread, still warm.", "Two for one, today only.", "You look hungry. Sit, eat.", "Best spice on the street.", "Mind the Veil wardens. They don't pay.", "Music's back on the radio. Good sign."];
let ambientQ = null, ambientBusy = false;
async function updateAmbient(dt) {
  const q = zoneAt(koda.pos.x, koda.pos.z) || null;
  if (q !== ambientQ && !ambientBusy) {
    ambientBusy = true; ambientQ = q;
    for (const p of ambient.splice(0)) scene.remove(p.a.root);
    if (q) {
      const r = rng(q.id.charCodeAt(2) * 77 + Math.floor(performance.now() / 60000));
      const jobs = [];
      for (const st of stalls.filter(s => s.q === q)) jobs.push(makeActor("townsfolk/" + TOWNSFOLK[Math.floor(r() * TOWNSFOLK.length)] + ".glb", 1.65).then(a => { if (!a || ambientQ !== q) return; a.pos.set(st.x, floorAt(st.x, st.z), st.z); a.face(st.yaw + Math.PI, 1); a.play("idle"); scene.add(a.root); ambient.push({ a, job: "sell", q, line: SELLER_LINES[Math.floor(r() * SELLER_LINES.length)] }); }).catch(() => null));
      for (let i = 0; i < 4; i++) jobs.push(makeActor("townsfolk/" + TOWNSFOLK[Math.floor(r() * TOWNSFOLK.length)] + ".glb", 1.65).then(a => { if (!a || ambientQ !== q) return; const s = freeSpot(q.x0 + 10 + r() * (q.w - 20), q.z0 + 10 + r() * (q.d - 20), 0.8, r); a.pos.set(s.x, floorAt(s.x, s.z), s.z); a.play("idle"); scene.add(a.root); ambient.push({ a, job: "walk", q, to: null, wait: r() * 3 }); }).catch(() => null));
      await Promise.all(jobs);
    }
    ambientBusy = false;
  }
  for (const p of ambient) {
    const a = p.a;
    if (p.job === "walk") {
      if (p.wait > 0) { p.wait -= dt; a.play("idle"); }
      else {
        if (!p.to) { const s = freeSpot(p.q.x0 + 8 + Math.random() * (p.q.w - 16), p.q.z0 + 8 + Math.random() * (p.q.d - 16), 0.8); p.to = s; }
        const dx = p.to.x - a.pos.x, dz = p.to.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.8) { p.to = null; p.wait = 2 + Math.random() * 5; }
        else {
          const before = a.pos.x + a.pos.z;
          moveWithCollision(a.pos, dx / d * 1.3 * dt, dz / d * 1.3 * dt, 0.4);
          a.pos.y = floorAt(a.pos.x, a.pos.z);
          a.face(Math.atan2(dx, dz), Math.min(1, dt * 5)); a.play("walk");
          p.stuck = Math.abs(a.pos.x + a.pos.z - before) < 0.002 ? (p.stuck || 0) + dt : 0;
          if (p.stuck > 1) { p.to = null; p.stuck = 0; }
        }
      }
    } else if (dist2(a.pos, koda.pos) < 4) a.faceTo(koda.pos.x, koda.pos.z, Math.min(1, dt * 3));
    a.update(dt);
  }
}
function talkToAmbient() {
  const p = ambient.find(p => dist2(p.a.pos, koda.pos) < 2.8);
  if (!p) return false;
  p.a.faceTo(koda.pos.x, koda.pos.z);
  toast(p.job === "sell" ? `"${p.line}"` : `"${["Evening.", "Stay out of the wardens' way.", "Heard the music tonight?", "Busy day."][Math.floor(Math.random() * 4)]}"`, 2.5);
  if (p.job === "walk") { p.wait = 3; p.to = null; }
  return true;
}

/* ---------- prayer points ----------
   One in every place. Find it and pray (ACTION) to light it; from then on the pause map
   can take you straight there. */
const shrines = [];
const shrineStone = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
const shrineGlow = new THREE.MeshStandardMaterial({ color: 0x3a3428, emissive: 0x000000, roughness: 0.4 });
function buildShrines() {
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(2) * 313 + 7);
    const spot = freeSpot(q.x0 + q.w * (0.25 + r() * 0.1), q.z0 + q.d * (0.72 + r() * 0.1), 1.6, r);
    const g = new THREE.Group(), base = terrainAt(spot.x, spot.z);
    const step = new THREE.Mesh(propGeo, shrineStone); step.scale.set(2.2, 0.3, 2.2); step.position.y = 0.15; g.add(step);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.5, 8), shrineStone); pillar.position.y = 1.05; g.add(pillar);
    const mat = shrineGlow.clone();
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), mat); flame.position.y = 2.1; g.add(flame);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(spot.x, base, spot.z); scene.add(g);
    blockers.push({ minX: spot.x - 0.45, maxX: spot.x + 0.45, minZ: spot.z - 0.45, maxZ: spot.z + 0.45, top: base + 1.8, base, mats: [] });
    shrines.push({ q, x: spot.x, z: spot.z, flame, mat });
  }
  lightShrines();
}
function lightShrines() {
  for (const sh of shrines) {
    const lit = !!(save.shrines && save.shrines[sh.q.id]);
    sh.mat.color.setHex(lit ? 0xffd27a : 0x3a3428); sh.mat.emissive.setHex(lit ? 0xffa83a : 0x000000); sh.mat.emissiveIntensity = lit ? 1.4 : 0;
  }
}
function prayNear() {
  const sh = shrines.find(s => Math.hypot(koda.pos.x - s.x, koda.pos.z - s.z) < 3);
  if (!sh) return false;
  save.shrines = save.shrines || {};
  if (!save.shrines[sh.q.id]) {
    save.shrines[sh.q.id] = true; writeSave(); lightShrines(); sfxUnlock();
    toast(`Prayer point found in ${sh.q.name}. Travel here any time from the map.`, 3.5);
  } else popText("PRAYED");
  return true;
}
function travelTo(sh) {
  const busy = race || (mission && mission.quads.some(q => q.arena && q.arena.started && !q.arena.open));
  if (busy) { toast("Finish what you're in the middle of first.", 2.5); return; }
  resume();
  koda.pushing = null; air = null;
  const s = freeSpot(sh.x, sh.z + 2.2, 0.8);
  koda.pos.set(s.x, groundAt(s.x, s.z), s.z); lastSafe.copy(koda.pos);
  if (zora && zora.following) zora.pos.set(s.x + 1, floorAt(s.x + 1, s.z), s.z);
  updateCamera(0, true);
  toast(`You arrive at the prayer point in ${sh.q.name}.`, 2.5);
}
function renderTravel() {
  const box = $("pauseTravel"); if (!box) return;
  const lit = shrines.filter(s => save.shrines && save.shrines[s.q.id]);
  box.innerHTML = lit.length ? '<span class="travel-label">Travel to</span>' + lit.map((s, i) => `<button class="ghost" data-i="${shrines.indexOf(s)}">${s.q.name}</button>`).join("") : '<span class="travel-label">Find prayer points to travel between places.</span>';
}
$("pauseTravel") && $("pauseTravel").addEventListener("click", e => { const b = e.target.closest("button"); if (b) travelTo(shrines[+b.dataset.i]); });

/* ---------- play together ----------
   A room is a four-letter code. Everyone in it sees everyone else walking the city as
   Koda with their own colour ring and name over their head, and can build together:
   pieces anyone places show up for the whole room (an admin's are also kept in the city).
   Runs over Feelz Machine's live connection, so it works on the real site. */
const COOP_COLOURS = [0xf2b544, 0x5ad1ff, 0xff5a8a, 0x7fe39a, 0xb16cd9, 0xff8a3c];
const coop = { ch: null, code: "", id: Math.random().toString(36).slice(2, 10), colour: 0, others: new Map(), sendT: 0, pieces: [] };
try { coop.colour = +(localStorage.getItem("gill.coopColour") || 0) % COOP_COLOURS.length; } catch (e) { /* no storage */ }
function coopName() { return ["Gold", "Sky", "Rose", "Mint", "Violet", "Flame"][coop.colour]; }
function coopRender() {
  $("coopColours").innerHTML = COOP_COLOURS.map((c, i) => `<button class="${i === coop.colour ? "on" : ""}" data-i="${i}" style="background:${hexCol(c)}" aria-label="${["Gold", "Sky", "Rose", "Mint", "Violet", "Flame"][i]}"></button>`).join("");
  $("coopStatus").innerHTML = coop.ch ? `In room${"<big>" + coop.code + "</big>"}${coop.others.size} other${coop.others.size === 1 ? "" : "s"} here` : (ONLINE ? "" : "Playing together works on feelzmachine.com.");
  $("coopPill").classList.toggle("hidden", !coop.ch);
  $("coopPill").textContent = coop.ch ? `ROOM ${coop.code} · ${coop.others.size + 1}` : "";
  showBuildBtn();
}
function nameTag(text, colour) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "rgba(0,0,0,.75)"; g.beginPath(); g.roundRect(8, 8, 240, 48, 24); g.fill();
  g.fillStyle = hexCol(colour); g.font = "900 30px Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 5; return sp;
}
async function coopJoin(code) {
  code = (code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (!ONLINE) { coopRender(); return; }
  if (code.length !== 4) { $("coopStatus").textContent = "A room code is four letters."; return; }
  await coopLeave();
  coop.code = code;
  const ch = ONLINE.channel("gill-room-" + code, { config: { broadcast: { self: false }, presence: { key: coop.id } } });
  ch.on("broadcast", { event: "pos" }, ({ payload: m }) => coopPos(m));
  voiceWire(ch);
  ch.on("broadcast", { event: "piece" }, ({ payload: m }) => coopPiece(m.rec, false));
  ch.on("broadcast", { event: "unpiece" }, ({ payload: m }) => coopUnpiece(m.key));
  ch.on("broadcast", { event: "pieces" }, ({ payload: m }) => { if (m.to === coop.id) for (const rec of m.list) coopPiece(rec, false); });
  ch.on("presence", { event: "join" }, ({ key }) => {
    // Whoever has been here longest hands the newcomer what the room has built so far.
    const list = coop.pieces.map(p => p.rec).concat(worldMade.filter(m => !coop.pieces.some(p => p.made === m)).map(m => m.rec));
    if (key !== coop.id && list.length) ch.send({ type: "broadcast", event: "pieces", payload: { to: key, list } });
  });
  ch.on("presence", { event: "leave" }, ({ key }) => { const o = coop.others.get(key); if (o) { scene.remove(o.root); coop.others.delete(key); coopRender(); } });
  voiceCheck();
  ch.subscribe(async st => { if (st === "SUBSCRIBED") { await ch.track({ colour: coop.colour }); coopRender(); toast(`You're in room ${code}. Share the code to play together.`, 3); } });
  coop.ch = ch;
  coopRender();
}
async function coopLeave() {
  if (!coop.ch) return;
  try { await coop.ch.unsubscribe(); } catch (e) { /* gone already */ }
  if (voice.on) await voiceToggle();
  coop.ch = null; coop.code = "";
  for (const o of coop.others.values()) scene.remove(o.root);
  coop.others.clear();
  for (const p of coop.pieces) if (!p.rec.id && !worldMade.includes(p.made)) { unmakePiece(p.made); if (placed.includes(p.made)) placed.splice(placed.indexOf(p.made), 1); }
  coop.pieces = [];
  coopRender();
}
async function coopPos(m) {
  let o = coop.others.get(m.id);
  if (!o) {
    o = { loading: true, root: new THREE.Group(), tx: m.x, ty: m.y, tz: m.z, yaw: m.yaw };
    coop.others.set(m.id, o); scene.add(o.root);
    const a = await makeActor("koda.glb", 1.62).catch(() => null);
    if (!a || !coop.others.has(m.id)) return;
    a.armIn = KODA_ARM_IN; a.reach = 0; o.a = a; o.root.add(a.root); a.pos.set(0, 0, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: COOP_COLOURS[m.c % COOP_COLOURS.length], transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; o.root.add(ring);
    const tag = nameTag(["Gold", "Sky", "Rose", "Mint", "Violet", "Flame"][m.c % 6], COOP_COLOURS[m.c % COOP_COLOURS.length]); tag.position.y = 2.15; o.root.add(tag);
    o.root.position.set(m.x, m.y, m.z); o.loading = false; coopRender();
  }
  o.tx = m.x; o.ty = m.y; o.tz = m.z; o.yaw = m.yaw; o.anim = m.an; o.seen = performance.now();
}
function updateCoop(dt) {
  if (!coop.ch) return;
  coop.sendT -= dt;
  if (coop.sendT <= 0 && koda) {
    coop.sendT = 0.12;
    const an = koda.current ? koda.current.getClip().name : "idle";
    coop.ch.send({ type: "broadcast", event: "pos", payload: { id: coop.id, c: coop.colour, x: +koda.pos.x.toFixed(2), y: +koda.pos.y.toFixed(2), z: +koda.pos.z.toFixed(2), yaw: +koda.yaw.toFixed(2), an } });
  }
  for (const [id, o] of coop.others) {
    if (!o.a) continue;
    const k = Math.min(1, dt * 10);
    o.root.position.x += (o.tx - o.root.position.x) * k; o.root.position.y += (o.ty - o.root.position.y) * k; o.root.position.z += (o.tz - o.root.position.z) * k;
    o.a.face(o.yaw, Math.min(1, dt * 10));
    if (o.anim && o.a.has(o.anim)) o.a.play(o.anim, { once: /^(punch|combo|elbowup|knee|hurricane|roundhouse|spinflip|crescent|frontflip|backflip|roll|dodge|jump|vault|takedown|kick|flykick)$/.test(o.anim) && o.a.current && o.a.current.getClip().name !== o.anim });
    o.a.update(dt);
  }
}
function coopPieceKey(rec) { return rec.id || `${rec.kind}:${rec.x.toFixed(1)}:${rec.z.toFixed(1)}`; }
async function coopPiece(rec, mine) {
  if (coop.pieces.some(p => coopPieceKey(p.rec) === coopPieceKey(rec)) || placed.some(m => m.rec.id && m.rec.id === rec.id)) return;
  const made = mine || await makePiece(rec);
  coop.pieces.push({ rec, made });
  if (!mine) {
    placed.push(made);
    // A friend built it in my world: I keep it for them.
    if (myWorld && canSaveWorlds && ONLINE && !rec.id) {
      const row = Object.assign({}, rec, { world_id: myWorld.id }); delete row.id;
      ONLINE.from("gill_world_items").insert(row).select("id").single().then(({ data }) => { if (data) { made.rec.id = data.id; worldMade.push(made); } });
    }
  }
}
function coopUnpiece(key) {
  const i = coop.pieces.findIndex(p => coopPieceKey(p.rec) === key);
  if (i < 0) return;
  const p = coop.pieces.splice(i, 1)[0];
  if (placed.includes(p.made)) { unmakePiece(p.made); placed.splice(placed.indexOf(p.made), 1); }
  if (worldMade.includes(p.made)) { worldMade.splice(worldMade.indexOf(p.made), 1); if (ONLINE && canSaveWorlds && p.made.rec.id) ONLINE.from("gill_world_items").delete().eq("id", p.made.rec.id); }
}
(function coopControls() {
  $("coopBtn").addEventListener("click", () => { $("coop").classList.remove("hidden"); coopRender(); });
  $("coopClose").addEventListener("click", () => $("coop").classList.add("hidden"));
  $("coopColours").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; coop.colour = +b.dataset.i; try { localStorage.setItem("gill.coopColour", coop.colour); } catch (er) { /* no storage */ } if (coop.ch) coop.ch.track({ colour: coop.colour }); coopRender(); });
  $("coopMake").addEventListener("click", () => { const L = "ABCDEFGHJKMNPQRSTUVWXYZ"; let c = ""; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; coopJoin(c); });
  $("coopJoin").addEventListener("click", () => coopJoin($("coopCode").value));
  $("coopCode").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") coopJoin($("coopCode").value); });
})();

/* ---------- my worlds ----------
   A world is the city plus everything one player builds in it, kept on their Feelz Machine
   account (Premium keeps it; anyone can play and try building). Open it from My worlds: it plays
   as free roam with your pieces in place. Make a room from inside it and friends walk and
   build in it with you; what they place is kept in your world. The official city (Steve's
   pieces, the missions) is the same for everyone. */
let myWorld = null, canSaveWorlds = false;
const worldMade = [];
function saveTable() {
  if (!ONLINE) return null;
  if (myWorld) return canSaveWorlds ? "gill_world_items" : null;
  return canBuild ? "gill_world_pieces" : null;
}
async function checkWorlds() {
  canSaveWorlds = false;
  if (!ONLINE) return false;
  try { const { data: s2 } = await ONLINE.auth.getSession(); if (!s2 || !s2.session) return false; const { data } = await ONLINE.rpc("gill_can_save_worlds"); canSaveWorlds = data === true; } catch (e) { canSaveWorlds = false; }
  return canSaveWorlds;
}
async function renderWorlds() {
  const list = $("worldList"), note = $("worldsNote");
  list.innerHTML = ""; $("worldNew").disabled = true;
  if (!ONLINE) { note.textContent = "Worlds are kept on feelzmachine.com."; return; }
  const { data: s2 } = await ONLINE.auth.getSession();
  if (!s2 || !s2.session) { note.textContent = "Sign in to Feelz Machine in this browser to keep worlds."; return; }
  await checkWorlds();
  note.textContent = canSaveWorlds ? "Your worlds, kept on your Feelz Machine account." : "Making your own worlds comes with Feelz Machine Premium. The game, Free roam and rooms are free for everyone, and you can build in them.";
  $("worldNew").disabled = !canSaveWorlds;
  const { data } = await ONLINE.from("gill_worlds").select("id,name,updated_at").order("updated_at", { ascending: false });
  list.innerHTML = (data || []).map(w => `<div class="world-row" data-id="${w.id}"><b>${w.name.replace(/[<>&]/g, "")}</b><small>${new Date(w.updated_at).toLocaleDateString()}</small><button class="primary" data-act="play">Play</button><button class="ghost" data-act="rename">Rename</button></div>`).join("") || (canSaveWorlds ? '<p class="coop-or">No worlds yet. Make your first one.</p>' : "");
  list._worlds = data || [];
}
async function enterWorld(w) {
  $("worlds").classList.add("hidden");
  startFreeRoam();
  myWorld = { id: w.id, name: w.name }; loadInv(); drawInventory();
  $("worldPill").textContent = w.name.toUpperCase(); $("worldPill").classList.remove("hidden");
  toast(`Welcome to ${w.name}.`, 2.5);
  const { data } = await ONLINE.from("gill_world_items").select("id,kind,model,label,x,z,rot,w,d,h,interior,door,y").eq("world_id", w.id).limit(5000);
  if (!myWorld || myWorld.id !== w.id) return;
  for (const rec of data || []) { const made = await makePiece(rec); placed.push(made); worldMade.push(made); }
  wakePlacedEnforcers();
  showBuildBtn();
}
function leaveWorld() {
  for (const m of worldMade.splice(0)) { unmakePiece(m); if (placed.includes(m)) placed.splice(placed.indexOf(m), 1); }
  myWorld = null; $("worldPill").classList.add("hidden");
}
(function worldControls() {
  $("worldsBtn").addEventListener("click", () => { $("worlds").classList.remove("hidden"); renderWorlds(); });
  $("worldsClose").addEventListener("click", () => $("worlds").classList.add("hidden"));
  $("worldNew").addEventListener("click", async () => {
    const n = (($("worldList")._worlds || []).length) + 1;
    const { data, error } = await ONLINE.from("gill_worlds").insert({ name: "My world " + n }).select("id,name").single();
    if (error) { $("worldsNote").textContent = /10 worlds/.test(error.message) ? "You can keep up to 10 worlds." : "Couldn't make a world. Try again."; return; }
    enterWorld(data);
  });
  $("worldList").addEventListener("click", async e => {
    const b = e.target.closest("button"), row = e.target.closest(".world-row"); if (!b || !row) return;
    const w = ($("worldList")._worlds || []).find(x => x.id === row.dataset.id); if (!w) return;
    if (b.dataset.act === "play") return enterWorld(w);
    // Rename in place: the name becomes a box to type into.
    const box = document.createElement("input"); box.value = w.name; box.maxLength = 40; box.className = "world-name";
    row.querySelector("b").replaceWith(box); box.focus(); box.select();
    const done = async () => { const v = box.value.trim().slice(0, 40); if (v && v !== w.name) await ONLINE.from("gill_worlds").update({ name: v, updated_at: new Date().toISOString() }).eq("id", w.id); renderWorlds(); };
    box.addEventListener("keydown", ev => { ev.stopPropagation(); if (ev.key === "Enter") done(); });
    box.addEventListener("blur", done, { once: true });
  });
})();

/* ---------- gathering, Minecraft style ----------
   In free roam and in your own worlds, blocks and ground cost materials you gather yourself:
   hold ACTION (E, Y, or the Gather button while building) by a tree for wood, by rocks and
   hills for stone, on open sand for sand. Admins building the official city build for free. */
// Signed in: materials live on your Feelz Machine account (bought with credits or gathered).
// Not signed in: they live in this browser.
const MATS = ["wood", "stone", "sand", "metal", "glass"];
let inv = { wood: 0, stone: 0, sand: 0, metal: 0, glass: 0 }, invOnline = false, credits = 0, invPending = {};
const invKey = () => "gill.inv." + (myWorld ? myWorld.id : "roam");
async function refreshInv() {
  if (!ONLINE) return false;
  try {
    const { data: s2 } = await ONLINE.auth.getSession(); if (!s2 || !s2.session) return false;
    const { data, error } = await ONLINE.rpc("gill_inv"); if (error || !data) return false;
    for (const k of MATS) inv[k] = data[k] || 0; credits = data.credits || 0; invOnline = true; drawInventory(); return data;
  } catch (e) { return false; }
}
function loadInv() {
  if (invOnline) { refreshInv(); return; }
  try { inv = Object.assign({ wood: 0, stone: 0, sand: 0, metal: 0, glass: 0 }, JSON.parse(localStorage.getItem(invKey()) || "{}")); } catch (e) { inv = { wood: 0, stone: 0, sand: 0, metal: 0, glass: 0 }; }
}
function saveInv() { if (invOnline) return; try { localStorage.setItem(invKey(), JSON.stringify(inv)); } catch (e) { /* no storage */ } }
// Gathered units go to the account a few at a time.
setInterval(async () => {
  if (!invOnline) return;
  for (const k of Object.keys(invPending)) {
    const n = invPending[k]; if (!n) continue; invPending[k] = 0;
    const { data } = await ONLINE.rpc("gill_gather", { p_kind: k, p_n: n });
    if (data) { for (const m of MATS) inv[m] = data[m] || 0; drawInventory(); }
  }
}, 3000);
function usesMaterials() { return !(saveTable() === "gill_world_pieces") && (!!myWorld || state === "build" || (mission && mission.def.free)); }
function spend(cost) {
  for (const k in cost) if ((inv[k] || 0) < cost[k]) { popText(`NEED ${cost[k]} ${k.toUpperCase()}`); toast(`You need ${cost[k]} ${k}. Gather it (hold ACTION) or buy it at a store.`, 2.5); return false; }
  for (const k in cost) inv[k] -= cost[k];
  saveInv(); drawInventory();
  if (invOnline) ONLINE.rpc("gill_spend", { p_cost: cost }).then(({ data, error }) => { if (error) { refreshInv(); toast("Couldn't take those materials from your account.", 2.5); } else if (data) { for (const m of MATS) inv[m] = data[m] || 0; drawInventory(); } });
  return true;
}
function drawInventory() {
  const el = $("inv"), show = usesMaterials() && (state === "build" || (mission && mission.def.free));
  el.classList.toggle("hidden", !show);
  if (show) el.innerHTML = `<b title="Wood">🪵 ${inv.wood}</b><b title="Stone">🪨 ${inv.stone}</b><b title="Sand">⏳ ${inv.sand}</b><b title="Metal">⚙️ ${inv.metal}</b><b title="Glass">💎 ${inv.glass}</b>`;
}
const gather = { t: 0, what: null };
function gatherable() {
  const x = koda.pos.x, z = koda.pos.z;
  if (swayers.some(sw => sw.g.children.length > 2 && Math.hypot(sw.g.position.x - x, sw.g.position.z - z) < 2.4) || placed.some(m => (m.rec.kind === "tree" || m.rec.kind === "palm") && Math.hypot(m.rec.x - x, m.rec.z - z) < 2.2)) return "wood";
  if (nearBlocks(x, z, 2.5).some(b => b.prop === "debris")) return "metal";
  if (ridgeAt(x, z) > 0.2 || nearBlocks(x, z, 2).some(b => b.prop === "rocks") || placed.some(m => (m.rec.kind === "rock" || m.rec.kind === "boulder") && Math.hypot(m.rec.x - x, m.rec.z - z) < 3.5)) return "stone";
  if (onSand(x, z)) return "sand";
  return null;
}
function updateGather(dt, holding) {
  const what = holding ? gatherable() : null;
  if (!what) { gather.t = 0; gather.what = null; return false; }
  if (gather.what !== what) { gather.what = what; gather.t = 0; }
  gather.t += dt;
  koda.play(koda.has("pound") ? "pound" : "idle");
  if (gather.t >= 0.9) { gather.t = 0; inv[what]++; if (invOnline) invPending[what] = (invPending[what] || 0) + 1; saveInv(); drawInventory(); popText(`+1 ${what.toUpperCase()}`); sfxHit(false); }
  return true;
}
// Enforcers placed by builders patrol in free roam and in worlds.
function wakePlacedEnforcers() {
  for (const m of placed) {
    if (m.rec.kind !== "enforcer" || m.awake) continue;
    m.awake = true;
    if (m.actor) m.actor.root.visible = false;
    const r = m.rec, route = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + (r.rot || 0), s2 = freeSpot(r.x + Math.cos(a) * 5, r.z + Math.sin(a) * 5, 0.6); route.push(new THREE.Vector3(s2.x, floorAt(s2.x, s2.z), s2.z)); }
    const mounted = /^horse:/.test(r.model || ""), kind = mounted ? r.model.slice(6) : r.model;
    if (mounted) { if (m.horse) m.horse.hidden = true; makeRider(kind, r.x, r.z, route, { placed: m }).catch(() => null); continue; }
    makeActor(kind + ".glb", ENEMIES[kind] || 1.9).then(a => {
      if (!a || !(mission && mission.def.free)) return;
      a.pos.set(r.x, floorAt(r.x, r.z), r.z); scene.add(a.root); a.play("walk");
      enemies.push({ a, qd: null, route, leg: 1, state: "patrol", meter: 0, hp: r.model === "gilded" ? 5 : 3, hidden: false, cool: 0.5, hitT: 0, lastSeen: new THREE.Vector3(), searchT: 0, speed: 2.2, kind: r.model, shiftT: 0, placed: m });
    }).catch(() => null);
  }
}
function sleepPlacedEnforcers() { for (const m of placed) if (m.rec.kind === "enforcer") { m.awake = false; if (m.actor) m.actor.root.visible = true; if (m.horse) m.horse.hidden = false; } }

/* ---------- stores ----------
   Every place has stores. Walk up to one and press ACTION: buy wood, stone, sand, metal and
   glass with your Feelz Machine credits (the ones Feelz Run pays out). */
const SHOP_ITEMS = { wood: ["Wood", "🪵", 20], stone: ["Stone", "🪨", 20], sand: ["Sand", "⏳", 10], metal: ["Metal", "⚙️", 40], glass: ["Glass", "💎", 30] };
let shopSells = null;
function storeNear() {
  const x = koda.pos.x, z = koda.pos.z;
  const s2 = stores.find(m => Math.hypot(m.rec.x - x, m.rec.z - z) < Math.max(m.rec.w, m.rec.d) / 2 + 2.2);
  if (s2) return s2.store;
  const tb = nearBlocks(x, z, 2.6).find(b => b.store);
  return tb ? tb.store : null;
}
async function openShop(sells) {
  shopSells = sells;
  const names = { general: "General store", wood: "Timber yard", stone: "Quarry", sand: "Sand pit", metal: "Scrap yard", glass: "Glassworks" };
  $("shopTitle").textContent = names[sells] || "Store";
  $("shop").classList.remove("hidden");
  if (state === "play") { state = "paused"; shopOpen = true; }
  await renderShop();
}
let shopOpen = false;
function closeShop() { $("shop").classList.add("hidden"); if (shopOpen) { shopOpen = false; state = "play"; lastT = performance.now(); } }
async function renderShop() {
  const kinds = shopSells === "general" ? Object.keys(SHOP_ITEMS) : [shopSells];
  const online = await refreshInv();
  $("shopNote").textContent = online ? `You have ${credits} credits. Feelz Run finds turn into credits.` : "Sign in to Feelz Machine to shop with your credits. You can still gather by hand (hold ACTION).";
  $("shopList").innerHTML = kinds.map(k => `<div class="shop-row" data-k="${k}"><span>${SHOP_ITEMS[k][1]}</span><b>${SHOP_ITEMS[k][0]}</b><small>${SHOP_ITEMS[k][2]} each · you have ${inv[k] || 0}</small><button class="ghost" data-n="1" ${online ? "" : "disabled"}>Buy 1</button><button class="primary" data-n="10" ${online ? "" : "disabled"}>Buy 10</button></div>`).join("");
  $("shopConvert").disabled = !online;
}
(function shopControls() {
  $("shopClose").addEventListener("click", closeShop);
  $("shopList").addEventListener("click", async e => {
    const b = e.target.closest("button"), row = e.target.closest(".shop-row"); if (!b || !row) return;
    b.disabled = true;
    const { data, error } = await ONLINE.rpc("gill_buy", { p_kind: row.dataset.k, p_qty: +b.dataset.n });
    if (error) $("shopNote").textContent = /Not enough credits/.test(error.message) ? "Not enough credits. Play Feelz Run for more, or gather by hand." : "Couldn't buy that. Try again.";
    else { for (const m of MATS) inv[m] = data[m] || 0; credits = data.credits; sfxUnlock(); await renderShop(); }
  });
  $("shopConvert").addEventListener("click", async () => {
    const { error } = await ONLINE.rpc("game_convert");
    $("shopNote").textContent = error ? (/Nothing to convert/.test(error.message) ? "Nothing to turn in yet. Play Feelz Run to find records, notes, pages and coins." : "Couldn't turn them in. Try again.") : "Done!";
    if (!error) renderShop();
  });
})();

/* ---------- chat and voice ----------
   In a room: everyone can type (T or the Chat button). Voice is for adults only: the button
   shows when your Feelz Machine account has a birth date showing 18 or over. */
const CHAT_BAD = /\b(fuck|shit|bitch|cunt|nigg|fag|dick|pussy|slut|whore)\w*/gi;
function chatShow(name, colour, text) {
  const p2 = document.createElement("p");
  p2.innerHTML = `<b style="color:${hexCol(colour)}"></b><span></span>`;
  p2.querySelector("b").textContent = name; p2.querySelector("span").textContent = text;
  const log = $("chatLog"); log.appendChild(p2); while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => { p2.style.opacity = "0"; setTimeout(() => p2.remove(), 700); }, 9000);
}
function chatSend() {
  const box = $("chatInput"), text = box.value.trim().slice(0, 120).replace(CHAT_BAD, m => "*".repeat(m.length));
  box.value = ""; $("chatBox").classList.add("hidden"); box.blur();
  if (!text || !coop.ch) return;
  coop.ch.send({ type: "broadcast", event: "chat", payload: { id: coop.id, c: coop.colour, text } });
  chatShow(coopName() + " (you)", COOP_COLOURS[coop.colour], text);
}
function chatOpen() { if (!coop.ch) return; $("chatBox").classList.remove("hidden"); $("chatInput").focus(); }
$("btnChat").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); chatOpen(); });
$("chatSend").addEventListener("click", chatSend);
$("chatInput").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") chatSend(); if (e.key === "Escape") { $("chatBox").classList.add("hidden"); e.target.blur(); } });
addEventListener("keydown", e => { if (e.code === "KeyT" && coop.ch && (state === "play" || state === "build") && document.activeElement !== $("chatInput")) { e.preventDefault(); chatOpen(); } });
// Voice: a direct audio link to each other adult in the room who has their voice on.
const voice = { ok: false, on: false, stream: null, peers: new Map() };
async function voiceCheck() { if (!ONLINE) return false; try { const { data } = await ONLINE.rpc("gill_voice_ok"); voice.ok = data === true; } catch (e) { voice.ok = false; } return voice.ok; }
function voicePeer(id) {
  let pc = voice.peers.get(id);
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  voice.peers.set(id, pc);
  if (voice.stream) for (const t of voice.stream.getTracks()) pc.addTrack(t, voice.stream);
  pc.onicecandidate = ev => { if (ev.candidate && coop.ch) coop.ch.send({ type: "broadcast", event: "rtc", payload: { from: coop.id, to: id, cand: ev.candidate } }); };
  pc.ontrack = ev => { let el = document.getElementById("va-" + id); if (!el) { el = Object.assign(document.createElement("audio"), { id: "va-" + id, autoplay: true }); document.body.appendChild(el); } el.srcObject = ev.streams[0]; };
  return pc;
}
async function voiceToggle() {
  if (!voice.ok || !coop.ch) return;
  if (voice.on) {
    voice.on = false; for (const pc of voice.peers.values()) pc.close(); voice.peers.clear();
    if (voice.stream) voice.stream.getTracks().forEach(t => t.stop()); voice.stream = null;
    document.querySelectorAll("audio[id^=va-]").forEach(a => a.remove());
    coop.ch.track({ colour: coop.colour, voice: false });
  } else {
    try { voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { toast("Your browser didn't allow the microphone.", 2.5); return; }
    voice.on = true; coop.ch.track({ colour: coop.colour, voice: true });
    coop.ch.send({ type: "broadcast", event: "voice-hello", payload: { from: coop.id } });
  }
  $("btnVoice").classList.toggle("on", voice.on);
  $("btnVoice").textContent = voice.on ? "Voice on" : "Voice";
}
$("btnVoice").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); voiceToggle(); });
function voiceWire(ch) {
  ch.on("broadcast", { event: "chat" }, ({ payload: m }) => { const text = String(m.text || "").slice(0, 120).replace(CHAT_BAD, x => "*".repeat(x.length)); chatShow(["Gold", "Sky", "Rose", "Mint", "Violet", "Flame"][m.c % 6], COOP_COLOURS[m.c % COOP_COLOURS.length], text); });
  // Someone switched voice on: if mine is on too, call them (the one with the lower id calls).
  ch.on("broadcast", { event: "voice-hello" }, async ({ payload: m }) => {
    if (!voice.on || m.from === coop.id) return;
    if (coop.id < m.from) { const pc = voicePeer(m.from); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); ch.send({ type: "broadcast", event: "rtc", payload: { from: coop.id, to: m.from, sdp: pc.localDescription } }); }
    else ch.send({ type: "broadcast", event: "voice-hello", payload: { from: coop.id } });
  });
  ch.on("broadcast", { event: "rtc" }, async ({ payload: m }) => {
    if (!voice.on || m.to !== coop.id) return;
    const pc = voicePeer(m.from);
    if (m.sdp) {
      await pc.setRemoteDescription(m.sdp);
      if (m.sdp.type === "offer") { const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); ch.send({ type: "broadcast", event: "rtc", payload: { from: coop.id, to: m.from, sdp: pc.localDescription } }); }
    } else if (m.cand) { try { await pc.addIceCandidate(m.cand); } catch (e) { /* late candidate */ } }
  });
}
function showRoomButtons() {
  const inRoom = !!coop.ch && (state === "play" || state === "build");
  $("btnChat").classList.toggle("hidden", !inRoom);
  $("btnVoice").classList.toggle("hidden", !(inRoom && voice.ok));
  document.body.classList.toggle("roam", !!(mission && mission.def.free));
}

/* ---------- boot ---------- */
(async function boot() {
  $("playBtn").disabled = true;
  titleShowStart();
  buildGround();
  requestAnimationFrame(frame);
  try {
    koda = await makeActor("koda.glb", 1.62);
    koda.armIn = KODA_ARM_IN; koda.reach = 0;
    scene.add(koda.root);
    koda.play("idle");
    const q0 = S.quadrants[0], c = zoneCenter(q0);
    koda.pos.set(c.x, terrainAt(c.x, c.y + q0.d / 2 - 6), c.y + q0.d / 2 - 6); koda.face(Math.PI, 1);
    updateCamera(0, true);
  } catch (e) {
    $("loading").textContent = "Koda couldn't load. Check your connection and reload.";
    console.error(e);
    return;
  }
  cam.view = save.view || 0; $("btnView").textContent = VIEWS[cam.view];
  await buildCity(p => { $("loading").textContent = "Building the city… " + Math.round(p * 100) + "%"; });
  buildRivers();
  buildShrines();
  buildProps();
  $("loading").textContent = "Setting up the streets…";
  await buildTownPlan();
  buildHitches();
  buildAwnings();
  buildNav();
  buildRoadNet();
  $("loading").textContent = "Adding the city's own pieces…";
  await loadPieces();
  await seedClues();
  // Opened with ?build=1 but building isn't open to this browser: the button says why.
  checkBuilder().then(showBuildBtn);
  refreshInv();
  $("loading").textContent = "";
  $("playBtn").disabled = false;
  toTitle();
  window.GILL_FLOATS = () => floats; window.GILL_DRONES = () => drones;
  window.GILL = { FAR_CULL, CLUE_MADE, startBuild, B, buildPick, buildPlace, buildPickUp, placedCount: () => placed.length, inv: () => Object.assign({}, inv), dustCount: () => dust.pool.filter(p => p.life > 0).length, flyerCount: () => flyers.length, zones: S.quadrants, ambientCount: () => ambient.map(p => p.job).join(","), moveWithCollision, shrines, travelTo, prayNear, guideRoute, buildStep: dt => updateBuild(dt), scene, DAY, terrainAt, groundAt, ridgeAt, blocked, pathLine, camera, CAM_OFFSET, get koda() { return koda; }, get zora() { return zora; }, get mission() { return mission; },
    enemies, npcs, get state() { return state; }, save: () => save, blockers, keys, input, cardContinue, pause, resume, drawBigMap, pathNext, stick, FOCUS, beat, songTime, boost, get lastSafe() { return lastSafe; }, fightFoe, get camZoom() { return camZoom; }, attack, jump, action, objectiveTarget, get health() { return health; }, get music() { return music; },
    makeActor, horses, mount, dismount, nearHorse, critters, placeThing, staticModel: n => staticModel(n),
    sim(seconds) { let t = performance.now(); for (let i = 0; i < seconds * 30; i++) { t += 33; tick(1 / 30, t); } } };
})();
