/*
  FEELZ RUN - SETTINGS
  Everything you are likely to change lives in this file.
*/

"use strict";

const GAME = {
  title: "FEELZ RUN",
  brand: "Feelz Machine",
  logo: "assets/feelz-machine-logo.png",
  siteUrl: "https://www.feelzmachine.com",
  album: "First Impressions Last Longest"
};

/* ---------------------------------------------------------------------------
   ONLINE: FEELZ MACHINE ACCOUNTS
   The game lives at www.feelzmachine.com/run and uses the Feelz Machine
   database, so players sign in with their Feelz Machine account (listener or
   artist; Plugin Gallery logins work through Feelz Machine's own sign-in).
   supabaseKey is the public (anon) key, the same one the Feelz Machine app
   ships with. Never put a service_role or secret key here: this file is public.
   Anywhere else (a preview, your own computer) the game runs as an offline demo.
--------------------------------------------------------------------------- */

const BACKEND = {
  supabaseUrl: "https://bycdnwenbjusxpowojdb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Y2Rud2VuYmp1c3hwb3dvamRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjIzOTYsImV4cCI6MjA4NTA5ODM5Nn0.ixUISqTydgNOKJn9w_p7po15mG9kE25yL0HbHprRHj4",
  hosts: ["www.feelzmachine.com", "feelzmachine.com"],
  loginPath: "/login",
  gamePath: "/run/"
};

/* ---------------------------------------------------------------------------
   MISSIONS: one per song on the album, in album order.
   ready: true once the mission's file in missions/ is built and listed in index.html.
   listenUrl: the finish screen's button. Must start with https://.
--------------------------------------------------------------------------- */

const MISSIONS = [
  { id: "m01", title: "AGAINST THE STORM",   ready: true,  listenUrl: "https://www.feelzmachine.com/track/against-the-storm-mulu2ddy" },
  { id: "m02", title: "GET OUT THE WAY",     ready: true , listenUrl: "https://www.feelzmachine.com/track/get-out-the-way-multjukf" },
  { id: "m03", title: "GHETTO GOSPEL",       ready: true , listenUrl: "https://www.feelzmachine.com/track/ghetto-gospel-multk8jq" },
  { id: "m04", title: "BLESSINGS",           ready: true , listenUrl: "https://www.feelzmachine.com/track/blessings-multlcs7" },
  { id: "m05", title: "CHEMISTRY",           ready: true , listenUrl: "https://www.feelzmachine.com/track/chemistry-multlst0" },
  { id: "m06", title: "GOD IS MY WOMAN",     ready: true , listenUrl: "https://www.feelzmachine.com/track/god-is-my-woman-multm82c" },
  { id: "m07", title: "CLOSE TO MY HEART",   ready: true , listenUrl: "https://www.feelzmachine.com/track/close-to-my-heart-mumqz48p" },
  { id: "m08", title: "PATIENCE",            ready: true , listenUrl: "https://www.feelzmachine.com/track/patience-multys5y" },
  { id: "m09", title: "HEAD'S UP",           ready: true , listenUrl: "https://www.feelzmachine.com/track/heads-up-multz61b" },
  { id: "m10", title: "I PRAY",              ready: true , listenUrl: "https://www.feelzmachine.com/track/i-pray-multzjgv" },
  { id: "m11", title: "LETTING OFF STEAM",   ready: true , listenUrl: "https://www.feelzmachine.com/track/letting-off-steam-mulu03o4" },
  { id: "m12", title: "MY BROTHERS",         ready: true , listenUrl: "https://www.feelzmachine.com/track/my-brothers-mulu0kxy" },
  { id: "m13", title: "ROSES & BUTTERFLIES", ready: true , listenUrl: "https://www.feelzmachine.com/track/roses-butterflies-mulu0zge" },
  { id: "m14", title: "SHINE OLIVE GEM",     ready: true , listenUrl: "https://www.feelzmachine.com/track/shine-olive-gem-mulu1dad" },
  { id: "m15", title: "THUGS IN LOVE",       ready: true , listenUrl: "https://www.feelzmachine.com/track/thugs-in-love-mulu1t5z" }
];

/* ---------------------------------------------------------------------------
   SPRITE SHEETS (rendered from the F.I.L.L. Mixamo rigs in Blender)
   cell: the size of one frame in the sheet, in pixels.
   metres: how many metres one frame covers in the game,
   so every character is drawn at its true size next to the others.
   footY: where the feet sit inside a frame (0 = top, 1 = bottom).
   phasePerCycle: how far the runner moves for one loop, so the feet keep pace with the ground.
--------------------------------------------------------------------------- */

const WARDEN_ANIMS = {
  walk:       { row: 0, frames: 8, fps: 8 },
  run:        { row: 1, frames: 8, fps: 13 },
  alert:      { row: 2, frames: 4, fps: 6, loop: false },
  fight_idle: { row: 3, frames: 6, fps: 8 },
  punch:      { row: 4, frames: 6, fps: 14, loop: false },
  hit:        { row: 5, frames: 4, fps: 12, loop: false },
  ko:         { row: 6, frames: 8, fps: 12, loop: false }
};

const SPRITES = {
  koda: {
    src: "assets/sprites/koda.webp",
    cell: 288, metres: 1.81, footY: 0.99,
    animations: {
      idle:        { row: 0,  frames: 8,  fps: 5 },
      run:         { row: 1,  frames: 10, phasePerCycle: 11 },
      jump:        { row: 2,  frames: 4,  fps: 14, loop: false },
      fall:        { row: 3,  frames: 4,  fps: 8 },
      sprint:      { row: 4,  frames: 8,  phasePerCycle: 14 },
      flip:        { row: 5,  frames: 10, fps: 22, loop: false },
      crouch_idle: { row: 6,  frames: 6,  fps: 5 },
      crouch_walk: { row: 7,  frames: 8,  phasePerCycle: 6 },
      slide:       { row: 8,  frames: 6,  fps: 12, loop: false },
      climb:       { row: 9,  frames: 8,  fps: 9 },
      mantle:      { row: 10, frames: 8,  fps: 16, loop: false },
      vault:       { row: 11, frames: 8,  fps: 16, loop: false },
      punch:       { row: 12, frames: 6,  fps: 20, loop: false },
      kick:        { row: 13, frames: 6,  fps: 16, loop: false },
      hurt:        { row: 14, frames: 4,  fps: 10, loop: false },
      stun:        { row: 15, frames: 6,  fps: 10 },
      // bonus moves
      takedown:    { row: 16, frames: 8,  fps: 14, loop: false },
      smash:       { row: 17, frames: 8,  fps: 12, loop: false },
      flykick:     { row: 18, frames: 8,  fps: 16, loop: false },
      spinkick:    { row: 19, frames: 8,  fps: 15, loop: false },
      dash:        { row: 20, frames: 6,  fps: 18, loop: false },
      pound:       { row: 21, frames: 6,  fps: 14, loop: false },
      wallkick:    { row: 22, frames: 8,  fps: 18, loop: false }
    }
  },
  warden: {
    src: "assets/sprites/street-warden.webp",
    cell: 176, metres: 2.2, footY: 0.992,
    animations: {
      walk:       { row: 0, frames: 8, fps: 8 },
      run:        { row: 1, frames: 8, fps: 13 },
      alert:      { row: 2, frames: 4, fps: 6, loop: false },
      fight_idle: { row: 3, frames: 6, fps: 8 },
      punch:      { row: 4, frames: 6, fps: 14, loop: false },
      hit:        { row: 5, frames: 4, fps: 12, loop: false },
      ko:         { row: 6, frames: 8, fps: 12, loop: false }
    }
  },
  koda_mask: { src: "assets/sprites/koda-mask.webp" },
  // Zora, for the mission she plays: the same moves, frames and scale as Koda's sheet.
  zora: { src: "assets/sprites/zora.webp" },
  // Running into the picture (inward runs): seen from behind.
  back: {
    koda: "assets/sprites/koda-back.webp", koda_mask: "assets/sprites/koda-back-mask.webp", zora: "assets/sprites/zora-back.webp",
    cell: 192, metres: 1.81, footY: 0.99,
    animations: { run_back: { row: 0, frames: 10, fps: 14 }, jump_back: { row: 1, frames: 4, fps: 10, loop: false }, fall_back: { row: 2, frames: 4, fps: 8 }, slide_back: { row: 3, frames: 6, fps: 12, loop: false } }
  },
  // The other enforcers, from their own rigs. Same rows as the Street Warden.
  enemies: {
    sentinel: { src: "assets/sprites/sentinel.webp", cell: 176, metres: 2.571, footY: 0.987, animations: WARDEN_ANIMS },
    gilded:   { src: "assets/sprites/gilded-sentinel.webp", cell: 176, metres: 2.512, footY: 0.987, animations: WARDEN_ANIMS },
    hunter:   { src: "assets/sprites/veil-hunter.webp", cell: 176, metres: 2.276, footY: 0.986, animations: WARDEN_ANIMS },
    dock:     { src: "assets/sprites/dock-warden.webp", cell: 176, metres: 2.323, footY: 0.986, animations: WARDEN_ANIMS },
    guard:    { src: "assets/sprites/checkpoint-guard.webp", cell: 176, metres: 2.417, footY: 0.987, animations: WARDEN_ANIMS },
    handler:  { src: "assets/sprites/hound-handler.webp", cell: 176, metres: 2.297, footY: 0.986, animations: WARDEN_ANIMS }
  },
  // People in the world: one row of idle frames each.
  // Townsfolk walking through the crowds (modelled and rigged in Meshy): one row each, 8 frames of a walk.
  walkers: { src: "assets/sprites/walkers.webp", cell: 160, frames: 8, rows: 12, metres: 2.2, footY: 0.99, stride: 0.16 },
  npcs: {
    src: "assets/sprites/npcs.webp", cell: 160, frames: 8, fps: 5,
    who: {
    CHILD_1_GIRL: { row: 0, metres: 1.526, footY: 0.979 },
    CHILD_2_BOY: { row: 1, metres: 1.650, footY: 0.980 },
    CHILD_3_BOY: { row: 2, metres: 1.588, footY: 0.980 },
    CREW_4_HEAVY: { row: 3, metres: 2.330, footY: 0.986 },
    CREW_6_CROP: { row: 4, metres: 2.095, footY: 0.985 },
    DOCK_FOREMAN: { row: 5, metres: 2.251, footY: 0.986 },
    FAMILY_DAUGHTER: { row: 6, metres: 1.908, footY: 0.983 },
    FAMILY_MOTHER: { row: 7, metres: 2.098, footY: 0.985 },
    FAMILY_SON_3: { row: 8, metres: 1.167, footY: 0.972 },
    FAMILY_SON_5: { row: 9, metres: 1.346, footY: 0.976 },
    KODA_BROTHER: { row: 10, metres: 2.291, footY: 0.986 },
    MUSICIAN_CAN_DRUM: { row: 11, metres: 2.113, footY: 0.985 },
    MUSICIAN_STREET: { row: 12, metres: 2.168, footY: 0.985 },
    MUSICIAN_WIRE_GUITAR: { row: 13, metres: 2.120, footY: 0.985 },
    NEIGHBOUR_1_ELDER: { row: 14, metres: 2.136, footY: 0.985 },
    NEIGHBOUR_2_WOMAN: { row: 15, metres: 2.059, footY: 0.984 },
    NEIGHBOUR_3_MAN: { row: 16, metres: 2.199, footY: 0.985 },
    THE_SNAKE: { row: 17, metres: 2.135, footY: 0.985 }
    }
  },
  // Finish-screen dances: the default one, and the ones you unlock.
  dances: {
    default: { name: "Two-Step", src: "assets/sprites/dance-default.webp", mask: "assets/sprites/dance-default-mask.webp" },
    bboy:    { name: "B-Boy",    src: "assets/sprites/dance-bboy.webp",    mask: "assets/sprites/dance-bboy-mask.webp" },
    swing:   { name: "Swing",    src: "assets/sprites/dance-swing.webp",   mask: "assets/sprites/dance-swing-mask.webp" },
    robot:   { name: "Robot",    src: "assets/sprites/dance-robot.webp",   mask: "assets/sprites/dance-robot-mask.webp" }
  },
  dance:  { frameWidth: 295, frameHeight: 520, frames: 16, fps: 10 },
  dance_zora: { src: "assets/sprites/dance-zora.webp" },
  coin:   { src: "assets/sprites/fill-coin.webp", frameWidth: 72, frameHeight: 72, frames: 8, fps: 12 },
  drone:  { src: "assets/sprites/scanner-drone.webp", frameWidth: 150, frameHeight: 95, frames: 3, fps: 10 },
  kit:    { src: "assets/worlds/city-kit.webp" },
  meshyKit: { src: "assets/worlds/meshy-kit.webp" },
  tiles:  { src: "assets/worlds/city-tiles.webp" }
};

/* ---------------------------------------------------------------------------
   WORLDS: the F.I.L.L. city layers behind each place.
   far: distant skyline, near: street layer, clouds: a 4 x 2 sheet of cloud pieces.
   sky: the sky gradient, top to bottom. storm: the sky when the storm hits.
--------------------------------------------------------------------------- */

const WORLDS = {
  lc: { name: "LOWER CITY",  far: "assets/worlds/lc-far.webp", near: "assets/worlds/lc-near.webp", clouds: "assets/worlds/lc-clouds.webp",
        sky: ["#3b2a52", "#c0613d", "#f4b35e"], storm: ["#140f22", "#3a2440", "#6a3a3a"] },
  mc: { name: "MIDDLE CITY", far: "assets/worlds/mc-far.webp", near: "assets/worlds/mc-near.webp", clouds: "assets/worlds/mc-clouds.webp",
        sky: ["#1f3a66", "#5d7fb0", "#f0a860"], storm: ["#0e1226", "#2a2f5a", "#5a3b62"] },
  uc: { name: "UPPER CITY",  far: "assets/worlds/uc-far.webp", near: "assets/worlds/uc-near.webp", clouds: "assets/worlds/uc-clouds.webp",
        sky: ["#2a5f9c", "#86b8e0", "#f5dfa8"], storm: ["#16224a", "#3d4f80", "#7a6a88"] },
  de: { name: "THE DESERT",  far: "assets/worlds/de-far.webp", near: "assets/worlds/de-near.webp", clouds: "assets/worlds/de-clouds.webp",
        sky: ["#2b2350", "#c27a48", "#f2c47e"], storm: ["#2a1c18", "#6b4630", "#a77a4c"] },
  rc: { name: "THE RESTORED CITY", far: "assets/worlds/rc-far.webp", near: "assets/worlds/rc-near.webp", clouds: "assets/worlds/rc-clouds.webp",
        sky: ["#3a6aa0", "#f0b878", "#ffe2a8"], storm: ["#2a3450", "#6a6a88", "#a89a98"] },
  ve: { name: "THE VEIL",    far: "assets/worlds/ve-far.webp", near: "assets/worlds/ve-near.webp", clouds: "assets/worlds/ve-clouds.webp",
        sky: ["#0c1230", "#24307a", "#4a4aa8"], storm: ["#0c1230", "#24307a", "#4a4aa8"] }
};

/* ---------------------------------------------------------------------------
   SCORING
   RP (rank points) is the score of one run; the leaderboard ranks each
   player's best RP per mission. XP never goes down and sets the player's level.
   Music notes are worth more the higher they sit.
   The online leaderboard recalculates RP on the server with the same rules,
   so changing these numbers here only changes what the player sees offline.
--------------------------------------------------------------------------- */

const SCORING = {
  notes: {
    low:  { label: "NOTE",        xp: 5,  rp: 10 },
    mid:  { label: "DOUBLE NOTE", xp: 15, rp: 25 },
    high: { label: "GOLD NOTE",   xp: 30, rp: 50 }
  },
  rpPerRecord: 5,
  rpPerKnockout: 25,
  rpPerJournal: 50,
  rpCoin: 100,
  rpPerSpareSecond: 4,         // for every second to spare when you reach a checkpoint
  rpNoMisses: 300,             // every checkpoint on the beat
  rpNoWipeouts: 200,
  rpFullCollection: 500,
  xpPerRun: 50,
  xpPerRecord: 1,
  xpPerKnockout: 10,
  xpFinish: 100
};

/* ---------------------------------------------------------------------------
   SKILLS: bonus moves, perks and style you unlock with RP once you reach the
   level. The server has the same list (game_skills in the Supabase setup);
   change both together.
--------------------------------------------------------------------------- */

const SKILLS = [
  { id: "air_dash",      kind: "movement", name: "Air Dash",      level: 2, rp: 300,  how: "HIT in the air", text: "Burst forward through the air once per jump." },
  { id: "triple_jump",   kind: "movement", name: "Triple Jump",   level: 3, rp: 600,  how: "JUMP twice in the air", text: "A third jump, for the gaps you nearly make." },
  { id: "power_slide",   kind: "movement", name: "Power Slide",   level: 3, rp: 500,  how: "CROUCH while running", text: "A longer, faster slide that takes a warden's legs out." },
  { id: "wall_kick",     kind: "movement", name: "Wall Kick",     level: 4, rp: 900,  how: "JUMP against a wall in the air", text: "Kick off walls to climb where there's no pipe." },
  { id: "ground_pound",  kind: "movement", name: "Ground Pound",  level: 5, rp: 1000, how: "CROUCH in the air", text: "Slam down and flatten everyone around you." },
  { id: "takedown",      kind: "combat",   name: "Takedown",      level: 2, rp: 400,  how: "HIT a warden from behind", text: "Drop him in one move before he knows you're there." },
  { id: "flying_kick",   kind: "combat",   name: "Flying Kick",   level: 4, rp: 800,  how: "HIT at full speed", text: "Launch into a kick that ends a fight before it starts." },
  { id: "spin_kick",     kind: "combat",   name: "Spin Kick",     level: 5, rp: 1000, how: "Third HIT of a combo", text: "Your finisher spins and hits everyone around you." },
  { id: "heavy_smash",   kind: "combat",   name: "Heavy Smash",   level: 6, rp: 1400, how: "HOLD HIT", text: "A shockwave that floors him, stuns the rest and swats debris." },
  { id: "record_magnet", kind: "perk",     name: "Record Magnet", level: 2, rp: 350,  how: "Always on", text: "Records nearby fly to you." },
  { id: "storm_shield",  kind: "perk",     name: "Storm Shield",  level: 3, rp: 700,  how: "Always on", text: "Takes one hit from the storm; back at every checkpoint." },
  { id: "long_boost",    kind: "perk",     name: "Long Boost",    level: 4, rp: 600,  how: "Always on", text: "FEELZ BOOST lasts 60% longer." },
  { id: "extra_heart",   kind: "perk",     name: "Extra Heart",   level: 6, rp: 1500, how: "Always on", text: "Run with four hearts instead of three." },
  { id: "dance_bboy",    kind: "dance",    name: "B-Boy",         level: 2, rp: 200,  dance: "bboy" },
  { id: "dance_swing",   kind: "dance",    name: "Swing",         level: 4, rp: 400,  dance: "swing" },
  { id: "dance_robot",   kind: "dance",    name: "Robot",         level: 6, rp: 600,  dance: "robot" },
  { id: "outfit_ice",    kind: "outfit",   name: "Ice",           level: 2, rp: 250,  outfit: "ice" },
  { id: "outfit_crimson",kind: "outfit",   name: "Crimson",       level: 3, rp: 400,  outfit: "crimson" },
  { id: "outfit_violet", kind: "outfit",   name: "Violet",        level: 5, rp: 600,  outfit: "violet" },
  { id: "outfit_emerald",kind: "outfit",   name: "Emerald",       level: 7, rp: 900,  outfit: "emerald" }
];

// Outfit colours: hoodie dark to light, then trousers dark to light (0 to 1).
const OUTFITS = {
  gold:    { name: "Feelz Gold", swatch: "#f5b942", jacket: null },
  ice:     { name: "Ice",        swatch: "#a9d8ff", jacket: [[0.05, 0.15, 0.35], [0.85, 0.95, 1.0]], pants: [[0.02, 0.04, 0.10], [0.40, 0.50, 0.70]] },
  crimson: { name: "Crimson",    swatch: "#ff4a3c", jacket: [[0.30, 0.00, 0.02], [1.00, 0.35, 0.30]], pants: [[0.02, 0.02, 0.02], [0.35, 0.35, 0.38]] },
  violet:  { name: "Violet",     swatch: "#b58cff", jacket: [[0.18, 0.05, 0.35], [0.85, 0.60, 1.00]], pants: [[0.03, 0.02, 0.06], [0.45, 0.40, 0.60]] },
  emerald: { name: "Emerald",    swatch: "#43e08a", jacket: [[0.00, 0.20, 0.10], [0.50, 1.00, 0.70]], pants: [[0.02, 0.04, 0.03], [0.35, 0.45, 0.40]] }
};

/* ---------------------------------------------------------------------------
   CREDITS AND SONG VOUCHERS
   Turn collectibles into Feelz credits, then spend credits on a voucher for
   money off one of the album songs on Feelz Machine. The server applies the
   same numbers; these are what the player sees.
--------------------------------------------------------------------------- */

const CREDITS = { perRecord: 1, perNote: 2, perPage: 25, perCoin: 50 };
const VOUCHERS = [{ percent: 10, cost: 250 }, { percent: 25, cost: 600 }, { percent: 50, cost: 1200 }];

// The album songs on Feelz Machine, in album order.
const ALBUM_TRACKS = [
  { mission: "m01", title: "Against The Storm",   id: "c8c16939-4e59-4217-942e-d1e06fa860fd", slug: "against-the-storm-mulu2ddy" },
  { mission: "m02", title: "Get Out The Way",     id: "27c7681d-bbd1-40a0-a183-02dc773f54d9", slug: "get-out-the-way-multjukf" },
  { mission: "m03", title: "Ghetto Gospel",       id: "c92bccdd-5361-4a4e-9472-b188ad65ea19", slug: "ghetto-gospel-multk8jq" },
  { mission: "m04", title: "Blessings",           id: "54a533b8-bcbc-424e-b130-0441bd7645c3", slug: "blessings-multlcs7" },
  { mission: "m05", title: "Chemistry",           id: "054f6b34-20d5-43c7-80cc-ada5546fd14f", slug: "chemistry-multlst0" },
  { mission: "m06", title: "God is My Woman",     id: "b3994b14-6c2c-483a-82dc-66c1862a7502", slug: "god-is-my-woman-multm82c" },
  { mission: "m07", title: "Close to My Heart",   id: "0ca7051b-8e16-41f8-b762-2214547cf0d6", slug: "close-to-my-heart-mumqz48p" },
  { mission: "m08", title: "Patience",            id: "88e496bf-0a85-484b-85a9-892b0f38a350", slug: "patience-multys5y" },
  { mission: "m09", title: "Head's Up",           id: "59434ad6-60de-4b38-8a6d-e745dd9d61f4", slug: "heads-up-multz61b" },
  { mission: "m10", title: "I Pray",              id: "6eb8937c-9570-4834-a0a5-12f7e404473f", slug: "i-pray-multzjgv" },
  { mission: "m11", title: "Letting off Steam",   id: "4ae18100-f2ce-4839-8f14-705a7e01d9c8", slug: "letting-off-steam-mulu03o4" },
  { mission: "m12", title: "My Brothers",         id: "81f9e7fc-0bf6-4e30-8657-e4f009946b25", slug: "my-brothers-mulu0kxy" },
  { mission: "m13", title: "Roses & Butterflies", id: "bbf1b1fd-60d3-44b5-9742-30fd532cef8c", slug: "roses-butterflies-mulu0zge" },
  { mission: "m14", title: "Shine Olive Gem",     id: "c1673fbf-f5f9-4e72-8af5-da4692ecfa86", slug: "shine-olive-gem-mulu1dad" },
  { mission: "m15", title: "Thugs in Love",       id: "8f0bffa5-8af7-4ee1-a22f-b14713a5a1a5", slug: "thugs-in-love-mulu1t5z" }
];

/* ---------------------------------------------------------------------------
   MESHY KIT
   Buildings and props modelled in Meshy, rendered side-on in the cel style and
   packed into assets/worlds/meshy-kit.webp. [x, y, w, h, roofline] in pixels;
   roofline is how far down the picture the flat roof you run on starts.
--------------------------------------------------------------------------- */
const MESHY_KIT = {
  lc_b1: [0, 0, 507, 560, 135],
  lc_b2: [511, 0, 702, 560, 7],
  lc_b4: [1217, 0, 440, 560, 164],
  lc_b5: [1661, 0, 741, 560, 0],
  lc_b6: [2406, 0, 669, 560, 41],
  lc_b7: [3079, 0, 435, 560, 41],
  mc_b2: [0, 564, 595, 560, 1],
  mc_b4: [599, 564, 631, 560, 70],
  mc_b6: [1234, 564, 622, 560, 43],
  mc_b7: [1860, 564, 514, 560, 2],
  uc_b1: [2378, 564, 554, 560, 1],
  uc_b2: [2936, 564, 917, 560, 91],
  uc_b3: [0, 1128, 528, 560, 34],
  uc_b4: [532, 1128, 796, 560, 32],
  uc_b5: [1332, 1128, 826, 560, 49],
  rc_b1: [2162, 1128, 746, 560, 31],
  rc_b3: [2912, 1128, 690, 560, 129],
  rc_b4: [0, 1692, 756, 560, 31],
  rc_b5: [760, 1692, 355, 560, 62],
  de_b1: [1119, 1692, 925, 560, 56],
  de_b2: [2048, 1692, 522, 560, 1],
  de_b3: [2574, 1692, 1147, 560, 185],
  de_b4: [0, 2256, 755, 560, 229],
  p_billboard: [759, 2256, 414, 300, 0],
  p_booth: [1177, 2256, 228, 300, 0],
  p_cage: [1409, 2256, 219, 300, 0],
  p_carriage: [1632, 2256, 1027, 300, 0],
  p_container: [2663, 2256, 546, 300, 0],
  p_filter: [3213, 2256, 265, 300, 0],
  p_glass: [0, 2820, 812, 300, 0],
  p_hedge: [816, 2820, 538, 300, 0],
  p_mast: [1358, 2820, 61, 300, 0],
  p_scanner: [1423, 2820, 479, 300, 0],
  p_shrine: [1906, 2820, 277, 300, 0],
  p_stall: [2187, 2820, 422, 300, 0],
  p_turnstile: [2613, 2820, 453, 300, 0],
  p_valve: [3070, 2820, 305, 300, 0],
  p_window: [3379, 2820, 244, 300, 0]
};
// The lockup's neighbours, played by the walking townsfolk (row in walkers.webp).
const WALKER_FOR = { NEIGHBOUR_1_ELDER: 2, NEIGHBOUR_2_WOMAN: 7, NEIGHBOUR_3_MAN: 0, CHILD_1_GIRL: 5, FAMILY_MOTHER: 3 };
// The building fronts each world uses for its rooftops.
const MESHY_BUILDINGS = {
  lc: ["lc_b1", "lc_b2", "lc_b4", "lc_b5", "lc_b6", "lc_b7"],
  mc: ["mc_b2", "mc_b4", "mc_b6", "mc_b7"],
  uc: ["uc_b1", "uc_b2", "uc_b3", "uc_b4", "uc_b5"],
  rc: ["rc_b1", "rc_b3", "rc_b4", "rc_b5"],
  de: ["de_b1", "de_b2", "de_b3", "de_b4"]
};

/* ---------------------------------------------------------------------------
   EACH WORLD'S OWN THINGS
   Obstacles and street dressing painted for each world, packed into
   assets/worlds/props-2d.webp: [x, y, w, h] in pixels. An obstacle in a
   world without its own (the Lower City) keeps the city kit.
--------------------------------------------------------------------------- */
const PROP2D = {
  de_barrel: [0, 0, 181, 240],
  de_cart: [185, 0, 411, 240],
  de_crate: [600, 0, 251, 240],
  de_crate_half: [855, 0, 389, 240],
  de_decor1: [1248, 0, 239, 300],
  de_decor2: [1491, 0, 175, 300],
  lc_decor1: [1670, 0, 228, 300],
  lc_decor2: [0, 304, 315, 300],
  mc_barrel: [319, 304, 146, 240],
  mc_cart: [469, 304, 350, 240],
  mc_crate: [823, 304, 368, 240],
  mc_crate_half: [1195, 304, 363, 240],
  mc_decor1: [1562, 304, 127, 300],
  mc_decor2: [1693, 304, 275, 300],
  rc_barrel: [0, 608, 125, 240],
  rc_cart: [129, 608, 363, 240],
  rc_crate: [496, 608, 236, 240],
  rc_crate_half: [736, 608, 258, 240],
  rc_decor1: [998, 608, 250, 300],
  uc_barrel: [1252, 608, 162, 240],
  uc_cart: [1418, 608, 420, 170],
  uc_crate: [0, 912, 245, 240],
  uc_crate_half: [249, 912, 409, 240],
  uc_decor1: [662, 912, 78, 300],
  uc_decor2: [744, 912, 192, 300],
  ve_barrel: [940, 912, 153, 240],
  ve_cart: [1097, 912, 420, 218],
  ve_crate: [1521, 912, 212, 240],
  ve_crate_half: [1737, 912, 227, 240],
  ve_decor1: [0, 1216, 119, 300],
  ve_decor2: [123, 1216, 205, 300]
};
// What stands along the street in each world, and how tall it is (metres).
const WORLD_DRESSING = {
  lc: [["lc_decor1", 3.4], ["lc_decor2", 1.2]],
  mc: [["mc_decor1", 3.4], ["mc_decor2", 1.9], ["mc_barrel", 1.0]],
  uc: [["uc_decor1", 3.0], ["uc_decor2", 1.5], ["uc_barrel", 1.3]],
  de: [["de_decor1", 2.8], ["de_decor2", 2.6], ["de_barrel", 1.1]],
  ve: [["ve_decor1", 2.4], ["ve_decor2", 1.6], ["ve_barrel", 1.1]],
  rc: [["rc_decor1", 3.0], ["rc_barrel", 1.2], ["rc_cart", 1.3]]
};
