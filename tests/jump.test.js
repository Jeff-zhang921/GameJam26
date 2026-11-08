import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, atExit } from '../src/logic.js';
import { classicCourtyard, rootriseArena, withtimeArena } from './arena.js';

const send = (state, type, actor = 0, extra = {}) => applyAction(state, 'local', { type, actor, ...extra });
const step = (state, count = 1) => { for (let i = 0; i < count; i++) state = send(state, 'tick'); return state; };

function flat(spring = false) {
  const state = rootriseArena();
  state.actors[0].x = 200;
  if (spring) {
    state.objects.push({ id: 'plant-test', kind: 'plant', pit: 'pit-0', x: 200, base: 540, age: 123, height: 30, withered: false, speed: 0, frozen: true });
    state.actors[0].y = 510;
    state.actors[0].on = 'plant-test';
  }
  return state;
}

function flight(state, releaseAfter = null) {
  const origin = { x: state.actors[0].x, y: state.actors[0].y };
  let top = origin.y, ticks = 0;
  state = send(state, 'move', 0, { dir: 1 });
  state = send(state, 'jump');
  do {
    if (ticks === releaseAfter) state = send(state, 'jumpRelease');
    state = step(state);
    ticks++;
    top = Math.min(top, state.actors[0].y);
  } while (state.actors[0].y < origin.y && ticks < 100);
  return { state, rise: origin.y - top, range: state.actors[0].x - origin.x, ticks };
}

describe('jump feel', () => {
  test('full ground and sprout jumps keep their original apex and at least their original range', () => {
    const ordinary = flight(flat());
    expect(ordinary.rise).toBeCloseTo(156.52, 2);
    expect(ordinary.range).toBeGreaterThanOrEqual(218.4);
    expect(ordinary.ticks).toBeLessThan(52);
    const spring = flight(flat(true));
    expect(spring.rise).toBeCloseTo(236.22, 2);
    expect(spring.range).toBeGreaterThanOrEqual(264.6);
    expect(spring.ticks).toBeLessThan(63);
    expect(spring.state.flags.sproutJump).toBe(true);
  });

  test('a tap produces a lower, shorter jump without changing a held jump', () => {
    const held = flight(flat());
    const tap = flight(flat(), 1);
    expect(tap.rise).toBeGreaterThan(30);
    expect(tap.rise).toBeLessThan(held.rise / 2);
    expect(tap.range).toBeLessThan(held.range);
  });

  test('repeated release never cuts the same jump twice', () => {
    let state = step(send(flat(), 'jump'), 2);
    const before = state.actors[0].vy;
    state = step(send(state, 'jumpRelease'));
    expect(state.actors[0].vy).toBeCloseTo(before * meta.controls.jumpCut + meta.controls.gravity, 5);
    const cut = state.actors[0].vy;
    state = step(send(send(state, 'jump'), 'jumpRelease'));
    expect(state.actors[0].vy).toBeCloseTo(cut + meta.controls.gravity, 5);
  });

  test('a held jump does not queue an automatic jump on landing', () => {
    let state = step(send(flat(), 'jump'), 55);
    const jumps = state.events.filter(e => e.kind === 'jump').length;
    state = step(send(state, 'jump'), 60);
    expect(state.actors[0].grounded).toBe(true);
    expect(state.events.filter(e => e.kind === 'jump')).toHaveLength(jumps);
    state = step(send(send(state, 'jumpRelease'), 'jump'));
    expect(state.actors[0].grounded).toBe(false);
  });

  test('coyote time accepts the seventh airborne tick but not the eighth', () => {
    let state = classicCourtyard();
    state.objects = [];
    state.actors[0].x = 449;
    state = step(send(state, 'move', 0, { dir: 1 }));
    expect(state.actors[0].grounded).toBe(false);
    state = send(state, 'move', 0, { dir: 0 });
    const last = step(state, 6);
    expect(step(send(last, 'jump')).actors[0].vy).toBeLessThan(0);
    const expired = step(state, 7);
    expect(step(send(expired, 'jump')).actors[0].vy).toBeGreaterThan(0);
  });

  test('a buffered press lands and jumps on tick seven, but expires before tick eight', () => {
    for (const [distance, accepted] of [[22.4, true], [28.8, false]]) {
      const state = flat();
      Object.assign(state.actors[0], { y: 540 - distance, grounded: false, on: null, coyote: 0 });
      const landed = step(send(state, 'jump'), accepted ? 7 : 8);
      expect(landed.events.some(e => e.kind === 'jump')).toBe(accepted);
      expect(landed.actors[0].vy < 0).toBe(accepted);
    }
  });

  test('releasing a buffered jump before landing still produces a short hop', () => {
    const state = flat();
    Object.assign(state.actors[0], { y: 530, grounded: false, on: null, coyote: 0 });
    let landed = step(send(send(state, 'jump'), 'jumpRelease'), 5);
    expect(landed.events.some(e => e.kind === 'jump')).toBe(true);
    landed = step(landed);
    expect(landed.actors[0].vy).toBeGreaterThan(-6);
    expect(landed.actors[0].vy).toBeLessThan(0);
  });

  test('jump releases are actor-scoped and cannot be sent by a different player', () => {
    let state = send(send(flat(), 'jump', 0), 'jump', 1);
    state = step(send(state, 'jumpRelease', 0));
    expect(state.actors[0].vy).toBeGreaterThan(state.actors[1].vy);
    const room = classicCourtyard({ players: ['one', 'two'] });
    expect(validateAction(room, 'one', { type: 'jumpRelease', actor: 1 }).valid).toBe(false);
    expect(validateAction(room, 'two', { type: 'jumpRelease', actor: 1 }).valid).toBe(true);
  });

  test('landing feedback occurs once per landing and carries actor and impact data', () => {
    let state = step(send(flat(), 'jump'), 60);
    const lands = state.events.filter(e => e.kind === 'land' && e.actor === 0);
    expect(lands).toHaveLength(1);
    expect(lands[0].strength).toBeGreaterThan(0);
    expect(lands[0].strength).toBeLessThanOrEqual(1);
    state = step(state, 60);
    expect(state.events.filter(e => e.kind === 'land' && e.actor === 0)).toHaveLength(1);
  });

  test('fall speed is bounded and respawn feedback identifies the actor', () => {
    const state = flat();
    state.platforms = [];
    Object.assign(state.actors[0], { y: 550, grounded: false, vy: 80 });
    let falling = step(state);
    expect(falling.actors[0].vy).toBe(meta.controls.maxFall);
    falling = step(falling, 10);
    expect(falling.events.some(e => e.kind === 'return' && e.actor === 0)).toBe(true);
  });

  test('pause and switch clear queued input without cutting the ongoing arc', () => {
    for (const type of ['pause', 'switch']) {
      let state = step(send(flat(), 'jump'), 3);
      const before = state.actors[0].vy;
      state = send(state, type);
      expect(state.actors[0].jumpHeld).toBe(false);
      expect(state.actors[0].jumpBuffer).toBe(0);
      if (type === 'pause') state = send(state, 'pause');
      state = step(state);
      expect(state.actors[0].vy).toBeCloseTo(before + meta.controls.gravity, 5);
    }
  });
});

describe('courtyard jump routes', () => {
  function until(state, predicate, limit = 90) {
    for (let i = 0; i < limit && !predicate(state); i++) state = step(state);
    expect(predicate(state)).toBe(true);
    return state;
  }

  test('the broken bridge remains crossable using a thrown and frozen crate', () => {
    let state = send(classicCourtyard(), 'move', 0, { dir: 1 });
    state = step(state, 40);
    state = send(state, 'grab');
    state = step(state, 20);
    state = send(state, 'move', 0, { dir: 0 });
    state = step(send(state, 'grab'), 16);
    state = send(state, 'ability', 0, { target: 'crate-0' });
    state = send(send(state, 'move', 0, { dir: 1 }), 'jump');
    state = until(state, s => s.actors[0].on === 'crate-0');
    expect(state.flags.frozenTouched).toBe(true);
    state = send(send(state, 'jumpRelease'), 'jump');
    state = until(state, s => s.actors[0].on === 'platform-1');
    state = until(state, s => atExit(s, s.actors[0]), 120);
    expect(state.status).toBe('playing');
    Object.assign(state.actors[1], { x: state.exit.x, y: state.exit.y });
    state = until(state, s => s.status === 'won', 5);
  });

  function treeCheckpoint(level, x, height, ledge = 0) {
    const state = setup({ level });
    state.objects = state.objects.filter(o => o.kind !== 'plant');
    state.objects.push({ id: 'route-tree', kind: 'plant', pit: 'pit-0', x, base: state.platforms[ledge].y, age: height / meta.plant.maxHeight * meta.plant.growTicks, height, frozen: true, withered: false, speed: 1 });
    Object.assign(state.actors[0], { x, y: state.platforms[ledge].y - height, on: 'route-tree' });
    return state;
  }

  test('a mature tree on the middle ledge provides the jump to the second courtyard\'s gate ledge', () => {
    let state = treeCheckpoint(1, 1840, meta.plant.maxHeight, 2);
    state = send(send(state, 'move', 0, { dir: 1 }), 'jump');
    state = until(state, s => s.actors[0].on === 'platform-1');
    expect(state.actors[0].y).toBe(180);
  });

  test('a young sprout still launches onto the third courtyard cliff', () => {
    let state = treeCheckpoint(2, 880, 30);
    state = send(send(state, 'move', 0, { dir: 1 }), 'jump');
    state = until(state, s => s.actors[0].on === 'platform-1');
    expect(state.flags.sproutJump).toBe(true);
    expect(state.actors[0].y).toBe(265);
  });

  test('the last courtyard tree still reaches its moving platform', () => {
    let state = treeCheckpoint(3, 400, meta.plant.maxHeight);
    state = send(send(state, 'move', 0, { dir: 1 }), 'jump');
    state = until(state, s => s.actors[0].on === 'mover-0');
    expect(state.actors[0].y).toBe(290);
  });

  test('the last courtyard moving platform still reaches a frozen crate and the exit ledge', () => {
    let state = withtimeArena();
    Object.assign(state.objects.find(o => o.kind === 'mover'), { x: 640, frozen: true });
    Object.assign(state.actors[0], { x: 740, y: 290, on: 'mover-0', carrying: 'crate-0' });
    Object.assign(state.objects.find(o => o.kind === 'crate'), { held: 0, x: 777, y: 237 });
    state = step(send(state, 'grab'), 16);
    state = send(state, 'ability', 0, { target: 'crate-0' });
    state = send(send(state, 'move', 0, { dir: 1 }), 'jump');
    state = until(state, s => s.actors[0].on === 'crate-0');
    state = send(send(state, 'jumpRelease'), 'jump');
    state = until(state, s => s.actors[0].on === 'platform-1');
    expect(state.actors[0].y).toBe(300);
  });
});
