/*
  FEELZ RUN - THE ENGINE
  Vanilla JavaScript + HTML Canvas.
  Loads a mission from missions/, runs the physics, Koda's moves, the
  enforcers, drones and the storm, the song-timed checkpoints, for one runner
  or a two player race.
  Drawing is in render.js, menus and scores in ui.js, settings in config.js.
*/

"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const PX = 68;                      // pixels per metre
const K = PX / 68;
const m = v => v * PX;

const GRAVITY = 1900;
const RUN_SPEED = 360;          // about 5.3 m/s: urgent, not floaty
const CROUCH_SPEED = 160;
const CLIMB_SPEED = 170;
const JUMP_SPEED = 690;
const JUMP_CUT_SPEED = 260;
const DOUBLE_JUMP_SPEED = 620;
const MAX_FALL_SPEED = 1150;
const STOMP_BOUNCE = 520;
const AUTO_VAULT_MAX = 1.05;   // metres: the tallest thing he hops on his own while running

// FIGHTS. Get close to a Street Warden on foot and you're in a fight: you can't run past him,
// the music muffles and a beat kicks in until he's down. Hit, hit, hit: the third hit of a
// combo is a finisher. Every hit staggers him; leave him a moment and he swings.
const WARDEN_HP = 3;
// How each kind of enforcer fights. hp: hits to drop him. windUp: the red tell before a swing.
// cd: seconds between swings once you're squared up. guard: chance he blocks after taking two in a row.
// stun: his swing stuns. counter: how fast he swings back after a block.
const ENEMY_KINDS = {
  warden:   { hp: 3, windUp: 0.36, cd: 0.85, guard: 0.55, counter: 0.22, stun: false, speed: 1.3 },
  guard:    { hp: 4, windUp: 0.40, cd: 0.95, guard: 0.8,  counter: 0.2,  stun: false, speed: 1.2 },
  dock:     { hp: 4, windUp: 0.42, cd: 0.9,  guard: 0.45, counter: 0.25, stun: true,  speed: 1.2 },
  handler:  { hp: 3, windUp: 0.34, cd: 0.8,  guard: 0.5,  counter: 0.2,  stun: false, speed: 1.4 },
  sentinel: { hp: 4, windUp: 0.46, cd: 1.0,  guard: 0.7,  counter: 0.24, stun: true,  speed: 1.1 },
  gilded:   { hp: 5, windUp: 0.44, cd: 0.95, guard: 0.75, counter: 0.2,  stun: true,  speed: 1.1 },
  hunter:   { hp: 3, windUp: 0.28, cd: 0.7,  guard: 0.35, counter: 0.16, stun: false, speed: 1.7 }
};
// The further into the story, the harder they fight. Veterans from mission 6: one more hit, quicker swings,
// they see further. Elites from mission 11: quicker again, and they often follow one swing with a second.
const ENEMY_TIERS = [
  { name: "",        hp: 0, windUp: 1,    cd: 1,    guard: 0,    counter: 1,    speed: 1,    sight: 1,    combo: 0 },
  { name: "VETERAN", hp: 1, windUp: 0.9,  cd: 0.86, guard: 0.1,  counter: 0.88, speed: 1.15, sight: 1.15, combo: 0 },
  { name: "ELITE",   hp: 1, windUp: 0.82, cd: 0.8,  guard: 0.18, counter: 0.85, speed: 1.25, sight: 1.25, combo: 0.35 }
];
function enemyTierIndex(n) { n = n || (mission && mission.number) || 1; return n >= 11 ? 2 : n >= 6 ? 1 : 0; }
const _enemyKindCache = {};
function enemyKindFor(kind, t) {
  const key = (kind || "warden") + ":" + t;
  if (_enemyKindCache[key]) return _enemyKindCache[key];
  const b = ENEMY_KINDS[kind] || ENEMY_KINDS.warden, md = ENEMY_TIERS[t];
  return (_enemyKindCache[key] = {
    hp: b.hp + md.hp, windUp: Math.max(0.27, b.windUp * md.windUp), cd: b.cd * md.cd, guard: Math.min(0.9, b.guard + md.guard),
    counter: Math.max(0.14, b.counter * md.counter), stun: b.stun, speed: b.speed * md.speed, sight: md.sight, combo: md.combo, tier: t
  });
}
function enemyKind(wd) { return enemyKindFor(wd.kind, enemyTierIndex()); }
const FIGHT_RANGE = 1.9;     // metres
const FIGHT_RELEASE = 4;     // metres: knocked further apart than this and the fight is off
const ATTACKS = {
  punch:    { dur: 0.30, hit: 0.16, reach: 1.35, dmg: 1 },
  kick:     { dur: 0.40, hit: 0.22, reach: 1.45, dmg: 1 },
  finisher: { dur: 0.48, hit: 0.24, reach: 1.55, dmg: 1 },
  spinkick: { dur: 0.55, hit: 0.26, reach: 1.9, dmg: 2, all: true },
  flykick:  { dur: 0.50, hit: 0.18, reach: 1.7, dmg: 3 },
  smash:    { dur: 0.70, hit: 0.38, reach: 1.9, dmg: 3, all: true, shock: 3.2 },
  takedown: { dur: 0.60, hit: 0.28, reach: 1.4, dmg: 3 }
};
const ATTACK_STATES = new Set(Object.keys(ATTACKS));

// Bonus moves and perks the player has unlocked (set by the menus before a run).
let playerSkills = [];
function hasSkill(p, id) { return !!(p.skills && p.skills.has(id)); }
function maxHearts(p) { return hasSkill(p, "extra_heart") ? 4 : MAX_HEARTS; }
function airJumpsFor(p) { return hasSkill(p, "triple_jump") ? 2 : 1; }

// How much of a fight is on, 0 to 1: the music muffles and the fight beat plays with it.
let fightLevel = 0;
const COYOTE_TIME = 0.09;
const JUMP_BUFFER = 0.12;
const BOOST_SECONDS = 8;
const BOOST_SPEED = 1.5;
const REWIND_SECONDS = 10;
const MAX_HEARTS = 3;
const INVULNERABLE = 1.4;
const TAUNT_SECONDS = 2.6;
// Koda's body: standing, crouched and sliding heights, and width.
const STAND_H = Math.round(m(1.55)), CROUCH_H = Math.round(m(1.3)), SLIDE_H = Math.round(m(0.6)), BODY_W = Math.round(m(0.62));
const MUSIC_VOLUME = 0.7;
const RACE_FINISH_WINDOW = 10;      // two players: seconds the second runner gets after the first one finishes

/* ---------------------------------------------------------------------------
   ART
   Every image draws only once it has loaded, so the game never waits on it.
--------------------------------------------------------------------------- */

function loadImage(src) {
  const img = new Image();
  img.ready = false;
  img.onload = () => { img.ready = true; };
  img.onerror = () => console.warn("Image not found: " + src);
  if (src) img.src = src;
  return img;
}

const art = {
  koda: loadImage(SPRITES.koda.src),
  warden: loadImage(SPRITES.warden.src),
  kodaMask: loadImage(SPRITES.koda_mask.src),
  coin: loadImage(SPRITES.coin.src),
  drone: loadImage(SPRITES.drone.src),
  kit: loadImage(SPRITES.kit.src),
  meshyKit: loadImage(SPRITES.meshyKit.src),
  props2d: loadImage("assets/worlds/props-2d.webp"),
  walkers: loadImage(SPRITES.walkers.src),
  tiles: loadImage(SPRITES.tiles.src),
  logo: loadImage(GAME.logo),
  zora: loadImage(SPRITES.zora.src),
  back: { koda: loadImage(SPRITES.back.koda), koda_mask: loadImage(SPRITES.back.koda_mask), zora: loadImage(SPRITES.back.zora) },
  enemies: {},
  npcs: loadImage(SPRITES.npcs.src),
  loc: {},
  worlds: {}
};
for (const [k, d] of Object.entries(SPRITES.enemies)) art.enemies[k] = loadImage(d.src);
// Location paintings: loaded when a mission that uses them is chosen.
function locImage(name) {
  if (!art.loc[name]) art.loc[name] = loadImage("assets/worlds/loc/" + name + ".webp");
  return art.loc[name];
}

for (const [id, wd] of Object.entries(WORLDS)) {
  art.worlds[id] = { far: loadImage(wd.far), near: loadImage(wd.near), clouds: loadImage(wd.clouds) };
}

// Where each piece sits in the city kit sheet: [x, y, width, height]. Rendered from the F.I.L.L. 3D kits.
// Building tiles: 2 m wall panels, street stone, roof cap, catwalk and shutter, rendered in Blender
// from CC0 textures at 128 pixels a metre.
const TILES = {
  wall_tin: [0, 0, 256, 256], wall_tin_win: [258, 0, 256, 256], wall_tin_win_lit: [516, 0, 256, 256],
  wall_concrete: [0, 258, 256, 256], wall_concrete_win: [258, 258, 256, 256], wall_concrete_win_lit: [516, 258, 256, 256],
  wall_brick: [0, 516, 256, 256], wall_brick_win: [258, 516, 256, 256], wall_brick_win_lit: [516, 516, 256, 256],
  street_stone: [0, 774, 256, 128], cap_metal: [258, 774, 256, 51], catwalk: [516, 774, 256, 204], shutter: [0, 980, 256, 256]
};
// Which wall each world builds with, and how dark the dusk makes it.
const WORLD_WALLS = { lc: { wall: "tin", shade: 0.42 }, mc: { wall: "concrete", shade: 0.55 }, uc: { wall: "brick", shade: 0.4 }, ve: { wall: "brick", shade: 0.62 }, rc: { wall: "brick", shade: 0.3 } };

const KIT = {
  scaffold: [0, 0, 263, 380], wall_window: [265, 0, 241, 363], wall_door: [508, 0, 241, 363], stall: [0, 382, 440, 362],
  pipe_climb: [442, 382, 36, 361], laundry: [0, 746, 722, 307], shrine: [724, 746, 101, 152], cart: [0, 1055, 271, 146],
  crate: [273, 1055, 133, 138], stone_base: [408, 1055, 245, 130], vent: [655, 1055, 103, 127], valve: [760, 1055, 77, 123],
  barrel: [839, 1055, 73, 118], crate_half: [914, 1055, 68, 70], lantern: [984, 1055, 22, 50], pipe: [0, 1203, 242, 28],
  grate: [244, 1203, 128, 19]
};

/* ---------------------------------------------------------------------------
   MISSION
   Turns a mission file (metres) into the level (pixels, y pointing down,
   the street at y = 0).
--------------------------------------------------------------------------- */

let mission = null;      // the mission's data file
let level = null;        // the built level

const WALKABLE = { ground: 1, roof: 1, catwalk: 1, awning: 1, crate: 1, barrel: 1, cart: 1, counter: 1, vent: 1, wall: 1, gate: 1, grate: 1,
  container: 1, carriage: 1, booth: 1, garden: 1, glass: 1, turnstile: 1 };

function buildLevel(data) {
  const L = {
    solids: [], climbs: [], mud: [], checkpoints: [], wardens: [], drones: [], boosts: [], rewinds: [],
    records: [], notes: [], journal: [], coin: null, decor: [], sections: [],
    goal: null, width: m(data.length), startX: m(data.startX || 1.5)
  };

  L.stalls = [];
  for (const s of data.solids) {
    if (s.kind === "counter") { L.stalls.push({ kind: "counter", x: m(s.x), y: -m(s.top), w: m(s.w), h: m(s.top), seed: Math.round(s.x * 17) }); continue; }
    const top = -m(s.top);
    let bottomM = s.bottom;
    if (bottomM === undefined) {
      if (s.kind === "ground" || s.kind === "roof" || s.kind === "garden") bottomM = -4;
      else if (s.kind === "glass") bottomM = s.top - 0.15;
      else if (s.kind === "catwalk") bottomM = s.top - 0.28;
      else if (s.kind === "awning") bottomM = s.top - 0.2;
      else bottomM = supportBelow(data, s.x + s.w / 2, s.top - 0.01);
    }
    const solid = {
      kind: s.kind, art: s.art || null, oneWay: !!s.oneWay || s.kind === "awning" || s.kind === "catwalk" || s.kind === "glass",
      tier: s.tier || 0, car: s.car || 0,
      x: m(s.x), y: top, w: m(s.w), h: m(s.top - bottomM),
      dy: 0, seed: Math.round(s.x * 17 + s.top * 31)
    };
    if (s.kind === "gate") {
      solid.gate = { trigger: m(s.trigger || -999), floor: -m(s.bottom), closing: false };
      solid.h = 6;
      // A pulse shutter opens and shuts in time with the song: wait for it.
      if (s.pulse) { solid.gate.pulse = { period: s.pulse.period, open: s.pulse.open, offset: s.pulse.offset || 0 }; solid.h = 6; }
      // The gatehouse above the shutter goes all the way up: the only way past is under it.
      L.solids.push({ kind: "gatehouse", oneWay: false, x: solid.x - m(0.2), y: top - m(12), w: solid.w + m(0.4), h: m(12), dy: 0, seed: 0 });
    }
    L.solids.push(solid);
  }

  for (const c of data.climbs) {
    // No climbing strips on a shutter: the way past one is under it, before it shuts.
    if (c.strip && data.solids.some(g => g.kind === "gate" && Math.abs(g.x - c.x) < 1)) continue;
    const climb = { x: m(c.x), top: -m(c.top), bottom: -m(c.bottom), strip: !!c.strip, side: -1, wall: false };
    // A wall right behind it? Then pushing into the wall climbs it (so touch screens can climb too).
    climb.wall = L.solids.some(s => !s.oneWay && Math.abs(s.x - climb.x) < m(0.4) && s.y < climb.bottom && s.y + s.h > climb.top);
    L.climbs.push(climb);
  }
  for (const mu of data.mud || []) L.mud.push({ x: m(mu.x), w: m(mu.w) });
  L.sections = data.sections.map(s => Object.assign({}, s, { fromPx: m(s.from), fallY: s.fallBelow !== undefined ? -m(s.fallBelow) : null }));

  // Checkpoint 0 is the start line. Checkpoint k is reached at the end of part k-1 of the song.
  L.checkpoints.push({ x: m(data.startX || 1.5), y: 0, index: 0, part: -1, name: "START" });
  data.parts.forEach((part, i) => {
    L.checkpoints.push({ x: m(part.checkpoint.x), y: -m(part.checkpoint.y), index: i + 1, part: i, name: part.name, finish: !!part.finish });
  });

  for (const wd of data.wardens || []) {
    L.wardens.push({
      x: m(wd.x), y: -m(wd.y), minX: m(wd.minX), maxX: m(wd.maxX), facing: wd.facing || 1,
      state: "walk", alive: true, animT: 0, walkPhase: 0, windUp: 0, swingCd: 0, punchT: 0, pauseT: 0, home: m(wd.x), hp: enemyKindFor(wd.kind, enemyTierIndex(data.number)).hp, stagger: 0, followT: 0, combo: false,
      kind: wd.kind || "warden", guardT: 0, hitsInRow: 0, lastHitT: 0, still: !!wd.still, lookT: 0
    });
  }
  for (const dr of data.drones || []) {
    L.drones.push({ x: m(dr.x), y: -m(dr.y), baseY: -m(dr.y), minX: m(dr.minX), maxX: m(dr.maxX), facing: 1, alive: true, t: Math.random() * 6 });
  }
  for (const b of data.boosts || []) L.boosts.push({ x: m(b.x), y: -m(b.y), taken: false });
  for (const r of data.rewinds || []) L.rewinds.push({ x: m(r.x), y: -m(r.y), taken: false });
  if (data.coin) L.coin = { x: m(data.coin.x), y: -m(data.coin.y), taken: false };
  for (const j of data.journal || []) L.journal.push({ id: j.id, x: m(j.x), y: -m(j.y), taken: false });
  for (const d of data.decor || []) L.decor.push(d);
  L.npcs = (data.npcs || []).map(n => Object.assign({}, n));

  // Music notes: the tier comes from how high the note sits above the floor below it.
  for (const [nx, ny] of data.notes || []) {
    const rel = ny - supportBelow(data, nx, ny);
    const tier = rel < 1.6 ? "low" : rel < 2.7 ? "mid" : "high";
    L.notes.push({ x: m(nx), y: -m(ny), tier, taken: false });
  }

  // Vinyl records along every floor of the main route.
  const spacing = data.recordSpacing || 4.5;
  const blocked = (x, y) => L.solids.some(s => !s.oneWay && x > s.x - 12 && x < s.x + s.w + 12 && y > s.y - 12 && y < s.y + s.h + 12) ||
    L.notes.some(n => Math.abs(n.x - x) < 30 && Math.abs(n.y - y) < 30) ||
    L.boosts.concat(L.rewinds).some(b => Math.abs(b.x - x) < 50 && Math.abs(b.y - y) < 50) ||
    L.checkpoints.some(c => Math.abs(c.x - x) < 30 && Math.abs(c.y - y) < 120);
  for (const s of data.solids) {
    if (!(s.kind === "ground" || s.kind === "roof" || s.kind === "catwalk")) continue;
    for (let x = s.x + 0.9; x <= s.x + s.w - 0.9; x += spacing) {
      if (x < (data.startX || 1.5) + 2.5 || x > data.goal.x - 1) continue;
      if ((data.inward || []).some(iw => x > iw.from - 3 && x < iw.to + 3)) continue;   // inward runs have their own
      if (supportBelow(data, x, s.top + 0.5) > s.top + 0.01) continue;   // something stands on this spot
      const px = m(x), py = -m(s.top + 0.65);
      if (!blocked(px, py)) L.records.push({ x: px, y: py, taken: false });
    }
  }

  L.goal = { x: m(data.goal.x), y: -m(data.goal.y) - m(2.6), w: m(1.4), h: m(2.6) };
  if (data.candle) L.candle = { x: m(data.candle.x), y: -m(data.candle.y) };
  buildSystems(L, data);
  L.gems = [];
  if (freeRoam) freeRoamLevel(L);
  L.dressing = dressStreets(L, data);
  return L;
}

// Street dressing: every few metres of open street gets something that belongs in that world.
function dressStreets(L, data) {
  const out = [];
  const secs = data.sections || [];
  const worldAt = x => { let w = "lc"; for (const s of secs) if (x >= s.from) w = s.world; return w; };
  const busy = (x, y) => L.solids.some(s => s.kind !== "ground" && s.kind !== "roof" && s.kind !== "garden" && s.kind !== "ceiling" &&
      s.x < x + m(1.4) && s.x + s.w > x - m(1.4) && s.y < y && s.y > y - m(4)) ||
    L.checkpoints.some(c => Math.abs(c.x - x) < m(2.5)) || L.climbs.some(c => Math.abs(c.x - x) < m(1.2)) ||
    (L.cages || []).some(c => Math.abs(c.x - x) < m(2)) || (L.windows || []).some(w => Math.abs(w.x - x) < m(3)) ||
    (L.shrines || []).some(w => Math.abs(w.x - x) < m(2)) || (L.valves || []).some(w => Math.abs(w.x - x) < m(1.5)) ||
    (L.stalls || []).some(w => x > w.x - m(1.5) && x < w.x + w.w + m(1.5)) || (L.filters || []).some(w => Math.abs(w.x - x) < m(2));
  for (const g of L.solids) {
    if (g.kind !== "ground") continue;
    for (let x = g.x + m(2); x < g.x + g.w - m(2); x += m(3.2)) {
      const k = seeded(Math.floor(x / m(3.2)) * 7.31 + 3.3);
      if (k > 0.5) continue;
      const xm = x / PX, wld = worldAt(xm), list = WORLD_DRESSING[wld];
      if (!list || !list.length) continue;
      const jx = x + (seeded(x * 0.13) - 0.5) * m(1.2);
      if (busy(jx, g.y)) continue;
      const pick = list[Math.floor(seeded(x * 0.71) * list.length) % list.length];
      out.push({ x: jx, y: g.y, name: pick[0], h: pick[1] * (0.9 + seeded(x * 0.29) * 0.2) });
    }
  }
  return out;
}

// Free roam: no enforcers, only a few records and notes left out, and five hidden gems up on the
// highest, hardest places in the mission.
const GEMS_PER_WORLD = 5;
function freeRoamLevel(L) {
  L.wardens = []; L.drones = []; L.rewinds = [];
  L.records = L.records.filter((r, i) => i % 8 === 0);
  L.notes = L.notes.filter((n, i) => i % 6 === 0);
  const tops = L.solids.filter(s => (s.kind === "roof" || s.kind === "catwalk" || s.kind === "garden" || s.kind === "container" || s.kind === "carriage") && s.w > m(1.2) && s.y < 1e6)
    .sort((a, b) => a.y - b.y);
  const picked = [];
  for (const s of tops) {
    const x = s.x + s.w / 2;
    if (x < L.startX + m(20) || x > L.goal.x - m(10)) continue;
    if (picked.some(g => Math.abs(g.x - x) < L.width / (GEMS_PER_WORLD + 2))) continue;
    picked.push({ x, y: s.y - m(1.1), taken: false });
    if (picked.length >= GEMS_PER_WORLD) break;
  }
  L.gems = picked;
}

// The highest floor at x that is no higher than y (metres).
function supportBelow(data, x, y) {
  let best = -99;
  for (const s of data.solids) {
    if (!WALKABLE[s.kind]) continue;
    if (x < s.x || x > s.x + s.w) continue;
    if (s.top <= y + 0.001 && s.top > best) best = s.top;
  }
  return best;
}

function sectionAt(x) {
  let current = level.sections[0];
  for (const s of level.sections) if (x >= s.fromPx) current = s;
  return current;
}

/* ---------------------------------------------------------------------------
   GAME STATE
--------------------------------------------------------------------------- */

let gameState = "ready";     // ready, playing, paused, finished
let twoPlayer = false;
let players = [];
let lastTime = 0;
let runTime = 0;
let realTime = 0;            // seconds since the run started
let songClock = 0;           // where the song is, in seconds (the audio, or this clock when the audio can't play)
let rewindsUsed = 0;
let misses = 0;              // checkpoints missed (the song got there first)
let spareSeconds = 0;        // time to spare, added up over every checkpoint reached in time
let taunt = null;            // { text, part, t } while the game is taunting you
let banner = { text: "", sub: "", time: 0 };
let toast = { title: "", text: "", kind: "", time: 0 };
let cameraX = 0, cameraY = -410;
let finishedAt = 0;
let raceEndsAt = null;
let shake = 0;
let rewindFx = 0;
let flash = 0;
const look = { x: 0, y: 0 };   // right-stick camera nudge, -1..1 each way
let lightningBolt = null;
let particles = [];
let runToken = null;
let lastResult = null;

let hitStop = 0;          // a few frames of near-freeze when a big hit lands
let worldPace = 1;        // how fast the world breathes: clouds, wind, drift (eased, never jumps)
let cloudDrift = 0;       // integrated cloud travel, so a change of pace never snaps the clouds back
let reading = null;       // a journal page being read: the world holds still until it's put away
let trail = [];           // where the leader stood, by song time, for the 15 second rewind
let mirrorInput = true;   // right-to-left missions: the controls follow the screen
const REWIND_ON_MISS = 15;
const storm = { strength: 0, debris: [], nextThrow: 0, nextFlash: 4, lyricIndex: 0, front: -1e9, hold: 0, roll: 0 };

// The storm front chases the runner. Speeds in metres a second: it creeps in the intro,
// pushes in the verses and races in the choruses. It never goes back, and it never drops
// out of the left of the screen, so stopping lets it catch you.
const STORM_PACE = { intro: 1.9, verse: 2.9, chorus: 3.8 };
const STORM_HOLD = 1.4;   // seconds the storm pauses after it hits someone

// Race mode: the AI rival.
let aiRival = false;
// Free roam: walk a mission's world at your own pace. No clock, no enforcers, only a few things to find.
let freeRoam = false;
let aiLevel = "normal";   // easy, normal or hard
const AI_LEVELS = {
  easy:   { pauseChance: 0.006, pauseTime: [0.5, 1.2], missJump: 0.12, maxLead: m(10) },
  normal: { pauseChance: 0.0025, pauseTime: [0.3, 0.8], missJump: 0.05, maxLead: m(22) },
  hard:   { pauseChance: 0, pauseTime: [0, 0], missJump: 0, maxLead: 1e9 }
};
const ai = { pause: 0, jumpFail: 0, lastWant: null };

function newPlayer(id) {
  // Unlocked skills are for solo runs; a race keeps both runners on the same moves.
  const skills = new Set(id === 1 && !twoPlayer ? playerSkills : []);
  return {
    skills, shield: skills.has("storm_shield"),
    dash: 0, dashUsed: false, pounding: false, wallT: 0, wallDir: 0, kickT: 0, holdT: 0, fightWith: null,
    id, x: 0, y: 0, w: BODY_W, h: STAND_H, vx: 0, vy: 0, ground: null, facing: 1,
    state: "normal", stateT: 0, move: null, crouch: false, runPhase: 0,
    coyote: 0, jumpBuffer: 0, jumpHeld: false, jumpPressed: true, attackPressed: true, downPressed: true,
    airJumps: 1, flipTime: 0, boostTime: 0, invuln: 0, knock: 0, knockDir: 0, combo: 0, comboT: 0, hitDone: false,
    hearts: skills.has("extra_heart") ? 4 : MAX_HEARTS, records: 0, notes: { low: 0, mid: 0, high: 0 }, kos: 0, journal: [], coin: false,
    wipeouts: 0, finished: false, finishTime: 0, place: 0, cp: 0, lastSafe: { x: 0, y: 0 }, mudT: 0,
    climb: null, animClock: 0
  };
}

function loadMission(id) {
  mission = MISSION_DATA[id];
  loadSongBlob(mission.song && mission.song.src);
  level = buildLevel(mission);
  for (const sec of mission.sections || []) if (sec.backdrop) locImage(sec.backdrop);
  for (const iw of mission.inward || []) if (iw.backdrop) locImage(iw.backdrop);
  preloadJournal();
  return mission;
}

function resetRun() {
  level = buildLevel(mission);
  const count = twoPlayer ? 2 : 1;
  players = [];
  for (let i = 0; i < count; i++) {
    const p = newPlayer(i + 1);
    p.x = level.startX - i * 46;
    p.y = 0;
    p.lastSafe = { x: p.x, y: p.y };
    players.push(p);
  }
  runTime = 0; realTime = 0; songClock = 0; rewindsUsed = 0; misses = 0; spareSeconds = 0; taunt = null;
  trail = []; reading = null; hitStop = 0; fightsShown = 0; worldPace = 1; cloudDrift = 0; resetInward();
  cameraX = Math.max(0, players[0].x - W * 0.3);
  cameraY = -410;
  storm.strength = 0; storm.debris = []; storm.nextThrow = 0; storm.nextFlash = 4; storm.lyricIndex = 0;
  storm.front = level.startX - m(14); storm.hold = 2; storm.roll = 0;
  ai.pause = 0; ai.jumpFail = 0;
  particles = [];
  raceEndsAt = null; rewindFx = 0; flash = 0; shake = 0; lightningBolt = null;
  banner = { text: mission.parts[0].name, sub: "MISSION " + String(mission.number).padStart(2, "0") + " · " + mission.title, time: 3 };
  toast.time = 0;
  resetSystems();
  gameState = "playing";
}

/* ---------------------------------------------------------------------------
   THE SONG CLOCK
   The song drives the run: lyrics, the storm and the checkpoint deadlines.
--------------------------------------------------------------------------- */

// The part of the song the runner in front is racing through: the next checkpoint they haven't reached.
function currentPartIndex() {
  return Math.min(mission.parts.length - 1, leader().cp);
}

// Which part of the song is playing right now.
function playingPartIndex() {
  let idx = 0;
  mission.parts.forEach((p, i) => { if (songClock >= p.start) idx = i; });
  return idx;
}

function seekSong(seconds) {
  songClock = Math.max(0, seconds);
  try { songAudio.currentTime = songClock; } catch (e) { /* not seekable yet: the clock carries on alone */ }
}

// The song slows for a few seconds (breathing at a window): the music and the clock both.
let songSlowT = 0;
function songRate() { return songSlowT <= 0 ? 1 : songSlowT < 0.6 ? 0.72 + 0.28 * (1 - songSlowT / 0.6) : 0.72; }
function slowSong(seconds) { songSlowT = Math.max(songSlowT, seconds); }

let lastResync = 0;
function updateSongClock(realDt) {
  songSlowT = Math.max(0, songSlowT - realDt);
  const rate = songRate();
  if (songAudio.playbackRate !== rate) { try { songAudio.preservesPitch = false; songAudio.playbackRate = rate; } catch (e) { /* older browsers */ } }
  songClock += realDt * rate;
  if (freeRoam) { if (!songAudio.paused && songAudio.readyState >= 3) songClock = songAudio.currentTime; return; }
  // While the audio is playing it leads; the clock follows small drift. A big gap means the browser
  // couldn't jump in the file: the clock keeps its place and the audio is sent back to it.
  if (!songAudio.paused && !musicBlocked && songAudio.readyState >= 3) {
    const d = songAudio.currentTime - songClock;
    if (Math.abs(d) > 2.5) {
      if (realTime - lastResync > 1) { lastResync = realTime; try { songAudio.currentTime = songClock; } catch (e) { /* not seekable */ } }
    } else if (Math.abs(d) > 0.25) songClock = songAudio.currentTime;
  }
}

/* ---------------------------------------------------------------------------
   MUSIC AND LYRICS
--------------------------------------------------------------------------- */

const songAudio = document.getElementById("songAudio");
let musicBlocked = false;
// The game pausing the song on purpose (Music Drive, Stillness): the keep-it-playing guard leaves it alone.
let songHeld = false;
// Each song is also fetched whole and played from memory, so jumping back in it always works.
const songBlob = {}, songBytes = {};
function songSrcFor(src) { return songBlob[src] || src; }
function loadSongBlob(src) {
  if (!src || songBlob[src] !== undefined) return;
  songBlob[src] = null;
  fetch(src).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
    if (!buf) { delete songBlob[src]; return; }
    songBytes[src] = buf.slice(0);
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
    songBlob[src] = url;
    if (!mission || mission.song.src !== src || songAudio.getAttribute("src") !== src) return;
    const wasPlaying = !songAudio.paused;
    songAudio.src = url;
    songAudio.addEventListener("loadedmetadata", () => {
      try { songAudio.currentTime = songClock; } catch (e) { /* not ready */ }
      if (wasPlaying && soundOn && gameState === "playing" && !reading && !taunt && !songHeld) songAudio.play().catch(() => {});
    }, { once: true });
  }).catch(() => { delete songBlob[src]; });
}
let fadeTimer = null;
let soundOn = true;
try { soundOn = localStorage.getItem("feelzrun-sound") !== "off"; } catch (e) { /* storage blocked */ }

function startMusic() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  const want = songSrcFor(mission.song.src);
  if (songAudio.getAttribute("src") !== want) songAudio.src = want;
  loadSongBlob(mission.song.src);
  songAudio.loop = !!freeRoam;
  songHeld = false; songSlowT = 0;
  songAudio.volume = MUSIC_VOLUME;
  try { songAudio.playbackRate = 1; songAudio.currentTime = 0; } catch (e) { /* not loaded yet */ }
  const playing = songAudio.play();
  if (playing && playing.catch) {
    playing.then(() => { musicBlocked = false; }).catch(() => {
      musicBlocked = true;
      if (gameState === "playing" && soundOn) showBanner("TAP FOR SOUND", "", 3);
    });
  }
}

function retryMusic() {
  if (!musicBlocked || gameState !== "playing" || reading) return;
  sfx.init();
  songAudio.play().then(() => { musicBlocked = false; }).catch(() => {});
}
window.addEventListener("pointerdown", retryMusic);
window.addEventListener("keydown", retryMusic);

// Keep the song going: if the browser pauses it during a run, start it again.
songAudio.addEventListener("pause", () => {
  if (gameState !== "playing" || document.hidden || taunt || reading || songAudio.ended || songHeld) return;
  setTimeout(() => {
    if (gameState !== "playing" || !songAudio.paused || taunt || reading || songHeld) return;
    songAudio.play().catch(() => { musicBlocked = true; });
  }, 250);
});

function fadeOutMusic(seconds) {
  if (fadeTimer) clearInterval(fadeTimer);
  const start = songAudio.volume, steps = 30;
  let step = 0;
  fadeTimer = setInterval(() => {
    step += 1;
    songAudio.volume = Math.max(0, start * (1 - step / steps));
    if (step >= steps) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      songAudio.pause();
      songAudio.volume = MUSIC_VOLUME;
    }
  }, ((seconds || 3) * 1000) / steps);
}

// Where the song is (the lyrics follow it).
function songTime() {
  return songClock;
}

let lyrics = [];
let lyricsOn = true;
try { lyricsOn = localStorage.getItem("feelzrun-lyrics") !== "off"; } catch (e) { /* storage blocked */ }

function parseTimestamp(text) {
  const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function parseLyrics(raw) {
  const lines = [];
  for (const row of raw.split(/\r?\n/)) {
    const ranged = /^\[([^\]]+?)\s*-->\s*([^\]]+)\]\s*(.*)$/.exec(row.trim());
    const single = /^\[(\d+:\d+(?:\.\d+)?)\]\s*(.*)$/.exec(row.trim());
    if (ranged) {
      const start = parseTimestamp(ranged[1]), end = parseTimestamp(ranged[2]);
      if (start !== null && end !== null && ranged[3]) lines.push({ start, end, text: ranged[3] });
    } else if (single) {
      const start = parseTimestamp(single[1]);
      if (start !== null && single[2]) lines.push({ start, end: null, text: single[2] });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  lines.forEach((line, i) => {
    if (line.end === null) {
      const next = lines[i + 1];
      line.end = next ? Math.min(next.start, line.start + 6) : line.start + 4;
    }
  });
  return lines;
}

function loadLyrics() {
  lyrics = [];
  if (!mission.song.lyrics) return;
  fetch(mission.song.lyrics)
    .then(r => (r.ok ? r.text() : ""))
    .then(text => { lyrics = parseLyrics(text); })
    .catch(() => console.warn("Lyrics not found: " + mission.song.lyrics));
}

function currentLyric() {
  const t = songTime();
  for (const line of lyrics) if (t >= line.start && t < line.end) return { line, t };
  return null;
}

/* ---------------------------------------------------------------------------
   SOUND EFFECTS (Web Audio, no files to load)
--------------------------------------------------------------------------- */

const SFX_VOLUME = 0.35;

const sfx = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;

  function setMuted(v) { muted = v; if (master) master.gain.value = muted ? 0 : SFX_VOLUME; }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : SFX_VOLUME;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    hookMusic(document.getElementById("songAudio"));
  }

  function tone({ type = "square", from, to = from, dur = 0.12, vol = 0.4, delay = 0 }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, cutoff = 1200, delay = 0, type = "lowpass" }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // A filtered noise burst with an attack, a hold and a filter sweep: whooshes, scrapes, thuds.
  function burstNoise({ dur = 0.15, vol = 0.3, f0 = 800, f1 = f0, q = 0.8, type = "bandpass", attack = 0.005, delay = 0 }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
  }
  const vary = (x, k) => x * (1 - k + Math.random() * 2 * k);

  // Stillness: while you move, the song waits and only a low held hum (a breath of it) carries on.
  let pad = null;
  function holdPad(on) {
    if (!ac) return;
    if (on && !pad) {
      const g = ac.createGain(); g.gain.value = 0.0001;
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      const os = [110, 164.8, 220.5].map((fr, i) => { const o = ac.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = fr; o.detune.value = (i - 1) * 6; o.connect(f); o.start(); return o; });
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.25; lg.gain.value = 250; l.connect(lg); lg.connect(f.frequency); l.start();
      f.connect(g); g.connect(master);
      g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.6);
      pad = { g, os: os.concat([l]) };
    } else if (!on && pad) {
      const p = pad; pad = null;
      p.g.gain.cancelScheduledValues(ac.currentTime);
      p.g.gain.setValueAtTime(Math.max(0.0001, p.g.gain.value), ac.currentTime);
      p.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      p.os.forEach(o => o.stop(ac.currentTime + 0.4));
    }
  }

  // Ambience: a violent storm, not rain on a roof. Gusting wind in two bands, a deep
  // roar, a low rolling rumble, and only a little hiss of rain on top.
  // If recorded sounds are in assets/audio/sfx/ (storm-loop.mp3, thunder-1.mp3 ...),
  // they're used instead of (or alongside) the synthesised ones.
  let amb = null;
  const samples = { storm: null, thunder: [] };
  function loadSample(url) {
    return fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(b => b ? ac.decodeAudioData(b) : null).catch(() => null);
  }
  function loadSamples() {
    loadSample("assets/audio/sfx/storm-loop.mp3").then(buf => {
      if (!buf || !amb) return;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ac.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start();
      samples.storm = { g };
    });
    for (let i = 1; i <= 4; i++) loadSample("assets/audio/sfx/thunder-" + i + ".mp3").then(buf => { if (buf) samples.thunder.push(buf); });
  }
  function makeAmbience() {
    if (amb || !ac) return;
    const len = ac.sampleRate * 6, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let brown = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; brown = (brown + 0.02 * w) / 1.02; d[i] = ch ? w * 0.6 + brown * 2 : brown * 3.5; }
    }
    const make = (type, freq, q, gainMax) => {
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = Math.random() * 2;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      const gust = ac.createGain(); gust.gain.value = 1;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(gust); gust.connect(g); g.connect(master); src.start();
      return { f, g, gust, max: gainMax };
    };
    amb = {
      wind: make("bandpass", 380, 0.7, 1.4),       // the body of the wind
      howl: make("bandpass", 1100, 2.2, 0.5),      // its whistle through the gaps
      roar: make("lowpass", 120, 0.9, 1.6),        // the wall of the storm
      rumble: make("lowpass", 55, 1.2, 1.8),       // thunder rolling far off
      rain: make("highpass", 3800, 0.5, 0.35)      // a little hiss of rain, kept low
    };
    const lfo = (target, rate, depth) => { const o = ac.createOscillator(), dg = ac.createGain(); o.frequency.value = rate; dg.gain.value = depth; o.connect(dg); dg.connect(target); o.start(); };
    lfo(amb.wind.f.frequency, 0.11, 220);
    lfo(amb.howl.f.frequency, 0.07, 500);
    lfo(amb.rumble.f.frequency, 0.05, 25);
    amb.nextGust = 0;
    loadSamples();
  }
  function ambience(levels) {
    if (!ac) return;
    makeAmbience();
    const t = ac.currentTime;
    const wind = Math.max(0, levels.wind || 0), roar = Math.max(0, levels.roar || 0), rain = Math.max(0, levels.rain || 0);
    const fury = Math.max(0, levels.fury || 0);   // how violent: 0 calm, 1 full storm
    amb.wind.g.gain.setTargetAtTime(wind * amb.wind.max, t, 0.5);
    amb.howl.g.gain.setTargetAtTime(wind * fury * amb.howl.max, t, 0.6);
    amb.roar.g.gain.setTargetAtTime((roar + fury * 0.35) * amb.roar.max, t, 0.4);
    amb.rumble.g.gain.setTargetAtTime(fury * 0.55 * amb.rumble.max, t, 1.2);
    amb.rain.g.gain.setTargetAtTime(rain * amb.rain.max, t, 0.5);
    if (samples.storm) samples.storm.g.gain.setTargetAtTime(Math.min(1, wind * 1.6 + fury * 0.6), t, 0.6);
    // Gusts: the wind surges and drops at random, harder in a storm.
    if (t > amb.nextGust) {
      const surge = 0.55 + Math.random() * (0.6 + fury * 0.9);
      for (const k of ["wind", "howl"]) {
        amb[k].gust.gain.setTargetAtTime(surge, t, 0.35 + Math.random() * 0.4);
      }
      amb.nextGust = t + 0.8 + Math.random() * (2.4 - fury * 1.2);
    }
  }

  // The song, routed through a filter so a fight can muffle it.
  let music = null;
  function hookMusic(el) {
    if (!ac || music || !el) return;
    try {
      const src = ac.createMediaElementSource(el);
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 20000; f.Q.value = 0.8;
      const g = ac.createGain(); g.gain.value = 1;
      src.connect(f); f.connect(g); g.connect(ac.destination);
      music = { f, g };
    } catch (e) { music = null; }
  }

  // The fight beat: kick, snare and hats, in time with the song.
  let fight = { on: false, timer: null, step: 0, next: 0, bus: null };
  function drum(kind, t) {
    if (kind === "kick") {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(fight.bus); o.start(t); o.stop(t + 0.3);
    } else {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = kind === "hat" ? "highpass" : "bandpass"; f.frequency.value = kind === "hat" ? 7500 : 1700;
      const dur = kind === "hat" ? 0.04 : 0.16, vol = kind === "hat" ? 0.18 : 0.55;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(fight.bus); s.start(t); s.stop(t + dur + 0.02);
      if (kind === "snare") { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); og.connect(fight.bus); o.start(t); o.stop(t + 0.12); }
    }
  }
  function fightMix(on, bpm, songPos) {
    if (!ac) return;
    const t = ac.currentTime;
    if (music) {
      music.f.frequency.setTargetAtTime(on ? 620 : 20000, t, on ? 0.06 : 0.35);
      music.g.gain.setTargetAtTime(on ? 0.7 : 1, t, 0.2);
    }
    if (on === fight.on) return;
    fight.on = on;
    if (!fight.bus) { fight.bus = ac.createGain(); fight.bus.gain.value = 0; fight.bus.connect(master); }
    fight.bus.gain.setTargetAtTime(on ? 0.85 : 0, t, on ? 0.05 : 0.4);
    if (on && !fight.timer) {
      const bps = (bpm || 92) / 60, sixteenth = 1 / bps / 4;
      // Start on the song's next beat so the drums sit with it.
      const pos = Math.max(0, songPos || 0);
      fight.step = 0; fight.next = t + 0.02 + (Math.ceil(pos * bps) - pos * bps) / bps;
      fight.timer = setInterval(() => {
        while (fight.next < ac.currentTime + 0.12) {
          const st = fight.step % 16;
          if (st === 0 || st === 8 || st === 10) drum("kick", fight.next);
          if (st === 4 || st === 12) drum("snare", fight.next);
          if (st % 2 === 0) drum("hat", fight.next);
          fight.next += sixteenth; fight.step++;
        }
      }, 25);
    } else if (!on && fight.timer) {
      const tm = fight.timer; fight.timer = null;
      setTimeout(() => clearInterval(tm), 900);
    }
  }
  function quiet() { holdPad(false); ambience({ wind: 0, rain: 0, roar: 0 }); fightMix(false); }

  // Thunder: a crack close by, then a long roll that slides down in pitch.
  function thunder(close) {
    if (!ac) return;
    const t = ac.currentTime;
    if (samples.thunder.length) {
      const src = ac.createBufferSource(); src.buffer = samples.thunder[Math.floor(Math.random() * samples.thunder.length)];
      const g = ac.createGain(); g.gain.value = close ? 1 : 0.6; src.connect(g); g.connect(master); src.start(t);
      return;
    }
    if (close) noise({ dur: 0.18, vol: 0.32, cutoff: 2600, type: "highpass" });
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = "lowpass";
    f.frequency.setValueAtTime(close ? 700 : 400, t); f.frequency.exponentialRampToValueAtTime(70, t + 3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(close ? 0.95 : 0.55, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 3.3);
  }

  // Rewind: the song itself, played backwards from where it is, through a tape-like filter.
  const revCache = {};
  let tape = null;
  function reversed(src) {
    if (revCache[src] !== undefined) return revCache[src];
    revCache[src] = null;
    const bytes = typeof songBytes !== "undefined" && songBytes[src];
    if (!bytes || !ac) { delete revCache[src]; return null; }
    ac.decodeAudioData(bytes.slice(0)).then(buf => {
      const out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), b = out.getChannelData(c); for (let i = 0, n = a.length; i < n; i++) b[i] = a[n - 1 - i]; }
      revCache[src] = out;
    }).catch(() => { delete revCache[src]; });
    return null;
  }
  function tapeStart(src, at, rate, vol) {
    const buf = reversed(src);
    if (!buf) { noise({ dur: 0.4, vol: 0.06, cutoff: 3000, type: "bandpass" }); return null; }
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3800;
    const g = ac.createGain(); g.gain.value = 0.0001;
    s.connect(f); f.connect(g); g.connect(ac.destination);
    g.gain.exponentialRampToValueAtTime(vol * (muted ? 0.0001 : 1) + 0.0001, ac.currentTime + 0.08);
    s.start(0, Math.max(0, buf.duration - at));
    return { s, g };
  }
  function tapeStop(t, fade) {
    if (!t) return;
    t.g.gain.cancelScheduledValues(ac.currentTime);
    t.g.gain.setValueAtTime(Math.max(0.0001, t.g.gain.value), ac.currentTime);
    t.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fade);
    t.s.stop(ac.currentTime + fade + 0.05);
  }
  // While Music Drive pulls you back: on, at this song time, this fast.
  function rewindTape(on, src, at, rate) {
    if (!ac) return;
    if (!on) { if (tape) { tapeStop(tape, 0.12); tape = null; } return; }
    if (!tape) tape = tapeStart(src, at, rate, 0.55);
    else tape.s.playbackRate.value = rate;
  }
  // A quick spin back over the last few seconds (a rewind token, the song taking you back).
  function rewindSweep(src, from, seconds) {
    if (!ac) return;
    const rate = Math.max(4, seconds / 1.1);
    const t = tapeStart(src, from, rate, 0.5);
    if (t) setTimeout(() => tapeStop(t, 0.15), Math.min(1600, (seconds / rate) * 1000));
  }

  return {
    init, setMuted, hookMusic, ambience, fightMix, quiet, thunder, holdPad, rewindTape, rewindSweep,
    // the clock in the red: a dry tick, sharper in the last three seconds
    tick(last)   { tone({ type: "square", from: last ? 1760 : 1320, to: last ? 1700 : 1250, dur: 0.05, vol: last ? 0.16 : 0.1 }); burstNoise({ dur: 0.03, vol: 0.08, f0: 5000, type: "highpass" }); },
    // a valve letting go: a hard hiss that settles
    steam()      { burstNoise({ dur: 1.2, vol: 0.22, f0: 7000, f1: 2500, type: "highpass", attack: 0.02 }); burstNoise({ dur: 0.9, vol: 0.12, f0: 900, f1: 300, q: 0.4, attack: 0.04 }); },
    // the light opening at a shrine: a rising shimmer of bells and a warm swell
    shrine()     { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ type: "sine", from: f, to: f * 1.01, dur: 1.4, vol: 0.09, delay: i * 0.08 })); [262, 392].forEach(f => tone({ type: "triangle", from: f, dur: 1.8, vol: 0.07 })); burstNoise({ dur: 1.6, vol: 0.06, f0: 8000, f1: 3000, type: "highpass", attack: 0.3 }); },
    // breathing out at a window: a slow, soft exhale
    breathe()    { burstNoise({ dur: 1.6, vol: 0.1, f0: 1200, f1: 400, q: 0.5, attack: 0.4 }); },
    // the camera swinging round into the picture and back out
    swing()      { burstNoise({ dur: 0.45, vol: 0.16, f0: 400, f1: 2600, q: 0.7, attack: 0.1 }); },
    flip()       { tone({ type: "triangle", from: 900, to: 520, dur: 0.09, vol: 0.08 }); tone({ type: "triangle", from: 660, to: 1200, dur: 0.07, vol: 0.06, delay: 0.06 }); },
    // push-off: a scuff of the sole and a little rush of air
    jump()       { burstNoise({ dur: 0.06, vol: 0.16, f0: 220, type: "lowpass" }); burstNoise({ dur: 0.18, vol: 0.07, f0: 900, f1: 2600, q: 0.6, attack: 0.03 }); },
    // the flip: two quick passes of air as he turns over
    doubleJump() { burstNoise({ dur: 0.16, vol: 0.12, f0: 700, f1: 2200, q: 0.9, attack: 0.04 }); burstNoise({ dur: 0.2, vol: 0.1, f0: 1800, f1: 600, q: 0.9, attack: 0.05, delay: 0.13 }); },
    step(surface) {
      const v = vary(1, 0.2);
      if (surface === "metal") {
        burstNoise({ dur: 0.05, vol: 0.12 * v, f0: 260, type: "lowpass" });
        tone({ type: "sine", from: vary(1300, 0.1), to: 900, dur: 0.12, vol: 0.025 * v });
        burstNoise({ dur: 0.04, vol: 0.04 * v, f0: 3200, q: 1.2 });
      } else if (surface === "soft") {
        burstNoise({ dur: 0.07, vol: 0.1 * v, f0: 180, type: "lowpass" });
        burstNoise({ dur: 0.09, vol: 0.03 * v, f0: 1400, q: 0.5 });
      } else if (surface === "wet") {
        burstNoise({ dur: 0.06, vol: 0.12 * v, f0: 200, type: "lowpass" });
        burstNoise({ dur: 0.14, vol: 0.06 * v, f0: 2600, f1: 900, q: 1.5, delay: 0.01 });
      } else {
        // concrete and stone: a heel thump and grit under the sole
        burstNoise({ dur: 0.055, vol: 0.14 * v, f0: vary(170, 0.15), type: "lowpass" });
        burstNoise({ dur: 0.035, vol: 0.035 * v, f0: vary(3800, 0.2), type: "highpass", delay: 0.01 });
      }
    },
    record()     { tone({ type: "triangle", from: 988, dur: 0.06, vol: 0.3 }); tone({ type: "triangle", from: 1319, dur: 0.12, vol: 0.3, delay: 0.05 }); },
    note(tier)   {
      const base = tier === "high" ? 1568 : tier === "mid" ? 1319 : 1175;
      tone({ type: "sine", from: base, dur: 0.07, vol: 0.45 });
      tone({ type: "sine", from: base * 1.335, dur: 0.18, vol: 0.45, delay: 0.06 });
      if (tier === "high") tone({ type: "sine", from: base * 2, dur: 0.25, vol: 0.3, delay: 0.13 });
    },
    coin()       { [1319, 1760, 2093].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.16, vol: 0.35, delay: i * 0.07 })); },
    journal()    { [523, 784, 1047].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.3, vol: 0.3, delay: i * 0.1 })); },
    // landing: both feet, a heavy thump with a crouch of cloth
    land()       { burstNoise({ dur: 0.12, vol: 0.3, f0: 140, type: "lowpass" }); burstNoise({ dur: 0.06, vol: 0.05, f0: 3000, type: "highpass", delay: 0.01 }); },
    // the slide: fabric and shoe soles scraping along, falling away
    slide()      { burstNoise({ dur: 0.42, vol: 0.2, f0: 1600, f1: 500, q: 0.7, attack: 0.02 }); burstNoise({ dur: 0.3, vol: 0.08, f0: 4200, f1: 2500, type: "highpass", attack: 0.02 }); },
    vault()      { burstNoise({ dur: 0.05, vol: 0.18, f0: 600, q: 1 }); burstNoise({ dur: 0.18, vol: 0.08, f0: 800, f1: 2400, q: 0.7, attack: 0.03, delay: 0.03 }); },
    // climbing: a hand slapping onto the pipe, a ring of hollow metal, cloth
    climb()      { burstNoise({ dur: 0.05, vol: 0.14, f0: vary(900, 0.15), q: 1.2 }); tone({ type: "sine", from: vary(640, 0.1), to: 560, dur: 0.14, vol: 0.02 }); burstNoise({ dur: 0.1, vol: 0.025, f0: 3500, type: "highpass", delay: 0.02 }); },
    // a hit landing: the snap of the strike and the body taking it
    punch(kind)  {
      const heavy = kind === "finisher" || kind === "kick" || kind === "smash" || kind === "flykick" || kind === "spinkick";
      burstNoise({ dur: 0.05, vol: heavy ? 0.3 : 0.24, f0: vary(1700, 0.2), q: 1.4 });
      burstNoise({ dur: heavy ? 0.16 : 0.1, vol: heavy ? 0.45 : 0.32, f0: heavy ? 120 : 180, type: "lowpass", delay: 0.005 });
      if (heavy) tone({ type: "sine", from: 90, to: 45, dur: 0.18, vol: 0.25 });
    },
    // a hit blocked: forearms meeting, duller, with a slap
    block()      { burstNoise({ dur: 0.07, vol: 0.22, f0: 260, type: "lowpass" }); burstNoise({ dur: 0.04, vol: 0.12, f0: 2400, q: 2 }); },
    page()       { [392, 523, 659].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.5, vol: 0.18, delay: i * 0.12 })); },
    // grabbing the bar and the trolley wheels starting down the cable
    zip()        { burstNoise({ dur: 0.08, vol: 0.2, f0: 700, q: 1.2 }); burstNoise({ dur: 1.2, vol: 0.09, f0: 2200, f1: 4200, q: 3, attack: 0.2, delay: 0.05 }); tone({ type: "sawtooth", from: 180, to: 320, dur: 1.1, vol: 0.02, delay: 0.05 }); },
    // Zora slipping away: a soft shimmer falling away; coming back: it rising again
    zoraOut()    { [1568, 1319, 1175, 988, 784].forEach((f, i) => tone({ type: "sine", from: f, to: f * 0.98, dur: 0.5, vol: 0.08, delay: i * 0.09 })); burstNoise({ dur: 1.0, vol: 0.06, f0: 6000, f1: 2000, type: "highpass", attack: 0.1 }); },
    zoraIn()     { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.4, vol: 0.07, delay: i * 0.07 })); },
    whiff()      { burstNoise({ dur: 0.14, vol: 0.12, f0: 1200, f1: 3000, q: 0.8, attack: 0.03 }); },
    // knocked out: the last hit, then the body hitting the ground
    knockout()   { burstNoise({ dur: 0.06, vol: 0.3, f0: 1500, q: 1.3 }); burstNoise({ dur: 0.25, vol: 0.45, f0: 110, type: "lowpass", delay: 0.32 }); burstNoise({ dur: 0.12, vol: 0.12, f0: 2500, type: "highpass", delay: 0.33 }); },
    takedown()   { noise({ dur: 0.15, vol: 0.3, cutoff: 900 }); [330, 440, 660].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.12, vol: 0.25, delay: 0.1 + i * 0.07 })); },
    bark()       { [0, 0.16].forEach(d => { tone({ type: "sawtooth", from: 560 + Math.random() * 80, to: 300, dur: 0.09, vol: 0.14, delay: d }); burstNoise({ dur: 0.09, vol: 0.16, f0: 900, q: 1.2, delay: d }); }); },
    growl()      { burstNoise({ dur: 0.35, vol: 0.22, f0: 180, type: "lowpass", attack: 0.03 }); tone({ type: "sawtooth", from: 110, to: 90, dur: 0.3, vol: 0.12 }); },
    yelp()       { tone({ type: "sine", from: 1100, to: 1700, dur: 0.12, vol: 0.16 }); tone({ type: "sine", from: 1500, to: 900, dur: 0.18, vol: 0.12, delay: 0.12 }); },
    hurt()       { tone({ type: "sawtooth", from: 260, to: 70, dur: 0.3, vol: 0.3 }); noise({ dur: 0.15, vol: 0.25, cutoff: 2500 }); },
    stun()       { [0, 0.05, 0.1, 0.15].forEach(d => tone({ type: "sawtooth", from: 1800, to: 600, dur: 0.05, vol: 0.12, delay: d })); },
    fall()       { tone({ type: "triangle", from: 700, to: 90, dur: 0.55, vol: 0.35 }); },
    caught()     { [392, 311, 233].forEach((f, i) => tone({ type: "square", from: f, dur: 0.18, vol: 0.2, delay: i * 0.14 })); },
    alert()      { tone({ type: "square", from: 880, dur: 0.08, vol: 0.22 }); tone({ type: "square", from: 1175, dur: 0.14, vol: 0.22, delay: 0.09 }); },
    suspicious() { tone({ type: "sine", from: 600, to: 760, dur: 0.15, vol: 0.12 }); },
    taser()      { noise({ dur: 0.18, vol: 0.18, cutoff: 4000, type: "highpass" }); tone({ type: "sawtooth", from: 900, to: 300, dur: 0.18, vol: 0.12 }); },
    drone()      { noise({ dur: 0.3, vol: 0.3, cutoff: 800 }); tone({ type: "square", from: 500, to: 80, dur: 0.35, vol: 0.18 }); },
    checkpoint() { [523, 659, 784].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.14, vol: 0.32, delay: i * 0.09 })); },
    boost()      { [392, 523, 659, 784, 1047].forEach((f, i) => tone({ type: "sawtooth", from: f, dur: 0.1, vol: 0.12, delay: i * 0.05 })); noise({ dur: 0.35, vol: 0.12, cutoff: 3000 }); },
    rewind()     { for (let i = 0; i < 8; i++) tone({ type: "square", from: 1400 - i * 120, to: 700 - i * 60, dur: 0.06, vol: 0.1, delay: i * 0.045 }); noise({ dur: 0.45, vol: 0.12, cutoff: 5000, type: "highpass" }); },
    gate()       { noise({ dur: 0.5, vol: 0.18, cutoff: 500 }); tone({ type: "sawtooth", from: 90, to: 60, dur: 0.5, vol: 0.1 }); },
    // a swing: the arm cutting the air
    swing()      { burstNoise({ dur: 0.13, vol: 0.13, f0: 700, f1: 2600, q: 1.1, attack: 0.04 }); },
    dash()       { noise({ dur: 0.25, vol: 0.2, cutoff: 1800, type: "bandpass" }); tone({ type: "sawtooth", from: 300, to: 900, dur: 0.2, vol: 0.1 }); },
    pound()      { noise({ dur: 0.4, vol: 0.45, cutoff: 300 }); tone({ type: "sine", from: 120, to: 35, dur: 0.45, vol: 0.5 }); },
    shield()     { [1047, 1319, 1568].forEach((f, i) => tone({ type: "sine", from: f, to: f * 0.5, dur: 0.3, vol: 0.25, delay: i * 0.04 })); },
    fight()      { burstNoise({ dur: 0.2, vol: 0.2, f0: 160, type: "lowpass" }); tone({ type: "sawtooth", from: 110, to: 90, dur: 0.22, vol: 0.12 }); },
    debris()     { noise({ dur: 0.25, vol: 0.15, cutoff: 1500, type: "bandpass" }); },
    taunt()      { [392, 370, 349, 330].forEach((f, i) => tone({ type: "sawtooth", from: f, to: f * 0.94, dur: i === 3 ? 0.7 : 0.22, vol: 0.22, delay: i * 0.24 }));
                   noise({ dur: 0.9, vol: 0.12, cutoff: 900, type: "bandpass", delay: 1.0 }); },
    finish()     { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: "triangle", from: f, dur: i === 5 ? 0.5 : 0.13, vol: 0.4, delay: i * 0.11 })); }
  };
})();

function applySound() {
  songAudio.muted = !soundOn;
  sfx.setMuted(!soundOn);
}

/* ---------------------------------------------------------------------------
   INPUT: keyboard, touch and controllers, for one or two players
--------------------------------------------------------------------------- */

const keys = {};
const touch = { left: false, right: false, jump: false, down: false, attack: false };

// One player: every key works. Two players: Player 1 on WASD + F, Player 2 on the arrows + / (or Right Shift).
const KEYMAP_SOLO = {
  left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"],
  jump: ["Space", "KeyW", "ArrowUp", "KeyK"], down: ["KeyS", "ArrowDown", "ControlLeft", "KeyC"], attack: ["KeyF", "KeyJ", "KeyX"]
};
const KEYMAP_P1 = { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], jump: ["KeyW", "Space"], down: ["KeyS"], attack: ["KeyF", "KeyG"] };
const KEYMAP_P2 = {
  left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], jump: ["ArrowUp"], down: ["ArrowDown"],
  attack: ["Slash", "Period", "ShiftRight", "Numpad0", "Enter"]
};

function keyHeld(list) { return list.some(code => keys[code]); }

const pads = [{}, {}];   // what each player's controller is pressing

function padsList() {
  const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(p => p && p.connected) : [];
  return list.sort((a, b) => a.index - b.index);
}

function readPads() {
  const list = padsList();
  document.body.classList.toggle("pad-active", list.length > 0);
  // Two players with one controller: the controller is Player 2 and Player 1 uses the keyboard.
  const forPlayer = twoPlayer ? (list.length === 1 ? [null, list[0]] : [list[0], list[1]]) : [list[0], null];
  for (let i = 0; i < 2; i++) {
    const gp = forPlayer[i];
    const prev = pads[i];
    if (!gp) { pads[i] = { connected: false }; continue; }
    const b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    // right stick: look around (small dead zone so a resting stick doesn't drift the view)
    const dz = v => Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8;
    pads[i] = {
      connected: true, lookX: dz(gp.axes[2] || 0), lookY: dz(gp.axes[3] || 0),
      left: ax < -0.35 || b(14), right: ax > 0.35 || b(15),
      up: ay < -0.5 || b(12), down: ay > 0.5 || b(13) || b(1),
      jump: b(0), attack: b(2) || b(5), start: b(9), y: b(3), b: b(1),
      prevStart: prev.start, prevA: prev.jump, prevY: prev.y, prevB: prev.b, prevX: prev.attack, gp, navT: prev.navT, navHeld: prev.navHeld
    };
  }
}

function controlsFor(index) {
  const c = rawControls(index);
  const pl = players && players[index];
  if (pl && pl.autoRun > 0 && !c.left) c.right = true;
  // Right-to-left missions are mirrored on screen: pushing right on the screen moves forward.
  if (mission && mission.mirror && mirrorInput && !(aiRival && index === 1)) { const l = c.left; c.left = c.right; c.right = l; }
  return c;
}

function rawControls(index) {
  const pad = pads[index] || {};
  if (!twoPlayer) {
    const k = KEYMAP_SOLO;
    return {
      left: keyHeld(k.left) || touch.left || !!pad.left,
      right: keyHeld(k.right) || touch.right || !!pad.right,
      up: keyHeld(k.up) || !!pad.up,
      jump: keyHeld(k.jump) || touch.jump || !!pad.jump,
      down: keyHeld(k.down) || touch.down || !!pad.down,
      attack: keyHeld(k.attack) || touch.attack || !!pad.attack
    };
  }
  if (aiRival) {
    if (index === 1) return aiControls(players[1]);
    const k = KEYMAP_SOLO;
    return {
      left: keyHeld(k.left) || touch.left || !!pad.left || !!(pads[1] || {}).left,
      right: keyHeld(k.right) || touch.right || !!pad.right || !!(pads[1] || {}).right,
      up: keyHeld(k.up) || !!pad.up || !!(pads[1] || {}).up,
      jump: keyHeld(k.jump) || touch.jump || !!pad.jump || !!(pads[1] || {}).jump,
      down: keyHeld(k.down) || touch.down || !!pad.down || !!(pads[1] || {}).down,
      attack: keyHeld(k.attack) || touch.attack || !!pad.attack || !!(pads[1] || {}).attack
    };
  }
  const k = index === 0 ? KEYMAP_P1 : KEYMAP_P2;
  return {
    left: keyHeld(k.left) || !!pad.left || (index === 0 && touch.left),
    right: keyHeld(k.right) || !!pad.right || (index === 0 && touch.right),
    up: keyHeld(k.up) || !!pad.up,
    jump: keyHeld(k.jump) || !!pad.jump || (index === 0 && touch.jump),
    down: keyHeld(k.down) || !!pad.down || (index === 0 && touch.down),
    attack: keyHeld(k.attack) || !!pad.attack || (index === 0 && touch.attack)
  };
}

// The rival: reads the level ahead the way a good player would. Easier levels hesitate,
// fumble the odd jump and ease off when they are well ahead.
function aiControls(p) {
  const want = { left: false, right: true, up: false, jump: false, down: false, attack: false };
  if (!p || p.finished || gameState !== "playing" && gameState !== "botting") return want;
  const lv = AI_LEVELS[aiLevel] || AI_LEVELS.normal;
  const dt = 1 / 60;
  const human = players[0];
  if (inward.active) { const d = inwardDecide(p); return { left: d.left, right: d.right, up: false, jump: d.jump, down: d.down, attack: false }; }
  // A pulse shutter ahead that's shut (or about to be): wait for it.
  const pg = level.solids.find(s => s.gate && s.gate.pulse && s.x - p.x > 0 && s.x - p.x < m(2.2) && Math.abs(s.gate.floor - p.y) < m(0.6));
  if (pg && (!pulseOpen(pg) || !pulseOpen(pg, gateClock() + 0.7))) { want.right = false; return want; }
  if (typeof beatBlockedAhead === "function" && p.ground && beatBlockedAhead(p)) { want.right = false; return want; }
  if (ai.pause > 0) { ai.pause -= dt; want.right = false; }
  else if (p.ground && !p.climb && Math.random() < lv.pauseChance) ai.pause = lv.pauseTime[0] + Math.random() * (lv.pauseTime[1] - lv.pauseTime[0]);
  // Ease off when far ahead of you.
  if (human && !human.finished && p.x - human.x > lv.maxLead && p.ground) want.right = false;

  const c = level.climbs.find(c => c.x - p.x > -40 && c.x - p.x < 70 && c.bottom >= p.y - 10 && c.top < p.y - 20);
  if (p.climb || (c && c.x - p.x < 40)) want.up = true;
  const ahead = { x: p.x + p.w / 2 + 2, y: p.y - p.h + 4, w: m(1.0), h: p.h - 8 };
  // Only things that come down to his knees count as something to jump; anything higher is to duck under.
  const reachesLow = s => s.y + s.h > p.y - m(0.5);
  const block = level.solids.find(s => !s.oneWay && overlap(ahead, s) && reachesLow(s));
  const head = { x: p.x + p.w / 2, y: p.y - STAND_H, w: m(1.6), h: STAND_H - SLIDE_H - 6 };
  const low = { x: p.x + p.w / 2, y: p.y - SLIDE_H + 2, w: m(1.6), h: SLIDE_H - 6 };
  const over = level.solids.find(s => !s.oneWay && overlap(head, s));
  const lowBlock = level.solids.find(s => !s.oneWay && overlap(low, s));
  let jump = false, down = false;
  if (over && !lowBlock && p.ground) down = p.state === "slide" || p.crouch ? true : !p.downPressed;
  else if (block && p.ground && !c) jump = true;
  if (p.ground && !jump) {
    const f1 = floorBelow(p.x + m(0.9), p.y - 2, true);
    if (!f1 || f1.y > p.y + m(1.2)) jump = true;
  }
  if (!p.ground && !p.climb && p.vy > -50) {
    const f2 = floorBelow(p.x + m(1.5), p.y - 2, true);
    const stillBlocked = level.solids.find(s => !s.oneWay && overlap({ x: p.x + p.w / 2, y: p.y - p.h, w: m(0.8), h: p.h }, s) && reachesLow(s));
    if ((!f2 || f2.y > p.y + m(2)) || stillBlocked) jump = true;
  }
  if (p.crouch && over) down = true;
  for (const d of storm.debris) {
    const dx = p.x - d.x;
    if (dx > -m(0.6) && dx < m(2.6)) { if (d.low) { if (dx < m(1.5)) jump = true; } else { down = true; jump = false; } }
  }
  const wd = level.wardens.find(w => w.alive && Math.abs(w.y - p.y) < 30 && w.x - p.x > -m(0.5) && w.x - p.x < m(1.3));
  if (wd) { want.attack = Math.floor(runTime * 10) % 2 === 0; jump = false; }
  const ceil = level.solids.find(s => s.kind === "ceiling" && p.x + m(1) > s.x && p.x < s.x + s.w && s.y + s.h > p.y - STAND_H - 4);
  if (ceil) down = true;
  // Now and then an easier rival fumbles a jump: a beat late.
  if (jump && p.ground && ai.jumpFail <= 0 && Math.random() < lv.missJump) ai.jumpFail = 0.12;
  if (ai.jumpFail > 0) { ai.jumpFail -= dt; jump = false; }
  want.jump = jump && !p.jumpPressed;
  want.down = down;
  if (p.climb) want.right = false;
  return want;
}

function rumble(index, strength, ms) {
  const pad = pads[index];
  const act = pad && pad.gp && pad.gp.vibrationActuator;
  if (!act || typeof act.playEffect !== "function") return;
  act.playEffect("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: strength / 2 }).catch(() => {});
}

/* ---------------------------------------------------------------------------
   COLLISION HELPERS
--------------------------------------------------------------------------- */

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boxOf(p, h) {
  const height = h || p.h;
  return { x: p.x - p.w / 2, y: p.y - height, w: p.w, h: height };
}

function solidsNear(x0, x1) {
  return level.solids.filter(s => s.x < x1 && s.x + s.w > x0);
}

// Does the line from (x0, y0) to (x1, y1) pass through anything solid? Used for sight lines.
function lineBlocked(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  for (const s of level.solids) {
    if (s.oneWay || s.x > maxX || s.x + s.w < minX) continue;
    if (segmentHitsBox(x0, y0, x1, y1, s)) return true;
  }
  return false;
}

function segmentHitsBox(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const clip = (pp, q) => {
    if (pp === 0) return q >= 0;
    const r = q / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x0 - b.x) && clip(dx, b.x + b.w - x0) && clip(-dy, y0 - b.y) && clip(dy, b.y + b.h - y0) && t0 < t1;
}

function roomAt(x, feetY, h) {
  const box = { x: x - BODY_W / 2 + 2, y: feetY - h, w: BODY_W - 4, h: h - 1 };
  return !level.solids.some(s => !s.oneWay && overlap(box, s));
}

// The floor under x, at or below feetY (pixels). Returns the solid or null.
function floorBelow(x, feetY, includeOneWay) {
  let best = null;
  for (const s of level.solids) {
    if (s.oneWay && !includeOneWay) continue;
    if (x < s.x || x > s.x + s.w) continue;
    if (s.y >= feetY - 2 && (!best || s.y < best.y)) best = s;
  }
  return best;
}

/* ---------------------------------------------------------------------------
   PLAYER
--------------------------------------------------------------------------- */

function setState(p, state, seconds) {
  p.state = state;
  p.stateT = seconds || 0;
  p.animClock = 0;
}

// What to call a runner on screen.
let playerNames = ["", ""];   // signed-in names for a race, set by the menu
function playerName(p) {
  if (!twoPlayer) return "";
  if (aiRival) return p.id === 1 ? (playerNames[0] || "YOU") : "RIVAL";
  return playerNames[p.id - 1] || "P" + p.id;
}

function leader() {
  let best = null;
  for (const p of players) {
    if (p.finished && players.some(o => !o.finished)) continue;
    if (!best || p.x > best.x) best = p;
  }
  return best || players[0];
}

function hurtPlayer(p, sourceX, opts) {
  if (p.invuln > 0 || p.finished) return;
  p.hits = (p.hits || 0) + 1;
  if (typeof onHurtSystems === "function") onHurtSystems(p);
  const o = opts || {};
  sfx.hurt();
  rumble(p.id - 1, 0.7, 220);
  shake = Math.max(shake, 0.25);
  if (!twoPlayer) {
    p.hearts -= 1;
    if (p.hearts <= 0) { respawn(p, "WIPEOUT"); return; }
  }
  p.invuln = INVULNERABLE;
  p.knock = 0.25;
  p.knockDir = p.x < sourceX ? -1 : 1;
  p.vy = o.noLift ? p.vy : -320 * K;
  p.ground = null;
  p.climb = null;
  p.move = null;
  if (o.stun) { setState(p, "stun", 0.9); sfx.stun(); }
  else setState(p, "hurt", 0.35);
}

// The first solid floor under a point (not a shutter), if it's safe to stand on.
function floorUnder(x, y) {
  let best = null;
  for (const s of level.solids) {
    if (s.gate || s.kind === "gate" || x < s.x || x > s.x + s.w || s.y < y - 2) continue;
    if (!best || s.y < best.y) best = s;
  }
  if (!best) return null;
  const sec = sectionAt(x);
  if (sec.fallY && best.y >= sec.fallY) return null;
  return roomAt(x, best.y, STAND_H) ? { x, y: best.y } : null;
}

// Back to a checkpoint. One runner: the last one reached. Two players: the leader's latest one.
function respawn(p, reason) {
  if (typeof dogsRespawn === "function" && level) dogsRespawn();
  let cp, spot;
  const lead2 = twoPlayer ? leader() : p;
  if (twoPlayer) {
    // Back in next to whoever is in front: on the last safe ground they stood on, or their checkpoint.
    const lead = leader();
    cp = level.checkpoints[Math.max(lead.cp, p.cp)];
    if (lead !== p) {
      // Right where the leader stands, else their last safe ground if it's on screen, else their checkpoint.
      if (lead.ground && lead.ground.kind !== "gate" && lead.state !== "climb") spot = { x: lead.x, y: lead.y };
      else if (lead.safeNow && lead.safeNow.x > cp.x && lead.safeNow.x > cameraX + 60) spot = lead.safeNow;
      else spot = floorUnder(lead.x, lead.y);
    }
    p.records = Math.max(0, p.records - 2);
  } else {
    cp = level.checkpoints[p.cp];
    p.hearts = maxHearts(p);
  }
  // A lit shrine past the checkpoint holds your place.
  if (!twoPlayer && p.shrine && p.shrine.x > cp.x) spot = spot || p.shrine;
  spot = spot || cp;
  p.wipeouts += 1;
  p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0;
  p.ground = null; p.climb = null; p.move = null; p.knock = 0; p.boostTime = 0; p.fightWith = null; p.pounding = false; p.dash = 0; p.cpMissT = 0;
  p.cp = cp.index;
  p.invuln = INVULNERABLE + 0.6;
  p.lastSafe = { x: p.x, y: p.y };
  setState(p, "normal");
  sfx.fall();
  const who = twoPlayer ? playerName(p) + " " : "";
  const beside = twoPlayer && lead2 !== p ? "BACK IN BESIDE " + playerName(lead2) + " · -2 RECORDS" : twoPlayer ? "BACK IN AT THE CHECKPOINT · -2 RECORDS" : "BACK TO THE CHECKPOINT";
  showBanner(who + reason, beside, 1.6);
  // Back at a checkpoint the storm is pushed back behind you (a race respawn beside the leader leaves it be).
  if (!twoPlayer || players.every(o => o === p || o.finished)) {
    storm.front = p.x - m(14); storm.hold = 2;
    cameraX = Math.max(0, Math.min(level.width - W, p.x - W * 0.36));
  }
  // A moment before the next debris.
  storm.debris = storm.debris.filter(d => d.x > p.x + m(2));
  storm.nextThrow = Math.max(storm.nextThrow, runTime + 2.5);
  // Gates ahead of everyone open again.
  for (const s of level.solids) {
    if (s.gate && s.x > p.x && players.every(o => o.x < s.x)) { s.gate.closing = false; s.h = 6; }
  }
}

function fellOff(p) {
  if (twoPlayer) { respawn(p, "FELL"); return; }
  p.hearts -= 1;
  sfx.fall();
  rumble(0, 0.5, 300);
  if (p.hearts <= 0) { respawn(p, "WIPEOUT"); return; }
  p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0;
  p.ground = null; p.climb = null; p.move = null; p.knock = 0;
  p.invuln = INVULNERABLE;
  setState(p, "normal");
  // Back on the last safe spot: the storm gives you a few metres to get going again.
  if (mission.stormChase && storm.front > p.x - m(6)) { storm.front = p.x - m(6); storm.hold = Math.max(storm.hold, 1.5); }
}

let fightsShown = 0;
function vaultOverWarden(p) {
  const wd = p.fightWith;
  if (!wd) return false;
  const dir = Math.sign(wd.x - p.x) || p.facing;
  const landX = wd.x + dir * m(1.7);
  const floor = floorBelow(landX, p.y - m(0.6), true);
  if (!floor || Math.abs(floor.y - p.y) > m(0.7) || !roomAt(landX, floor.y, STAND_H) || !roomAt(wd.x, wd.y - m(2.1), SLIDE_H)) return false;
  p.fightWith = null;
  p.slipT = 1.1;
  p.facing = dir;
  wd.swingCd = Math.max(wd.swingCd, 0.6);
  wd.facing = -wd.facing;   // he spins round to find you
  startMove(p, "vault", landX, floor.y, 0.5, m(2.3));
  sfx.vault();
  return true;
}

function startMove(p, kind, x1, y1, seconds, lift) {
  p.move = { kind, x0: p.x, y0: p.y, x1, y1, t: 0, dur: seconds, lift: lift || 0 };
  p.vx = 0; p.vy = 0; p.ground = null; p.climb = null;
  setState(p, kind, seconds);
}

function tryVault(p, dir, auto) {
  // A low obstacle right in front: vault over it.
  // auto: running flat out into something small, he hops it on his own.
  const front = p.x + dir * (p.w / 2);
  for (const s of level.solids) {
    if (s.oneWay || s.kind === "ground" || s.kind === "roof" || s.gate) continue;
    const gap = dir > 0 ? s.x - front : front - (s.x + s.w);
    if (gap < -4 || gap > (auto ? m(1.15) : 34)) continue;
    if (auto && gap < m(0.35)) continue;   // too close to leap it cleanly: let the regular jump take it
    const rise = p.y - s.y;
    if (rise < m(0.3) || rise > m(auto ? AUTO_VAULT_MAX : 1.35) || s.w > m(2.4)) continue;
    if (s.y + s.h < p.y - 4) continue;   // floating: not something to vault
    const landX = dir > 0 ? s.x + s.w + p.w / 2 + (auto ? m(0.75) : 10) : s.x - p.w / 2 - (auto ? m(0.75) : 10);
    const floor = floorBelow(landX, p.y - m(0.4), false);
    if (!floor || floor.y > p.y + m(1.2)) continue;
    if (!roomAt(landX, floor.y, STAND_H) || !roomAt((p.x + landX) / 2, s.y - 2, SLIDE_H)) continue;
    // A leap: it carries him well past the obstacle, at running pace.
    const dist = Math.abs(landX - p.x);
    startMove(p, "vault", landX, floor.y, auto ? Math.max(0.42, dist / (RUN_SPEED * 1.05)) : 0.46, p.y - s.y + (auto ? m(0.55) : 22));
    sfx.vault();
    return true;
  }
  return false;
}

function tryMantle(p, dir) {
  // In the air, hands level with a ledge just in front: pull up onto it.
  if (p.vy < -280 * K) return false;
  const reach = p.x + dir * (p.w / 2 + 8);
  for (const s of level.solids) {
    if (s.gate || s.kind === "gatehouse") continue;
    const faceX = dir > 0 ? s.x : s.x + s.w;
    if (Math.abs(reach - faceX) > 12 && !(reach > s.x && reach < s.x + s.w)) continue;
    const top = s.y;
    if (top < p.y - p.h - m(0.45) || top > p.y - p.h * 0.45) continue;
    if (!s.oneWay && !(dir > 0 ? p.x < s.x : p.x > s.x + s.w)) continue;
    const landX = dir > 0 ? Math.max(s.x + p.w / 2 + 6, Math.min(s.x + s.w - p.w / 2, faceX + p.w / 2 + 14)) : Math.min(s.x + s.w - p.w / 2 - 6, faceX - p.w / 2 - 14);
    if (s.w < p.w * 0.6) continue;
    if (!roomAt(landX, top, STAND_H)) continue;
    startMove(p, "mantle", landX, top, 0.42, 0);
    return true;
  }
  return false;
}

function climbAt(p) {
  for (const c of level.climbs) {
    if (Math.abs(p.x - (c.x + c.side * (p.w / 2 + 1))) > 30) continue;
    if (p.y < c.top + 6 || p.y - p.h > c.bottom) continue;
    return c;
  }
  return null;
}

function finishClimb(p, c) {
  // At the top of a climb: pull up onto whatever is there.
  const landX = c.x - c.side * (p.w / 2 + 12);
  const floor = floorBelow(landX, c.top - 4, true);
  if (floor && Math.abs(floor.y - c.top) < 30 && roomAt(landX, floor.y, STAND_H)) {
    startMove(p, "mantle", landX, floor.y, 0.42, 0);
  } else {
    p.climb = null;
    setState(p, "normal");
    p.vy = -JUMP_SPEED * 0.6;
  }
}

function updatePlayer(p, i, dt) {
  const ctl = controlsFor(i);
  p.invuln = Math.max(0, p.invuln - dt);
  p.slipT = Math.max(0, (p.slipT || 0) - dt);
  p.flipTime = Math.max(0, p.flipTime - dt);
  p.boostTime = Math.max(0, p.boostTime - dt);
  p.comboT = Math.max(0, p.comboT - dt);
  p.wallT = Math.max(0, p.wallT - dt);
  p.kickT = Math.max(0, p.kickT - dt);
  p.animClock += dt;

  if (driveRewinding(p)) { p.jumpPressed = ctl.jump; return; }
  if (zipUpdate(p, ctl, dt)) return;

  const jumpDown = ctl.jump && !p.jumpPressed;
  const attackDown = ctl.attack && !p.attackPressed;
  const downDown = ctl.down && !p.downPressed;
  p.jumpPressed = ctl.jump; p.attackPressed = ctl.attack; p.downPressed = ctl.down;
  if (!ctl.jump) p.jumpHeld = false;

  if (p.finished) {
    p.vx = 0;
    p.state = "dance";
    return;
  }

  // Scripted moves: vault, mantle, takedown.
  if (p.move) {
    const mv = p.move;
    mv.t += dt;
    const k = Math.min(1, mv.t / mv.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    if (mv.kind === "mantle") {
      // up first, then over the edge
      const up = Math.min(1, k / 0.6), over = Math.max(0, (k - 0.35) / 0.65);
      p.y = mv.y0 + (mv.y1 - mv.y0) * (1 - Math.pow(1 - up, 2));
      p.x = mv.x0 + (mv.x1 - mv.x0) * over;
    } else {
      p.x = mv.x0 + (mv.x1 - mv.x0) * e;
      p.y = mv.y0 + (mv.y1 - mv.y0) * e - Math.sin(k * Math.PI) * mv.lift;
    }
    if (k >= 1) {
      p.move = null;
      p.ground = floorBelow(p.x, p.y + 2, true);
      p.y = p.ground ? p.ground.y : p.y;
      p.airJumps = airJumpsFor(p);
      setState(p, "normal");
    }
    return;
  }

  // Climbing.
  if (p.climb) {
    const c = p.climb;
    p.h = STAND_H;
    p.x += ((c.x + c.side * (p.w / 2 + 1)) - p.x) * Math.min(1, dt * 14);
    const awayDir = c.side;   // pushing away from the wall lets go
    const away = (awayDir < 0 && ctl.left) || (awayDir > 0 && ctl.right);
    const toward = (awayDir < 0 && ctl.right) || (awayDir > 0 && ctl.left);
    if (jumpDown && !ctl.up && away) {
      p.climb = null;
      p.vy = -JUMP_SPEED * 0.8; p.vx = 0;
      p.knock = 0.18; p.knockDir = awayDir;
      p.facing = awayDir;
      setState(p, "normal");
      sfx.jump();
      return;
    }
    let vy = 0;
    if (ctl.up || ctl.jump || toward) vy = -CLIMB_SPEED;
    else if (ctl.down) vy = CLIMB_SPEED * 1.2;
    p.y += vy * dt;
    p.climbing = vy !== 0;
    if (vy !== 0) { p.climbStep = (p.climbStep || 0) + Math.abs(vy) * dt; if (p.climbStep > m(0.55)) { p.climbStep = 0; sfx.climb(); } }
    if (p.y <= c.top + 6) { finishClimb(p, c); return; }
    if (p.y >= c.bottom) {
      p.y = c.bottom;
      const floor = floorBelow(p.x, p.y + 4, true);
      if (floor && Math.abs(floor.y - p.y) < 8) { p.climb = null; p.ground = floor; setState(p, "normal"); }
    }
    if (away && !ctl.up) { p.climb = null; setState(p, "normal"); p.vx = awayDir * 120 * K; }
    p.facing = -c.side;
    return;
  }

  // Timed states.
  if (p.stateT > 0) {
    p.stateT -= dt;
    if (p.stateT <= 0 && p.state !== "slide") setState(p, "normal");
  }
  const busy = p.state === "stun" || ATTACK_STATES.has(p.state) || (p.state === "pound" && p.ground);

  // In a fight: no running off and no jumping out of it.
  if (p.fightWith && (!p.fightWith.alive || Math.abs(p.fightWith.x - p.x) > m(FIGHT_RELEASE) || Math.abs(p.fightWith.y - p.y) > m(1.5))) p.fightWith = null;
  const fighting = !!p.fightWith && !!p.ground;

  // Crouch and slide.
  const onGround = !!p.ground;
  const speedNow = Math.abs(p.vx);
  if (p.state === "slide") {
    // Under something low he keeps his pace, so a long overhang is a quick slide, not a crawl.
    const underLow = !roomAt(p.x, p.y, STAND_H);
    p.vx = p.facing * (underLow ? Math.max(RUN_SPEED * 1.05, Math.abs(p.vx) - 200 * K * dt) : Math.max(RUN_SPEED * 0.55, Math.abs(p.vx) - 520 * K * dt));
    if (p.stateT <= 0) {
      // Under something low: keep sliding until there's room to get up.
      if (roomAt(p.x, p.y, STAND_H)) setState(p, "normal");
      else if (roomAt(p.x, p.y, CROUCH_H)) { setState(p, "normal"); p.crouch = true; }
      else p.stateT = 0.05;
    }
  } else if (onGround && downDown && speedNow > RUN_SPEED * 0.7 && !busy && !fighting) {
    const power = hasSkill(p, "power_slide");
    setState(p, "slide", power ? 0.95 : 0.62);
    p.vx = p.facing * Math.max(speedNow, RUN_SPEED) * (power ? 1.55 : 1.32);
    sfx.slide();
  }
  if (p.state !== "slide") {
    const wantCrouch = onGround && ctl.down && !busy;
    p.crouch = wantCrouch || (p.crouch && !roomAt(p.x, p.y, STAND_H));
  }
  p.h = p.state === "slide" ? SLIDE_H : p.crouch ? CROUCH_H : STAND_H;

  // Attacks. On the ground: punch, kick, then a finisher. In the air: the air dash.
  if (fighting && p.fightWith) p.facing = p.fightWith.x > p.x ? 1 : -1;
  if (attackDown && !busy && p.state !== "slide" && !p.climb) {
    if (!onGround) {
      if (hasSkill(p, "air_dash") && !p.dashUsed && !p.pounding) {
        p.dash = 0.24; p.dashUsed = true; p.vy = 0;
        setState(p, "dash", 0.36);
        sfx.dash(); burst(p.x, p.y - p.h / 2, "#f5b942", 10, 180);
      }
    } else if (!fighting && hasSkill(p, "flying_kick") && Math.abs(p.vx) >= RUN_SPEED * 0.95 && !p.crouch) {
      startAttack(p, "flykick");
    } else if (p.comboT > 0 && p.combo === 2) {
      startAttack(p, hasSkill(p, "spin_kick") ? "spinkick" : "finisher");
      p.combo = 0; p.comboT = 0;
    } else if (p.comboT > 0 && p.combo === 1) {
      startAttack(p, "kick");
      p.combo = 2; p.comboT = 0.55;
    } else {
      // From behind, before he knows you're there: a takedown.
      const back = hasSkill(p, "takedown") ? wardenInReach(p, m(1.4)) : null;
      if (back && back.windUp <= 0 && back.stagger <= 0 && back.facing === Math.sign(back.x - p.x) && p.fightWith !== back) startAttack(p, "takedown");
      else { startAttack(p, "punch"); p.combo = 1; p.comboT = 0.55; }
    }
  }
  // Hold HIT for the heavy smash.
  if (ctl.attack && onGround && hasSkill(p, "heavy_smash") && p.state !== "smash") {
    p.holdT += dt;
    if (p.holdT > 0.55 && !busy) { startAttack(p, "smash"); p.holdT = 0; }
  } else if (!ctl.attack) p.holdT = 0;
  if (ATTACK_STATES.has(p.state) && !p.hitDone) {
    const atk = ATTACKS[p.state];
    if (atk.dur - p.stateT >= atk.hit) {
      p.hitDone = true;
      landAttack(p, i, p.state, atk);
    }
  }

  // Horizontal movement.
  const prevX = p.x, prevY = p.y;
  if (p.knock > 0) {
    p.knock -= dt;
    p.vx = p.knockDir * 230 * K;
  } else if (p.dash > 0) {
    p.dash -= dt;
    p.vx = p.facing * RUN_SPEED * 2.3;
  } else if (p.pounding) {
    p.vx = 0;
  } else if (p.state === "flykick" && p.stateT > 0.18) {
    p.vx = p.facing * RUN_SPEED * 1.6;
  } else if (fighting) {
    // Squared up: Koda steps in to striking distance on his own and holds it.
    const gap = p.fightWith ? Math.abs(p.fightWith.x - p.x) : 0;
    p.vx = gap > m(1.05) ? p.facing * CROUCH_SPEED * 1.4 : p.vx * Math.max(0, 1 - dt * 14);
  } else if (p.state === "slide") {
    // keeps its own speed
  } else if (busy || p.state === "hurt") {
    p.vx *= Math.max(0, 1 - dt * 12);
  } else {
    let speed = p.crouch ? CROUCH_SPEED : RUN_SPEED * (p.boostTime > 0 ? BOOST_SPEED : 1);
    if (typeof fearCarry === "function") speed *= fearCarry(p);
    if (p.mudT > 0) speed *= 0.6;
    let want = 0;
    if (ctl.left) want -= speed;
    if (ctl.right) want += speed;
    p.vx = want;
  }
  if (p.vx !== 0 && p.knock <= 0 && p.state !== "slide") p.facing = p.vx > 0 ? 1 : -1;

  // Grab a climb: press up, or push into a wall that has one.
  if (!busy && p.knock <= 0 && !fighting) {
    const c = climbAt(p);
    if (c) {
      const toward = (c.side < 0 && ctl.right) || (c.side > 0 && ctl.left);
      const atWall = Math.abs(p.x - (c.x + c.side * (p.w / 2 + 1))) < 12;
      // Up grabs any climb. Pushing into a wall grabs the climb on it (so touch screens can climb too).
      if (ctl.up || (toward && c.wall && atWall)) {
        p.climb = c; p.crouch = false; p.vx = 0; p.vy = 0; p.ground = null; p.jumpBuffer = 0;
        setState(p, "climb");
        return;
      }
    }
  }

  // Vault a low obstacle, or jump.
  // Squared up, a jump vaults him clean over the enforcer and away.
  if (jumpDown && fighting && !busy && p.knock <= 0 && vaultOverWarden(p)) return;
  if (jumpDown && !fighting) p.jumpBuffer = JUMP_BUFFER; else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && onGround && !busy && Math.abs(p.vx) > 40 && p.state !== "slide") {
    if (tryVault(p, p.facing)) { p.jumpBuffer = 0; return; }
  }
  // Running flat out (not crouching) into a small obstacle: hop it automatically.
  if (onGround && !busy && !fighting && !p.crouch && p.state !== "slide" && p.knock <= 0 && Math.abs(p.vx) >= RUN_SPEED * 0.95) {
    if (tryVault(p, p.vx > 0 ? 1 : -1, true)) return;
  }

  p.x += p.vx * dt;
  p.x = Math.max(p.w / 2, Math.min(level.width - p.w / 2, p.x));
  const box0 = boxOf(p);
  for (const s of solidsNear(p.x - 60, p.x + 60)) {
    if (s.oneWay || !overlap(boxOf(p), s)) continue;
    if (prevX + p.w / 2 <= s.x + 0.5) { p.x = s.x - p.w / 2; if (!p.ground) { p.wallT = 0.18; p.wallDir = 1; } }
    else if (prevX - p.w / 2 >= s.x + s.w - 0.5) { p.x = s.x + s.w + p.w / 2; if (!p.ground) { p.wallT = 0.18; p.wallDir = -1; } }
  }
  void box0;

  // Vertical movement.
  if (p.dash > 0) p.vy = 0;
  else if (p.pounding) p.vy = Math.max(p.vy, 1500 * K);
  else p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL_SPEED);
  if (!ctl.jump && p.vy < -JUMP_CUT_SPEED && p.jumpHeld && p.knock <= 0) p.vy = -JUMP_CUT_SPEED;
  p.y += p.vy * dt;
  const wasGround = p.ground;
  p.ground = null;
  const dropThrough = ctl.down && jumpDown;
  for (const s of solidsNear(p.x - 60, p.x + 60)) {
    const b = boxOf(p);
    if (!overlap(b, s)) continue;
    const sPrevY = s.y - (s.dy || 0);
    if (p.vy >= 0 && prevY <= sPrevY + 1 + (s.oneWay ? 0 : 10)) {
      if (s.oneWay && (dropThrough || (wasGround === s && ctl.down && p.dropping))) continue;
      p.y = s.y; p.vy = 0; p.ground = s;
    } else if (s.oneWay) {
      continue;
    } else if (p.vy < 0 && prevY - p.h >= sPrevY + s.h - 10) {
      p.y = s.y + s.h + p.h; p.vy = 0;
    } else {
      p.x = p.x < s.x + s.w / 2 ? s.x - p.w / 2 : s.x + s.w + p.w / 2;
    }
  }
  if (dropThrough && wasGround && wasGround.oneWay) { p.y += 3; p.ground = null; p.coyote = 0; p.jumpBuffer = 0; p.vy = 60 * K; }
  if (p.ground && !wasGround && prevY < p.y - 0.5) { sfx.land(); burst(p.x, p.y, "#c9b79a", 5, 90); }
  // Footsteps: one per stride, the sound of whatever is underfoot.
  if (p.ground && wasGround && Math.abs(p.vx) > 40 && p.state !== "slide") {
    p.stride = (p.stride || 0) + Math.abs(p.vx) * dt;
    if (p.stride > m(p.crouch ? 0.55 : 0.85)) {
      p.stride = 0;
      const k = p.ground.kind;
      const surface = p.mudT > 0 ? "wet" : (k === "catwalk" || k === "carriage" || k === "container" || k === "glass" || k === "grate" || k === "vent" || k === "flicker" || k === "turnflat" || k === "broken") ? "metal" : k === "garden" ? "soft" : "stone";
      sfx.step(surface);
    }
  } else if (!p.ground) p.stride = m(0.6);
  if (p.ground) p.dashUsed = false;
  if (p.ground && p.pounding) groundPoundLand(p, i);
  // Ground pound: press down in the air.
  if (!p.ground && downDown && hasSkill(p, "ground_pound") && !p.pounding && !p.climb && p.dash <= 0 && p.vy > -JUMP_SPEED * 0.6) {
    p.pounding = true; p.vy = 1500 * K; setState(p, "pound", 9);
    sfx.whiff();
  }
  if (p.ground && !wasGround && p.vy === 0 && prevY + 40 < p.y) shake = Math.max(shake, 0.06);

  // Mantle onto a ledge, from the air.
  if (!p.ground && !busy && p.knock <= 0 && (ctl.left || ctl.right || ctl.up)) {
    const dir = ctl.right ? 1 : ctl.left ? -1 : p.facing;
    if (tryMantle(p, dir)) return;
  }

  // Coyote time, buffered jumps and the double jump.
  if (p.ground) p.coyote = COYOTE_TIME; else p.coyote = Math.max(0, p.coyote - dt);
  if (p.ground) p.airJumps = airJumpsFor(p);
  if (p.jumpBuffer > 0 && p.coyote > 0 && !busy) {
    if (p.crouch && !roomAt(p.x, p.y, STAND_H)) {
      p.jumpBuffer = 0;
    } else {
      p.vy = -JUMP_SPEED; p.ground = null; p.coyote = 0; p.jumpBuffer = 0; p.jumpHeld = true;
      p.crouch = false; if (p.state === "slide") setState(p, "normal");
      sfx.jump();
    }
  } else if (p.jumpBuffer > 0 && !p.ground && p.wallT > 0 && hasSkill(p, "wall_kick") && !busy) {
    // Kick off the wall: straight back up, facing away, with the air jumps back.
    p.vy = -JUMP_SPEED * 0.98; p.knock = 0.16; p.knockDir = -p.wallDir; p.facing = -p.wallDir;
    p.airJumps = airJumpsFor(p); p.jumpBuffer = 0; p.jumpHeld = true; p.wallT = 0; p.kickT = 0.45;
    sfx.jump(); burst(p.x + p.wallDir * p.w / 2, p.y - p.h / 2, "#f5b942", 8, 150);
  } else if (p.jumpBuffer > 0 && !p.ground && p.airJumps > 0 && p.knock <= 0 && !busy) {
    p.vy = -DOUBLE_JUMP_SPEED; p.airJumps -= 1; p.jumpBuffer = 0; p.jumpHeld = true;
    p.flipTime = 0.45;
    sfx.doubleJump();
    burst(p.x, p.y, "#f1ca78", 8, 140);
  }

  // Run cycle follows the distance covered.
  if (p.ground && p.vx !== 0) p.runPhase += Math.abs(p.vx) / K * dt * 0.05;

  // Mud slows you down.
  p.mudT = 0;
  if (p.ground && p.ground.kind === "ground" && level.mud.some(mu => p.x > mu.x && p.x < mu.x + mu.w)) {
    p.mudT = 1;
    if (Math.abs(p.vx) > 0 && Math.random() < dt * 14) burst(p.x - p.facing * 10, p.y, "#5b4630", 2, 70);
  }

  // A safe spot to come back to after a fall (and, in a race, where the other runner comes back in).
  if (p.ground && !p.ground.oneWay && p.ground.kind !== "gate") {
    const sec = sectionAt(p.x);
    const safe = (!sec.fallY || p.y < sec.fallY) && roomAt(p.x, p.y, STAND_H);
    if (safe) {
      p.safeNow = { x: p.x, y: p.y }; if (!wasGround) p.lastSafe = { x: p.x, y: p.y };
      if (p === leader() && (!trail.length || songClock - trail[trail.length - 1].t > 0.2)) {
        trail.push({ t: songClock, x: p.x, y: p.y });
        if (trail.length > 1200) trail.splice(0, trail.length - 1200);
      }
    }
  }

  // Falling off the roofs, or out of the world.
  const sec = sectionAt(p.x);
  if ((sec.fallY !== null && p.y > sec.fallY + 4) || p.y > m(6)) fellOff(p);
}


/* ---------------------------------------------------------------------------
   ENFORCERS
   Street Wardens walk their beat and swing at you when you get close.
   Touch one and it hurts. Jump on him, or hit him, to knock him out.
--------------------------------------------------------------------------- */

function knockOutWarden(wd, p) {
  wd.alive = false; wd.state = "ko"; wd.animT = 0; wd.windUp = 0;
  p.kos += 1;
  for (const o of players) if (o.fightWith === wd) o.fightWith = null;
  if (!players.some(o => o.fightWith)) showBanner("K.O.", "", 0.9);
  showToast("KNOCKOUT", "+" + SCORING.rpPerKnockout + " RP", "ko");
  sfx.knockout();
  burst(wd.x, wd.y - m(1), "#ffd27a", 14, 220);
}

function wardenInReach(p, reach) {
  let best = null;
  for (const wd of level.wardens) {
    if (!wd.alive || Math.abs(wd.y - p.y) > 40) continue;
    const dx = wd.x - p.x;
    if (Math.sign(dx) !== p.facing && Math.abs(dx) > 10) continue;
    if (Math.abs(dx) > reach) continue;
    if (!best || Math.abs(dx) < Math.abs(best.x - p.x)) best = wd;
  }
  return best;
}

function startAttack(p, kind) {
  const atk = ATTACKS[kind];
  setState(p, kind, atk.dur);
  p.hitDone = false;
  if (kind === "flykick") { p.vy = -JUMP_SPEED * 0.35; p.ground = null; }
  sfx.swing();
}

// Every warden an attack reaches: the nearest in front, or everyone around for the big ones.
function wardensHit(p, atk) {
  const reach = m(atk.reach), out = [];
  for (const wd of level.wardens) {
    if (!wd.alive || Math.abs(wd.y - p.y) > m(1.2)) continue;
    const dx = wd.x - p.x;
    if (Math.abs(dx) > reach) continue;
    if (!atk.all && Math.sign(dx) !== p.facing && Math.abs(dx) > 10) continue;
    out.push(wd);
  }
  if (!atk.all) out.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  return atk.all ? out : out.slice(0, 1);
}

function landAttack(p, i, kind, atk) {
  const targets = wardensHit(p, atk);
  let hit = false;
  for (const wd of targets) { damageWarden(wd, p, kind === "takedown" ? 99 : atk.dmg, kind); hit = true; }
  // The big ones take drones out of the air too.
  if (atk.all || kind === "flykick") {
    for (const dr of level.drones) {
      if (!dr.alive || Math.hypot(dr.x - p.x, dr.y - (p.y - m(1))) > m(atk.reach + 0.6)) continue;
      downDrone(dr, p); hit = true;
    }
  }
  if (atk.shock) {
    shake = Math.max(shake, 0.4);
    burst(p.x + p.facing * m(0.8), p.y, "#ffd27a", 26, 320);
    storm.debris = storm.debris.filter(d => Math.abs(d.x - p.x) > m(atk.shock));
    for (const wd of level.wardens) if (wd.alive && Math.abs(wd.x - p.x) < m(atk.shock) && Math.abs(wd.y - p.y) < m(1.2)) { wd.stagger = 0.9; wd.windUp = 0; wd.state = "hit"; }
  }
  if (hit) { rumble(i, kind === "smash" ? 0.8 : 0.4, kind === "smash" ? 220 : 90); if (kind === "takedown") showToast("TAKEDOWN", "+" + SCORING.rpPerKnockout + " RP", "ko"); }
  else sfx.whiff();
}

function damageWarden(wd, p, dmg, kind) {
  if (!wd.alive) return;
  const ek = enemyKind(wd);
  const heavy = kind === "finisher" || kind === "spinkick" || kind === "smash" || kind === "flykick" || kind === "takedown";
  // Up with his guard: the hit is blocked and he swings straight back.
  if (wd.guardT > 0 && !heavy) {
    sfx.block(); burst(wd.x - Math.sign(wd.x - p.x) * m(0.3), wd.y - m(1.2), "#9fd8ff", 10, 180);
    shake = Math.max(shake, 0.08);
    wd.guardT = 0; wd.hitsInRow = 0;
    wd.windUp = ek.counter; wd.swingCd = ek.cd; wd.state = "punch"; wd.facing = p.x > wd.x ? 1 : -1;
    showToast("BLOCKED", "Wait for his swing, then hit back.", "", 1.1);
    return;
  }
  wd.hp -= heavy && kind !== "takedown" ? Math.max(dmg, 2) : dmg;
  wd.hitsInRow = runTime - wd.lastHitT < 1.3 ? wd.hitsInRow + 1 : 1; wd.lastHitT = runTime;
  // Light hits don't stop a swing that's already coming; the big ones do.
  if (heavy) { wd.windUp = 0; wd.punchT = 0; }
  wd.swingCd = Math.max(wd.swingCd, heavy ? 0.6 : 0.25);
  hitStop = heavy ? 0.09 : 0.05;
  sfx.punch(kind);
  burst(wd.x, wd.y - m(1.1), "#fff1c4", 8, 200);
  shake = Math.max(shake, 0.12);
  if (wd.hp <= 0) { knockOutWarden(wd, p); return; }
  wd.stagger = heavy ? 0.42 : 0.2; wd.state = "hit"; wd.animT = 0;
  // Two clean hits in a row and he gets his guard up.
  if (wd.hitsInRow >= 2 && Math.random() < ek.guard) wd.guardT = 0.9;
  const push = Math.sign(wd.x - p.x) * m(0.2);
  wd.x = Math.max(wd.minX, Math.min(wd.maxX, wd.x + push));
  if (p.ground) p.fightWith = wd;
}

function downDrone(dr, p) {
  dr.alive = false; p.kos += 1;
  sfx.drone();
  burst(dr.x, dr.y, "#7fe3ff", 20, 260);
  burst(dr.x, dr.y, "#ffb347", 12, 200);
  showToast("DRONE DOWN", "+" + SCORING.rpPerKnockout + " RP", "ko");
}

// Landing a ground pound: everyone close is knocked flat.
function groundPoundLand(p, i) {
  p.pounding = false;
  setState(p, "pound", 0.35);
  shake = Math.max(shake, 0.45);
  sfx.pound();
  rumble(i, 0.9, 260);
  burst(p.x, p.y, "#ffd27a", 30, 340);
  for (const wd of level.wardens) if (wd.alive && Math.abs(wd.x - p.x) < m(2.4) && Math.abs(wd.y - p.y) < m(1)) damageWarden(wd, p, 3, "pound");
  for (const dr of level.drones) if (dr.alive && Math.abs(dr.x - p.x) < m(2.4) && dr.y > p.y - m(2.2)) downDrone(dr, p);
}

function updateWardens(dt) {
  for (const wd of level.wardens) {
    wd.animT += dt;
    if (!wd.alive) continue;
    if (Math.abs(wd.x - cameraX - W / 2) > W * 1.4) continue;

    // Who is close?
    let near = null;
    for (const p of players) {
      if (p.finished || Math.abs(p.y - wd.y) > m(1)) continue;
      if (!near || Math.abs(p.x - wd.x) < Math.abs(near.x - wd.x)) near = p;
    }
    const d = near ? Math.abs(near.x - wd.x) : Infinity;

    wd.punchT = Math.max(0, wd.punchT - dt);
    wd.swingCd = Math.max(0, wd.swingCd - dt);
    wd.guardT = Math.max(0, wd.guardT - dt);
    const ek = enemyKind(wd);
    // Rocked by a hit: nothing else this moment.
    if (wd.stagger > 0) { wd.stagger -= dt; wd.state = "hit"; wd.followT = 0; continue; }
    if (wardenStealth(wd, dt)) { if (!wd.alive) continue; }
    if (!wd.alive) continue;
    // An elite's second swing: a shorter tell straight after the first.
    if (wd.followT > 0) {
      wd.followT -= dt;
      if (wd.followT <= 0 && wd.windUp <= 0) { wd.windUp = Math.max(0.28, ek.windUp); wd.state = "punch"; wd.animT = 0; }
    }
    // Somebody on foot comes close: it's a fight.
    if (near && d < m(FIGHT_RANGE) && near.ground && !near.fightWith && near.state !== "slide" && !near.pounding && wd.aware && !(near.slipT > 0)) {
      near.fightWith = wd;
      wd.facing = near.x > wd.x ? 1 : -1;
      wd.swingCd = Math.max(wd.swingCd, 0.3);
      fightsShown += 1;
      const tierHint = ek.tier === 2 ? "ELITE · HE SWINGS TWICE · WAIT FOR THE SECOND ONE" : ek.tier === 1 ? "VETERAN · QUICKER SWINGS · ONE MORE HIT TO DROP HIM" : "";
      if (fightsShown === 1 && tierHint) showBanner("FIGHT", tierHint, 2.2);
      else showBanner("FIGHT", fightsShown <= 3 ? "HIT TO TAKE HIM DOWN · JUMP TO VAULT OVER HIM" : "", fightsShown <= 3 ? 1.8 : 0.8);
      sfx.fight();
    }
    const engaged = players.find(o => o.fightWith === wd);
    if (engaged && wd.windUp <= 0 && wd.punchT <= 0 && wd.swingCd > 0) {
      wd.facing = engaged.x > wd.x ? 1 : -1;
      wd.state = "fight_idle";
      if (wd.swingCd > 0) { /* squaring up */ }
    }
    if (wd.windUp > 0) {
      // the swing is coming: he glows red
      wd.windUp -= dt;
      wd.state = "punch";
      if (wd.windUp <= 0) {
        wd.punchT = 0.3; wd.animT = 0;
        if (near && d < m(1.45) && Math.sign(near.x - wd.x) === wd.facing) {
          hurtPlayer(near, wd.x, ek.stun ? { stun: true } : {});
          // a stunning swing gives you a moment to get up before the next one
          if (ek.stun) { wd.swingCd = Math.max(wd.swingCd, 1.7); wd.combo = true; }
          // shoved back a step: the fight carries on
          near.knock = 0.18; near.knockDir = near.x < wd.x ? -1 : 1;
          hitStop = 0.06;
        }
        if (!wd.combo && ek.combo && engaged && Math.random() < ek.combo) { wd.combo = true; wd.followT = 0.4; }
        else wd.combo = false;
      }
    } else if (near && d < m(1.6) && wd.swingCd <= 0 && wd.aware) {
      wd.facing = near.x > wd.x ? 1 : -1;
      wd.windUp = ek.windUp; wd.swingCd = engaged ? ek.cd : 1.4; wd.animT = 0;
      if (engaged) { const step = Math.sign(near.x - wd.x) * m(0.25); const nx = wd.x + step; if (nx > wd.minX - m(1.5) && nx < wd.maxX + m(1.5)) wd.x = nx; }
    } else if (engaged) {
      // squared up, waiting for his moment
    } else if (wd.punchT <= 0 && wd.state !== "run" && wd.still) {
      // A checkpoint guard holds his post and looks one way, then the other.
      wd.state = "idle";
      if (Math.abs(wd.x - wd.home) > m(0.3)) { const dir = Math.sign(wd.home - wd.x); wd.x += dir * m(ek.speed) * dt; wd.facing = dir; wd.state = "walk"; wd.walkPhase += m(1.3) * dt; }
      else { wd.lookT += dt; if (wd.lookT > 3.2) { wd.lookT = 0; wd.facing = -wd.facing; } }
    } else if (wd.punchT <= 0 && wd.state !== "run") {
      wd.state = "walk";
      const nx = wd.x + wd.facing * m(ek.speed) * (typeof wadeFactor === "function" ? wadeFactor(wd) : 1) * dt;
      if (nx > wd.maxX || nx < wd.minX) wd.facing = -wd.facing;
      else { wd.x = nx; wd.walkPhase += m(1.3) * dt; }
    }

    for (const p of players) {
      if (p.finished || p.slipT > 0) continue;
      const pb = boxOf(p);
      const wb = { x: wd.x - m(0.3), y: wd.y - m(1.75), w: m(0.6), h: m(1.75) };
      if (!overlap(pb, wb)) continue;
      // Landed on his head: knocked out.
      if (p.vy > 60 && p.y < wd.y - m(1.3)) {
        knockOutWarden(wd, p);
        p.vy = -STOMP_BOUNCE; p.airJumps = airJumpsFor(p);
        break;
      }
      // A power slide takes his legs out.
      if (p.state === "slide" && hasSkill(p, "power_slide")) { knockOutWarden(wd, p); break; }
      // Brushing past one who hasn't seen him wakes him up.
      if (!wd.aware && stealthOn()) { wd.aware = 1; wd.target = p; wd.facing = p.x > wd.x ? 1 : -1; spotted(wd, p); }
      // On foot you square up rather than run through him; in the air you bounce off him.
      if (p.ground && !p.pounding) {
        p.fightWith = wd;
        p.x = wd.x - Math.sign(wd.x - p.x || -p.facing) * (m(0.3) + p.w / 2 + 2);
        continue;
      }
      hurtPlayer(p, wd.x, {});
    }
  }
}

/* ---------------------------------------------------------------------------
   SCANNER DRONES
   They sweep back and forth over the roofs. Touch one and it hurts; jump on it.
--------------------------------------------------------------------------- */

function updateDrones(dt) {
  for (const dr of level.drones) {
    if (!dr.alive) continue;
    dr.t += dt;
    dr.x += dr.facing * m(1.8) * dt;
    if (dr.x > dr.maxX) dr.facing = -1;
    if (dr.x < dr.minX) dr.facing = 1;
    dr.y = dr.baseY + Math.sin(dr.t * 2.2) * m(0.9);
    for (const p of players) {
      if (p.finished) continue;
      const db = { x: dr.x - m(0.65), y: dr.y - m(0.35), w: m(1.3), h: m(0.6) };
      if (!overlap(boxOf(p), db)) continue;
      if (p.vy > 40 && p.y < dr.y) {
        downDrone(dr, p);
        p.vy = -STOMP_BOUNCE; p.airJumps = airJumpsFor(p);
        break;
      }
      hurtPlayer(p, dr.x, {});
    }
  }
}

/* ---------------------------------------------------------------------------
   THE STORM
   On the choruses the storm hits: the sky darkens, lightning strikes on the
   "Me against the storm" lines, and the wind throws debris across the roofs.
   Jump the low pieces, duck or slide under the high ones.
--------------------------------------------------------------------------- */

const DEBRIS_LOW = ["crate", "barrel", "crate_half", "vent", "crate"];
const DEBRIS_HIGH = ["pipe", "grate", "pipe", "grate", "pipe"];

function updateStorm(dt, realDt) {
  const partIndex = playingPartIndex();
  const part = mission.parts[partIndex];
  const target = part && part.storm ? 1 : 0;
  storm.strength += (target - storm.strength) * Math.min(1, realDt * 0.8);
  const lead = leader();
  const indoors = sectionAt(lead.x).world === "ve";
  if (mission.stormChase) updateStormFront(dt, part, partIndex, lead);

  // Debris across the screen while the storm is on.
  const brawling = players.some(o => o.fightWith && !o.finished);   // nothing thrown at you while you're locked in a fight
  if (storm.strength > 0.6 && !indoors && runTime >= storm.nextThrow && !lead.climb && !brawling) {
    const low = Math.random() < 0.55;
    const floor = lead.ground ? lead.ground.y : lead.y;
    storm.debris.push({
      low, art: (low ? DEBRIS_LOW : DEBRIS_HIGH)[Math.floor(Math.random() * 5)],
      x: Math.max(storm.front, cameraX - m(2)), y: floor - (low ? m(0.36) : m(1.56)), half: low ? m(0.32) : m(0.17),
      size: low ? m(0.72) : m(1.5), rot: Math.random() * 6, hit: [], trail: []
    });
    const every = mission.debrisEvery || 1.6;   // seconds between throws (plus up to 1.4 more at random)
    storm.nextThrow = runTime + every + Math.random() * 1.4;
    sfx.debris();
  }
  for (let i = storm.debris.length - 1; i >= 0; i--) {
    const d = storm.debris[i];
    d.x += (RUN_SPEED * 1.9) * dt;
    d.rot += (d.low ? -9 : -3.5) * dt;
    d.trail.push({ x: d.x, y: d.y });
    if (d.trail.length > 10) d.trail.shift();
    for (const p of players) {
      if (p.finished || d.hit.includes(p.id) || p.invuln > 0) continue;
      if (Math.abs(p.x - d.x) < m(0.5) + p.w / 2 && p.y > d.y - d.half && p.y - p.h < d.y + d.half) {
        d.hit.push(p.id);
        hurtPlayer(p, d.x - 100, {});
        burst(d.x, d.y, "#ff9a3c", 16, 240);
      }
    }
    if (d.x > cameraX + W + 200) storm.debris.splice(i, 1);
  }

  // Lightning on the chorus lines, and now and then while the storm is on.
  const strikes = mission.lightning || [];
  while (storm.lyricIndex < strikes.length && strikes[storm.lyricIndex] < songClock - 1) storm.lyricIndex++;
  if (storm.lyricIndex > 0 && strikes[storm.lyricIndex - 1] > songClock + 1) storm.lyricIndex = 0;
  if (storm.lyricIndex < strikes.length && songClock >= strikes[storm.lyricIndex]) {
    storm.lyricIndex++;
    if (!indoors) triggerLightning(true);
  }
  if (storm.strength > 0.5 && !indoors) {
    storm.nextFlash -= realDt;
    if (storm.nextFlash <= 0) { triggerLightning(false); storm.nextFlash = 3.5 + Math.random() * 4.5; }
  }
}

function triggerLightning(big) {
  flash = big ? 0.8 : 0.5;
  setTimeout(() => { flash = Math.max(flash, big ? 0.65 : 0.35); }, 120);
  const x = W * (0.1 + Math.random() * 0.8);
  const pts = [];
  let px = x, py = -10;
  const bottom = H * (0.4 + Math.random() * 0.3);
  while (py < bottom) { pts.push([px, py]); px += (Math.random() - 0.5) * 70; py += 24 + Math.random() * 30; }
  pts.push([px, bottom]);
  const from = pts[Math.floor(pts.length / 2)];
  const branch = [from];
  let bx = from[0], by = from[1];
  for (let i = 0; i < 5; i++) { bx += 20 + Math.random() * 30; by += 20 + Math.random() * 20; branch.push([bx, by]); }
  lightningBolt = { pts, branch, t: 0.3 };
  setTimeout(() => sfx.thunder(big), big ? 120 : 500 + Math.random() * 600);
  if (big) shake = Math.max(shake, 0.15);
}

/* ---------------------------------------------------------------------------
   CHECKPOINTS ON THE BEAT
   Each part of the song ends at a checkpoint. Reach it before the next part
   starts. Miss it and the game taunts you, then sends you back to the start
   of that part with the song rewound to match.
--------------------------------------------------------------------------- */

function updateDeadline() {
  if (taunt || freeRoam) return;
  const idx = currentPartIndex();
  const part = mission.parts[idx];
  const lead = leader();
  if (lead.cp > mission.parts.length - 1 || lead.finished) return;
  // In a race, once someone is home the finish window is the only clock.
  if (twoPlayer && players.some(o => o.finished)) return;
  if (songClock >= part.end - 0.02) missCheckpoint(idx);
}

function missCheckpoint(idx) {
  misses += 1;
  const lines = mission.taunts || ["TOO SLOW."];
  taunt = { text: lines[Math.floor(Math.random() * lines.length)], part: idx, t: TAUNT_SECONDS };
  songAudio.pause();
  sfx.taunt();
  shake = Math.max(shake, 0.3);
  for (const p of players) rumble(p.id - 1, 0.8, 400);
}

function updateTaunt(realDt) {
  taunt.t -= realDt;
  if (taunt.t > 0) return;
  // The song takes you back 15 seconds, and you go back to where you were then.
  const part = mission.parts[taunt.part];
  const cp = level.checkpoints[taunt.part];   // the checkpoint where this part began
  const back = Math.max(part.start, songClock - REWIND_ON_MISS);
  let spot = null;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i].t <= back + 0.01 && trail[i].x >= cp.x - 2) { spot = trail[i]; break; }
  }
  trail = trail.filter(e => e.t <= back);
  const to = spot || cp;
  if (inward.active) endInward(true);
  for (const p of players) {
    p.x = to.x - (p.id - 1) * 30; p.y = to.y; p.vx = 0; p.vy = 0;
    p.ground = null; p.climb = null; p.move = null; p.knock = 0; p.boostTime = 0;
    p.cp = Math.min(p.cp, taunt.part);
    p.hearts = maxHearts(p); p.invuln = 1; p.fightWith = null; p.shield = hasSkill(p, "storm_shield");
    setState(p, "normal");
  }
  // Shutters ahead open again.
  for (const s of level.solids) if (s.gate && s.x > to.x) { s.gate.closing = false; s.h = 6; }
  storm.debris = [];
  storm.front = to.x - m(14); storm.hold = 2;
  cameraX = Math.max(0, Math.min(level.width - W, to.x - W * 0.36));
  sfx.rewindSweep(mission.song.src, songClock, songClock - back);
  seekSong(back);
  taunt = null;
  showBanner("15 SECONDS BACK", "RUN IT AGAIN. BEAT THE " + part.name + ".", 2);
  if (soundOn) songAudio.play().then(() => { musicBlocked = false; }).catch(() => { musicBlocked = true; });
}

// The storm front: a wall of weather behind the runners that keeps coming.
function updateStormFront(dt, part, partIndex, lead) {
  storm.roll += dt;
  if (freeRoam) { storm.front = Math.min(storm.front, cameraX - W); return; }
  const pace = partIndex === 0 ? STORM_PACE.intro : part && part.storm ? STORM_PACE.chorus : STORM_PACE.verse;
  // Climbing a pipe still counts as getting away: it slows right down while you climb.
  const climbing = lead.climb ? 0.2 : 1;
  // While you're locked in a fight it holds its ground (still right there at the edge).
  const fightingNow = players.some(o => o.fightWith && !o.finished);
  if (storm.hold > 0) storm.hold -= dt;
  else if (!fightingNow) storm.front += m(pace) * climbing * dt;
  // Never out of the left of the picture: run all you like, it's right there
  // (but never dragged past the runner in front).
  const edge = Math.min(cameraX + 90, lead.x - m(3.4));
  if (storm.front < edge - W) storm.front = cameraX - m(6);   // way behind: bring it to just off screen
  if (storm.front < edge) storm.front = Math.min(edge, storm.front + RUN_SPEED * BOOST_SPEED * 1.15 * dt);   // rolls in and keeps up
  // Shelters keep it out.
  for (const sh of mission.shelters || []) {
    const a = m(sh.from), b = m(sh.to);
    if (lead.x > a - m(1) && lead.x < b && storm.front > a - m(0.5)) storm.front = Math.min(storm.front, a - m(0.5));
  }
  storm.front = Math.min(storm.front, level.goal.x - m(3));
  // Caught by it.
  for (const p of players) {
    if (p.finished || p.invuln > 0 || p.move) continue;
    if (p.x - p.w / 2 > storm.front + m(0.15)) continue;
    stormHit(p);
  }
}

function stormHit(p) {
  storm.hold = STORM_HOLD;
  if (p.shield) {
    p.shield = false; p.invuln = INVULNERABLE;
    burst(p.x, p.y - p.h / 2, "#7fe3ff", 24, 280); sfx.shield();
    showToast("STORM SHIELD", "It took the hit. It's back at the next checkpoint.", "", 2);
    return;
  }
  if (twoPlayer) {
    // Racing: caught runners come straight back in beside the leader, two records down.
    triggerLightning(true);
    const lead = leader();
    if (lead === p) {
      const other = players.find(o => o !== p && !o.finished);
      if (other && other.x > storm.front + m(1)) { respawn(p, "THE STORM GOT YOU"); return; }
      // the leader himself: back to his checkpoint, storm pushed back behind him
      p.invuln = 0; respawn(p, "THE STORM GOT YOU");
      storm.front = p.x - m(14); storm.hold = 2;
      return;
    }
    respawn(p, "THE STORM GOT YOU");
    return;
  }
  triggerLightning(true);
  burst(p.x, p.y - p.h / 2, "#b58cff", 18, 260);
  if (p.climb) {
    // On a pipe: it batters you but you hang on.
    sfx.hurt(); shake = Math.max(shake, 0.3); rumble(p.id - 1, 0.8, 260);
    if (!twoPlayer) { p.hearts -= 1; if (p.hearts <= 0) { respawn(p, "THE STORM GOT YOU"); return; } }
    p.invuln = INVULNERABLE;
    showToast("THE STORM CAUGHT YOU", "Keep climbing. It doesn't stop.", "", 2);
    return;
  }
  if (!twoPlayer && p.hearts <= 1) { p.hearts = 0; respawn(p, "THE STORM GOT YOU"); return; }
  hurtPlayer(p, storm.front - 200, {});
  p.knock = 0; p.vx = 0;   // battered, not thrown: never knocked off a roof by it
}

/* ---------------------------------------------------------------------------
   PICKUPS, CHECKPOINTS AND THE GOAL
--------------------------------------------------------------------------- */

function updatePickups(dt) {
  for (const p of players) {
    if (p.finished) continue;
    const box = boxOf(p);
    const near = (it, r) => Math.abs(it.x - p.x) < 80 && overlap(box, { x: it.x - r, y: it.y - r, w: r * 2, h: r * 2 });

    if (hasSkill(p, "record_magnet")) {
      for (const r of level.records) {
        if (r.taken || Math.abs(r.x - p.x) > m(2.6) || Math.abs(r.y - (p.y - p.h / 2)) > m(2.6)) continue;
        r.x += (p.x - r.x) * 0.18; r.y += ((p.y - p.h / 2) - r.y) * 0.18;
      }
    }
    for (const r of level.records) if (!r.taken && near(r, 14)) { r.taken = true; p.records += 1; sfx.record(); }
    for (const g of level.gems || []) {
      if (g.taken || !near(g, 22)) continue;
      g.taken = true; p.gems = (p.gems || 0) + 1; sfx.coin(); flash = Math.max(flash, 0.3);
      burst(g.x, g.y, "#9ff7ff", 26, 260); burst(g.x, g.y, "#ffd46a", 14, 200);
      showBanner("HIDDEN GEM", p.gems + " OF " + level.gems.length + " FOUND", 2.4);
    }
    for (const n of level.notes) {
      if (n.taken || !near(n, 16)) continue;
      n.taken = true;
      p.notes[n.tier] += 1;
      sfx.note(n.tier);
      const s = SCORING.notes[n.tier];
      floatText(n.x, n.y - 20, "+" + s.xp + " XP", n.tier === "high" ? "#ffd46a" : n.tier === "mid" ? "#7fe3ff" : "#f4f0e8");
      if (n.tier !== "low") burst(n.x, n.y, n.tier === "high" ? "#ffd46a" : "#7fe3ff", 10, 160);
    }
    if (level.coin && !level.coin.taken && near(level.coin, 22)) {
      level.coin.taken = true; p.coin = true; sfx.coin();
      openReading("coin", { kind: "The F.I.L.L. coin", title: "\"I found a coin in the pouring rain\"", text: "The coin is yours to keep. Every coin you find counts towards money off the album on Feelz Machine." });
      burst(level.coin.x, level.coin.y, "#ffd46a", 20, 220);
    }
    for (const j of level.journal) {
      if (j.taken || !near(j, 20)) continue;
      j.taken = true; p.journal.push(j.id); sfx.journal(); sfx.page();
      const entry = (mission.journalText || {})[j.id] || { kind: "Journal", title: j.id, text: "" };
      openReading(j.id, entry);
    }
    for (const b of level.boosts) {
      if (b.taken || !near(b, 20)) continue;
      b.taken = true; p.boostTime = BOOST_SECONDS * (hasSkill(p, "long_boost") ? 1.6 : 1);
      showBanner("FEELZ BOOST", "", 1.2); sfx.boost(); rumble(p.id - 1, 0.35, 150);
      burst(b.x, b.y, "#7fe3ff", 18, 220);
    }
    for (const r of level.rewinds) {
      if (r.taken || !near(r, 20)) continue;
      r.taken = true;
      rewindsUsed += 1;
      sfx.rewindSweep(mission.song.src, songClock, REWIND_SECONDS);
      seekSong(Math.max(0, songClock - REWIND_SECONDS));
      rewindFx = 0.8;
      showBanner("TIME REWIND", "-" + REWIND_SECONDS + "s ON THE SONG", 1.8);
      sfx.rewind();
      burst(r.x, r.y, "#ff5ad8", 22, 240);
    }
    // Checkpoints: reach the next one before its part of the song ends.
    const next = level.checkpoints[p.cp + 1];
    if (next && !next.finish && p.ground && p.x >= next.x && p.x < next.x + m(6) && Math.abs(p.y - next.y) < m(2.5)) { reachCheckpoint(p, next); p.cpMissT = 0; }
    // Ran past a checkpoint without touching it (over it, under it): 15 seconds to go back and touch the post.
    // The rival is credited as it passes.
    else if (next && !next.finish && p.x > next.x + m(1.5)) {
      if ((aiRival && p.id === 2) || freeRoam) reachCheckpoint(p, next);
      else if (Math.abs(p.x - next.x) < m(1.2) && p.y > next.y - m(3.2) && p.y < next.y + m(0.6)) { reachCheckpoint(p, next); p.cpMissT = 0; showToast("CHECKPOINT", "Back on track.", "ko", 1.2); }
      else {
        if (!p.cpMissT) { p.cpMissT = 15; sfx.alert && sfx.alert(); showBanner("YOU MISSED THE CHECKPOINT", "GO BACK AND TOUCH IT", 2.2); }
        p.cpMissT = Math.max(0.0001, p.cpMissT - dt);
        if (p.cpMissT <= 0.0001) { p.cpMissT = 0; respawn(p, "MISSED THE CHECKPOINT"); }
      }
    } else if (next && p.x <= next.x + m(1.5) && p.cpMissT) {
      // back within reach of it: touching the post anywhere along its height counts
      if (Math.abs(p.x - next.x) < m(1.2) && p.y > next.y - m(3.2) && p.y < next.y + m(0.6)) { reachCheckpoint(p, next); p.cpMissT = 0; showToast("CHECKPOINT", "Back on track.", "ko", 1.2); }
      else p.cpMissT = Math.max(0.0001, p.cpMissT - dt);
    }
    // Shutters start closing as a runner reaches their trigger.
    for (const s of level.solids) if (s.gate && !s.gate.closing && !s.gate.pulse && p.x >= s.gate.trigger && p.x < s.x + m(1) && runTime > (s.gate.rearm || 0)) { s.gate.closing = true; s.gate.shutT = 0; sfx.gate(); }
    // Touching the finish counts however you got there (a high route can pass a checkpoint's marker overhead).
    if (overlap(box, level.goal) && (p.cp >= level.checkpoints.length - 2 || (aiRival && p.id === 2))) { p.cp = Math.max(p.cp, level.checkpoints.length - 2); finishPlayer(p); }
  }
}

function reachCheckpoint(p, cp) {
  const part = mission.parts[cp.part];
  const first = players.every(o => o === p || o.cp < cp.index);
  p.cp = cp.index;
  if (!twoPlayer && p.hearts < maxHearts(p)) p.hearts += 1;
  if (hasSkill(p, "storm_shield")) p.shield = true;
  if (freeRoam) { showToast("CHECKPOINT", part.name, "ko", 1.4); sfx.checkpoint(); return; }
  if (first) {
    const spare = Math.max(0, part.end - songClock);
    spareSeconds += spare;
    const next = mission.parts[cp.part + 1];
    showBanner((twoPlayer ? playerName(p) + " " : "") + "ON BEAT", Math.floor(spare) + "s TO SPARE" + (next ? " · NEXT: " + next.name : ""), 3.6);
  } else {
    showBanner(playerName(p) + " CHECKPOINT", "", 1.2);
  }
  sfx.checkpoint();
}

// Shutters keep the song's beat; under Music Drive (where the song stops when you do) they keep running time instead.
function gateClock() { return typeof drive !== "undefined" && (drive.active || (level && typeof partFlag === "function" && partFlag("stillness"))) ? runTime : songClock; }
function pulseOpen(s, at) {
  const pu = s.gate.pulse, t = (at === undefined ? gateClock() : at) + pu.offset;
  return ((t % pu.period) + pu.period) % pu.period < pu.period * pu.open;
}

function updateGates(dt) {
  for (const s of level.solids) {
    if (s.gate && s.gate.pulse) {
      const full = s.gate.floor - s.y;
      const open = pulseOpen(s);
      const under = players.some(p => overlap(boxOf(p), { x: s.x - 4, y: s.y, w: s.w + 8, h: full }));
      const target = open || (under && s.h < full * 0.5) ? 6 : full;
      s.h += Math.sign(target - s.h) * Math.min(Math.abs(target - s.h), full / 0.35 * dt);
      continue;
    }
    if (!s.gate || !s.gate.closing) continue;
    const full = s.gate.floor - s.y;
    const before = s.h;
    s.h = Math.min(full, s.h + full / 3.2 * dt);
    // Shut, it waits a moment, then rolls up again: the next run at it is a fresh chance.
    if (s.h >= full) {
      s.gate.shutT = (s.gate.shutT || 0) + dt;
      if (s.gate.shutT > 2.2) { s.gate.closing = false; s.gate.shutT = 0; s.h = 6; s.gate.rearm = runTime + 1.2; sfx.gate(); }
    }
    if (s.h !== before) {
      for (const p of players) {
        if (overlap(boxOf(p), s)) p.x = p.x < s.x + s.w / 2 ? s.x - p.w / 2 - 1 : s.x + s.w + p.w / 2 + 1;
      }
    }
  }
}

/* ---------------------------------------------------------------------------
   A JOURNAL PAGE
   Picking one up stops the world (the song too) so you can read it. Jump, hit
   or tap to carry on.
--------------------------------------------------------------------------- */

const journalArt = {};
function journalImage(src) {
  if (!src) return null;
  if (!journalArt[src]) journalArt[src] = loadImage(src);
  return journalArt[src];
}
function preloadJournal() {
  for (const e of Object.values(mission.journalText || {})) journalImage(e.image);
  journalImage("assets/missions/" + mission.id + ".webp");
}

// A find is a picture first; flip it over to read what it is, then put it away.
function openReading(id, entry) {
  reading = { id, entry, t: 0, armed: false, flip: 0, flipped: !(entry && entry.image), flipAt: 0 };
  journalImage(entry && entry.image);
  songAudio.pause();
  sfx.quiet();
}

function readingInput() {
  const pressed = [0, 1].some(i => { const c = rawControls(i); return c.jump || c.attack; }) || keys.Enter || keys.Escape;
  return pressed || readingTap;
}
let readingTap = false;

function updateReading(realDt) {
  reading.t += realDt;
  const down = readingInput();
  if (!down) reading.armed = true;
  if (reading.armed && down && reading.t > 0.6) {
    if (!reading.flipped) { reading.flipped = true; reading.armed = false; reading.flipAt = reading.t; sfx.flip(); }
    else if (reading.t - reading.flipAt > 0.45) { closeReading(); readingTap = false; return; }
  }
  reading.flip = reading.flipped ? Math.min(1, reading.flip + realDt / 0.42) : 0;
  readingTap = false;
}

function closeReading() {
  if (!reading) return;
  reading = null;
  // A button still held from closing the page doesn't count as a new jump or hit; one already let go does.
  players.forEach((p, i) => { const c = rawControls(i); p.jumpPressed = !!c.jump; p.attackPressed = !!c.attack; });
  if (gameState !== "playing") return;
  try { songAudio.currentTime = songClock; } catch (e) { /* not seekable yet */ }
  if (soundOn) songAudio.play().then(() => { musicBlocked = false; }).catch(() => { musicBlocked = true; });
}

/* ---------------------------------------------------------------------------
   INWARD RUNS
   In some places the camera swings round behind Koda and he runs into the
   picture: three lanes, things to jump, slide under or dodge. Distances are
   metres along the run; the side-on level carries on from the far end.
--------------------------------------------------------------------------- */

const inward = { active: false, sec: null, z: 0, fade: 0, done: new Set() };
const IN_GRAV = 22, IN_JUMP = 7.6;
function resetInward() { inward.active = false; inward.sec = null; inward.z = 0; inward.fade = 0; inward.done = new Set(); }

function inwardSections() { return mission.inward || []; }

function checkInward() {
  if (inward.active) return;
  const lead = leader();
  if (!lead.ground) return;
  for (const sec of inwardSections()) {
    if (inward.done.has(sec.from)) continue;
    if (lead.x >= m(sec.from) && lead.x < m(sec.from + 3)) { startInward(sec); return; }
  }
}

function startInward(sec) {
  inward.active = true; inward.sec = sec; inward.fade = 0.4;
  inward.length = sec.to - sec.from;
  inward.items = (sec.obstacles || []).map(o => ({ d: o[0], lane: o[1], kind: o[2] }));
  inward.pick = (sec.records || []).map(r => ({ d: r[0], lane: r[1], taken: [] }));
  const lead = leader();
  for (const p of players) {
    p.iz = p === lead ? 0 : Math.max(-6, -(lead.x - p.x) / PX);
    p.lane = p.id === 1 ? 0 : 1; p.laneX = p.lane; p.iy = 0; p.ivy = 0; p.islide = 0; p.istun = 0; p.ijumps = 1;
    p.fightWith = null; p.climb = null; p.move = null; p.vx = 0;
    p.ileftHeld = true; p.irightHeld = true;
  }
  storm.debris = [];
  inward.fade = 0.22; sfx.swing();
  showBanner(sec.name || "RUN", "LEFT AND RIGHT TO SWITCH LANES", 1.8);
}

function endInward(cancel) {
  const sec = inward.sec;
  inward.active = false;
  if (!sec) return;
  inward.done.add(sec.from);
  if (cancel) return;
  const lead = leader();
  for (const p of players) {
    const behind = p === lead ? 0 : Math.max(0, inward.length - p.iz);
    const x = m(sec.to) - m(Math.min(4, behind));
    const f = floorUnder(x, -m(30)) || { y: -m(sec.y || 0) };
    p.x = x; p.y = f.y; p.vx = RUN_SPEED; p.vy = 0; p.ground = null; p.facing = 1;
    p.lastSafe = { x: p.x, y: p.y };
    p.autoRun = 0.9;   // carries on running out of it, whatever is held
    setState(p, "normal");
  }
  cameraX = Math.max(0, Math.min(level.width - W, lead.x - W * 0.36));
  storm.front = Math.min(storm.front, lead.x - m(10));
  inward.fade = 0.22; sfx.swing();
}

// What a runner should press in an inward run (the rival uses it; so does the test bot).
function inwardDecide(p) {
  const want = { left: false, right: false, jump: false, down: false };
  const look = (lane, a, b) => inward.items.filter(o => (o.lane === lane || o.lane === "all") && o.d - p.iz > a && o.d - p.iz < b);
  const near = look(p.lane, -0.2, 2.6);
  const block = near.find(o => o.kind === "block");
  if (block) {
    const free = [-1, 0, 1].filter(l => Math.abs(l - p.lane) === 1 && !look(l, -0.6, 3.2).some(o => o.kind === "block"));
    if (free.length) { if (free[0] < p.lane) want.left = true; else want.right = true; }
  }
  for (const o of near) {
    const ahead = o.d - p.iz;
    if (o.kind === "low" && ahead < 1.5 && ahead > 0.2) want.jump = true;
    if (o.kind === "high" && ahead < 1.9 && ahead > 0.1) want.down = true;
  }
  return want;
}

function updateInward(dt) {
  const sec = inward.sec;
  inward.fade = Math.max(0, inward.fade - dt);
  const lead = leader();
  for (const [i, p] of players.entries()) {
    if (p.finished) continue;
    const c = controlsFor(i);
    p.invuln = Math.max(0, p.invuln - dt);
    p.boostTime = Math.max(0, p.boostTime - dt);
    p.animClock += dt;
    // lanes: one step per press
    if (c.left && !p.ileftHeld && p.lane > -1) { p.lane -= 1; sfx.slide(); }
    if (c.right && !p.irightHeld && p.lane < 1) { p.lane += 1; sfx.slide(); }
    p.ileftHeld = c.left; p.irightHeld = c.right;
    p.laneX += (p.lane - p.laneX) * Math.min(1, dt * 12);
    // jump and slide
    const jumpDown = c.jump && !p.jumpPressed, downDown = c.down && !p.downPressed;
    p.jumpPressed = c.jump; p.downPressed = c.down;
    if (jumpDown && (p.iy <= 0 || p.ijumps > 0)) {
      if (p.iy > 0) p.ijumps -= 1;
      p.ivy = p.iy > 0 ? IN_JUMP * 0.8 : IN_JUMP; p.islide = 0; sfx.jump();
    }
    if (downDown) { if (p.iy > 0) p.ivy = -IN_JUMP * 1.4; else { p.islide = 0.75; sfx.slide(); } }
    p.islide = Math.max(0, p.islide - dt);
    p.ivy -= IN_GRAV * dt; p.iy = Math.max(0, p.iy + p.ivy * dt);
    if (p.iy <= 0) { p.ivy = Math.max(0, p.ivy); p.ijumps = 1; }
    // forward
    p.istun = Math.max(0, p.istun - dt);
    const speed = RUN_SPEED / PX * (p.boostTime > 0 ? BOOST_SPEED : 1) * (p.istun > 0 ? 0.45 : 1);
    const z0 = p.iz;
    p.iz += speed * dt;
    // things in the way
    for (const o of inward.items) {
      // Hits go by where Koda is on screen, not the lane he is moving towards.
      if (!(o.lane === "all" || Math.abs(p.laneX - o.lane) < 0.5)) continue;
      if (!(o.d >= z0 - 0.05 && o.d < p.iz + 0.05)) continue;
      const clear = o.kind === "low" ? p.iy > 0.7 : o.kind === "high" ? p.islide > 0 : false;
      if (clear || p.invuln > 0) continue;
      p.istun = 0.6; p.invuln = 1.1; sfx.hurt(); shake = Math.max(shake, 0.25); rumble(p.id - 1, 0.7, 220);
      burst(p.x, p.y - m(1), "#ff9a6a", 12, 200);
      if (!twoPlayer) { p.hearts -= 1; if (p.hearts <= 0) { p.hearts = maxHearts(p); p.iz = Math.max(0, p.iz - 6); showBanner("WIPEOUT", "", 1); } }
      else p.records = Math.max(0, p.records - 1);
    }
    // records along the lanes
    for (const r of inward.pick) {
      if (r.taken.includes(p.id) || r.lane !== p.lane || Math.abs(r.d - p.iz) > 0.6 || p.iy > 1.6) continue;
      r.taken.push(p.id); p.records += 1; sfx.record();
    }
    // a little of the side-on position moves with you, for the camera and the storm
    p.x = m(sec.from) + m(Math.min(inward.length, Math.max(0, p.iz)));
  }
  if (lead.iz >= inward.length) endInward(false);
}

function finishPlayer(p) {
  if (p.finished) return;
  const part = mission.parts[mission.parts.length - 1];
  if (players.every(o => o === p || !o.finished)) spareSeconds += Math.max(0, part.end - songClock);
  p.finished = true;
  p.cp = level.checkpoints.length - 1;
  p.finishTime = realTime;
  p.place = players.filter(o => o.finished).length;
  sfx.finish();
  burst(level.goal.x + level.goal.w / 2, level.goal.y + level.goal.h / 2, "#ffd46a", 30, 260);
  if (!twoPlayer) { finishGame(); return; }
  if (p.place === 1) {
    raceEndsAt = runTime + RACE_FINISH_WINDOW;
    showBanner(playerName(p) + " FINISHED FIRST", playerName(players[p.id === 1 ? 1 : 0]) + ": " + RACE_FINISH_WINDOW + " SECONDS TO FINISH", 2.5);
  }
  if (players.every(o => o.finished)) finishGame();
}

/* ---------------------------------------------------------------------------
   EFFECTS
--------------------------------------------------------------------------- */

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

function floatText(x, y, text, color) {
  particles.push({ x, y, vx: 0, vy: -50, life: 0.9, max: 0.9, color, text });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) { particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (!q.text) q.vy += 600 * dt;
  }
}

function showBanner(text, sub, seconds) { banner = { text, sub: sub || "", time: seconds || 1.5 }; }
function showToast(title, text, kind, seconds) { toast = { title, text, kind, time: seconds || 2.2 }; }

/* ---------------------------------------------------------------------------
   THE MAIN UPDATE
--------------------------------------------------------------------------- */

function update(realDt) {
  banner.time = Math.max(0, banner.time - realDt);
  toast.time = Math.max(0, toast.time - realDt);
  flash = Math.max(0, flash - realDt * 2.6);
  shake = Math.max(0, shake - realDt);
  if (lightningBolt) { lightningBolt.t -= realDt; if (lightningBolt.t <= 0) lightningBolt = null; }
  if (taunt) { updateTaunt(realDt); updateParticles(realDt); return; }

  // A journal page is open: the world holds still while you read.
  if (reading) { updateReading(realDt); return; }
  // Hit-stop: a blink of near-freeze when a hit lands.
  let dt = realDt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - realDt); dt = realDt * 0.12; }
  runTime += dt;
  realTime += realDt;
  if (!driveHoldsClock(realDt)) updateSongClock(realDt);

  updateGates(dt);
  updateSystems(dt);
  if (inward.active) updateInward(dt);
  else {
    inward.fade = Math.max(0, inward.fade - dt);   // the dip to black after a run into the picture lifts again
    for (const pl of players) if (pl.autoRun > 0) pl.autoRun = Math.max(0, pl.autoRun - dt);
    players.forEach((p, i) => updatePlayer(p, i, dt));
    updateWardens(dt);
    updateDrones(dt);
    checkInward();
  }
  updateStorm(dt, realDt);
  if (!inward.active) updatePickups(dt);
  updateDeadline();
  updateParticles(dt);
  rewindFx = Math.max(0, rewindFx - realDt);

  // Fights muffle the song and bring in the fight beat.
  const inFight = players.some(p => p.fightWith && !p.finished);
  fightLevel += ((inFight ? 1 : 0) - fightLevel) * Math.min(1, realDt * (inFight ? 8 : 3));
  sfx.fightMix(inFight, mission.bpm || 92, songClock);
  // The weather you hear: wind, rain, and the storm front's roar as it closes in.
  {
    const lead = leader();
    const indoors = sectionAt(lead.x).world === "ve";
    const close = mission.stormChase ? Math.max(0, 1 - (lead.x - storm.front) / m(9)) : 0;
    const wx = mission.weather || {};
    const baseWind = wx.wind !== undefined ? wx.wind : 0.08, baseRain = wx.rain !== undefined ? wx.rain * 0.33 : 0.05;
    const fury = indoors ? 0 : Math.min(1, storm.strength * 0.9 + close * 0.5);
    sfx.ambience({
      wind: indoors ? 0.04 : baseWind + storm.strength * 0.38 + close * 0.2,
      rain: indoors ? 0.02 : baseRain + storm.strength * 0.12,
      roar: indoors ? 0 : close * 0.6,
      fury
    });
    // The world breathes with the song: slow in calm parts, quick in the storm and the choruses.
    const part = mission.parts[playingPartIndex()];
    const want = reading ? 0 : (part && part.storm ? 2.6 : 1) * (inFight ? 0.6 : 1) * (lead.boostTime > 0 ? 1.4 : 1);
    worldPace += (want - worldPace) * Math.min(1, realDt * 0.6);
    cloudDrift += worldPace * realDt;
  }

  // Two players: anyone left behind off the left of the screen comes back in beside the leader.
  if (twoPlayer) {
    for (const p of players) {
      if (!inward.active && !p.finished && p.x < cameraX - 40 && p.invuln <= 0) respawn(p, "LEFT BEHIND");
    }
    if (raceEndsAt !== null && runTime >= raceEndsAt && gameState === "playing") finishGame();
  }

  // The camera follows the runner in front.
  const lead = leader();
  if (inward.active) return;
  // Following Zora, the camera looks further ahead so she stays in the picture.
  const tailing = (level.tails || []).some(t => t.state === "on");
  // The right stick nudges the view: a look ahead or behind, above or below. It eases out and springs back.
  const lp = pads[0] || {};
  const wantLX = (lp.lookX || 0) * (mission.mirror ? -1 : 1), wantLY = lp.lookY || 0;
  look.x += (wantLX - look.x) * Math.min(1, realDt * 5);
  look.y += (wantLY - look.y) * Math.min(1, realDt * 5);
  const targetX = lead.x - W * (lead.facing < 0 && !twoPlayer ? 0.55 : tailing ? 0.2 : 0.36) + look.x * W * 0.3;
  cameraX += (targetX - cameraX) * Math.min(1, realDt * 4.5);
  cameraX = Math.max(0, Math.min(level.width - W, cameraX));
  // Hold the height through a jump; follow climbs, falls and big drops.
  if (lead.ground || lead.climb || lead.move || lead.lastFootY === undefined) lead.lastFootY = lead.y;
  let footY = lead.lastFootY;
  if (lead.y > footY + m(1)) footY = lead.y - m(1);
  if (lead.y < footY - m(2.2)) footY = lead.y + m(2.2);
  const targetY = (footY > m(0.6) ? footY - H * 0.62 : Math.min(-410, footY - H * 0.68)) + look.y * H * (look.y > 0 ? 0.12 : 0.16);
  cameraY += (targetY - cameraY) * Math.min(1, realDt * 3.2);
}
