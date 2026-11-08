import { describe, test, expect } from 'bun:test';
import { validateAction, applyAction, meta, setup } from '../src/logic.js';
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
