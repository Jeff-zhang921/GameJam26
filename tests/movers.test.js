import { describe, test, expect } from 'bun:test';
import { setup, applyAction } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { rootriseArena } from './arena.js';

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
