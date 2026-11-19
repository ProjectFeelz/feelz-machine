"use strict";

/* ---------------------------------------------------------------------------
   TUTORIAL
   The first time someone plays Mission 01, a short card at the top walks them
   through the basics while they run: run, jump, double jump, slide, hit, and
   climb when the first ladder comes up. Each step waits until they actually
   do the move. Later, the first run after a new move is unlocked shows that
   move the same way. The names of the controls follow whatever the player is
   using: keyboard, controller or touch. What has been learnt is kept on this
   device, so nobody is taught twice.
--------------------------------------------------------------------------- */

let inputKind = "keys";
window.addEventListener("keydown", () => { inputKind = "keys"; });
window.addEventListener("pointerdown", e => { if (e.pointerType === "touch") inputKind = "touch"; });

const CONTROL_NAMES = {
  keys:  { right: "D or →", jump: "SPACE", down: "S or ↓", attack: "F", up: "W or ↑" },
  pad:   { right: "the stick →", jump: "A", down: "B", attack: "X", up: "the stick ↑" },
  touch: { right: "▶", jump: "JUMP", down: "▼", attack: "HIT", up: "JUMP" }
};

const TAUGHT_KEY = "feelzrun.taught";
function taughtList() { try { return JSON.parse(localStorage.getItem(TAUGHT_KEY) || "[]"); } catch (e) { return []; } }
function markTaught(id) {
  const list = taughtList();
  if (list.includes(id)) return;
  list.push(id);
  try { localStorage.setItem(TAUGHT_KEY, JSON.stringify(list)); } catch (e) { /* private mode: they'll just see it again */ }
}

// The basics, in order. done(p, t) says when the player has done it.
const BASIC_STEPS = [
  { id: "run",    title: "RUN",         how: c => "Hold " + c.right + " to run",               done: (p, t) => t.ran > m(5) },
  { id: "jump",   title: "JUMP",        how: c => "Press " + c.jump + " to jump",              done: (p, t) => t.jumped },
  { id: "double", title: "DOUBLE JUMP", how: c => "Press " + c.jump + " again in the air",     done: (p, t) => t.airJumped },
  { id: "slide",  title: "SLIDE",       how: c => "While running, press " + c.down,           done: p => p.state === "slide" },
  { id: "hit",    title: "HIT",         how: c => "Press " + c.attack + " to hit",             done: p => ATTACK_STATES.has(p.state) },
  { id: "climb",  title: "CLIMB",       how: c => "At the ladder, hold " + c.up + " to climb", done: p => !!p.climb,
    // only once a ladder is coming up
    ready: p => level.climbs.some(cl => cl.x > p.x - m(1) && cl.x < p.x + m(12)) }
];

// A new move, the first run after it's unlocked. Perks need nothing doing: a short note.
const MOVE_STEPS = {
  air_dash:      { how: c => "In the air, press " + c.attack,                    done: p => p.state === "dash" },
  triple_jump:   { how: c => "Press " + c.jump + " twice in the air",            done: (p, t) => t.airJumpsNow >= 2 },
  power_slide:   { how: c => "While running, press " + c.down,                   done: p => p.state === "slide" },
  wall_kick:     { how: c => "Jump at a wall, then press " + c.jump + " again",  done: p => p.kickT > 0 },
  ground_pound:  { how: c => "In the air, press " + c.down,                      done: p => !!p.pounding },
  takedown:      { how: c => "Come up behind a warden and press " + c.attack,    done: p => p.state === "takedown" },
  flying_kick:   { how: c => "Running full speed, press " + c.attack,            done: p => p.state === "flykick" },
  spin_kick:     { how: c => "Hit three times in a row: " + c.attack + " " + c.attack + " " + c.attack, done: p => p.state === "spinkick" },
  heavy_smash:   { how: c => "Hold " + c.attack,                                 done: p => p.state === "smash" }
};

const tut = { steps: [], i: 0, t: 0, doneT: 0, ran: 0, jumped: false, airJumped: false, airJumpsNow: 0, lastX: 0, wasGround: true, lastAir: 0 };

// A new run: what does this player still need to be shown?
function tutorialStart() {
  tut.steps = []; tut.i = 0; tut.t = 0; tut.doneT = 0;
  if (twoPlayer || (typeof coopOn === "function" && coopOn()) || !mission) return;
  const taught = taughtList(), p = players[0];
  if (mission.id === "m01" && !taught.includes("basics")) {
    for (const s of BASIC_STEPS) tut.steps.push(Object.assign({ basic: true }, s));
  }
  for (const id of (p && p.skills) ? p.skills : []) {
    if (taught.includes(id)) continue;
    const sk = SKILLS.find(s => s.id === id);
    if (!sk) continue;
    const mv = MOVE_STEPS[id];
    tut.steps.push(mv
      ? { id, title: "NEW MOVE: " + sk.name.toUpperCase(), how: mv.how, done: mv.done }
      : { id, title: "NEW PERK: " + sk.name.toUpperCase(), how: () => sk.text, done: (p, t) => t.t > 4 });
  }
  tut.ran = 0; tut.jumped = false; tut.airJumped = false; tut.airJumpsNow = 0;
  tut.lastX = p ? p.x : 0; tut.wasGround = true; tut.lastAir = p ? p.airJumps : 0;
}

function tutorialUpdate(dt) {
  if (!tut.steps.length || tut.i >= tut.steps.length) return;
  const p = players[0];
  if (!p) return;
  if (pads[0] && pads[0].connected && (pads[0].jump || pads[0].attack || pads[0].left || pads[0].right || pads[0].down)) inputKind = "pad";
  // what he's been doing, for the steps that count it
  tut.ran += Math.max(0, Math.abs(p.x - tut.lastX)); tut.lastX = p.x;
  if (tut.wasGround && !p.ground && p.vy < 0) tut.jumped = true;
  if (p.ground) tut.airJumpsNow = 0;
  if (!p.ground && p.airJumps < tut.lastAir) { tut.airJumped = true; tut.airJumpsNow += tut.lastAir - p.airJumps; }
  tut.wasGround = !!p.ground; tut.lastAir = p.airJumps;

  if (tut.doneT > 0) {                       // the tick on a step just done
    tut.doneT -= dt;
    if (tut.doneT <= 0) { tut.i += 1; tut.t = 0; finishIfLast(); }
    return;
  }
  let step = tut.steps[tut.i];
  // a step that has to wait for its moment (the ladder) lets the next one go first
  if (step.ready && !step.ready(p)) {
    const j = tut.steps.findIndex((s, k) => k > tut.i && (!s.ready || s.ready(p)));
    if (j < 0) return;
    [tut.steps[tut.i], tut.steps[j]] = [tut.steps[j], tut.steps[tut.i]];
    step = tut.steps[tut.i];
  }
  tut.t += dt;
  if (step.done(p, tut)) {
    tut.doneT = 0.9;
    resetCounts(p);   // from here on, what he does counts towards the next step
    sfx.record && sfx.record();
    if (!step.basic) markTaught(step.id);
  }
}

function resetCounts(p) { tut.jumped = false; tut.airJumped = false; tut.airJumpsNow = 0; tut.ran = 0; tut.lastX = p.x; }

function finishIfLast() {
  if (tut.i < tut.steps.length) return;
  if (tut.steps.some(s => s.basic)) { markTaught("basics"); showToast("YOU'VE GOT IT", "Now outrun the storm.", "ko", 2.2); }
}

function drawTutorial() {
  if (!tut.steps.length || tut.i >= tut.steps.length || gameState !== "playing") return;
  const step = tut.steps[tut.i];
  if (step.ready && !step.ready(players[0])) return;
  const c = CONTROL_NAMES[inputKind] || CONTROL_NAMES.keys;
  const basics = tut.steps.filter(s => s.basic).length;
  const label = step.basic ? "STEP " + (tut.steps.slice(0, tut.i + 1).filter(s => s.basic).length) + " OF " + basics : "";
  const done = tut.doneT > 0;
  const x = W / 2, y = banner.time > 0 ? 290 : 118, w = 440, h = 74;   // below the part's name while that shows
  const appear = Math.min(1, tut.t / 0.25 + (done ? 1 : 0));
  ctx.save();
  ctx.globalAlpha = done ? Math.min(1, tut.doneT / 0.4) : appear;
  ctx.fillStyle = "rgba(8, 9, 14, 0.78)";
  ctx.strokeStyle = done ? "#7fe39a" : "rgba(241, 202, 120, 0.85)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 16); ctx.fill(); ctx.stroke();
  ctx.textAlign = "center";
  if (label) { ctx.fillStyle = "rgba(241, 202, 120, 0.8)"; ctx.font = "800 11px 'Barlow Condensed', Impact, sans-serif"; ctx.fillText(label, x, y - 20); }
  ctx.fillStyle = done ? "#7fe39a" : "#ffffff";
  ctx.font = "900 26px 'Barlow Condensed', Impact, sans-serif";
  ctx.fillText(done ? "✓ " + step.title : step.title, x, y + 4);
  ctx.fillStyle = "#d8d4cc"; ctx.font = "600 14px 'DM Sans', Arial, sans-serif";
  ctx.fillText(step.how(c), x, y + 26);
  ctx.restore();
}
