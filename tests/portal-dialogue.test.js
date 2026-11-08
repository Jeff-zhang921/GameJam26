import { test, expect } from 'bun:test';
import { portalFrame, landingFrame } from '../public/portal.js';
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
test('arrival stops exactly on the ground and never overshoots below it', () => {
  let previous = Infinity;
  for (let i = 0; i <= 100; i++) {
    const frame = landingFrame(i / 100);
    expect(frame.drop).toBeGreaterThanOrEqual(0);
    expect(frame.drop).toBeLessThanOrEqual(previous);
    previous = frame.drop;
  }
  expect(landingFrame(1)).toEqual({ drop: 0, landed: true });
  expect(landingFrame(0, true).drop).toBe(0);
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
