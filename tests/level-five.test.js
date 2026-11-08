import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityTargets, bloomTargetAt, canopyWidth, meta } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 5, the hidden one: teal things keep Still's pace and gold things Bloom's. Walking right runs their time
// on, walking left runs it back, standing still stops it. Each traveller crosses on the other's colour.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[4];
const get = (s, id) => s.objects.find(o => o.id === id);
const stand = (s, who, x, y, on) => Object.assign(s.actors[who], { x, y, vx: 0, vy: 0, grounded: true, on });
const move = (s, who, dir) => act(s, { type: 'move', actor: who, dir });
// Walk `who` toward `dir` until `done(s)` (or a tick limit), then stop and let a tick settle.
function walkUntil(s, who, dir, done, limit = 600) {
  s = move(s, who, dir);
  for (let i = 0; i < limit && !done(s); i++) s = tick(s);
  expect(done(s)).toBe(true);
  return tick(move(s, who, 0), 2);
}
// Walk the walker of a back-and-forth platform until it sits at `end` ('lo' or 'hi' of its run, within 3 px).
function drive(s, who, id, end) {
  const o = get(s, id), k = o.axis === 'y' ? 'y' : 'x', [lo, hi] = o.axis === 'y' ? [o.y1, o.y2] : [o.x1, o.x2];
  const there = s2 => end === 'lo' ? get(s2, id)[k] <= lo + 3 : get(s2, id)[k] >= hi - 3;
  if (there(s)) return s;
  // Walking right runs its time on: heading the wrong way, walk left (back in time) instead.
  const heading = o.dir;
  return walkUntil(s, who, (end === 'lo') === (heading < 0) ? 1 : -1, there, 800);
}

describe('courtyard 5 layout', () => {
  test('a walking-time courtyard with one Bloom charge for the hanging crate', () => {
    const s = setup({ level: 4 });
    expect(s.walkingTime).toBe(true);
    expect(s.freezeCharges).toBe(0);
    expect(s.bloomCharges).toBe(1);
    expect(abilityTargets(s, BLOOM)).toHaveLength(0);
    expect(s.objects.filter(o => o.walker === 0).map(o => o.id)).toEqual(['mover-0', 'mover-3']);
    expect(s.objects.filter(o => o.walker === 1).map(o => o.id)).toEqual(['mover-1', 'mover-2', 'plant-0']);
  });

  test('the rift is too wide to jump', () => {
    for (let delay = 0; delay < 30; delay++) {
      let s = setup({ level: 4 });
      stand(s, STILL, 700, 520, 'platform-0');
      // Jumping only moves Still's own (teal) ferry; push it far away so it cannot help.
      Object.assign(get(s, 'mover-0'), { clock: 190 });
      s = move(s, STILL, 1);
      for (let t = 0; t < 120; t++) { if (t === delay) s = act(s, { type: 'jump', actor: STILL }); s = tick(s); }
      expect(s.actors[STILL].on === 'platform-2').toBe(false);
    }
  });
});

test('Bloom can aim at and age the rope, then the released crate falls and can be picked up', () => {
  let s = setup({ level: 4 });
  const rope = get(s, 'rope-0'), crate = get(s, rope.crate);
  const cast = { type: 'ability', actor: BLOOM, target: rope.id };
  expect(rope.top).toBe(s.platforms[1].y + s.platforms[1].h);
  expect(rope.bottom).toBe(crate.y - 27);
  expect(validateAction(s, 'local', cast).valid).toBe(false);
  s = tick(s, meta.rope.breakTicks * 2);
  expect(get(s, rope.id).age).toBe(0);
  expect(get(s, crate.id).y).toBe(crate.y);

  stand(s, BLOOM, crate.x + 60, crate.y + 30, null);
  expect(validateAction(s, 'local', { type: 'grab', actor: BLOOM }).valid).toBe(false);
  stand(s, BLOOM, crate.x + 50, 520, 'platform-2');
  expect(bloomTargetAt(s, { x: rope.x, y: rope.bottom - 4 })?.id).toBe(rope.id);
  expect(abilityTargets(s, BLOOM).map(o => o.id)).toEqual([rope.id]);
  s = act(s, cast);
  expect(s.bloomCharges).toBe(0);
  s = tick(s, meta.rope.breakTicks - 1);
  expect(get(s, crate.id)).toMatchObject({ rope: rope.id });
  expect(get(s, crate.id).y).toBeGreaterThan(crate.y + 10);
  expect(s.events.filter(e => e.kind === 'ropeFray')).toHaveLength(2);
  s = tick(s);
  expect(get(s, rope.id)).toBeUndefined();
  expect(get(s, crate.id).rope).toBeUndefined();
  expect(get(s, crate.id).y).toBeGreaterThan(crate.y);
  expect(s.events.filter(e => e.kind === 'ropeSnap')).toHaveLength(1);
  s = tick(s, 60);
  expect(get(s, crate.id)).toMatchObject({ y: 493, vy: 0, held: null });
  s = act(s, { type: 'grab', actor: BLOOM });
  expect(s.actors[BLOOM].carrying).toBe(crate.id);

  const restarted = act(s, { type: 'restart' });
  expect(get(restarted, rope.id)).toEqual(rope);
  expect(get(restarted, crate.id)).toEqual(crate);
  expect(restarted.bloomCharges).toBe(1);
});

test('Still can ride the sprout to its full height to collect the hourglass', () => {
  let s = setup({ level: 4 });
  const [hourglass] = s.pickups, plant = get(s, 'plant-0');
  stand(s, STILL, hourglass.x, hourglass.y + 52, null);
  s = tick(s);
  expect(s.pickups[0].taken).toBe(false);

  s = setup({ level: 4 });
  s = walkUntil(s, STILL, -1, s2 => s2.actors[STILL].x <= plant.x + 45);
  s = act(s, { type: 'jump', actor: STILL });
  s = walkUntil(s, STILL, -1, s2 => Math.abs(s2.actors[STILL].x - plant.x) < 5);
  s = tick(s, 48);
  s = act(s, { type: 'jumpRelease', actor: STILL });
  expect(s.actors[STILL].on).toBe(plant.id);
  expect(s.freezeCharges).toBe(0);
  s = walkUntil(s, BLOOM, 1, s2 => get(s2, plant.id).height === meta.plant.maxHeight);
  expect(s.freezeCharges).toBe(1);
  expect(s.actors[STILL].on).toBe(plant.id);
});

test('the mature cap awards the hourglass to a rider at either edge', () => {
  for (const side of [-1, 1]) {
    let s = setup({ level: 4 });
    const plant = get(s, 'plant-0');
    Object.assign(plant, { age: meta.plant.growTicks, height: meta.plant.maxHeight });
    stand(s, STILL, plant.x + side * (canopyWidth(plant) / 2 - 25), plant.base - plant.height, plant.id);
    s = tick(s);
    expect(s.actors[STILL].on).toBe(plant.id);
    expect(s.freezeCharges).toBe(1);
    expect(s.pickups[0].taken).toBe(true);
  }
});

test('Still can touch the hourglass in the air when Bloom finishes growing the cap', () => {
  let s = setup({ level: 4 });
  const plant = get(s, 'plant-0'), { growTicks, maxHeight } = meta.plant;
  plant.age = growTicks - 4;
  plant.height = maxHeight * plant.age / growTicks;
  stand(s, STILL, plant.x, plant.base - plant.height, plant.id);
  s = tick(act(s, { type: 'jump', actor: STILL }));
  expect(s.actors[STILL].grounded).toBe(false);
  expect(s.pickups[0].taken).toBe(false);

  s = tick(move(s, BLOOM, 1), 2);
  expect(s.actors[STILL].grounded).toBe(false);
  expect(s.pickups[0].taken).toBe(true);
  expect(s.freezeCharges).toBe(1);
});

test('the guard patrols all the way to both ends of the ground under the gate', () => {
  let s = setup({ level: 4 });
  const guard = s.objects.find(o => o.kind === 'guard'), floor = s.platforms[2];
  expect(guard).toMatchObject({ x: s.exit.x, y: floor.y });
  let min = guard.x, max = guard.x;
  for (let i = 0; i < 1550; i++) {
    s = tick(s);
    const x = get(s, guard.id).x;
    min = Math.min(min, x); max = Math.max(max, x);
  }
  expect(min).toBeCloseTo(floor.x + 26);
  expect(max).toBeCloseTo(floor.x + floor.w - 26);
});

test('both lifts wait for the crate and start above jump height', () => {
  let s = setup({ level: 4 });
  s = tick(move(move(s, STILL, 1), BLOOM, 1), 45);
  s = move(move(s, STILL, 0), BLOOM, 0);
  for (const id of ['mover-2', 'mover-3']) {
    const lift = get(s, id);
    expect(lift).toMatchObject({ y: lift.y2, clock: 0 });
    const standX = id === 'mover-2' ? lift.x - 22 : lift.x + lift.w + 22;
    stand(s, STILL, standX, s.platforms[2].y, 'platform-2');
    s = act(s, { type: 'jump', actor: STILL });
    for (let i = 0; i < 60; i++) {
      s = tick(s);
      expect(s.actors[STILL].y).toBeGreaterThan(lift.y2);
    }
    s = act(s, { type: 'jumpRelease', actor: STILL });
  }
});

test('the far checkpoint is reachable by jumping from the ground outside the guard patrol height', () => {
  let s = setup({ level: 4 });
  const cp = s.checkpoints[0];
  stand(s, STILL, 1430, s.platforms[2].y, 'platform-2');
  s = act(s, { type: 'jump', actor: STILL });
  for (let i = 0; i < 26 && s.actors[STILL].y > cp.y; i++) s = tick(s);
  s = walkUntil(s, STILL, -1, s2 => s2.actors[STILL].checkpoint === cp.id);
  s = tick(s, 35);
  expect(s.actors[STILL].on).toBe('platform-3');
});

describe('courtyard 5: time keeps pace', () => {
  test('the gold sprout grows while Bloom walks right, shrinks back while Bloom walks left, waits while Bloom stands', () => {
    let s = setup({ level: 4 });
    const start = get(s, 'plant-0').height;
    s = tick(s, 60);
    expect(get(s, 'plant-0').height).toBe(start);
    s = move(s, STILL, 1); s = tick(s, 40); s = move(s, STILL, 0);
    expect(get(s, 'plant-0').height).toBe(start);
    s = move(s, BLOOM, 1); s = tick(s, 40); s = move(s, BLOOM, 0); s = tick(s, 2);
    const grown = get(s, 'plant-0').height;
    expect(grown).toBeGreaterThan(start + 20);
    s = tick(s, 60);
    expect(get(s, 'plant-0').height).toBe(grown);
    s = move(s, BLOOM, -1); s = tick(s, 20); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0').height).toBeLessThan(grown);
    expect(get(s, 'plant-0').height).toBeGreaterThan(start);
  });

  test('walked far it wilts to a husk but never vanishes, and walking back brings it to life', () => {
    let s = setup({ level: 4 });
    const p = get(s, 'plant-0'), { growTicks, matureTicks, witherTicks } = meta.plant;
    Object.assign(p, { age: growTicks + matureTicks + witherTicks - 10 });
    stand(s, BLOOM, 400, 520, 'platform-0');
    s = move(s, BLOOM, 1); s = tick(s, 30); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0')).toMatchObject({ withered: true, age: growTicks + matureTicks + witherTicks });
    s = move(s, BLOOM, -1); s = tick(s, 80); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0').withered).toBe(false);
  });

  test('a ferry follows its walker step for step, and riding it does not drive it', () => {
    let s = setup({ level: 4 });
    const x0 = get(s, 'mover-0').x;
    s = move(s, STILL, 1); s = tick(s, 20); s = move(s, STILL, 0); s = tick(s, 2);
    expect(get(s, 'mover-0').x).toBeCloseTo(x0 + 20 * meta.controls.speed, 5);
    // Still stands on the gold ferry; Bloom walks; Still is carried but the teal ferry does not move.
    s = setup({ level: 4 });
    stand(s, STILL, 830, 570, 'mover-1');
    s = move(s, BLOOM, 1); s = tick(s, 30); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(s.actors[STILL].on).toBe('mover-1');
    expect(s.actors[STILL].x).toBeGreaterThan(900);
    expect(get(s, 'mover-0').x).toBe(x0);
    expect(s.flags.moverRide).toBe(true);
  });

  test('walking into a wall moves nothing', () => {
    let s = setup({ level: 4 });
    stand(s, BLOOM, 22, 520, 'platform-0');
    s = tick(s, 2);
    const h = get(s, 'plant-0').height;
    s = move(s, BLOOM, -1); s = tick(s, 30);
    expect(get(s, 'plant-0').height).toBe(h);
  });
});

describe('courtyard 5: room to walk', () => {
  // A walker standing on a ledge can only reach the clock values their steps there cover. Every ledge a walker drives
  // from is wider than half the run of what they drive, so whatever they did before, one walk sweeps it end to end.
  const room = f => f.w - 44;
  test('Still on the start ground sweeps the teal ferry; Still on the plateau sweeps the teal lift', () => {
    const [start, plateau] = level.platforms, [teal, , , tealLift] = level.movers;
    expect(room(start) - 152).toBeGreaterThan(teal.x2 - teal.x1); // the sprout's stem can take up the left end
    expect(room(plateau)).toBeGreaterThan(tealLift.y2 - tealLift.y1);
  });
  test('Bloom on the far ground sweeps the gold ferry and the gold lift', () => {
    const far = level.platforms[2], [, gold, goldLift] = level.movers;
    expect(room(far)).toBeGreaterThan(2 * (gold.x2 - gold.x1));
    expect(room(far)).toBeGreaterThan(2 * (goldLift.y2 - goldLift.y1));
  });
});

describe('courtyard 5 can be finished', () => {
  function hopFromCrate(s, who, liftId, direction) {
    const crate = get(s, 'crate-0'), lift = get(s, liftId);
    s = act(s, { type: 'jump', actor: who });
    s = walkUntil(s, who, Math.sign(crate.x - s.actors[who].x), s2 => Math.abs(s2.actors[who].x - crate.x) < 5);
    s = tick(s, 48);
    expect(s.actors[who].on).toBe(crate.id);
    s = act(s, { type: 'jumpRelease', actor: who });
    s = act(s, { type: 'jump', actor: who });
    for (let i = 0; i < 28 && s.actors[who].y > lift.y; i++) s = tick(s);
    s = walkUntil(s, who, direction, s2 => s2.actors[who].on === liftId);
    return act(s, { type: 'jumpRelease', actor: who });
  }

  test('collect the hourglass, cross by ferry, release the crate and climb both lifts past the guard', () => {
    let s = setup({ level: 4 });
    // Still collects the shard and the hourglass as Bloom grows the mushroom.
    stand(s, STILL, 110, 520 - get(s, 'plant-0').height, 'plant-0');
    s = walkUntil(s, BLOOM, 1, s2 => get(s2, 'plant-0').height === meta.plant.maxHeight);
    expect(s.actors[STILL].on).toBe('plant-0');
    expect(s.shards[0].taken).toBe(true);
    expect(s.freezeCharges).toBe(1);
    expect(s.flags.treeLifted).toBe(true);
    // Back on the ground (placed), Still walks the teal ferry home, then Bloom hops on.
    stand(s, STILL, 250, 520, 'platform-0'); stand(s, BLOOM, 700, 520, 'platform-0');
    s = drive(s, STILL, 'mover-0', 'lo');
    stand(s, BLOOM, 830, 470, 'mover-0');
    // Still walks; the teal ferry carries Bloom across; Bloom steps off onto the far ground.
    s = walkUntil(s, STILL, 1, s2 => get(s2, 'mover-0').x >= level.movers[0].x2 - 3);
    expect(s.actors[BLOOM].on).toBe('mover-0');
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].on === 'platform-2' && s2.actors[BLOOM].x > 1500);
    // Bloom walks the gold ferry back to the start ground; Still steps off the edge onto it.
    s = drive(s, BLOOM, 'mover-1', 'lo');
    stand(s, STILL, 740, 520, 'platform-0');
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'mover-1');
    s = drive(s, BLOOM, 'mover-1', 'hi');
    expect(s.actors[STILL].on).toBe('mover-1');
    s = act(s, { type: 'jump', actor: STILL });
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'platform-2');
    s = act(s, { type: 'jumpRelease', actor: STILL });
    // Bloom drops the crate by the gold lift. Still slows the guard before heading up.
    stand(s, BLOOM, 1730, 520, 'platform-2');
    stand(s, STILL, 1830, 520, 'platform-2');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'rope-0' });
    s = tick(s, meta.rope.breakTicks + 60);
    s = drive(s, BLOOM, 'mover-2', 'hi');
    const guard = s.objects.find(o => o.kind === 'guard');
    for (let i = 0; i < 450 && get(s, guard.id).x > 2115; i++) s = tick(s);
    s = act(s, { type: 'ability', actor: STILL, x: 2000, y: 495 });
    expect(get(s, guard.id).frozen).toBe(true);
    s = hopFromCrate(s, STILL, 'mover-2', -1);
    s = walkUntil(s, BLOOM, -1, s2 => get(s2, 'mover-2').y <= 103);
    expect(s.actors[STILL].on).toBe('mover-2');
    s = act(s, { type: 'jump', actor: STILL });
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'platform-1' && s2.actors[STILL].x > 1800);
    s = act(s, { type: 'jumpRelease', actor: STILL });
    // Bloom carries the crate over the slowed guard and sets it beside the teal lift.
    const crateX = get(s, 'crate-0').x, dx = crateX - s.actors[BLOOM].x;
    if (Math.abs(dx) > 70) s = walkUntil(s, BLOOM, Math.sign(dx), s2 => Math.abs(s2.actors[BLOOM].x - crateX) < 70);
    s = act(s, { type: 'grab', actor: BLOOM });
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].x >= get(s2, guard.id).x - 78);
    s = act(s, { type: 'jump', actor: BLOOM });
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].x >= 2120);
    s = act(s, { type: 'jumpRelease', actor: BLOOM });
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].x >= 2174);
    s = act(s, { type: 'grab', actor: BLOOM, aim: { vx: 0, vy: 4 } });
    s = tick(s, 8);
    expect(get(s, 'crate-0').x).toBeGreaterThan(2180);
    expect(get(s, 'crate-0').x).toBeLessThan(2240);
    s = drive(s, STILL, 'mover-3', 'hi');
    expect(s.actors[STILL].on).toBe('platform-1');
    s = hopFromCrate(s, BLOOM, 'mover-3', 1);
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].x >= level.movers[3].x + 30);
    const roomToWalk = s.actors[STILL].x < level.exit.x ? 1 : -1;
    s = walkUntil(s, STILL, roomToWalk, s2 => get(s2, 'mover-3').y <= 103);
    expect(s.actors[STILL].on).toBe('platform-1');
    expect(s.actors[BLOOM].on).toBe('mover-3');
    s = act(s, { type: 'jump', actor: BLOOM });
    s = walkUntil(s, BLOOM, -1, s2 => s2.actors[BLOOM].on === 'platform-1' && s2.actors[BLOOM].x < 2200);
    s = act(s, { type: 'jumpRelease', actor: BLOOM });
    s = walkUntil(s, STILL, Math.sign(level.exit.x - s.actors[STILL].x), s2 => Math.abs(s2.actors[STILL].x - level.exit.x) < 22);
    s = move(s, BLOOM, -1);
    for (let i = 0; i < 80 && s.status !== 'won'; i++) s = tick(s);
    expect(s.status).toBe('won');
  });
});
