"use strict";

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
  if (aiRival) return p.id === 1 ? (playerNames[0] || "YOU") : "AI";
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
  // Co-op: back in beside your partner when they're further on.
  let besidePartner = false;
  if (coopOn() && !twoPlayer) { const rs = Coop.reviveSpot(Math.max(cp.x, spot ? spot.x : 0)); if (rs) { spot = { x: rs.x, y: rs.y }; besidePartner = rs.name; } }
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
  const beside = besidePartner ? "BACK IN BESIDE " + besidePartner : twoPlayer && lead2 !== p ? "BACK IN BESIDE " + playerName(lead2) + " · -2 RECORDS" : twoPlayer ? "BACK IN AT THE CHECKPOINT · -2 RECORDS" : "BACK TO THE CHECKPOINT";
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
    // Reaching up through something thin from underneath (an awning): pull up onto it
    // right where he is, not at its near end.
    const inside = reach > s.x && reach < s.x + s.w && Math.abs(reach - faceX) > 12;
    const landX = inside ? Math.max(s.x + p.w / 2 + 2, Math.min(s.x + s.w - p.w / 2 - 2, p.x + dir * 6))
      : dir > 0 ? Math.max(s.x + p.w / 2 + 6, Math.min(s.x + s.w - p.w / 2, faceX + p.w / 2 + 14)) : Math.min(s.x + s.w - p.w / 2 - 6, faceX - p.w / 2 - 14);
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
  // Footsteps: on the beat of his feet. The run cycle follows the distance
  // covered (runPhase); a step sounds each time the cycle passes a moment where
  // a foot comes down in the animation, the sound of whatever is underfoot.
  if (p.ground && wasGround && Math.abs(p.vx) > 40 && p.state !== "slide") {
    const anim = p.crouch ? "crouch_walk" : p.boostTime > 0 ? "sprint" : "run";
    const A = SPRITES.koda && SPRITES.koda.animations && SPRITES.koda.animations[anim];
    const per = A && A.phasePerCycle ? A.phasePerCycle : 11;
    const now = p.runPhase / per, was = p.stepPhase === undefined || p.stepAnim !== anim ? now : p.stepPhase;
    const model = typeof mission !== "undefined" && mission && mission.player === "zora" ? "zora" : "koda";
    const lands = (typeof Char3D !== "undefined" && Char3D.footfalls && Char3D.footfalls(model, anim)) || [0, 0.5];
    // did the cycle pass a landing since last frame? (it only ever moves forward)
    let hit = false;
    if (now > was) for (const f of lands) { const c = Math.floor(was - f) + 1 + f; if (c <= now) { hit = true; break; } }
    p.stepPhase = now; p.stepAnim = anim;
    if (hit) {
      const k = p.ground.kind;
      const surface = p.mudT > 0 ? "wet" : (k === "catwalk" || k === "carriage" || k === "container" || k === "glass" || k === "grate" || k === "vent" || k === "flicker" || k === "turnflat" || k === "broken") ? "metal" : k === "garden" ? "soft" : "stone";
      sfx.step(surface);
    }
  } else p.stepPhase = undefined;
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
