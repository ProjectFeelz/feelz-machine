"use strict";

const sx = x => Math.round(x - cameraX);

const sy = y => Math.round(y - cameraY);

const onScreen = (x, w, margin) => x + (w || 0) > cameraX - (margin || 80) && x < cameraX + W + (margin || 80);

let frameTime = 0;   // seconds, for idle animations
