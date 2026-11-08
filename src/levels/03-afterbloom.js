export default {
  id: 'afterbloom',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber3', music: 'deathKnell' },
  // Wide (3840): three sections left to right.
  width: 3840,
  // Start ground; the high ledge (220 up: only a mushroom gets you there) with a pillar that stops the upper arrow
  // lane before the canyon; the far cliff across the canyon; the exit ledge across the chasm. No floors in between.
  platforms: [
    { x: 0, y: 520, w: 760, h: 140 },
    { x: 760, y: 300, w: 640, h: 340 },
    { x: 1180, y: 160, w: 40, h: 140 },
    { x: 1920, y: 200, w: 480, h: 440 },
    { x: 3300, y: 200, w: 540, h: 440 },
  ],
  spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
  crates: [],
  // Three seeds in hand (the mushroom and two vines); spares on the start ground, the high ledge and the far cliff,
  // so a failed canyon crossing can be redone (or Bloom, across, can plant the far vine and then the near one for Still).
  seeds: [{ x: 350, y: 510 }, { x: 1300, y: 290 }, { x: 2250, y: 190 }], startSeeds: 3,
  // The mushroom's pit on the start ground; wall pits on the near cliff (vine grows right, 30 below the ledge top)
  // and the far cliff (vine grows left, 50 below its top).
  pits: [{ x: 600, y: 520 }, { x: 1400, y: 330, wall: 1 }, { x: 1920, y: 250, wall: -1 }],
  plants: [],
  // The canyon (x 1400-1920, 520 wide) has a lift in the middle running between the two vine heights: 40 from each
  // vine's tip at vine length 160, touching at 200. Two movers in opposite phase cross the chasm and meet in the
  // middle (a 30 gap). All three start running.
  movers: [
    { axis: 'y', x: 1600, w: 120, y1: 250, y2: 330, speed: 1, dir: -1 },
    { x1: 2420, x2: 2720, y: 200, w: 120, speed: 1 },
    { x1: 2870, x2: 3170, y: 200, w: 120, speed: 1, dir: -1 },
  ],
  // Two launchers on the left wall fire right across the start: darts at y 350 (pop on the high ledge's face) and
  // y 238 (pop on the pillar). A rider on the mushroom is clear of both with its cap about 175-225 high. The cap reaches
  // the lower lane about 460 ticks after waking and takes about 250 more to rise through it, so that lane fires only
  // every 420: wake the mushroom as a lower dart flies past (a window of about 150 ticks around it) and the next dart
  // comes after the riders have cleared the lane.
  enemies: [
    { kind: 'launcher', x: 20, y: 370, dir: [1, 0], every: 420 },
    { kind: 'launcher', x: 20, y: 258, dir: [1, 0], every: 180 },
  ],
  checkpoints: [{ x: 820, y: 300 }, { x: 1980, y: 200 }],
  // Freeze stretches the safe band, the vines' window and the movers' meeting; hourglasses on the high ledge and the
  // far cliff. Spare bolts on the high ledge and the far cliff.
  freezeCharges: 1, freezePickups: [{ x: 900, y: 274 }, { x: 2100, y: 174 }],
  bloomPickups: [{ x: 1100, y: 274 }, { x: 2300, y: 174 }],
  // The high ledge is out of jumping reach without a mushroom (used by fail detection). Only travellers still on the
  // start ground (platform 0) need one: past the high ledge the vines and movers carry them, so a traveller on the
  // far cliff with no seeds left is not stranded.
  exitNeedsPlant: true, plantFrom: 0,
  exit: { x: 3600, y: 200 }, shards: [{ x: 1660, y: 200 }], need: ['treeLifted', 'moverRide'],
};
