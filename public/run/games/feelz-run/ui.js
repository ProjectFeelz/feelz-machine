"use strict";

const startOverlay = document.getElementById("startOverlay");

const finishOverlay = document.getElementById("finishOverlay");

const pauseOverlay = document.getElementById("pauseOverlay");

const authOverlay = document.getElementById("authOverlay");

const leaderOverlay = document.getElementById("leaderOverlay");

const skillsOverlay = document.getElementById("skillsOverlay");

const journalOverlay = document.getElementById("journalOverlay");

const joinOverlay = document.getElementById("joinOverlay");

const coopOverlay = document.getElementById("coopOverlay");

let coopMode = false;

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
  data: { xp: 0, vinyl: 0, notes: 0, kos: 0, coins: 0, coinMissions: [], journal: [], runs: 0, best: {}, name: null, country: null, online: false,
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
      coins: profile.coins_total, coinMissions: profile.coin_missions || [], journal: profile.journal || [], runs: profile.runs, best: profile.best || {},
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
  Object.assign(Progress.data, { xp: 0, vinyl: 0, notes: 0, kos: 0, coins: 0, coinMissions: [], journal: [], runs: 0, best: {}, rp_bank: 0, credits: 0, unlocks: [], outfit: "gold", dance: "default", vouchers: [], online: false });
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
  keepAwake(true);
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  if (!entry || !entry.ready || !MISSION_DATA[selectedMission]) return;
  if (mustSignIn()) { updatePlayerCard(); return; }
  if (twoPlayer && !aiRival && fromJoin !== true) { openJoin(); return; }
  if (coopMode && fromJoin !== "coop") { openCoop(); return; }
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
  setText("finishMission", missionLabel(mission));
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
  if (coopOn()) setText("finishEyebrow", "CO-OP WITH " + Coop.partnerName());
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
    d.xp += result.xp; d.vinyl += result.records; d.notes += notes; d.kos += result.kos; d.rp_bank += Math.ceil(result.rp / 2);
    // a mission's coin counts once, ever
    d.coinMissions = d.coinMissions || [];
    if (result.coin && d.coinMissions.includes(result.mission)) result.coin = 0;
    if (result.coin) d.coinMissions.push(result.mission);
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
  setText("finishMission", missionLabel(mission) + (aiRival ? " · VS AI (" + aiLevel.toUpperCase() + ")" : " · 2 PLAYER RACE"));
  document.querySelector("#raceP1 h3").textContent = aiRival ? "YOU" : "P1";
  document.querySelector("#raceP2 h3").textContent = aiRival ? "AI" : "P2";
  // Points: every record counts, plus 10 for finishing first and 5 for finishing second.
  const points = p => p.records + (p.place === 1 ? 10 : p.place === 2 ? 5 : 0);
  const [a, b] = players;
  const pa = points(a), pb = points(b);
  let winner = pa > pb ? a : pb > pa ? b : (a.place && (!b.place || a.place < b.place) ? a : b);
  if (pa === pb && !a.place && !b.place) winner = a.x >= b.x ? a : b;
  setText("finishEyebrow", "RACE OVER");
  setText("finishTitle", aiRival ? (winner.id === 1 ? "YOU BEAT THE AI" : "THE AI WINS") : "P" + winner.id + " WINS");
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
    if (result.coin && res.coin_counted !== false) { const cm = Progress.data.coinMissions = Progress.data.coinMissions || []; if (!cm.includes(result.mission)) cm.push(result.mission); }
    setText("finalRp", Number(res.rp).toLocaleString());
    const banked = res.rp_earned !== undefined ? Number(res.rp_earned) : Number(res.rp);
    setText("finalXp", "+" + res.xp_gained + " XP");
    setText("finalBest", res.new_best ? "NEW PERSONAL BEST" : "");
    setText("finalRank", res.rank ? "GLOBAL RANK #" + res.rank : "");
    setText("finalSaved", "Posted to the global leaderboard. +" + banked.toLocaleString() + " RP to spend in SKILLS.");
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

SPRITES.dances.zora = { name: "Zora", src: SPRITES.dance_zora.src };

// The sheet for a dance in an outfit colour ("gold" is the plain one).
function danceImages(id, outfit) {
  const def = SPRITES.dances[id] || SPRITES.dances.default;
  const o = def.outfits && outfit && outfit !== "gold" && OUTFITS[outfit] ? outfit : "gold";
  const key = id + ":" + o;
  if (!danceArt[key]) danceArt[key] = { img: loadImage(o === "gold" ? def.src : def.src.replace(/\.webp$/, "-" + o + ".webp")) };
  return danceArt[key];
}

function danceSheet(id, outfit, rival) {
  const a = danceImages(id, rival ? "gold" : outfit);
  if (!a.img.ready) return null;
  const key = id + ":" + (rival ? "rival" : outfit);
  if (danceSheets[key]) return danceSheets[key];
  let sheet = a.img;
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
  danceImages(id, rival ? "gold" : playerOutfit);
  if (danceTimer) clearInterval(danceTimer);
  let frame = 0;
  danceTimer = setInterval(() => {
    if (finishOverlay.classList.contains("hidden")) { clearInterval(danceTimer); danceTimer = null; return; }
    const img = danceSheet(id, playerOutfit, rival) || danceSheet("default", playerOutfit, rival);
    if (!img) return;
    const rect = { width: c.clientWidth, height: c.clientHeight };   // layout size, right even when the page is drawn sideways
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
  if (coopOn()) Coop.send("pause");
  sfx.holdPad(false);
  for (const k in keys) keys[k] = false;
  songAudio.pause();
  sfx.quiet();
  setText("pauseTrack", missionLabel(mission) + " · " + (mission.parts[currentPartIndex()] || {}).name);
  pauseOverlay.classList.remove("hidden");
  navFocus(document.getElementById("resumeButton"));
}

function resumeGame() {
  if (gameState !== "paused") return;
  pauseOverlay.classList.add("hidden");
  gameState = "playing";
  if (coopOn()) Coop.send("resume");
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
  // After an artist's run, the way on is the Big Feelz story: the first mission not yet played.
  if (i >= 0 && MISSIONS[i].artist) {
    const best = (Progress.data && Progress.data.best) || {};
    const story = MISSIONS.filter(mi => !mi.artist && mi.ready && MISSION_DATA[mi.id]);
    return story.find(mi => !best[mi.id]) || story[0] || null;
  }
  const next = i >= 0 ? MISSIONS[i + 1] : null;
  return next && next.ready && MISSION_DATA[next.id] ? next : null;
}

function setupNextButton() {
  const next = nextMissionEntry(), btn = document.getElementById("nextMissionButton");
  // Co-op: anyone can take the crew on to the next mission or run it back.
  btn.classList.toggle("hidden", !next);
  const fromArtist = next && mission && MISSIONS.some(mi => mi.id === mission.id && mi.artist);
  if (next) btn.textContent = (coopOn() ? "NEXT TOGETHER: " : "NEXT: ") + (fromArtist ? "BIG FEELZ · " : "") + next.title + " →";
  document.getElementById("restartButton").classList.remove("hidden");
}

function playNextMission() {
  const next = nextMissionEntry();
  if (!next) return;
  if (coopOn()) { Coop.regroup(next.id); return; }
  selectedMission = next.id;
  buildMissionStrip();
  pauseOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  gameState = "ready";
  startGame(twoPlayer && !aiRival ? true : undefined);
}

function restartRun() {
  // Co-op: runs it back for everyone, from the lobby.
  if (coopOn()) { Coop.regroup(mission.id); return; }
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
  keepAwake(false);
  if (typeof Coop !== "undefined" && (Coop.on || Coop.lobby)) Coop.leave();
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
    card.style.backgroundImage = mi.cover ? "url(" + JSON.stringify(String(mi.cover)) + ")" : "url(assets/missions/" + mi.id + ".webp)";
    card.setAttribute("aria-label", "Mission " + (i + 1) + ": " + mi.title + (mi.ready ? "" : " (coming soon)"));
    const num = document.createElement("span"); num.className = "mc-num"; num.textContent = mi.artist ? "♪" : String(i + 1).padStart(2, "0");
    const title = document.createElement("span"); title.className = "mc-title"; title.textContent = mi.title;
    const status = document.createElement("span"); status.className = "mc-status";
    const best = Progress.data.best[mi.id];
    status.textContent = mi.ready ? (best ? "BEST " + Number(best.rp).toLocaleString() + " RP" : "PLAY") : "COMING SOON";
    card.append(num, title, status);
    card.addEventListener("click", () => {
      if (!mi.ready) return;
      if (typeof Coop !== "undefined" && Coop.lobby && !Coop.host) return;   // the host picks the mission
      selectedMission = mi.id;
      buildMissionStrip();
      if (typeof Coop !== "undefined") Coop.missionChanged(mi.id);
    });
    strip.appendChild(card);
  });
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  setText("trackLine", entryLabel(entry));
  // Keep the chosen mission in view (an artist run sits at the end of the strip).
  const sel = strip.querySelector(".selected");
  if (sel && (sel.offsetLeft < strip.scrollLeft || sel.offsetLeft + sel.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
    strip.scrollLeft = Math.max(0, sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2);
  }
}

// mode: "1" one player, "2" two player race, "ai" race against the AI rival, "free" free roam.
function setMode(mode) {
  twoPlayer = mode === "2" || mode === "ai";
  aiRival = mode === "ai";
  freeRoam = mode === "free";
  coopMode = mode === "coop";
  document.getElementById("coopNote").classList.toggle("hidden", mode !== "coop");
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

const MENU_PANELS = () => [authOverlay, leaderOverlay, skillsOverlay, journalOverlay, joinOverlay, coopOverlay, document.getElementById("artistOverlay")];

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
    const card = el("div", "skill-card " + sk.kind + (owned ? " owned" : ""));
    card.append(cardArt(sk.id, "skill-art"), el("h3", "", sk.name), el("p", "skill-how", sk.how), el("p", "skill-text", sk.text));
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

// Card picture (assets/cards/<id>.webp): painted scenes for skills, posed Koda on a soft glow for styles.
function cardArt(id, cls, glow) {
  const box = el("span", cls);
  if (glow) box.style.setProperty("--glow", glow);
  const img = document.createElement("img");
  img.src = "assets/cards/" + id + ".webp"; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
  img.addEventListener("error", () => box.remove());
  box.append(img);
  return box;
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
    card.append(cardArt("outfit_" + id, "style-art", o.swatch + "66"), sw, el("span", "style-name", o.name), el("span", "style-tag", d.outfit === id ? "WEARING" : owned ? "WEAR" : "LV " + sk.level + " · " + sk.rp + " RP"));
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
    card.append(cardArt("dance_" + id, "style-art", "#b58cff55"), el("span", "style-name", dn.name), el("span", "style-tag", d.dance === id ? "DANCING" : owned ? "PICK" : "LV " + sk.level + " · " + sk.rp + " RP"));
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

  body.append(el("p", "skills-sub", "SONG VOUCHERS · MONEY OFF SONGS ON FEELZ MACHINE"));
  const pick = el("div", "voucher-pick");
  const select = el("select", "voucher-select");
  // The album songs, then any artist songs whose artist offers money off for credits.
  const maxFor = {};
  for (const t of ALBUM_TRACKS) { const o = el("option", "", t.title); o.value = t.id; select.append(o); maxFor[t.id] = 50; }
  const artistTracks = typeof ArtistLevels !== "undefined" ? ArtistLevels.voucherTracks() : [];
  for (const t of artistTracks) {
    if (maxFor[t.id]) continue;
    const o = el("option", "", t.title + " · " + String(t.artist || "").toUpperCase() + " (UP TO " + t.max + "%)"); o.value = t.id; select.append(o); maxFor[t.id] = t.max;
  }
  const cur = MISSIONS.find(mi => mi.id === selectedMission);
  const pre = ALBUM_TRACKS.find(t => t.mission === (cur ? cur.id : "m01")) || artistTracks.find(t => t.mission === (cur ? cur.id : ""));
  if (pre) select.value = pre.id;
  pick.append(select);
  const voucherButtons = [];
  for (const v of VOUCHERS) {
    const b = el("button", "secondary-button small", v.percent + "% OFF · " + v.cost.toLocaleString());
    b.type = "button";
    b.addEventListener("click", () => runSkillAction(b, async () => Progress.fromServer(await Backend.buyVoucher(select.value, v.percent))));
    voucherButtons.push([b, v]);
    pick.append(b);
  }
  const syncVoucherButtons = () => voucherButtons.forEach(([b, v]) => { b.disabled = d.credits < v.cost || v.percent > (maxFor[select.value] || 0); });
  select.addEventListener("change", syncVoucherButtons);
  syncVoucherButtons();
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
  const note = el("p", "skills-note", "You pay " + (v.artist_name || "Big Feelz") + " directly through PayPal. The song goes into your Feelz Machine library.");
  box.append(note);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    await loadPayPal();
    window.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "pay" },
      createOrder: async () => {
        skillsError("");
        try { return (await Backend.createOrder(v.track_id, v.code, v.title, v.artist_name)).orderId; }
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

let leaderAsk = 0;   // the latest board asked for: a slower, older answer never overwrites it
async function openLeaderboard(period) {
  const ask = ++leaderAsk;
  leaderOverlay.classList.remove("hidden");
  period = period || "all";
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  setText("leaderMission", entryLabel(entry));
  document.querySelectorAll("[data-period]").forEach(b => b.classList.toggle("active", b.dataset.period === period));
  const list = document.getElementById("leaderList");
  list.innerHTML = "<li class='leader-empty'>Loading...</li>";
  setText("leaderYou", "");
  try {
    const rows = await Backend.leaderboard(selectedMission, period, 50);
    if (ask !== leaderAsk) return;
    list.innerHTML = "";
    if (!rows || !rows.length) list.innerHTML = period === "week"
      ? "<li class='leader-empty'>No finished runs on this mission yet this week. The week starts on Monday.</li>"
      : "<li class='leader-empty'>No runs yet. Be the first on the board.</li>";
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
    if (ask !== leaderAsk) return;
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "leader-empty";
    li.textContent = "Couldn't load the leaderboard: " + e.message;
    list.appendChild(li);
  }
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
  // The chosen mission's own painting, drifting slowly behind him.
  const md = MISSION_DATA[selectedMission], first = md && (md.sections || []).find(s => s.backdrop);
  const place = first ? locImage(first.backdrop) : null;
  if (place && place.ready) {
    const ph = H * 1.16, pw = place.width * ph / place.height, span = Math.max(1, pw - W);
    ctx.drawImage(place, -span * (Math.sin(t * 0.045) + 1) / 2, -H * 0.08, pw, ph);
    ctx.fillStyle = `rgba(8, 10, 22, ${0.3 + storm.strength * 0.25})`;
    ctx.fillRect(0, 0, W, H);
  } else drawWorld("mc", 1, storm.strength);
  if (lightningBolt) { lightningBolt.t -= dt; drawBolt(lightningBolt, 0.8, true); if (lightningBolt.t <= 0) lightningBolt = null; }
  // the roof he runs on
  const roof = ctx.createLinearGradient(0, roofY, 0, H);
  roof.addColorStop(0, "#1a1f1d"); roof.addColorStop(1, "#07090a");
  ctx.fillStyle = roof; ctx.fillRect(0, roofY, W, H - roofY);
  {
    const cx = cameraX, cy = cameraY;
    cameraX = t * speed; cameraY = 0;
    glossTop(cameraX, roofY, W, H - roofY);
    goldEdge(cameraX, roofY, W);
    cameraX = cx; cameraY = cy;
  }
  // Koda running the rooftops, nothing in his way
  const kx = W * 0.55;
  const pose = "sprint", frame = Math.floor(t * 14) % 8;
  // Koda: the 3D model when it's in, the drawn sheet until then (and for outfit colours)
  let kodaDone = false;
  if (typeof Char3D !== "undefined" && Char3D.has("koda", pose)) {
    const c = Char3D.render("koda", "attract", pose, pose === "vault" ? frame / 8 : t * 1.4, 1, { outfit: OUTFITS[playerOutfit] ? OUTFITS[playerOutfit].jacket : null });
    if (c) {
      const size = Char3D.VIEW_METRES * PX * 1.2, lift = pose === "vault" ? Math.sin(frame / 7 * Math.PI) * 60 : 0;
      ctx.drawImage(c, kx - size / 2, roofY - lift - size * Char3D.FOOT, size, size);
      kodaDone = true;
    }
  }
  if (!kodaDone && art.koda.ready) {
    const def = SPRITES.koda, a = def.animations[pose], size = def.metres * PX * 1.2, cell = def.cell;
    const lift = pose === "vault" ? Math.sin(frame / 7 * Math.PI) * 60 : 0;
    ctx.save();
    ctx.shadowColor = "rgba(241, 202, 120, 0.9)"; ctx.shadowBlur = 8;
    ctx.drawImage(kodaSheet(playerOutfit), frame * cell, a.row * cell, cell, cell, kx - size / 2, roofY - lift - size * def.footY, size, size);
    ctx.restore();
  }
  // a drone overhead
  attract.droneX = W * 0.82 + Math.sin(t * 0.7) * 80;
  const dd = CHAR3D.props && CHAR3D.props.scanner;
  const strip = dd && typeof Char3D !== "undefined" && Char3D.wantProp && Char3D.wantProp(dd.id) ? Char3D.bake(dd.id, -2.59, -0.55, 32, dd.yaw || 0) : null;
  if (strip) {
    const dy = 130 + Math.sin(t * 2.4) * 10, size = m(Char3D.VIEW_METRES) * 0.4;
    const eye = ctx.createRadialGradient(attract.droneX, dy, 2, attract.droneX, dy, 70);
    eye.addColorStop(0, "rgba(255, 70, 50, 0.32)"); eye.addColorStop(1, "rgba(255, 70, 50, 0)");
    ctx.fillStyle = eye; ctx.fillRect(attract.droneX - 70, dy - 70, 140, 140);
    ctx.save(); ctx.translate(attract.droneX, dy); ctx.rotate(Math.cos(t * 0.7) * 0.08);
    ctx.drawImage(strip.canvas, 0, 0, strip.cell, strip.cell, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else if (art.drone.ready) {
    const s = SPRITES.drone, f = Math.floor(t * s.fps) % s.frames, w = 110, h = w * s.frameHeight / s.frameWidth;
    const dy = 120 + Math.sin(t * 2.4) * 10;
    ctx.save(); ctx.translate(attract.droneX, dy); ctx.scale(-1, 1); ctx.shadowColor = "#e0533c"; ctx.shadowBlur = 10;
    ctx.drawImage(art.drone, f * s.frameWidth, 0, s.frameWidth, s.frameHeight, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // debris on the wind
  if (Math.random() < dt * 0.9) attract.debris.push({ x: -40, y: roofY - (Math.random() < 0.5 ? 30 : 110), rot: 0, art: debrisThing("lc") });
  for (const d of attract.debris) {
    d.x += 620 * dt; d.rot -= 6 * dt;
    const glow = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 60);
    glow.addColorStop(0, "rgba(255, 140, 40, 0.6)"); glow.addColorStop(1, "rgba(255, 120, 30, 0)");
    ctx.fillStyle = glow; ctx.fillRect(d.x - 60, d.y - 60, 120, 120);
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    drawDebrisPiece(d.art, 52, 46);
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
  if (frameDue(now, "calm", 28)) drawAttract(now);
  requestAnimationFrame(attractLoop);
}

/* ---------------------------------------------------------------------------
   ONLINE CO-OP LOBBY (the networking is in coop.js)
--------------------------------------------------------------------------- */

function chooseMission(id) {
  if (!MISSION_DATA[id] && /^a-/.test(id) && typeof ArtistLevels !== "undefined") {
    return ArtistLevels.ensure(id).then(mid => chooseMission(mid)).catch(() => {});
  }
  if (!MISSION_DATA[id]) return;
  selectedMission = id;
  buildMissionStrip();
  // Fetch the song while they are still on the menu, so it is ready the moment they press Play.
  const song = MISSION_DATA[id].song;
  if (song && song.src) loadSongBlob(song.src);
}

// The run starts on a timer, not a tap, so wake the sound up while there is a tap to use.
function primeAudio() {
  try {
    sfx.init();
    const entry = MISSION_DATA[selectedMission];
    if (entry && entry.song && songAudio.paused) {
      songAudio.src = songSrcFor(entry.song.src);
      songAudio.muted = true;
      const pl = songAudio.play();
      const done = () => { songAudio.pause(); songAudio.muted = false; };
      if (pl && pl.then) pl.then(done).catch(() => { songAudio.muted = false; }); else done();
    }
  } catch (e) { /* sound stays off until the next tap */ }
}

function coopRender(msg) {
  const inRoom = Coop.lobby;
  document.getElementById("coopChoose").classList.toggle("hidden", inRoom);
  document.getElementById("coopRoom").classList.toggle("hidden", !inRoom);
  if (msg !== undefined) setText("coopError", inRoom ? "" : msg);
  if (!inRoom) return;
  keepAwake(true);   // waiting in a lobby counts as playing
  startCoopStage();
  const roster = Coop.roster, others = roster.filter(r => !r.me).length;
  setText("coopCodeLabel", Coop.host ? "GIVE YOUR CREW THIS CODE" : "JOINED GAME");
  setText("coopCode", Coop.code);
  const entry = MISSIONS.find(mi => mi.id === selectedMission);
  setText("coopMission", entryLabel(entry));
  document.getElementById("coopPrev").classList.toggle("hidden", !Coop.host);
  document.getElementById("coopNext").classList.toggle("hidden", !Coop.host);
  const start = document.getElementById("coopStart");
  start.classList.toggle("hidden", !Coop.host);
  start.disabled = others < 1;
  const count = roster.length + " OF " + Coop.maxPlayers + " PLAYERS";
  const host = roster.find(r => r.host);
  setText("coopStatus", msg || (Coop.host
    ? (others ? count + " · READY WHEN YOU ARE" : "WAITING FOR PLAYERS TO JOIN · UP TO " + Coop.maxPlayers)
    : (host ? count + " · WAITING FOR " + host.name + " TO START" : "CONNECTING...")));
}

function openCoop() {
  if (!Backend.online) {
    coopOverlay.classList.remove("hidden");
    coopRender("Online co-op works at feelzmachine.com/run with your Feelz Machine account.");
    document.getElementById("coopHost").disabled = true;
    document.getElementById("coopJoin").disabled = true;
    return;
  }
  Coop.onLobby = msg => coopRender(msg);
  coopOverlay.classList.remove("hidden");
  coopRender("");
  navFocus(document.getElementById("coopHost"));
}

async function coopHostClick() {
  primeAudio();
  const b = document.getElementById("coopHost"); b.disabled = true;
  try { await Coop.hostGame(); coopRender(""); }
  catch (e) { Coop.leave(); coopRender(e.message); }
  finally { b.disabled = false; }
}

async function coopJoinClick() {
  primeAudio();
  const input = document.getElementById("coopCodeInput");
  const b = document.getElementById("coopJoin"); b.disabled = true;
  try { await Coop.join(input.value); coopRender(""); }
  catch (e) { Coop.leave(); coopRender(e.message); }
  finally { b.disabled = false; }
}

// Both phones: the countdown is over, run.
function coopBegin() {
  coopOverlay.classList.add("hidden");
  gameState = "ready";
  startGame("coop");
}

document.getElementById("coopHost").addEventListener("click", coopHostClick);

document.getElementById("coopJoin").addEventListener("click", coopJoinClick);

document.getElementById("coopCodeInput").addEventListener("keydown", e => { if (e.key === "Enter") coopJoinClick(); });

document.getElementById("coopCodeInput").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });

document.getElementById("coopStart").addEventListener("click", () => { primeAudio(); tryLandscape(); Coop.start(); });

// The host picks the mission from the lobby.
function coopStepMission(dir) {
  if (!Coop.host) return;
  const ready = MISSIONS.filter(mi => mi.ready && MISSION_DATA[mi.id]);
  const i = ready.findIndex(mi => mi.id === selectedMission);
  const next = ready[(i + dir + ready.length) % ready.length];
  chooseMission(next.id);
  Coop.missionChanged(next.id);
  coopRender("");
}

document.getElementById("coopPrev").addEventListener("click", () => coopStepMission(-1));

document.getElementById("coopNext").addEventListener("click", () => coopStepMission(1));

document.getElementById("coopClose").addEventListener("click", () => { keepAwake(false); Coop.leave(); coopOverlay.classList.add("hidden"); navFocus(null); });

window.addEventListener("pagehide", () => { if (typeof Coop !== "undefined") Coop.leave(); });

// The lobby stage: everyone in the game standing ready, idling, each under their own light.
// Your Koda wears your outfit; everyone else is in the colour you'll see them in during the run.
let coopStageRaf = 0;

function drawCoopStage(now) {
  coopStageRaf = 0;
  const c = document.getElementById("coopStage");
  if (!c || coopOverlay.classList.contains("hidden") || !Coop.lobby) return;
  const g = c.getContext("2d");
  const W2 = c.width, H2 = c.height;
  g.clearRect(0, 0, W2, H2);
  const def = SPRITES.koda, a = def.animations.idle, cell = def.cell;
  const roster = Coop.roster;
  const slots = [];
  for (let i = 0; i < Coop.maxPlayers; i++) slots.push(roster[i] || null);
  const step = W2 / slots.length, floor = H2 * 0.8, size = Math.min(H2 * 0.84, step * 1.7);
  slots.forEach((r, i) => {
    const x = step * (i + 0.5);
    const colour = r ? r.colour.text : "#555";
    const light = g.createRadialGradient(x, floor, 4, x, floor, step * 0.55);
    light.addColorStop(0, r ? colour + "55" : "rgba(255,255,255,0.05)"); light.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = light; g.fillRect(x - step / 2, 0, step, H2);
    g.fillStyle = "rgba(0, 0, 0, 0.45)";
    g.beginPath(); g.ellipse(x, floor, Math.min(44, step * 0.3), 8, 0, 0, Math.PI * 2); g.fill();
    const img = !r ? art.koda : r.me ? kodaSheet(playerOutfit) : kodaSheetFor({ id: 2, coopTint: r.colour.tint });
    if (img && img.ready !== false) {
      const f = (Math.floor(now / 1000 * a.fps) + i * 3) % a.frames;
      g.save();
      if (!r) { g.globalAlpha = 0.22 + 0.08 * Math.sin(now / 400 + i); g.filter = "brightness(0)"; }
      g.translate(x, floor);
      if (i >= slots.length / 2) g.scale(-1, 1);   // two lines facing each other
      g.drawImage(img, f * cell, a.row * cell, cell, cell, -size / 2, -size * def.footY, size, size);
      g.restore();
    }
    g.font = "700 " + (slots.length > 4 ? 18 : 22) + "px 'Barlow Condensed', sans-serif";
    g.textAlign = "center"; g.textBaseline = "top";
    g.fillStyle = r ? colour : "rgba(255,255,255,0.3)";
    g.fillText(r ? r.name + (r.me ? " (YOU)" : "") : "OPEN", x, floor + 14);
    if (r && r.host) { g.font = "700 14px 'Barlow Condensed', sans-serif"; g.fillStyle = "rgba(255,255,255,0.45)"; g.fillText("HOST", x, floor + 40); }
  });
  coopStageRaf = requestAnimationFrame(drawCoopStage);
}

function startCoopStage() { if (!coopStageRaf) coopStageRaf = requestAnimationFrame(drawCoopStage); }

// Co-op: the crew comes back to the lobby between missions (the host chose the next one).
function coopToLobby() {
  if (gameState === "playing" || gameState === "paused") fadeOutMusic(0.8);
  sfx.quiet();
  gameState = "ready";
  for (const k in keys) keys[k] = false;
  pauseOverlay.classList.add("hidden");
  finishOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
  gameFrame.classList.add("menu-mode");
  updatePlayerCard();
  requestAnimationFrame(attractLoop);
  Coop.onLobby = msg => coopRender(msg);
  coopOverlay.classList.remove("hidden");
  coopRender("");
}
