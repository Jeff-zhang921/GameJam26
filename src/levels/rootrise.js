export default {
  id: 'rootrise',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'skyCastles', music: 'doubledPawns' },
  platforms: [{ x: 0, y: 540, w: 1280, h: 120 }, { x: 760, y: 290, w: 520, h: 360 }],
  spawn: [{ x: 195, y: 540 }, { x: 270, y: 540 }],
  crates: [], seeds: [{ x: 90, y: 530 }, { x: 380, y: 530 }], pits: [{ x: 600, y: 540 }], plants: [], movers: [],
  // Freeze is optional here (it lengthens the mushroom's tall moment).
  freezeCharges: 1,
  bloomPickups: [{ x: 470, y: 514 }],
  // The exit ledge is out of jumping reach without a flower (used by fail detection).
  exitNeedsPlant: true,
  exit: { x: 1160, y: 290 }, shards: [{ x: 600, y: 250 }], need: ['treeLifted'],
};
