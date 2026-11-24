/* G.I.L.L. THE CITY OF GOOD INTENTIONS
   The map, GTA style: neighbourhoods, a downtown, a hill, small towns and the desert,
   joined by roads, cut by the mud river. Every place belongs to songs on the album.

   x runs west to east, z runs north to south, in metres. y is height.
   zones   the named places. Missions happen inside them. elev is the ground height there;
           the land rises and falls smoothly between places.
   roads   [x, z] points, joined in order, with a width.
   river   the mud river: straight runs of mud, [minX, minZ, maxX, maxZ].
   bridges walkways over the river, [minX, minZ, maxX, maxZ].   */
window.GILL_WORLD = {
  size: [900, 700],
  regions: [
    { name: "Lower City", note: "Low ground west of the river. Home.", colour: "#b49a74" },
    { name: "Downtown", note: "The middle of the city, east of the river.", colour: "#8f97a3" },
    { name: "The Hill", note: "Upper City, where the Circle sits.", colour: "#a99bc0" },
    { name: "Angel Court", note: "A small garden town north of the Yard.", colour: "#86b07c" },
    { name: "East Gate", note: "A desert town at the edge of the city.", colour: "#d9bd78" }
  ],
  zones: [
    { id: "q01", name: "The Yard",      region: "Lower City",  district: "lc", x: 70,  z: 400, w: 150, d: 130, elev: 0,
      about: "Koda's neighbourhood. His building, the neighbours' stoeps, washing lines, kids' chalk. Where the Veil broke." },
    { id: "q02", name: "Chalk Street",  region: "Lower City",  district: "lc", x: 230, z: 300, w: 110, d: 80,  elev: 1,
      about: "A narrow market street of stalls and chalk murals, with awnings to hide under." },
    { id: "q08", name: "Guard House",   region: "Lower City",  district: "lc", x: 60,  z: 250, w: 130, d: 110, elev: 2,
      about: "The wardens' post on the edge of the Lower City: fenced yard, floodlights, barracks." },
    { id: "q09", name: "Paper Lane",    region: "Lower City",  district: "lc", x: 240, z: 430, w: 90,  d: 140, elev: -2,
      about: "A sunken lane down by the river. Paper and rubble everywhere; it floods first." },
    { id: "q07", name: "Angel Court",   region: "Angel Court", district: "rc", x: 150, z: 60,  w: 150, d: 130, elev: 5,
      about: "A small restored garden town on a rise north of the Yard: trees, a fountain, benches." },
    { id: "q03", name: "Ticket Row",    region: "Downtown",    district: "mc", x: 410, z: 290, w: 130, d: 90,  elev: 3,
      about: "The old station and its ticket booths, the gateway to Downtown across the bridge." },
    { id: "q04", name: "The Strip",     region: "Downtown",    district: "mc", x: 570, z: 300, w: 200, d: 70,  elev: 3,
      about: "A long straight boulevard of shopfronts and neon. Built for speed and rooftop races." },
    { id: "q05", name: "Tape Corner",   region: "Downtown",    district: "mc", x: 590, z: 400, w: 120, d: 100, elev: 2,
      about: "The music district: tape shops, a speaker stack, Big Feelz posters." },
    { id: "q10", name: "The Tunnels",   region: "Downtown",    district: "mc", x: 420, z: 430, w: 120, d: 110, elev: -3,
      about: "A sunken pipe yard with the tunnel mouths under Downtown, grates and ladders." },
    { id: "q06", name: "Warden Square", region: "The Hill",    district: "uc", x: 420, z: 110, w: 140, d: 110, elev: 9,
      about: "The Circle's plaza halfway up the hill, reached by long stairs and a winding road." },
    { id: "q11", name: "Old Tower",     region: "The Hill",    district: "uc", x: 620, z: 70,  w: 110, d: 110, elev: 15,
      about: "The top of the hill. The Old Tower, where sad music plays at night and Zora is held." },
    { id: "q12", name: "East Gate",     region: "East Gate",   district: "de", x: 770, z: 430, w: 110, d: 120, elev: 0,
      about: "A small desert town at the city's edge, and the gate out to the open desert." }
  ],
  roads: [
    { name: "Yard Road",       width: 10, points: [[145, 400], [145, 355], [230, 355]] },
    { name: "Market Bridge",   width: 10, points: [[340, 340], [410, 340]] },
    { name: "Station Avenue",  width: 12, points: [[540, 335], [570, 335]] },
    { name: "Gate Road",       width: 10, points: [[770, 335], [825, 335], [825, 430]] },
    { name: "Tunnel Road",     width: 9,  points: [[475, 380], [475, 430]] },
    { name: "Tape Lane",       width: 9,  points: [[650, 370], [650, 400]] },
    { name: "Lane Steps",      width: 8,  points: [[285, 380], [285, 430]] },
    { name: "Lane Bridge",     width: 9,  points: [[330, 480], [420, 480]] },
    { name: "Angel Hill Road", width: 9,  points: [[260, 190], [260, 300]] },
    { name: "Warden Rise",     width: 10, points: [[475, 290], [475, 220]] },
    { name: "Tower Road",      width: 9,  points: [[560, 165], [600, 165], [600, 125], [620, 125]] },
    { name: "Ring Road",       width: 12, points: [[30, 210], [30, 600], [880, 600], [880, 30], [110, 30], [30, 210]] }
  ],
  river: [
    [355, 0, 375, 700]
  ],
  bridges: [
    [348, 332, 382, 348, "Market Bridge"],
    [348, 473, 382, 487, "Lane Bridge"],
    [348, 594, 382, 606, "Ring Road"],
    [348, 24, 382, 36, "Ring Road"]
  ],
  // The album as a road trip: which places each song uses.
  songs: {
    "Hold Me Down": ["q01", "q02", "q07", "q08"],
    "Selina": ["q03", "q04", "q05", "q06"],
    "Put It On Me": ["q09", "q10", "q11", "q12"],
    "Free ride": ["q02", "q03", "q06", "q07"],
    "Where You Dey": ["q04", "q05", "q11", "q12"],
    "Baddest": ["q06", "q08", "q09", "q11"],
    "To My Angels": ["q01", "q07", "q09", "q10"],
    "Not at All": ["q02", "q05", "q08", "q12"],
    "Can't Copy You": ["q03", "q06", "q10", "q11"],
    "That Juice": ["q04", "q09", "q10", "q12"],
    "Thinking of You": ["q05", "q07", "q11", "q12"],
    "Run": ["q09", "q10", "q11", "q12"]
  }
};
