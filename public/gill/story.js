"use strict";

/* ---------------------------------------------------------------------------
   G.I.L.L. STORY DATA

   Everything a player reads or hears lives here, so the story can be rewritten
   without touching the game. Mirrors the G.I.L.L. Story Bible doc.

   ZONES     one per song on Good Intentions Last Longest. `grid` is where the
             zone sits on the city map (column, row). `focus` picks what the
             zone asks of you: "explore", "sneak", "fight" or "race".
   CUTSCENES each a list of lines. A line is { who, say }. `who` must be a
             name in SPEAKERS. Voice files can be added later as `voice`.
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

  zones: [
    { id: "z01", song: "Hold Me Down",    trackId: "87704d25-a756-4810-a3b2-e9463d8eb97b", grid: [0, 0], focus: "explore", tint: 0x6b5a48,
      clue: "Her bracelet, snapped, in the dust where the Veil fell." },
    { id: "z02", song: "Selina",          trackId: "b1be1034-20f0-4829-a12d-23200e805d69", grid: [1, 0], focus: "sneak",   tint: 0x5a5f6e,
      clue: "A patrol route chalked on a wall. They move her at night." },
    { id: "z03", song: "Put It On Me",    trackId: "476e10c7-8465-4c14-9345-81be91aafa8a", grid: [2, 0], focus: "explore", tint: 0x6e5a5a,
      clue: "A ticket stub with a dock number on it." },
    { id: "z04", song: "Free ride",       trackId: "9becf0b9-dd08-4c2b-afac-503f9462c3f0", grid: [3, 0], focus: "race",    tint: 0x5e6b4f,
      clue: "Tyre marks heading for the river.", race: { seconds: 40 } },
    { id: "z05", song: "Where You Dey",   trackId: "de00fb92-df32-40cc-9b64-23818efedc68", grid: [3, 1], focus: "explore", tint: 0x4f5e6b,
      clue: "Her voice on a cassette: \"Where you dey, Koda?\"" },
    { id: "z06", song: "Baddest",         trackId: "871cfb08-a17b-46ed-a1f8-624810a66087", grid: [2, 1], focus: "fight",   tint: 0x6b4848,
      clue: "A warden's badge. The Handler signed his orders." },
    { id: "z07", song: "To My Angels",    trackId: "8811396e-9f2d-47ac-970f-e9c645348f8d", grid: [1, 1], focus: "explore", tint: 0x5f5a6e,
      clue: "A neighbour's note: \"We saw them take her east.\"" },
    { id: "z08", song: "Not at All",      trackId: "ba0c4b70-7da8-475f-9fa8-a3a83e1979b4", grid: [0, 1], focus: "sneak",   tint: 0x4f4f5e,
      clue: "A key on a red cord, stolen from a sleeping guard." },
    { id: "z09", song: "Can't Copy You",  trackId: "f82186d2-8a76-4377-b7d8-e50837459d9c", grid: [0, 2], focus: "fight",   tint: 0x6e6248,
      clue: "Her drawing of the two of you, folded small." },
    { id: "z10", song: "That Juice",      trackId: "70dc6426-0b9a-4209-85f5-1ce7016a8774", grid: [1, 2], focus: "race",    tint: 0x48606b,
      clue: "A map of the tunnels under the city.", race: { seconds: 35 } },
    { id: "z11", song: "Thinking of You", trackId: "effed5a5-cc3a-431f-943e-8546863df254", grid: [2, 2], focus: "sneak",   tint: 0x5a486e,
      clue: "Her scarf, caught on the gate of the old tower." },
    { id: "z12", song: "Run",             trackId: "7305e3c4-d143-44c1-9c87-d8fc54564942", grid: [3, 2], focus: "race",    tint: 0x6b3f3f,
      clue: null, final: true }
  ],

  // How many clues open the way to Zora (the last zone).
  cluesToFinal: 8,

  cutscenes: {
    opening: [
      { who: "Zora", say: "Koda, don't let go." },
      { who: "Koda", say: "I've got you." },
      { who: "", say: "The Veil breaks. When the light clears, she is gone." },
      { who: "Koda", say: "They took her. Somebody in this city knows where." }
    ],
    firstClue: [
      { who: "Neighbour", say: "You're the one looking for the girl. Be careful who you ask." },
      { who: "Koda", say: "I'll ask everybody." }
    ],
    vision: [
      { who: "Zora", say: "Follow the music. I'm still here." }
    ],
    finalOpen: [
      { who: "Koda", say: "That's everything. The tower, east side. She's there." },
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

  // Shown when a zone's own task is done. Placeholder words.
  zoneLines: {
    race:  "Made it. Keep moving.",
    fight: "That's the last of them.",
    sneak: "In and out. Nobody saw a thing."
  }
};
