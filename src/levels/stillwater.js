export default {
  id: 'stillwater',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'mossy', background: 'greenhouse', music: 'gymnopedie' },
  platforms: [{ x: 0, y: 520, w: 435, h: 160 }, { x: 795, y: 430, w: 485, h: 220 }],
  spawn: [{ x: 180, y: 520 }, { x: 250, y: 520 }],
  crates: [{ x: 350, y: 493 }], seeds: [], pits: [], plants: [], movers: [],
  // Freeze: crossing needs one Freeze Area per traveller; a crystal above the start ledge adds a spare.
  freezeCharges: 2, freezePickups: [{ x: 230, y: 430 }], crossingNeedsFreeze: true,
  exit: { x: 1160, y: 430 }, shards: [{ x: 620, y: 300 }], need: ['frozenTouched'],
};
