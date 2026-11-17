/*
  FEELZ RUN - MISSION 03: GHETTO GOSPEL
  A curfew raid on Koda's own street. Fight for the neighbourhood, then get everyone to the fire pit.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m03 = {
 "id": "m03",
 "number": 3,
 "title": "GHETTO GOSPEL",
 "world": "LOWER CITY",
 "song": {
  "title": "Ghetto Gospel",
  "src": "assets/audio/m03-ghetto-gospel.mp3",
  "lyrics": "assets/lyrics/m03-ghetto-gospel.txt",
  "seconds": 161.9
 },
 "length": 537.97,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 23.8,
   "checkpoint": {
    "x": 77.61,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 23.8,
   "end": 60.9,
   "checkpoint": {
    "x": 202.61,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "CHORUS 1",
   "start": 60.9,
   "end": 81.9,
   "checkpoint": {
    "x": 262.94,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 2",
   "start": 81.9,
   "end": 108.4,
   "checkpoint": {
    "x": 351.37,
    "y": 0
   },
   "storm": false,
   "dogs": 1
  },
  {
   "name": "BRIDGE",
   "start": 108.4,
   "end": 120.1,
   "checkpoint": {
    "x": 394.86,
    "y": 9.6
   },
   "storm": false
  },
  {
   "name": "CHORUS 2",
   "start": 120.1,
   "end": 141.0,
   "checkpoint": {
    "x": 455.36,
    "y": 0
   },
   "storm": false,
   "hound": true
  },
  {
   "name": "OUTRO",
   "start": 141.0,
   "end": 161.9,
   "checkpoint": {
    "x": 524.47,
    "y": 0
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 80.8,
 "shelters": [],
 "weather": {
  "rain": 0.08,
  "wind": 0.06
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE NIGHT MARKET",
   "world": "lc",
   "backdrop": "m3-loc-01-market-night"
  },
  {
   "from": 204.11,
   "name": "THE LOCKUP",
   "world": "lc",
   "backdrop": "m3-loc-01-market-night"
  },
  {
   "from": 352.87,
   "name": "THE FREIGHT YARD",
   "world": "mc",
   "backdrop": "m3-loc-04-freight-yard-elevator"
  },
  {
   "from": 354.37,
   "name": "THE FREIGHT ELEVATOR",
   "world": "mc",
   "backdrop": "m3-loc-04-freight-yard-elevator",
   "fallBelow": 2.0
  },
  {
   "from": 404.86,
   "name": "THE FREIGHT ELEVATOR",
   "world": "mc",
   "backdrop": "m3-loc-04-freight-yard-elevator"
  },
  {
   "from": 407.86,
   "name": "THE RAID",
   "world": "lc",
   "backdrop": "m3-loc-01-market-night"
  },
  {
   "from": 456.86,
   "name": "THE FIRE PIT",
   "world": "lc",
   "backdrop": "m3-loc-03-firepit-gathering"
  }
 ],
 "inward": [],
 "tunnels": [
  {
   "x": 82.11,
   "w": 43.2,
   "top": -0.6,
   "bottom": -3.0
  },
  {
   "x": 267.44,
   "w": 41.2,
   "top": -0.6,
   "bottom": -3.0
  }
 ],
 "ziplines": [],
 "crowds": [
  {
   "x": 2.0,
   "w": 22,
   "y": 0
  },
  {
   "x": 409.86,
   "w": 18,
   "y": 0
  }
 ],
 "cages": [
  {
   "x": 208.11,
   "y": 0,
   "npc": 1
  },
  {
   "x": 217.11,
   "y": 0,
   "npc": 2
  },
  {
   "x": 226.11,
   "y": 0,
   "npc": 3
  }
 ],
 "scanners": [],
 "tails": [],
 "hedges": [],
 "turns": [],
 "flickers": [],
 "shrines": [],
 "valves": [],
 "windows": [],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [
  {
   "who": "THE_SNAKE",
   "x": 30.0,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_1_ELDER",
   "x": 208.11,
   "y": 0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_2_WOMAN",
   "x": 217.11,
   "y": 0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_3_MAN",
   "x": 226.11,
   "y": 0,
   "facing": -1
  },
  {
   "who": "MUSICIAN_CAN_DRUM",
   "x": 464.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "MUSICIAN_WIRE_GUITAR",
   "x": 466.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "MUSICIAN_STREET",
   "x": 468.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "CHILD_1_GIRL",
   "x": 471.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "CHILD_2_BOY",
   "x": 473.26,
   "y": 0.0,
   "facing": 1
  },
  {
   "who": "CHILD_3_BOY",
   "x": 474.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_1_ELDER",
   "x": 477.86,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_2_WOMAN",
   "x": 479.86,
   "y": 0.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "cart",
   "x": 29.0,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 37.92,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 39.12,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 40.32,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 47.91,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 57.75,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 65.95,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "counter",
   "x": 85.61,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 85.21,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "counter",
   "x": 106.41,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 106.01,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 88.11,
   "top": 0
  },
  {
   "kind": "grate",
   "x": 82.11,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 83.71,
   "w": 40.0,
   "top": 0,
   "bottom": -0.6
  },
  {
   "kind": "grate",
   "x": 123.71,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 81.51,
   "w": 44.4,
   "top": -3.0,
   "bottom": -6.0
  },
  {
   "kind": "vent",
   "x": 88.11,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 96.53,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 105.28,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 112.54,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "catwalk",
   "x": 83.51,
   "w": 7.32,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 92.94,
   "w": 7.46,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 102.85,
   "w": 5.41,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 110.51,
   "w": 5.01,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 117.94,
   "w": 5.17,
   "top": 5.6
  },
  {
   "kind": "counter",
   "x": 130.11,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 129.71,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "counter",
   "x": 138.11,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 137.71,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "counter",
   "x": 146.11,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 145.71,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "cart",
   "x": 158.11,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 167.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 173.94,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 182.71,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 193.02,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 194.22,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 195.42,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 254.11,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 255.31,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 256.5,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "counter",
   "x": 270.94,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 270.54,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "counter",
   "x": 290.64,
   "w": 3,
   "top": 1.0
  },
  {
   "kind": "awning",
   "x": 290.24,
   "w": 3.8,
   "top": 2.6,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 125.31,
   "w": 142.13,
   "top": 0
  },
  {
   "kind": "grate",
   "x": 267.44,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 269.04,
   "w": 38.0,
   "top": 0,
   "bottom": -0.6
  },
  {
   "kind": "grate",
   "x": 307.04,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 266.84,
   "w": 42.4,
   "top": -3.0,
   "bottom": -6.0
  },
  {
   "kind": "vent",
   "x": 273.44,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 282.02,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 289.77,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 299.17,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "catwalk",
   "x": 268.84,
   "w": 5.06,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 276.14,
   "w": 7.67,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 286.05,
   "w": 7.97,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 296.43,
   "w": 7.36,
   "top": 5.6
  },
  {
   "kind": "ceiling",
   "x": 314.44,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 317.94,
   "w": 9.22,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "barrel",
   "x": 332.16,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 339.36,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 346.78,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 308.64,
   "w": 46.22,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 354.37,
   "w": 10,
   "top": 4.0
  },
  {
   "kind": "roof",
   "x": 364.37,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 372.37,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 382.86,
   "w": 6,
   "top": 9.6
  },
  {
   "kind": "roof",
   "x": 390.86,
   "w": 8,
   "top": 9.6
  },
  {
   "kind": "roof",
   "x": 400.86,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "barrel",
   "x": 446.86,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 465.86,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 491.86,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 500.78,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 510.58,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 511.78,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 512.98,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 404.86,
   "w": 129.11,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 124.51,
   "bottom": -3.0,
   "top": 0
  },
  {
   "x": 83.31,
   "bottom": 0,
   "top": 5.6
  },
  {
   "x": 307.84,
   "bottom": -3.0,
   "top": 0
  },
  {
   "x": 268.64,
   "bottom": 0,
   "top": 5.6
  },
  {
   "x": 354.12,
   "bottom": 0,
   "top": 4.0
  },
  {
   "x": 364.12,
   "bottom": 4.0,
   "top": 7.0
  },
  {
   "x": 372.12,
   "bottom": 7.0,
   "top": 10.0
  }
 ],
 "mud": [
  {
   "x": 444.86,
   "w": 4.0
  }
 ],
 "wardens": [
  {
   "x": 9.7,
   "y": 0,
   "minX": 5.7,
   "maxX": 13.7,
   "kind": "warden"
  },
  {
   "x": 90.11,
   "y": 0,
   "minX": 86.91,
   "maxX": 93.31,
   "kind": "warden"
  },
  {
   "x": 118.11,
   "y": 0,
   "minX": 114.91,
   "maxX": 121.31,
   "kind": "warden"
  },
  {
   "x": 135.61,
   "y": 0,
   "minX": 133.51,
   "maxX": 137.71,
   "kind": "warden"
  },
  {
   "x": 143.61,
   "y": 0,
   "minX": 141.51,
   "maxX": 145.71,
   "kind": "warden"
  },
  {
   "x": 212.61,
   "y": 0,
   "minX": 210.11,
   "maxX": 215.11,
   "kind": "warden"
  },
  {
   "x": 243.11,
   "y": 0.0,
   "minX": 240.61,
   "maxX": 245.61,
   "kind": "handler"
  },
  {
   "x": 275.44,
   "y": 0,
   "minX": 272.24,
   "maxX": 278.64,
   "kind": "warden"
  },
  {
   "x": 288.44,
   "y": 0,
   "minX": 285.24,
   "maxX": 291.64,
   "kind": "warden"
  },
  {
   "x": 301.44,
   "y": 0,
   "minX": 298.24,
   "maxX": 304.64,
   "kind": "warden"
  },
  {
   "x": 416.16,
   "y": 0,
   "minX": 412.16,
   "maxX": 420.16,
   "kind": "warden"
  },
  {
   "x": 419.76,
   "y": 0,
   "minX": 415.76,
   "maxX": 423.76,
   "kind": "warden"
  },
  {
   "x": 435.86,
   "y": 0.0,
   "minX": 433.36,
   "maxX": 438.36,
   "kind": "handler"
  }
 ],
 "drones": [],
 "boosts": [],
 "rewinds": [],
 "coin": {
  "x": 324.05,
  "y": 0.6
 },
 "journal": [{"id":"M03_memory_1","x":115.11,"y":-2},{"id":"M03_record_1","x":271.37,"y":7},{"id":"M03_lyric","x":435.86,"y":2.2}],
 "journalText": {
    "M03_memory_1": {
      "kind": "Memory trace",
      "title": "The hiding spot",
      "text": "Behind a market stall, a hollow where Koda and his brother used to hide from Wardens.",
      "image": "assets/journal/M03_memory_1.webp"
    },
    "M03_record_1": {
      "kind": "City record",
      "title": "Curfew sweep order",
      "text": "Tonight's sweep: confiscate instruments, disperse gatherings.",
      "image": "assets/journal/M03_record_1.webp"
    },
    "M03_lyric": {
      "kind": "Lyric fragment",
      "title": "\"That's why we need a ghetto gospel\"",
      "text": "Painted on the mural above the fire pit. From \"Ghetto Gospel\", track 3.",
      "image": "assets/journal/M03_lyric.webp"
    }
  },
 "notes": [
  [
   4.0,
   1.4
  ],
  [
   8.0,
   1.4
  ],
  [
   12.0,
   1.4
  ],
  [
   16.0,
   1.4
  ],
  [
   20.0,
   1.4
  ],
  [
   29.6,
   2.2
  ],
  [
   30.6,
   2.2
  ],
  [
   39.62,
   3.2
  ],
  [
   40.42,
   3.6
  ],
  [
   48.41,
   2.3
  ],
  [
   58.05,
   1.7
  ],
  [
   66.3,
   2.2
  ],
  [
   85.11,
   -2.2
  ],
  [
   90.11,
   -2.2
  ],
  [
   95.11,
   -2.2
  ],
  [
   100.11,
   -2.2
  ],
  [
   105.11,
   -2.2
  ],
  [
   110.11,
   -2.2
  ],
  [
   115.11,
   -2.2
  ],
  [
   120.11,
   -2.2
  ],
  [
   87.17,
   6.8
  ],
  [
   91.83,
   7.8
  ],
  [
   96.67,
   6.8
  ],
  [
   101.41,
   7.8
  ],
  [
   105.56,
   6.8
  ],
  [
   109.27,
   7.8
  ],
  [
   113.02,
   6.8
  ],
  [
   116.53,
   7.8
  ],
  [
   120.52,
   6.8
  ],
  [
   124.11,
   7.8
  ],
  [
   131.61,
   3.4
  ],
  [
   139.61,
   3.4
  ],
  [
   147.61,
   3.4
  ],
  [
   158.71,
   2.2
  ],
  [
   159.71,
   2.2
  ],
  [
   167.3,
   1.7
  ],
  [
   174.44,
   2.3
  ],
  [
   183.31,
   2.2
  ],
  [
   184.31,
   2.2
  ],
  [
   194.72,
   3.2
  ],
  [
   195.52,
   3.6
  ],
  [
   208.11,
   3.2
  ],
  [
   217.11,
   3.2
  ],
  [
   226.11,
   3.2
  ],
  [
   243.11,
   2.0
  ],
  [
   255.81,
   3.2
  ],
  [
   256.61,
   3.6
  ],
  [
   270.44,
   -2.2
  ],
  [
   275.44,
   -2.2
  ],
  [
   280.44,
   -2.2
  ],
  [
   285.44,
   -2.2
  ],
  [
   290.44,
   -2.2
  ],
  [
   295.44,
   -2.2
  ],
  [
   300.44,
   -2.2
  ],
  [
   271.37,
   6.8
  ],
  [
   274.9,
   7.8
  ],
  [
   279.97,
   6.8
  ],
  [
   284.81,
   7.8
  ],
  [
   290.03,
   6.8
  ],
  [
   295.02,
   7.8
  ],
  [
   300.11,
   6.8
  ],
  [
   304.79,
   7.8
  ],
  [
   322.55,
   0.6
  ],
  [
   332.51,
   2.2
  ],
  [
   339.86,
   2.3
  ],
  [
   347.38,
   2.2
  ],
  [
   348.38,
   2.2
  ],
  [
   353.47,
   2.2
  ],
  [
   353.47,
   3.2
  ],
  [
   363.47,
   5.8
  ],
  [
   371.47,
   8.8
  ],
  [
   384.06,
   10.9
  ],
  [
   411.86,
   1.4
  ],
  [
   415.86,
   1.4
  ],
  [
   419.86,
   1.4
  ],
  [
   423.86,
   1.4
  ],
  [
   435.86,
   2.0
  ],
  [
   447.21,
   2.2
  ],
  [
   466.21,
   2.2
  ],
  [
   492.36,
   2.3
  ],
  [
   501.28,
   2.3
  ],
  [
   512.28,
   3.2
  ],
  [
   513.08,
   3.6
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [
  {
   "art": "lantern",
   "x": 90.21,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 111.01,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 134.61,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 142.61,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 150.61,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 275.54,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 295.24,
   "y": 2.2,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 316.19,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "shrine",
   "x": 459.86,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#ffcf7a"
  }
 ],
 "taunts": [
  "TOO MUCH FIGHTING. NOT ENOUGH RUNNING.",
  "THE CURFEW CAUGHT YOU.",
  "THE STREET NEEDED YOU. YOU WERE LATE.",
  "THE SNAKES ARE TALKING ABOUT THAT ONE.",
  "PRAY FASTER.",
  "THE RAID WENT ON WITHOUT YOU.",
  "THE FIRE PIT IS GETTING COLD.",
  "WE NEED A GHETTO GOSPEL. YOU NEED LEGS."
 ],
 "goal": {
  "x": 524.47,
  "y": 0
 }
};
