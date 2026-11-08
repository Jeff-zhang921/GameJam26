export default {
  id: 'withtime',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber4', music: 'lordOfDream' },
  // In this courtyard Bloom runs plant time backwards (Still is unchanged).
  bloomReverses: true,
  width: 2800,
  // 0 start ground; 1 tunnel floor, 200 above it (out of jumping reach); 2 the tunnel roof, 59 above the floor, so a
  // full-grown cap leaves you facing rock; 3 the lower ground past the tunnel; 4 a hanging block, its top out of
  // reach, walked under; 5 the exit cliff, 140 above the lower ground, closed off by the thorny vine.
  platforms: [
    { x: 0, y: 520, w: 760, h: 120 },
    { x: 760, y: 320, w: 640, h: 320 },
    { x: 760, y: 0, w: 640, h: 261, ceiling: true },
    { x: 1400, y: 520, w: 760, h: 120 },
    { x: 1700, y: 200, w: 220, h: 180, ceiling: true },
    { x: 2160, y: 380, w: 640, h: 260 },
  ],
  spawn: [{ x: 200, y: 520 }, { x: 270, y: 520 }],
  crates: [], seeds: [], startSeeds: 0, movers: [],
  // The dead tree (a wilted mushroom about to vanish) and the thorny vine on the hanging block's right face, fully
  // grown across the shaft to the cliff. Both pits only hold these plants.
  pits: [{ x: 640, y: 520, plantable: false }, { x: 1920, y: 370, wall: 1, plantable: false }],
  plants: [{ pit: 0, age: 1915 }, { pit: 1, age: 960, ceiling: true }],
  checkpoints: [{ x: 820, y: 320 }, { x: 1460, y: 520 }],
  // Freeze is optional: it holds the tree near half height for longer.
  freezeCharges: 1, freezePickups: [{ x: 420, y: 494 }], bloomPickups: [],
  // The tree must be rewound by anyone still on the start ground; the vine by anyone on the lower ground (once it
  // has rewound away the way is open).
  rewindNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }],
  // The shard sits above the vine's root: walk back onto the vine from the cliff before it rewinds away.
  exit: { x: 2600, y: 380 }, shards: [{ x: 1980, y: 340 }], need: ['treeRewound', 'vineRewound'],
};
