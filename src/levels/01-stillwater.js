export default {
  id: 'stillwater',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'sketchBridge', background: 'chamber1', music: 'whatSheHasntSeen' },
  // Wider than the other courtyards (1920 instead of 1280): the camera scrolls right along the middle ledge.
  width: 1920,
  // Three ledges: the start (left) and a long middle ledge at the same height, and the highest ledge with the moon
  // gate (right). The gate's ledge stays platform-1, as in every courtyard (the first-shore celebration looks for
  // the first ledge right of centre). The gap is too wide to jump, even from crates stacked at its edge. The gate's
  // ledge is 275 above the middle, out of reach even from two stacked crates (they reach 268): only a mushroom
  // gets you up there.
  platforms: [{ x: 0, y: 470, w: 390, h: 190 }, { x: 1660, y: 195, w: 260, h: 465 }, { x: 830, y: 470, w: 830, h: 190 }],
  spawn: [{ x: 180, y: 470 }, { x: 250, y: 470 }],
  // One crate per traveller. A crate that falls out of the courtyard is gone for good.
  crates: [{ x: 350, y: 443 }, { x: 90, y: 443 }], crateRespawn: false,
  // Freeze: crossing the gap takes one Freeze Area per traveller. Only travellers still on the start ledge
  // (platform 0) need the crossing.
  freezeCharges: 3, crossingNeedsFreeze: true, crossingFrom: 0,
  // The middle ledge, left to right: the hourglass (Freeze +1), the seed, an ancient mushroom blocking the way
  // (Bloom hastens it until it wilts and lets travellers pass) and the pit for a new mushroom beside the gate's
  // ledge. Bloom starts empty-handed, so this seed is the only one. The ancient mushroom's pit cannot be planted
  // once it is gone (the seed cannot be wasted there), and its cap is too far from the gate's ledge to jump from.
  freezePickups: [{ x: 900, y: 382 }],
  seeds: [{ x: 1000, y: 460 }], startSeeds: 0,
  pits: [{ x: 1200, y: 470, plantable: false }, { x: 1530, y: 470 }],
  plants: [{ pit: 0, grown: 1, barrier: true }], movers: [],
  bloomPickups: [{ x: 300, y: 382 }],
  // The gate's ledge is out of jumping reach without a mushroom (used by fail detection).
  exitNeedsPlant: true,
  exit: { x: 1790, y: 195 }, shards: [{ x: 600, y: 340 }], need: ['frozenTouched', 'withered', 'treeLifted'],
};
