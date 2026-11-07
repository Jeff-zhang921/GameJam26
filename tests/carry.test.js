import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, heldPosition, interactionFor } from '../src/logic.js';
import { attachCarried } from '../public/network.js';

const send = (state, type, actor = 0, extra = {}) => {
  const action = { type, actor, ...extra };
  expect(validateAction(state, 'local', action).valid).toBe(true);
  return applyAction(state, 'local', action);
};
const tick = (state, count = 1) => { for (let i = 0; i < count; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; };
const crate = state => state.objects.find(o => o.id === 'crate-0');
const onCarrier = (state, actor = 0) => {
  const o = crate(state), at = heldPosition(o, state.actors[actor]);
  return o.held === actor && o.x === at.x && o.y === at.y;
};
// Level 0: ground platform y=520 from x=0 to 435, crate resting at (350, 493).
function carrying() {
  let state = setup({ level: 0 });
  state.actors[0].x = 300;
  return send(state, 'grab');
}

describe('carried box follows its carrier', () => {
  test('pickup attaches the box immediately, without waiting a tick', () => {
    const state = carrying();
    expect(state.actors[0].carrying).toBe('crate-0');
    expect(onCarrier(state)).toBe(true);
  });

  test('after every tick the box sits exactly on the carrier: walking, turning, jumping and falling', () => {
    let state = send(carrying(), 'move', 0, { dir: 1 });
    const checks = [];
    for (let i = 0; i < 20; i++) { state = tick(state); checks.push(onCarrier(state)); }
    expect(crate(state).x).toBeGreaterThan(state.actors[0].x);
    state = send(state, 'move', 0, { dir: -1 });
    for (let i = 0; i < 10; i++) { state = tick(state); checks.push(onCarrier(state)); }
    expect(crate(state).x).toBeLessThan(state.actors[0].x);
    state = send(state, 'jump');
    let rose = false, fell = false, landed = false;
    for (let i = 0; i < 80; i++) {
      state = tick(state); checks.push(onCarrier(state));
      if (state.actors[0].vy < 0) rose = true;
      if (rose && state.actors[0].vy > 0) fell = true;
      if (fell && state.actors[0].grounded) landed = true;
    }
    expect([rose, fell, landed]).toEqual([true, true, true]);
    expect(checks.every(Boolean)).toBe(true);
  });

  test('the carried box never pushes or lifts its carrier', () => {
    // Same walk with the crate removed from the world entirely.
    let free = setup({ level: 0 });
    free.objects = free.objects.filter(o => o.id !== 'crate-0'); free.actors[0].x = 300;
    let held = carrying();
    free = send(free, 'move', 0, { dir: 1 }); held = send(held, 'move', 0, { dir: 1 });
    free = tick(free, 15); held = tick(held, 15);
    expect(held.actors[0].x).toBe(free.actors[0].x);
    expect(held.actors[0].y).toBe(free.actors[0].y);
    expect(held.actors[0].grounded).toBe(true);
  });

  test('throwing restores physics, and pickup / throw work repeatedly', () => {
    let state = carrying();
    state = send(state, 'move', 0, { dir: -1 }); state = tick(state); state = send(state, 'move', 0, { dir: 0 });
    for (let round = 0; round < 3; round++) {
      state = send(state, 'grab');
      expect(crate(state).held).toBe(null);
      expect(crate(state).vx).toBeLessThan(0);
      state = tick(state, 120);
      expect(crate(state)).toMatchObject({ held: null, vy: 0, y: 493 });
      Object.assign(state.actors[0], { x: crate(state).x + 40, y: 520, vx: 0, vy: 0, grounded: true, on: 'platform-0' });
      state = send(state, 'grab');
      expect(onCarrier(state)).toBe(true);
    }
  });
});

describe('contextual interaction label', () => {
  test('pick up only when something is in reach, throw while holding a crate', () => {
    let state = setup({ level: 0 });
    expect(interactionFor(state, 0)).toEqual({ kind: 'pickup', available: false });
    state.actors[0].x = 300;
    expect(interactionFor(state, 0)).toEqual({ kind: 'pickup', available: true });
    expect(interactionFor(send(state, 'grab'), 0)).toEqual({ kind: 'throw', available: true });
  });

  test('a carried seed offers Plant beside an empty pit and Drop elsewhere', () => {
    let state = setup({ level: 1 });
    state.actors[1].x = 380;
    state = send(state, 'grab', 1);
    state.actors[1].x = 450;
    expect(interactionFor(state, 1).kind).toBe('drop');
    state.actors[1].x = 600;
    expect(interactionFor(state, 1).kind).toBe('plant');
  });
});

describe('online rendering of carried boxes', () => {
  const view = () => {
    const state = setup({ level: 0, players: ['a', 'b'] });
    Object.assign(state.actors[1], { x: 500, facing: -1 });
    return state;
  };

  test('a box carried by the partner is drawn on the partner as rendered, not at its stale snapshot position', () => {
    const game = view();
    Object.assign(crate(game), { held: 1, x: 100, y: 100 });
    game.actors[1].carrying = 'crate-0';
    const before = JSON.stringify(game);
    const rendered = attachCarried({ ...game });
    expect(crate(rendered)).toMatchObject({ held: 1, ...heldPosition(crate(game), game.actors[1]) });
    expect(JSON.stringify(game)).toBe(before);
  });

  test('this client sees its own pickup immediately and its own throw before the server confirms', () => {
    const server = view();
    server.actors[0].x = 300;
    const predicted = applyAction(server, 'a', { type: 'grab', actor: 0 });
    const pickedUp = attachCarried({ ...server, actors: server.actors.map(a => ({ ...a })) }, predicted, 0);
    expect(crate(pickedUp)).toMatchObject({ held: 0, ...heldPosition(crate(server), server.actors[0]) });
    expect(pickedUp.actors[0].carrying).toBe('crate-0');

    const thrown = applyAction(predicted, 'a', { type: 'grab', actor: 0 });
    const flying = attachCarried({ ...predicted, actors: predicted.actors.map(a => ({ ...a })) }, thrown, 0);
    expect(crate(flying)).toMatchObject({ held: null, x: crate(thrown).x, y: crate(thrown).y });
    expect(flying.actors[0].carrying).toBe(null);
  });

  test('the server stays authoritative for the partner: a local prediction cannot steal their box', () => {
    const server = view();
    Object.assign(crate(server), { held: 1 }); server.actors[1].carrying = 'crate-0';
    const predicted = JSON.parse(JSON.stringify(server));
    Object.assign(crate(predicted), { held: 0 }); predicted.actors[0].carrying = 'crate-0';
    const rendered = attachCarried({ ...server, actors: server.actors.map(a => ({ ...a })) }, predicted, 0);
    expect(crate(rendered).held).toBe(1);
  });
});
