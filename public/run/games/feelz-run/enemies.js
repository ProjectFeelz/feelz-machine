"use strict";

/* ---------------------------------------------------------------------------
   ENFORCERS
   Street Wardens walk their beat and swing at you when you get close.
   Touch one and it hurts. Jump on him, or hit him, to knock him out.
--------------------------------------------------------------------------- */

function knockOutWarden(wd, p) {
  wd.alive = false; wd.state = "ko"; wd.animT = 0; wd.windUp = 0;
  p.kos += 1;
  if (coopOn() && p === players[0]) Coop.send("ko", { i: level.wardens.indexOf(wd) });
  for (const o of players) if (o.fightWith === wd) o.fightWith = null;
  if (!players.some(o => o.fightWith)) showBanner("K.O.", "", 0.9);
  showToast("KNOCKOUT", "+" + SCORING.rpPerKnockout + " RP", "ko");
  sfx.knockout();
  burst(wd.x, wd.y - m(1), "#ffd27a", 14, 220);
}

// Co-op: the partner slid into you. A short stumble, no hearts lost.
function coopTripped(who) {
  const p = players[0];
  if (!p || p.finished || p.climb || p.move || p.state === "slide") return;
  p.vx = 0; p.knock = 0.3; p.knockDir = -p.facing;
  if (p.ground) p.vy = -260 * K;   // knocked off their feet
  p.ground = null;
  setState(p, "stun", 0.9);
  burst(p.x, p.y - 10, "#d9c7a0", 14, 180);
  p.invuln = 1.2;
  sfx.stun && sfx.stun();
  rumble(0, 0.5, 200);
  showBanner("TRIPPED", (who || "YOUR PARTNER") + " SLID INTO YOU", 1.4);
}

// The partner knocked this one out on their screen: down here too, credited to them.
function coopDownWarden(wd) {
  wd.alive = false; wd.state = "ko"; wd.animT = 0; wd.windUp = 0;
  for (const o of players) if (o.fightWith === wd) o.fightWith = null;
  burst(wd.x, wd.y - m(1), "#7fe3ff", 12, 200);
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
  if (coopOn() && p === players[0]) Coop.send("drone", { i: level.drones.indexOf(dr) });
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
      // A flying kick lands the moment it reaches him, before he can touch Koda.
      if (p.state === "flykick") { if (!p.hitDone) { p.hitDone = true; landAttack(p, players.indexOf(p), "flykick", ATTACKS.flykick); } continue; }
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
