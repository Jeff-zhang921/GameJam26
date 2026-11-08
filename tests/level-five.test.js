import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityTargets, meta } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 5, the hidden one: teal things keep Still's pace and gold things Bloom's. Walking right runs their time
// on, walking left runs it back, standing still stops it. Each traveller crosses on the other's colour.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[4];
const get = (s, id) => s.objects.find(o => o.id === id);
const stand = (s, who, x, y, on) => Object.assign(s.actors[who], { x, y, vx: 0, vy: 0, grounded: true, on });
const move = (s, who, dir) => act(s, { type: 'move', actor: who, dir });
// Walk `who` toward `dir` until `done(s)` (or a tick limit), then stop and let a tick settle.
function walkUntil(s, who, dir, done, limit = 600) {
  s = move(s, who, dir);
  for (let i = 0; i < limit && !done(s); i++) s = tick(s);
  expect(done(s)).toBe(true);
  return tick(move(s, who, 0), 2);
}
// Walk the walker of a back-and-forth platform until it sits at `end` ('lo' or 'hi' of its run, within 3 px).
function drive(s, who, id, end) {
  const o = get(s, id), k = o.axis === 'y' ? 'y' : 'x', [lo, hi] = o.axis === 'y' ? [o.y1, o.y2] : [o.x1, o.x2];
  const there = s2 => end === 'lo' ? get(s2, id)[k] <= lo + 3 : get(s2, id)[k] >= hi - 3;
  if (there(s)) return s;
  // Walking right runs its time on: heading the wrong way, walk left (back in time) instead.
  const heading = o.dir;
  return walkUntil(s, who, (end === 'lo') === (heading < 0) ? 1 : -1, there, 800);
}

describe('courtyard 5 layout', () => {
  test('a walking-time courtyard with no abilities', () => {
    const s = setup({ level: 4 });
    expect(s.walkingTime).toBe(true);
    expect(s.freezeCharges).toBe(0);
    expect(s.bloomCharges).toBe(0);
    expect(abilityTargets(s, BLOOM)).toHaveLength(0);
    expect(s.objects.filter(o => o.walker === 0).map(o => o.id)).toEqual(['mover-0', 'mover-3']);
    expect(s.objects.filter(o => o.walker === 1).map(o => o.id)).toEqual(['mover-1', 'mover-2', 'plant-0']);
  });

  test('the rift is too wide to jump', () => {
    for (let delay = 0; delay < 30; delay++) {
      let s = setup({ level: 4 });
      stand(s, STILL, 700, 520, 'platform-0');
      // Jumping only moves Still's own (teal) ferry; push it far away so it cannot help.
      Object.assign(get(s, 'mover-0'), { clock: 190 });
      s = move(s, STILL, 1);
      for (let t = 0; t < 120; t++) { if (t === delay) s = act(s, { type: 'jump', actor: STILL }); s = tick(s); }
      expect(s.actors[STILL].on === 'platform-2').toBe(false);
    }
  });
});

describe('courtyard 5: time keeps pace', () => {
  test('the gold sprout grows while Bloom walks right, shrinks back while Bloom walks left, waits while Bloom stands', () => {
    let s = setup({ level: 4 });
    const start = get(s, 'plant-0').height;
    s = tick(s, 60);
    expect(get(s, 'plant-0').height).toBe(start);
    s = move(s, STILL, 1); s = tick(s, 40); s = move(s, STILL, 0);
    expect(get(s, 'plant-0').height).toBe(start);
    s = move(s, BLOOM, 1); s = tick(s, 40); s = move(s, BLOOM, 0); s = tick(s, 2);
    const grown = get(s, 'plant-0').height;
    expect(grown).toBeGreaterThan(start + 20);
    s = tick(s, 60);
    expect(get(s, 'plant-0').height).toBe(grown);
    s = move(s, BLOOM, -1); s = tick(s, 20); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0').height).toBeLessThan(grown);
    expect(get(s, 'plant-0').height).toBeGreaterThan(start);
  });

  test('walked far it wilts to a husk but never vanishes, and walking back brings it to life', () => {
    let s = setup({ level: 4 });
    const p = get(s, 'plant-0'), { growTicks, matureTicks, witherTicks } = meta.plant;
    Object.assign(p, { age: growTicks + matureTicks + witherTicks - 10 });
    stand(s, BLOOM, 400, 520, 'platform-0');
    s = move(s, BLOOM, 1); s = tick(s, 30); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0')).toMatchObject({ withered: true, age: growTicks + matureTicks + witherTicks });
    s = move(s, BLOOM, -1); s = tick(s, 80); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(get(s, 'plant-0').withered).toBe(false);
  });

  test('a ferry follows its walker step for step, and riding it does not drive it', () => {
    let s = setup({ level: 4 });
    const x0 = get(s, 'mover-0').x;
    s = move(s, STILL, 1); s = tick(s, 20); s = move(s, STILL, 0); s = tick(s, 2);
    expect(get(s, 'mover-0').x).toBeCloseTo(x0 + 20 * meta.controls.speed, 5);
    // Still stands on the gold ferry; Bloom walks; Still is carried but the teal ferry does not move.
    s = setup({ level: 4 });
    stand(s, STILL, 830, 570, 'mover-1');
    s = move(s, BLOOM, 1); s = tick(s, 30); s = move(s, BLOOM, 0); s = tick(s, 2);
    expect(s.actors[STILL].on).toBe('mover-1');
    expect(s.actors[STILL].x).toBeGreaterThan(900);
    expect(get(s, 'mover-0').x).toBe(x0);
    expect(s.flags.moverRide).toBe(true);
  });

  test('walking into a wall moves nothing', () => {
    let s = setup({ level: 4 });
    stand(s, BLOOM, 22, 520, 'platform-0');
    s = tick(s, 2);
    const h = get(s, 'plant-0').height;
    s = move(s, BLOOM, -1); s = tick(s, 30);
    expect(get(s, 'plant-0').height).toBe(h);
  });
});

describe('courtyard 5: room to walk', () => {
  // A walker standing on a ledge can only reach the clock values their steps there cover. Every ledge a walker drives
  // from is wider than half the run of what they drive, so whatever they did before, one walk sweeps it end to end.
  const room = f => f.w - 44;
  test('Still on the start ground sweeps the teal ferry; Still on the plateau sweeps the teal lift', () => {
    const [start, plateau] = level.platforms, [teal, , , tealLift] = level.movers;
    expect(room(start) - 152).toBeGreaterThan(teal.x2 - teal.x1); // the sprout's stem can take up the left end
    expect(room(plateau)).toBeGreaterThan(tealLift.y2 - tealLift.y1);
  });
  test('Bloom on the far ground sweeps the gold ferry and the gold lift', () => {
    const far = level.platforms[2], [, gold, goldLift] = level.movers;
    expect(room(far)).toBeGreaterThan(2 * (gold.x2 - gold.x1));
    expect(room(far)).toBeGreaterThan(2 * (goldLift.y2 - goldLift.y1));
  });
});

describe('courtyard 5 can be finished', () => {
  test('Still rides the sprout to the shard, the ferries carry each across, the lifts carry each up', () => {
    let s = setup({ level: 4 });
    // The shard: Still stands on the sprout, Bloom walks right until it is full grown.
    stand(s, STILL, 110, 520 - get(s, 'plant-0').height, 'plant-0');
    s = walkUntil(s, BLOOM, 1, s2 => get(s2, 'plant-0').height >= meta.plant.maxHeight - 1, 400);
    expect(s.actors[STILL].on).toBe('plant-0');
    expect(s.shards[0].taken).toBe(true);
    expect(s.flags.treeLifted).toBe(true);
    // Back on the ground (placed), Still walks the teal ferry home, then Bloom hops on.
    stand(s, STILL, 250, 520, 'platform-0'); stand(s, BLOOM, 700, 520, 'platform-0');
    s = drive(s, STILL, 'mover-0', 'lo');
    stand(s, BLOOM, 830, 470, 'mover-0');
    // Still walks; the teal ferry carries Bloom across; Bloom steps off onto the far ground.
    s = drive(s, STILL, 'mover-0', 'hi');
    expect(s.actors[BLOOM].on).toBe('mover-0');
    s = walkUntil(s, BLOOM, 1, s2 => s2.actors[BLOOM].on === 'platform-2' && s2.actors[BLOOM].x > 1500);
    // Bloom walks the gold ferry back to the start ground; Still steps off the edge onto it.
    s = drive(s, BLOOM, 'mover-1', 'lo');
    stand(s, STILL, 740, 520, 'platform-0');
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'mover-1');
    s = drive(s, BLOOM, 'mover-1', 'hi');
    expect(s.actors[STILL].on).toBe('mover-1');
    s = act(s, { type: 'jump', actor: STILL });
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'platform-2');
    s = act(s, { type: 'jumpRelease', actor: STILL });
    // The gold lift: Bloom brings it down, Still jumps on from below, Bloom walks it up, Still steps onto the plateau.
    stand(s, BLOOM, 1350, 520, 'platform-2');
    s = drive(s, BLOOM, 'mover-2', 'hi');
    stand(s, STILL, 1690, 520, 'platform-2');
    s = act(s, { type: 'jump', actor: STILL }); s = tick(s, 50); s = act(s, { type: 'jumpRelease', actor: STILL });
    expect(s.actors[STILL].on).toBe('mover-2');
    s = drive(s, BLOOM, 'mover-2', 'lo');
    expect(s.actors[STILL].on).toBe('mover-2');
    s = walkUntil(s, STILL, 1, s2 => s2.actors[STILL].on === 'platform-1' && s2.actors[STILL].x > 1800);
    // The teal lift: Still walks on the plateau to bring it down, Bloom jumps on, Still walks it up.
    stand(s, BLOOM, 2310, 520, 'platform-2');
    s = drive(s, STILL, 'mover-3', 'hi');
    expect(s.actors[STILL].on).toBe('platform-1');
    s = act(s, { type: 'jump', actor: BLOOM }); s = tick(s, 50); s = act(s, { type: 'jumpRelease', actor: BLOOM });
    expect(s.actors[BLOOM].on).toBe('mover-3');
    s = drive(s, STILL, 'mover-3', 'lo');
    expect(s.actors[BLOOM].on).toBe('mover-3');
    s = walkUntil(s, BLOOM, -1, s2 => s2.actors[BLOOM].on === 'platform-1' && s2.actors[BLOOM].x < 2200);
    stand(s, STILL, level.exit.x - 10, 100, 'platform-1'); stand(s, BLOOM, level.exit.x + 10, 100, 'platform-1');
    s = tick(s, 2);
    expect(s.status).toBe('won');
  });
});
