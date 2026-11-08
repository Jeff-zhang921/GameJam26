import { describe, test, expect } from 'bun:test';
import { createCamera, createParticles, worldPoint } from '../public/presentation.js';

const state = () => ({ width: 1280, height: 640, active: 0, tick: 0, events: [], actors: [{ x: 180, y: 520, facing: 1 }, { x: 250, y: 520, facing: 1 }] });
const viewport = { width: 1280, height: 640, dt: 1 / 60, sceneKey: 0 };
const event = (id, kind = 'freeze', tick = 0) => ({ id, kind, tick, x: 400, y: 300 });

describe('camera', () => {
  test('keeps the view inside map bounds and transforms points both ways', () => {
    const s = state(), camera = createCamera();
    for (const x of [22, 640, 1258]) {
      s.actors[0].x = x;
      const view = camera.update(s, { ...viewport, resetCamera: true });
      expect(view.scale).toBeCloseTo(1.2);
      expect(view.offsetX).toBeLessThanOrEqual(0);
      expect(view.offsetX + 1280 * view.scale).toBeGreaterThanOrEqual(viewport.width);
      const point = worldPoint(view, x * view.scale + view.offsetX, 300 * view.scale + view.offsetY);
      expect(point.x).toBeCloseTo(x); expect(point.y).toBeCloseTo(300);
    }
  });
  test('centers the world on an axis wider than the map', () => {
    const view = createCamera().update(state(), { ...viewport, width: 2000, height: 640 });
    expect(view.x).toBe(640);
    expect(view.offsetX).toBeCloseTo((2000 - 1280 * view.scale) / 2);
  });
  test('stays still within the deadzone', () => {
    const s = state(); s.actors[0].x = 600; s.actors[0].y = 420;
    const camera = createCamera(), initial = { ...camera.update(s, viewport) };
    s.actors[0].x += 40; s.actors[0].y += 20;
    const view = camera.update(s, { ...viewport, dt: 1 });
    expect(view.x).toBe(initial.x); expect(view.y).toBe(initial.y);
  });
  test('smoothing is independent of frame rate for a stationary target', () => {
    const s = state(); s.actors[0].x = 500;
    const a = createCamera(), b = createCamera(); a.update(s, viewport); b.update(s, viewport);
    s.actors[0].x = 1100;
    const one = { ...a.update(s, { ...viewport, dt: .1 }) };
    let many; for (let i = 0; i < 10; i++) many = b.update(s, { ...viewport, dt: .01 });
    expect(many.x).toBeCloseTo(one.x, 8); expect(many.y).toBeCloseTo(one.y, 8);
  });
  test('fits both partners and widens immediately when they separate', () => {
    const s = state(), camera = createCamera(); camera.update(s, { ...viewport, mode: 'coop' });
    s.actors[0].x = 22; s.actors[1].x = 1258;
    const view = camera.update(s, { ...viewport, mode: 'coop' });
    expect(view.scale).toBe(1);
    for (const actor of s.actors) {
      expect(actor.x * view.scale + view.offsetX).toBeGreaterThanOrEqual(0);
      expect(actor.x * view.scale + view.offsetX).toBeLessThanOrEqual(viewport.width);
    }
  });
  test('pause freezes tracking and a reset snaps to a returned actor', () => {
    const s = state(), camera = createCamera(), old = { ...camera.update(s, viewport) };
    s.actors[0].x = 1200;
    const paused = camera.update(s, { ...viewport, dt: 1, paused: true });
    expect(paused.x).toBe(old.x);
    const reset = camera.update(s, { ...viewport, resetCamera: true });
    expect(reset.x).toBeGreaterThan(old.x);
  });
  test('a wider courtyard scrolls at the usual zoom instead of shrinking, leaving no bands above or below', () => {
    for (const width of [1920, 2560]) for (const view of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }]) {
      const s = { ...state(), width }, camera = createCamera().update(s, { ...viewport, ...view });
      const normal = createCamera().update(state(), { ...viewport, ...view });
      expect(camera.scale).toBeCloseTo(normal.scale, 6);
      expect(640 * camera.scale).toBeGreaterThanOrEqual(view.height - 1e-6);
    }
  });

  test('taller screens (16:10, iPad 4:3) fill the frame with the world instead of showing bands', () => {
    for (const view of [{ width: 1440, height: 900 }, { width: 1194, height: 834 }, { width: 1024, height: 768 }, { width: 1280, height: 720, mode: 'coop' }]) {
      const cam = createCamera().update(state(), { ...viewport, ...view });
      expect(cam.offsetY).toBeLessThanOrEqual(1e-6);
      expect(cam.offsetY + 640 * cam.scale).toBeGreaterThanOrEqual(view.height - 1e-6);
      expect(cam.offsetX).toBeLessThanOrEqual(1e-6);
      expect(cam.offsetX + 1280 * cam.scale).toBeGreaterThanOrEqual(view.width - 1e-6);
    }
  });

  test('reduced motion always shows the whole level without tracking', () => {
    const s = state(), camera = createCamera();
    const initial = { ...camera.update(s, { ...viewport, reduced: true }) };
    s.actors[0].x = 1200;
    expect(camera.update(s, { ...viewport, reduced: true })).toEqual(initial);
    expect(initial).toMatchObject({ scale: 1, x: 640, y: 320, offsetX: 0, offsetY: 0 });
  });
});

describe('particles', () => {
  test('emits new events once without changing simulation state', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    s.events.push(event(1)); const source = JSON.stringify(s);
    pool.update(s, viewport); expect(pool.count).toBe(44);
    pool.update(s, viewport); expect(pool.count).toBe(44);
    expect(JSON.stringify(s)).toBe(source);
  });
  test('keeps a fixed pool, replacing the oldest bursts when full', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    const slots = pool.particles.slice();
    for (let i = 1; i <= 100; i++) { s.events = [event(i, 'win')]; pool.update(s, { ...viewport, dt: 0 }); }
    expect(pool.count).toBe(256); expect(pool.particles).toHaveLength(256);
    expect(pool.particles.every((p, i) => p === slots[i])).toBe(true);
    expect(pool.particles.filter(p => p.kind === 'ambient')).toHaveLength(24);
  });
  test('pause neither advances nor emits and unpausing has no catch-up delta', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    s.events = [event(1)]; pool.update(s, viewport);
    const before = JSON.stringify(pool.particles); s.events.push(event(2));
    pool.update(s, { ...viewport, dt: 100, paused: true });
    expect(JSON.stringify(pool.particles)).toBe(before);
    pool.update(s, viewport); expect(pool.count).toBe(64);
  });
  test('scene changes discard old effects without replaying old events', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    s.events = [event(1)]; pool.update(s, viewport); expect(pool.count).toBe(44);
    pool.update(s, { ...viewport, sceneKey: 1 }); expect(pool.count).toBe(24);
    pool.update(s, { ...viewport, sceneKey: 1 }); expect(pool.count).toBe(24);
  });
  test('reduced motion clears particles and never queues a later explosion', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    s.events = [event(1)]; pool.update(s, { ...viewport, reduced: true }); expect(pool.count).toBe(0);
    pool.update(s, viewport); expect(pool.count).toBe(24);
  });
  test('event particles expire and are not replayed by retained events', () => {
    const s = state(), pool = createParticles(); pool.update(s, viewport);
    s.events = [event(1)]; pool.update(s, viewport);
    pool.update(s, { ...viewport, dt: 2 }); expect(pool.count).toBe(24);
    pool.update(s, viewport); expect(pool.count).toBe(24);
  });
});
