import { describe, test, expect } from 'bun:test';
import { createCamera, createParticles, worldPoint } from '../public/presentation.js';
import { setup, applyAction, meta } from '../src/logic.js';

const state = () => ({ width: 1280, height: 640, active: 0, tick: 0, events: [], actors: [{ x: 180, y: 520, facing: 1 }, { x: 250, y: 520, facing: 1 }] });
const viewport = { width: 1280, height: 640, dt: 1 / 60, sceneKey: 0 };
const event = (id, kind = 'freeze', tick = 0) => ({ id, kind, tick, x: 400, y: 300 });

describe('camera', () => {
  const sizes = [{ width: 1280, height: 640, bottomInset: 0 }, { width: 1194, height: 834, bottomInset: 300 }, { width: 667, height: 375, bottomInset: 165 }];
  const flat = () => {
    const s = setup(); s.width = 3840;
    s.objects = []; s.pits = []; s.checkpoints = [];
    s.platforms = [{ x: 0, y: 520, w: 3840, h: 120 }];
    Object.assign(s.actors[0], { x: 1200, y: 520, on: 'platform-0', grounded: true });
    return s;
  };
  const tick = s => applyAction(s, 'local', { type: 'tick' });
  test('uses the standard 1.0 scale, including tall displays, and pointer coordinates round trip', () => {
    for (const size of sizes) {
      const s = flat(), cam = createCamera().update(s, size);
      expect(cam.scale).toBe(Math.min(size.width / 1280, size.height / 640));
      const point = worldPoint(cam, 500 * cam.scale + cam.offsetX, 300 * cam.scale + cam.offsetY);
      expect(point.x).toBeCloseTo(500); expect(point.y).toBeCloseTo(300);
    }
  });
  test('the partner never changes the view', () => {
    for (const active of [0, 1]) for (const reduced of [false, true]) {
      const s = flat(); s.active = active;
      const camera = createCamera(), view = { ...viewport, reduced, bottomInset: 150 };
      const initial = { ...camera.update(s, view) };
      for (const y of [-400, -120, 50, 400, 720]) {
        Object.assign(s.actors[1 - active], { x: 3400, y });
        expect(camera.update(s, view)).toEqual(initial);
      }
    }
  });
  test('ordinary jumps keep the landing-height camera completely still', () => {
    for (const size of sizes) for (const reduced of [false, true]) {
      let s = flat(); const camera = createCamera(), view = { ...viewport, ...size, reduced };
      const initial = { ...camera.update(s, view) };
      s = applyAction(s, 'local', { type: 'jump', actor: 0 });
      let airborne = false;
      for (let i = 0; i < 90; i++) {
        s = tick(s); airborne ||= !s.actors[0].grounded;
        const cam = camera.update(s, view);
        expect(cam.y).toBe(initial.y); expect(cam.scale).toBe(initial.scale);
        expect((s.actors[0].y - 84) * cam.scale + cam.offsetY).toBeGreaterThanOrEqual(0);
        if (airborne && s.actors[0].grounded) break;
      }
      expect(airborne).toBe(true); expect(s.actors[0].grounded).toBe(true);
    }
  });
  test('a high jump on a short screen is anticipated, stays visible and returns smoothly', () => {
    let s = flat(); const view = { ...viewport, ...sizes[2], bottomInset: 195 }, camera = createCamera();
    const initial = { ...camera.update(s, view) }; let previous = initial, moved = false, maxStep = 0;
    Object.assign(s.actors[0], { grounded: false, on: null, vy: meta.controls.springJump, jumpHeld: true, jumpCut: false });
    for (let i = 0; i < 140; i++) {
      s = tick(s); const cam = { ...camera.update(s, view) };
      moved ||= cam.y < initial.y - .1;
      maxStep = Math.max(maxStep, Math.abs(cam.y - previous.y));
      expect(cam.scale).toBe(initial.scale);
      expect((s.actors[0].y - 84) * cam.scale + cam.offsetY).toBeGreaterThanOrEqual(0);
      expect(s.actors[0].y * cam.scale + cam.offsetY).toBeLessThanOrEqual(view.height);
      previous = cam;
    }
    expect(moved).toBe(true); expect(maxStep).toBeLessThan(8);
    expect(Math.abs(previous.y - initial.y)).toBeLessThan(2);
  });
  test('interpolated landing frames never replace the actual landing-height anchor', () => {
    const s = flat(), camera = createCamera(), followActor = { ...s.actors[0] };
    const view = { ...viewport, ...sizes[1], followActor }, initial = { ...camera.update(s, view) };
    // Rendering may still be several units above the ground after physics has already landed.
    for (const y of [507, 511, 517, 520]) {
      s.actors[0].y = y;
      expect(camera.update(s, view)).toEqual(initial);
    }
  });
  test('surface noise and facing changes do not shake the camera', () => {
    const s = flat(), camera = createCamera(), initial = { ...camera.update(s, viewport) };
    for (let i = 0; i < 80; i++) {
      Object.assign(s.actors[0], { y: 520 + Math.sin(i), facing: i % 2 ? -1 : 1 });
      expect(camera.update(s, viewport)).toEqual(initial);
    }
  });
  test('landing at a new height adjusts once through the vertical smoothing, without snapping back', () => {
    const s = flat(), camera = createCamera(), initial = { ...camera.update(s, viewport) };
    s.actors[0].y = 300;
    let previous = initial.y;
    for (let i = 0; i < 180; i++) {
      const cam = camera.update(s, viewport);
      expect(cam.y).toBeLessThanOrEqual(previous); expect(Math.abs(cam.y - previous)).toBeLessThan(10);
      previous = cam.y;
    }
    expect(previous).toBeCloseTo(200, 0);
  });
  test('pause freezes an elevated view and a reset follows the returned traveller', () => {
    const s = flat(), camera = createCamera(); s.actors[0].y = -180;
    const high = { ...camera.update(s, viewport) };
    expect(camera.update(s, { ...viewport, paused: true })).toEqual(high);
    Object.assign(s.actors[0], { x: 3000, y: 520 });
    const returned = camera.update(s, { ...viewport, resetCamera: true });
    expect(returned.scale).toBe(high.scale); expect(returned.x).toBeGreaterThan(high.x); expect(returned.y).toBeGreaterThan(high.y);
  });
  test('horizontal tracking has a 140-world-unit deadzone and frame-independent smoothing', () => {
    const s = flat(), camera = createCamera(), initial = { ...camera.update(s, viewport) };
    s.actors[0].x += 130; expect(camera.update(s, viewport).x).toBe(initial.x);
    const a = createCamera(), b = createCamera(); a.update(s, viewport); b.update(s, viewport);
    s.actors[0].x += 500;
    const one = { ...a.update(s, { ...viewport, dt: .1 }) };
    let many; for (let i = 0; i < 10; i++) many = b.update(s, { ...viewport, dt: .01 });
    expect(many.x).toBeCloseTo(one.x, 8); expect(many.y).toBeCloseTo(one.y, 8);
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
