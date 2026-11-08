export default {
  id: 'withtime',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'watercolorStone', background: 'chamber4', music: 'lordOfDream' },
  width: 2800,
  // 0 start ground; 1 tunnel floor, 200 above it (out of jumping reach); 2 the tunnel roof, 69 above the floor, so a
  // full-grown cap leaves you facing rock; 3 the lower ground past the tunnel; 4 a hanging block, its top out of
  // reach, walked under; 5 the exit cliff, 140 above the lower ground, closed off by the thorny vine.
  platforms: [
    { x: 0, y: 520, w: 760, h: 120 },
    { x: 760, y: 320, w: 640, h: 320 },
    { x: 760, y: 0, w: 640, h: 251, ceiling: true },
    { x: 1400, y: 520, w: 760, h: 120 },
    { x: 1700, y: 200, w: 220, h: 180, ceiling: true },
    { x: 2160, y: 380, w: 640, h: 260 },
  ],
  spawn: [{ x: 200, y: 520 }, { x: 270, y: 520 }],
  crates: [], seeds: [], startSeeds: 0, movers: [],
  // A sleeping flower seed and a mature thorny vine across the shaft. Bloom starts their clocks: the flower
  // grows, holds, wilts and disappears; the vine ages until it withers and opens the way. These pits cannot be replanted.
  pits: [{ x: 640, y: 520, plantable: false }, { x: 1920, y: 370, wall: 1, plantable: false }],
  plants: [{ pit: 0, age: 0 }, { pit: 1, age: 960, barrier: true }],
  checkpoints: [{ x: 820, y: 320 }, { x: 1460, y: 520 }],
  // Freeze is optional: it holds the growing flower near half height for longer.
  freezeCharges: 1, freezePickups: [{ x: 420, y: 432 }], bloomPickups: [],
  // Travellers left on the start ground need the flower; those in the shaft need the vine's clock to run.
  plantNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }],
  // The shard sits above the vine's root: walk back onto the vine from the cliff before it withers away.
  exit: { x: 2600, y: 380 }, shards: [{ x: 1980, y: 340 }], need: ['treeLifted', 'withered'],
};
