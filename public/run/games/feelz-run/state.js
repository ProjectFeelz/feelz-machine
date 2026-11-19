"use strict";

const REWIND_ON_MISS = 15;

const storm = { strength: 0, debris: [], nextThrow: 0, nextFlash: 4, lyricIndex: 0, front: -1e9, hold: 0, roll: 0 };

// The storm front chases the runner. Speeds in metres a second: it creeps in the intro,
// pushes in the verses and races in the choruses. It never goes back, and it never drops
// out of the left of the screen, so stopping lets it catch you.
const STORM_PACE = { intro: 1.9, verse: 2.9, chorus: 3.8 };

const STORM_HOLD = 1.4;   // seconds the storm pauses after it hits someone

// Race mode: the AI rival.
let aiRival = false;

// How a mission is named on screen: album missions by number, artist runs by song and artist.
function missionLabel(m) {
  if (!m) return "";
  if (m.artistLevel) return "ARTIST RUN · " + m.title + " · " + String(m.artistLevel.artist || "").toUpperCase();
  return "MISSION " + String(m.number).padStart(2, "0") + " · " + m.title;
}

function entryLabel(entry) {
  if (!entry) return "";
  if (entry.artist) return "ARTIST RUN · " + entry.title + " · " + entry.artist;
  return "MISSION " + String(MISSIONS.indexOf(entry) + 1).padStart(2, "0") + " · " + entry.title;
}

// Free roam: walk a mission's world at your own pace. No clock, no enforcers, only a few things to find.
let freeRoam = false;

let aiLevel = "normal";   // easy, normal or hard

const AI_LEVELS = {
  easy:   { pauseChance: 0.006, pauseTime: [0.5, 1.2], missJump: 0.12, maxLead: m(10) },
  normal: { pauseChance: 0.0025, pauseTime: [0.3, 0.8], missJump: 0.05, maxLead: m(22) },
  hard:   { pauseChance: 0, pauseTime: [0, 0], missJump: 0, maxLead: 1e9 }
};

const ai = { pause: 0, jumpFail: 0, lastWant: null };

function newPlayer(id) {
  // Unlocked skills are for solo runs; a race keeps both runners on the same moves.
  const skills = new Set(id === 1 && !twoPlayer ? playerSkills : []);
  return {
    skills, shield: skills.has("storm_shield"),
    dash: 0, dashUsed: false, pounding: false, wallT: 0, wallDir: 0, kickT: 0, holdT: 0, fightWith: null,
    id, x: 0, y: 0, w: BODY_W, h: STAND_H, vx: 0, vy: 0, ground: null, facing: 1,
    state: "normal", stateT: 0, move: null, crouch: false, runPhase: 0,
    coyote: 0, jumpBuffer: 0, jumpHeld: false, jumpPressed: true, attackPressed: true, downPressed: true,
    airJumps: 1, flipTime: 0, boostTime: 0, invuln: 0, knock: 0, knockDir: 0, combo: 0, comboT: 0, hitDone: false,
    hearts: skills.has("extra_heart") ? 4 : MAX_HEARTS, records: 0, notes: { low: 0, mid: 0, high: 0 }, kos: 0, journal: [], coin: false,
    wipeouts: 0, finished: false, finishTime: 0, place: 0, cp: 0, lastSafe: { x: 0, y: 0 }, mudT: 0,
    climb: null, animClock: 0
  };
}

function loadMission(id) {
  mission = MISSION_DATA[id];
  loadSongBlob(mission.song && mission.song.src);
  level = buildLevel(mission);
  for (const sec of mission.sections || []) if (sec.backdrop) locImage(sec.backdrop);
  for (const iw of mission.inward || []) if (iw.backdrop) locImage(iw.backdrop);
  preloadJournal();
  return mission;
}

function resetRun() {
  level = buildLevel(mission);
  const count = twoPlayer ? 2 : 1;
  players = [];
  for (let i = 0; i < count; i++) {
    const p = newPlayer(i + 1);
    p.x = level.startX - i * 46;
    p.y = 0;
    p.lastSafe = { x: p.x, y: p.y };
    players.push(p);
  }
  runTime = 0; realTime = 0; songClock = 0; rewindsUsed = 0; misses = 0; spareSeconds = 0; taunt = null;
  trail = []; reading = null; hitStop = 0; fightsShown = 0; worldPace = 1; cloudDrift = 0; resetInward();
  cameraX = Math.max(0, players[0].x - W * 0.3);
  cameraY = -410;
  storm.strength = 0; storm.debris = []; storm.nextThrow = 0; storm.nextFlash = 4; storm.lyricIndex = 0;
  storm.front = level.startX - m(14); storm.hold = 2; storm.roll = 0;
  ai.pause = 0; ai.jumpFail = 0;
  particles = [];
  raceEndsAt = null; rewindFx = 0; flash = 0; shake = 0; lightningBolt = null;
  banner = { text: mission.parts[0].name, sub: missionLabel(mission), time: 3 };
  toast.time = 0;
  resetSystems();
  roamPagesNew = []; runGate = { phase: "load", t: 0, total: 0 };
  if (typeof tutorialStart === "function") tutorialStart();
  gameState = "playing";
}
