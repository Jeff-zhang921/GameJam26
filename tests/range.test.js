import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, abilityCheck, abilityTargets, timeObjectAt, anchor } from '../src/logic.js';

const send = (state, type, actor = 0, extra = {}) => {
  const action = { type, actor, ...extra };
  expect(validateAction(state, 'local', action).valid).toBe(true);
  return applyAction(state, 'local', action);
};
const tick = (state, count = 1) => { for (let i = 0; i < count; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; };
const get = (state, id) => state.objects.find(o => o.id === id);
const STILL = 0, BLOOM = 1;

describe('ability reach of 300 keeps every courtyard route open', () => {
  test('reach is 300 world units', () => expect(meta.controls.range).toBe(300));

  test('courtyard 1: a thrown crate can be frozen for over half a second after the throw', () => {
    let state = setup({ level: 0 });
    state.actors[STILL].x = 300;
    state = send(state, 'grab');
    state.actors[STILL].x = 418;
    state = send(state, 'grab'); // throw toward the broken bridge
    let window = 0;
    while (abilityCheck(state, STILL, 'crate-0') === 'ok' && window < 200) { state = tick(state); window++; }
    expect(window).toBeGreaterThanOrEqual(30);
  });

  test('courtyard 2: Still on the ground can freeze a full-grown mushroom', () => {
    let state = setup({ level: 1 });
    state.actors[BLOOM].x = 380; state = send(state, 'grab', BLOOM);
    state.actors[BLOOM].x = 600; state = send(state, 'grab', BLOOM);
    Object.assign(get(state, 'plant-0'), { age: meta.plant.growTicks, height: meta.plant.maxHeight, speed: 1 });
    state.actors[STILL].x = 450;
    expect(abilityCheck(state, STILL, 'plant-0')).toBe('ok');
  });

  test('courtyard 3: Bloom can wake the ancient mushroom from the closest spot the barrier allows', () => {
    const state = setup({ level: 2 });
    state.actors[BLOOM].x = 540;
    expect(abilityCheck(state, BLOOM, 'plant-0')).toBe('ok');
  });

  test('courtyard 4: Bloom on the ground edge can wake the moving platform', () => {
    const state = setup({ level: 3 });
    state.actors[BLOOM].x = 505;
    expect(abilityCheck(state, BLOOM, 'mover-0')).toBe('ok');
  });

  test('courtyard 5: from either edge of the rift, Still can freeze a projectile flying above it', () => {
    let state = setup({ level: 4 });
    // Only the geometry matters here: keep the guard and lantern from interrupting.
    state.objects = state.objects.filter(o => o.kind !== 'guard' && o.kind !== 'lantern');
    Object.assign(state.actors[STILL], { x: 545 });
    Object.assign(state.actors[BLOOM], { x: 100 });
    // Low darts pop on the nest before the rift, so the homing orb is what crosses it.
    let shot = null;
    for (let i = 0; i < 600 && !shot; i++) {
      state = tick(state);
      shot = state.objects.find(o => (o.kind === 'dart' || o.kind === 'orb') && anchor(o).x > 600 && anchor(o).x < 760);
    }
    expect(shot).not.toBe(null);
    expect(abilityCheck(state, STILL, shot.id)).toBe('ok');
    const fromRight = structuredClone(state);
    Object.assign(fromRight.actors[STILL], { x: 815 });
    expect(abilityCheck(fromRight, STILL, shot.id)).toBe('ok');
  });
});

describe('tapping time objects', () => {
  test('finds the object under a finger, with tolerance, and nothing on empty space', () => {
    const state = setup({ level: 0 });
    expect(timeObjectAt(state, { x: 350, y: 493 })?.id).toBe('crate-0');
    expect(timeObjectAt(state, { x: 350 + 27 + 10, y: 493 })).toBe(null);
    expect(timeObjectAt(state, { x: 350 + 27 + 10, y: 493 }, 12)?.id).toBe('crate-0');
    expect(timeObjectAt(state, { x: 700, y: 200 }, 12)).toBe(null);
  });

  test('prefers the smaller object when one sits on another, and ignores carried crates', () => {
    let state = setup({ level: 3 });
    const mover = get(state, 'mover-0');
    Object.assign(get(state, 'crate-0'), { x: mover.x + 60, y: mover.y - 27 });
    expect(timeObjectAt(state, { x: mover.x + 60, y: mover.y - 1 }, 20)?.id).toBe('crate-0');
    expect(timeObjectAt(state, { x: mover.x + 10, y: mover.y + 10 }, 20)?.id).toBe('mover-0');
    let carried = setup({ level: 0 });
    carried.actors[STILL].x = 300; carried = send(carried, 'grab');
    const held = get(carried, 'crate-0');
    expect(timeObjectAt(carried, { x: held.x, y: held.y }, 20)).toBe(null);
  });

  test('explains why a tap cannot act: out of reach, wrong ability, or already at full speed', () => {
    const state = setup({ level: 0 });
    expect(abilityCheck(state, STILL, 'crate-0')).toBe('ok');
    expect(abilityCheck(state, BLOOM, 'crate-0')).toBe('unsupported');
    get(state, 'crate-0').frozen = true;
    expect(abilityCheck(state, BLOOM, 'crate-0')).toBe('ok');
    state.actors[STILL].x = 1100;
    expect(abilityCheck(state, STILL, 'crate-0')).toBe('range');
    expect(abilityCheck(state, STILL, 'nothing')).toBe('missing');
    const level3 = setup({ level: 3 });
    level3.actors[BLOOM].x = 505;
    get(level3, 'mover-0').speed = meta.time.maxSpeed;
    expect(abilityCheck(level3, BLOOM, 'mover-0')).toBe('maxSpeed');
  });

  test('a tapped target is the same Ability action the server validates', () => {
    let state = setup({ level: 0 });
    expect(abilityTargets(state, STILL).map(o => o.id)).toContain('crate-0');
    state = send(state, 'ability', STILL, { target: 'crate-0' });
    expect(get(state, 'crate-0').frozen).toBe(true);
    state.actors[STILL].x = 1100;
    expect(validateAction(state, 'local', { type: 'ability', actor: STILL, target: 'crate-0' }).valid).toBe(false);
  });
});
