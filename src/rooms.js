import { randomBytes, timingSafeEqual } from 'node:crypto';
import { setup, validateAction, applyAction } from './logic.js';

const characters = { still: 0, bloom: 1 };
const lobbyStatuses = new Set(['WAITING', 'READY']);
const inputTypes = new Set(['move', 'jump', 'jumpRelease', 'grab', 'plant', 'takeSeed', 'stowSeed', 'ability']);
const codePattern = /^[A-Z0-9]{6}$/;
const clone = value => JSON.parse(JSON.stringify(value));

export function createRoomManager({ now = Date.now, countdownMs = 0, reconnectMs = 30000, roomTtlMs = 30 * 60 * 1000, maxRooms = 500, rewindMs = 4000 } = {}) {
  const rooms = new Map();
  let lastAdvance = now(), accumulator = 0;
  function send(ws, message) { if (ws) { try { ws.send(JSON.stringify(message)); } catch { } } }
  function error(ws, code, message, seq) {
    send(ws, { type: 'error', code, message, ...(seq === undefined ? {} : { seq }) });
    if (code.startsWith('INVALID') || code === 'NOT_JOINED') {
      const time = now();
      if (time - (ws.data.invalidAt ?? -Infinity) >= 60000) { ws.data.invalidAt = time; ws.data.invalidCount = 0; }
      if (++ws.data.invalidCount >= 20) ws.close?.(1008, 'Invalid message limit');
    }
  }
  function actorOf(player) { return characters[player.character]; }
  function publicRoom(room) {
    const disconnected = room.players.filter(p => !p.connected);
    return {
      code: room.code, status: room.status, hostId: room.hostId,
      players: room.players.map(({ id, character, ready, connected }) => ({ id, character, ready, connected })),
      startAt: room.startAt, startDuration: countdownMs, suspended: room.suspended,
      reconnectUntil: disconnected.length ? Math.min(...disconnected.map(p => p.disconnectedAt + reconnectMs)) : null,
      canReturnLobby: room.status === 'FINISHED' && room.suspended, epoch: room.epoch,
      rewinding: room.rewind ? { id: room.rewind.id, until: room.rewind.until, duration: rewindMs } : null,
    };
  }
  function gameView(room) {
    if (!room.game) return null;
    return clone(room.game);
  }
  function envelope(room, type = 'room') {
    const result = { type, room: publicRoom(room), serverTime: now() };
    if (type === 'snapshot') { result.game = gameView(room); result.ack = Object.fromEntries(room.players.map(p => [p.id, p.lastSeq])); }
    return result;
  }
  function broadcast(room, type = 'room') {
    if (!room.players.some(player => player.connected)) return;
    const message = envelope(room, type);
    for (const p of room.players) if (p.connected) send(p.ws, message);
  }
  function joined(room, player) {
    send(player.ws, { type: 'joined', room: publicRoom(room), playerId: player.id, token: player.token, lastSeq: player.lastSeq, serverTime: now() });
    broadcast(room);
    if (room.game) send(player.ws, envelope(room, 'snapshot'));
  }
  function readyRoom(room) {
    const ready = room.players.length === 2 && room.players.every(p => p.connected && p.character && p.ready) && room.players[0].character !== room.players[1].character;
    room.status = ready ? 'READY' : 'WAITING';
  }
  function newPlayer(ws) {
    return { id: randomBytes(12).toString('hex'), token: randomBytes(32).toString('base64url'), character: null, ready: false, connected: true, disconnectedAt: null, ws, lastSeq: 0 };
  }
  function attach(ws, room, player) { ws.data.roomCode = room.code; ws.data.playerId = player.id; player.ws = ws; player.connected = true; player.disconnectedAt = null; }
  function member(ws) {
    const room = rooms.get(ws.data?.roomCode);
    const player = room?.players.find(p => p.id === ws.data?.playerId && p.ws === ws && p.connected);
    return player ? { room, player } : null;
  }
  function stopInputs(room, player) {
    if (!room.game || !player.character) return;
    const actor = actorOf(player);
    room.game = applyAction(room.game, player.id, { type: 'move', actor, dir: 0 });
    room.game = applyAction(room.game, player.id, { type: 'jumpRelease', actor });
  }
  function lobby(room) {
    room.rewind = null;
    room.status = 'WAITING'; room.game = null; room.startAt = null; room.suspended = false; room.manualPaused = false; room.epoch++;
    room.createdAt = now();
    for (const player of room.players) player.ready = false;
    readyRoom(room);
  }
  function removePlayer(room, player) {
    room.players = room.players.filter(p => p !== player);
    if (room.hostId === player.id) room.hostId = room.players[0]?.id ?? null;
    if (!room.players.length) { rooms.delete(room.code); return; }
    lobby(room); broadcast(room);
  }
  function updateAnimations(room, castActor = null, castTarget = null) {
    const game = room.game;
    if (!game) return;
    for (const actor of game.actors) {
      const previous = actor.animation;
      const cast = actor.id === castActor;
      const landing = [...game.events].reverse().find(e => e.kind === 'land' && e.actor === actor.id && e.tick === game.tick);
      let name = !actor.grounded ? actor.vy < 0 ? 'jump' : 'fall' : actor.move ? 'run' : 'idle';
      if (previous?.name === 'cast' && game.tick - previous.startTick < 18) name = 'cast';
      else if (landing) name = 'land';
      else if (previous?.name === 'land' && game.tick - previous.startTick < 10) name = 'land';
      if (cast) name = 'cast';
      if (cast || name !== previous?.name) actor.animation = { name, startTick: game.tick, eventId: cast ? game.eventSeq : landing?.id ?? null };
      if (cast) actor.abilityTarget = castTarget;
    }
  }
  function initialize(room) {
    const ids = ['still', 'bloom'].map(character => room.players.find(p => p.character === character).id);
    room.game = setup({ players: ids }); room.epoch++; updateAnimations(room);
    room.status = 'STARTING'; room.startAt = now() + countdownMs; room.lastBroadcast = now();
    broadcast(room, 'snapshot');
  }
  function startRewind(room) {
    for (const p of room.players) stopInputs(room, p);
    const end = applyAction(room.game, room.game.playerIds[0], { type: 'restart' });
    room.rewind = { id: (room.rewindSeq = (room.rewindSeq ?? 0) + 1), until: now() + rewindMs, end };
    room.manualPaused = false;
    const message = { type: 'replay', room: publicRoom(room), serverTime: now(), replay: { id: room.rewind.id, duration: rewindMs, end: clone(end) }, game: gameView(room) };
    for (const p of room.players) if (p.connected) send(p.ws, message);
  }
  function finishRewind(room) {
    room.game = room.rewind.end; room.rewind = null;
    room.status = 'PLAYING'; room.manualPaused = false; room.epoch++;
    updateAnimations(room); broadcast(room, 'snapshot');
  }
  function receive(ws, raw) {
    ws.data ??= {};
    const time = now();
    if (time - (ws.data.rateAt ?? -Infinity) >= 1000) { ws.data.rateAt = time; ws.data.rateCount = 0; }
    if (++ws.data.rateCount > 120) { error(ws, 'RATE_LIMIT', 'Too many requests.'); return; }
    if (typeof raw !== 'string' || raw.length > 4096) { error(ws, 'INVALID_MESSAGE', 'Send a JSON message smaller than 4 KB.'); return; }
    let message;
    try { message = JSON.parse(raw); } catch { error(ws, 'INVALID_MESSAGE', 'Invalid JSON.'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') { error(ws, 'INVALID_MESSAGE', 'Invalid message.'); return; }
    const membership = member(ws);
    if (['create', 'join', 'resume'].includes(message.type)) {
      if (membership) { error(ws, 'ALREADY_JOINED', 'Leave the current room first.'); return; }
      if (message.type === 'create') {
        if (time - (ws.data.createAt ?? -Infinity) >= 60000) { ws.data.createAt = time; ws.data.createCount = 0; }
        if (++ws.data.createCount > 10) { error(ws, 'CREATE_LIMIT', 'Wait before creating another room.'); return; }
        if (rooms.size >= maxRooms) { error(ws, 'ROOM_LIMIT', 'The server has no free rooms.'); return; }
        let code;
        do { code = Array.from(randomBytes(6), byte => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[byte % 36]).join(''); } while (rooms.has(code));
        const player = newPlayer(ws);
        const room = { code, hostId: player.id, players: [player], status: 'WAITING', game: null, startAt: null, suspended: false, manualPaused: false, epoch: 0, createdAt: time, lastBroadcast: time };
        rooms.set(code, room); attach(ws, room, player); joined(room, player); return;
      }
      const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
      if (!codePattern.test(code)) { error(ws, 'INVALID_CODE', 'Room codes have six letters or digits.'); return; }
      const room = rooms.get(code);
      if (!room) { error(ws, 'ROOM_NOT_FOUND', 'This room does not exist or has expired.'); return; }
      if (message.type === 'resume') {
        const player = room.players.find(p => p.id === message.playerId);
        const supplied = typeof message.token === 'string' ? Buffer.from(message.token) : Buffer.alloc(0);
        const expected = player ? Buffer.from(player.token) : Buffer.alloc(1);
        if (!player || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { error(ws, 'INVALID_SESSION', 'This session cannot reconnect.'); return; }
        if (player.connected) { error(ws, 'SESSION_ACTIVE', 'Waiting for the previous connection to close.'); return; }
        if (time - player.disconnectedAt >= reconnectMs) { error(ws, 'INVALID_SESSION', 'This session cannot reconnect.'); return; }
        attach(ws, room, player);
        room.suspended = room.players.some(p => !p.connected);
        if (lobbyStatuses.has(room.status)) readyRoom(room);
        joined(room, player); broadcast(room, room.game ? 'snapshot' : 'room'); return;
      }
      if (!lobbyStatuses.has(room.status)) { error(ws, 'ROOM_STARTED', 'This room has already started.'); return; }
      if (room.players.length >= 2) { error(ws, 'ROOM_FULL', 'This room already has two players.'); return; }
      if (time - room.createdAt >= roomTtlMs) { error(ws, 'ROOM_EXPIRED', 'This room has expired.'); return; }
      const player = newPlayer(ws); room.players.push(player); attach(ws, room, player); readyRoom(room); joined(room, player); return;
    }
    if (!membership) { error(ws, 'NOT_JOINED', 'Join a room first.'); return; }
    const { room, player } = membership;
    if (message.type === 'ping') { send(ws, { type: 'pong', serverTime: time }); return; }
    if (message.type === 'leave') { ws.data.roomCode = null; ws.data.playerId = null; removePlayer(room, player); send(ws, { type: 'left', serverTime: time }); return; }
    if (message.type === 'returnLobby') {
      if (room.status !== 'FINISHED') { error(ws, 'NOT_FINISHED', 'The session has not finished.'); return; }
      room.players = room.players.filter(p => p.connected);
      if (!room.players.some(p => p.id === room.hostId)) room.hostId = room.players[0].id;
      lobby(room); broadcast(room); return;
    }
    if (message.type === 'select') {
      if (!lobbyStatuses.has(room.status)) { error(ws, 'SELECTION_LOCKED', 'Characters are locked after starting.'); return; }
      if (typeof message.character !== 'string' || !Object.hasOwn(characters, message.character)) { error(ws, 'INVALID_CHARACTER', 'Choose Still or Bloom.'); return; }
      if (room.players.some(p => p !== player && p.character === message.character)) { error(ws, 'CHARACTER_TAKEN', 'Your partner has selected that character.'); return; }
      player.character = message.character; player.ready = false; readyRoom(room); broadcast(room); return;
    }
    if (message.type === 'ready') {
      if (!lobbyStatuses.has(room.status) || !player.character || typeof message.ready !== 'boolean') { error(ws, 'NOT_SELECTED', 'Choose a character before marking Ready.'); return; }
      player.ready = message.ready; readyRoom(room); broadcast(room); return;
    }
    if (message.type === 'start') {
      if (player.id !== room.hostId) { error(ws, 'HOST_ONLY', 'Only the host can start.'); return; }
      if (room.status !== 'READY') { error(ws, 'NOT_READY', 'Both players must be connected, selected and Ready.'); return; }
      initialize(room); return;
    }
    if (message.type === 'pause') {
      if (room.status !== 'PLAYING' || room.suspended || room.rewind || typeof message.paused !== 'boolean') { error(ws, 'NOT_PLAYING', 'This game cannot be paused now.'); return; }
      room.manualPaused = message.paused;
      if ((room.game.status === 'paused') !== message.paused) room.game = applyAction(room.game, room.game.playerIds[0], { type: 'pause' });
      updateAnimations(room);
      broadcast(room, 'snapshot'); return;
    }
    if (message.type === 'control') {
      if (player.id !== room.hostId) { error(ws, 'HOST_ONLY', 'Only the host can change the courtyard.'); return; }
      if (room.rewind) { error(ws, 'REWINDING', 'Time is already flowing back.'); return; }
      if (!['restart', 'next', 'level'].includes(message.action) || !room.game || room.suspended || room.players.length !== 2 || !room.players.every(p => p.connected) || !['PLAYING', 'FINISHED'].includes(room.status)) { error(ws, 'INVALID_CONTROL', 'That control is unavailable.'); return; }
      // Level select: the host picks a courtyard and the server moves both players there together.
      const action = message.action === 'level' ? { type: 'level', level: message.level } : { type: message.action };
      if (!validateAction(room.game, player.id, action).valid) { error(ws, 'INVALID_CONTROL', 'That control is unavailable.'); return; }
      if (action.type === 'restart') { startRewind(room); return; }
      room.game = applyAction(room.game, player.id, action); room.status = 'PLAYING'; room.manualPaused = false; room.epoch++; updateAnimations(room); broadcast(room, 'snapshot'); return;
    }
    if (message.type !== 'input') { error(ws, 'INVALID_MESSAGE', 'Unknown request.'); return; }
    const { seq } = message;
    if (!Number.isSafeInteger(seq) || seq <= 0 || seq <= player.lastSeq) { error(ws, 'INVALID_SEQUENCE', 'Input is duplicate or out of order.', seq); return; }
    player.lastSeq = seq;
    const action = message.action;
    if (!action || typeof action !== 'object' || Array.isArray(action) || !inputTypes.has(action.type) || (action.actor !== undefined && action.actor !== actorOf(player))) { error(ws, 'INVALID_ACTION', 'You may control only your own character.', seq); return; }
    if (room.status !== 'PLAYING' || room.suspended || room.rewind) { error(ws, 'NOT_PLAYING', 'Wait until both players are playing.', seq); return; }
    // Inputs already in flight when either player paused are acknowledged without moving the world.
    if (room.game.status === 'paused') return;
    const authoritativeAction = { type: action.type, actor: actorOf(player), ...(action.type === 'move' ? { dir: action.dir } : {}) };
    if (action.type === 'ability') Object.assign(authoritativeAction, { target: action.target, x: action.x, y: action.y, area: action.area });
    if (action.type === 'grab' && action.aim !== undefined) authoritativeAction.aim = action.aim; // an aimed throw
    const result = validateAction(room.game, player.id, authoritativeAction);
    if (!result.valid) { error(ws, result.error, 'That action is unavailable.', seq); return; }
    const casting = action.type === 'ability' && action.area === undefined;
    const castTarget = casting && typeof action.target === 'string' ? action.target : null;
    room.game = applyAction(room.game, player.id, authoritativeAction);
    updateAnimations(room, casting ? actorOf(player) : null, castTarget);
    if (action.type === 'ability' && action.area !== undefined) broadcast(room, 'snapshot');
  }
  function disconnect(ws) {
    const membership = member(ws); if (!membership) return;
    const { room, player } = membership;
    stopInputs(room, player); player.connected = false; player.ready = false; player.disconnectedAt = now(); player.ws = null;
    if (room.status === 'STARTING') lobby(room);
    else if (room.status === 'PLAYING' || room.status === 'FINISHED') { for (const p of room.players) stopInputs(room, p); room.suspended = true; }
    else if (lobbyStatuses.has(room.status)) readyRoom(room);
    broadcast(room, room.game ? 'snapshot' : 'room');
  }
  function advance(time = now()) {
    accumulator += Math.max(0, Math.min(100, time - lastAdvance)); lastAdvance = time;
    let ticks = 0; while (accumulator >= 1000 / 60 && ticks < 6) { accumulator -= 1000 / 60; ticks++; }
    for (const room of rooms.values()) {
      const expired = room.players.filter(p => !p.connected && time - p.disconnectedAt >= reconnectMs);
      if (expired.length) {
        if (room.game && room.status !== 'FINISHED') { room.status = 'FINISHED'; room.suspended = true; broadcast(room, 'snapshot'); }
        if (!room.game) for (const player of expired) removePlayer(room, player);
        if (room.players.every(p => !p.connected)) { rooms.delete(room.code); continue; }
      }
      if (lobbyStatuses.has(room.status) && time - room.createdAt >= roomTtlMs) {
        for (const player of room.players) { error(player.ws, 'ROOM_EXPIRED', 'The waiting room has expired.'); if (player.ws) { player.ws.data.roomCode = null; player.ws.data.playerId = null; } }
        rooms.delete(room.code); continue;
      }
      if (room.status === 'STARTING' && time >= room.startAt) { room.status = 'PLAYING'; broadcast(room, 'snapshot'); }
      if (room.rewind) { if (time >= room.rewind.until) finishRewind(room); }
      else if (room.status === 'PLAYING' && !room.suspended && !room.manualPaused) {
        for (let i = 0; i < ticks && room.game.status === 'playing'; i++) { room.game = applyAction(room.game, room.game.playerIds[0], { type: 'tick' }); updateAnimations(room); }
        if (room.game.status === 'won') { room.status = 'FINISHED'; broadcast(room, 'snapshot'); }
      }
      if (room.game && room.players.some(player => player.connected) && time - room.lastBroadcast >= 50) { room.lastBroadcast = time; broadcast(room, 'snapshot'); }
    }
  }
  return { rooms, receive, disconnect, advance, publicRoom, gameView };
}
