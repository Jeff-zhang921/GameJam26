import { describe, test, expect } from 'bun:test';
import { setup, applyAction } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { rootriseArena } from './arena.js';
import { makeEnemy } from '../src/enemies.js';

const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const mover = s => s.objects.find(o => o.kind === 'mover');
// Load level 1 with these movers in place of its own (restored afterwards).
function withMovers(movers, run) {
  const original = LEVELS[1].movers;
  LEVELS[1].movers = movers;
  try { return run(setup({ level: 1 })); } finally { LEVELS[1].movers = original; }
}

describe('movers', () => {
  test('a level mover can start running from its far end', () => {
    withMovers([{ x1: 300, x2: 500, y: 400, w: 100, speed: 1, dir: -1 }], s => {
      expect(mover(s)).toMatchObject({ x: 500, dir: -1, speed: 1 });
      expect(mover(tick(s, 10)).x).toBeCloseTo(490, 6);
    });
  });
  test('without speed a mover sleeps where it starts', () => {
    withMovers([{ x1: 300, x2: 500, y: 400, w: 100 }], s => {
      expect(mover(s)).toMatchObject({ x: 300, dir: 1, speed: 0 });
      expect(mover(tick(s, 10)).x).toBe(300);
    });
  });
  test('a vertical mover runs between y1 and y2 and turns at each end', () => {
    withMovers([{ axis: 'y', x: 300, w: 100, y1: 300, y2: 400, speed: 1, dir: -1 }], s => {
      expect(mover(s)).toMatchObject({ axis: 'y', x: 300, y: 400, y1: 300, y2: 400 });
      s = tick(s, 50); expect(mover(s).y).toBeCloseTo(350, 6);
      s = tick(s, 60); expect(mover(s)).toMatchObject({ dir: 1 }); expect(mover(s).y).toBeCloseTo(310, 6);
      expect(mover(s).x).toBe(300);
    });
  });
  test('a vertical mover carries its rider up and down', () => {
    let s = rootriseArena();
    s.objects.push({ kind: 'mover', id: 'mover-x', axis: 'y', x: 300, y: 450, w: 120, y1: 400, y2: 450, dir: -1, speed: 1, frozen: false });
    Object.assign(s.actors[1], { x: 360, y: 450, vx: 0, vy: 0, grounded: true, on: 'mover-x' });
    s = tick(s, 30);
    expect(s.actors[1]).toMatchObject({ grounded: true, on: 'mover-x' }); expect(s.actors[1].y).toBeCloseTo(420, 0);
    s = tick(s, 50); // up to 400, then 30 back down
    expect(s.actors[1]).toMatchObject({ grounded: true, on: 'mover-x' }); expect(s.actors[1].y).toBeCloseTo(430, 0);
  });
});

describe('wide levels', () => {
  test('a dart keeps flying past x 1330 in a wider courtyard', () => {
    let s = rootriseArena(); s.width = 3000;
    s.platforms = [{ x: 0, y: 540, w: 3000, h: 120 }];
    s.objects.push(makeEnemy('dart', { x: 1300, y: 200, dx: 1, dy: 0 }, 'dart-x'));
    s = tick(s, 20);
    const dart = s.objects.find(o => o.id === 'dart-x');
    expect(dart).toBeDefined(); expect(dart.x).toBeGreaterThan(1330);
    s = tick(s, 400);
    expect(s.objects.find(o => o.id === 'dart-x')).toBeUndefined(); // gone once it leaves the world
  });
});

describe('riders', () => {
  test('a rider carried toward a wall stops at it instead of sticking in it', () => {
    let s = rootriseArena(); // platform-1 (the exit ledge) starts at x 760, top 290
    s.objects.push({ kind: 'mover', id: 'mover-x', x: 600, y: 400, w: 120, x1: 500, x2: 700, dir: 1, speed: 1, frozen: false });
    Object.assign(s.actors[1], { x: 700, y: 400, vx: 0, vy: 0, grounded: true, on: 'mover-x' });
    s = tick(s, 120);
    expect(s.actors[1].x).toBeLessThanOrEqual(760 - 15 + 1e-6);
    s = applyAction(s, 'local', { type: 'move', actor: 1, dir: -1 });
    const x = s.actors[1].x; s = tick(s, 10);
    expect(s.actors[1].x).toBeLessThan(x); // free to walk away
  });
});

describe('hurt box', () => {
  // A dart flying right through where Bloom stands, its box bottom at `bottom` (darts are 10 tall).
  const dartAt = bottom => {
    let s = rootriseArena(); const p = s.actors[1];
    s.objects.push(makeEnemy('dart', { x: p.x - 40, y: bottom, dx: 1, dy: 0 }, 'dart-x'));
    return tick(s, 20).actors[1].invuln > 0; // Still stands further left, out of the way
  };
  test('a dart grazing the hat hurts; one flying just over it does not', () => {
    const feet = rootriseArena().actors[1].y;
    expect(dartAt(feet - 56)).toBe(true); // box feet-66..feet-56: above the 52-tall body, through the hat
    expect(dartAt(feet - 67)).toBe(false); // box feet-77..feet-67: clear of the hat
  });
});
