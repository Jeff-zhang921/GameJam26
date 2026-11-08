export default {
  id: 'withtime',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'watercolorStone', background: 'chamber4', music: 'lordOfDream' },
  // In this courtyard Bloom runs plant time backwards (Still is unchanged).
  bloomReverses: true,
  width: 3460,
  // 0 start ground; 1 tunnel floor, 200 above it (out of jumping reach); 2 the tunnel roof, 69 above the floor, so a
  // full-grown cap leaves you facing rock; 3 the lower ground past the tunnel; 4 a hanging block, its top out of
  // reach, walked under; 5 the cliff, 140 above the lower ground, closed off by the thorny vine.
  // Past the cliff, a basin 70 below it (you can jump back up): 6 its floor left of the groove, 7 the groove's floor
  // (34 below the basin, the water's depth), 8 its floor right of the groove, and 9 the gate's ledge, too high to
  // jump to from the basin and 540 from the cliff's edge: farther than any jump from the crate, even caught in the
  // air while it is still rising from a throw. The cloud above the groove is the only way there.
  platforms: [
    { x: 0, y: 520, w: 760, h: 120 },
    { x: 760, y: 320, w: 640, h: 320 },
    { x: 760, y: 0, w: 640, h: 251, ceiling: true },
    { x: 1400, y: 520, w: 760, h: 120 },
    { x: 1700, y: 200, w: 220, h: 180, ceiling: true },
    { x: 2160, y: 380, w: 400, h: 260 },
    { x: 2560, y: 450, w: 135, h: 190 },
    { x: 2695, y: 484, w: 210, h: 156 },
    { x: 2905, y: 450, w: 195, h: 190 },
    { x: 3100, y: 260, w: 360, h: 380 },
  ],
  spawn: [{ x: 200, y: 520 }, { x: 270, y: 520 }],
  // A crate on the cliff: the step from its edge up onto the cloud. It may rest on its `homes` (the shaft floor and the
  // cliff; also on the vine, the cloud or a traveller's head). Landing anywhere else (in the basin, where a throw from
  // its floor would reach the gate, or somewhere out of reach), or carried down into the basin, it returns.
  crates: [{ x: 2350, y: 353, homes: [3, 5] }], seeds: [], startSeeds: 0, movers: [],
  // The water fills the groove up to the basin floor. Now and then it rises as a small cloud (x: its middle, y: its
  // top), 175 above the cliff (out of jumping reach without the crate) and 55 above the gate's ledge. Here Bloom's
  // rewind runs it backwards: water rises back into a fresh cloud, a cloud sinks back into water.
  clouds: [{ x: 2800, y: 205, w: 160, pool: { x: 2695, y: 450, w: 210, h: 34 } }],
  // The dead tree (a wilted mushroom about to vanish) and the thorny vine on the hanging block's right face, fully
  // grown across the shaft to the cliff. Both pits only hold these plants.
  pits: [{ x: 640, y: 520, plantable: false }, { x: 1920, y: 370, wall: 1, plantable: false }],
  plants: [{ pit: 0, age: 1915 }, { pit: 1, age: 960 }],
  checkpoints: [{ x: 820, y: 320 }, { x: 1460, y: 520 }],
  // Freeze can slow the tree at a useful height or hold the cloud while both travellers cross.
  freezeCharges: 2, freezePickups: [{ x: 420, y: 432 }], bloomPickups: [],
  // The tree must be rewound by anyone still on the start ground; the vine by anyone on the lower ground (once it
  // has rewound away the way is open).
  rewindNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }],
  // The shard sits above the vine's root: walk back onto the vine from the cliff before it rewinds away.
  exit: { x: 3280, y: 260 }, shards: [{ x: 1980, y: 340 }], need: ['treeRewound', 'vineRewound', 'cloudRide'],
};
