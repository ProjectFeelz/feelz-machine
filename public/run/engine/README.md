# The Feelz Engine

The code every Feelz game is built on. Feelz Run (`games/feelz-run/`) is the first game on it.

Plain JavaScript and HTML Canvas, no build step. Every file is a classic script loaded by
`index.html`, in order, and they share one global scope: a function in one file can call a
function in another, as long as the file it lives in has loaded by the time the call happens.

## What the engine does

| File | What it is |
| --- | --- |
| `core.js` | The canvas, units (`PX` pixels per metre, `m()`), physics constants, and the shared game state: players, camera, particles, the song clock values, banners and toasts |
| `assets.js` | `loadImage()`: images that say when they are ready |
| `audio.js` | The song clock (a level is timed to a song), music and lyrics, Music Drive style clock holds, all sound effects made in Web Audio |
| `input.js` | Keyboard, touch buttons and controllers, for one or two players |
| `physics.js` | Collision helpers and the platformer runner: running, jumping, wall moves, climbing, sliding, fighting |
| `camera.js` | World to screen (`sx`, `sy`, `onScreen`) and the frame clock |
| `sprites.js` | Sprite sheets: drawing a frame, recolouring outfits with a mask, tinting, finding a frame's foot line |
| `fx.js` | Particles, floating text, banners and toasts, bloom, vignette and scanlines |
| `hud.js` | Words on screen: lyrics, banners, toasts, taunts, the song bar |
| `inward.js` | Inward runs: the camera swings behind the runner and they run into the picture (lanes, jumps, slides, hits, records), plus the 2D drawing of them |
| `inward3d.js` | The same inward runs drawn as a real 3D scene with three.js (loaded only when a mission has one). Falls back to the 2D drawing if WebGL is not available |
| `shell.js` | The frame loop and frame pacing for phones, menus driven by keyboard, touch or controller, right stick scrolling, phones held upright (the game is drawn sideways), the back gesture, keeping the screen awake |
| `net.js` | Online play for up to 6 (Supabase Realtime): lobby, roster, host song clock, ghosts of the other players, shared checkpoints, trips, regrouping |
| `backend.js` | Feelz Machine accounts: sign in, saved progress, verified runs, leaderboards, skills, credits, vouchers, streams |

## What a game provides

A game lives in `games/<name>/`. Feelz Run's files show the shape:

| File | What it is |
| --- | --- |
| `config.js` | Settings: missions and songs, sprite sheets, worlds, scoring, skills, outfits |
| `missions/` | One file per level: the song's parts and checkpoints, the layout in metres, enemies, pickups |
| `tuning.js` | The game's own rules of play: enemy kinds, attacks, skills, hearts, boost |
| `art.js` | The game's images |
| `state.js` | Starting and resetting a run, the AI rival |
| `level.js` | Building a level from a mission file |
| `enemies.js`, `rules.js`, `update.js` | Enemies, the storm, checkpoints, pickups, finishing, and the per-frame update |
| `world.js`, `characters.js`, `frame.js`, `journal.js` | Drawing the game's world, characters, each frame, and journal finds |
| `systems.js` | Stealth, hiding, the alert level, Music Drive, ziplines, market stalls, scanners |
| `ui.js` | The start screen, finish screen, skills, journal, leaderboard, two player join, the co-op lobby |
| `artist.js` | Artist levels: an artist's song on one of the game's level templates |
| `boot.js` | Starts the game. Loads last |

## Load order

`index.html` loads: Supabase, the game's `config.js`, `engine/backend.js`, the mission files,
then engine and game files in turn (see the script list in `index.html`), and `boot.js` last.
Rule of thumb: a file may only *run* code at load time that uses files above it. Code inside
functions can use anything, because it runs after everything has loaded.

## Tests

Run after every change to the engine:

1. The bot regression: a bot plays all 15 Feelz Run missions and must finish each one.
2. The 6-player co-op test: six simulated players join, play, trip each other, finish, regroup
   and play the next mission.
3. The inward 3D check: the 3D view loads and draws each inward run, and the 2D view takes over
   when WebGL is missing.

## Making a new game

1. Make `games/<new-game>/` with its own `config.js`, levels, art and `boot.js`.
2. Copy `index.html`, keep the `engine/` script tags, and swap the `games/feelz-run/` ones for yours.
3. Use the engine's song clock for timing, `physics.js` for a platformer or `inward.js` and
   `inward3d.js` for a runner into the screen, `net.js` for online play and `backend.js` for
   accounts, scores and streams.
