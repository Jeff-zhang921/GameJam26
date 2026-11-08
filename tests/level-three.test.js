import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, throwPath, canopyWidth, abilityCheck } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 3: arrows over the start (ride the mushroom into the safe band between two lanes, hop to the high
// ledge), a canyon (near vine → vertical lift → far vine), and two movers in opposite phase over a chasm.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[2];
const [start, high, pillar, far, exitLedge, step] = level.platforms;
const JUMP = meta.controls.jump ** 2 / (2 * meta.controls.gravity); // about 163
const on = (f, x) => x > f.x && x < f.x + f.w;
const launchers = level.enemies.filter(e => e.kind === 'launcher').sort((a, b) => b.y - a.y); // lower lane first
const lane = l => l.y - 20; // a launcher's darts fly at its centre
const [lowerLane, upperLane] = launchers.map(lane);
// Does a traveller with feet at `feet` overlap a dart lane? (hurt up to the hat, 66 above the feet; darts 10 tall)
const struckAt = (feet, y) => feet - 66 < y + 5 && feet - 1 > y - 5;
const hit = (h, y) => struckAt(start.y - h, y); // standing on a cap of height h
const [groundPit, nearPit, farPit] = level.pits;
const [lift, moverA, moverB] = level.movers;
const NEAR_VINE = 240, VINE = 160; // the wider step keeps the near vine necessary; the far vine retains its window
const stand = (s, who, f, x) => Object.assign(s.actors[who], { x, y: f.y, vx: 0, vy: 0, grounded: true, on: `platform-${level.platforms.indexOf(f)}` });
const get = (s, id) => s.objects.find(o => o.id === id);
const pitPlant = (s, pit) => s.pits.find(p => p.x === pit.x && p.y === pit.y).plant;
const aimAt = (s, x, y) => {
  let best = null;
  for (let vx = -11; vx <= 11; vx += .25) for (let vy = -11; vy <= 11; vy += .25) {
    if (Math.hypot(vx, vy) > meta.throw.maxSpeed) continue;
    const end = throwPath(s, 1, { vx, vy }).at(-1), d = Math.hypot(end.x - x, end.y - y);
    if (!best || d < best.d) best = { vx, vy, d };
  }
  return best;
};
// Bloom, standing where it is, takes a seed and throws it into a wall pit (aimed just off the face).
const throwInto = (s, pit) => {
  s = act(s, { type: 'takeSeed', actor: BLOOM });
  const aim = aimAt(s, pit.x + pit.wall * 10, pit.y);
  expect(aim.d).toBeLessThanOrEqual(24);
  s = act(s, { type: 'grab', actor: BLOOM, aim: { vx: aim.vx, vy: aim.vy } });
  s = tick(s, 90);
  expect(pitPlant(s, pit)).not.toBeNull();
  return s;
};
const hits = s => s.events.filter(e => e.kind === 'hit' && e.tick === s.tick).length;
// Steps until `done(s)`, applying `control(s)` first each tick; fails the test after `limit` ticks.
const until = (s, done, control = s => s, limit = 600) => {
  for (let i = 0; i < limit; i++) { if (done(s)) return s; s = control(s); s = tick(s); }
  expect(done(s)).toBe(true);
  return s;
};

describe('courtyard 3 layout', () => {
  test('wide; the high ledge is out of reach from the start; the pillar and far cliff are hops', () => {
    const s = setup({ level: 2 });
    expect(s.width).toBe(3920);
    expect(start.y - high.y).toBeGreaterThan(JUMP);
    expect(high.y - pillar.y).toBeLessThan(JUMP - 10);
    expect(on(high, pillar.x) && pillar.y + pillar.h === high.y).toBe(true);
    expect(on(exitLedge, level.exit.x) && level.exit.y === exitLedge.y).toBe(true);
    expect(level.exitNeedsPlant).toBe(true);
    expect(level.platforms[level.plantFrom]).toBe(start);
  });

  test('arrows: a safe band between the lanes; the grown mushroom rides into the upper lane', () => {
    expect([lowerLane, upperLane]).toEqual([350, 225]);
    expect(launchers.map(l => l.every)).toEqual([420, 180]);
    expect(hit(150, lowerLane)).toBe(true);
    for (const h of [180, 200, 220]) expect(hit(h, lowerLane) || hit(h, upperLane)).toBe(false);
    expect(hit(meta.plant.maxHeight, upperLane)).toBe(true);
    // From the band the ledge is a short hop: up a little, across the gap to its face.
    expect(groundPit).toMatchObject({ y: start.y }); expect(groundPit.wall).toBeUndefined();
    const cap = canopyWidth({ height: 200, withered: false, age: 0 });
    expect(high.x - (groundPit.x + cap / 2)).toBeLessThan(150);
    expect((start.y - 200) - high.y).toBeLessThan(JUMP - 60);
    // Standing on the ground or on the high ledge is clear of both lanes.
    for (const y of [lowerLane, upperLane]) { expect(struckAt(start.y, y)).toBe(false); expect(struckAt(high.y, y)).toBe(false); }
  });

  test('lower-lane darts stop at the high ledge face, upper-lane darts at the pillar', () => {
    let s = setup({ level: 2 }), maxLow = 0, maxUp = 0;
    for (let i = 0; i < 600; i++) {
      s = tick(s);
      for (const d of s.objects.filter(o => o.kind === 'dart')) {
        if (Math.abs(d.y - 5 - lowerLane) < 1) maxLow = Math.max(maxLow, d.x);
        if (Math.abs(d.y - 5 - upperLane) < 1) maxUp = Math.max(maxUp, d.x);
      }
    }
    expect(maxLow).toBeGreaterThan(400); expect(maxLow).toBeLessThan(high.x + 20);
    expect(maxUp).toBeGreaterThan(high.x); expect(maxUp).toBeLessThan(pillar.x + 20);
  });

  test('canyon: wall pits on both cliff faces; near / far vines bridge the lift gaps at lengths 240 / 160', () => {
    expect(nearPit).toMatchObject({ x: high.x + high.w, wall: 1 }); expect(nearPit.y).toBeGreaterThan(high.y);
    expect(farPit).toMatchObject({ x: far.x, wall: -1 }); expect(farPit.y).toBeGreaterThan(far.y);
    expect(lift).toMatchObject({ axis: 'y', y1: farPit.y, y2: nearPit.y });
    expect(step).toMatchObject({ x: 1400, y: 440, w: 140, h: 30 });
    expect(lift.x - (step.x + step.w)).toBe(230);
    expect(lift.x - (nearPit.x + NEAR_VINE)).toBeLessThanOrEqual(150);
    expect((farPit.x - VINE) - (lift.x + lift.w)).toBeLessThanOrEqual(150);
    expect(farPit.y - far.y).toBeLessThan(JUMP - 60);
    // Nothing to land on in the canyon but the small step under the near pit.
    expect(level.platforms.some(f => f !== step && f.x < far.x && f.x + f.w > nearPit.x)).toBe(false);
    expect(step.x).toBe(nearPit.x); expect(step.y - nearPit.y).toBeLessThan(JUMP - 30);
  });

  test('canyon: the lift is out of jumping reach from the high ledge, and the far cliff from the lift', () => {
    // Every lift phase, every coyote-time jump: running off the edge never lands on the other side.
    const leap = (place, from, to) => {
      for (let wait = 0; wait < 160; wait += 8) for (let late = 0; late <= meta.controls.coyote; late++) {
        let s = setup({ level: 2 }); place(s); s = tick(s, wait);
        s = act(s, { type: 'move', actor: STILL, dir: 1 });
        let left = null, landed = null;
        for (let i = 0; i < 150 && landed === null; i++) {
          if (left === null && !s.actors[STILL].grounded) left = i;
          if (left !== null && i - left === late) s = applyAction(s, 'local', { type: 'jump', actor: STILL });
          s = tick(s);
          const p = s.actors[STILL];
          if (p.grounded && p.on !== from) landed = p.on;
          if (p.respawnTick !== null) landed = 'fell';
        }
        expect(landed === to).toBe(false);
      }
    };
    leap(s => stand(s, STILL, high, high.x + high.w - 30), 'platform-1', 'mover-0');
    leap(s => stand(s, STILL, step, step.x + step.w - 16), 'platform-5', 'mover-0');
    leap(s => { const m = get(s, 'mover-0'); Object.assign(s.actors[STILL], { x: m.x + 30, y: m.y, vx: 0, vy: 0, grounded: true, on: 'mover-0' }); }, 'mover-0', 'platform-3');
  });

  test('twin movers meet in the middle and B delivers to the exit ledge', () => {
    let s = setup({ level: 2 }), closest = Infinity, met = false;
    for (let i = 0; i < 1300; i++) {
      s = tick(s);
      const a = get(s, 'mover-1'), b = get(s, 'mover-2'), gap = b.x - (a.x + a.w);
      closest = Math.min(closest, gap); if (gap <= 40) met = true;
    }
    expect(met).toBe(true); expect(closest).toBe(30);
    expect(moverA.x1 - (far.x + far.w)).toBe(20);
    expect(exitLedge.x - (moverB.x2 + moverB.w)).toBe(10);
    expect([moverA.y, moverB.y]).toEqual([far.y, exitLedge.y]);
  });

  test('both vines can be planted by throws: the near one from the high ledge, the far one from the lift', () => {
    let s = setup({ level: 2 });
    // 38 back from the edge, facing right: the seed leaves just clear of the cliff face and drops straight into the pit.
    stand(s, BLOOM, high, nearPit.x - 38);
    s = throwInto(s, nearPit);
    expect(abilityCheck(s, BLOOM, pitPlant(s, nearPit))).toBe('ok');
    // On the lift at its top, at the far end (placed, as steering there would be fragile), throw at the far pit; the
    // new vine is within Bloom's reach from there.
    const onLiftEnd = s => { const m = get(s, 'mover-0'); Object.assign(s.actors[BLOOM], { x: m.x + m.w - 5, y: m.y, vx: 0, vy: 0, grounded: true, on: 'mover-0' }); };
    Object.assign(get(s, 'mover-0'), { y: lift.y1 });
    onLiftEnd(s);
    s = throwInto(s, farPit);
    onLiftEnd(s);
    expect(abilityCheck(s, BLOOM, pitPlant(s, farPit))).toBe('ok');
  });

  test('rescue: Bloom plants the far vine, jumps back to the widened step and plants the near vine for Still', () => {
    let s = setup({ level: 2 });
    // Facing left, about 38 back from the far cliff's edge: a seed straight down into the far wall pit.
    stand(s, BLOOM, far, far.x + 38); s.actors[BLOOM].facing = -1;
    s = throwInto(s, farPit);
    expect(abilityCheck(s, BLOOM, pitPlant(s, farPit))).toBe('ok');
    // The moved lift is deliberately out of reach of the near pit. Jump down-left onto the wider step instead.
    const m = get(s, 'mover-0'); m.y = lift.y2;
    Object.assign(s.actors[BLOOM], { x: m.x + 5, y: m.y, vx: 0, vy: 0, grounded: true, on: 'mover-0', facing: -1 });
    s = act(act(s, { type: 'move', actor: BLOOM, dir: -1 }), { type: 'jump', actor: BLOOM });
    s = until(s, s => s.actors[BLOOM].grounded && s.actors[BLOOM].on === 'platform-5', s => s, 120);
    s = act(s, { type: 'move', actor: BLOOM, dir: 0 });
    s = throwInto(s, nearPit);
    expect(abilityCheck(s, BLOOM, pitPlant(s, nearPit))).toBe('ok');
  });

  test('resources: enough seeds and Bloom charges for a clean run and one canyon redo', () => {
    const s = setup({ level: 2 });
    expect(s.seeds).toBe(3);
    // A clean run uses three seeds and three wakes (mushroom, two vines); a canyon redo needs two more of each.
    expect(s.seeds + s.objects.filter(o => o.kind === 'seed').length).toBeGreaterThanOrEqual(3 + 2);
    expect(s.bloomCharges + s.pickups.filter(c => c.kind === 'bolt').length).toBeGreaterThanOrEqual(3 + 2);
    // Each ledge has a seed within reach on foot and a bolt overhead.
    for (const f of [high, far]) {
      expect(s.objects.some(o => o.kind === 'seed' && on(f, o.x) && Math.abs(o.y - (f.y - 20)) < meta.seeds.reach)).toBe(true);
      expect(s.pickups.some(c => c.kind === 'bolt' && on(f, c.x) && c.y < f.y)).toBe(true);
    }
    expect(s.checkpoints.map(c => c.y)).toEqual([high.y, far.y]);
  });
});

describe('courtyard 3 in the engine', () => {
  // Both travellers by the mushroom's pit; Bloom plants it, waits for a lower-lane dart to fly just past the riders,
  // then (after `wakeAfterDart` ticks) wakes it, and the mushroom grows until its cap is 200 high.
  const arrowRide = wakeAfterDart => {
    let s = setup({ level: 2 });
    stand(s, STILL, start, groundPit.x - 10); stand(s, BLOOM, start, groundPit.x + 12);
    s = act(s, { type: 'grab', actor: BLOOM });
    const plant = pitPlant(s, groundPit);
    s = until(s, s => s.objects.some(o => o.kind === 'dart' && Math.abs(o.y - 5 - lowerLane) < 1 && o.x > 640 && o.x <= 645));
    s = tick(s, wakeAfterDart);
    s = act(s, { type: 'ability', actor: BLOOM, target: plant });
    let struck = 0;
    s = until(s, s => get(s, plant).height >= 200, s => { struck += hits(s); return s; }, 1200);
    struck += hits(s);
    return { s, plant, struck };
  };

  test('arrows: woken a little after a lower dart flies past, the mushroom carries both riders clear into the safe band', () => {
    const { s, plant, struck } = arrowRide(70);
    expect(struck).toBe(0);
    expect(s.actors.map(p => p.on)).toEqual([plant, plant]);
    expect(s.actors.every(p => p.invuln === 0 && p.respawnTick === null)).toBe(true);
  });

  test('arrows: woken as a lower dart flies past, the next lower dart catches a rider in its lane', () => {
    expect(arrowRide(0).struck).toBeGreaterThan(0);
  });

  test('canyon: Still jumps from vine 1 to the lift, rides it up, jumps to vine 2 and on to the far cliff', () => {
    let s = setup({ level: 2 });
    // Real throws; the near vine needs its full 240, while the far vine retains the original 160 window.
    stand(s, BLOOM, high, nearPit.x - 38);
    s = throwInto(s, nearPit);
    stand(s, BLOOM, far, far.x + 38); s.actors[BLOOM].facing = -1;
    s = throwInto(s, farPit);
    const age = VINE / meta.vine.maxLength * meta.plant.growTicks;
    const [vine1, vine2] = [pitPlant(s, nearPit), pitPlant(s, farPit)];
    Object.assign(get(s, vine1), { age: meta.plant.growTicks, height: NEAR_VINE, speed: 1 });
    Object.assign(get(s, vine2), { age, height: VINE, speed: 1 });
    stand(s, BLOOM, far, far.x + 200);
    // Still near vine 1's tip, standing on it.
    Object.assign(s.actors[STILL], { x: nearPit.x + NEAR_VINE - 25, y: nearPit.y, vx: 0, vy: 0, grounded: true, on: vine1 });
    s = tick(s);
    expect(s.actors[STILL].on).toBe(vine1);
    // Run toward `edge` and jump when there; never while already in the air.
    const run = edge => s => {
      s = act(s, { type: 'move', actor: STILL, dir: 1 });
      const p = s.actors[STILL];
      return p.grounded && p.x >= edge(s) - 6 ? applyAction(s, 'local', { type: 'jump', actor: STILL }) : s;
    };
    const settle = s => act(act(s, { type: 'move', actor: STILL, dir: 0 }), { type: 'jumpRelease', actor: STILL });
    const landed = id => s => s.actors[STILL].grounded && s.actors[STILL].on === id;
    const liftAt = y => s => Math.abs(get(s, 'mover-0').y - y) <= 1;
    // Wait for the lift at its bottom (level with vine 1), then run off the tip and jump.
    s = until(s, liftAt(lift.y2), s => s, 200);
    s = until(s, landed('mover-0'), run(s => get(s, vine1).x + get(s, vine1).height), 200);
    s = settle(s);
    // Ride it up; at the top (level with vine 2) run off its far end and jump.
    s = until(s, liftAt(lift.y1), s => s, 200);
    expect(s.actors[STILL].on).toBe('mover-0');
    expect(get(s, vine2).height).toBeGreaterThanOrEqual(VINE);
    s = until(s, landed(vine2), run(s => get(s, 'mover-0').x + get(s, 'mover-0').w), 200);
    s = settle(s);
    // Along vine 2 to the cliff face, and up.
    s = until(s, landed('platform-3'), run(() => farPit.x - 30), 200);
    expect(s.actors[STILL].respawnTick).toBeNull();
    expect(s.actors[STILL].x).toBeGreaterThan(far.x);
  });
  test('the wider step offers three safe throwing positions with a route back to the high ledge', () => {
    for (const offset of [60, 95, 125]) {
      let s = setup({ level: 2 });
      stand(s, BLOOM, step, step.x + offset); s.actors[BLOOM].facing = -1;
      s = throwInto(s, nearPit);
      expect(s.actors[BLOOM].on).toBe('platform-5');
      expect(s.actors[BLOOM].respawnTick).toBeNull();
      s = act(act(s, { type: 'move', actor: BLOOM, dir: -1 }), { type: 'jump', actor: BLOOM });
      s = until(s, s => s.actors[BLOOM].grounded && s.actors[BLOOM].on === 'platform-1', s => s, 120);
      expect(abilityCheck(s, BLOOM, pitPlant(s, nearPit))).toBe('ok');
    }
  });
  test('the step: Bloom on it throws up-left into the near pit, climbs back to the high ledge, wakes the vine from there', () => {
    let s = setup({ level: 2 });
    stand(s, BLOOM, step, step.x + step.w); s.actors[BLOOM].facing = -1;
    s = throwInto(s, nearPit);
    const vine = pitPlant(s, nearPit);
    const jumpTo = (s, dir, target) => until(s, s => s.actors[BLOOM].grounded && s.actors[BLOOM].on === target, s => {
      s = act(s, { type: 'move', actor: BLOOM, dir });
      return s.actors[BLOOM].grounded ? applyAction(s, 'local', { type: 'jump', actor: BLOOM }) : s;
    }, 120);
    // The new vine sleeps at length 0, so nothing is overhead yet: a jump up-left lands back on the high ledge.
    expect(get(s, vine).height).toBe(0);
    stand(s, BLOOM, step, step.x + 20);
    s = jumpTo(s, -1, 'platform-1');
    expect(s.actors[BLOOM].y).toBe(high.y);
    // From the ledge's edge the vine is within reach to wake, and once grown Bloom walks out onto it.
    stand(s, BLOOM, high, nearPit.x - 20);
    expect(abilityCheck(s, BLOOM, vine)).toBe('ok');
    Object.assign(get(s, vine), { age: VINE / meta.vine.maxLength * meta.plant.growTicks, height: VINE, speed: 1 });
    s = until(s, s => s.actors[BLOOM].grounded && s.actors[BLOOM].on === vine, s => act(s, { type: 'move', actor: BLOOM, dir: 1 }), 60);
    // A grown vine overhead stops a rising head (vines are standable only from above), so wake it from the ledge.
    let trapped = setup({ level: 2 }); trapped.objects.push({ ...get(s, vine) }); trapped.pits.find(p => p.x === nearPit.x && p.y === nearPit.y).plant = vine;
    stand(trapped, BLOOM, step, step.x + 20);
    trapped = tick(act(trapped, { type: 'jump', actor: BLOOM }), 40);
    expect(trapped.actors[BLOOM].on).toBe('platform-5');
  });
});
