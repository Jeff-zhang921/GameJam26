import { test, expect } from 'bun:test';
import { setup } from '../src/logic.js';
import { interpolateGame } from '../public/network.js';

test('remote interpolation keeps authoritative objects and events and does not move the local player', () => {
  const a = setup(), b = structuredClone(a);
  b.actors[0].x += 40; b.actors[1].x += 80;
  b.objects[0].frozen = true;
  const result = interpolateGame(a, b, .5, 0);
  expect(result.actors[0].x).toBe(b.actors[0].x);
  expect(result.actors[1].x).toBe(a.actors[1].x + 40);
  expect(result.objects).toBe(b.objects);
  expect(result.events).toBe(b.events);
  expect(b.actors[1].x).toBe(a.actors[1].x + 80);
});

test('interpolation never drags respawned players or a new level across the old scene', () => {
  const a = setup(), b = structuredClone(a);
  b.actors[1].x += 500;
  expect(interpolateGame(a, b, .2, 0).actors[1].x).toBe(b.actors[1].x);
  const next = setup({ level: 1 });
  expect(interpolateGame(b, next, .2, 0).actors).toEqual(next.actors);
});
