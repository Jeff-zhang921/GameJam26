export default {
  id: 'instep',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'moonlitStone', background: 'chamber5', music: 'behemoth' },
  // The hidden courtyard: here time keeps the travellers' pace. Teal things (`walker: 0`) follow Still's steps and gold
  // things (`walker: 1`) Bloom's: walking right runs their time on, walking left runs it back, standing still stops it.
  // Being carried is not walking, so nobody can drive what they ride: each traveller crosses on the other's colour.
  walkingTime: true,
  width: 2560,
  // 0 start ground; 1 the floating plateau with the moon gate (420 above the floor below it, its underside solid);
  // 2 the far ground, past a 520-wide rift; 3 a safe checkpoint ledge over the far bank.
  platforms: [
    { x: 0, y: 520, w: 760, h: 140 },
    { x: 1740, y: 100, w: 520, h: 60, ceiling: true },
    { x: 1280, y: 520, w: 1280, h: 140 },
    { x: 1280, y: 400, w: 88, h: 14, ceiling: true },
  ],
  spawn: [{ x: 230, y: 520 }, { x: 300, y: 520 }],
  // Bloom ages the rope to drop a step for both lifts. A lost crate returns to the ground below the rope.
  crates: [{ x: 1778, y: 320, ropeTop: 160, respawnY: 493 }], seeds: [], startSeeds: 0,
  // A gold sprout by the start: Bloom walking right grows it, so Still can ride it to the shard and hourglass. It
  // never vanishes: walked far enough it wilts to a husk, and walking back brings it to life again.
  pits: [{ x: 110, y: 520, plantable: false }],
  plants: [{ pit: 0, age: 40, walker: 1, pace: 2.2 }],
  // Over the rift: a teal ferry (Still's) a step above the ground and a gold ferry (Bloom's) a step below it, both
  // starting by the start ground. At the plateau: a gold lift on its left (Still rides it while Bloom walks) and a teal
  // lift on its right (Bloom rides it while Still walks). Both lifts wait for the hanging crate to be released.
  // Their lower stops are 190 above the floor, or 136 above the dropped crate.
  // Pace 1: a ferry or lift moves exactly as far as its walker walks.
  movers: [
    { x1: 760, x2: 1140, y: 470, w: 140, walker: 0, pace: 1 },
    { x1: 760, x2: 1140, y: 570, w: 140, walker: 1, pace: 1 },
    { axis: 'y', x: 1650, w: 80, y1: 100, y2: 330, dir: -1, walker: 1, pace: 1, waitsFor: 'rope-0' },
    { axis: 'y', x: 2270, w: 80, y1: 100, y2: 330, dir: -1, walker: 0, pace: 1, waitsFor: 'rope-0' },
  ],
  enemies: [{ kind: 'guard', x: 2000, y: 520 }],
  checkpoints: [{ x: 1324, y: 400 }],
  // One cast for the rope. The ferries, lifts and sprout still follow footsteps.
  freezeCharges: 1, bloomCharges: 1,
  freezePickups: [{ x: 110, y: 218, touchRadius: 18 }, { x: 2520, y: 432 }], bloomPickups: [],
  exit: { x: 2000, y: 100 }, shards: [{ x: 110, y: 250 }], need: ['moverRide', 'treeLifted'],
};
