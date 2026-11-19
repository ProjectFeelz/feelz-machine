"use strict";

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
  if (typeof World3D !== "undefined") World3D.reset();
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
  if (data.coin && coinTurnsUp(data)) L.coin = { x: m(data.coin.x), y: -m(data.coin.y), taken: false };
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
  prefetchArt(L, data);
  return L;
}

// Start loading the pictures this level uses (its worlds, its wardens, the
// seen-from-behind runner for inward runs), so they're in before they're needed.
function prefetchArt(L, data) {
  try {
    for (const sec of L.sections || []) { const w = art.worlds[sec.world]; if (w) { void w.far; void w.near; void w.clouds; } if (sec.backdrop) locImage(sec.backdrop); }
    for (const wd of L.wardens || []) void art.enemies[wd.kind];
    if ((data.inward || []).length) { void art.back.koda; void art.back.koda_mask; void art.back.zora; }
  } catch (e) { /* drawing loads anything missed */ }
}

// The F.I.L.L. coin is worth real money off the album, so it is a rare find: it turns up
// on about one run in twenty-five, and once a mission's coin is found it never turns up
// there again. (The server also counts each mission's coin only once.)
const COIN_CHANCE = 0.04;
function coinTurnsUp(data) {
  const found = (typeof Progress !== "undefined" && Progress.data.coinMissions) || [];
  if (found.includes(data.id)) return false;
  return Math.random() < COIN_CHANCE;
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
  // Small things in between: a can, a bucket, a pot. Never right against a bigger piece.
  const bigs = out.slice();
  for (const g of L.solids) {
    if (g.kind !== "ground") continue;
    for (let x = g.x + m(1.5); x < g.x + g.w - m(1.5); x += m(1.7)) {
      if (seeded(Math.floor(x / m(1.7)) * 3.17 + 9.1) > 0.42) continue;
      const list = WORLD_SMALL[worldAt(x / PX)];
      if (!list || !list.length) continue;
      const jx = x + (seeded(x * 0.37) - 0.5) * m(0.8);
      if (busy(jx, g.y) || bigs.some(d => Math.abs(d.x - jx) < m(1.3))) continue;
      const pick = list[Math.floor(seeded(x * 0.53) * list.length) % list.length];
      out.push({ x: jx, y: g.y, name: pick[0], h: pick[1] * (0.9 + seeded(x * 0.41) * 0.2), small: true });
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
