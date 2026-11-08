import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, failureReason, meta } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { ENEMY } from '../src/enemies.js';

// The slowed guard is a step out of the trench. The dropped crate is the step from the middle ledge to the gate.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[1];
const [start, gate, middle, trench, beam] = level.platforms;
const on = (f, x) => x > f.x && x < f.x + f.w;
const guard = s => s.objects.find(o => o.kind === 'guard');
const crate = s => s.objects.find(o => o.kind === 'crate');
const stand = (s, who, f, x) => Object.assign(s.actors[who], { x, y: f.y, vx: 0, vy: 0, grounded: true, on: `platform-${level.platforms.indexOf(f)}` });

describe('courtyard 2 layout', () => {
  test('the two climbs are above normal jump height from their ledges', () => {
    const s = setup({ level: 1 });
    expect(s.width).toBe(2560);
    expect(trench.y - start.y).toBe(80);
    expect(trench.y - middle.y).toBe(190);
    expect(middle.y - gate.y).toBe(190);
    expect(start.x + start.w).toBe(trench.x);
    expect(trench.x + trench.w).toBe(middle.x);
    expect(on(gate, level.exit.x) && level.exit.y === gate.y).toBe(true);
  });

  test('the crate hangs above the middle ledge and returns there if dropped below it', () => {
    const s = setup({ level: 1 });
    const box = crate(s), rope = s.objects.find(o => o.id === box.rope);
    expect(on(beam, rope.x) && on(middle, box.x)).toBe(true);
    expect(rope.top).toBe(beam.y + beam.h);
    expect(rope.bottom).toBe(box.y - 27);
    expect(box.spawnY).toBe(middle.y - 27);
    expect(s.objects.some(o => o.kind === 'seed' || o.kind === 'plant')).toBe(false);
    expect(s.seeds).toBe(0);
    expect(s.pits).toHaveLength(0);
    expect(guard(s)).toMatchObject({ y: trench.y });
    expect(on(trench, guard(s).x)).toBe(true);
    expect(s.freezeCharges + s.pickups.filter(p => p.kind === 'frost').length).toBe(3);
  });
});

describe('courtyard 2 has no shortcuts', () => {
  // Jump toward `dir` at every moment from standing to past the coyote grace; return whether `goal` is ever reached.
  function anyJumpReaches(build, goal, dir = 1) {
    for (let delay = 0; delay <= 40; delay++) {
      let s = build();
      s = act(s, { type: 'move', actor: STILL, dir });
      for (let t = 0; t < 200; t++) {
        if (t === delay) s = act(s, { type: 'jump', actor: STILL });
        s = tick(s);
        if (s.actors[STILL].on === goal) return true;
      }
    }
    return false;
  }
  // Only the travellers and the ledges.
  const bare = () => { const s = setup({ level: 1 }); s.objects = []; stand(s, BLOOM, start, 40); return s; };

  test('the middle ledge cannot be jumped to from the trench floor', () => {
    for (const x of [trench.x + trench.w - 200, trench.x + trench.w - 60, trench.x + trench.w - 16]) {
      expect(anyJumpReaches(() => { const s = bare(); stand(s, STILL, trench, x); return s; }, 'platform-2')).toBe(false);
    }
  });

  test('the gate\'s ledge cannot be jumped to from the middle ledge', () => {
    for (const x of [middle.x + middle.w - 120, middle.x + middle.w - 16]) {
      expect(anyJumpReaches(() => { const s = bare(); stand(s, STILL, middle, x); return s; }, 'platform-1')).toBe(false);
    }
  });

  test('the hanging crate is too high to jump onto before the rope breaks', () => {
    for (const dir of [-1, 1]) expect(anyJumpReaches(() => {
      const s = setup({ level: 1 });
      const box = crate(s);
      stand(s, STILL, middle, box.x - dir * 48);
      return s;
    }, 'crate-0', dir)).toBe(false);
  });

  test('the optional shard over the trench is out of reach of a jump from its floor', () => {
    let s = bare();
    stand(s, STILL, trench, level.shards[0].x);
    s = act(s, { type: 'jump', actor: STILL });
    s = tick(s, 60);
    expect(s.shards[0].taken).toBe(false);
    s = bare();
    s.objects = [setup({ level: 1 }).objects.find(o => o.kind === 'guard')];
    Object.assign(s.objects[0], { x: level.shards[0].x, frozen: true });
    Object.assign(s.actors[STILL], { x: level.shards[0].x, y: trench.y - 50, vx: 0, vy: 0, grounded: true, on: s.objects[0].id });
    s = act(s, { type: 'jump', actor: STILL });
    s = tick(s, 60);
    expect(s.shards[0].taken).toBe(true);
  });

  test('the guard never leaves the trench, even chasing travellers at its edges', () => {
    for (const [f, x] of [[start, start.x + start.w - 20], [middle, middle.x + 20], [trench, trench.x + 20], [trench, trench.x + trench.w - 20]]) {
      let s = setup({ level: 1 });
      stand(s, STILL, f, x); stand(s, BLOOM, f, x + (f === middle ? 30 : -30));
      for (let i = 0; i < 900; i++) {
        s = tick(s);
        const b = guard(s);
        expect(b.y).toBe(trench.y);
        expect(b.x - ENEMY.guard.w / 2 >= trench.x && b.x + ENEMY.guard.w / 2 <= trench.x + trench.w).toBe(true);
      }
    }
  });
});

describe('courtyard 2 route', () => {
  // Jump together so neither traveller waits within striking distance on the ground.
  function climbTogether(s) {
    const jumpedFromGuard = new Set();
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'jump', actor: who });
    for (let i = 0; i < 240 && !s.actors.every(a => a.on === 'platform-2'); i++) {
      for (const who of [STILL, BLOOM]) {
        const a = s.actors[who], g = guard(s);
        if (a.on === 'platform-2' || jumpedFromGuard.has(who)) continue;
        if (a.on === g.id) {
          jumpedFromGuard.add(who);
          s = act(s, { type: 'jumpRelease', actor: who });
          s = act(s, { type: 'move', actor: who, dir: 1 });
          s = act(s, { type: 'jump', actor: who });
        } else {
          const dx = g.x - a.x;
          s = act(s, { type: 'move', actor: who, dir: Math.abs(dx) < 5 ? 0 : Math.sign(dx) });
        }
      }
      s = tick(s);
      for (const a of s.actors) {
        if (a.on === 'platform-2' && a.move) s = act(s, { type: 'move', actor: a.id, dir: 0 });
      }
    }
    expect(jumpedFromGuard.size).toBe(2);
    return s;
  }

  test('both travellers use the slowed guard and then the dropped crate to reach the gate', () => {
    let s = setup({ level: 1 });
    // Stay within sight while luring it; teleporting beyond its detection range
    // should not lock a guard onto an actor it cannot currently reach or see.
    stand(s, STILL, trench, guard(s).x + 180); stand(s, BLOOM, trench, 1470);
    for (let i = 0; i < 600 && guard(s).x < 1430; i++) {
      s = act(s, { type: 'move', actor: STILL, dir: s.actors[STILL].x < Math.min(1480, guard(s).x + 180) ? 1 : 0 });
      s = tick(s);
    }
    s = act(s, { type: 'move', actor: STILL, dir: 0 });
    expect(guard(s).chasing).toBe(true);
    s = act(s, { type: 'ability', actor: STILL, x: guard(s).x, y: guard(s).y - 25 });
    s = tick(s, 5);
    expect(guard(s).frozen).toBe(true);
    s = climbTogether(s);
    s = act(s, { type: 'jumpRelease', actor: BLOOM });
    s = act(s, { type: 'jumpRelease', actor: STILL });
    expect(s.actors.map(a => a.on)).toEqual(['platform-2', 'platform-2']);
    expect(s.events.some(e => e.kind === 'hit')).toBe(false);
    expect(s.flags.guardRide).toBe(true);
    const x = crate(s).x;
    for (const who of [STILL, BLOOM]) {
      s = act(s, { type: 'move', actor: who, dir: 1 });
      for (let i = 0; i < 120 && s.actors[who].x < x - 60; i++) s = tick(s);
      s = act(s, { type: 'move', actor: who, dir: 0 });
    }
    s = act(s, { type: 'ability', actor: BLOOM, target: 'rope-0' });
    s = tick(s, meta.rope.breakTicks + 60);
    expect(s.flags.ropeReleased).toBe(true);
    expect(crate(s)).toMatchObject({ x, y: middle.y - 27, vy: 0 });

    for (const who of [STILL, BLOOM]) {
      s = act(s, { type: 'move', actor: who, dir: 1 });
      s = act(s, { type: 'jump', actor: who });
      for (let i = 0; i < 60 && s.actors[who].x < x; i++) s = tick(s);
      s = act(s, { type: 'move', actor: who, dir: 0 });
      for (let i = 0; i < 60 && s.actors[who].on !== 'crate-0'; i++) s = tick(s);
      expect(s.actors[who].on).toBe('crate-0');
      s = act(s, { type: 'jumpRelease', actor: who });
      s = act(s, { type: 'move', actor: who, dir: 1 });
      s = act(s, { type: 'jump', actor: who });
      for (let i = 0; i < 120 && s.actors[who].on !== 'platform-1'; i++) s = tick(s);
      expect(s.actors[who].on).toBe('platform-1');
      s = act(s, { type: 'jumpRelease', actor: who });
    }
    for (let i = 0; i < 300 && s.status !== 'won'; i++) {
      for (const who of [STILL, BLOOM]) { const a = s.actors[who]; s = act(s, { type: 'move', actor: who, dir: Math.abs(a.x - level.exit.x) < 10 ? 0 : Math.sign(level.exit.x - a.x) }); }
      s = tick(s);
    }
    expect(s.status).toBe('won');
  });

  test('a released crate lost to the trench resets on the middle ledge', () => {
    let s = setup({ level: 1 });
    stand(s, BLOOM, middle, crate(s).x - 50);
    s = tick(act(s, { type: 'ability', actor: BLOOM, target: 'rope-0' }), meta.rope.breakTicks + 60);
    const box = crate(s);
    Object.assign(box, { x: trench.x + 400, y: middle.y + 80, vy: 4 });
    s = tick(s);
    expect(crate(s)).toMatchObject({ x: box.spawnX, y: middle.y - 27 });
    expect(crate(s).rope).toBeUndefined();
  });

  test('warns only when the rope still needs Speed and there is no charge or lightning left', () => {
    const s = setup({ level: 1 });
    s.bloomCharges = 0;
    expect(failureReason(s)).toBeNull();
    s.pickups.find(c => c.kind === 'bolt').taken = true;
    expect(failureReason(s)).toBe('rope');
    s.objects.find(o => o.kind === 'rope').speed = 1;
    expect(failureReason(s)).toBeNull();
  });
});
