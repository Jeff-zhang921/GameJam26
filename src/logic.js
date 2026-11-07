export const meta = {
  name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
  controls: { speed: 4.2, jump: -12.5, gravity: 0.48, coyote: 7, jumpBuffer: 7, range: 420 },
};

const LEVELS = [
  {
    id: 'stillwater', floor: 520,
    platforms: [{ x: 0, y: 520, w: 435, h: 160 }, { x: 795, y: 430, w: 485, h: 220 }],
    spawn: [{ x: 180, y: 520 }, { x: 250, y: 520 }],
    crates: [{ x: 350, y: 493 }], trees: [], plates: [], exit: { x: 1160, y: 430 },
    shards: [{ x: 620, y: 300 }], need: ['frozenTouched'],
  },
  {
    id: 'rootrise', floor: 540,
    platforms: [{ x: 0, y: 540, w: 1280, h: 120 }, { x: 760, y: 290, w: 520, h: 360 }],
    spawn: [{ x: 195, y: 540 }, { x: 270, y: 540 }],
    crates: [], trees: [{ x: 540, base: 540, age: 0, barrier: false }], plates: [],
    exit: { x: 1160, y: 290 }, shards: [{ x: 580, y: 240 }], need: ['treeLifted'],
  },
  {
    id: 'afterfall', floor: 520,
    platforms: [{ x: 0, y: 520, w: 1280, h: 140 }],
    spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
    crates: [{ x: 400, y: 493 }], trees: [{ x: 660, base: 520, age: 2, barrier: true }], plates: [],
    exit: { x: 1160, y: 520 }, shards: [{ x: 665, y: 255 }], need: ['decayed'],
  },
  {
    id: 'yesterday', floor: 520,
    platforms: [{ x: 0, y: 520, w: 560, h: 160 }, { x: 850, y: 390, w: 430, h: 260 }],
    spawn: [{ x: 335, y: 520 }, { x: 240, y: 520 }],
    crates: [{ x: 390, y: 493 }], trees: [{ x: 475, base: 520, age: 0, barrier: false }],
    plates: [{ x: 240, y: 520, w: 80 }], exit: { x: 1160, y: 390 },
    shards: [{ x: 740, y: 225 }], need: ['treeLifted', 'frozenTouched', 'echoPlate'],
  },
];

const HEIGHTS = [24, 95, 170, 235, 12];
const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rectOverlap = (a, b) => a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;

function makeLevel(index, players, unlocked, totalShards, collected = [false, false, false, false]) {
  const level = LEVELS[index];
  return {
    level: index, levelId: level.id, unlocked, totalShards, collected: clone(collected), tick: 0, status: 'playing', active: 0,
    playerIds: players, width: 1280, height: 640,
    actors: level.spawn.map((p, i) => ({ id: i, x: p.x, y: p.y, vx: 0, vy: 0, facing: 1, grounded: true, on: 'ground', coyote: 7, jumpBuffer: 0, move: 0, carrying: null, spawnX: p.x, spawnY: p.y })),
    platforms: clone(level.platforms),
    crates: level.crates.map((p, i) => ({ id: `crate-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, frozen: false, held: null, w: 54, h: 54, spawnX: p.x, spawnY: p.y })),
    trees: level.trees.map((p, i) => ({ id: `tree-${i}`, x: p.x, base: p.base, y: p.base - HEIGHTS[p.age], age: p.age, height: HEIGHTS[p.age], barrier: p.barrier, frozen: false })),
    plates: level.plates.map((p, i) => ({ ...p, id: `plate-${i}`, lit: false })),
    exit: clone(level.exit), shards: level.shards.map((p, i) => ({ ...p, id: i, taken: false })),
    echoes: [], flags: { frozenTouched: false, treeLifted: false, decayed: false, echoPlate: false },
    needs: clone(level.need), events: [], eventSeq: 0, history: [], rewinds: 0, falls: 0,
  };
}

export function setup(options = {}) {
  const players = Array.isArray(options.players) && options.players.length ? options.players.slice(0, 2).map(p => typeof p === 'string' ? p : p.id) : ['local'];
  const level = Number.isInteger(options.level) ? Math.max(0, Math.min(3, options.level)) : 0;
  return makeLevel(level, players, level, 0);
}

function actorAllowed(state, playerId, actor) {
  const index = state.playerIds.indexOf(playerId);
  return index >= 0 && (state.playerIds.length === 1 || actor === index);
}

function targetFor(state, actor, action) {
  const p = state.actors[actor];
  const source = actor === 0 ? state.crates.filter(c => c.held === null) : state.trees;
  const candidates = source.filter(o => dist(p, { x: o.x, y: o.base ?? o.y }) <= meta.controls.range);
  if (action.target) return candidates.find(o => o.id === action.target);
  candidates.sort((a, b) => dist(p, { x: a.x, y: a.base ?? a.y }) - dist(p, { x: b.x, y: b.base ?? b.y }));
  return candidates[0];
}

export function validateAction(state, playerId, action) {
  const no = error => ({ valid: false, error });
  if (!state || !action || typeof action !== 'object' || Array.isArray(action)) return no('invalid');
  if (!state.playerIds.includes(playerId)) return no('player');
  if (['tick', 'switch', 'pause', 'restart', 'rewind', 'next', 'level'].includes(action.type)) {
    if (action.type === 'tick' && playerId !== state.playerIds[0]) return no('host');
    if (action.type === 'next' && state.status !== 'won') return no('unfinished');
    if (action.type === 'level' && (!Number.isInteger(action.level) || action.level < 0 || action.level > state.unlocked || action.level > 3)) return no('locked');
    if (action.type === 'rewind' && !state.history.length) return no('history');
    return { valid: true };
  }
  if (state.status !== 'playing') return no('paused');
  if (!Number.isInteger(action.actor) || action.actor < 0 || action.actor > 1 || !actorAllowed(state, playerId, action.actor)) return no('role');
  if (action.type === 'move') return [-1, 0, 1].includes(action.dir) ? { valid: true } : no('invalid');
  if (['jump', 'echo'].includes(action.type)) return { valid: true };
  if (action.type === 'grab') {
    const p = state.actors[action.actor];
    if (p.carrying !== null || state.crates.some(c => c.held === null && dist(p, c) < 95)) return { valid: true };
    return no('crateRange');
  }
  if (action.type === 'ability') {
    if (action.target !== undefined && typeof action.target !== 'string') return no('invalid');
    if (action.reverse !== undefined && typeof action.reverse !== 'boolean') return no('invalid');
    const target = targetFor(state, action.actor, action);
    if (!target) return no(action.actor === 0 ? 'freezeRange' : 'treeRange');
    if (action.actor === 1 && ((target.age === 4 && !action.reverse) || (target.age === 0 && action.reverse))) return no('treeEnd');
    return { valid: true };
  }
  return no('invalid');
}

function event(state, kind, x, y) {
  state.events.push({ id: ++state.eventSeq, kind, x, y, tick: state.tick });
  if (state.events.length > 10) state.events.shift();
}

function surfaces(state) {
  const result = state.platforms.map((p, i) => ({ ...p, id: `platform-${i}` }));
  for (const c of state.crates) if (c.held === null) result.push({ id: c.id, x: c.x - 27, y: c.y - 27, w: 54, h: 54 });
  for (const t of state.trees) if (t.age < 4) result.push({ id: t.id, x: t.x - 69, y: t.base - t.height, w: 138, h: 16 });
  return result;
}

function remember(state) {
  if (state.tick % 10 !== 0) return;
  state.history.push({ actors: clone(state.actors), crates: clone(state.crates), trees: clone(state.trees), echoes: clone(state.echoes), flags: clone(state.flags), shards: clone(state.shards), tick: state.tick });
  if (state.history.length > 19) state.history.shift();
}

function tick(state) {
  remember(state);
  state.tick++;
  for (const tree of state.trees) {
    const target = HEIGHTS[tree.age];
    const before = tree.height;
    if (!tree.frozen) tree.height += Math.sign(target - tree.height) * Math.min(Math.abs(target - tree.height), 2.2);
    const rise = tree.height - before;
    tree.y = tree.base - tree.height;
    for (const p of state.actors) if (p.on === tree.id && p.grounded && rise !== 0) {
      p.y -= rise;
      if (rise > 0.1) state.flags.treeLifted = true;
    }
  }
  for (const c of state.crates) {
    if (c.held !== null) {
      const p = state.actors[c.held];
      c.x = p.x + p.facing * 37; c.y = p.y - 53; c.vx = 0; c.vy = 0;
      continue;
    }
    if (c.frozen) continue;
    const previous = c.y + 27;
    c.vy += 0.3; c.x += c.vx; c.y += c.vy;
    for (const f of state.platforms) if (c.vy >= 0 && previous <= f.y + 1 && c.y + 27 >= f.y && c.x + 27 > f.x && c.x - 27 < f.x + f.w) {
      c.y = f.y - 27; c.vy = 0; c.vx *= 0.88;
    }
    if (c.y > 720 || c.x < 20 || c.x > 1260) { c.x = c.spawnX; c.y = c.spawnY; c.vx = 0; c.vy = 0; event(state, 'return', c.x, c.y); }
  }
  const solid = surfaces(state);
  for (const p of state.actors) {
    if (p.grounded) p.coyote = meta.controls.coyote; else p.coyote--;
    if (p.jumpBuffer > 0) p.jumpBuffer--;
    if (p.jumpBuffer > 0 && p.coyote > 0) { p.vy = meta.controls.jump; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; event(state, 'jump', p.x, p.y); }
    p.vx = p.move * meta.controls.speed;
    if (p.move) p.facing = p.move;
    const oldX = p.x;
    p.x = Math.max(22, Math.min(1258, p.x + p.vx));
    for (const f of state.platforms) {
      const body = { x: p.x - 15, y: p.y - 52, w: 30, h: 51 };
      if (rectOverlap(body, f) && p.y > f.y + 9) p.x = oldX;
    }
    for (const tree of state.trees) if (tree.barrier && tree.age < 4) {
      const body = { x: p.x - 15, y: p.y - 52, w: 30, h: 51 };
      if (rectOverlap(body, { x: tree.x - 42, y: tree.base - tree.height, w: 84, h: tree.height })) p.x = oldX;
    }
    const previousY = p.y;
    p.vy += meta.controls.gravity;
    p.y += p.vy;
    p.grounded = false; p.on = null;
    for (const f of solid) {
      if (f.id === p.carrying) continue;
      if (p.vy >= 0 && previousY <= f.y + 5 && p.y >= f.y && p.x + 15 > f.x && p.x - 15 < f.x + f.w) {
        p.y = f.y; p.vy = 0; p.grounded = true; p.on = f.id;
        const crate = state.crates.find(c => c.id === f.id);
        if (crate?.frozen) state.flags.frozenTouched = true;
      }
    }
    if (p.y > 710) {
      p.x = p.spawnX; p.y = p.spawnY; p.vy = 0; p.grounded = true; p.on = 'ground'; state.falls++;
      event(state, 'return', p.x, p.y);
    }
    for (const shard of state.shards) if (!shard.taken && dist({ x: p.x, y: p.y - 28 }, shard) < 42) {
      shard.taken = true; event(state, 'shard', shard.x, shard.y);
    }
  }
  for (const plate of state.plates) {
    const occupants = [...state.actors, ...state.echoes];
    plate.lit = occupants.some(p => Math.abs(p.x - plate.x) < plate.w / 2 + 12 && Math.abs(p.y - plate.y) < 14);
    if (state.echoes.some(p => Math.abs(p.x - plate.x) < plate.w / 2 + 12 && Math.abs(p.y - plate.y) < 14)) state.flags.echoPlate = true;
  }
  const ready = state.needs.every(key => state.flags[key]) && state.plates.every(p => p.lit);
  if (ready && state.actors.some(p => Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55)) {
    state.status = 'won'; state.unlocked = Math.max(state.unlocked, Math.min(3, state.level + 1));
    if (state.shards.some(s => s.taken)) state.collected[state.level] = true;
    state.totalShards = state.collected.filter(Boolean).length;
    for (const p of state.actors) p.move = 0;
    event(state, 'win', state.exit.x, state.exit.y - 45);
  }
}

export function applyAction(state, playerId, action) {
  if (!validateAction(state, playerId, action).valid) return state;
  if (action.type === 'restart') return makeLevel(state.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'level') return makeLevel(action.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'next') return makeLevel((state.level + 1) % 4, state.playerIds, state.unlocked, state.totalShards, state.collected);
  const s = clone(state);
  if (action.type === 'tick') { if (s.status === 'playing') tick(s); return s; }
  if (action.type === 'pause') { if (s.status !== 'won') s.status = s.status === 'paused' ? 'playing' : 'paused'; for (const p of s.actors) p.move = 0; return s; }
  if (action.type === 'switch') { s.active = 1 - s.active; return s; }
  if (action.type === 'rewind') {
    const frame = s.history[0];
    Object.assign(s, clone(frame)); s.history = []; s.status = 'playing'; s.rewinds++;
    for (const p of s.actors) p.move = 0;
    event(s, 'rewind', s.actors[s.active].x, s.actors[s.active].y - 30);
    return s;
  }
  const p = s.actors[action.actor];
  if (action.type === 'move') p.move = action.dir;
  if (action.type === 'jump') p.jumpBuffer = meta.controls.jumpBuffer;
  if (action.type === 'grab') {
    if (p.carrying !== null) {
      const c = s.crates.find(c => c.id === p.carrying);
      c.held = null; c.frozen = false; c.x = p.x + p.facing * 48; c.y = p.y - 48; c.vx = p.facing * 6.8; c.vy = -6;
      p.carrying = null; event(s, 'throw', c.x, c.y);
    } else {
      const c = s.crates.filter(c => c.held === null && dist(p, c) < 95).sort((a, b) => dist(p, a) - dist(p, b))[0];
      c.held = action.actor; c.frozen = false; p.carrying = c.id; event(s, 'grab', c.x, c.y);
    }
  }
  if (action.type === 'ability') {
    const target = targetFor(s, action.actor, action);
    if (action.actor === 0) { target.frozen = !target.frozen; event(s, target.frozen ? 'freeze' : 'unfreeze', target.x, target.y); }
    else { target.age += action.reverse ? -1 : 1; if (target.age === 4) s.flags.decayed = true; event(s, action.reverse ? 'regrow' : 'grow', target.x, target.base - target.height); }
  }
  if (action.type === 'echo') {
    s.echoes = s.echoes.filter(e => e.actor !== action.actor);
    s.echoes.push({ actor: action.actor, x: p.x, y: p.y, facing: p.facing, tick: s.tick });
    event(s, 'echo', p.x, p.y - 25);
  }
  return s;
}

export function isGameOver(state) { return state.status === 'won' ? { winner: 'together', level: state.level, complete: state.level === 3 } : null; }
export function viewFor(state, playerId) { return state.playerIds.includes(playerId) ? clone(state) : null; }
