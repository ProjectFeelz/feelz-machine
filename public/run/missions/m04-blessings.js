/*
  FEELZ RUN - MISSION 04: BLESSINGS
  From the docks to the Upper City: cranes, ziplines and a tower climb, all the way to the stars.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m04 = {
 "id": "m04",
 "number": 4,
 "title": "BLESSINGS",
 "world": "MIDDLE CITY",
 "song": {
  "title": "Blessings",
  "src": "assets/audio/m04-blessings.mp3",
  "lyrics": "assets/lyrics/m04-blessings.txt",
  "seconds": 176.8
 },
 "length": 651.45,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 9.7,
   "checkpoint": {
    "x": 28.96,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "HOOK",
   "start": 9.7,
   "end": 30.7,
   "checkpoint": {
    "x": 98.41,
    "y": 0
   },
   "storm": false,
   "dogs": 2
  },
  {
   "name": "VERSE 1",
   "start": 30.7,
   "end": 73.5,
   "checkpoint": {
    "x": 263.62,
    "y": 4.6
   },
   "storm": false
  },
  {
   "name": "HOOK 2",
   "start": 73.5,
   "end": 102.1,
   "checkpoint": {
    "x": 366.28,
    "y": 4.6
   },
   "storm": false
  },
  {
   "name": "BRIDGE",
   "start": 102.1,
   "end": 110.9,
   "checkpoint": {
    "x": 400.28,
    "y": 13.6
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "VERSE 2",
   "start": 110.9,
   "end": 139.6,
   "checkpoint": {
    "x": 503.3,
    "y": 18.6
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "OUTRO",
   "start": 139.6,
   "end": 176.8,
   "checkpoint": {
    "x": 633.45,
    "y": 21.4
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 113.6,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.1
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE LOADING DOCKS",
   "world": "lc",
   "backdrop": "m4-loc-01-loading-docks"
  },
  {
   "from": 99.91,
   "name": "THE TRANSIT HUB",
   "world": "mc",
   "backdrop": "m4-loc-02-transit-hub"
  },
  {
   "from": 181.61,
   "name": "THE CRANES",
   "world": "mc",
   "backdrop": "m4-loc-02-transit-hub",
   "fallBelow": 3.6
  },
  {
   "from": 370.28,
   "name": "THE TOWER",
   "world": "uc",
   "backdrop": "m4-loc-03-tall-tower-exterior",
   "fallBelow": 6.6
  },
  {
   "from": 420.28,
   "name": "THE PROMENADE",
   "world": "uc",
   "backdrop": "m4-loc-04-upper-city-promenade",
   "fallBelow": 17.6
  },
  {
   "from": 507.3,
   "name": "THE SKY DECK",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops",
   "fallBelow": 20.4
  }
 ],
 "inward": [
  {
   "from": 102.91,
   "to": 146.91,
   "name": "THE TRANSIT HUB",
   "backdrop": "m4-loc-02-transit-hub",
   "obstacles": [
    [
     7.0,
     "all",
     "high"
    ],
    [
     15.4,
     "all",
     "low"
    ],
    [
     25.1,
     0,
     "block"
    ],
    [
     25.1,
     1,
     "block"
    ],
    [
     33.1,
     "all",
     "high"
    ]
   ],
   "records": [
    [
     21.1,
     -1
    ],
    [
     22.4,
     -1
    ],
    [
     23.7,
     -1
    ],
    [
     26.7,
     -1
    ],
    [
     27.6,
     -1
    ],
    [
     28.5,
     -1
    ],
    [
     29.4,
     -1
    ],
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
    ]
   ]
  }
 ],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 195.01,
   "y1": 9.1,
   "x2": 211.11,
   "y2": 7.6
  },
  {
   "x1": 222.01,
   "y1": 7.6,
   "x2": 240.11,
   "y2": 7.2
  },
  {
   "x1": 271.01,
   "y1": 7.2,
   "x2": 288.12,
   "y2": 7.2
  },
  {
   "x1": 312.21,
   "y1": 7.2,
   "x2": 328.31,
   "y2": 7.2
  },
  {
   "x1": 447.72,
   "y1": 22.2,
   "x2": 463.82,
   "y2": 21.2
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
   "who": "DOCK_FOREMAN",
   "x": 9.0,
   "y": 0.0,
   "facing": 1
  }
 ],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "cart",
   "x": 3.0,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 15.0,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "container",
   "x": 32.46,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 0
  },
  {
   "kind": "container",
   "x": 41.66,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 7
  },
  {
   "kind": "container",
   "x": 41.66,
   "w": 6.0,
   "top": 5.2,
   "bottom": 2.6,
   "tier": 1,
   "seed": 8
  },
  {
   "kind": "container",
   "x": 47.66,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 14
  },
  {
   "kind": "container",
   "x": 53.66,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 21
  },
  {
   "kind": "container",
   "x": 62.87,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 28
  },
  {
   "kind": "container",
   "x": 62.87,
   "w": 6.0,
   "top": 5.2,
   "bottom": 2.6,
   "tier": 1,
   "seed": 29
  },
  {
   "kind": "crate",
   "x": 72.87,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 74.07,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 75.27,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 84.25,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 91.68,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "container",
   "x": 151.91,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 0
  },
  {
   "kind": "container",
   "x": 161.11,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 7
  },
  {
   "kind": "container",
   "x": 161.11,
   "w": 6.0,
   "top": 5.2,
   "bottom": 2.6,
   "tier": 1,
   "seed": 8
  },
  {
   "kind": "container",
   "x": 161.11,
   "w": 6.0,
   "top": 7.8,
   "bottom": 5.2,
   "tier": 2,
   "seed": 9
  },
  {
   "kind": "container",
   "x": 167.11,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 14
  },
  {
   "kind": "container",
   "x": 173.11,
   "w": 6.0,
   "top": 2.6,
   "bottom": 0.0,
   "tier": 0,
   "seed": 21
  },
  {
   "kind": "container",
   "x": 173.11,
   "w": 6.0,
   "top": 5.2,
   "bottom": 2.6,
   "tier": 1,
   "seed": 22
  },
  {
   "kind": "container",
   "x": 173.11,
   "w": 6.0,
   "top": 7.8,
   "bottom": 5.2,
   "tier": 2,
   "seed": 23
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 188.11,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 181.61,
   "w": 10,
   "top": 6.5
  },
  {
   "kind": "roof",
   "x": 192.61,
   "w": 5,
   "top": 6.5
  },
  {
   "kind": "roof",
   "x": 209.61,
   "w": 9,
   "top": 5.0
  },
  {
   "kind": "roof",
   "x": 219.61,
   "w": 5,
   "top": 5.0
  },
  {
   "kind": "roof",
   "x": 238.61,
   "w": 9,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 249.74,
   "w": 7.87,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 259.62,
   "w": 8,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 268.62,
   "w": 5,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 286.62,
   "w": 9,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 297.81,
   "w": 11,
   "top": 4.6
  },
  {
   "kind": "gate",
   "x": 306.21,
   "w": 0.4,
   "top": 7.6,
   "bottom": 4.6,
   "trigger": 303.31
  },
  {
   "kind": "roof",
   "x": 309.81,
   "w": 5,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 326.81,
   "w": 9,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 338.05,
   "w": 9.77,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 350.07,
   "w": 10.22,
   "top": 4.6
  },
  {
   "kind": "vent",
   "x": 355.18,
   "w": 0.9,
   "top": 5.7
  },
  {
   "kind": "roof",
   "x": 362.28,
   "w": 8,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 370.28,
   "w": 8,
   "top": 7.6
  },
  {
   "kind": "roof",
   "x": 378.28,
   "w": 8,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 386.28,
   "w": 8,
   "top": 13.6
  },
  {
   "kind": "roof",
   "x": 396.28,
   "w": 8,
   "top": 13.6
  },
  {
   "kind": "roof",
   "x": 404.28,
   "w": 8,
   "top": 16.6
  },
  {
   "kind": "roof",
   "x": 412.28,
   "w": 8,
   "top": 19.6
  },
  {
   "kind": "roof",
   "x": 422.32,
   "w": 13.94,
   "top": 19.6
  },
  {
   "kind": "roof",
   "x": 438.32,
   "w": 6,
   "top": 19.6
  },
  {
   "kind": "roof",
   "x": 445.32,
   "w": 5,
   "top": 19.6
  },
  {
   "kind": "roof",
   "x": 462.32,
   "w": 9,
   "top": 18.6
  },
  {
   "kind": "roof",
   "x": 473.71,
   "w": 13.55,
   "top": 18.6
  },
  {
   "kind": "roof",
   "x": 489.54,
   "w": 7.76,
   "top": 18.6
  },
  {
   "kind": "roof",
   "x": 499.3,
   "w": 8,
   "top": 18.6
  },
  {
   "kind": "roof",
   "x": 507.3,
   "w": 8,
   "top": 21.6
  },
  {
   "kind": "roof",
   "x": 515.3,
   "w": 8,
   "top": 24.6
  },
  {
   "kind": "roof",
   "x": 525.63,
   "w": 10.8,
   "top": 24.0
  },
  {
   "kind": "roof",
   "x": 538.52,
   "w": 8.78,
   "top": 24.0
  },
  {
   "kind": "roof",
   "x": 549.35,
   "w": 11.05,
   "top": 23.4
  },
  {
   "kind": "vent",
   "x": 554.87,
   "w": 0.9,
   "top": 24.5
  },
  {
   "kind": "roof",
   "x": 562.6,
   "w": 8.7,
   "top": 23.0
  },
  {
   "kind": "roof",
   "x": 573.38,
   "w": 13.11,
   "top": 22.6
  },
  {
   "kind": "vent",
   "x": 579.94,
   "w": 0.9,
   "top": 23.7
  },
  {
   "kind": "roof",
   "x": 588.72,
   "w": 10.84,
   "top": 22.0
  },
  {
   "kind": "vent",
   "x": 594.14,
   "w": 0.9,
   "top": 23.1
  },
  {
   "kind": "roof",
   "x": 601.63,
   "w": 11.63,
   "top": 22.0
  },
  {
   "kind": "roof",
   "x": 615.73,
   "w": 11.72,
   "top": 21.4
  },
  {
   "kind": "vent",
   "x": 621.59,
   "w": 0.9,
   "top": 22.5
  },
  {
   "kind": "roof",
   "x": 629.45,
   "w": 8,
   "top": 21.4
  },
  {
   "kind": "roof",
   "x": 637.45,
   "w": 10,
   "top": 21.4
  }
 ],
 "climbs": [
  {
   "x": 41.46,
   "bottom": 0,
   "top": 5.2
  },
  {
   "x": 62.66,
   "bottom": 0,
   "top": 5.2
  },
  {
   "x": 160.91,
   "bottom": 0,
   "top": 7.8
  },
  {
   "x": 172.91,
   "bottom": 0,
   "top": 7.8
  },
  {
   "x": 181.36,
   "bottom": 0,
   "top": 6.5
  },
  {
   "x": 370.03,
   "bottom": 4.6,
   "top": 7.6
  },
  {
   "x": 378.03,
   "bottom": 7.6,
   "top": 10.6
  },
  {
   "x": 386.03,
   "bottom": 10.6,
   "top": 13.6
  },
  {
   "x": 404.03,
   "bottom": 13.6,
   "top": 16.6
  },
  {
   "x": 412.03,
   "bottom": 16.6,
   "top": 19.6
  },
  {
   "x": 507.05,
   "bottom": 18.6,
   "top": 21.6
  },
  {
   "x": 515.05,
   "bottom": 21.6,
   "top": 24.6
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 40.06,
   "y": 0,
   "minX": 38.86,
   "maxX": 41.27,
   "kind": "dock"
  },
  {
   "x": 40.06,
   "y": 0,
   "minX": 38.86,
   "maxX": 41.27,
   "kind": "dock"
  },
  {
   "x": 159.51,
   "y": 0,
   "minX": 158.31,
   "maxX": 160.71,
   "kind": "dock"
  }
 ],
 "drones": [
  {
   "x": 342.93,
   "y": 6.6,
   "minX": 339.05,
   "maxX": 346.81
  },
  {
   "x": 429.29,
   "y": 21.6,
   "minX": 423.32,
   "maxX": 435.26
  }
 ],
 "boosts": [
  {
   "x": 545.3,
   "y": 24.8
  }
 ],
 "rewinds": [
  {
   "x": 344.81,
   "y": 6.9
  }
 ],
 "coin": {
  "x": 416.28,
  "y": 22.8
 },
 "journal": [{"id":"M04_memory_1","x":154.91,"y":4},{"id":"M04_record_1","x":323.41,"y":6.4},{"id":"M04_lyric","x":514.4,"y":23.6}],
 "journalText": {
    "M04_memory_1": {
      "kind": "Memory trace",
      "title": "Mama's prayer card",
      "text": "Worn soft at the edges. \"Mama said we would make it.\"",
      "image": "assets/journal/M04_memory_1.webp"
    },
    "M04_record_1": {
      "kind": "City record",
      "title": "Dock labour contract",
      "text": "Wages paid in water rations, set by the Circle, revised without notice.",
      "image": "assets/journal/M04_record_1.webp"
    },
    "M04_lyric": {
      "kind": "Lyric fragment",
      "title": "\"Never thought I'd get this far\"",
      "text": "Scratched into the railing at the top of the tower. From \"Blessings\", track 4.",
      "image": "assets/journal/M04_lyric.webp"
    }
  },
 "notes": [
  [
   3.6,
   2.2
  ],
  [
   4.6,
   2.2
  ],
  [
   15.6,
   2.2
  ],
  [
   16.6,
   2.2
  ],
  [
   35.46,
   3.8
  ],
  [
   44.66,
   6.4
  ],
  [
   50.66,
   3.8
  ],
  [
   56.66,
   3.8
  ],
  [
   65.87,
   6.4
  ],
  [
   74.57,
   3.2
  ],
  [
   75.37,
   3.6
  ],
  [
   84.75,
   2.3
  ],
  [
   92.18,
   2.3
  ],
  [
   154.91,
   3.8
  ],
  [
   164.11,
   9.0
  ],
  [
   170.11,
   3.8
  ],
  [
   176.11,
   9.0
  ],
  [
   180.71,
   3.58
  ],
  [
   180.71,
   5.2
  ],
  [
   197.81,
   7.8
  ],
  [
   200.61,
   7.5
  ],
  [
   203.41,
   7.2
  ],
  [
   206.21,
   6.9
  ],
  [
   225.21,
   6.52
  ],
  [
   228.41,
   6.44
  ],
  [
   231.61,
   6.36
  ],
  [
   234.81,
   6.28
  ],
  [
   250.94,
   5.9
  ],
  [
   274.01,
   6.2
  ],
  [
   277.01,
   6.2
  ],
  [
   280.01,
   6.2
  ],
  [
   283.01,
   6.2
  ],
  [
   307.71,
   5.6
  ],
  [
   315.01,
   6.2
  ],
  [
   317.81,
   6.2
  ],
  [
   320.61,
   6.2
  ],
  [
   323.41,
   6.2
  ],
  [
   339.25,
   5.9
  ],
  [
   344.1,
   7.6
  ],
  [
   345.0,
   7.7
  ],
  [
   351.27,
   5.9
  ],
  [
   356.4,
   7.6
  ],
  [
   357.3,
   7.7
  ],
  [
   355.63,
   6.9
  ],
  [
   369.38,
   6.4
  ],
  [
   377.38,
   9.4
  ],
  [
   385.38,
   12.4
  ],
  [
   403.38,
   15.4
  ],
  [
   411.38,
   18.4
  ],
  [
   423.52,
   20.9
  ],
  [
   430.96,
   22.6
  ],
  [
   431.86,
   22.7
  ],
  [
   439.52,
   20.9
  ],
  [
   450.52,
   21.0
  ],
  [
   453.32,
   20.8
  ],
  [
   456.12,
   20.6
  ],
  [
   458.92,
   20.4
  ],
  [
   474.91,
   19.9
  ],
  [
   482.12,
   21.6
  ],
  [
   483.02,
   21.7
  ],
  [
   490.74,
   19.9
  ],
  [
   506.4,
   20.4
  ],
  [
   514.4,
   23.4
  ],
  [
   526.83,
   25.3
  ],
  [
   539.72,
   25.3
  ],
  [
   550.55,
   24.7
  ],
  [
   556.2,
   26.4
  ],
  [
   557.1,
   26.5
  ],
  [
   555.32,
   25.7
  ],
  [
   563.8,
   24.3
  ],
  [
   574.58,
   23.9
  ],
  [
   580.39,
   24.9
  ],
  [
   589.92,
   23.3
  ],
  [
   594.59,
   24.3
  ],
  [
   602.83,
   23.3
  ],
  [
   608.84,
   25.0
  ],
  [
   609.74,
   25.1
  ],
  [
   616.93,
   22.7
  ],
  [
   622.99,
   24.4
  ],
  [
   623.89,
   24.5
  ],
  [
   622.04,
   23.7
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "NEVER THOUGHT YOU'D GET THIS FAR? YOU DIDN'T.",
  "THE STARS ARE STILL WAITING.",
  "A LONG WAY. STILL A LONG WAY.",
  "MAMA SAID YOU'D MAKE IT. NOT LIKE THAT.",
  "THE CRANE GOT THERE BEFORE YOU.",
  "COUNT YOUR BLESSINGS. COUNT YOUR SECONDS.",
  "YOU CAN TELL BY THE SCARS. AND THE TIME.",
  "THE TOP DOESN'T COME TO YOU."
 ],
 "goal": {
  "x": 633.45,
  "y": 21.4
 }
};
