import { describe, test, expect } from 'bun:test';
import { validateAction, applyAction, meta, setup, objectBox, anchor, interactionFor, canTakeSeed, throwPath } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { vineArena } from './arena.js';
import { makeEnemy } from '../src/enemies.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value)).toEqual({ valid: true }); return applyAction(state, 'local', value); }
const vineOf = s => s.objects.find(o => o.kind === 'plant' && o.wall);
const { growTicks: G, matureTicks: M, witherTicks: W } = meta.plant;
// A seed in flight just beside the wall pit's face, falling.
const seedAtPit = s => { s.objects.push({ kind: 'seed', id: 'seed-x', x: 752, y: 418, vx: 0, vy: 0.5, frozen: false, held: null, thrown: true, spawnX: 600, spawnY: 530 }); return s; };

describe('wall pits', () => {
  test('a level pit keeps its wall side', () => {
    const original = LEVELS[1].pits;
    LEVELS[1].pits = [...original, { x: 760, y: 420, wall: -1 }];
    try { expect(setup({ level: 1 }).pits.at(-1)).toMatchObject({ x: 760, y: 420, wall: -1, plant: null }); }
    finally { LEVELS[1].pits = original; }
  });
});

describe('vine length', () => {
  const grownVine = () => {
    let s = seedAtPit(vineArena());
    s = step(s);
    return s;
  };
  test('a sleeping vine stays at length 0; woken it grows to maxLength, holds, withers back and vanishes', () => {
    let s = grownVine(), v = vineOf(s);
    expect(v.height).toBe(0);
    v.speed = 1;
    s = step(s, G / 2); expect(vineOf(s).height).toBeCloseTo(meta.vine.maxLength / 2, 0);
    s = step(s, G / 2 + M / 2); expect(vineOf(s).height).toBeCloseTo(meta.vine.maxLength, 5);
    s = step(s, M / 2 + W / 2); expect(vineOf(s).withered).toBe(true); expect(vineOf(s).height).toBeCloseTo(meta.vine.maxLength / 2, 0);
    s = step(s, W / 2 + 1); expect(vineOf(s)).toBeUndefined();
    expect(s.pits.find(p => p.id === 'pit-1').plant).toBeNull();
  });
});

// A vine of length `length` in vineArena's wall pit, made directly (planting is Task 4).
function withVine(length) {
  const s = vineArena(), pit = s.pits.find(p => p.id === 'pit-1');
  pit.plant = 'plant-0';
  s.objects.push({ kind: 'plant', id: 'plant-0', pit: 'pit-1', x: 760, base: 420, age: 0, height: length, withered: false, speed: 0, frozen: false, barrier: false, wall: -1 });
  s.nextPlant = 1;
  return s;
}

describe('vine body', () => {
  test('a traveller dropped onto the vine stands on its top', () => {
    let s = withVine(200);
    Object.assign(s.actors[1], { x: 650, y: 380, vy: 0, grounded: false, on: null });
    s = step(s, 30);
    expect(s.actors[1]).toMatchObject({ grounded: true, on: 'plant-0', y: 420 });
  });
  test('past the tip there is nothing to stand on', () => {
    let s = withVine(100);
    Object.assign(s.actors[1], { x: 600, y: 380, vy: 0, grounded: false, on: null }); // tip at x 660
    s = step(s, 30);
    expect(s.actors[1].on).not.toBe('plant-0');
  });
  test('a vine is not a wall: a traveller on it walks through the height above its strip', () => {
    let s = withVine(200);
    Object.assign(s.actors[1], { x: 700, y: 420, vy: 0, grounded: true, on: 'plant-0' });
    s = action(s, { type: 'move', actor: 1, dir: 1 });
    s = step(s, 15);
    expect(s.actors[1].x).toBeGreaterThan(730);
  });
  test('a growing vine does not lift its rider', () => {
    let s = withVine(100);
    Object.assign(vineOf(s), { speed: 1, age: 400 });
    Object.assign(s.actors[1], { x: 700, y: 420, vy: 0, grounded: true, on: 'plant-0' });
    s = step(s, 60);
    expect(s.actors[1].y).toBe(420);
    expect(s.flags.treeLifted).toBeFalsy();
  });
  test('box and anchor sit along the vine', () => {
    const v = withVine(200).objects.find(o => o.id === 'plant-0');
    expect(objectBox(v)).toEqual({ x: 560, y: 400, w: 200, h: 36 });
    expect(anchor(v)).toEqual({ x: 660, y: 418 });
  });
});

describe('taking a seed', () => {
  test('Bloom takes a seed from the count into their hand; it is a throw now', () => {
    let s = vineArena(); s.actors[1].x = 600;
    expect(canTakeSeed(s, 1)).toBe(true);
    s = action(s, { type: 'takeSeed', actor: 1 });
    expect(s.seeds).toBe(0);
    const held = s.objects.find(o => o.id === s.actors[1].carrying);
    expect(held).toMatchObject({ kind: 'seed', held: 1, spawnX: 600, spawnY: 530 });
    expect(interactionFor(s, 1)).toMatchObject({ kind: 'throw', item: 'seed' });
    s = step(s, 5);
    expect(s.actors[1].carrying).toBe(held.id); // a held seed is not collected back by touch
    expect(s.seeds).toBe(0);
  });
  test('Bloom hit while holding a seed drops it; walking over it collects it again', () => {
    let s = vineArena(); s.actors[1].x = 600;
    s = action(s, { type: 'takeSeed', actor: 1 });
    const id = s.actors[1].carrying, bloom = s.actors[1];
    s.objects.push(makeEnemy('dart', { x: bloom.x, y: bloom.y - 20, dir: [1, 0] }, 'dart-hit'));
    s = step(s, 2);
    expect(s.events.some(e => e.kind === 'hit' && e.actor === 1)).toBe(true);
    expect(s.actors[1].carrying).toBeNull();
    expect(s.objects.find(o => o.id === id)).toMatchObject({ kind: 'seed', held: null });
    expect(s.seeds).toBe(0);
    const seed = s.objects.find(o => o.id === id);
    Object.assign(s.actors[1], { x: seed.x, y: seed.y + 10, invuln: 0 });
    s = step(s, 3);
    expect(s.seeds).toBe(1);
  });
  test('refused for Still, with no seeds, or with hands full', () => {
    const s = vineArena();
    expect(validateAction(s, 'local', { type: 'takeSeed', actor: 0 }).error).toBe('role');
    expect(validateAction({ ...s, seeds: 0 }, 'local', { type: 'takeSeed', actor: 1 }).error).toBe('noSeeds');
    const full = action(s, { type: 'takeSeed', actor: 1 });
    expect(validateAction({ ...full, seeds: 1 }, 'local', { type: 'takeSeed', actor: 1 }).error).toBe('handsFull');
  });
  test('the held seed is thrown by grab and its preview flies like a seed', () => {
    let s = vineArena(); s.actors[1].x = 300;
    s = action(s, { type: 'takeSeed', actor: 1 });
    const path = throwPath(s, 1, null);
    s = action(s, { type: 'grab', actor: 1 });
    const seed = s.objects.find(o => o.kind === 'seed' && o.thrown);
    expect(seed).toMatchObject({ held: null, x: path[0].x, y: path[0].y });
    s = step(s, 1);
    expect(seed.id).toBe(s.objects.find(o => o.thrown).id);
    expect(s.objects.find(o => o.id === seed.id).x).toBeCloseTo(path[1].x, 6);
  });
});

describe('throwing a seed into a pit', () => {
  test('a seed in flight reaching the wall pit plants a sleeping vine there', () => {
    let s = seedAtPit(vineArena());
    s = step(s);
    expect(s.objects.some(o => o.id === 'seed-x')).toBe(false);
    expect(vineOf(s)).toMatchObject({ pit: 'pit-1', wall: -1, x: 760, base: 420, height: 0, speed: 0 });
    expect(s.pits.find(p => p.id === 'pit-1').plant).toBe(vineOf(s).id);
  });
  test('a full throw from the ground at the wall plants it', () => {
    let s = vineArena(); Object.assign(s.actors[1], { x: 600, facing: 1 });
    s = action(s, { type: 'takeSeed', actor: 1 });
    s = action(s, { type: 'grab', actor: 1 }); // the default throw: up and to the right, into the wall
    s = step(s, 40);
    expect(vineOf(s)).toBeDefined();
    expect(s.seeds).toBe(0);
  });
  test('a seed resting near a pit does not plant it, and a missed throw can be picked up again', () => {
    let s = vineArena();
    s.objects.push({ kind: 'seed', id: 'seed-x', x: 752, y: 418, vx: 0, vy: 0, frozen: false, held: null, spawnX: 600, spawnY: 530 }); // not thrown
    s = step(s);
    expect(vineOf(s)).toBeUndefined();
    s = vineArena(); s.objects = []; Object.assign(s.actors[1], { x: 300, facing: 1 }); // no level seeds to muddy the count
    s = action(s, { type: 'takeSeed', actor: 1 });
    s = action(s, { type: 'grab', actor: 1, aim: { vx: 2, vy: -2 } }); // a short lob, well short of every pit
    s = step(s, 60);
    const seed = s.objects.find(o => o.id === 'seed-taken-0');
    expect(seed.thrown).toBeFalsy(); // it landed
    expect(seed.x).toBeGreaterThan(350);
    s.actors[1].x = seed.x; s = step(s, 2);
    expect(s.seeds).toBe(1);
  });
  test('a landed seed moved next to an empty pit does not plant it', () => {
    let s = vineArena(); s.objects = []; Object.assign(s.actors[1], { x: 300, facing: 1 }); // no level seeds to muddy the count
    s = action(s, { type: 'takeSeed', actor: 1 });
    s = action(s, { type: 'grab', actor: 1, aim: { vx: 2, vy: -2 } });
    s = step(s, 60);
    const seed = s.objects.find(o => o.id === 'seed-taken-0');
    Object.assign(seed, { x: 752, y: 418, vy: 0 });
    s = step(s);
    expect(vineOf(s)).toBeUndefined();
  });
  test('a seed lost out of the world returns to the count, not to the air it was taken in', () => {
    let s = vineArena(); s.objects = []; Object.assign(s.actors[1], { x: 40, y: 300, facing: -1, grounded: false });
    s = action(s, { type: 'takeSeed', actor: 1 });
    expect(s.seeds).toBe(0);
    s = action(s, { type: 'grab', actor: 1 }); // thrown left, out of the courtyard
    s = step(s, 10);
    expect(s.objects.some(o => o.kind === 'seed')).toBe(false);
    expect(s.seeds).toBe(1);
  });
  test('Bloom does not collect a seed still in flight', () => {
    let s = vineArena(); Object.assign(s.actors[1], { x: 300, y: 540 });
    s.objects.push({ kind: 'seed', id: 'seed-x', x: 300, y: 520, vx: .1, vy: 0, frozen: false, held: null, thrown: true, spawnX: 300, spawnY: 520 });
    const before = s.seeds; s = step(s);
    expect(s.seeds).toBe(before);
    expect(s.objects.some(o => o.id === 'seed-x')).toBe(true);
  });
  test('inside a Freeze Area a growing vine lengthens at the frozen rate', () => {
    let s = step(seedAtPit(vineArena())), id = vineOf(s).id;
    s.objects.find(o => o.id === id).speed = 1;
    s = step(s, 100); const free = vineOf(s).height;
    s.freezeAreas.push({ id: 'freeze-x', owner: 'local', x: 700, y: 420, radius: meta.freeze.radius, ticksLeft: 1000, duration: 1000 });
    s = step(s, 100);
    expect(vineOf(s).height - free).toBeCloseTo(free / 100 * 100 * meta.time.frozenRate, 0);
  });
  test('the throw preview ends at the pit the seed would plant', () => {
    let s = vineArena(); Object.assign(s.actors[1], { x: 450, facing: 1 });
    s = action(s, { type: 'takeSeed', actor: 1 });
    const path = throwPath(s, 1, { vx: 4, vy: -2 }), end = path.at(-1); // drops into the ground pit at x 600
    expect(Math.hypot(end.x - 600, end.y - 530)).toBeLessThanOrEqual(24);
    expect(path.length).toBe(22);
  });
  test('a short press beside a wall pit does not plant it by hand', () => {
    const s = vineArena(); Object.assign(s.actors[1], { x: 745, y: 420 }); // right under the pit's face
    expect(interactionFor(s, 1).kind).not.toBe('plant');
    expect(validateAction(s, 'local', { type: 'grab', actor: 1 }).valid).toBe(false);
  });
});
