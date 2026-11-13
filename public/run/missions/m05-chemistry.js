/*
  FEELZ RUN - MISSION 05: CHEMISTRY
  The Upper City plaza, its terraces and its rooftops. Somewhere in the crowd, a first sighting of Zora.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m05 = {
 "id": "m05",
 "number": 5,
 "title": "CHEMISTRY",
 "world": "UPPER CITY",
 "song": {
  "title": "Chemistry",
  "src": "assets/audio/m05-chemistry.mp3",
  "lyrics": "assets/lyrics/m05-chemistry.txt",
  "seconds": 189.9
 },
 "length": 668.62,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 13.4,
   "checkpoint": {
    "x": 41.73,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "CHORUS 1",
   "start": 13.4,
   "end": 55.6,
   "checkpoint": {
    "x": 184.32,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 55.6,
   "end": 90.9,
   "checkpoint": {
    "x": 309.43,
    "y": 7.0
   },
   "storm": false
  },
  {
   "name": "CHORUS 2",
   "start": 90.9,
   "end": 125.9,
   "checkpoint": {
    "x": 429.68,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "BRIDGE",
   "start": 125.9,
   "end": 144.7,
   "checkpoint": {
    "x": 502.68,
    "y": 7.8
   },
   "storm": false
  },
  {
   "name": "CHORUS 3",
   "start": 144.7,
   "end": 179.5,
   "checkpoint": {
    "x": 622.24,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "OUTRO",
   "start": 179.5,
   "end": 189.9,
   "checkpoint": {
    "x": 655.12,
    "y": 0
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 107.6,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.05
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE PROMENADE STEPS",
   "world": "uc",
   "backdrop": "m8-loc-01-plaza-fountain-day"
  },
  {
   "from": 43.23,
   "name": "THE PROMENADE",
   "world": "uc",
   "backdrop": "m5-loc-02-crowded-promenade"
  },
  {
   "from": 185.82,
   "name": "THE SKY GARDENS",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops"
  },
  {
   "from": 187.32,
   "name": "THE SKY GARDENS",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 319.43,
   "name": "THE SKY GARDENS",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops"
  },
  {
   "from": 322.43,
   "name": "THE GARDEN TERRACE",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops"
  },
  {
   "from": 432.68,
   "name": "THE GARDEN TERRACE",
   "world": "uc",
   "backdrop": "m5-loc-04-garden-rooftops",
   "fallBelow": 4.0
  },
  {
   "from": 442.68,
   "name": "A FLASH OF THE VEIL",
   "world": "ve",
   "backdrop": "m5-loc-04-garden-rooftops",
   "fallBelow": 2.0
  },
  {
   "from": 512.68,
   "name": "A FLASH OF THE VEIL",
   "world": "ve",
   "backdrop": "m5-loc-04-garden-rooftops"
  },
  {
   "from": 515.68,
   "name": "THE PACKED PLAZA",
   "world": "uc",
   "backdrop": "m5-loc-05-packed-plaza"
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [],
 "crowds": [
  {
   "x": 49.23,
   "w": 48,
   "y": 0
  },
  {
   "x": 328.43,
   "w": 46,
   "y": 0
  },
  {
   "x": 521.68,
   "w": 42,
   "y": 0
  }
 ],
 "cages": [],
 "scanners": [],
 "tails": [
  {
   "x0": 45.23,
   "x1": 101.23,
   "y": 0
  },
  {
   "x0": 324.43,
   "x1": 378.43,
   "y": 0
  },
  {
   "x0": 517.68,
   "x1": 567.68,
   "y": 0
  }
 ],
 "hedges": [
  {
   "x": 2.0,
   "w": 3.0,
   "y": 0
  },
  {
   "x": 8.8,
   "w": 3.0,
   "y": 0
  },
  {
   "x": 51.23,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 62.41,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 76.29,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 89.82,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 200.02,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 212.59,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 225.83,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 239.22,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 248.22,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 260.5,
   "w": 2.6,
   "y": 5.5
  },
  {
   "x": 273.07,
   "w": 2.6,
   "y": 6.0
  },
  {
   "x": 330.43,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 343.47,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 355.72,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 369.63,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 523.68,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 536.85,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 548.06,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 560.52,
   "w": 2.6,
   "y": 0
  },
  {
   "x": 571.68,
   "w": 3.0,
   "y": 0
  },
  {
   "x": 579.27,
   "w": 3.0,
   "y": 0
  }
 ],
 "turns": [],
 "flickers": [],
 "shrines": [],
 "valves": [],
 "windows": [],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "crate",
   "x": 19.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 26.51,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 34.1,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 106.23,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 115.18,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 125.62,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 135.02,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 142.47,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 151.56,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 159.2,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 168.21,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 177.54,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 178.74,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 179.94,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 193.82,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 187.32,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 198.82,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "glass",
   "x": 205.82,
   "w": 5.57,
   "top": 6.0,
   "oneWay": true
  },
  {
   "kind": "garden",
   "x": 211.39,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "glass",
   "x": 218.39,
   "w": 6.23,
   "top": 6.0,
   "oneWay": true
  },
  {
   "kind": "garden",
   "x": 224.63,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "glass",
   "x": 231.63,
   "w": 6.4,
   "top": 6.0,
   "oneWay": true
  },
  {
   "kind": "garden",
   "x": 238.02,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 247.02,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "glass",
   "x": 254.02,
   "w": 5.28,
   "top": 6.0,
   "oneWay": true
  },
  {
   "kind": "garden",
   "x": 259.3,
   "w": 7.0,
   "top": 5.5
  },
  {
   "kind": "glass",
   "x": 266.3,
   "w": 5.56,
   "top": 5.5,
   "oneWay": true
  },
  {
   "kind": "garden",
   "x": 271.87,
   "w": 7.0,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 281.66,
   "w": 13.64,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 297.43,
   "w": 6,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 305.43,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 315.43,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 383.43,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 391.45,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "cart",
   "x": 399.86,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 409.05,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 417.57,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 319.43,
   "w": 113.75,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 432.68,
   "w": 10,
   "top": 5.0
  },
  {
   "kind": "catwalk",
   "x": 445.08,
   "w": 5.01,
   "top": 5.2
  },
  {
   "kind": "catwalk",
   "x": 452.48,
   "w": 5.33,
   "top": 5.8
  },
  {
   "kind": "catwalk",
   "x": 459.78,
   "w": 5.26,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 467.26,
   "w": 5.29,
   "top": 6.8
  },
  {
   "kind": "catwalk",
   "x": 474.45,
   "w": 5.0,
   "top": 7.4
  },
  {
   "kind": "catwalk",
   "x": 481.76,
   "w": 4.91,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 488.68,
   "w": 8,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 498.68,
   "w": 8,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 508.68,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "cart",
   "x": 586.68,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 595.01,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 596.21,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 597.41,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 606.42,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 613.09,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 626.74,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 640.74,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 650.27,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 512.68,
   "w": 151.94,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 187.07,
   "bottom": 0,
   "top": 6.0
  },
  {
   "x": 432.43,
   "bottom": 0,
   "top": 5.0
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 64.83,
   "y": 0,
   "minX": 61.83,
   "maxX": 67.83,
   "kind": "sentinel"
  },
  {
   "x": 216.39,
   "y": 6.0,
   "minX": 215.59,
   "maxX": 217.79,
   "kind": "sentinel"
  },
  {
   "x": 343.33,
   "y": 0,
   "minX": 340.33,
   "maxX": 346.33,
   "kind": "sentinel"
  },
  {
   "x": 362.23,
   "y": 0,
   "minX": 359.23,
   "maxX": 365.23,
   "kind": "sentinel"
  },
  {
   "x": 535.18,
   "y": 0,
   "minX": 532.18,
   "maxX": 538.18,
   "kind": "sentinel"
  },
  {
   "x": 552.68,
   "y": 0,
   "minX": 549.68,
   "maxX": 555.68,
   "kind": "sentinel"
  }
 ],
 "drones": [
  {
   "x": 228.63,
   "y": 8.0,
   "minX": 225.63,
   "maxX": 231.63
  }
 ],
 "boosts": [
  {
   "x": 567.68,
   "y": 0.8
  }
 ],
 "rewinds": [
  {
   "x": 377.43,
   "y": 2.3
  }
 ],
 "coin": {
  "x": 455.14,
  "y": 9.0
 },
 "journal": [{"id":"M05_memory_1","x":144.07,"y":2.4},{"id":"M05_record_1","x":341.43,"y":1.6},{"id":"M05_lyric","x":539.68,"y":1.6}],
 "journalText": {
    "M05_memory_1": {
      "kind": "Memory trace",
      "title": "Deja vu: the fountain",
      "text": "He has never been here. He knows this fountain.",
      "image": "assets/journal/M05_memory_1.webp"
    },
    "M05_record_1": {
      "kind": "City record",
      "title": "Sentinel duty roster",
      "text": "Note: anomaly sightings in the sky-gardens. Increase patrols.",
      "image": "assets/journal/M05_record_1.webp"
    },
    "M05_lyric": {
      "kind": "Lyric fragment",
      "title": "\"I ain't never seen no angel in my life before\"",
      "text": "Engraved on the rim of the largest fountain. From \"Chemistry\", track 5.",
      "image": "assets/journal/M05_lyric.webp"
    }
  },
 "notes": [
  [
   3.5,
   1.8
  ],
  [
   10.3,
   1.8
  ],
  [
   19.3,
   1.7
  ],
  [
   26.86,
   2.2
  ],
  [
   34.6,
   2.3
  ],
  [
   47.23,
   1.4
  ],
  [
   52.23,
   1.4
  ],
  [
   57.23,
   1.4
  ],
  [
   62.23,
   1.4
  ],
  [
   67.23,
   1.4
  ],
  [
   72.23,
   1.4
  ],
  [
   77.23,
   1.4
  ],
  [
   82.23,
   1.4
  ],
  [
   87.23,
   1.4
  ],
  [
   92.23,
   1.4
  ],
  [
   97.23,
   1.4
  ],
  [
   106.73,
   2.3
  ],
  [
   115.78,
   2.2
  ],
  [
   116.78,
   2.2
  ],
  [
   125.92,
   1.7
  ],
  [
   135.37,
   2.2
  ],
  [
   143.07,
   2.2
  ],
  [
   144.07,
   2.2
  ],
  [
   152.06,
   2.3
  ],
  [
   159.55,
   2.2
  ],
  [
   168.71,
   2.3
  ],
  [
   179.24,
   3.2
  ],
  [
   180.04,
   3.6
  ],
  [
   186.42,
   3.3
  ],
  [
   186.42,
   4.8
  ],
  [
   203.62,
   7.3
  ],
  [
   208.61,
   7.0
  ],
  [
   208.61,
   8.4
  ],
  [
   216.19,
   7.3
  ],
  [
   221.51,
   7.0
  ],
  [
   221.51,
   8.4
  ],
  [
   229.43,
   7.3
  ],
  [
   234.83,
   7.0
  ],
  [
   234.83,
   8.4
  ],
  [
   242.82,
   7.3
  ],
  [
   251.82,
   7.3
  ],
  [
   256.66,
   7.0
  ],
  [
   256.66,
   8.4
  ],
  [
   264.1,
   6.8
  ],
  [
   269.08,
   6.5
  ],
  [
   269.08,
   7.9
  ],
  [
   276.67,
   7.3
  ],
  [
   282.86,
   7.7
  ],
  [
   290.11,
   9.4
  ],
  [
   291.01,
   9.5
  ],
  [
   298.63,
   8.3
  ],
  [
   326.43,
   1.4
  ],
  [
   331.43,
   1.4
  ],
  [
   336.43,
   1.4
  ],
  [
   341.43,
   1.4
  ],
  [
   346.43,
   1.4
  ],
  [
   351.43,
   1.4
  ],
  [
   356.43,
   1.4
  ],
  [
   361.43,
   1.4
  ],
  [
   366.43,
   1.4
  ],
  [
   371.43,
   1.4
  ],
  [
   383.93,
   2.3
  ],
  [
   391.75,
   1.7
  ],
  [
   400.46,
   2.2
  ],
  [
   401.46,
   2.2
  ],
  [
   409.55,
   2.3
  ],
  [
   418.17,
   2.2
  ],
  [
   419.17,
   2.2
  ],
  [
   431.78,
   2.75
  ],
  [
   431.78,
   4.0
  ],
  [
   447.58,
   6.5
  ],
  [
   455.14,
   7.1
  ],
  [
   462.41,
   7.3
  ],
  [
   469.91,
   8.1
  ],
  [
   476.96,
   8.7
  ],
  [
   484.22,
   9.1
  ],
  [
   519.68,
   1.4
  ],
  [
   524.68,
   1.4
  ],
  [
   529.68,
   1.4
  ],
  [
   534.68,
   1.4
  ],
  [
   539.68,
   1.4
  ],
  [
   544.68,
   1.4
  ],
  [
   549.68,
   1.4
  ],
  [
   554.68,
   1.4
  ],
  [
   559.68,
   1.4
  ],
  [
   564.68,
   1.4
  ],
  [
   573.18,
   1.8
  ],
  [
   580.77,
   1.8
  ],
  [
   587.28,
   2.2
  ],
  [
   588.28,
   2.2
  ],
  [
   596.71,
   3.2
  ],
  [
   597.51,
   3.6
  ],
  [
   606.72,
   1.7
  ],
  [
   613.44,
   2.2
  ],
  [
   627.09,
   2.2
  ],
  [
   641.34,
   2.2
  ],
  [
   642.34,
   2.2
  ],
  [
   650.87,
   2.2
  ],
  [
   651.87,
   2.2
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "NO CHEMISTRY. JUST SLOW.",
  "SHE WAS RIGHT THERE. SO WAS THE CHECKPOINT.",
  "CRASHING, YES. RUNNING, NO.",
  "LOOKING AT HER FACE GOT YOU CAUGHT.",
  "THE SENTINELS SAW THAT.",
  "YOU CAN'T EXPLAIN IT. NEITHER CAN WE.",
  "BUZZING. BUT NOT MOVING.",
  "HEAVEN'S DOORS CLOSED ON YOU."
 ],
 "goal": {
  "x": 655.12,
  "y": 0
 }
};
