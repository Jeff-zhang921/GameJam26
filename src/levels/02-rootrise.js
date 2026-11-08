export default {
  id: 'rootrise',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber2', music: 'doubledPawns' },
  // Wider still (3200): the camera scrolls right through the ledges and on over the cloud basin.
  width: 3200,
  // 0 the start ledge; 1 the high ledge (the top of the climb); 2 the middle ledge; 3 between the start and the middle,
  // a low trench; 4 a high stone beam that anchors the crate's rope. The trench is 80 below the start (you can jump
  // back out) and 190 below the middle ledge: out of jumping reach unless you stand on the guard. The high ledge is
  // 190 above the middle, or 136 above the dropped crate.
  // Past the high ledge, a basin 440 wide: 5 its floor left of the groove, 6 the groove's floor (34 below the basin,
  // the water's depth), 7 its floor right of the groove, and 8 the gate's ledge. The gate's ledge is too far to jump
  // to from the high ledge and too high to jump to from the basin: the only way is the cloud above the groove.
  platforms: [
    { x: 0, y: 500, w: 700, h: 140 },
    { x: 1980, y: 200, w: 420, h: 440 },
    { x: 1500, y: 390, w: 440, h: 250 },
    { x: 700, y: 580, w: 800, h: 60 },
    { x: 1833, y: 88, w: 104, h: 24, ceiling: true },
    { x: 2400, y: 440, w: 150, h: 200 },
    { x: 2550, y: 474, w: 200, h: 166 },
    { x: 2750, y: 440, w: 90, h: 200 },
    { x: 2840, y: 220, w: 360, h: 420 },
  ],
  spawn: [{ x: 180, y: 500 }, { x: 250, y: 500 }],
  // A crate thrown off the middle ledge returns beneath its rope, and so does one taken past the high ledge (it would
  // be a step out of the basin, or a slowed stepping stone over it, instead of the cloud).
  crates: [{ x: 1885, y: 220, ropeTop: 112, respawnY: 363, respawnBelow: 465, respawnRight: 2400 }],
  seeds: [], startSeeds: 0, pits: [], plants: [], movers: [],
  // The water fills the groove up to the basin floor (half a traveller's height). Now and then it rises as a small
  // cloud (x: its middle, y: its top), 100 below the high ledge and 80 below the gate's ledge, and rains back.
  clouds: [{ x: 2650, y: 300, w: 100, pool: { x: 2550, y: 440, w: 200, h: 34 } }],
  // The guard patrols the trench and cannot leave it. Lured to the right wall and slowed in a Freeze Area, it is the
  // step up to the middle ledge.
  enemies: [{ kind: 'guard', x: 1100, y: 580, minX: 740, maxX: 1460 }],
  checkpoints: [{ x: 640, y: 500 }, { x: 1560, y: 390 }],
  // Freeze: one to start, plus an hourglass on the start ledge and one on the middle ledge.
  freezeCharges: 1, freezePickups: [{ x: 450, y: 412 }, { x: 1700, y: 302 }],
  bloomPickups: [{ x: 320, y: 412 }],
  exitRope: 'rope-0',
  exit: { x: 3040, y: 220 }, shards: [{ x: 1100, y: 340 }], need: ['guardRide', 'ropeReleased', 'cloudRide'],
};
