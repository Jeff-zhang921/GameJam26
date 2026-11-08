import { test, expect } from 'bun:test';
import { meta, setup } from '../src/logic.js';
import { guardTarget, updateEnemies, ENEMY } from '../src/enemies.js';
const guard = s => s.objects.find(o => o.kind === 'guard');
const update = s => {
  s.tick++;
  updateEnemies(s, { event() {}, nextId: () => 'test', walkSpeed: meta.controls.speed, tickRate: meta.tickRate });
};
const stand = (s, actor, platform, x) => Object.assign(s.actors[actor], { x, y: s.platforms[platform].y, grounded: true, on: `platform-${platform}` });

test('a nearer player on the starting ledge cannot distract the guard from a trench player', () => {
  const s = setup({ level: 1 });
  guard(s).x = 750;
  stand(s, 0, 0, 684); stand(s, 1, 3, 920);
  expect(guardTarget(s, guard(s))?.id).toBe(1);
  update(s);
  expect(guard(s)).toMatchObject({ target: 1, chasing: true, dir: 1, platformIndex: 3 });
});

test('same-height neighbouring platforms are separate for both chasing and movement', () => {
  const s = setup({ level: 1 }), g = guard(s);
  s.platforms = [{ x: 0, y: 580, w: 300, h: 60 }, { x: 300, y: 580, w: 300, h: 60 }];
  Object.assign(g, { x: 275, platformIndex: null, minX: 20, maxX: 580 });
  stand(s, 0, 1, 320); stand(s, 1, 0, 100);
  expect(guardTarget(s, g)?.id).toBe(1);
  update(s); expect(g.dir).toBe(-1);
  stand(s, 1, 1, 330);
  for (let i = 0; i < 400; i++) { update(s); expect(g.x + ENEMY.guard.w / 2).toBeLessThanOrEqual(300); }
  expect(g.target).toBeNull();
});

test('targets the nearest of two eligible players and releases one that leaves the platform', () => {
  const s = setup({ level: 1 }), g = guard(s);
  stand(s, 0, 3, 1050); stand(s, 1, 3, 1200);
  expect(guardTarget(s, g)?.id).toBe(0);
  s.actors[1].x = 1120;
  expect(guardTarget(s, g)?.id).toBe(1);
  stand(s, 1, 2, 1520);
  expect(guardTarget(s, g)?.id).toBe(0);
  stand(s, 0, 0, 684);
  expect(guardTarget(s, g)).toBeNull();
});

test('holds its target for three seconds even when another player is closer', () => {
  const s = setup({ level: 1 }), g = guard(s);
  stand(s, 0, 3, 1000); stand(s, 1, 3, 1250);
  update(s);
  expect(g.target).toBe(0);
  const acquiredAt = s.tick;
  for (let i = 1; i < 3 * meta.tickRate; i++) {
    g.x = 1100;
    // The locked player is airborne above the same platform, outside acquisition range.
    Object.assign(s.actors[0], { x: 820, y: 465, grounded: false, on: null });
    stand(s, 1, 3, 1120);
    update(s);
    expect(g.target).toBe(0);
  }
  update(s);
  expect(s.tick - acquiredAt).toBe(3 * meta.tickRate);
  expect(g.target).toBe(1);
});

test('releases a locked player as soon as they reach another platform', () => {
  const s = setup({ level: 1 }), g = guard(s);
  stand(s, 0, 3, 1000); stand(s, 1, 3, 1250);
  update(s);
  expect(g.target).toBe(0);
  stand(s, 0, 2, 1520);
  update(s);
  expect(g.target).toBe(1);
});

test('luring reaches the platform edge and stops there without overshoot, even when slowed', () => {
  for (const frozen of [false, true]) {
    const s = setup({ level: 1 }), g = guard(s), floor = s.platforms[3];
    g.frozen = frozen;
    stand(s, 0, 3, g.x + 180); stand(s, 1, 2, 1520);
    const edge = floor.x + floor.w - ENEMY.guard.w / 2;
    for (let i = 0; i < 1800; i++) {
      s.actors[0].x = Math.min(edge + 4, g.x + 180);
      update(s);
      expect(g.x).toBeGreaterThanOrEqual(floor.x + ENEMY.guard.w / 2);
      expect(g.x).toBeLessThanOrEqual(edge);
    }
    expect(g.x).toBe(edge);
    for (let i = 0; i < 60; i++) { update(s); expect(g.x).toBe(edge); }
    stand(s, 0, 2, 1520);
    const before = g.x;
    update(s);
    expect(g.target).toBeNull();
    expect(Math.abs(g.x - before)).toBeLessThanOrEqual(ENEMY.guard.patrol + 1e-9);
  }
});
