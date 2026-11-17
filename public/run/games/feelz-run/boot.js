"use strict";

/* ---------------------------------------------------------------------------
   BOOT
--------------------------------------------------------------------------- */

applySound();

setText("soundButton", soundOn ? "SOUND: ON" : "SOUND: OFF");

setText("lyricsButton", lyricsOn ? "LYRICS: ON" : "LYRICS: OFF");

setMode("1");

updatePlayerCard();

if (Backend.online) {
  Backend.init().then(() => refreshFromServer()).then(updatePlayerCard);
  Backend.onChange(() => refreshFromServer().then(updatePlayerCard));
}

gameFrame.classList.add("menu-mode");

requestAnimationFrame(attractLoop);

requestAnimationFrame(padMenus);
