/*
  FEELZ RUN - MISSION 11: LETTING OFF STEAM
  A raid on the apartment block. Up the outside pipes, over the laundry lines and valves, and the weekend race home.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m11 = {
 "id": "m11",
 "number": 11,
 "title": "LETTING OFF STEAM",
 "world": "MIDDLE CITY",
 "song": {
  "title": "Letting Off Steam",
  "src": "assets/audio/m11-letting-off-steam.mp3",
  "lyrics": "assets/lyrics/m11-letting-off-steam.txt",
  "seconds": 205.3
 },
 "length": 701.78,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 14.1,
   "checkpoint": {
    "x": 44.15,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "VERSE 1",
   "start": 14.1,
   "end": 42.5,
   "checkpoint": {
    "x": 131.3,
    "y": 10.0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "CHORUS 1",
   "start": 42.5,
   "end": 56.7,
   "checkpoint": {
    "x": 184.29,
    "y": 8.6
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "HOOK",
   "start": 56.7,
   "end": 84.2,
   "checkpoint": {
    "x": 267.29,
    "y": 7.0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "VERSE 2",
   "start": 84.2,
   "end": 110.7,
   "checkpoint": {
    "x": 361.92,
    "y": 8.9
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "HOOK 2",
   "start": 110.7,
   "end": 153.5,
   "checkpoint": {
    "x": 509.08,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "CHORUS 2",
   "start": 153.5,
   "end": 180.0,
   "checkpoint": {
    "x": 601.49,
    "y": 5.6
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "OUTRO",
   "start": 180.0,
   "end": 205.3,
   "checkpoint": {
    "x": 688.28,
    "y": 0
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 137.8,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.07
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE GROUND FLOOR",
   "world": "lc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 87.65,
   "name": "THE OUTSIDE PIPES",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 3.0
  },
  {
   "from": 135.3,
   "name": "LETTING OFF STEAM",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 194.29,
   "name": "LETTING OFF STEAM",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 197.29,
   "name": "THE BOILER FLOOR",
   "world": "lc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 243.29,
   "name": "THE BOILER FLOOR",
   "world": "lc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 3.0
  },
  {
   "from": 271.29,
   "name": "THE LAUNDRY LINES",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 371.92,
   "name": "THE LAUNDRY LINES",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 374.92,
   "name": "THE WEEKEND RACE",
   "world": "lc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 510.58,
   "name": "YOU AND ME AGAINST THE WORLD",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 512.08,
   "name": "YOU AND ME AGAINST THE WORLD",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 611.49,
   "name": "YOU AND ME AGAINST THE WORLD",
   "world": "mc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  },
  {
   "from": 614.49,
   "name": "HOME",
   "world": "lc",
   "backdrop": "m9-loc-03-middle-city-rooftops"
  }
 ],
 "inward": [
  {
   "from": 377.92,
   "to": 447.92,
   "name": "THE WEEKEND RACE",
   "backdrop": "m9-loc-03-middle-city-rooftops",
   "obstacles": [
    [
     7.0,
     1,
     "high"
    ],
    [
     10.2,
     -1,
     "block"
    ],
    [
     16.6,
     "all",
     "low"
    ],
    [
     23.1,
     "all",
     "high"
    ],
    [
     33.1,
     "all",
     "low"
    ],
    [
     42.9,
     1,
     "low"
    ],
    [
     46.1,
     -1,
     "block"
    ],
    [
     52.6,
     "all",
     "low"
    ],
    [
     61.5,
     0,
     "block"
    ],
    [
     61.5,
     1,
     "block"
    ]
   ],
   "records": [
    [
     34.7,
     -1
    ],
    [
     35.6,
     -1
    ],
    [
     36.5,
     -1
    ],
    [
     37.4,
     -1
    ],
    [
     57.5,
     -1
    ],
    [
     58.8,
     -1
    ],
    [
     60.1,
     -1
    ]
   ]
  }
 ],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 282.69,
   "y1": 12.6,
   "x2": 298.79,
   "y2": 12.1
  },
  {
   "x1": 309.69,
   "y1": 12.1,
   "x2": 324.79,
   "y2": 11.5
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
 "valves": [
  {
   "x": 6.0,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": false
  },
  {
   "x": 12.5,
   "y": 0,
   "period": 1.742,
   "offset": 0.87,
   "up": false
  },
  {
   "x": 19.0,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": true
  },
  {
   "x": 51.65,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": false
  },
  {
   "x": 58.15,
   "y": 0,
   "period": 1.742,
   "offset": 0.87,
   "up": false
  },
  {
   "x": 64.65,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": true
  },
  {
   "x": 203.29,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": false
  },
  {
   "x": 209.79,
   "y": 0,
   "period": 1.742,
   "offset": 0.87,
   "up": false
  },
  {
   "x": 216.29,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": true
  },
  {
   "x": 456.92,
   "y": 0,
   "period": 1.742,
   "offset": 0.0,
   "up": false
  },
  {
   "x": 463.42,
   "y": 0,
   "period": 1.742,
   "offset": 0.87,
   "up": false
  }
 ],
 "windows": [
  {
   "x": 15.5,
   "y": 0
  },
  {
   "x": 28.0,
   "y": 0.0
  },
  {
   "x": 61.15,
   "y": 0
  },
  {
   "x": 150.86,
   "y": 9.6
  },
  {
   "x": 212.79,
   "y": 0
  },
  {
   "x": 239.29,
   "y": 0.0
  },
  {
   "x": 466.42,
   "y": 0
  },
  {
   "x": 553.58,
   "y": 6.0
  }
 ],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [
  {
   "who": "FAMILY_MOTHER",
   "x": 48.65,
   "y": 0.0,
   "facing": -1,
   "ghost": true
  },
  {
   "who": "FAMILY_DAUGHTER",
   "x": 199.29,
   "y": 0.0,
   "facing": -1,
   "ghost": true
  },
  {
   "who": "FAMILY_SON_5",
   "x": 452.92,
   "y": 0.0,
   "facing": -1,
   "ghost": true
  },
  {
   "who": "FAMILY_MOTHER",
   "x": 634.49,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "FAMILY_DAUGHTER",
   "x": 636.09,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "FAMILY_SON_5",
   "x": 637.29,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "FAMILY_SON_3",
   "x": 638.09,
   "y": 0.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": false,
 "player": "koda",
 "solids": [
  {
   "kind": "crate",
   "x": 33.5,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 94.15,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 87.65,
   "w": 10,
   "top": 4.0
  },
  {
   "kind": "roof",
   "x": 97.65,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 105.65,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 116.03,
   "w": 9.27,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 127.3,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 137.34,
   "w": 12.02,
   "top": 9.6
  },
  {
   "kind": "vent",
   "x": 143.35,
   "w": 0.9,
   "top": 10.7
  },
  {
   "kind": "roof",
   "x": 149.36,
   "w": 4,
   "top": 9.6
  },
  {
   "kind": "roof",
   "x": 155.66,
   "w": 12.63,
   "top": 9.0
  },
  {
   "kind": "vent",
   "x": 161.97,
   "w": 0.9,
   "top": 10.1
  },
  {
   "kind": "roof",
   "x": 170.61,
   "w": 7.68,
   "top": 8.6
  },
  {
   "kind": "roof",
   "x": 180.29,
   "w": 8,
   "top": 8.6
  },
  {
   "kind": "roof",
   "x": 190.29,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "ground",
   "x": 194.29,
   "w": 49.5,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 243.29,
   "w": 10,
   "top": 4.0
  },
  {
   "kind": "roof",
   "x": 253.29,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 263.29,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 271.29,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 280.29,
   "w": 5,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 297.29,
   "w": 9,
   "top": 9.5
  },
  {
   "kind": "roof",
   "x": 307.29,
   "w": 5,
   "top": 9.5
  },
  {
   "kind": "roof",
   "x": 323.29,
   "w": 9,
   "top": 8.9
  },
  {
   "kind": "roof",
   "x": 334.77,
   "w": 7.52,
   "top": 8.9
  },
  {
   "kind": "roof",
   "x": 344.53,
   "w": 11.39,
   "top": 8.9
  },
  {
   "kind": "vent",
   "x": 350.22,
   "w": 0.9,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 357.92,
   "w": 8,
   "top": 8.9
  },
  {
   "kind": "roof",
   "x": 367.92,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 473.92,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 480.88,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 488.95,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 497.44,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 371.92,
   "w": 140.66,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 512.08,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 524.55,
   "w": 12.81,
   "top": 5.6
  },
  {
   "kind": "vent",
   "x": 530.96,
   "w": 0.9,
   "top": 6.7
  },
  {
   "kind": "roof",
   "x": 539.82,
   "w": 12.26,
   "top": 6.0
  },
  {
   "kind": "vent",
   "x": 545.95,
   "w": 0.9,
   "top": 7.1
  },
  {
   "kind": "roof",
   "x": 552.08,
   "w": 4,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 558.49,
   "w": 10.97,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 571.78,
   "w": 10.33,
   "top": 6.2
  },
  {
   "kind": "vent",
   "x": 576.94,
   "w": 0.9,
   "top": 7.3
  },
  {
   "kind": "roof",
   "x": 584.36,
   "w": 11.13,
   "top": 5.6
  },
  {
   "kind": "vent",
   "x": 589.93,
   "w": 0.9,
   "top": 6.7
  },
  {
   "kind": "roof",
   "x": 597.49,
   "w": 8,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 607.49,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 617.49,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 627.55,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 635.49,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 636.69,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 637.89,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 645.49,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 653.82,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 661.65,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 669.37,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 678.08,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 679.28,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 680.48,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 611.49,
   "w": 86.29,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 87.4,
   "bottom": 0,
   "top": 4.0
  },
  {
   "x": 97.4,
   "bottom": 4.0,
   "top": 7.0
  },
  {
   "x": 105.4,
   "bottom": 7.0,
   "top": 10.0
  },
  {
   "x": 243.04,
   "bottom": 0,
   "top": 4.0
  },
  {
   "x": 253.04,
   "bottom": 4.0,
   "top": 7.0
  },
  {
   "x": 271.04,
   "bottom": 7.0,
   "top": 10.0
  },
  {
   "x": 511.83,
   "bottom": 0,
   "top": 6.0
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 78.15,
   "y": 0.0,
   "minX": 75.65,
   "maxX": 80.65,
   "kind": "warden"
  },
  {
   "x": 229.79,
   "y": 0.0,
   "minX": 227.29,
   "maxX": 232.29,
   "kind": "warden"
  }
 ],
 "drones": [
  {
   "x": 143.35,
   "y": 11.6,
   "minX": 138.34,
   "maxX": 148.36
  },
  {
   "x": 530.96,
   "y": 7.6,
   "minX": 525.55,
   "maxX": 536.36
  },
  {
   "x": 545.95,
   "y": 8.0,
   "minX": 540.82,
   "maxX": 551.08
  }
 ],
 "boosts": [
  {
   "x": 468.92,
   "y": 0.8
  },
  {
   "x": 554.08,
   "y": 6.8
  }
 ],
 "rewinds": [
  {
   "x": 339.29,
   "y": 11.2
  }
 ],
 "coin": {
  "x": 347.95,
  "y": 12.1
 },
 "journal": [{"id":"M11_memory_1","x":156.86,"y":10.5},{"id":"M11_record_1","x":352.49,"y":12.2},{"id":"M11_lyric","x":565.29,"y":8.8}],
 "journalText": {
    "M11_memory_1": {
      "kind": "Memory trace",
      "title": "Four small lights",
      "text": "A child's drawing: four small lights in a starry sky.",
      "image": "assets/journal/M11_memory_1.webp"
    },
    "M11_record_1": {
      "kind": "City record",
      "title": "Rent notice",
      "text": "Rent due to the Circle, in water.",
      "image": "assets/journal/M11_record_1.webp"
    },
    "M11_lyric": {
      "kind": "Lyric fragment",
      "title": "\"You and me against the world\"",
      "text": "Painted in a child's hand across the bunk beds. From \"Letting Off Steam\", track 11.",
      "image": "assets/journal/M11_lyric.webp"
    }
  },
 "notes": [
  [
   4.5,
   1.4
  ],
  [
   11.0,
   1.4
  ],
  [
   17.5,
   1.4
  ],
  [
   34.0,
   2.3
  ],
  [
   50.15,
   1.4
  ],
  [
   56.65,
   1.4
  ],
  [
   63.15,
   1.4
  ],
  [
   78.15,
   2.0
  ],
  [
   86.75,
   2.2
  ],
  [
   86.75,
   3.2
  ],
  [
   96.75,
   5.8
  ],
  [
   104.75,
   8.8
  ],
  [
   117.23,
   11.3
  ],
  [
   121.78,
   13.0
  ],
  [
   122.68,
   13.1
  ],
  [
   138.54,
   10.9
  ],
  [
   143.8,
   11.9
  ],
  [
   156.86,
   10.3
  ],
  [
   163.49,
   12.0
  ],
  [
   164.39,
   12.1
  ],
  [
   162.42,
   11.3
  ],
  [
   171.81,
   9.9
  ],
  [
   201.79,
   1.4
  ],
  [
   208.29,
   1.4
  ],
  [
   214.79,
   1.4
  ],
  [
   229.79,
   2.0
  ],
  [
   242.39,
   2.2
  ],
  [
   242.39,
   3.2
  ],
  [
   252.39,
   5.8
  ],
  [
   270.39,
   8.8
  ],
  [
   285.49,
   11.5
  ],
  [
   288.29,
   11.4
  ],
  [
   291.09,
   11.3
  ],
  [
   293.89,
   11.2
  ],
  [
   312.29,
   10.98
  ],
  [
   314.89,
   10.86
  ],
  [
   317.49,
   10.74
  ],
  [
   320.09,
   10.62
  ],
  [
   335.97,
   10.2
  ],
  [
   345.73,
   10.2
  ],
  [
   351.59,
   11.9
  ],
  [
   352.49,
   12.0
  ],
  [
   350.67,
   11.2
  ],
  [
   455.42,
   1.4
  ],
  [
   461.92,
   1.4
  ],
  [
   474.22,
   1.7
  ],
  [
   481.23,
   2.2
  ],
  [
   489.3,
   2.2
  ],
  [
   497.94,
   2.3
  ],
  [
   511.18,
   3.3
  ],
  [
   511.18,
   4.8
  ],
  [
   525.75,
   6.9
  ],
  [
   531.41,
   7.9
  ],
  [
   541.02,
   7.3
  ],
  [
   546.4,
   8.3
  ],
  [
   559.69,
   6.9
  ],
  [
   565.29,
   8.6
  ],
  [
   566.19,
   8.7
  ],
  [
   572.98,
   7.5
  ],
  [
   577.39,
   8.5
  ],
  [
   585.56,
   6.9
  ],
  [
   590.38,
   7.9
  ],
  [
   617.79,
   1.7
  ],
  [
   627.85,
   1.7
  ],
  [
   637.19,
   3.2
  ],
  [
   637.99,
   3.6
  ],
  [
   646.09,
   2.2
  ],
  [
   647.09,
   2.2
  ],
  [
   654.32,
   2.3
  ],
  [
   662.15,
   2.3
  ],
  [
   669.87,
   2.3
  ],
  [
   679.78,
   3.2
  ],
  [
   680.58,
   3.6
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [
  {
   "art": "laundry",
   "x": 629.49,
   "y": 0.0,
   "h": 2.6,
   "layer": "back"
  }
 ],
 "taunts": [
  "LET OFF STEAM. NOT TIME.",
  "NO KEYS, NO HANDS, NO CHECKPOINT.",
  "THE FAMILY GOT HOME FIRST.",
  "YOU AND ME AGAINST THE WORLD. THE WORLD WON.",
  "THE WEEKEND'S OVER.",
  "THE RAID DIDN'T WAIT FOR YOU.",
  "DRIVE YOURSELF? YOU STALLED.",
  "UNSTOPPABLE, YOU SAID."
 ],
 "goal": {
  "x": 688.28,
  "y": 0
 }
};
