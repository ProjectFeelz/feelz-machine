"use strict";

/* ---------------------------------------------------------------------------
   THE MAIN UPDATE
--------------------------------------------------------------------------- */

// The start of a run. First the mission's pictures and Koda's model finish loading
// (never longer than 15 seconds, so a slow picture can't hold a run for ever),
// then 3, 2, 1, and the run begins with Koda already running: the player takes over
// from there. The song waits with it.
let runGate = { phase: "go", t: 0, total: 0 };
function updateRunGate(dt) {
  runGate.t += dt;
  if (songAudio && !songAudio.paused) { try { songAudio.pause(); songAudio.currentTime = 0; } catch (e) { /* not loaded yet */ } }
  if (runGate.phase === "load") {
    const model = typeof Char3D !== "undefined" && Char3D.settled ? !Char3D.settled("koda") : false;
    const left = artPending.size + (model ? 1 : 0);
    runGate.total = Math.max(runGate.total, left);
    if (left === 0 || runGate.t > 15) { runGate.phase = "count"; runGate.t = 0; return; }
    const pct = runGate.total ? Math.round(100 * (1 - left / runGate.total)) : 100;
    banner = { text: "LOADING", sub: missionLabel(mission) + " · " + pct + "%", time: 0.5 };
    return;
  }
  const n = 3 - Math.floor(runGate.t / 0.75);
  if (n > 0) {
    if (runGate.said !== n) { runGate.said = n; sfx.init(); sfx.count && sfx.count(n); }
    banner = { text: String(n), sub: missionLabel(mission), time: 0.5 }; return;
  }
  sfx.go && sfx.go();
  runGate.phase = "go";
  banner = { text: mission.parts[0].name, sub: missionLabel(mission), time: 2.5 };
  startMusic();
  for (const p of players) p.autoRun = 1.4;
}

function update(realDt) {
  banner.time = Math.max(0, banner.time - realDt);
  toast.time = Math.max(0, toast.time - realDt);
  flash = Math.max(0, flash - realDt * 2.6);
  shake = Math.max(0, shake - realDt);
  if (lightningBolt) { lightningBolt.t -= realDt; if (lightningBolt.t <= 0) lightningBolt = null; }
  if (taunt) { updateTaunt(realDt); updateParticles(realDt); return; }

  // A journal page is open: the world holds still while you read.
  if (reading) { updateReading(realDt); return; }
  // The start of a run: everything loads first, then a count of three, then he's off.
  if (runGate.phase !== "go") { updateRunGate(realDt); updateParticles(realDt); return; }
  // He runs the first stretch on his own; if nobody takes over, the run goes back
  // to the start and counts down again, so a run can never play itself through.
  if (!runGate.started && !twoPlayer && !(typeof coopOn === "function" && coopOn())) {
    const c = rawControls(0), auto = players[0].autoRun > 0;   // what the player is pressing, not the auto-run
    if (c.left || c.right || c.jump || c.down || c.attack || c.up) runGate.started = true;
    else if (songStarted && !auto && (runGate.idle = (runGate.idle || 0) + realDt) > 6) {
      resetRun();
      runGate.phase = "count";
      return;
    }
  }
  // The top of a run: the run waits for the song's first note, so the two start together.
  // (No sound, sound blocked, or a song still not playing after 8 seconds: it goes anyway.)
  if (!songStarted) {
    updateSongClock(realDt);
    if (!songStarted) {
      if (banner.time < 0.3) showBanner("GET READY", "", 0.6);
      updateParticles(realDt);
      return;
    }
  }
  // Hit-stop: a blink of near-freeze when a hit lands.
  let dt = realDt;
  if (hitStop > 0) { hitStop = Math.max(0, hitStop - realDt); dt = realDt * 0.12; }
  else if (prayer) dt = realDt * 0.4;   // time slows while he prays
  runTime += dt;
  realTime += realDt;
  if (!driveHoldsClock(realDt)) updateSongClock(realDt);

  updateGates(dt);
  updateSystems(dt);
  if (typeof tutorialUpdate === "function") tutorialUpdate(realDt);
  if (inward.active) updateInward(dt);
  else {
    inward.fade = Math.max(0, inward.fade - dt);   // the dip to black after a run into the picture lifts again
    for (const pl of players) if (pl.autoRun > 0) pl.autoRun = Math.max(0, pl.autoRun - dt);
    players.forEach((p, i) => updatePlayer(p, i, dt));
    updateWardens(dt);
    updateDrones(dt);
    checkInward();
  }
  if (coopOn()) Coop.tick(realDt);
  updateStorm(dt, realDt);
  if (!inward.active) updatePickups(dt);
  updateDeadline();
  updateParticles(dt);
  rewindFx = Math.max(0, rewindFx - realDt);

  // Fights muffle the song and bring in the fight beat.
  const inFight = players.some(p => p.fightWith && !p.finished);
  fightLevel += ((inFight ? 1 : 0) - fightLevel) * Math.min(1, realDt * (inFight ? 8 : 3));
  sfx.fightMix(inFight, mission.bpm || 92, songClock);
  // The weather you hear: wind, rain, and the storm front's roar as it closes in.
  {
    const lead = leader();
    const indoors = sectionAt(lead.x).world === "ve";
    const close = mission.stormChase ? Math.max(0, 1 - (lead.x - storm.front) / m(9)) : 0;
    const wx = mission.weather || {};
    const baseWind = wx.wind !== undefined ? wx.wind : 0.08, baseRain = wx.rain !== undefined ? wx.rain * 0.33 : 0.05;
    const fury = indoors ? 0 : Math.min(1, storm.strength * 0.9 + close * 0.5);
    sfx.ambience({
      wind: indoors ? 0.04 : baseWind + storm.strength * 0.38 + close * 0.2,
      rain: indoors ? 0.02 : baseRain + storm.strength * 0.12,
      roar: indoors ? 0 : close * 0.6,
      fury
    });
    // The world breathes with the song: slow in calm parts, quick in the storm and the choruses.
    const part = mission.parts[playingPartIndex()];
    const want = reading ? 0 : (part && part.storm ? 2.6 : 1) * (inFight ? 0.6 : 1) * (lead.boostTime > 0 ? 1.4 : 1);
    worldPace += (want - worldPace) * Math.min(1, realDt * 0.6);
    cloudDrift += worldPace * realDt;
  }

  // Two players: anyone left behind off the left of the screen comes back in beside the leader.
  if (twoPlayer) {
    for (const p of players) {
      if (!inward.active && !p.finished && p.x < cameraX - 40 && p.invuln <= 0) respawn(p, "LEFT BEHIND");
    }
    if (raceEndsAt !== null && runTime >= raceEndsAt && gameState === "playing") finishGame();
  }

  // The camera follows the runner in front.
  const lead = leader();
  if (inward.active) return;
  // Following Zora, the camera looks further ahead so she stays in the picture.
  const tailing = (level.tails || []).some(t => t.state === "on");
  // The right stick nudges the view: a look ahead or behind, above or below. It eases out and springs back.
  const lp = pads[0] || {};
  const wantLX = (lp.lookX || 0) * (mission.mirror ? -1 : 1), wantLY = lp.lookY || 0;
  look.x += (wantLX - look.x) * Math.min(1, realDt * 5);
  look.y += (wantLY - look.y) * Math.min(1, realDt * 5);
  const targetX = lead.x - W * (lead.facing < 0 && !twoPlayer ? 0.55 : tailing ? 0.2 : 0.36) + look.x * W * 0.3;
  cameraX += (targetX - cameraX) * Math.min(1, realDt * 4.5);
  cameraX = Math.max(0, Math.min(level.width - W, cameraX));
  // Hold the height through a jump; follow climbs, falls and big drops.
  if (lead.ground || lead.climb || lead.move || lead.lastFootY === undefined) lead.lastFootY = lead.y;
  let footY = lead.lastFootY;
  if (lead.y > footY + m(1)) footY = lead.y - m(1);
  if (lead.y < footY - m(2.2)) footY = lead.y + m(2.2);
  const targetY = (footY > m(0.6) ? footY - H * 0.62 : Math.min(-410, footY - H * 0.68)) + look.y * H * (look.y > 0 ? 0.12 : 0.16);
  cameraY += (targetY - cameraY) * Math.min(1, realDt * 3.2);
}
