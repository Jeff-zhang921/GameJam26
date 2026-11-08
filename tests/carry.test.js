import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, heldPosition, interactionFor, seedActionFor, aimedThrowVelocity, throwPath, meta } from '../src/logic.js';
import { classicCourtyard, rootriseArena } from './arena.js';
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
  let state = classicCourtyard();
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
    let free = classicCourtyard();
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
    let state = classicCourtyard();
    expect(interactionFor(state, 0)).toEqual({ kind: 'pickup', available: false });
    state.actors[0].x = 300;
    expect(interactionFor(state, 0)).toEqual({ kind: 'pickup', available: true });
    expect(interactionFor(send(state, 'grab'), 0)).toEqual({ kind: 'throw', available: true, item: 'crate' });
  });

  test('the interact key never plants; Bloom\'s seed button plants beside an empty pit and takes a seed elsewhere', () => {
    let state = rootriseArena();
    state.actors[1].x = 450;
    expect(interactionFor(state, 1)).toEqual({ kind: 'pickup', available: false });
    expect(seedActionFor(state, 1)).toBe('take');
    state.actors[1].x = 600;
    expect(interactionFor(state, 1)).toEqual({ kind: 'pickup', available: false });
    expect(seedActionFor(state, 1)).toBe('plant');
    state.seeds = 0;
    expect(seedActionFor(state, 1)).toBe(null);
    state.seeds = 1; state.actors[0].x = 600;
    expect(seedActionFor(state, 0)).toBe(null); // only Bloom has seeds
    state.actors[1].x = 450;
    state = send(state, 'takeSeed', 1);
    expect(seedActionFor(state, 1)).toBe('throw');
    // With a seed in hand beside the pit, the button plants that very seed (the count is untouched).
    state.actors[1].x = 600;
    expect(seedActionFor(state, 1)).toBe('plant');
    state = send(state, 'plant', 1);
    expect(state).toMatchObject({ seeds: 0 });
    expect(state.actors[1].carrying).toBe(null);
    expect(state.objects.filter(o => o.kind === 'seed' && o.held === 1)).toHaveLength(0);
    expect(state.pits[0].plant).toMatch(/^plant-/);
  });
});

describe('online rendering of carried boxes', () => {
  const view = () => {
    const state = classicCourtyard({ players: ['a', 'b'] });
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

  test('a seed just taken in hand shows up held before the snapshot has it', () => {
    const server = classicCourtyard(); server.seeds = 1;
    const predicted = send(server, 'takeSeed', 1);
    const rendered = attachCarried({ ...server, actors: server.actors.map(a => ({ ...a })), objects: [...server.objects] }, predicted, 1);
    const id = predicted.actors[1].carrying, seed = rendered.objects.find(o => o.id === id);
    expect(seed).toMatchObject({ held: 1, ...heldPosition(seed, rendered.actors[1]) });
    expect(rendered.actors[1].carrying).toBe(id);
    expect(server.objects.some(o => o.id === id)).toBe(false);
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

describe('a loose crate is solid to the travellers', () => {
  // A crate in the air at (x, y) with velocity (vx, vy); Still at stillX, Bloom out of the way.
  function flying(x, y, vx, vy, stillX) {
    const state = setup({ level: 0 });
    Object.assign(crate(state), { x, y, vx, vy });
    state.actors[0].x = stillX; state.actors[1].x = 60;
    return state;
  }

  test('a crate flying sideways stops against a traveller instead of passing through', () => {
    let state = send(flying(330, 470, -5, -2, 200), 'move', 0, { dir: 1 });
    state = tick(state, 40);
    expect(crate(state).x - 27).toBeGreaterThanOrEqual(state.actors[0].x + 15 - 0.01);
  });

  test('jumping up into a falling crate bumps your head, and the crate comes to rest on it', () => {
    let state = send(flying(200, 300, 0, 1, 200), 'jump');
    let top = 520;
    for (let i = 0; i < 60; i++) { state = tick(state); top = Math.min(top, state.actors[0].y); expect(crate(state).y + 27).toBeLessThanOrEqual(state.actors[0].y - 52 + 0.01); }
    expect(top).toBeGreaterThan(300 + 27 + 52);
    state = tick(state, 60);
    expect(crate(state).y + 27).toBeCloseTo(state.actors[0].y - 52, 5);
  });
});

describe('aimed throws', () => {
  test('full power is accepted at every sampled angle, with proportional power below the rim', () => {
    const state = carrying(), fullPowerDistance = 360;
    const rejected = [];
    for (let sample = 0; sample < 3600; sample++) {
      const angle = sample * Math.PI / 1800;
      const aim = aimedThrowVelocity(400 * Math.cos(angle), 400 * Math.sin(angle), fullPowerDistance);
      if (!validateAction(state, 'local', { type: 'grab', actor: 0, aim }).valid) rejected.push(sample / 10);
    }
    expect(rejected).toEqual([]);
    const full = aimedThrowVelocity(-360, -360, fullPowerDistance);
    expect(full.vx).toBeCloseTo(-meta.throw.maxSpeed / Math.sqrt(2), 10);
    expect(full.vy).toBeCloseTo(full.vx, 10);
    expect(aimedThrowVelocity(-90, 0, fullPowerDistance)).toEqual({ vx: -meta.throw.maxSpeed / 4, vy: 0 });
  });

  test('without an aim the crate goes the default way; with one it leaves along the aim and the thrower turns to face it', () => {
    let state = send(carrying(), 'grab');
    expect(crate(state)).toMatchObject({ held: null, vx: meta.throw.default.vx, vy: meta.throw.default.vy });
    state = send(carrying(), 'grab', 0, { aim: { vx: -4, vy: -9 } });
    expect(crate(state)).toMatchObject({ held: null, vx: -4, vy: -9, x: state.actors[0].x - meta.throw.offset.x });
    expect(state.actors[0].facing).toBe(-1);
  });

  test('the server refuses an aim that is too strong, malformed, or with nothing to throw', () => {
    const state = carrying();
    for (const aim of [{ vx: 9, vy: -9 }, { vx: NaN, vy: 1 }, { vx: '3', vy: 1 }, null, 4]) expect(validateAction(state, 'local', { type: 'grab', actor: 0, aim }).valid).toBe(false);
    const empty = classicCourtyard();
    expect(validateAction(empty, 'local', { type: 'grab', actor: 0, aim: { vx: 3, vy: -3 } }).valid).toBe(false);
  });

  test('the dashed preview is the real flight, tick for tick, until the crate lands', () => {
    const aim = { vx: -3, vy: -7 }, held = carrying(); // lands back on the starting ledge
    held.actors[1].x = 60; // out of the crate's way
    const path = throwPath(held, 0, aim);
    let state = send(held, 'grab', 0, { aim });
    expect(path[0]).toEqual({ x: crate(state).x, y: crate(state).y });
    for (let i = 1; i < path.length; i++) {
      state = tick(state);
      expect(crate(state).x).toBeCloseTo(path[i].x, 6);
      expect(crate(state).y).toBeCloseTo(path[i].y, 6);
    }
    expect(crate(state).vy).toBe(0); // it has landed where the preview ends
  });
});

describe('crates against crates', () => {
  const crate = (id, x, y, vx = 0, vy = 0) => ({ kind: 'crate', id, x, y, vx, vy, frozen: false, held: null, spawnX: x, spawnY: y });
  const run = (state, n) => { for (let i = 0; i < n; i++) state = applyAction(state, 'a', { type: 'tick' }); return state; };
  const arena = crates => {
    const state = classicCourtyard({ players: ['a'] });
    state.actors.forEach((p, i) => Object.assign(p, { x: 40 + i * 20 }));
    state.objects = crates;
    return state;
  };

  test('a crate sliding into another stops against its side instead of passing through', () => {
    let state = arena([crate('crate-0', 300, 493), crate('crate-1', 220, 493, 8)]);
    state = run(state, 60);
    const [still, moved] = state.objects;
    expect(still.x).toBe(300);
    expect(moved.x).toBeCloseTo(300 - 54, 5);
    expect(moved.y).toBe(493);
  });

  test('a crate thrown low at another stops against it and drops beside it', () => {
    let state = arena([crate('crate-0', 300, 493), crate('crate-1', 150, 470, 10, 0)]);
    state = run(state, 90);
    const moved = state.objects.find(o => o.id === 'crate-1');
    expect(moved.x).toBeLessThanOrEqual(300 - 54 + 1e-6);
    expect(moved.y).toBe(493);
  });

  test('a crate dropped onto another still stacks on top', () => {
    let state = arena([crate('crate-0', 300, 493), crate('crate-1', 300, 380)]);
    state = run(state, 60);
    expect(state.objects.find(o => o.id === 'crate-1')).toMatchObject({ x: 300, y: 493 - 54 });
  });
});
