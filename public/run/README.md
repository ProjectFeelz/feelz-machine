# FEELZ RUN

A Feelz Machine music game. Koda runs the F.I.L.L. missions, one per song on *First Impressions Last Longest*, solo, as a two player race, or against an AI rival. Built with Vanilla JavaScript, HTML Canvas and CSS.

All 15 missions are playable, one for each song on the album:

| # | Mission | Where | What's in it |
| --- | --- | --- | --- |
| 01 | Against the Storm | Lower City to the rooftops | The storm chases you; shutters, the shelter crawlspace |
| 02 | Get Out The Way | The crossings, the vents, the checkpoint | Market wardens, vent crawl, catwalks, the checkpoint guards |
| 03 | Ghetto Gospel | Koda's neighbourhood | Fight-heavy choruses against the curfew raid |
| 04 | Blessings | Docks to the Upper City | Cranes and tower climbs, drones over the roofs |
| 05 | Chemistry | Upper City plaza and terraces | Sentinels, rooftops, a flash of the Veil |
| 06 | God is My Woman | The Veil | Floating corridors over the drop, no enemies |
| 07 | Close to My Heart | An alley that flickers into the Veil | Alley and Veil stretches in turn |
| 08 | Patience | The edge of the Upper City plaza | Shutters to time, sentinels |
| 09 | Head's Up | Corridors, service shaft, reservoir | Veil Hunters to fight |
| 10 | I Pray | The shelter to the shrines | Hunters and wardens |
| 11 | Letting Off Steam | The apartment block | Outside pipes, the raid, the weekend race |
| 12 | My Brothers | Outside the wall to the summit | A second storm chase, the station crawl |
| 13 | Roses & Butterflies | Courtyard, ruins, sanctuary | Floating flight sections, no enemies |
| 14 | Shine Olive Gem | The golden spires | Watchers, gilded sentinels, the wave run |
| 15 | Thugs in Love | Up to the top of the city | The finale climb to Zora's ledge |

Street Wardens glow red, Upper City Sentinels glow blue and Veil Hunters glow violet; all of them flash red before they swing.

The game lives at **www.feelzmachine.com/run** and uses Feelz Machine accounts. Anywhere else (a local server, a preview link) it runs as an offline demo.

## Files

Feelz Run is the first game on the Feelz Engine. The engine is in `engine/` (see `engine/README.md`) and the game is in `games/feelz-run/`.

| Path | What it is |
| --- | --- |
| `index.html` | The page: start screen, sign-in gate, game, pause, skills, player settings, leaderboard and finish screens, and the script list |
| `style.css` | All styling, including phones and tablets |
| `engine/` | The Feelz Engine: song clock, physics, input, sprites, effects, the frame loop, inward runs in 2D and 3D, online play, accounts |
| `games/feelz-run/config.js` | **Your settings**: missions and their song links, the Feelz Machine Supabase project, sprite sheets, worlds, scoring, skills, outfits, credits, vouchers and the album's track ids |
| `games/feelz-run/missions/` | One file per mission: the song's parts and checkpoints, the layout in metres, enemies, pickups, journal pages, taunts |
| `games/feelz-run/` (the rest) | Feelz Run's own rules, enemies, world drawing, menus, artist levels and start-up |
| `vendor/supabase-2.45.4/` | The Supabase JavaScript client (MIT licence) |
| `vendor/three-0.160.0/` | three.js for the 3D inward runs (MIT licence), loaded only when a mission has one |
| `assets/` | Songs, lyrics, sprites, city layers, building tiles and mission cards |
| `supabase/` | The game's tables and functions on the Feelz Machine database |
| `tools/mission-builder/` | The Python script that lays out missions 02 to 15 from the song parts (not part of the website) |

## Run locally

The game loads its lyrics and art from files, so it needs a local web server.

1. In VS Code, install the Live Server extension.
2. Right-click `index.html`.
3. Choose **Open with Live Server**.

Locally it runs as the offline demo: progress, RP and unlocks are kept in the browser. Credits, vouchers and the leaderboard need the live site.

## Accounts

To play at feelzmachine.com/run you need a Feelz Machine account, listener or artist.

- The game shares the Feelz Machine sign-in. Signed in on Feelz Machine means signed in here.
- **SIGN IN WITH FEELZ MACHINE** opens the Feelz Machine login page and comes straight back to the game. Every way of signing in works there, including Plugin Gallery.
- **CREATE A FREE ACCOUNT** opens the same page on sign-up.
- **PLAYER SETTINGS** on the player card sets the leaderboard name and country, and signs out.
- Level, XP, RP, unlocks, credits and vouchers are kept in the account and worked out on the server, so editing the game's files cannot give anyone anything.

## What's new in the runs

- **Inward runs.** In some places the camera swings round behind Koda and he runs into the picture: three lanes, LEFT and RIGHT to switch, JUMP the low things, CROUCH to slide under the high ones, and change lanes round the walls. Missions 2, 4, 9, 11, 14 and 15 have one.
- **Right to left.** Missions 7 (Close to My Heart) and 12 (My Brothers) run the other way, looking back.
- **Pulse shutters.** In Mission 8 (Patience) and a few other places, shutters open and shut in time with the song. Green lights: go. Amber: about to shut. Red: wait.
- **Places.** Every stretch of every mission has its own painting behind it, from the F.I.L.L. world art, plus two new worlds (the desert and the restored city).
- **People.** Zora, the neighbours, the musicians at the fire pit, Koda's family, the dust figures of his brothers. Mission 14 is played as Zora.
- **Enforcers.** Street Wardens, Checkpoint Guards, Dock Wardens, Hound Handlers, Sentinels, Gilded Sentinels and Veil Hunters, each from its own rig and each fighting its own way.

## Beat the song

Every mission is split into the parts of its song: intro, verses, choruses, bridge and outro. Each part ends at a checkpoint (a mic stand with a gold beacon). Reach it before that part of the song ends.

- The timer at the top right counts down to the end of the current part. It turns red in the last 6 seconds.
- The bar under the title shows where you are in the song.
- Make it in time and you get **ON BEAT** and the seconds you had to spare.
- Miss it and the song taunts you. Then the song takes you back 15 seconds, and you go back to where you were 15 seconds ago.

## How Mission 01 plays

- **Intro: the thoroughfare.** Mud, a cart and a crate to clear before the first checkpoint.
- **Verse 1: the market.** Up the awning pipe, then stalls, crates to vault, a low sign to slide under and Street Wardens. Up the pipe to the roofs.
- **Chorus 1: the storm hits the rooftops.** Rain, lightning on the beat, and debris flying in from behind: jump the low pieces, duck or slide under the high ones. The arrow at the edge of the screen tells you which.
- **Verse 2: drones and wardens over the roofs.**
- **Chorus 2: the storm run.** Shutters slam shut as you reach them. Slide under, or climb the strip.
- **Bridge: the shelter.** Down into the Veil and through the crawlspace on your knees.
- **Chorus 3: back up for the last storm.**
- **Outro: we made it far.** One last shutter, then the door.

### The storm

The storm front chases you the whole way: a wall of cloud, rain and lightning at the left of the screen. It creeps in the intro, pushes in the verses and races in the choruses. It never goes back and it never drops off the screen, so if you slow down or stop it catches you. Each time it catches you, you lose a heart (on a pipe you hang on and keep climbing). It holds its ground while you're in a fight, and it can't follow you into the shelter.

### Fights

- Walk up to a Street Warden and it's a fight: **FIGHT** flashes, the song goes muffled and a beat kicks in on top of it, in time with the song.
- In a fight you can't run, jump or slide away. Koda steps in to striking distance on his own.
- **HIT, HIT, HIT**: punch, kick, finisher. Each hit rocks him. Three hits and he's down: **K.O.**, and the music comes back.
- When he glows red he's about to swing. Land a hit first and he's rocked out of it.
- Land on his head from above and he's out in one.

### Journal pages

Picking up a page stops the world (and the song) so you can read it. Jump, hit or tap to carry on. Every page you've found is in **JOURNAL** on the start screen.

### Sound

Recorded storm sounds can replace the synthesised ones. Put these in `assets/audio/sfx/` (any you leave out stay synthesised):

| File | What it is |
| --- | --- |
| `storm-loop.mp3` | 30 to 60 seconds of a violent storm (wind and rain together) that loops without a click |
| `thunder-1.mp3` to `thunder-4.mp3` | Single thunder cracks or rolls, 3 to 6 seconds each |

The song plays through the whole mission. Around it: wind that picks up on the roofs, rain in the storm, the roar of the storm front behind you, and thunder with every lightning strike (closer strikes crack louder and sooner).

### Moves

- Double jump: jump again in the air.
- Crouch: hold down. Slide: press down while running.
- Climb: anything with gold chevrons is climbable. Push into it, or press up.
- Vault: jump while running into a low crate or cart.
- Hop: run flat out into anything up to about a metre high and Koda hops it on his own.
- Ledges: hold toward a ledge in the air to pull yourself up.
- Hit: punch, kick, finisher.

More moves are unlocked on the SKILLS page.

### Enemies

- **Street Wardens** walk their beat and fight you when you get close (see Fights).
- **Scanner drones** hover and patrol. Touch one and you lose a heart. Jump on it to take it down.
- Lose all your hearts and you go back to the last checkpoint.

### Pickups

- **Vinyl records** along the route: your collection, and the points in a race.
- **Music notes** are your XP. The higher they sit, the more they're worth: NOTE (white), DOUBLE NOTE (blue), GOLD NOTE (gold).
- **FEELZ BOOST** (blue bolt): a few seconds of sprint.
- **TIME REWIND** (magenta bolt): the song rewinds 10 seconds, which gives you 10 more seconds to make the checkpoint. There are only two.
- **The F.I.L.L. coin** and **journal pages** (memory traces, a lyric fragment, city records) are hidden along the way.

## Skills

Open **SKILLS** on the start screen. Each skill needs a level and costs RP from your RP bank (every run adds its RP).

| Tab | Skill | Level | RP | How |
| --- | --- | --- | --- | --- |
| Moves | Air Dash | 2 | 300 | HIT in the air |
| Moves | Triple Jump | 3 | 600 | JUMP twice in the air |
| Moves | Power Slide | 3 | 500 | CROUCH while running: longer, faster, takes a warden's legs out |
| Moves | Wall Kick | 4 | 900 | JUMP against a wall in the air |
| Moves | Ground Pound | 5 | 1,000 | CROUCH in the air |
| Combat | Takedown | 2 | 400 | HIT a warden from behind |
| Combat | Flying Kick | 4 | 800 | HIT at full speed |
| Combat | Spin Kick | 5 | 1,000 | Third HIT of a combo, hits everyone around you |
| Combat | Heavy Smash | 6 | 1,400 | HOLD HIT: a shockwave that also swats debris |
| Perks | Record Magnet | 2 | 350 | Records nearby fly to you |
| Perks | Storm Shield | 3 | 700 | Takes one storm hit, back at every checkpoint |
| Perks | Long Boost | 4 | 600 | FEELZ BOOST lasts 60% longer |
| Perks | Extra Heart | 6 | 1,500 | Four hearts instead of three |
| Style | Outfits: Ice, Crimson, Violet, Emerald | 2 to 7 | 250 to 900 | Koda's hoodie, boots and trousers |
| Style | Finish dances: B-Boy, Swing, Robot | 2 to 6 | 200 to 600 | The dance on the finish screen |

Unlocked moves are yours in solo runs. Races keep everyone on the same moves.

The list is in `SKILLS` in `config.js` and in `game_skills` in the database. Change both together.

## Credits and song vouchers

On the **CREDITS** tab of SKILLS:

1. Everything you collect in your runs piles up: records (1 credit each), notes (2), journal pages (25) and F.I.L.L. coins (50).
2. **CONVERT** turns the pile into credits.
3. Pick a song from the album and buy a voucher: 10% off for 250 credits, 25% off for 600, 50% off for 1,200.
4. **BUY THE SONG** opens Feelz Machine's own PayPal checkout with the voucher taken off. The song goes into your Feelz Machine library.

Vouchers work on the 15 songs of *First Impressions Last Longest* only, one song each, and last 30 days. The discount is checked and applied by the Feelz Machine server: a voucher can only be used once, and while a checkout is open it can't be used in a second one.

## Race the rival

Choose **VS RIVAL** and pick EASY, NORMAL or HARD. The rival is a second Koda that plays the mission on its own: it climbs, slides, jumps the debris and fights its way through. Easier rivals hesitate now and then, fumble the odd jump and ease off when they are well ahead. You play with the one player controls. The race rules below apply.

### Two player race

Choose **2 PLAYER RACE** and press PLAY. Player 2 joins by pressing A on a controller (or ↑ on the keyboard). On feelzmachine.com, player 2 can sign in with their Feelz Machine email and password (or just type a name) so their name shows above them; player 1's name comes from their account.

### Menus

Every screen works with a mouse, touch, the keyboard (arrows, Enter, Escape) or a controller (stick or D-pad, A, B). The mission strip scrolls with the mouse wheel, the arrows beside it, a swipe or a controller.

### Race rules

The screen follows whoever is in front. Caught by the storm, fall, or get left behind and you come back in beside the leader. Two records down each time. The checkpoints still run on the song: if the leader misses one, you both go back 15 seconds. Every record is a point; first to the finish gets 10 more, second gets 5. Once the first runner finishes, the other has 10 seconds.

## Controls

| | One player | Player 1 (race) | Player 2 (race) |
| --- | --- | --- | --- |
| Move | A / D or ← / → | A / D | ← / → |
| Jump, climb up | W, ↑ or Space | W or Space | ↑ |
| Crouch, slide | S, ↓, C or Left Ctrl | S | ↓ |
| Hit | F, J or X | F or G | /, Right Shift or Numpad 0 |

- Pause: Esc or P, the II button, or Start on a controller.
- Controllers: stick or d-pad to move, A to jump, B to crouch, X to hit. In a race each player can use a controller; with only one controller connected it plays Player 2 and Player 1 uses the keyboard.
- Phones and tablets: on-screen buttons (one player).

## Scoring

- **RP** is the score of one run. The leaderboard ranks each player's best RP on each mission, all time and this week. Every run's RP also goes into your RP bank for skills.
  - Records 5 each. Notes 10, 25 or 50. Knockouts 25. Journal pages 50. The coin 100.
  - 4 RP for every second you had to spare at each checkpoint.
  - 300 for making every checkpoint on the beat, 200 for no wipeouts, 500 for collecting everything.
- **XP** never goes down and sets your level. Level 2 is at 100 XP, level 3 at 400, level 4 at 900.
- **Collection**: vinyl, notes, knockouts, F.I.L.L. coins and journal pages add up across every run.

The numbers live in `SCORING` in `config.js`. The server works RP out again with the same rules in `game_submit_run` (`supabase/feelz-run-on-feelz-machine.sql`), so if you change them, change both.

## Putting it live on Feelz Machine

The database side is already on the Feelz Machine project (migrations `feelz_run_game` and `feelz_run_game_revoke_anon`). To put the game up:

1. In the feelz-machine repo, check these files are in place:
   - `public/run/` (this whole game folder: `index.html`, the `.js` and `.css` files, `assets/`, `missions/`, `vendor/`)
   - `netlify/functions/game-config.js` (new)
   - `netlify/functions/paypal-order.js` (voucher support)
   - `public/service-worker.js` (lets `/run/` through to the game)
   - `src/AppRouter.js` (sends `/run` inside the app to the game page)
2. In Netlify, open the Feelz Machine site, then Site configuration, then Environment variables, and check `REACT_APP_PAYPAL_CLIENT_ID` is set (it already is if album checkout works). The game reads it through `game-config`.
3. Commit and push. Netlify builds and deploys as usual.
4. Open www.feelzmachine.com/run, sign in, play a run, and check the run shows on the leaderboard and its RP lands in the RP bank.

## Changing a mission

Missions 02 to 15 are built by `tools/mission-builder/`. Each mission in `missions.py` lists the song's parts (start and end times from the lyric timings) and what each part is made of: street runs, markets, fights, pipes, roofs, catwalks, shutters, crawlspaces, tower climbs and Veil platforms.

1. Open a terminal in `tools/mission-builder`.
2. Edit the mission in `missions.py`.
3. Run `python run.py m04` (or leave out the id to rebuild them all).
4. If the records, notes or enemies change, update that mission's row in `game_missions` (the totals the leaderboard checks against).

## Adding the next mission

1. Copy `missions/m01-against-the-storm.js` to `missions/m02-get-out-the-way.js` and change `MISSION_DATA.m01` to `MISSION_DATA.m02`.
2. Set `parts` to the song's sections, with the time each one starts and ends and where its checkpoint stands.
3. Lay out the mission in metres, so each part can be run in a little less than its length of song.
4. Write the mission's `taunts`, and set `bpm` (the fight beat follows it).
5. Add the song to `assets/audio/` and its lyrics to `assets/lyrics/`.
6. Add `<script src="missions/m02-get-out-the-way.js"></script>` to `index.html`, after the Mission 01 line.
7. In `config.js`, set `ready: true` on the mission.
8. In the Supabase SQL Editor on the Feelz Machine project, set the mission's totals in `game_missions` so the leaderboard accepts its runs.
