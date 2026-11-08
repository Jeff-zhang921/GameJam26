export default {
  id: 'rootrise',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber2', music: 'doubledPawns' },
  // Wider still (2560): the camera scrolls right through four ledges.
  width: 2560,
  // The start ledge (left), the gate's ledge (platform-1, far right and highest), the middle ledge and, between the
  // start and the middle, a low trench. The trench is 80 below the start (you can jump back out) and 190 below the
  // middle ledge: out of jumping reach unless you stand on the guard. The gate is 190 above the middle,
  // or 136 above the dropped crate. A high stone beam anchors its rope.
  platforms: [
    { x: 0, y: 500, w: 700, h: 140 },
    { x: 1980, y: 200, w: 580, h: 440 },
    { x: 1500, y: 390, w: 440, h: 250 },
    { x: 700, y: 580, w: 800, h: 60 },
    { x: 1833, y: 88, w: 104, h: 24, ceiling: true },
  ],
  spawn: [{ x: 180, y: 500 }, { x: 250, y: 500 }],
  // A crate thrown off the middle ledge returns beneath its rope.
  crates: [{ x: 1885, y: 220, ropeTop: 112, respawnY: 363, respawnBelow: 465 }],
  seeds: [], startSeeds: 0, pits: [], plants: [], movers: [],
  // The guard patrols the trench and cannot leave it. Lured to the right wall and slowed in a Freeze Area, it is the
  // step up to the middle ledge.
  enemies: [{ kind: 'guard', x: 1100, y: 580, minX: 740, maxX: 1460 }],
  checkpoints: [{ x: 640, y: 500 }, { x: 1560, y: 390 }],
  // Freeze: one to start, plus an hourglass on the start ledge and one on the middle ledge.
  freezeCharges: 1, freezePickups: [{ x: 450, y: 412 }, { x: 1700, y: 302 }],
  bloomPickups: [{ x: 320, y: 412 }],
  exitRope: 'rope-0',
  exit: { x: 2300, y: 200 }, shards: [{ x: 1100, y: 340 }], need: ['guardRide', 'ropeReleased'],
};
