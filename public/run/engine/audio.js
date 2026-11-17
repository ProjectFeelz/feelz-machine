"use strict";

/* ---------------------------------------------------------------------------
   THE SONG CLOCK
   The song drives the run: lyrics, the storm and the checkpoint deadlines.
--------------------------------------------------------------------------- */

// The part of the song the runner in front is racing through: the next checkpoint they haven't reached.
function currentPartIndex() {
  return Math.min(mission.parts.length - 1, leader().cp);
}

// Which part of the song is playing right now.
function playingPartIndex() {
  let idx = 0;
  mission.parts.forEach((p, i) => { if (songClock >= p.start) idx = i; });
  return idx;
}

function seekSong(seconds) {
  songClock = Math.max(0, seconds);
  try { songAudio.currentTime = songClock; } catch (e) { /* not seekable yet: the clock carries on alone */ }
}

// The song slows for a few seconds (breathing at a window): the music and the clock both.
let songSlowT = 0;

function songRate() { return songSlowT <= 0 ? 1 : songSlowT < 0.6 ? 0.72 + 0.28 * (1 - songSlowT / 0.6) : 0.72; }

function slowSong(seconds) { songSlowT = Math.max(songSlowT, seconds); }

let lastResync = 0;

// The top of a run: the clock waits at 0:00 until the song is actually playing, so a song that
// takes a moment to arrive starts from its first note instead of being jumped ahead to catch up.
// No sound, sound blocked, or a song that still hasn't started after 8 seconds: the clock goes anyway.
let songStarted = true, songWaitT = 0;

function updateSongClock(realDt) {
  songSlowT = Math.max(0, songSlowT - realDt);
  const rate = songRate();
  if (songAudio.playbackRate !== rate) { try { songAudio.preservesPitch = false; songAudio.playbackRate = rate; } catch (e) { /* older browsers */ } }
  if (!songStarted) {
    songWaitT += realDt;
    const playingNow = !songAudio.paused && songAudio.readyState >= 3 && songAudio.currentTime > 0;
    if (playingNow) { songStarted = true; songClock = songAudio.currentTime; return; }
    if (!soundOn || musicBlocked || songWaitT > 8 || songClock > 0.5) songStarted = true;
    else return;
  }
  songClock += realDt * rate;
  if (freeRoam) { if (!songAudio.paused && songAudio.readyState >= 3) songClock = songAudio.currentTime; return; }
  // While the audio is playing it leads; the clock follows small drift. A big gap means the browser
  // couldn't jump in the file: the clock keeps its place and the audio is sent back to it.
  if (!songAudio.paused && !musicBlocked && songAudio.readyState >= 3) {
    const d = songAudio.currentTime - songClock;
    if (Math.abs(d) > 2.5) {
      if (realTime - lastResync > 1) { lastResync = realTime; try { songAudio.currentTime = songClock; } catch (e) { /* not seekable */ } }
    } else if (Math.abs(d) > 0.25) songClock = songAudio.currentTime;
  }
}

/* ---------------------------------------------------------------------------
   MUSIC AND LYRICS
--------------------------------------------------------------------------- */

const songAudio = document.getElementById("songAudio");

let musicBlocked = false;

// The game pausing the song on purpose (Music Drive, Stillness): the keep-it-playing guard leaves it alone.
let songHeld = false;

// Each song is also fetched whole and played from memory, so jumping back in it always works.
const songBlob = {}, songBytes = {};

function songSrcFor(src) { return songBlob[src] || src; }

function loadSongBlob(src) {
  if (!src || songBlob[src] !== undefined) return;
  songBlob[src] = null;
  fetch(src).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
    if (!buf) { delete songBlob[src]; return; }
    songBytes[src] = buf.slice(0);
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
    songBlob[src] = url;
    if (!mission || mission.song.src !== src || songAudio.getAttribute("src") !== src) return;
    // Already playing from the stream: leave it be. Swapping the source mid-song makes the
    // browser load it again, a gap you can hear. The copy in memory is used next time.
    if (!songAudio.paused) return;
    const wasPlaying = false;
    songAudio.src = url;
    songAudio.addEventListener("loadedmetadata", () => {
      try { songAudio.currentTime = songClock; } catch (e) { /* not ready */ }
      if (wasPlaying && soundOn && gameState === "playing" && !reading && !taunt && !songHeld) songAudio.play().catch(() => {});
    }, { once: true });
  }).catch(() => { delete songBlob[src]; });
}

let fadeTimer = null;

let soundOn = true;

try { soundOn = localStorage.getItem("feelzrun-sound") !== "off"; } catch (e) { /* storage blocked */ }

function startMusic() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  const want = songSrcFor(mission.song.src);
  if (songAudio.getAttribute("src") !== want) songAudio.src = want;
  loadSongBlob(mission.song.src);
  songAudio.loop = !!freeRoam;
  songHeld = false; songSlowT = 0;
  songStarted = false; songWaitT = 0;
  songAudio.volume = MUSIC_VOLUME;
  try { songAudio.playbackRate = 1; songAudio.currentTime = 0; } catch (e) { /* not loaded yet */ }
  const playing = songAudio.play();
  if (playing && playing.catch) {
    playing.then(() => { musicBlocked = false; }).catch(() => {
      musicBlocked = true;
      if (gameState === "playing" && soundOn) showBanner("TAP FOR SOUND", "", 3);
    });
  }
}

function retryMusic() {
  if (!musicBlocked || gameState !== "playing" || reading) return;
  sfx.init();
  songAudio.play().then(() => { musicBlocked = false; }).catch(() => {});
}

window.addEventListener("pointerdown", retryMusic);

window.addEventListener("keydown", retryMusic);

// Keep the song going: if the browser pauses it during a run, start it again.
songAudio.addEventListener("pause", () => {
  if (gameState !== "playing" || document.hidden || taunt || reading || songAudio.ended || songHeld) return;
  setTimeout(() => {
    if (gameState !== "playing" || !songAudio.paused || taunt || reading || songHeld) return;
    songAudio.play().catch(() => { musicBlocked = true; });
  }, 250);
});

function fadeOutMusic(seconds) {
  if (fadeTimer) clearInterval(fadeTimer);
  const start = songAudio.volume, steps = 30;
  let step = 0;
  fadeTimer = setInterval(() => {
    step += 1;
    songAudio.volume = Math.max(0, start * (1 - step / steps));
    if (step >= steps) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      songAudio.pause();
      songAudio.volume = MUSIC_VOLUME;
    }
  }, ((seconds || 3) * 1000) / steps);
}

// Where the song is (the lyrics follow it).
function songTime() {
  return songClock;
}

let lyrics = [];

let lyricsOn = true;

try { lyricsOn = localStorage.getItem("feelzrun-lyrics") !== "off"; } catch (e) { /* storage blocked */ }

function parseTimestamp(text) {
  const match = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function parseLyrics(raw) {
  const lines = [];
  for (const row of raw.split(/\r?\n/)) {
    const ranged = /^\[([^\]]+?)\s*-->\s*([^\]]+)\]\s*(.*)$/.exec(row.trim());
    const single = /^\[(\d+:\d+(?:\.\d+)?)\]\s*(.*)$/.exec(row.trim());
    if (ranged) {
      const start = parseTimestamp(ranged[1]), end = parseTimestamp(ranged[2]);
      if (start !== null && end !== null && ranged[3]) lines.push({ start, end, text: ranged[3] });
    } else if (single) {
      const start = parseTimestamp(single[1]);
      if (start !== null && single[2]) lines.push({ start, end: null, text: single[2] });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  lines.forEach((line, i) => {
    if (line.end === null) {
      const next = lines[i + 1];
      line.end = next ? Math.min(next.start, line.start + 6) : line.start + 4;
    }
  });
  return lines;
}

function loadLyrics() {
  lyrics = [];
  if (!mission.song.lyrics) return;
  fetch(mission.song.lyrics)
    .then(r => (r.ok ? r.text() : ""))
    .then(text => { lyrics = parseLyrics(text); })
    .catch(() => console.warn("Lyrics not found: " + mission.song.lyrics));
}

function currentLyric() {
  const t = songTime();
  for (const line of lyrics) if (t >= line.start && t < line.end) return { line, t };
  return null;
}

/* ---------------------------------------------------------------------------
   SOUND EFFECTS (Web Audio, no files to load)
--------------------------------------------------------------------------- */

const SFX_VOLUME = 0.35;

const sfx = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;

  function setMuted(v) { muted = v; if (master) master.gain.value = muted ? 0 : SFX_VOLUME; }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : SFX_VOLUME;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    hookMusic(document.getElementById("songAudio"));
  }

  function tone({ type = "square", from, to = from, dur = 0.12, vol = 0.4, delay = 0 }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, cutoff = 1200, delay = 0, type = "lowpass" }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // A filtered noise burst with an attack, a hold and a filter sweep: whooshes, scrapes, thuds.
  function burstNoise({ dur = 0.15, vol = 0.3, f0 = 800, f1 = f0, q = 0.8, type = "bandpass", attack = 0.005, delay = 0 }) {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
  }
  const vary = (x, k) => x * (1 - k + Math.random() * 2 * k);

  // Stillness: while you move, the song waits and only a low held hum (a breath of it) carries on.
  let pad = null;
  function holdPad(on) {
    if (!ac) return;
    if (on && !pad) {
      const g = ac.createGain(); g.gain.value = 0.0001;
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      const os = [110, 164.8, 220.5].map((fr, i) => { const o = ac.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = fr; o.detune.value = (i - 1) * 6; o.connect(f); o.start(); return o; });
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 0.25; lg.gain.value = 250; l.connect(lg); lg.connect(f.frequency); l.start();
      f.connect(g); g.connect(master);
      g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.6);
      pad = { g, os: os.concat([l]) };
    } else if (!on && pad) {
      const p = pad; pad = null;
      p.g.gain.cancelScheduledValues(ac.currentTime);
      p.g.gain.setValueAtTime(Math.max(0.0001, p.g.gain.value), ac.currentTime);
      p.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
      p.os.forEach(o => o.stop(ac.currentTime + 0.4));
    }
  }

  // Ambience: a violent storm, not rain on a roof. Gusting wind in two bands, a deep
  // roar, a low rolling rumble, and only a little hiss of rain on top.
  // If recorded sounds are in assets/audio/sfx/ (storm-loop.mp3, thunder-1.mp3 ...),
  // they're used instead of (or alongside) the synthesised ones.
  let amb = null;
  const samples = { storm: null, thunder: [] };
  function loadSample(url) {
    return fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(b => b ? ac.decodeAudioData(b) : null).catch(() => null);
  }
  function loadSamples() {
    loadSample("assets/audio/sfx/storm-loop.mp3").then(buf => {
      if (!buf || !amb) return;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = ac.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start();
      samples.storm = { g };
    });
    for (let i = 1; i <= 4; i++) loadSample("assets/audio/sfx/thunder-" + i + ".mp3").then(buf => { if (buf) samples.thunder.push(buf); });
  }
  function makeAmbience() {
    if (amb || !ac) return;
    const len = ac.sampleRate * 6, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let brown = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; brown = (brown + 0.02 * w) / 1.02; d[i] = ch ? w * 0.6 + brown * 2 : brown * 3.5; }
    }
    const make = (type, freq, q, gainMax) => {
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = Math.random() * 2;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      const gust = ac.createGain(); gust.gain.value = 1;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(gust); gust.connect(g); g.connect(master); src.start();
      return { f, g, gust, max: gainMax };
    };
    amb = {
      wind: make("bandpass", 380, 0.7, 1.4),       // the body of the wind
      howl: make("bandpass", 1100, 2.2, 0.5),      // its whistle through the gaps
      roar: make("lowpass", 120, 0.9, 1.6),        // the wall of the storm
      rumble: make("lowpass", 55, 1.2, 1.8),       // thunder rolling far off
      rain: make("highpass", 3800, 0.5, 0.35)      // a little hiss of rain, kept low
    };
    const lfo = (target, rate, depth) => { const o = ac.createOscillator(), dg = ac.createGain(); o.frequency.value = rate; dg.gain.value = depth; o.connect(dg); dg.connect(target); o.start(); };
    lfo(amb.wind.f.frequency, 0.11, 220);
    lfo(amb.howl.f.frequency, 0.07, 500);
    lfo(amb.rumble.f.frequency, 0.05, 25);
    amb.nextGust = 0;
    loadSamples();
  }
  function ambience(levels) {
    if (!ac) return;
    makeAmbience();
    const t = ac.currentTime;
    const wind = Math.max(0, levels.wind || 0), roar = Math.max(0, levels.roar || 0), rain = Math.max(0, levels.rain || 0);
    const fury = Math.max(0, levels.fury || 0);   // how violent: 0 calm, 1 full storm
    amb.wind.g.gain.setTargetAtTime(wind * amb.wind.max, t, 0.5);
    amb.howl.g.gain.setTargetAtTime(wind * fury * amb.howl.max, t, 0.6);
    amb.roar.g.gain.setTargetAtTime((roar + fury * 0.35) * amb.roar.max, t, 0.4);
    amb.rumble.g.gain.setTargetAtTime(fury * 0.55 * amb.rumble.max, t, 1.2);
    amb.rain.g.gain.setTargetAtTime(rain * amb.rain.max, t, 0.5);
    if (samples.storm) samples.storm.g.gain.setTargetAtTime(Math.min(1, wind * 1.6 + fury * 0.6), t, 0.6);
    // Gusts: the wind surges and drops at random, harder in a storm.
    if (t > amb.nextGust) {
      const surge = 0.55 + Math.random() * (0.6 + fury * 0.9);
      for (const k of ["wind", "howl"]) {
        amb[k].gust.gain.setTargetAtTime(surge, t, 0.35 + Math.random() * 0.4);
      }
      amb.nextGust = t + 0.8 + Math.random() * (2.4 - fury * 1.2);
    }
  }

  // The song, routed through a filter so a fight can muffle it.
  let music = null;
  function hookMusic(el) {
    if (!ac || music || !el) return;
    try {
      const src = ac.createMediaElementSource(el);
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 20000; f.Q.value = 0.8;
      const g = ac.createGain(); g.gain.value = 1;
      src.connect(f); f.connect(g); g.connect(ac.destination);
      music = { f, g };
    } catch (e) { music = null; }
  }

  // The fight beat: kick, snare and hats, in time with the song.
  let fight = { on: false, timer: null, step: 0, next: 0, bus: null };
  function drum(kind, t) {
    if (kind === "kick") {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(fight.bus); o.start(t); o.stop(t + 0.3);
    } else {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = kind === "hat" ? "highpass" : "bandpass"; f.frequency.value = kind === "hat" ? 7500 : 1700;
      const dur = kind === "hat" ? 0.04 : 0.16, vol = kind === "hat" ? 0.18 : 0.55;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(fight.bus); s.start(t); s.stop(t + dur + 0.02);
      if (kind === "snare") { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); og.connect(fight.bus); o.start(t); o.stop(t + 0.12); }
    }
  }
  function fightMix(on, bpm, songPos) {
    if (!ac) return;
    const t = ac.currentTime;
    if (music) {
      music.f.frequency.setTargetAtTime(on ? 620 : 20000, t, on ? 0.06 : 0.35);
      music.g.gain.setTargetAtTime(on ? 0.7 : 1, t, 0.2);
    }
    if (on === fight.on) return;
    fight.on = on;
    if (!fight.bus) { fight.bus = ac.createGain(); fight.bus.gain.value = 0; fight.bus.connect(master); }
    fight.bus.gain.setTargetAtTime(on ? 0.85 : 0, t, on ? 0.05 : 0.4);
    if (on && !fight.timer) {
      const bps = (bpm || 92) / 60, sixteenth = 1 / bps / 4;
      // Start on the song's next beat so the drums sit with it.
      const pos = Math.max(0, songPos || 0);
      fight.step = 0; fight.next = t + 0.02 + (Math.ceil(pos * bps) - pos * bps) / bps;
      fight.timer = setInterval(() => {
        while (fight.next < ac.currentTime + 0.12) {
          const st = fight.step % 16;
          if (st === 0 || st === 8 || st === 10) drum("kick", fight.next);
          if (st === 4 || st === 12) drum("snare", fight.next);
          if (st % 2 === 0) drum("hat", fight.next);
          fight.next += sixteenth; fight.step++;
        }
      }, 25);
    } else if (!on && fight.timer) {
      const tm = fight.timer; fight.timer = null;
      setTimeout(() => clearInterval(tm), 900);
    }
  }
  function quiet() { holdPad(false); ambience({ wind: 0, rain: 0, roar: 0 }); fightMix(false); }

  // Thunder: a crack close by, then a long roll that slides down in pitch.
  function thunder(close) {
    if (!ac) return;
    const t = ac.currentTime;
    if (samples.thunder.length) {
      const src = ac.createBufferSource(); src.buffer = samples.thunder[Math.floor(Math.random() * samples.thunder.length)];
      const g = ac.createGain(); g.gain.value = close ? 1 : 0.6; src.connect(g); g.connect(master); src.start(t);
      return;
    }
    if (close) noise({ dur: 0.18, vol: 0.32, cutoff: 2600, type: "highpass" });
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = "lowpass";
    f.frequency.setValueAtTime(close ? 700 : 400, t); f.frequency.exponentialRampToValueAtTime(70, t + 3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(close ? 0.95 : 0.55, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 3.3);
  }

  // Rewind: the song itself, played backwards from where it is, through a tape-like filter.
  const revCache = {};
  let tape = null;
  function reversed(src) {
    if (revCache[src] !== undefined) return revCache[src];
    revCache[src] = null;
    const bytes = typeof songBytes !== "undefined" && songBytes[src];
    if (!bytes || !ac) { delete revCache[src]; return null; }
    ac.decodeAudioData(bytes.slice(0)).then(buf => {
      const out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), b = out.getChannelData(c); for (let i = 0, n = a.length; i < n; i++) b[i] = a[n - 1 - i]; }
      revCache[src] = out;
    }).catch(() => { delete revCache[src]; });
    return null;
  }
  function tapeStart(src, at, rate, vol) {
    const buf = reversed(src);
    if (!buf) { noise({ dur: 0.4, vol: 0.06, cutoff: 3000, type: "bandpass" }); return null; }
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3800;
    const g = ac.createGain(); g.gain.value = 0.0001;
    s.connect(f); f.connect(g); g.connect(ac.destination);
    g.gain.exponentialRampToValueAtTime(vol * (muted ? 0.0001 : 1) + 0.0001, ac.currentTime + 0.08);
    s.start(0, Math.max(0, buf.duration - at));
    return { s, g };
  }
  function tapeStop(t, fade) {
    if (!t) return;
    t.g.gain.cancelScheduledValues(ac.currentTime);
    t.g.gain.setValueAtTime(Math.max(0.0001, t.g.gain.value), ac.currentTime);
    t.g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fade);
    t.s.stop(ac.currentTime + fade + 0.05);
  }
  // While Music Drive pulls you back: on, at this song time, this fast.
  function rewindTape(on, src, at, rate) {
    if (!ac) return;
    if (!on) { if (tape) { tapeStop(tape, 0.12); tape = null; } return; }
    if (!tape) tape = tapeStart(src, at, rate, 0.55);
    else tape.s.playbackRate.value = rate;
  }
  // A quick spin back over the last few seconds (a rewind token, the song taking you back).
  function rewindSweep(src, from, seconds) {
    if (!ac) return;
    const rate = Math.max(4, seconds / 1.1);
    const t = tapeStart(src, from, rate, 0.5);
    if (t) setTimeout(() => tapeStop(t, 0.15), Math.min(1600, (seconds / rate) * 1000));
  }

  return {
    init, setMuted, hookMusic, ambience, fightMix, quiet, thunder, holdPad, rewindTape, rewindSweep,
    // the clock in the red: a dry tick, sharper in the last three seconds
    tick(last)   { tone({ type: "square", from: last ? 1760 : 1320, to: last ? 1700 : 1250, dur: 0.05, vol: last ? 0.16 : 0.1 }); burstNoise({ dur: 0.03, vol: 0.08, f0: 5000, type: "highpass" }); },
    // a valve letting go: a hard hiss that settles
    steam()      { burstNoise({ dur: 1.2, vol: 0.22, f0: 7000, f1: 2500, type: "highpass", attack: 0.02 }); burstNoise({ dur: 0.9, vol: 0.12, f0: 900, f1: 300, q: 0.4, attack: 0.04 }); },
    // the light opening at a shrine: a rising shimmer of bells and a warm swell
    shrine()     { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ type: "sine", from: f, to: f * 1.01, dur: 1.4, vol: 0.09, delay: i * 0.08 })); [262, 392].forEach(f => tone({ type: "triangle", from: f, dur: 1.8, vol: 0.07 })); burstNoise({ dur: 1.6, vol: 0.06, f0: 8000, f1: 3000, type: "highpass", attack: 0.3 }); },
    // breathing out at a window: a slow, soft exhale
    breathe()    { burstNoise({ dur: 1.6, vol: 0.1, f0: 1200, f1: 400, q: 0.5, attack: 0.4 }); },
    // the camera swinging round into the picture and back out
    swing()      { burstNoise({ dur: 0.45, vol: 0.16, f0: 400, f1: 2600, q: 0.7, attack: 0.1 }); },
    flip()       { tone({ type: "triangle", from: 900, to: 520, dur: 0.09, vol: 0.08 }); tone({ type: "triangle", from: 660, to: 1200, dur: 0.07, vol: 0.06, delay: 0.06 }); },
    // push-off: a scuff of the sole and a little rush of air
    jump()       { burstNoise({ dur: 0.06, vol: 0.16, f0: 220, type: "lowpass" }); burstNoise({ dur: 0.18, vol: 0.07, f0: 900, f1: 2600, q: 0.6, attack: 0.03 }); },
    // the flip: two quick passes of air as he turns over
    doubleJump() { burstNoise({ dur: 0.16, vol: 0.12, f0: 700, f1: 2200, q: 0.9, attack: 0.04 }); burstNoise({ dur: 0.2, vol: 0.1, f0: 1800, f1: 600, q: 0.9, attack: 0.05, delay: 0.13 }); },
    step(surface) {
      const v = vary(1, 0.2);
      if (surface === "metal") {
        burstNoise({ dur: 0.05, vol: 0.12 * v, f0: 260, type: "lowpass" });
        tone({ type: "sine", from: vary(1300, 0.1), to: 900, dur: 0.12, vol: 0.025 * v });
        burstNoise({ dur: 0.04, vol: 0.04 * v, f0: 3200, q: 1.2 });
      } else if (surface === "soft") {
        burstNoise({ dur: 0.07, vol: 0.1 * v, f0: 180, type: "lowpass" });
        burstNoise({ dur: 0.09, vol: 0.03 * v, f0: 1400, q: 0.5 });
      } else if (surface === "wet") {
        burstNoise({ dur: 0.06, vol: 0.12 * v, f0: 200, type: "lowpass" });
        burstNoise({ dur: 0.14, vol: 0.06 * v, f0: 2600, f1: 900, q: 1.5, delay: 0.01 });
      } else {
        // concrete and stone: a heel thump and grit under the sole
        burstNoise({ dur: 0.055, vol: 0.14 * v, f0: vary(170, 0.15), type: "lowpass" });
        burstNoise({ dur: 0.035, vol: 0.035 * v, f0: vary(3800, 0.2), type: "highpass", delay: 0.01 });
      }
    },
    record()     { tone({ type: "triangle", from: 988, dur: 0.06, vol: 0.3 }); tone({ type: "triangle", from: 1319, dur: 0.12, vol: 0.3, delay: 0.05 }); },
    note(tier)   {
      const base = tier === "high" ? 1568 : tier === "mid" ? 1319 : 1175;
      tone({ type: "sine", from: base, dur: 0.07, vol: 0.45 });
      tone({ type: "sine", from: base * 1.335, dur: 0.18, vol: 0.45, delay: 0.06 });
      if (tier === "high") tone({ type: "sine", from: base * 2, dur: 0.25, vol: 0.3, delay: 0.13 });
    },
    coin()       { [1319, 1760, 2093].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.16, vol: 0.35, delay: i * 0.07 })); },
    journal()    { [523, 784, 1047].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.3, vol: 0.3, delay: i * 0.1 })); },
    // landing: both feet, a heavy thump with a crouch of cloth
    land()       { burstNoise({ dur: 0.12, vol: 0.3, f0: 140, type: "lowpass" }); burstNoise({ dur: 0.06, vol: 0.05, f0: 3000, type: "highpass", delay: 0.01 }); },
    // the slide: fabric and shoe soles scraping along, falling away
    slide()      { burstNoise({ dur: 0.42, vol: 0.2, f0: 1600, f1: 500, q: 0.7, attack: 0.02 }); burstNoise({ dur: 0.3, vol: 0.08, f0: 4200, f1: 2500, type: "highpass", attack: 0.02 }); },
    vault()      { burstNoise({ dur: 0.05, vol: 0.18, f0: 600, q: 1 }); burstNoise({ dur: 0.18, vol: 0.08, f0: 800, f1: 2400, q: 0.7, attack: 0.03, delay: 0.03 }); },
    // climbing: a hand slapping onto the pipe, a ring of hollow metal, cloth
    climb()      { burstNoise({ dur: 0.05, vol: 0.14, f0: vary(900, 0.15), q: 1.2 }); tone({ type: "sine", from: vary(640, 0.1), to: 560, dur: 0.14, vol: 0.02 }); burstNoise({ dur: 0.1, vol: 0.025, f0: 3500, type: "highpass", delay: 0.02 }); },
    // a hit landing: the snap of the strike and the body taking it
    punch(kind)  {
      const heavy = kind === "finisher" || kind === "kick" || kind === "smash" || kind === "flykick" || kind === "spinkick";
      burstNoise({ dur: 0.05, vol: heavy ? 0.3 : 0.24, f0: vary(1700, 0.2), q: 1.4 });
      burstNoise({ dur: heavy ? 0.16 : 0.1, vol: heavy ? 0.45 : 0.32, f0: heavy ? 120 : 180, type: "lowpass", delay: 0.005 });
      if (heavy) tone({ type: "sine", from: 90, to: 45, dur: 0.18, vol: 0.25 });
    },
    // a hit blocked: forearms meeting, duller, with a slap
    block()      { burstNoise({ dur: 0.07, vol: 0.22, f0: 260, type: "lowpass" }); burstNoise({ dur: 0.04, vol: 0.12, f0: 2400, q: 2 }); },
    page()       { [392, 523, 659].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.5, vol: 0.18, delay: i * 0.12 })); },
    // grabbing the bar and the trolley wheels starting down the cable
    zip()        { burstNoise({ dur: 0.08, vol: 0.2, f0: 700, q: 1.2 }); burstNoise({ dur: 1.2, vol: 0.09, f0: 2200, f1: 4200, q: 3, attack: 0.2, delay: 0.05 }); tone({ type: "sawtooth", from: 180, to: 320, dur: 1.1, vol: 0.02, delay: 0.05 }); },
    // Zora slipping away: a soft shimmer falling away; coming back: it rising again
    zoraOut()    { [1568, 1319, 1175, 988, 784].forEach((f, i) => tone({ type: "sine", from: f, to: f * 0.98, dur: 0.5, vol: 0.08, delay: i * 0.09 })); burstNoise({ dur: 1.0, vol: 0.06, f0: 6000, f1: 2000, type: "highpass", attack: 0.1 }); },
    zoraIn()     { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: "sine", from: f, dur: 0.4, vol: 0.07, delay: i * 0.07 })); },
    whiff()      { burstNoise({ dur: 0.14, vol: 0.12, f0: 1200, f1: 3000, q: 0.8, attack: 0.03 }); },
    // knocked out: the last hit, then the body hitting the ground
    knockout()   { burstNoise({ dur: 0.06, vol: 0.3, f0: 1500, q: 1.3 }); burstNoise({ dur: 0.25, vol: 0.45, f0: 110, type: "lowpass", delay: 0.32 }); burstNoise({ dur: 0.12, vol: 0.12, f0: 2500, type: "highpass", delay: 0.33 }); },
    takedown()   { noise({ dur: 0.15, vol: 0.3, cutoff: 900 }); [330, 440, 660].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.12, vol: 0.25, delay: 0.1 + i * 0.07 })); },
    bark()       { [0, 0.16].forEach(d => { tone({ type: "sawtooth", from: 560 + Math.random() * 80, to: 300, dur: 0.09, vol: 0.14, delay: d }); burstNoise({ dur: 0.09, vol: 0.16, f0: 900, q: 1.2, delay: d }); }); },
    growl()      { burstNoise({ dur: 0.35, vol: 0.22, f0: 180, type: "lowpass", attack: 0.03 }); tone({ type: "sawtooth", from: 110, to: 90, dur: 0.3, vol: 0.12 }); },
    yelp()       { tone({ type: "sine", from: 1100, to: 1700, dur: 0.12, vol: 0.16 }); tone({ type: "sine", from: 1500, to: 900, dur: 0.18, vol: 0.12, delay: 0.12 }); },
    hurt()       { tone({ type: "sawtooth", from: 260, to: 70, dur: 0.3, vol: 0.3 }); noise({ dur: 0.15, vol: 0.25, cutoff: 2500 }); },
    stun()       { [0, 0.05, 0.1, 0.15].forEach(d => tone({ type: "sawtooth", from: 1800, to: 600, dur: 0.05, vol: 0.12, delay: d })); },
    fall()       { tone({ type: "triangle", from: 700, to: 90, dur: 0.55, vol: 0.35 }); },
    caught()     { [392, 311, 233].forEach((f, i) => tone({ type: "square", from: f, dur: 0.18, vol: 0.2, delay: i * 0.14 })); },
    alert()      { tone({ type: "square", from: 880, dur: 0.08, vol: 0.22 }); tone({ type: "square", from: 1175, dur: 0.14, vol: 0.22, delay: 0.09 }); },
    suspicious() { tone({ type: "sine", from: 600, to: 760, dur: 0.15, vol: 0.12 }); },
    taser()      { noise({ dur: 0.18, vol: 0.18, cutoff: 4000, type: "highpass" }); tone({ type: "sawtooth", from: 900, to: 300, dur: 0.18, vol: 0.12 }); },
    drone()      { noise({ dur: 0.3, vol: 0.3, cutoff: 800 }); tone({ type: "square", from: 500, to: 80, dur: 0.35, vol: 0.18 }); },
    checkpoint() { [523, 659, 784].forEach((f, i) => tone({ type: "triangle", from: f, dur: 0.14, vol: 0.32, delay: i * 0.09 })); },
    boost()      { [392, 523, 659, 784, 1047].forEach((f, i) => tone({ type: "sawtooth", from: f, dur: 0.1, vol: 0.12, delay: i * 0.05 })); noise({ dur: 0.35, vol: 0.12, cutoff: 3000 }); },
    rewind()     { for (let i = 0; i < 8; i++) tone({ type: "square", from: 1400 - i * 120, to: 700 - i * 60, dur: 0.06, vol: 0.1, delay: i * 0.045 }); noise({ dur: 0.45, vol: 0.12, cutoff: 5000, type: "highpass" }); },
    gate()       { noise({ dur: 0.5, vol: 0.18, cutoff: 500 }); tone({ type: "sawtooth", from: 90, to: 60, dur: 0.5, vol: 0.1 }); },
    // a swing: the arm cutting the air
    swing()      { burstNoise({ dur: 0.13, vol: 0.13, f0: 700, f1: 2600, q: 1.1, attack: 0.04 }); },
    dash()       { noise({ dur: 0.25, vol: 0.2, cutoff: 1800, type: "bandpass" }); tone({ type: "sawtooth", from: 300, to: 900, dur: 0.2, vol: 0.1 }); },
    pound()      { noise({ dur: 0.4, vol: 0.45, cutoff: 300 }); tone({ type: "sine", from: 120, to: 35, dur: 0.45, vol: 0.5 }); },
    shield()     { [1047, 1319, 1568].forEach((f, i) => tone({ type: "sine", from: f, to: f * 0.5, dur: 0.3, vol: 0.25, delay: i * 0.04 })); },
    fight()      { burstNoise({ dur: 0.2, vol: 0.2, f0: 160, type: "lowpass" }); tone({ type: "sawtooth", from: 110, to: 90, dur: 0.22, vol: 0.12 }); },
    debris()     { noise({ dur: 0.25, vol: 0.15, cutoff: 1500, type: "bandpass" }); },
    taunt()      { [392, 370, 349, 330].forEach((f, i) => tone({ type: "sawtooth", from: f, to: f * 0.94, dur: i === 3 ? 0.7 : 0.22, vol: 0.22, delay: i * 0.24 }));
                   noise({ dur: 0.9, vol: 0.12, cutoff: 900, type: "bandpass", delay: 1.0 }); },
    finish()     { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: "triangle", from: f, dur: i === 5 ? 0.5 : 0.13, vol: 0.4, delay: i * 0.11 })); }
  };
})();

function applySound() {
  songAudio.muted = !soundOn;
  sfx.setMuted(!soundOn);
}
