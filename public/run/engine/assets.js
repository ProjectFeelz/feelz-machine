"use strict";

/* ---------------------------------------------------------------------------
   ART
   Every image draws only once it has loaded, so the game never waits on it.
--------------------------------------------------------------------------- */

function loadImage(src) {
  const img = new Image();
  img.ready = false;
  img.onload = () => { img.ready = true; };
  img.onerror = () => console.warn("Image not found: " + src);
  if (src) img.src = src;
  return img;
}
