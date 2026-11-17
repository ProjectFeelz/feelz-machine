"use strict";

// FIGHTS. Get close to a Street Warden on foot and you're in a fight: you can't run past him,
// the music muffles and a beat kicks in until he's down. Hit, hit, hit: the third hit of a
// combo is a finisher. Every hit staggers him; leave him a moment and he swings.
const WARDEN_HP = 3;

// How each kind of enforcer fights. hp: hits to drop him. windUp: the red tell before a swing.
// cd: seconds between swings once you're squared up. guard: chance he blocks after taking two in a row.
// stun: his swing stuns. counter: how fast he swings back after a block.
const ENEMY_KINDS = {
  warden:   { hp: 3, windUp: 0.36, cd: 0.85, guard: 0.55, counter: 0.22, stun: false, speed: 1.3 },
  guard:    { hp: 4, windUp: 0.40, cd: 0.95, guard: 0.8,  counter: 0.2,  stun: false, speed: 1.2 },
  dock:     { hp: 4, windUp: 0.42, cd: 0.9,  guard: 0.45, counter: 0.25, stun: true,  speed: 1.2 },
  handler:  { hp: 3, windUp: 0.34, cd: 0.8,  guard: 0.5,  counter: 0.2,  stun: false, speed: 1.4 },
  sentinel: { hp: 4, windUp: 0.46, cd: 1.0,  guard: 0.7,  counter: 0.24, stun: true,  speed: 1.1 },
  gilded:   { hp: 5, windUp: 0.44, cd: 0.95, guard: 0.75, counter: 0.2,  stun: true,  speed: 1.1 },
  hunter:   { hp: 3, windUp: 0.28, cd: 0.7,  guard: 0.35, counter: 0.16, stun: false, speed: 1.7 }
};

// The further into the story, the harder they fight. Veterans from mission 6: one more hit, quicker swings,
// they see further. Elites from mission 11: quicker again, and they often follow one swing with a second.
const ENEMY_TIERS = [
  { name: "",        hp: 0, windUp: 1,    cd: 1,    guard: 0,    counter: 1,    speed: 1,    sight: 1,    combo: 0 },
  { name: "VETERAN", hp: 1, windUp: 0.9,  cd: 0.86, guard: 0.1,  counter: 0.88, speed: 1.15, sight: 1.15, combo: 0 },
  { name: "ELITE",   hp: 1, windUp: 0.82, cd: 0.8,  guard: 0.18, counter: 0.85, speed: 1.25, sight: 1.25, combo: 0.35 }
];

function enemyTierIndex(n) { n = n || (mission && mission.number) || 1; return n >= 11 ? 2 : n >= 6 ? 1 : 0; }

const _enemyKindCache = {};

function enemyKindFor(kind, t) {
  const key = (kind || "warden") + ":" + t;
  if (_enemyKindCache[key]) return _enemyKindCache[key];
  const b = ENEMY_KINDS[kind] || ENEMY_KINDS.warden, md = ENEMY_TIERS[t];
  return (_enemyKindCache[key] = {
    hp: b.hp + md.hp, windUp: Math.max(0.27, b.windUp * md.windUp), cd: b.cd * md.cd, guard: Math.min(0.9, b.guard + md.guard),
    counter: Math.max(0.14, b.counter * md.counter), stun: b.stun, speed: b.speed * md.speed, sight: md.sight, combo: md.combo, tier: t
  });
}

function enemyKind(wd) { return enemyKindFor(wd.kind, enemyTierIndex()); }

const FIGHT_RANGE = 1.9;     // metres

const FIGHT_RELEASE = 4;     // metres: knocked further apart than this and the fight is off

const ATTACKS = {
  punch:    { dur: 0.30, hit: 0.16, reach: 1.35, dmg: 1 },
  kick:     { dur: 0.40, hit: 0.22, reach: 1.45, dmg: 1 },
  finisher: { dur: 0.48, hit: 0.24, reach: 1.55, dmg: 1 },
  spinkick: { dur: 0.55, hit: 0.26, reach: 1.9, dmg: 2, all: true },
  flykick:  { dur: 0.50, hit: 0.18, reach: 1.7, dmg: 3 },
  smash:    { dur: 0.70, hit: 0.38, reach: 1.9, dmg: 3, all: true, shock: 3.2 },
  takedown: { dur: 0.60, hit: 0.28, reach: 1.4, dmg: 3 }
};

const ATTACK_STATES = new Set(Object.keys(ATTACKS));

// Bonus moves and perks the player has unlocked (set by the menus before a run).
let playerSkills = [];

function hasSkill(p, id) { return !!(p.skills && p.skills.has(id)); }

function maxHearts(p) { return hasSkill(p, "extra_heart") ? 4 : MAX_HEARTS; }

function airJumpsFor(p) { return hasSkill(p, "triple_jump") ? 2 : 1; }

// How much of a fight is on, 0 to 1: the music muffles and the fight beat plays with it.
let fightLevel = 0;

const BOOST_SECONDS = 8;

const BOOST_SPEED = 1.5;

const REWIND_SECONDS = 10;

const MAX_HEARTS = 3;

const TAUNT_SECONDS = 2.6;

const RACE_FINISH_WINDOW = 10;      // two players: seconds the second runner gets after the first one finishes
