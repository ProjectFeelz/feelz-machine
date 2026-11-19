"use strict";

/* ---------------------------------------------------------------------------
   THE STORM
   On the choruses the storm hits: the sky darkens, lightning strikes on the
   "Me against the storm" lines, and the wind throws debris across the roofs.
   Jump the low pieces, duck or slide under the high ones.
--------------------------------------------------------------------------- */

const DEBRIS_LOW = ["crate", "barrel", "crate_half", "vent", "crate"];

const DEBRIS_HIGH = ["pipe", "grate", "pipe", "grate", "pipe"];

// What the wind picks up: the small things lying about in this part of the city
// (cans, buckets, chairs, tyres, crates of bottles...), so no two storms throw the same.
function debrisThing(world) {
  const list = (WORLD_SMALL[world] || []).concat(world === "ve" ? [] : WORLD_SMALL.lc || []);
  if (!list.length) return DEBRIS_LOW[Math.floor(Math.random() * DEBRIS_LOW.length)];
  return list[Math.floor(Math.random() * list.length)][0];
}

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
      low, art: low || Math.random() < 0.5 ? debrisThing(sectionAt(lead.x).world) : DEBRIS_HIGH[Math.floor(Math.random() * 5)],
      x: Math.max(storm.front, cameraX - m(2)), y: floor - (low ? m(0.36) : m(1.56)), half: low ? m(0.32) : m(0.17),
      size: low ? m(0.72) : m(1.5), rot: Math.random() * 6, hit: [], trail: []
    });
    // seconds between throws (plus up to 1.4 more at random); the storm throws more each round
    const every = (mission.debrisEvery || 1.6) * Math.max(0.55, 1 - (seriesRound() - 1) * 0.22);
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
  // the crack lands with the flash, the roll follows; a slight shake with it
  sfx.thunder(big);
  shake = Math.max(shake, big ? 0.16 : 0.08);
  for (const p of players) rumble(p.id - 1, big ? 0.35 : 0.15, big ? 220 : 120);
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
  if (coopOn()) { Coop.noteMiss(idx); Coop.send("miss", { i: idx }); }
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
      if (freeRoam && p === players[0]) keepRoamPage(j.id);
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
      coopRewind("");
      burst(r.x, r.y, "#ff5ad8", 22, 240);
      if (coopOn() && p === players[0]) Coop.send("rewind");
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
    if (overlap(box, level.goal) && (p.cp >= level.checkpoints.length - 2 || freeRoam || (aiRival && p.id === 2))) { p.cp = Math.max(p.cp, level.checkpoints.length - 2); finishPlayer(p); }
  }
}

// A rewind token: the song goes back 10 seconds (in co-op, for both players).
function coopRewind(who) {
  sfx.rewindSweep(mission.song.src, songClock, REWIND_SECONDS);
  seekSong(Math.max(0, songClock - REWIND_SECONDS));
  rewindFx = 0.8;
  showBanner("TIME REWIND", (who ? who + " · " : "") + "-" + REWIND_SECONDS + "s ON THE SONG", 1.8);
  sfx.rewind();
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
  // Co-op: the world can't stop for one player, so the page goes into the journal to read later.
  if (coopOn()) {
    showToast(String((entry && entry.kind) || "JOURNAL").toUpperCase(), ((entry && entry.title) || "") + " · IN YOUR JOURNAL", "", 2.8);
    return;
  }
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
  // The song waited where the page opened: start it again in place (jumping in the
  // file when it's already there makes iPhone stall for a moment).
  if (soundOn) resumeSong();
}

// A runner reaches the goal.
function finishPlayer(p) {
  if (p.finished) return;
  const part = mission.parts[mission.parts.length - 1];
  if (players.every(o => o === p || !o.finished)) spareSeconds += Math.max(0, part.end - songClock);
  p.finished = true;
  p.cp = level.checkpoints.length - 1;
  p.finishTime = realTime;
  p.place = players.filter(o => o.finished).length;
  sfx.finish();
  if (coopOn() && p === players[0]) Coop.send("finish");
  burst(level.goal.x + level.goal.w / 2, level.goal.y + level.goal.h / 2, "#ffd46a", 30, 260);
  if (!twoPlayer) { finishGame(); return; }
  if (p.place === 1) {
    raceEndsAt = runTime + RACE_FINISH_WINDOW;
    showBanner(playerName(p) + " FINISHED FIRST", playerName(players[p.id === 1 ? 1 : 0]) + ": " + RACE_FINISH_WINDOW + " SECONDS TO FINISH", 2.5);
  }
  if (players.every(o => o.finished)) finishGame();
}
