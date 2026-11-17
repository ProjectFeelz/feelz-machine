"use strict";

/* ---------------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------------- */

applySound();

setText("soundButton", soundOn ? "SOUND: ON" : "SOUND: OFF");

setText("lyricsButton", lyricsOn ? "LYRICS: ON" : "LYRICS: OFF");

setMode("1");

// Fetch the first mission's song now, so it is ready the moment they press Play.
{
  const first = MISSION_DATA[selectedMission];
  if (first && first.song && first.song.src) loadSongBlob(first.song.src);
}

updatePlayerCard();

if (Backend.online) {
  Backend.init().then(() => refreshFromServer()).then(updatePlayerCard);
  Backend.onChange(() => refreshFromServer().then(updatePlayerCard));
}

gameFrame.classList.add("menu-mode");

requestAnimationFrame(attractLoop);

requestAnimationFrame(padMenus);
