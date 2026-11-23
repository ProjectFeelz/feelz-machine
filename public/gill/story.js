"use strict";

/* ---------------------------------------------------------------------------
   G.I.L.L. STORY AND MISSION DATA

   Everything a player reads lives here, so the story and the missions can be
   rewritten without touching the game. Mirrors the G.I.L.L. Story Bible doc.

   MISSIONS  one per song on Good Intentions Last Longest, played in order.
             Each mission lights up a group of quadrants in the city. Every
             quadrant holds one PART of the song. Finish a quadrant's task and
             its part joins the mix, so the order you play them in is the order
             the song builds up: you produce it.

   PARTS     Until the real stems are ready, the song is split into four parts
             by sound (low end, body, melody, shine). To use real stems, give a
             mission `stems: [{ name: "Drums", src: "url" }, ...]`, one per
             quadrant, all the same length.

   QUADRANTS the 12 blocks of the city. `grid` is (column, row) on the map.
             `focus` is the kind of task the quadrant gives:
               explore  find the part somewhere in the quadrant
               sneak    reach the part without being seen
               fight    clear the guards, the part drops when they're down
               race     step in the ring, reach the part before the clock runs out
--------------------------------------------------------------------------- */

window.GILL_STORY = {
  title: "G.I.L.L.",
  subtitle: "Good Intentions Last Longest",
  artist: "Big Feelz",

  speakers: {
    Koda:      { colour: "#f2b544" },
    Zora:      { colour: "#d58cff" },
    Neighbour: { colour: "#9fd3ff" },
    Handler:   { colour: "#ff6b5a" },
    "":        { colour: "#cfcfcf" }
  },

  quadrants: [
    { id: "q01", name: "The Yard",      grid: [0, 0], focus: "explore", tint: 0x6b5a48 },
    { id: "q02", name: "Chalk Street",  grid: [1, 0], focus: "sneak",   tint: 0x5a5f6e },
    { id: "q03", name: "Ticket Row",    grid: [2, 0], focus: "explore", tint: 0x6e5a5a },
    { id: "q04", name: "The Strip",     grid: [3, 0], focus: "race",    tint: 0x5e6b4f },
    { id: "q05", name: "Tape Corner",   grid: [3, 1], focus: "sneak",   tint: 0x4f5e6b },
    { id: "q06", name: "Warden Square", grid: [2, 1], focus: "fight",   tint: 0x6b4848 },
    { id: "q07", name: "Angel Court",   grid: [1, 1], focus: "explore", tint: 0x5f5a6e },
    { id: "q08", name: "Guard House",   grid: [0, 1], focus: "fight",   tint: 0x4f4f5e },
    { id: "q09", name: "Paper Lane",    grid: [0, 2], focus: "sneak",   tint: 0x6e6248 },
    { id: "q10", name: "The Tunnels",   grid: [1, 2], focus: "race",    tint: 0x48606b },
    { id: "q11", name: "Old Tower",     grid: [2, 2], focus: "fight",   tint: 0x5a486e },
    { id: "q12", name: "East Gate",     grid: [3, 2], focus: "explore", tint: 0x6b3f3f }
  ],

  // The placeholder parts, until a mission has real stems.
  defaultParts: ["Low end", "Body", "Melody", "Shine"],

  missions: [
    { song: "Hold Me Down",    trackId: "87704d25-a756-4810-a3b2-e9463d8eb97b", quadrants: ["q01", "q02", "q07", "q08"],
      cutscene: "opening",
      goal: "Zora is gone. Search the first four quadrants and bring the song back together." },
    { song: "Selina",          trackId: "b1be1034-20f0-4829-a12d-23200e805d69", quadrants: ["q03", "q04", "q05", "q06"],
      goal: "You keep seeing her everywhere. The streets won't hold still. Get through without being detected." },
    { song: "Put It On Me",    trackId: "476e10c7-8465-4c14-9345-81be91aafa8a", quadrants: ["q09", "q10", "q11", "q12"],
      goal: "The Veil came down in pieces. Clear the way to her trail and help the people stuck behind the rubble." },
    { song: "Free ride",       trackId: "9becf0b9-dd08-4c2b-afac-503f9462c3f0", quadrants: ["q02", "q03", "q06", "q07"],
      goal: "The streets are open. Race the song." },
    { song: "Where You Dey",   trackId: "de00fb92-df32-40cc-9b64-23818efedc68", quadrants: ["q04", "q05", "q11", "q12"],
      cutscene: "vision",
      goal: "Search for her. Every clue counts." },
    { song: "Baddest",         trackId: "871cfb08-a17b-46ed-a1f8-624810a66087", quadrants: ["q06", "q08", "q09", "q11"],
      goal: "The Circle's wardens hold this ground. Fight your way through." },
    { song: "To My Angels",    trackId: "8811396e-9f2d-47ac-970f-e9c645348f8d", quadrants: ["q01", "q07", "q09", "q10"],
      cutscene: "neighbours",
      goal: "The people of the city have your back. Find the safe place and listen to them." },
    { song: "Not at All",      trackId: "ba0c4b70-7da8-475f-9fa8-a3a83e1979b4", quadrants: ["q02", "q05", "q08", "q12"],
      goal: "You can't see the patrols here. Follow what the neighbours tell you and slip through." },
    { song: "Can't Copy You",  trackId: "f82186d2-8a76-4377-b7d8-e50837459d9c", quadrants: ["q03", "q06", "q10", "q11"],
      goal: "The Veil sends copies of her. They look like Zora, but they aren't. Trust what you know." },
    { song: "That Juice",      trackId: "70dc6426-0b9a-4209-85f5-1ce7016a8774", quadrants: ["q04", "q09", "q10", "q12"],
      goal: "The closer you get, the more colour comes back. Keep going." },
    { song: "Thinking of You", trackId: "effed5a5-cc3a-431f-943e-8546863df254", quadrants: ["q05", "q07", "q11", "q12"],
      cutscene: "tower",
      goal: "The water goes dark. Chase what took her." },
    { song: "Run",             trackId: "7305e3c4-d143-44c1-9c87-d8fc54564942", quadrants: ["q09", "q10", "q11", "q12"],
      cutscene: "finalOpen", final: true,
      goal: "Bring the last song together and get Zora out." }
  ],

  /* Story notes from the Story Bible, for the missions still to be built out:
     The Circle took Zora: Koda and Zora together threaten the reality they built.
     Breaking the Veil made the world brighter and freed people; the Circle wants its order back.
     Nyoka (The Snake) betrays his own people to the Circle. Koda's brother is an ally.
     Ahead: 2 Selina wobbles like a hallucination; 3 rubble clearing that unlocks superspeed for 4;
     8 hidden patrols, guided by the community; 9 Zora copies and music puzzles; 10 grey world that
     gains colour, ending underwater; 11 the dark water chase. Voices: Steve C-SA (Koda), Cynth (Zora). */

  // Placeholder scenes. Each one shows as a single card until it is recorded.
  cutscenes: {
    opening: [
      { who: "Zora", say: "Koda, don't let go." },
      { who: "Koda", say: "I've got you." },
      { who: "", say: "The Veil breaks. When the light clears, she is gone." },
      { who: "Koda", say: "They took her. Somebody in this city knows where." }
    ],
    vision: [
      { who: "Zora", say: "Follow the music. I'm still here." }
    ],
    neighbours: [
      { who: "Neighbour", say: "You're the one looking for the girl. Be careful who you ask." },
      { who: "Koda", say: "I'll ask everybody." }
    ],
    tower: [
      { who: "Koda", say: "The tower. She's there, I can feel it." }
    ],
    finalOpen: [
      { who: "Handler", say: "You don't stop, do you." },
      { who: "Koda", say: "Not until she's home." }
    ],
    found: [
      { who: "Zora", say: "You came." },
      { who: "Koda", say: "Always. Now run." }
    ],
    ending: [
      { who: "", say: "Good intentions last longest." },
      { who: "", say: "To be continued." }
    ]
  },

  // What the people of the city say when Koda talks to them. Placeholder words.
  npcLines: [
    "They came at night. Nobody saw their faces.",
    "Keep your head down. The wardens don't ask twice.",
    "I heard music from the old tower. Sad music.",
    "The girl? Try the river side. And go quiet.",
    "Good intentions, son. They last longest.",
    "Wardens change shift when the song changes. Use it."
  ],

  // One-line tips, each shown once, the first time it matters.
  tips: {
    start:    "Each lit quadrant holds a part of the song. Go in, do its task, and the part joins the mix.",
    guard:    "Guards see in front of them. SNEAK keeps you quiet. Get behind one and press ACTION for a takedown.",
    seen:     "You've been seen. Fight with HIT, or run and break their line of sight.",
    explore:  "Find the glowing part somewhere in this quadrant.",
    sneak:    "Reach the part without being seen. If they spot you, the part moves.",
    fight:    "Put every guard here down. The part drops when the last one falls.",
    race:     "Step into the gold ring, then reach the part before the clock runs out.",
    jump:     "JUMP, then HIT in the air for a flying kick."
  }
};
