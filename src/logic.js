export const meta = {
  name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
  controls: { speed: 4.2, jump: -12.5, springJump: -15.3, gravity: 0.48, coyote: 7, jumpBuffer: 7, range: 420, reach: 95, pitReach: 50 },
  time: { stageTicks: 480, moverSpeed: 1, maxGear: 3, rewinds: 3, hintTicks: 90 * 60 },
};

export const STAGES = ['seed', 'sprout', 'sapling', 'grown', 'withered'];
const HEIGHTS = [6, 30, 80, 235, 200];
const CANOPY = [0, 60, 110, 138, 50];
const STILL = 0, BLOOM = 1;

const LEVELS = [
  {
    id: 'stillwater',
    platforms: [{ x: 0, y: 520, w: 435, h: 160 }, { x: 795, y: 430, w: 485, h: 220 }],
    spawn: [{ x: 180, y: 520 }, { x: 250, y: 520 }],
    crates: [{ x: 350, y: 493 }], seeds: [], pits: [], plants: [], movers: [],
    exit: { x: 1160, y: 430 }, shards: [{ x: 620, y: 300 }], need: ['frozenTouched'],
  },
  {
    id: 'rootrise',
    platforms: [{ x: 0, y: 540, w: 1280, h: 120 }, { x: 760, y: 290, w: 520, h: 360 }],
    spawn: [{ x: 195, y: 540 }, { x: 270, y: 540 }],
    crates: [], seeds: [{ x: 90, y: 530 }, { x: 380, y: 530 }], pits: [{ x: 600, y: 540 }], plants: [], movers: [],
    exit: { x: 1160, y: 290 }, shards: [{ x: 600, y: 250 }], need: ['treeLifted'],
  },
  {
    id: 'afterbloom',
    platforms: [{ x: 0, y: 520, w: 1280, h: 140 }, { x: 1000, y: 265, w: 280, h: 400 }],
    spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
    crates: [], seeds: [{ x: 330, y: 510 }], pits: [{ x: 600, y: 520 }, { x: 880, y: 520 }],
    plants: [{ pit: 0, stage: 3, barrier: true }], movers: [],
    exit: { x: 1160, y: 265 }, shards: [{ x: 880, y: 300 }], need: ['withered', 'sproutJump'],
  },
  {
    id: 'withtime',
    platforms: [{ x: 0, y: 520, w: 520, h: 160 }, { x: 1040, y: 300, w: 240, h: 400 }],
    spawn: [{ x: 250, y: 520 }, { x: 170, y: 520 }],
    crates: [{ x: 300, y: 493 }], seeds: [{ x: 110, y: 510 }, { x: 150, y: 510 }, { x: 480, y: 510 }],
    pits: [{ x: 400, y: 520 }, { x: 60, y: 520 }], plants: [],
    movers: [{ x1: 540, x2: 640, y: 290, w: 120 }],
    exit: { x: 1160, y: 300 }, shards: [{ x: 400, y: 240 }], need: ['treeLifted', 'moverRide', 'frozenTouched'],
  },
];

const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rectOverlap = (a, b) => a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;
const find = (state, id) => state.objects.find(o => o.id === id);
const free = o => o.held === undefined || o.held === null;

export function anchor(o) {
  if (o.kind === 'plant') return { x: o.x, y: o.base - o.height / 2 };
  if (o.kind === 'mover') return { x: o.x + o.w / 2, y: o.y + 10 };
  return { x: o.x, y: o.y };
}

function makePlant(id, pit, stage = 0, barrier = false) {
  pit.plant = id;
  return { kind: 'plant', id, pit: pit.id, x: pit.x, base: pit.y, stage, progress: 0, speed: 0, frozen: false, height: HEIGHTS[stage], barrier };
}

function makeLevel(index, players, unlocked, totalShards, collected = [false, false, false, false]) {
  const level = LEVELS[index];
  const pits = level.pits.map((p, i) => ({ id: `pit-${i}`, x: p.x, y: p.y, plant: null }));
  const objects = [
    ...level.crates.map((p, i) => ({ kind: 'crate', id: `crate-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, frozen: false, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.seeds.map((p, i) => ({ kind: 'seed', id: `seed-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.movers.map((p, i) => ({ kind: 'mover', id: `mover-${i}`, x: p.x1, y: p.y, w: p.w, x1: p.x1, x2: p.x2, dir: 1, speed: 0, frozen: false })),
    ...level.plants.map((p, i) => makePlant(`plant-${i}`, pits[p.pit], p.stage, p.barrier)),
  ];
  return {
    level: index, levelId: level.id, unlocked, totalShards, collected: clone(collected), tick: 0, status: 'playing', active: 0,
    playerIds: players, width: 1280, height: 640,
    actors: level.spawn.map((p, i) => ({ id: i, x: p.x, y: p.y, vx: 0, vy: 0, facing: 1, grounded: true, on: 'ground', coyote: 7, jumpBuffer: 0, move: 0, carrying: null, spawnX: p.x, spawnY: p.y })),
    platforms: clone(level.platforms), objects, pits, nextPlant: level.plants.length,
    exit: clone(level.exit), shards: level.shards.map((p, i) => ({ ...p, id: i, taken: false })),
    flags: { frozenTouched: false, treeLifted: false, withered: false, sproutJump: false, moverRide: false },
    needs: clone(level.need), needsDone: 0, events: [], eventSeq: 0, history: [], rewindsLeft: meta.time.rewinds,
    started: false, elapsed: 0, lastProgressTick: 0, falls: 0,
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

export function targetFor(state, actor, action = {}) {
  const p = state.actors[actor];
  const kinds = actor === STILL ? ['plant', 'mover', 'crate'] : ['plant', 'mover'];
  const candidates = state.objects.filter(o => kinds.includes(o.kind) && free(o) && dist(p, anchor(o)) <= meta.controls.range);
  if (action.target) return candidates.find(o => o.id === action.target);
  return candidates.sort((a, b) => dist(p, anchor(a)) - dist(p, anchor(b)))[0];
}

function pickable(state, p) {
  return state.objects.filter(o => (o.kind === 'crate' || o.kind === 'seed') && o.held === null && dist(p, o) < meta.controls.reach)
    .sort((a, b) => dist(p, a) - dist(p, b));
}

export function validateAction(state, playerId, action) {
  const no = error => ({ valid: false, error });
  if (!state || !action || typeof action !== 'object' || Array.isArray(action)) return no('invalid');
  if (!state.playerIds.includes(playerId)) return no('player');
  if (['tick', 'switch', 'pause', 'restart', 'rewind', 'next', 'level'].includes(action.type)) {
    if (action.type === 'tick' && playerId !== state.playerIds[0]) return no('host');
    if (action.type === 'next' && state.status !== 'won') return no('unfinished');
    if (action.type === 'level' && (!Number.isInteger(action.level) || action.level < 0 || action.level > state.unlocked || action.level > 3)) return no('locked');
    if (action.type === 'rewind' && state.rewindsLeft <= 0) return no('noRewinds');
    if (action.type === 'rewind' && !state.history.length) return no('history');
    return { valid: true };
  }
  if (state.status !== 'playing') return no('paused');
  if (!Number.isInteger(action.actor) || action.actor < 0 || action.actor > 1 || !actorAllowed(state, playerId, action.actor)) return no('role');
  if (action.type === 'move') return [-1, 0, 1].includes(action.dir) ? { valid: true } : no('invalid');
  if (action.type === 'jump') return { valid: true };
  if (action.type === 'grab') {
    const p = state.actors[action.actor];
    return p.carrying !== null || pickable(state, p).length ? { valid: true } : no('grabRange');
  }
  if (action.type === 'ability') {
    if (action.target !== undefined && typeof action.target !== 'string') return no('invalid');
    const target = targetFor(state, action.actor, action);
    if (!target) return no(action.actor === STILL ? 'freezeRange' : 'bloomRange');
    if (action.actor === BLOOM && target.frozen) return no('heldByStill');
    if (action.actor === BLOOM && target.kind === 'mover' && target.speed >= meta.time.maxGear) return no('moverMax');
    return { valid: true };
  }
  return no('invalid');
}

function event(state, kind, x, y) {
  state.events.push({ id: ++state.eventSeq, kind, x, y, tick: state.tick });
  if (state.events.length > 10) state.events.shift();
}

function advance(state, plant) {
  plant.stage++; plant.progress = 0;
  if (plant.barrier && plant.stage >= 4) state.flags.withered = true;
  if (plant.stage >= STAGES.length) {
    state.objects = state.objects.filter(o => o !== plant);
    state.pits.find(p => p.id === plant.pit).plant = null;
    event(state, 'vanish', plant.x, plant.base - plant.height);
  } else event(state, 'grow', plant.x, plant.base - plant.height);
}

function surfaces(state) {
  const result = state.platforms.map((p, i) => ({ ...p, id: `platform-${i}` }));
  for (const o of state.objects) {
    if (o.kind === 'crate' && o.held === null) result.push({ id: o.id, x: o.x - 27, y: o.y - 27, w: 54, h: 54 });
    if (o.kind === 'mover') result.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: 20 });
    if (o.kind === 'plant' && o.stage > 0) result.push({ id: o.id, x: o.x - CANOPY[o.stage] / 2, y: o.base - o.height, w: CANOPY[o.stage], h: 16, spring: o.stage === 1 });
  }
  return result;
}

function remember(state) {
  if (state.tick % 10 !== 0) return;
  state.history.push({ objects: clone(state.objects), pits: clone(state.pits), tick: state.tick });
  if (state.history.length > 19) state.history.shift();
}

function ageObjects(state) {
  for (const o of [...state.objects]) {
    if (o.kind === 'plant') {
      if (!o.frozen && o.speed > 0) {
        o.progress += o.speed / meta.time.stageTicks;
        if (o.progress >= 1 - 1e-9) advance(state, o);
        if (!state.objects.includes(o)) continue;
      }
      const before = o.height;
      if (!o.frozen) o.height += Math.sign(HEIGHTS[o.stage] - o.height) * Math.min(Math.abs(HEIGHTS[o.stage] - o.height), 2.2);
      const rise = o.height - before;
      if (rise) for (const p of state.actors) if (p.on === o.id && p.grounded) {
        p.y -= rise;
        if (rise > 0.1) state.flags.treeLifted = true;
      }
    }
    if (o.kind === 'mover' && !o.frozen && o.speed > 0) {
      const before = o.x;
      o.x += o.dir * o.speed * meta.time.moverSpeed;
      if (o.x >= o.x2) { o.x = o.x2; o.dir = -1; } else if (o.x <= o.x1) { o.x = o.x1; o.dir = 1; }
      const dx = o.x - before;
      for (const p of state.actors) if (p.on === o.id && p.grounded && dx) { p.x += dx; state.flags.moverRide = true; }
    }
  }
}

function moveItems(state) {
  const floors = [...state.platforms, ...state.objects.filter(o => o.kind === 'mover')];
  for (const o of state.objects) {
    if (o.kind !== 'crate' && o.kind !== 'seed') continue;
    const crate = o.kind === 'crate', half = crate ? 27 : 10;
    if (o.held !== null) {
      const p = state.actors[o.held];
      o.x = p.x + p.facing * (crate ? 37 : 22); o.y = p.y - (crate ? 53 : 40); o.vx = 0; o.vy = 0;
      continue;
    }
    if (o.frozen) continue;
    const previous = o.y + half;
    o.vy += 0.3; o.x += o.vx; o.y += o.vy;
    for (const f of floors) if (o.vy >= 0 && previous <= f.y + 1 && o.y + half >= f.y && o.x + half > f.x && o.x - half < f.x + f.w) {
      o.y = f.y - half; o.vy = 0; o.vx *= 0.88;
    }
    if (o.y > 720 || o.x < 20 || o.x > 1260) { o.x = o.spawnX; o.y = o.spawnY; o.vx = 0; o.vy = 0; event(state, 'return', o.x, o.y); }
  }
}

function moveActors(state) {
  const solid = surfaces(state);
  for (const p of state.actors) {
    if (p.grounded) p.coyote = meta.controls.coyote; else p.coyote--;
    if (p.jumpBuffer > 0) p.jumpBuffer--;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      const spring = p.grounded && solid.find(f => f.id === p.on)?.spring;
      p.vy = spring ? meta.controls.springJump : meta.controls.jump; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0;
      if (spring) state.flags.sproutJump = true;
      event(state, 'jump', p.x, p.y);
    }
    p.vx = p.move * meta.controls.speed;
    if (p.move) p.facing = p.move;
    const oldX = p.x;
    p.x = Math.max(22, Math.min(1258, p.x + p.vx));
    const body = () => ({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 });
    for (const f of state.platforms) if (rectOverlap(body(), f) && p.y > f.y + 9) p.x = oldX;
    for (const o of state.objects) if (o.kind === 'plant' && o.barrier && o.stage < 4 && rectOverlap(body(), { x: o.x - 42, y: o.base - o.height, w: 84, h: o.height })) p.x = oldX;
    const previousY = p.y;
    p.vy += meta.controls.gravity;
    p.y += p.vy;
    p.grounded = false; p.on = null;
    for (const f of solid) {
      if (f.id === p.carrying) continue;
      if (p.vy >= 0 && previousY <= f.y + 5 && p.y >= f.y && p.x + 15 > f.x && p.x - 15 < f.x + f.w) {
        p.y = f.y; p.vy = 0; p.grounded = true; p.on = f.id;
        const o = find(state, f.id);
        if (o?.kind === 'crate' && o.frozen) state.flags.frozenTouched = true;
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
}

function tick(state) {
  remember(state);
  state.tick++;
  if (!state.started && state.actors.some(p => p.move || p.jumpBuffer)) state.started = true;
  if (state.started) state.elapsed++;
  ageObjects(state);
  moveItems(state);
  moveActors(state);
  const done = state.needs.filter(key => state.flags[key]).length;
  if (done > state.needsDone) { state.needsDone = done; state.lastProgressTick = state.elapsed; }
  if (done === state.needs.length && state.actors.some(p => Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55)) {
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
    s.objects = clone(frame.objects); s.pits = clone(frame.pits); s.history = []; s.rewindsLeft--; s.status = 'playing';
    for (const p of s.actors) { p.carrying = null; p.move = 0; }
    for (const o of s.objects) if (!free(o)) {
      const p = s.actors[o.held];
      o.held = null; o.x = p.x + p.facing * 30; o.y = p.y - (o.kind === 'crate' ? 27 : 10); o.vx = 0; o.vy = 0;
    }
    event(s, 'rewind', s.actors[s.active].x, s.actors[s.active].y - 30);
    return s;
  }
  const p = s.actors[action.actor];
  if (action.type === 'move') p.move = action.dir;
  if (action.type === 'jump') p.jumpBuffer = meta.controls.jumpBuffer;
  if (action.type === 'grab') {
    if (p.carrying !== null) {
      const o = find(s, p.carrying);
      p.carrying = null; o.held = null;
      if (o.kind === 'crate') {
        o.frozen = false; o.x = p.x + p.facing * 48; o.y = p.y - 48; o.vx = p.facing * 6.8; o.vy = -6;
        event(s, 'throw', o.x, o.y);
      } else {
        const pit = s.pits.filter(t => t.plant === null && Math.abs(t.x - p.x) <= meta.controls.pitReach && Math.abs(t.y - p.y) <= 30)
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        if (pit) {
          s.objects = s.objects.filter(x => x !== o);
          s.objects.push(makePlant(`plant-${s.nextPlant++}`, pit));
          event(s, 'plant', pit.x, pit.y - 10);
        } else {
          o.x = p.x + p.facing * 22; o.y = p.y - 10; o.vx = 0; o.vy = 0;
          event(s, 'drop', o.x, o.y);
        }
      }
    } else {
      const o = pickable(s, p)[0];
      o.held = action.actor; if (o.kind === 'crate') o.frozen = false; p.carrying = o.id;
      event(s, 'grab', o.x, o.y);
    }
  }
  if (action.type === 'ability') {
    const o = targetFor(s, action.actor, action);
    if (action.actor === STILL) { o.frozen = !o.frozen; event(s, o.frozen ? 'freeze' : 'unfreeze', anchor(o).x, anchor(o).y); }
    else if (o.kind === 'mover') { o.speed++; event(s, 'grow', anchor(o).x, o.y); }
    else if (o.speed === 0) { o.speed = 1; event(s, 'wake', o.x, o.base - o.height); }
    else advance(s, o);
  }
  return s;
}

export function hintLevel(state) { return state.elapsed - state.lastProgressTick >= meta.time.hintTicks ? 1 : 0; }
export function isGameOver(state) { return state.status === 'won' ? { winner: 'together', level: state.level, complete: state.level === 3 } : null; }
export function viewFor(state, playerId) { return state.playerIds.includes(playerId) ? clone(state) : null; }
