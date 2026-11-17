/*
  FEELZ RUN - MISSION 01: AGAINST THE STORM
  Koda's first run through the Lower City, following the F.I.L.L. Mission 1 story.
  Every distance and height is in metres. x runs left to right, y is the height
  above the street. The game turns metres into pixels when the mission loads.

  The run is timed to the song. Each part of the song (intro, verses, choruses,
  bridge, outro) has a checkpoint you must reach before the next part starts.
  Miss it and the game taunts you, then sends you back to the start of that
  part with the song rewound to match.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m01 = {
  id: "m01",
  number: 1,
  title: "AGAINST THE STORM",
  world: "LOWER CITY",
  song: {
    title: "Against The Storm",
    src: "assets/audio/m01-against-the-storm.mp3",
    lyrics: "assets/lyrics/m01-against-the-storm.txt",
    seconds: 209.4
  },
  length: 592,
  startX: 1.5,

  // The song's parts, from the lyric timings. Each one ends at a checkpoint (x, y) you must reach in time.
  // storm: the storm hits in this part (darker sky, lightning, debris flying past).
  parts: [
    { name: "INTRO",    start: 0,      end: 12.38,  checkpoint: { x: 31.5, y: 0 },   storm: false },
    { name: "VERSE 1",  start: 12.38,  end: 52.88,  checkpoint: { x: 146, y: 7.0 }, storm: false },
    { name: "CHORUS 1", start: 52.88,  end: 79.74,  checkpoint: { x: 236, y: 7.0 }, storm: true },
    { name: "VERSE 2",  start: 79.74,  end: 112.88, checkpoint: { x: 339, y: 6.6 }, storm: false },
    { name: "CHORUS 2", start: 112.88, end: 135.98, checkpoint: { x: 400, y: 0 },   storm: true },
    { name: "BRIDGE",   start: 135.98, end: 162.38, checkpoint: { x: 452, y: 0 },   storm: false },
    { name: "CHORUS 3", start: 162.38, end: 187.52, checkpoint: { x: 526, y: 6.6 }, storm: true },
    { name: "OUTRO",    start: 187.52, end: 209.4,  checkpoint: { x: 584, y: 6.8 }, storm: false, finish: true, drive: true }
  ],

  // Lightning on the "Me against the storm" lines.
  // The storm front chases you from behind; it can't get into shelters.
  stormChase: true,
  bpm: 86.7,   // the fight beat plays in time with the song
  shelters: [{ from: 389, to: 456.5 }],

  lightning: [52.88, 59.54, 68.5, 73.64, 112.88, 117.62, 123.86, 129.54, 162.38, 167.68, 173.98, 179.58],

  // Places along the run. world picks the sky and city layers behind it (see WORLDS in config.js).
  sections: [
    { from: 0,   name: "THE THOROUGHFARE", backdrop: "m1-loc-01-thoroughfare", world: "lc" },
    { from: 78,  name: "THE MARKET",       backdrop: "m1-loc-02-market", world: "lc" },
    { from: 112, name: "THE ROOFTOPS",     backdrop: "m1-loc-03-rooftops", world: "mc", fallBelow: 3.0 },
    { from: 340, name: "THE STORM RUN",    backdrop: "m1-loc-04-concrete-walkway", world: "mc", fallBelow: 2.4 },
    { from: 389, name: "THE SHELTER",      backdrop: "m1-loc-05-storm-shelter", world: "ve" },
    { from: 460, name: "AGAINST THE STORM", backdrop: "m1-loc-03-rooftops", world: "mc", fallBelow: 3.0 },
    { from: 526, name: "WE MADE IT FAR",   backdrop: "m1-loc-04-concrete-walkway", world: "uc", fallBelow: 3.0 }
  ],

  // Solid things. top / bottom are heights in metres. kind picks how it looks:
  // ground, roof, catwalk (jump up through it), awning (jump up through it), crate, barrel, cart, counter (a market stall),
  // vent, overhang (slide or crouch under it), gate (a shutter that closes as you reach trigger), ceiling.
  solids: [
    // INTRO and VERSE 1: the thoroughfare
    { kind: "ground", x: -6, w: 118, top: 0 },
    { kind: "cart", x: 18, w: 2.2, top: 1.0 },
    { kind: "crate", x: 27, w: 0.5, top: 0.5, art: "crate_half" },
    { kind: "awning", x: 39.6, w: 4.6, top: 2.35, art: "stall" },
    { kind: "cart", x: 59, w: 2.2, top: 1.0 },
    { kind: "overhang", x: 64, w: 4, bottom: 0.85, top: 3.2 },
    { kind: "crate", x: 73, w: 1.0, top: 1.0 },
    { kind: "crate", x: 74.2, w: 1.0, top: 2.0 },
    { kind: "crate", x: 75.4, w: 1.0, top: 1.0 },

    // the market
    { kind: "counter", x: 82, w: 3, top: 1.0 },
    { kind: "counter", x: 90, w: 3, top: 1.0 },
    { kind: "counter", x: 98, w: 3, top: 1.0 },
    { kind: "awning", x: 81.6, w: 3.8, top: 2.6, oneWay: true },
    { kind: "awning", x: 89.6, w: 3.8, top: 2.6, oneWay: true },
    { kind: "awning", x: 97.6, w: 3.8, top: 2.6, oneWay: true },
    { kind: "barrel", x: 105, w: 0.7, top: 1.0 },

    // up the pipe to the roofs
    { kind: "roof", x: 112, w: 10, top: 6.0 },
    { kind: "roof", x: 124.5, w: 11.5, top: 6.4 },
    { kind: "vent", x: 130, w: 0.9, top: 7.5 },
    { kind: "roof", x: 138, w: 10, top: 7.0 },

    // CHORUS 1: the storm hits the rooftops
    { kind: "catwalk", x: 148, w: 12, top: 6.9 },
    { kind: "overhang", x: 153, w: 2.6, bottom: 8.35, top: 10.05, art: "sign" },
    { kind: "roof", x: 160, w: 14, top: 6.6 },
    { kind: "vent", x: 166, w: 0.9, top: 7.7 },
    { kind: "roof", x: 176, w: 12, top: 6.2 },
    { kind: "crate", x: 181, w: 1.0, top: 7.2 },
    { kind: "roof", x: 190.5, w: 11.5, top: 5.7 },
    { kind: "crate", x: 196, w: 1.0, top: 6.7 },
    { kind: "roof", x: 204.5, w: 9.5, top: 6.3 },
    { kind: "roof", x: 216, w: 13, top: 8.6 },
    { kind: "roof", x: 231.5, w: 12.5, top: 7.0 },

    // VERSE 2: drones and wardens over the roofs
    { kind: "roof", x: 246, w: 12, top: 7.4 },
    { kind: "roof", x: 260.5, w: 11.5, top: 6.0 },
    { kind: "vent", x: 266, w: 0.9, top: 7.1 },
    { kind: "roof", x: 274.5, w: 12.5, top: 6.4 },
    { kind: "roof", x: 289, w: 15, top: 5.9 },
    { kind: "overhang", x: 296, w: 3, bottom: 7.35, top: 9.05, art: "sign" },
    { kind: "roof", x: 306, w: 14, top: 7.2 },
    { kind: "catwalk", x: 323.5, w: 10.5, top: 6.2 },
    { kind: "roof", x: 334, w: 10, top: 6.6 },

    // CHORUS 2: the storm run. Shutters slam shut as you reach them: slide under, or climb over.
    { kind: "gate", x: 342.4, w: 0.4, top: 9.6, bottom: 6.6, trigger: 339.5 },
    { kind: "roof", x: 347, w: 11, top: 6.4 },
    { kind: "catwalk", x: 358, w: 14, top: 7.2 },
    { kind: "gate", x: 363, w: 0.4, top: 10.2, bottom: 7.2, trigger: 359 },
    { kind: "roof", x: 372, w: 12, top: 6.8 },
    { kind: "gate", x: 378, w: 0.4, top: 9.8, bottom: 6.8, trigger: 374 },
    { kind: "roof", x: 384, w: 6, top: 3.0 },
    { kind: "ground", x: 388, w: 72, top: 0 },

    // BRIDGE: the shelter, then the crawlspace ("on my knees")
    { kind: "ceiling", x: 406, w: 4, bottom: 2.7, top: 6 },
    { kind: "ceiling", x: 410, w: 12, bottom: 1.45, top: 6 },
    { kind: "ceiling", x: 422, w: 3.5, bottom: 2.9, top: 6 },
    { kind: "ceiling", x: 425.5, w: 10.5, bottom: 1.45, top: 6 },
    { kind: "ceiling", x: 436, w: 3.5, bottom: 2.9, top: 6 },
    { kind: "ceiling", x: 439.5, w: 8.5, bottom: 1.45, top: 6 },

    // CHORUS 3: back up to the roofs for the last storm
    { kind: "roof", x: 456, w: 12, top: 7.0 },
    { kind: "roof", x: 471.5, w: 12.5, top: 6.4 },
    { kind: "vent", x: 476, w: 0.9, top: 7.5 },
    { kind: "roof", x: 486, w: 12, top: 6.9 },
    { kind: "overhang", x: 492, w: 3, bottom: 8.35, top: 10.05, art: "sign" },
    { kind: "roof", x: 500.5, w: 11.5, top: 7.6 },
    { kind: "crate", x: 504, w: 1.0, top: 8.6 },
    { kind: "roof", x: 514, w: 16, top: 6.6 },

    // OUTRO: "We made it far"
    { kind: "roof", x: 533, w: 13, top: 7.0 },
    { kind: "barrel", x: 540, w: 0.7, top: 8.0 },
    { kind: "roof", x: 549, w: 14.2, top: 6.3 },
    { kind: "gate", x: 556, w: 0.4, top: 9.3, bottom: 6.3, trigger: 552 },
    { kind: "roof", x: 565, w: 27, top: 6.8 }
  ],

  // Pipes to climb (and the shutters' climb strips). x is where the hands go.
  climbs: [
    { x: 39.6, bottom: 0, top: 2.35 },
    { x: 111.75, bottom: 0, top: 6.0 },
    { x: 215.75, bottom: 5.0, top: 8.6 },
    { x: 305.75, bottom: 4.5, top: 7.2 },
    { x: 342.2, bottom: 6.6, top: 9.6, strip: true },
    { x: 362.8, bottom: 7.2, top: 10.2, strip: true },
    { x: 377.8, bottom: 6.8, top: 9.8, strip: true },
    { x: 455.75, bottom: 0, top: 7.0 },
    { x: 555.8, bottom: 6.3, top: 9.3, strip: true }
  ],

  mud: [{ x: 7, w: 4.5 }],

  // Enforcers walk their beat. Touch one and it hurts; jump on him or hit him to knock him out.
  wardens: [
    { x: 51, y: 0, minX: 46, maxX: 56.5 },
    { x: 87.5, y: 0, minX: 85.4, maxX: 89.6 },
    { x: 95.5, y: 0, minX: 93.4, maxX: 97.6 },
    { x: 280, y: 6.4, minX: 276, maxX: 286 },
    { x: 519, y: 6.6, minX: 516, maxX: 524 }
  ],

  // Scanner drones sweep back and forth. Touch one and it hurts; jump on it to take it out.
  drones: [
    { x: 172, y: 8.4, minX: 166, maxX: 186 },
    { x: 252, y: 9.4, minX: 247, maxX: 264 },
    { x: 540, y: 9.2, minX: 535, maxX: 552 }
  ],

  // FEELZ BOOST (blue): a few seconds of sprint. TIME REWIND (magenta): the song rewinds 10 seconds.
  boosts: [{ x: 162, y: 7.6 }, { x: 349, y: 7.4 }, { x: 528, y: 7.6 }],
  rewinds: [{ x: 197.5, y: 8.6 }, { x: 437.7, y: 2.3 }],

  coin: { x: 9, y: 0.6 },

  // Journal pages from journal_entries.json, hidden along the way.
  journal: [{"id":"M01_memory_1","x":130.4,"y":9},{"id":"M01_record_1","x":303,"y":7.5},{"id":"M01_lyric","x":477,"y":8.9}],
  journalText: {
    "M01_memory_1": {
      "kind": "Memory trace",
      "title": "A child's drawing",
      "text": "Crayon on a scrap of card: a small figure in a beanie holding a bigger one's hand, under brown rain.",
      "image": "assets/journal/M01_memory_1.webp"
    },
    "M01_record_1": {
      "kind": "City record",
      "title": "Curfew notice",
      "text": "By order of the Circle: no movement between layers during dust storms. Wardens will enforce.",
      "image": "assets/journal/M01_record_1.webp"
    },
    "M01_lyric": {
      "kind": "Lyric fragment",
      "title": "\"I'm a little bit lost but I'm not going down\"",
      "text": "Scratched into the shelter wall by someone who waited out the same storm. From \"Against The Storm\", track 1.",
      "image": "assets/journal/M01_lyric.webp"
    }
  },

  // Music notes are the XP. The higher a note sits above the floor below it, the more it's worth:
  // within a jump = NOTE, a double jump or on top of something = DOUBLE NOTE, a climb or the high route = GOLD NOTE.
  notes: [
    [18.6, 2.2], [19.6, 2.2], [27.3, 1.7], [41, 3.3], [42.4, 3.4], [43.8, 3.3], [59.6, 2.3], [60.6, 2.3],
    [66, 0.4], [74.7, 3.2], [75.5, 3.6], [83.5, 3.4], [87.5, 4.4], [91.5, 4.5], [95.5, 4.4], [99.5, 3.4], [105.3, 2.2],
    [118, 7.3], [123.2, 8.0], [130.4, 8.8], [137, 8.6], [143, 8.2], [154.3, 7.6], [167, 8.9], [175, 8.0],
    [181.5, 8.4], [189.2, 7.6], [196.5, 7.9], [203.2, 7.7], [210, 7.5], [219, 9.8], [223, 9.9], [227, 9.8], [230.3, 9.4],
    [238, 8.2], [245, 9.0], [252, 8.6], [259.2, 8.4], [266.5, 8.3], [273.4, 8.0], [281, 8.6], [288, 7.6],
    [297.5, 6.4], [303, 7.3], [310, 8.4], [316, 8.4], [322.5, 7.6], [328, 7.4], [336, 7.8],
    [345, 8.0], [352.5, 7.6], [360, 8.4], [367, 8.4], [372.5, 8.6], [380, 8.0], [386.5, 4.2],
    [395, 1.0], [404.5, 1.8], [416, 0.6], [423.7, 1.2], [437.7, 1.2], [444, 0.6], [449.5, 1.4],
    [461, 8.2], [469.8, 8.4], [477, 8.7], [484, 8.2], [491, 8.1], [493.5, 7.4], [499, 8.8], [504.5, 9.8], [510, 8.8],
    [518, 7.8], [531, 8.4], [538, 8.2], [547, 8.6], [553, 7.5], [560, 7.5], [563.5, 8.2], [570, 8.0], [576, 8.4]
  ],

  // Vinyl records along the main route are added automatically (one every few metres on every floor).
  recordSpacing: 4.5,

  // Scenery from the city kit. layer "back" draws behind Koda, "front" in front of him.
  decor: [
    { art: "barrel", x: 12.5, y: 0, h: 0.9, layer: "back" },
    { art: "laundry", x: 30, y: 0, h: 2.6, layer: "back" },
    { art: "valve", x: 70, y: 0, h: 1.0, layer: "back" },
    { art: "lantern", x: 86, y: 2.2, h: 0.5, layer: "back", glow: "#8fd0ff" },
    { art: "lantern", x: 94, y: 2.2, h: 0.5, layer: "back", glow: "#8fd0ff" },
    { art: "crate_half", x: 102.5, y: 0, h: 0.5, layer: "back" },
    { art: "scaffold", x: 168, y: 6.6, h: 3.0, layer: "back" },
    { art: "laundry", x: 252, y: 7.4, h: 2.6, layer: "back" },
    { art: "valve", x: 312, y: 7.2, h: 1.0, layer: "back" },
    { art: "stone_base", x: 398, y: 0, h: 1.0, layer: "back" },
    { art: "shrine", x: 402.8, y: 0, h: 1.3, layer: "back", glow: "#ffcf7a" },
    { art: "lantern", x: 423.7, y: 1.9, h: 0.5, layer: "back", glow: "#8fd0ff" },
    { art: "lantern", x: 437.7, y: 1.9, h: 0.5, layer: "back", glow: "#8fd0ff" },
    { art: "scaffold", x: 520, y: 6.6, h: 3.0, layer: "back" },
    { art: "laundry", x: 578, y: 6.8, h: 2.6, layer: "back" }
  ],

  // Things the game says when you miss a checkpoint.
  taunts: [
    "TOO SLOW. THE STORM DOESN'T WAIT.",
    "THE CHORUS LEFT WITHOUT YOU.",
    "YOU HEARD THE BEAT. YOU JUST DIDN'T MOVE.",
    "THE WARDENS ARE LAUGHING AT YOU.",
    "EVEN THE RAIN GOT THERE FIRST.",
    "A LITTLE BIT LOST. AND A LOT BEHIND.",
    "THE SONG KEPT GOING. YOU DIDN'T.",
    "FIRST IMPRESSIONS LAST LONGEST. THAT ONE WAS ROUGH.",
    "AGAINST THE STORM? THE STORM WON THAT ONE.",
    "RUN IT BACK. AND THIS TIME, RUN."
  ],

  candle: { x: 402.8, y: 1.0 },
  goal: { x: 584, y: 6.8 }
};
