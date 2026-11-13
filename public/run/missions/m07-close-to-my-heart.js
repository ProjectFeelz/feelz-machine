/*
  FEELZ RUN - MISSION 07: CLOSE TO MY HEART
  An old alley that keeps flickering into the Veil. Zora's reflection in a puddle, and a road out into the stars.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m07 = {
 "id": "m07",
 "number": 7,
 "title": "CLOSE TO MY HEART",
 "world": "LOWER CITY",
 "song": {
  "title": "Close to My Heart",
  "src": "assets/audio/m07-close-to-my-heart.mp3",
  "lyrics": "assets/lyrics/m07-close-to-my-heart.txt",
  "seconds": 182.0
 },
 "length": 645.11,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 11.8,
   "checkpoint": {
    "x": 36.21,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "VERSE 1",
   "start": 11.8,
   "end": 37.3,
   "checkpoint": {
    "x": 121.19,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "INTERLUDE",
   "start": 37.3,
   "end": 56.5,
   "checkpoint": {
    "x": 188.93,
    "y": 6.4
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "CHORUS 1",
   "start": 56.5,
   "end": 83.4,
   "checkpoint": {
    "x": 281.23,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "VERSE 2",
   "start": 83.4,
   "end": 109.9,
   "checkpoint": {
    "x": 375.36,
    "y": 6.6
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "BRIDGE",
   "start": 109.9,
   "end": 124.5,
   "checkpoint": {
    "x": 425.23,
    "y": 0
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "VERSE 3",
   "start": 124.5,
   "end": 148.6,
   "checkpoint": {
    "x": 507.88,
    "y": 7.2
   },
   "storm": false,
   "anger": true
  },
  {
   "name": "OUTRO",
   "start": 148.6,
   "end": 182.0,
   "checkpoint": {
    "x": 627.11,
    "y": 9.0
   },
   "storm": false,
   "anger": true,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 137.8,
 "shelters": [],
 "weather": {
  "rain": 0.22,
  "wind": 0.06
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE RAIN ALLEY",
   "world": "lc",
   "backdrop": "m7-loc-01-rain-alley"
  },
  {
   "from": 122.69,
   "name": "THE GOLDEN MIRROR",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror"
  },
  {
   "from": 124.19,
   "name": "THE GOLDEN MIRROR",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror",
   "fallBelow": 2.0
  },
  {
   "from": 198.93,
   "name": "THE GOLDEN MIRROR",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror"
  },
  {
   "from": 201.93,
   "name": "THE ALLEY",
   "world": "lc",
   "backdrop": "m7-loc-01-rain-alley"
  },
  {
   "from": 282.73,
   "name": "THE FLICKER",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror"
  },
  {
   "from": 284.23,
   "name": "THE FLICKER",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror",
   "fallBelow": 2.0
  },
  {
   "from": 385.36,
   "name": "THE FLICKER",
   "world": "de",
   "backdrop": "m7-loc-02-golden-desert-mirror"
  },
  {
   "from": 388.36,
   "name": "THE PUDDLE",
   "world": "lc",
   "backdrop": "m7-loc-01-rain-alley"
  },
  {
   "from": 426.73,
   "name": "THE STARFIELD",
   "world": "ve",
   "backdrop": "m14-loc-03-golden-spires"
  },
  {
   "from": 428.23,
   "name": "THE STARFIELD",
   "world": "ve",
   "backdrop": "m14-loc-03-golden-spires",
   "fallBelow": 4.6
  },
  {
   "from": 511.88,
   "name": "THROUGH THE GALAXY",
   "world": "ve",
   "backdrop": "m14-loc-03-golden-spires",
   "fallBelow": 7.0
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [],
 "crowds": [
  {
   "x": 39.71,
   "w": 14,
   "y": 0
  },
  {
   "x": 203.93,
   "w": 16,
   "y": 0
  }
 ],
 "cages": [],
 "scanners": [],
 "tails": [],
 "hedges": [],
 "turns": [],
 "flickers": [
  {
   "x": 135.82,
   "w": 4.17,
   "y": 6.0,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 141.71,
   "w": 3.85,
   "y": 6.0,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 147.44,
   "w": 3.66,
   "y": 5.6,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 152.92,
   "w": 3.6,
   "y": 6.0,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 295.94,
   "w": 4.01,
   "y": 5.6,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 301.58,
   "w": 3.5,
   "y": 5.2,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 306.81,
   "w": 4.1,
   "y": 4.8,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 312.72,
   "w": 3.4,
   "y": 5.2,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 439.95,
   "w": 3.78,
   "y": 6.0,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 445.42,
   "w": 3.24,
   "y": 6.6,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 450.46,
   "w": 4.09,
   "y": 6.8,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 456.18,
   "w": 3.27,
   "y": 7.2,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 526.37,
   "w": 3.53,
   "y": 8.4,
   "set": 0,
   "period": 3.483
  },
  {
   "x": 531.87,
   "w": 3.53,
   "y": 8.4,
   "set": 1,
   "period": 3.483
  },
  {
   "x": 537.25,
   "w": 3.87,
   "y": 8.4,
   "set": 0,
   "period": 3.483
  }
 ],
 "shrines": [],
 "valves": [],
 "windows": [
  {
   "x": 15.5,
   "y": 0.0
  },
  {
   "x": 69.21,
   "y": 0.0
  },
  {
   "x": 223.43,
   "y": 0.0
  },
  {
   "x": 389.86,
   "y": 0.0
  }
 ],
 "filters": [],
 "roses": [],
 "broken": [],
 "npcs": [
  {
   "who": "ZORA",
   "x": 58.71,
   "y": 0.0,
   "facing": 1,
   "ghost": true
  },
  {
   "who": "ZORA",
   "x": 392.36,
   "y": 0.0,
   "facing": 1,
   "ghost": true
  }
 ],
 "mirror": true,
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
   "kind": "crate",
   "x": 21.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 29.04,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 58.71,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 74.71,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 83.38,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 84.58,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 85.78,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 95.54,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "cart",
   "x": 105.21,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 115.31,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 130.69,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 124.19,
   "w": 10,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 158.23,
   "w": 3.64,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 163.67,
   "w": 7,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 172.98,
   "w": 9.94,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 184.93,
   "w": 8,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 194.93,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "barrel",
   "x": 228.93,
   "w": 0.7,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 238.93,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 248.55,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 255.57,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 256.77,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 257.97,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 266.97,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "cart",
   "x": 275.28,
   "w": 2.2,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 198.93,
   "w": 85.81,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 284.23,
   "w": 10,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 317.9,
   "w": 3.84,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 323.53,
   "w": 7,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 332.58,
   "w": 13.49,
   "top": 6.4
  },
  {
   "kind": "vent",
   "x": 339.33,
   "w": 0.9,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 348.5,
   "w": 12.52,
   "top": 5.8
  },
  {
   "kind": "roof",
   "x": 363.36,
   "w": 6,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 371.36,
   "w": 8,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 381.36,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 395.36,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 403.36,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 410.81,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 418.91,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": 385.36,
   "w": 43.37,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 428.23,
   "w": 10,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 461.07,
   "w": 3.29,
   "top": 7.6
  },
  {
   "kind": "roof",
   "x": 466.16,
   "w": 7,
   "top": 7.6
  },
  {
   "kind": "roof",
   "x": 475.17,
   "w": 11.8,
   "top": 7.2
  },
  {
   "kind": "vent",
   "x": 481.07,
   "w": 0.9,
   "top": 8.3
  },
  {
   "kind": "roof",
   "x": 489.16,
   "w": 12.72,
   "top": 7.2
  },
  {
   "kind": "vent",
   "x": 495.52,
   "w": 0.9,
   "top": 8.3
  },
  {
   "kind": "roof",
   "x": 503.88,
   "w": 8,
   "top": 7.2
  },
  {
   "kind": "roof",
   "x": 514.21,
   "w": 10.33,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 542.84,
   "w": 3.96,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 548.6,
   "w": 7,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 557.75,
   "w": 10.93,
   "top": 8.8
  },
  {
   "kind": "roof",
   "x": 570.87,
   "w": 11.57,
   "top": 8.4
  },
  {
   "kind": "vent",
   "x": 576.65,
   "w": 0.9,
   "top": 9.5
  },
  {
   "kind": "roof",
   "x": 584.79,
   "w": 10.54,
   "top": 8.4
  },
  {
   "kind": "vent",
   "x": 590.06,
   "w": 0.9,
   "top": 9.5
  },
  {
   "kind": "roof",
   "x": 597.43,
   "w": 12.45,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 612.23,
   "w": 8.89,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 623.11,
   "w": 8,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 631.11,
   "w": 10,
   "top": 9.0
  }
 ],
 "climbs": [
  {
   "x": 123.94,
   "bottom": 0,
   "top": 5.6
  },
  {
   "x": 283.98,
   "bottom": 0,
   "top": 5.6
  },
  {
   "x": 427.98,
   "bottom": 0,
   "top": 5.6
  }
 ],
 "mud": [
  {
   "x": 56.71,
   "w": 4.0
  }
 ],
 "wardens": [
  {
   "x": 44.61,
   "y": 0,
   "minX": 40.61,
   "maxX": 48.61,
   "kind": "warden"
  },
  {
   "x": 209.53,
   "y": 0,
   "minX": 205.53,
   "maxX": 213.53,
   "kind": "warden"
  },
  {
   "x": 212.73,
   "y": 0,
   "minX": 208.73,
   "maxX": 216.73,
   "kind": "warden"
  }
 ],
 "drones": [],
 "boosts": [
  {
   "x": 553.6,
   "y": 8.8
  }
 ],
 "rewinds": [
  {
   "x": 327.53,
   "y": 7.9
  }
 ],
 "coin": {
  "x": 492.98,
  "y": 10.4
 },
 "journal": [{"id":"M07_memory_1","x":137.91,"y":7.5},{"id":"M07_record_1","x":319.82,"y":7.1},{"id":"M07_lyric","x":515.41,"y":9.5}],
 "journalText": {
    "M07_memory_1": {
      "kind": "Memory trace",
      "title": "Worn grooves",
      "text": "Two worn grooves on an alley step, where two people once sat all day.",
      "image": "assets/journal/M07_memory_1.webp"
    },
    "M07_record_1": {
      "kind": "City record",
      "title": "Circle notice",
      "text": "Report anyone seen staring into water.",
      "image": "assets/journal/M07_record_1.webp"
    },
    "M07_lyric": {
      "kind": "Lyric fragment",
      "title": "\"I cannot touch you in any way\"",
      "text": "Visible only in a puddle's reflection. From \"Close to My Heart\", track 7.",
      "image": "assets/journal/M07_lyric.webp"
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
   21.3,
   1.7
  ],
  [
   29.54,
   2.3
  ],
  [
   41.71,
   1.4
  ],
  [
   45.71,
   1.4
  ],
  [
   49.71,
   1.4
  ],
  [
   59.31,
   2.2
  ],
  [
   60.31,
   2.2
  ],
  [
   75.21,
   2.3
  ],
  [
   85.08,
   3.2
  ],
  [
   85.88,
   3.6
  ],
  [
   96.14,
   2.2
  ],
  [
   97.14,
   2.2
  ],
  [
   105.81,
   2.2
  ],
  [
   106.81,
   2.2
  ],
  [
   115.61,
   1.7
  ],
  [
   123.28,
   3.08
  ],
  [
   123.28,
   4.48
  ],
  [
   137.91,
   7.3
  ],
  [
   143.63,
   7.3
  ],
  [
   149.27,
   6.9
  ],
  [
   154.72,
   7.3
  ],
  [
   160.05,
   7.3
  ],
  [
   174.18,
   7.7
  ],
  [
   205.93,
   1.4
  ],
  [
   209.93,
   1.4
  ],
  [
   213.93,
   1.4
  ],
  [
   217.93,
   1.4
  ],
  [
   229.28,
   2.2
  ],
  [
   239.43,
   2.3
  ],
  [
   249.05,
   2.3
  ],
  [
   257.27,
   3.2
  ],
  [
   258.07,
   3.6
  ],
  [
   267.27,
   1.7
  ],
  [
   275.88,
   2.2
  ],
  [
   276.88,
   2.2
  ],
  [
   283.33,
   3.08
  ],
  [
   283.33,
   4.48
  ],
  [
   297.95,
   6.9
  ],
  [
   303.33,
   6.5
  ],
  [
   308.86,
   6.1
  ],
  [
   314.42,
   6.5
  ],
  [
   319.82,
   6.9
  ],
  [
   333.78,
   7.7
  ],
  [
   340.95,
   9.4
  ],
  [
   341.85,
   9.5
  ],
  [
   339.78,
   8.7
  ],
  [
   349.7,
   7.1
  ],
  [
   356.26,
   8.8
  ],
  [
   357.16,
   8.9
  ],
  [
   364.56,
   7.9
  ],
  [
   395.66,
   1.7
  ],
  [
   403.66,
   1.7
  ],
  [
   411.31,
   2.3
  ],
  [
   419.41,
   2.3
  ],
  [
   427.33,
   3.08
  ],
  [
   427.33,
   4.48
  ],
  [
   441.85,
   7.3
  ],
  [
   447.04,
   7.9
  ],
  [
   452.51,
   8.1
  ],
  [
   457.82,
   8.5
  ],
  [
   462.72,
   8.9
  ],
  [
   476.37,
   8.5
  ],
  [
   482.48,
   10.2
  ],
  [
   483.38,
   10.3
  ],
  [
   481.52,
   9.5
  ],
  [
   490.36,
   8.5
  ],
  [
   495.97,
   9.5
  ],
  [
   515.41,
   9.3
  ],
  [
   528.13,
   9.7
  ],
  [
   533.64,
   9.7
  ],
  [
   539.18,
   9.7
  ],
  [
   544.82,
   9.3
  ],
  [
   558.95,
   10.1
  ],
  [
   572.07,
   9.7
  ],
  [
   578.04,
   11.4
  ],
  [
   578.94,
   11.5
  ],
  [
   577.1,
   10.7
  ],
  [
   585.99,
   9.7
  ],
  [
   590.51,
   10.7
  ],
  [
   598.63,
   9.7
  ],
  [
   613.43,
   10.3
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "YOU USED TO COME AROUND. NOT TODAY.",
  "THE OLD TIMES WERE FASTER.",
  "THE ALLEY FLICKERED. YOU BLINKED.",
  "CLOSE TO YOUR HEART. FAR FROM THE CHECKPOINT.",
  "SHE WAS ONLY A REFLECTION. SO WAS YOUR RUN.",
  "ROUND AND ROUND. AND BACK TO THE START.",
  "TAKE THE WEIGHT AWAY. THEN RUN.",
  "THE GALAXY WON'T WAIT."
 ],
 "goal": {
  "x": 627.11,
  "y": 9.0
 }
};
