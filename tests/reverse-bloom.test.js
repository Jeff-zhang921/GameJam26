import { describe, test, expect } from 'bun:test';
import { applyAction, validateAction, abilityCheck, plantSize, meta, failureReason, setup } from '../src/logic.js';
import { reverseArena, rootriseArena, vineArena } from './arena.js';

const STILL = 0, BLOOM = 1;
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const rewind = (s, target = 'plant-0') => act(s, { type: 'ability', actor: BLOOM, target });
const plant = (s, id = 'plant-0') => s.objects.find(o => o.id === id);

describe('plant size and starting age', () => {
  test('plantSize follows the life: rise, hold, wilt (mushroom) and reach, hold, shrink (vine)', () => {
    const { growTicks, matureTicks, maxHeight } = meta.plant;
    expect(plantSize(0, growTicks / 2)).toBeCloseTo(maxHeight / 2);
    expect(plantSize(0, growTicks + matureTicks)).toBeCloseTo(maxHeight);
    expect(plantSize(1, growTicks / 2)).toBeCloseTo(meta.vine.maxLength / 2);
    expect(plantSize(1, growTicks + matureTicks)).toBeCloseTo(meta.vine.maxLength);
  });

  test('reverseArena puts a sleeping plant at the given age, withered past maturity', () => {
    const young = reverseArena({ age: 480 }), old = reverseArena({ age: 1800 });
    expect(plant(young)).toMatchObject({ age: 480, speed: 0, withered: false });
    expect(plant(young).height).toBeCloseTo(meta.plant.maxHeight / 2);
    expect(plant(old).withered).toBe(true);
    expect(young.bloomReverses).toBe(true);
  });
});

describe('rewinding Bloom: the cast', () => {
  test('each cast lowers the speed by one and costs a charge, down to −maxSpeed', () => {
    let s = reverseArena();
    expect(s.bloomCharges).toBe(3);
    s = rewind(s); expect(plant(s).speed).toBe(-1); expect(s.bloomCharges).toBe(2);
    expect(s.events.at(-1)).toMatchObject({ kind: 'wake', rewind: true, target: 'plant-0' });
    s = rewind(s); expect(plant(s).speed).toBe(-2);
    expect(s.events.at(-1)).toMatchObject({ kind: 'grow', rewind: true });
    s.bloomCharges = 3; s = rewind(s); expect(plant(s).speed).toBe(-3);
    expect(abilityCheck(s, BLOOM, 'plant-0')).toBe('maxSpeed');
    expect(validateAction(s, 'local', { type: 'ability', actor: BLOOM, target: 'plant-0' }).error).toBe('maxSpeed');
  });

  test('in a rewinding courtyard Bloom only acts on plants; Still is unchanged', () => {
    const s = reverseArena();
    s.objects.push({ kind: 'mover', id: 'mover-0', x: 450, y: 400, w: 120, x1: 450, x2: 550, dir: 1, speed: 0, frozen: false });
    expect(abilityCheck(s, BLOOM, 'mover-0')).toBe('unsupported');
    expect(abilityCheck(s, STILL, 'mover-0')).not.toBe('unsupported');
    s.bloomReverses = false;
    expect(abilityCheck(s, BLOOM, 'mover-0')).toBe('ok');
  });

  test('rewinding the vine sets vineRewound', () => {
    let s = vineArena(); s.bloomReverses = true;
    const { growTicks } = meta.plant;
    s.objects.push({ kind: 'plant', id: 'plant-9', pit: 'pit-1', x: 760, base: 420, age: growTicks, height: plantSize(-1, growTicks), withered: false, speed: 0, frozen: false, barrier: false, wall: -1 });
    s.pits[1].plant = 'plant-9';
    Object.assign(s.actors[BLOOM], { x: 640, y: 540 });
    s = rewind(s, 'plant-9');
    expect(s.flags.vineRewound).toBe(true);
  });
});

describe('rewinding Bloom: plants age backwards', () => {
  const { growTicks, matureTicks, maxHeight } = meta.plant;

  test('a mature mushroom holds its height back through maturity, then shrinks', () => {
    let s = rewind(reverseArena({ age: 1200 }));
    s = tick(s, 240);
    expect(plant(s).age).toBeCloseTo(960);
    expect(plant(s).height).toBeCloseTo(maxHeight);
    s = tick(s, 480);
    expect(plant(s).age).toBeCloseTo(480);
    expect(plant(s).height).toBeCloseTo(maxHeight / 2);
  });

  test('a withered mushroom grows back and is alive again once it is back in maturity', () => {
    let s = rewind(reverseArena({ age: 1800 }));
    const start = plant(s).height;
    s = tick(s, 300);
    expect(plant(s).withered).toBe(true);
    expect(plant(s).height).toBeGreaterThan(start);
    s = tick(s, 100);
    expect(plant(s).withered).toBe(false);
    expect(s.events.some(e => e.kind === 'unwither')).toBe(true);
  });

  test('rewound to age 0 the plant is gone and its pit empty', () => {
    let s = rewind(reverseArena({ age: 100 }));
    s = tick(s, 101);
    expect(plant(s)).toBeUndefined();
    expect(s.pits[0].plant).toBe(null);
    expect(s.events.some(e => e.kind === 'vanish' && e.rewound)).toBe(true);
  });

  test('a Freeze Area slows the rewind to a fifth', () => {
    let s = rewind(reverseArena({ age: 1200 }));
    s.freezeAreas.push({ id: 'freeze-9', owner: 'local', x: 600, y: 420, radius: 130, ticksLeft: 600, duration: 600 });
    s = tick(s, 100);
    expect(plant(s).age).toBeCloseTo(1200 - 100 * meta.time.frozenRate);
  });

  test('a rider sinks with a shrinking cap and earns treeRewound', () => {
    let s = reverseArena({ age: 480 });
    Object.assign(s.actors[STILL], { x: 600, y: 540 - plant(s).height, vx: 0, vy: 0, grounded: true, on: 'plant-0' });
    s = rewind(s);
    s = tick(s, 60);
    expect(plant(s).height).toBeLessThan(maxHeight / 2);
    expect(s.actors[STILL].y).toBeCloseTo(540 - plant(s).height, 0);
    expect(s.actors[STILL].on).toBe('plant-0');
    expect(s.flags.treeRewound).toBe(true);
    expect(s.flags.treeLifted).toBe(false);
  });
});
