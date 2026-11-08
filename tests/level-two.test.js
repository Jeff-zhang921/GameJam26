import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, failureReason } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { ENEMY } from '../src/enemies.js';

// Courtyard 2: a start ledge, a low trench patrolled by a guard (with the only seed), a middle ledge too high to
// jump to from the trench except off the slowed guard's head, and the gate's ledge reached on a mushroom grown in
// the middle ledge's pit.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[1];
const [start, gate, middle, trench] = level.platforms;
const on = (f, x) => x > f.x && x < f.x + f.w;
const guard = s => s.objects.find(o => o.kind === 'guard');
const stand = (s, who, f, x) => Object.assign(s.actors[who], { x, y: f.y, vx: 0, vy: 0, grounded: true, on: `platform-${level.platforms.indexOf(f)}` });

describe('courtyard 2 layout', () => {
  test('four ledges: the trench is lowest, the gate\'s ledge highest, the middle between', () => {
    const s = setup({ level: 1 });
    expect(s.width).toBe(2560);
    expect(trench.y - start.y).toBe(80);
    expect(trench.y - middle.y).toBe(190);
    expect(middle.y - gate.y).toBe(210);
    expect(start.x + start.w).toBe(trench.x);
    expect(trench.x + trench.w).toBe(middle.x);
    expect(on(gate, level.exit.x) && level.exit.y === gate.y).toBe(true);
  });

  test('no crates; the only seed is on the trench floor and the only pit on the middle ledge', () => {
    const s = setup({ level: 1 });
    expect(s.objects.filter(o => o.kind === 'crate')).toHaveLength(0);
    const seeds = s.objects.filter(o => o.kind === 'seed');
    expect(seeds).toHaveLength(1);
    expect(on(trench, seeds[0].x)).toBe(true);
    expect(s.seeds).toBe(0);
    expect(s.pits).toHaveLength(1);
    expect(on(middle, s.pits[0].x) && s.pits[0].y === middle.y).toBe(true);
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
  // No guard, no seed: only the travellers and the ledges.
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
  // Steer `who` onto the guard's head with a jump, then jump on up to the middle ledge.
  function climb(s, who) {
    s = act(s, { type: 'jump', actor: who });
    let onGuard = false;
    for (let i = 0; i < 240; i++) {
      s = tick(s);
      const a = s.actors[who];
      if (a.on === 'platform-2') return act(s, { type: 'move', actor: who, dir: 0 });
      if (onGuard) continue;
      if (a.on === guard(s).id) {
        onGuard = true;
        s = act(s, { type: 'jumpRelease', actor: who }); s = act(s, { type: 'move', actor: who, dir: 1 }); s = act(s, { type: 'jump', actor: who });
      } else { const dx = guard(s).x - a.x; s = act(s, { type: 'move', actor: who, dir: Math.abs(dx) < 5 ? 0 : Math.sign(dx) }); }
    }
    return s;
  }

  test('lure the guard to the right wall, slow it, and climb off its head to the middle ledge, then grow up to the gate', () => {
    let s = setup({ level: 1 });
    // Bloom fetches the seed from the trench floor.
    stand(s, BLOOM, trench, level.seeds[0].x);
    s = tick(s);
    expect(s.seeds).toBe(1);
    // Both wait at the trench's right wall until the guard has chased them there.
    stand(s, STILL, trench, 1400); stand(s, BLOOM, trench, 1470);
    for (let i = 0; i < 400 && guard(s).x < 1330; i++) s = tick(s);
    expect(guard(s).chasing).toBe(true);
    s = act(s, { type: 'ability', actor: STILL, x: guard(s).x, y: guard(s).y - 25 });
    s = tick(s, 5);
    expect(guard(s).frozen).toBe(true);
    // Even slowed it still strikes now and then: Still keeps well clear (it still creeps after them) while Bloom climbs.
    stand(s, STILL, trench, guard(s).x + 120);
    s = climb(s, BLOOM);
    s = act(s, { type: 'jumpRelease', actor: BLOOM });
    s = climb(s, STILL);
    expect(s.actors.map(a => a.on)).toEqual(['platform-2', 'platform-2']);
    expect(s.actors.every(a => a.x > middle.x)).toBe(true); // nobody was sent back
    expect(s.flags.guardRide).toBe(true);
    // Bloom plants the seed; both stand on it and Bloom wakes it at full speed.
    const pit = s.pits[0];
    stand(s, BLOOM, middle, pit.x);
    s = act(s, { type: 'grab', actor: BLOOM });
    stand(s, STILL, middle, pit.x + 10);
    for (let i = 0; i < 3; i++) s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    for (let i = 0; i < 600 && s.actors[STILL].y > gate.y - 10; i++) s = tick(s);
    expect(s.flags.treeLifted).toBe(true);
    // From the cap, each traveller jumps right onto the gate's ledge and walks into the moon gate.
    for (const who of [STILL, BLOOM]) {
      s = act(s, { type: 'move', actor: who, dir: 1 }); s = act(s, { type: 'jump', actor: who });
      s = act(s, { type: 'jumpRelease', actor: who === STILL ? BLOOM : STILL });
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

  test('with the seed spent and the mushroom gone, a traveller below the gate is warned they are stranded', () => {
    const s = setup({ level: 1 });
    s.objects = s.objects.filter(o => o.kind !== 'seed');
    expect(failureReason(s)).toBe('stranded');
  });
});
