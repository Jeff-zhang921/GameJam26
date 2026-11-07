export default {
  id: 'withtime',
  platforms: [{ x: 0, y: 520, w: 520, h: 160 }, { x: 1040, y: 300, w: 240, h: 400 }],
  spawn: [{ x: 250, y: 520 }, { x: 170, y: 520 }],
  crates: [{ x: 300, y: 493 }], seeds: [{ x: 110, y: 510 }, { x: 150, y: 510 }, { x: 480, y: 510 }],
  pits: [{ x: 400, y: 520 }, { x: 60, y: 520 }], plants: [],
  movers: [{ x1: 540, x2: 640, y: 290, w: 120 }],
  // Freeze: each traveller needs a frozen crate to cross the last rift.
  freezeCharges: 2, freezePickups: [{ x: 470, y: 430 }], crossingNeedsFreeze: true,
  bloomPickups: [{ x: 345, y: 494 }],
  exit: { x: 1160, y: 300 }, shards: [{ x: 400, y: 240 }], need: ['treeLifted', 'moverRide', 'frozenTouched'],
};
