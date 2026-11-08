export default {
  id: 'rootrise',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber2', music: 'doubledPawns' },
  // Wider still (2560): the camera scrolls right through four ledges.
  width: 2560,
  // The start ledge (left), the gate's ledge (platform-1, far right and highest), the middle ledge and, between the
  // start and the middle, a low trench. The trench is 80 below the start (you can jump back out) and 190 below the
  // middle ledge: out of jumping reach (about 160) unless you stand on the guard (50 tall). The gate's ledge is 210
  // above the middle, reached only on the mushroom grown in the middle ledge's pit.
  platforms: [{ x: 0, y: 500, w: 700, h: 140 }, { x: 1980, y: 180, w: 580, h: 460 }, { x: 1500, y: 390, w: 440, h: 250 }, { x: 700, y: 580, w: 800, h: 60 }],
  spawn: [{ x: 180, y: 500 }, { x: 250, y: 500 }],
  // No crates: nothing but the guard can serve as a step up out of the trench.
  crates: [],
  // The only seed lies on the trench floor, on the guard's beat; the only pit is at the right end of the middle ledge.
  seeds: [{ x: 1000, y: 570 }], startSeeds: 0,
  pits: [{ x: 1840, y: 390 }], plants: [], movers: [],
  // The guard patrols the trench and cannot leave it. Lured to the right wall and slowed in a Freeze Area, it is the
  // step up to the middle ledge.
  enemies: [{ kind: 'guard', x: 1100, y: 580, minX: 740, maxX: 1460 }],
  checkpoints: [{ x: 640, y: 500 }, { x: 1560, y: 390 }],
  // Freeze: one to start, plus an hourglass on the start ledge and one on the middle ledge.
  freezeCharges: 1, freezePickups: [{ x: 450, y: 474 }, { x: 1700, y: 364 }],
  bloomPickups: [{ x: 320, y: 474 }],
  // The gate's ledge is out of jumping reach without a mushroom (used by fail detection).
  exitNeedsPlant: true,
  exit: { x: 2300, y: 180 }, shards: [{ x: 1100, y: 340 }], need: ['guardRide', 'treeLifted'],
};
