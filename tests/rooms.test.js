import { describe, test, expect } from 'bun:test';
import { createRoomManager } from '../src/rooms.js';
import { aimedThrowVelocity } from '../src/logic.js';

function fixture(options = {}) {
  let time = 1000;
  const manager = createRoomManager({ now: () => time, countdownMs: 3000, reconnectMs: 30000, ...options });
  const socket = () => ({ data: {}, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } });
  const send = (ws, message) => manager.receive(ws, JSON.stringify(message));
  const last = (ws, type) => ws.messages.findLast(m => m.type === type);
  const advance = ms => { time += ms; manager.advance(time); };
  const host = socket(); send(host, { type: 'create' });
  const credentials = last(host, 'joined'), room = manager.rooms.get(credentials.room.code);
  const guest = socket();
  function pair() { send(guest, { type: 'join', code: room.code.toLowerCase() }); return last(guest, 'joined'); }
  function ready() { pair(); send(host, { type: 'select', character: 'bloom' }); send(guest, { type: 'select', character: 'still' }); send(host, { type: 'ready', ready: true }); send(guest, { type: 'ready', ready: true }); }
  function start() { ready(); send(host, { type: 'start' }); advance(3001); }
  return { manager, host, guest, credentials, room, socket, send, last, advance, pair, ready, start };
}

describe('rooms and shared lobby', () => {
  test('authenticated retry waits for an active connection, then reclaims the same slot', () => {
    const f = fixture(), retry = f.socket();
    const resume = { type: 'resume', code: f.room.code, playerId: f.credentials.playerId, token: f.credentials.token };
    f.send(retry, resume);
    expect(f.last(retry, 'error').code).toBe('SESSION_ACTIVE');
    f.manager.disconnect(f.host);
    f.send(retry, resume);
    expect(f.last(retry, 'joined').playerId).toBe(f.credentials.playerId);
    expect(f.room.players).toHaveLength(1);
  });
  test('server creates unique six-character codes and keeps credentials private', () => {
    const f = fixture();
    expect(f.room.code).toMatch(/^[A-Z0-9]{6}$/);
    const other = f.socket(); f.send(other, { type: 'create' });
    expect(f.last(other, 'joined').room.code).not.toBe(f.room.code);
    const guest = f.pair();
    expect(f.last(f.host, 'room').room).toEqual(f.last(f.guest, 'room').room);
    expect(JSON.stringify(f.last(f.guest, 'room'))).not.toContain(f.credentials.token);
    expect(guest.token).not.toBe(f.credentials.token);
    f.send(f.host, { type: 'create' }); expect(f.last(f.host, 'error').code).toBe('ALREADY_JOINED');
  });
  test('invalid, nonexistent and full rooms are rejected', () => {
    const f = fixture(), third = f.socket();
    f.send(third, { type: 'join', code: '!' }); expect(f.last(third, 'error').code).toBe('INVALID_CODE');
    f.send(third, { type: 'join', code: '000000' }); expect(f.last(third, 'error').code).toBe('ROOM_NOT_FOUND');
    f.pair(); f.send(third, { type: 'join', code: f.room.code }); expect(f.last(third, 'error').code).toBe('ROOM_FULL');
  });
  test('character selection is exclusive and changes clear Ready', () => {
    const f = fixture(); f.pair();
    f.send(f.host, { type: 'select', character: 'bloom' });
    f.send(f.guest, { type: 'select', character: 'bloom' }); expect(f.last(f.guest, 'error').code).toBe('CHARACTER_TAKEN');
    f.send(f.host, { type: 'ready', ready: true });
    f.send(f.host, { type: 'select', character: 'still' });
    expect(f.room.players[0]).toMatchObject({ character: 'still', ready: false });
    expect(f.last(f.guest, 'room').room.players[0]).toMatchObject({ character: 'still', ready: false });
  });
  test('only a ready host can start; countdown is one shared server timeline', () => {
    const f = fixture();
    f.send(f.host, { type: 'start' }); expect(f.last(f.host, 'error').code).toBe('NOT_READY');
    f.ready(); expect(f.room.status).toBe('READY');
    f.send(f.guest, { type: 'start' }); expect(f.last(f.guest, 'error').code).toBe('HOST_ONLY');
    f.send(f.host, { type: 'start' });
    const initial = f.room.game;
    expect(f.last(f.host, 'snapshot')).toEqual(f.last(f.guest, 'snapshot'));
    expect(initial.playerIds).toEqual([f.room.players[1].id, f.room.players[0].id]);
    f.send(f.host, { type: 'start' }); expect(f.room.game).toBe(initial);
    f.send(f.guest, { type: 'select', character: 'bloom' }); expect(f.last(f.guest, 'error').code).toBe('SELECTION_LOCKED');
    f.advance(2999); expect(f.room.status).toBe('STARTING'); expect(f.room.game.tick).toBe(0);
    f.advance(2); expect(f.room.status).toBe('PLAYING');
  });
  test('input ownership, ordering, movement and ability handoff stay authoritative', () => {
    const f = fixture(); f.start();
    const input = (ws, seq, action) => f.send(ws, { type: 'input', seq, action });
    input(f.host, 1, { type: 'move', actor: 0, dir: 1 }); expect(f.last(f.host, 'error').code).toBe('INVALID_ACTION');
    input(f.host, 2, { type: 'tick' }); expect(f.last(f.host, 'error').code).toBe('INVALID_ACTION');
    input(f.guest, 1, { type: 'move', dir: 1 }); f.advance(100);
    expect(f.room.game.actors[0].x).toBeGreaterThan(180);
    input(f.guest, 1, { type: 'move', dir: -1 }); expect(f.last(f.guest, 'error').code).toBe('INVALID_SEQUENCE');
    input(f.guest, 2, { type: 'move', dir: 0 });
    input(f.guest, 3, { type: 'ability', target: 'crate-0' });
    expect(f.room.game.objects.find(o => o.id === 'crate-0').frozen).toBe(true);
    const cast = cloneActor(f.room.game.actors[0]);
    f.advance(50); expect(f.room.game.actors[0].animation).toEqual(cast.animation);
    expect(f.room.game.freezeAreas).toHaveLength(1);
    // Bloom keeps acceleration only: a crate has no clock to hasten, and the server says so.
    input(f.host, 3, { type: 'ability', target: 'crate-0' });
    expect(f.last(f.host, 'error')).toMatchObject({ code: 'bloomRange', seq: 3 });
    expect(f.room.game.objects.find(o => o.id === 'crate-0').frozen).toBe(true);
    f.advance(50);
    expect(f.last(f.host, 'snapshot')).toEqual(f.last(f.guest, 'snapshot'));
    expect(f.last(f.host, 'snapshot').game.history).toBeUndefined();
  });
  test('an aimed throw reaches the shared game with its aim; a bad aim is refused', () => {
    const f = fixture(); f.start();
    const input = (ws, seq, action) => f.send(ws, { type: 'input', seq, action });
    Object.assign(f.room.game.actors[0], { x: 300 }); // Still (the guest) beside the crate
    input(f.guest, 1, { type: 'grab' });
    expect(f.room.game.actors[0].carrying).toBe('crate-0');
    input(f.guest, 2, { type: 'grab', aim: { vx: 50, vy: -50 } });
    expect(f.last(f.guest, 'error').code).toBe('invalid');
    const aim = aimedThrowVelocity(-360, -360, 360);
    input(f.guest, 3, { type: 'grab', aim });
    expect(f.room.game.objects.find(o => o.id === 'crate-0')).toMatchObject({ held: null, ...aim });
  });
  test('different room codes isolate input and state', () => {
    const f = fixture(); f.start();
    const other = f.socket(); f.send(other, { type: 'create' });
    const second = f.manager.rooms.get(f.last(other, 'joined').room.code);
    f.send(other, { type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    expect(f.last(other, 'error').code).toBe('NOT_PLAYING'); expect(second.game).toBe(null);
    expect(f.room.game.actors.every(a => a.move === 0)).toBe(true);
  });
  test('disconnect pauses simulation; only private identity can reclaim original character', () => {
    const f = fixture(); f.start();
    const credentials = f.last(f.guest, 'joined');
    f.send(f.guest, { type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    f.manager.disconnect(f.guest); const tick = f.room.game.tick;
    f.advance(1000); expect(f.room.suspended).toBe(true); expect(f.room.game.tick).toBe(tick);
    const claimant = f.socket();
    f.send(claimant, { type: 'resume', code: f.room.code, playerId: credentials.playerId, token: 'wrong' }); expect(f.last(claimant, 'error').code).toBe('INVALID_SESSION');
    f.send(claimant, { type: 'resume', code: f.room.code, playerId: credentials.playerId, token: credentials.token });
    expect(f.room.players).toHaveLength(2); expect(f.room.suspended).toBe(false);
    expect(f.last(claimant, 'joined')).toMatchObject({ playerId: credentials.playerId, lastSeq: 1 });
    expect(f.last(claimant, 'snapshot').game.tick).toBe(tick);
    f.advance(50); expect(f.room.game.tick).toBeGreaterThan(tick);
    const attacker = f.socket(); f.send(attacker, { type: 'resume', code: f.room.code, playerId: credentials.playerId, token: credentials.token }); expect(f.last(attacker, 'error').code).toBe('SESSION_ACTIVE');
  });
  test('expired reconnection ends session and allows return to lobby', () => {
    const f = fixture(); f.start();
    f.manager.disconnect(f.host); f.advance(30001);
    expect(f.room.status).toBe('FINISHED'); expect(f.manager.publicRoom(f.room).canReturnLobby).toBe(true);
    f.send(f.guest, { type: 'returnLobby' });
    expect(f.room.status).toBe('WAITING'); expect(f.room.players).toHaveLength(1); expect(f.room.hostId).toBe(f.room.players[0].id);
  });
  test('countdown disconnect cancels readiness and explicit host leave transfers host', () => {
    const f = fixture(); f.ready(); f.send(f.host, { type: 'start' });
    f.manager.disconnect(f.guest); expect(f.room.status).toBe('WAITING'); expect(f.room.startAt).toBe(null);
    expect(f.room.players.every(p => !p.ready)).toBe(true);
    const other = fixture(); other.pair(); const guestId = other.room.players[1].id;
    other.send(other.host, { type: 'leave' }); expect(other.room.hostId).toBe(guestId); expect(other.room.players).toHaveLength(1);
  });
  test('malformed, oversized and excessive input cannot crash the room manager', () => {
    const f = fixture();
    for (const raw of ['{', 'null', '[]', '{}', 'x'.repeat(4097), new Uint8Array([1])]) f.manager.receive(f.host, raw);
    expect(f.last(f.host, 'error').code).toBe('INVALID_MESSAGE');
    f.send(f.host, { type: 'select', character: { toString: 'malformed' } });
    expect(f.last(f.host, 'error').code).toBe('INVALID_CHARACTER');
    for (let i = 0; i < 121; i++) f.send(f.host, { type: 'nonsense' });
    expect(f.last(f.host, 'error').code).toBe('RATE_LIMIT');
  });
});

function cloneActor(actor) { return JSON.parse(JSON.stringify(actor)); }

describe('rewind removal', () => {
  test('the server rejects rewind input and snapshots carry no rewind history', () => {
    const f = fixture(); f.start();
    f.send(f.guest, { type: 'input', seq: 1, action: { type: 'rewind' } });
    expect(f.last(f.guest, 'error')).toMatchObject({ code: 'INVALID_ACTION', seq: 1 });
    f.advance(50);
    const game = f.last(f.host, 'snapshot').game;
    expect(game.history).toBeUndefined();
    expect(game.rewindsLeft).toBeUndefined();
  });
});

describe('host level select and shared failure', () => {
  test('only the host can move both players to another courtyard, and both arrive together', () => {
    const f = fixture(); f.start();
    f.send(f.guest, { type: 'control', action: 'level', level: 2 });
    expect(f.last(f.guest, 'error').code).toBe('HOST_ONLY');
    f.send(f.host, { type: 'control', action: 'level', level: 9 });
    expect(f.last(f.host, 'error').code).toBe('INVALID_CONTROL');
    const epoch = f.room.epoch;
    f.send(f.host, { type: 'control', action: 'level', level: 2 });
    const host = f.last(f.host, 'snapshot'), guest = f.last(f.guest, 'snapshot');
    expect(host.game.level).toBe(2);
    expect(guest.game).toEqual(host.game);
    expect(host.room.epoch).toBe(epoch + 1);
    expect(host.room.status).toBe('PLAYING');
  });

  test('a possible dead end warns both players while play goes on; only the host restarts, as one shared 4 s rewind', () => {
    const f = fixture(); f.start();
    f.send(f.host, { type: 'control', action: 'level', level: 1 });
    f.room.game.objects = f.room.game.objects.filter(o => o.kind !== 'seed'); f.room.game.seeds = 0;
    Object.assign(f.room.game.actors[0], { x: f.room.game.exit.x, y: f.room.game.exit.y, on: 'platform-1' });
    f.advance(50);
    for (const ws of [f.host, f.guest]) expect(f.last(ws, 'snapshot').game).toMatchObject({ status: 'playing', failure: 'stranded', failureSeq: 1 });
    const going = f.room.game.tick; f.advance(100);
    expect(f.room.game.tick).toBeGreaterThan(going); // a warning never stops the courtyard
    f.send(f.guest, { type: 'control', action: 'restart' });
    expect(f.last(f.guest, 'error').code).toBe('HOST_ONLY');
    const epoch = f.room.epoch;
    f.send(f.host, { type: 'control', action: 'restart' });
    const [hostReplay, guestReplay] = [f.last(f.host, 'replay'), f.last(f.guest, 'replay')];
    expect(hostReplay.replay).toEqual(guestReplay.replay);
    expect(hostReplay.replay.duration).toBe(4000);
    expect(hostReplay.replay.end).toMatchObject({ level: 1, tick: 0, status: 'playing', failure: null });
    expect(hostReplay.replay.end.objects.filter(o => o.kind === 'seed')).toHaveLength(1); // restored: the loose seed (Bloom starts with none)
    expect(hostReplay.replay.end.seeds).toBe(0);
    expect(hostReplay.room.rewinding.id).toBe(hostReplay.replay.id);
    // During the rewind: no inputs, no second restart, and the shared world holds still.
    f.send(f.guest, { type: 'input', seq: 1, action: { type: 'move', dir: 1 } });
    expect(f.last(f.guest, 'error').code).toBe('NOT_PLAYING');
    f.send(f.host, { type: 'control', action: 'restart' });
    expect(f.last(f.host, 'error').code).toBe('REWINDING');
    const held = f.room.game.tick;
    f.advance(3900);
    expect(f.room.game.tick).toBe(held);
    expect(f.room.epoch).toBe(epoch);
    f.advance(150);
    for (const ws of [f.host, f.guest]) {
      const snap = f.last(ws, 'snapshot');
      expect(snap.room.epoch).toBe(epoch + 1);
      expect(snap.room.rewinding).toBe(null);
      expect(snap.game).toMatchObject({ level: 1, status: 'playing', failure: null });
      expect(snap.game.objects.filter(o => o.kind === 'seed')).toHaveLength(1);
      expect(snap.game.seeds).toBe(0);
    }
    expect(f.last(f.host, 'snapshot').game).toEqual(f.last(f.guest, 'snapshot').game);
    expect(f.room.players.map(p => p.character).sort()).toEqual(['bloom', 'still']);
    f.send(f.guest, { type: 'input', seq: 2, action: { type: 'move', dir: 1 } });
    f.advance(50);
    expect(f.room.game.actors[0].move).toBe(1); // play resumes normally
  });
});
