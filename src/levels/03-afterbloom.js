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
    { x: 2020, y: 200, w: 480, h: 440 },
    { x: 3400, y: 200, w: 440, h: 440 },
  ],
  spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
  crates: [],
  // Three seeds in hand (the mushroom and two vines) and a spare on the start ground.
  seeds: [{ x: 350, y: 510 }], startSeeds: 3,
  // The mushroom's pit on the start ground; wall pits on the near cliff (vine grows right, 30 below the ledge top)
  // and the far cliff (vine grows left, 50 below its top).
  pits: [{ x: 600, y: 520 }, { x: 1400, y: 330, wall: 1 }, { x: 2020, y: 250, wall: -1 }],
  plants: [],
  // The canyon lift runs between the two vine heights; two movers in opposite phase cross the chasm and meet in the
  // middle (a 30 gap). All three start running.
  movers: [
    { axis: 'y', x: 1660, w: 120, y1: 250, y2: 330, speed: 1, dir: -1 },
    { x1: 2520, x2: 2820, y: 200, w: 120, speed: 1 },
    { x1: 2970, x2: 3270, y: 200, w: 120, speed: 1, dir: -1 },
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
  checkpoints: [{ x: 820, y: 300 }, { x: 2080, y: 200 }],
  // Freeze stretches the safe band, the vines' window and the movers' meeting; hourglasses on the high ledge and the
  // far cliff. A spare bolt on the high ledge.
  freezeCharges: 1, freezePickups: [{ x: 900, y: 274 }, { x: 2200, y: 174 }],
  bloomPickups: [{ x: 1100, y: 274 }],
  // The high ledge is out of jumping reach without a mushroom (used by fail detection).
  exitNeedsPlant: true,
  exit: { x: 3700, y: 200 }, shards: [{ x: 1720, y: 200 }], need: ['treeLifted', 'moverRide'],
};
