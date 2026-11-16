/*
  FEELZ RUN - ARTIST RUNS
  Artists on Feelz Machine can put one of their own songs on one of the album
  levels, from their Hub. The map, world and enemies are the album level's;
  the song is theirs, and the checkpoint deadlines follow the sections they
  marked in it. Runs post, rank and earn credits exactly as album runs do (the
  server knows each artist level as mission "a-<id>").

  What changes in an artist run:
  - their song plays, with no lyrics on screen
  - no journal pages or F.I.L.L. coin (those belong to the album story)
  - the moves tied to the album songs (breathing at the windows) are off
  - lightning strikes move with the song sections
*/

"use strict";

const ArtistLevels = (() => {
  const loaded = {};          // level id -> the level as the server described it
  let list = null;            // every live artist level, once fetched

  // A moment in the album song -> the same moment in the artist's song, section by section.
  function remapTime(t, tplParts, parts) {
    for (let i = 0; i < tplParts.length; i++) {
      const a = tplParts[i];
      if (t <= a.end || i === tplParts.length - 1) {
        const k = Math.max(0, Math.min(1, (t - a.start) / Math.max(0.001, a.end - a.start)));
        return parts[i][0] + k * (parts[i][1] - parts[i][0]);
      }
    }
    return t;
  }

  function build(lv, audioUrl) {
    const tpl = MISSION_DATA[lv.template];
    if (!tpl || !Array.isArray(lv.parts) || lv.parts.length !== tpl.parts.length) return null;
    const d = JSON.parse(JSON.stringify(tpl));
    d.id = lv.mission;
    d.artistLevel = { id: lv.id, artist: lv.artist_name, title: lv.title, slug: lv.slug, trackId: lv.track_id, discountMax: lv.discount_max | 0, template: lv.template };
    d.title = String(lv.title || "").toUpperCase();
    d.song = { title: lv.title, src: audioUrl, lyrics: null, seconds: Number(lv.song_seconds) };
    d.parts = tpl.parts.map((p, i) => {
      const q = Object.assign({}, p, { start: Number(lv.parts[i][0]), end: Number(lv.parts[i][1]) });
      delete q.stillness;
      return q;
    });
    if (Array.isArray(tpl.lightning)) d.lightning = tpl.lightning.map(t => Math.round(remapTime(t, tpl.parts, lv.parts) * 100) / 100);
    d.journal = []; d.journalText = {}; d.coin = null; d.windows = [];
    d.taunts = ["TOO SLOW.", "THE SONG GOT THERE FIRST.", "RUN IT BACK."];
    if (lv.bpm) d.bpm = lv.bpm;
    return d;
  }

  // The song, from Feelz Machine's own streaming function (signed, short lived).
  async function audioFor(trackId) {
    const res = await fetch("/.netlify/functions/stream-url", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId })
    });
    const data = await res.json().catch(() => ({}));
    const t = data && data.tracks && data.tracks[trackId];
    if (!res.ok || !t || !t.url) throw new Error("That song isn't available right now.");
    return t.url;
  }

  function entryFor(lv) {
    return {
      id: lv.mission, title: String(lv.title || "").toUpperCase(), ready: true, artist: String(lv.artist_name || "").toUpperCase(),
      cover: lv.cover || null, listenUrl: lv.slug ? "https://www.feelzmachine.com/track/" + lv.slug : ""
    };
  }

  // Make one level playable: fetch its song, build its mission, add it to the strip.
  async function ensure(missionOrId) {
    const id = String(missionOrId).replace(/^a-/, "");
    const mid = "a-" + id;
    if (MISSION_DATA[mid]) return mid;
    let lv = (list || []).find(l => l.id === id) || loaded[id];
    if (!lv) {
      const rows = await Backend.artistLevels(id);
      lv = rows && rows[0];
    }
    if (!lv) throw new Error("That artist run isn't available any more.");
    const url = await audioFor(lv.track_id);
    const d = build(lv, url);
    if (!d) throw new Error("That artist run couldn't be loaded.");
    loaded[id] = lv;
    MISSION_DATA[mid] = d;
    if (!MISSIONS.some(mi => mi.id === mid)) MISSIONS.push(entryFor(lv));
    return mid;
  }

  async function fetchList() {
    if (!Backend.online) return [];
    try { list = await Backend.artistLevels(null); } catch (e) { list = []; }
    return list || [];
  }

  // Songs a voucher can be bought for from an artist run (the artist set a discount).
  function voucherTracks() {
    const out = [];
    for (const lv of Object.values(loaded).concat(list || [])) {
      if (!lv || !(lv.discount_max > 0) || out.some(o => o.id === lv.track_id)) continue;
      out.push({ id: lv.track_id, title: lv.title, artist: lv.artist_name, max: lv.discount_max | 0, mission: lv.mission });
    }
    return out;
  }

  return { ensure, fetchList, voucherTracks, get list() { return list || []; } };
})();

/* The Artist Runs panel on the start screen. */

const artistOverlay = document.getElementById("artistOverlay");

async function pickArtistLevel(lv, btn) {
  setText("artistError", "");
  if (btn) { btn.disabled = true; btn.classList.add("loading"); }
  try {
    const mid = await ArtistLevels.ensure(lv.mission);
    chooseMission(mid);
    if (typeof Coop !== "undefined") Coop.missionChanged(mid);
    artistOverlay.classList.add("hidden");
  } catch (e) {
    setText("artistError", e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
  }
}

async function openArtistRuns() {
  artistOverlay.classList.remove("hidden");
  setText("artistError", "");
  const box = document.getElementById("artistList");
  box.innerHTML = "<p class='skills-note'>Loading...</p>";
  const rows = await ArtistLevels.fetchList();
  box.innerHTML = "";
  if (!rows.length) { box.append(el("p", "skills-note", "No artist runs yet.")); return; }
  for (const lv of rows) {
    const tpl = MISSIONS.find(mi => mi.id === lv.template);
    const card = el("button", "artist-run");
    card.type = "button";
    if (lv.cover) card.style.backgroundImage = "url(" + JSON.stringify(String(lv.cover)) + ")";
    card.append(
      el("span", "ar-title", String(lv.title || "").toUpperCase()),
      el("span", "ar-artist", String(lv.artist_name || "").toUpperCase()),
      el("span", "ar-level", (tpl ? tpl.title + " LEVEL" : "") + (lv.discount_max > 0 ? " · UP TO " + lv.discount_max + "% OFF WITH CREDITS" : "")));
    card.addEventListener("click", () => pickArtistLevel(lv, card));
    box.append(card);
  }
  navFocus(box.querySelector("button"));
}

document.getElementById("artistRunsButton").addEventListener("click", openArtistRuns);

// Show the button only when there's something to play, and open a shared link (/run/?level=<id>) straight away.
(async () => {
  if (!Backend.online) return;
  const rows = await ArtistLevels.fetchList();
  document.getElementById("artistRunsButton").classList.toggle("hidden", !rows.length);
  const want = new URLSearchParams(location.search).get("level");
  if (want && /^[0-9a-f-]{36}$/i.test(want)) {
    try { const mid = await ArtistLevels.ensure(want); chooseMission(mid); }
    catch (e) { openArtistRuns().then(() => setText("artistError", e.message)); }
  }
})();
