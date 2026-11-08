import { afterEach, describe, expect, test } from 'bun:test';
import { createGameServer } from '../server.js';
import { setup } from '../src/logic.js';
import { rootriseArena } from './arena.js';

const servers = [], sockets = [];
afterEach(() => { for (const ws of sockets.splice(0)) ws.close(); for (const server of servers.splice(0)) server.stop(); });
function serve(options = {}) { const server = createGameServer({ port: 0, countdownMs: 80, ...options }); servers.push(server); return server; }
async function connect(server) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`); sockets.push(ws);
  const messages = [], waiters = [];
  ws.addEventListener('message', event => {
    messages.push(JSON.parse(event.data));
    for (const check of [...waiters]) check();
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  return {
    ws, messages, send(message) { ws.send(JSON.stringify(message)); },
    next(type, predicate = () => true, timeout = 1500) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${type}`)); }, timeout);
        const cleanup = () => { clearTimeout(timer); const index = waiters.indexOf(check); if (index >= 0) waiters.splice(index, 1); };
        const check = () => { const index = messages.findIndex(message => message.type === type && predicate(message)); if (index >= 0) { const [message] = messages.splice(index, 1); cleanup(); resolve(message); } };
        waiters.push(check); check();
      });
    },
  };
}
async function pair(server) {
  const host = await connect(server), guest = await connect(server);
  host.send({ type: 'create' }); const h = await host.next('joined');
  guest.send({ type: 'join', code: h.room.code }); const g = await guest.next('joined');
  return { host, guest, h, g, room: server.rooms.rooms.get(h.room.code) };
}
async function start(pair) {
  pair.host.send({ type: 'select', character: 'bloom' }); pair.guest.send({ type: 'select', character: 'still' });
  await pair.host.next('room', m => m.room.players.every(p => p.character));
  pair.host.send({ type: 'ready', ready: true }); pair.guest.send({ type: 'ready', ready: true });
  await pair.host.next('room', m => m.room.status === 'READY');
  pair.host.send({ type: 'start' });
  const a = await pair.host.next('snapshot', m => m.room.status === 'STARTING');
  const b = await pair.guest.next('snapshot', m => m.room.status === 'STARTING');
  expect(a.game).toEqual(b.game); expect(a.room.startAt).toBe(b.room.startAt);
  await pair.host.next('snapshot', m => m.room.status === 'PLAYING');
  await pair.guest.next('snapshot', m => m.room.status === 'PLAYING');
}

describe('real WebSocket multiplayer', () => {
  test('static routes and WebSocket origin boundary stay on the same server', async () => {
    const server = serve();
    expect((await fetch(server.url)).status).toBe(200);
    expect((await fetch(new URL('/src/logic.js', server.url))).status).toBe(200);
    for (const path of ['/src/enemies.js', '/src/levels/index.js', '/src/levels/01-stillwater.js', '/music.js', '/sfx.js']) {
      const response = await fetch(new URL(path, server.url));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('javascript');
    }
    expect((await fetch(new URL('/ws', server.url))).status).toBe(426);
    expect((await fetch(new URL('/ws', server.url), { headers: { origin: 'https://foreign.example' } })).status).toBe(403);
  });
  test('two connections share lobby, selection, start and authoritative movement', async () => {
    const server = serve(), p = await pair(server);
    const third = await connect(server); third.send({ type: 'join', code: p.h.room.code });
    expect((await third.next('error')).code).toBe('ROOM_FULL');
    await start(p);
    p.guest.send({ type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    const moved = await p.host.next('snapshot', m => m.game.actors[0].x > 180);
    const same = await p.guest.next('snapshot', m => m.game.tick === moved.game.tick);
    expect(same.game).toEqual(moved.game); expect(same.game.history).toBeUndefined();
    p.guest.send({ type: 'input', seq: 2, action: { type: 'jump' } });
    const jumping = await p.host.next('snapshot', m => m.game.actors[0].animation.name === 'jump');
    expect(jumping.game.actors[0].grounded).toBe(false);
    expect((await p.guest.next('snapshot', m => m.game.tick === jumping.game.tick)).game).toEqual(jumping.game);
    p.guest.send({ type: 'input', seq: 3, action: { type: 'move', dir: 0 } });
    await p.host.next('snapshot', m => m.game.actors[0].animation.name === 'land');
    p.host.send({ type: 'input', seq: 1, action: { type: 'move', actor: 0, dir: 1 } });
    expect((await p.host.next('error')).code).toBe('INVALID_ACTION');
    p.host.send({ type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    expect((await p.host.next('error')).code).toBe('INVALID_SEQUENCE');
  });
  test('shared existing time abilities and animation identities agree on both clients', async () => {
    const server = serve(), p = await pair(server); await start(p);
    p.room.game = rootriseArena({ players: p.room.game.playerIds }); p.room.epoch++;
    Object.assign(p.room.game.actors[1], { x: 380 }); // Bloom touches a seed: both clients see the count go up
    const picked = await p.host.next('snapshot', m => m.game.seeds === 2 && !m.game.objects.some(o => o.id === 'seed-1'));
    expect((await p.guest.next('snapshot', m => m.game.tick === picked.game.tick)).game.seeds).toBe(2);
    p.room.game.actors[1].x = 600;
    p.host.send({ type: 'input', seq: 1, action: { type: 'plant' } });
    await p.host.next('snapshot', m => m.game.objects.some(o => o.kind === 'plant') && m.game.seeds === 1);
    p.host.send({ type: 'input', seq: 4, action: { type: 'ability', target: 'plant-0' } });
    const woke = await p.host.next('snapshot', m => m.game.objects.some(o => o.id === 'plant-0' && o.speed === 1));
    expect((await p.guest.next('snapshot', m => m.game.tick === woke.game.tick)).game).toEqual(woke.game);
    expect(woke.game.actors[1].animation.name).toBe('cast');
    expect(woke.game.bloomCharges).toBe(2);
    const later = await p.host.next('snapshot', m => m.game.tick > woke.game.tick && m.game.tick < woke.game.tick + 10);
    expect(later.game.actors[1].animation).toEqual(woke.game.actors[1].animation);
    p.host.send({ type: 'input', seq: 5, action: { type: 'ability', target: 'plant-0' } });
    p.host.send({ type: 'input', seq: 6, action: { type: 'ability', target: 'plant-0' } });
    const fast = await p.guest.next('snapshot', m => m.game.objects.some(o => o.id === 'plant-0' && o.speed === 3));
    p.room.game.actors[0].x = 450; // Still walks within reach of the mushroom
    p.guest.send({ type: 'input', seq: 1, action: { type: 'ability', target: 'plant-0' } });
    const frozen = await p.host.next('snapshot', m => m.game.objects.some(o => o.id === 'plant-0' && o.frozen));
    expect((await p.guest.next('snapshot', m => m.game.tick === frozen.game.tick)).game).toEqual(frozen.game);
    expect(frozen.game.objects.find(o => o.id === 'plant-0').age).toBeGreaterThan(0);
    expect(fast.game.objects.find(o => o.id === 'plant-0').speed).toBe(3);
    expect(fast.game.bloomCharges).toBe(0);
    const [area] = frozen.game.freezeAreas;
    expect(area.owner).toBe(p.g.playerId);
    p.host.send({ type: 'input', seq: 7, action: { type: 'ability', area: area.id, owner: p.g.playerId } });
    expect((await p.host.next('error')).code).toBe('role');
    p.guest.send({ type: 'input', seq: 2, action: { type: 'ability', area: area.id } });
    const cancelled = await p.host.next('snapshot', m => m.ack[p.g.playerId] === 2);
    expect((await p.guest.next('snapshot', m => m.ack[p.g.playerId] === 2)).game).toEqual(cancelled.game);
    expect(cancelled.game.freezeAreas).toEqual([]);
    expect(cancelled.game.freezeCharges).toBe(frozen.game.freezeCharges);
    expect(cancelled.game.objects.find(o => o.id === 'plant-0')).toMatchObject({ frozen: false, speed: 3 });
  });
  test('private session restores disconnected slot without duplicate actors', async () => {
    const server = serve({ reconnectMs: 1500 }), p = await pair(server); await start(p);
    p.guest.ws.close();
    const suspended = await p.host.next('snapshot', m => m.room.suspended);
    await Bun.sleep(80); expect(p.room.game.tick).toBe(suspended.game.tick);
    const outsider = await connect(server);
    outsider.send({ type: 'resume', code: p.h.room.code, playerId: p.g.playerId, token: 'wrong' });
    expect((await outsider.next('error')).code).toBe('INVALID_SESSION');
    const returning = await connect(server);
    returning.send({ type: 'resume', code: p.h.room.code, playerId: p.g.playerId, token: p.g.token });
    expect((await returning.next('joined')).playerId).toBe(p.g.playerId);
    const restored = await returning.next('snapshot', m => !m.room.suspended);
    expect(restored.game.actors).toHaveLength(2); expect(restored.room.players).toHaveLength(2);
    expect(restored.game.tick).toBe(suspended.game.tick);
    expect((await p.host.next('snapshot', m => !m.room.suspended && m.game.tick === restored.game.tick)).game).toEqual(restored.game);
  });
  test('room codes isolate state and both clients see the same completion', async () => {
    const server = serve(), p = await pair(server), other = await pair(server); await start(p); await start(other);
    p.host.send({ type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    await p.guest.next('snapshot', m => m.game.actors[1].x > 250);
    expect(other.room.game.actors[1].x).toBe(250);
    for (const key of p.room.game.needs) p.room.game.flags[key] = true;
    for (const actor of p.room.game.actors) Object.assign(actor, { x: p.room.game.exit.x, y: p.room.game.exit.y });
    const won = await p.host.next('snapshot', m => m.game.status === 'won');
    expect((await p.guest.next('snapshot', m => m.game.status === 'won')).game).toEqual(won.game);
    expect(won.room.status).toBe('FINISHED'); expect(won.room.canReturnLobby).toBe(false);
    expect(other.room.status).toBe('PLAYING');
  });
});
