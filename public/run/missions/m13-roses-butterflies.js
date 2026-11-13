/*
  FEELZ RUN - MISSION 13: ROSES & BUTTERFLIES
  Koda and Zora through the courtyard, the ruins and the sanctuary, then flight. No one chasing, nothing to fight.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m13 = {
 "id": "m13",
 "number": 13,
 "title": "ROSES & BUTTERFLIES",
 "world": "THE VEIL",
 "song": {
  "title": "Roses & Butterflies",
  "src": "assets/audio/m13-roses-butterflies.mp3",
  "lyrics": "assets/lyrics/m13-roses-butterflies.txt",
  "seconds": 182.2
 },
 "length": 665.69,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 16.2,
   "checkpoint": {
    "x": 51.39,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 16.2,
   "end": 48.1,
   "checkpoint": {
    "x": 159.1,
    "y": 7.4
   },
   "storm": false,
   "bloom": true
  },
  {
   "name": "CHORUS 1",
   "start": 48.1,
   "end": 86.9,
   "checkpoint": {
    "x": 300.48,
    "y": 9.8
   },
   "storm": false,
   "bloom": true
  },
  {
   "name": "INTERLUDE",
   "start": 86.9,
   "end": 97.9,
   "checkpoint": {
    "x": 343.33,
    "y": 9.8
   },
   "storm": false,
   "bloom": true
  },
  {
   "name": "VERSE 2",
   "start": 97.9,
   "end": 130.9,
   "checkpoint": {
    "x": 461.18,
    "y": 14.8
   },
   "storm": false,
   "bloom": true
  },
  {
   "name": "CHORUS 2",
   "start": 130.9,
   "end": 162.6,
   "checkpoint": {
    "x": 576.07,
    "y": 10.3
   },
   "storm": false,
   "drive": true,
   "shadow": 4.2,
   "wither": true
  },
  {
   "name": "OUTRO",
   "start": 162.6,
   "end": 182.2,
   "checkpoint": {
    "x": 647.69,
    "y": 10.3
   },
   "storm": false,
   "drive": true,
   "shadow": 4.4,
   "wither": true,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 117.4,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.04
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE CRACKED FOUNTAIN",
   "world": "rc",
   "backdrop": "m13-loc-01-cracked-fountain"
  },
  {
   "from": 52.89,
   "name": "THE RUSTED RUIN",
   "world": "ve",
   "backdrop": "m13-loc-03-blooming-veil-ruin"
  },
  {
   "from": 54.39,
   "name": "THE RUSTED RUIN",
   "world": "ve",
   "backdrop": "m13-loc-03-blooming-veil-ruin",
   "fallBelow": 5.0
  },
  {
   "from": 163.1,
   "name": "ROSES TO A BUTTERFLY",
   "world": "ve",
   "backdrop": "m13-loc-03-blooming-veil-ruin",
   "fallBelow": 6.4
  },
  {
   "from": 304.48,
   "name": "THE GARDEN SANCTUARY",
   "world": "rc",
   "backdrop": "m13-loc-04-garden-sanctuary",
   "fallBelow": 8.8
  },
  {
   "from": 465.18,
   "name": "THE FLIGHT",
   "world": "rc",
   "backdrop": "m13-loc-03-blooming-veil-ruin",
   "fallBelow": 9.3
  },
  {
   "from": 580.07,
   "name": "YOU BECAME MY VICES",
   "world": "rc",
   "backdrop": "m13-loc-04-garden-sanctuary",
   "fallBelow": 9.3
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 529.67,
   "y1": 14.3,
   "x2": 545.77,
   "y2": 13.3
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
 "roses": [
  {
   "x": 69.39,
   "w": 4.51,
   "y": 6.0
  },
  {
   "x": 78.9,
   "w": 4.25,
   "y": 6.0
  },
  {
   "x": 88.15,
   "w": 5.23,
   "y": 6.0
  },
  {
   "x": 98.38,
   "w": 4.29,
   "y": 6.0
  },
  {
   "x": 168.1,
   "w": 4.08,
   "y": 7.4
  },
  {
   "x": 177.18,
   "w": 4.91,
   "y": 7.4
  },
  {
   "x": 187.09,
   "w": 4.33,
   "y": 7.4
  },
  {
   "x": 196.42,
   "w": 4.16,
   "y": 7.4
  },
  {
   "x": 205.58,
   "w": 4.93,
   "y": 7.4
  },
  {
   "x": 309.48,
   "w": 4.07,
   "y": 9.8
  },
  {
   "x": 318.55,
   "w": 4.33,
   "y": 9.8
  },
  {
   "x": 368.33,
   "w": 4.71,
   "y": 15.8
  },
  {
   "x": 378.04,
   "w": 4.67,
   "y": 15.8
  },
  {
   "x": 387.71,
   "w": 4.36,
   "y": 15.8
  }
 ],
 "broken": [],
 "npcs": [
  {
   "who": "ZORA",
   "x": 20.0,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "ZORA",
   "x": 599.07,
   "y": 10.3,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": false,
 "player": "koda",
 "solids": [
  {
   "kind": "crate",
   "x": 3.0,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 21.0,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 28.33,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 36.43,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 45.74,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 60.89,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 54.39,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 64.39,
   "w": 5,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 73.9,
   "w": 5,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 83.15,
   "w": 5,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 93.38,
   "w": 5,
   "top": 6.0
  },
  {
   "kind": "garden",
   "x": 102.67,
   "w": 6,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 110.61,
   "w": 4.89,
   "top": 6.8
  },
  {
   "kind": "catwalk",
   "x": 117.59,
   "w": 4.96,
   "top": 7.0
  },
  {
   "kind": "catwalk",
   "x": 124.53,
   "w": 5.26,
   "top": 7.4
  },
  {
   "kind": "roof",
   "x": 131.79,
   "w": 8,
   "top": 7.4
  },
  {
   "kind": "roof",
   "x": 141.89,
   "w": 11.21,
   "top": 7.4
  },
  {
   "kind": "vent",
   "x": 147.49,
   "w": 0.9,
   "top": 8.5
  },
  {
   "kind": "roof",
   "x": 155.1,
   "w": 8,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 163.1,
   "w": 5,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 172.18,
   "w": 5,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 182.09,
   "w": 5,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 191.42,
   "w": 5,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 200.58,
   "w": 5,
   "top": 7.4
  },
  {
   "kind": "garden",
   "x": 210.51,
   "w": 6,
   "top": 7.4
  },
  {
   "kind": "catwalk",
   "x": 218.63,
   "w": 5.43,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 226.3,
   "w": 5.7,
   "top": 8.6
  },
  {
   "kind": "catwalk",
   "x": 234.27,
   "w": 5.75,
   "top": 9.0
  },
  {
   "kind": "catwalk",
   "x": 242.13,
   "w": 4.6,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 248.74,
   "w": 8,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 258.96,
   "w": 12.8,
   "top": 9.8
  },
  {
   "kind": "vent",
   "x": 265.36,
   "w": 0.9,
   "top": 10.9
  },
  {
   "kind": "roof",
   "x": 274.07,
   "w": 12.22,
   "top": 9.8
  },
  {
   "kind": "vent",
   "x": 280.18,
   "w": 0.9,
   "top": 10.9
  },
  {
   "kind": "roof",
   "x": 288.48,
   "w": 6,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 296.48,
   "w": 8,
   "top": 9.8
  },
  {
   "kind": "garden",
   "x": 304.48,
   "w": 5,
   "top": 9.8
  },
  {
   "kind": "garden",
   "x": 313.55,
   "w": 5,
   "top": 9.8
  },
  {
   "kind": "garden",
   "x": 322.88,
   "w": 6,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 331.33,
   "w": 6,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 339.33,
   "w": 8,
   "top": 9.8
  },
  {
   "kind": "roof",
   "x": 347.33,
   "w": 8,
   "top": 12.8
  },
  {
   "kind": "roof",
   "x": 355.33,
   "w": 8,
   "top": 15.8
  },
  {
   "kind": "garden",
   "x": 363.33,
   "w": 5,
   "top": 15.8
  },
  {
   "kind": "garden",
   "x": 373.04,
   "w": 5,
   "top": 15.8
  },
  {
   "kind": "garden",
   "x": 382.71,
   "w": 5,
   "top": 15.8
  },
  {
   "kind": "garden",
   "x": 392.07,
   "w": 6,
   "top": 15.8
  },
  {
   "kind": "roof",
   "x": 400.14,
   "w": 13.45,
   "top": 15.2
  },
  {
   "kind": "vent",
   "x": 406.86,
   "w": 0.9,
   "top": 16.3
  },
  {
   "kind": "roof",
   "x": 416.0,
   "w": 10.45,
   "top": 15.2
  },
  {
   "kind": "vent",
   "x": 421.23,
   "w": 0.9,
   "top": 16.3
  },
  {
   "kind": "roof",
   "x": 428.64,
   "w": 12.38,
   "top": 14.8
  },
  {
   "kind": "roof",
   "x": 443.29,
   "w": 11.9,
   "top": 14.8
  },
  {
   "kind": "roof",
   "x": 457.18,
   "w": 8,
   "top": 14.8
  },
  {
   "kind": "catwalk",
   "x": 467.15,
   "w": 5.33,
   "top": 12.5
  },
  {
   "kind": "catwalk",
   "x": 474.43,
   "w": 4.57,
   "top": 12.5
  },
  {
   "kind": "catwalk",
   "x": 481.12,
   "w": 5.71,
   "top": 11.7
  },
  {
   "kind": "catwalk",
   "x": 488.8,
   "w": 4.61,
   "top": 10.9
  },
  {
   "kind": "catwalk",
   "x": 495.33,
   "w": 5.43,
   "top": 11.3
  },
  {
   "kind": "catwalk",
   "x": 503.11,
   "w": 4.95,
   "top": 12.1
  },
  {
   "kind": "catwalk",
   "x": 510.44,
   "w": 5.83,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 518.27,
   "w": 8,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 527.27,
   "w": 5,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 544.27,
   "w": 9,
   "top": 10.7
  },
  {
   "kind": "roof",
   "x": 555.65,
   "w": 6,
   "top": 10.7
  },
  {
   "kind": "roof",
   "x": 564.07,
   "w": 6,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 572.07,
   "w": 8,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 582.4,
   "w": 11.35,
   "top": 10.3
  },
  {
   "kind": "vent",
   "x": 588.07,
   "w": 0.9,
   "top": 11.4
  },
  {
   "kind": "roof",
   "x": 596.05,
   "w": 6.02,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 604.14,
   "w": 10.5,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 617.06,
   "w": 13.84,
   "top": 10.3
  },
  {
   "kind": "vent",
   "x": 623.98,
   "w": 0.9,
   "top": 11.4
  },
  {
   "kind": "roof",
   "x": 633.1,
   "w": 8.59,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 643.69,
   "w": 8,
   "top": 10.3
  },
  {
   "kind": "roof",
   "x": 651.69,
   "w": 10,
   "top": 10.3
  }
 ],
 "climbs": [
  {
   "x": 54.14,
   "bottom": 0,
   "top": 6.0
  },
  {
   "x": 347.08,
   "bottom": 9.8,
   "top": 12.8
  },
  {
   "x": 355.08,
   "bottom": 12.8,
   "top": 15.8
  }
 ],
 "mud": [],
 "wardens": [],
 "drones": [],
 "boosts": [
  {
   "x": 214.51,
   "y": 8.2
  },
  {
   "x": 524.27,
   "y": 12.5
  }
 ],
 "rewinds": [
  {
   "x": 395.07,
   "y": 18.1
  }
 ],
 "coin": {
  "x": 432.36,
  "y": 18.0
 },
 "journal": [{"id":"M13_memory_1","x":143.09,"y":8.9},{"id":"M13_record_1","x":332.53,"y":11.3},{"id":"M13_lyric","x":532.47,"y":13.3}],
 "journalText": {
    "M13_memory_1": {
      "kind": "Memory trace",
      "title": "A rose in a tin",
      "text": "His mother tending a single rose in a tin can.",
      "image": "assets/journal/M13_memory_1.webp"
    },
    "M13_record_1": {
      "kind": "City record",
      "title": "Veil crack",
      "text": "Miners at work far below.",
      "image": "assets/journal/M13_record_1.webp"
    },
    "M13_lyric": {
      "kind": "Lyric fragment",
      "title": "\"You are like roses to a butterfly\"",
      "text": "Spelled out in fallen petals. From \"Roses & Butterflies\", track 13.",
      "image": "assets/journal/M13_lyric.webp"
    }
  },
 "notes": [
  [
   3.5,
   2.3
  ],
  [
   21.35,
   2.2
  ],
  [
   28.83,
   2.3
  ],
  [
   36.73,
   1.7
  ],
  [
   46.24,
   2.3
  ],
  [
   53.49,
   3.3
  ],
  [
   53.49,
   4.8
  ],
  [
   66.89,
   7.3
  ],
  [
   71.64,
   7.6
  ],
  [
   76.4,
   7.3
  ],
  [
   81.02,
   7.6
  ],
  [
   85.65,
   7.3
  ],
  [
   90.76,
   7.6
  ],
  [
   95.88,
   7.3
  ],
  [
   100.52,
   7.6
  ],
  [
   113.05,
   8.1
  ],
  [
   120.08,
   8.3
  ],
  [
   120.08,
   10.0
  ],
  [
   127.16,
   8.7
  ],
  [
   143.09,
   8.7
  ],
  [
   147.94,
   9.7
  ],
  [
   165.6,
   8.7
  ],
  [
   170.14,
   9.0
  ],
  [
   174.68,
   8.7
  ],
  [
   179.63,
   9.0
  ],
  [
   184.59,
   8.7
  ],
  [
   189.25,
   9.0
  ],
  [
   193.92,
   8.7
  ],
  [
   198.5,
   9.0
  ],
  [
   203.08,
   8.7
  ],
  [
   208.05,
   9.0
  ],
  [
   221.35,
   9.3
  ],
  [
   221.35,
   11.0
  ],
  [
   229.15,
   9.9
  ],
  [
   229.15,
   11.6
  ],
  [
   237.14,
   10.3
  ],
  [
   244.43,
   11.1
  ],
  [
   260.16,
   11.1
  ],
  [
   266.9,
   12.8
  ],
  [
   267.8,
   12.9
  ],
  [
   265.81,
   12.1
  ],
  [
   275.27,
   11.1
  ],
  [
   281.64,
   12.8
  ],
  [
   282.54,
   12.9
  ],
  [
   280.63,
   12.1
  ],
  [
   289.68,
   11.1
  ],
  [
   306.98,
   11.1
  ],
  [
   311.51,
   11.4
  ],
  [
   316.05,
   11.1
  ],
  [
   320.71,
   11.4
  ],
  [
   332.53,
   11.1
  ],
  [
   346.43,
   11.6
  ],
  [
   354.43,
   14.6
  ],
  [
   365.83,
   17.1
  ],
  [
   370.69,
   17.4
  ],
  [
   375.54,
   17.1
  ],
  [
   380.37,
   17.4
  ],
  [
   385.21,
   17.1
  ],
  [
   389.89,
   17.4
  ],
  [
   401.34,
   16.5
  ],
  [
   407.31,
   17.5
  ],
  [
   417.2,
   16.5
  ],
  [
   421.68,
   17.5
  ],
  [
   429.84,
   16.1
  ],
  [
   436.32,
   17.8
  ],
  [
   437.22,
   17.9
  ],
  [
   444.49,
   16.1
  ],
  [
   469.82,
   13.8
  ],
  [
   476.71,
   13.8
  ],
  [
   483.97,
   13.0
  ],
  [
   491.11,
   12.2
  ],
  [
   498.04,
   12.6
  ],
  [
   498.04,
   14.3
  ],
  [
   505.58,
   13.4
  ],
  [
   513.35,
   13.0
  ],
  [
   532.47,
   13.1
  ],
  [
   535.27,
   12.9
  ],
  [
   538.07,
   12.7
  ],
  [
   540.87,
   12.5
  ],
  [
   556.85,
   12.0
  ],
  [
   565.27,
   11.6
  ],
  [
   583.6,
   11.6
  ],
  [
   588.52,
   12.6
  ],
  [
   597.25,
   11.6
  ],
  [
   605.34,
   11.6
  ],
  [
   610.66,
   13.3
  ],
  [
   611.56,
   13.4
  ],
  [
   618.26,
   11.6
  ],
  [
   624.43,
   12.6
  ],
  [
   634.3,
   11.6
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "THE BUTTERFLY GOT THERE FIRST.",
  "SO CLOSE, CAN'T BELIEVE YOUR EYES.",
  "CAME TOO FAR TO STOP NOW. YOU STOPPED.",
  "ETERNITY IS A LONG TIME. THAT WAS LONGER.",
  "THE ROSES WILTED WAITING.",
  "SHE FLEW. YOU FELL."
 ],
 "goal": {
  "x": 647.69,
  "y": 10.3
 }
};
