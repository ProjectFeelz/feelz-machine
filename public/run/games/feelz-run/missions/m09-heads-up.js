/*
  FEELZ RUN - MISSION 09: HEAD'S UP
  Zora's warning, then the Veil Hunters. A chase down the corridors, the service shaft and the reservoir.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m09 = {
 "id": "m09",
 "number": 9,
 "title": "HEAD'S UP",
 "world": "THE VEIL",
 "song": {
  "title": "Heads Up",
  "src": "assets/audio/m09-heads-up.mp3",
  "lyrics": "assets/lyrics/m09-heads-up.txt",
  "seconds": 171.4
 },
 "length": 584.44,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 8.5,
   "checkpoint": {
    "x": 27.5,
    "y": 6.6
   },
   "storm": false
  },
  {
   "name": "CHORUS 1",
   "start": 8.5,
   "end": 30.5,
   "checkpoint": {
    "x": 104.91,
    "y": 8.2
   },
   "storm": false,
   "drive": true,
   "shadow": 3.6
  },
  {
   "name": "VERSE 1",
   "start": 30.5,
   "end": 62.3,
   "checkpoint": {
    "x": 214.12,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "BRIDGE",
   "start": 62.3,
   "end": 79.2,
   "checkpoint": {
    "x": 272.12,
    "y": 5.6
   },
   "storm": false,
   "drive": true,
   "shadow": 4.0
  },
  {
   "name": "CHORUS 2",
   "start": 79.2,
   "end": 100.2,
   "checkpoint": {
    "x": 341.35,
    "y": 5.0
   },
   "storm": false,
   "drive": true,
   "shadow": 4.2
  },
  {
   "name": "VERSE 2",
   "start": 100.2,
   "end": 133.0,
   "checkpoint": {
    "x": 454.01,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "CHORUS 3",
   "start": 133.0,
   "end": 155.0,
   "checkpoint": {
    "x": 517.36,
    "y": 0
   },
   "storm": false,
   "drive": true,
   "shadow": 4.6,
   "dogs": 2
  },
  {
   "name": "OUTRO",
   "start": 155.0,
   "end": 171.4,
   "checkpoint": {
    "x": 570.94,
    "y": 0
   },
   "storm": false,
   "drive": true,
   "shadow": 4.6,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 112.4,
 "shelters": [],
 "weather": {
  "rain": 0.08,
  "wind": 0.08
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE COMM TOWER",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 1.5,
   "name": "THE COMM TOWER",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 114.91,
   "name": "THE COMM TOWER",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 117.91,
   "name": "THE WHITE CORRIDOR",
   "world": "ve",
   "backdrop": "m9-loc-02-white-corridor"
  },
  {
   "from": 179.91,
   "name": "DOWN THE SHAFTS",
   "world": "mc",
   "backdrop": "m9-loc-02-white-corridor"
  },
  {
   "from": 215.62,
   "name": "A NOISY MIND",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 217.12,
   "name": "A NOISY MIND",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 351.35,
   "name": "A NOISY MIND",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 354.35,
   "name": "THE RESERVOIR",
   "world": "ve",
   "backdrop": "m9-loc-04-reservoir"
  },
  {
   "from": 455.51,
   "name": "THE PLAZA",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  }
 ],
 "inward": [
  {
   "from": 120.91,
   "to": 176.91,
   "name": "THE WHITE CORRIDOR",
   "backdrop": "m9-loc-02-white-corridor",
   "obstacles": [
    [
     7.0,
     "all",
     "low"
    ],
    [
     12.5,
     1,
     "high"
    ],
    [
     15.7,
     -1,
     "block"
    ],
    [
     18.1,
     -1,
     "block"
    ],
    [
     18.1,
     0,
     "block"
    ],
    [
     24.2,
     "all",
     "low"
    ],
    [
     30.7,
     "all",
     "low"
    ],
    [
     36.7,
     1,
     "low"
    ],
    [
     39.9,
     -1,
     "block"
    ],
    [
     43.1,
     "all",
     "low"
    ],
    [
     48.6,
     -1,
     "block"
    ],
    [
     48.6,
     1,
     "block"
    ]
   ],
   "records": [
    [
     8.6,
     1
    ],
    [
     9.5,
     1
    ],
    [
     10.4,
     1
    ],
    [
     11.3,
     1
    ],
    [
     14.1,
     1
    ],
    [
     15.4,
     1
    ],
    [
     16.7,
     1
    ],
    [
     19.7,
     1
    ],
    [
     20.6,
     1
    ],
    [
     21.5,
     1
    ],
    [
     22.4,
     1
    ],
    [
     25.8,
     0
    ],
    [
     26.7,
     0
    ],
    [
     27.6,
     0
    ],
    [
     28.5,
     0
    ],
    [
     38.3,
     -1
    ],
    [
     39.2,
     -1
    ],
    [
     40.1,
     -1
    ],
    [
     41.0,
     -1
    ],
    [
     44.7,
     0
    ],
    [
     45.6,
     0
    ],
    [
     46.5,
     0
    ],
    [
     47.4,
     0
    ],
    [
     44.6,
     0
    ],
    [
     45.9,
     0
    ],
    [
     47.2,
     0
    ],
    [
     50.2,
     0
    ],
    [
     51.1,
     0
    ],
    [
     52.0,
     0
    ],
    [
     52.9,
     0
    ]
   ]
  }
 ],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 242.52,
   "y1": 9.0,
   "x2": 258.62,
   "y2": 8.2
  }
 ],
 "crowds": [],
 "cages": [],
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
   "who": "ZORA",
   "x": 6.0,
   "y": 0.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": false,
 "player": "koda",
 "solids": [
  {
   "kind": "roof",
   "x": 1.5,
   "w": 10,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 13.6,
   "w": 7.9,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 23.5,
   "w": 8,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 33.62,
   "w": 11.88,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 47.5,
   "w": 14,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 63.84,
   "w": 6,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 71.96,
   "w": 12.48,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 86.47,
   "w": 12.44,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 100.91,
   "w": 8,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 110.91,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "ceiling",
   "x": 182.91,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 186.41,
   "w": 10.95,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "crate",
   "x": 202.36,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 223.62,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 217.12,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 229.58,
   "w": 9.54,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 240.12,
   "w": 5,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 257.12,
   "w": 9,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 268.12,
   "w": 8,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 278.12,
   "w": 22,
   "top": 5.6000000000000005
  },
  {
   "kind": "roof",
   "x": 302.28,
   "w": 9.84,
   "top": 5.2
  },
  {
   "kind": "roof",
   "x": 314.57,
   "w": 12.72,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 329.35,
   "w": 6,
   "top": 5.0
  },
  {
   "kind": "roof",
   "x": 337.35,
   "w": 8,
   "top": 5.0
  },
  {
   "kind": "roof",
   "x": 347.35,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "ceiling",
   "x": 357.35,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 360.85,
   "w": 9.98,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "crate",
   "x": 375.84,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 383.8,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 389.84,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 399.4,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 406.79,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 413.49,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 421.53,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 431.5,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 438.91,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 447.84,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 458.51,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 484.51,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 485.71,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 486.91,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 492.51,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 500.92,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 508.8,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 521.86,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 530.12,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 531.32,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 532.52,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 543.86,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 545.06,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 546.26,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 555.63,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 563.82,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "ground",
   "x": 351.35,
   "w": 229.09,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 1.25,
   "bottom": 0,
   "top": 7.0
  },
  {
   "x": 216.87,
   "bottom": 0,
   "top": 6.0
  }
 ],
 "mud": [
  {
   "x": 373.84,
   "w": 4.0
  },
  {
   "x": 456.51,
   "w": 4.0
  },
  {
   "x": 482.51,
   "w": 4.0
  }
 ],
 "wardens": [
  {
   "x": 53.5,
   "y": 6.6,
   "minX": 51.0,
   "maxX": 56.0,
   "kind": "hunter"
  },
  {
   "x": 284.12,
   "y": 5.6,
   "minX": 281.62,
   "maxX": 286.62,
   "kind": "hunter"
  },
  {
   "x": 292.12,
   "y": 5.6,
   "minX": 289.62,
   "maxX": 294.62,
   "kind": "hunter"
  },
  {
   "x": 473.51,
   "y": 0.0,
   "minX": 471.01,
   "maxX": 476.01,
   "kind": "hunter"
  }
 ],
 "drones": [
  {
   "x": 234.35,
   "y": 8.4,
   "minX": 230.58,
   "maxX": 238.12
  }
 ],
 "boosts": [
  {
   "x": 538.86,
   "y": 0.8
  }
 ],
 "rewinds": [
  {
   "x": 383.84,
   "y": 2.3
  }
 ],
 "coin": {
  "x": 367.34,
  "y": 0.6
 },
 "journal": [{"id":"M09_memory_1","x":95.08,"y":11.5},{"id":"M09_record_1","x":292.12,"y":7.8},{"id":"M09_lyric","x":473.51,"y":2.2}],
 "journalText": {
    "M09_memory_1": {
      "kind": "Memory trace",
      "title": "The carved bracelet",
      "text": "Confiscated by a Veil Hunter. His brother never took it off.",
      "image": "assets/journal/M09_memory_1.webp"
    },
    "M09_record_1": {
      "kind": "City record",
      "title": "Veil Hunter briefing",
      "text": "\"A masked male anomaly, and an unregistered female signal.\"",
      "image": "assets/journal/M09_record_1.webp"
    },
    "M09_lyric": {
      "kind": "Lyric fragment",
      "title": "\"You provide the silence in a noisy mind\"",
      "text": "Etched faintly beside the shattered tile. From \"Heads Up\", track 9.",
      "image": "assets/journal/M09_lyric.webp"
    }
  },
 "notes": [
  [
   0.6,
   3.85
  ],
  [
   0.6,
   5.6
  ],
  [
   14.8,
   7.9
  ],
  [
   34.82,
   7.9
  ],
  [
   53.5,
   8.6
  ],
  [
   65.04,
   8.3
  ],
  [
   73.16,
   9.1
  ],
  [
   87.67,
   9.5
  ],
  [
   94.18,
   11.2
  ],
  [
   95.08,
   11.3
  ],
  [
   191.88,
   0.6
  ],
  [
   202.86,
   2.3
  ],
  [
   216.22,
   3.3
  ],
  [
   216.22,
   4.8
  ],
  [
   230.78,
   7.7
  ],
  [
   245.32,
   7.84
  ],
  [
   248.12,
   7.68
  ],
  [
   250.92,
   7.52
  ],
  [
   253.72,
   7.36
  ],
  [
   284.12,
   7.6
  ],
  [
   292.12,
   7.6
  ],
  [
   303.48,
   6.5
  ],
  [
   315.77,
   5.9
  ],
  [
   322.46,
   7.6
  ],
  [
   323.36,
   7.7
  ],
  [
   330.55,
   6.3
  ],
  [
   365.84,
   0.6
  ],
  [
   376.34,
   2.3
  ],
  [
   384.15,
   2.2
  ],
  [
   390.44,
   2.2
  ],
  [
   391.44,
   2.2
  ],
  [
   399.9,
   2.3
  ],
  [
   407.09,
   1.7
  ],
  [
   413.99,
   2.3
  ],
  [
   422.13,
   2.2
  ],
  [
   423.13,
   2.2
  ],
  [
   431.85,
   2.2
  ],
  [
   439.26,
   2.2
  ],
  [
   448.44,
   2.2
  ],
  [
   449.44,
   2.2
  ],
  [
   459.11,
   2.2
  ],
  [
   460.11,
   2.2
  ],
  [
   473.51,
   2.0
  ],
  [
   486.21,
   3.2
  ],
  [
   487.01,
   3.6
  ],
  [
   492.86,
   2.2
  ],
  [
   501.42,
   2.3
  ],
  [
   509.15,
   2.2
  ],
  [
   522.16,
   1.7
  ],
  [
   531.82,
   3.2
  ],
  [
   532.62,
   3.6
  ],
  [
   545.56,
   3.2
  ],
  [
   546.36,
   3.6
  ],
  [
   555.98,
   2.2
  ],
  [
   564.12,
   1.7
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [
  {
   "art": "lantern",
   "x": 184.66,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 359.1,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  }
 ],
 "taunts": [
  "HEADS UP. YOU WEREN'T.",
  "SHE WARNED YOU.",
  "THE HUNTERS ARE NOT IMPRESSED.",
  "CONSISTENCY. LOOK IT UP.",
  "YOU AND I SHOULD STAY FOREVER. NOT HERE.",
  "A NOISY MIND. A SLOW RUN.",
  "THE RESERVOIR SWALLOWED THAT ONE.",
  "DON'T GO THERE NO MORE."
 ],
 "goal": {
  "x": 570.94,
  "y": 0
 }
};
