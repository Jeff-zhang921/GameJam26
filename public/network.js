import { applyAction, validateAction, heldPosition } from '../src/logic.js';

const predictionActions = new Set(['move', 'jump', 'jumpRelease', 'grab', 'plant', 'takeSeed']);
const sessionKey = 'moonclock-online';
export function interpolateGame(older, newer, alpha, ownActor) {
  const game = { ...newer, actors: newer.actors.map(actor => ({ ...actor })) };
  if (older.level !== newer.level) return game;
  for (let i = 0; i < game.actors.length; i++) {
    if (i === ownActor) continue;
    const a = older.actors[i], b = game.actors[i];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 150) continue;
    b.x = a.x + (b.x - a.x) * alpha; b.y = a.y + (b.y - a.y) * alpha;
  }
  return game;
}

// Carried items are drawn from their carrier's *rendered* transform, never from their own (stale) snapshot
// coordinates. The server still owns who carries what; `predicted` only covers this client's own pending
// pickups and throws so they feel immediate.
export function attachCarried(game, predicted = null, ownActor = null) {
  const local = predicted && ownActor !== null ? new Map(predicted.objects.map(o => [o.id, o])) : null;
  let carrying = game.actors[ownActor]?.carrying ?? null;
  game.objects = game.objects.map(o => {
    const mine = local?.get(o.id);
    let view = o;
    if (mine && mine.held === ownActor && (o.held === null || o.held === undefined)) { view = { ...o, held: ownActor }; carrying = o.id; }
    else if (mine && o.held === ownActor && mine.held !== ownActor) { view = { ...o, held: null, x: mine.x, y: mine.y, vx: mine.vx, vy: mine.vy }; if (carrying === o.id) carrying = null; }
    if (view.held === null || view.held === undefined) return view;
    const carrier = game.actors[view.held];
    return carrier ? { ...view, ...heldPosition(view, carrier), vx: 0, vy: 0 } : view;
  });
  // A predicted object the snapshot does not have yet (a seed just taken in hand) shows up held too.
  const carrier = game.actors[ownActor];
  if (local && carrier) {
    const known = new Set(game.objects.map(o => o.id));
    for (const o of predicted.objects) if (o.held === ownActor && !known.has(o.id)) { game.objects.push({ ...o, ...heldPosition(o, carrier), vx: 0, vy: 0 }); carrying = o.id; }
    game.actors[ownActor] = { ...carrier, carrying };
  }
  return game;
}

export function createNetwork({ onRoom, onState, onConnection, onError, onReplay }) {
  let socket, generation = 0, retryTimer, reconnectAttempt = 0, credentials = null, pendingIntent = null;
  let room = null, playerId = null, actor = 0, connected = false, active = false, seq = 0;
  let latest = null, predicted = null, pending = [], frames = [], accumulator = 0, epoch = null;
  let renderActor = null, lastMove = null;
  const shownObjects = new Map(), objectOffsets = new Map();
  let rebased = false;
  let lastMessage = Date.now();
  setInterval(() => {
    if (!active || socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastMessage > 10000) socket.close();
    else if (connected) send({ type: 'ping' });
  }, 3000);
  function save() {
    try { if (credentials) sessionStorage.setItem(sessionKey, JSON.stringify(credentials)); else sessionStorage.removeItem(sessionKey); } catch { }
  }
  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message)); return true;
  }
  function adoptRoom(value, serverTime) {
    room = value;
    const character = room.players.find(p => p.id === playerId)?.character;
    if (character) actor = character === 'still' ? 0 : 1;
    onRoom(room, playerId, serverTime);
  }
  function predict(action) {
    if (predicted && predictionActions.has(action.type) && validateAction(predicted, playerId, action).valid) predicted = applyAction(predicted, playerId, action);
  }
  function connect(intent) {
    clearTimeout(retryTimer);
    if (navigator.onLine === false) { pendingIntent = intent; active = true; connected = false; onConnection(intent.type === 'resume' ? 'reconnecting' : 'connecting'); onConnection('offline'); onError('You are offline. Online rooms need an internet connection.'); return; }
    pendingIntent = null;
    const ownGeneration = ++generation;
    socket?.close(); connected = false; active = true; lastMove = null;
    onConnection(intent.type === 'resume' ? 'reconnecting' : 'connecting');
    const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url);
    lastMessage = Date.now();
    socket.addEventListener('open', () => { if (ownGeneration === generation) send(intent); });
    socket.addEventListener('message', event => {
      if (ownGeneration !== generation) return;
      lastMessage = Date.now();
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'joined') {
        playerId = message.playerId; seq = Math.max(seq, message.lastSeq || 0);
        credentials = { type: 'resume', code: message.room.code, playerId, token: message.token };
        save(); connected = true; reconnectAttempt = 0; onConnection('connected');
        adoptRoom(message.room, message.serverTime);
      } else if (message.type === 'room') {
        adoptRoom(message.room, message.serverTime);
      } else if (message.type === 'replay') {
        // The server started the shared rewind; both screens play it from their own recorded history.
        pending = []; lastMove = null;
        adoptRoom(message.room, message.serverTime);
        onReplay?.(message.replay, message.game);
      } else if (message.type === 'snapshot') {
        const changedScene = epoch !== message.room.epoch;
        if (changedScene) { frames = []; pending = []; renderActor = null; lastMove = null; }
        epoch = message.room.epoch; latest = message.game;
        if (latest.status !== 'playing' || message.room.suspended) lastMove = null;
        pending = pending.filter(input => input.seq > (message.ack?.[playerId] ?? 0));
        predicted = latest; rebased = true;
        if (changedScene) { shownObjects.clear(); objectOffsets.clear(); }
        for (const input of pending) predict(input.action);
        frames.push({ game: latest, at: performance.now() });
        if (frames.length > 8) frames.shift();
        accumulator = 0;
        adoptRoom(message.room, message.serverTime);
        onState(latest, { epoch, changedScene });
      } else if (message.type === 'error') {
        if (message.seq !== undefined) pending = pending.filter(input => input.seq !== message.seq);
        if (message.code === 'SESSION_ACTIVE' && intent.type === 'resume') { socket.close(); return; }
        if (['INVALID_SESSION', 'ROOM_EXPIRED', 'ROOM_NOT_FOUND'].includes(message.code) && intent.type === 'resume') {
          credentials = null; save(); generation++; socket.close(); connected = false; onConnection('offline');
        } else if (!credentials) onConnection('connected');
        onError(message.message || 'The room request could not be completed.', message.code);
      }
    });
    socket.addEventListener('close', () => {
      if (ownGeneration !== generation || !active) return;
      connected = false; lastMove = null; pending = []; frames = []; predicted = latest;
      onConnection(navigator.onLine === false ? 'offline' : credentials ? 'reconnecting' : 'offline');
      if (credentials && reconnectAttempt < 12 && navigator.onLine !== false) {
        retryTimer = setTimeout(() => { reconnectAttempt++; connect(credentials); }, Math.min(5000, 500 * 2 ** Math.min(4, reconnectAttempt)));
      } else onError('Connection lost. Retry, or leave this room.');
    });
    socket.addEventListener('error', () => {});
  }
  // Loose objects (thrown crates, platforms, creatures) are drawn from the locally simulated world, which
  // advances every frame at 60 Hz, instead of stepping between 20 Hz snapshots. When a snapshot rebases
  // that world, the small jump is turned into an offset that fades out, so nothing lags or teleports.
  function smoothObjects(game, dt) {
    const local = new Map(predicted.objects.map(o => [o.id, o])), decay = Math.exp(-dt / .08), seen = new Set();
    game.objects = game.objects.map(o => {
      const mine = local.get(o.id);
      if (!mine || (o.held !== null && o.held !== undefined) || !Number.isFinite(mine.x) || !Number.isFinite(mine.y)) return o;
      seen.add(o.id);
      let offset = objectOffsets.get(o.id) || { x: 0, y: 0 };
      const last = shownObjects.get(o.id);
      if (rebased && last) offset = { x: last.x - mine.x, y: last.y - mine.y };
      else offset = { x: offset.x * decay, y: offset.y * decay };
      if (Math.hypot(offset.x, offset.y) > 80) offset = { x: 0, y: 0 }; // a real reset: snap
      const shown = { x: mine.x + offset.x, y: mine.y + offset.y };
      objectOffsets.set(o.id, offset); shownObjects.set(o.id, shown);
      return { ...o, x: shown.x, y: shown.y };
    });
    for (const id of [...shownObjects.keys()]) if (!seen.has(id)) { shownObjects.delete(id); objectOffsets.delete(id); }
    rebased = false;
  }
  function action(value) {
    if (!connected || !room || room.suspended) return false;
    if (value.type === 'pause') return send({ type: 'pause', paused: latest?.status !== 'paused' });
    if (['restart', 'next'].includes(value.type)) return send({ type: 'control', action: value.type });
    if (value.type === 'level') return Number.isInteger(value.level) && send({ type: 'control', action: 'level', level: value.level });
    if (!['move', 'jump', 'jumpRelease', 'grab', 'plant', 'takeSeed', 'ability'].includes(value.type) || room.status !== 'PLAYING' || room.rewinding || latest?.status !== 'playing') return false;
    const input = { ...value, actor };
    if (input.type === 'move' && input.dir === lastMove) return true;
    if (input.type === 'move') lastMove = input.dir;
    const message = { type: 'input', seq: ++seq, action: input };
    if (!send(message)) return false;
    pending.push(message);
    if (pending.length > 120) { socket.close(); return false; }
    predict(input); return true;
  }
  function wake() {
    if (!active || navigator.onLine === false) return;
    if (socket?.readyState === WebSocket.OPEN) {
      if (Date.now() - lastMessage > 10000) socket.close();
      else send({ type: 'ping' });
    } else if ((credentials || pendingIntent) && socket?.readyState !== WebSocket.CONNECTING) { reconnectAttempt = 0; connect(credentials || pendingIntent); }
  }
  window.addEventListener('online', wake);
  window.addEventListener('offline', () => { if (active) { socket?.close(); connected = false; onConnection('offline'); } });
  return {
    get room() { return room; }, get playerId() { return playerId; }, get actor() { return actor; },
    get active() { return active; }, get connected() { return connected; },
    get host() { return room?.hostId === playerId; }, get latest() { return latest; },
    // This client's own character as locally predicted (ahead of snapshots): used to gate touch jumps.
    get predicted() { return predicted; },
    get ownActor() { return predicted?.actors?.[actor] ?? latest?.actors?.[actor] ?? null; },
    create() { credentials = null; seq = 0; save(); connect({ type: 'create' }); },
    join(code) { credentials = null; seq = 0; save(); connect({ type: 'join', code: code.trim().toUpperCase() }); },
    restore() {
      try { credentials = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { }
      if (!credentials?.code || !credentials?.playerId || !credentials?.token) return false;
      connect(credentials); return true;
    },
    selectCharacter(character) { send({ type: 'select', character }); },
    setReady(ready) { send({ type: 'ready', ready }); }, start() { send({ type: 'start' }); },
    returnToLobby() { send({ type: 'returnLobby' }); },
    retry() { reconnectAttempt = 0; if (credentials || pendingIntent) connect(credentials || pendingIntent); },
    wake,
    leave() {
      send({ type: 'leave' }); active = connected = false; generation++; clearTimeout(retryTimer); socket?.close();
      credentials = pendingIntent = null; room = null; playerId = null; latest = predicted = renderActor = null; frames = []; pending = []; epoch = null; save();
    },
    action,
    pause(paused) { return connected && send({ type: 'pause', paused }); },
    render(dt, now = performance.now()) {
      if (!latest) return null;
      let game = { ...latest, actors: latest.actors.map(p => ({ ...p })) };
      if (connected && room.status === 'PLAYING' && !room.suspended && latest.status === 'playing') {
        accumulator += Math.min(.1, dt);
        const maxTick = latest.tick + 6;
        while (accumulator >= 1 / 60 && predicted.tick < maxTick) {
          predicted = applyAction(predicted, predicted.playerIds[0], { type: 'tick' }); accumulator -= 1 / 60;
        }
        const delayed = now - 100;
        let a = frames[0], b = frames[0];
        for (const frame of frames) { if (frame.at <= delayed) a = frame; if (frame.at >= delayed) { b = frame; break; } b = frame; }
        if (a && b) game = interpolateGame(a.game, b.game, a === b ? 1 : Math.max(0, Math.min(1, (delayed - a.at) / (b.at - a.at))), actor);
        // Keep positions smoothed, but show casts and cancellations as soon as the server confirms them.
        if (game.freezeAreas !== latest.freezeAreas) {
          game.freezeAreas = latest.freezeAreas; game.freezeCharges = latest.freezeCharges;
          game.bloomCharges = latest.bloomCharges; game.pickups = latest.pickups;
          const slowed = new Set(latest.objects.filter(o => o.frozen).map(o => o.id));
          game.objects = game.objects.map(o => {
            const frozen = slowed.has(o.id);
            return o.frozen === frozen ? o : { ...o, frozen };
          });
        }
        const desired = predicted.actors[actor];
        if (!renderActor || Math.hypot(renderActor.x - desired.x, renderActor.y - desired.y) > 80) renderActor = { x: desired.x, y: desired.y };
        else {
          const amount = 1 - Math.exp(-dt / .035);
          renderActor.x += (desired.x - renderActor.x) * amount; renderActor.y += (desired.y - renderActor.y) * amount;
        }
        Object.assign(game.actors[actor], { x: renderActor.x, y: renderActor.y, facing: desired.facing });
        smoothObjects(game, dt);
        attachCarried(game, predicted, actor);
      } else { renderActor = null; attachCarried(game); }
      game.active = actor; return game;
    },
  };
}
