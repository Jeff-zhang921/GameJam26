import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, throwPath, canopyWidth } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 3: arrows over the start (ride the mushroom into the safe band between two lanes, hop to the high
// ledge), a canyon (near vine → vertical lift → far vine), and two movers in opposite phase over a chasm.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const level = LEVELS[2];
const [start, high, pillar, far, exitLedge] = level.platforms;
const JUMP = meta.controls.jump ** 2 / (2 * meta.controls.gravity); // about 163
const on = (f, x) => x > f.x && x < f.x + f.w;
const launchers = level.enemies.filter(e => e.kind === 'launcher').sort((a, b) => b.y - a.y); // lower lane first
const lane = l => l.y - 20; // a launcher's darts fly at its centre
const [lowerLane, upperLane] = launchers.map(lane);
// Does a traveller standing on a cap of height h overlap a dart lane? (body is 52 tall above the feet; darts 10 tall)
const hit = (h, y) => { const feet = start.y - h; return feet - 52 < y + 5 && feet > y - 5; };
const [groundPit, nearPit, farPit] = level.pits;
const [lift, moverA, moverB] = level.movers;
const stand = (s, who, f, x) => Object.assign(s.actors[who], { x, y: f.y, vx: 0, vy: 0, grounded: true, on: `platform-${level.platforms.indexOf(f)}` });
const aimAt = (s, x, y) => {
  let best = null;
  for (let vx = -11; vx <= 11; vx += .25) for (let vy = -11; vy <= 11; vy += .25) {
    if (Math.hypot(vx, vy) > meta.throw.maxSpeed) continue;
    const end = throwPath(s, 1, { vx, vy }).at(-1), d = Math.hypot(end.x - x, end.y - y);
    if (!best || d < best.d) best = { vx, vy, d };
  }
  return best;
};

describe('courtyard 3 layout', () => {
  test('wide; the high ledge is out of reach from the start; the pillar and far cliff are hops', () => {
    const s = setup({ level: 2 });
    expect(s.width).toBe(3840);
    expect(start.y - high.y).toBeGreaterThan(JUMP);
    expect(high.y - pillar.y).toBeLessThan(JUMP - 10);
    expect(on(high, pillar.x) && pillar.y + pillar.h === high.y).toBe(true);
    expect(on(exitLedge, level.exit.x) && level.exit.y === exitLedge.y).toBe(true);
    expect(level.exitNeedsPlant).toBe(true);
  });

  test('arrows: a safe band between the lanes; the grown mushroom rides into the upper lane', () => {
    expect([lowerLane, upperLane]).toEqual([350, 238]);
    expect(hit(150, lowerLane)).toBe(true);
    for (const h of [180, 200, 220]) expect(hit(h, lowerLane) || hit(h, upperLane)).toBe(false);
    expect(hit(meta.plant.maxHeight, upperLane)).toBe(true);
    // From the band the ledge is a short hop: up a little, across the gap to its face.
    expect(groundPit).toMatchObject({ y: start.y }); expect(groundPit.wall).toBeUndefined();
    const cap = canopyWidth({ height: 200, withered: false, age: 0 });
    expect(high.x - (groundPit.x + cap / 2)).toBeLessThan(150);
    expect((start.y - 200) - high.y).toBeLessThan(JUMP - 60);
    // Standing on the ground or on the high ledge is clear of both lanes.
    for (const y of [lowerLane, upperLane]) { expect(start.y - 52 < y + 5 && start.y > y - 5).toBe(false); expect(high.y - 52 < y + 5 && high.y > y - 5).toBe(false); }
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

  test('canyon: wall pits on both cliff faces; vine / lift / vine gaps are jumps at vine length 200', () => {
    expect(nearPit).toMatchObject({ x: high.x + high.w, wall: 1 }); expect(nearPit.y).toBeGreaterThan(high.y);
    expect(farPit).toMatchObject({ x: far.x, wall: -1 }); expect(farPit.y).toBeGreaterThan(far.y);
    expect(lift).toMatchObject({ axis: 'y', y1: farPit.y, y2: nearPit.y });
    expect(lift.x - (nearPit.x + 200)).toBeLessThanOrEqual(60);
    expect((farPit.x - 200) - (lift.x + lift.w)).toBeLessThanOrEqual(60);
    expect(farPit.y - far.y).toBeLessThan(JUMP - 60);
    // Nothing to land on in the canyon.
    expect(level.platforms.some(f => f.x < far.x && f.x + f.w > nearPit.x)).toBe(false);
  });

  test('twin movers meet in the middle and B delivers to the exit ledge', () => {
    let s = setup({ level: 2 }), closest = Infinity, met = false;
    const get = id => s.objects.find(o => o.id === id);
    for (let i = 0; i < 1300; i++) {
      s = tick(s);
      const a = get('mover-1'), b = get('mover-2'), gap = b.x - (a.x + a.w);
      closest = Math.min(closest, gap); if (gap <= 40) met = true;
    }
    expect(met).toBe(true); expect(closest).toBeGreaterThanOrEqual(0);
    expect(moverA.x1 - (far.x + far.w)).toBeLessThanOrEqual(20);
    expect(exitLedge.x - (moverB.x2 + moverB.w)).toBeGreaterThanOrEqual(0);
    expect(exitLedge.x - (moverB.x2 + moverB.w)).toBeLessThanOrEqual(20);
    expect([moverA.y, moverB.y]).toEqual([far.y, exitLedge.y]);
  });

  test('both vines can be planted by throws: the near one from the high ledge, the far one from the lift', () => {
    let s = setup({ level: 2 });
    // 38 back from the edge, facing right: the seed leaves just clear of the cliff face and drops straight into the pit.
    stand(s, 1, high, nearPit.x - 38);
    s = act(s, { type: 'takeSeed', actor: 1 });
    let aim = aimAt(s, nearPit.x + 10, nearPit.y);
    expect(aim.d).toBeLessThanOrEqual(24);
    s = act(s, { type: 'grab', actor: 1, aim: { vx: aim.vx, vy: aim.vy } }); s = tick(s, 90);
    expect(s.pits.find(p => p.x === nearPit.x && p.wall === 1).plant).not.toBeNull();
    // On the lift (placed, as steering there would be fragile), throw at the far pit.
    const m = s.objects.find(o => o.id === 'mover-0');
    Object.assign(s.actors[1], { x: m.x + m.w / 2, y: m.y, vx: 0, vy: 0, grounded: true, on: 'mover-0' });
    s = act(s, { type: 'takeSeed', actor: 1 });
    aim = aimAt(s, farPit.x - 10, farPit.y);
    expect(aim.d).toBeLessThanOrEqual(24);
    s = act(s, { type: 'grab', actor: 1, aim: { vx: aim.vx, vy: aim.vy } }); s = tick(s, 90);
    expect(s.pits.find(p => p.x === farPit.x && p.wall === -1).plant).not.toBeNull();
  });

  test('resources: three seeds in hand and a spare, enough Bloom charges for three wakes', () => {
    const s = setup({ level: 2 });
    expect(s.seeds).toBe(3);
    expect(s.objects.filter(o => o.kind === 'seed')).toHaveLength(1);
    expect(s.bloomCharges + s.pickups.filter(c => c.kind === 'bolt').length).toBeGreaterThanOrEqual(4);
    expect(s.checkpoints.map(c => c.y)).toEqual([high.y, far.y]);
  });
});
