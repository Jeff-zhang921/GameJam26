import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { createGameServer } from '../server.js';
import { createRoomManager } from '../src/rooms.js';
import { fileURLToPath } from 'node:url';

const servers = [], sockets = [];
beforeAll(async () => {
  if (!await Bun.file(new URL('../dist/index.html', import.meta.url)).exists()) {
    const build = Bun.spawn(['bun', 'run', 'build'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'inherit', stderr: 'inherit' });
    if (await build.exited !== 0) throw new Error('Production build failed.');
  }
});
afterEach(() => { for (const socket of sockets.splice(0)) socket.close(); for (const game of servers.splice(0)) game.stop(); });
function serve(options = {}) {
  const game = createGameServer({ production: true, hostname: '127.0.0.1', port: 0, countdownMs: 50, ...options });
  servers.push(game); return game;
}
async function connect(game) {
  const socket = new WebSocket(`ws://127.0.0.1:${game.port}/ws`); sockets.push(socket);
  const messages = [];
  socket.addEventListener('message', event => messages.push(JSON.parse(event.data)));
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  return {
    socket, send(message) { socket.send(JSON.stringify(message)); },
    async next(type, predicate = () => true) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(message => message.type === type && predicate(message));
        if (index >= 0) return messages.splice(index, 1)[0];
        await Bun.sleep(5);
      }
      throw new Error(`Timed out waiting for ${type}.`);
    },
  };
}
async function pair(game) {
  const host = await connect(game), guest = await connect(game);
  host.send({ type: 'create' }); const hostSession = await host.next('joined');
  guest.send({ type: 'join', code: hostSession.room.code }); const guestSession = await guest.next('joined');
  host.send({ type: 'select', character: 'still' }); guest.send({ type: 'select', character: 'bloom' });
  await host.next('room', message => message.room.players.every(player => player.character));
  host.send({ type: 'ready', ready: true }); guest.send({ type: 'ready', ready: true });
  await host.next('room', message => message.room.status === 'READY');
  host.send({ type: 'start' });
  const initial = await host.next('snapshot', message => message.room.status === 'STARTING');
  expect((await guest.next('snapshot', message => message.room.status === 'STARTING')).game).toEqual(initial.game);
  await host.next('snapshot', message => message.room.status === 'PLAYING');
  await guest.next('snapshot', message => message.room.status === 'PLAYING');
  return { host, guest, hostSession, guestSession };
}

describe('production HTTP and WebSocket service', () => {
  test('serves the real production entry and cache headers without exposing source or secrets', async () => {
    const game = serve();
    const health = await fetch(new URL('/health', game.url));
    expect(health.status).toBe(200); expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers.get('cache-control')).toBe('no-store');
    const page = await fetch(game.url), html = await page.text();
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(html).toBe(await Bun.file(new URL('../dist/index.html', import.meta.url)).text());
    const script = html.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
    const bundle = await fetch(new URL(script, game.url));
    expect(bundle.status).toBe(200); expect(bundle.headers.get('cache-control')).toContain('immutable');
    expect(bundle.headers.get('content-type')).toContain('javascript');
    for (const path of ['/sw.js', '/manifest.webmanifest', '/offline.html']) {
      const response = await fetch(new URL(path, game.url));
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-cache');
    }
    for (const path of ['/.env', '/.git/config', '/server.js', '/src/logic.js', '/src/rooms.js', '/package.json']) expect((await fetch(new URL(path, game.url))).status).toBe(404);
    expect((await fetch(game.url, { method: 'POST' })).status).toBe(405);
    const head = await fetch(new URL(script, game.url), { method: 'HEAD' });
    expect(head.status).toBe(200); expect(await head.text()).toBe('');
  });

  test('accepts the configured HTTPS origin behind TLS termination and rejects foreign or forged origins', async () => {
    const game = serve({ publicOrigin: 'https://moonclock.example' });
    const ws = new URL('/ws', game.url);
    expect((await fetch(ws, { headers: { origin: 'https://moonclock.example' } })).status).toBe(426);
    expect((await fetch(ws, { headers: { origin: 'https://foreign.example', 'x-forwarded-host': 'moonclock.example', 'x-forwarded-proto': 'https' } })).status).toBe(403);
    expect((await fetch(ws, { headers: { origin: 'null' } })).status).toBe(403);
    expect(() => serve({ publicOrigin: 'https://moonclock.example/some-path' })).toThrow('PUBLIC_ORIGIN');
    expect(() => serve({ buildRoot: fileURLToPath(new URL('../.audit/no-production-build', import.meta.url)) })).toThrow('Production frontend is missing');
  });

  test('four real clients run two independent authoritative rooms and reconnect correctly', async () => {
    const game = serve(), one = await pair(game), two = await pair(game);
    expect(one.hostSession.room.code).not.toBe(two.hostSession.room.code);
    one.host.send({ type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    const moved = await one.host.next('snapshot', message => message.game.actors[0].x > 180);
    expect((await one.guest.next('snapshot', message => message.game.tick === moved.game.tick)).game).toEqual(moved.game);
    const unchanged = await two.host.next('snapshot', message => message.game.tick > 6);
    expect(unchanged.game.actors[0].x).toBe(180); expect(unchanged.game.actors[1].x).toBe(250);
    one.host.send({ type: 'input', seq: 2, action: { type: 'move', dir: 0 } });
    two.guest.send({ type: 'input', seq: 1, action: { type: 'jump' } });
    const jumping = await two.host.next('snapshot', message => message.game.actors[1].animation.name === 'jump');
    expect((await two.guest.next('snapshot', message => message.game.tick === jumping.game.tick)).game).toEqual(jumping.game);
    one.host.send({ type: 'input', seq: 3, action: { type: 'ability', target: 'crate-0' } });
    const frozen = await one.guest.next('snapshot', message => message.game.objects[0].frozen);
    expect(frozen.game.actors[0].animation.name).toBe('cast');
    expect((await two.host.next('snapshot', message => message.game.tick > jumping.game.tick)).game.objects[0].frozen).toBe(false);
    one.guest.send({ type: 'input', seq: 1, action: { type: 'ability', target: 'crate-0' } });
    await one.host.next('snapshot', message => !message.game.objects[0].frozen);
    one.guest.socket.close();
    const held = await one.host.next('snapshot', message => message.room.suspended);
    const replacement = await connect(game);
    replacement.send({ type: 'resume', code: one.guestSession.room.code, playerId: one.guestSession.playerId, token: one.guestSession.token });
    const resumed = await replacement.next('joined');
    expect(resumed.playerId).toBe(one.guestSession.playerId); expect(resumed.room.players).toHaveLength(2);
    expect((await replacement.next('snapshot')).game.tick).toBe(held.game.tick);
  });

  test('idle and entirely disconnected rooms do not advance or serialize gameplay snapshots', () => {
    let now = 1000;
    const manager = createRoomManager({ now: () => now });
    const socket = () => ({ data: {}, send() {} });
    const host = socket(), guest = socket();
    const send = (ws, value) => manager.receive(ws, JSON.stringify(value));
    send(host, { type: 'create' }); const room = [...manager.rooms.values()][0];
    send(guest, { type: 'join', code: room.code }); send(host, { type: 'select', character: 'still' }); send(guest, { type: 'select', character: 'bloom' });
    send(host, { type: 'ready', ready: true }); send(guest, { type: 'ready', ready: true }); send(host, { type: 'start' });
    now += 1; manager.advance();
    manager.disconnect(host); manager.disconnect(guest); const tick = room.game.tick;
    Object.defineProperty(room.game, 'objects', { get() { throw new Error('Unnecessary disconnected snapshot serialization'); } });
    now += 100; expect(() => manager.advance()).not.toThrow(); expect(room.game.tick).toBe(tick);
  });

  test('room creation churn and malformed packets have modest per-connection bounds', () => {
    const manager = createRoomManager({ now: () => 1000 });
    const messages = [], closes = [];
    const socket = { data: {}, send(raw) { messages.push(JSON.parse(raw)); }, close(...args) { closes.push(args); } };
    for (let i = 0; i < 10; i++) {
      manager.receive(socket, JSON.stringify({ type: 'create' }));
      manager.receive(socket, JSON.stringify({ type: 'leave' }));
    }
    manager.receive(socket, JSON.stringify({ type: 'create' }));
    expect(messages.at(-1).code).toBe('CREATE_LIMIT'); expect(manager.rooms.size).toBe(0);
    for (let i = 0; i < 20; i++) manager.receive(socket, '{');
    expect(closes).toEqual([[1008, 'Invalid message limit']]);
  });
});
