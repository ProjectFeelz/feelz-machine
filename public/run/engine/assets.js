"use strict";

/* ---------------------------------------------------------------------------
   ART
   Every image draws only once it has loaded. A run waits at the start until
   the pictures it has asked for are in (artPending), so nothing pops in.
--------------------------------------------------------------------------- */

const artPending = new Set();
function loadImage(src) {
  const img = new Image();
  img.ready = false;
  img.onload = () => { img.ready = true; artPending.delete(img); };
  img.onerror = () => { artPending.delete(img); console.warn("Image not found: " + src); };
  if (src) { artPending.add(img); img.src = src; }
  return img;
}
