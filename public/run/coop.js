/*
  FEELZ RUN - ONLINE CO-OP
  Two players, two phones (or any two screens), one mission.

  How it works:
  - One player hosts and gets a five letter code. The other types the code in.
    Both are signed in with their Feelz Machine accounts.
  - The two games talk over a Supabase Realtime channel (broadcast and presence,
    no database tables). Nothing here can change a score: each player's run is
    posted by their own game and checked on the server as usual.
  - Each phone runs its own Koda. The partner is drawn from their position,
    which arrives about 15 times a second, smoothed so they glide.
  - Shared: the song (the host's clock leads), the checkpoints (whoever reaches
    one first moves the deadline on for both, and a wiped-out player comes back
    beside their partner), rewinds, missed checkpoints, knockouts and pause.
  - Each player collects their own records, notes, journal pages and coin, so
    nobody takes the other's credits.
*/

"use strict";

const Coop = (() => {
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const SEND_EVERY = 1 / 15;
  const SONG_EVERY = 1;
  const DRIFT = 0.35;            // seconds of song drift before the guest is nudged back in line

  const st = {
    on: false,                  // in a co-op run right now
    lobby: false,               // in the lobby (hosting or joined, not running yet)
    host: false,
    code: "",
    ch: null,
    myName: "",
    partner: null,              // { name, id } once they're here
    offset: 0,                  // host clock minus this clock, in ms (guest only)
    bestRtt: Infinity,
    sendT: 0, songT: 0,
    ghost: null,
    target: null,               // the latest snapshot from the partner
    partnerCp: 0,
    partnerFinished: false,
    quiet: false,               // applying the partner's event: don't send it back
    startTimer: null, countTimer: null,
    cpHoldUntil: 0, cpHoldMax: 0,
    onLobby: null               // the menu's callback when the lobby changes
  };

  const now = () => Date.now();
  const hostNow = () => now() + (st.host ? 0 : st.offset);

  function makeCode() {
    let s = "";
    const buf = new Uint32Array(5);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (let i = 0; i < 5; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return s;
  }
  function cleanCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); }

  function lobbyChanged(msg) { if (st.onLobby) st.onLobby(msg || ""); }

  function send(type, data) {
    if (!st.ch) return;
    st.ch.send({ type: "broadcast", event: "m", payload: Object.assign({ k: type }, data || {}) }).catch(() => {});
  }

  function partnerName() { return st.partner && st.partner.name ? st.partner.name : "PARTNER"; }

  function freshGhost() {
    const g = newPlayer(2);
    g.invuln = 0; g.coopGhost = true; g.pose = ["idle", 0];
    return g;
  }

  // Everything that comes in from the partner.
  function onMessage(msg) {
    const d = msg && msg.payload;
    if (!d || !d.k) return;
    switch (d.k) {
      case "hello":            // guest -> host
        if (!st.host) return;
        if (st.partner && st.partner.id !== d.id) { send("full", { id: d.id }); return; }
        st.partner = { name: String(d.name || "PARTNER").slice(0, 16).toUpperCase(), id: d.id };
        send("welcome", { name: st.myName, mission: selectedMission, to: d.id });
        lobbyChanged();
        break;
      case "welcome":          // host -> guest
        if (st.host || d.to !== myId()) return;
        st.partner = { name: String(d.name || "HOST").slice(0, 16).toUpperCase(), id: "host" };
        if (d.mission) chooseMission(d.mission);
        for (let i = 0; i < 6; i++) setTimeout(() => send("ping", { t0: now(), id: myId() }), 150 * i);
        lobbyChanged();
        break;
      case "full":
        if (!st.host && d.id === myId()) { leave(); lobbyChanged("That game already has two players."); }
        break;
      case "ping":
        if (st.host) send("pong", { t0: d.t0, th: now(), id: d.id });
        break;
      case "pong": {
        if (st.host || d.id !== myId()) return;
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
      case "s":                // the partner's snapshot
        st.target = d;
        // Just after a missed checkpoint, a snapshot sent before the partner rewound can't move the deadline on.
        st.partnerCp = Math.max(0, now() < st.cpHoldUntil ? Math.min(d.cp | 0, st.cpHoldMax) : d.cp | 0);
        break;
      case "song":             // host -> guest: where the song is
        if (st.host || !st.on || gameState !== "playing" || taunt || reading) return;
        if (typeof drive !== "undefined" && drive.active) return;
        {
          const expected = d.c + Math.max(0, (hostNow() - d.t)) / 1000 * (d.r || 1);
          if (Math.abs(expected - songClock) > DRIFT && expected >= 0) seekSong(expected);
        }
        break;
      case "rewind":
        if (!st.on) return;
        st.quiet = true; try { coopRewind(partnerName()); } finally { st.quiet = false; }
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
      case "finish":
        st.partnerFinished = true;
        if (st.on && gameState === "playing") showBanner(partnerName() + " MADE IT HOME", "", 2.2);
        break;
      case "pause":
        if (st.on && gameState === "playing") { st.quiet = true; try { pauseGame(); } finally { st.quiet = false; } setText("pauseTrack", partnerName() + " PAUSED THE GAME"); }
        break;
      case "resume":
        if (st.on && gameState === "paused") { st.quiet = true; try { resumeGame(); } finally { st.quiet = false; } }
        break;
      case "bye":
        partnerLeft();
        break;
    }
  }

  function myId() { const u = Backend.user(); return u ? u.id : ""; }

  function partnerLeft() {
    const was = partnerName();
    st.partner = null; st.target = null; st.ghost = null;
    if (st.on && gameState !== "finished") showToast("CO-OP", was + " LEFT THE GAME. CARRY ON SOLO.", "", 3);
    if (st.lobby) lobbyChanged(was + " left.");
  }

  async function open(code, asHost) {
    leave();
    const ch = Backend.channel("feelzrun-coop-" + code, { config: { broadcast: { self: false, ack: false }, presence: { key: myId() } } });
    if (!ch) throw new Error("Online co-op works at feelzmachine.com/run.");
    st.ch = ch; st.code = code; st.host = asHost; st.lobby = true; st.partner = null;
    st.offset = 0; st.bestRtt = Infinity;
    st.myName = (Progress.data.name || "PLAYER").toUpperCase().slice(0, 16);
    ch.on("broadcast", { event: "m" }, onMessage);
    ch.on("presence", { event: "leave" }, ({ leftPresences }) => {
      if (!st.partner) return;
      if ((leftPresences || []).some(p => (p.role === "host" && !st.host) || (st.partner && p.id === st.partner.id))) partnerLeft();
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
    st.on = false; st.lobby = false; st.partner = null; st.target = null; st.ghost = null;
    st.partnerCp = 0; st.partnerFinished = false; st.code = "";
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
      st.ghost = freshGhost(); st.target = null; st.partnerCp = 0; st.partnerFinished = false;
      st.sendT = 0; st.songT = 0;
      if (typeof coopBegin === "function") coopBegin();
    }, Math.max(0, localAt - now()));
  }

  // Called every frame from the game's update.
  function tick(realDt) {
    if (!st.on) return;
    const me = players[0];
    if (!me) return;
    st.sendT -= realDt;
    if (st.sendT <= 0 && st.ch) {
      st.sendT = SEND_EVERY;
      const pose = kodaPose(me);
      send("s", {
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
    // The partner glides towards their latest position.
    const g = st.ghost, t = st.target;
    if (g && t) {
      const far = Math.abs(t.x - g.x) > 600 || Math.abs(t.y - g.y) > 600;
      const k = far ? 1 : Math.min(1, realDt * 14);
      g.x += (t.x - g.x) * k; g.y += (t.y - g.y) * k;
      g.h = t.h || STAND_H; g.facing = t.f || 1; g.pose = [t.a || "idle", t.n | 0];
      g.boostTime = t.b ? 1 : 0; g.shield = !!t.sh; g.ground = t.g ? { y: g.y } : null;
      g.cp = t.cp | 0; g.finished = !!t.fin; g.hidden = !!t.iw || !!t.fin;
    }
    // Shared checkpoints: once the partner is past one, it counts for you too.
    if (st.partnerCp > me.cp && !me.finished) me.cp = Math.min(st.partnerCp, level.checkpoints.length - 2);
  }

  // Back in after a wipeout: beside the partner if they're further on and standing somewhere safe.
  function reviveSpot(fromX) {
    if (!st.on || !st.ghost || !st.target || st.ghost.hidden) return null;
    const g = st.ghost;
    if (!st.target.g || g.x <= fromX) return null;
    return { x: g.x - 30, y: g.y };
  }

  return {
    get on() { return st.on; },
    get lobby() { return st.lobby; },
    get host() { return st.host; },
    get code() { return st.code; },
    get partner() { return st.partner; },
    get ghost() { return st.on && st.ghost && st.target && !st.ghost.hidden ? st.ghost : null; },
    get quiet() { return st.quiet; },
    partnerCp: () => (st.on ? st.partnerCp : 0),
    partnerName,
    set onLobby(fn) { st.onLobby = fn; },
    async hostGame() { const code = makeCode(); await open(code, true); return code; },
    async join(code) {
      code = cleanCode(code);
      if (code.length !== 5) throw new Error("Codes are five letters and numbers.");
      await open(code, false);
      send("hello", { name: st.myName, id: myId() });
      // No answer: nobody is hosting that code.
      setTimeout(() => { if (st.lobby && !st.host && !st.partner) { leave(); lobbyChanged("No game found with that code. Check it with your partner."); } }, 6000);
    },
    missionChanged(id) { if (st.lobby && st.host) send("mission", { mission: id }); },
    start() {
      if (!st.host || !st.partner) return;
      const at = now() + 3500;
      send("start", { mission: selectedMission, at });
      scheduleStart(at);
    },
    leave,
    tick,
    reviveSpot,
    noteMiss(idx) { st.partnerCp = Math.min(st.partnerCp, idx); st.cpHoldUntil = now() + 3000; st.cpHoldMax = idx; },
    send(type, data) { if (st.on && !st.quiet) send(type, data); }
  };
})();
