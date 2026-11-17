/*
  FEELZ RUN - MISSION 08: PATIENCE
  The edge of the Upper City plaza, waiting for the right moment. Shutters, sentinels, and Zora at the end.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m08 = {
 "id": "m08",
 "number": 8,
 "title": "PATIENCE",
 "world": "UPPER CITY",
 "song": {
  "title": "Patience",
  "src": "assets/audio/m08-patience.mp3",
  "lyrics": "assets/lyrics/m08-patience.txt",
  "seconds": 127.5
 },
 "length": 399.69,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 11.4,
   "checkpoint": {
    "x": 30.84,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 11.4,
   "end": 44.6,
   "checkpoint": {
    "x": 130.76,
    "y": 0
   },
   "storm": false,
   "stillness": true
  },
  {
   "name": "HOOK",
   "start": 44.6,
   "end": 61.8,
   "checkpoint": {
    "x": 186.02,
    "y": 6.4
   },
   "storm": false
  },
  {
   "name": "VERSE 2",
   "start": 61.8,
   "end": 101.4,
   "checkpoint": {
    "x": 308.28,
    "y": 0
   },
   "storm": false,
   "stillness": true
  },
  {
   "name": "OUTRO",
   "start": 101.4,
   "end": 127.5,
   "checkpoint": {
    "x": 386.19,
    "y": 0
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 112.4,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.05
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE PLAZA EDGE",
   "world": "uc",
   "backdrop": "m8-loc-01-plaza-fountain-day"
  },
  {
   "from": 151.76,
   "name": "THE PLAZA EDGE",
   "world": "uc",
   "backdrop": "m8-loc-01-plaza-fountain-day",
   "fallBelow": 4.6
  },
  {
   "from": 190.02,
   "name": "THE FOUNTAIN AT NIGHT",
   "world": "uc",
   "backdrop": "m8-loc-02-plaza-fountain-night",
   "fallBelow": 2.0
  },
  {
   "from": 196.02,
   "name": "THE FOUNTAIN AT NIGHT",
   "world": "uc",
   "backdrop": "m8-loc-02-plaza-fountain-night"
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [],
 "crowds": [],
 "cages": [],
 "scanners": [],
 "tails": [],
 "hedges": [
  {
   "x": 37.34,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 51.34,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 65.34,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 204.02,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 215.35,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 226.69,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 238.02,
   "w": 2.8,
   "y": 0
  },
  {
   "x": 320.78,
   "w": 3.0,
   "y": 0
  },
  {
   "x": 328.86,
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
 "npcs": [
  {
   "who": "ZORA",
   "x": 329.78,
   "y": 0.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "crate",
   "x": 3.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 15.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "barrel",
   "x": 23.66,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "gate",
   "x": 74.34,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.45,
    "offset": 1.62
   }
  },
  {
   "kind": "gate",
   "x": 83.34,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.45,
    "offset": 1.87
   }
  },
  {
   "kind": "barrel",
   "x": 90.34,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 98.5,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 107.97,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 109.17,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 110.37,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 119.72,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "gate",
   "x": 137.26,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.4,
    "offset": 1.5
   }
  },
  {
   "kind": "gate",
   "x": 146.26,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.4,
    "offset": 0.75
   }
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 158.26,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 151.76,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 164.05,
   "w": 7.71,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 174.02,
   "w": 6,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 182.02,
   "w": 8,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 192.02,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "gate",
   "x": 247.02,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.45,
    "offset": 0.16
   }
  },
  {
   "kind": "gate",
   "x": 256.02,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.45,
    "offset": 1.26
   }
  },
  {
   "kind": "cart",
   "x": 263.02,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 271.33,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 272.53,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 273.73,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 281.23,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 290.37,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 300.06,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "gate",
   "x": 314.78,
   "w": 0.4,
   "top": 3.0,
   "bottom": 0.0,
   "pulse": {
    "period": 2.135,
    "open": 0.45,
    "offset": 1.65
   }
  },
  {
   "kind": "cart",
   "x": 335.78,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 346.38,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 355.66,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 365.31,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 375.04,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 376.24,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 377.44,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 196.02,
   "w": 199.67,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 151.51,
   "bottom": 0,
   "top": 6.0
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 44.54,
   "y": 0,
   "minX": 44.54,
   "maxX": 44.54,
   "kind": "sentinel",
   "still": true,
   "facing": -1
  },
  {
   "x": 59.84,
   "y": 0,
   "minX": 59.84,
   "maxX": 59.84,
   "kind": "sentinel",
   "still": true,
   "facing": 1
  },
  {
   "x": 213.02,
   "y": 0,
   "minX": 213.02,
   "maxX": 213.02,
   "kind": "sentinel",
   "still": true,
   "facing": -1
  },
  {
   "x": 231.02,
   "y": 0,
   "minX": 231.02,
   "maxX": 231.02,
   "kind": "sentinel",
   "still": true,
   "facing": 1
  },
  {
   "x": 249.02,
   "y": 0,
   "minX": 249.02,
   "maxX": 249.02,
   "kind": "sentinel",
   "still": true,
   "facing": -1
  }
 ],
 "drones": [],
 "boosts": [
  {
   "x": 330.78,
   "y": 0.8
  }
 ],
 "rewinds": [
  {
   "x": 257.02,
   "y": 2.3
  }
 ],
 "coin": {
  "x": 175.82,
  "y": 9.6
 },
 "journal": [{"id":"M08_memory_1","x":84.84,"y":1.2},{"id":"M08_record_1","x":205.42,"y":2},{"id":"M08_lyric","x":316.28,"y":1.2}],
 "journalText": {
    "M08_memory_1": {
      "kind": "Memory trace",
      "title": "Mama's prayer beads",
      "text": "Left on the plaza steps, as if someone knew he would sit here.",
      "image": "assets/journal/M08_memory_1.webp"
    },
    "M08_record_1": {
      "kind": "City record",
      "title": "Sentinel report",
      "text": "\"Subject sat motionless in the plaza for nine hours. No rule against stillness. No action taken.\"",
      "image": "assets/journal/M08_record_1.webp"
    },
    "M08_lyric": {
      "kind": "Lyric fragment",
      "title": "\"You teach me patience\"",
      "text": "Written by condensation on the fountain's glass rim. From \"Patience\", track 8.",
      "image": "assets/journal/M08_lyric.webp"
    }
  },
 "notes": [
  [
   3.3,
   1.7
  ],
  [
   15.3,
   1.7
  ],
  [
   24.01,
   2.2
  ],
  [
   38.74,
   1.8
  ],
  [
   52.74,
   1.8
  ],
  [
   66.74,
   1.8
  ],
  [
   75.84,
   1.0
  ],
  [
   84.84,
   1.0
  ],
  [
   90.69,
   2.2
  ],
  [
   99.0,
   2.3
  ],
  [
   109.67,
   3.2
  ],
  [
   110.47,
   3.6
  ],
  [
   120.32,
   2.2
  ],
  [
   121.32,
   2.2
  ],
  [
   138.76,
   1.0
  ],
  [
   147.76,
   1.0
  ],
  [
   150.86,
   3.3
  ],
  [
   150.86,
   4.8
  ],
  [
   165.25,
   6.9
  ],
  [
   175.22,
   7.7
  ],
  [
   205.42,
   1.8
  ],
  [
   216.75,
   1.8
  ],
  [
   228.09,
   1.8
  ],
  [
   239.42,
   1.8
  ],
  [
   248.52,
   1.0
  ],
  [
   257.52,
   1.0
  ],
  [
   263.62,
   2.2
  ],
  [
   264.62,
   2.2
  ],
  [
   273.03,
   3.2
  ],
  [
   273.83,
   3.6
  ],
  [
   281.73,
   2.3
  ],
  [
   290.87,
   2.3
  ],
  [
   300.56,
   2.3
  ],
  [
   316.28,
   1.0
  ],
  [
   322.28,
   1.8
  ],
  [
   330.36,
   1.8
  ],
  [
   336.38,
   2.2
  ],
  [
   337.38,
   2.2
  ],
  [
   346.88,
   2.3
  ],
  [
   356.16,
   2.3
  ],
  [
   365.81,
   2.3
  ],
  [
   376.74,
   3.2
  ],
  [
   377.54,
   3.6
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "PATIENCE. NOT STANDING STILL.",
  "THE SHUTTER WAITED FOR NO ONE.",
  "SHE TAUGHT YOU PATIENCE. NOT SPEED.",
  "THE SENTINELS ARE VERY PATIENT. YOU, NOT SO MUCH.",
  "FATHER, CARRY HIM.",
  "TOO CONFIDENT. TOO SLOW.",
  "THE GOAL IS STILL THERE. SO ARE YOU."
 ],
 "goal": {
  "x": 386.19,
  "y": 0
 }
};
