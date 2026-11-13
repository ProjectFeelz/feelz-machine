/*
  FEELZ RUN - MISSION 12: MY BROTHERS
  Past the wall to the old station, with dust figures of the brothers he lost. Then a storm, and the climb to the summit.
  Every distance and height is in metres: x runs left to right, y is the height
  above the street. Each part of the song ends at a checkpoint you must reach
  before the next part starts.
*/

"use strict";

window.MISSION_DATA = window.MISSION_DATA || {};

MISSION_DATA.m12 = {
 "id": "m12",
 "number": 12,
 "title": "MY BROTHERS",
 "world": "LOWER CITY",
 "song": {
  "title": "My Brothers",
  "src": "assets/audio/m12-my-brothers.mp3",
  "lyrics": "assets/lyrics/m12-my-brothers.txt",
  "seconds": 219.4
 },
 "length": 795.21,
 "startX": 1.5,
 "parts": [
  {
   "name": "INTRO",
   "start": 0,
   "end": 11.6,
   "checkpoint": {
    "x": 35.37,
    "y": 0
   },
   "storm": false
  },
  {
   "name": "VERSE 1",
   "start": 11.6,
   "end": 42.2,
   "checkpoint": {
    "x": 143.01,
    "y": 8.2
   },
   "storm": false,
   "hound": true
  },
  {
   "name": "CHORUS 1",
   "start": 42.2,
   "end": 74.7,
   "checkpoint": {
    "x": 262.57,
    "y": 10.0
   },
   "storm": true,
   "air": true
  },
  {
   "name": "VERSE 2",
   "start": 74.7,
   "end": 101.9,
   "checkpoint": {
    "x": 364.0,
    "y": 7.0
   },
   "storm": false,
   "hound": true
  },
  {
   "name": "CHORUS 2",
   "start": 101.9,
   "end": 137.4,
   "checkpoint": {
    "x": 479.19,
    "y": 10.0
   },
   "storm": true,
   "air": true
  },
  {
   "name": "BRIDGE",
   "start": 137.4,
   "end": 151.2,
   "checkpoint": {
    "x": 530.8,
    "y": 16.0
   },
   "storm": false
  },
  {
   "name": "HOOK",
   "start": 151.2,
   "end": 178.0,
   "checkpoint": {
    "x": 627.59,
    "y": 14.6
   },
   "storm": false
  },
  {
   "name": "OUTRO",
   "start": 178.0,
   "end": 219.4,
   "checkpoint": {
    "x": 777.21,
    "y": 16.8
   },
   "storm": false,
   "finish": true
  }
 ],
 "stormChase": true,
 "debrisEvery": 3.0,
 "bpm": 143.6,
 "shelters": [
  {
   "from": 278.57,
   "to": 304.28
  }
 ],
 "weather": {
  "rain": 0.1,
  "wind": 0.12
 },
 "lightning": [
  42.2,
  47.8,
  53.4,
  59.0,
  64.6,
  70.2,
  101.9,
  107.5,
  113.1,
  118.7,
  124.3,
  129.9,
  135.5
 ],
 "sections": [
  {
   "from": 0.0,
   "name": "THE TUNNEL THROUGH THE WALL",
   "world": "lc",
   "backdrop": "m12-loc-01-outer-wall-tunnel"
  },
  {
   "from": 36.87,
   "name": "THE DUNES",
   "world": "de",
   "backdrop": "m12-loc-01-outer-wall-tunnel"
  },
  {
   "from": 62.37,
   "name": "A STAR IN MY EYES",
   "world": "de",
   "backdrop": "m12-loc-01-outer-wall-tunnel",
   "fallBelow": 2.0
  },
  {
   "from": 272.57,
   "name": "A STAR IN MY EYES",
   "world": "de",
   "backdrop": "m12-loc-01-outer-wall-tunnel"
  },
  {
   "from": 275.57,
   "name": "THE BURIED STATION",
   "world": "ve",
   "backdrop": "m12-loc-01-outer-wall-tunnel"
  },
  {
   "from": 320.78,
   "name": "THE STORM ESCAPE",
   "world": "de",
   "backdrop": "m12-loc-01-outer-wall-tunnel",
   "fallBelow": 5.4
  },
  {
   "from": 368.0,
   "name": "THE ROCK FORMATION",
   "world": "de",
   "backdrop": "m12-loc-04-rock-formation-storm",
   "fallBelow": 4.8
  },
  {
   "from": 483.19,
   "name": "THE SUMMIT CLIMB",
   "world": "de",
   "backdrop": "m12-loc-04-rock-formation-storm",
   "fallBelow": 12.0
  },
  {
   "from": 534.8,
   "name": "TIME IS STANDING STILL",
   "world": "de",
   "backdrop": "m12-loc-04-rock-formation-storm",
   "fallBelow": 13.6
  },
  {
   "from": 631.59,
   "name": "THE SUMMIT",
   "world": "uc",
   "backdrop": "m12-loc-04-rock-formation-storm",
   "fallBelow": 13.2
  }
 ],
 "inward": [],
 "tunnels": [],
 "ziplines": [
  {
   "x1": 560.99,
   "y1": 18.2,
   "x2": 578.09,
   "y2": 17.2
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
 "filters": [
  {
   "x": 73.87,
   "y": 6.0
  },
  {
   "x": 184.13,
   "y": 8.6
  },
  {
   "x": 218.39,
   "y": 10.0
  },
  {
   "x": 332.28,
   "y": 6.4
  },
  {
   "x": 394.11,
   "y": 6.4
  },
  {
   "x": 431.45,
   "y": 10.0
  }
 ],
 "roses": [],
 "broken": [
  {
   "x": 152.97,
   "w": 1.63,
   "y": 9.4,
   "crumble": true
  },
  {
   "x": 164.42,
   "w": 1.49,
   "y": 9.6,
   "crumble": true
  },
  {
   "x": 175.99,
   "w": 1.74,
   "y": 10.2,
   "crumble": true
  },
  {
   "x": 192.12,
   "w": 1.68,
   "y": 11.0,
   "crumble": true
  },
  {
   "x": 203.47,
   "w": 1.73,
   "y": 11.2,
   "crumble": true
  },
  {
   "x": 373.82,
   "w": 1.82,
   "y": 7.8,
   "crumble": true
  },
  {
   "x": 385.81,
   "w": 1.86,
   "y": 8.0,
   "crumble": true
  },
  {
   "x": 418.23,
   "w": 1.48,
   "y": 11.6,
   "crumble": true
  }
 ],
 "npcs": [
  {
   "who": "KODA_BROTHER",
   "x": 54.87,
   "y": 0.0,
   "facing": 1,
   "ghost": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 150.87,
   "y": 8.2,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 156.77,
   "y": 7.8,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 162.39,
   "y": 7.4,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 167.9,
   "y": 8.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 173.84,
   "y": 8.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 179.58,
   "y": 8.6,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 190.23,
   "y": 9.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 195.91,
   "y": 9.4,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 201.46,
   "y": 9.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 207.22,
   "y": 9.6,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 213.34,
   "y": 10.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "CREW_4_HEAVY",
   "x": 279.57,
   "y": 0.0,
   "facing": 1,
   "ghost": true
  },
  {
   "who": "CREW_6_CROP",
   "x": 281.57,
   "y": 0.0,
   "facing": 1,
   "ghost": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 371.78,
   "y": 6.6,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 377.92,
   "y": 6.2,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 383.75,
   "y": 5.8,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 389.54,
   "y": 6.4,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 416.31,
   "y": 10.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 421.53,
   "y": 10.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 426.93,
   "y": 10.0,
   "facing": -1,
   "ghost": true,
   "dust": true
  },
  {
   "who": "KODA_BROTHER",
   "x": 671.77,
   "y": 17.2,
   "facing": 1,
   "ghost": true
  }
 ],
 "mirror": true,
 "stealth": false,
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
   "w": 11.37,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "crate",
   "x": 39.87,
   "w": 0.5,
   "top": 0.5,
   "art": "crate_half"
  },
  {
   "kind": "crate",
   "x": 48.95,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 55.87,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "crate",
   "x": 57.07,
   "w": 1.0,
   "top": 2.0
  },
  {
   "kind": "crate",
   "x": 58.27,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ground",
   "x": -6,
   "w": 68.87,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 62.37,
   "w": 10,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 72.37,
   "w": 4,
   "top": 6.0
  },
  {
   "kind": "roof",
   "x": 78.76,
   "w": 10.56,
   "top": 6.4
  },
  {
   "kind": "vent",
   "x": 84.04,
   "w": 0.9,
   "top": 7.5
  },
  {
   "kind": "roof",
   "x": 91.69,
   "w": 10.03,
   "top": 7.0
  },
  {
   "kind": "vent",
   "x": 96.7,
   "w": 0.9,
   "top": 8.1
  },
  {
   "kind": "roof",
   "x": 104.13,
   "w": 12.24,
   "top": 7.6
  },
  {
   "kind": "vent",
   "x": 110.25,
   "w": 0.9,
   "top": 8.7
  },
  {
   "kind": "roof",
   "x": 118.7,
   "w": 10.19,
   "top": 7.6
  },
  {
   "kind": "vent",
   "x": 123.8,
   "w": 0.9,
   "top": 8.7
  },
  {
   "kind": "roof",
   "x": 131.01,
   "w": 6,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 139.01,
   "w": 8,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 149.07,
   "w": 3.61,
   "top": 8.2
  },
  {
   "kind": "roof",
   "x": 154.91,
   "w": 3.73,
   "top": 7.8
  },
  {
   "kind": "roof",
   "x": 160.65,
   "w": 3.47,
   "top": 7.4
  },
  {
   "kind": "roof",
   "x": 166.21,
   "w": 3.37,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 172.0,
   "w": 3.7,
   "top": 8.0
  },
  {
   "kind": "roof",
   "x": 178.03,
   "w": 3.1,
   "top": 8.6
  },
  {
   "kind": "roof",
   "x": 182.63,
   "w": 4,
   "top": 8.6
  },
  {
   "kind": "roof",
   "x": 188.64,
   "w": 3.19,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 194.11,
   "w": 3.61,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 199.74,
   "w": 3.43,
   "top": 9.0
  },
  {
   "kind": "roof",
   "x": 205.51,
   "w": 3.43,
   "top": 9.6
  },
  {
   "kind": "roof",
   "x": 211.28,
   "w": 4.11,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 216.89,
   "w": 4,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 223.19,
   "w": 12.71,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 237.91,
   "w": 10.6,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 250.57,
   "w": 6,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 258.57,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 268.57,
   "w": 6,
   "top": 3.0
  },
  {
   "kind": "crate",
   "x": 278.57,
   "w": 1.0,
   "top": 1.0
  },
  {
   "kind": "ceiling",
   "x": 290.57,
   "w": 3.5,
   "bottom": 2.8,
   "top": 6
  },
  {
   "kind": "ceiling",
   "x": 294.07,
   "w": 9.21,
   "bottom": 1.45,
   "top": 6
  },
  {
   "kind": "ground",
   "x": 272.57,
   "w": 48.71,
   "top": 0
  },
  {
   "kind": "roof",
   "x": 320.78,
   "w": 10,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 330.78,
   "w": 4,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 337.22,
   "w": 12.28,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 352.0,
   "w": 6,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 360.0,
   "w": 8,
   "top": 7.0
  },
  {
   "kind": "roof",
   "x": 370.04,
   "w": 3.48,
   "top": 6.6
  },
  {
   "kind": "roof",
   "x": 375.95,
   "w": 3.96,
   "top": 6.2
  },
  {
   "kind": "roof",
   "x": 381.99,
   "w": 3.52,
   "top": 5.8
  },
  {
   "kind": "roof",
   "x": 387.97,
   "w": 3.14,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 392.61,
   "w": 4,
   "top": 6.4
  },
  {
   "kind": "roof",
   "x": 396.61,
   "w": 8,
   "top": 9.4
  },
  {
   "kind": "roof",
   "x": 404.61,
   "w": 8,
   "top": 12.4
  },
  {
   "kind": "roof",
   "x": 414.68,
   "w": 3.25,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 420.01,
   "w": 3.04,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 425.4,
   "w": 3.05,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 429.95,
   "w": 4,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 436.12,
   "w": 11.79,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 449.93,
   "w": 13.22,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 465.52,
   "w": 7.66,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 475.19,
   "w": 8,
   "top": 10.0
  },
  {
   "kind": "roof",
   "x": 483.19,
   "w": 8,
   "top": 13.0
  },
  {
   "kind": "roof",
   "x": 491.19,
   "w": 8,
   "top": 16.0
  },
  {
   "kind": "roof",
   "x": 501.37,
   "w": 13.26,
   "top": 16.0
  },
  {
   "kind": "roof",
   "x": 516.72,
   "w": 8.08,
   "top": 16.0
  },
  {
   "kind": "roof",
   "x": 526.8,
   "w": 8,
   "top": 16.0
  },
  {
   "kind": "roof",
   "x": 537.26,
   "w": 12.04,
   "top": 15.6
  },
  {
   "kind": "vent",
   "x": 543.28,
   "w": 0.9,
   "top": 16.7
  },
  {
   "kind": "roof",
   "x": 551.59,
   "w": 6,
   "top": 15.6
  },
  {
   "kind": "roof",
   "x": 558.59,
   "w": 5,
   "top": 15.6
  },
  {
   "kind": "roof",
   "x": 576.59,
   "w": 9,
   "top": 14.6
  },
  {
   "kind": "roof",
   "x": 588.03,
   "w": 9.56,
   "top": 14.6
  },
  {
   "kind": "roof",
   "x": 599.79,
   "w": 13.4,
   "top": 14.6
  },
  {
   "kind": "roof",
   "x": 615.59,
   "w": 6,
   "top": 14.6
  },
  {
   "kind": "roof",
   "x": 623.59,
   "w": 8,
   "top": 14.6
  },
  {
   "kind": "roof",
   "x": 633.81,
   "w": 11.83,
   "top": 14.2
  },
  {
   "kind": "roof",
   "x": 647.91,
   "w": 11.55,
   "top": 14.2
  },
  {
   "kind": "vent",
   "x": 653.69,
   "w": 0.9,
   "top": 15.3
  },
  {
   "kind": "roof",
   "x": 661.77,
   "w": 6,
   "top": 14.2
  },
  {
   "kind": "roof",
   "x": 667.77,
   "w": 8,
   "top": 17.2
  },
  {
   "kind": "roof",
   "x": 677.81,
   "w": 12.61,
   "top": 17.2
  },
  {
   "kind": "vent",
   "x": 684.11,
   "w": 0.9,
   "top": 18.3
  },
  {
   "kind": "roof",
   "x": 692.8,
   "w": 10.74,
   "top": 17.2
  },
  {
   "kind": "roof",
   "x": 705.93,
   "w": 13.2,
   "top": 17.2
  },
  {
   "kind": "roof",
   "x": 721.46,
   "w": 11.39,
   "top": 17.2
  },
  {
   "kind": "roof",
   "x": 735.35,
   "w": 12.86,
   "top": 17.2
  },
  {
   "kind": "roof",
   "x": 750.31,
   "w": 12.49,
   "top": 16.8
  },
  {
   "kind": "vent",
   "x": 756.56,
   "w": 0.9,
   "top": 17.9
  },
  {
   "kind": "roof",
   "x": 765.21,
   "w": 6,
   "top": 16.8
  },
  {
   "kind": "roof",
   "x": 773.21,
   "w": 8,
   "top": 16.8
  },
  {
   "kind": "roof",
   "x": 781.21,
   "w": 10,
   "top": 16.8
  }
 ],
 "climbs": [
  {
   "x": 62.12,
   "bottom": 0,
   "top": 6.0
  },
  {
   "x": 320.53,
   "bottom": 0,
   "top": 6.4
  },
  {
   "x": 396.36,
   "bottom": 6.4,
   "top": 9.4
  },
  {
   "x": 404.36,
   "bottom": 9.4,
   "top": 12.4
  },
  {
   "x": 482.94,
   "bottom": 10.0,
   "top": 13.0
  },
  {
   "x": 490.94,
   "bottom": 13.0,
   "top": 16.0
  },
  {
   "x": 667.52,
   "bottom": 14.2,
   "top": 17.2
  }
 ],
 "mud": [
  {
   "x": 37.87,
   "w": 4.0
  },
  {
   "x": 53.87,
   "w": 4.0
  },
  {
   "x": 276.57,
   "w": 4.0
  }
 ],
 "wardens": [
  {
   "x": 25.87,
   "y": 0.0,
   "minX": 23.37,
   "maxX": 28.37,
   "kind": "handler"
  },
  {
   "x": 311.28,
   "y": 0.0,
   "minX": 308.78,
   "maxX": 313.78,
   "kind": "handler"
  }
 ],
 "drones": [],
 "boosts": [
  {
   "x": 481.19,
   "y": 10.8
  }
 ],
 "rewinds": [
  {
   "x": 217.89,
   "y": 12.3
  }
 ],
 "coin": {
  "x": 300.18,
  "y": 0.6
 },
 "journal": [{"id":"M12_memory_1","x":173.84,"y":9.6},{"id":"M12_record_1","x":403.71,"y":11.4},{"id":"M12_lyric","x":635.01,"y":15.7}],
 "journalText": {
    "M12_memory_1": {
      "kind": "Memory trace",
      "title": "Initials in the rock",
      "text": "Where seven boys came once. In the memory, they tap their chests twice.",
      "image": "assets/journal/M12_memory_1.webp"
    },
    "M12_record_1": {
      "kind": "City record",
      "title": "Transport manifest",
      "text": "Torn. One line survives: Status: TRANSFERRED - VEIL WORKS, DEEP LEVEL.",
      "image": "assets/journal/M12_record_1.webp"
    },
    "M12_lyric": {
      "kind": "Lyric fragment",
      "title": "\"Will I see you again?\"",
      "text": "Traced in the sand at the foot of the last dust figure. From \"My Brothers\", track 12.",
      "image": "assets/journal/M12_lyric.webp"
    }
  },
 "notes": [
  [
   12.18,
   0.6
  ],
  [
   25.87,
   2.0
  ],
  [
   40.17,
   1.7
  ],
  [
   49.45,
   2.3
  ],
  [
   57.57,
   3.2
  ],
  [
   58.37,
   3.6
  ],
  [
   61.47,
   3.3
  ],
  [
   61.47,
   4.8
  ],
  [
   79.96,
   7.7
  ],
  [
   85.31,
   9.4
  ],
  [
   86.21,
   9.5
  ],
  [
   84.49,
   8.7
  ],
  [
   92.89,
   8.3
  ],
  [
   97.91,
   10.0
  ],
  [
   98.81,
   10.1
  ],
  [
   97.15,
   9.3
  ],
  [
   105.33,
   8.9
  ],
  [
   110.7,
   9.9
  ],
  [
   119.9,
   8.9
  ],
  [
   124.25,
   9.9
  ],
  [
   132.21,
   9.5
  ],
  [
   150.87,
   9.6
  ],
  [
   156.77,
   9.2
  ],
  [
   162.39,
   8.8
  ],
  [
   167.9,
   9.4
  ],
  [
   173.84,
   9.4
  ],
  [
   179.58,
   10.0
  ],
  [
   190.23,
   10.4
  ],
  [
   195.91,
   10.8
  ],
  [
   201.46,
   10.4
  ],
  [
   207.22,
   11.0
  ],
  [
   213.34,
   11.4
  ],
  [
   224.39,
   11.3
  ],
  [
   231.07,
   13.0
  ],
  [
   231.97,
   13.1
  ],
  [
   239.11,
   11.3
  ],
  [
   244.49,
   13.0
  ],
  [
   245.39,
   13.1
  ],
  [
   251.77,
   11.3
  ],
  [
   279.07,
   2.3
  ],
  [
   298.68,
   0.6
  ],
  [
   311.28,
   2.0
  ],
  [
   319.88,
   3.52
  ],
  [
   319.88,
   5.12
  ],
  [
   338.42,
   7.7
  ],
  [
   353.2,
   8.3
  ],
  [
   371.78,
   8.0
  ],
  [
   377.92,
   7.6
  ],
  [
   383.75,
   7.2
  ],
  [
   389.54,
   7.8
  ],
  [
   395.71,
   8.2
  ],
  [
   403.71,
   11.2
  ],
  [
   416.31,
   11.4
  ],
  [
   421.53,
   11.4
  ],
  [
   426.93,
   11.4
  ],
  [
   437.32,
   11.3
  ],
  [
   451.13,
   11.3
  ],
  [
   466.72,
   11.3
  ],
  [
   482.29,
   11.8
  ],
  [
   490.29,
   14.8
  ],
  [
   502.57,
   17.3
  ],
  [
   509.59,
   19.0
  ],
  [
   510.49,
   19.1
  ],
  [
   517.92,
   17.3
  ],
  [
   538.46,
   16.9
  ],
  [
   544.73,
   18.6
  ],
  [
   545.63,
   18.7
  ],
  [
   543.73,
   17.9
  ],
  [
   552.79,
   16.9
  ],
  [
   563.99,
   17.0
  ],
  [
   566.99,
   16.8
  ],
  [
   569.99,
   16.6
  ],
  [
   572.99,
   16.4
  ],
  [
   589.23,
   15.9
  ],
  [
   593.96,
   17.6
  ],
  [
   594.86,
   17.7
  ],
  [
   600.99,
   15.9
  ],
  [
   616.79,
   15.9
  ],
  [
   635.01,
   15.5
  ],
  [
   649.11,
   15.5
  ],
  [
   654.14,
   16.5
  ],
  [
   662.97,
   15.5
  ],
  [
   666.87,
   16.0
  ],
  [
   679.01,
   18.5
  ],
  [
   684.56,
   19.5
  ],
  [
   694.0,
   18.5
  ],
  [
   707.13,
   18.5
  ],
  [
   722.66,
   18.5
  ],
  [
   736.55,
   18.5
  ],
  [
   743.32,
   20.2
  ],
  [
   744.22,
   20.3
  ],
  [
   751.51,
   18.1
  ],
  [
   757.01,
   19.1
  ],
  [
   766.41,
   18.1
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
   "x": 292.32,
   "y": 1.9,
   "h": 0.5,
   "layer": "back",
   "glow": "#8fd0ff"
  }
 ],
 "taunts": [
  "THEY GOT YOUR BACK. YOU DIDN'T GET THERE.",
  "THE STORM DOESN'T CARE WHO YOU LOST.",
  "KEEP YOUR EYES UP. AND YOUR FEET MOVING.",
  "TIME IS STANDING STILL. YOU TOO.",
  "THE BROTHERS WOULD HAVE MADE THAT.",
  "YOU CAN'T TAKE ALL THE WEIGHT. CLEARLY.",
  "WILL YOU SEE THEM AGAIN? NOT AT THAT PACE.",
  "THE STORM GOT THAT ONE."
 ],
 "goal": {
  "x": 777.21,
  "y": 16.8
 }
};
