/*
  FEELZ RUN - MISSION 14: SHINE OLIVE GEM
  Across the golden spires of the Circle's houses, past the watchers and the gilded sentinels, to reach Koda.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m14 = {
 "id": "m14",
 "number": 14,
 "title": "SHINE OLIVE GEM",
 "world": "UPPER CITY",
 "song": {
  "title": "Shine Olive Gem",
  "src": "assets/audio/m14-shine-olive-gem.mp3",
  "lyrics": "assets/lyrics/m14-shine-olive-gem.txt",
  "seconds": 157.6
 },
 "length": 577.86,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 21.1,
   "checkpoint": {
    "x": 75.9,
    "y": 8.3
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 21.1,
   "end": 41.5,
   "checkpoint": {
    "x": 153.3,
    "y": 6.5
   },
   "storm": false
  },
  {
   "name": "VERSE 2",
   "start": 41.5,
   "end": 65.1,
   "checkpoint": {
    "x": 240.93,
    "y": 12.0
   },
   "storm": false
  },
  {
   "name": "CHORUS 1",
   "start": 65.1,
   "end": 114.9,
   "checkpoint": {
    "x": 412.24,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "CHORUS 2",
   "start": 114.9,
   "end": 139.3,
   "checkpoint": {
    "x": 493.24,
    "y": 8.2
   },
   "storm": false,
   "shadow": 3.8
  },
  {
   "name": "OUTRO",
   "start": 139.3,
   "end": 157.6,
   "checkpoint": {
    "x": 559.86,
    "y": 7.4
   },
   "storm": false,
   "shadow": 4.0,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 112.3,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.06
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "HER SIDE",
   "world": "rc",
   "backdrop": "m14-loc-01-rose-terraces"
  },
  {
   "from": 17.5,
   "name": "HER SIDE",
   "world": "rc",
   "backdrop": "m14-loc-01-rose-terraces",
   "fallBelow": 5.0
  },
  {
   "from": 79.9,
   "name": "THE BUTTERFLY GARDENS",
   "world": "rc",
   "backdrop": "m14-loc-02-butterfly-gardens",
   "fallBelow": 5.5
  },
  {
   "from": 157.3,
   "name": "THE GOLDEN SPIRES",
   "world": "uc",
   "backdrop": "m14-loc-03-golden-spires",
   "fallBelow": 2.0
  },
  {
   "from": 250.93,
   "name": "THE GOLDEN SPIRES",
   "world": "uc",
   "backdrop": "m14-loc-03-golden-spires"
  },
  {
   "from": 253.93,
   "name": "THE WAVE RUN",
   "world": "rc",
   "backdrop": "m14-loc-04-restored-city-elevation"
  },
  {
   "from": 413.74,
   "name": "LIKE THE STARS IN THE EVENING",
   "world": "ve",
   "backdrop": "m14-loc-03-golden-spires"
  },
  {
   "from": 415.24,
   "name": "LIKE THE STARS IN THE EVENING",
   "world": "ve",
   "backdrop": "m14-loc-03-golden-spires",
   "fallBelow": 5.0
  },
  {
   "from": 497.24,
   "name": "REACHING KODA",
   "world": "rc",
   "backdrop": "m14-loc-01-rose-terraces",
   "fallBelow": 6.0
  }
 ],
 "inward": [
  {
   "from": 256.93,
   "to": 326.93,
   "name": "THE WAVE RUN",
   "backdrop": "m14-loc-04-restored-city-elevation",
   "obstacles": [
    [
     7.0,
     "all",
     "low"
    ],
    [
     16.5,
     "all",
     "low"
    ],
    [
     23.3,
     "all",
     "low"
    ],
    [
     32.3,
     -1,
     "low"
    ],
    [
     35.5,
     1,
     "block"
    ],
    [
     41.0,
     "all",
     "low"
    ],
    [
     47.7,
     "all",
     "high"
    ],
    [
     56.6,
     "all",
     "low"
    ],
    [
     63.7,
     -1,
     "block"
    ],
    [
     63.7,
     0,
     "block"
    ]
   ],
   "records": [
    [
     8.6,
     0
    ],
    [
     9.5,
     0
    ],
    [
     10.4,
     0
    ],
    [
     11.3,
     0
    ],
    [
     18.1,
     -1
    ],
    [
     19.0,
     -1
    ],
    [
     19.9,
     -1
    ],
    [
     20.8,
     -1
    ],
    [
     33.9,
     1
    ],
    [
     34.8,
     1
    ],
    [
     35.7,
     1
    ],
    [
     36.6,
     1
    ],
    [
     49.3,
     -1
    ],
    [
     50.2,
     -1
    ],
    [
     51.1,
     -1
    ],
    [
     52.0,
     -1
    ],
    [
     58.2,
     -1
    ],
    [
     59.1,
     -1
    ],
    [
     60.0,
     -1
    ],
    [
     60.9,
     -1
    ],
    [
     59.7,
     1
    ],
    [
     61.0,
     1
    ],
    [
     62.3,
     1
    ]
   ]
  }
 ],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 121.7,
   "y1": 10.1,
   "x2": 139.8,
   "y2": 9.1
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
 "broken": [
  {
   "x": 33.1,
   "w": 3.6,
   "y": 7.0
  },
  {
   "x": 97.5,
   "w": 3.6,
   "y": 7.5
  },
  {
   "x": 106.7,
   "w": 3.6,
   "y": 7.5
  },
  {
   "x": 178.9,
   "w": 3.6,
   "y": 7.5
  },
  {
   "x": 188.1,
   "w": 3.6,
   "y": 8.5
  },
  {
   "x": 430.84,
   "w": 3.6,
   "y": 7.0
  },
  {
   "x": 440.04,
   "w": 3.6,
   "y": 8.0
  },
  {
   "x": 449.24,
   "w": 3.6,
   "y": 9.0
  },
  {
   "x": 466.44,
   "w": 3.6,
   "y": 8.2
  },
  {
   "x": 475.64,
   "w": 3.6,
   "y": 8.2
  },
  {
   "x": 502.84,
   "w": 3.6,
   "y": 8.2
  }
 ],
 "npcs": [
  {
   "who": "KODA",
   "x": 536.49,
   "y": 7.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": false,
 "player": "zora",
 "solids": [
  {
   "kind": "crate",
   "x": 3.0,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 24.0,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 17.5,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 28.5,
   "w": 3.6,
   "top": 6.5
  },
  {
   "kind": "catwalk",
   "x": 37.7,
   "w": 3.6,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 42.3,
   "w": 7,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 51.35,
   "w": 10.33,
   "top": 8.3
  },
  {
   "kind": "roof",
   "x": 63.9,
   "w": 6,
   "top": 8.3
  },
  {
   "kind": "roof",
   "x": 71.9,
   "w": 8,
   "top": 8.3
  },
  {
   "kind": "roof",
   "x": 82.08,
   "w": 9.83,
   "top": 8.3
  },
  {
   "kind": "catwalk",
   "x": 92.9,
   "w": 3.6,
   "top": 7.9
  },
  {
   "kind": "catwalk",
   "x": 102.1,
   "w": 3.6,
   "top": 7.9
  },
  {
   "kind": "roof",
   "x": 111.3,
   "w": 7,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 119.3,
   "w": 5,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 138.3,
   "w": 9,
   "top": 6.5
  },
  {
   "kind": "roof",
   "x": 149.3,
   "w": 8,
   "top": 6.5
  },
  {
   "kind": "roof",
   "x": 159.3,
   "w": 14,
   "top": 6.5
  },
  {
   "kind": "catwalk",
   "x": 174.3,
   "w": 3.6,
   "top": 7.0
  },
  {
   "kind": "catwalk",
   "x": 183.5,
   "w": 3.6,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 192.7,
   "w": 3.6,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 197.3,
   "w": 7,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 204.3,
   "w": 8,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 214.31,
   "w": 12.48,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 228.93,
   "w": 6,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 236.93,
   "w": 8,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 246.93,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 346.93,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 348.13,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 349.33,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 360.93,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 367.49,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 368.69,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 369.89,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 379.46,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 389.04,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 396.22,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 404.8,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "ground",
   "x": 250.93,
   "w": 164.81,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 415.24,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 426.24,
   "w": 3.6,
   "top": 6.5
  },
  {
   "kind": "catwalk",
   "x": 435.44,
   "w": 3.6,
   "top": 7.5
  },
  {
   "kind": "catwalk",
   "x": 444.64,
   "w": 3.6,
   "top": 8.5
  },
  {
   "kind": "roof",
   "x": 453.84,
   "w": 7,
   "top": 9.0
  },
  {
   "kind": "catwalk",
   "x": 461.84,
   "w": 3.6,
   "top": 8.6
  },
  {
   "kind": "catwalk",
   "x": 471.04,
   "w": 3.6,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 480.24,
   "w": 7,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 489.24,
   "w": 8,
   "top": 8.2
  },
  {
   "kind": "catwalk",
   "x": 498.24,
   "w": 3.6,
   "top": 8.6
  },
  {
   "kind": "catwalk",
   "x": 507.44,
   "w": 3.6,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 512.04,
   "w": 7,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 521.28,
   "w": 11.08,
   "top": 7.4
  },
  {
   "kind": "vent",
   "x": 526.82,
   "w": 0.9,
   "top": 8.5
  },
  {
   "kind": "roof",
   "x": 534.49,
   "w": 6,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 542.79,
   "w": 11.08,
   "top": 7.4
  },
  {
   "kind": "vent",
   "x": 548.32,
   "w": 0.9,
   "top": 8.5
  },
  {
   "kind": "roof",
   "x": 555.86,
   "w": 8,
   "top": 7.4
  },
  {
   "kind": "roof",
   "x": 563.86,
   "w": 10,
   "top": 7.4
  }
 ],
 "climbs": [
  {
   "x": 17.25,
   "bottom": 0,
   "top": 6.0
  },
  {
   "x": 204.05,
   "bottom": 9.0,
   "top": 12.0
  },
  {
   "x": 414.99,
   "bottom": 0,
   "top": 6.0
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 165.3,
   "y": 6.5,
   "minX": 162.8,
   "maxX": 167.8,
   "kind": "gilded"
  },
  {
   "x": 335.93,
   "y": 0.0,
   "minX": 333.43,
   "maxX": 338.43,
   "kind": "gilded"
  }
 ],
 "drones": [
  {
   "x": 86.99,
   "y": 10.3,
   "minX": 83.08,
   "maxX": 90.9
  }
 ],
 "boosts": [
  {
   "x": 458.84,
   "y": 9.8
  }
 ],
 "rewinds": [
  {
   "x": 340.93,
   "y": 2.3
  }
 ],
 "coin": {
  "x": 230.73,
  "y": 15.2
 },
 "journal": [{"id":"M14_memory_1","x":124.9,"y":9.1},{"id":"M14_record_1","x":335.93,"y":2.2},{"id":"M14_lyric","x":463.64,"y":10.1}],
 "journalText": {
    "M14_memory_1": {
      "kind": "Memory trace",
      "title": "The other half",
      "text": "The other half of the cracked mirror.",
      "image": "assets/journal/M14_memory_1.webp"
    },
    "M14_record_1": {
      "kind": "City record",
      "title": "Veil maintenance",
      "text": "Suppression levels by layer.",
      "image": "assets/journal/M14_record_1.webp"
    },
    "M14_lyric": {
      "kind": "Lyric fragment",
      "title": "\"Diamonds don't break\"",
      "text": "Carved into a golden spire. From \"Shine Olive Gem\", track 14.",
      "image": "assets/journal/M14_lyric.webp"
    }
  },
 "notes": [
  [
   3.5,
   2.3
  ],
  [
   16.6,
   3.3
  ],
  [
   16.6,
   4.8
  ],
  [
   30.3,
   7.8
  ],
  [
   34.9,
   8.3
  ],
  [
   39.5,
   8.8
  ],
  [
   52.55,
   9.6
  ],
  [
   65.1,
   9.6
  ],
  [
   83.28,
   9.6
  ],
  [
   88.17,
   11.3
  ],
  [
   89.07,
   11.4
  ],
  [
   94.7,
   9.2
  ],
  [
   99.3,
   8.8
  ],
  [
   103.9,
   9.2
  ],
  [
   108.5,
   8.8
  ],
  [
   124.9,
   8.9
  ],
  [
   128.1,
   8.7
  ],
  [
   131.3,
   8.5
  ],
  [
   134.5,
   8.3
  ],
  [
   165.3,
   8.5
  ],
  [
   176.1,
   8.3
  ],
  [
   180.7,
   8.8
  ],
  [
   185.3,
   9.3
  ],
  [
   189.9,
   9.8
  ],
  [
   194.5,
   10.3
  ],
  [
   203.4,
   10.8
  ],
  [
   215.51,
   13.3
  ],
  [
   222.05,
   15.0
  ],
  [
   222.95,
   15.1
  ],
  [
   230.13,
   13.3
  ],
  [
   335.93,
   2.0
  ],
  [
   348.63,
   3.2
  ],
  [
   349.43,
   3.6
  ],
  [
   361.23,
   1.7
  ],
  [
   369.19,
   3.2
  ],
  [
   369.99,
   3.6
  ],
  [
   379.81,
   2.2
  ],
  [
   389.39,
   2.2
  ],
  [
   396.52,
   1.7
  ],
  [
   405.1,
   1.7
  ],
  [
   414.34,
   3.3
  ],
  [
   414.34,
   4.8
  ],
  [
   428.04,
   7.8
  ],
  [
   432.64,
   8.3
  ],
  [
   437.24,
   8.8
  ],
  [
   441.84,
   9.3
  ],
  [
   446.44,
   9.8
  ],
  [
   451.04,
   10.3
  ],
  [
   463.64,
   9.9
  ],
  [
   468.24,
   9.5
  ],
  [
   472.84,
   9.1
  ],
  [
   477.44,
   9.5
  ],
  [
   500.04,
   9.9
  ],
  [
   504.64,
   9.5
  ],
  [
   509.24,
   9.1
  ],
  [
   522.48,
   8.7
  ],
  [
   528.15,
   10.4
  ],
  [
   529.05,
   10.5
  ],
  [
   527.27,
   9.7
  ],
  [
   535.69,
   8.3
  ],
  [
   543.99,
   8.7
  ],
  [
   548.77,
   9.7
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "SHINE. THEN RUN.",
  "DIAMONDS DON'T BREAK. RUNS DO.",
  "THEY CAN'T HOLD YOU BACK. YOU HELD YOURSELF BACK.",
  "THE WATCHERS SAW THAT.",
  "LET THEM SEE YOUR SOUL SHINE. NOT YOUR STUMBLE.",
  "ROYAL, BUT LATE."
 ],
 "goal": {
  "x": 559.86,
  "y": 7.4
 }
};
