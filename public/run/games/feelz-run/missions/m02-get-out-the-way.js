/*
  FEELZ RUN - MISSION 02: GET OUT THE WAY
  Late for work and out of patience: Koda pushes through the crossings, the vents and the checkpoint guards.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m02 = {
 "id": "m02",
 "number": 2,
 "title": "GET OUT THE WAY",
 "world": "LOWER CITY",
 "song": {
  "title": "Get Out The Way",
  "src": "assets/audio/m02-get-out-the-way.mp3",
  "lyrics": "assets/lyrics/m02-get-out-the-way.txt",
  "seconds": 151.4
 },
 "length": 553.57,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 12.2,
   "checkpoint": {
    "x": 37.59,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 12.2,
   "end": 39.4,
   "checkpoint": {
    "x": 128.43,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "CHORUS 1",
   "start": 39.4,
   "end": 54.2,
   "checkpoint": {
    "x": 176.49,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "VERSE 2",
   "start": 54.2,
   "end": 80.7,
   "checkpoint": {
    "x": 264.92,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "BRIDGE",
   "start": 80.7,
   "end": 93.4,
   "checkpoint": {
    "x": 325.12,
    "y": 5.2
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "VERSE 3",
   "start": 93.4,
   "end": 106.5,
   "checkpoint": {
    "x": 384.74,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "CHORUS 2",
   "start": 106.5,
   "end": 120.0,
   "checkpoint": {
    "x": 434.74,
    "y": 0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "OUTRO",
   "start": 120.0,
   "end": 151.4,
   "checkpoint": {
    "x": 540.07,
    "y": 0
   },
   "storm": false,
   "drive": true,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 71.3,
 "shelters": [],
 "weather": {
  "rain": 0.05,
  "wind": 0.07
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE HOSTEL STEPS",
   "world": "lc",
   "backdrop": "m2-loc-02-street-crossing"
  },
  {
   "from": 39.09,
   "name": "THE STREET CROSSING",
   "world": "lc",
   "backdrop": "m2-loc-02-street-crossing"
  },
  {
   "from": 129.93,
   "name": "THE CHECKPOINT QUEUE",
   "world": "lc",
   "backdrop": "m2-loc-04-checkpoint-vent"
  },
  {
   "from": 177.99,
   "name": "THE DUCTS",
   "world": "lc",
   "backdrop": "m2-loc-04-checkpoint-vent"
  },
  {
   "from": 267.92,
   "name": "THE CANYON CATWALK",
   "world": "mc",
   "backdrop": "m2-loc-04-checkpoint-vent",
   "fallBelow": 5.0
  },
  {
   "from": 277.92,
   "name": "THE CANYON CATWALK",
   "world": "mc",
   "backdrop": "m2-loc-06-canyon-catwalk",
   "fallBelow": 2.0
  },
  {
   "from": 335.12,
   "name": "THE CANYON CATWALK",
   "world": "mc",
   "backdrop": "m2-loc-06-canyon-catwalk"
  },
  {
   "from": 338.12,
   "name": "THE TRAIN",
   "world": "mc",
   "backdrop": "m2-loc-07-train-walkway"
  },
  {
   "from": 386.24,
   "name": "THE LAYER GATE",
   "world": "lc",
   "backdrop": "m2-loc-04-checkpoint-vent"
  },
  {
   "from": 436.24,
   "name": "THE MINES ROAD",
   "world": "mc",
   "backdrop": "m2-loc-07-train-walkway"
  }
 ],
 "inward": [
  {
   "from": 42.09,
   "to": 82.09,
   "name": "THE CROSSING",
   "backdrop": "m2-loc-02-street-crossing",
   "obstacles": [
    [
     7.0,
     "all",
     "low"
    ],
    [
     15.0,
     -1,
     "high"
    ],
    [
     18.2,
     1,
     "block"
    ],
    [
     23.7,
     -1,
     "block"
    ],
    [
     23.7,
     0,
     "block"
    ],
    [
     33.2,
     "all",
     "high"
    ]
   ],
   "records": [
    [
     8.6,
     -1
    ],
    [
     9.5,
     -1
    ],
    [
     10.4,
     -1
    ],
    [
     11.3,
     -1
    ],
    [
     16.6,
     0
    ],
    [
     17.5,
     0
    ],
    [
     18.4,
     0
    ],
    [
     19.3,
     0
    ],
    [
     19.7,
     1
    ],
    [
     21.0,
     1
    ],
    [
     22.3,
     1
    ],
    [
     34.8,
     0
    ],
    [
     35.7,
     0
    ],
    [
     36.6,
     0
    ],
    [
     37.5,
     0
    ]
   ]
  }
 ],
 "tunnels": [
  {
   "x": 130.93,
   "w": 31.6,
   "top": -0.6,
   "bottom": -3.0
  }
 ],
 "ziplines": [
  {
   "x1": 295.51,
   "y1": 8.8,
   "x2": 311.62,
   "y2": 7.8
  }
 ],
 "crowds": [
  {
   "x": 12.0,
   "w": 12,
   "y": 0
  },
  {
   "x": 87.09,
   "w": 16,
   "y": 0
  },
  {
   "x": 131.93,
   "w": 14,
   "y": 0,
   "queue": true
  },
  {
   "x": 406.24,
   "w": 8,
   "y": 0,
   "queue": true
  }
 ],
 "cages": [],
 "scanners": [
  {
   "x": 150.93,
   "y": 0,
   "h": 3.4,
   "period": 6.732,
   "on": 0.5
  },
  {
   "x": 419.24,
   "y": 0,
   "h": 3.4,
   "period": 6.732,
   "on": 0.5
  }
 ],
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
   "who": "NEIGHBOUR_3_MAN",
   "x": 20.0,
   "y": 0.0,
   "facing": 1
  }
 ],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "barrel",
   "x": 3.0,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 29.0,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 108.09,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 109.29,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 110.49,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 119.46,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "turnstile",
   "x": 146.93,
   "w": 0.35,
   "top": 1.05
  },
  {
   "kind": "turnstile",
   "x": 148.33,
   "w": 0.35,
   "top": 1.05
  },
  {
   "kind": "booth",
   "x": 153.93,
   "w": 3.6,
   "top": 2.7
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 136.93,
   "top": 0
  },
  {
   "kind": "grate",
   "x": 130.93,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 132.53,
   "w": 28.4,
   "top": 0,
   "bottom": -0.6
  },
  {
   "kind": "grate",
   "x": 160.93,
   "w": 1.6,
   "top": 0,
   "bottom": -0.3,
   "oneWay": true
  },
  {
   "kind": "ground",
   "x": 130.33,
   "w": 32.8,
   "top": -3.0,
   "bottom": -6.0
  },
  {
   "kind": "vent",
   "x": 135.93,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 142.43,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 148.93,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "vent",
   "x": 155.43,
   "w": 0.9,
   "top": -2.1,
   "bottom": -3.0
  },
  {
   "kind": "crate",
   "x": 167.93,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "ceiling",
   "x": 180.99,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 184.49,
   "w": 11.62,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 196.11,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 199.61,
   "w": 10.48,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "cart",
   "x": 215.09,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 226.08,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 235.69,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 244.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 250.54,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 260.28,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 162.53,
   "w": 105.89,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 267.92,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 280.12,
   "w": 12,
   "top": 6.2
  },
  {
   "kind": "overhang",
   "x": 285.12,
   "w": 2.6,
   "bottom": 7.65,
   "top": 9.35,
   "art": "sign"
  },
  {
   "kind": "roof",
   "x": 293.12,
   "w": 5,
   "top": 6.2
  },
  {
   "kind": "roof",
   "x": 310.12,
   "w": 9,
   "top": 5.2
  },
  {
   "kind": "roof",
   "x": 321.12,
   "w": 8,
   "top": 5.2
  },
  {
   "kind": "roof",
   "x": 331.12,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "carriage",
   "x": 340.12,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 0
  },
  {
   "kind": "carriage",
   "x": 350.75,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 1
  },
  {
   "kind": "overhang",
   "x": 354.75,
   "w": 0.6,
   "bottom": 4.7,
   "top": 7.8
  },
  {
   "kind": "carriage",
   "x": 361.3,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 2
  },
  {
   "kind": "carriage",
   "x": 371.83,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 3
  },
  {
   "kind": "overhang",
   "x": 375.83,
   "w": 0.6,
   "bottom": 4.7,
   "top": 7.8
  },
  {
   "kind": "gate",
   "x": 391.24,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 3.366,
    "open": 0.45,
    "offset": 0.8
   }
  },
  {
   "kind": "gate",
   "x": 400.24,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 3.366,
    "open": 0.45,
    "offset": 3.01
   }
  },
  {
   "kind": "turnstile",
   "x": 415.24,
   "w": 0.35,
   "top": 1.05
  },
  {
   "kind": "turnstile",
   "x": 416.64,
   "w": 0.35,
   "top": 1.05
  },
  {
   "kind": "booth",
   "x": 422.24,
   "w": 3.6,
   "top": 2.7
  },
  {
   "kind": "carriage",
   "x": 438.24,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 0
  },
  {
   "kind": "carriage",
   "x": 448.62,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 1
  },
  {
   "kind": "overhang",
   "x": 452.62,
   "w": 0.6,
   "bottom": 4.7,
   "top": 7.8
  },
  {
   "kind": "carriage",
   "x": 458.97,
   "w": 8.5,
   "top": 3.3,
   "bottom": 0.45,
   "car": 2
  },
  {
   "kind": "barrel",
   "x": 473.34,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 487.23,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 493.34,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 503.38,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 511.25,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 519.29,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 526.46,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 335.12,
   "w": 214.46,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 161.73,
   "bottom": -3.0,
   "top": 0
  },
  {
   "x": 267.67,
   "bottom": 0,
   "top": 6.0
  },
  {
   "x": 339.92,
   "bottom": 0,
   "top": 3.3
  },
  {
   "x": 438.04,
   "bottom": 0,
   "top": 3.3
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 152.73,
   "y": 0,
   "minX": 152.73,
   "maxX": 152.73,
   "kind": "guard",
   "still": true,
   "facing": -1
  },
  {
   "x": 159.43,
   "y": 0,
   "minX": 159.43,
   "maxX": 159.43,
   "kind": "guard",
   "still": true,
   "facing": 1
  },
  {
   "x": 421.04,
   "y": 0,
   "minX": 421.04,
   "maxX": 421.04,
   "kind": "guard",
   "still": true,
   "facing": -1
  }
 ],
 "drones": [
  {
   "x": 344.37,
   "y": 5.5,
   "minX": 341.12,
   "maxX": 347.62
  }
 ],
 "boosts": [
  {
   "x": 468.34,
   "y": 0.8
  }
 ],
 "rewinds": [],
 "coin": {
  "x": 206.35,
  "y": 0.6
 },
 "journal": [{"id":"M02_memory_1","x":119.96,"y":2.5},{"id":"M02_record_1","x":286.42,"y":6.9},{"id":"M02_lyric","x":442.49,"y":5.9}],
 "journalText": {
    "M02_memory_1": {
      "kind": "Memory trace",
      "title": "Initials on a bunk",
      "text": "Two letters carved deep into the hostel bunk frame. One of them is his brother's.",
      "image": "assets/journal/M02_memory_1.webp"
    },
    "M02_record_1": {
      "kind": "City record",
      "title": "Checkpoint rules",
      "text": "Movement between layers requires a pass of sufficient rank. Unregistered workers will be returned.",
      "image": "assets/journal/M02_record_1.webp"
    },
    "M02_lyric": {
      "kind": "Lyric fragment",
      "title": "\"I got an assignment, got limited time\"",
      "text": "Written on Koda's work order, in his own hand. From \"Get Out The Way\", track 2.",
      "image": "assets/journal/M02_lyric.webp"
    }
  },
 "notes": [
  [
   3.35,
   2.2
  ],
  [
   14.0,
   1.4
  ],
  [
   18.0,
   1.4
  ],
  [
   22.0,
   1.4
  ],
  [
   29.35,
   2.2
  ],
  [
   89.09,
   1.4
  ],
  [
   93.09,
   1.4
  ],
  [
   97.09,
   1.4
  ],
  [
   101.09,
   1.4
  ],
  [
   109.79,
   3.2
  ],
  [
   110.59,
   3.6
  ],
  [
   119.96,
   2.3
  ],
  [
   147.63,
   2.4
  ],
  [
   155.73,
   3.9
  ],
  [
   138.43,
   -2.2
  ],
  [
   144.93,
   -2.2
  ],
  [
   151.43,
   -2.2
  ],
  [
   157.93,
   -2.2
  ],
  [
   168.23,
   1.7
  ],
  [
   190.3,
   0.6
  ],
  [
   204.85,
   0.6
  ],
  [
   215.69,
   2.2
  ],
  [
   216.69,
   2.2
  ],
  [
   226.58,
   2.3
  ],
  [
   236.29,
   2.2
  ],
  [
   237.29,
   2.2
  ],
  [
   244.3,
   1.7
  ],
  [
   251.04,
   2.3
  ],
  [
   260.88,
   2.2
  ],
  [
   261.88,
   2.2
  ],
  [
   267.02,
   3.3
  ],
  [
   267.02,
   4.8
  ],
  [
   286.42,
   6.7
  ],
  [
   298.31,
   7.6
  ],
  [
   301.12,
   7.4
  ],
  [
   303.91,
   7.2
  ],
  [
   306.71,
   7.0
  ],
  [
   342.12,
   4.5
  ],
  [
   346.12,
   4.5
  ],
  [
   352.75,
   4.5
  ],
  [
   356.75,
   4.5
  ],
  [
   363.3,
   4.5
  ],
  [
   367.3,
   4.5
  ],
  [
   373.83,
   4.5
  ],
  [
   377.83,
   4.5
  ],
  [
   392.74,
   1.0
  ],
  [
   401.74,
   1.0
  ],
  [
   415.94,
   2.4
  ],
  [
   424.04,
   3.9
  ],
  [
   440.24,
   4.5
  ],
  [
   444.24,
   4.5
  ],
  [
   450.62,
   4.5
  ],
  [
   454.62,
   4.5
  ],
  [
   460.97,
   4.5
  ],
  [
   464.97,
   4.5
  ],
  [
   473.69,
   2.2
  ],
  [
   487.73,
   2.3
  ],
  [
   493.94,
   2.2
  ],
  [
   494.94,
   2.2
  ],
  [
   503.73,
   2.2
  ],
  [
   511.75,
   2.3
  ],
  [
   519.64,
   2.2
  ],
  [
   526.96,
   2.3
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [
  {
   "art": "lantern",
   "x": 182.74,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 197.86,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  }
 ],
 "taunts": [
  "GET OUT THE WAY? YOU WERE THE WAY.",
  "LATE. AGAIN.",
  "THE SHIFT STARTED WITHOUT YOU.",
  "YOU SAID YOU WERE IN A RUSH.",
  "THE GUARDS DIDN'T EVEN HAVE TO TRY.",
  "DON'T TEST MY PATIENCE. YOU JUST DID.",
  "ALL THIS TIME AND STILL NOT THERE.",
  "THE CROWD MOVED FASTER THAN YOU.",
  "PUSH, KODA. PUSH."
 ],
 "goal": {
  "x": 540.07,
  "y": 0
 }
};
