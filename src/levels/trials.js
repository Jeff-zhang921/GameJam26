export default {
  id: 'trials',
  platforms: [{ x: 0, y: 520, w: 560, h: 160 }, { x: 800, y: 520, w: 480, h: 160 }],
  spawn: [{ x: 60, y: 520 }, { x: 100, y: 520 }],
  crates: [], seeds: [], pits: [], plants: [], movers: [],
  checkpoints: [{ x: 520, y: 520 }, { x: 840, y: 520 }],
  enemies: [
    { kind: 'guard', x: 330, y: 520, minX: 200, maxX: 480 },
    { kind: 'lantern', x: 680, y: 330 },
    { kind: 'launcher', x: 1250, y: 520, dir: [-1, 0], every: 150, shot: 'dart' },
    { kind: 'launcher', x: 1000, y: 260, dir: [-1, 0], every: 240, shot: 'orb' },
    { kind: 'nest', x: 1040, y: 520 },
  ],
  exit: { x: 1170, y: 520 }, shards: [{ x: 680, y: 400 }], need: ['dartRide', 'miteGone'],
};
