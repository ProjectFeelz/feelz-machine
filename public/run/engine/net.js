/*
  FEELZ RUN - ONLINE CO-OP
  Up to six players, each on their own phone or computer, one mission.

  How it works:
  - One player hosts and gets a five letter code. Up to five others type the
    code in. Everyone is signed in with their Feelz Machine account.
  - The games talk over a Supabase Realtime channel (broadcast and presence,
    no database tables). Nothing here can change a score: each player's run is
    posted by their own game and checked on the server as usual.
  - Each screen runs its own Koda. Everyone else is drawn from their position,
    which arrives 8 to 15 times a second, smoothed so they glide. Each player
    has their own colour.
  - Shared: the song (the host's clock leads), the checkpoints (whoever reaches
    one first moves the deadline on for everyone, and a wiped-out player comes
    back beside whoever is furthest on), rewinds, missed checkpoints, knockouts
    and pause. Slide into someone to trip them up.
  - Each player collects their own records, notes, journal pages and coin, so
    nobody takes anyone else's credits.
*/

"use strict";

const Coop = (() => {
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const MAX_PLAYERS = 6;
  const SONG_EVERY = 1;
  // HOW OFTEN A RUNNER'S POSITION GOES OUT, AND HOW FAR BEHIND IT IS DRAWN.
  //
  // This used to drop from 15 a second to 10 and then 8 as players joined, to
  // "stay well inside the channel's limits". The limit on this project is 2500
  // events a second; six players at 15 a second is 90. The throttle was
  // guarding against nothing, and it was the direct cause of the jumping: the
  // fewer updates arrive, the longer each runner sits still between them.
  //
  // So it is a flat 15 a second now, however many are playing.
  const SEND_HZ = 15;
  // Everyone else is drawn this far behind the latest news of them, so there
  // are always two known positions to glide between instead of one to rush at.
  // A little over one update apart, which is what buys the smoothness; much
  // more only adds lag.
  const INTERP_MS = 110;
  const BUF_MAX = 8;
  const DRIFT = 0.9;             // seconds of song drift before a guest is nudged back in line
  const SEEK_GAP = 4;            // and at most one nudge every few seconds
  // Everyone's colour, in the order they joined (the host first).
  const COLOURS = [
    { tint: "rgba(255, 150, 30, 0.4)", text: "#ffc46a" },
    { tint: "rgba(40, 190, 255, 0.4)", text: "#7fe3ff" },
    { tint: "rgba(70, 225, 120, 0.4)", text: "#8ff0a8" },
    { tint: "rgba(255, 90, 200, 0.4)", text: "#ff9ade" },
    { tint: "rgba(150, 100, 255, 0.42)", text: "#c3a6ff" },
    { tint: "rgba(255, 70, 70, 0.4)", text: "#ff9a9a" }
  ];

  const st = {
    on: false,                  // in a co-op run right now
    lobby: false,               // in the lobby (hosting or joined, not running yet)
    host: false,
    hostId: "",
    code: "",
    ch: null,
    myName: "",
    roster: [],                 // [{ id, name }] everyone in the game, host first
    peers: new Map(),           // id -> { id, name, colour, ghost, target, cp }
    offset: 0,                  // host clock minus this clock, in ms (guests only)
    bestRtt: Infinity,
    sendT: 0, songT: 0, tripT: 0,
    quiet: false,               // applying someone else's event: don't send it back
    startTimer: null, countTimer: null,
    cpHoldUntil: 0, cpHoldMax: 0,
    onLobby: null               // the menu's callback when the lobby changes
  };

  const now = () => Date.now();
  const hostNow = () => now() + (st.host ? 0 : st.offset);
  function myId() { const u = Backend.user(); return u ? u.id : ""; }

  function makeCode() {
    let s = "";
    const buf = new Uint32Array(5);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (let i = 0; i < 5; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return s;
  }
  function cleanCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); }
  function cleanName(s) { return String(s || "PLAYER").slice(0, 16).toUpperCase(); }

  function lobbyChanged(msg) { if (st.onLobby) st.onLobby(msg || ""); }

  function send(type, data) {
    if (!st.ch) return;
    st.ch.send({ type: "broadcast", event: "m", payload: Object.assign({ k: type, from: myId() }, data || {}) }).catch(() => {});
  }

  function nameOf(id) { const p = st.peers.get(id); return p ? p.name : "A PLAYER"; }
  function colourFor(index) { return COLOURS[Math.max(0, index) % COLOURS.length]; }

  function freshGhost(colour) {
    const g = newPlayer(2);
    g.invuln = 0; g.coopGhost = true; g.pose = ["idle", 0]; g.coopTint = colour.tint; g.coopText = colour.text;
    return g;
  }

  // Everyone in the game, from the host's list. Keeps ghosts and positions of people still here.
  function applyRoster(list) {
    st.roster = list.slice(0, MAX_PLAYERS);
    const me = myId();
    const keep = new Map();
    st.roster.forEach((r, i) => {
      if (r.id === me) return;
      const old = st.peers.get(r.id);
      const colour = colourFor(i);
      const p = old || { id: r.id, target: null, cp: 0, ghost: null };
      p.name = cleanName(r.name); p.colour = colour;
      if (p.ghost) { p.ghost.coopTint = colour.tint; p.ghost.coopText = colour.text; }
      keep.set(r.id, p);
    });
    st.peers = keep;
  }
  function hostRoster() { send("roster", { list: st.roster }); }

  function removePlayer(id, why) {
    if (!st.peers.has(id) && !st.roster.some(r => r.id === id)) return;
    const was = nameOf(id);
    st.roster = st.roster.filter(r => r.id !== id);
    st.peers.delete(id);
    // Their held drawing goes with them.
    if (typeof Char3D !== "undefined" && Char3D.drop) Char3D.drop("coop:" + id);
    if (st.host) { applyRoster(st.roster); hostRoster(); }
    if (st.on && gameState !== "finished") showToast("CO-OP", was + (why || " LEFT THE GAME."), "", 3);
    if (st.lobby) lobbyChanged(was + " left.");
  }

  // Everything that comes in from the other players.
  function onMessage(msg) {
    const d = msg && msg.payload;
    if (!d || !d.k) return;
    const from = d.from || "";
    switch (d.k) {
      case "hello":            // guest -> host
        if (!st.host) return;
        if (!st.roster.some(r => r.id === from)) {
          if (st.roster.length >= MAX_PLAYERS || st.on) { send("full", { to: from, running: st.on ? 1 : 0 }); return; }
          st.roster.push({ id: from, name: cleanName(d.name) });
        }
        applyRoster(st.roster);
        hostRoster();
        send("welcome", { to: from, mission: selectedMission });
        lobbyChanged();
        break;
      case "welcome":          // host -> one guest
        if (st.host || d.to !== myId()) return;
        st.hostId = from;
        if (d.mission) chooseMission(d.mission);
        for (let i = 0; i < 6; i++) setTimeout(() => send("ping", { t0: now() }), 150 * i);
        lobbyChanged();
        break;
      case "roster":           // host -> everyone: who's in
        if (st.host) return;
        st.hostId = from;
        applyRoster(d.list || []);
        lobbyChanged();
        break;
      case "full":
        if (!st.host && d.to === myId()) { leave(); lobbyChanged(d.running ? "That game has already started." : "That game is full."); }
        break;
      case "ping":
        if (st.host) send("pong", { t0: d.t0, th: now(), to: from });
        break;
      case "pong": {
        if (st.host || d.to !== myId()) return;
        const t1 = now(), rtt = t1 - d.t0;
        if (rtt < st.bestRtt) { st.bestRtt = rtt; st.offset = d.th - (d.t0 + t1) / 2; }
        break;
      }
      case "mission":          // host changed the mission in the lobby
        if (!st.host && d.mission) Promise.resolve(chooseMission(d.mission)).then(() => lobbyChanged());
        break;
      case "start":
        if (st.host) return;
        if (d.mission) chooseMission(d.mission);
        scheduleStart(d.at - st.offset);
        break;
      case "s": {              // someone's snapshot
        const p = st.peers.get(from);
        if (!p) return;
        p.target = d;
        // Kept in a short queue, stamped on arrival, so tick() can draw them
        // between two real positions instead of chasing the newest one.
        // Arrival time rather than the sender's clock: we have no agreed clock
        // with another guest, and the queue only needs the spacing.
        if (!p.buf) p.buf = [];
        const arrived = now();
        // Their clock against ours. Jitter only ever makes a packet look LATE,
        // never early, so the smallest difference we have seen is the honest
        // one. It is allowed to creep upwards slowly in case a clock drifts.
        const seen = arrived - (typeof d.ts === "number" ? d.ts : arrived);
        p.base = p.base === undefined ? seen : Math.min(seen, p.base + 0.02 * realDtMs());
        p.buf.push({ st: (typeof d.ts === "number" ? d.ts : arrived - p.base), x: d.x, y: d.y });
        if (p.buf.length > BUF_MAX) p.buf.shift();
        // Just after a missed checkpoint, a snapshot sent before they rewound can't move the deadline on.
        p.cp = Math.max(0, now() < st.cpHoldUntil ? Math.min(d.cp | 0, st.cpHoldMax) : d.cp | 0);
        break;
      }
      case "song":             // host -> guests: where the song is
        if (st.host || !st.on || gameState !== "playing" || taunt || reading) return;
        if (typeof drive !== "undefined" && drive.active) return;
        {
          const expected = d.c + Math.max(0, (hostNow() - d.t)) / 1000 * (d.r || 1);
          // Jumping in the song is what you hear as a glitch, so only when it has drifted well
          // out, and not more than once every few seconds (a busy phone drifts and comes back).
          if (Math.abs(expected - songClock) > DRIFT && expected >= 0 && performance.now() / 1000 - (st.lastSeek || -99) > SEEK_GAP) { st.lastSeek = performance.now() / 1000; seekSong(expected); }
        }
        break;
      case "rewind":
        if (!st.on) return;
        st.quiet = true; try { coopRewind(nameOf(from)); } finally { st.quiet = false; }
        break;
      case "miss":
        if (!st.on || taunt) return;
        st.quiet = true; try { missCheckpoint(Math.min(mission.parts.length - 1, d.i | 0)); } finally { st.quiet = false; }
        break;
      case "ko": {
        if (!st.on || !level) return;
        const wd = (level.wardens || [])[d.i];
        if (wd && wd.alive) coopDownWarden(wd);
        break;
      }
      case "drone": {
        if (!st.on || !level) return;
        const dr = (level.drones || [])[d.i];
        if (dr && dr.alive) { dr.alive = false; burst(dr.x, dr.y, "#7fe3ff", 14, 220); }
        break;
      }
      case "trip":             // someone slid into you
        if (!st.on || gameState !== "playing" || d.to !== myId()) return;
        coopTripped(nameOf(from));
        break;
      case "finish":
        if (st.on && gameState === "playing") showBanner(nameOf(from) + " MADE IT HOME", "", 2.2);
        break;
      case "pause":
        if (st.on && gameState === "playing") { st.quiet = true; try { pauseGame(); } finally { st.quiet = false; } setText("pauseTrack", nameOf(from) + " PAUSED THE GAME"); }
        break;
      case "resume":
        if (st.on && gameState === "paused") { st.quiet = true; try { resumeGame(); } finally { st.quiet = false; } }
        break;
      case "wantnext":         // a guest pressed Next or Run it back: the host takes everyone there
        if (st.host && (st.on || st.lobby) && d.mission) regroupAll(d.mission);
        break;
      case "regroup":          // host -> everyone: back to the lobby for the next one
        if (st.host || !(st.on || st.lobby)) return;
        toLobby(d.mission);
        break;
      case "bye":
        if (!st.host && from === st.hostId && st.lobby) { leave(); lobbyChanged("The host closed the game."); return; }
        removePlayer(from);
        break;
    }
  }

  async function open(code, asHost) {
    leave();
    const ch = Backend.channel("feelzrun-coop-" + code, { config: { broadcast: { self: false, ack: false }, presence: { key: myId() } } });
    if (!ch) throw new Error("Online co-op works at feelzmachine.com/run.");
    st.ch = ch; st.code = code; st.host = asHost; st.lobby = true; st.hostId = asHost ? myId() : "";
    st.offset = 0; st.bestRtt = Infinity;
    st.myName = cleanName(Progress.data.name || "PLAYER");
    st.roster = asHost ? [{ id: myId(), name: st.myName }] : [];
    st.peers = new Map();
    ch.on("broadcast", { event: "m" }, onMessage);
    ch.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const p of leftPresences || []) {
        if (!p || !p.id) continue;
        if (!st.host && p.id === st.hostId && st.lobby) { leave(); lobbyChanged("The host closed the game."); return; }
        removePlayer(p.id);
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Couldn't reach the co-op server. Check your connection and try again.")), 10000);
      ch.subscribe(status => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(new Error("Couldn't reach the co-op server. Check your connection and try again.")); }
      });
    });
    await ch.track({ id: myId(), name: st.myName, role: asHost ? "host" : "guest" });
  }

  function leave() {
    clearTimeout(st.startTimer); clearInterval(st.countTimer); st.startTimer = null;
    if (st.ch) {
      try { send("bye"); } catch (e) {}
      const ch = st.ch; st.ch = null;
      try { ch.untrack(); } catch (e) {}
      try { Backend.removeChannel(ch); } catch (e) {}
    }
    st.on = false; st.lobby = false; st.roster = []; st.peers = new Map(); st.code = ""; st.hostId = "";
  }

  function scheduleStart(localAt) {
    clearTimeout(st.startTimer); clearInterval(st.countTimer);
    const show = () => {
      const left = Math.ceil((localAt - now()) / 1000);
      if (left > 0 && st.lobby) lobbyChanged("STARTING IN " + left + "...");
    };
    show();
    st.countTimer = setInterval(show, 250);
    st.startTimer = setTimeout(() => {
      clearInterval(st.countTimer);
      if (!st.lobby) return;
      st.lobby = false; st.on = true;
      for (const p of st.peers.values()) { p.ghost = freshGhost(p.colour); p.ghost.coopId = p.id; p.target = null; p.cp = 0; p.buf = []; p.base = undefined; }
      st.sendT = 0; st.songT = 0; st.tripT = 0;
      if (typeof coopBegin === "function") coopBegin();
    }, Math.max(0, localAt - now()));
  }

  // Everyone back in the lobby, together, with the next mission picked. The crew stays connected.
  function toLobby(missionId) {
    clearTimeout(st.startTimer); clearInterval(st.countTimer);
    st.on = false; st.lobby = true;
    for (const p of st.peers.values()) { p.ghost = null; p.target = null; p.cp = 0; p.buf = []; p.base = undefined; }
    if (missionId) chooseMission(missionId);
    if (typeof coopToLobby === "function") coopToLobby();
    lobbyChanged();
  }

  function regroupAll(missionId) {
    send("regroup", { mission: missionId });
    toLobby(missionId);
  }

  // How long the last frame took, in ms, for the slow creep on p.base.
  let lastTick = 0;
  function realDtMs() { const n = now(), d = lastTick ? n - lastTick : 16; return Math.max(1, Math.min(100, d)); }

  // One runner's drawn position, from their queue of real ones.
  //
  // Played back on THEIR clock, not on arrival times. Arrival times carry the
  // network's jitter straight into the picture: a packet 25ms late makes the
  // runner appear to speed up and then slow down. Their own stamps are evenly
  // spaced because they were sent evenly spaced, and p.base lines their clock
  // up with ours.
  function placeGhost(p, g, t, realDt) {
    const buf = p.buf;

    // A long way off: they respawned, rewound or just appeared. Go there.
    if (Math.abs(t.x - g.x) > 600 || Math.abs(t.y - g.y) > 600) {
      g.x = t.x; g.y = t.y;
      if (buf) buf.length = 0;
      return;
    }
    if (!buf || buf.length === 0) return;

    const at = now() - (p.base || 0) - INTERP_MS;

    let a = null, b = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].st <= at) { a = buf[i]; b = buf[i + 1] || null; break; }
    }

    let tx, ty;
    if (a && b) {
      const span = b.st - a.st;
      const f = span > 0 ? Math.max(0, Math.min(1, (at - a.st) / span)) : 1;
      tx = a.x + (b.x - a.x) * f;
      ty = a.y + (b.y - a.y) * f;
    } else if (a) {
      // Nothing newer yet: hold at the last real position rather than guess
      // where they went. A wrong guess has to be taken back, and taking it
      // back is a jump.
      tx = a.x; ty = a.y;
    } else {
      tx = buf[0].x; ty = buf[0].y;
    }

    // A short ease onto that point, so a dropped packet shows as a slight
    // change of speed rather than a step. Frame rate independent.
    const k = 1 - Math.exp(-22 * realDt);
    g.x += (tx - g.x) * k;
    g.y += (ty - g.y) * k;

    while (buf.length > 2 && buf[1].st <= at) buf.shift();
  }

  // Called every frame from the game's update.
  function tick(realDt) {
    if (!st.on) return;
    lastTick = now();
    const me = players[0];
    if (!me) return;
    st.sendT -= realDt;
    if (st.sendT <= 0 && st.ch) {
      st.sendT = 1 / SEND_HZ;
      const pose = kodaPose(me);
      send("s", {
        // Our own clock. Only the GAPS between a sender's own stamps are ever
        // used, so two phones whose clocks disagree still works: the
        // disagreement is a constant and cancels out.
        ts: now(),
        x: Math.round(me.x), y: Math.round(me.y), h: me.h,
        f: me.climb ? me.climb.side : me.facing,
        a: pose[0], n: pose[1], b: me.boostTime > 0 ? 1 : 0, sh: me.shield ? 1 : 0,
        g: me.ground ? 1 : 0, cp: Math.min(me.cp, level.checkpoints.length - 2), fin: me.finished ? 1 : 0,
        iw: inward.active ? 1 : 0
      });
    }
    if (st.host) {
      st.songT -= realDt;
      if (st.songT <= 0 && st.ch && gameState === "playing" && !taunt) { st.songT = SONG_EVERY; send("song", { c: songClock, t: now(), r: songRate() }); }
    }
    st.tripT = Math.max(0, st.tripT - realDt);
    let bestCp = 0;
    for (const p of st.peers.values()) {
      const g = p.ghost, t = p.target;
      if (!g || !t) continue;
      // ── Where they actually are on this screen ─────────────────────────
      //
      // Drawn INTERP_MS behind the newest position, between the two queued
      // positions that straddle that moment. So a runner moves at the speed
      // they were really moving, the whole time, instead of easing towards the
      // last thing we heard and then sitting still until the next one lands.
      // That easing and stalling is what the jumping was.
      placeGhost(p, g, t, realDt);
      g.h = t.h || STAND_H; g.facing = t.f || 1; g.pose = [t.a || "idle", t.n | 0];
      g.boostTime = t.b ? 1 : 0; g.shield = !!t.sh; g.ground = t.g ? { y: g.y } : null;
      g.cp = t.cp | 0; g.finished = !!t.fin; g.hidden = !!t.iw || !!t.fin;
      bestCp = Math.max(bestCp, p.cp);
      // Slide into someone to trip them up (once every couple of seconds).
      if (!g.hidden && me.state === "slide" && st.tripT <= 0 && t.g && t.a !== "slide"
          && Math.abs(g.x - me.x) < BODY_W * 1.1 && Math.abs(g.y - me.y) < 24) {
        st.tripT = 2.5;
        p.fallUntil = now() + 900;   // show them going down here straight away
        burst(g.x, g.y - 10, "#d9c7a0", 14, 180);
        floatText(g.x, g.y - g.h - 20, "TRIPPED!", p.colour.text);
        send("trip", { to: p.id });
        showToast("TRIPPED", p.name + " GOES DOWN", "ko", 1.4);
        sfx.stun && sfx.stun();
      }
      // Someone you've just tripped goes down on your screen straight away, not when their next update lands.
      if (p.fallUntil > now()) g.pose = ["stun", Math.min(5, Math.floor((900 - (p.fallUntil - now())) / 150))];
    }
    // Shared checkpoints: once anyone is past one, it counts for everyone.
    if (bestCp > me.cp && !me.finished) me.cp = Math.min(bestCp, level.checkpoints.length - 2);
  }

  // Back in after a wipeout: beside whoever is furthest on and standing somewhere safe.
  function reviveSpot(fromX) {
    if (!st.on) return null;
    let best = null;
    for (const p of st.peers.values()) {
      const g = p.ghost, t = p.target;
      if (!g || !t || g.hidden || !t.g || g.x <= fromX) continue;
      if (!best || g.x > best.x) best = { x: g.x - 30, y: g.y, name: p.name };
    }
    return best;
  }

  return {
    get on() { return st.on; },
    get lobby() { return st.lobby; },
    get host() { return st.host; },
    get code() { return st.code; },
    get maxPlayers() { return MAX_PLAYERS; },
    get quiet() { return st.quiet; },
    // Everyone in the game for the lobby, host first: { id, name, me, colour }.
    get roster() {
      const me = myId();
      return st.roster.map((r, i) => ({ id: r.id, name: cleanName(r.name), me: r.id === me, host: i === 0, colour: colourFor(i) }));
    },
    get partner() { return st.peers.size ? [...st.peers.values()][0] : null; },
    get partners() { return [...st.peers.values()]; },
    // The other runners to draw during a run.
    get ghosts() {
      if (!st.on) return [];
      const out = [];
      for (const p of st.peers.values()) if (p.ghost && p.target && !p.ghost.hidden) { p.ghost.coopName = p.name; p.ghost.coopId = p.id; out.push(p.ghost); }
      return out;
    },
    partnerName() { const names = [...st.peers.values()].map(p => p.name); return names.length ? names.join(", ") : "YOUR CREW"; },
    set onLobby(fn) { st.onLobby = fn; },
    async hostGame() { const code = makeCode(); await open(code, true); return code; },
    async join(code) {
      code = cleanCode(code);
      if (code.length !== 5) throw new Error("Codes are five letters and numbers.");
      await open(code, false);
      send("hello", { name: st.myName });
      // No answer: nobody is hosting that code.
      setTimeout(() => { if (st.lobby && !st.host && !st.hostId) { leave(); lobbyChanged("No game found with that code. Check it with the host."); } }, 6000);
    },
    missionChanged(id) { if (st.lobby && st.host) send("mission", { mission: id }); },
    start() {
      if (!st.host || !st.peers.size) return;
      const at = now() + 3500;
      send("start", { mission: selectedMission, at });
      scheduleStart(at);
    },
    // Next or Run it back. The host takes the whole crew back to the lobby with
    // that mission ready; anyone else asks the host's game to do it.
    regroup(missionId) {
      if (!(st.on || st.lobby)) return;
      if (st.host) regroupAll(missionId);
      else send("wantnext", { mission: missionId });
    },
    leave,
    tick,
    reviveSpot,
    noteMiss(idx) {
      for (const p of st.peers.values()) p.cp = Math.min(p.cp, idx);
      st.cpHoldUntil = now() + 3000; st.cpHoldMax = idx;
    },
    send(type, data) { if (st.on && !st.quiet) send(type, data); }
  };
})();
