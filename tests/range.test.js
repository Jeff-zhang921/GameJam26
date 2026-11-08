import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, abilityCheck, abilityTargets, timeObjectAt, bloomTargetAt, bloomSupport, anchor } from '../src/logic.js';
import { classicCourtyard, rootriseArena } from './arena.js';

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
    let state = classicCourtyard();
    state.actors[STILL].x = 300;
    state = send(state, 'grab');
    state.actors[STILL].x = 418;
    state = send(state, 'grab'); // throw toward the broken bridge
    let window = 0;
    while (abilityCheck(state, STILL, 'crate-0') === 'ok' && window < 200) { state = tick(state); window++; }
    expect(window).toBeGreaterThanOrEqual(30);
  });

  test('courtyard 2: Still on the ground can freeze a full-grown mushroom', () => {
    let state = rootriseArena();
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
  test('Speed selects the platform under Bloom even when their body or a crate hides it', () => {
    const state = setup({ level: 3 }), mover = get(state, 'mover-0');
    Object.assign(state.actors[BLOOM], { x: mover.x + 60, y: mover.y, grounded: true, on: mover.id });
    Object.assign(get(state, 'crate-0'), { x: mover.x + 60, y: mover.y - 27 });
    expect(bloomSupport(state)?.id).toBe(mover.id);
    expect(bloomTargetAt(state, { x: mover.x + 60, y: mover.y - 30 }, 44)?.id).toBe(mover.id);
    expect(bloomTargetAt(state, { x: mover.x + 20, y: mover.y - 35 }, 44)?.id).toBe(mover.id);
    const action = { type: 'ability', actor: BLOOM, target: mover.id };
    expect(validateAction(state, 'local', action).valid).toBe(true);
    const faster = applyAction(state, 'local', action);
    expect(get(faster, mover.id).speed).toBe(1);
    expect(faster.bloomCharges).toBe(state.bloomCharges - 1);
  });

  test('underfoot Speed covers mushroom caps but never chooses ordinary ground or an airborne support', () => {
    const state = rootriseArena();
    const mushroom = { kind: 'plant', id: 'test-mushroom', x: 400, base: 520, height: 180, age: 700, speed: 1, frozen: false, withered: false };
    state.objects.push(mushroom);
    Object.assign(state.actors[BLOOM], { x: 400, y: 340, grounded: true, on: mushroom.id });
    expect(bloomTargetAt(state, { x: 400, y: 310 }, 44)?.id).toBe(mushroom.id);
    state.actors[BLOOM].grounded = false;
    expect(bloomSupport(state)).toBeNull();
    Object.assign(state.actors[BLOOM], { grounded: true, on: 'platform-0' });
    expect(bloomSupport(state)).toBeNull();
    expect(bloomTargetAt(state, { x: 1200, y: 50 }, 44)).toBeNull();
  });

  test('easier targeting retains maximum speed, charge and range restrictions', () => {
    const state = setup({ level: 3 }), mover = get(state, 'mover-0');
    Object.assign(state.actors[BLOOM], { x: mover.x + 60, y: mover.y, grounded: true, on: mover.id });
    mover.speed = meta.time.maxSpeed;
    const target = bloomTargetAt(state, { x: mover.x + 60, y: mover.y });
    expect(abilityCheck(state, BLOOM, target.id)).toBe('maxSpeed');
    mover.speed = 1; state.bloomCharges = 0;
    expect(validateAction(state, 'local', { type: 'ability', actor: BLOOM, target: target.id }).valid).toBe(false);
    state.bloomCharges = 3; state.actors[BLOOM].x = 100;
    expect(bloomSupport(state)).toBeNull();
    expect(abilityCheck(state, BLOOM, target.id)).toBe('range');
  });

  test('finds the object under a finger, with tolerance, and nothing on empty space', () => {
    const state = classicCourtyard();
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
    let carried = classicCourtyard();
    carried.actors[STILL].x = 300; carried = send(carried, 'grab');
    const held = get(carried, 'crate-0');
    expect(timeObjectAt(carried, { x: held.x, y: held.y }, 20)).toBe(null);
  });

  test('explains why a tap cannot act: out of reach, wrong ability, or already at full speed', () => {
    const state = classicCourtyard();
    expect(abilityCheck(state, STILL, 'crate-0')).toBe('ok');
    expect(abilityCheck(state, BLOOM, 'crate-0')).toBe('unsupported');
    get(state, 'crate-0').frozen = true; // Bloom never hastens crates, frozen or not
    expect(abilityCheck(state, BLOOM, 'crate-0')).toBe('unsupported');
    state.actors[STILL].x = 1100;
    expect(abilityCheck(state, STILL, 'crate-0')).toBe('range');
    expect(abilityCheck(state, STILL, 'nothing')).toBe('missing');
    const level3 = setup({ level: 3 });
    level3.actors[BLOOM].x = 505;
    get(level3, 'mover-0').speed = meta.time.maxSpeed;
    expect(abilityCheck(level3, BLOOM, 'mover-0')).toBe('maxSpeed');
  });

  test('a tapped target is the same Ability action the server validates', () => {
    let state = classicCourtyard();
    expect(abilityTargets(state, STILL).map(o => o.id)).toContain('crate-0');
    state = send(state, 'ability', STILL, { target: 'crate-0' });
    expect(get(state, 'crate-0').frozen).toBe(true);
    state.actors[STILL].x = 1100;
    expect(validateAction(state, 'local', { type: 'ability', actor: STILL, target: 'crate-0' }).valid).toBe(false);
  });
});
