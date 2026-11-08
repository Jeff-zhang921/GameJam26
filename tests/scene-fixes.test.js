import { describe, test, expect } from 'bun:test';
import { setup, applyAction, throwPath, heldPosition, meta, viewFor, validateAction, seedActionFor } from '../src/logic.js';
import { bridgeBands } from '../public/bridge-layout.js';
import { GROUNDS } from '../public/themes.js';
import { arrivalFrame, arrivalPortal, GATE_ZOOM } from '../public/portal.js';

const tick = s => applyAction(s, 'local', { type: 'tick' });
const box = s => s.objects.find(o => o.id === 'crate-0');
function flat() {
  const s = setup();
  s.platforms = [{ x: 0, y: 520, w: 1920, h: 120 }]; s.pits = []; s.pickups = [];
  s.objects = s.objects.filter(o => o.id === 'crate-0');
  Object.assign(s.actors[0], { x: 400, y: 520, carrying: 'crate-0' });
  Object.assign(s.actors[1], { x: 1200, y: 520 }); box(s).held = 0;
  return s;
}
function slow(s, duration = 600, radius = 130) {
  s.freezeAreas = [{ id: 'test-area', x: 480, y: 480, radius, ticksLeft: duration, duration }];
  return s;
}

describe('slowed crate flight', () => {
  test('a pre-existing traveller overlap cannot erase horizontal flight momentum', () => {
    let s = slow(flat()); s.actors[1].x = 420;
    s = applyAction(s, 'local', { type: 'grab', actor: 0 });
    s = tick(s);
    expect(box(s).vx).toBe(meta.throw.default.vx);
    expect(box(s).x).toBeCloseTo(448 + meta.throw.default.vx * meta.freeze.rate);
    for (let i = 0; i < 10; i++) s = tick(s);
    const before = { ...box(s) };
    Object.assign(s.actors[1], { x: before.x + 5, y: before.y + 32, vy: -2, grounded: false, move: -1 });
    s = tick(s);
    expect(box(s).vx).toBe(before.vx);
    expect(box(s).x).toBeGreaterThan(before.x);
  });
  test('entering, leaving or expiring an area changes displacement, never stored air velocity', () => {
    for (const duration of [5, 600]) {
      let s = slow(flat(), duration, 65);
      s = applyAction(s, 'local', { type: 'grab', actor: 0 });
      let sawFrozen = false, sawThaw = false;
      for (let i = 0; i < 110; i++) {
        s = tick(s); const o = box(s);
        sawThaw ||= sawFrozen && !o.frozen; sawFrozen ||= o.frozen;
        if (o.y + 27 >= 520 - 1e-6) break;
        expect(o.vx).toBe(meta.throw.default.vx);
      }
      expect(sawFrozen).toBe(true); expect(sawThaw).toBe(true);
    }
  });
  test('real walls still stop a crate, and landing keeps its existing friction', () => {
    for (const frozen of [false, true]) {
      let s = flat(); if (frozen) slow(s);
      s.platforms.push({ x: 520, y: 300, w: 20, h: 220 });
      s = applyAction(s, 'local', { type: 'grab', actor: 0, aim: { vx: 11, vy: 0 } });
      for (let i = 0; i < 60 && box(s).vx; i++) s = tick(s);
      expect(box(s).vx).toBe(0); expect(box(s).x).toBe(493);
    }
    let blocked = flat(); blocked.platforms.push({ x: 440, y: 300, w: 240, h: 220 });
    blocked = applyAction(blocked, 'local', { type: 'grab', actor: 0 });
    blocked = tick(blocked); expect(box(blocked).vx).toBe(0); expect(box(blocked).x).toBe(413);
    let s = flat();
    s = applyAction(s, 'local', { type: 'grab', actor: 0, aim: { vx: 8, vy: 3 } });
    while (box(s).y + 27 < 520) s = tick(s);
    expect(box(s).vx).toBeCloseTo(8 * .88); expect(box(s).vy).toBe(0);
  });
  test('the upstream crate-side collision stays solid inside a Freeze Area', () => {
    let s = slow(flat());
    Object.assign(s.actors[0], { x: 50, carrying: null });
    Object.assign(box(s), { x: 400, y: 493, vx: 0, vy: 0, held: null });
    s.objects.push({ ...box(s), id: 'crate-1', x: 320, vx: 8, spawnX: 320 });
    for (let i = 0; i < 120; i++) s = tick(s);
    const moving = s.objects.find(o => o.id === 'crate-1');
    expect(box(s).x).toBe(400); expect(moving.x).toBeCloseTo(346); expect(moving.vx).toBe(0);
  });
  test('the preview and authoritative frozen flight share every position until first contact', () => {
    let s = slow(flat()); const aim = { vx: 8, vy: -4 }, path = throwPath(s, 0, aim);
    s = applyAction(s, 'local', { type: 'grab', actor: 0, aim });
    for (const p of path.slice(1)) {
      s = tick(s); expect(box(s).x).toBeCloseTo(p.x, 8); expect(box(s).y).toBeCloseTo(p.y, 8);
    }
  });
});

describe('world-anchored bridge shafts', () => {
  test('moving the camera changes only the invisible tail of a floor-reaching bridge', () => {
    const g = GROUNDS.bridge.surface, p = { x: 830, y: 470, w: 830, h: 190 };
    const near = bridgeBands(p, g, 640, 720), far = bridgeBands(p, g, 640, 1000);
    expect(far.slice(0, near.length)).toEqual(near);
    for (const bottom of [620, 640, 641, 680, 720, 900, 1000, 680]) {
      const rows = bridgeBands(p, g, 640, bottom);
      expect(rows[0]).toEqual(near[0]);
      for (let i = 1; i < Math.min(rows.length, near.length); i++) expect(rows[i]).toEqual(near[i]);
      expect(rows.at(-1).y + rows.at(-1).sh * g.scale).toBeGreaterThan(bottom);
    }
  });
  test('an elevated finite bridge keeps its decorative base at the same world position', () => {
    const p = { x: 0, y: 300, w: 390, h: 180 }, g = GROUNDS.bridge.surface;
    expect(bridgeBands(p, g, 640, 700)).toEqual(bridgeBands(p, g, 640, 1000));
    expect(bridgeBands(p, g, 640, 700).at(-1).sy).toBe(g.legs[1]);
  });
});

describe('moon gate arrivals and starting seed', () => {
  test('both travellers emerge from one gate, with Bloom delayed and a continuous handoff', () => {
    const s = setup({ level: 2 }), original = structuredClone(s.actors), gate = arrivalPortal(0, s.actors);
    expect(gate.x).toBe(Math.min(...s.actors.map(p => p.x)) - 100);
    let previous = arrivalFrame(0, s.actors, 0, false, 'portal');
    expect(previous.every(p => p.alpha === 0 && p.x === gate.x)).toBe(true);
    expect(arrivalFrame(.1, s.actors, 0, false, 'portal')[0].alpha).toBeGreaterThan(0);
    expect(arrivalFrame(.1, s.actors, 0, false, 'portal')[1].alpha).toBe(0);
    for (let i = 1; i <= 100; i++) {
      const next = arrivalFrame(i / 100, s.actors, 0, false, 'portal');
      next.forEach((p, j) => { expect(p.x).toBeGreaterThanOrEqual(previous[j].x); expect(p.y).toBe(original[j].y); });
      previous = next;
    }
    expect(previous.map(p => [p.x, p.y, p.alpha, p.move])).toEqual(original.map(p => [p.x, p.y, 1, 0]));
    expect(arrivalFrame(0, s.actors, 0, true, 'portal', true).every(p => p.alpha === 0)).toBe(true);
    expect(arrivalFrame(0, s.actors, 0, true, 'portal').map(p => p.x)).toEqual(original.map(p => p.x));
    expect(arrivalPortal(1, s.actors).alpha).toBe(0); expect(GATE_ZOOM).toBe(1.15);
    expect(s.actors).toEqual(original);
  });
  test('courtyard three begins with one held seed and two in stock, without a start event', () => {
    let s = setup({ level: 2 });
    for (let i = 0; i < 3; i++) {
      const held = s.objects.find(o => o.id === s.actors[1].carrying);
      expect(s.seeds).toBe(2); expect(s.started).toBe(false); expect(s.elapsed).toBe(0); expect(s.events).toEqual([]);
      expect(held).toMatchObject({ kind: 'seed', held: 1, fromHand: true, ...heldPosition(held, s.actors[1]) });
      expect(s.objects.filter(o => o.held === 1).length).toBe(1);
      const reconnect = viewFor(s, 'local'); expect(reconnect.objects).toEqual(s.objects); expect(reconnect.seeds).toBe(2);
      s = applyAction(s, 'local', { type: 'restart' });
    }
    for (const level of [0, 1, 3, 4]) expect(setup({ level }).actors[1].carrying).toBeNull();
  });
  test('the opening hand seed works with upstream plant and cancel actions without duplication', () => {
    let s = setup({ level: 2 }), first = s.actors[1].carrying;
    s = applyAction(s, 'local', { type: 'stowSeed', actor: 1 });
    expect(s.seeds).toBe(3); expect(s.actors[1].carrying).toBeNull();
    expect(s.objects.some(o => o.id === first)).toBe(false);
    expect(validateAction(s, 'local', { type: 'stowSeed', actor: 1 }).valid).toBe(false);
    s = applyAction(s, 'local', { type: 'takeSeed', actor: 1 });
    const held = s.actors[1].carrying;
    Object.assign(s.actors[1], { x: 600, y: 520 });
    expect(seedActionFor(s, 1)).toBe('plant');
    s = applyAction(s, 'local', { type: 'plant', actor: 1 });
    expect(s.seeds).toBe(2); expect(s.actors[1].carrying).toBeNull();
    expect(s.objects.some(o => o.id === held)).toBe(false);
    expect(s.pits.find(p => p.x === 600).plant).not.toBeNull();
  });
  test('losing the opening hand seed refunds it once and the next seed has a fresh identity', () => {
    let s = setup({ level: 2 }), first = s.actors[1].carrying;
    s = applyAction(s, 'local', { type: 'grab', actor: 1 });
    Object.assign(s.objects.find(o => o.id === first), { x: 5, y: 100 });
    s = tick(s); expect(s.seeds).toBe(3); expect(s.objects.some(o => o.id === first)).toBe(false);
    s = tick(s); expect(s.seeds).toBe(3);
    s = applyAction(s, 'local', { type: 'takeSeed', actor: 1 });
    expect(s.seeds).toBe(2); expect(s.actors[1].carrying).not.toBe(first);
  });
});
