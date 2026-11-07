export default {
  id: 'afterbloom',
  platforms: [{ x: 0, y: 520, w: 1280, h: 140 }, { x: 1000, y: 265, w: 280, h: 400 }],
  spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
  crates: [], seeds: [{ x: 330, y: 510 }], pits: [{ x: 600, y: 520 }, { x: 880, y: 520 }],
  plants: [{ pit: 0, grown: 1, barrier: true }], movers: [],
  exit: { x: 1160, y: 265 }, shards: [{ x: 880, y: 300 }], need: ['withered', 'sproutJump'],
};
