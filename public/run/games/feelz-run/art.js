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
  back: { koda: loadImage(SPRITES.back.koda), koda_mask: loadImage(SPRITES.back.koda_mask), zora: loadImage(SPRITES.back.zora) },
  enemies: {},
  npcs: loadImage(SPRITES.npcs.src),
  loc: {},
  worlds: {}
};

for (const [k, d] of Object.entries(SPRITES.enemies)) art.enemies[k] = loadImage(d.src);

// Location paintings: loaded when a mission that uses them is chosen.
function locImage(name) {
  if (!art.loc[name]) art.loc[name] = loadImage("assets/worlds/loc/" + name + ".webp");
  return art.loc[name];
}

for (const [id, wd] of Object.entries(WORLDS)) {
  art.worlds[id] = { far: loadImage(wd.far), near: loadImage(wd.near), clouds: loadImage(wd.clouds) };
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
