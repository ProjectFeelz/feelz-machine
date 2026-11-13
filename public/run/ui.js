/*
  FEELZ RUN - MENUS, SCORES AND THE GAME LOOP
  Start screen (missions, 1 or 2 players), pause menu, finish screen, sign in,
  leaderboard, XP and the lifetime collection.
*/

"use strict";

const startOverlay = document.getElementById("startOverlay");
const finishOverlay = document.getElementById("finishOverlay");
const pauseOverlay = document.getElementById("pauseOverlay");
const authOverlay = document.getElementById("authOverlay");
const leaderOverlay = document.getElementById("leaderOverlay");
const skillsOverlay = document.getElementById("skillsOverlay");
const journalOverlay = document.getElementById("journalOverlay");
const joinOverlay = document.getElementById("joinOverlay");
const gameFrame = document.querySelector(".game-frame");

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

let selectedMission = "m01";

/* ---------------------------------------------------------------------------
   PROGRESSION
   XP and level, the lifetime collection (vinyl, notes, knockouts, F.I.L.L.
   coins, journal pages) and the best run on each mission. Signed-in players
   keep it in their account; guests keep it on this device.
--------------------------------------------------------------------------- */

const PROGRESS_KEY = "feelzrun-progress";

const Progress = {
  data: { xp: 0, vinyl: 0, notes: 0, kos: 0, coins: 0, journal: [], runs: 0, best: {}, name: null, country: null, online: false,
          rp_bank: 0, credits: 0, stash: { records: 0, notes: 0, pages: 0, coins: 0 }, unlocks: [], outfit: "gold", dance: "default", vouchers: [] },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (saved) Object.assign(this.data, saved);
    } catch (e) { /* storage blocked: progress lasts until the page closes */ }
    if (!Array.isArray(this.data.journal)) this.data.journal = [];
    if (!this.data.best || typeof this.data.best !== "object") this.data.best = {};
    if (!Array.isArray(this.data.unlocks)) this.data.unlocks = [];
    if (!this.data.stash) this.data.stash = { records: 0, notes: 0, pages: 0, coins: 0 };
    // Finds from earlier runs on this device count too.
    const st = this.data.stash, d = this.data;
    if (!d.stashSeeded && !d.online) {
      d.stashSeeded = true;
      if (!(st.records || st.notes || st.pages || st.coins)) Object.assign(st, { records: d.vinyl || 0, notes: d.notes || 0, pages: (d.journal || []).length, coins: d.coins || 0 });
    }
  },

  save() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
  },

  // Same formula as the server: level 2 at 100 XP, level 3 at 400, level 4 at 900, and so on.
  level(xp) { return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1; },
  levelStart(level) { return 100 * (level - 1) * (level - 1); },

  fromServer(profile) {
    if (!profile) return;
    Object.assign(this.data, {
      xp: profile.xp, vinyl: profile.vinyl_total, notes: profile.notes_total, kos: profile.kos_total,
      coins: profile.coins_total, journal: profile.journal || [], runs: profile.runs, best: profile.best || {},
      name: profile.player_name, country: profile.country, online: true,
      rp_bank: profile.rp_bank || 0, credits: profile.credits || 0, stash: profile.stash || this.data.stash,
      unlocks: profile.unlocks || [], outfit: profile.outfit || "gold", dance: profile.dance || "default",
      vouchers: profile.vouchers || []
    });
    applyStyle();
  }
};
// Signed-in players keep everything in their Feelz Machine account; the copy on this
// device is only for the offline demo.
Progress.load();
if (Backend.online) {
  // Online, nothing carries over from a guest session on this device.
  Object.assign(Progress.data, { xp: 0, vinyl: 0, notes: 0, kos: 0, coins: 0, journal: [], runs: 0, best: {}, rp_bank: 0, credits: 0, unlocks: [], outfit: "gold", dance: "default", vouchers: [], online: false });
}
Progress.save = function () {
  if (Backend.online) return;
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
};

function signedIn() { return Backend.online && Backend.isSignedIn(); }
function mustSignIn() { return Backend.online && !Backend.isSignedIn(); }

// What the player is wearing and which moves they run with.
function applyStyle() {
  const d = Progress.data;
  playerOutfit = OUTFITS[d.outfit] ? d.outfit : "gold";
  playerSkills = d.unlocks.filter(id => { const sk = SKILLS.find(x => x.id === id); return sk && ["movement", "combat", "perk"].includes(sk.kind); });
}
applyStyle();

function totalsFor() {
  return {
    records: level.records.length,
    notes: level.notes.length,
    journal: level.journal.length,
    coin: level.coin ? 1 : 0
  };
}

function scoreRun(r) {
  const s = SCORING;
  const notesRp = r.notesLow * s.notes.low.rp + r.notesMid * s.notes.mid.rp + r.notesHigh * s.notes.high.rp;
  const notesXp = r.notesLow * s.notes.low.xp + r.notesMid * s.notes.mid.xp + r.notesHigh * s.notes.high.xp;
  const full = r.records >= r.total.records && (r.notesLow + r.notesMid + r.notesHigh) >= r.total.notes &&
    r.journals >= r.total.journal && r.coin >= r.total.coin;
  const rp = r.records * s.rpPerRecord + notesRp + r.kos * s.rpPerKnockout +
    r.journals * s.rpPerJournal + r.coin * s.rpCoin + Math.floor(r.spare) * s.rpPerSpareSecond +
    (r.misses === 0 ? s.rpNoMisses : 0) + (r.wipeouts === 0 ? s.rpNoWipeouts : 0) + (full ? s.rpFullCollection : 0);
  const xp = s.xpPerRun + notesXp + r.records * s.xpPerRecord + r.kos * s.xpPerKnockout + s.xpFinish;
  return { rp, xp, notesXp, full };
}

function buildResult(p) {
  const r = {
    mission: mission.id, time: Math.round(realTime * 100) / 100,
    records: p.records, notesLow: p.notes.low, notesMid: p.notes.mid, notesHigh: p.notes.high,
    kos: p.kos, journals: p.journal.length, journalIds: p.journal.slice(), coin: p.coin ? 1 : 0,
    misses, spare: Math.round(spareSeconds * 100) / 100, wipeouts: p.wipeouts, hits: p.hits || 0, total: totalsFor(), token: runToken, posted: false
  };
  Object.assign(r, scoreRun(r));
  return r;
}

/* ---------------------------------------------------------------------------
   START / FINISH
--------------------------------------------------------------------------- */

function startGame(fromJoin) {
  if (gameState === "playing") return;
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  if (!entry || !entry.ready || !MISSION_DATA[selectedMission]) return;
  if (mustSignIn()) { updatePlayerCard(); return; }
  if (twoPlayer && !aiRival && fromJoin !== true) { openJoin(); return; }
  playerNames = [signedIn() && Progress.data.name ? Progress.data.name.toUpperCase() : "", twoPlayer && !aiRival ? join.p2Name : ""];
  applyStyle();
  loadMission(selectedMission);
  loadLyrics();
  resetRun();
  sfx.init();
  startMusic();
  closeMenus();
  gameFrame.classList.remove("menu-mode");
  gameFrame.classList.toggle("two-player", twoPlayer);
  startOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  runToken = null;
  if (signedIn() && !twoPlayer) Backend.startRun(mission.id).then(id => { runToken = id; }).catch(() => { runToken = null; });
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
  tryLandscape();
  setTimeout(checkOrientation, 50);
}

function finishGame() {
  if (gameState === "finished") return;
  gameState = "finished";
  finishedAt = performance.now();
  for (const k in keys) keys[k] = false;
  fadeOutMusic(3);
  sfx.quiet();
  if (twoPlayer) showRaceResults();
  else showResults(buildResult(players[0]));
}

/* ---------------------------------------------------------------------------
   FINISH SCREEN
   Side by side on wide screens (Koda dancing on the left, results on the
   right), stacked on phones held upright (Koda on top, results below).
--------------------------------------------------------------------------- */

function setupListenLink() {
  const link = document.getElementById("listenLink");
  const entry = MISSIONS.find(mi => mi.id === (mission ? mission.id : selectedMission));
  const url = entry ? (entry.listenUrl || "").trim() : "";
  if (!/^https:\/\//i.test(url)) { link.classList.add("hidden"); return; }
  // On Feelz Machine itself the song opens inside the app; anywhere else, in a new tab.
  if (Backend.online) { link.href = new URL(url).pathname; link.target = "_self"; link.removeAttribute("rel"); }
  else { link.href = url; link.target = "_blank"; link.rel = "noopener"; }
  link.textContent = "LISTEN TO " + (mission ? mission.song.title.toUpperCase() : "THE TRACK");
  link.classList.remove("hidden");
}

function showResults(result) {
  lastResult = result;
  document.getElementById("soloResults").classList.remove("hidden");
  document.getElementById("raceResults").classList.add("hidden");
  const notes = result.notesLow + result.notesMid + result.notesHigh;
  setText("finishMission", "MISSION " + String(mission.number).padStart(2, "0") + " · " + mission.title);
  setText("finalRecords", result.records + "/" + result.total.records);
  setText("finalNotes", notes + "/" + result.total.notes);
  setText("finalNotesSplit", result.notesHigh + " GOLD · " + result.notesMid + " DOUBLE · " + result.notesLow + " NOTE");
  const cps = mission.parts.length;
  setText("finalMisses", Math.max(0, cps - result.misses) + "/" + cps);
  setText("finalKos", result.kos);
  setText("finalJournal", result.journals + "/" + result.total.journal);
  setText("finalWipeouts", result.wipeouts + " · " + (result.hits || 0));
  if (result.full && result.misses === 0 && result.wipeouts === 0) {
    setText("finishEyebrow", "FLAWLESS");
    setText("finishLine", "Every record, every note, every checkpoint on the beat.");
  } else if (result.misses === 0) {
    setText("finishEyebrow", "ON THE BEAT");
    setText("finishLine", "Every checkpoint in time, " + Math.round(result.spare / Math.max(1, mission.parts.length)) + " seconds ahead of the song at each one. Now go back for every note and journal page.");
  } else {
    setText("finishEyebrow", "YOU MADE IT");
    setText("finishLine", "The song beat you to " + result.misses + (result.misses === 1 ? " checkpoint" : " checkpoints") + ". Run it back and stay ahead of it.");
  }
  setText("finishTitle", "MISSION COMPLETE");
  setText("finalRp", result.rp.toLocaleString());
  setText("finalXp", "+" + result.xp + " XP");
  setText("finalRank", "");
  setText("finalBest", "");

  const levelBefore = Progress.level(Progress.data.xp);
  if (freeRoam) {
    // Free roam: nothing is scored, only the gems are remembered.
    const found = players[0].gems || 0, total = (level.gems || []).length;
    const d = Progress.data; d.gems = d.gems || {};
    d.gems[mission.id] = Math.max(d.gems[mission.id] || 0, found);
    Progress.save();
    setText("finishTitle", "FREE ROAM");
    setText("finishEyebrow", "THE END OF THE ROAD");
    setText("finishLine", "You found " + found + " of " + total + " hidden gems in " + mission.title + ". Best: " + d.gems[mission.id] + ".");
    setText("finalSaved", "Free roam is not scored. Play the mission to post a run.");
    document.getElementById("postScoreButton").classList.add("hidden");
    setupListenLink();
    return;
  }
  if (signedIn()) {
    setText("finalSaved", "Posting your run...");
    postResult(result, levelBefore);
  } else {
    const d = Progress.data;
    d.xp += result.xp; d.vinyl += result.records; d.notes += notes; d.kos += result.kos; d.rp_bank += result.rp;
    d.coins += result.coin; d.runs += 1;
    // what this run is worth in credits, waiting to be turned into credits when you sign in
    d.stash = d.stash || { records: 0, notes: 0, pages: 0, coins: 0 };
    const newPages = result.journalIds.filter(id => !d.journal.includes(id)).length;
    d.stash.records += result.records; d.stash.notes += notes; d.stash.pages += newPages; d.stash.coins += result.coin;
    for (const id of result.journalIds) if (!d.journal.includes(id)) d.journal.push(id);
    const best = d.best[result.mission];
    const newBest = !best || result.rp > best.rp;
    if (newBest) d.best[result.mission] = { rp: result.rp, time: result.time };
    Progress.save();
    setText("finalBest", newBest ? "NEW PERSONAL BEST" : "");
    setText("finalSaved", "Demo: progress saved on this device. Play at feelzmachine.com/run to post scores and earn credits.");
    showLevelUp(levelBefore);
  }
  document.getElementById("postScoreButton").classList.add("hidden");
  setupListenLink();
  updatePlayerCard();
  finishOverlay.classList.remove("hidden");
  setupNextButton();
  startDance(1);
}

function showRaceResults() {
  document.getElementById("soloResults").classList.add("hidden");
  document.getElementById("raceResults").classList.remove("hidden");
  document.getElementById("postScoreButton").classList.add("hidden");
  setText("finishMission", "MISSION " + String(mission.number).padStart(2, "0") + " · " + mission.title + (aiRival ? " · VS RIVAL (" + aiLevel.toUpperCase() + ")" : " · 2 PLAYER RACE"));
  document.querySelector("#raceP1 h3").textContent = aiRival ? "YOU" : "P1";
  document.querySelector("#raceP2 h3").textContent = aiRival ? "RIVAL" : "P2";
  // Points: every record counts, plus 10 for finishing first and 5 for finishing second.
  const points = p => p.records + (p.place === 1 ? 10 : p.place === 2 ? 5 : 0);
  const [a, b] = players;
  const pa = points(a), pb = points(b);
  let winner = pa > pb ? a : pb > pa ? b : (a.place && (!b.place || a.place < b.place) ? a : b);
  if (pa === pb && !a.place && !b.place) winner = a.x >= b.x ? a : b;
  setText("finishEyebrow", "RACE OVER");
  setText("finishTitle", aiRival ? (winner.id === 1 ? "YOU BEAT THE RIVAL" : "THE RIVAL WINS") : "P" + winner.id + " WINS");
  setText("finishLine", "First to the finish gets 10 bonus points, second gets 5. Every record is a point.");
  for (const p of players) {
    const n = p.notes.low + p.notes.mid + p.notes.high;
    setText("raceP" + p.id + "Place", p.place ? (p.place === 1 ? "1ST" : "2ND") : "DNF");
    setText("raceP" + p.id + "Records", p.records);
    setText("raceP" + p.id + "Notes", n);
    setText("raceP" + p.id + "Kos", p.kos);
    setText("raceP" + p.id + "Time", p.place ? formatTime(p.finishTime) : "-");
    setText("raceP" + p.id + "Points", points(p));
    document.getElementById("raceP" + p.id).classList.toggle("winner", p === winner);
  }
  setText("finalSaved", "");
  setupListenLink();
  finishOverlay.classList.remove("hidden");
  setupNextButton();
  startDance(winner.id);
}

async function postResult(result, levelBefore) {
  if (result.posted) return;
  try {
    const res = await Backend.submitRun({
      run_id: result.token, mission: result.mission, run_time: result.time, records: result.records,
      notes_low: result.notesLow, notes_mid: result.notesMid, notes_high: result.notesHigh,
      kos: result.kos, journals: result.journalIds, coin: result.coin,
      misses: result.misses, spare_seconds: result.spare, wipeouts: result.wipeouts
    });
    result.posted = true;
    setText("finalRp", Number(res.rp).toLocaleString());
    setText("finalXp", "+" + res.xp_gained + " XP");
    setText("finalBest", res.new_best ? "NEW PERSONAL BEST" : "");
    setText("finalRank", res.rank ? "GLOBAL RANK #" + res.rank : "");
    setText("finalSaved", "Posted to the global leaderboard. +" + Number(res.rp).toLocaleString() + " RP to spend in SKILLS.");
    const profile = await Backend.me();
    Progress.fromServer(profile);
    showLevelUp(levelBefore);
    updatePlayerCard();
    document.getElementById("postScoreButton").classList.add("hidden");
  } catch (e) {
    setText("finalSaved", "Couldn't post this run: " + e.message);
  }
}

function showLevelUp(levelBefore) {
  const xp = Progress.data.xp;
  const lv = Progress.level(xp);
  const start = Progress.levelStart(lv), next = Progress.levelStart(lv + 1);
  setText("finalLevel", "LEVEL " + lv);
  setText("finalLevelUp", lv > levelBefore ? "LEVEL UP!" : "");
  const fill = document.getElementById("finalXpFill");
  if (fill) fill.style.width = Math.round(100 * (xp - start) / (next - start)) + "%";
}

let danceTimer = null;
const danceArt = {};      // dance id -> { img, mask }
const danceSheets = {};   // dance id + outfit (or "rival") -> canvas
SPRITES.dances.zora = { name: "Zora", src: SPRITES.dance_zora.src, mask: SPRITES.dance_zora.src };
function danceImages(id) {
  const def = SPRITES.dances[id] || SPRITES.dances.default;
  if (!danceArt[id]) danceArt[id] = { img: loadImage(def.src), mask: loadImage(def.mask) };
  return danceArt[id];
}
function danceSheet(id, outfit, rival) {
  const a = danceImages(id);
  if (!a.img.ready) return null;
  const key = id + ":" + (rival ? "rival" : outfit);
  if (danceSheets[key]) return danceSheets[key];
  let sheet = a.img;
  if (!rival && outfit && outfit !== "gold" && id !== "zora") {
    if (!a.mask.ready) return a.img;
    sheet = recolorSheet(a.img, a.mask, outfit) || a.img;
  }
  if (rival) {
    const c = document.createElement("canvas");
    c.width = a.img.width; c.height = a.img.height;
    const k = c.getContext("2d");
    k.drawImage(a.img, 0, 0);
    k.globalCompositeOperation = "source-atop";
    k.fillStyle = "rgba(40, 190, 255, 0.38)";
    k.fillRect(0, 0, c.width, c.height);
    sheet = c;
  }
  danceSheets[key] = sheet;
  return sheet;
}
// Load the default dance early so the finish screen never waits for it.
danceImages("default");

function startDance(playerId) {
  const c = document.getElementById("danceCanvas");
  if (!c) return;
  const d = SPRITES.dance;
  const dctx = c.getContext("2d");
  const rival = playerId === 2;
  const id = mission && mission.player === "zora" ? "zora" : rival ? "default" : (Progress.data.dance || "default");
  danceImages(id);
  if (danceTimer) clearInterval(danceTimer);
  let frame = 0;
  danceTimer = setInterval(() => {
    if (finishOverlay.classList.contains("hidden")) { clearInterval(danceTimer); danceTimer = null; return; }
    const img = danceSheet(id, playerOutfit, rival) || danceSheet("default", playerOutfit, rival);
    if (!img) return;
    const rect = c.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const wantW = Math.max(60, Math.round(rect.width * ratio)), wantH = Math.max(60, Math.round(rect.height * ratio));
    if (c.width !== wantW || c.height !== wantH) { c.width = wantW; c.height = wantH; }
    dctx.clearRect(0, 0, c.width, c.height);
    const glow = dctx.createRadialGradient(c.width / 2, c.height * 0.92, 4, c.width / 2, c.height * 0.92, c.width * 0.6);
    glow.addColorStop(0, "rgba(241, 202, 120, 0.35)"); glow.addColorStop(1, "rgba(241, 202, 120, 0)");
    dctx.fillStyle = glow;
    dctx.fillRect(0, 0, c.width, c.height);
    const s = Math.min(c.width / d.frameWidth, (c.height * 0.94) / d.frameHeight);
    const w = d.frameWidth * s, h = d.frameHeight * s;
    dctx.drawImage(img, frame * d.frameWidth, 0, d.frameWidth, d.frameHeight, (c.width - w) / 2, c.height * 0.97 - h, w, h);
    frame = (frame + 1) % d.frames;
  }, 1000 / d.fps);
}

/* ---------------------------------------------------------------------------
   HUD
--------------------------------------------------------------------------- */

const hud = {
  records: document.getElementById("hudRecords"),
  xp: document.getElementById("hudXp"),
  race: document.getElementById("hudRace"),
  hearts: document.getElementById("hearts"),
  timer: document.getElementById("timer"),
  zone: document.getElementById("zoneName"),
  last: ""
};

function updateHud() {
  if (!players.length || !mission) return;
  const p = players[0];
  const part = mission.parts[currentPartIndex()];
  const remaining = part.end - songClock;
  const timer = freeRoam ? "FREE" : formatTime(Math.max(0, Math.ceil(remaining)));
  const xp = SCORING.notes.low.xp * p.notes.low + SCORING.notes.mid.xp * p.notes.mid + SCORING.notes.high.xp * p.notes.high;
  const race = twoPlayer ? playerName(players[0]) + " " + players[0].records + "  ·  " + playerName(players[1]) + " " + players[1].records : "";
  const zone = part.name + " · " + sectionAt(leader().x).name;
  const key = [p.records, xp, p.hearts, maxHearts(p), timer, zone, race].join("|");
  if (key === hud.last) return;
  hud.last = key;
  hud.records.textContent = String(p.records).padStart(2, "0");
  hud.xp.textContent = xp;
  hud.race.textContent = race;
  hud.timer.textContent = timer;
  hud.timer.classList.toggle("over", remaining < 6 && !freeRoam);
  hud.zone.textContent = zone;
  const spans = hud.hearts.children;
  for (let i = 0; i < spans.length; i++) {
    spans[i].classList.toggle("hidden", i >= maxHearts(p));
    spans[i].classList.toggle("lost", i >= p.hearts);
  }
}

/* ---------------------------------------------------------------------------
   PAUSE
--------------------------------------------------------------------------- */

function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  sfx.holdPad(false);
  for (const k in keys) keys[k] = false;
  songAudio.pause();
  sfx.quiet();
  setText("pauseTrack", "MISSION " + String(mission.number).padStart(2, "0") + " · " + mission.title + " · " + (mission.parts[currentPartIndex()] || {}).name);
  pauseOverlay.classList.remove("hidden");
  navFocus(document.getElementById("resumeButton"));
}

function resumeGame() {
  if (gameState !== "paused") return;
  pauseOverlay.classList.add("hidden");
  gameState = "playing";
  players.forEach(p => { p.jumpPressed = true; p.attackPressed = true; });
  sfx.init();
  songAudio.play().then(() => { musicBlocked = false; }).catch(() => { musicBlocked = true; });
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// The mission after this one, if it's ready to play.
function nextMissionEntry() {
  const id = mission ? mission.id : selectedMission;
  const i = MISSIONS.findIndex(mi => mi.id === id);
  const next = i >= 0 ? MISSIONS[i + 1] : null;
  return next && next.ready && MISSION_DATA[next.id] ? next : null;
}
function setupNextButton() {
  const next = nextMissionEntry(), btn = document.getElementById("nextMissionButton");
  btn.classList.toggle("hidden", !next);
  if (next) btn.textContent = "NEXT: " + next.title + " →";
}
function playNextMission() {
  const next = nextMissionEntry();
  if (!next) return;
  selectedMission = next.id;
  buildMissionStrip();
  pauseOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  gameState = "ready";
  startGame(twoPlayer && !aiRival ? true : undefined);
}

/* Phones held upright: pause and ask for landscape; try to go full screen sideways when a run starts. */
function isPhonePortrait() {
  return window.matchMedia("(pointer: coarse)").matches && window.innerHeight > window.innerWidth;
}
function checkOrientation() {
  const running = gameState === "playing" || gameState === "paused";
  const show = running && isPhonePortrait();
  document.getElementById("rotateHint").classList.toggle("hidden", !show);
  if (show && gameState === "playing") { pauseGame(); rotatePaused = true; }
  else if (!show && rotatePaused && gameState === "paused") { rotatePaused = false; resumeGame(); }
  if (!running) rotatePaused = false;
}
let rotatePaused = false;
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

function restartRun() {
  pauseOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  gameState = "ready";
  startGame();
}

function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem("feelzrun-sound", soundOn ? "on" : "off"); } catch (e) { /* storage blocked */ }
  applySound();
  setText("soundButton", soundOn ? "SOUND: ON" : "SOUND: OFF");
}

function toggleLyrics() {
  lyricsOn = !lyricsOn;
  try { localStorage.setItem("feelzrun-lyrics", lyricsOn ? "on" : "off"); } catch (e) { /* storage blocked */ }
  setText("lyricsButton", lyricsOn ? "LYRICS: ON" : "LYRICS: OFF");
}

function goToMenu() {
  document.getElementById("rotateHint").classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  closeMenus();
  if (gameState === "playing" || gameState === "paused") fadeOutMusic(1.2);
  sfx.quiet();
  gameState = "ready";
  for (const k in keys) keys[k] = false;
  startOverlay.classList.remove("hidden");
  gameFrame.classList.add("menu-mode");
  gameFrame.classList.remove("two-player");
  updatePlayerCard();
  requestAnimationFrame(attractLoop);
}

/* ---------------------------------------------------------------------------
   START SCREEN: missions, 1 or 2 players, player card
--------------------------------------------------------------------------- */

function buildMissionStrip() {
  const strip = document.getElementById("missionStrip");
  strip.innerHTML = "";
  MISSIONS.forEach((mi, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mission-card" + (mi.ready ? "" : " locked") + (mi.id === selectedMission ? " selected" : "");
    card.style.backgroundImage = "url(assets/missions/" + mi.id + ".webp)";
    card.setAttribute("aria-label", "Mission " + (i + 1) + ": " + mi.title + (mi.ready ? "" : " (coming soon)"));
    const num = document.createElement("span"); num.className = "mc-num"; num.textContent = String(i + 1).padStart(2, "0");
    const title = document.createElement("span"); title.className = "mc-title"; title.textContent = mi.title;
    const status = document.createElement("span"); status.className = "mc-status";
    const best = Progress.data.best[mi.id];
    status.textContent = mi.ready ? (best ? "BEST " + Number(best.rp).toLocaleString() + " RP" : "PLAY") : "COMING SOON";
    card.append(num, title, status);
    card.addEventListener("click", () => {
      if (!mi.ready) return;
      selectedMission = mi.id;
      buildMissionStrip();
    });
    strip.appendChild(card);
  });
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  setText("trackLine", "MISSION " + String(MISSIONS.indexOf(entry) + 1).padStart(2, "0") + " · " + entry.title);
}

// mode: "1" one player, "2" two player race, "ai" race against the AI rival, "free" free roam.
function setMode(mode) {
  twoPlayer = mode === "2" || mode === "ai";
  aiRival = mode === "ai";
  freeRoam = mode === "free";
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("controlsSolo").classList.toggle("hidden", mode === "2");
  document.getElementById("freeNote").classList.toggle("hidden", mode !== "free");
  document.getElementById("controlsRace").classList.toggle("hidden", mode !== "2");
  document.getElementById("aiLevels").classList.toggle("hidden", mode !== "ai");
}

function setAiLevel(level) {
  aiLevel = level;
  document.querySelectorAll("[data-ai]").forEach(b => b.classList.toggle("active", b.dataset.ai === level));
}

function flagFor(country) {
  if (!country || country.length !== 2) return "";
  return String.fromCodePoint(...country.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0)));
}

function updatePlayerCard() {
  const d = Progress.data;
  const lv = Progress.level(d.xp);
  const start = Progress.levelStart(lv), next = Progress.levelStart(lv + 1);
  const gate = mustSignIn();
  setText("pcName", signedIn() && d.name ? (flagFor(d.country) + " " + d.name).trim() : (Backend.online ? "SIGN IN TO PLAY" : "GUEST"));
  setText("pcLevel", lv);
  setText("pcXp", (d.xp - start) + " / " + (next - start) + " XP");
  const fill = document.getElementById("pcXpFill");
  if (fill) fill.style.width = Math.round(100 * (d.xp - start) / (next - start)) + "%";
  setText("pcVinyl", (d.vinyl || 0).toLocaleString());
  setText("pcNotes", (d.notes || 0).toLocaleString());
  setText("pcJournal", (d.journal || []).length);
  setText("pcRp", (d.rp_bank || 0).toLocaleString());
  // Signed in: credits on the account. Playing here: what your finds are worth, ready to convert.
  const st = d.stash || {};
  const waiting = (st.records || 0) * CREDITS.perRecord + (st.notes || 0) * CREDITS.perNote + (st.pages || 0) * CREDITS.perPage + (st.coins || 0) * CREDITS.perCoin;
  setText("pcCredits", (signedIn() ? (d.credits || 0) : waiting).toLocaleString());
  setText("pcSave", signedIn() ? "Saved to your Feelz Machine account" : (Backend.online ? "Your Feelz Machine account keeps your progress" : "Demo: progress saved on this device"));
  document.getElementById("accountButton").classList.toggle("hidden", !signedIn());
  document.getElementById("leaderboardButton").classList.toggle("hidden", !Backend.online);
  document.getElementById("playActions").classList.toggle("hidden", gate);
  document.getElementById("signinGate").classList.toggle("hidden", !gate);
  document.getElementById("playerCard").classList.toggle("hidden", gate);
  if (gate) {
    document.getElementById("signinLink").href = Backend.loginUrl(false);
    document.getElementById("signupLink").href = Backend.loginUrl(true);
  }
  buildMissionStrip();
}

/* ---------------------------------------------------------------------------
   SIGN IN AND LEADERBOARD
--------------------------------------------------------------------------- */

const MENU_PANELS = () => [authOverlay, leaderOverlay, skillsOverlay, journalOverlay, joinOverlay];
function menuOpen() {
  return MENU_PANELS().some(o => !o.classList.contains("hidden"));
}

function closeMenus() {
  MENU_PANELS().forEach(o => o.classList.add("hidden"));
  join.active = false;
  navFocus(null);
}

function authError(message) { setText("authError", message || ""); }

function openPlayerSettings() {
  if (!signedIn()) return;
  fillCountries();
  authError("");
  const u = Backend.user();
  setText("authEmailLine", u && u.email ? "SIGNED IN AS " + u.email.toUpperCase() : "YOUR FEELZ MACHINE ACCOUNT");
  document.getElementById("authName").value = Progress.data.name || "";
  document.getElementById("authCountry").value = Progress.data.country || "";
  authOverlay.classList.remove("hidden");
}

function fillCountries() {
  const select = document.getElementById("authCountry");
  if (!select || select.options.length > 1) return;
  const codes = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
  let names = null;
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { /* older browsers: show codes */ }
  const list = codes.map(code => ({ code, name: names ? names.of(code) : code })).sort((a, b) => a.name.localeCompare(b.name));
  for (const c of list) {
    const option = document.createElement("option");
    option.value = c.code;
    option.textContent = flagFor(c.code) + " " + c.name;
    select.appendChild(option);
  }
}

async function savePlayer() {
  const name = document.getElementById("authName").value.trim();
  const country = document.getElementById("authCountry").value;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return authError("Player name: 3 to 16 letters, numbers or _.");
  const button = document.getElementById("authSave");
  button.disabled = true; button.textContent = "SAVING...";
  try {
    await Backend.updatePlayer(name, country);
    Progress.fromServer(await Backend.me());
    updatePlayerCard();
    closeMenus();
  } catch (e) { authError(e.message); }
  finally { button.disabled = false; button.textContent = "SAVE"; }
}

async function refreshFromServer() {
  if (!signedIn()) return;
  try { Progress.fromServer(await Backend.me()); } catch (e) { /* keep what we have */ }
  updatePlayerCard();
}

/* ---------------------------------------------------------------------------
   SKILLS: unlock moves, perks and style with RP; turn collectibles into
   credits; spend credits on song vouchers; buy the song with the voucher.
--------------------------------------------------------------------------- */

let skillsTab = "movement";

function skillsError(message) { setText("skillsError", message || ""); }

function openSkills(tab) {
  if (tab) skillsTab = tab;
  skillsError("");
  skillsOverlay.classList.remove("hidden");
  renderSkills();
  if (signedIn()) refreshFromServer().then(renderSkills);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function runSkillAction(button, fn) {
  skillsError("");
  button.disabled = true;
  try { await fn(); } catch (e) { skillsError(e.message); }
  finally { button.disabled = false; updatePlayerCard(); renderSkills(); }
}

function unlockSkill(sk) {
  const d = Progress.data;
  if (signedIn()) return Backend.unlock(sk.id).then(p => Progress.fromServer(p));
  if (Progress.level(d.xp) < sk.level) throw new Error("Reach level " + sk.level + " first.");
  if (d.rp_bank < sk.rp) throw new Error("You need " + sk.rp + " RP to unlock that.");
  d.rp_bank -= sk.rp; d.unlocks.push(sk.id); applyStyle(); Progress.save();
  return Promise.resolve();
}

function equipStyle(outfit, dance) {
  const d = Progress.data;
  if (signedIn()) return Backend.setStyle(outfit, dance).then(p => Progress.fromServer(p));
  d.outfit = outfit; d.dance = dance; applyStyle(); Progress.save();
  return Promise.resolve();
}

function renderSkills() {
  const d = Progress.data, lv = Progress.level(d.xp);
  setText("skillsWallet", "LEVEL " + lv + " · " + (d.rp_bank || 0).toLocaleString() + " RP · " + (d.credits || 0).toLocaleString() + " CREDITS");
  document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === skillsTab));
  const body = document.getElementById("skillsBody");
  body.innerHTML = "";
  if (skillsTab === "credits") { renderCredits(body); return; }
  if (skillsTab === "style") { renderStyle(body); return; }
  const grid = el("div", "skill-grid");
  for (const sk of SKILLS.filter(x => x.kind === skillsTab)) {
    const owned = d.unlocks.includes(sk.id);
    const card = el("div", "skill-card" + (owned ? " owned" : ""));
    card.append(el("h3", "", sk.name), el("p", "skill-how", sk.how), el("p", "skill-text", sk.text));
    const foot = el("div", "skill-foot");
    if (owned) foot.append(el("span", "skill-tag", "UNLOCKED"));
    else {
      foot.append(el("span", "skill-cost", "LV " + sk.level + " · " + sk.rp.toLocaleString() + " RP"));
      const b = el("button", "secondary-button small", lv < sk.level ? "LV " + sk.level + " NEEDED" : "UNLOCK");
      b.type = "button";
      b.disabled = lv < sk.level || d.rp_bank < sk.rp;
      b.addEventListener("click", () => runSkillAction(b, () => unlockSkill(sk)));
      foot.append(b);
    }
    card.append(foot);
    grid.append(card);
  }
  body.append(grid);
}

function renderStyle(body) {
  const d = Progress.data, lv = Progress.level(d.xp);
  body.append(el("p", "skills-sub", "OUTFIT"));
  const og = el("div", "style-grid");
  for (const [id, o] of Object.entries(OUTFITS)) {
    const sk = SKILLS.find(x => x.outfit === id);
    const owned = id === "gold" || d.unlocks.includes(sk.id);
    const card = el("button", "style-card" + (d.outfit === id ? " active" : "") + (owned ? "" : " locked"));
    card.type = "button";
    const sw = el("span", "swatch"); sw.style.background = o.swatch;
    card.append(sw, el("span", "style-name", o.name), el("span", "style-tag", d.outfit === id ? "WEARING" : owned ? "WEAR" : "LV " + sk.level + " · " + sk.rp + " RP"));
    card.addEventListener("click", () => runSkillAction(card, async () => {
      if (!owned) await unlockSkill(sk);
      await equipStyle(id, Progress.data.dance);
    }));
    og.append(card);
  }
  body.append(og);
  body.append(el("p", "skills-sub", "FINISH DANCE"));
  const dg = el("div", "style-grid");
  for (const [id, dn] of Object.entries(SPRITES.dances)) {
    if (id === "zora") continue;   // Zora's own, for her mission
    const sk = SKILLS.find(x => x.dance === id);
    const owned = id === "default" || d.unlocks.includes(sk.id);
    const card = el("button", "style-card" + (d.dance === id ? " active" : "") + (owned ? "" : " locked"));
    card.type = "button";
    card.append(el("span", "style-name", dn.name), el("span", "style-tag", d.dance === id ? "DANCING" : owned ? "PICK" : "LV " + sk.level + " · " + sk.rp + " RP"));
    card.addEventListener("click", () => runSkillAction(card, async () => {
      if (!owned) await unlockSkill(sk);
      await equipStyle(Progress.data.outfit, id);
    }));
    dg.append(card);
  }
  body.append(dg);
  void lv;
}

function renderCredits(body) {
  const d = Progress.data;
  if (!signedIn()) {
    const st = d.stash || { records: 0, notes: 0, pages: 0, coins: 0 };
    const worth = st.records * CREDITS.perRecord + st.notes * CREDITS.perNote + st.pages * CREDITS.perPage + st.coins * CREDITS.perCoin;
    body.append(el("p", "skills-sub", "YOUR FINDS · " + worth.toLocaleString() + " CREDITS WAITING"));
    const row = el("div", "credit-row");
    row.append(
      el("span", "", st.records + " records × " + CREDITS.perRecord),
      el("span", "", st.notes + " notes × " + CREDITS.perNote),
      el("span", "", st.pages + " journal pages × " + CREDITS.perPage),
      el("span", "", st.coins + " coins × " + CREDITS.perCoin));
    body.append(row);
    body.append(el("p", "skills-note", "Sign in with your Feelz Machine account at feelzmachine.com/run to turn them into credits and use them for money off the album songs."));
    return;
  }
  const st = d.stash || {};
  const worth = st.records * CREDITS.perRecord + st.notes * CREDITS.perNote + st.pages * CREDITS.perPage + st.coins * CREDITS.perCoin;
  const box = el("div", "credit-box");
  box.append(el("p", "skills-sub", "COLLECTED SINCE YOUR LAST CONVERT"));
  const row = el("div", "credit-row");
  row.append(
    el("span", "", st.records + " records × " + CREDITS.perRecord),
    el("span", "", st.notes + " notes × " + CREDITS.perNote),
    el("span", "", st.pages + " journal pages × " + CREDITS.perPage),
    el("span", "", st.coins + " coins × " + CREDITS.perCoin));
  const conv = el("button", "primary-button", worth > 0 ? "CONVERT TO " + worth.toLocaleString() + " CREDITS" : "NOTHING TO CONVERT YET");
  conv.type = "button"; conv.disabled = worth <= 0;
  conv.addEventListener("click", () => runSkillAction(conv, async () => Progress.fromServer(await Backend.convert())));
  box.append(row, conv);
  body.append(box);

  body.append(el("p", "skills-sub", "SONG VOUCHERS · MONEY OFF THE ALBUM ON FEELZ MACHINE"));
  const pick = el("div", "voucher-pick");
  const select = el("select", "voucher-select");
  for (const t of ALBUM_TRACKS) { const o = el("option", "", t.title); o.value = t.id; select.append(o); }
  const cur = MISSIONS.find(mi => mi.id === selectedMission);
  const pre = ALBUM_TRACKS.find(t => t.mission === (cur ? cur.id : "m01"));
  if (pre) select.value = pre.id;
  pick.append(select);
  for (const v of VOUCHERS) {
    const b = el("button", "secondary-button small", v.percent + "% OFF · " + v.cost.toLocaleString());
    b.type = "button"; b.disabled = d.credits < v.cost;
    b.addEventListener("click", () => runSkillAction(b, async () => Progress.fromServer(await Backend.buyVoucher(select.value, v.percent))));
    pick.append(b);
  }
  body.append(pick);

  const list = el("div", "voucher-list");
  if (!d.vouchers.length) list.append(el("p", "skills-note", "No vouchers yet."));
  for (const v of d.vouchers) {
    const item = el("div", "voucher-item");
    item.append(el("span", "voucher-pct", v.percent + "%"), el("span", "voucher-title", v.title), el("span", "voucher-code", v.code));
    const buy = el("button", "primary-button small", v.status === "active" ? "BUY THE SONG" : "FINISH BUYING");
    buy.type = "button";
    buy.addEventListener("click", () => openCheckout(v));
    item.append(buy);
    list.append(item);
  }
  body.append(list);
  body.append(el("div", "checkout hidden"));
}

// Checkout: Feelz Machine's own PayPal checkout, with the voucher taken off on the server.
let paypalLoading = null;
function loadPayPal() {
  if (window.paypal) return Promise.resolve();
  if (paypalLoading) return paypalLoading;
  paypalLoading = Backend.paypalClientId().then(id => new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(id) + "&currency=USD";
    sc.onload = resolve; sc.onerror = () => reject(new Error("PayPal didn't load. Try again."));
    document.head.appendChild(sc);
  })).catch(e => { paypalLoading = null; throw e; });
  return paypalLoading;
}

async function openCheckout(v) {
  skillsError("");
  const box = document.querySelector("#skillsBody .checkout");
  box.classList.remove("hidden");
  box.innerHTML = "";
  box.append(el("p", "skills-sub", v.title.toUpperCase() + " · " + v.percent + "% OFF WITH " + v.code));
  const holder = el("div", "paypal-holder"); holder.id = "paypalHolder";
  box.append(holder);
  const note = el("p", "skills-note", "You pay Big Feelz directly through PayPal. The song goes into your Feelz Machine library.");
  box.append(note);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    await loadPayPal();
    window.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "pay" },
      createOrder: async () => {
        skillsError("");
        try { return (await Backend.createOrder(v.track_id, v.code, v.title)).orderId; }
        catch (e) { skillsError(e.message); throw e; }
      },
      onApprove: async data => {
        try {
          await Backend.captureOrder(data.orderID);
          box.innerHTML = "";
          box.append(el("p", "skills-sub", "IT'S YOURS"));
          const a = el("a", "primary-button small", "OPEN IT ON FEELZ MACHINE");
          a.href = "/track/" + v.slug;
          box.append(el("p", "skills-note", v.title + " is in your Feelz Machine library to stream and download."), a);
          await refreshFromServer();
        } catch (e) { skillsError(e.message); }
      },
      onError: () => skillsError("The payment didn't go through. Nothing was charged.")
    }).render("#paypalHolder");
  } catch (e) { skillsError(e.message); }
}

async function openLeaderboard(period) {
  leaderOverlay.classList.remove("hidden");
  period = period || "all";
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  setText("leaderMission", "MISSION " + String(MISSIONS.indexOf(entry) + 1).padStart(2, "0") + " · " + entry.title);
  document.querySelectorAll("[data-period]").forEach(b => b.classList.toggle("active", b.dataset.period === period));
  const list = document.getElementById("leaderList");
  list.innerHTML = "<li class='leader-empty'>Loading...</li>";
  setText("leaderYou", "");
  try {
    const rows = await Backend.leaderboard(selectedMission, period, 50);
    list.innerHTML = "";
    if (!rows || !rows.length) list.innerHTML = "<li class='leader-empty'>No runs yet. Be the first on the board.</li>";
    (rows || []).forEach(row => {
      const li = document.createElement("li");
      if (row.is_me) li.classList.add("me");
      const rank = document.createElement("span"); rank.className = "lb-rank"; rank.textContent = "#" + row.rank;
      const name = document.createElement("span"); name.className = "lb-name"; name.textContent = (flagFor(row.country) + " " + row.player_name).trim();
      const lv = document.createElement("span"); lv.className = "lb-level"; lv.textContent = "LV " + row.level;
      const rp = document.createElement("span"); rp.className = "lb-rp"; rp.textContent = Number(row.best_rp).toLocaleString() + " RP";
      li.append(rank, name, lv, rp);
      list.appendChild(li);
    });
    if (signedIn() && !(rows || []).some(r => r.is_me)) setText("leaderYou", "Finish this mission to get on this board.");
  } catch (e) {
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "leader-empty";
    li.textContent = "Couldn't load the leaderboard: " + e.message;
    list.appendChild(li);
  }
}

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
      if (dir && (!pad.navT || now - pad.navT > (pad.navHeld ? 130 : 240))) { pad.navHeld = !!pad.navT; pad.navT = now; navMove(dir[0], dir[1]); }
      if (!dir) { pad.navT = 0; pad.navHeld = false; }
      if (bDown) navBack();
      else if (aDown && settled && navCurrent && navPress()) { /* pressed the focused button */ }
      else if (gameState === "paused") { if (aDown || startDown) resumeGame(); else if (yDown) restartRun(); }
      else if ((aDown || startDown) && settled && !menuOpen()) startGame();
    }
    pad.prevStart = pad.start; pad.prevA = pad.jump; pad.prevY = pad.y; pad.prevB = pad.b; pad.prevX = pad.attack;
  }
  requestAnimationFrame(padMenus);
}

document.getElementById("playButton").addEventListener("click", startGame);
document.getElementById("restartButton").addEventListener("click", restartRun);
document.getElementById("nextMissionButton").addEventListener("click", playNextMission);
document.getElementById("pauseButton").addEventListener("click", pauseGame);
document.getElementById("resumeButton").addEventListener("click", resumeGame);
document.getElementById("restartRunButton").addEventListener("click", restartRun);
document.getElementById("soundButton").addEventListener("click", toggleSound);
document.getElementById("lyricsButton").addEventListener("click", toggleLyrics);
document.getElementById("menuButton").addEventListener("click", goToMenu);
document.getElementById("finishMenuButton").addEventListener("click", goToMenu);
document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll("[data-ai]").forEach(b => b.addEventListener("click", () => setAiLevel(b.dataset.ai)));
document.getElementById("leaderboardButton").addEventListener("click", () => openLeaderboard("all"));
document.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => openLeaderboard(b.dataset.period)));
document.getElementById("accountButton").addEventListener("click", openPlayerSettings);
document.getElementById("authSave").addEventListener("click", savePlayer);
document.getElementById("authSignOut").addEventListener("click", async () => {
  await Backend.signOut();
  closeMenus();
  Object.assign(Progress.data, { name: null, online: false });
  updatePlayerCard();
});
document.getElementById("skillsButton").addEventListener("click", () => openSkills());
document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { skillsTab = b.dataset.tab; skillsError(""); renderSkills(); }));
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeMenus));
document.getElementById("journalButton").addEventListener("click", openJournal);
document.getElementById("joinStart").addEventListener("click", () => { if (join.p2In) { closeMenus(); startGame(true); } });
document.getElementById("p2ShowSignin").addEventListener("click", () => { document.getElementById("joinSignin").classList.remove("hidden"); document.getElementById("p2ShowSignin").classList.add("hidden"); });
document.getElementById("p2SignIn").addEventListener("click", p2SignIn);
document.getElementById("p2Name").addEventListener("input", e => {
  const v = e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16).toUpperCase();
  if (v) { join.p2Name = v; setText("joinP2Name", v); }
});

// The mission strip: wheel, arrows, swipes and controllers all scroll it.
const missionStrip = document.getElementById("missionStrip");
missionStrip.addEventListener("wheel", e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); missionStrip.scrollBy({ left: e.deltaY * 1.2, behavior: "smooth" }); }
}, { passive: false });
document.getElementById("stripPrev").addEventListener("click", () => missionStrip.scrollBy({ left: -260, behavior: "smooth" }));
document.getElementById("stripNext").addEventListener("click", () => missionStrip.scrollBy({ left: 260, behavior: "smooth" }));

/* ---------------------------------------------------------------------------
   JOURNAL: every page you've found, mission by mission
--------------------------------------------------------------------------- */

function openJournal() {
  const found = new Set(Progress.data.journal || []);
  const body = document.getElementById("journalBody");
  body.innerHTML = "";
  let total = 0, have = 0;
  MISSIONS.forEach((mi, i) => {
    const data = MISSION_DATA[mi.id];
    if (!data || !data.journalText) return;
    const ids = (data.journal || []).map(j => j.id);
    const sec = el("section", "journal-mission");
    sec.append(el("h3", "", String(i + 1).padStart(2, "0") + " · " + mi.title));
    const grid = el("div", "journal-grid");
    for (const id of ids) {
      total++;
      const e = data.journalText[id] || {};
      const got = found.has(id);
      if (got) have++;
      const where = "Somewhere in Mission " + String(i + 1).padStart(2, "0") + ".";
      const card = el("button", "find-card" + (got ? "" : " missing"));
      card.type = "button";
      const inner = el("div", "jc-inner");
      const front = el("div", "jc-front");
      const pic = el("div", "jc-pic");
      if (got) {
        // the find's own picture; until it's drawn, a faded view of where it was found
        const jx = ((data.journal || []).find(j => j.id === id) || {}).x;
        let bd = null;
        for (const s of data.sections || []) if (jx !== undefined && s.from <= jx && s.backdrop) bd = s.backdrop;
        const placeUrl = bd ? "assets/worlds/loc/" + bd + ".webp" : "assets/missions/" + mi.id + ".webp";
        pic.style.backgroundImage = "url('" + (e.image || "") + "'), url('" + placeUrl + "')";
        if (e.image) { const probe = new Image(); probe.onerror = () => pic.classList.add("placeholder"); probe.src = e.image; }
        else pic.classList.add("placeholder");
      }
      front.append(pic, el("span", "jc-label", got ? e.kind : "NOT FOUND YET"));
      const back = el("div", "jc-back");
      back.append(el("span", "jp-kind", got ? e.kind : "NOT FOUND YET"), el("strong", "", got ? e.title : "? ? ?"), el("p", "", got ? e.text : where));
      inner.append(front, back);
      card.append(inner);
      card.setAttribute("aria-label", got ? e.kind + ": " + e.title + ". Press to turn it over." : "Not found yet. " + where);
      card.addEventListener("click", () => card.classList.toggle("flipped"));
      grid.append(card);
    }
    sec.append(grid);
    body.append(sec);
  });
  setText("journalCount", have + " OF " + total + " PAGES FOUND");
  journalOverlay.classList.remove("hidden");
  navFocus(journalOverlay.querySelector(".close-x"));
}

/* ---------------------------------------------------------------------------
   TWO PLAYER: player 2 presses A (or up) to join, and can sign in to show their name
--------------------------------------------------------------------------- */

const join = { active: false, p2In: false, p2Name: "" };
function openJoin() {
  join.active = true; join.p2In = false; join.p2Name = "";
  setText("joinP1Name", signedIn() && Progress.data.name ? Progress.data.name.toUpperCase() : "PLAYER 1");
  setText("joinP2Name", "PRESS A TO JOIN");
  setText("joinP2Note", "ON A CONTROLLER, OR ↑ ON THE KEYBOARD");
  setText("p2Error", "");
  document.getElementById("joinP2").classList.remove("ready");
  document.getElementById("joinSignin").classList.add("hidden");
  document.getElementById("p2ShowSignin").classList.add("hidden");
  document.getElementById("joinStart").disabled = true;
  joinOverlay.classList.remove("hidden");
}
function p2Joined(how) {
  if (join.p2In) return;
  join.p2In = true; join.p2Name = "";
  setText("joinP2Name", "PLAYER 2");
  setText("joinP2Note", how);
  document.getElementById("joinP2").classList.add("ready");
  if (Backend.online) document.getElementById("p2ShowSignin").classList.remove("hidden");
  const start = document.getElementById("joinStart");
  start.disabled = false;
  sfx.init(); sfx.checkpoint && sfx.checkpoint();
  navFocus(start);
}
async function p2SignIn() {
  const email = document.getElementById("p2Email").value.trim(), pw = document.getElementById("p2Password").value;
  setText("p2Error", "");
  const b = document.getElementById("p2SignIn"); b.disabled = true; b.textContent = "SIGNING IN...";
  try {
    const name = await Backend.signInSecond(email, pw);
    join.p2Name = String(name).toUpperCase();
    setText("joinP2Name", join.p2Name);
    document.getElementById("joinSignin").classList.add("hidden");
  } catch (e) { setText("p2Error", e.message); }
  finally { b.disabled = false; b.textContent = "SIGN IN"; document.getElementById("p2Password").value = ""; }
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
  const r0 = navCurrent.getBoundingClientRect(), c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best = null, bestScore = Infinity;
  for (const e of items) {
    if (e === navCurrent) continue;
    const r = e.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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

// Reading a journal page: a tap or click carries on.
canvas.addEventListener("pointerdown", () => { if (reading) readingTap = true; });

/* ---------------------------------------------------------------------------
   START SCREEN SCENE: Koda running the rooftops ahead of the storm
--------------------------------------------------------------------------- */

const attract = { t: 0, last: 0, vents: [], debris: [], next: 1.2, droneX: 700 };

function drawAttract(now) {
  const dt = Math.min(0.05, (now - (attract.last || now)) / 1000);
  attract.last = now;
  attract.t += dt;
  frameTime = attract.t;
  const t = attract.t;
  const speed = 330;
  const roofY = H - 120;
  // The city layers drift past on a stormy dusk sky.
  const saveCam = [cameraX, cameraY];
  cameraX = t * speed; cameraY = -410;
  storm.strength = 0.45 + Math.sin(t * 0.4) * 0.25;
  drawWorld("mc", 1, storm.strength);
  if (lightningBolt) { lightningBolt.t -= dt; drawBolt(lightningBolt, 0.8, true); if (lightningBolt.t <= 0) lightningBolt = null; }
  // the roof he runs on
  ctx.fillStyle = "#141917"; ctx.fillRect(0, roofY, W, H - roofY);
  const scroll = (t * speed) % 48;
  for (let row = 0; row < 4; row++) {
    for (let x = -scroll; x < W; x += 48) {
      const r = seeded(Math.floor((x + t * speed) / 48) * 13 + row * 7);
      if (r < 0.25) continue;
      ctx.fillStyle = r > 0.88 ? "rgba(255, 196, 110, 0.6)" : r > 0.8 ? "rgba(127, 227, 255, 0.22)" : "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(x + 14, roofY + 60 + row * 54, 18, 26);
    }
  }
  {
    const cx = cameraX, cy = cameraY;
    cameraX = t * speed; cameraY = 0;
    glossTop(cameraX, roofY, W, H - roofY);
    goldEdge(cameraX, roofY, W);
    cameraX = cx; cameraY = cy;
  }
  // crates to vault
  attract.next -= dt;
  if (attract.next <= 0) { attract.vents.push({ x: W + 60 }); attract.next = 1.6 + Math.random() * 1.2; }
  const kx = W * 0.55;
  let pose = "sprint", frame = Math.floor(t * 14) % 8;
  for (const v of attract.vents) {
    v.x -= speed * dt;
    drawKitScreen("crate", v.x - 34, roofY - 68, 68, 70);
    const d = v.x - kx;
    if (d < 90 && d > -60) { pose = "vault"; frame = Math.min(7, Math.floor((90 - d) / 150 * 8)); }
  }
  attract.vents = attract.vents.filter(v => v.x > -100);
  // Koda
  if (art.koda.ready) {
    const def = SPRITES.koda, a = def.animations[pose], size = def.metres * PX * 1.2, cell = def.cell;
    const lift = pose === "vault" ? Math.sin(frame / 7 * Math.PI) * 60 : 0;
    ctx.save();
    ctx.shadowColor = "rgba(241, 202, 120, 0.9)"; ctx.shadowBlur = 8;
    ctx.drawImage(kodaSheet(playerOutfit), frame * cell, a.row * cell, cell, cell, kx - size / 2, roofY - lift - size * def.footY, size, size);
    ctx.restore();
  }
  // a drone overhead
  attract.droneX = W * 0.82 + Math.sin(t * 0.7) * 80;
  if (art.drone.ready) {
    const s = SPRITES.drone, f = Math.floor(t * s.fps) % s.frames, w = 110, h = w * s.frameHeight / s.frameWidth;
    const dy = 120 + Math.sin(t * 2.4) * 10;
    ctx.save(); ctx.translate(attract.droneX, dy); ctx.scale(-1, 1); ctx.shadowColor = "#e0533c"; ctx.shadowBlur = 10;
    ctx.drawImage(art.drone, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // debris on the wind
  if (Math.random() < dt * 0.9) attract.debris.push({ x: -40, y: roofY - (Math.random() < 0.5 ? 30 : 110), rot: 0, art: DEBRIS_LOW[Math.floor(Math.random() * 5)] });
  for (const d of attract.debris) {
    d.x += 620 * dt; d.rot -= 6 * dt;
    const glow = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 60);
    glow.addColorStop(0, "rgba(255, 140, 40, 0.6)"); glow.addColorStop(1, "rgba(255, 120, 30, 0)");
    ctx.fillStyle = glow; ctx.fillRect(d.x - 60, d.y - 60, 120, 120);
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.shadowColor = "#ff7a1a"; ctx.shadowBlur = 16;
    const r = KIT[d.art]; if (r && art.kit.ready) ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], -24, -22, 48, 44);
    ctx.restore();
  }
  attract.debris = attract.debris.filter(d => d.x < W + 80);
  if (Math.random() < dt * 0.3) triggerLightningQuiet();
  flash = Math.max(0, flash - dt * 2.5);
  cameraX = 0; cameraY = 0;
  drawRain(0.9);
  [cameraX, cameraY] = saveCam;
  if (flash > 0) { ctx.fillStyle = `rgba(235, 240, 255, ${flash * 0.45})`; ctx.fillRect(0, 0, W, H); }
  postBloom();
  postFinish();
}

// Lightning on the start screen, without the thunder.
function triggerLightningQuiet() {
  flash = 0.6;
  const x = W * (0.2 + Math.random() * 0.7), pts = [];
  let px = x, py = -10;
  while (py < H * 0.5) { pts.push([px, py]); px += (Math.random() - 0.5) * 70; py += 24 + Math.random() * 30; }
  lightningBolt = { pts, branch: [pts[Math.floor(pts.length / 2)]], t: 0.3 };
}

function drawKitScreen(name, x, y, w, h) {
  const r = KIT[name];
  if (r && art.kit.ready) ctx.drawImage(art.kit, r[0], r[1], r[2], r[3], x, y, w, h);
}

function attractLoop(now) {
  if (gameState !== "ready") return;
  drawAttract(now);
  requestAnimationFrame(attractLoop);
}

/* ---------------------------------------------------------------------------
   THE GAME LOOP
--------------------------------------------------------------------------- */

function gameLoop(now) {
  if (gameState !== "playing") {
    if (gameState === "finished") { render(); }
    return;
  }
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  frameTime += dt;
  update(dt);
  render();
  updateHud();
  if (gameState === "playing") requestAnimationFrame(gameLoop);
  else if (gameState === "finished") requestAnimationFrame(finishedLoop);
}

// After the finish the scene keeps moving behind the results.
function finishedLoop(now) {
  if (gameState !== "finished") return;
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  frameTime += dt;
  updateParticles(dt);
  flash = Math.max(0, flash - dt * 2.6);
  render();
  requestAnimationFrame(finishedLoop);
}

/* ---------------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------------- */

applySound();
setText("soundButton", soundOn ? "SOUND: ON" : "SOUND: OFF");
setText("lyricsButton", lyricsOn ? "LYRICS: ON" : "LYRICS: OFF");
setMode("1");
updatePlayerCard();
if (Backend.online) {
  Backend.init().then(() => refreshFromServer()).then(updatePlayerCard);
  Backend.onChange(() => refreshFromServer().then(updatePlayerCard));
}
gameFrame.classList.add("menu-mode");
requestAnimationFrame(attractLoop);
requestAnimationFrame(padMenus);
