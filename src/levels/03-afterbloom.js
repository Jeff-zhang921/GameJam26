export default {
  id: 'afterbloom',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'sketchBridge', background: 'chamber3', music: 'deathKnell' },
  // Wide (3920): the wider throwing step keeps its original gap to the lift.
  width: 3920,
  // Start ground; the high ledge (220 up: only a mushroom gets you there) with a capped pillar that stops the upper
  // arrow lane before the canyon (travellers jump up onto its cap and drop off the far side); the far cliff across the canyon; the exit ledge across the chasm; and a small step jutting
  // out of the near cliff below its wall pit (platform-5), from which Bloom throws a seed up-left into the pit (then
  // climbs back up before waking it: a grown vine overhead stops a rising head). No floors in between.
  platforms: [
    { x: 0, y: 520, w: 760, h: 140 },
    { x: 760, y: 300, w: 640, h: 340 },
    { x: 1180, y: 160, w: 40, h: 140 },
    { x: 2190, y: 200, w: 400, h: 440 },
    { x: 3490, y: 200, w: 430, h: 440 },
    { x: 1400, y: 440, w: 140, h: 30 },
    // The pillar is drawn with a mossy cap much wider than the pillar (x 1144-1252, down to y 180) and stones under
    // it (x 1168-1231, down to y 212). These two blocks are not drawn (`hidden`); they make that cap solid, so a
    // head under its overhang stops there and the way over is up onto the cap.
    { x: 1144, y: 160, w: 108, h: 20, hidden: true },
    { x: 1168, y: 180, w: 63, h: 32, hidden: true },
  ],
  spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
  crates: [],
  // Three starting seeds, one in hand (the mushroom and two vines); spares on the start ground, high ledge and far cliff,
  // so a failed canyon crossing can be redone (or Bloom, across, can plant the far vine and then the near one for Still).
  seeds: [{ x: 350, y: 510 }, { x: 1300, y: 290 }, { x: 2470, y: 190 }], startSeeds: 3, startSeedInHand: true,
  // The mushroom's pit on the start ground; wall pits on the near cliff (vine grows right, 30 below the ledge top)
  // and the far cliff (vine grows left, 50 below its top).
  pits: [{ x: 600, y: 520 }, { x: 1400, y: 330, wall: 1 }, { x: 2190, y: 250, wall: -1 }],
  plants: [],
  // The canyon (x 1400-2190) has a lift 230 from the step and 280 from the far cliff, out of jumping reach.
  // The near vine at full length 240 leaves a 130 jump to the lift; the far vine at length 160 leaves 120.
  // Bloom plants and wakes the near vine from the step / high ledge. For a rescue, jump back from the lift to the step.
  // Two movers in opposite phase cross the chasm and meet in the middle (a 30 gap). All three start running.
  movers: [
    { axis: 'y', x: 1770, w: 140, y1: 250, y2: 330, speed: 1, dir: -1 },
    { x1: 2610, x2: 2910, y: 200, w: 120, speed: 1 },
    { x1: 3060, x2: 3360, y: 200, w: 120, speed: 1, dir: -1 },
  ],
  // Two launchers on the left wall fire right across the start: darts at y 350 (pop on the high ledge's face) and
  // y 225 (pop on the pillar). A traveller can be hurt up to the top of the hat (66 above the feet), so a rider on the
  // mushroom is clear of both lanes with its cap about 174-224 high, and one standing on the high ledge is just under
  // the upper lane. The cap reaches the lower lane about 400 ticks after waking and takes about 300 more to rise
  // through it, so that lane fires only every 420: wake the mushroom some 20-130 ticks after a lower dart flies past
  // the riders and the next one comes after they have cleared the lane.
  enemies: [
    { kind: 'launcher', x: 40, y: 370, dir: [1, 0], every: 420 },
    { kind: 'launcher', x: 40, y: 245, dir: [1, 0], every: 180 },
  ],
  checkpoints: [{ x: 820, y: 300 }, { x: 2250, y: 200 }],
  // Freeze stretches the safe band, the vines' window and the movers' meeting; hourglasses on the high ledge and the
  // far cliff. Spare bolts on the high ledge and the far cliff.
  freezeCharges: 2, freezePickups: [{ x: 900, y: 212 }, { x: 2370, y: 112 }],
  bloomPickups: [{ x: 1100, y: 212 }, { x: 2520, y: 112 }],
  // The high ledge is out of jumping reach without a mushroom (used by fail detection). Only travellers still on the
  // start ground (platform 0) need one: past the high ledge the vines and movers carry them, so a traveller on the
  // far cliff with no seeds left is not stranded.
  exitNeedsPlant: true, plantFrom: 0,
  exit: { x: 3780, y: 200 }, shards: [{ x: 1850, y: 200 }], need: ['treeLifted', 'moverRide'],
};
