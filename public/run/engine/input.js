"use strict";

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
