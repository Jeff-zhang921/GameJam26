import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, exitStatus, failureReason, assessFailure, freezeAreaAt, freezePoint } from '../src/logic.js';
import { createCamera } from '../public/presentation.js';

const act = (state, action) => applyAction(state, 'local', action);
const send = (state, type, actor = 0, extra = {}) => {
  const action = { type, actor, ...extra };
  expect(validateAction(state, 'local', action).valid).toBe(true);
  return act(state, action);
};
const tick = (state, count = 1) => { for (let i = 0; i < count; i++) state = act(state, { type: 'tick' }); return state; };
const get = (state, id) => state.objects.find(o => o.id === id);
const STILL = 0, BLOOM = 1;

describe('both timekeepers must reach the moon gate', () => {
  const ready = () => { const s = setup({ level: 0 }); s.flags.frozenTouched = true; return s; };

  test('one at the open gate waits for the other; both together complete the courtyard', () => {
    let s = ready();
    Object.assign(s.actors[STILL], { x: s.exit.x, y: s.exit.y, on: 'platform-1' });
    s = tick(s, 3);
    expect(s.status).toBe('playing');
    expect(exitStatus(s)).toMatchObject({ open: true, at: [true, false], waiting: BLOOM });
    Object.assign(s.actors[BLOOM], { x: s.exit.x - 25, y: s.exit.y, on: 'platform-1' });
    s = tick(s);
    expect(s.status).toBe('won');
  });

  test('the checklist is only a suggestion: both at the gate complete it, and nobody is left waiting', () => {
    let s = setup({ level: 0 });
    expect(exitStatus(s).waiting).toBe(null);
    for (const p of s.actors) Object.assign(p, { x: s.exit.x, y: s.exit.y, on: 'platform-1' });
    s = tick(s);
    expect(s.status).toBe('won');
  });
});

describe('characters and loose crates part cleanly', () => {
  test('riding a falling crate: you fall together, cannot jump off mid-air, and are not dragged when it resets', () => {
    let s = setup({ level: 0 });
    Object.assign(get(s, 'crate-0'), { x: 480, y: 493, vx: 0, vy: 0 });
    Object.assign(s.actors[STILL], { x: 480, y: 466, on: 'crate-0', grounded: true });
    s = tick(s, 4);
    expect(s.actors[STILL].grounded).toBe(false);
    s = tick(s, meta.controls.coyote + 2); // past the coyote grace period for having just left solid ground
    expect(s.actors[STILL].y).toBeGreaterThan(466);
    const seq = s.eventSeq;
    s = act(s, { type: 'jump', actor: STILL }); s = tick(s, 2);
    expect(s.events.some(e => e.id > seq && e.kind === 'jump')).toBe(false);
    let lowest = 0, reset = false;
    for (let i = 0; i < 60; i++) {
      const before = s.actors[STILL].y;
      s = tick(s);
      if (get(s, 'crate-0').y === 493 && get(s, 'crate-0').x !== 480) reset = true;
      if (reset && s.actors[STILL].y < before && !s.events.some(e => e.kind === 'return' && e.actor === STILL && e.tick === s.tick)) lowest = -1; // dragged upward
    }
    expect(reset).toBe(true);
    expect(lowest).toBe(0);
  });

  test('a crate inside a Freeze Area is solid ground to stand and jump on, even while drifting', () => {
    let s = setup({ level: 0 });
    Object.assign(get(s, 'crate-0'), { x: 560, y: 420, vy: 2 });
    Object.assign(s.actors[STILL], { x: 560, y: 393, on: 'crate-0', grounded: true });
    s.freezeAreas.push({ id: 'test', x: 560, y: 420, radius: 130, ticksLeft: 1e6, duration: 1e6 });
    s = tick(s, 2);
    expect(s.actors[STILL]).toMatchObject({ grounded: true, on: 'crate-0' });
    s = send(s, 'jump'); s = tick(s, 2);
    expect(s.actors[STILL].vy).toBeLessThan(0);
  });

  test('a returning crate never appears inside someone standing at its spawn', () => {
    let s = setup({ level: 0 });
    Object.assign(s.actors[BLOOM], { x: 350, y: 520 });
    Object.assign(get(s, 'crate-0'), { x: 600, y: 700, vy: 5 });
    for (let i = 0; i < 10 && !s.events.some(e => e.kind === 'return' && e.actor === undefined); i++) s = tick(s);
    const crate = get(s, 'crate-0'), p = s.actors[BLOOM];
    expect(Math.abs(crate.x - p.x)).toBeGreaterThanOrEqual(27 + 15);
    expect(crate.x - 27).toBeGreaterThanOrEqual(0);
    expect(crate.x + 27).toBeLessThanOrEqual(435); // still on the same ledge
    s = tick(s, 30);
    expect(get(s, 'crate-0').y).toBe(493);
  });

  test('carrying is unchanged: a carried crate stays with its carrier through a fall and respawn', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300; s = send(s, 'grab');
    s = send(s, 'move', STILL, { dir: 1 });
    for (let i = 0; i < 90 && !s.events.some(e => e.kind === 'return' && e.actor === STILL); i++) s = tick(s);
    expect(s.actors[STILL].carrying).toBe('crate-0');
    expect(get(s, 'crate-0').held).toBe(STILL);
  });
});

describe('Freeze Areas', () => {
  test('a cast at a chosen point slows every object it touches, never a traveller, and costs one charge', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300;
    expect(s.freezeCharges).toBe(2);
    s = send(s, 'ability', STILL, { x: 330, y: 480 });
    expect(s.freezeCharges).toBe(1);
    expect(s.freezeAreas).toHaveLength(1);
    expect(s.freezeAreas[0]).toMatchObject({ x: 330, y: 480, radius: meta.freeze.radius });
    expect(get(s, 'crate-0').frozen).toBe(true);
    // Both travellers inside the area still walk at full speed.
    const x0 = s.actors[STILL].x, x1 = s.actors[BLOOM].x;
    s = send(s, 'move', STILL, { dir: -1 }); s = send(s, 'move', BLOOM, { dir: -1 }); // away from the crate
    s = tick(s, 5);
    expect(x0 - s.actors[STILL].x).toBeCloseTo(5 * meta.controls.speed, 6);
    expect(x1 - s.actors[BLOOM].x).toBeCloseTo(5 * meta.controls.speed, 6);
  });

  test('objects slow on entering an area and recover on leaving it', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300; s = send(s, 'grab'); s.actors[STILL].x = 418; s = send(s, 'grab'); // throw
    const c0 = get(s, 'crate-0');
    s = send(s, 'ability', STILL, { x: c0.x + 165, y: c0.y });
    expect(get(s, 'crate-0').frozen).toBe(false);
    let x = get(s, 'crate-0').x;
    s = tick(s); // still outside: full speed, and it is now touching the area
    expect(get(s, 'crate-0').x - x).toBeCloseTo(6.8, 6);
    s = tick(s); x = get(s, 'crate-0').x; s = tick(s);
    expect(get(s, 'crate-0').frozen).toBe(true);
    expect(get(s, 'crate-0').x - x).toBeCloseTo(6.8 * meta.freeze.rate, 6);
    s.freezeAreas[0].x += 500; // the crate is no longer inside
    x = get(s, 'crate-0').x; s = tick(s);
    expect(get(s, 'crate-0').frozen).toBe(false);
    expect(get(s, 'crate-0').x - x).toBeCloseTo(6.8, 6);
  });

  test('an area fades after its duration and leaves nothing slowed behind', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300;
    s = send(s, 'ability', STILL, { x: 350, y: 480 });
    s = tick(s, meta.freeze.duration - 1);
    expect(s.freezeAreas).toHaveLength(1);
    s = tick(s);
    expect(s.freezeAreas).toHaveLength(0);
    expect(get(s, 'crate-0').frozen).toBe(false);
    expect(s.events.some(e => e.kind === 'thaw')).toBe(true);
  });

  test('cancelling a selected area preserves other coverage and never changes charges', () => {
    let s = setup({ level: 0 });
    const first = { x: 290, y: 493 };
    s = send(s, 'ability', STILL, first);
    const [older] = s.freezeAreas;
    // A stale point cast cannot consume another charge while the first area is active.
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL, ...first }).error).toBe('freezeCovered');
    expect(act(s, { type: 'ability', actor: STILL, area: 'missing', x: 80, y: 430 })).toBe(s);
    s = send(s, 'ability', STILL, { x: 435, y: 493 });
    const selected = freezeAreaAt(s, { x: 360, y: 493 });
    expect(selected.id).toBe(s.freezeAreas[1].id);
    expect(s.freezeCharges).toBe(0);
    s = send(s, 'ability', STILL, { area: selected.id });
    expect(s.freezeAreas.map(a => a.id)).toEqual([older.id]);
    expect(get(s, 'crate-0').frozen).toBe(true);
    expect(s.freezeCharges).toBe(0);
    expect(act(s, { type: 'ability', actor: STILL, area: selected.id, ...first })).toBe(s);
    expect(validateAction(s, 'local', { type: 'ability', actor: BLOOM, area: older.id }).error).toBe('role');
    s.freezeAreas[0].owner = 'someone-else';
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL, area: older.id }).error).toBe('freezeArea');
    s.freezeAreas[0].owner = 'local';
    s.actors[STILL].x = 900;
    s = send(s, 'ability', STILL, { area: older.id });
    expect(s.freezeAreas).toHaveLength(0);
    expect(s.freezeCharges).toBe(0);
    expect(get(s, 'crate-0').frozen).toBe(false);
  });

  test('refused casts (no charges, too far, off the world) cost nothing', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300;
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL, x: 300 + meta.freeze.range + 50, y: 490 }).error).toBe('freezeRange');
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL, x: 300, y: -40 }).error).toBe('freezeRange');
    expect(act(s, { type: 'ability', actor: STILL, x: 1200, y: 100 }).freezeCharges).toBe(2);
    s.freezeCharges = 0;
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL, x: 320, y: 480 }).error).toBe('noCharges');
  });

  test('a cast without an aimed point has no centre and is refused', () => {
    const s = setup({ level: 0 });
    s.actors[STILL].x = 300;
    expect(freezePoint(s)).toBe(null);
    expect(freezePoint(s, { target: 'crate-0' })).toEqual({ x: 350, y: 493 }); // a named object is an aim too
    expect(validateAction(s, 'local', { type: 'ability', actor: STILL }).error).toBe('aim');
  });

  test('Bloom keeps its acceleration and can hasten things inside an area', () => {
    let s = setup({ level: 3 });
    Object.assign(s.actors[BLOOM], { x: 505 });
    Object.assign(s.actors[STILL], { x: 480 });
    s = send(s, 'ability', STILL, { x: 600, y: 300 });
    expect(get(s, 'mover-0').frozen).toBe(true);
    s = send(s, 'ability', BLOOM, { target: 'mover-0' });
    s = send(s, 'ability', BLOOM, { target: 'mover-0' });
    expect(get(s, 'mover-0').speed).toBe(2);
    const x = get(s, 'mover-0').x; s = tick(s);
    expect(get(s, 'mover-0').x - x).toBeCloseTo(2 * meta.time.moverSpeed * meta.freeze.rate, 6);
  });
});

describe('role-specific resources', () => {
  test('only the matching role collects each crystal once, and restart restores both budgets', () => {
    let s = setup({ level: 0 });
    const [frost, bolt] = s.pickups;
    const touch = (actor, c) => Object.assign(s.actors[actor], { x: c.x, y: c.y + 26, grounded: false, vy: 0 });
    touch(STILL, bolt); touch(BLOOM, frost);
    s = tick(s);
    expect(s.pickups.every(c => !c.taken)).toBe(true);
    touch(STILL, frost); touch(BLOOM, bolt);
    s = tick(s, 6);
    expect(s.pickups.every(c => c.taken)).toBe(true);
    expect(s).toMatchObject({ freezeCharges: 3, bloomCharges: 4 });
    const again = send(s, 'restart');
    expect(again).toMatchObject({ freezeCharges: 2, bloomCharges: 3 });
    expect(again.pickups.every(c => !c.taken)).toBe(true);
    const other = send(s, 'level', 0, { level: 4 });
    expect(other).toMatchObject({ freezeCharges: 2, bloomCharges: 3 });
    expect(other.pickups.filter(c => c.kind === 'frost')).toHaveLength(2);
  });

  test('each courtyard starts with one seed in Bloom\'s count (hands free) and three Hasten charges', () => {
    for (let level = 0; level < 5; level++) {
      const s = setup({ level });
      expect(s.actors[BLOOM].carrying).toBe(null);
      expect(s.seeds).toBe(1);
      expect(s.bloomCharges).toBe(3);
      expect(s.pickups.some(c => c.kind === 'bolt')).toBe(true);
    }
  });

  test('only a successful cast spends Hasten and an empty budget keeps the target unchanged', () => {
    let s = setup({ level: 3 });
    s.actors[BLOOM].x = 510;
    expect(act(s, { type: 'ability', actor: BLOOM, target: 'missing' })).toBe(s);
    s = send(s, 'ability', BLOOM, { target: 'mover-0' });
    expect(s.bloomCharges).toBe(2);
    s.bloomCharges = 0;
    const cast = { type: 'ability', actor: BLOOM, target: 'mover-0' };
    expect(validateAction(s, 'local', cast).error).toBe('noBloomCharges');
    expect(act(s, cast)).toBe(s);
    expect(get(s, 'mover-0').speed).toBe(1);
  });
});

describe('possible dead ends raise a warning; the game goes on', () => {
  test('a ledge only a mushroom reaches: warns once the last mushroom and seed are gone, without stopping play', () => {
    let s = setup({ level: 1 });
    s.objects = s.objects.filter(o => o.kind !== 'seed'); s.seeds = 0;
    Object.assign(s.actors[STILL], { x: s.exit.x, y: s.exit.y, on: 'platform-1' });
    s = tick(s);
    expect(s).toMatchObject({ status: 'playing', failure: 'stranded', failureSeq: 1 });
    expect(validateAction(s, 'local', { type: 'move', actor: BLOOM, dir: 1 }).valid).toBe(true);
    s = tick(s, 30);
    expect(s.failureSeq).toBe(1); // the same reason never re-warns
    s.objects.push({ kind: 'seed', id: 'seed-9', x: 90, y: 530, vx: 0, vy: 0, frozen: false, held: null, spawnX: 90, spawnY: 530 });
    s = tick(s);
    expect(s.failure).toBe(null); // recovered: a seed lying in the courtyard can still be collected
    s.objects = s.objects.filter(o => o.kind !== 'seed');
    s = tick(s);
    expect(s).toMatchObject({ failure: 'stranded', failureSeq: 2 }); // a new warning
    s.seeds = 1; s = tick(s);
    expect(s.failure).toBe(null); // a seed in Bloom's count is hope too
  });

  test('nothing is judged while someone is in the air (they may be landing on the ledge)', () => {
    let s = setup({ level: 1 });
    s.objects = s.objects.filter(o => o.kind !== 'seed');
    Object.assign(s.actors[STILL], { x: s.exit.x, y: s.exit.y, on: 'platform-1' });
    Object.assign(s.actors[BLOOM], { x: 700, y: 300, vy: -2, grounded: false, on: null });
    expect(assessFailure(s).known).toBe(false);
  });

  test('a crossing that needs Freeze warns only when charges, crystals and active areas are all gone', () => {
    const lost = () => {
      const s = setup({ level: 0 });
      s.freezeCharges = 0; s.pickups.forEach(c => { c.taken = true; });
      Object.assign(s.actors[STILL], { x: 1100, y: 430, on: 'platform-1' });
      return s;
    };
    expect(failureReason(lost())).toBe('freeze');
    const crystal = lost(); crystal.pickups[0].taken = false;
    expect(failureReason(crystal)).toBe(null);
    const bolt = lost(); bolt.pickups.find(c => c.kind === 'bolt').taken = false;
    expect(failureReason(bolt)).toBe('freeze');
    const charge = lost(); charge.freezeCharges = 1;
    expect(failureReason(charge)).toBe(null);
    const area = lost(); area.freezeAreas.push({ id: 'a', x: 600, y: 400, radius: 130, ticksLeft: 100, duration: 600 });
    expect(failureReason(area)).toBe(null);
    const across = lost(); Object.assign(across.actors[BLOOM], { x: 1000, y: 430, on: 'platform-1' });
    expect(failureReason(across)).toBe(null);
  });

  test('no Freeze charges is not a dead end where the exit does not need Freeze', () => {
    for (const level of [1, 2, 4]) {
      const s = setup({ level });
      s.freezeCharges = 0; s.pickups.forEach(c => { c.taken = true; });
      expect(tick(s, 3)).toMatchObject({ status: 'playing', failure: null });
    }
  });

  test('a wilting ancient mushroom still counts as hope until it is gone', () => {
    const s = setup({ level: 2 });
    s.objects = s.objects.filter(o => o.kind !== 'seed'); s.seeds = 0;
    Object.assign(s.actors[STILL], { x: s.exit.x, y: s.exit.y, on: 'platform-1' });
    expect(failureReason(s)).toBe(null);
    s.objects = s.objects.filter(o => o.kind !== 'plant');
    expect(failureReason(s)).toBe('stranded');
  });
});

describe('touch layout camera', () => {
  const view = { width: 1180, height: 820, dt: 0, mode: 'coop', reduced: true };

  test('without touch controls the world stays centred', () => {
    const s = setup({ level: 0 });
    const cam = createCamera().update(s, view);
    const below = view.height - (cam.offsetY + s.height * cam.scale);
    expect(Math.round(below)).toBe(Math.round(cam.offsetY));
  });

  test('with touch controls the band under the world shrinks, and the ground stays above the controls', () => {
    const s = setup({ level: 0 });
    const reserve = 190;
    const cam = createCamera().update(s, { ...view, bottomInset: reserve });
    const below = view.height - (cam.offsetY + s.height * cam.scale);
    const centred = (view.height - s.height * cam.scale) / 2;
    expect(below).toBeLessThan(centred);
    expect(below).toBeGreaterThanOrEqual(0);
    const ground = cam.offsetY + 520 * cam.scale;
    expect(ground).toBeLessThanOrEqual(view.height - reserve);
  });
});
