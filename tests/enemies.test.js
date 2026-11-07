import { describe, test, expect } from 'bun:test';
import { setup, validateAction, applyAction, meta } from '../src/logic.js';
import { ENEMY, makeEnemy, enemyBox, isHazard, miteStage } from '../src/enemies.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }
const get = (state, id) => state.objects.find(o => o.id === id);
const ofKind = (state, kind) => state.objects.filter(o => o.kind === kind);

// A flat test courtyard: one floor at y=540, the given enemies, and actors parked far away.
function arena(enemies, actors = [{ x: 60 }, { x: 1220 }]) {
  const s = setup({ level: 1 });
  s.platforms = [{ x: 0, y: 540, w: 1280, h: 120 }];
  s.objects = enemies.map((e, i) => makeEnemy(e.kind, e, e.id ?? `${e.kind}-${i}`));
  s.nextEnemy = 100;
  actors.forEach((a, i) => Object.assign(s.actors[i], { y: 540, ...a, grounded: true, on: 'platform-0' }));
  return s;
}

describe('guards', () => {
  test('patrol back and forth without leaving their range', () => {
    let s = arena([{ kind: 'guard', id: 'g', x: 500, y: 540, minX: 450, maxX: 550 }]);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 300; i++) { s = step(s); min = Math.min(min, get(s, 'g').x); max = Math.max(max, get(s, 'g').x); }
    expect(min).toBeGreaterThanOrEqual(450); expect(max).toBeLessThanOrEqual(550);
    expect(max - min).toBeGreaterThan(80);
  });

  test('chase a spotted actor faster, but never walk off a ledge', () => {
    let s = arena([{ kind: 'guard', id: 'g', x: 600, y: 290, minX: 0, maxX: 1280 }], [{ x: 860, y: 290, on: 'platform-1' }, { x: 60 }]);
    s.platforms.push({ x: 560, y: 290, w: 120, h: 20 }, { x: 760, y: 290, w: 520, h: 20 });
    s = step(s, 20);
    expect(get(s, 'g').chasing).toBe(true);
    expect(get(s, 'g').x).toBeLessThanOrEqual(680 - ENEMY.guard.w / 2);
    s = step(s, 60);
    expect(get(s, 'g').x).toBeLessThanOrEqual(680 - ENEMY.guard.w / 2);
  });

  test('a frozen guard stops and can be stood on', () => {
    let s = arena([{ kind: 'guard', id: 'g', x: 500, y: 540, minX: 400, maxX: 600 }], [{ x: 380 }, { x: 60 }]);
    s = action(s, { type: 'ability', actor: 0, target: 'g' });
    const x = get(s, 'g').x;
    s = step(s, 60);
    expect(get(s, 'g').x).toBe(x);
    expect(isHazard(get(s, 'g'))).toBe(false);
    Object.assign(s.actors[0], { x, y: 540 - ENEMY.guard.h - 1, vy: 0, grounded: false, on: null });
    s = step(s, 3);
    expect(s.actors[0]).toMatchObject({ on: 'g', y: 540 - ENEMY.guard.h });
  });

  test('never ages on its own, and vanishes once Bloom has hastened it long enough', () => {
    let s = arena([{ kind: 'guard', id: 'g', x: 500, y: 540, minX: 400, maxX: 600 }], [{ x: 200 }, { x: 250 }]);
    s = step(s, ENEMY.guard.life + 10);
    expect(get(s, 'g').age).toBe(0);
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'g' });
    s = step(s, Math.ceil(ENEMY.guard.life / meta.time.maxSpeed) + 1);
    expect(get(s, 'g')).toBeUndefined();
  });
});

describe('lanterns', () => {
  test('chase an actor in range and drift home once it is far away', () => {
    let s = arena([{ kind: 'lantern', id: 'l', x: 600, y: 300 }], [{ x: 700 }, { x: 1220 }]);
    s = step(s, 60);
    expect(get(s, 'l').chasing).toBe(true);
    expect(get(s, 'l').x).toBeGreaterThan(620);
    s.actors[0].x = 60;
    s = step(s, 900);
    expect(get(s, 'l').chasing).toBe(false);
    expect(get(s, 'l').x).toBeCloseTo(600, 0);
  });

  test('a frozen lantern hangs in the air as a platform', () => {
    let s = arena([{ kind: 'lantern', id: 'l', x: 600, y: 300 }], [{ x: 450 }, { x: 1220 }]);
    s = action(s, { type: 'ability', actor: 0, target: 'l' });
    const top = enemyBox(get(s, 'l')).y;
    Object.assign(s.actors[0], { x: 600, y: top - 1, vy: 0, grounded: false, on: null });
    s = step(s, 30);
    expect(s.actors[0]).toMatchObject({ on: 'l', y: top });
  });
});

describe('launchers and projectiles', () => {
  const launcherAt = (extra = {}) => arena([{ kind: 'launcher', id: 'm', x: 1000, y: 540, dir: [-1, 0], every: 60, shot: 'dart', ...extra }], [{ x: 60, y: 540 }, { x: 1220 }]);

  test('fire on a fixed interval, stop when frozen, and fire faster when hastened', () => {
    let s = step(launcherAt(), 60 * 3);
    expect(ofKind(s, 'dart')).toHaveLength(3);
    s = launcherAt(); s.actors[0].x = 960;
    s = action(s, { type: 'ability', actor: 0, target: 'm' });
    s = step(s, 240);
    expect(ofKind(s, 'dart')).toHaveLength(0);
    s = launcherAt(); s.actors[1].x = 1100;
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'm' });
    s.actors[1].x = 1220;
    s = step(s, 60 * 3);
    expect(ofKind(s, 'dart').length).toBeGreaterThan(5);
  });

  test('darts fly straight, vanish against a wall, and hit actors back to their checkpoint', () => {
    let s = launcherAt();
    s.platforms.push({ x: 600, y: 400, w: 40, h: 200 });
    s = step(s, 61);
    const dart = ofKind(s, 'dart')[0];
    s = step(s, 20);
    expect(get(s, dart.id).y).toBe(dart.y);
    s = step(s, 80);
    expect(get(s, dart.id)).toBeUndefined();
    s = launcherAt();
    s.actors[0].x = 800;
    s = step(s, 120);
    expect(s.actors[0].x).toBe(s.actors[0].spawnX);
    expect(s.actors[0].invuln).toBeGreaterThan(0);
  });

  test('a frozen dart is a ledge, and flies on unchanged once released', () => {
    let s = launcherAt();
    s = step(s, 61);
    const id = ofKind(s, 'dart')[0].id;
    s.actors[0].x = get(s, id).x - 100;
    s = action(s, { type: 'ability', actor: 0, target: id });
    const frozen = { ...get(s, id) };
    expect(isHazard(get(s, id))).toBe(false);
    Object.assign(s.actors[0], { x: frozen.x, y: enemyBox(frozen).y - 1, vy: 0, grounded: false, on: null });
    s = step(s, 20);
    expect(s.actors[0].on).toBe(id);
    expect(s.flags.dartRide).toBe(true);
    s.actors[0].x = 60; s.actors[0].y = 540;
    s.actors[1].x = frozen.x + 100;
    s = action(s, { type: 'ability', actor: 1, target: id });
    s = step(s);
    expect(get(s, id).x).toBeLessThan(frozen.x);
    expect(get(s, id).dx).toBe(frozen.dx);
  });

  test('orbs steer toward the nearest actor and fade after six seconds', () => {
    let s = arena([{ kind: 'launcher', id: 'm', x: 1000, y: 300, dir: [-1, 0], every: 1000, shot: 'orb' }], [{ x: 800, y: 540 }, { x: 60 }]);
    s.objects[0].timer = 999;
    s = step(s);
    const orb = ofKind(s, 'orb')[0];
    s = step(s, 30);
    expect(get(s, orb.id).dy).toBeGreaterThan(0.3);
    s.actors[0].x = 60; s.actors[1].x = 60;
    s = step(s, ENEMY.orb.life);
    expect(get(s, orb.id)).toBeUndefined();
  });
});

describe('nests and mites', () => {
  const nestAt = () => arena([{ kind: 'nest', id: 'n', x: 700, y: 540, every: 60, max: 3 }], [{ x: 60 }, { x: 120 }]);

  test('nests spawn mites on an interval, up to a cap', () => {
    let s = step(nestAt(), 60 * 2);
    expect(ofKind(s, 'mite')).toHaveLength(2);
    s = step(s, 60 * 5);
    expect(ofKind(s, 'mite')).toHaveLength(3);
  });

  test('a mite is harmless young, dangerous adult, harmless old, and only ages once hastened', () => {
    let s = step(nestAt(), 60);
    const id = ofKind(s, 'mite')[0].id;
    s = step(s, 600);
    expect(get(s, id).age).toBe(0);
    expect(isHazard(get(s, id))).toBe(false);
    s.actors[1].x = get(s, id).x - 150;
    s = action(s, { type: 'ability', actor: 1, target: id });
    s.actors[1].x = 120;
    s = step(s, ENEMY.mite.life * 0.5);
    expect(miteStage(get(s, id))).toBe(1);
    expect(isHazard(get(s, id))).toBe(true);
    s = step(s, ENEMY.mite.life * 0.35);
    expect(miteStage(get(s, id))).toBe(2);
    expect(isHazard(get(s, id))).toBe(false);
    s = step(s, ENEMY.mite.life * 0.2);
    expect(get(s, id)).toBeUndefined();
    expect(s.flags.miteGone).toBe(true);
  });

  test('a frozen adult mite is a harmless block', () => {
    let s = step(nestAt(), 60);
    const mite = get(s, ofKind(s, 'mite')[0].id);
    mite.age = ENEMY.mite.life * 0.5; mite.speed = 1;
    s.actors[0].x = mite.x - 100;
    s = action(s, { type: 'ability', actor: 0, target: mite.id });
    expect(isHazard(get(s, mite.id))).toBe(false);
    s.actors[0].x = mite.x - 30;
    s = step(s, 5);
    expect(s.actors[0].x).toBe(mite.x - 30);
  });
});

describe('checkpoints and hits', () => {
  test('an actor touching a checkpoint lights it for both, and hits and falls return there', () => {
    let s = setup({ level: 4 });
    const cp = s.checkpoints[0];
    s.objects = [];
    Object.assign(s.actors[0], { x: cp.x, y: cp.y });
    s = step(s);
    expect(s.checkpoint).toBe(cp.id);
    expect(s.checkpoints[0].lit).toBe(true);
    s.objects.push(makeEnemy('guard', { x: 300, y: 520, minX: 250, maxX: 350 }, 'g'));
    Object.assign(s.actors[1], { x: 300, y: 520 });
    s = step(s);
    expect(s.actors[1]).toMatchObject({ x: cp.x + 18, y: cp.y });
    Object.assign(s.actors[0], { x: 680, y: 720 });
    s = step(s);
    expect(s.actors[0]).toMatchObject({ x: cp.x - 18, y: cp.y });
  });

  test('a hit drops what the actor was carrying and grants a moment of invulnerability', () => {
    let s = setup({ level: 0 });
    s.actors[0].x = 330;
    s = action(s, { type: 'grab', actor: 0 });
    s.objects.push(makeEnemy('guard', { x: 330, y: 520, minX: 300, maxX: 360 }, 'g'));
    s = step(s);
    expect(s.actors[0].carrying).toBe(null);
    expect(get(s, 'crate-0')).toMatchObject({ held: null, x: 330 });
    expect(s.actors[0].x).toBe(s.actors[0].spawnX);
    expect(s.actors[0].invuln).toBe(meta.time.invulnTicks);
    expect(s.actors[1].x).toBe(250);
    Object.assign(get(s, 'g'), { x: s.actors[0].x, minX: 0, maxX: 1280 });
    s = step(s, 10);
    expect(s.events.filter(e => e.kind === 'hit')).toHaveLength(1);
  });

  test('restart puts checkpoints out, rewind leaves them lit', () => {
    let s = setup({ level: 4 });
    const cp = s.checkpoints[0];
    s.objects = [];
    Object.assign(s.actors[0], { x: cp.x, y: cp.y });
    s = step(s, 30);
    s = action(s, { type: 'rewind' });
    expect(s.checkpoint).toBe(cp.id);
    s = action(s, { type: 'restart' });
    expect(s.checkpoint).toBe(null);
    expect(s.checkpoints.every(c => !c.lit)).toBe(true);
  });
});
