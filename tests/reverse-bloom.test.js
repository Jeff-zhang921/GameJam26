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
