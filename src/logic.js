import { makeEnemy, updateEnemies, enemyBox, isEnemy, isHazard, isSolidEnemy, FROZEN_RATE } from './enemies.js';
import { LEVELS } from './levels/index.js';
import { growFrame, dieFrame } from './mushroom.js';

export const meta = {
  name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
  controls: { speed: 4.2, airSpeed: 4.8, jump: -12.5, springJump: -15.3, gravity: 0.48, fallGravity: 0.8, maxFall: 16, jumpCut: 0.45, coyote: 7, jumpBuffer: 7, range: 300, reach: 95, pitReach: 50 },
  time: { moverSpeed: 1, maxSpeed: 3, hintTicks: 90 * 60, invulnTicks: 60, frozenRate: FROZEN_RATE },
  plant: { maxHeight: 235, springHeight: 45, growTicks: 960, matureTicks: 480, witherTicks: 480 },
  // Still's Freeze Area: a circle cast at a chosen point. `range` is how far from Still the centre may be,
  // `duration` is in ticks (60 per second), `rate` is local time inside it.
  freeze: { rate: FROZEN_RATE, radius: 130, range: 380, duration: 600 },
  charges: { bloomStart: 3, pickupReach: 36 },
  // Seeds are carried as a count: Bloom starts with `start` (unless a level sets `startSeeds`) and collects a seed
  // lying in the courtyard by touching it (within `reach` of Bloom's middle).
  seeds: { start: 1, reach: 34 },
  // A carried crate is thrown with an aimed velocity up to `maxSpeed`; without an aim it uses `default` (x is
  // multiplied by the thrower's facing). The crate leaves from `offset` beside the thrower's chest.
  throw: { maxSpeed: 11, default: { vx: 6.8, vy: -6 }, offset: { x: 48, y: -48 } },
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

// A seed lying in the courtyard; Bloom collects it by touch.
const makeSeed = (id, x, y) => ({ kind: 'seed', id, x, y, vx: 0, vy: 0, frozen: false, held: null, spawnX: x, spawnY: y });

function makeLevel(index, players, unlocked, totalShards, collected = LEVELS.map(() => false)) {
  const level = LEVELS[index];
  // A pit marked `plantable: false` only holds the plant the level starts with (it cannot be planted again).
  const pits = level.pits.map((p, i) => ({ id: `pit-${i}`, x: p.x, y: p.y, plant: null, ...(p.plantable === false && { plantable: false }) }));
  const objects = [
    ...level.crates.map((p, i) => ({ kind: 'crate', id: `crate-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, frozen: false, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.seeds.map((p, i) => makeSeed(`seed-${i}`, p.x, p.y)),
    ...level.movers.map((p, i) => ({ kind: 'mover', id: `mover-${i}`, x: p.x1, y: p.y, w: p.w, x1: p.x1, x2: p.x2, dir: 1, speed: 0, frozen: false })),
    ...level.plants.map((p, i) => makePlant(`plant-${i}`, pits[p.pit], p.grown, p.barrier)),
    ...(level.enemies ?? []).map((e, i) => makeEnemy(e.kind, e, `${e.kind}-${i}`)),
  ];
  const state = {
    level: index, levelId: level.id, unlocked, totalShards, collected: clone(collected), tick: 0, status: 'playing', active: 0,
    playerIds: players, width: level.width ?? 1280, height: 640,
    actors: level.spawn.map((p, i) => ({ id: i, x: p.x, y: p.y, vx: 0, vy: 0, facing: 1, grounded: true, on: 'ground', coyote: meta.controls.coyote, jumpBuffer: 0, jumpHeld: false, jumpCut: true, move: 0, carrying: null, invuln: 0, spawnX: p.x, spawnY: p.y })),
    platforms: clone(level.platforms), objects, pits, nextPlant: level.plants.length, nextEnemy: objects.length,
    checkpoints: (level.checkpoints ?? []).map((c, i) => ({ id: `cp-${i}`, x: c.x, y: c.y, lit: false })), checkpoint: null,
    exit: clone(level.exit), shards: level.shards.map((p, i) => ({ ...p, id: i, taken: false })),
    flags: { frozenTouched: false, treeLifted: false, withered: false, sproutJump: false, moverRide: false, dartRide: false, miteGone: false },
    needs: clone(level.need), needsDone: 0, events: [], eventSeq: 0,
    started: false, elapsed: 0, lastProgressTick: 0, falls: 0,
    freezeAreas: [], nextArea: 0, freezeCharges: level.freezeCharges ?? 1, bloomCharges: meta.charges.bloomStart,
    seeds: level.startSeeds ?? meta.seeds.start,
    // Whether a crate lost out of the courtyard returns to its spawn (false: it is gone for good).
    crateRespawn: level.crateRespawn ?? true,
    pickups: [
      ...(level.freezePickups ?? []).map((p, i) => ({ ...p, id: `frost-${i}`, kind: 'frost', taken: false })),
      ...level.bloomPickups.map((p, i) => ({ ...p, id: `bolt-${i}`, kind: 'bolt', taken: false })),
    ],
    // A possible dead end: the reason, and a counter that only moves when a new warning appears.
    failure: null, failureSeq: 0,
  };
  return state;
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
// Still's area slows anything; Bloom hastens things that have a clock of their own (not crates).
const canAffect = (actor, o) => timeObject(o) && (actor === STILL || o.kind !== 'crate');

// Everything this actor's ability can reach right now.
export function abilityTargets(state, actor) {
  const p = state.actors[actor];
  if (!p) return [];
  return state.objects.filter(o => canAffect(actor, o) && free(o) && dist(p, anchor(o)) <= meta.controls.range);
}

// Validate the target shown in a Bloom preview before sending the cast to the server.
export function abilityCheck(state, actor, id) {
  const p = state.actors[actor], o = find(state, id);
  if (!p || !o || !timeObject(o)) return 'missing';
  if (!free(o)) return 'held';
  if (!canAffect(actor, o)) return 'unsupported';
  if (dist(p, anchor(o)) > meta.controls.range) return 'range';
  if (actor === BLOOM && o.speed >= meta.time.maxSpeed) return 'maxSpeed';
  if (actor === BLOOM && state.bloomCharges <= 0) return 'noBloomCharges';
  return 'ok';
}

// Collision-ish box of an object, used for tapping and for Freeze Area coverage.
export function objectBox(o) {
  if (o.kind === 'crate') return { x: o.x - 27, y: o.y - 27, w: 54, h: 54 };
  if (o.kind === 'seed') return { x: o.x - 10, y: o.y - 10, w: 20, h: 20 };
  if (o.kind === 'mover') return { x: o.x, y: o.y - 6, w: o.w, h: 26 };
  if (o.kind === 'plant') { const w = Math.max(44, canopyWidth(o)); return { x: o.x - w / 2, y: o.base - o.height - 24, w, h: o.height + 30 }; }
  return enemyBox(o);
}
const circleTouches = (c, b) => Math.hypot(Math.max(b.x - c.x, 0, c.x - (b.x + b.w)), Math.max(b.y - c.y, 0, c.y - (b.y + b.h))) <= c.radius;

// Later areas are drawn on top. A tap in an overlap selects just that area.
export function freezeAreaAt(state, point) {
  return state.freezeAreas.findLast(a => a.ticksLeft > 0 && dist(a, point) <= a.radius);
}

// Every object (never a traveller) touching an active Freeze Area runs on slowed local time; leaving the
// area, or the area fading, restores normal time. Recomputed every tick, so it is never left behind.
export function applyFreezeAreas(state) {
  for (const o of state.objects) o.frozen = free(o) && state.freezeAreas.some(a => circleTouches(a, objectBox(o)));
  return state;
}

// Where a Freeze Area would be centred: the point the player aimed at, or a named object. Nothing is chosen for
// the player: with neither there is no point.
export function freezePoint(state, action = {}) {
  if (action.x !== undefined || action.y !== undefined) return Number.isFinite(action.x) && Number.isFinite(action.y) ? { x: action.x, y: action.y } : null;
  if (action.target !== undefined) { const o = typeof action.target === 'string' && find(state, action.target); return o && free(o) ? anchor(o) : null; }
  return null;
}

// Can Still cast a Freeze Area here? 'ok', 'noCharges', 'range' (too far from Still) or 'outside' (off the world).
export function freezeCheck(state, point) {
  const p = state.actors[STILL];
  if (!p || !point) return 'outside';
  if (state.freezeCharges <= 0) return 'noCharges';
  if (point.x < 0 || point.x > state.width || point.y < 0 || point.y > state.height) return 'outside';
  if (Math.hypot(point.x - p.x, point.y - (p.y - 30)) > meta.freeze.range) return 'range';
  return 'ok';
}

// The time object under a world-space point (touch tap), allowing `slop` world units of finger tolerance.
export function timeObjectAt(state, point, slop = 0, candidates = state.objects) {
  let best = null, bestDistance = Infinity, bestArea = Infinity;
  for (const o of candidates) {
    if (!timeObject(o) || !free(o)) continue;
    const box = objectBox(o);
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w)), dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
    const distance = Math.hypot(dx, dy), area = box.w * box.h;
    if (distance > slop) continue;
    if (distance < bestDistance || (distance === bestDistance && area < bestArea)) { best = o; bestDistance = distance; bestArea = area; }
  }
  return best;
}

// Bloom can target the object carrying their feet even when their sprite covers it.
export function bloomSupport(state) {
  const player = state.actors[BLOOM];
  return player?.grounded ? abilityTargets(state, BLOOM).find(o => o.id === player.on) ?? null : null;
}

export function bloomTargetAt(state, point, slop = 40) {
  const candidates = abilityTargets(state, BLOOM);
  const exact = timeObjectAt(state, point, 0, candidates);
  if (exact) return exact;
  const player = state.actors[BLOOM], support = bloomSupport(state);
  if (support && Math.abs(point.x - player.x) <= 26 && point.y >= player.y - 58 && point.y <= player.y + 16) return support;
  // Assistance stays near the aimed point; crates cannot steal a Speed tap.
  return timeObjectAt(state, point, slop, candidates.filter(o => o.speed < meta.time.maxSpeed))
    ?? timeObjectAt(state, point, slop, candidates)
    ?? timeObjectAt(state, point, slop);
}

// The object Bloom aimed at (`action.target`), if Bloom's ability can reach it. Nothing is chosen for the player.
export function abilityTarget(state, actor, action = {}) {
  return action.target === undefined ? undefined : abilityTargets(state, actor).find(o => o.id === action.target);
}

function pickable(state, p) {
  return state.objects.filter(o => o.kind === 'crate' && o.held === null && dist(p, o) < meta.controls.reach)
    .sort((a, b) => dist(p, a) - dist(p, b));
}

function plantingPit(state, p) {
  return state.pits.filter(t => t.plant === null && t.plantable !== false && Math.abs(t.x - p.x) <= meta.controls.pitReach && Math.abs(t.y - p.y) <= 30)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
}

// Bloom, hands free, beside an empty pit with a seed to spare: the pit to plant in.
const plantable = (state, p) => p.id === BLOOM && p.carrying === null && state.seeds > 0 ? plantingPit(state, p) : null;

// What the grab action would do for this actor right now: 'pickup', 'throw' or 'plant'.
export function interactionFor(state, actor) {
  const p = state?.actors?.[actor];
  if (!p) return { kind: 'pickup', available: false };
  if (p.carrying !== null && p.carrying !== undefined) return { kind: 'throw', available: true };
  if (plantable(state, p)) return { kind: 'plant', available: true };
  return { kind: 'pickup', available: pickable(state, p).length > 0 };
}

export function aimedThrowVelocity(dx, dy, fullPowerDistance) {
  const scale = meta.throw.maxSpeed / Math.max(fullPowerDistance, Math.hypot(dx, dy));
  // Rounding the components independently can push the combined speed above the cap.
  return { vx: dx * scale, vy: dy * scale };
}

// Where a thrown crate starts and how fast it goes. `aim` ({ vx, vy }, up to meta.throw.maxSpeed) comes from the
// thrower's aiming; without one the crate goes the default way the thrower faces.
export function throwLaunch(state, actor, aim) {
  const p = state.actors[actor], { offset } = meta.throw;
  const v = aim ? { vx: aim.vx, vy: aim.vy } : { vx: meta.throw.default.vx * p.facing, vy: meta.throw.default.vy };
  const side = Math.abs(v.vx) > .01 ? Math.sign(v.vx) : p.facing;
  return { x: p.x + side * offset.x, y: p.y + offset.y, ...v, facing: side };
}

// The flight of a crate thrown with `aim`, tick by tick, using the same physics as a real throw (including the
// local time of Freeze Areas it passes through), until it lands, hits a wall or leaves the courtyard.
export function throwPath(state, actor, aim, maxTicks = 180) {
  const start = throwLaunch(state, actor, aim), carried = state.actors[actor].carrying;
  const o = { kind: 'crate', id: carried, x: start.x, y: start.y, vx: start.vx, vy: start.vy, frozen: false, held: null };
  const all = surfaces(state).filter(f => f.id !== carried), points = [{ x: o.x, y: o.y }];
  for (let i = 0; i < maxTicks; i++) {
    o.frozen = state.freezeAreas.some(a => circleTouches(a, { x: o.x - 27, y: o.y - 27, w: 54, h: 54 }));
    const { landed, wall } = stepItem(state, o, all);
    points.push({ x: o.x, y: o.y });
    if (landed || wall || o.y > 720 || o.x < 20 || o.x > state.width - 20) break;
  }
  return points;
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
    if (action.aim !== undefined) {
      const aim = action.aim;
      if (p.carrying === null || !aim || typeof aim !== 'object' || !Number.isFinite(aim.vx) || !Number.isFinite(aim.vy) || Math.hypot(aim.vx, aim.vy) > meta.throw.maxSpeed + 1e-6) return no('invalid');
      return { valid: true };
    }
    if (p.carrying !== null || pickable(state, p).length) return { valid: true };
    if (p.id === BLOOM && plantingPit(state, p)) return state.seeds > 0 ? { valid: true } : no('noSeeds');
    return no('grabRange');
  }
  if (action.type === 'ability') {
    if (action.area !== undefined) {
      if (action.actor !== STILL) return no('role');
      if (typeof action.area !== 'string') return no('invalid');
      const area = state.freezeAreas.find(a => a.id === action.area && a.ticksLeft > 0);
      return area?.owner === playerId ? { valid: true } : no('freezeArea');
    }
    if (action.target !== undefined && typeof action.target !== 'string') return no('invalid');
    if (action.actor === STILL) {
      const point = freezePoint(state, action);
      if (!point && action.x === undefined && action.target === undefined) return no('aim');
      const check = freezeCheck(state, point);
      // A point cast from an older client snapshot must not spend a charge on a circle already there.
      if (check === 'ok' && action.x !== undefined && freezeAreaAt(state, point)) return no('freezeCovered');
      return check === 'ok' ? { valid: true } : no(check === 'noCharges' ? 'noCharges' : 'freezeRange');
    }
    if (action.x !== undefined || action.y !== undefined) return no('invalid');
    if (action.target === undefined) return no('aim');
    const target = abilityTarget(state, action.actor, action);
    if (!target) return no('bloomRange');
    if (target.speed >= meta.time.maxSpeed) return no('maxSpeed');
    if (state.bloomCharges <= 0) return no('noBloomCharges');
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

// A living mushroom's stem is solid from the side, for actors and items alike; only its cap top is standable.
const stemBoxes = state => state.objects.filter(o => o.kind === 'plant' && !o.withered && o.height > 0)
  .map(o => { const w = Math.min(84, Math.max(30, canopyWidth(o))); return { x: o.x - w / 2, y: o.base - o.height, w, h: o.height }; });

// How fast (px per tick of local time) an item whose centre is past an edge slides off it.
const ITEM_SLIDE = 1.5;
// One physics tick for a loose crate or seed. Returns whether it landed (and how hard) and whether it hit a wall.
function stepItem(state, o, all) {
  const half = o.kind === 'crate' ? 27 : 10, k = o.frozen ? meta.time.frozenRate : 1, previous = o.y + half;
  let landed = null, wall = false;
  // A crate is solid to the travellers: it stops against their sides and comes to rest on their heads.
  const bodies = o.kind === 'crate' ? state.actors.map(p => ({ id: `actor-${p.id}`, x: p.x - 15, y: p.y - 52, w: 30, h: 51 })) : [];
  o.vy += 0.3 * k; o.x += o.vx * k;
  // Platform sides and mushroom stems are walls: an item flying into one stops against it instead of passing through.
  for (const f of [...state.platforms, ...stemBoxes(state), ...bodies]) if (o.y + half > f.y + 3 && o.y - half < f.y + f.h && o.x + half > f.x && o.x - half < f.x + f.w) {
    o.x = o.x < f.x + f.w / 2 ? f.x - half : f.x + f.w + half; o.vx = 0; wall = true;
  }
  o.y += o.vy * k;
  let left = Infinity, right = -Infinity;
  for (const f of [...all, ...bodies]) if (f.id !== o.id) if (o.vy >= 0 && previous <= f.y + 3 && o.y + half >= f.y && o.x + half > f.x && o.x - half < f.x + f.w) {
    landed = { y: f.y, speed: o.vy };
    o.y = f.y - half; o.vy = 0; o.vx *= 0.88 ** k;
    left = Math.min(left, f.x); right = Math.max(right, f.x + f.w);
  }
  // An item whose centre is past the edge of what holds it tips over: it slides outward until it drops off
  // (clear of the ledge's side, so it falls straight down beside it instead of hanging over the gap).
  if (landed && (o.x < left || o.x > right)) o.vx = o.x > right ? Math.max(o.vx, ITEM_SLIDE) : Math.min(o.vx, -ITEM_SLIDE);
  return { landed, wall };
}

// Moves loose items. Returns the ids of items that were reset to their spawn or lost, so riders are not carried
// along with them.
function moveItems(state) {
  const all = surfaces(state), reset = new Set(), lost = new Set();
  for (const o of state.objects) {
    if (o.kind !== 'crate' && o.kind !== 'seed') continue;
    const crate = o.kind === 'crate', half = crate ? 27 : 10;
    // Carried items take no physics step; attachHeld places them after their carrier has moved.
    if (o.held !== null) continue;
    const { landed } = stepItem(state, o, all);
    if (landed && landed.speed > 1) event(state, crate ? 'crateLand' : 'seedLand', o.x, landed.y);
    if (o.y > 720 || o.x < 20 || o.x > state.width - 20) {
      reset.add(o.id);
      // Where crates do not respawn, a lost crate is gone for good. Seeds always return.
      if (crate && state.crateRespawn === false) { lost.add(o.id); event(state, 'crateLost', o.x, Math.min(o.y, state.height)); continue; }
      o.x = respawnX(state, o, half); o.y = o.spawnY; o.vx = 0; o.vy = 0; event(state, 'return', o.x, o.y);
    }
  }
  if (lost.size) state.objects = state.objects.filter(o => !lost.has(o.id));
  return reset;
}

// A lost item returns to its spawn, but never inside a character standing there: it takes the nearest
// clear spot on the same ledge instead (or its spawn if none is clear).
function respawnX(state, o, half) {
  const bottom = o.spawnY + half;
  const body = p => ({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 });
  const clear = x => !state.actors.some(p => rectOverlap({ x: x - half, y: o.spawnY - half, w: half * 2, h: half * 2 }, body(p)));
  const supported = x => state.platforms.some(f => Math.abs(f.y - bottom) <= 2 && x - half >= f.x && x + half <= f.x + f.w);
  for (const step of [0, 1, -1, 2, -2, 3, -3]) {
    const x = o.spawnX + step * 40;
    if (x > 40 && x < state.width - 40 && clear(x) && (step === 0 || supported(x))) return x;
  }
  return o.spawnX;
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
    p.x = Math.max(22, Math.min(state.width - 22, p.x + p.vx));
    const body = () => ({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 });
    const crates = state.objects.filter(o => (o.kind === 'crate' && o.held === null) || isSolidEnemy(o)).map(o => o.kind === 'crate' ? { id: o.id, x: o.x - 27, y: o.y - 27, w: 54, h: 54 } : { id: o.id, ...enemyBox(o) });
    const inside = crates.filter(c => rectOverlap({ x: oldX - 15, y: p.y - 52, w: 30, h: 51 }, c));
    // A mushroom that grows into you only lets you walk out of it.
    const stems = stemBoxes(state);
    const inStem = stems.filter(s => rectOverlap({ x: oldX - 15, y: p.y - 52, w: 30, h: 51 }, s) && p.y > s.y + 9);
    for (const f of state.platforms) if (rectOverlap(body(), f) && p.y > f.y + 9) p.x = oldX;
    for (const c of crates) if (!inside.includes(c) && rectOverlap(body(), c) && p.y > c.y + 9) p.x = oldX;
    for (const s of stems) if (inStem.includes(s) ? Math.abs(p.x - (s.x + s.w / 2)) < Math.abs(oldX - (s.x + s.w / 2)) : rectOverlap(body(), s) && p.y > s.y + 9) p.x = oldX;
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
        const o = find(state, f.id);
        // A loose crate that is itself falling is not ground: you fall together (no jumping off it, no
        // being dragged along), and if it resets or is taken away you simply keep falling.
        if (o?.kind === 'crate' && !o.frozen && o.held === null && o.vy > 0) { p.y = f.y; p.vy = Math.max(0, o.vy); continue; }
        p.y = f.y; p.vy = 0; p.grounded = true; p.on = f.id;
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
    if (p.id === BLOOM) for (const seed of state.objects.filter(o => o.kind === 'seed' && dist({ x: p.x, y: p.y - 20 }, o) < meta.seeds.reach)) {
      state.objects = state.objects.filter(o => o !== seed); state.seeds++;
      event(state, 'seedPick', seed.x, seed.y, { actor: p.id, seeds: state.seeds });
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
    const x = Math.max(22, Math.min(state.width - 22, p.x + dx));
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
  // Freeze Areas fade on their own clock (they are not slowed by themselves).
  for (const a of state.freezeAreas) a.ticksLeft--;
  for (const a of state.freezeAreas) if (a.ticksLeft <= 0) event(state, 'thaw', a.x, a.y, { area: a.id });
  state.freezeAreas = state.freezeAreas.filter(a => a.ticksLeft > 0);
  applyFreezeAreas(state);
  const before = new Map(state.objects.filter(o => o.kind === 'crate' || o.kind === 'mover' || isEnemy(o)).map(o => [o.id, [o.x, o.y]]));
  ageObjects(state);
  const strikes = updateEnemies(state, { event, nextId: kind => `${kind}-${state.nextEnemy++}` });
  carryRiders(state, before, moveItems(state));
  moveActors(state);
  resolveStrikes(state, strikes);
  // Carriers have finished moving for this tick, so carried items land exactly on them (no one-tick trail).
  attachHeld(state);
  collectPickups(state);
  const done = state.needs.filter(key => state.flags[key]).length;
  if (done > state.needsDone) { state.needsDone = done; state.lastProgressTick = state.elapsed; }
  // Needs are only suggestions; the courtyard is cleared once both travelers stand in the moon gate.
  if (state.actors.every(p => atExit(state, p))) {
    state.status = 'won'; state.unlocked = Math.max(state.unlocked, Math.min(LEVELS.length - 1, state.level + 1));
    if (state.shards.some(s => s.taken)) state.collected[state.level] = true;
    state.totalShards = state.collected.filter(Boolean).length;
    for (const p of state.actors) p.move = 0;
    event(state, 'win', state.exit.x, state.exit.y - 45);
    return;
  }
  // A possible dead end only raises a warning (the game goes on). The counter moves only when a new
  // reason appears, so a client shows each warning once; it clears if the situation recovers.
  const { known, reason } = assessFailure(state);
  if (known && reason !== state.failure) { state.failure = reason; if (reason) { state.failureSeq++; event(state, 'warning', state.exit.x, state.exit.y - 45, { reason }); } }
}

function collectPickups(state) {
  for (const c of state.pickups) {
    if (c.taken) continue;
    const frost = c.kind === 'frost';
    const player = state.actors[frost ? STILL : BLOOM];
    if (Math.hypot(player.x - c.x, player.y - 26 - c.y) >= meta.charges.pickupReach) continue;
    c.taken = true;
    state[frost ? 'freezeCharges' : 'bloomCharges']++;
    event(state, c.kind, c.x, c.y);
  }
}

// Who is at the moon gate, and whether it is open: drives the "waiting for your partner" feedback.
export function exitStatus(state) {
  const open = true; // the checklist is only a suggestion: the gate opens for whoever arrives
  const at = state.actors.map(p => atExit(state, p));
  return { open, at, waiting: open && at.some(Boolean) && !at.every(Boolean) ? at.indexOf(false) : null };
}

// Whether a point (a traveller's feet, or a pickup) is on ledge `f` or above it, standing on something resting there.
const onLedge = (f, p) => p.x >= f.x - 10 && p.x <= f.x + f.w + 10 && p.y <= f.y + 2;

// Who is still on the low side of a gate that sits on a raised ledge (by position, not by what they stand on).
function belowExit(state) {
  const ledge = state.platforms.find(f => state.exit.x >= f.x && state.exit.x <= f.x + f.w && Math.abs(f.y - state.exit.y) <= 2);
  return state.actors.filter(p => !atExit(state, p) && !(ledge && onLedge(ledge, p)));
}

// Conservative dead-end check. Winning only needs both travellers at the moon gate (the checklist is a
// suggestion), so a courtyard is only judged lost when someone provably can no longer reach the gate's ledge,
// using each level's own rule (`exitNeedsPlant`, `crossingNeedsFreeze`) rather than guessing from time or
// position. Dropped seeds always return, and so do crates unless the level sets `crateRespawn: false`, so the
// resources that run out are seeds (a planted seed becomes a mushroom that wilts away), Freeze charges and, in
// such a level, crates. Every rule counts everything that could still help: any seed anywhere, any mushroom at
// all, any crate anywhere, any charge, any crystal that can still be collected, any Freeze Area still up.
// With `crossingFrom` (a platform index) the frozen crossing is only needed by travellers still on that ledge.
// While anyone is airborne the answer is "unknown" (they might be landing on the ledge right now).
export function assessFailure(state) {
  if (state.status !== 'playing') return { known: true, reason: null };
  if (state.actors.some(p => !p.grounded)) return { known: false, reason: null };
  const level = LEVELS[state.level], stuck = belowExit(state);
  if (!level || !stuck.length) return { known: true, reason: null };
  if (level.exitNeedsPlant && state.seeds <= 0 && !state.objects.some(o => o.kind === 'seed' || o.kind === 'plant')) return { known: true, reason: 'stranded' };
  if (!level.crossingNeedsFreeze) return { known: true, reason: null };
  const start = level.crossingFrom === undefined ? null : state.platforms[level.crossingFrom];
  const ahead = start ? stuck.filter(p => onLedge(start, p)) : stuck;
  if (!ahead.length) return { known: true, reason: null };
  if (state.crateRespawn === false && !state.objects.some(o => o.kind === 'crate')) return { known: true, reason: 'crates' };
  // A crystal beyond the crossing cannot help a Still who has not crossed yet.
  const stillAhead = start && ahead.some(p => p.id === STILL);
  const crystal = state.pickups.some(c => c.kind === 'frost' && !c.taken && (!stillAhead || onLedge(start, c)));
  if (state.freezeCharges <= 0 && !state.freezeAreas.length && !crystal) return { known: true, reason: 'freeze' };
  return { known: true, reason: null };
}
export function failureReason(state) { return assessFailure(state).reason; }

export function applyAction(state, playerId, action) {
  if (!validateAction(state, playerId, action).valid) return state;
  if (action.type === 'restart') return makeLevel(state.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'level') return makeLevel(action.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'next') return makeLevel((state.level + 1) % LEVELS.length, state.playerIds, state.unlocked, state.totalShards, state.collected);
  const s = clone(state);
  if (action.type === 'tick') { if (s.status === 'playing') tick(s); return s; }
  if (action.type === 'pause') { if (s.status === 'playing' || s.status === 'paused') s.status = s.status === 'paused' ? 'playing' : 'paused'; for (const p of s.actors) { p.move = 0; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0; } return s; }
  if (action.type === 'switch') { for (const p of s.actors) { p.move = 0; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0; } s.active = 1 - s.active; return s; }
  const p = s.actors[action.actor];
  if (action.type === 'jump' || action.type === 'grab' || action.type === 'ability' || (action.type === 'move' && action.dir !== 0)) s.started = true;
  if (action.type === 'move') p.move = action.dir;
  if (action.type === 'jump' && !p.jumpHeld) { p.jumpHeld = true; p.jumpBuffer = meta.controls.jumpBuffer; }
  if (action.type === 'jumpRelease') p.jumpHeld = false;
  if (action.type === 'grab') {
    if (p.carrying !== null) {
      // Throw the carried crate, aimed or the default way.
      const o = find(s, p.carrying), launch = throwLaunch(s, action.actor, action.aim);
      p.carrying = null; o.held = null; p.facing = launch.facing;
      Object.assign(o, { frozen: false, x: launch.x, y: launch.y, vx: launch.vx, vy: launch.vy });
      event(s, 'throw', o.x, o.y);
    } else if (plantable(s, p)) {
      // Plant one of Bloom's seeds in the pit beside them.
      const pit = plantable(s, p);
      s.seeds--;
      s.objects.push(makePlant(`plant-${s.nextPlant++}`, pit));
      event(s, 'plant', pit.x, pit.y - 10);
    } else {
      const o = pickable(s, p)[0];
      o.held = action.actor; if (o.kind === 'crate') o.frozen = false; p.carrying = o.id;
      event(s, 'grab', o.x, o.y);
      Object.assign(o, heldPosition(o, p)); o.vx = 0; o.vy = 0;
    }
  }
  if (action.type === 'ability') {
    if (action.area !== undefined) {
      const area = s.freezeAreas.find(a => a.id === action.area);
      s.freezeAreas = s.freezeAreas.filter(a => a !== area);
      applyFreezeAreas(s);
      event(s, 'unfreeze', area.x, area.y, { area: area.id });
    } else if (action.actor === STILL) {
      // Still casts a Freeze Area at the chosen point; it costs one charge and starts slowing at once.
      const at = freezePoint(s, action), id = `freeze-${s.nextArea++}`;
      s.freezeAreas.push({ id, owner: playerId, x: at.x, y: at.y, radius: meta.freeze.radius, ticksLeft: meta.freeze.duration, duration: meta.freeze.duration });
      s.freezeCharges--;
      applyFreezeAreas(s);
      event(s, 'freeze', at.x, at.y, { caster: action.actor, area: id });
    } else {
      // Bloom keeps its acceleration: wake a sleeping clock, or hasten it (up to the maximum).
      const o = abilityTarget(s, action.actor, action);
      s.bloomCharges--;
      const woke = o.speed === 0; o.speed++; event(s, woke ? 'wake' : 'grow', anchor(o).x, anchor(o).y, { caster: action.actor, target: o.id });
    }
  }
  return s;
}

export function atExit(state, p) { return Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55; }
export function hintLevel(state) { return state.elapsed - state.lastProgressTick >= meta.time.hintTicks ? 1 : 0; }
export function isGameOver(state) { return state.status === 'won' ? { winner: 'together', level: state.level, complete: state.level === LEVELS.length - 1 } : null; }
export function viewFor(state, playerId) { return state.playerIds.includes(playerId) ? clone(state) : null; }
