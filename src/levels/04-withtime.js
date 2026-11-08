export default {
  id: 'withtime',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber4', music: 'lordOfDream' },
  // In this courtyard Bloom runs plant time backwards (Still is unchanged).
  bloomReverses: true,
  width: 3360,
  // 0 start ground; 1 tunnel floor, 200 above it (out of jumping reach); 2 the tunnel roof, 69 above the floor, so a
  // full-grown cap leaves you facing rock; 3 the lower ground past the tunnel; 4 a hanging block, its top out of
  // reach, walked under; 5 the cliff, 140 above the lower ground, closed off by the thorny vine.
  // Past the cliff, a basin 70 below it (you can jump back up): 6 its floor left of the groove, 7 the groove's floor
  // (34 below the basin, the water's depth), 8 its floor right of the groove, and 9 the gate's ledge, too far to jump
  // to from the cliff and too high from the basin. The cloud above the groove is the only way there.
  platforms: [
    { x: 0, y: 520, w: 760, h: 120 },
    { x: 760, y: 320, w: 640, h: 320 },
    { x: 760, y: 0, w: 640, h: 251, ceiling: true },
    { x: 1400, y: 520, w: 760, h: 120 },
    { x: 1700, y: 200, w: 220, h: 180, ceiling: true },
    { x: 2160, y: 380, w: 400, h: 260 },
    { x: 2560, y: 450, w: 120, h: 190 },
    { x: 2680, y: 484, w: 160, h: 156 },
    { x: 2840, y: 450, w: 120, h: 190 },
    { x: 2960, y: 240, w: 400, h: 400 },
  ],
  spawn: [{ x: 200, y: 520 }, { x: 270, y: 520 }],
  // A crate on the cliff: the step from its edge up onto the cloud. It never leaves the cliff (carried or thrown past
  // the edge, or dropped off it, it returns), so a crate slowed in mid-air can never stand in for the cloud.
  crates: [{ x: 2350, y: 353, respawnRight: 2560, respawnBelow: 400 }], seeds: [], startSeeds: 0, movers: [],
  // The water fills the groove up to the basin floor. Now and then it rises as a small cloud (x: its middle, y: its
  // top), 180 above the cliff (out of jumping reach without the crate) and 40 above the gate's ledge. Here Bloom's
  // rewind runs it backwards: water rises back into a fresh cloud, a cloud sinks back into water.
  clouds: [{ x: 2760, y: 200, w: 100, pool: { x: 2680, y: 450, w: 160, h: 34 } }],
  // The dead tree (a wilted mushroom about to vanish) and the thorny vine on the hanging block's right face, fully
  // grown across the shaft to the cliff. Both pits only hold these plants.
  pits: [{ x: 640, y: 520, plantable: false }, { x: 1920, y: 370, wall: 1, plantable: false }],
  plants: [{ pit: 0, age: 1915 }, { pit: 1, age: 960 }],
  checkpoints: [{ x: 820, y: 320 }, { x: 1460, y: 520 }],
  // Freeze is optional: it holds the tree near half height for longer.
  freezeCharges: 1, freezePickups: [{ x: 420, y: 432 }], bloomPickups: [],
  // The tree must be rewound by anyone still on the start ground; the vine by anyone on the lower ground (once it
  // has rewound away the way is open).
  rewindNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }],
  // The shard sits above the vine's root: walk back onto the vine from the cliff before it rewinds away.
  exit: { x: 3160, y: 240 }, shards: [{ x: 1980, y: 340 }], need: ['treeRewound', 'vineRewound', 'cloudRide'],
};
