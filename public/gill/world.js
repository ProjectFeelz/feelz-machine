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
    { name: "Soweto", note: "Low ground west of the river. Home: Vilakazi Street, Orlando, Cosmos City.", colour: "#b49a74" },
    { name: "Joburg CBD", note: "The middle of the city: Maboneng, Park Station, the Carlton Centre, Randburg up the road.", colour: "#8f97a3" },
    { name: "Pretoria", note: "Up the hill: the Union Buildings, Hatfield, Lukasrand Tower.", colour: "#a99bc0" },
    { name: "Fourways", note: "Montecasino's Tuscan streets, north of Soweto.", colour: "#86b07c" },
    { name: "Midrand", note: "Mall of Africa, out on the edge where the veld starts.", colour: "#d9bd78" }
  ],
  zones: [
    { id: "q01", name: "Vilakazi Street", region: "Soweto",  district: "lc", x: 70,  z: 400, w: 150, d: 130, elev: 0,
      about: "Koda's street in Orlando West. Matchbox houses, the neighbours' stoeps, washing lines, Mandela House up the road. Where the Veil broke." },
    { id: "q02", name: "Maboneng", region: "Joburg CBD",  district: "lc", x: 230, z: 300, w: 110, d: 80,  elev: 1,
      about: "Fox Street on a Sunday: the food market, murals on every warehouse wall, rooftop bars and street music." },
    { id: "q08", name: "Orlando Towers", region: "Soweto",  district: "lc", x: 60,  z: 250, w: 130, d: 110, elev: 2,
      about: "The two old cooling towers, painted top to bottom, with the bridge across the top. The wardens fenced them off." },
    { id: "q09", name: "Cosmos City", region: "Soweto",  district: "lc", x: 240, z: 430, w: 90,  d: 140, elev: -2,
      about: "Rows of RDP houses on streets named after countries, spaza shops on the corners. It floods first." },
    { id: "q07", name: "Montecasino", region: "Fourways", district: "rc", x: 150, z: 60,  w: 150, d: 130, elev: 5,
      about: "A Tuscan village dropped in Fourways: piazzas, terracotta roofs, fountains and gardens." },
    { id: "q03", name: "Park Station", region: "Joburg CBD",    district: "mc", x: 410, z: 290, w: 130, d: 90,  elev: 3,
      about: "The station and its taxi rank, the gateway to the CBD across the bridge." },
    { id: "q04", name: "Randburg", region: "Joburg CBD",    district: "mc", x: 570, z: 300, w: 200, d: 70,  elev: 3,
      about: "The long straight run through Randburg: shopfronts, taxis, built for speed and rooftop races." },
    { id: "q05", name: "Hatfield", region: "Pretoria",    district: "mc", x: 590, z: 400, w: 120, d: 100, elev: 2,
      about: "The student strip: the plaza, music spilling out of every bar, jacarandas overhead." },
    { id: "q10", name: "Carlton Centre", region: "Joburg CBD",    district: "mc", x: 420, z: 430, w: 120, d: 110, elev: -3,
      about: "The tallest tower in Africa, with the tunnels and parking levels under it." },
    { id: "q06", name: "Union Buildings", region: "Pretoria",    district: "uc", x: 420, z: 110, w: 140, d: 110, elev: 9,
      about: "The great sandstone crescent on the hill, its gardens and terraces. The Circle's plaza." },
    { id: "q11", name: "Lukasrand Tower", region: "Pretoria",    district: "uc", x: 620, z: 70,  w: 110, d: 110, elev: 15,
      about: "The tower on top of the hill. Sad music plays there at night, and Zora is held." },
    { id: "q12", name: "Mall of Africa", region: "Midrand",   district: "de", x: 770, z: 430, w: 110, d: 120, elev: 0,
      about: "The mall out at the city's edge, and the gate out to the open veld." }
  ],
  roads: [
    { name: "Klipspruit Valley Road",       width: 10, points: [[145, 400], [145, 355], [230, 355]] },
    { name: "Nelson Mandela Bridge",   width: 10, points: [[340, 340], [410, 340]] },
    { name: "Rissik Street",  width: 12, points: [[540, 335], [570, 335]] },
    { name: "Allandale Road",       width: 10, points: [[770, 335], [825, 335], [825, 430]] },
    { name: "Commissioner Street",     width: 9,  points: [[475, 380], [475, 430]] },
    { name: "Burnett Street",       width: 9,  points: [[650, 370], [650, 400]] },
    { name: "Main Reef Road",      width: 8,  points: [[285, 380], [285, 430]] },
    { name: "Soweto Highway",     width: 9,  points: [[330, 480], [420, 480]] },
    { name: "William Nicol Drive", width: 9,  points: [[260, 190], [260, 300]] },
    { name: "Church Street",     width: 10, points: [[475, 290], [475, 220]] },
    { name: "Leyds Street",      width: 9,  points: [[560, 165], [600, 165], [600, 125], [620, 125]] },
    { name: "N1",       width: 12, points: [[30, 210], [30, 600], [880, 600], [880, 30], [110, 30], [30, 210]] }
  ],
  river: [
    [355, 0, 375, 700]
  ],
  bridges: [
    [348, 332, 382, 348, "Nelson Mandela Bridge"],
    [348, 473, 382, 487, "Soweto Highway"],
    [348, 594, 382, 606, "N1"],
    [348, 24, 382, 36, "N1"]
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
