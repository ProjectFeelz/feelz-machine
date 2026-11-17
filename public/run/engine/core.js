"use strict";

const canvas = document.getElementById("gameCanvas");

const ctx = canvas.getContext("2d");

const W = canvas.width;

const H = canvas.height;

const PX = 68;                      // pixels per metre

const K = PX / 68;

const m = v => v * PX;

const GRAVITY = 1900;

const RUN_SPEED = 360;          // about 5.3 m/s: urgent, not floaty

const CROUCH_SPEED = 160;

const CLIMB_SPEED = 170;

const JUMP_SPEED = 690;

const JUMP_CUT_SPEED = 260;

const DOUBLE_JUMP_SPEED = 620;

const MAX_FALL_SPEED = 1150;

const STOMP_BOUNCE = 520;

const AUTO_VAULT_MAX = 1.05;   // metres: the tallest thing he hops on his own while running

const COYOTE_TIME = 0.09;

const JUMP_BUFFER = 0.12;

const INVULNERABLE = 1.4;

// Koda's body: standing, crouched and sliding heights, and width.
const STAND_H = Math.round(m(1.55)), CROUCH_H = Math.round(m(1.3)), SLIDE_H = Math.round(m(0.6)), BODY_W = Math.round(m(0.62));

const MUSIC_VOLUME = 0.7;

/* ---------------------------------------------------------------------------
   GAME STATE
--------------------------------------------------------------------------- */

let gameState = "ready";     // ready, playing, paused, finished

let twoPlayer = false;

let players = [];

let lastTime = 0;

let runTime = 0;

let realTime = 0;            // seconds since the run started

let songClock = 0;           // where the song is, in seconds (the audio, or this clock when the audio can't play)

let rewindsUsed = 0;

let misses = 0;              // checkpoints missed (the song got there first)

let spareSeconds = 0;        // time to spare, added up over every checkpoint reached in time

let taunt = null;            // { text, part, t } while the game is taunting you

let banner = { text: "", sub: "", time: 0 };

let toast = { title: "", text: "", kind: "", time: 0 };

let cameraX = 0, cameraY = -410;

let finishedAt = 0;

let raceEndsAt = null;

let shake = 0;

let rewindFx = 0;

let flash = 0;

const look = { x: 0, y: 0 };   // right-stick camera nudge, -1..1 each way

let lightningBolt = null;

let particles = [];

let runToken = null;

let lastResult = null;

let hitStop = 0;          // a few frames of near-freeze when a big hit lands

let worldPace = 1;        // how fast the world breathes: clouds, wind, drift (eased, never jumps)

let cloudDrift = 0;       // integrated cloud travel, so a change of pace never snaps the clouds back

let reading = null;       // a journal page being read: the world holds still until it's put away

let trail = [];           // where the leader stood, by song time, for the 15 second rewind

let mirrorInput = true;   // right-to-left missions: the controls follow the screen

// Online co-op (coop.js): this phone runs one Koda, the partner is drawn from the network.
function coopOn() { return typeof Coop !== "undefined" && Coop.on; }
