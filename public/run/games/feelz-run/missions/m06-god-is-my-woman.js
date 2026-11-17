/*
  FEELZ RUN - MISSION 06: GOD IS MY WOMAN
  Into the Veil with Zora as the guide: floating corridors and rooms that turn. No enemies, just the drop.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m06 = {
 "id": "m06",
 "number": 6,
 "title": "GOD IS MY WOMAN",
 "world": "THE VEIL",
 "song": {
  "title": "God is My Woman",
  "src": "assets/audio/m06-god-is-my-woman.mp3",
  "lyrics": "assets/lyrics/m06-god-is-my-woman.txt",
  "seconds": 231.1
 },
 "length": 844.86,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 9.6,
   "checkpoint": {
    "x": 28.62,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "CHORUS 1",
   "start": 9.6,
   "end": 43.5,
   "checkpoint": {
    "x": 145.51,
    "y": 6.0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 43.5,
   "end": 68.0,
   "checkpoint": {
    "x": 234.33,
    "y": 8.0
   },
   "storm": false
  },
  {
   "name": "CHORUS 2",
   "start": 68.0,
   "end": 90.2,
   "checkpoint": {
    "x": 314.92,
    "y": 8.0
   },
   "storm": false
  },
  {
   "name": "VERSE 2",
   "start": 90.2,
   "end": 113.2,
   "checkpoint": {
    "x": 398.27,
    "y": 9.2
   },
   "storm": false
  },
  {
   "name": "CHORUS 3",
   "start": 113.2,
   "end": 136.4,
   "checkpoint": {
    "x": 482.31,
    "y": 10.6
   },
   "storm": false
  },
  {
   "name": "BRIDGE",
   "start": 136.4,
   "end": 148.2,
   "checkpoint": {
    "x": 529.5,
    "y": 9.4
   },
   "storm": false
  },
  {
   "name": "CHORUS 4",
   "start": 148.2,
   "end": 172.4,
   "checkpoint": {
    "x": 616.34,
    "y": 10.2
   },
   "storm": false
  },
  {
   "name": "BRIDGE 2",
   "start": 172.4,
   "end": 194.1,
   "checkpoint": {
    "x": 695.21,
    "y": 11.0
   },
   "storm": false
  },
  {
   "name": "OUTRO",
   "start": 194.1,
   "end": 231.1,
   "checkpoint": {
    "x": 826.86,
    "y": 10.6
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": false,
 "debrisEvery": 1.6,
 "bpm": 112.3,
 "shelters": [],
 "weather": {
  "rain": 0,
  "wind": 0.03
 },
 "lightning": [],
 "sections": [
  {
   "from": 0.0,
   "name": "THE FOUNTAIN AT DUSK",
   "world": "uc",
   "backdrop": "m6-loc-01-fountain-dusk"
  },
  {
   "from": 31.62,
   "name": "THE FOUNTAIN AT DUSK",
   "world": "uc",
   "backdrop": "m6-loc-01-fountain-dusk",
   "fallBelow": 4.0
  },
  {
   "from": 41.62,
   "name": "THE VEIL CORRIDORS",
   "world": "ve",
   "backdrop": "m6-loc-01-fountain-dusk",
   "fallBelow": 4.0
  },
  {
   "from": 101.84,
   "name": "THE VEIL CORRIDORS",
   "world": "ve",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 4.6
  },
  {
   "from": 238.33,
   "name": "PARADISE OF MY OWN",
   "world": "ve",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 7.0
  },
  {
   "from": 318.92,
   "name": "THE TURNING ROOMS",
   "world": "ve",
   "backdrop": "m15-loc-02-platform-over-void",
   "fallBelow": 7.0
  },
  {
   "from": 402.27,
   "name": "YOU'RE AN ANGEL",
   "world": "ve",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 8.4
  },
  {
   "from": 486.31,
   "name": "THE STORMS WON'T LAST",
   "world": "de",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 8.4
  },
  {
   "from": 533.5,
   "name": "HOLDING ON TO YOU",
   "world": "de",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 8.4
  },
  {
   "from": 620.34,
   "name": "NEVER THERE ALONE",
   "world": "ve",
   "backdrop": "m6-loc-04-folding-city-desert",
   "fallBelow": 8.6
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
 "turns": [
  {
   "x": 106.84,
   "w": 3.4,
   "y": 5.6,
   "period": 4.274,
   "offset": 2.74
  },
  {
   "x": 115.24,
   "w": 3.4,
   "y": 5.6,
   "period": 4.274,
   "offset": 3.14
  },
  {
   "x": 154.51,
   "w": 3.4,
   "y": 6.0,
   "period": 4.274,
   "offset": 0.32
  },
  {
   "x": 162.91,
   "w": 3.4,
   "y": 6.0,
   "period": 4.274,
   "offset": 2.28
  },
  {
   "x": 171.31,
   "w": 3.4,
   "y": 6.0,
   "period": 4.274,
   "offset": 4.22
  },
  {
   "x": 281.98,
   "w": 3.4,
   "y": 8.4,
   "period": 4.274,
   "offset": 0.29
  },
  {
   "x": 290.38,
   "w": 3.4,
   "y": 8.4,
   "period": 4.274,
   "offset": 1.82
  },
  {
   "x": 323.92,
   "w": 3.4,
   "y": 8.0,
   "period": 4.274,
   "offset": 3.08
  },
  {
   "x": 332.32,
   "w": 3.4,
   "y": 8.0,
   "period": 3.205,
   "offset": 1.53
  },
  {
   "x": 340.72,
   "w": 3.4,
   "y": 8.0,
   "period": 4.274,
   "offset": 1.9
  },
  {
   "x": 447.09,
   "w": 3.4,
   "y": 11.2,
   "period": 4.274,
   "offset": 2.84
  },
  {
   "x": 455.49,
   "w": 3.4,
   "y": 11.2,
   "period": 4.274,
   "offset": 3.18
  },
  {
   "x": 538.5,
   "w": 3.4,
   "y": 9.4,
   "period": 4.274,
   "offset": 0.3
  },
  {
   "x": 546.9,
   "w": 3.4,
   "y": 9.4,
   "period": 3.205,
   "offset": 2.15
  },
  {
   "x": 555.3,
   "w": 3.4,
   "y": 9.4,
   "period": 4.274,
   "offset": 1.85
  },
  {
   "x": 704.21,
   "w": 3.4,
   "y": 11.0,
   "period": 4.274,
   "offset": 0.99
  },
  {
   "x": 712.61,
   "w": 3.4,
   "y": 11.0,
   "period": 4.274,
   "offset": 0.37
  }
 ],
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
   "x": 18.0,
   "y": 0.0,
   "facing": -1
  },
  {
   "who": "ZORA",
   "x": 180.71,
   "y": 6.0,
   "facing": -1,
   "ghost": true
  },
  {
   "who": "ZORA",
   "x": 722.01,
   "y": 11.0,
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
   "kind": "crate",
   "x": 13.0,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 21.5,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 22.7,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 23.9,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 38.12,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 31.62,
   "w": 10,
   "top": 5.0
  },
  {
   "kind": "catwalk",
   "x": 43.75,
   "w": 4.75,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 50.84,
   "w": 4.95,
   "top": 5.6
  },
  {
   "kind": "catwalk",
   "x": 58.12,
   "w": 5.12,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 65.19,
   "w": 4.64,
   "top": 6.6
  },
  {
   "kind": "catwalk",
   "x": 71.99,
   "w": 5.24,
   "top": 5.8
  },
  {
   "kind": "catwalk",
   "x": 79.39,
   "w": 5.34,
   "top": 5.0
  },
  {
   "kind": "catwalk",
   "x": 86.7,
   "w": 5.14,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 93.84,
   "w": 8,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 102.34,
   "w": 4.5,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 110.74,
   "w": 4.5,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 118.64,
   "w": 6,
   "top": 5.6
  },
  {
   "kind": "roof",
   "x": 127.01,
   "w": 12.51,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 141.51,
   "w": 8,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 150.01,
   "w": 4.5,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 158.41,
   "w": 4.5,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 166.81,
   "w": 4.5,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 174.71,
   "w": 6,
   "top": 6.0
  },
  {
   "kind": "catwalk",
   "x": 182.79,
   "w": 5.98,
   "top": 6.4
  },
  {
   "kind": "catwalk",
   "x": 191.09,
   "w": 4.99,
   "top": 6.8
  },
  {
   "kind": "catwalk",
   "x": 198.13,
   "w": 4.99,
   "top": 7.4
  },
  {
   "kind": "catwalk",
   "x": 205.49,
   "w": 4.79,
   "top": 7.6
  },
  {
   "kind": "roof",
   "x": 212.28,
   "w": 8,
   "top": 7.6
  },
  {
   "kind": "roof",
   "x": 222.33,
   "w": 6,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 230.33,
   "w": 8,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 240.54,
   "w": 5.17,
   "top": 8.8
  },
  {
   "kind": "catwalk",
   "x": 247.63,
   "w": 5.79,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 255.54,
   "w": 4.5,
   "top": 8.0
  },
  {
   "kind": "catwalk",
   "x": 261.97,
   "w": 5.0,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 268.98,
   "w": 8,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 277.48,
   "w": 4.5,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 285.88,
   "w": 4.5,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 293.78,
   "w": 6,
   "top": 8.4
  },
  {
   "kind": "roof",
   "x": 302.05,
   "w": 6.87,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 310.92,
   "w": 8,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 319.42,
   "w": 4.5,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 327.82,
   "w": 4.5,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 336.22,
   "w": 4.5,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 344.12,
   "w": 6,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 352.47,
   "w": 10.55,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 365.37,
   "w": 11.87,
   "top": 8.6
  },
  {
   "kind": "vent",
   "x": 371.31,
   "w": 0.9,
   "top": 9.7
  },
  {
   "kind": "roof",
   "x": 379.37,
   "w": 12.9,
   "top": 9.2
  },
  {
   "kind": "roof",
   "x": 394.27,
   "w": 8,
   "top": 9.2
  },
  {
   "kind": "catwalk",
   "x": 404.57,
   "w": 5.29,
   "top": 9.4
  },
  {
   "kind": "catwalk",
   "x": 412.11,
   "w": 5.43,
   "top": 10.2
  },
  {
   "kind": "catwalk",
   "x": 419.55,
   "w": 4.73,
   "top": 10.4
  },
  {
   "kind": "catwalk",
   "x": 426.6,
   "w": 5.49,
   "top": 11.2
  },
  {
   "kind": "roof",
   "x": 434.09,
   "w": 8,
   "top": 11.2
  },
  {
   "kind": "roof",
   "x": 442.59,
   "w": 4.5,
   "top": 11.2
  },
  {
   "kind": "roof",
   "x": 450.99,
   "w": 4.5,
   "top": 11.2
  },
  {
   "kind": "roof",
   "x": 458.89,
   "w": 6,
   "top": 11.2
  },
  {
   "kind": "roof",
   "x": 467.35,
   "w": 8.96,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 478.31,
   "w": 8,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 488.58,
   "w": 12.36,
   "top": 10.6
  },
  {
   "kind": "vent",
   "x": 494.76,
   "w": 0.9,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 503.04,
   "w": 11.98,
   "top": 10.0
  },
  {
   "kind": "vent",
   "x": 509.03,
   "w": 0.9,
   "top": 11.1
  },
  {
   "kind": "roof",
   "x": 517.5,
   "w": 6,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 525.5,
   "w": 8,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 534.0,
   "w": 4.5,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 542.4,
   "w": 4.5,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 550.8,
   "w": 4.5,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 558.7,
   "w": 6,
   "top": 9.4
  },
  {
   "kind": "catwalk",
   "x": 566.65,
   "w": 4.55,
   "top": 9.6
  },
  {
   "kind": "catwalk",
   "x": 573.48,
   "w": 5.3,
   "top": 10.4
  },
  {
   "kind": "catwalk",
   "x": 581.06,
   "w": 5.47,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 588.52,
   "w": 8,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 598.8,
   "w": 11.54,
   "top": 10.2
  },
  {
   "kind": "roof",
   "x": 612.34,
   "w": 8,
   "top": 10.2
  },
  {
   "kind": "catwalk",
   "x": 622.62,
   "w": 5.59,
   "top": 10.2
  },
  {
   "kind": "catwalk",
   "x": 630.4,
   "w": 4.95,
   "top": 9.8
  },
  {
   "kind": "catwalk",
   "x": 637.27,
   "w": 4.91,
   "top": 10.4
  },
  {
   "kind": "catwalk",
   "x": 644.37,
   "w": 5.66,
   "top": 9.6
  },
  {
   "kind": "catwalk",
   "x": 652.39,
   "w": 5.53,
   "top": 10.4
  },
  {
   "kind": "catwalk",
   "x": 659.97,
   "w": 5.74,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 667.71,
   "w": 8,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 677.9,
   "w": 11.31,
   "top": 11.0
  },
  {
   "kind": "vent",
   "x": 683.55,
   "w": 0.9,
   "top": 12.1
  },
  {
   "kind": "roof",
   "x": 691.21,
   "w": 8,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 699.71,
   "w": 4.5,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 708.11,
   "w": 4.5,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 716.01,
   "w": 6,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 724.18,
   "w": 13.77,
   "top": 11.0
  },
  {
   "kind": "vent",
   "x": 731.07,
   "w": 0.9,
   "top": 12.1
  },
  {
   "kind": "roof",
   "x": 740.19,
   "w": 6,
   "top": 11.0
  },
  {
   "kind": "roof",
   "x": 748.21,
   "w": 10.41,
   "top": 10.6
  },
  {
   "kind": "vent",
   "x": 753.41,
   "w": 0.9,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 761.01,
   "w": 11.62,
   "top": 10.6
  },
  {
   "kind": "vent",
   "x": 766.82,
   "w": 0.9,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 774.65,
   "w": 10.37,
   "top": 10.6
  },
  {
   "kind": "vent",
   "x": 779.83,
   "w": 0.9,
   "top": 11.7
  },
  {
   "kind": "roof",
   "x": 787.31,
   "w": 10.93,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 800.34,
   "w": 10.38,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 812.92,
   "w": 7.94,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 822.86,
   "w": 8,
   "top": 10.6
  },
  {
   "kind": "roof",
   "x": 830.86,
   "w": 10,
   "top": 10.6
  }
 ],
 "climbs": [
  {
   "x": 31.37,
   "bottom": 0,
   "top": 5.0
  }
 ],
 "mud": [],
 "wardens": [],
 "drones": [],
 "boosts": [
  {
   "x": 297.78,
   "y": 9.2
  },
  {
   "x": 673.71,
   "y": 11.8
  }
 ],
 "rewinds": [
  {
   "x": 347.12,
   "y": 10.3
  }
 ],
 "coin": {
  "x": 470.04,
  "y": 13.8
 },
 "journal": [{"id":"M06_memory_1","x":185.78,"y":7.9},{"id":"M06_record_1","x":429.35,"y":12.7},{"id":"M06_lyric","x":679.1,"y":12.5}],
 "journalText": {
    "M06_memory_1": {
      "kind": "Memory trace",
      "title": "A carved heart",
      "text": "A heart carved into ancient Veil stone. He recognises the hand that carved it.",
      "image": "assets/journal/M06_memory_1.webp"
    },
    "M06_record_1": {
      "kind": "City record",
      "title": "Veil crack",
      "text": "Through a thin place in the ground: the Circle's mines, working far below.",
      "image": "assets/journal/M06_record_1.webp"
    },
    "M06_lyric": {
      "kind": "Lyric fragment",
      "title": "\"Holding on to you is like a paradise of my own\"",
      "text": "Written in drifting gold sand. From \"God is My Woman\", track 6.",
      "image": "assets/journal/M06_lyric.webp"
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
   13.3,
   1.7
  ],
  [
   23.2,
   3.2
  ],
  [
   24.0,
   3.6
  ],
  [
   30.72,
   2.75
  ],
  [
   30.72,
   4.0
  ],
  [
   46.12,
   6.9
  ],
  [
   53.32,
   6.9
  ],
  [
   53.32,
   8.6
  ],
  [
   60.68,
   7.3
  ],
  [
   67.51,
   7.9
  ],
  [
   74.62,
   7.1
  ],
  [
   82.06,
   6.3
  ],
  [
   89.27,
   6.9
  ],
  [
   104.54,
   6.9
  ],
  [
   108.54,
   7.0
  ],
  [
   112.94,
   6.9
  ],
  [
   116.94,
   7.0
  ],
  [
   128.21,
   7.3
  ],
  [
   152.21,
   7.3
  ],
  [
   156.21,
   7.4
  ],
  [
   160.61,
   7.3
  ],
  [
   164.61,
   7.4
  ],
  [
   169.01,
   7.3
  ],
  [
   173.01,
   7.4
  ],
  [
   185.78,
   7.7
  ],
  [
   193.58,
   8.1
  ],
  [
   200.62,
   8.7
  ],
  [
   200.62,
   10.4
  ],
  [
   207.89,
   8.9
  ],
  [
   223.53,
   9.3
  ],
  [
   243.13,
   10.1
  ],
  [
   250.52,
   9.3
  ],
  [
   257.79,
   9.3
  ],
  [
   257.79,
   11.0
  ],
  [
   264.47,
   9.7
  ],
  [
   279.68,
   9.7
  ],
  [
   283.68,
   9.8
  ],
  [
   288.08,
   9.7
  ],
  [
   292.08,
   9.8
  ],
  [
   303.25,
   9.3
  ],
  [
   321.62,
   9.3
  ],
  [
   325.62,
   9.4
  ],
  [
   330.02,
   9.3
  ],
  [
   334.02,
   9.4
  ],
  [
   338.42,
   9.3
  ],
  [
   342.42,
   9.4
  ],
  [
   353.67,
   9.3
  ],
  [
   366.57,
   9.9
  ],
  [
   372.73,
   11.6
  ],
  [
   373.63,
   11.7
  ],
  [
   371.76,
   10.9
  ],
  [
   380.57,
   10.5
  ],
  [
   407.21,
   10.7
  ],
  [
   414.83,
   11.5
  ],
  [
   421.91,
   11.7
  ],
  [
   429.35,
   12.5
  ],
  [
   444.79,
   12.5
  ],
  [
   448.79,
   12.6
  ],
  [
   453.19,
   12.5
  ],
  [
   457.19,
   12.6
  ],
  [
   468.55,
   11.9
  ],
  [
   489.78,
   11.9
  ],
  [
   496.24,
   13.6
  ],
  [
   497.14,
   13.7
  ],
  [
   495.21,
   12.9
  ],
  [
   504.24,
   11.3
  ],
  [
   510.46,
   13.0
  ],
  [
   511.36,
   13.1
  ],
  [
   509.48,
   12.3
  ],
  [
   518.7,
   10.7
  ],
  [
   536.2,
   10.7
  ],
  [
   540.2,
   10.8
  ],
  [
   544.6,
   10.7
  ],
  [
   548.6,
   10.8
  ],
  [
   553.0,
   10.7
  ],
  [
   557.0,
   10.8
  ],
  [
   568.93,
   10.9
  ],
  [
   576.13,
   11.7
  ],
  [
   583.79,
   11.9
  ],
  [
   600.0,
   11.5
  ],
  [
   625.42,
   11.5
  ],
  [
   625.42,
   13.2
  ],
  [
   632.87,
   11.1
  ],
  [
   639.72,
   11.7
  ],
  [
   639.72,
   13.4
  ],
  [
   647.2,
   10.9
  ],
  [
   655.16,
   11.7
  ],
  [
   662.84,
   12.3
  ],
  [
   679.1,
   12.3
  ],
  [
   684.91,
   14.0
  ],
  [
   685.81,
   14.1
  ],
  [
   684.0,
   13.3
  ],
  [
   701.91,
   12.3
  ],
  [
   705.91,
   12.4
  ],
  [
   710.31,
   12.3
  ],
  [
   714.31,
   12.4
  ],
  [
   725.38,
   12.3
  ],
  [
   731.52,
   13.3
  ],
  [
   741.39,
   12.3
  ],
  [
   749.41,
   11.9
  ],
  [
   753.86,
   12.9
  ],
  [
   762.21,
   11.9
  ],
  [
   768.22,
   13.6
  ],
  [
   769.12,
   13.7
  ],
  [
   767.27,
   12.9
  ],
  [
   775.85,
   11.9
  ],
  [
   781.08,
   13.6
  ],
  [
   781.98,
   13.7
  ],
  [
   780.28,
   12.9
  ],
  [
   788.51,
   11.9
  ],
  [
   801.54,
   11.9
  ],
  [
   806.77,
   13.6
  ],
  [
   807.67,
   13.7
  ],
  [
   814.12,
   11.9
  ]
 ],
 "recordSpacing": 4.5,
 "decor": [],
 "taunts": [
  "THE VEIL LET YOU FALL.",
  "HOLD ON TIGHTER.",
  "PARADISE HAS A TIME LIMIT.",
  "SHE WAITED. THEN SHE DIDN'T.",
  "NO GUIDANCE NEEDED? CLEARLY NEEDED.",
  "THE ROOM TURNED. YOU DIDN'T.",
  "AN ANGEL WOULD HAVE MADE IT.",
  "THE STORMS WON'T LAST. NEITHER DID YOU."
 ],
 "goal": {
  "x": 826.86,
  "y": 10.6
 }
};
