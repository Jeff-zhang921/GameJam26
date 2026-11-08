import { test, expect } from 'bun:test';
import { setup } from '../src/logic.js';
import { interpolateGame, createNetwork } from '../public/network.js';

test('offline requests wait for connectivity, retry only unsent intent, and cancel on leave', () => {
  const saved = new Map(['navigator', 'window', 'WebSocket', 'setInterval', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const phases = [], errors = [], sockets = [], sent = [];
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    globalThis.window = new EventTarget();
    Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://moonclock.example/') });
    globalThis.WebSocket = class extends EventTarget {
      static OPEN = 1; static CONNECTING = 0;
      readyState = 0;
      constructor(url) { super(); this.url = String(url); sockets.push(this); }
      send(message) { sent.push(JSON.parse(message)); }
      close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    };
    globalThis.setInterval = () => 0;
    const network = createNetwork({ onRoom() {}, onState() {}, onConnection: phase => phases.push(phase), onError: message => errors.push(message) });
    network.create(); network.join('07');
    expect(sockets).toHaveLength(0);
    expect(phases).toEqual(['connecting', 'offline', 'connecting', 'offline']);
    expect(errors).toHaveLength(2);
    expect(errors.every(message => message.includes('offline'))).toBe(true);
    network.retry();
    expect(sockets).toHaveLength(0);
    navigator.onLine = true; window.dispatchEvent(new Event('online'));
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('wss://moonclock.example/ws');
    sockets[0].readyState = WebSocket.OPEN; sockets[0].dispatchEvent(new Event('open'));
    expect(sent).toEqual([{ type: 'join', code: '07' }]);
    window.dispatchEvent(new Event('online'));
    expect(sockets).toHaveLength(1);
    network.leave();
    navigator.onLine = false; network.create(); network.leave();
    navigator.onLine = true; window.dispatchEvent(new Event('online'));
    expect(sockets).toHaveLength(1);
  } finally {
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

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
