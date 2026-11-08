import { describe, test, expect } from 'bun:test';
import { setup, applyAction, failureReason } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { createCamera } from '../public/presentation.js';
import { classicCourtyard } from './arena.js';

// Courtyard 1: a start ledge with two crates, a gap crossed on crates caught in Freeze Areas, a low middle ledge
// with a seed and a pit, and the highest ledge (with the moon gate) reached on the mushroom.
const act = (s, a) => applyAction(s, 'local', a);
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = act(s, { type: 'tick' }); return s; };
const get = (s, id) => s.objects.find(o => o.id === id);
const STILL = 0, BLOOM = 1;
const level = LEVELS[0];
const [start, gate, middle] = level.platforms;
const on = (f, x) => x > f.x && x < f.x + f.w;
const crate = (id, x, y) => ({ kind: 'crate', id, x, y, vx: 0, vy: 0, frozen: false, held: null, spawnX: x, spawnY: y });
const stand = (s, who, f, x) => Object.assign(s.actors[who], { x, y: f.y, vx: 0, vy: 0, grounded: true, on: `platform-${level.platforms.indexOf(f)}` });

describe('courtyard 1 layout', () => {
  test('three ledges: the gate\'s is highest; the start and the middle are level', () => {
    expect(level.platforms).toHaveLength(3);
    expect(gate.y).toBeLessThan(start.y);
    expect(middle.y).toBe(start.y);
    expect(start.x + start.w).toBeLessThan(middle.x);
    expect(middle.x + middle.w).toBeLessThanOrEqual(gate.x);
    expect(on(gate, level.exit.x) && level.exit.y === gate.y).toBe(true);
  });

  test('from the start ledge the middle ledge is already in view, on any screen shape', () => {
    // Keyboard play follows the active traveller; touch play frames both (and sits above the controls).
    for (const view of [{ width: 1280, height: 640, mode: 'solo' }, { width: 1600, height: 640, mode: 'solo' }, { width: 1440, height: 900, mode: 'solo' }, { width: 1180, height: 690, mode: 'coop', bottomInset: 150 }]) {
      const s = setup({ level: 0 });
      for (const active of [STILL, BLOOM]) {
        s.active = active;
        const cam = createCamera().update(s, view);
        const bottom = (view.height - cam.offsetY) / cam.scale, right = (view.width - cam.offsetX) / cam.scale;
        expect(bottom).toBeGreaterThanOrEqual(middle.y + 25);
        // The long ledge's near end, with the hourglass and the seed, is on screen; the rest scrolls into view.
        expect(right).toBeGreaterThanOrEqual(Math.max(level.freezePickups[0].x, level.seeds[0].x) + 30);
      }
    }
  });

  test('a wider courtyard (1920): the long middle ledge reaches the gate\'s ledge', () => {
    const s = setup({ level: 0 });
    expect(s.width).toBe(1920);
    expect(gate.x + gate.w).toBe(1920);
    expect(middle.x + middle.w).toBe(gate.x);
    expect(setup({ level: 2 }).width).toBe(1280); // the later courtyards keep their size
  });

  test('two crates on the start ledge; on the middle, in order: hourglass, seed, ancient mushroom, pit', () => {
    const s = setup({ level: 0 });
    const crates = s.objects.filter(o => o.kind === 'crate');
    expect(crates).toHaveLength(2);
    for (const c of crates) expect(on(start, c.x) && c.y + 27 === start.y).toBe(true);
    const seeds = s.objects.filter(o => o.kind === 'seed');
    expect(seeds).toHaveLength(1);
    expect(on(middle, seeds[0].x)).toBe(true);
    expect(s.pits).toHaveLength(2);
    for (const p of s.pits) expect(on(middle, p.x) && p.y === middle.y).toBe(true);
    const frost = s.pickups.filter(c => c.kind === 'frost');
    expect(frost).toHaveLength(1);
    expect(on(middle, frost[0].x)).toBe(true);
    const ancient = s.objects.find(o => o.kind === 'plant');
    expect(ancient).toMatchObject({ barrier: true, withered: false, speed: 0, height: 235, pit: 'pit-0' });
    const open = s.pits.find(p => p.plantable !== false);
    expect([frost[0].x, seeds[0].x, ancient.x, open.x]).toEqual([...[frost[0].x, seeds[0].x, ancient.x, open.x]].sort((a, b) => a - b));
    expect(s).toMatchObject({ freezeCharges: 2, seeds: 0, crateRespawn: false });
  });
});

describe('courtyard 1 has no shortcuts', () => {
  // Run off a ledge and jump at every moment from standing to past the coyote grace; return whether `goal` is ever reached.
  function anyJumpReaches(build, goal) {
    for (let delay = 0; delay <= 40; delay++) {
      let s = build();
      s = act(s, { type: 'move', actor: STILL, dir: 1 });
      for (let t = 0; t < 200; t++) {
        if (t === delay) s = act(s, { type: 'jump', actor: STILL });
        s = tick(s);
        if (s.actors[STILL].on === goal) return true;
        if (s.events.some(e => e.kind === 'return' && e.actor === STILL)) break;
      }
    }
    return false;
  }
  const bare = () => { const s = setup({ level: 0 }); s.objects = []; s.pickups = []; stand(s, BLOOM, start, 40); return s; };

  test('the gap cannot be jumped, even from one or two crates at its edge', () => {
    const edge = start.x + start.w;
    const fromEdge = (stack, overhang) => () => {
      const s = bare();
      for (let i = 0; i < stack; i++) s.objects.push(crate(`c${i}`, edge - 27 + overhang * (i + 1), start.y - 27 - 54 * i));
      const top = start.y - 54 * stack, x = stack ? edge - 27 + overhang * stack - 40 : edge - 40;
      Object.assign(s.actors[STILL], { x, y: top, grounded: true, on: stack ? `c${stack - 1}` : 'platform-0' });
      return s;
    };
    expect(anyJumpReaches(fromEdge(0, 0), 'platform-2')).toBe(false);
    expect(anyJumpReaches(fromEdge(1, 26), 'platform-2')).toBe(false);
    expect(anyJumpReaches(fromEdge(2, 0), 'platform-2')).toBe(false);
    expect(anyJumpReaches(fromEdge(2, 26), 'platform-2')).toBe(false);
  });

  test('the gate\'s ledge cannot be reached from the middle, even from two crates stacked against the cliff', () => {
    for (const stack of [0, 1, 2]) {
      const build = () => {
        const s = bare();
        for (let i = 0; i < stack; i++) s.objects.push(crate(`c${i}`, gate.x - 27, middle.y - 27 - 54 * i));
        Object.assign(s.actors[STILL], { x: gate.x - (stack ? 40 : 20), y: middle.y - 54 * stack, grounded: true, on: stack ? `c${stack - 1}` : 'platform-2' });
        return s;
      };
      expect(anyJumpReaches(build, 'platform-1')).toBe(false);
    }
  });

  test('the optional shard over the gap can be taken from a slowed crate', () => {
    let s = setup({ level: 0 });
    s.actors[STILL].x = 300; s = act(s, { type: 'grab', actor: STILL });
    s.actors[STILL].x = 375; s.actors[BLOOM].x = 385;
    s = act(s, { type: 'grab', actor: STILL }); s = tick(s, 6);
    s = act(s, { type: 'ability', actor: STILL, x: get(s, 'crate-0').x, y: get(s, 'crate-0').y });
    s = act(s, { type: 'move', actor: BLOOM, dir: 1 }); s = act(s, { type: 'jump', actor: BLOOM });
    let stepped = false;
    for (let i = 0; i < 300 && !s.shards[0].taken; i++) {
      s = tick(s);
      // Land on the crate, then jump straight up.
      if (!stepped && s.actors[BLOOM].on === 'crate-0') { stepped = true; s = act(s, { type: 'move', actor: BLOOM, dir: 0 }); s = act(s, { type: 'jumpRelease', actor: BLOOM }); s = act(s, { type: 'jump', actor: BLOOM }); }
    }
    expect(s.shards[0].taken).toBe(true);
  });
});

describe('courtyard 1 crates do not come back', () => {
  test('a crate that falls out of the courtyard is gone; elsewhere crates still return', () => {
    let s = setup({ level: 0 });
    Object.assign(get(s, 'crate-0'), { x: 600, y: 700, vy: 5 });
    s = tick(s, 10);
    expect(get(s, 'crate-0')).toBeUndefined();
    expect(get(s, 'crate-1')).toBeDefined();
    expect(s.events.some(e => e.kind === 'crateLost')).toBe(true);
    s = act(s, { type: 'restart' });
    expect(s.objects.filter(o => o.kind === 'crate')).toHaveLength(2); // restarting brings both back

    for (const other of [classicCourtyard(), setup({ level: 3 })]) {
      let o = other;
      const id = o.objects.find(c => c.kind === 'crate').id;
      Object.assign(get(o, id), { x: 600, y: 700, vy: 5 });
      o = tick(o, 10);
      expect(get(o, id)).toMatchObject({ x: get(other, id).spawnX, y: get(other, id).spawnY });
    }
  });

  test('a traveller riding a crate as it is lost simply keeps falling', () => {
    let s = setup({ level: 0 });
    Object.assign(get(s, 'crate-0'), { x: 600, y: 690, vy: 4 });
    Object.assign(s.actors[STILL], { x: 600, y: 663, vy: 4, grounded: true, on: 'crate-0' });
    s = tick(s, 15);
    expect(get(s, 'crate-0')).toBeUndefined();
    expect(Number.isFinite(s.actors[STILL].x) && Number.isFinite(s.actors[STILL].y)).toBe(true);
  });
});

describe('courtyard 1 possible dead ends', () => {
  // Bloom has crossed to the middle ledge; Still is still on the start ledge.
  const split = () => {
    const s = setup({ level: 0 });
    stand(s, STILL, start, 200);
    stand(s, BLOOM, middle, 870);
    return s;
  };

  test('with both crates gone and someone still on the start ledge: "crates"', () => {
    const s = split();
    s.objects = s.objects.filter(o => o.kind !== 'crate');
    expect(failureReason(s)).toBe('crates');
    const thrownAcross = split();
    thrownAcross.objects = thrownAcross.objects.filter(o => o.id !== 'crate-0');
    Object.assign(get(thrownAcross, 'crate-1'), { x: 900, y: middle.y - 27 }); // a crate on the middle can be thrown back
    expect(failureReason(thrownAcross)).toBe(null);
    const crossed = split();
    stand(crossed, STILL, middle, 850);
    crossed.objects = crossed.objects.filter(o => o.kind !== 'crate');
    expect(failureReason(crossed)).toBe(null); // nobody needs a crate any more
  });

  test('"freeze" only counts what the traveller still on the start ledge can use', () => {
    const s = split();
    s.freezeCharges = 0;
    expect(failureReason(s)).toBe('freeze'); // the hourglass is on the middle ledge, out of Still's reach
    const charge = split(); charge.freezeCharges = 1;
    expect(failureReason(charge)).toBe(null);
    const area = split(); area.freezeCharges = 0;
    area.freezeAreas.push({ id: 'a', x: 600, y: 330, radius: 130, ticksLeft: 100, duration: 600 });
    expect(failureReason(area)).toBe(null);
    // Still across and Bloom left behind: Still can still collect the hourglass on the middle.
    const swapped = setup({ level: 0 });
    stand(swapped, BLOOM, start, 200); stand(swapped, STILL, middle, 850);
    swapped.freezeCharges = 0;
    expect(failureReason(swapped)).toBe(null);
    swapped.pickups.find(c => c.kind === 'frost').taken = true;
    expect(failureReason(swapped)).toBe('freeze');
  });

  test('once both are on the middle ledge, running out of Freeze is not a dead end; losing the mushroom is', () => {
    const s = setup({ level: 0 });
    stand(s, STILL, middle, 850); stand(s, BLOOM, middle, 880);
    s.freezeCharges = 0; s.pickups.forEach(c => { c.taken = true; });
    s.objects = s.objects.filter(o => o.kind !== 'crate');
    expect(tick(s, 3)).toMatchObject({ status: 'playing', failure: null });
    s.objects = s.objects.filter(o => o.kind !== 'seed');
    expect(failureReason(s)).toBe(null); // the ancient mushroom still counts until it is gone
    s.objects = s.objects.filter(o => o.kind !== 'plant');
    expect(failureReason(s)).toBe('stranded');
  });
});

describe('courtyard 1 ancient mushroom', () => {
  const ancientOf = s => s.objects.find(o => o.id === 'plant-0');

  test('it blocks the long ledge until Bloom ages it; then it wilts and lets travellers pass', () => {
    let s = setup({ level: 0 });
    const tree = ancientOf(s);
    stand(s, STILL, middle, tree.x - 80); stand(s, BLOOM, middle, tree.x - 110);
    s = act(s, { type: 'move', actor: STILL, dir: 1 }); s = tick(s, 40);
    expect(s.actors[STILL].x).toBeLessThan(tree.x - 42);
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    s = tick(s, 40);
    expect(s.flags.withered).toBe(true);
    expect(s.actors[STILL].x).toBeGreaterThan(tree.x + 42);
    s = tick(s, 600);
    expect(ancientOf(s)).toBeUndefined(); // gone for good
  });

  test('its pit cannot be planted once it is gone; the far pit can', () => {
    let s = setup({ level: 0 });
    s.objects = s.objects.filter(o => o.kind !== 'plant'); s.pits[0].plant = null; s.seeds = 1;
    stand(s, BLOOM, middle, s.pits[0].x);
    expect(act(s, { type: 'grab', actor: BLOOM }).seeds).toBe(1);
    stand(s, BLOOM, middle, s.pits[1].x);
    expect(act(s, { type: 'grab', actor: BLOOM }).seeds).toBe(0);
  });

  test('its cap is too far from the gate\'s ledge to jump across, even from its far edge', () => {
    const tree = setup({ level: 0 }).objects.find(o => o.id === 'plant-0');
    let reached = false;
    for (let delay = 0; delay <= 30 && !reached; delay++) {
      let s = setup({ level: 0 });
      s.objects = s.objects.filter(o => o.kind === 'plant'); s.pickups = [];
      Object.assign(s.actors[STILL], { x: tree.x + 95, y: tree.base - tree.height, vx: 0, vy: 0, grounded: true, on: 'plant-0' });
      stand(s, BLOOM, start, 40);
      s = act(s, { type: 'move', actor: STILL, dir: 1 });
      for (let i = 0; i < 160; i++) { if (i === delay) s = act(s, { type: 'jump', actor: STILL }); s = tick(s); if (s.actors[STILL].on === 'platform-1') { reached = true; break; } }
    }
    expect(reached).toBe(false);
  });
});
