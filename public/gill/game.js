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
// The ground of each Feelz Run district, painted once on a canvas and tiled.
//   asphalt  the streets        lc dusty dirt and broken asphalt   mc concrete slabs
//   uc polished stone tiles     rc grass and garden paving          de wind-rippled sand
function groundTexture(kind) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const r = rng(kind.length * 977 + kind.charCodeAt(0));
  const base = { asphalt: "#3a3a3e", lc: "#6e5a45", mc: "#8e9094", uc: "#9c9488", rc: "#4f6a3a", de: "#d6b27a", sandroad: "#c9a46e" }[kind] || "#8a8a8a";
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const speck = (n, a, sz) => { for (let i = 0; i < n; i++) { const v = r() > 0.5; g.fillStyle = `rgba(${v ? 255 : 0},${v ? 255 : 0},${v ? 255 : 0},${r() * a})`; g.fillRect(r() * 256, r() * 256, 1 + r() * sz, 1 + r() * sz); } };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  if (kind === "asphalt") speck(2600, 0.08, 3);
  else if (kind === "lc") {
    // Packed dirt, patches of old asphalt, cracks and dark wet sludge.
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(40,36,34,${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * 256, r() * 256, 12 + r() * 30, 8 + r() * 18, r() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(30,24,18,.35)"; g.beginPath(); g.ellipse(r() * 256, r() * 256, 10 + r() * 14, 5 + r() * 8, r() * 3, 0, 7); g.fill(); }
    speck(3000, 0.12, 3);
    g.strokeStyle = "rgba(20,16,12,.45)"; g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { let x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
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
  lc: ["tenement", "hostel", "kodas-building", "lc-b1", "lc-b2", "lc-b4", "lc-b5", "lc-b6", "lc-b7"],
  mc: ["mc-b2", "mc-b4", "mc-b6", "mc-b7", "mc-b8"],
  uc: ["uc-b1", "uc-b2", "uc-b3", "uc-b4"],
  rc: ["rc-b1", "rc-b3", "rc-b4", "rc-b5"],
  de: ["de-b1", "de-b3", "de-b4"]
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
  for (let r = 0; r + 1 < rows; r++) { const a = r * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  return m;
}
function buildGround() {
  // The land: one sheet that rises and falls with the places on it.
  const pad = 120, W = WORLD_W + pad * 2, H = WORLD_H + pad * 2, sx = Math.round(W / 4), sz = Math.round(H / 4);
  const geo = new THREE.PlaneGeometry(W, H, sx, sz); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = [];
  const cDirt = new THREE.Color(0x7d6f58), cSand = new THREE.Color(0xd8b980), cRock = new THREE.Color(0x6a625a), cDune = new THREE.Color(0xd9b87c), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + WORLD_W / 2, z = p.getZ(i) + WORLD_H / 2;
    p.setY(i, terrainAt(clamp(x, 0, WORLD_W), clamp(z, 0, WORLD_H)) - 0.05);
    // Colour by the nearest place's district; sand out past the East Gate.
    let best = null, bd = 1e9;
    for (const q of S.quadrants) { const d = Math.hypot(Math.max(0, q.x0 - x, x - q.x0 - q.w), Math.max(0, q.z0 - z, z - q.z0 - q.d)); if (d < bd) { bd = d; best = q; } }
    tmp.set(DCOLOUR[best.district] || 0x8c8070).lerp(cDirt, clamp(bd / 90, 0, 0.7));
    if (x > 840) tmp.lerp(cSand, clamp((x - 840) / 40, 0, 1));
    const rg = ridgeAt(clamp(x, 0, WORLD_W), clamp(z, 0, WORLD_H));
    if (rg > 0.3) tmp.lerp(best.district === "de" || x > 740 ? cDune : cRock, clamp(rg / 3, 0, 0.9));
    col.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const dirt = groundTexture("lc"); dirt.repeat.set(W / 10, H / 10);
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: dirt, vertexColors: true, roughness: 0.95 }));
  land.position.set(WORLD_W / 2, 0, WORLD_H / 2); land.receiveShadow = true; scene.add(land);
  // Each place has its own paving, flat at its height.
  for (const q of S.quadrants) {
    const kind = districtOf(q), paving = groundTexture(kind);
    const tileM = { lc: 8, mc: 8, uc: 5, rc: 9, de: 10 }[kind] || 6;
    paving.repeat.set(q.w / tileM, q.d / tileM);
    const tint = new THREE.Color(0xffffff).multiplyScalar(kind === "uc" ? 0.78 : kind === "de" ? 0.9 : 0.95);
    const mat = new THREE.MeshStandardMaterial({ color: tint, map: paving, roughness: 0.85, emissive: 0x000000 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(q.x0 + q.w / 2, q.elev + 0.02, q.z0 + q.d / 2); m.receiveShadow = true;
    scene.add(m);
    pads[q.id] = { mat, base: tint.clone() };
  }
  // Roads, with a dashed centre line.
  const asphalt = groundTexture("asphalt"); asphalt.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a8790, map: asphalt, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const dash = (() => { const c = document.createElement("canvas"); c.width = 8; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#f2d27a"; g.fillRect(2, 0, 4, 34); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const dashMat = new THREE.MeshBasicMaterial({ map: dash, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  for (const r of WD.roads) {
    ribbon(r.points, r.width, 0.06, roadMat);
    const dm = ribbon(r.points, 0.25, 0.08, dashMat, 3); dm.receiveShadow = false;
    dm.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * 0.25 / 6; });
  }
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
async function placeBuilding(name, x, z, yaw, height, maxFoot = 13) {
  if (ridgeAt(x, z) > 0.3 || ridgeAt(x - 5, z - 5) > 0.6 || ridgeAt(x + 5, z + 5) > 0.6 || ridgeAt(x - 5, z + 5) > 0.6 || ridgeAt(x + 5, z - 5) > 0.6) return;
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
  const hx = (box2.max.x - box2.min.x) / 2, hz = (box2.max.z - box2.min.z) / 2;
  const base = Math.min(terrainAt(x - hx, z - hz), terrainAt(x + hx, z - hz), terrainAt(x - hx, z + hz), terrainAt(x + hx, z + hz)) - 0.15;
  m.position.set(x - c.x, base - box2.min.y, z - c.z);
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
  blockers.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, top: b.max.y, base, mesh: m, mats, faded: false, building: name });
}
async function buildCity(onProgress) {
  const jobs = [];
  for (const q of S.quadrants) {
    const r = rng(q.id.charCodeAt(1) * 977 + q.id.charCodeAt(2) * 131);
    const set = DISTRICT_BUILDINGS[districtOf(q)] || BUILDINGS;
    const pick = () => set[Math.floor(r() * set.length)];
    const inset = 8;
    // Buildings around the edges of each place, facing in, with gaps for the roads.
    const edge = (len) => { const out = []; for (let s = 12; s < len - 10; s += 21 + r() * 6) out.push(s); return out; };
    const slots = [];
    for (const s of edge(q.w)) slots.push([q.x0 + s, q.z0 + inset, 0], [q.x0 + s, q.z0 + q.d - inset, Math.PI]);
    for (const s of edge(q.d)) slots.push([q.x0 + inset, q.z0 + s, Math.PI / 2], [q.x0 + q.w - inset, q.z0 + s, -Math.PI / 2]);
    // A few low buildings for cover further in.
    for (let i = 0; i < 3; i++) slots.push([q.x0 + 24 + r() * (q.w - 48), q.z0 + 24 + r() * (q.d - 48), Math.floor(r() * 4) * Math.PI / 2, true]);
    for (const [x, z, yaw, low] of slots) {
      if (onRoad(x, z, 7)) continue;
      if (q.id === "q01" && x === slots[0][0] && z === slots[0][1]) { jobs.push(() => placeBuilding("kodas-building", x, z, yaw, 13, 13)); continue; }
      jobs.push(() => placeBuilding(pick(), x, z, yaw, low ? 4 + r() * 3 : 8 + r() * 7, low ? 7 : 12));
    }
  }
  // Houses and shops along the roads between places.
  const r = rng(4242);
  for (const road of WD.roads) {
    if (road.name === "Ring Road") continue;
    for (let k = 0; k + 1 < road.points.length; k++) {
      const [ax, az] = road.points[k], [bx, bz] = road.points[k + 1], L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 10; s < L - 6; s += 22) for (const side of [-1, 1]) {
        const x = ax + (bx - ax) * s / L + nx * (road.width / 2 + 9) * side, z = az + (bz - az) * s / L + nz * (road.width / 2 + 9) * side;
        if (inZone(x, z, 6) || onRiver(x, z, 10)) continue;
        const near = S.quadrants.reduce((a, q) => Math.hypot(q.x0 + q.w / 2 - x, q.z0 + q.d / 2 - z) < Math.hypot(a.x0 + a.w / 2 - x, a.z0 + a.d / 2 - z) ? q : a);
        const set = DISTRICT_BUILDINGS[districtOf(near)] || BUILDINGS;
        const yaw = Math.abs(nx) > Math.abs(nz) ? (side * nx > 0 ? -Math.PI / 2 : Math.PI / 2) : (side * nz > 0 ? Math.PI : 0);
        jobs.push(() => placeBuilding(set[Math.floor(r() * set.length)], x, z, yaw, 6 + r() * 6, 12));
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
function buildRivers() {
  for (const [x0, z0, x1, z1] of WD.river) {
    const w = x1 - x0, d = z1 - z0, along = d > w ? "z" : "x";
    const mat = new THREE.MeshStandardMaterial({ map: mudMap.clone(), roughness: 0.35, metalness: 0.1, color: 0x8a6a4a, polygonOffset: true, polygonOffsetFactor: -3 });
    mat.map.repeat.set(1, 1); mat.map.needsUpdate = true;
    const pts = along === "z" ? [[x0 + w / 2, z0], [x0 + w / 2, z1]] : [[x0, z0 + d / 2], [x1, z0 + d / 2]];
    const m = ribbon(pts, along === "z" ? w : d, 0.1, mat, 4);
    m.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * (along === "z" ? w : d) / 6; else a[i] = v * (along === "z" ? w : d) / 6; });
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
    const top = Math.max(terrainAt(x0 - 2, (z0 + z1) / 2), terrainAt(x1 + 2, (z0 + z1) / 2), terrainAt((x0 + x1) / 2, z0 - 2), terrainAt((x0 + x1) / 2, z1 + 2)) + 0.25;
    const deck = new THREE.Mesh(propGeo, deckMat);
    deck.scale.set(x1 - x0, 0.5, z1 - z0); deck.position.set((x0 + x1) / 2, top - 0.25, (z0 + z1) / 2); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
    blockers.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top, base: top - 0.5, walk: true, bridge: true, mesh: deck, mats: [] });
    // Rails along the long sides.
    const along = (x1 - x0) > (z1 - z0) ? "x" : "z";
    for (const side of [0, 1]) {
      const rail = new THREE.Mesh(propGeo, deckMat);
      if (along === "x") { rail.scale.set(x1 - x0, 0.9, 0.2); rail.position.set((x0 + x1) / 2, top + 0.45, side ? z1 - 0.1 : z0 + 0.1); }
      else { rail.scale.set(0.2, 0.9, z1 - z0); rail.position.set(side ? x1 - 0.1 : x0 + 0.1, top + 0.45, (z0 + z1) / 2); }
      scene.add(rail);
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
  for (const b of nearBlocks(x, z, 0.1)) if (b.walk && x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05) g = Math.max(g, b.top);
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
function addAwning(x, z, w = 4.5, d = 3.2, colour) {
  if (blocked(x, z, Math.max(w, d) / 2 + 0.6) || onRoad(x, z, 2)) return null;
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

/* Fade any building standing between the camera and Koda. */
const fadedNow = new Set();
function updateOcclusion() {
  if (!koda) return;
  const kx = koda.pos.x, kz = koda.pos.z, ky = koda.pos.y;
  const hit = new Set();
  for (const b of inBox(kx - 8, kz - 1, kx + 8, kz + 14)) {
    if (b.mud || b.top - b.base < 3 || b.top < ky + 2) continue;
    if (b.minZ > kz - 1 && b.minZ < kz + 12 && kx > b.minX - 2 && kx < b.maxX + 2) hit.add(b);
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
  if (ridgeAt(x, z) > 1.1) return RIDGE;
  for (const b of nearBlocks(x, z, r + 0.1)) {
    if (b.mud) { if (isKoda) continue; if (b.bridgeOver) continue; if (onBridge(x, z)) continue; }
    else if (b.top <= y + 0.35) continue;
    if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return b;
  }
  return null;
}
const onBridge = (x, z) => WD.bridges.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
function moveWithCollision(pos, dx, dz, r, isKoda = false) {
  if (!blocked(pos.x + dx, pos.z, r, pos.y, isKoda)) pos.x += dx;
  if (!blocked(pos.x, pos.z + dz, r, pos.y, isKoda)) pos.z += dz;
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
    if (!blocked(px, pz, r) && !onRiver(px, pz, r)) return { x: px, z: pz };
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
// Some skeletons stand with Y up, others were built with Z up. The axis the hips sit
// furthest along at rest is "up"; the two others are pinned, so only the bounce stays.
function stripRootMotion(clip, rest) {
  const r = [rest.x, rest.y, rest.z];
  const up = r.map(Math.abs).indexOf(Math.max(...r.map(Math.abs)));
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values;
    for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) if (a !== up) v[i + a] = r[a];
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
    const rest = hips ? hips.position.clone() : new THREE.Vector3(0, 1, 0);
    for (const c of gltf.animations) { stripRootMotion(c, rest); this.clips[c.name] = this.mixer.clipAction(c); }
    this.current = null;
    this.model = model;
    this.baseY = model.position.y;
    this.pos = this.root.position;
    this.yaw = 0;
  }
  has(name) { return !!this.clips[name]; }
  play(name, { once = false, fade = 0.15, speed = 1, from = 0 } = {}) {
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
    restoreRest(this.model);
    this.mixer.update(dt);
    const name = this.current ? this.current.getClip().name : "";
    if (this.native) return;   // rigged and animated for this body in Mixamo: no corrections needed
    if (/^(run|sprint)$/.test(name)) armSwing(this.model, ARM_SWING);
    if (!/^(punch|kick|takedown|hit|ko|alert|flykick|jump|spinkick)$/.test(name)) armClear(this.model, /^crouch/.test(name));
  }
}
// Characters re-rigged in Mixamo with moves made for their own bodies live with the game.
const NATIVE = { "koda.glb": "models/koda.glb", "guard.glb": "models/guard.glb" };
async function makeActor(file, metres) {
  const own = NATIVE[file];
  const a = new Actor(await loadGLB(own || MODELS + file), metres);
  a.native = !!own;
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
  if (state !== "play") return;
  if (e.code === "KeyC" || e.code === "ControlLeft") toggleSneak();
  if (e.code === "KeyJ" || e.code === "KeyK") attack();
  if (e.code === "Space") jump();
  if (e.code === "KeyE") action();
  if (e.code === "Escape" || e.code === "KeyP") pause();
});
addEventListener("keyup", e => keys.delete(e.code));
Object.defineProperty(input, "actionHeld", { get: () => keys.has("KeyE") || pad.action || input.touchAction });
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
  const hold = (id, key) => { const b = $(id); b.addEventListener("pointerdown", e => { e.preventDefault(); input[key] = true; }); for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => { input[key] = false; }); };
  hold("btnAction", "touchAction"); hold("btnBoost", "boostHeld");
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
  pad.action = btn(3); pad.boost = btn(4) || btn(6);
  pad.prev = g.buttons.map((b, i) => btn(i));
}
function readInput() {
  const k = keyVector();
  const s = stick.mag ? stick : pad.mag ? pad : k;
  input.x = s.x; input.z = s.z; input.mag = s.mag;
}
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
  music.started = false;
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
let state = "title";            // title | card | play | paused | score
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
  for (const e of enemies) scene.remove(e.a.root);
  enemies.length = 0;
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
    d.group.position.set(d.x, terrainAt(d.x, d.z) + 5.2 + Math.sin(now / 500 + d.leg) * 0.15, d.z);
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
        this.wave(qd);
      }
      if (A.started && !A.open && A.spawning === false && enemies.filter(e => e.qd === qd && e.state !== "ko").length === 0) {
        if (A.wave < A.waves) { A.spawning = true; later(1.4, () => this.wave(qd)); toast(`Wave ${A.wave + 1} of ${A.waves}`, 1.6); }
        else {
          A.open = true;
          for (const w of A.walls) removeBlock(qd, w);
          qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(A.x, terrainAt(A.x, A.z), A.z);
          toast(`The gate opens. Grab ${qd.partName}!`, 3);
          refreshObjective();
        }
      }
    },
    wave(qd) {
      const A = qd.arena; A.spawning = true; A.wave++;
      const n = 2 + A.wave - 1 + Math.floor(mission.index / 5);
      const kinds = A.wave === A.waves && mission.index >= 2 ? ["gilded", "handler"] : null;
      spawnGuards(qd, n, { radius: [4, 7], near: { x: A.x, z: A.z }, alert: true, kinds }).then(() => { A.spawning = false; refreshObjective(); });
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
      qd.course = course.map(([x, z, h, s]) => {
        const b = addBlock(qd, boxBlock(c.x + x, c.y + z * dir, s, s, h, h < 1 ? PROPS[1].mat : roofTopMat));
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

  /* Put It On Me: rubble from the Veil coming down. Hold ACTION to clear it; people help. */
  rubble: {
    spawn(qd) {
      const c = zoneCenter(qd.q);
      qd.piles = [];
      for (let i = 0; i < 3; i++) {
        const a = qd.r() * Math.PI * 2, rad = 5 + qd.r() * 6;
        const x = c.x + Math.cos(a) * rad, z = c.y + Math.sin(a) * rad;
        if (blocked(x, z, 2.2)) continue;
        const group = new THREE.Group();
        for (let k = 0; k < 7; k++) {
          const m = new THREE.Mesh(propGeo, rubbleMat);
          const sz = 0.6 + qd.r() * 1.1; m.scale.set(sz, sz * 0.7, sz);
          m.position.set((qd.r() - 0.5) * 2, sz * 0.3, (qd.r() - 0.5) * 2); m.rotation.set(qd.r(), qd.r() * 3, qd.r());
          m.castShadow = true; group.add(m);
        }
        group.position.set(x, terrainAt(x, z), z);
        const b = addBlock(qd, { minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4, top: 1.3, walk: true, mesh: group, mats: [] });
        qd.piles.push({ x, z, b, left: 1 });
      }
      const helper = freeSpot(c.x + 3, c.y + 3, 1, qd.r);
      spawnPerson(qd, TOWNSFOLK[Math.floor(qd.r() * TOWNSFOLK.length)], helper.x, helper.z, "We've been digging since the Veil came down. Help us and I'll dig with you.").then(n => { if (n) qd.helper = n; });
      if (!mission.def.calm) spawnGuards(qd, 1);
    },
    update(qd, dt) {
      if (qd.done || !qd.piles) return;
      const p = qd.piles.find(p => p.left > 0 && Math.hypot(koda.pos.x - p.x, koda.pos.z - p.z) < 2.6);
      qd.near = p;
      if (p && input.actionHeld && !air) {
        const helped = qd.helper && dist2(qd.helper.a.pos, koda.pos) < 8;
        if (helped) { qd.helper.a.play(qd.helper.a.has("cheer") ? "cheer" : "idle"); qd.helper.a.faceTo(p.x, p.z); }
        p.left -= dt / (helped ? 1.1 : 1.6);
        koda.faceTo(p.x, p.z); koda.play(koda.has("pound") ? "pound" : "punch");
        p.b.mesh.scale.setScalar(0.4 + 0.6 * Math.max(0, p.left));
        if (p.left <= 0) {
          removeBlock(qd, p.b); sfxHit(true); popText("CLEARED");
          if (qd.piles.every(x => x.left <= 0)) {
            qd.orb = makeOrb(PART_COLOURS[qd.k]); qd.orb.position.set(p.x, terrainAt(p.x, p.z), p.z);
            toast(`The way is clear. ${qd.partName} was under there!`, 3);
          }
          refreshObjective();
        }
      }
    },
    target(qd) {
      if (qd.orb) return { x: qd.orb.position.x, z: qd.orb.position.z, label: "GRAB " + qd.partName.toUpperCase() };
      const p = (qd.piles || []).find(p => p.left > 0);
      if (!p) return null;
      return { x: p.x, z: p.z, label: qd.near === p && input.actionHeld ? `CLEARING ${Math.round((1 - p.left) * 100)}%` : "HOLD ACTION TO CLEAR" };
    },
    objective(qd) { const left = (qd.piles || []).filter(p => p.left > 0).length; return left ? `Clear the rubble in ${qd.q.name}: hold ACTION by a pile (${left} left). Stand near the helper and it goes faster.` : `Grab ${qd.partName}.`; }
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
    toast("The song is whole. Zora is in the Old Tower!", 4);
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
  const m = mission, left = m.quads.filter(q => !q.done);
  if (escape) return setObjective("Get Zora out. Reach the gold light at East Gate!");
  if (zora && zora.waiting) return setObjective("Find Zora in the Old Tower.");
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
      air = null; attackLock = Math.max(attackLock, 0.08);
      // Land on his feet: straight into standing or running, never held in a mid-air pose.
      koda.held = 1; koda.play(input.mag ? "run" : "idle", { fade: 0.08 });
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
  const sneaking = input.sneak;
  const sprint = !sneaking && input.mag > 0.93;
  let speed = input.mag === 0 ? 0 : sneaking ? 2.6 : sprint ? 8.2 : 5.4;
  if (boost.on && !sneaking) speed = 13;
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
    else koda.play(sneaking ? "crouch_walk" : sprint || boost.on ? "sprint" : "run", { speed: boost.on ? 1.4 : 1 });
  } else if (swimming()) koda.play(koda.has("tread") ? "tread" : "swim");
  else koda.play(sneaking ? (koda.inCover && koda.has("corner") ? "corner" : "crouch_idle") : koda.has("fight_idle") && fightFoe() ? "fight_idle" : "idle");
  // In the water his body floats up to the surface, head above it.
  const lift = swimming() ? (speed > 0 ? WATER_Y - 0.8 : WATER_Y - 1.45) : 0;
  koda.model.position.y += (koda.baseY + lift - koda.model.position.y) * Math.min(1, dt * 6);
  koda.moving = speed > 0; koda.sprinting = sprint || boost.on; koda.sneaking = sneaking;
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
// After moving on the ground: step off an edge and fall, step into the mud and sink.
function settle() {
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
  // Just walked off an edge: a moment's grace to still jump.
  if (air && !(air.fall && air.t < 0.16)) return;
  readInput();
  const speed = (input.mag ? (boost.on ? 10 : input.mag > 0.93 ? 7.5 : 5) : 0) * (mission && mission.def.theme === "water" ? 0.85 : 1);
  air = { vy: 7.2, speed, kick: false };
  // Something low just ahead: vault it rather than a plain jump.
  const f = forward(koda);
  let low = null;
  for (let i = 4; i <= 16 && !low; i += 2) { const b = blocked(koda.pos.x + f.x * i * 0.1, koda.pos.z + f.y * i * 0.1, 0.3, koda.pos.y); if (b && b.low && b.top - koda.pos.y < 1.1 && Math.min(b.maxX - b.minX, b.maxZ - b.minZ) < 0.9) low = b; }   // thin things only: jump onto crates, vault over barriers
  if (low && koda.has("vault")) { air.speed = Math.max(speed, 5.5); air.vault = true; input.x = f.x; input.z = f.y; koda.play("vault", { once: true, speed: 1.6 }); }
  else if (speed >= 7.5 && koda.has("frontflip")) koda.play("frontflip", { once: true, speed: 1.35, from: 0.25 });
  else if (!input.mag && fightFoe() && koda.has("backflip")) { koda.play("backflip", { once: true, speed: 1.5, from: 0.35 }); const f = forward(koda); air.speed = 3; air.back = { x: -f.x, z: -f.y }; }
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
  if (!koda || attackLock > 0) return;
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
       { clip: "roundhouse", from: 0.45, speed: 1.5, lock: 0.7, hits: [0.9], dmg: 2, push: 2.6 }]
    : koda.native
      ? [{ clip: "punch", speed: 1.5, lock: 0.5, hits: [0.22], dmg: 1 }, { clip: "combo", speed: 1.6, lock: 0.8, hits: [0.24, 0.55], dmg: 1 }, { clip: "kick", speed: 1.4, lock: 0.7, hits: [0.42], dmg: 2, body: true }]
      : [{ clip: "punch", speed: 1.5, lock: 0.42, hits: [0.17], dmg: 1 }, { clip: "punch", speed: 1.5, lock: 0.42, hits: [0.17], dmg: 1 }, { clip: "kick", speed: 1.5, lock: 0.5, hits: [0.17], dmg: 2 }];
  // On the beat: double damage.
  const onBeatHit = nearBeat(0.12);
  if (onBeatHit) { popText("ON BEAT x2", "good"); mission.stats.onBeat++; }
  let mv = STRING[comboStep++ % STRING.length];
  if (ninja && koda.sprinting && comboStep === 1 && koda.has("knee")) mv = { clip: "knee", from: 0.4, speed: 1.5, lock: 0.9, hits: [0.97, 1.5], dmg: 1, dash: 3.2 };
  if (ninja && mv.clip === "roundhouse" && onBeatHit && koda.has("hurricane")) mv = { clip: "hurricane", from: 0.05, speed: 1.3, lock: 1.0, hits: [0.4, 0.8, 1.15], dmg: 1, radial: 2.4, push: 1.8 };
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
  const qd = mission.quads.find(q => !q.done) || mission.quads[0];
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
  e.state = "ko"; e.a.play("ko", { once: true });
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
    if (e.state === "ko") continue;
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
    const range = (koda.sneaking ? 4 : 7.5) * (covered ? 0.5 : 1) * (kUp() > 1.5 ? 0.6 : 1) * (koda.inCover ? 0.6 : 1) * (litBy(koda.pos.x, koda.pos.z) ? 1 : 0.65);
    const inCone = d < range && (dx * f.x + dz * f.y) / (d || 1) > 0.55;
    const heard = (koda.sprinting || air) && d < 4;
    // Crouched, anything waist-high hides him; standing, it has to be chest-high.
    const sees = (inCone || heard || d < 1.3) && sightClear(a.pos.x, a.pos.z, koda.pos.x, koda.pos.z, false, koda.sneaking ? 0.75 : 1.35);
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
    if (sees) { e.lastSeen.copy(koda.pos); e.searchT = 6; } else e.searchT -= dt;
    if (e.searchT <= 0) { e.state = "suspicious"; e.meter = 0.6; a.play("walk"); continue; }
    // Mid-swing or mid-shout: plant the feet and keep facing him.
    if ((e.holdT = Math.max(0, (e.holdT || 0) - dt)) > 0) { a.face(Math.atan2(dx, dz), Math.min(1, dt * 10)); continue; }
    // One at a time: only the main attacker comes in. The rest wait their turn in a ring
    // around Koda, shuffling sideways, until it's theirs.
    if (attacker !== e && d < 8) {
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
      if (steer(e, e.lastSeen.x, e.lastSeen.z, 5.2, dt, 8)) a.play("run");
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
    for (let d = 0; d < seg && total < 32; d += 0.5, total += 0.5) { const t = d / seg; pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]); along.push(total); }
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
function updateGuide(now, dt) {
  const goal = objectiveTarget();
  const d = goal ? Math.hypot(goal.x - koda.pos.x, goal.z - koda.pos.z) : 0;
  pathLine.mesh.visible = !!goal && d > 3;
  if (!pathLine.mesh.visible) return;
  if ((guideT -= dt) <= 0 || !guidePath) {
    guidePath = pathNext(koda.pos.x, koda.pos.z, goal.x, goal.z, true);
    guideT = 0.35;
  }
  buildPathLine([{ x: koda.pos.x, z: koda.pos.z }].concat(guidePath));
  // Pulse with the song: phase 0 on the beat.
  const spb = beat.bpm ? beat.spb : 0.55;
  const ph = beat.bpm && music.started ? (((songTime() - beat.offset) / spb) % 1 + 1) % 1 : (now / 1000 / spb) % 1;
  pathLine.mat.uniforms.uPhase.value = ph;
}

/* ---------- the marker over what to do next ---------- */
const markerV = new THREE.Vector3();
function updateMarker() {
  const el = $("marker"), t = objectiveTarget();
  if (!t || state !== "play") { el.classList.add("hidden"); return; }
  const d = Math.hypot(t.x - koda.pos.x, t.z - koda.pos.z);
  markerV.set(t.x, 2.6, t.z).project(camera);
  const W = innerWidth, H = innerHeight, m = 46;
  let x = (markerV.x + 1) / 2 * W, y = (1 - markerV.y) / 2 * H;
  const behind = markerV.z > 1;
  const off = behind || x < m || x > W - m || y < 90 || y > H - m;
  if (behind) { x = W - x; y = H - m; }
  const half = Math.max(m, ($("markerText").offsetWidth || 120) / 2 + 10);
  x = clamp(x, half, W - half); y = clamp(y, off ? 150 : 90, H - m);   // clear of the HUD and tips when pinned to the edge
  el.classList.remove("hidden");
  el.classList.toggle("edge", off);
  el.style.transform = `translate(${x}px, ${y}px)`;
  $("markerText").textContent = (t.label || "") + (d > 6 && !t.rough ? ` · ${Math.round(d)}m` : "");
  if (off) {
    const ang = Math.atan2(y - H / 2, x - W / 2);
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

/* ---------- the round radar (left): turns with Koda, so ahead is always up ---------- */
const radarCv = $("radar"), rc = radarCv.getContext("2d");
let radarYaw = 0;
const hexCol = n => "#" + n.toString(16).padStart(6, "0");
function drawRadar(dt) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), css = radarCv.clientWidth || 140;
  if (radarCv.width !== Math.round(css * dpr)) { radarCv.width = radarCv.height = Math.round(css * dpr); }
  const S2 = radarCv.width, R0 = S2 / 2, range = 42, k = (R0 - 4) / range;
  radarYaw = angleLerp(radarYaw, koda.yaw, Math.min(1, dt * 4));
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
  rc.strokeStyle = "rgba(255,255,255,.16)"; rc.lineCap = "round"; rc.lineJoin = "round";
  for (const r of WD.roads) { rc.lineWidth = r.width; rc.beginPath(); r.points.forEach(([x, z], i) => i ? rc.lineTo(x, z) : rc.moveTo(x, z)); rc.stroke(); }
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
  // Koda: an arrow in the middle, always pointing up.
  rc.fillStyle = "#fff"; rc.beginPath();
  rc.moveTo(R0, R0 - 7 * dpr); rc.lineTo(R0 + 5 * dpr, R0 + 5 * dpr); rc.lineTo(R0, R0 + 2 * dpr); rc.lineTo(R0 - 5 * dpr, R0 + 5 * dpr); rc.closePath(); rc.fill();
  rc.strokeStyle = "rgba(255,255,255,.3)"; rc.lineWidth = 1 * dpr; rc.beginPath(); rc.arc(R0, R0, R0 - 1, 0, 7); rc.stroke();
}

/* ---------- the big map (pause) ---------- */
function drawBigMap() {
  const cv = $("bigmap"), dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || 600, cssH = cv.clientHeight || 420;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  const g = cv.getContext("2d"), pad = 14 * dpr;
  const k = Math.min((cv.width - pad * 2) / (WORLD_W + 2 * ROAD), (cv.height - pad * 2) / (WORLD_H + 2 * ROAD));
  const ox = (cv.width - (WORLD_W + 2 * ROAD) * k) / 2 + ROAD * k, oz = (cv.height - (WORLD_H + 2 * ROAD) * k) / 2 + ROAD * k;
  const X = x => ox + x * k, Z = z => oz + z * k;
  g.fillStyle = "#0c0b10"; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#24222b"; g.fillRect(X(-ROAD), Z(-ROAD), (WORLD_W + 2 * ROAD) * k, (WORLD_H + 2 * ROAD) * k);
  for (const q of S.quadrants) {
    const o = zoneOrigin(q), qd = mission && mission.quads.find(x => x.q === q);
    g.fillStyle = qd ? (qd.done ? "#2c3a30" : hexCol(PART_COLOURS[qd.k]) + "40") : "#1a1920";
    g.fillRect(X(o.x), Z(o.y), q.w * k, q.d * k);
    if (qd) { g.strokeStyle = qd.done ? "#7fe39a" : hexCol(PART_COLOURS[qd.k]); g.lineWidth = 1 * dpr; g.strokeRect(X(o.x) + dpr, Z(o.y) + dpr, q.w * k - 2 * dpr, q.d * k - 2 * dpr); }
  }
  g.fillStyle = "#8c6038"; for (const m of muds) g.fillRect(X(m.minX), Z(m.minZ), (m.maxX - m.minX) * k, (m.maxZ - m.minZ) * k);
  g.fillStyle = "#b08850"; for (const f of floats) g.fillRect(X(f.x - f.w / 2), Z(f.z - f.d / 2), f.w * k, f.d * k);
  g.strokeStyle = "#3a3840"; g.lineCap = "round"; g.lineJoin = "round";
  for (const r of WD.roads) { g.lineWidth = Math.max(2, r.width * k); g.beginPath(); r.points.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke(); }
  for (const b of blockers) { if (b.mud || (b.top - b.base) < 3) continue; g.fillStyle = "#5a5866"; g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k); }
  g.fillStyle = "rgba(255,210,122,.35)"; for (const a of roofs) g.fillRect(X(a.x - a.w / 2), Z(a.z - a.d / 2), a.w * k, a.d * k);
  // Names and what each lit quadrant holds.
  g.textAlign = "center"; g.textBaseline = "middle";
  const fs = Math.min(11 * dpr, 90 * k * 0.13), fs2 = Math.min(10 * dpr, 90 * k * 0.115);
  for (const q of S.quadrants) {
    const c = zoneCenter(q), qd = mission && mission.quads.find(x => x.q === q);
    g.font = `800 ${fs}px Inter, sans-serif`; g.fillStyle = qd ? "#fff" : "rgba(255,255,255,.45)";
    g.fillText(q.name.toUpperCase(), X(c.x), Z(c.y) - (qd ? fs * 0.8 : 0));
    if (qd) {
      const kind = { explore: "clue", sneak: "sneak", fight: "arena", race: "rooftops", rubble: "rubble", help: "help", blind: "hidden patrols", copies: "find her", pads: "pads", piano: "piano", chase: "chase" }[qd.focus] || qd.focus;
      g.font = `700 ${fs2}px Inter, sans-serif`; g.fillStyle = qd.done ? "#7fe39a" : hexCol(PART_COLOURS[qd.k]);
      if (qd.done) g.fillText(`${qd.partName} ✓`, X(c.x), Z(c.y) + fs * 0.8);
      else { g.fillText(qd.partName, X(c.x), Z(c.y) + fs * 0.8); g.fillText(kind, X(c.x), Z(c.y) + fs * 0.8 + fs2 * 1.15); }
    }
  }
  const pin = (x, z, col, label) => {
    g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), 5 * dpr, 0, 7); g.fill();
    if (label) { g.font = `800 ${10 * dpr}px Inter, sans-serif`; g.fillText(label, X(x), Z(z) - 11 * dpr); }
  };
  if (zora && zora.waiting) pin(zora.pos.x, zora.pos.z, "#d58cff", "ZORA");
  if (escape) pin(escape.exit.x, escape.exit.y, "#ffd27a", "EXIT");
  const t = objectiveTarget();
  if (t) { g.save(); g.translate(X(t.x), Z(t.z)); g.rotate(Math.PI / 4); g.fillStyle = "#ffd27a"; g.fillRect(-6 * dpr, -6 * dpr, 12 * dpr, 12 * dpr); g.restore(); }
  // Koda, pointing the way he faces.
  g.save(); g.translate(X(koda.pos.x), Z(koda.pos.z)); g.rotate(-koda.yaw + Math.PI);
  g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 2 * dpr; g.beginPath();
  g.moveTo(0, -9 * dpr); g.lineTo(6 * dpr, 6 * dpr); g.lineTo(0, 3 * dpr); g.lineTo(-6 * dpr, 6 * dpr); g.closePath(); g.stroke(); g.fill();
  g.restore();
  $("mapSong").textContent = mission ? `Mission ${mission.index + 1}: ${mission.def.song}  ·  ${mission.quads.filter(q => q.done).length}/${mission.quads.length} parts` : "";
}

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
function updateCamera(dt, snap) {
  if (window.GILL_NOCAM) return;
  // In a fight the camera moves in on the two of them, and pulls back out once he's down.
  const foe = state === "play" ? fightFoe() : null;
  camZoom += ((foe ? 0.5 : 1) - camZoom) * Math.min(1, dt * (foe ? 3 : 1.5));
  if (snap) camZoom = foe ? 0.5 : 1;
  const lead = koda.moving && !foe ? 1.6 : 0;
  if (foe) camTarget.set((koda.pos.x + foe.a.pos.x) / 2, 0.9, (koda.pos.z + foe.a.pos.z) / 2);
  else camTarget.set(koda.pos.x + Math.sin(koda.yaw) * lead, terrainAt(koda.pos.x, koda.pos.z) + 0.8 + Math.max(0, kUp()) * 0.7, koda.pos.z + Math.cos(koda.yaw) * lead);
  camOff.copy(CAM_OFFSET).multiplyScalar(camZoom);
  const want = camTarget.clone().add(camOff);
  if (snap) camera.position.copy(want); else camera.position.lerp(want, Math.min(1, dt * 5));
  camera.lookAt(camera.position.clone().sub(camOff));
  if (themeState.roll) camera.rotation.z += themeState.roll;
  if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake * 0.6; }
  sun.position.set(koda.pos.x + DAY.dir.x, koda.pos.y + DAY.dir.y, koda.pos.z + DAY.dir.z);
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
  } else if (koda && (state === "card" || state === "score")) {
    koda.update(real); if (zora) zora.update(real);
  }
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
function tick(dt, now) {
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
function pause() { if (state !== "play") return; state = "paused"; $("marker").classList.add("hidden"); $("pause").classList.remove("hidden"); if (music.ac) music.ac.suspend(); drawBigMap(); }
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

/* ---------- boot ---------- */
(async function boot() {
  $("playBtn").disabled = true;
  buildGround();
  requestAnimationFrame(frame);
  try {
    koda = await makeActor("koda.glb", 1.62);
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
  await buildCity(p => { $("loading").textContent = "Building the city… " + Math.round(p * 100) + "%"; });
  buildRivers();
  buildProps();
  buildAwnings();
  buildNav();
  $("loading").textContent = "";
  $("playBtn").disabled = false;
  toTitle();
  window.GILL_FLOATS = () => floats; window.GILL_DRONES = () => drones;
  window.GILL = { scene, DAY, terrainAt, groundAt, ridgeAt, blocked, pathLine, camera, CAM_OFFSET, get koda() { return koda; }, get zora() { return zora; }, get mission() { return mission; },
    enemies, npcs, get state() { return state; }, save: () => save, blockers, keys, input, cardContinue, pause, resume, drawBigMap, pathNext, stick, FOCUS, beat, songTime, boost, get lastSafe() { return lastSafe; }, fightFoe, get camZoom() { return camZoom; }, attack, jump, action, objectiveTarget, get health() { return health; }, get music() { return music; },
    sim(seconds) { let t = performance.now(); for (let i = 0; i < seconds * 30; i++) { t += 33; tick(1 / 30, t); } } };
})();
