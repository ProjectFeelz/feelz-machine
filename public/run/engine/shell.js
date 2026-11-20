"use strict";

/* Phones held upright: pause and ask for landscape; try to go full screen sideways when a run starts. */
function isPhonePortrait() {
  return window.matchMedia("(pointer: coarse)").matches && window.innerHeight > window.innerWidth;
}

function checkOrientation() {
  // Upright on a phone: the game is simply drawn sideways, so it's plain to turn the phone.
  const root = document.documentElement, on = isPhonePortrait();
  root.classList.toggle("rotated", on);
  const vars = { "--vw": innerHeight / 100, "--vh": innerWidth / 100, "--dvh": innerWidth / 100, "--rot-w": innerHeight, "--rot-h": innerWidth };
  for (const [k, v] of Object.entries(vars)) { if (on) root.style.setProperty(k, v + "px"); else root.style.removeProperty(k); }
  document.getElementById("rotateHint").classList.add("hidden");
}

function tryLandscape() {
  // Full screen on every device when a run starts, like the Feelz Machine app: no browser bar.
  // (Already installed and running full screen: nothing to do.)
  if (document.fullscreenElement || window.matchMedia("(display-mode: fullscreen)").matches) return;
  const el = document.documentElement;
  if (!window.matchMedia("(pointer: coarse)").matches) { if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); return; }
  const go = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : null;
  Promise.resolve(go).then(() => {
    if (screen.orientation && screen.orientation.lock) return screen.orientation.lock("landscape");
  }).catch(() => { /* not allowed here: the turn-sideways card does the job */ }).then(() => setTimeout(checkOrientation, 300));
}

window.addEventListener("resize", () => setTimeout(checkOrientation, 120));

window.addEventListener("orientationchange", () => setTimeout(checkOrientation, 250));

/* ---------------------------------------------------------------------------
   KEYBOARD, TOUCH AND CONTROLLER MENUS
--------------------------------------------------------------------------- */

function typingInForm(event) {
  const tag = event.target && event.target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

window.addEventListener("keydown", event => {
  if (typingInForm(event)) { if (event.key === "Escape") closeMenus(); return; }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
  const key = event.key.toLowerCase();
  // Player 2 joining from the keyboard.
  if (join.active && !join.p2In && event.code === "ArrowUp") { p2Joined("KEYBOARD: ← → ↑ ↓ /"); return; }
  // Menus: arrows move, Enter presses, Escape backs out.
  if (gameState !== "playing" && !reading) {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[event.code] && navLayer()) { navMove(...dirs[event.code]); return; }
    if (key === "enter" && navCurrent && navPress()) { event.preventDefault(); return; }
  }
  if (key === "escape" && menuOpen()) { closeMenus(); return; }
  if (menuOpen()) return;
  if ((key === "escape" || key === "p") && !event.repeat) {
    if (gameState === "playing") { pauseGame(); return; }
    if (gameState === "paused") { resumeGame(); return; }
  }
  if (gameState === "paused") {
    if (key === "enter") { event.preventDefault(); resumeGame(); }
    if (key === "r") restartRun();
    if (key === "m") toggleSound();
    if (key === "l") toggleLyrics();
    return;
  }
  if (key === "enter" && gameState !== "playing") {
    if (gameState === "finished" && performance.now() - finishedAt < 900) return;
    event.preventDefault();
    startGame();
    return;
  }
  keys[event.code] = true;
});

window.addEventListener("keyup", event => { keys[event.code] = false; });

window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

document.addEventListener("visibilitychange", () => { if (document.hidden && gameState === "playing") pauseGame(); });

function bindHold(id, prop) {
  const b = document.getElementById(id);
  if (!b) return;
  const down = e => { e.preventDefault(); touch[prop] = true; };
  const up = e => { e.preventDefault(); touch[prop] = false; };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointerleave", up);
  b.addEventListener("pointercancel", up);
}

bindHold("leftButton", "left");

bindHold("rightButton", "right");

bindHold("jumpButton", "jump");

bindHold("downButton", "down");

bindHold("attackButton", "attack");

// Controllers on the menus: A or Start plays, Start pauses, Y restarts, B closes panels.
function padMenus() {
  readPads();
  for (const pad of pads) {
    if (!pad.connected) continue;
    const startDown = pad.start && !pad.prevStart, aDown = (pad.jump && !pad.prevA) || (pad.attack && !pad.prevX), yDown = pad.y && !pad.prevY, bDown = pad.b && !pad.prevB;
    if (pad.jump || pad.start) retryMusic();
    const settled = gameState !== "finished" || performance.now() - finishedAt > 600;
    // A menu that is showing always has a button picked, so the first press acts instead of only picking one.
    if (gameState !== "playing" && !reading) {
      const layer = navLayer();
      if (layer && (!navCurrent || !navItems(layer).includes(navCurrent))) {
        const items = navItems(layer);
        const pick = items.find(e => e.id === "resumeButton") || items.find(e => e.id === "nextMissionButton") || items.find(e => e.classList.contains("primary-button") && e.id !== "listenLink") ||
          items.find(e => e.id === "restartButton") || items.find(e => e.classList.contains("selected")) || items.find(e => e.id === "playButton") || items[0];
        if (pick) navFocus(pick);
      }
    }
    // D-pad or stick: move between buttons (repeats while held)
    const dir = pad.left ? [-1, 0] : pad.right ? [1, 0] : pad.up ? [0, -1] : pad.down && !pad.b ? [0, 1] : null;
    const now = performance.now();
    if (join.active && !join.p2In && aDown && pads.indexOf(pad) >= 0 && (padsList().length > 1 ? pads.indexOf(pad) === 1 : true)) { p2Joined("CONTROLLER"); }
    else if (gameState === "playing") { if (startDown) pauseGame(); }
    else if (reading) { /* the game reads the page input */ }
    else {
      // Right stick: scrolls the open page (skills, journal, leaderboard...) smoothly, without moving the pick.
      if (pad.lookY) padScroll(pad.lookY);
      if (dir && (!pad.navT || now - pad.navT > (pad.navHeld ? 130 : 240))) { pad.navHeld = !!pad.navT; pad.navT = now; navMove(dir[0], dir[1]); }
      if (!dir) { pad.navT = 0; pad.navHeld = false; }
      if (bDown) navBack();
      else if (aDown && settled && navCurrent && navPress()) { /* pressed the focused button */ }
      else if (gameState === "paused") { if (aDown || startDown) resumeGame(); else if (yDown) restartRun(); }
      else if ((aDown || startDown) && settled && !menuOpen()) startGame();
    }
    pad.prevStart = pad.start; pad.prevA = pad.jump; pad.prevY = pad.y; pad.prevB = pad.b; pad.prevX = pad.attack;
  }
  // Every frame while a controller is plugged in; with none, a quick look four times a second is enough.
  if (pads.some(pd => pd.connected)) requestAnimationFrame(padMenus);
  else setTimeout(() => requestAnimationFrame(padMenus), 250);
}

/* ---------------------------------------------------------------------------
   MENU NAVIGATION: arrows, D-pad or stick move between buttons; A or Enter
   presses; B or Escape backs out. Works on every screen and panel.
--------------------------------------------------------------------------- */

let navCurrent = null;

function navLayer() {
  const panels = MENU_PANELS().filter(o => !o.classList.contains("hidden"));
  if (panels.length) return panels[panels.length - 1];
  if (!pauseOverlay.classList.contains("hidden")) return pauseOverlay;
  if (!finishOverlay.classList.contains("hidden")) return finishOverlay;
  if (!startOverlay.classList.contains("hidden")) return startOverlay;
  return null;
}

function navItems(layer) {
  return Array.from(layer.querySelectorAll("button, a[href], select, input, [tabindex='0']"))
    .filter(e => !e.disabled && e.offsetParent !== null && !e.closest(".hidden"));
}

// The scrolling part of whatever page is open: the right stick moves it.
function padScroll(amount) {
  const layer = navLayer();
  if (!layer) return;
  const box = [layer.querySelector(".journal-body, .skills-body, .leader-list, #artistList"), layer.querySelector(".overlay-card"), layer]
    .find(b => b && b.scrollHeight > b.clientHeight + 2 && getComputedStyle(b).overflowY !== "hidden");
  if (box) box.scrollTop += amount * 16;
}

function navFocus(elm) {
  if (navCurrent) navCurrent.classList.remove("nav-focus");
  navCurrent = elm || null;
  if (!elm) return;
  elm.classList.add("nav-focus");
  try { elm.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
  elm.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function navMove(dx, dy) {
  const layer = navLayer();
  if (!layer) return;
  const items = navItems(layer);
  if (!items.length) return;
  if (!navCurrent || !items.includes(navCurrent)) { navFocus(items.find(e => e.classList.contains("selected")) || items.find(e => e.id === "playButton") || items[0]); return; }
  // A phone held upright draws the game turned a quarter round, so the screen's down is the
  // game's right: read the buttons' places the way the player sees them.
  const turned = document.documentElement.classList.contains("rotated");
  const at = r => turned ? { x: r.top + r.height / 2, y: -(r.left + r.width / 2) } : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const r0 = navCurrent.getBoundingClientRect(), c0 = at(r0);
  let best = null, bestScore = Infinity;
  for (const e of items) {
    if (e === navCurrent) continue;
    const r = e.getBoundingClientRect(), c = at(r);
    const ddx = c.x - c0.x, ddy = c.y - c0.y;
    const along = dx ? ddx * dx : ddy * dy, across = dx ? Math.abs(ddy) : Math.abs(ddx);
    if (along <= 4) continue;
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) navFocus(best);
}

function navPress() {
  if (!navCurrent || !navItems(navLayer() || document.body).includes(navCurrent)) return false;
  if (navCurrent.tagName === "INPUT" || navCurrent.tagName === "SELECT") { navCurrent.focus(); return true; }
  navCurrent.click();
  return true;
}

function navBack() {
  if (menuOpen()) { closeMenus(); return; }
  if (gameState === "paused") { resumeGame(); return; }
}

window.addEventListener("pointermove", () => { if (navCurrent) navCurrent.classList.remove("nav-focus"); }, { passive: true });

/* Phones with 90 and 120Hz screens ask for frames up to twice as often as the game needs, and every
   extra frame is heat and battery. The run draws at most about 90 a second (60 on a 120Hz screen);
   the menu scene and the results screen behind the buttons draw at 30. */
const frameGate = { run: 0, calm: 0 };

function frameDue(now, which, minMs) {
  if (now - frameGate[which] < minMs) return false;
  frameGate[which] = now;
  return true;
}

/* ---------------------------------------------------------------------------
   THE GAME LOOP
--------------------------------------------------------------------------- */

let liteCast = false;
const lite = { t: 0, n: 0 };

function gameLoop(now) {
  if (gameState !== "playing") {
    if (gameState === "finished") { render(); }
    return;
  }
  if (!frameDue(now, "run", 10)) { requestAnimationFrame(gameLoop); return; }
  // The game keeps real time even on a slow phone: when a frame takes long, the game catches up
  // in small steps before drawing, so Koda covers the same ground in the same time as the song
  // (otherwise a phone drawing 15 frames a second plays in slow motion and misses checkpoints).
  let left = Math.max(0, Math.min(0.25, (now - lastTime) / 1000));
  lastTime = now;
  // A device that can't keep up (under ~26 frames a second for a few seconds) draws the people in
  // the background as drawn sheets instead of 3D, keeping 3D for Koda only. It stays that way.
  if (!liteCast && runGate && runGate.phase === "go") {
    lite.t += left; lite.n += 1;
    if (lite.t >= 3) { if (lite.n / lite.t < 26) { liteCast = true; console.warn("[game] lighter background characters on this device"); } lite.t = 0; lite.n = 0; }
  }
  do {
    const dt = Math.min(0.05, left);
    left -= dt;
    frameTime += dt;
    update(dt);
  } while (left > 0.0005 && gameState === "playing");
  // A drawing error never stops the run: the next frame still comes.
  try { render(); } catch (e) { if (!gameLoop.warned) { gameLoop.warned = true; console.warn("[render]", e); } }
  updateHud();
  if (gameState === "playing") requestAnimationFrame(gameLoop);
  else if (gameState === "finished") requestAnimationFrame(finishedLoop);
}

// After the finish the scene keeps moving behind the results.
function finishedLoop(now) {
  if (gameState !== "finished") return;
  if (!frameDue(now, "calm", 28)) { requestAnimationFrame(finishedLoop); return; }
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  frameTime += dt;
  updateParticles(dt);
  flash = Math.max(0, flash - dt * 2.6);
  render();
  requestAnimationFrame(finishedLoop);
}

/* ---------------------------------------------------------------------------
   PHONES: SIDEWAYS FROM THE MENU, AND THE BACK BUTTON
--------------------------------------------------------------------------- */

// The first tap anywhere on the menu goes full screen and sideways, the same as pressing Play does.
document.getElementById("rotateHint").addEventListener("click", e => { if (!(e.target.closest && e.target.closest("#rotateBack"))) tryLandscape(); });

document.getElementById("startOverlay").addEventListener("pointerdown", e => {
  if (e.pointerType === "mouse" || !window.matchMedia("(pointer: coarse)").matches) return;
  if (e.target.closest && e.target.closest("#backHome")) return;
  tryLandscape();
}, { passive: true });

setTimeout(checkOrientation, 0);

// Back (the phone's back button or gesture, or the browser's) steps back through
// the game: it closes a panel, pauses a run, leaves a paused or finished run for
// the menu, and only from the menu leaves the game.
const backNav = { armed: false, leaving: false, warnUntil: 0 };

function armBack() {
  if (backNav.armed || backNav.leaving) return;
  try { history.pushState({ feelzrun: true }, ""); backNav.armed = true; } catch (e) { /* history not available */ }
}

armBack();

window.addEventListener("pointerdown", armBack);

window.addEventListener("keydown", armBack);

function backToast(text) {
  let t = document.getElementById("backToast");
  if (!t) { t = document.createElement("div"); t.id = "backToast"; t.className = "back-toast"; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(backToast.timer);
  backToast.timer = setTimeout(() => t.classList.remove("show"), 2500);
}

window.addEventListener("popstate", () => {
  if (!backNav.armed || backNav.leaving) return;
  backNav.armed = false;
  const visible = el => el && !el.classList.contains("hidden");
  if (visible(coopOverlay)) { document.getElementById("coopClose").click(); }
  else if (menuOpen()) { closeMenus(); }
  else if (gameState === "playing") { pauseGame(); }
  else if (gameState === "paused") { goToMenu(); }
  else if (visible(finishOverlay)) { goToMenu(); }
  else if (Date.now() > backNav.warnUntil) {
    // From the menu: one swipe warns, a second within a few seconds leaves.
    backNav.warnUntil = Date.now() + 2500;
    backToast("SWIPE BACK AGAIN TO LEAVE FEELZ RUN");
  } else {
    backNav.leaving = true;
    // On Feelz Machine, leaving goes to the Games page; anywhere else, back to wherever they came from.
    if (/(^|\.)feelzmachine\.com$/.test(location.hostname)) location.href = "/games"; else history.back();
    return;
  }
  armBack();
});

/* ---------------------------------------------------------------------------
   KEEP THE SCREEN ON
   From pressing Play until you are back on the main menu (pauses, the finish
   screen and co-op lobbies included), the phone does not dim or sleep. The
   browser drops the hold whenever the page is hidden, so it is taken again
   when the game comes back into view.
--------------------------------------------------------------------------- */
const awake = { lock: null, want: false };

async function keepAwake(on) {
  awake.want = on;
  try {
    if (on) {
      if (awake.lock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      awake.lock = await navigator.wakeLock.request("screen");
      awake.lock.addEventListener("release", () => { awake.lock = null; });
      if (!awake.want) { const l = awake.lock; awake.lock = null; l.release(); }
    } else if (awake.lock) {
      const l = awake.lock; awake.lock = null;
      await l.release();
    }
  } catch (e) { awake.lock = null; /* not allowed here: the phone's own sleep setting applies */ }
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && awake.want) keepAwake(true); });
