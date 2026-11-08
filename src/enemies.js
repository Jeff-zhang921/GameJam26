// Enemy-type world objects: guards, lanterns, launchers with their darts and orbs, nests with their mites.
// They are always active, but only age once Bloom has hastened them. Inside a Freeze Area they run at FROZEN_RATE.
// Guards, lanterns and adult mites are solid and strike whoever touches them on a fixed rhythm.
// Local time inside one of Still's Freeze Areas (configurable): 0.2 means everything there runs at a fifth of normal speed.
export const FROZEN_RATE = 0.2;
const STRIKE_CUE_RANGE = 520;
export const ENEMY = {
  guard: { w: 52, h: 50, life: 1200, patrol: 1.2, lockSeconds: 2, see: 260, seeHeight: 80, attackEvery: 30, windup: 15 },
  lantern: { w: 44, h: 44, life: 1200, fly: 1, notice: 320, giveUp: 480, bob: 6, attackEvery: 72, windup: 24 },
  launcher: { w: 40, h: 40, every: 180 },
  dart: { w: 36, h: 10, fly: 5 },
  orb: { w: 20, h: 20, fly: 2, turn: Math.PI / 60, life: 360 },
  nest: { w: 60, h: 30, every: 300, max: 3 },
  mite: { life: 900, roam: 120, walk: [0.6, 1.4, 0], see: 80, attackEvery: 54, windup: 24 },
};
const MITE_SIZE = [[0, 36, 30], [0.35, 36, 30], [0.45, 44, 40], [0.75, 44, 40], [0.85, 40, 34], [1, 40, 34]];

export const isEnemy = o => Object.hasOwn(ENEMY, o.kind);
export const pace = o => (1 + 0.5 * o.speed) * (o.frozen ? FROZEN_RATE : 1);
export const lifeFraction = o => ENEMY[o.kind].life ? Math.min(1, o.age / ENEMY[o.kind].life) : 0;
export const miteStage = o => { const f = lifeFraction(o); return f < 0.4 ? 0 : f < 0.8 ? 1 : 2; };
const isProjectile = o => o.kind === 'dart' || o.kind === 'orb';
export const isHazard = o => isProjectile(o) && !o.frozen;
export const isMoving = o => isEnemy(o) && !o.frozen && ['guard', 'lantern', 'dart', 'orb', 'mite'].includes(o.kind);
export const isSolidEnemy = o => isEnemy(o) && !isHazard(o);
export const canStrike = o => o.kind === 'guard' || o.kind === 'lantern' || (o.kind === 'mite' && miteStage(o) === 1);
// 0 when idle, rising to 1 over the wind-up before a strike.
export const attackCharge = o => {
  if (!canStrike(o)) return 0;
  const { attackEvery, windup } = ENEMY[o.kind];
  return Math.max(0, (o.attack - (attackEvery - windup)) / windup);
};

function miteSize(o) {
  const f = lifeFraction(o);
  for (let i = 1; i < MITE_SIZE.length; i++) {
    const [f1, w1, h1] = MITE_SIZE[i - 1], [f2, w2, h2] = MITE_SIZE[i];
    if (f <= f2) { const k = f2 === f1 ? 1 : (f - f1) / (f2 - f1); return [w1 + (w2 - w1) * k, h1 + (h2 - h1) * k]; }
  }
  return [40, 34];
}

export function enemyBox(o) {
  let { w, h } = ENEMY[o.kind];
  if (o.kind === 'mite') [w, h] = miteSize(o);
  if (o.kind === 'dart' && Math.abs(o.dy) > Math.abs(o.dx)) [w, h] = [h, w];
  return { x: o.x - w / 2, y: o.y - h, w, h };
}

export function makeEnemy(kind, data, id) {
  const base = { kind, id, x: data.x, y: data.y, speed: 0, age: 0, frozen: false, timer: 0, attack: 0 };
  if (kind === 'guard') return { ...base, minX: data.minX, maxX: data.maxX, dir: 1, chasing: false, target: null, targetLockUntil: 0, platformIndex: null };
  if (kind === 'lantern') return { ...base, homeX: data.x, homeY: data.y, chasing: false, bob: 0 };
  if (kind === 'launcher') return { ...base, dx: data.dir[0], dy: data.dir[1], every: data.every ?? ENEMY.launcher.every, shot: data.shot ?? 'dart' };
  if (kind === 'nest') return { ...base, every: data.every ?? ENEMY.nest.every, max: data.max ?? ENEMY.nest.max, spawned: 0 };
  if (kind === 'mite') return { ...base, nest: data.nest, homeX: data.homeX, dir: data.dir ?? 1 };
  const len = Math.hypot(data.dx, data.dy) || 1;
  return { ...base, dx: data.dx / len, dy: data.dy / len };
}

const overlap = (a, b) => a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;
const center = o => { const b = enemyBox(o); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };

export function guardPlatform(state, guard) {
  const saved = state.platforms[guard.platformIndex];
  if (saved && Math.abs(saved.y - guard.y) < 2) return saved;
  return state.platforms.find(f => Math.abs(f.y - guard.y) < 2 && guard.x >= f.x && guard.x <= f.x + f.w) ?? null;
}

function actorPlatform(state, actor) {
  const index = /^platform-(\d+)$/.exec(actor.on ?? '')?.[1];
  const standing = index === undefined ? null : state.platforms[Number(index)];
  if (actor.grounded && standing && Math.abs(actor.y - standing.y) < 2 && actor.x >= standing.x && actor.x <= standing.x + standing.w) return standing;
  // Airborne travellers belong to the first ledge below their feet, not a
  // neighbouring ledge at a similar height. This also handles a guard rider.
  return state.platforms.filter(f => actor.x >= f.x && actor.x <= f.x + f.w && f.y >= actor.y - 2).sort((a, b) => a.y - b.y)[0] ?? null;
}

export function guardTarget(state, guard, platform = guardPlatform(state, guard)) {
  if (!platform) return null;
  const spec = ENEMY.guard;
  const eligible = state.actors.filter(actor =>
    // Respawns happen after enemy movement, so release the target on the following tick.
    (actor.respawnTick == null || actor.respawnTick < state.tick - 1) && actorPlatform(state, actor) === platform);
  if (state.tick < guard.targetLockUntil) {
    const locked = eligible.find(actor => actor.id === guard.target);
    if (locked) return locked;
  }
  let target = null, closest = Infinity;
  for (const actor of eligible) {
    if (Math.abs(actor.y - guard.y) > spec.seeHeight || Math.abs(actor.x - guard.x) > spec.see) continue;
    const distance = Math.hypot(actor.x - guard.x, actor.y - 26 - (guard.y - spec.h / 2));
    if (distance < closest) { closest = distance; target = actor; }
  }
  return target;
}

export function updateEnemies(state, { event, nextId, walkSpeed, tickRate }) {
  const strikes = [];
  const remove = o => { state.objects = state.objects.filter(x => x !== o); };
  const spawn = (kind, data) => { const o = makeEnemy(kind, data, nextId(kind)); state.objects.push(o); return o; };
  const nearest = (o, ok = () => true) => {
    const c = center(o);
    let best = null, bestD = Infinity;
    for (const p of state.actors) if (ok(p)) { const d = Math.hypot(p.x - c.x, p.y - 26 - c.y); if (d < bestD) { best = p; bestD = d; } }
    return best && { p: best, d: bestD };
  };
  const supported = (o, x) => state.platforms.some(f => Math.abs(f.y - o.y) < 2 && x >= f.x && x <= f.x + f.w);
  const walk = (o, step, limit) => {
    const half = enemyBox(o).w / 2, nx = o.x + step;
    if (!step || !limit(nx) || !supported(o, nx + Math.sign(step) * half)) return false;
    o.x = nx; return true;
  };
  const blockers = [
    ...state.platforms,
    ...state.objects.filter(o => (o.frozen && o.kind === 'crate') || (isSolidEnemy(o) && o.kind !== 'launcher')).map(o => ({ ...(o.kind === 'crate' ? { x: o.x - 27, y: o.y - 27, w: 54, h: 54 } : enemyBox(o)), id: o.id })),
  ];
  const fly = (o, spec) => {
    o.x += o.dx * spec.fly * pace(o); o.y += o.dy * spec.fly * pace(o);
    const box = enemyBox(o);
    if (box.x > state.width + 50 || box.x + box.w < -50 || box.y > 700 || box.y + box.h < -50 || blockers.some(b => b.id !== o.id && overlap(box, b))) {
      remove(o); event(state, 'pop', o.x, o.y - box.h / 2);
    }
  };
  for (const o of [...state.objects]) {
    if (!isEnemy(o) || !state.objects.includes(o)) continue;
    const spec = ENEMY[o.kind], k = pace(o), slow = o.frozen ? FROZEN_RATE : 1;
    const rate = (o.kind === 'orb' ? Math.max(1, o.speed) : o.speed) * slow;
    if (spec.life && rate) {
      o.age += rate;
      if (o.age >= spec.life) {
        remove(o); event(state, 'vanish', o.x, o.y - enemyBox(o).h / 2);
        if (o.kind === 'mite') state.flags.miteGone = true;
        continue;
      }
    }
    if (canStrike(o)) {
      o.attack += k;
      if (o.attack >= spec.attackEvery) {
        o.attack -= spec.attackEvery; strikes.push(o.id);
        const b = enemyBox(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (state.actors.some(p => Math.hypot(p.x - cx, p.y - 26 - cy) <= STRIKE_CUE_RANGE)) event(state, 'strike', cx, cy);
      }
    } else o.attack = 0;
    if (o.kind === 'guard') {
      const home = guardPlatform(state, o);
      if (!home) { o.chasing = false; o.target = null; o.targetLockUntil = 0; continue; }
      o.platformIndex = state.platforms.indexOf(home);
      const half = spec.w / 2, left = home.x + half, right = home.x + home.w - half;
      o.x = Math.max(left, Math.min(right, o.x));
      const p = guardTarget(state, o, home);
      o.chasing = !!p;
      const target = p?.id ?? null;
      if (target !== o.target) {
        o.target = target;
        o.targetLockUntil = p ? state.tick + spec.lockSeconds * tickRate : 0;
      }
      if (p) {
        const distance = p.x - o.x;
        if (Math.abs(distance) > 2) {
          o.dir = Math.sign(distance);
          o.x = Math.max(left, Math.min(right, o.x + o.dir * Math.min(Math.abs(distance), walkSpeed * k)));
        }
      } else {
        const patrolLeft = Math.max(left, Math.min(right, o.minX ?? left));
        const patrolRight = Math.max(patrolLeft, Math.min(right, o.maxX ?? right));
        if (o.x > patrolRight) o.dir = -1;
        else if (o.x < patrolLeft) o.dir = 1;
        const edge = o.dir > 0 ? patrolRight : patrolLeft, distance = edge - o.x;
        o.x += Math.sign(distance) * Math.min(Math.abs(distance), spec.patrol * k);
        if (Math.abs(o.x - edge) < .001) o.dir = -o.dir;
      }
    }
    if (o.kind === 'lantern') {
      const near = nearest(o, a => a.on !== o.id);
      if (o.chasing && (!near || near.d > spec.giveUp)) o.chasing = false;
      else if (!o.chasing && near && near.d < spec.notice) o.chasing = true;
      o.bob += k;
      const tx = o.chasing ? near.p.x : o.homeX;
      const ty = o.chasing ? near.p.y - 26 + spec.h / 2 : o.homeY + Math.sin(o.bob * 0.05) * spec.bob;
      const dx = tx - o.x, dy = ty - o.y, len = Math.hypot(dx, dy), v = spec.fly * k;
      if (len <= v) { o.x = tx; o.y = ty; } else { o.x += dx / len * v; o.y += dy / len * v; }
    }
    if (o.kind === 'launcher') {
      o.timer += k;
      if (o.timer >= o.every) {
        o.timer -= o.every;
        const c = center(o), shot = ENEMY[o.shot], h = o.shot === 'dart' && Math.abs(o.dy) > Math.abs(o.dx) ? shot.w : shot.h;
        spawn(o.shot, { x: c.x + o.dx * 40, y: c.y + o.dy * 40 + h / 2, dx: o.dx, dy: o.dy });
        event(state, 'fire', c.x + o.dx * 30, c.y + o.dy * 30);
      }
    }
    if (o.kind === 'dart') fly(o, spec);
    if (o.kind === 'orb') {
      const near = nearest(o);
      if (near) {
        const c = center(o), cur = Math.atan2(o.dy, o.dx), want = Math.atan2(near.p.y - 26 - c.y, near.p.x - c.x);
        const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), a = cur + Math.max(-spec.turn * slow, Math.min(spec.turn * slow, diff));
        o.dx = Math.cos(a); o.dy = Math.sin(a);
      }
      fly(o, spec);
    }
    if (o.kind === 'nest') {
      o.timer += k;
      if (o.timer >= o.every) {
        o.timer -= o.every;
        if (state.objects.filter(m => m.kind === 'mite' && m.nest === o.id).length < o.max) {
          const side = o.spawned++ % 2 ? -1 : 1;
          spawn('mite', { x: o.x + side * 45, y: o.y, nest: o.id, homeX: o.x, dir: side });
          event(state, 'spawn', o.x + side * 45, o.y - 15);
        }
      }
    }
    if (o.kind === 'mite') {
      const stage = miteStage(o);
      if (stage === 2) continue;
      const inRoam = x => Math.abs(x - o.homeX) <= spec.roam;
      const near = stage === 1 ? nearest(o, a => Math.abs(a.y - o.y) <= spec.see) : null;
      if (near && Math.abs(near.p.x - o.x) > 2) { o.dir = Math.sign(near.p.x - o.x); walk(o, o.dir * spec.walk[1] * k, inRoam); }
      else if (!walk(o, o.dir * spec.walk[stage] * k, inRoam)) o.dir = -o.dir;
    }
  }
  return strikes;
}
