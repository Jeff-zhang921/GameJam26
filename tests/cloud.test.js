import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityCheck, meta, cloudPhase, cloudSolid, waterRect, anchor, objectBox, timeObjectAt } from '../src/logic.js';

// A cloud and its water are one thing in two forms (courtyard 2's basin is the arena): the water lies in the groove,
// rises as mist, holds as a small cloud (solid only then) and rains back. Cloud : water is 1 : 6. Abilities act on
// the cloud while it rises or is a cloud, on the water while it rains back or is water. Speed runs its clock faster
// and a Freeze Area makes whichever form it is in last longer, but neither carries over once it starts to turn into
// the other form. Its first visitor sets a new cloud fading. Water slows whoever wades in it.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const cloud = s => s.objects.find(o => o.kind === 'cloud');
const platform = (s, i) => s.platforms[i];
const stand = (s, who, i, x) => Object.assign(s.actors[who], { x, y: platform(s, i).y, vx: 0, vy: 0, grounded: true, on: `platform-${i}` });
const HIGH = 1, BASIN = 5, GROOVE = 6, BASIN_RIGHT = 7;
// Only the travellers, the ledges and the cloud, set to a form; Bloom waits on the high ledge.
function arena(form = 'water') {
  const s = setup({ level: 1 });
  s.objects = s.objects.filter(o => o.kind === 'cloud');
  const { waterTicks, formTicks, cloudTicks } = meta.cloud;
  cloud(s).age = { water: 10, mist: waterTicks + 1, cloud: waterTicks + formTicks + 1, rain: waterTicks + formTicks + cloudTicks + 1 }[form];
  stand(s, BLOOM, HIGH, 2100);
  return s;
}
// A Freeze Area over the form it is in now (the cloud or the pool).
const freezeOver = (s, id = 'freeze-x') => s.freezeAreas.push({ id, owner: 'local', ...anchor(cloud(s)), radius: meta.freeze.radius, ticksLeft: 1e6, duration: 1e6 });
// Ticks of the current form, from now until it changes.
const formTicksLeft = s => { const form = cloudPhase(cloud(s)).form; let n = 0; while (cloudPhase(cloud(s)).form === form && n < 20000) { s = tick(s); n++; } return [n, s]; };
// How long each form lasts, measured over a full cycle (after the first, partial one).
function formLengths(prepare = () => {}) {
  let s = arena('water'); prepare(s);
  const runs = []; let last = cloudPhase(cloud(s)).form, run = 0;
  for (let i = 0; i < 12000 && runs.length < 5; i++) {
    s = tick(s); run++;
    const form = cloudPhase(cloud(s)).form;
    if (form !== last) { runs.push([last, run]); run = 0; last = form; }
  }
  return Object.fromEntries(runs.slice(1));
}

describe('cloud and water take turns', () => {
  test('a cloud lasts a sixth as long as its water, with a short rise and rain between', () => {
    const lengths = formLengths();
    expect(lengths).toEqual({ mist: meta.cloud.formTicks, cloud: meta.cloud.cloudTicks, rain: meta.cloud.rainTicks, water: meta.cloud.waterTicks });
    expect(meta.cloud.waterTicks).toBe(meta.cloud.cloudTicks * 6);
    expect(waterRect(cloud(arena('water'))).h).toBe(cloud(arena('water')).pool.h);
    expect(waterRect(cloud(arena('cloud'))).h).toBe(0);
  });

  test('each change of form is an event', () => {
    let s = arena('water'); cloud(s).age = meta.cloud.waterTicks - 1;
    const kinds = new Set();
    const span = meta.cloud.formTicks + meta.cloud.cloudTicks + 20;
    for (let i = 0; i < span; i++) { s = tick(s); for (const e of s.events) kinds.add(e.kind); }
    expect([...kinds]).toEqual(expect.arrayContaining(['mist', 'cloudForm', 'rain']));
  });

  test('Speed hastens only the form it is cast on: the change into the next form starts at its normal pace', () => {
    // One cast on the water halves what is left of it; the rise, the cloud and the rain after it keep their time.
    expect(formLengths(s => { cloud(s).speed = 1; })).toEqual({ mist: meta.cloud.formTicks, cloud: meta.cloud.cloudTicks, rain: meta.cloud.rainTicks, water: meta.cloud.waterTicks });
    let s = arena('water'); cloud(s).age = meta.cloud.waterTicks - 30; cloud(s).speed = 2;
    let n; [n, s] = formTicksLeft(s);
    expect(n).toBe(10);
    expect(cloud(s).speed).toBe(0);
    [n, s] = formTicksLeft(s);
    expect(n).toBe(meta.cloud.formTicks);
    expect(formTicksLeft(s)[0]).toBe(meta.cloud.cloudTicks);
  });

  test('a Freeze Area makes the form it is in last five times as long, then lets the next form go', () => {
    let s = arena('water'); freezeOver(s); s = tick(s);
    expect(cloud(s).frozen).toBe(true);
    const age = cloud(s).age; s = tick(s, 10);
    expect(cloud(s).age - age).toBeCloseTo(10 * meta.freeze.rate, 6);

    // Cast on the cloud: it holds five times as long; its rain back into water, and the water, are free again.
    s = arena('cloud'); freezeOver(s);
    let n; [n, s] = formTicksLeft(s);
    expect(n).toBeCloseTo((meta.cloud.cloudTicks - 1) / meta.freeze.rate, -1);
    expect(cloudPhase(cloud(s)).form).toBe('rain');
    [n, s] = formTicksLeft(s);
    expect(n).toBe(meta.cloud.rainTicks);
    expect(s.freezeAreas).toHaveLength(1);
    expect(tick(s).objects.find(o => o.kind === 'cloud').frozen).toBe(false);

    // Cast on the water: the cloud rising from it is free, until a new area is cast over the cloud.
    s = arena('water'); cloud(s).age = meta.cloud.waterTicks - 5; freezeOver(s);
    while (cloudPhase(cloud(s)).form !== 'mist') s = tick(s);
    s = tick(s);
    expect(cloud(s).frozen).toBe(false);
    freezeOver(s, 'freeze-y'); s = tick(s);
    expect(cloud(s).frozen).toBe(true);
  });

  test('abilities act on the water or on the cloud, each at its own point', () => {
    for (const form of ['water', 'mist', 'cloud', 'rain']) {
      const s = arena(form), c = cloud(s), onCloud = form === 'mist' || form === 'cloud';
      const cloudPoint = { x: c.x, y: c.y + meta.cloud.h / 2 }, poolPoint = { x: c.pool.x + c.pool.w / 2, y: c.pool.y + c.pool.h / 2 };
      expect(anchor(c)).toEqual(onCloud ? cloudPoint : poolPoint);
      // A tap on the form it is in picks it; a tap where the other form would be picks nothing.
      expect(timeObjectAt(s, onCloud ? cloudPoint : poolPoint)?.id).toBe(c.id);
      expect(timeObjectAt(s, onCloud ? poolPoint : cloudPoint)).toBeNull();
      expect(objectBox(c)).toEqual(onCloud ? { x: c.x - c.w / 2, y: c.y - 8, w: c.w, h: meta.cloud.h + 16 } : c.pool);
    }
    // A Freeze Area only holds the form it touches.
    let s = arena('water'); s.freezeAreas.push({ id: 'over-cloud', owner: 'local', x: 2650, y: 200, radius: meta.freeze.radius, ticksLeft: 600, duration: 600 });
    expect(tick(s).objects.find(o => o.kind === 'cloud').frozen).toBe(false);
    s = arena('cloud'); s.freezeAreas.push({ id: 'over-cloud', owner: 'local', x: 2650, y: 200, radius: meta.freeze.radius, ticksLeft: 600, duration: 600 });
    expect(tick(s).objects.find(o => o.kind === 'cloud').frozen).toBe(true);
  });

  test('Bloom reaches the water and the cloud from the high ledge\'s edge, and Speed hastens it (it never sleeps)', () => {
    let s = arena('cloud'); stand(s, BLOOM, HIGH, 2390);
    expect(abilityCheck(s, BLOOM, cloud(s).id)).toBe('ok');
    s = arena('water'); stand(s, BLOOM, HIGH, 2390);
    // The pool lies low beside the ledge: reach is measured to the nearest point of its surface.
    expect(abilityCheck(s, BLOOM, cloud(s).id)).toBe('ok');
    s = act(s, { type: 'ability', actor: BLOOM, target: cloud(s).id });
    expect(cloud(s).speed).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ kind: 'grow', target: cloud(s).id });
    stand(s, BLOOM, HIGH, 2300);
    expect(abilityCheck(s, BLOOM, cloud(s).id)).toBe('range');
    // Still's Freeze reaches the water from there too.
    stand(s, STILL, HIGH, 2360);
    s = act(s, { type: 'ability', actor: STILL, x: cloud(s).pool.x + 50, y: cloud(s).pool.y - 40 });
    expect(tick(s).objects.find(o => o.kind === 'cloud').frozen).toBe(true);
  });
});

describe('only a formed cloud is solid', () => {
  test('a traveller dropping onto it lands only once it has fully formed', () => {
    for (const form of ['water', 'mist', 'cloud', 'rain']) {
      let s = arena(form);
      Object.assign(s.actors[STILL], { x: cloud(s).x, y: cloud(s).y - 10, vx: 0, vy: 0, grounded: false, on: null });
      s = tick(s, 20);
      expect(s.actors[STILL].on === cloud(s).id).toBe(form === 'cloud');
    }
    let s = arena('cloud');
    Object.assign(s.actors[STILL], { x: cloud(s).x, y: cloud(s).y - 10, vx: 0, vy: 0, grounded: false, on: null });
    s = tick(s, 20);
    expect(s.flags.cloudRide).toBe(true);
  });

  test('standing on it as it starts to rain drops you into the groove', () => {
    let s = arena('cloud'); const c = cloud(s);
    c.age = meta.cloud.waterTicks + meta.cloud.formTicks + meta.cloud.cloudTicks - 5;
    Object.assign(s.actors[STILL], { x: c.x, y: c.y, vx: 0, vy: 0, grounded: true, on: c.id });
    s = tick(s, 90);
    expect(cloudSolid(cloud(s))).toBe(false);
    expect(s.actors[STILL].on).toBe(`platform-${GROOVE}`);
  });

  test('a formed cloud stops a rising head, and one forming around a traveller lets them out', () => {
    let s = arena('cloud'); const c = cloud(s);
    stand(s, STILL, GROOVE, c.x);
    s = act(s, { type: 'jump', actor: STILL });
    let top = Infinity; for (let i = 0; i < 60; i++) { s = tick(s); top = Math.min(top, s.actors[STILL].y); }
    expect(top - 52).toBeCloseTo(c.y + meta.cloud.h, 3);

    s = arena('mist'); cloud(s).age = meta.cloud.waterTicks + meta.cloud.formTicks - 2;
    Object.assign(s.actors[STILL], { x: cloud(s).x, y: cloud(s).y + 40, vx: 0, vy: -2, grounded: false, on: null });
    s = tick(s, 3);
    expect(cloudSolid(cloud(s))).toBe(true);
    s = act(s, { type: 'move', actor: STILL, dir: 1 });
    const x = s.actors[STILL].x; s = tick(s, 30);
    expect(s.actors[STILL].x).toBeGreaterThan(x + 40);
  });
});

describe('a new cloud fades once someone stands on it', () => {
  // Still standing on the cloud: the first tick sets them on it.
  const onCloud = s => { Object.assign(s.actors[STILL], { x: cloud(s).x, y: cloud(s).y, vx: 0, vy: 0, grounded: true, on: cloud(s).id }); return tick(s); };
  const ticksUntilGone = s => { let n = 0; while (cloudSolid(cloud(s)) && n < 5000) { s = tick(s); n++; } return n; };
  const rainAt = () => meta.cloud.waterTicks + meta.cloud.formTicks + meta.cloud.cloudTicks;

  test('its first visitor starts a three-second countdown (it blinks until it rains back)', () => {
    const s = onCloud(arena('cloud'));
    expect(s.actors[STILL].on).toBe(cloud(s).id);
    expect(cloud(s)).toMatchObject({ stood: true, vanish: meta.cloud.standTicks, vanishTotal: meta.cloud.standTicks });
    expect(s.events.some(e => e.kind === 'cloudFade' && e.ticks === meta.cloud.standTicks)).toBe(true);
    expect(meta.cloud.standTicks).toBe(3 * 60);
    expect(ticksUntilGone(s)).toBe(meta.cloud.standTicks);
  });

  test('with less than three seconds left, it rains back when its time runs out', () => {
    let s = arena('cloud'); cloud(s).age = rainAt() - 60;
    s = onCloud(s);
    expect(cloud(s).vanishTotal).toBe(59);
    expect(ticksUntilGone(s)).toBe(59);
    // Held by a Freeze Area its time left counts five times over, up to three seconds.
    s = arena('cloud'); cloud(s).age = rainAt() - 30; freezeOver(s);
    s = onCloud(s);
    expect(cloud(s).vanishTotal).toBeGreaterThanOrEqual(148);
    expect(cloud(s).vanishTotal).toBeLessThanOrEqual(150);
    expect(ticksUntilGone(s)).toBe(cloud(s).vanishTotal);
    s = arena('cloud'); cloud(s).age = rainAt() - 60; freezeOver(s);
    expect(cloud(onCloud(s)).vanishTotal).toBe(meta.cloud.standTicks);
  });

  test('the countdown runs in real time: Speed and Freeze do not change it', () => {
    let s = tick(onCloud(arena('cloud')), 30);
    stand(s, BLOOM, HIGH, 2390);
    s = act(s, { type: 'ability', actor: BLOOM, target: cloud(s).id });
    freezeOver(s);
    expect(ticksUntilGone(s)).toBe(meta.cloud.standTicks - 30);
  });

  test('with both travellers on it at once, it rains back within a second, or sooner if it had less time left', () => {
    const bloomOn = s => { Object.assign(s.actors[BLOOM], { x: cloud(s).x - 30, y: cloud(s).y, vx: 0, vy: 0, grounded: true, on: cloud(s).id }); return s; };
    expect(meta.cloud.crowdTicks).toBe(60);
    // Landing together on a new cloud.
    let s = onCloud(bloomOn(arena('cloud')));
    expect(cloud(s)).toMatchObject({ vanish: meta.cloud.crowdTicks });
    expect(s.events.some(e => e.kind === 'cloudFade' && e.both && e.ticks === meta.cloud.crowdTicks)).toBe(true);
    expect(ticksUntilGone(s)).toBe(meta.cloud.crowdTicks);
    // The second joining later cuts what is left down to a second.
    s = tick(bloomOn(tick(onCloud(arena('cloud')), 30)));
    expect(ticksUntilGone(s)).toBe(meta.cloud.crowdTicks);
    // With less than a second left, that is all it has.
    s = tick(bloomOn(tick(onCloud(arena('cloud')), meta.cloud.standTicks - 31)));
    expect(ticksUntilGone(s)).toBe(30);
    s = arena('cloud'); cloud(s).age = rainAt() - 41;
    s = onCloud(bloomOn(s));
    expect(ticksUntilGone(s)).toBe(40);
  });

  test('the next cloud starts fresh', () => {
    let s = onCloud(arena('cloud'));
    while (cloudPhase(cloud(s)).form !== 'water') s = tick(s);
    while (cloudPhase(cloud(s)).form !== 'cloud') s = tick(s);
    expect(cloud(s)).toMatchObject({ stood: false, vanish: null, vanishTotal: null, speed: 0 });
  });
});

describe('in courtyard 4, Bloom rewinds it', () => {
  const { waterTicks, formTicks, cloudTicks, rainTicks } = meta.cloud, cycle = waterTicks + formTicks + cloudTicks + rainTicks;
  // Courtyard 4's cloud at clock `age`, Bloom at the cliff's edge beside it, Still on the cliff.
  function rewinding(age) {
    let s = setup({ level: 3 });
    s.objects = s.objects.filter(o => o.kind === 'cloud');
    cloud(s).age = age;
    stand(s, BLOOM, 5, 2540); stand(s, STILL, 5, 2200);
    expect(abilityCheck(s, BLOOM, cloud(s).id)).toBe('ok');
    s = act(s, { type: 'ability', actor: BLOOM, target: cloud(s).id });
    expect(cloud(s).speed).toBe(-1);
    expect(s.events.at(-1)).toMatchObject({ kind: 'grow', rewind: true });
    return s;
  }

  test('water that has just rained away rises back into a whole new cloud', () => {
    let s = rewinding(cycle + 100);
    const kinds = new Set();
    let n = 0; while (cloudPhase(cloud(s)).form !== 'cloud' && n < 2000) { s = tick(s); n++; for (const e of s.events) kinds.add(e.kind); }
    // Back through the water and its rain (played backwards: the water rising), then the cloud, fresh and forward.
    expect(n).toBeGreaterThanOrEqual(100 + rainTicks);
    expect(n).toBeLessThanOrEqual(100 + rainTicks + 2);
    expect([...kinds]).toEqual(expect.arrayContaining(['mist', 'cloudForm']));
    expect(cloud(s)).toMatchObject({ speed: 0, stood: false });
    expect(formTicksLeft(s)[0]).toBe(cloudTicks);
  });

  test('rewound while it rains back, it is a cloud again within the rain\'s time', () => {
    let s = rewinding(waterTicks + formTicks + cloudTicks + 30);
    let n = 0; while (!cloudSolid(cloud(s)) && n < 500) { s = tick(s); n++; }
    expect(n).toBeLessThanOrEqual(32);
    expect(cloud(s).speed).toBe(0);
  });

  test('a rewound cloud sinks back into a whole spell of water', () => {
    let s = rewinding(waterTicks + formTicks + 50);
    let n; [n, s] = formTicksLeft(s);
    expect(cloudPhase(cloud(s)).form).toBe('mist');
    [n, s] = formTicksLeft(s);
    expect(cloudPhase(cloud(s)).form).toBe('water');
    expect(cloud(s).speed).toBe(0);
    expect(formTicksLeft(s)[0]).toBe(waterTicks);
  });

  test('stood on while being rewound, it fades when it would sink back', () => {
    let s = setup({ level: 3 });
    s.objects = s.objects.filter(o => o.kind === 'cloud');
    Object.assign(cloud(s), { age: waterTicks + formTicks + 100, speed: -1 });
    Object.assign(s.actors[STILL], { x: cloud(s).x, y: cloud(s).y, vx: 0, vy: 0, grounded: true, on: cloud(s).id });
    s = tick(s);
    expect(cloud(s).vanishTotal).toBe(99);
  });
});

describe('water holds things back', () => {
  test('wading is slower, by how deep you stand', () => {
    let s = arena('water'); stand(s, STILL, GROOVE, 2600);
    s = act(s, { type: 'move', actor: STILL, dir: 1 });
    const x = s.actors[STILL].x; s = tick(s, 10);
    const pace = (s.actors[STILL].x - x) / 10;
    expect(pace).toBeLessThan(meta.controls.speed * .55);
    expect(pace).toBeGreaterThan(meta.controls.speed * .45);
    let dry = arena('cloud'); stand(dry, STILL, GROOVE, 2600);
    dry = act(dry, { type: 'move', actor: STILL, dir: 1 }); dry = tick(dry, 10);
    expect(dry.actors[STILL].x - 2600).toBeCloseTo(meta.controls.speed * 10, 3);
  });

  test('a jump from the water is lower, but still clears the groove\'s edge', () => {
    let s = arena('water'); const c = cloud(s), floor = platform(s, GROOVE).y;
    stand(s, STILL, GROOVE, c.x);
    s = act(s, { type: 'jump', actor: STILL });
    let top = Infinity; for (let i = 0; i < 80; i++) { s = tick(s); top = Math.min(top, s.actors[STILL].y); }
    expect(floor - top).toBeLessThan(140);
    expect(floor - top).toBeGreaterThan(c.pool.h + 20);
    s = arena('water'); stand(s, STILL, GROOVE, platform(s, GROOVE).x + platform(s, GROOVE).w - 30);
    s = act(s, { type: 'move', actor: STILL, dir: 1 }); s = act(s, { type: 'jump', actor: STILL });
    for (let i = 0; i < 120 && s.actors[STILL].on !== `platform-${BASIN_RIGHT}`; i++) s = tick(s);
    expect(s.actors[STILL].on).toBe(`platform-${BASIN_RIGHT}`);
  });

  test('falling in splashes and slows the fall', () => {
    // The same drop into the groove, full of water or dry (its water is up in the cloud, out of the way above).
    const fall = form => {
      let s = arena(form), splash = false, impact = null;
      Object.assign(s.actors[STILL], { x: cloud(s).x, y: platform(s, BASIN).y - 30, vx: 0, vy: 6, grounded: false, on: null });
      for (let i = 0; i < 60 && !s.actors[STILL].grounded; i++) {
        s = tick(s);
        splash ||= s.events.some(e => e.kind === 'splash');
        const land = s.events.find(e => e.kind === 'land' && e.tick === s.tick && e.actor === STILL);
        if (land) impact = land.strength * meta.controls.maxFall;
      }
      return { splash, impact, on: s.actors[STILL].on };
    };
    const wet = fall('water'), dry = fall('cloud');
    expect(wet).toMatchObject({ splash: true, on: `platform-${GROOVE}` });
    expect(dry).toMatchObject({ splash: false, on: `platform-${GROOVE}` });
    expect(wet.impact).toBeLessThan(dry.impact - 1);
  });

  test('a crate slides less far through water', () => {
    const slide = form => {
      let s = arena(form); const floor = platform(s, GROOVE);
      s.objects.push({ kind: 'crate', id: 'crate-9', x: floor.x + 40, y: floor.y - 27, vx: 6, vy: 0, frozen: false, held: null, spawnX: floor.x + 40, spawnY: floor.y - 27 });
      s = tick(s, 12);
      return s.objects.find(o => o.id === 'crate-9').x - (floor.x + 40);
    };
    expect(slide('water')).toBeLessThan(slide('cloud') * .7);
  });
});
