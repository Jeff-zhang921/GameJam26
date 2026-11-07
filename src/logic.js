import { makeEnemy, updateEnemies, enemyBox, isEnemy, isHazard, isMoving, isSolidEnemy, FROZEN_RATE } from './enemies.js';
import { LEVELS } from './levels/index.js';
import { growFrame, dieFrame } from './mushroom.js';

export const meta = {
  name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
  controls: { speed: 4.2, airSpeed: 4.8, jump: -12.5, springJump: -15.3, gravity: 0.48, fallGravity: 0.8, maxFall: 16, jumpCut: 0.45, coyote: 7, jumpBuffer: 7, range: 300, reach: 95, pitReach: 50 },
  time: { moverSpeed: 1, maxSpeed: 3, hintTicks: 90 * 60, invulnTicks: 60, frozenRate: FROZEN_RATE },
  plant: { maxHeight: 235, springHeight: 45, growTicks: 960, matureTicks: 480, witherTicks: 480 },
};
const STILL = 0, BLOOM = 1;

export const levelCount = LEVELS.length;

const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rectOverlap = (a, b) => a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;
const find = (state, id) => state.objects.find(o => o.id === id);
const free = o => o.held === undefined || o.held === null;

// Where a carried item sits relative to its carrier. Logic and every renderer use the same offset.
export function heldPosition(o, carrier) {
  const crate = o.kind === 'crate';
  return { x: carrier.x + carrier.facing * (crate ? 37 : 22), y: carrier.y - (crate ? 53 : 40) };
}

// Snap every carried item to its carrier. Mutates `state`; held items never get physics of their own.
export function attachHeld(state) {
  for (const o of state.objects) {
    if (free(o)) continue;
    const carrier = state.actors[o.held];
    if (!carrier) continue;
    Object.assign(o, heldPosition(o, carrier));
    o.vx = 0; o.vy = 0;
  }
  return state;
}

export function anchor(o) {
  if (isEnemy(o)) { const b = enemyBox(o); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
  if (o.kind === 'plant') return { x: o.x, y: o.base - o.height / 2 };
  if (o.kind === 'mover') return { x: o.x + o.w / 2, y: o.y + 10 };
  return { x: o.x, y: o.y };
}

const witherProgress = age => (age - meta.plant.growTicks - meta.plant.matureTicks) / meta.plant.witherTicks;
// A mushroom rises while growing, holds while mature, then sinks with its wilting animation.
const heightAt = age => { const { growTicks, matureTicks, maxHeight } = meta.plant; return age > growTicks + matureTicks ? dieFrame(witherProgress(age)).height * maxHeight : Math.min(age, growTicks) / growTicks * maxHeight; };
// The standable cap is as wide as the mushroom art drawn at this height.
export const canopyWidth = plant => plant.height * (plant.withered ? dieFrame(witherProgress(plant.age)).ratio : growFrame(plant.height, meta.plant.maxHeight, meta.plant.springHeight).ratio);

function makePlant(id, pit, grown = 0, barrier = false) {
  pit.plant = id;
  const age = grown * (meta.plant.growTicks + meta.plant.matureTicks);
  return { kind: 'plant', id, pit: pit.id, x: pit.x, base: pit.y, age, height: heightAt(age), withered: false, speed: 0, frozen: false, barrier };
}

function makeLevel(index, players, unlocked, totalShards, collected = LEVELS.map(() => false)) {
  const level = LEVELS[index];
  const pits = level.pits.map((p, i) => ({ id: `pit-${i}`, x: p.x, y: p.y, plant: null }));
  const objects = [
    ...level.crates.map((p, i) => ({ kind: 'crate', id: `crate-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, frozen: false, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.seeds.map((p, i) => ({ kind: 'seed', id: `seed-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.movers.map((p, i) => ({ kind: 'mover', id: `mover-${i}`, x: p.x1, y: p.y, w: p.w, x1: p.x1, x2: p.x2, dir: 1, speed: 0, frozen: false })),
    ...level.plants.map((p, i) => makePlant(`plant-${i}`, pits[p.pit], p.grown, p.barrier)),
    ...(level.enemies ?? []).map((e, i) => makeEnemy(e.kind, e, `${e.kind}-${i}`)),
  ];
  return {
    level: index, levelId: level.id, unlocked, totalShards, collected: clone(collected), tick: 0, status: 'playing', active: 0,
    playerIds: players, width: 1280, height: 640,
    actors: level.spawn.map((p, i) => ({ id: i, x: p.x, y: p.y, vx: 0, vy: 0, facing: 1, grounded: true, on: 'ground', coyote: meta.controls.coyote, jumpBuffer: 0, jumpHeld: false, jumpCut: true, move: 0, carrying: null, invuln: 0, spawnX: p.x, spawnY: p.y })),
    platforms: clone(level.platforms), objects, pits, nextPlant: level.plants.length, nextEnemy: objects.length,
    checkpoints: (level.checkpoints ?? []).map((c, i) => ({ id: `cp-${i}`, x: c.x, y: c.y, lit: false })), checkpoint: null,
    exit: clone(level.exit), shards: level.shards.map((p, i) => ({ ...p, id: i, taken: false })),
    flags: { frozenTouched: false, treeLifted: false, withered: false, sproutJump: false, moverRide: false, dartRide: false, miteGone: false },
    needs: clone(level.need), needsDone: 0, events: [], eventSeq: 0,
    started: false, elapsed: 0, lastProgressTick: 0, falls: 0,
  };
}

export function setup(options = {}) {
  const players = Array.isArray(options.players) && options.players.length ? options.players.slice(0, 2).map(p => typeof p === 'string' ? p : p.id) : ['local'];
  const level = Number.isInteger(options.level) ? Math.max(0, Math.min(LEVELS.length - 1, options.level)) : 0;
  return makeLevel(level, players, level, 0);
}

function actorAllowed(state, playerId, actor) {
  const index = state.playerIds.indexOf(playerId);
  return index >= 0 && (state.playerIds.length === 1 || actor === index);
}

// Objects a time ability can ever act on (crates, plants, moving platforms, creatures).
const timeObject = o => o.kind === 'plant' || o.kind === 'mover' || o.kind === 'crate' || isEnemy(o);
// Still holds anything; Bloom can only release a crate Still has frozen.
const canAffect = (actor, o) => timeObject(o) && (o.kind !== 'crate' || actor === STILL || o.frozen);

// Everything this actor's ability can reach right now.
export function abilityTargets(state, actor) {
  const p = state.actors[actor];
  if (!p) return [];
  return state.objects.filter(o => canAffect(actor, o) && free(o) && dist(p, anchor(o)) <= meta.controls.range);
}

// Why a chosen object can or cannot take this actor's ability: 'ok', 'range', 'unsupported', 'held', 'maxSpeed' or 'missing'.
export function abilityCheck(state, actor, id) {
  const p = state.actors[actor], o = find(state, id);
  if (!p || !o || !timeObject(o)) return 'missing';
  if (!free(o)) return 'held';
  if (!canAffect(actor, o)) return 'unsupported';
  if (dist(p, anchor(o)) > meta.controls.range) return 'range';
  if (actor === BLOOM && !o.frozen && o.speed >= meta.time.maxSpeed) return 'maxSpeed';
  return 'ok';
}

// The time object under a world-space point (touch tap), allowing `slop` world units of finger tolerance.
export function timeObjectAt(state, point, slop = 0) {
  let best = null, bestDistance = Infinity, bestArea = Infinity;
  for (const o of state.objects) {
    if (!timeObject(o) || !free(o)) continue;
    let box;
    if (o.kind === 'crate') box = { x: o.x - 27, y: o.y - 27, w: 54, h: 54 };
    else if (o.kind === 'mover') box = { x: o.x, y: o.y - 6, w: o.w, h: 26 };
    else if (o.kind === 'plant') { const w = Math.max(44, canopyWidth(o)); box = { x: o.x - w / 2, y: o.base - o.height - 24, w, h: o.height + 30 }; }
    else box = enemyBox(o);
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w)), dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
    const distance = Math.hypot(dx, dy), area = box.w * box.h;
    if (distance > slop) continue;
    if (distance < bestDistance || (distance === bestDistance && area < bestArea)) { best = o; bestDistance = distance; bestArea = area; }
  }
  return best;
}

export function targetFor(state, actor, action = {}) {
  const p = state.actors[actor];
  const candidates = abilityTargets(state, actor);
  if (action.target) return candidates.find(o => o.id === action.target);
  const moving = o => isEnemy(o) ? isMoving(o) : !o.frozen && (o.kind === 'crate' ? Math.abs(o.vx) + Math.abs(o.vy) > 0.5 : o.speed > 0 && !o.withered);
  const score = o => {
    const a = anchor(o);
    return dist(p, a) + (o.id === p.on ? 1000 : 0) + ((a.x - p.x) * p.facing < -10 ? 120 : 0) - (actor === STILL && moving(o) ? 150 : 0);
  };
  const sorted = candidates.sort((a, b) => score(a) - score(b));
  return actor === STILL ? sorted[0] : sorted.find(o => o.frozen || o.speed < meta.time.maxSpeed) || sorted[0];
}

function pickable(state, p) {
  return state.objects.filter(o => (o.kind === 'crate' || o.kind === 'seed') && o.held === null && dist(p, o) < meta.controls.reach)
    .sort((a, b) => dist(p, a) - dist(p, b));
}

function plantingPit(state, p) {
  return state.pits.filter(t => t.plant === null && Math.abs(t.x - p.x) <= meta.controls.pitReach && Math.abs(t.y - p.y) <= 30)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
}

// What the grab action would do for this actor right now: 'pickup', 'throw', 'plant' or 'drop'.
export function interactionFor(state, actor) {
  const p = state?.actors?.[actor];
  if (!p) return { kind: 'pickup', available: false };
  if (p.carrying !== null && p.carrying !== undefined) {
    const o = find(state, p.carrying);
    if (o?.kind === 'crate') return { kind: 'throw', available: true };
    return { kind: plantingPit(state, p) ? 'plant' : 'drop', available: true };
  }
  return { kind: 'pickup', available: pickable(state, p).length > 0 };
}

export function validateAction(state, playerId, action) {
  const no = error => ({ valid: false, error });
  if (!state || !action || typeof action !== 'object' || Array.isArray(action)) return no('invalid');
  if (!state.playerIds.includes(playerId)) return no('player');
  if (['tick', 'switch', 'pause', 'restart', 'next', 'level'].includes(action.type)) {
    if (action.type === 'tick' && playerId !== state.playerIds[0]) return no('host');
    if (action.type === 'next' && state.status !== 'won') return no('unfinished');
    if (action.type === 'level' && (!Number.isInteger(action.level) || action.level < 0 || action.level >= LEVELS.length)) return no('invalid');
    return { valid: true };
  }
  if (state.status !== 'playing') return no('paused');
  if (!Number.isInteger(action.actor) || action.actor < 0 || action.actor > 1 || !actorAllowed(state, playerId, action.actor)) return no('role');
  if (action.type === 'move') return [-1, 0, 1].includes(action.dir) ? { valid: true } : no('invalid');
  if (action.type === 'jump' || action.type === 'jumpRelease') return { valid: true };
  if (action.type === 'grab') {
    const p = state.actors[action.actor];
    return p.carrying !== null || pickable(state, p).length ? { valid: true } : no('grabRange');
  }
  if (action.type === 'ability') {
    if (action.target !== undefined && typeof action.target !== 'string') return no('invalid');
    const target = targetFor(state, action.actor, action);
    if (!target) return no(action.actor === STILL ? 'freezeRange' : 'bloomRange');
    if (action.actor === BLOOM && !target.frozen && target.speed >= meta.time.maxSpeed) return no('maxSpeed');
    return { valid: true };
  }
  return no('invalid');
}

function event(state, kind, x, y, details = {}) {
  state.events.push({ id: ++state.eventSeq, kind, x, y, tick: state.tick, ...details });
  if (state.events.length > 10) state.events.shift();
}

function surfaces(state) {
  const result = state.platforms.map((p, i) => ({ ...p, id: `platform-${i}` }));
  for (const o of state.objects) {
    if (o.kind === 'crate' && o.held === null) result.push({ id: o.id, x: o.x - 27, y: o.y - 27, w: 54, h: 54 });
    if (o.kind === 'mover') result.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: 20 });
    if (o.kind === 'plant' && o.height > 0) { const w = canopyWidth(o); result.push({ id: o.id, x: o.x - w / 2, y: o.base - o.height, w, h: 16, spring: !o.withered && o.height <= meta.plant.springHeight }); }
    if (isSolidEnemy(o)) result.push({ id: o.id, ...enemyBox(o) });
  }
  return result;
}

function ageObjects(state) {
  for (const o of [...state.objects]) {
    const slow = o.frozen ? meta.time.frozenRate : 1;
    if (o.kind === 'plant' && o.speed > 0) {
      const { growTicks, matureTicks, witherTicks } = meta.plant;
      o.age += o.speed * slow;
      if (o.age >= growTicks + matureTicks + witherTicks) {
        state.objects = state.objects.filter(x => x !== o);
        state.pits.find(p => p.id === o.pit).plant = null;
        event(state, 'vanish', o.x, o.base - o.height, { plant: true, base: o.base });
        continue;
      }
      if (!o.withered && o.age > growTicks + matureTicks) { event(state, 'wither', o.x, o.base); o.withered = true; if (o.barrier) state.flags.withered = true; }
      const rise = heightAt(o.age) - o.height;
      o.height += rise;
      if (rise > 0 && state.tick % 60 === 0) event(state, 'growth', o.x, o.base - o.height);
      if (rise) for (const p of state.actors) if (p.on === o.id && p.grounded) {
        p.y -= rise;
        if (o.height > meta.plant.springHeight) state.flags.treeLifted = true;
      }
    }
    if (o.kind === 'mover' && o.speed > 0) {
      o.x += o.dir * o.speed * meta.time.moverSpeed * slow;
      if (o.x >= o.x2) { o.x = o.x2; o.dir = -1; } else if (o.x <= o.x1) { o.x = o.x1; o.dir = 1; }
    }
  }
}

function moveItems(state) {
  const all = surfaces(state), reset = new Set();
  for (const o of state.objects) {
    if (o.kind !== 'crate' && o.kind !== 'seed') continue;
    const crate = o.kind === 'crate', half = crate ? 27 : 10;
    // Carried items take no physics step; attachHeld places them after their carrier has moved.
    if (o.held !== null) continue;
    const k = o.frozen ? meta.time.frozenRate : 1, previous = o.y + half;
    o.vy += 0.3 * k; o.x += o.vx * k;
    // Platform sides are walls: an item flying into one stops against it instead of passing through.
    for (const f of state.platforms) if (o.y + half > f.y + 3 && o.y - half < f.y + f.h && o.x + half > f.x && o.x - half < f.x + f.w) {
      o.x = o.x < f.x + f.w / 2 ? f.x - half : f.x + f.w + half; o.vx = 0;
    }
    o.y += o.vy * k;
    for (const f of all) if (f.id !== o.id) if (o.vy >= 0 && previous <= f.y + 3 && o.y + half >= f.y && o.x + half > f.x && o.x - half < f.x + f.w) {
      if (o.vy > 1) event(state, crate ? 'crateLand' : 'seedLand', o.x, f.y);
      o.y = f.y - half; o.vy = 0; o.vx *= 0.88 ** k;
    }
    if (o.y > 720 || o.x < 20 || o.x > 1260) { o.x = o.spawnX; o.y = o.spawnY; o.vx = 0; o.vy = 0; reset.add(o.id); event(state, 'return', o.x, o.y); }
  }
  return reset;
}

function moveActors(state) {
  const solid = surfaces(state);
  for (const p of state.actors) {
    const wasGrounded = p.grounded;
    if (p.grounded) p.coyote = meta.controls.coyote;
    const launch = () => {
      const spring = p.grounded && solid.find(f => f.id === p.on)?.spring;
      p.vy = spring ? meta.controls.springJump : meta.controls.jump; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; p.jumpCut = false;
      if (spring) state.flags.sproutJump = true;
      event(state, 'jump', p.x, p.y, { actor: p.id });
    };
    if (p.jumpBuffer > 0 && p.coyote > 0) launch();
    if (!p.jumpHeld && !p.jumpCut && p.vy < 0) { p.vy *= meta.controls.jumpCut; p.jumpCut = true; }
    p.vx = p.move * (p.grounded ? meta.controls.speed : meta.controls.airSpeed);
    if (p.move) p.facing = p.move;
    const oldX = p.x;
    p.x = Math.max(22, Math.min(1258, p.x + p.vx));
    const body = () => ({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 });
    const crates = state.objects.filter(o => (o.kind === 'crate' && o.held === null) || isSolidEnemy(o)).map(o => o.kind === 'crate' ? { id: o.id, x: o.x - 27, y: o.y - 27, w: 54, h: 54 } : { id: o.id, ...enemyBox(o) });
    const inside = crates.filter(c => rectOverlap({ x: oldX - 15, y: p.y - 52, w: 30, h: 51 }, c));
    for (const f of state.platforms) if (rectOverlap(body(), f) && p.y > f.y + 9) p.x = oldX;
    for (const c of crates) if (!inside.includes(c) && rectOverlap(body(), c) && p.y > c.y + 9) p.x = oldX;
    for (const o of state.objects) if (o.kind === 'plant' && o.barrier && !o.withered && rectOverlap(body(), { x: o.x - 42, y: o.base - o.height, w: 84, h: o.height })) p.x = oldX;
    if (p.move && state.tick % 18 === 0) {
      if (p.x === oldX) event(state, 'collision', p.x, p.y, { actor: p.id });
      else if (p.grounded) event(state, 'step', p.x, p.y, { actor: p.id });
    }
    const previousY = p.y;
    p.vy = Math.min(meta.controls.maxFall, p.vy + (p.vy < 0 ? meta.controls.gravity : meta.controls.fallGravity));
    const impact = p.vy;
    const airborne = !p.grounded;
    p.y += p.vy;
    if (p.vy < 0) for (const c of crates) if (!inside.includes(c) && p.x + 15 > c.x && p.x - 15 < c.x + c.w && previousY - 52 >= c.y + c.h && p.y - 52 < c.y + c.h) { p.y = c.y + c.h + 52; p.vy = 0; event(state, 'collision', p.x, p.y, { actor: p.id }); }
    p.grounded = false; p.on = null;
    for (const f of solid) {
      if (f.id === p.carrying) continue;
      // A surface rising into a ceiling cannot lift you through it.
      if (p.vy >= 0 && f.y < p.y && [...state.platforms, ...crates].some(c => c.id !== f.id && p.x + 15 > c.x && p.x - 15 < c.x + c.w && previousY - 52 >= c.y + c.h - 0.01 && f.y - 52 < c.y + c.h)) continue;
      if (p.vy >= 0 && previousY <= f.y + 5 && p.y >= f.y && p.x + 15 > f.x && p.x - 15 < f.x + f.w) {
        p.y = f.y; p.vy = 0; p.grounded = true; p.on = f.id;
        const o = find(state, f.id);
        if (o?.kind === 'crate' && o.frozen) state.flags.frozenTouched = true;
        if ((o?.kind === 'dart' || o?.kind === 'orb') && o.frozen) state.flags.dartRide = true;
      }
    }
    if (p.grounded && airborne) event(state, 'land', p.x, p.y, { actor: p.id, strength: Math.min(1, impact / meta.controls.maxFall) });
    if (p.grounded && p.jumpBuffer > 0) launch();
    if (p.jumpBuffer > 0) p.jumpBuffer--;
    if (!p.grounded && !wasGrounded && p.coyote > 0) p.coyote--;
    if (p.y > 710) { state.falls++; respawn(state, p, 'return'); }
    for (const cp of state.checkpoints) if (state.checkpoint !== cp.id && rectOverlap(body(), { x: cp.x - 12, y: cp.y - 40, w: 24, h: 40 })) {
      cp.lit = true; state.checkpoint = cp.id; event(state, 'checkpoint', cp.x, cp.y - 40);
    }
    if (p.invuln > 0) p.invuln--;
    else {
      const hazard = state.objects.find(o => isHazard(o) && rectOverlap(body(), enemyBox(o)));
      if (hazard) {
        if (hazard.kind === 'dart' || hazard.kind === 'orb') state.objects = state.objects.filter(o => o !== hazard);
        respawn(state, p, 'hit');
      }
    }
    for (const shard of state.shards) if (!shard.taken && dist({ x: p.x, y: p.y - 28 }, shard) < 42) {
      shard.taken = true; event(state, 'shard', shard.x, shard.y);
    }
  }
}

function respawn(state, p, kind) {
  if (kind === 'hit' && p.carrying !== null) {
    const o = find(state, p.carrying);
    o.held = null; o.x = p.x; o.y = p.y - (o.kind === 'crate' ? 27 : 10); o.vx = 0; o.vy = 0; p.carrying = null;
  }
  if (kind === 'hit') event(state, 'hit', p.x, p.y - 26, { actor: p.id });
  const cp = state.checkpoints.find(c => c.id === state.checkpoint);
  p.x = cp ? cp.x + (p.id ? 18 : -18) : p.spawnX; p.y = cp ? cp.y : p.spawnY;
  p.vx = 0; p.vy = 0; p.grounded = true; p.on = 'ground'; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0;
  p.invuln = kind === 'hit' ? meta.time.invulnTicks : p.invuln;
  event(state, 'return', p.x, p.y, { actor: p.id });
}

// Actors standing on a crate or enemy move with it, but are never pushed into a wall or a ceiling.
function carryRiders(state, before, skip) {
  for (const p of state.actors) {
    const o = p.grounded && find(state, p.on), from = o && before.get(o.id);
    if (!from || skip.has(o.id) || o.held != null) continue;
    const dx = o.x - from[0], dy = o.y - from[1];
    if (o.kind === 'mover' && dx) state.flags.moverRide = true;
    const solids = [...state.platforms, ...state.objects.filter(s => s.id !== o.id && ((s.kind === 'crate' && s.held === null) || isSolidEnemy(s))).map(s => s.kind === 'crate' ? { x: s.x - 27, y: s.y - 27, w: 54, h: 54 } : enemyBox(s))];
    const body = (x, y) => ({ x: x - 15, y: y - 52, w: 30, h: 51 });
    if (dy < 0 && solids.some(f => rectOverlap(body(p.x, p.y + dy), f) && p.y - 52 >= f.y + f.h - 0.01)) { p.grounded = false; p.vy = 0; }
    else p.y += dy;
    const x = Math.max(22, Math.min(1258, p.x + dx));
    if (!solids.some(f => rectOverlap(body(x, p.y), f) && p.y > f.y + 9)) p.x = x;
  }
}

function resolveStrikes(state, strikes) {
  for (const id of strikes) {
    const o = find(state, id); if (!o) continue;
    const b = enemyBox(o), reach = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
    for (const p of state.actors) if (p.invuln <= 0 && rectOverlap({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 }, reach)) respawn(state, p, 'hit');
  }
}

function tick(state) {
  state.tick++;
  if (state.started) state.elapsed++;
  const before = new Map(state.objects.filter(o => o.kind === 'crate' || o.kind === 'mover' || isEnemy(o)).map(o => [o.id, [o.x, o.y]]));
  ageObjects(state);
  const strikes = updateEnemies(state, { event, nextId: kind => `${kind}-${state.nextEnemy++}` });
  carryRiders(state, before, moveItems(state));
  moveActors(state);
  resolveStrikes(state, strikes);
  // Carriers have finished moving for this tick, so carried items land exactly on them (no one-tick trail).
  attachHeld(state);
  const done = state.needs.filter(key => state.flags[key]).length;
  if (done > state.needsDone) { state.needsDone = done; state.lastProgressTick = state.elapsed; }
  // Needs are only suggestions; the courtyard is cleared once both travelers stand in the moon gate.
  if (state.actors.every(p => atExit(state, p))) {
    state.status = 'won'; state.unlocked = Math.max(state.unlocked, Math.min(LEVELS.length - 1, state.level + 1));
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
  if (action.type === 'next') return makeLevel((state.level + 1) % LEVELS.length, state.playerIds, state.unlocked, state.totalShards, state.collected);
  const s = clone(state);
  if (action.type === 'tick') { if (s.status === 'playing') tick(s); return s; }
  if (action.type === 'pause') { if (s.status !== 'won') s.status = s.status === 'paused' ? 'playing' : 'paused'; for (const p of s.actors) { p.move = 0; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0; } return s; }
  if (action.type === 'switch') { for (const p of s.actors) { p.move = 0; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0; } s.active = 1 - s.active; return s; }
  const p = s.actors[action.actor];
  if (action.type === 'jump' || action.type === 'grab' || action.type === 'ability' || (action.type === 'move' && action.dir !== 0)) s.started = true;
  if (action.type === 'move') p.move = action.dir;
  if (action.type === 'jump' && !p.jumpHeld) { p.jumpHeld = true; p.jumpBuffer = meta.controls.jumpBuffer; }
  if (action.type === 'jumpRelease') p.jumpHeld = false;
  if (action.type === 'grab') {
    if (p.carrying !== null) {
      const o = find(s, p.carrying);
      p.carrying = null; o.held = null;
      if (o.kind === 'crate') {
        o.frozen = false; o.x = p.x + p.facing * 48; o.y = p.y - 48; o.vx = p.facing * 6.8; o.vy = -6;
        event(s, 'throw', o.x, o.y);
      } else {
        const pit = plantingPit(s, p);
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
      Object.assign(o, heldPosition(o, p)); o.vx = 0; o.vy = 0;
    }
  }
  if (action.type === 'ability') {
    const o = targetFor(s, action.actor, action);
    if (action.actor === STILL) {
      if (!o.frozen && isEnemy(o)) for (const other of s.objects) if (other !== o && other.frozen && isEnemy(other)) { other.frozen = false; event(s, 'unfreeze', anchor(other).x, anchor(other).y); }
      o.frozen = !o.frozen; event(s, o.frozen ? 'freeze' : 'unfreeze', anchor(o).x, anchor(o).y, { caster: action.actor, target: o.id });
    }
    else if (o.frozen) { o.frozen = false; if (o.speed === 0) o.speed = 1; event(s, 'unfreeze', anchor(o).x, anchor(o).y, { caster: action.actor, target: o.id }); }
    else { const woke = o.speed === 0; o.speed++; event(s, woke ? 'wake' : 'grow', anchor(o).x, anchor(o).y, { caster: action.actor, target: o.id }); }
  }
  return s;
}

export function atExit(state, p) { return Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55; }
export function hintLevel(state) { return state.elapsed - state.lastProgressTick >= meta.time.hintTicks ? 1 : 0; }
export function isGameOver(state) { return state.status === 'won' ? { winner: 'together', level: state.level, complete: state.level === LEVELS.length - 1 } : null; }
export function viewFor(state, playerId) { return state.playerIds.includes(playerId) ? clone(state) : null; }
