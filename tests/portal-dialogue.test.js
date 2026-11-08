import { test, expect } from 'bun:test';
import { portalFrame, arrivalFrame } from '../public/portal.js';
import { dialogueFrame, CONVERSATIONS } from '../public/dialogue.js';

test('both travellers brace, push the closed leaves, then enter before the camera follows', () => {
  expect(portalFrame(0)).toEqual({ approach: 0, push: 0, opening: 0, walk: 0, fade: 0, focus: 0, zoom: 0 });
  expect(portalFrame(.24).push).toBe(1);
  expect(portalFrame(.24).opening).toBe(0);
  expect(portalFrame(.5).opening).toBeGreaterThan(.5);
  expect(portalFrame(.5).walk).toBe(0);
  expect(portalFrame(.8).opening).toBe(1);
  expect(portalFrame(.8).walk).toBeGreaterThan(.5);
  expect(portalFrame(.8).fade).toBe(0);
  expect(portalFrame(1)).toEqual({ approach: 1, push: 0, opening: 1, walk: 1, fade: 1, focus: 1, zoom: 1 });
  for (let i = 0; i <= 100; i++) {
    const next = portalFrame(i / 100);
    for (const value of Object.values(next)) expect(value).toBeGreaterThanOrEqual(0);
    expect(portalFrame(i / 100, true).zoom).toBe(0);
  }
});
test('gate leaf and camera movement has no jumps at phase boundaries', () => {
  for (const time of [0, .12, .18, .24, .28, .58, .68, .69, .87, .91, .99, 1]) {
    const before = portalFrame(Math.max(0, time - .0001)), after = portalFrame(Math.min(1, time + .0001));
    for (const key of Object.keys(before)) expect(Math.abs(after[key] - before[key])).toBeLessThan(.003);
  }
});
test('travellers walk in from offscreen left without changing height, spacing or simulation state', () => {
  for (const actors of [[{ id: 0, x: 180, y: 470 }, { id: 1, x: 250, y: 470 }], [{ id: 0, x: 250, y: 520 }, { id: 1, x: 170, y: 520 }]]) {
    const before = structuredClone(actors);
    let previous = arrivalFrame(0, actors);
    expect(previous.every(p => p.x < -52)).toBe(true);
    for (let i = 1; i <= 100; i++) {
      const frame = arrivalFrame(i / 100, actors);
      for (const [j, p] of frame.entries()) {
        expect(p.x).toBeGreaterThanOrEqual(previous[j].x);
        expect(p.x).toBeLessThanOrEqual(actors[j].x);
        expect(p.y).toBe(actors[j].y);
        expect(p.facing).toBe(1);
      }
      expect(frame[1].x - frame[0].x).toBeCloseTo(actors[1].x - actors[0].x);
      previous = frame;
    }
    expect(previous.map(p => [p.x, p.y, p.move])).toEqual(actors.map(p => [p.x, p.y, 0]));
    expect(arrivalFrame(0, actors, 0, true)).toEqual(previous);
    expect(actors).toEqual(before);
  }
});
test('dialogue types progressively, gives time to read, then moves to the next speaker', () => {
  const lines = CONVERSATIONS[0], first = lines[0][1];
  expect(dialogueFrame(lines, 0).shown).toBe('');
  expect(dialogueFrame(lines, 280).shown).toBe(first.slice(0, 10));
  expect(dialogueFrame(lines, first.length * 28 + 1000).shown).toBe(first);
  expect(dialogueFrame(lines, first.length * 28 + 1800).opacity).toBeCloseTo(.5);
  expect(dialogueFrame(lines, first.length * 28 + 2100).speaker).toBe(1);
  expect(dialogueFrame(lines, 100000)).toBeNull();
});
