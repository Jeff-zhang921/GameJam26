import { describe, test, expect } from 'bun:test';
import { createCamera, createParticles, worldPoint } from '../public/presentation.js';

const state = () => ({ width: 1280, height: 640, active: 0, tick: 0, events: [], actors: [{ x: 180, y: 520, facing: 1 }, { x: 250, y: 520, facing: 1 }] });
const viewport = { width: 1280, height: 640, dt: 1 / 60, sceneKey: 0 };
const event = (id, kind = 'freeze', tick = 0) => ({ id, kind, tick, x: 400, y: 300 });

describe('camera', () => {
  test('normal play fills the viewport and pointer coordinates round trip', () => {
    for (const worldWidth of [1280, 1920, 2560]) for (const size of [{ width: 1280, height: 640 }, { width: 1194, height: 834 }, { width: 667, height: 375 }]) {
      const s = { ...state(), width: worldWidth }, camera = createCamera();
      const view = camera.update(s, { ...viewport, ...size });
      expect(view.scale * worldWidth).toBeGreaterThanOrEqual(size.width);
      expect(view.scale * 640).toBeGreaterThanOrEqual(size.height);
      const point = worldPoint(view, 500 * view.scale + view.offsetX, 300 * view.scale + view.offsetY);
      expect(point.x).toBeCloseTo(500); expect(point.y).toBeCloseTo(300);
    }
  });
  test('the partner cannot change the view, including touch and reduced motion', () => {
    for (const active of [0, 1]) for (const reduced of [false, true]) {
      const s = state(); s.active = active;
      const camera = createCamera(), view = { ...viewport, reduced, bottomInset: 150 };
      const initial = { ...camera.update(s, view) };
      for (const y of [-400, -120, 50, 400, 720]) {
        Object.assign(s.actors[1 - active], { x: 1250, y });
        expect(camera.update(s, { ...view, resetCamera: true })).toEqual(initial);
      }
    }
  });
  test('jumping moves the view without changing the scale or clipping the sprite', () => {
    for (const size of [{ width: 1280, height: 640 }, { width: 1024, height: 768 }, { width: 667, height: 375 }]) for (const reduced of [false, true]) {
      const s = state(), camera = createCamera(), view = { ...viewport, ...size, reduced, bottomInset: 130 };
      const initial = { ...camera.update(s, view) };
      let high;
      for (const y of [400, 180, 50, -120, -220, -120, 50, 180, 400, 520]) {
        s.actors[0].y = y;
        const cam = camera.update(s, view);
        expect(cam.scale).toBe(initial.scale);
        expect((y - 84) * cam.scale + cam.offsetY).toBeGreaterThanOrEqual(39.999);
        expect(y * cam.scale + cam.offsetY).toBeLessThanOrEqual(size.height - 19.999);
        if (y === -220) high = { ...cam };
      }
      expect(high.offsetY).toBeGreaterThan(initial.offsetY);
      expect(camera.update(s, { ...view, resetCamera: true })).toEqual(initial);
    }
  });
  test('pause freezes an elevated camera and a return reset follows its own traveller', () => {
    const s = state(), camera = createCamera(); s.actors[0].y = -180;
    const high = { ...camera.update(s, viewport) };
    expect(camera.update(s, { ...viewport, paused: true })).toEqual(high);
    Object.assign(s.actors[0], { x: 1200, y: 520 });
    const returned = camera.update(s, { ...viewport, resetCamera: true });
    expect(returned.scale).toBe(high.scale); expect(returned.x).toBeGreaterThan(high.x);
    expect(returned.y).toBeGreaterThan(high.y);
  });
  test('stays still within the deadzone', () => {
    const s = state(); Object.assign(s.actors[0], { x: 600, y: 420 });
    const camera = createCamera(), initial = { ...camera.update(s, viewport) };
    s.actors[0].x += 40; s.actors[0].y += 20;
    expect(camera.update(s, { ...viewport, dt: 1 })).toEqual(initial);
  });
  test('smoothing is independent of frame rate for a stationary target', () => {
    const s = state(); s.actors[0].x = 500;
    const a = createCamera(), b = createCamera(); a.update(s, viewport); b.update(s, viewport);
    s.actors[0].x = 1100;
    const one = { ...a.update(s, { ...viewport, dt: .1 }) };
    let many; for (let i = 0; i < 10; i++) many = b.update(s, { ...viewport, dt: .01 });
    expect(many.x).toBeCloseTo(one.x, 8); expect(many.y).toBeCloseTo(one.y, 8);
  });
  test('only viewport changes recalculate normal-play scale', () => {
    const s = state(), camera = createCamera(), before = { ...camera.update(s, viewport) };
    const resized = camera.update(s, { ...viewport, width: 1920, height: 1080 });
    expect(resized.scale).toBeGreaterThan(before.scale);
    expect(resized.scale * s.height).toBeGreaterThanOrEqual(1080);
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
