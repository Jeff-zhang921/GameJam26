import { test, expect } from 'bun:test';
import { portalFrame, landingFrame } from '../public/portal.js';
import { dialogueFrame, CONVERSATIONS } from '../public/dialogue.js';

test('travellers enter before fading out and the camera finishes its push', () => {
  expect(portalFrame(0)).toEqual({ walk: 0, fade: 0, zoom: 0 });
  expect(portalFrame(.4).walk).toBeGreaterThan(.5);
  expect(portalFrame(.4).fade).toBe(0);
  expect(portalFrame(1)).toEqual({ walk: 1, fade: 1, zoom: 1 });
  for (let i = 0; i <= 100; i++) {
    const next = portalFrame(i / 100);
    for (const value of Object.values(next)) expect(value).toBeGreaterThanOrEqual(0);
    expect(portalFrame(i / 100, true).zoom).toBe(0);
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
  expect(dialogueFrame(lines, first.length * 28 + 2100).speaker).toBe(1);
  expect(dialogueFrame(lines, 100000)).toBeNull();
});
