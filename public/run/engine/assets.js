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
  const done = () => { img.ready = true; artPending.delete(img); };
  // onload means the file has ARRIVED. It does not mean it can be drawn: the
  // pixels stay packed until something draws the picture for the first time,
  // and unpacking a painting is tens of milliseconds on a phone. Paid during
  // play, one picture at a time, with the song already running, that is a
  // stutter at the start of every run and nowhere else - which is exactly
  // what the Samsung showed: the whole of the drawing costing 1.7ms while the
  // frame took 142.
  //
  // decode() does that work here instead, while the run is still waiting. The
  // wait above already claims to cover this; now it does. A browser without
  // decode(), or a picture that will not decode, behaves exactly as before.
  img.onload = () => {
    if (typeof img.decode === "function") img.decode().then(done, done);
    else done();
  };
  img.onerror = () => { artPending.delete(img); console.warn("Image not found: " + src); };
  if (src) { artPending.add(img); img.src = src; }
  return img;
}
