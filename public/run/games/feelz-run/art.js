"use strict";

const art = {
  koda: loadImage(SPRITES.koda.src),
  warden: loadImage(SPRITES.warden.src),
  kodaMask: loadImage(SPRITES.koda_mask.src),
  coin: loadImage(SPRITES.coin.src),
  drone: loadImage(SPRITES.drone.src),
  kit: loadImage(SPRITES.kit.src),
  meshyKit: loadImage(SPRITES.meshyKit.src),
  props2d: loadImage("assets/worlds/props-2d.webp"),
  walkers: loadImage(SPRITES.walkers.src),
  tiles: loadImage(SPRITES.tiles.src),
  logo: loadImage(GAME.logo),
  zora: loadImage(SPRITES.zora.src),
  back: {},
  enemies: {},
  npcs: loadImage(SPRITES.npcs.src),
  loc: {},
  worlds: {}
};

// Loaded the first time they're drawn: a level only pulls in the wardens it has,
// and the seen-from-behind sheets only for the inward runs.
const lazyImage = (obj, key, src) => Object.defineProperty(obj, key, { enumerable: true, get() { return this["_" + key] || (this["_" + key] = loadImage(src)); } });
for (const [k, d] of Object.entries(SPRITES.enemies)) lazyImage(art.enemies, k, d.src);
lazyImage(art.back, "koda", SPRITES.back.koda);
lazyImage(art.back, "koda_mask", SPRITES.back.koda_mask);
lazyImage(art.back, "zora", SPRITES.back.zora);

// Location paintings: loaded when a mission that uses them is chosen.
function locImage(name) {
  if (!art.loc[name]) art.loc[name] = loadImage("assets/worlds/loc/" + name + ".webp");
  return art.loc[name];
}

// Each world's layers load the first time something draws them (a level only
// pulls in the worlds it visits). near can be a list: the pictures alternate.
for (const [id, wd] of Object.entries(WORLDS)) {
  const lazy = {};
  for (const k of ["far", "near", "clouds"]) {
    Object.defineProperty(lazy, k, { enumerable: true, get() {
      if (!this["_" + k]) this["_" + k] = Array.isArray(wd[k]) ? wd[k].map(loadImage) : loadImage(wd[k]);
      return this["_" + k];
    } });
  }
  art.worlds[id] = lazy;
}

// Where each piece sits in the city kit sheet: [x, y, width, height]. Rendered from the F.I.L.L. 3D kits.
// Building tiles: 2 m wall panels, street stone, roof cap, catwalk and shutter, rendered in Blender
// from CC0 textures at 128 pixels a metre.
const TILES = {
  wall_tin: [0, 0, 256, 256], wall_tin_win: [258, 0, 256, 256], wall_tin_win_lit: [516, 0, 256, 256],
  wall_concrete: [0, 258, 256, 256], wall_concrete_win: [258, 258, 256, 256], wall_concrete_win_lit: [516, 258, 256, 256],
  wall_brick: [0, 516, 256, 256], wall_brick_win: [258, 516, 256, 256], wall_brick_win_lit: [516, 516, 256, 256],
  street_stone: [0, 774, 256, 128], cap_metal: [258, 774, 256, 51], catwalk: [516, 774, 256, 204], shutter: [0, 980, 256, 256]
};

// Which wall each world builds with, and how dark the dusk makes it.
const WORLD_WALLS = { lc: { wall: "tin", shade: 0.42 }, mc: { wall: "concrete", shade: 0.55 }, uc: { wall: "brick", shade: 0.4 }, ve: { wall: "brick", shade: 0.62 }, rc: { wall: "brick", shade: 0.3 } };

const KIT = {
  scaffold: [0, 0, 263, 380], wall_window: [265, 0, 241, 363], wall_door: [508, 0, 241, 363], stall: [0, 382, 440, 362],
  pipe_climb: [442, 382, 36, 361], laundry: [0, 746, 722, 307], shrine: [724, 746, 101, 152], cart: [0, 1055, 271, 146],
  crate: [273, 1055, 133, 138], stone_base: [408, 1055, 245, 130], vent: [655, 1055, 103, 127], valve: [760, 1055, 77, 123],
  barrel: [839, 1055, 73, 118], crate_half: [914, 1055, 68, 70], lantern: [984, 1055, 22, 50], pipe: [0, 1203, 242, 28],
  grate: [244, 1203, 128, 19]
};
