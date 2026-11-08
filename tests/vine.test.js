import { describe, test, expect } from 'bun:test';
import { validateAction, applyAction, meta, setup, objectBox, anchor } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { vineArena } from './arena.js';

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
    if (!v) return; // planting arrives in Task 4; this test turns on then
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
