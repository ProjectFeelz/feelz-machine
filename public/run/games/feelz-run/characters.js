"use strict";

/* ---------- characters ---------- */

// Outfits: the gold sheet recoloured once per outfit, using the mask sheet rendered
// alongside it (red = hoodie and boots, green = trousers, blue = skin and hair).
let playerOutfit = "gold";

const outfitSheets = {};

function kodaSheet(outfitId) {
  if (!outfitId || outfitId === "gold" || !art.koda.ready || !art.kodaMask.ready) return art.koda;
  if (!outfitSheets[outfitId]) outfitSheets[outfitId] = recolorSheet(art.koda, art.kodaMask, outfitId) || art.koda;
  return outfitSheets[outfitId];
}

let tintedKoda = null;   // Player 2 in blue and black, made once

let tintedZora = null;

const ZORA_SCALE = 1.15, ZORA_WIDEN = 1.1, NPC_WIDEN = 1.12;

function kodaSheetFor(p) {
  if (p.coopTint) {
    if (mission && mission.player === "zora" && art.zora.ready) return coopTinted(art.zora, p.coopTint);
    return art.koda.ready ? coopTinted(art.koda, p.coopTint) : art.koda;
  }
  if (mission && mission.player === "zora" && art.zora.ready) {
    if (p.id === 1) return art.zora;
    if (!tintedZora) tintedZora = tintSheet(art.zora);
    return tintedZora;
  }
  if (!art.koda.ready) return art.koda;
  if (p.id === 1) return kodaSheet(playerOutfit);
  if (!tintedKoda) {
    const c = document.createElement("canvas");
    c.width = art.koda.width; c.height = art.koda.height;
    const k = c.getContext("2d");
    k.drawImage(art.koda, 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = "rgba(40, 190, 255, 0.4)";
    k.fillRect(0, 0, c.width, c.height);
    tintedKoda = freeze(c);
  }
  return tintedKoda;
}

function kodaPose(p) {
  if (p.pose) return p.pose;   // the co-op partner: their pose arrives with their position
  const def = SPRITES.koda, A = def.animations;
  if (p.zip) return ["climb", 2];
  if (p.state === "dance") return ["idle", frameFor(def, "idle", frameTime)];
  if (p.move) {
    const k = Math.min(0.999, p.move.t / p.move.dur);
    return [p.move.kind, Math.floor(k * A[p.move.kind].frames)];
  }
  if (p.climb) return ["climb", Math.floor((-p.y) / 16) % A.climb.frames];
  // Bonus moves.
  if (p.pounding) return ["pound", 0];
  if (p.state === "pound") return ["pound", 1 + Math.min(4, Math.floor((1 - p.stateT / 0.35) * 5))];
  if (p.state === "dash") return ["dash", Math.min(A.dash.frames - 1, Math.floor(p.animClock / 0.36 * A.dash.frames))];
  if (p.kickT > 0) return ["wallkick", Math.min(A.wallkick.frames - 1, Math.floor((1 - p.kickT / 0.45) * A.wallkick.frames))];
  if (ATTACK_STATES.has(p.state)) {
    const anim = p.state === "finisher" ? "kick" : p.state;
    const atk = ATTACKS[p.state];
    return [anim, Math.min(A[anim].frames - 1, Math.floor((1 - p.stateT / atk.dur) * A[anim].frames))];
  }
  if (p.fightWith && p.ground) return ["punch", 0];
  if (p.state === "stun") return ["stun", frameFor(def, "stun", p.animClock)];
  if (p.state === "hurt") return ["hurt", frameFor(def, "hurt", p.animClock)];
  if (p.state === "slide") {
    // Drop into the slide, then hold the low pose for as long as the slide lasts.
    const n = Math.floor(p.animClock * A.slide.fps);
    return ["slide", n < 2 ? n : 2 + (n - 2) % (A.slide.frames - 2)];
  }
  if (!p.ground) {
    if (p.flipTime > 0) return ["flip", Math.floor((1 - p.flipTime / 0.45) * A.flip.frames)];
    if (p.vy < 0) return ["jump", Math.min(3, Math.floor((1 + p.vy / JUMP_SPEED) * 4))];
    return ["fall", frameFor(def, "fall", p.animClock)];
  }
  if (p.crouch) {
    if (Math.abs(p.vx) > 1) return ["crouch_walk", Math.floor(p.runPhase / A.crouch_walk.phasePerCycle * A.crouch_walk.frames) % A.crouch_walk.frames];
    return ["crouch_idle", frameFor(def, "crouch_idle", frameTime)];
  }
  if (Math.abs(p.vx) > 1) {
    const anim = p.boostTime > 0 ? "sprint" : "run";
    const a = A[anim];
    return [anim, Math.floor(p.runPhase / a.phasePerCycle * a.frames) % a.frames];
  }
  return ["idle", frameFor(def, "idle", frameTime)];
}

// The same pose as kodaPose, but as a smooth 0..1 through the move rather
// than a sprite frame, for the 3D model (engine/char3d.js), which can show
// any moment of a move, not just the frames that were rendered.
function kodaPose3D(p) {
  const A = SPRITES.koda.animations;
  const cyc = (a, phase) => phase / A[a].phasePerCycle;            // looping, by distance run
  const clock = (a, c) => c * (A[a].fps || 10) / A[a].frames;       // by time
  if (p.pose) return [p.pose[0], (p.pose[1] + 0.5) / ((A[p.pose[0]] || { frames: 1 }).frames)];
  if (p.zip) return ["climb", 0.25];
  if (p.state === "dance") return ["idle", clock("idle", frameTime)];
  if (p.move) return [p.move.kind, Math.min(0.999, p.move.t / p.move.dur)];
  if (p.climb) return ["climb", (-p.y) / 16 / A.climb.frames];
  if (p.pounding) return ["pound", 0];
  if (p.state === "pound") return ["pound", 0.2 + 0.8 * (1 - p.stateT / 0.35)];
  if (p.state === "dash") return ["dash", Math.min(0.999, p.animClock / 0.36)];
  if (p.kickT > 0) return ["wallkick", 1 - p.kickT / 0.45];
  if (ATTACK_STATES.has(p.state)) {
    const anim = p.state === "finisher" ? "kick" : p.state;
    return [anim, 1 - p.stateT / ATTACKS[p.state].dur];
  }
  if (p.fightWith && p.ground) return ["punch", 0];
  if (p.state === "stun") return ["stun", clock("stun", p.animClock)];
  if (p.state === "hurt") return ["hurt", clock("hurt", p.animClock)];
  // The slide: down and along for as long as the slide lasts, never the clip's get-up (the game
  // decides that: standing, or straight into a crouch if you hold down).
  if (p.state === "slide") {
    if (!p.slideDur || p.animClock < 0.05) p.slideDur = Math.max(0.3, (p.stateT || 0) + p.animClock);
    return ["slide", Math.min(0.999, p.animClock / p.slideDur)];
  }
  if (!p.ground) {
    if (p.flipTime > 0) return ["flip", 1 - p.flipTime / 0.45];
    if (p.vy < 0) return ["jump", Math.max(0, Math.min(0.999, 1 + p.vy / JUMP_SPEED))];
    return ["fall", clock("fall", p.animClock)];
  }
  if (p.crouch) {
    if (Math.abs(p.vx) > 1) return ["crouch_walk", cyc("crouch_walk", p.runPhase)];
    return ["crouch_idle", clock("crouch_idle", frameTime)];
  }
  if (Math.abs(p.vx) > 1) {
    const anim = p.boostTime > 0 ? "sprint" : "run";
    return [anim, cyc(anim, p.runPhase)];
  }
  return ["idle", clock("idle", frameTime)];
}

// A runner rendered by Char3D, dropped into the 2D picture with its feet on (footX, footY).
function drawModelFrame(c, footX, footY, opts) {
  const size = Char3D.VIEW_METRES * PX;
  ctx.save();
  ctx.translate(sx(footX), sy(footY));
  if (opts && opts.mirror) ctx.scale(1, -1);
  if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts && opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.blur || 7; }
  ctx.drawImage(c, -size / 2, -size * Char3D.FOOT, size, size);
  ctx.restore();
}

// Thin tapered streaks of air tearing past Koda, thick near him and thinning out behind.
function drawSpeedWind(p) {
  const k = Math.min(1, p.boostTime / 0.6), cx = sx(p.x), cy = sy(p.y) - p.h * 0.55, dir = p.facing;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 14; i++) {
    const seed = seeded(i * 7.3 + 1);
    const speed = 900 + seed * 700;
    const len = 60 + seeded(i * 3.1) * 140;
    const life = ((frameTime * speed + seed * 997) % 520) / 520;          // 0..1 as the streak passes him
    const yy = cy + (seeded(i * 11.7) - 0.5) * p.h * 1.5;
    const x0 = cx + dir * (60 - life * 420);
    const g = ctx.createLinearGradient(x0, 0, x0 - dir * len, 0);
    const a = (0.55 - Math.abs(yy - cy) / (p.h * 2)) * k * Math.sin(life * Math.PI);
    if (a <= 0.02) continue;
    g.addColorStop(0, `rgba(230, 250, 255, ${a})`); g.addColorStop(1, "rgba(127, 227, 255, 0)");
    ctx.strokeStyle = g; ctx.lineWidth = 1 + seeded(i * 5.9) * 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - dir * len, yy); ctx.stroke();
  }
  // a soft bow wave of air in front of him
  const bow = ctx.createRadialGradient(cx + dir * 26, cy, 4, cx + dir * 26, cy, 70);
  bow.addColorStop(0, `rgba(160, 235, 255, ${0.18 * k})`); bow.addColorStop(1, "rgba(160, 235, 255, 0)");
  ctx.fillStyle = bow; ctx.beginPath(); ctx.arc(cx + dir * 26, cy, 70, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Co-op: everyone's name over their head in their colour, and an arrow at the screen edge for anyone out of view.
function drawCoopPartner() {
  const list = typeof Coop !== "undefined" ? Coop.ghosts : [];
  if (!list.length) return;
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const edges = { left: 0, right: 0 };
  for (const g of list) {
    const name = g.coopName || "PLAYER", colour = g.coopText || "#7fe3ff";
    const x = sx(g.x), y = sy(g.y - g.h) - 16;
    if (x > 20 && x < W - 20 && y > 10 && y < H - 10) {
      ctx.font = "700 15px 'Barlow Condensed', sans-serif";
      const w = ctx.measureText(name).width + 16;
      ctx.fillStyle = "rgba(10, 20, 30, 0.7)"; ctx.fillRect(x - w / 2, y - 10, w, 20);
      ctx.fillStyle = colour; ctx.fillText(name, x, y);
    } else {
      const left = x <= 20, side = left ? "left" : "right";
      const ax = left ? 26 : W - 26, ay = Math.max(40, Math.min(H - 40, y)) + edges[side] * 56;
      edges[side] += 1;
      const dist = Math.round(Math.abs(g.x - players[0].x) / PX);
      ctx.fillStyle = "rgba(10, 20, 30, 0.75)";
      ctx.beginPath(); ctx.arc(ax, ay, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      if (left) { ctx.moveTo(ax - 9, ay); ctx.lineTo(ax + 5, ay - 9); ctx.lineTo(ax + 5, ay + 9); }
      else { ctx.moveTo(ax + 9, ay); ctx.lineTo(ax - 5, ay - 9); ctx.lineTo(ax - 5, ay + 9); }
      ctx.fill();
      ctx.font = "700 12px 'Barlow Condensed', sans-serif";
      ctx.fillText(name + " " + dist + "M", left ? ax + 40 : ax - 40, ay + 28);
    }
  }
  ctx.restore();
}

function drawPlayers() {
  // Co-op: the partner is drawn like a second runner (tinted), from their latest position.
  const ghosts = typeof Coop !== "undefined" ? Coop.ghosts : [];
  for (const p of (ghosts.length ? ghosts.concat(players) : players)) {
    if (p.invuln > 0 && !p.finished && Math.floor(frameTime * 14) % 2 === 0) continue;
    const [anim, frame] = kodaPose(p);
    const img = kodaSheetFor(p);
    // The 3D Koda when his model has this move (engine/char3d.js), in your outfit
    // colour; otherwise the sprite sheet. Co-op tints are still sprite-only.
    const outfit3 = p.id === 1 && !p.coopTint && img !== art.zora && img !== tintedZora && OUTFITS[playerOutfit] ? OUTFITS[playerOutfit].jacket : null;
    const modelId = img === art.koda || outfit3 ? "koda" : img === art.zora ? "zora" : null;
    const [anim3, t3] = typeof Char3D !== "undefined" && modelId ? kodaPose3D(p) : [null, 0];
    const facing3 = p.climb ? -p.climb.side : p.facing;
    // THE OTHER RUNNERS KEEP THEIR OWN CANVAS AND ARE REDRAWN ONLY WHEN THEIR
    // POSE CHANGES.
    //
    // Their pose is a sprite frame number that arrives over the network 15
    // times a second, and kodaPose3D above turns that number straight back
    // into the same animation time every frame until the next one lands. So
    // the render is identical in between, and doing it again 60 times a second
    // is the single biggest cost of a four player run.
    //
    // Your own Koda is NOT held: he is posed from live physics and is redrawn
    // every frame exactly as before.
    const hold = p.coopGhost ? "coop:" + (p.coopId || p.coopName || p.id) : null;
    const model = anim3 && Char3D.has(modelId, anim3)
      ? Char3D.render(modelId, "p" + p.id + (p.coopName || ""), anim3, t3, facing3,
          // On a ladder he faces into the picture, back to us. (The climb clip itself turns him
          // round, so no extra turn here.)
          Object.assign(p.climb && anim3 === "climb" ? { turn: 0 } : {}, { outfit: outfit3 },
                        hold ? { hold } : {})) : null;
    if (!art.koda.ready && !model) continue;
    const under = p.ground || floorBelow(p.x, p.y, true);
    const floor = under ? under.y : p.y, lift = Math.max(0, floor - p.y);
    // A soft shadow that stays on the ground: as he rises it spreads out and fades,
    // like a real shadow, and gathers back under his feet as he lands.
    if (under && !p.climb) {
      const k = Math.min(1, lift / m(3)), rx = 24 + k * 22, ry = 5 + k * 3, a = 0.42 * (1 - k * 0.75);
      const X = sx(p.x), Y = sy(floor) - 1;
      ctx.save();
      ctx.translate(X, Y); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(0, 0, 0, ${a})`); g.addColorStop(0.55, `rgba(0, 0, 0, ${a * 0.6})`); g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Feelz Boost: afterimages of Koda trailing behind him, and wind rushing past.
    p.ghosts = p.ghosts || [];
    if (p.boostTime > 0 && gameState === "playing" && !reading) {
      p.ghosts.unshift({ x: p.x, y: p.y, anim, frame, facing: p.climb ? p.climb.side : p.facing });
      if (p.ghosts.length > 16) p.ghosts.length = 16;
    } else if (p.boostTime <= 0 && p.ghosts.length) p.ghosts.pop();
    if (p.ghosts.length > 3) {
      const fadeOut = Math.min(1, p.boostTime / 0.6 + (p.boostTime > 0 ? 0 : 0));
      for (let i = p.ghosts.length - 1; i >= 3; i -= 3) {
        const g = p.ghosts[i], a = (1 - i / 17) * 0.38 * (p.boostTime > 0 ? Math.max(0.25, fadeOut) : 0.4);
        drawSheetFrame(img, SPRITES.koda, g.anim, g.frame, g.x, g.y, g.facing, { alpha: a, glow: "rgba(110, 220, 255, 0.9)", blur: 10 });
      }
    }
    if (p.boostTime > 0) drawSpeedWind(p);
    // The climb frames face left in the sheet, so face him into whatever he's climbing.
    const facing = p.climb ? p.climb.side : p.facing;
    // A soft reflection in the wet, glossy floor.
    if (p.ground && (p.ground.kind === "ground" || p.ground.kind === "roof")) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx(p.x) - 80, sy(p.ground.y) + 4, 160, 44); ctx.clip();
      if (model) drawModelFrame(model, p.x, p.ground.y + 4, { mirror: true, alpha: 0.2 });
      else drawSheetFrame(img, SPRITES.koda, anim, frame, p.x, p.ground.y + 4, facing, { mirror: true, alpha: 0.2 });
      ctx.restore();
    }
    if (p.shield) {
      ctx.save();
      ctx.strokeStyle = `rgba(127, 227, 255, ${0.35 + Math.sin(frameTime * 5) * 0.15})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y) - p.h / 2 - 6, 30, p.h / 2 + 18, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const mainGlow = { glow: p.id === 1 ? "rgba(255, 186, 70, 0.22)" : "rgba(110, 220, 255, 0.4)", blur: 3 };
    // On a ladder the game holds him beside it; he is drawn on the ladder itself.
    if (model) drawModelFrame(model, p.climb && anim3 === "climb" ? p.climb.x : p.x, p.y, mainGlow);
    else drawSheetFrame(img, SPRITES.koda, anim, frame, p.climb ? p.climb.x : p.x, p.y + (p.state === "slide" ? 3 : 0), facing, mainGlow);
    if (twoPlayer) {
      ctx.fillStyle = p.id === 1 ? "#f1ca78" : "#7fe3ff";
      ctx.font = "800 14px 'Barlow Condensed', Impact, sans-serif";
      ctx.textAlign = "center";
      const top = sy(p.y) - m(1.9);
      ctx.fillText(playerName(p), sx(p.x), top - 6);
      ctx.beginPath(); ctx.moveTo(sx(p.x) - 5, top); ctx.lineTo(sx(p.x) + 5, top); ctx.lineTo(sx(p.x), top + 5); ctx.fill();
    }
  }
}

// How far through a warden's move he is, 0..1, for the 3D model (the same
// states the sprite frames above are picked from).
function wardenPose3D(wd, anim) {
  if (anim === "ko") return Math.min(0.999, wd.animT / 1.6);
  if (anim === "hit") return Math.min(0.999, (0.38 - Math.min(0.38, wd.stagger)) / 0.38);
  if (anim === "punch") return wd.windUp > 0 ? 0.22 : Math.min(0.999, 0.3 + (0.3 - wd.punchT) / 0.3 * 0.7);
  if (anim === "fight_idle") return wd.animT / 2.4;
  if (anim === "run") return wd.walkPhase / (26 * 8);
  return wd.walkPhase / (22 * 8);
}

function drawWardens() {
  for (const wd of level.wardens) {
    const def = SPRITES.enemies[wd.kind] || SPRITES.warden;
    const sheet = art.enemies[wd.kind] && art.enemies[wd.kind].ready ? art.enemies[wd.kind] : art.warden;
    const sdef = sheet === art.warden ? SPRITES.warden : def;
    if (!onScreen(wd.x, 0, 200)) continue;
    let anim, frame;
    if (!wd.alive) { anim = "ko"; frame = frameFor(sdef, "ko", wd.animT, false); if (wd.animT > 3) continue; }
    else if (wd.stagger > 0) { anim = "hit"; frame = Math.min(3, Math.floor((0.38 - Math.min(0.38, wd.stagger)) / 0.38 * 4)); }
    else if (wd.windUp > 0) { anim = "punch"; frame = 1; }
    else if (wd.punchT > 0) { anim = "punch"; frame = 2 + Math.floor((0.3 - wd.punchT) / 0.3 * 4); }
    else if (players.some(o => o.fightWith === wd)) { anim = "fight_idle"; frame = frameFor(sdef, "fight_idle", wd.animT); }
    else if (wd.state === "run" && sdef.animations.run) { anim = "run"; frame = Math.floor(wd.walkPhase / 26) % sdef.animations.run.frames; }
    else { anim = "walk"; frame = Math.floor(wd.walkPhase / 22) % sdef.animations.walk.frames; }
    drawWardenSight(wd);
    // Street Wardens glow red, Sentinels (Upper City) blue, Veil Hunters violet. All of them turn red to swing.
    const calm = wd.kind === "sentinel" ? "rgba(90, 184, 255, 0.9)" : wd.kind === "hunter" ? "rgba(181, 140, 255, 0.9)" : "rgba(224, 83, 60, 0.85)";
    const glow = wd.windUp > 0 ? "rgba(255, 60, 40, 1)" : calm;
    // Lying-down frames sit higher in the cell than the feet do, so drop each one onto the ground.
    let drop = 0;
    if (!wd.alive) {
      const b = sheetBottoms(sheet, sdef, "ko");
      if (b && b[frame] > 0) drop = Math.max(0, sdef.footY * sdef.cell - 1 - b[frame]) / sdef.cell * sdef.metres * PX;
    }
    const wOpts = { glow, blur: wd.windUp > 0 ? 16 : 5, alpha: wd.alive ? 1 : Math.max(0, 1 - (wd.animT - 2) ) };
    // The 3D warden when his model is in (engine/char3d.js), at full frame rate.
    const w3 = typeof CHAR3D !== "undefined" && CHAR3D.enemies ? (CHAR3D.enemies[wd.kind] || CHAR3D.enemies.warden) : null;
    const wModel = w3 && Char3D.has(w3.id, anim) ? Char3D.render(w3.id, "w", anim, wardenPose3D(wd, anim), wd.facing, { cache: 16 }) : null;
    if (wModel) drawModelFrame(wModel, wd.x, wd.y, wOpts);
    else drawSheetFrame(sheet, sdef, anim, frame, wd.x, wd.y + drop, wd.facing, wOpts);
    // Rank: one gold chevron for a veteran, two for an elite.
    const tier = wd.alive ? enemyKind(wd).tier : 0;
    if (tier > 0) {
      const cx = sx(wd.x), cy = sy(wd.y - m(2.25)) + Math.sin(frameTime * 3 + wd.x) * 2;
      ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.shadowColor = tier >= 2 ? "#ff5a3c" : "#ffcf6a"; ctx.shadowBlur = 8;
      for (let i = 0; i < tier; i++) {
        const y = cy + i * 7;
        ctx.strokeStyle = "#1a1208"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(cx - 9, y - 4); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 9, y - 4); ctx.stroke();
        ctx.strokeStyle = tier === 2 ? "#ffb04a" : "#ffd98a"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx - 9, y - 4); ctx.lineTo(cx, y + 3); ctx.lineTo(cx + 9, y - 4); ctx.stroke();
      }
      ctx.restore();
    }
    if (wd.guardT > 0 && wd.alive) {
      ctx.save(); ctx.strokeStyle = `rgba(150, 215, 255, ${0.5 + Math.sin(frameTime * 20) * 0.2})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(wd.x + wd.facing * m(0.35)), sy(wd.y - m(1.15)), m(0.55), -1.1, 1.1); ctx.stroke(); ctx.restore();
    }
  }
}

function drawDrones() {
  const s = SPRITES.drone;
  for (let i = 0; i < level.drones.length; i++) {
    const dr = level.drones[i];
    if (!dr.alive || !onScreen(dr.x, 0, 200)) continue;
    const X = sx(dr.x), Y = sy(dr.y);
    // its scanning light
    const beam = ctx.createLinearGradient(0, Y, 0, Y + 140);
    beam.addColorStop(0, "rgba(224, 83, 60, 0.35)"); beam.addColorStop(1, "rgba(224, 83, 60, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(X - 8, Y + 10); ctx.lineTo(X + 8, Y + 10); ctx.lineTo(X + 44, Y + 140); ctx.lineTo(X - 44, Y + 140); ctx.closePath(); ctx.fill();
    // The 3D drone: it turns smoothly to face where it is going (looking at
    // you on the way round), leans into the sweep and sways as it bobs.
    const def = (i % 3 === 2 ? CHAR3D.props.watcher : CHAR3D.props.scanner);
    if (def && typeof Char3D !== "undefined" && Char3D.wantProp(def.id)) {
      const goal = dr.facing > 0 ? -0.55 : -2.59;
      const step = Math.max(0, Math.min(0.1, frameTime - (dr.drawnAt || frameTime)));
      dr.drawnAt = frameTime;
      if (dr.yaw === undefined) dr.yaw = goal;
      dr.yaw += (goal - dr.yaw) * Math.min(1, step * 3.2);
      const turning = Math.abs(goal - dr.yaw);
      const lean = dr.facing * 0.16 * (1 - Math.min(1, turning));
      const sway = Math.cos(dr.t * 2.2) * 0.07;
      // Baked once into 32 turned frames, then drawn like a sprite: no 3D work per frame.
      const strip = Char3D.bake(def.id, -2.59, -0.55, 32, def.yaw || 0);
      if (strip) {
        const k = Math.max(0, Math.min(1, (dr.yaw + 2.59) / 2.04)), f = Math.round(k * (strip.frames - 1));
        const size = m(Char3D.VIEW_METRES) * 0.56;
        const eye = ctx.createRadialGradient(X, Y, 2, X, Y, m(0.9));
        eye.addColorStop(0, "rgba(255, 70, 50, 0.32)"); eye.addColorStop(1, "rgba(255, 70, 50, 0)");
        ctx.fillStyle = eye; ctx.fillRect(X - m(0.9), Y - m(0.9), m(1.8), m(1.8));
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(lean + sway * 0.5);
        ctx.drawImage(strip.canvas, f * strip.cell, 0, strip.cell, strip.cell, -size / 2, -size / 2, size, size);
        ctx.restore();
        continue;
      }
    }
    if (!art.drone.ready) continue;
    const f = Math.floor(frameTime * s.fps) % s.frames, w = m(1.5), h = w * s.frameHeight / s.frameWidth;
    ctx.save();
    ctx.translate(X, Y);
    if (dr.facing < 0) ctx.scale(-1, 1);
    ctx.shadowColor = "#e0533c"; ctx.shadowBlur = 10;
    ctx.drawImage(art.drone, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
