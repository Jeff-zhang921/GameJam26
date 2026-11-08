import { setup } from '../src/logic.js';

// The original first courtyard, kept as a fixed test arena so mechanics tests do not depend on how level 1 is
// laid out: a start ledge (x 0-435, y 520) with one crate at (350, 493), a broken bridge, and the far ledge
// (platform-1, y 430) with the moon gate at (1160, 430). Lost crates return here, and Bloom holds one seed.
export function classicCourtyard(options = {}) {
  const s = setup({ ...options, level: 0 });
  s.width = 1280;
  s.platforms =[{ x: 0, y: 520, w: 435, h: 160 }, { x: 795, y: 430, w: 485, h: 220 }];
  s.objects = [{ kind: 'crate', id: 'crate-0', x: 350, y: 493, vx: 0, vy: 0, frozen: false, held: null, spawnX: 350, spawnY: 493 }];
  s.pits = []; s.nextPlant = 0; s.nextEnemy = s.objects.length;
  s.actors.forEach((p, i) => Object.assign(p, { x: [180, 250][i], y: 520, spawnX: [180, 250][i], spawnY: 520 }));
  s.pickups = [{ x: 230, y: 430, id: 'frost-0', kind: 'frost', taken: false }, { x: 310, y: 494, id: 'bolt-0', kind: 'bolt', taken: false }];
  s.exit = { x: 1160, y: 430 }; s.shards = [{ x: 620, y: 300, id: 0, taken: false }];
  s.freezeCharges = 2; s.seeds = 1; s.crateRespawn = true;
  return s;
}

// The original second courtyard, kept as a fixed test arena for the same reason: one flat ground (y 540) with
// seeds at x=90 / x=380 (Bloom holds one more), one empty pit at x=600, and the exit ledge (platform-1, y 290)
// with the moon gate at (1160, 290). One Freeze charge, no creatures.
export function rootriseArena(options = {}) {
  const s = setup({ ...options, level: 1 });
  s.width = 1280;
  s.platforms = [{ x: 0, y: 540, w: 1280, h: 120 }, { x: 760, y: 290, w: 520, h: 360 }];
  s.objects = [90, 380].map((x, i) => ({ kind: 'seed', id: `seed-${i}`, x, y: 530, vx: 0, vy: 0, frozen: false, held: null, spawnX: x, spawnY: 530 }));
  s.pits = [{ id: 'pit-0', x: 600, y: 540, plant: null }]; s.nextPlant = 0; s.nextEnemy = s.objects.length;
  s.actors.forEach((p, i) => Object.assign(p, { x: [195, 270][i], y: 540, spawnX: [195, 270][i], spawnY: 540 }));
  s.checkpoints = []; s.pickups = [{ x: 470, y: 514, id: 'bolt-0', kind: 'bolt', taken: false }];
  s.exit = { x: 1160, y: 290 }; s.shards = [{ x: 600, y: 250, id: 0, taken: false }];
  s.needs = ['treeLifted']; s.freezeCharges = 1; s.seeds = 1;
  return s;
}

// rootriseArena with a wall pit on the exit ledge's left face (x 760): its vine grows left (toward −x) at y 420,
// 120 above the ground and 130 below the exit ledge, so a full vine is a step up to the gate.
export function vineArena(options = {}) {
  const s = rootriseArena(options);
  s.pits.push({ id: 'pit-1', x: 760, y: 420, wall: -1, plant: null });
  return s;
}

// The original fourth courtyard, kept as a fixed test arena: a start ledge (x 0-520, y 520) with a crate at
// (300, 493), seeds at x 110 / 150 / 480 (Bloom holds one more), pits at x 400 and x 60, a sleeping mover
// (x 540-640, y 290, 120 wide) and the exit ledge (platform-1, y 300) with the moon gate at (1160, 300).
// Two Freeze charges plus an hourglass. Built on level index 0, whose `crossingNeedsFreeze` rule (from platform 0)
// drives fail checks.
export function withtimeArena(options = {}) {
  const s = setup({ ...options, level: 0 });
  const seed = (x, i) => ({ kind: 'seed', id: `seed-${i}`, x, y: 510, vx: 0, vy: 0, frozen: false, held: null, spawnX: x, spawnY: 510 });
  s.width = 1280;
  s.platforms = [{ x: 0, y: 520, w: 520, h: 160 }, { x: 1040, y: 300, w: 240, h: 400 }];
  s.objects = [
    { kind: 'crate', id: 'crate-0', x: 300, y: 493, vx: 0, vy: 0, frozen: false, held: null, spawnX: 300, spawnY: 493 },
    ...[110, 150, 480].map(seed),
    { kind: 'mover', id: 'mover-0', x: 540, y: 290, w: 120, x1: 540, x2: 640, dir: 1, speed: 0, frozen: false },
  ];
  s.pits = [{ id: 'pit-0', x: 400, y: 520, plant: null }, { id: 'pit-1', x: 60, y: 520, plant: null }];
  s.nextPlant = 0; s.nextEnemy = s.objects.length;
  s.actors.forEach((p, i) => Object.assign(p, { x: [250, 170][i], y: 520, spawnX: [250, 170][i], spawnY: 520 }));
  s.checkpoints = [];
  s.pickups = [{ x: 470, y: 430, id: 'frost-0', kind: 'frost', taken: false }, { x: 345, y: 494, id: 'bolt-0', kind: 'bolt', taken: false }];
  s.exit = { x: 1160, y: 300 }; s.shards = [{ x: 400, y: 240, id: 0, taken: false }];
  s.needs = ['treeLifted', 'moverRide', 'frozenTouched']; s.freezeCharges = 2; s.seeds = 1; s.crateRespawn = true;
  return s;
}
