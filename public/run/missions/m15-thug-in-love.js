/*
  FEELZ RUN - MISSION 15: THUGS IN LOVE
  The finale. Stretch by stretch up to the top of the city, past the last hunter, to Zora on the ledge.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m15 = {
 "id": "m15",
 "number": 15,
 "title": "THUGS IN LOVE",
 "world": "UPPER CITY",
 "song": {
  "title": "Thug in Love",
  "src": "assets/audio/m15-thug-in-love.mp3",
  "lyrics": "assets/lyrics/m15-thug-in-love.txt",
  "seconds": 134.1
 },
 "length": 500.12,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 12.4,
   "checkpoint": {
    "x": 38.28,
    "y": 0
   },
   "storm": false,
   "drive": true,
   "dogs": 3
  },
  {
   "name": "CHORUS 1",
   "start": 12.4,
   "end": 38.4,
   "checkpoint": {
    "x": 129.48,
    "y": 10.0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "VERSE 1",
   "start": 38.4,
   "end": 66.1,
   "checkpoint": {
    "x": 232.62,
    "y": 15.0
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "VERSE 2",
   "start": 66.1,
   "end": 95.1,
   "checkpoint": {
    "x": 336.67,
    "y": 22.4
   },
   "storm": false,
   "drive": true
  },
  {
   "name": "CHORUS 2",
   "start": 95.1,
   "end": 117.0,
   "checkpoint": {
    "x": 419.12,
    "y": 12.0
   },
   "storm": false,
   "drive": true,
   "shadow": 4.0
  },
  {
   "name": "OUTRO",
   "start": 117.0,
   "end": 134.1,
   "checkpoint": {
    "x": 482.12,
    "y": 13.8
   },
   "storm": false,
   "drive": true,
   "shadow": 4.4,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 143.6,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.1
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE MUD RETURN",
   "world": "lc",
   "backdrop": "m15-loc-03-mud-return"
  },
  {
   "from": 39.78,
   "name": "THE CONVERGENCE",
   "world": "mc",
   "backdrop": "m15-loc-02-platform-over-void"
  },
  {
   "from": 87.28,
   "name": "THE CLIMB",
   "world": "mc",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 3.0
  },
  {
   "from": 133.48,
   "name": "ANY SIDE, ANY FIGHT",
   "world": "mc",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 8.0
  },
  {
   "from": 265.82,
   "name": "THE TOP OF THE CITY",
   "world": "uc",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 17.0
  },
  {
   "from": 340.67,
   "name": "THE PLATFORM OVER THE VOID",
   "world": "ve",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 11.0
  },
  {
   "from": 423.12,
   "name": "ZORA'S LEDGE",
   "world": "uc",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 12.8
  }
 ],
 "inward": [
  {
   "from": 42.78,
   "to": 82.78,
   "name": "THE CONVERGENCE",
   "backdrop": "m15-loc-02-platform-over-void",
   "obstacles": [
    [
     7.0,
     "all",
     "high"
    ],
    [
     16.1,
     -1,
     "block"
    ],
    [
     16.1,
     0,
     "block"
    ],
    [
     23.6,
     "all",
     "low"
    ],
    [
     33.6,
     "all",
     "low"
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
     12.1,
     1
    ],
    [
     13.4,
     1
    ],
    [
     14.7,
     1
    ]
   ]
  }
 ],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 162.88,
   "y1": 12.6,
   "x2": 178.98,
   "y2": 11.6
  }
 ],
 "crowds": [],
 "cages": [],
 "scanners": [],
 "tails": [],
 "hedges": [],
 "turns": [],
 "flickers": [
  {
   "x": 342.31,
   "w": 3.69,
   "y": 12.0,
   "set": 0,
   "period": 3.343
  },
  {
   "x": 347.69,
   "w": 3.75,
   "y": 12.0,
   "set": 1,
   "period": 3.343
  },
  {
   "x": 353.27,
   "w": 3.7,
   "y": 12.0,
   "set": 0,
   "period": 3.343
  },
  {
   "x": 358.76,
   "w": 3.76,
   "y": 12.0,
   "set": 1,
   "period": 3.343
  }
 ],
 "shrines": [],
 "valves": [],
 "windows": [],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [
  {
   "who": "ZORA",
   "x": 441.66,
   "y": 15.0,
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
   "kind": "crate",
   "x": 4.2,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 5.4,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 19.0,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 28.79,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 93.78,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 87.28,
   "w": 10,
   "top": 4.0
  },
  {
   "kind": "roof",
   "x": 97.28,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 105.28,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 115.65,
   "w": 7.83,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 125.48,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 135.48,
   "w": 14,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 151.78,
   "w": 7.7,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 160.48,
   "w": 5,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 177.48,
   "w": 9,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 186.48,
   "w": 8,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 194.48,
   "w": 8,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 204.89,
   "w": 13.6,
   "top": 15.0
  },
  {
   "kind": "vent",
   "x": 211.69,
   "w": 0.9,
   "top": 16.1
  },
  {
   "kind": "roof",
   "x": 220.62,
   "w": 6,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 228.62,
   "w": 8,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 238.82,
   "w": 11,
   "top": 15.0
  },
  {
   "kind": "gate",
   "x": 247.22,
   "w": 0.4,
   "top": 18.0,
   "bottom": 15.0,
   "trigger": 244.32
  },
  {
   "kind": "roof",
   "x": 251.82,
   "w": 14,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 265.82,
   "w": 8,
   "top": 18.0
  },
  {
   "kind": "roof",
   "x": 273.82,
   "w": 8,
   "top": 21.0
  },
  {
   "kind": "roof",
   "x": 281.82,
   "w": 8,
   "top": 24.0
  },
  {
   "kind": "roof",
   "x": 291.82,
   "w": 11.62,
   "top": 23.4
  },
  {
   "kind": "vent",
   "x": 297.63,
   "w": 0.9,
   "top": 24.5
  },
  {
   "kind": "roof",
   "x": 305.7,
   "w": 11.9,
   "top": 23.0
  },
  {
   "kind": "roof",
   "x": 320.08,
   "w": 10.59,
   "top": 22.4
  },
  {
   "kind": "roof",
   "x": 332.67,
   "w": 8,
   "top": 22.4
  },
  {
   "kind": "catwalk",
   "x": 364.21,
   "w": 4.14,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 370.16,
   "w": 7,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 379.28,
   "w": 13.09,
   "top": 12.0
  },
  {
   "kind": "vent",
   "x": 385.82,
   "w": 0.9,
   "top": 13.1
  },
  {
   "kind": "roof",
   "x": 394.81,
   "w": 10.23,
   "top": 12.0
  },
  {
   "kind": "vent",
   "x": 399.92,
   "w": 0.9,
   "top": 13.1
  },
  {
   "kind": "roof",
   "x": 407.12,
   "w": 6,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 415.12,
   "w": 8,
   "top": 12.0
  },
  {
   "kind": "roof",
   "x": 423.12,
   "w": 8,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 433.3,
   "w": 11.35,
   "top": 15.0
  },
  {
   "kind": "roof",
   "x": 447.1,
   "w": 13.7,
   "top": 14.4
  },
  {
   "kind": "vent",
   "x": 453.95,
   "w": 0.9,
   "top": 15.5
  },
  {
   "kind": "roof",
   "x": 462.86,
   "w": 13.26,
   "top": 13.8
  },
  {
   "kind": "vent",
   "x": 469.49,
   "w": 0.9,
   "top": 14.9
  },
  {
   "kind": "roof",
   "x": 478.12,
   "w": 8,
   "top": 13.8
  },
  {
   "kind": "roof",
   "x": 486.12,
   "w": 10,
   "top": 13.8
  }
 ],
 "climbs": [
  {
   "x": 87.03,
   "bottom": 0,
   "top": 4.0
  },
  {
   "x": 97.03,
   "bottom": 4.0,
   "top": 7.0
  },
  {
   "x": 105.03,
   "bottom": 7.0,
   "top": 10.0
  },
  {
   "x": 186.23,
   "bottom": 9.0,
   "top": 12.0
  },
  {
   "x": 194.23,
   "bottom": 12.0,
   "top": 15.0
  },
  {
   "x": 265.57,
   "bottom": 15.0,
   "top": 18.0
  },
  {
   "x": 273.57,
   "bottom": 18.0,
   "top": 21.0
  },
  {
   "x": 281.57,
   "bottom": 21.0,
   "top": 24.0
  },
  {
   "x": 422.87,
   "bottom": 12.0,
   "top": 15.0
  }
 ],
 "mud": [
  {
   "x": 1.0,
   "w": 4.0
  }
 ],
 "wardens": [
  {
   "x": 141.48,
   "y": 10.0,
   "minX": 138.98,
   "maxX": 143.98,
   "kind": "hunter"
  },
  {
   "x": 257.82,
   "y": 15.0,
   "minX": 255.32,
   "maxX": 260.32,
   "kind": "sentinel"
  }
 ],
 "drones": [],
 "boosts": [
  {
   "x": 375.16,
   "y": 12.8
  }
 ],
 "rewinds": [
  {
   "x": 286.82,
   "y": 26.3
  }
 ],
 "coin": {
  "x": 309.27,
  "y": 26.2
 },
 "journal": [{"id":"M15_memory_1","x":104.38,"y":9},{"id":"M15_record_1","x":248.72,"y":16.2},{"id":"M15_lyric","x":396.01,"y":13.5}],
 "journalText": {
    "M15_memory_1": {
      "kind": "Memory trace",
      "title": "The drawing",
      "text": "The child's drawing from the storm.",
      "image": "assets/journal/M15_memory_1.webp"
    },
    "M15_record_1": {
      "kind": "City record",
      "title": "The Circle's last order",
      "text": "Hold the Veil at any cost.",
      "image": "assets/journal/M15_record_1.webp"
    },
    "M15_lyric": {
      "kind": "Lyric fragment",
      "title": "\"There's a city, I can feel it\"",
      "text": "Written in the city's streets, seen from above. From \"Thug in Love\", track 15.",
      "image": "assets/journal/M15_lyric.webp"
    }
  },
 "notes": [
  [
   4.7,
   3.2
  ],
  [
   5.5,
   3.6
  ],
  [
   19.6,
   2.2
  ],
  [
   20.6,
   2.2
  ],
  [
   29.14,
   2.2
  ],
  [
   86.38,
   2.2
  ],
  [
   86.38,
   3.2
  ],
  [
   96.38,
   5.8
  ],
  [
   104.38,
   8.8
  ],
  [
   116.85,
   11.3
  ],
  [
   141.48,
   12.0
  ],
  [
   152.98,
   11.3
  ],
  [
   165.68,
   11.4
  ],
  [
   168.48,
   11.2
  ],
  [
   171.28,
   11.0
  ],
  [
   174.08,
   10.8
  ],
  [
   185.58,
   10.8
  ],
  [
   193.58,
   13.8
  ],
  [
   206.09,
   16.3
  ],
  [
   213.32,
   18.0
  ],
  [
   214.22,
   18.1
  ],
  [
   212.14,
   17.3
  ],
  [
   221.82,
   16.3
  ],
  [
   248.72,
   16.0
  ],
  [
   257.82,
   17.0
  ],
  [
   264.92,
   16.8
  ],
  [
   272.92,
   19.8
  ],
  [
   280.92,
   22.8
  ],
  [
   293.02,
   24.7
  ],
  [
   299.03,
   26.4
  ],
  [
   299.93,
   26.5
  ],
  [
   298.08,
   25.7
  ],
  [
   306.9,
   24.3
  ],
  [
   321.28,
   23.7
  ],
  [
   326.64,
   25.4
  ],
  [
   327.54,
   25.5
  ],
  [
   344.15,
   13.3
  ],
  [
   349.56,
   13.3
  ],
  [
   355.12,
   13.3
  ],
  [
   360.63,
   13.3
  ],
  [
   366.29,
   13.3
  ],
  [
   380.48,
   13.3
  ],
  [
   386.27,
   14.3
  ],
  [
   396.01,
   13.3
  ],
  [
   401.15,
   15.0
  ],
  [
   402.05,
   15.1
  ],
  [
   400.37,
   14.3
  ],
  [
   408.32,
   13.3
  ],
  [
   422.22,
   13.8
  ],
  [
   434.5,
   16.3
  ],
  [
   440.34,
   18.0
  ],
  [
   441.24,
   18.1
  ],
  [
   448.3,
   15.7
  ],
  [
   455.59,
   17.4
  ],
  [
   456.49,
   17.5
  ],
  [
   454.4,
   16.7
  ],
  [
   464.06,
   15.1
  ],
  [
   469.94,
   16.1
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "A THUG IN LOVE. A SLOW ONE.",
  "SHE'S ON THE LEDGE. YOU'RE NOT.",
  "IS THIS LOVE? IS THIS A RUN?",
  "YOU'D RIDE FOR HER. RIDE FASTER.",
  "ANY SIDE, ANY FIGHT. ANY SECOND NOW.",
  "THE CITY IS UP THERE. GO."
 ],
 "goal": {
  "x": 482.12,
  "y": 13.8
 }
};
