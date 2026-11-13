/*
  FEELZ RUN - systems.js
  The systems from the F.I.L.L. design doc, reshaped for a song-timed runner:
  - Stealth: enforcers see along a cone; hiding spots, crowds and crouching in the dark keep Koda unseen;
    an enforcer who hasn't seen him can be taken down silently from behind.
  - Area alert: every time he's seen the alert rises (0 calm, 1 suspicious, 2 alert, 3 lockdown) and
    enforcers see further and move faster. Staying unseen lets it fall again.
  - The underground: tunnels under the street, reached through grates (down to drop in).
  - Ziplines: jump into the cable to grab it.
  - Crowds: walk slowly or crouch inside a crowd and nobody picks you out.
  - Music Drive: in a drive part the song only plays while Koda moves forward. Stop and it waits,
    then rewinds, pulling him back along the path he ran.
*/

"use strict";

const SIGHT = { warden: 5.5, guard: 8, dock: 6, handler: 6.5, sentinel: 7.5, gilded: 8, hunter: 7 };
const ALERT_NAMES = ["CALM", "SUSPICIOUS", "ALERT", "LOCKDOWN"];
const stealth = { alert: 0, calmT: 0, seen: 0, silent: 0, flash: 0 };
const drive = { stopT: 0, rewinding: false, rate: 1, trail: [], active: false, hint: 0 };

function stealthOn() { return !!mission && mission.stealth !== false && !twoPlayer; }

/* ---------- level data ---------- */

function buildSystems(L, data) {
  L.ziplines = (data.ziplines || []).map(z => ({ x1: m(z.x1), y1: -m(z.y1), x2: m(z.x2), y2: -m(z.y2) }));
  L.crowds = (data.crowds || []).map(c => ({ x: m(c.x), w: m(c.w), y: -m(c.y || 0), people: c.people || Math.max(4, Math.round(c.w / 1.6)), seed: Math.round(c.x * 13) }));
  L.tunnels = (data.tunnels || []).map(t => ({ x: m(t.x), w: m(t.w), top: -m(t.top), bottom: -m(t.bottom) }));
  L.cages = (data.cages || []).map(c => ({ x: m(c.x), y: -m(c.y || 0), npc: c.npc, open: false, t: 0 }));
  L.scanners = (data.scanners || []).map(c => ({ x: m(c.x), y: -m(c.y || 0), h: m(c.h || 3.4), period: c.period || 4, on: c.on || 0.5, cool: 0 }));
  L.hedges = (data.hedges || []).map(c => ({ x: m(c.x), w: m(c.w), y: -m(c.y || 0), seed: Math.round(c.x * 11) }));
  buildVeil(L, data);
  L.tails = (data.tails || []).map(c => ({ x0: m(c.x0), x1: m(c.x1), y: -m(c.y || 0), state: "wait", x: 0, pause: 0, hurry: 0, walk: 0, good: 0, total: 0, warnT: 0 }));
}

function resetSystems() {
  stealth.alert = 0; stealth.calmT = 0; stealth.seen = 0; stealth.silent = 0; stealth.flash = 0;
  drive.stopT = 0; drive.rewinding = false; drive.rate = 1; drive.trail = []; drive.active = false; drive.hint = 0; drive.stillShown = false;
  for (const wd of level.wardens) { wd.aware = 0; wd.lostT = 0; wd.mark = 0; wd.markKind = ""; wd.target = null; }
  for (const p of players) { p.zip = null; p.hidden = false; p.zipCd = 0; }
  stealth.freed = 0; stealth.tailGood = 0; stealth.tailTotal = 0;
  resetVeil();
  resetHound();
  resetDogs();
}

/* ---------- hiding ---------- */

function underAwning(p) {
  return level.solids.some(s => s.kind === "awning" && p.x > s.x - 6 && p.x < s.x + s.w + 6 && p.y >= s.y - 4 && p.y - s.y < m(2.8));
}
// Crouched down behind a market counter or a hedge: out of sight, lantern or not.
function behindCounter(p) {
  return (level.stalls || []).some(s => p.x > s.x + 4 && p.x < s.x + s.w - 4 && Math.abs(p.y - (s.y + s.h)) < m(0.4)) ||
    (level.hedges || []).some(h => p.x > h.x + 4 && p.x < h.x + h.w - 4 && Math.abs(p.y - h.y) < m(0.4));
}
function inCrowd(p) {
  return level.crowds.some(c => p.x > c.x && p.x < c.x + c.w && Math.abs(p.y - c.y) < m(0.6));
}
function isLit(p) {
  return level.decor.some(d => (d.art === "lantern" || d.art === "shrine") && Math.abs(m(d.x) - p.x) < m(2.4) && Math.abs(-m(d.y) - p.y) < m(3));
}
function updateHidden(p) {
  const slow = Math.abs(p.vx) < RUN_SPEED * 0.55;
  const quiet = p.crouch || slow;
  p.hidden = !!p.ground && !p.fightWith && ((p.crouch && behindCounter(p)) || (quiet && (underAwning(p) || inCrowd(p) || (p.crouch && !isLit(p)))));
}

/* ---------- being seen ---------- */

function sees(wd, p) {
  if (p.finished || p.hidden || inward.active || wd.blind > 0) return false;
  const range = m((SIGHT[wd.kind] || 5.5) * enemyKind(wd).sight * (stealth.alert >= 2 ? 1.35 : 1));
  const dx = (p.x - wd.x) * wd.facing;
  if (dx < -m(0.4) || dx > range) return false;
  if (Math.abs(p.y - wd.y) > m(1.6)) return false;
  // a solid wall between them blocks the view
  const y = wd.y - m(1.4), x0 = Math.min(wd.x, p.x), x1 = Math.max(wd.x, p.x);
  for (const s of level.solids) {
    if (s.oneWay || s.kind === "ground" || s.kind === "roof" || s.kind === "awning") continue;
    if (s.x < x1 && s.x + s.w > x0 && s.y < y && s.y + s.h > y) return false;
  }
  return true;
}

function spotted(wd, p) {
  stealth.seen += 1;
  stealth.alert = Math.min(3, stealth.alert + 1);
  stealth.calmT = 0; stealth.flash = 1;
  wd.mark = 1.4; wd.markKind = "!";
  if (sfx.alert) sfx.alert(); else sfx.fight();
  if (stealth.alert >= 3) showToast("LOCKDOWN", "Every enforcer is looking. Hide to bring it down.", "", 2);
  else showToast("SPOTTED", ALERT_NAMES[stealth.alert], "", 1.1);
}

// Called for each living enforcer before the fight logic. Returns true when the warden has moved itself.
function wardenStealth(wd, dt) {
  wd.mark = Math.max(0, (wd.mark || 0) - dt);
  if (wd.state === "run") wd.state = "walk";
  if (!stealthOn()) { wd.aware = 1; return false; }
  let seeing = null;
  for (const p of players) if (sees(wd, p)) { seeing = p; break; }
  if (seeing) {
    if (!wd.aware) spotted(wd, seeing);
    wd.aware = 1; wd.lostT = 0; wd.target = seeing;
  } else if (wd.aware) {
    const t = wd.target;
    const engaged = players.some(o => o.fightWith === wd);
    if (!engaged) wd.lostT += dt;
    if (wd.lostT > (t && t.hidden ? 1.6 : 3.5)) { wd.aware = 0; wd.target = null; wd.mark = 1.2; wd.markKind = "?"; }
  }
  // Silent takedown: an attack from behind on one who hasn't seen him.
  if (!wd.aware) {
    for (const p of players) {
      if (!ATTACK_STATES.has(p.state) && p.state !== "takedown") continue;
      if (Math.abs(p.x - wd.x) > m(1.5) || Math.abs(p.y - wd.y) > m(0.9)) continue;
      if (Math.sign(p.x - wd.x) === wd.facing) continue;   // in front of him: he sees it coming
      stealth.silent += 1;
      knockOutWarden(wd, p);
      showToast("SILENT TAKEDOWN", "Unseen, untouched.", "ko", 1.4);
      return true;
    }
  }
  // Chasing what he saw.
  if (wd.aware && wd.target && !players.some(o => o.fightWith === wd) && wd.windUp <= 0 && wd.punchT <= 0) {
    const t = wd.target, ek = enemyKind(wd);
    const dir = Math.sign(t.x - wd.x) || wd.facing;
    if (Math.abs(t.x - wd.x) > m(1.2)) {
      const nx = wd.x + dir * m(ek.speed * (stealth.alert >= 2 ? 3.0 : 2.4)) * wadeFactor(wd) * dt;
      if (nx > wd.minX - m(9) && nx < wd.maxX + m(9)) { wd.x = nx; wd.walkPhase += m(2.6) * dt; }
      wd.facing = dir; wd.state = "run";
      return true;
    }
  }
  return false;
}

/* ---------- the alert level and Music Drive ---------- */

// The lockup: hit a cage to let the neighbour inside go. They run for the fire pit.
function updateCages(dt) {
  for (const c of level.cages || []) {
    const n = level.npcs[c.npc];
    if (c.open) {
      c.t += dt;
      // freed: they walk off up the street, quickly, looking back once
      if (n && !n.gone) { n.walked = (n.walked || 0) + 2.2 * dt; n.x += 2.2 * dt; n.facing = 1; n.running = true; if (c.t > 7) n.gone = true; }
      continue;
    }
    for (const p of players) {
      if (!ATTACK_STATES.has(p.state) || Math.abs(p.x - c.x) > m(1.3) || Math.abs(p.y - c.y) > m(1)) continue;
      c.open = true; c.t = 0;
      stealth.freed = (stealth.freed || 0) + 1;
      const total = level.cages.length;
      sfx.vault(); burst(c.x, c.y - m(1), "#ffd46a", 18, 220);
      showToast("NEIGHBOUR FREED", stealth.freed + " OF " + total + (stealth.freed === total ? " · EVERYONE IS OUT" : ""), "ko", 1.6);
      break;
    }
  }
}

// The scanner arch: walk through while it's sweeping and the checkpoint knows you're there.
function scannerLive(sc) { const t = ((gateClock() % sc.period) + sc.period) % sc.period; return t < sc.period * sc.on; }
function updateScanners(dt) {
  for (const sc of level.scanners || []) {
    sc.cool = Math.max(0, sc.cool - dt);
    if (sc.cool > 0 || !scannerLive(sc) || !stealthOn()) continue;
    for (const p of players) {
      if (Math.abs(p.x - sc.x) > m(0.45) || p.y < sc.y - m(1.5) || p.y > sc.y + m(0.3)) continue;
      sc.cool = 2.5;
      const wd = level.wardens.filter(w => w.alive).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (wd && Math.abs(wd.x - p.x) < m(14)) { wd.aware = 1; wd.target = p; wd.lostT = 0; spotted(wd, p); }
      else { stealth.alert = Math.min(3, stealth.alert + 1); stealth.flash = 1; showToast("SCANNED", ALERT_NAMES[stealth.alert], "", 1.1); }
      break;
    }
  }
}

// Tailing Zora: she walks on ahead through the crowd. Stay in the band behind her:
// too close and she notices, too far and you lose her.
const TAIL_NEAR = 3, TAIL_FAR = 8, TAIL_LOST = 10;
function updateTails(dt) {
  const p = leader();
  for (const t of level.tails || []) {
    if (t.state === "done") continue;
    if (t.state === "leaving") {
      t.leaveT += dt;
      if (Math.random() < dt * 40) burst(t.x + (Math.random() - 0.5) * m(0.8), t.y - m(0.4 + Math.random() * 1.4), Math.random() < 0.5 ? "#ffc6dc" : "#ffe7a6", 1, 90);
      if (t.leaveT > 1.3) t.state = "done";
      continue;
    }
    if (t.state === "wait") {
      if (p.x < t.x0 - m(2)) continue;
      t.state = "on"; t.x = t.x0 + m(6); t.pause = 1.2; t.fx = 0;
      const first = (level.tails || []).indexOf(t) === 0;
      showBanner(first ? "FOLLOW ZORA" : "THERE SHE IS", first ? "STAY CLOSE ENOUGH TO SEE HER, FAR ENOUGH NOT TO BE SEEN" : "PICK UP HER TRAIL", 2.4);
      burst(t.x, t.y - m(1), "#ffc6dc", 26, 200); if (sfx.zoraIn) sfx.zoraIn();
      continue;
    }
    const d = (t.x - p.x) / m(1);
    t.total += dt;
    t.warnT = Math.max(0, t.warnT - dt);
    t.hurry = Math.max(0, t.hurry - dt);
    t.pause = Math.max(0, t.pause - dt);
    let speed = t.hurry > 0 ? 5.2 : 2.7;
    if (d > TAIL_LOST) speed = 0;             // she stops to look for you
    else if (t.pause > 0) speed = 0;
    // You never get past her: closing in, she quickens; level with her, she slips ahead through the crowd.
    const kodaSpeed = Math.abs(p.vx) / PX;
    if (d < TAIL_NEAR + 1) { speed = Math.max(speed, kodaSpeed + 1.2, 4); t.pause = 0; }
    if (d < 0.5) speed = Math.max(speed, kodaSpeed + 3.5, 8.5);
    else if (seeded(Math.floor(t.x / m(7)) + t.x0) < 0.35 && (t.x / m(1)) % 7 < 0.05) t.pause = 1 + seeded(t.x0 + t.x) * 1.5;
    t.x += m(speed) * dt; t.walk += m(speed) * dt;
    t.moving = speed > 0;
    const inBand = d >= TAIL_NEAR && d <= TAIL_FAR;
    if (inBand) { t.good += dt; stealth.tailGood += dt; }
    stealth.tailTotal += dt;
    t.band = d < TAIL_NEAR ? "near" : d > TAIL_FAR ? "far" : "ok";
    t.d = d;
    if (d < TAIL_NEAR && !p.hidden && t.warnT <= 0) {
      t.warnT = 3; t.hurry = 2.2;
      stealth.alert = Math.min(3, stealth.alert + 1); stealth.flash = 1;
      showToast("SHE LOOKED BACK", "Too close. Drop back.", "", 1.4);
    }
    t.fx = Math.min(1, (t.fx || 0) + dt / 0.7);
    if (t.x >= t.x1) {
      // she slips away into the crowd: a swirl of petals and light, then she's gone until the next stretch
      t.state = "leaving"; t.leaveT = 0;
      const last = (level.tails || []).indexOf(t) === level.tails.length - 1;
      showBanner("SHE SLIPPED AWAY", last ? Math.round((t.good / Math.max(1, t.total)) * 100) + "% OF THE WAY IN THE BAND" : "KEEP GOING · SHE'LL TURN UP AGAIN", 2.4);
      if (sfx.zoraOut) sfx.zoraOut();
    }
  }
}

function updateSystems(dt) {
  if (!level) return;
  updateCages(dt);
  updateScanners(dt);
  updateTails(dt);
  updateVeil(dt);
  updateHound(dt);
  updateDogs(dt);
  updateFlares(dt);
  for (const p of players) updateHidden(p);
  stealth.flash = Math.max(0, stealth.flash - dt * 1.5);
  if (stealthOn() && stealth.alert > 0) {
    const anyAware = level.wardens.some(w => w.alive && w.aware && Math.abs(w.x - leader().x) < m(30));
    if (anyAware) stealth.calmT = 0;
    else {
      stealth.calmT += dt;
      if (stealth.calmT > 6) { stealth.alert -= 1; stealth.calmT = 0; showToast(ALERT_NAMES[stealth.alert], "", "", 1); }
    }
  }
}

function drivePartActive() {
  if (twoPlayer || inward.active || freeRoam) return false;
  const part = mission.parts[playingPartIndex()];
  return !!(part && part.drive);
}

// Music Drive takes over the song clock while it's on. Returns true when it has handled the clock this frame.
function driveHoldsClock(realDt) {
  drive.hint = Math.max(0, drive.hint - realDt);
  // Stillness: the song only plays while you stand still.
  if (!twoPlayer && !freeRoam && level && partFlag("stillness")) {
    if (!drive.stillShown) { drive.stillShown = true; showBanner("STILLNESS", "THE SONG ONLY PLAYS WHILE YOU STAND STILL", 2.4); }
    const p = players[0];
    if (veil.still > 0.25 || p.finished) {
      songHeld = false;
      sfx.holdPad(false);
      if (songAudio.paused && soundOn && !reading) { seekSong(songClock); songAudio.play().then(() => { musicBlocked = false; }).catch(() => { musicBlocked = true; }); }
      return false;
    }
    songHeld = true;
    if (!songAudio.paused) songAudio.pause();
    if (soundOn && !reading && gameState === "playing") sfx.holdPad(true); else sfx.holdPad(false);
    return true;
  }
  if (sfx.holdPad) sfx.holdPad(false);
  const on = drivePartActive();
  if (on && !drive.active) { drive.active = true; drive.trail = []; drive.stopT = 0; showBanner("MUSIC DRIVE", "THE SONG ONLY PLAYS WHILE YOU MOVE", 2.2); }
  if (!on) { if (drive.active) { drive.active = false; drive.rewinding = false; } songHeld = false; sfx.rewindTape(false); return false; }
  const p = players[0];
  const ctl = controlsFor(0);
  // Only going forward counts. Walking back holds the song, and a hop or a step on the way back doesn't restart it.
  const back = ctl.left && !ctl.right;
  const moving = !p.finished && !back && (ctl.right || (p.climb && ctl.up) || p.zip || (p.move && p.vx >= 0) || p.vx > m(1.5) || (!p.ground && p.vx > -m(0.5)));
  drive.moveT = moving ? (drive.moveT || 0) + realDt : 0;
  // Hidden, or waiting on something that moves with the beat (a shutter, a turning slab, a flicker): the song just holds.
  const pg = level.solids.find(s => s.gate && s.gate.pulse && s.x - p.x > 0 && s.x - p.x < m(2.6) && Math.abs(s.gate.floor - p.y) < m(0.6) && !pulseOpen(s));
  const hiding = (p.hidden && stealthOn()) || (p.ground && (beatBlockedAhead(p) || !!pg));
  // after a stop, it takes a moment of real forward movement before the song picks up again
  if (moving && (drive.rewinding || drive.stopT > 0.25) && drive.moveT < 0.15) {
    songHeld = true; sfx.rewindTape(false);
    if (!songAudio.paused) songAudio.pause();
    return true;
  }
  if (moving) {
    songHeld = false; sfx.rewindTape(false);
    if (drive.rewinding || drive.stopT > 0.25) {
      seekSong(songClock);
      if (soundOn && songAudio.paused && !reading) songAudio.play().then(() => { musicBlocked = false; }).catch(() => { musicBlocked = true; });
    }
    drive.stopT = 0; drive.rewinding = false; drive.rate = 1;
    if (!drive.trail.length || songClock - drive.trail[drive.trail.length - 1].t > 0.05) {
      drive.trail.push({ t: songClock, x: p.x, y: p.y });
      if (drive.trail.length > 2400) drive.trail.splice(0, drive.trail.length - 2400);
    }
    return false;   // the song plays on as normal
  }
  // Standing still (or hidden): the song holds.
  drive.stopT += realDt;
  songHeld = true;
  if (!songAudio.paused) songAudio.pause();
  if (hiding || drive.stopT < 2) { drive.rewinding = false; sfx.rewindTape(false); if (drive.stopT > 0.8 && !hiding) drive.hint = 0.3; return true; }
  // Too long in the open: the song rewinds and pulls him back with it.
  const part = mission.parts[playingPartIndex()];
  drive.rewinding = true;
  drive.rate = Math.min(4, drive.rate + realDt * 1.2);
  songClock = Math.max(part.start, songClock - realDt * drive.rate);
  // you hear it: the song running backwards, faster the longer it goes
  if (soundOn && !reading) sfx.rewindTape(songClock > part.start + 0.05, mission.song.src, songClock, drive.rate * 1.4); else sfx.rewindTape(false);
  while (drive.trail.length > 1 && drive.trail[drive.trail.length - 1].t > songClock) drive.trail.pop();
  const spot = drive.trail[drive.trail.length - 1];
  if (spot) { p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0; p.ground = floorUnder(p.x, p.y - 2) || p.ground; }
  rewindFx = Math.max(rewindFx, 0.3);
  return true;
}

function driveRewinding(p) { return drive.rewinding && p === players[0]; }

/* ---------- ziplines ---------- */

// The cable sags a little in the middle, like a real one.
function zipY(z, x) {
  const k = Math.max(0, Math.min(1, (x - z.x1) / (z.x2 - z.x1)));
  return z.y1 + (z.y2 - z.y1) * k + Math.sin(k * Math.PI) * m(0.35);
}
const ZIP_HANDLE = 0.55;   // metres from the cable down to the bar he holds

// Returns true while Koda is riding a cable (the normal movement is skipped).
function zipUpdate(p, ctl, dt) {
  p.zipCd = Math.max(0, (p.zipCd || 0) - dt);
  if (p.zip) {
    const z = p.zip;
    z.speed = Math.min(m(11), (z.speed || m(4)) + m(9) * dt);   // picks up speed down the line
    p.x += z.speed * dt;
    z.trolley = Math.min(p.x, z.x2 - m(0.3));
    p.y = zipY(z, z.trolley) + m(ZIP_HANDLE) + p.h + m(0.12);
    p.vx = RUN_SPEED; p.vy = 0; p.ground = null; p.facing = 1;
    p.animClock += dt;
    if (Math.random() < dt * 30) burst(z.trolley, zipY(z, z.trolley), "#ffd28a", 1, 120);
    const jumpNow = ctl.jump && !p.jumpPressed;
    if (ctl.jump) p.jumpPressed = true; else p.jumpPressed = false;
    if (p.x >= z.x2 - m(0.6) || jumpNow || ctl.down) {
      p.zip = null; p.zipCd = 0.5; z.speed = 0;
      p.vx = RUN_SPEED * 1.1;
      p.vy = jumpNow ? -JUMP_SPEED * 0.85 : -m(1);
      if (jumpNow) sfx.jump && sfx.jump();
    }
    return true;
  }
  if (p.climb || p.zipCd > 0 || !level.ziplines.length) return false;
  for (const z of level.ziplines) {
    if (z.trolley === undefined) z.trolley = z.x1 + m(0.4);
    // sent back behind it (a rewind or a respawn): the bar is waiting at the start again
    if (z.trolley > z.x1 + m(1) && players.every(q => q.x < z.x1 - m(2) && q.zip !== z)) z.trolley = z.x1 + m(0.4);
    if (z.trolley > z.x1 + m(1)) continue;                 // already ridden: the handle is at the far end
    if (Math.abs(p.x - z.trolley) > m(0.7)) continue;
    const bar = zipY(z, z.trolley) + m(ZIP_HANDLE);
    const hands = p.y - p.h;
    if (hands - bar < m(1.0) && hands - bar > -m(0.9)) {
      p.zip = z; z.speed = m(4); p.airJumps = airJumpsFor(p);
      sfx.zip && sfx.zip();
      return true;
    }
  }
  return false;
}

/* ---------- drawing ---------- */

function drawTunnels() {
  for (const t of level.tunnels) {
    if (!onScreen(t.x, t.w, 100)) continue;
    const X = sx(t.x), Y = sy(t.top), h = t.bottom - t.top;
    const g = ctx.createLinearGradient(0, Y, 0, Y + h);
    g.addColorStop(0, "#15120e"); g.addColorStop(1, "#0b0a08");
    ctx.fillStyle = g; ctx.fillRect(X, Y, t.w, h);
    // brick courses and pipes along the back wall
    ctx.strokeStyle = "rgba(120, 96, 64, 0.18)"; ctx.lineWidth = 1;
    for (let yy = Y + 10; yy < Y + h; yy += 14) { ctx.beginPath(); ctx.moveTo(X, yy); ctx.lineTo(X + t.w, yy); ctx.stroke(); }
    ctx.fillStyle = "#2b2620"; ctx.fillRect(X, Y + h * 0.22, t.w, 6); ctx.fillRect(X, Y + h * 0.3, t.w, 3);
    // work lamps
    for (let x = t.x + m(3); x < t.x + t.w - m(1); x += m(7)) {
      const lx = sx(x), ly = Y + 16;
      const lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, m(2.2));
      lg.addColorStop(0, "rgba(255, 196, 110, 0.35)"); lg.addColorStop(1, "rgba(255, 196, 110, 0)");
      ctx.fillStyle = lg; ctx.fillRect(lx - m(2.2), ly - 10, m(4.4), m(3));
      ctx.fillStyle = "#ffcf7a"; ctx.fillRect(lx - 3, ly - 3, 6, 4);
    }
  }
}

function drawZiplines() {
  for (const z of level.ziplines) {
    if (!onScreen(z.x1 - m(1), z.x2 - z.x1 + m(2), 160)) continue;
    if (z.trolley === undefined) z.trolley = z.x1 + m(0.4);
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    // the masts: steel A-frames with a pulley wheel at the top, rising from the roofs
    const mast = (x, y, h) => {
      const X = sx(x), Y = sy(y);
      if (drawMeshyStand("p_mast", X, Y + h, h + m(0.35))) return;
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(X - m(0.45), Y + h); ctx.lineTo(X, Y); ctx.lineTo(X + m(0.45), Y + h); ctx.stroke();
      ctx.strokeStyle = "#4a4f57"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(X - m(0.45), Y + h); ctx.lineTo(X, Y); ctx.lineTo(X + m(0.45), Y + h); ctx.stroke();
      ctx.strokeStyle = "#2a2e34"; ctx.lineWidth = 2;
      for (let k = 0.3; k < 1; k += 0.3) { ctx.beginPath(); ctx.moveTo(X - m(0.45) * k, Y + h * k); ctx.lineTo(X + m(0.45) * k, Y + h * k); ctx.stroke(); }
      ctx.fillStyle = "#1a1c20"; ctx.beginPath(); ctx.arc(X, Y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#c79a4d"; ctx.lineWidth = 2; ctx.stroke();
    };
    mast(z.x1, z.y1 - m(0.1), m(2.7));
    mast(z.x2, z.y2 - m(0.1), m(2.7));
    // the cable, sagging, dark steel with a highlight
    const path = (off) => { ctx.beginPath(); for (let i = 0; i <= 24; i++) { const x = z.x1 + (z.x2 - z.x1) * i / 24; const y = sy(zipY(z, x)) + off; if (i) ctx.lineTo(sx(x), y); else ctx.moveTo(sx(x), y); } };
    path(0); ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 5; ctx.stroke();
    path(0); ctx.strokeStyle = "#5a5f66"; ctx.lineWidth = 2.5; ctx.stroke();
    path(-1); ctx.strokeStyle = "rgba(255, 230, 180, 0.5)"; ctx.lineWidth = 1; ctx.stroke();
    // the trolley: a wheel housing on the cable, a bar hanging from it
    const tx = sx(z.trolley), ty = sy(zipY(z, z.trolley)), by = ty + m(ZIP_HANDLE);
    ctx.fillStyle = "#2a2e34"; ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(tx - 9, ty - 7, 18, 12, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#3a3f46"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx - 4, ty + 4); ctx.lineTo(tx - 6, by); ctx.moveTo(tx + 4, ty + 4); ctx.lineTo(tx + 6, by); ctx.stroke();
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(tx - 14, by); ctx.lineTo(tx + 14, by); ctx.stroke();
    ctx.strokeStyle = "#d8a54a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx - 13, by); ctx.lineTo(tx + 13, by); ctx.stroke();
    // a nudge that it's there to grab
    if (z.trolley <= z.x1 + m(1) && players.some(p => Math.abs(p.x - z.trolley) < m(5) && !p.zip)) {
      ctx.fillStyle = `rgba(255, 214, 140, ${0.6 + Math.sin(frameTime * 6) * 0.3})`;
      ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("RUN INTO THE BAR", tx, by + 18);
    }
    ctx.restore();
  }
}

// A crowd stands about in two rows: the back row behind everyone (enforcers walk past in front of it),
// the front row nearest the camera, in front of Koda, so he can tuck in behind them.
// They stand, shift their weight, and now and then turn to look the other way.
function drawCrowds(layer) {
  const N = SPRITES.npcs;
  if (!art.npcs || !art.npcs.ready) return;
  const rows = Object.values(N.who).filter(w => w.metres > 1.4);
  const front = layer === "front";
  for (const c of level.crowds) {
    if (!onScreen(c.x, c.w, 160)) continue;
    for (let i = 0; i < c.people; i++) {
      const isFront = c.queue ? i % 2 === 0 : seeded(c.seed + i * 5.3) < 0.45;
      if (isFront !== front) continue;
      const k = seeded(c.seed + i * 3.7), who = rows[Math.floor(k * rows.length)];
      const span = c.w - m(0.8);
      // some of them are passing through: walking up and down the street, arms swinging
      const WK = SPRITES.walkers;
      if (!c.queue && art.walkers && art.walkers.ready && span > m(3) && seeded(c.seed + i * 7.1) < 0.4) {
        const speed = m(0.9 + seeded(c.seed + i * 2.9) * 0.5);
        const run = (frameTime * speed + seeded(c.seed + i * 4.3) * span * 2) % (span * 2);
        const wdir = run < span ? 1 : -1, wx = c.x + m(0.4) + (run < span ? run : span * 2 - run);
        const row = Math.floor(seeded(c.seed + i * 6.7) * WK.rows) % WK.rows;
        const wsize = WK.metres * PX * 0.93 * (front ? 1.0 : 0.88);
        const wf = Math.floor(run / m(WK.stride)) % WK.frames;
        ctx.save();
        ctx.translate(sx(wx), sy(c.y) + (front ? m(0.18) : -m(0.12)));
        if (wdir < 0) ctx.scale(-1, 1);
        ctx.filter = front ? "brightness(0.55) saturate(0.7) contrast(1.1)" : "brightness(0.72) saturate(0.8)";
        ctx.drawImage(art.walkers, wf * WK.cell, row * WK.cell, WK.cell, WK.cell, -wsize / 2, -wsize * WK.footY, wsize, wsize);
        ctx.restore();
        continue;
      }
      // stand in little groups, with a slow shuffle of weight from foot to foot
      const x = c.queue ? c.x + m(0.4) + (i + 0.5) * span / c.people + Math.sin(frameTime * 0.4 + i * 1.7) * m(0.05)
        : c.x + m(0.4) + seeded(c.seed + i * 9) * span + Math.sin(frameTime * 0.4 + i * 1.7) * m(0.12);
      const turnEvery = 4 + seeded(c.seed + i * 11) * 5;
      const dir = c.queue ? 1 : (Math.floor((frameTime + i * 2.3) / turnEvery) + i) % 2 ? 1 : -1;
      const scale = front ? 1.07 : 0.9;
      const size = who.metres * PX * 0.95 * scale;
      const frame = Math.floor(frameTime * N.fps + i * 3) % N.frames;
      const bob = Math.sin(frameTime * 1.6 + i) * 1.2;
      ctx.save();
      ctx.translate(sx(x), sy(c.y) + (front ? m(0.18) : -m(0.12)) + bob);
      if (dir < 0) ctx.scale(-1, 1);
      ctx.scale(NPC_WIDEN, 1);
      ctx.filter = front ? "brightness(0.5) saturate(0.65) contrast(1.1)" : "brightness(0.68) saturate(0.75)";
      ctx.drawImage(art.npcs, frame * N.cell, who.row * N.cell, N.cell, N.cell, -size / 2, -size * who.footY, size, size);
      ctx.restore();
    }
  }
}

function drawWardenSight(wd) {
  if (!stealthOn() || !wd.alive) return;
  const range = m((SIGHT[wd.kind] || 5.5) * enemyKind(wd).sight * (stealth.alert >= 2 ? 1.35 : 1));
  const ex = sx(wd.x), ey = sy(wd.y - m(1.45));
  ctx.save();
  const g = ctx.createLinearGradient(ex, 0, ex + wd.facing * range, 0);
  const col = wd.aware ? "255, 70, 50" : "255, 214, 120";
  g.addColorStop(0, `rgba(${col}, ${wd.aware ? 0.32 : 0.2})`); g.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + wd.facing * range, ey - m(1.1));
  ctx.lineTo(ex + wd.facing * range, ey + m(1.45));
  ctx.closePath(); ctx.fill();
  if (wd.mark > 0) {
    ctx.globalAlpha = Math.min(1, wd.mark * 2);
    ctx.fillStyle = wd.markKind === "!" ? "#ff5a3c" : "#ffd25a";
    ctx.font = "900 26px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(wd.markKind, ex, sy(wd.y - m(2.5)));
  }
  ctx.restore();
}

// The alert meter (top middle) and Music Drive's prompt.
function drawSystemsHud() {
  if (stealthOn() && level.wardens.length) {
    const x = W / 2, y = 84, a = stealth.alert;
    ctx.save();
    ctx.globalAlpha = a ? 0.95 : 0.5;
    ctx.fillStyle = "rgba(8, 8, 12, 0.55)";
    ctx.beginPath(); ctx.roundRect(x - 64, y - 12, 128, 24, 12); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < a ? (a >= 3 ? "#ff3c2a" : a === 2 ? "#ff8a3a" : "#ffd25a") : "rgba(255, 255, 255, 0.18)";
      ctx.fillRect(x - 10 + i * 18, y - 4, 14, 8);
    }
    ctx.fillStyle = players[0] && players[0].hidden ? "#7fe3ff" : "#d8d4cc";
    ctx.font = "800 11px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(players[0] && players[0].hidden ? "HIDDEN" : ALERT_NAMES[a], x - 56, y + 4);
    if (stealth.flash > 0) { ctx.strokeStyle = `rgba(255, 70, 50, ${stealth.flash})`; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
  drawTailHud();
  drawVeilHud();
  drawFlareHud();
  if (drive.active && (drive.rewinding || drive.stopT > 0.8)) {
    ctx.save();
    ctx.fillStyle = drive.rewinding ? "rgba(127, 227, 255, 0.95)" : "rgba(241, 202, 120, 0.95)";
    ctx.font = "900 22px 'Barlow Condensed', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(drive.rewinding ? "◀◀ THE SONG IS PULLING YOU BACK" : "KEEP MOVING", W / 2, H * 0.3);
    ctx.restore();
  }
}

/* ---------- market stalls and cages ---------- */

// The whole stall behind the runners; its counter again in front, so Koda can crouch behind it.
function drawStalls() {
  for (const a of level.solids) if (a.kind === "awning" && level.stalls.length && onScreen(a.x, a.w, 200)) drawSolid(a);
  for (const s of level.stalls || []) {
    if (!onScreen(s.x, s.w, 200)) continue;
    const top = s.y - m(1.75), bottom = s.y + s.h;
    drawKit("stall", s.x - m(0.25), top, s.w + m(0.5), bottom - top);
  }
}
// The counter itself, in front of the runners: a planked front with a cloth over it and goods piled
// on top, tall enough that Koda crouched behind it is out of sight.
function drawStallFronts() {
  for (const s of level.stalls || []) {
    if (!onScreen(s.x, s.w, 200)) continue;
    const x = sx(s.x), w = s.w, base = sy(s.y + s.h), top = sy(s.y) - m(0.12), h = base - top;
    ctx.save();
    ctx.lineJoin = "round";
    // planked front
    const g = ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, "#6a4527"); g.addColorStop(1, "#2c1c10");
    ctx.fillStyle = g; ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)"; ctx.lineWidth = 1.5;
    for (let px = x + m(0.42); px < x + w - 4; px += m(0.42)) { ctx.beginPath(); ctx.moveTo(px, top + 4); ctx.lineTo(px, base); ctx.stroke(); }
    // a cloth hung over the front, its hem in scallops
    const cloth = ["#5a1f1b", "#203650", "#46391a"][s.seed % 3];
    ctx.fillStyle = cloth;
    ctx.beginPath(); ctx.moveTo(x - 3, top); ctx.lineTo(x + w + 3, top);
    const hem = top + h * 0.42, sc = m(0.36);
    for (let px = x + w + 3; px > x - 3; px -= sc) ctx.quadraticCurveTo(px - sc / 2, hem + sc * 0.45, Math.max(x - 3, px - sc), hem);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.strokeRect(x, top, w, h);
    // goods on the counter: baskets and sacks
    for (let i = 0; i < 3; i++) {
      const gx = x + w * (0.18 + i * 0.32), gw = m(0.5 + seeded(s.seed + i) * 0.25), gh = m(0.3 + seeded(s.seed + i * 3) * 0.25);
      const gg = ctx.createLinearGradient(gx - gw / 2, 0, gx + gw / 2, 0);
      gg.addColorStop(0, i === 1 ? "#7a5c2c" : "#5e4220"); gg.addColorStop(1, "#2a1c0e");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(gx, top - gh * 0.45, gw / 2, gh / 1.6, 0, Math.PI, 0); ctx.lineTo(gx + gw / 2, top); ctx.lineTo(gx - gw / 2, top); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)"; ctx.lineWidth = 1;
      for (let wv = 1; wv < 3; wv++) { ctx.beginPath(); ctx.moveTo(gx - gw / 2 + 3, top - gh * 0.3 * wv); ctx.lineTo(gx + gw / 2 - 3, top - gh * 0.3 * wv); ctx.stroke(); }
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.2;
    }
    // warm light catching the top edge
    ctx.strokeStyle = "rgba(255, 200, 130, 0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 2, top + 2); ctx.lineTo(x + w - 2, top + 2); ctx.stroke();
    if (players.some(p => p.hidden && behindCounter(p))) {
      ctx.fillStyle = "rgba(120, 200, 255, 0.55)";
      ctx.fillRect(x + m(0.2), top - 3, w - m(0.4), 2);
    }
    ctx.restore();
  }
}
function drawCages() {
  for (const c of level.cages || []) {
    if (!onScreen(c.x - m(1), m(2), 100)) continue;
    const w = m(1.5), h = m(2.3), x = sx(c.x) - w / 2, y = sy(c.y) - h;
    const lift = c.open ? Math.min(1, c.t / 0.6) : 0;
    ctx.save();
    ctx.globalAlpha = 1 - lift;
    ctx.translate(0, -lift * m(1.2));
    if (drawMeshy("p_cage", x - m(0.1), y - m(0.1), w + m(0.2), h + m(0.15))) { ctx.restore(); }
    else {
    ctx.strokeStyle = "#1a1c20"; ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "#6c6f74"; ctx.lineWidth = 3;
    for (let i = 1; i < 6; i++) { const bx = x + (w * i) / 6; ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, y + h); ctx.stroke(); }
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#c79a4d"; ctx.fillRect(x + w - 10, y + h * 0.5, 8, 10);
    ctx.restore();
    }
    if (!c.open && players.some(p => Math.abs(p.x - c.x) < m(2.5))) {
      ctx.fillStyle = `rgba(255, 214, 140, ${0.7 + Math.sin(frameTime * 6) * 0.3})`;
      ctx.font = "800 13px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("HIT TO FREE", sx(c.x), y - 8);
    }
  }
}

/* ---------- checkpoint scanners, hedges, Zora up ahead ---------- */

function drawScanners() {
  for (const sc of level.scanners || []) {
    if (!onScreen(sc.x - m(1), m(2), 100)) continue;
    const X = sx(sc.x), base = sy(sc.y), top = base - sc.h, live = scannerLive(sc);
    ctx.save();
    if (!drawMeshy("p_scanner", X - m(0.9), top - m(0.35), m(1.8), sc.h + m(0.35))) {
      ctx.fillStyle = "#2a2e34"; ctx.fillRect(X - m(0.75), top, m(0.22), sc.h); ctx.fillRect(X + m(0.53), top, m(0.22), sc.h);
      ctx.fillRect(X - m(0.85), top - m(0.3), m(1.7), m(0.36));
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2;
      ctx.strokeRect(X - m(0.75), top, m(0.22), sc.h); ctx.strokeRect(X + m(0.53), top, m(0.22), sc.h); ctx.strokeRect(X - m(0.85), top - m(0.3), m(1.7), m(0.36));
    }
    if (live) {
      const t = (gateClock() * 1.6) % 1;
      ctx.fillStyle = "rgba(255, 70, 50, 0.16)"; ctx.fillRect(X - m(0.53), top, m(1.06), sc.h);
      ctx.fillStyle = "rgba(255, 90, 60, 0.85)"; ctx.shadowColor = "#ff5a3c"; ctx.shadowBlur = 12;
      ctx.fillRect(X - m(0.53), top + sc.h * t, m(1.06), 3);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = live ? "#ff4a32" : "#5cff9a";
    ctx.beginPath(); ctx.arc(X, top - m(0.12), 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawHedges() {
  for (const h of level.hedges || []) {
    if (!onScreen(h.x, h.w, 100)) continue;
    const X = sx(h.x), Y = sy(h.y), w = h.w, box = m(0.45), leaf = m(1.25);
    if (drawMeshy("p_hedge", X - 4, Y - leaf - m(0.12), w + 8, leaf + m(0.12))) {
      if (players.some(p => p.hidden && p.x > h.x && p.x < h.x + h.w)) { ctx.fillStyle = "rgba(120, 200, 255, 0.55)"; ctx.fillRect(X + 4, Y - leaf - 3, w - 8, 2); }
      continue;
    }
    ctx.save();
    ctx.lineJoin = "round"; ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2.2;
    // foliage: overlapping rounded clumps
    for (let i = 0; i < 6; i++) {
      const cx = X + w * (0.1 + i * 0.16), r = m(0.32) + seeded(h.seed + i) * m(0.12);
      ctx.fillStyle = i % 2 ? "#2c4a26" : "#355a2c";
      ctx.beginPath(); ctx.arc(cx, Y - leaf + r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = "#2f5229"; ctx.fillRect(X + 2, Y - leaf + m(0.3), w - 4, leaf - box - m(0.3));
    // stone planter box
    const g = ctx.createLinearGradient(0, Y - box, 0, Y);
    g.addColorStop(0, "#bdb4a2"); g.addColorStop(1, "#6d665a");
    ctx.fillStyle = g; ctx.fillRect(X - 3, Y - box, w + 6, box);
    ctx.strokeRect(X - 3, Y - box, w + 6, box);
    if (players.some(p => p.hidden && p.x > h.x && p.x < h.x + h.w)) { ctx.fillStyle = "rgba(120, 200, 255, 0.55)"; ctx.fillRect(X + 4, Y - leaf - 3, w - 8, 2); }
    ctx.restore();
  }
}

function drawTails() {
  for (const t of level.tails || []) {
    if ((t.state !== "on" && t.state !== "leaving") || !art.zora || !art.zora.ready) continue;
    const def = SPRITES.koda;
    const leaving = t.state === "leaving", k = leaving ? Math.min(1, t.leaveT / 1.2) : 0;
    const anim = leaving ? "idle" : t.moving ? "run" : "idle";
    const frame = !leaving && t.moving ? Math.floor(t.walk / m(0.42)) % def.animations.run.frames : frameFor(def, "idle", frameTime);
    const alpha = leaving ? Math.max(0, 1 - k * 1.1) : Math.min(1, t.fx === undefined ? 1 : t.fx);
    // as she goes she glows, lifts a little and thins out into the light
    const glowA = leaving ? 0.4 + 0.6 * k : 0.4;
    drawSheetFrame(art.zora, def, anim, frame, t.x, t.y - k * m(0.3), leaving ? -1 : 1, { glow: `rgba(255, 190, 220, ${glowA})`, blur: 6 + k * 30, alpha });
    if (leaving) {
      // a column of light where she stood, and a ring spreading out
      const X = sx(t.x), Y = sy(t.y);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const col = ctx.createLinearGradient(0, Y - m(3), 0, Y);
      col.addColorStop(0, "rgba(255, 200, 230, 0)"); col.addColorStop(1, `rgba(255, 200, 230, ${0.5 * (1 - k)})`);
      ctx.fillStyle = col; ctx.fillRect(X - m(0.5) * (1 - k * 0.6), Y - m(3), m(1) * (1 - k * 0.6), m(3));
      ctx.strokeStyle = `rgba(255, 220, 240, ${0.8 * (1 - k)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(X, Y, m(0.4) + k * m(2.2), (m(0.4) + k * m(2.2)) * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else drawConnection(t);
  }
}

// The pull between them: a thread of light from Koda to Zora that brightens as he closes in,
// and a warm glow round the screen. Too close and it flickers red.
function drawConnection(t) {
  const p = players[0], d = t.d === undefined ? 9 : t.d;
  if (d > TAIL_LOST || d < -1) return;
  const near = d < TAIL_NEAR;
  const k = near ? 1 : Math.max(0, 1 - (d - TAIL_NEAR) / (TAIL_FAR + 1 - TAIL_NEAR));
  const beat = 60 / (mission.song.bpm || mission.bpm || 90);
  const pulse = 0.75 + 0.25 * Math.sin((songClock / beat) * Math.PI * 2);
  const ax = sx(p.x), ay = sy(p.y - m(1.1)), bx = sx(t.x), by = sy(t.y - m(1.15));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const col = near ? `rgba(255, 70, 60, ${0.5 * (0.5 + Math.random() * 0.5)})` : `rgba(255, 190, 150, ${0.15 + 0.55 * k * pulse})`;
  ctx.strokeStyle = col; ctx.lineWidth = 2 + 4 * k; ctx.lineCap = "round";
  ctx.shadowColor = near ? "#ff463c" : "#ffb38a"; ctx.shadowBlur = 10 + 20 * k;
  const mx = (ax + bx) / 2, my = Math.min(ay, by) - 30 - 20 * Math.sin(frameTime * 2);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
  // motes travelling along the thread
  for (let i = 0; i < 6; i++) {
    const u = (frameTime * 0.6 + i / 6) % 1, iu = 1 - u;
    const x = iu * iu * ax + 2 * iu * u * mx + u * u * bx, y = iu * iu * ay + 2 * iu * u * my + u * u * by;
    ctx.fillStyle = `rgba(255, 225, 190, ${0.5 * k})`;
    ctx.beginPath(); ctx.arc(x, y, 2 + 2 * k, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (k > 0.05) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, near ? `rgba(200, 30, 30, ${0.25})` : `rgba(255, 150, 120, ${0.28 * k * pulse})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

function drawTailHud() {
  const t = (level.tails || []).find(q => q.state === "on");
  if (!t) return;
  const x = W / 2, y = 112;
  const col = t.band === "ok" ? "#7fe3ff" : t.band === "near" ? "#ff8a3a" : "#ffd25a";
  ctx.save();
  ctx.fillStyle = "rgba(8, 8, 12, 0.55)"; ctx.beginPath(); ctx.roundRect(x - 90, y - 11, 180, 22, 11); ctx.fill();
  ctx.fillStyle = col; ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(t.band === "ok" ? "ZORA · IN SIGHT" : t.band === "near" ? "ZORA · TOO CLOSE" : "ZORA · LOSING HER", x, y + 4);
  ctx.restore();
}

/* ===========================================================================
   MISSIONS 6 TO 15: the Veil's rules
   - Turning rooms (M06): slabs swing a quarter turn on the downbeat; flat they bridge the drop, upright they wall it.
   - Flicker (M07, M15): two sets of platforms take turns with the beat.
   - Stillness (M08): the song only plays while you stand still.
   - The Shadow (M09, M13, M14, M15): a dark mass behind you; the closer it is, the darker the edges.
   - Faith light (M10): darkness hides the way; pray at a shrine (stand still) to light it and hold your place.
   - Anger (M07, M11): getting hit and rushing fill it; standing still (or at a window) breathes it out.
     Full anger throws you out.
   - Steam valves (M11): jets on the beat.
   - Air (M12): the storm drains it; filter stations fill it.
   - Love bloom (M13): with Zora beside you, rose bridges grow across the gaps.
   - Zora's light (M14): HIT pulses light that rebuilds broken steps ahead and pushes the Shadow back.
=========================================================================== */

const veil = { hints: new Set(), anger: 0, air: 100, airT: 0, shadowX: null, shadowOn: false, still: 0, zc: null, lastWipe: 0, pulseCd: 0 };

// In free roam the things that chase you, choke you or anger you are switched off.
const FREE_OFF = { shadow: 1, dogs: 1, hound: 1, anger: 1, air: 1, stillness: 1, wither: 1 };
function partFlag(name) {
  if (freeRoam && FREE_OFF[name]) return undefined;
  const part = mission.parts[Math.min(mission.parts.length - 1, leader().cp)];
  return part ? part[name] : undefined;
}

function buildVeil(L, data) {
  const beatSolid = (kind, x, w, y, extra) => {
    const s = Object.assign({ kind, x: m(x), w: m(w), y: -m(y), h: m(0.3), dy: 0, seed: Math.round(x * 13), oneWay: true, home: -m(y), active: true }, extra || {});
    L.solids.push(s);
    return s;
  };
  L.turns = (data.turns || []).map(t => {
    const flat = beatSolid("turnflat", t.x, t.w, t.y);
    const wall = Object.assign(beatSolid("turnwall", t.x, 0.35, t.y + 3.2), { h: m(3.2), oneWay: false });
    return { x: m(t.x), w: m(t.w), y: -m(t.y), period: t.period, offset: t.offset || 0, flat, wall, ang: 0 };
  });
  L.flickers = (data.flickers || []).map(f => ({ s: beatSolid("flicker", f.x, f.w, f.y), set: f.set, period: f.period }));
  L.roses = (data.roses || []).map(r => ({ s: beatSolid("rose", r.x, r.w, r.y), grow: 0 }));
  L.broken = (data.broken || []).map(b => ({ s: beatSolid("broken", b.x, b.w, b.y), crumble: !!b.crumble, fix: b.crumble ? 1 : 0, standT: 0 }));
  for (const b of L.broken) if (!b.crumble) setActive(b.s, false);
  L.shrines = (data.shrines || []).map(s => ({ x: m(s.x), y: -m(s.y), lit: false, hold: 0 }));
  L.valves = (data.valves || []).map(v => ({ x: m(v.x), y: -m(v.y), period: v.period, offset: v.offset || 0 }));
  L.windows = (data.windows || []).map(w => ({ x: m(w.x), y: -m(w.y) }));
  L.filters = (data.filters || []).map(f => ({ x: m(f.x), y: -m(f.y), used: 0 }));
}

function setActive(s, on) {
  if (s.active === on) return;
  s.active = on;
  s.y = on ? s.home : 9e6;
}

function resetVeil() {
  veil.hints = new Set();
  veil.anger = 0; veil.air = 100; veil.airT = 0; veil.shadowX = null; veil.shadowOn = false; veil.still = 0; veil.zc = null; veil.lastWipe = 0; veil.pulseCd = 0;
}

function beatT(period, offset) { const t = gateClock() + (offset || 0); return ((t % period) + period) % period / period; }
function turnFlat(t, at) { return (((at === undefined ? gateClock() : at) + t.offset) % t.period + t.period) % t.period < t.period * 0.5; }
function flickerOn(f, at) {
  const t = ((((at === undefined ? gateClock() : at)) % f.period) + f.period) % f.period / f.period;
  return f.set === 0 ? t < 0.7 : (t >= 0.5 || t < 0.2);
}
function valveOn(v, at) { const t = ((((at === undefined ? gateClock() : at) + v.offset) % v.period) + v.period) % v.period / v.period; return t < 0.42; }

// For the bots and the rival: is something just ahead not there (or about to go)?
function beatBlockedAhead(p) {
  const ahead = (x, w) => x + w > p.x + m(0.3) && x < p.x + m(3.6);
  const nearY = y => Math.abs(y - p.y) < m(2.2);
  for (const t of level.turns || []) {
    if (t.x - p.x > m(1.4) || t.x + t.w < p.x || !nearY(t.y) || (p.x > t.x && p.ground === t.flat)) continue;
    if (!turnFlat(t) || !turnFlat(t, gateClock() + 0.75) || t.ang > 0.12) return true;
  }
  // the next flicker platform: the first one starting ahead of you
  const nextF = (level.flickers || []).filter(f => f.s.x > p.x && f.s.x - p.x < m(7) && nearY(f.s.home)).sort((a, b) => a.s.x - b.s.x)[0];
  for (const f of nextF ? [nextF] : []) {
    if (!flickerOn(f) || !flickerOn(f, gateClock() + 0.7) || !flickerOn(f, gateClock() + 1.4)) return true;
  }
  for (const v of level.valves || []) if (v.x - p.x > m(0.9) && v.x - p.x < m(2.6) && nearY(v.y) && (valveOn(v) || valveOn(v, gateClock() + 0.35) || valveOn(v, gateClock() + 0.7))) return true;
  return false;
}
function brokenAhead(p) { return (level.broken || []).some(b => !b.crumble && !b.s.active && b.s.x > p.x && b.s.x - p.x < m(6)); }

function onHurtSystems(p) {
  if (partFlag("anger")) addAnger(p, 34);
}
function addAnger(p, n) { veil.anger = Math.min(100, veil.anger + n); }
function checkAnger(p) {
  if (veil.anger < 100) return;
  veil.anger = 35;
  respawn(p, mission.id === "m07" ? "THROWN OUT OF THE VEIL" : "TOO ANGRY");
  showToast("BREATHE", "Stand still to let the anger out.", "", 1.8);
}

// The first time each thing comes up, a one-line banner says what to do.
function veilHint(key, title, line) {
  if (veil.hints.has(key)) return;
  veil.hints.add(key);
  showBanner(title, line, 2.4);
}
function nearAhead(list, p, getX, dist) { return (list || []).some(o => { const x = getX(o); return x > p.x && x - p.x < m(dist); }); }

function updateVeil(dt) {
  if (!level || !level.turns) return;
  const lead = leader(), p = players[0];
  if (nearAhead(level.turns, p, t => t.x, 8)) veilHint("turn", "THE ROOMS TURN", "CROSS WHILE THE SLAB LIES FLAT");
  if (nearAhead(level.flickers, p, f => f.s.x, 8)) veilHint("flicker", "THE FLICKER", "STEP ONLY ON WHAT'S THERE");
  if (nearAhead(level.valves, p, v => v.x, 8)) veilHint("valve", "STEAM", "TIME YOUR RUN BETWEEN THE BLASTS");
  if (nearAhead(level.roses, p, r => r.s.x, 9)) veilHint("rose", "STAY CLOSE TO ZORA", "ROSES GROW ACROSS THE GAPS WHEN SHE'S BESIDE YOU");
  if (mission.player === "zora" && nearAhead(level.broken.filter(b => !b.crumble), p, b => b.s.x, 9)) veilHint("light", "HER LIGHT", "HIT TO MEND THE BROKEN STEPS AHEAD");
  if (nearAhead(level.shrines, p, s => s.x, 6)) veilHint("shrine", "A SHRINE", "STAND STILL TO PRAY AND LIGHT THE WAY");
  if (partFlag("air")) veilHint("air", "THE STORM", "RUN PAST THE FILTERS TO KEEP YOUR AIR");
  if (partFlag("anger")) veilHint("anger", "KEEP CALM", "GETTING HIT FILLS YOUR ANGER · STAND STILL TO BREATHE");
  if (partFlag("shadow") && !twoPlayer) veilHint("shadow", "THE SHADOW", "DON'T LET IT CATCH YOU");
  // beat platforms
  for (const t of level.turns) {
    const flat = turnFlat(t);
    t.ang += ((flat ? 0 : 1) - t.ang) * Math.min(1, dt * 16);
    setActive(t.flat, flat && t.ang < 0.25);
    setActive(t.wall, !flat && t.ang > 0.75);
  }
  for (const f of level.flickers) setActive(f.s, flickerOn(f));
  // the wipeouts put everything back the way it was
  if (p.wipeouts !== veil.lastWipe) {
    veil.lastWipe = p.wipeouts;
    for (const b of level.broken) if (b.crumble) { b.fix = 1; b.standT = 0; setActive(b.s, true); }
    for (const s of level.solids) if (s.withered) { s.withered = false; s.wither = 0; s.y = s.home2; }
    if (veil.shadowX !== null) veil.shadowX = Math.min(veil.shadowX, p.x - m(14));
  }
  // love bloom: Zora beside you, roses grow across the gaps
  const bloom = partFlag("bloom");
  if (bloom) {
    if (!veil.zc) veil.zc = { x: p.x - m(1.5), y: p.y };
    const want = p.x - m(1.4) * p.facing, dx = want - veil.zc.x;
    veil.zc.x += Math.sign(dx) * Math.min(Math.abs(dx), m(6.2) * dt);
    veil.zc.y += (p.y - m(0.4) - veil.zc.y) * Math.min(1, dt * 4);
  } else veil.zc = null;
  for (const r of level.roses) {
    const near = veil.zc && Math.abs(veil.zc.x - (r.s.x + r.s.w / 2)) < m(6) && Math.abs(p.x - (r.s.x + r.s.w / 2)) < m(7);
    r.grow = Math.max(0, Math.min(1, r.grow + (near ? dt / 0.6 : -dt / 2.5)));
    setActive(r.s, r.grow > 0.7);
  }
  // Zora's light: HIT pulses, rebuilding broken steps ahead and pushing the Shadow back
  veil.pulseCd = Math.max(0, veil.pulseCd - dt);
  if (mission.player === "zora") {
    for (const q of players) {
      if (ATTACK_STATES.has(q.state) && !q._pulsed && veil.pulseCd <= 0) {
        q._pulsed = true; veil.pulseCd = 0.6;
        let fixed = 0;
        for (const b of level.broken) if (!b.crumble && !b.s.active && b.s.x > q.x - m(1) && b.s.x < q.x + m(9)) { setActive(b.s, true); b.fix = 0; fixed++; burst(b.s.x + b.s.w / 2, b.s.home, "#ffe08a", 14, 200); }
        if (veil.shadowX !== null) veil.shadowX -= m(5);
        burst(q.x, q.y - m(1), "#fff1b0", 16, 260);
        if (fixed) showToast("LIGHT", fixed > 1 ? fixed + " STEPS RESTORED" : "A STEP RESTORED", "ko", 0.8);
      }
      if (!ATTACK_STATES.has(q.state)) q._pulsed = false;
    }
  }
  for (const b of level.broken) {
    if (!b.s.active) continue;
    if (!b.crumble) { b.fix = Math.min(1, b.fix + dt * 3); continue; }
    if (players.some(q => q.ground === b.s)) b.standT += dt;
    if (b.standT > 0.35) { setActive(b.s, false); burst(b.s.x + b.s.w / 2, b.s.home, "#b49a7a", 16, 160); }
  }
  // the garden withers behind you
  if (partFlag("wither")) {
    for (const s of level.solids) {
      if (s.withered || !(s.kind === "roof" || s.kind === "catwalk" || s.kind === "garden") || s.x + s.w > lead.x - m(7) || s.x + s.w < lead.x - m(30)) continue;
      s.wither = (s.wither || 0) + dt;
      if (s.wither > 0.8) { s.withered = true; s.home2 = s.y; s.y = 9e6; }
    }
  }
  // stillness: moving does nothing to the song, standing lets it play (the clock is handled in driveHoldsClock)
  veil.still = Math.abs(p.vx) < 20 && p.ground ? veil.still + dt : 0;
  // anger
  if (partFlag("anger")) {
    if (p.boostTime > 0 || p.dash > 0) addAnger(p, 9 * dt);
    const atWindow = level.windows.some(w => Math.abs(w.x - p.x) < m(1.6) && Math.abs(w.y - p.y) < m(1.5));
    if (veil.still > 0.3) veil.anger = Math.max(0, veil.anger - (atWindow ? 45 : 12) * dt);
    if (atWindow && veil.still > 0.3) {
      const w = level.windows.find(o => Math.abs(o.x - p.x) < m(1.6));
      if (w && !(w.breathAt > runTime - 9)) { w.breathAt = runTime; slowSong(4.5); sfx.breathe(); showToast("BREATHE", "The song slows with you.", "ko", 1.6); }
    }
    else veil.anger = Math.max(0, veil.anger - 2 * dt);
    checkAnger(p);
  } else veil.anger = Math.max(0, veil.anger - 20 * dt);
  // steam valves
  for (const v of level.valves) {
    const on = valveOn(v);
    if (on && !v.wasOn && Math.abs(v.x - p.x) < m(16) && !reading) sfx.steam();
    v.wasOn = on;
    if (!on) continue;
    for (const q of players) if (Math.abs(q.x - v.x) < m(0.5) && q.y > v.y - m(2.4) && q.y <= v.y + 4 && q.invuln <= 0) { hurtPlayer(q, v.x, {}); }
  }
  // air in the storm
  if (partFlag("air")) {
    veil.air = Math.max(0, veil.air - 3.6 * dt);
    for (const f of level.filters) if (Math.abs(f.x - p.x) < m(1.8) && Math.abs(f.y - p.y) < m(2)) { if (veil.air < 99) { f.used = 1; showToast("AIR", "Filter station.", "", 0.8); } veil.air = 100; }
    if (veil.air <= 0) { veil.airT += dt; if (veil.airT > 1.6) { veil.airT = 0; hurtPlayer(p, p.x - p.facing, {}); } }
  } else veil.air = Math.min(100, veil.air + 30 * dt);
  // shrines: stand still to pray
  for (const s of level.shrines) {
    if (s.lit) continue;
    if (Math.abs(s.x - p.x) < m(1.4) && Math.abs(s.y - p.y) < m(1.2) && veil.still > 0) {
      s.hold += dt;
      if (s.hold > 1.0) { s.lit = true; p.shrine = { x: s.x, y: s.y }; giveFlare(p); burst(s.x, s.y - m(1), "#7fb6ff", 24, 220);
        sfx.shrine(); shake = Math.max(shake, 0.35); flash = Math.max(flash || 0, 0.35); rumble(p.id - 1, 0.5, 300); showToast("SHRINE LIT", "The way is lit. You'll come back here.", "ko", 1.6); }
    } else s.hold = 0;
  }
  // the Shadow
  const pace = partFlag("shadow");
  if (pace && !twoPlayer) {
    if (veil.shadowX === null || !veil.shadowOn) { veil.shadowX = lead.x - m(16); veil.shadowOn = true; }
    const held = players.some(q => q.fightWith) || reading || inward.active;
    if (!held) veil.shadowX += m(pace) * (lead.climb ? 0.3 : 1) * dt;
    veil.shadowX = Math.max(veil.shadowX, lead.x - m(16));
    if (veil.shadowX > lead.x + m(2)) veil.shadowX = lead.x - m(14);
    if (veil.shadowX > lead.x - m(0.4) && lead.invuln <= 0) {
      respawn(lead, "THE SHADOW CAUGHT YOU");
      veil.shadowX = lead.x - m(14);
    }
  } else veil.shadowOn = false;
}

/* ---------- drawing ---------- */

function drawBeatSolids() {
  const plank = (x, y, w, h, col, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = col; ctx.fillRect(sx(x), sy(y), w, h);
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(sx(x), sy(y), w, h);
    ctx.restore();
  };
  for (const t of level.turns || []) {
    if (!onScreen(t.x, t.w, 100)) continue;
    // the slab swings round its near edge: flat across the gap, or upright as a wall
    const a = t.ang * Math.PI / 2, len = t.w;
    ctx.save();
    ctx.translate(sx(t.x), sy(t.y));
    ctx.rotate(-a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "#c4b59a"); g.addColorStop(0.3, "#6a5d4c"); g.addColorStop(1, "#1f1a15");
    ctx.fillStyle = g; ctx.fillRect(0, 0, len, m(0.3));
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(0, 0, len, m(0.3));
    ctx.fillStyle = "rgba(255, 214, 140, 0.8)"; ctx.fillRect(0, 0, len, 2);
    ctx.restore();
    // a ring on the hinge that fills as the next turn comes
    const k = beatT(t.period, t.offset) * 2 % 1;
    ctx.strokeStyle = "rgba(190, 170, 255, 0.85)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), 8, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
  }
  for (const f of level.flickers || []) {
    const s = f.s;
    if (!onScreen(s.x, s.w, 100)) continue;
    const on = s.active, soon = on && !flickerOn(f, gateClock() + 0.5);
    const wid = sectionAt(s.x + s.w / 2).world;
    // a slab of the same stone as the painting; the two sets glow faintly different colours
    const glow = f.set ? "rgba(120, 190, 255," : "rgba(255, 190, 110,";
    if (on) {
      drawFloatStone(s.x, s.home, s.w, m(0.9), s.seed + f.set * 7, wid === "de" ? "de" : "ve", soon ? 0.55 + Math.sin(frameTime * 30) * 0.3 : 1);
      ctx.fillStyle = glow + " 0.35)"; ctx.fillRect(sx(s.x), sy(s.home) - 3, s.w, 3);
    } else {
      // gone: just its dust, hanging where it will come back
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const u = seeded(s.seed + i * 2.3), v = seeded(s.seed + i * 5.7);
        const px = sx(s.x) + u * s.w, py = sy(s.home) + v * m(0.6) + Math.sin(frameTime * 1.7 + i) * 5;
        ctx.fillStyle = glow + " " + (0.25 + 0.2 * Math.sin(frameTime * 3 + i)) + ")";
        ctx.beginPath(); ctx.arc(px, py, 1.5 + 2 * v, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  for (const r of level.roses || []) {
    const s = r.s;
    if (!onScreen(s.x, s.w, 100)) continue;
    // vines reaching across from both sides, meeting as they grow
    const reach = s.w / 2 * r.grow, y = sy(s.home);
    ctx.save(); ctx.strokeStyle = "#2f5a2c"; ctx.lineWidth = 6; ctx.lineCap = "round";
    for (const side of [0, 1]) {
      const x0 = sx(s.x) + (side ? s.w : 0), dir = side ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(x0, y);
      for (let i = 1; i <= 8; i++) ctx.lineTo(x0 + dir * reach * i / 8, y + Math.sin(i + frameTime * 2) * 3);
      ctx.stroke();
      for (let i = 1; i <= 4; i++) {
        if (reach * i / 4 < 6) continue;
        ctx.fillStyle = i % 2 ? "#c2384a" : "#e05a6e";
        ctx.beginPath(); ctx.arc(x0 + dir * reach * i / 4.2, y - 4, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  for (const b of level.broken || []) {
    const s = b.s;
    if (!onScreen(s.x, s.w, 100)) continue;
    if (b.crumble) { if (s.active) plank(s.x, s.home, s.w, m(0.25), "#8a7350", b.standT > 0 ? 0.6 : 0.9); continue; }
    if (s.active) {
      plank(s.x, s.home, s.w, m(0.3), "#d8b04a", 1);
      if (b.fix < 1) { ctx.fillStyle = `rgba(255, 240, 180, ${1 - b.fix})`; ctx.fillRect(sx(s.x), sy(s.home) - 4, s.w, m(0.3) + 8); }
    } else {
      // pieces hanging apart in the air, waiting for her light
      ctx.save(); ctx.globalAlpha = 0.55;
      for (let i = 0; i < 4; i++) {
        const px = s.x + s.w * (i / 4), off = Math.sin(frameTime * 1.5 + i * 2) * 6 + (i % 2 ? 10 : -6);
        ctx.fillStyle = "#b8963e"; ctx.fillRect(sx(px) + 3, sy(s.home) + off, s.w / 4 - 6, m(0.22));
        ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 1.5; ctx.strokeRect(sx(px) + 3, sy(s.home) + off, s.w / 4 - 6, m(0.22));
      }
      ctx.restore();
    }
  }
  for (const s of level.solids) {
    if (!s.wither || s.withered || !onScreen(s.x, s.w, 50)) continue;
    ctx.fillStyle = `rgba(60, 40, 30, ${Math.min(0.8, s.wither)})`; ctx.fillRect(sx(s.x), sy(s.y), s.w, m(0.5));
  }
}

function drawValves() {
  for (const v of level.valves || []) {
    if (!onScreen(v.x - m(1), m(2), 100)) continue;
    // a riser pipe out of the floor with a flange, a red valve wheel and an open nozzle at the top
    const X = sx(v.x), base = sy(v.y), top = base - m(1.0), pw = m(0.22);
    ctx.save();
    ctx.lineJoin = "round";
    if (drawMeshyStand("p_valve", X + m(0.35), base + 2, m(1.08))) { /* the modelled riser */ } else {
    const pg = ctx.createLinearGradient(X - pw / 2, 0, X + pw / 2, 0);
    pg.addColorStop(0, "#8a5a3a"); pg.addColorStop(0.45, "#5a3a26"); pg.addColorStop(1, "#2a1a10");
    ctx.fillStyle = pg; ctx.fillRect(X - pw / 2, top, pw, base - top);
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(X - pw / 2, top, pw, base - top);
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(X - pw * 0.8, base - 6, pw * 1.6, 6); ctx.strokeRect(X - pw * 0.8, base - 6, pw * 1.6, 6);   // floor flange
    ctx.fillRect(X - pw * 0.75, top - 4, pw * 1.5, 7); ctx.strokeRect(X - pw * 0.75, top - 4, pw * 1.5, 7);    // nozzle lip
    ctx.fillStyle = "#0b0906"; ctx.beginPath(); ctx.ellipse(X, top - 4, pw * 0.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    // the valve wheel on the side
    const wy = top + m(0.45);
    ctx.strokeStyle = "#b8322a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(X + pw * 0.9, wy, 4, 9, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X + pw / 2, wy); ctx.lineTo(X + pw * 0.9, wy); ctx.stroke();
    }
    ctx.restore();
    const on = valveOn(v), soon = !on && valveOn(v, gateClock() + 0.5);
    // a hiss and a wisp just before it blows
    if (soon) {
      ctx.fillStyle = `rgba(235, 240, 245, ${0.25 + Math.sin(frameTime * 40) * 0.15})`;
      ctx.beginPath(); ctx.arc(X + Math.sin(frameTime * 20) * 2, top - 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (on) {
      // the jet, straight up out of the nozzle and spreading as it rises
      for (let i = 0; i < 11; i++) {
        const t = (frameTime * 2.4 + i / 11) % 1;
        ctx.fillStyle = `rgba(235, 240, 245, ${0.6 * (1 - t)})`;
        ctx.beginPath(); ctx.arc(X + Math.sin(i * 3 + frameTime * 5) * 10 * t, top - 6 - t * m(1.8), 4 + t * 24, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(250, 252, 255, 0.85)";
      ctx.beginPath(); ctx.moveTo(X - pw * 0.4, top - 4); ctx.lineTo(X + pw * 0.4, top - 4); ctx.lineTo(X + 7, top - 26); ctx.lineTo(X - 7, top - 26); ctx.closePath(); ctx.fill();
    }
  }
  for (const w of level.windows || []) {
    if (!onScreen(w.x - m(2), m(4), 100)) continue;
    // a home's window set in a stretch of wall: warm light behind thin curtains, a sill, light spilling on the ground
    const X = sx(w.x), base = sy(w.y), Y = base - m(2.7), ww = m(1.1), wh = m(1.25);
    const flick = 0.92 + Math.sin(frameTime * 7.3 + w.x) * 0.04 + Math.sin(frameTime * 13.1) * 0.03;
    ctx.save();
    ctx.lineJoin = "round";
    // the whole home: a house front standing on the street, its ground floor window lit
    const homes = MESHY_BUILDINGS[sectionAt(w.x).world] || MESHY_BUILDINGS.lc;
    const hr = meshyReady() && MESHY_KIT[homes[Math.floor(seeded(w.x * 0.37) * homes.length) % homes.length]];
    if (hr) {
      const hw = m(5.2), hh = hw * hr[3] / hr[2];
      ctx.drawImage(art.meshyKit, hr[0], hr[1], hr[2], hr[3], X - hw / 2, base - hh + 4, hw, hh);
      ctx.fillStyle = "rgba(20, 14, 12, 0.55)"; ctx.fillRect(X - ww / 2 - 10, Y - 10, ww + 20, wh + 20);
    } else {
      // the wall around it
      const wall = ctx.createLinearGradient(0, Y - m(0.5), 0, base);
      wall.addColorStop(0, "rgba(40, 30, 26, 0)"); wall.addColorStop(0.25, "rgba(46, 34, 28, 0.95)"); wall.addColorStop(1, "rgba(30, 22, 18, 0.95)");
      ctx.fillStyle = wall; ctx.fillRect(X - m(1.2), Y - m(0.5), m(2.4), base - Y + m(0.5));
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)"; ctx.lineWidth = 1;
      for (let yy = Y; yy < base; yy += 9) { ctx.beginPath(); ctx.moveTo(X - m(1.2), yy); ctx.lineTo(X + m(1.2), yy); ctx.stroke(); }
    }
    {
    // the light inside
    const glass = ctx.createRadialGradient(X, Y + wh * 0.55, 4, X, Y + wh * 0.5, ww);
    glass.addColorStop(0, `rgba(255, 214, 150, ${0.95 * flick})`); glass.addColorStop(1, `rgba(196, 120, 52, ${0.9 * flick})`);
    ctx.fillStyle = glass; ctx.fillRect(X - ww / 2, Y, ww, wh);
    // curtains drawn to the sides
    ctx.fillStyle = "rgba(120, 44, 36, 0.85)";
    ctx.beginPath(); ctx.moveTo(X - ww / 2, Y); ctx.quadraticCurveTo(X - ww * 0.18, Y + wh * 0.5, X - ww / 2, Y + wh); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X + ww / 2, Y); ctx.quadraticCurveTo(X + ww * 0.18, Y + wh * 0.5, X + ww / 2, Y + wh); ctx.closePath(); ctx.fill();
    // frame, bars and sill
    ctx.strokeStyle = "#3b2416"; ctx.lineWidth = 5; ctx.strokeRect(X - ww / 2, Y, ww, wh);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y + wh); ctx.moveTo(X - ww / 2, Y + wh * 0.5); ctx.lineTo(X + ww / 2, Y + wh * 0.5); ctx.stroke();
    ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(X - ww / 2 - 3, Y - 3, ww + 6, wh + 6);
    ctx.fillStyle = "#4a3020"; ctx.fillRect(X - ww / 2 - 8, Y + wh + 2, ww + 16, 6); ctx.strokeRect(X - ww / 2 - 8, Y + wh + 2, ww + 16, 6);
    }
    // the light falling on the ground in front
    ctx.globalCompositeOperation = "lighter";
    const spill = ctx.createRadialGradient(X, base, 2, X, base, m(1.8));
    spill.addColorStop(0, `rgba(255, 180, 100, ${0.22 * flick})`); spill.addColorStop(1, "rgba(255, 180, 100, 0)");
    ctx.fillStyle = spill; ctx.beginPath(); ctx.ellipse(X, base, m(1.8), m(0.35), 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (players.some(p => Math.abs(p.x - w.x) < m(2.5)) && partFlag("anger")) {
      ctx.fillStyle = "rgba(255, 214, 160, 0.85)"; ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("STAND STILL TO BREATHE", X, Y - m(0.7));
    }
  }
  for (const f of level.filters || []) {
    if (!onScreen(f.x - m(1), m(2), 100)) continue;
    const X = sx(f.x), Y = sy(f.y);
    if (!drawMeshyStand("p_filter", X, Y + 2, m(1.8))) {
      ctx.fillStyle = "#3a4048"; ctx.fillRect(X - m(0.35), Y - m(1.8), m(0.7), m(1.8));
      ctx.strokeStyle = "#0b0906"; ctx.lineWidth = 2; ctx.strokeRect(X - m(0.35), Y - m(1.8), m(0.7), m(1.8));
    }
    ctx.fillStyle = `rgba(127, 227, 255, ${0.6 + Math.sin(frameTime * 4) * 0.3})`;
    ctx.beginPath(); ctx.arc(X, Y - m(1.4), 7, 0, Math.PI * 2); ctx.fill();
  }
  for (const s of level.shrines || []) {
    if (!onScreen(s.x - m(1), m(2), 100)) continue;
    const X = sx(s.x), Y = sy(s.y) - m(1.35);
    const lit = s.lit ? 1 : s.hold;
    drawMeshyStand("p_shrine", X, sy(s.y) + 2, m(2.0));
    ctx.save();
    ctx.fillStyle = `rgba(110, 170, 255, ${0.35 + lit * 0.6})`; ctx.shadowColor = "#6ea0ff"; ctx.shadowBlur = 10 + lit * 30;
    ctx.beginPath(); ctx.ellipse(X, Y, 4 + lit * 4, 9 + lit * 6 + Math.sin(frameTime * 9) * 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (!s.lit && players.some(p => Math.abs(p.x - s.x) < m(3))) {
      ctx.fillStyle = "rgba(170, 200, 255, 0.85)"; ctx.font = "800 13px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(s.hold > 0 ? "PRAYING…" : "STAND STILL TO PRAY", X, Y - 24);
    }
  }
}

function drawZoraCompanion() {
  if (!veil.zc || !art.zora || !art.zora.ready) return;
  const def = SPRITES.koda, p = players[0];
  const moving = Math.abs(p.vx) > 40;
  // flying: stretched out level, arms reaching forward, legs trailing, riding a ribbon of light
  const f = p.facing || 1, bob = Math.sin(frameTime * 2.2) * 6;
  const X = sx(veil.zc.x), Y = sy(veil.zc.y - m(0.9)) + bob;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 14; i++) {
    const u = i / 14, tx = X - f * (20 + u * m(2.2)), ty = Y - m(0.55) + Math.sin(frameTime * 3 + u * 6) * 8 * u;
    ctx.fillStyle = `rgba(255, ${170 + 60 * u}, 210, ${0.35 * (1 - u)})`;
    ctx.beginPath(); ctx.arc(tx, ty, 9 * (1 - u) + 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(X, Y - m(0.5)); ctx.rotate(f * (moving ? -0.08 : 0.05) + Math.sin(frameTime * 1.7) * 0.04); ctx.translate(-X, -(Y - m(0.5)));
  drawSheetFrame(art.zora, def, "dash", 2, veil.zc.x, veil.zc.y - m(0.9) + bob, f, { glow: "rgba(255, 170, 200, 0.75)", blur: 16, alpha: 0.95 });
  ctx.restore();
}

function drawShadowFront() {
  if (!veil.shadowOn || veil.shadowX === null) return;
  const X = sx(veil.shadowX);
  if (X < -60) return;
  ctx.save();
  const g = ctx.createLinearGradient(X - m(6), 0, X + m(1.5), 0);
  g.addColorStop(0, "rgba(6, 2, 12, 0.98)"); g.addColorStop(0.75, "rgba(12, 4, 24, 0.9)"); g.addColorStop(1, "rgba(12, 4, 24, 0)");
  ctx.fillStyle = g; ctx.fillRect(Math.max(0, X - m(30)), 0, Math.min(W, X + m(1.5)) - Math.max(0, X - m(30)), H);
  // tendrils reaching forward
  ctx.strokeStyle = "rgba(20, 6, 36, 0.85)"; ctx.lineWidth = 9; ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const y = H * (0.15 + i * 0.12), reach = m(1.2) + Math.sin(frameTime * 2.4 + i) * m(0.8);
    ctx.beginPath(); ctx.moveTo(X, y); ctx.quadraticCurveTo(X + reach * 0.6, y - 20, X + reach, y + Math.sin(frameTime * 3 + i) * 14); ctx.stroke();
  }
  ctx.fillStyle = "rgba(190, 80, 255, 0.9)"; ctx.shadowColor = "#b050ff"; ctx.shadowBlur = 16;
  const ey = H * 0.42 + Math.sin(frameTime * 1.3) * 20;
  ctx.beginPath(); ctx.ellipse(X - m(1.2), ey, 7, 3, 0, 0, Math.PI * 2); ctx.ellipse(X - m(0.5), ey, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Darkness, with light where there is light: Koda, lit shrines, lanterns.
let darkCanvas = null;
function drawDarkness() {
  if (!partFlag("dark")) return;
  if (!darkCanvas) { darkCanvas = document.createElement("canvas"); darkCanvas.width = W; darkCanvas.height = H; }
  const k = darkCanvas.getContext("2d");
  k.globalCompositeOperation = "source-over";
  k.clearRect(0, 0, W, H);
  k.fillStyle = "rgba(2, 3, 10, 0.94)"; k.fillRect(0, 0, W, H);
  k.globalCompositeOperation = "destination-out";
  const hole = (x, y, r) => { const g = k.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); k.fillStyle = g; k.beginPath(); k.arc(x, y, r, 0, Math.PI * 2); k.fill(); };
  for (const p of players) hole(sx(p.x), sy(p.y) - m(0.9), m(3.4));
  for (const s of level.shrines) hole(sx(s.x), sy(s.y) - m(1), s.lit ? m(16) : m(1.6) + s.hold * m(6));
  for (const d of level.decor) if (d.art === "lantern" && onScreen(m(d.x), 0, 200)) hole(sx(m(d.x)), sy(-m(d.y)), m(2.4));
  ctx.drawImage(darkCanvas, 0, 0);
}

function drawVeilHud() {
  const bars = [];
  if (partFlag("anger") || veil.anger > 1) bars.push(["ANGER", veil.anger / 100, veil.anger > 70 ? "#ff3c2a" : "#ff8a3a"]);
  if (partFlag("air")) bars.push(["AIR", veil.air / 100, veil.air < 25 ? "#ff8a3a" : "#7fe3ff"]);
  bars.forEach(([name, k, col], i) => {
    const x = 24, y = 92 + i * 24;
    ctx.save();
    ctx.fillStyle = "rgba(8, 8, 12, 0.6)"; ctx.beginPath(); ctx.roundRect(x, y - 10, 170, 20, 10); ctx.fill();
    ctx.fillStyle = "#d8d4cc"; ctx.font = "800 11px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "left"; ctx.fillText(name, x + 10, y + 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fillRect(x + 50, y - 3, 108, 6);
    ctx.fillStyle = col; ctx.fillRect(x + 50, y - 3, 108 * Math.max(0, Math.min(1, k)), 6);
    ctx.restore();
  });
  if (partFlag("stillness")) {
    ctx.save(); ctx.font = "900 16px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = veil.still > 0.25 ? "rgba(127, 227, 255, 0.9)" : "rgba(241, 202, 120, 0.8)";
    ctx.fillText(veil.still > 0.25 ? "STILL · THE SONG PLAYS" : "MOVING · THE SONG WAITS", W / 2, 138);
    ctx.restore();
  }
  // anger and the Shadow both close in on the edges
  const red = partFlag("anger") ? veil.anger / 100 : 0;
  const fear = veil.shadowOn && veil.shadowX !== null ? Math.max(0, 1 - (leader().x - veil.shadowX) / m(10)) : 0;
  if (red > 0.3 || fear > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, red > fear ? `rgba(160, 20, 10, ${(red - 0.3) * 0.8})` : `rgba(10, 0, 20, ${fear * 0.85})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

/* ===========================================================================
   The last pieces
   - The hound (M03, M12): follows Koda's scent a couple of seconds behind. Water and mud wash the scent out.
   - Flare (M10 on): each lit shrine gives a flare. HIT facing an enforcer who's seen you blinds him; one more hit drops him.
   - Fear (M09): with the Shadow close, every jump carries less far, so the gaps feel longer.
   - Water slows the hunters (and every enforcer) to a wade.
=========================================================================== */

const hound = { on: false, x: 0, y: 0, lost: 0, pause: 0, run: 0, facing: 1, shown: false };
const scent = [];
function inWater(x) { return (level.mud || []).some(mu => x > mu.x - 4 && x < mu.x + mu.w + 4); }

function resetHound() { hound.on = false; hound.lost = 0; hound.pause = 0; hound.shown = false; scent.length = 0; }

function updateHound(dt) {
  const p = players[0];
  if (hound.cp !== p.cp) { hound.cp = p.cp; if (hound.lost < 0) hound.lost = 0; }
  if (!partFlag("hound") || twoPlayer) { hound.on = false; hound.lost = 0; return; }
  if (!hound.on && !hound.lost) {
    hound.on = true; hound.x = p.x - m(14); hound.y = p.y; scent.length = 0;
    if (!hound.shown) { hound.shown = true; showBanner("THE HOUND", "IT FOLLOWS YOUR SCENT · RUN THROUGH WATER TO LOSE IT", 2.4); }
  }
  if (!hound.on) return;
  if (p.mudT > 0 || inWater(p.x)) {
    if (scent.length) { scent.length = 0; hound.lost = 4; showToast("SCENT LOST", "The water washed it out.", "ko", 1.4); }
  } else if (p.ground || p.climb) {
    if (!scent.length || runTime - scent[scent.length - 1].t > 0.1) scent.push({ t: runTime, x: p.x, y: p.y });
    if (scent.length > 600) scent.splice(0, scent.length - 600);
  }
  if (hound.lost > 0) {
    hound.lost -= dt;
    if (hound.lost <= 0) { hound.on = false; hound.lost = -1; }   // gives up for this part
    return;
  }
  hound.pause = Math.max(0, hound.pause - dt);
  // the point on the trail about two seconds back
  let target = null;
  for (let i = scent.length - 1; i >= 0; i--) if (runTime - scent[i].t >= 2.0) { target = scent[i]; break; }
  if (!target && scent.length) target = scent[0];
  if (!target || hound.pause > 0 || reading) return;
  // never more than 16 m behind; it can always find you again
  if (p.x - hound.x > m(16)) hound.x = p.x - m(16);
  const dx = target.x - hound.x;
  const step = m(inWater(hound.x) ? 3 : 7) * dt;
  hound.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
  hound.y += (target.y - hound.y) * Math.min(1, dt * 8);
  hound.facing = dx >= 0 ? 1 : -1;
  hound.run += Math.min(Math.abs(dx), step);
  if (Math.abs(hound.x - p.x) < m(0.7) && Math.abs(hound.y - p.y) < m(1) && p.invuln <= 0) {
    hurtPlayer(p, hound.x, {});
    hound.pause = 1.6;
  }
}


function drawHound() {
  if (!hound.on) return;
  const X = sx(hound.x), Y = sy(hound.y);
  drawDog(X, Y, hound.facing, hound.run / m(0.55), { mode: hound.lost > 0 ? "sniff" : "run", tint: "#2a2420" });
  if (hound.lost > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)"; ctx.font = "800 18px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("?", X, Y - m(1.3));
  }
}

/* ===========================================================================
   The dogs (M03, M04, M09, M15): a part with "dogs" lets a pack loose behind you a few seconds in.
   They are quicker than you on the flat. Lose them by climbing out of reach (they can't climb),
   running through water or mud, or by hitting them (two hits and a dog runs off).
   They tire after a while and give up. Later missions' dogs are quicker.
=========================================================================== */

const dogs = [];
const dogPack = { part: -1, due: [], shown: false, lastX: 0 };
function resetDogs() { dogs.length = 0; dogPack.part = -1; dogPack.due = []; dogPack.lastX = 0; }

// The top a dog can stand on under a point (floorUnder asks for room for Koda; a dog needs far less).
function dogFloor(x, y) {
  let best = null;
  for (const s of level.solids) {
    if (s.gate || s.kind === "gate" || x < s.x || x > s.x + s.w || s.y < y - 2) continue;
    if (!best || s.y < best.y) best = s;
  }
  if (!best) return null;
  const sec = sectionAt(x);
  if (sec.fallY && best.y >= sec.fallY) return null;
  return { x, y: best.y };
}
// After a wipeout the pack goes back and comes again a few seconds later.
function dogsRespawn() {
  dogs.length = 0; dogPack.due = [];
  const n = partFlag("dogs") || 0;
  for (let i = 0; i < n; i++) dogPack.due.push(runTime + 3.5 + i * 1.1);
  dogPack.lastX = 0;
}
function dogSpeed() { return [6.0, 6.4, 6.8][enemyTierIndex()]; }

function updateDogs(dt) {
  const lead = leader();
  if (!lead) return;
  // back at a checkpoint after a wipeout: the pack starts again
  dogPack.lastX = lead.x;
  if (lead.cp !== dogPack.part) {
    dogPack.part = lead.cp;
    dogs.length = 0; dogPack.due = [];
    const n = partFlag("dogs") || 0;
    for (let i = 0; i < n; i++) dogPack.due.push(runTime + 2.5 + i * 1.1);
  }
  while (dogPack.due.length && runTime >= dogPack.due[0] && !reading) {
    dogPack.due.shift();
    // just off screen behind, on ground that's really there
    let sx0 = null, sy0 = lead.y;
    for (let back = 15 + dogs.length * 1.4; back >= 6; back -= 1) {
      const f = dogFloor(lead.x - m(back), lead.y - m(1.3));
      if (f && Math.abs(f.y - lead.y) < m(3)) { sx0 = lead.x - m(back); sy0 = f.y; break; }
    }
    if (sx0 === null) continue;
    dogs.push({ x: sx0, y: sy0, vy: 0, facing: 1, run: 0, t: 0, state: "run", stun: 0,
      biteCd: 0, hits: 0, leap: null, bayT: 0, barkT: 0.6 + Math.random(), alpha: 1, seed: Math.random() * 6 });
    sfx.bark();
    if (!dogPack.shown) { dogPack.shown = true; showBanner("DOGS", "CLIMB OUT OF REACH · RUN THROUGH WATER · OR HIT THEM", 2.6); }
  }
  const sp = dogSpeed();
  for (let i = dogs.length - 1; i >= 0; i--) {
    const d = dogs[i];
    d.t += dt; d.biteCd = Math.max(0, d.biteCd - dt); d.stun = Math.max(0, d.stun - dt);
    // the nearest runner still going
    let p = null;
    for (const o of players) if (!o.finished && (!p || Math.abs(o.x - d.x) < Math.abs(p.x - d.x))) p = o;
    if (!p) { d.state = "quit"; }
    // giving up: tired out, too far behind, or lost the scent in the water
    if (d.state !== "quit" && p) {
      if (d.t > 14 || p.x - d.x > m(24) || d.hits >= 2) d.state = "quit";
      else if ((p.mudT > 0 || inWater(p.x)) && Math.abs(p.x - d.x) > m(1.5)) { d.state = "quit"; showToast("THEY LOST YOUR SCENT", "", "ko", 1.1); }
    }
    if (d.state === "quit") {
      d.alpha -= dt * 0.7;
      if (d.leap) d.leap = null;
      d.facing = -1; d.x -= m(3) * dt; d.run += m(3) * dt;
      if (d.alpha <= 0) dogs.splice(i, 1);
      continue;
    }
    // a leap in progress: up a step, or across a gap
    if (d.leap) {
      const L = d.leap; L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      d.x = L.x0 + (L.x1 - L.x0) * k;
      d.y = L.y0 + (L.y1 - L.y0) * k - Math.sin(k * Math.PI) * L.h;
      if (k >= 1) d.leap = null;
      continue;
    }
    if (d.stun > 0) { d.state = "yelp"; continue; }
    const dx = p.x - d.x, dir = Math.sign(dx) || d.facing;
    d.facing = dir;
    const above = d.y - p.y;   // how far above the dog the runner is
    // out of reach above: it bays at the foot of the climb
    if (above > m(1.6) && Math.abs(dx) < m(2)) {
      d.state = "bay"; d.bayT += dt; d.t += dt * 0.6;
      d.barkT -= dt; if (d.barkT <= 0) { d.barkT = 0.7 + Math.random() * 0.5; if (onScreen(d.x, 0, 0)) sfx.bark(); }
      continue;
    }
    // a bite: close, and Koda on its level
    if (Math.abs(dx) < m(0.8) && Math.abs(above) < m(0.9) && d.biteCd <= 0 && p.invuln <= 0 && p.state !== "slide") {
      d.state = "lunge"; d.biteCd = 1.6;
      sfx.growl();
      hurtPlayer(p, d.x, { noLift: true });
      d.leap = { x0: d.x, y0: d.y, x1: d.x - dir * m(1.2), y1: d.y, t: 0, dur: 0.3, h: m(0.3) };
      continue;
    }
    // just bitten: it holds off a step and snarls
    if (d.biteCd > 0 && Math.abs(dx) < m(1.3) && Math.abs(above) < m(0.9)) { d.state = "snarl"; continue; }
    // tired dogs slow down
    const tired = d.t > 8 ? 0.62 : 1;
    const speed = m(sp * tired * (inWater(d.x) ? 0.45 : 1) * (Math.abs(dx) < m(1) ? 0.6 : 1));
    const nx = d.x + dir * speed * dt;
    const f = dogFloor(nx, d.y - m(1.3));
    if (f && f.y < d.y - 3) {
      // a step up: hop it
      d.leap = { x0: d.x, y0: d.y, x1: nx + dir * m(0.3), y1: f.y, t: 0, dur: 0.22, h: m(0.25) };
      d.state = "run";
    } else if (!f || f.y > d.y + m(4)) {
      // an edge: look for the other side within a bound
      let land = null;
      for (let g = 1; g <= 5; g++) {
        const gx = d.x + dir * m(0.6 * g);
        const ff = dogFloor(gx, d.y - m(1.0));
        if (ff && Math.abs(ff.y - d.y) < m(1.0)) { land = { x: gx + dir * m(0.3), y: ff.y }; break; }
      }
      if (land && g_ok(land)) { d.leap = { x0: d.x, y0: d.y, x1: land.x, y1: land.y, t: 0, dur: 0.42, h: m(0.7) }; d.state = "run"; }
      else if (f && f.y > d.y + m(4) && f.y < d.y + m(9) && p.y > d.y + m(2)) { d.leap = { x0: d.x, y0: d.y, x1: nx + dir * m(1), y1: f.y, t: 0, dur: 0.5, h: m(0.2) }; }
      else {
        d.state = "bay"; d.t += dt * 0.6;
        d.barkT -= dt; if (d.barkT <= 0) { d.barkT = 0.8 + Math.random() * 0.5; if (onScreen(d.x, 0, 0)) sfx.bark(); }
      }
    } else {
      d.x = nx; d.run += speed * dt; d.state = "run";
      if (f.y > d.y + 3) { d.vy += 1600 * K * dt; d.y = Math.min(f.y, d.y + d.vy * dt); } else { d.y = f.y; d.vy = 0; }
      d.barkT -= dt; if (d.barkT <= 0) { d.barkT = 1.4 + Math.random() * 1.2; if (onScreen(d.x, 0, 0)) sfx.bark(); }
    }
  }
  // Koda hits back: punches, kicks, a slide or landing on one.
  for (const p of players) {
    for (const d of dogs) {
      if (d.state === "quit" || d.stun > 0) continue;
      const dx = d.x - p.x, dy = d.y - p.y;
      const attacking = ATTACK_STATES.has(p.state) && Math.sign(dx) === p.facing && Math.abs(dx) < m(1.7) && Math.abs(dy) < m(1.2);
      const sliding = p.state === "slide" && Math.abs(dx) < m(1.1) && Math.abs(dy) < m(0.8);
      const stomp = p.vy > 60 && dy > m(0.3) && dy < m(1.1) && Math.abs(dx) < m(0.7);
      if (!attacking && !sliding && !stomp) continue;
      d.hits += stomp ? 2 : 1; d.stun = 1.4; d.state = "yelp";
      sfx.yelp(); burst(d.x, d.y - m(0.5), "#fff1c4", 8, 180);
      if (stomp) { p.vy = -STOMP_BOUNCE; }
      const back = Math.sign(dx) || 1;
      d.leap = { x0: d.x, y0: d.y, x1: d.x + back * m(2.2), y1: d.y, t: 0, dur: 0.4, h: m(0.5) };
      const f = dogFloor(d.x + back * m(2.2), d.y - m(1));
      if (!f || Math.abs(f.y - d.y) > m(1)) d.leap.x1 = d.x + back * m(0.6);
      if (d.hits >= 2) showToast("DOG RAN OFF", "", "ko", 1.0);
    }
  }
}
function g_ok(l) { return l && isFinite(l.x) && isFinite(l.y); }

function drawDogs() {
  for (const d of dogs) {
    if (!onScreen(d.x, 0, 120)) {
      // a warning on the screen edge while they're closing in from off screen
      if (d.state !== "quit" && d.x < cameraX && d.x > cameraX - m(18)) {
        const y = Math.max(40, Math.min(H - 40, sy(d.y) - m(0.5)));
        const a = 0.6 + Math.sin(frameTime * 14) * 0.4;
        ctx.save(); ctx.fillStyle = `rgba(255, 90, 60, ${a})`;
        ctx.beginPath(); ctx.moveTo(10, y - 12); ctx.lineTo(30, y); ctx.lineTo(10, y + 12); ctx.closePath(); ctx.fill();
        ctx.font = "900 15px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "left"; ctx.fillText("DOGS", 36, y + 5);
        ctx.restore();
      }
      continue;
    }
    const lunge = d.leap && d.state === "lunge";
    drawDog(sx(d.x), sy(d.y), d.facing, d.run / m(0.55) + d.seed, { mode: d.leap ? (d.stun > 0 ? "yelp" : "leap") : d.state, alpha: Math.max(0, d.alpha), t: d.t + d.seed, collar: true, lunge });
  }
}

// One dog, drawn side-on facing right then flipped: a lean hound with an ink outline to sit with the characters.
function drawDog(X, Y, facing, ph, o) {
  o = o || {};
  const S = m(1) * 0.95, mode = o.mode || "run", t = o.t || frameTime;
  const body = o.tint || "#2b2421", dark = "#16110f", ink = "#0b0906";
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.translate(X, Y); ctx.scale(facing * S, S);
  // contact shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)"; ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  let pitch = 0, lift = 0, head = 0, mouth = 0, tailUp = 0;
  const s = Math.sin(ph), c = Math.cos(ph);
  if (mode === "run") { pitch = s * 0.07; lift = Math.max(0, c) * 0.06; mouth = 0.25; }
  else if (mode === "leap") { pitch = -0.12; lift = 0.04; mouth = 0.4; }
  else if (mode === "snarl") { pitch = 0.1; head = 0.15; mouth = 0.6 + Math.abs(Math.sin(t * 20)) * 0.3; tailUp = -0.1; }
  else if (mode === "bay") { const b = Math.abs(Math.sin(t * 7)); pitch = -0.32; lift = b * 0.14; head = -0.35; mouth = 0.4 + b * 0.5; tailUp = 0.3; }
  else if (mode === "lunge") { pitch = -0.2; lift = 0.08; mouth = 1; }
  else if (mode === "yelp") { pitch = 0.18; head = 0.25; tailUp = -0.4; }
  else if (mode === "sniff") { pitch = 0.12; head = 0.45; }
  else if (mode === "quit") { pitch = 0.04; lift = Math.max(0, c) * 0.03; tailUp = -0.3; }
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.translate(0, -lift); ctx.rotate(pitch);
  const legAngles = (front, near) => {
    if (mode === "bay" || mode === "yelp" || mode === "sniff" || mode === "snarl") return front ? [0.15, -0.1] : [-0.25, 0.5];
    if (mode === "leap" || mode === "lunge") return front ? [-1.0, 0.3] : [0.9, 0.2];
    const off = near ? 0 : 0.5;
    if (front) { const a = 0.75 * Math.sin(ph + off); return [a, -0.55 * Math.max(0, Math.cos(ph + off))]; }
    const a = -0.7 * Math.sin(ph + 1.1 + off); return [a, 0.6 * Math.max(0, -Math.cos(ph + 1.1 + off))];
  };
  const leg = (hx, hy, front, near) => {
    const [a, k] = legAngles(front, near);
    const l1 = front ? 0.25 : 0.24, l2 = front ? 0.24 : 0.29;
    const kx = hx + Math.sin(a) * l1, ky = hy + Math.cos(a) * l1;
    const fx = kx + Math.sin(a + k) * l2, fy = Math.min(-0.01, ky + Math.cos(a + k) * l2);
    const fill = near ? body : dark;
    // upper leg thick, lower leg thin, a small paw
    ctx.strokeStyle = ink; ctx.lineWidth = front ? 0.14 : 0.19;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = 0.095; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = front ? 0.095 : 0.14;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.ellipse(fx + 0.035, fy, 0.055, 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  // far legs first
  leg(0.27, -0.5, true, false); leg(-0.36, -0.56, false, false);
  // tail
  const wag = Math.sin(t * 14) * 0.05;
  ctx.strokeStyle = ink; ctx.lineWidth = 0.08;
  ctx.beginPath(); ctx.moveTo(-0.5, -0.64); ctx.quadraticCurveTo(-0.7, -0.74 - tailUp * 0.3 + wag, -0.84, -0.66 - tailUp * 0.35 + wag); ctx.stroke();
  ctx.strokeStyle = body; ctx.lineWidth = 0.04;
  ctx.beginPath(); ctx.moveTo(-0.5, -0.64); ctx.quadraticCurveTo(-0.7, -0.74 - tailUp * 0.3 + wag, -0.84, -0.66 - tailUp * 0.35 + wag); ctx.stroke();
  // torso: deep chest, tucked waist
  ctx.fillStyle = body; ctx.strokeStyle = ink; ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.52, -0.66);
  ctx.quadraticCurveTo(-0.08, -0.76, 0.3, -0.72);
  ctx.quadraticCurveTo(0.5, -0.64, 0.42, -0.47);
  ctx.quadraticCurveTo(0.32, -0.35, 0.12, -0.4);
  ctx.quadraticCurveTo(-0.1, -0.5, -0.3, -0.49);
  ctx.quadraticCurveTo(-0.58, -0.5, -0.52, -0.66);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // a rim of light along the back so it reads against dark streets
  ctx.strokeStyle = "rgba(255, 200, 150, 0.35)"; ctx.lineWidth = 0.025;
  ctx.beginPath(); ctx.moveTo(-0.44, -0.69); ctx.quadraticCurveTo(-0.08, -0.75, 0.26, -0.71); ctx.stroke();
  // neck and head
  ctx.save();
  ctx.translate(0.34, -0.7); ctx.rotate(head);
  ctx.fillStyle = body; ctx.strokeStyle = ink; ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.06); ctx.lineTo(0.12, -0.16); ctx.quadraticCurveTo(0.22, -0.24, 0.3, -0.18);
  ctx.lineTo(0.46, -0.13); ctx.quadraticCurveTo(0.5, -0.1, 0.46, -0.07);
  ctx.lineTo(0.3, -0.06 + mouth * 0.02);
  ctx.quadraticCurveTo(0.18, 0.02, 0.08, 0.14);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (mouth > 0.2) {
    // open jaw
    ctx.beginPath(); ctx.moveTo(0.3, -0.06); ctx.lineTo(0.44, -0.04 + mouth * 0.06); ctx.lineTo(0.22, 0.0); ctx.closePath();
    ctx.fillStyle = body; ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5a1410"; ctx.beginPath(); ctx.moveTo(0.3, -0.06); ctx.lineTo(0.42, -0.05 + mouth * 0.04); ctx.lineTo(0.26, -0.03); ctx.closePath(); ctx.fill();
  }
  // ear, laid back
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(0.16, -0.19); ctx.lineTo(0.06, -0.33); ctx.lineTo(0.22, -0.21); ctx.closePath(); ctx.fill(); ctx.stroke();
  // eye
  ctx.fillStyle = "#ff4a32"; ctx.shadowColor = "#ff4a32"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0.27, -0.15, 0.022, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (o.collar) {
    ctx.strokeStyle = "#7a1d14"; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.02, -0.08); ctx.lineTo(0.12, 0.04); ctx.stroke();
  }
  ctx.restore();
  // near legs on top
  leg(0.25, -0.48, true, true); leg(-0.38, -0.54, false, true);
  ctx.restore();
}

// Flares
function updateFlares(dt) {
  for (const p of players) {
    p.flares = p.flares || 0;
    if (!ATTACK_STATES.has(p.state)) { p._flared = false; continue; }
    if (p._flared || p.flares <= 0) continue;
    const wd = level.wardens.filter(w => w.alive && w.aware && Math.abs(w.y - p.y) < m(1.2) && (w.x - p.x) * p.facing > 0 && Math.abs(w.x - p.x) < m(4.5))
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    p._flared = true;
    if (!wd || wd.blind > 0) continue;
    p.flares -= 1;
    wd.blind = 3; wd.stagger = Math.max(wd.stagger, 3); wd.hp = 1; wd.aware = 0; wd.windUp = 0;
    flash = Math.max(flash || 0, 0.5);
    burst(wd.x, wd.y - m(1.5), "#bfe0ff", 26, 300);
    showToast("FLARE", "He can't see. One hit drops him.", "ko", 1.4);
  }
  for (const wd of level.wardens) if (wd.blind > 0) wd.blind -= dt;
}
function giveFlare(p) {
  p.flares = Math.min(2, (p.flares || 0) + 1);
  if (!veil.hints.has("flare")) { veil.hints.add("flare"); showBanner("A FLARE", "HIT FACING AN ENFORCER WHO'S SEEN YOU TO BLIND HIM", 2.6); }
}

// Fear: with the Shadow close, jumps carry less far.
function fearCarry(p) {
  if (p.ground || !veil.shadowOn || veil.shadowX === null || mission.id !== "m09") return 1;
  const fear = Math.max(0, 1 - (p.x - veil.shadowX) / m(10));
  return 1 - 0.2 * fear;
}
// Water and mud slow any enforcer to a wade.
function wadeFactor(wd) { return inWater(wd.x) ? 0.4 : 1; }

function drawFlareHud() {
  const p = players[0];
  if (!p || !p.flares) return;
  ctx.save();
  ctx.fillStyle = "rgba(8, 8, 12, 0.6)"; ctx.beginPath(); ctx.roundRect(W - 150, 92, 126, 22, 11); ctx.fill();
  ctx.fillStyle = "#bfe0ff"; ctx.font = "800 12px 'Barlow Condensed', Impact, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("FLARE ×" + p.flares, W - 87, 107);
  ctx.restore();
}
