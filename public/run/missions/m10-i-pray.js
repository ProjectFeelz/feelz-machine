/*
  FEELZ RUN - MISSION 10: I PRAY
  From the shelter to the shrines. Hunters in the dark, wardens on the descent, and the neighbours stepping into the light.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m10 = {
 "id": "m10",
 "number": 10,
 "title": "I PRAY",
 "world": "LOWER CITY",
 "song": {
  "title": "I Pray",
  "src": "assets/audio/m10-i-pray.mp3",
  "lyrics": "assets/lyrics/m10-i-pray.txt",
  "seconds": 136.9
 },
 "length": 463.85,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 30.6,
   "checkpoint": {
    "x": 101.07,
    "y": 0
   },
   "storm": false,
   "dark": true
  },
  {
   "name": "VERSE 1",
   "start": 30.6,
   "end": 56.0,
   "checkpoint": {
    "x": 185.7,
    "y": 0
   },
   "storm": false,
   "dark": true
  },
  {
   "name": "INTERLUDE",
   "start": 56.0,
   "end": 86.4,
   "checkpoint": {
    "x": 288.69,
    "y": 4.8
   },
   "storm": false,
   "dark": true
  },
  {
   "name": "VERSE 2",
   "start": 86.4,
   "end": 107.3,
   "checkpoint": {
    "x": 351.23,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "OUTRO",
   "start": 107.3,
   "end": 136.9,
   "checkpoint": {
    "x": 450.35,
    "y": 0
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 80.1,
 "shelters": [
  {
   "from": -9.0,
   "to": 33.58
  }
 ],
 "weather": {
  "rain": 0.12,
  "wind": 0.05
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE SHELTER",
   "world": "ve",
   "backdrop": "m1-loc-05-storm-shelter"
  },
  {
   "from": 102.57,
   "name": "THE DESCENT",
   "world": "lc",
   "backdrop": "m10-loc-03-street-shrines"
  },
  {
   "from": 187.2,
   "name": "THE COSMIC DESERT",
   "world": "de",
   "backdrop": "m6-loc-04-folding-city-desert"
  },
  {
   "from": 188.7,
   "name": "THE COSMIC DESERT",
   "world": "de",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 2.0
  },
  {
   "from": 298.69,
   "name": "THE COSMIC DESERT",
   "world": "de",
   "backdrop": "m6-loc-04-folding-city-desert"
  },
  {
   "from": 301.69,
   "name": "PROTECT MY CHILDREN",
   "world": "lc",
   "backdrop": "m1-loc-05-storm-shelter"
  },
  {
   "from": 352.73,
   "name": "THE SHRINES",
   "world": "lc",
   "backdrop": "m10-loc-03-street-shrines"
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [],
 "crowds": [],
 "cages": [],
 "scanners": [],
 "tails": [],
 "hedges": [],
 "turns": [],
 "flickers": [],
 "shrines": [
  {
   "x": 36.08,
   "y": 0.0
  },
  {
   "x": 104.07,
   "y": 0.0
  },
  {
   "x": 136.07,
   "y": 0.0
  },
  {
   "x": 200.2,
   "y": 5.4
  },
  {
   "x": 252.78,
   "y": 4.6
  },
  {
   "x": 372.23,
   "y": 0.0
  },
  {
   "x": 382.23,
   "y": 0.0
  }
 ],
 "valves": [],
 "windows": [],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [
  {
   "who": "NEIGHBOUR_1_ELDER",
   "x": 382.73,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "CHILD_1_GIRL",
   "x": 384.23,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "NEIGHBOUR_2_WOMAN",
   "x": 386.23,
   "y": 0.0,
   "facing": -1
  }
 ],
 "mirror": false,
 "stealth": true,
 "player": "koda",
 "solids": [
  {
   "kind": "ceiling",
   "x": 3.0,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 6.5,
   "w": 11.01,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 17.51,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 21.01,
   "w": 11.57,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "crate",
   "x": 41.58,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 55.58,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 63.59,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 71.01,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 72.21,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 73.41,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 83.05,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 93.75,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 109.57,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 141.57,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 151.57,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 159.7,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 160.9,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 162.1,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 170.21,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 178.45,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 195.2,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 188.7,
   "w": 10,
   "top": 5.4
  },
  {
   "kind": "roof",
   "x": 198.7,
   "w": 4,
   "top": 5.4
  },
  {
   "kind": "catwalk",
   "x": 204.74,
   "w": 5.99,
   "top": 5.4
  },
  {
   "kind": "catwalk",
   "x": 212.7,
   "w": 6.0,
   "top": 5.0
  },
  {
   "kind": "catwalk",
   "x": 221.0,
   "w": 4.54,
   "top": 5.0
  },
  {
   "kind": "catwalk",
   "x": 227.93,
   "w": 5.55,
   "top": 4.6
  },
  {
   "kind": "catwalk",
   "x": 235.39,
   "w": 5.89,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 243.28,
   "w": 8,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 251.28,
   "w": 4,
   "top": 4.6
  },
  {
   "kind": "roof",
   "x": 257.29,
   "w": 11.99,
   "top": 5.2
  },
  {
   "kind": "roof",
   "x": 271.57,
   "w": 11.13,
   "top": 4.8
  },
  {
   "kind": "vent",
   "x": 277.13,
   "w": 0.9,
   "top": 5.9
  },
  {
   "kind": "roof",
   "x": 284.69,
   "w": 8,
   "top": 4.8
  },
  {
   "kind": "roof",
   "x": 294.69,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "cart",
   "x": 346.69,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 355.73,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 363.93,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 387.73,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 395.73,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "cart",
   "x": 405.09,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "barrel",
   "x": 415.33,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 424.92,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 434.24,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 444.32,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 445.52,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 446.72,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 298.69,
   "w": 161.15,
   "top": 0
  }
 ],
 "climbs": [
  {
   "x": 188.45,
   "bottom": 0,
   "top": 5.4
  }
 ],
 "mud": [],
 "wardens": [
  {
   "x": 124.57,
   "y": 0.0,
   "minX": 122.07,
   "maxX": 127.07,
   "kind": "hunter"
  },
  {
   "x": 307.69,
   "y": 0.0,
   "minX": 305.19,
   "maxX": 310.19,
   "kind": "warden"
  },
  {
   "x": 315.69,
   "y": 0.0,
   "minX": 313.19,
   "maxX": 318.19,
   "kind": "warden"
  },
  {
   "x": 329.69,
   "y": 0.0,
   "minX": 327.19,
   "maxX": 332.19,
   "kind": "sentinel"
  }
 ],
 "drones": [
  {
   "x": 263.28,
   "y": 7.2,
   "minX": 258.29,
   "maxX": 268.28
  }
 ],
 "boosts": [],
 "rewinds": [
  {
   "x": 266.28,
   "y": 7.5
  }
 ],
 "coin": {
  "x": 28.3,
  "y": 0.6
 },
 "journal": [{"id":"M10_memory_1","x":94.25,"y":2.5},{"id":"M10_record_1","x":230.7,"y":7.4},{"id":"M10_lyric","x":364.43,"y":2.5}],
 "journalText": {
    "M10_memory_1": {
      "kind": "Memory trace",
      "title": "A candle stub",
      "text": "Where Koda and his brother prayed as boys.",
      "image": "assets/journal/M10_memory_1.webp"
    },
    "M10_record_1": {
      "kind": "City record",
      "title": "Order: unauthorised light",
      "text": "Candles and shrines are banned in the Lower City.",
      "image": "assets/journal/M10_record_1.webp"
    },
    "M10_lyric": {
      "kind": "Lyric fragment",
      "title": "\"In your image you created\"",
      "text": "On the shelter wall, beside the first. From \"I Pray\", track 10.",
      "image": "assets/journal/M10_lyric.webp"
    }
  },
 "notes": [
  [
   12.01,
   0.6
  ],
  [
   26.8,
   0.6
  ],
  [
   42.08,
   2.3
  ],
  [
   55.93,
   2.2
  ],
  [
   64.09,
   2.3
  ],
  [
   72.71,
   3.2
  ],
  [
   73.51,
   3.6
  ],
  [
   83.65,
   2.2
  ],
  [
   84.65,
   2.2
  ],
  [
   94.25,
   2.3
  ],
  [
   109.87,
   1.7
  ],
  [
   124.57,
   2.0
  ],
  [
   142.07,
   2.3
  ],
  [
   151.92,
   2.2
  ],
  [
   161.4,
   3.2
  ],
  [
   162.2,
   3.6
  ],
  [
   170.81,
   2.2
  ],
  [
   171.81,
   2.2
  ],
  [
   178.95,
   2.3
  ],
  [
   187.8,
   2.97
  ],
  [
   187.8,
   4.32
  ],
  [
   207.74,
   6.7
  ],
  [
   215.7,
   6.3
  ],
  [
   223.26,
   6.3
  ],
  [
   230.7,
   5.9
  ],
  [
   238.33,
   5.9
  ],
  [
   258.49,
   6.5
  ],
  [
   272.77,
   6.1
  ],
  [
   277.58,
   7.1
  ],
  [
   307.69,
   2.0
  ],
  [
   315.69,
   2.0
  ],
  [
   329.69,
   2.0
  ],
  [
   347.29,
   2.2
  ],
  [
   348.29,
   2.2
  ],
  [
   356.03,
   1.7
  ],
  [
   364.43,
   2.3
  ],
  [
   388.23,
   2.3
  ],
  [
   396.03,
   1.7
  ],
  [
   405.69,
   2.2
  ],
  [
   406.69,
   2.2
  ],
  [
   415.68,
   2.2
  ],
  [
   425.52,
   2.2
  ],
  [
   426.52,
   2.2
  ],
  [
   434.84,
   2.2
  ],
  [
   435.84,
   2.2
  ],
  [
   446.02,
   3.2
  ],
  [
   446.82,
   3.6
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [
  {
   "art": "lantern",
   "x": 4.75,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "lantern",
   "x": 19.26,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  },
  {
   "art": "shrine",
   "x": 36.08,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 104.07,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 136.07,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 200.2,
   "y": 5.4,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 252.78,
   "y": 4.6,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 372.23,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  },
  {
   "art": "shrine",
   "x": 382.23,
   "y": 0.0,
   "h": 1.3,
   "layer": "back",
   "glow": "#7fb6ff"
  }
 ],
 "taunts": [
  "PRAY FASTER.",
  "ALL OF YOUR DAYS. AND STILL LATE.",
  "THE SHRINE LIGHTS WENT OUT WAITING.",
  "IT'S HARD SOMETIMES. THAT WAS HARD TO WATCH.",
  "THE NEIGHBOURS STEPPED INTO THE LIGHT. YOU STEPPED INTO A HUNTER.",
  "STAY TRUE. STAY QUICK.",
  "PROTECT THE CHILDREN. NOT YOUR PACE."
 ],
 "goal": {
  "x": 450.35,
  "y": 0
 }
};
