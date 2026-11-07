import { describe, test, expect } from 'bun:test';
import { setup, validateAction, applyAction, isGameOver, viewFor, hintLevel, meta } from '../src/logic.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }
const get = (state, id) => state.objects.find(o => o.id === id);
const { growTicks: G, matureTicks: M, witherTicks: W, maxHeight: H, springHeight } = meta.plant;
const plantOf = s => s.objects.find(o => o.kind === 'plant');
const apex = (s, actor) => { let top = s.actors[actor].y; for (let i = 0; i < 60; i++) { s = step(s); top = Math.min(top, s.actors[actor].y); } return top; };

// Level 1 (index 1) has one empty pit at x=600 on ground y=540 and seeds at x=90 / x=380.
function planted() {
  let s = setup({ level: 1 });
  s.actors[1].x = 380;
  s = action(s, { type: 'grab', actor: 1 });
  s.actors[1].x = 600;
  s = action(s, { type: 'grab', actor: 1 });
  return s;
}

describe('seeds and pits', () => {
  test('a carried seed is planted into an empty pit and dropped anywhere else', () => {
    let s = setup({ level: 1 });
    s.actors[0].x = 380;
    s = action(s, { type: 'grab', actor: 0 });
    expect(s.actors[0].carrying).toBe('seed-1');
    s = action(s, { type: 'grab', actor: 0 });
    expect(get(s, 'seed-1').held).toBe(null);
    expect(s.objects.some(o => o.kind === 'plant')).toBe(false);
    s = action(s, { type: 'grab', actor: 0 });
    s.actors[0].x = 610;
    s = action(s, { type: 'grab', actor: 0 });
    expect(get(s, 'seed-1')).toBeUndefined();
    const plant = s.objects.find(o => o.kind === 'plant');
    expect(plant).toMatchObject({ age: 0, height: 0, speed: 0, x: 600 });
    expect(s.pits[0].plant).toBe(plant.id);
  });

  test('an occupied pit does not accept a second seed', () => {
    let s = planted();
    s.actors[0].x = 90;
    s = action(s, { type: 'grab', actor: 0 });
    s.actors[0].x = 600;
    s = action(s, { type: 'grab', actor: 0 });
    expect(s.objects.filter(o => o.kind === 'plant')).toHaveLength(1);
    expect(get(s, 'seed-0').held).toBe(null);
  });

  test('bloom ignores loose seeds and crates', () => {
    let s = setup({ level: 1 });
    s.actors[1].x = 380;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'seed-1' }).error).toBe('bloomRange');
    s = setup({ level: 0 });
    s.actors[1].x = 350;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'crate-0' }).error).toBe('bloomRange');
  });
});

describe('time flow', () => {
  test('an untouched plant never ages', () => {
    const s = step(planted(), G);
    expect(plantOf(s)).toMatchObject({ age: 0, height: 0, speed: 0 });
  });

  test('bloom wakes a plant, which then grows linearly with time', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    expect(plantOf(s).speed).toBe(1);
    s = step(s, G / 4);
    expect(plantOf(s).height).toBeCloseTo(H / 4, 5);
    s = step(s, G / 4);
    expect(plantOf(s).height).toBeCloseTo(H / 2, 5);
  });

  test('blooming an awake plant makes it grow faster, up to a cap', () => {
    let s = planted();
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1 });
    expect(plantOf(s).speed).toBe(meta.time.maxSpeed);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1 }).error).toBe('maxSpeed');
    s = step(s, 100);
    expect(plantOf(s).height).toBeCloseTo(H * 100 * meta.time.maxSpeed / G, 5);
  });

  test('a plant growing under an actor standing on its pit lifts them', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1 });
    s = step(s, G / 6);
    expect(s.actors[1].on).toBe(plantOf(s).id);
    expect(s.actors[1].y).toBeCloseTo(540 - plantOf(s).height, 5);
    expect(plantOf(s).height).toBeCloseTo(H / 2, 5);
    expect(s.flags.treeLifted).toBe(true);
  });

  test('a fully grown plant stays lush for a while, then withers, then vanishes, freeing its pit and dropping its rider', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1 });
    s = step(s, G / 3);
    expect(plantOf(s)).toMatchObject({ height: H, withered: false });
    expect(M).toBeGreaterThan(0);
    s = step(s, M / 3);
    expect(plantOf(s)).toMatchObject({ height: H, withered: false });
    s = step(s);
    expect(plantOf(s).withered).toBe(true);
    expect(s.actors[1].on).toBe(plantOf(s).id);
    s = step(s, W / 3 - 1);
    expect(plantOf(s)).toBeUndefined();
    expect(s.pits[0].plant).toBe(null);
    s = step(s, 5);
    expect(s.actors[1].grounded).toBe(false);
  });

  test('jumping from a young sprout goes higher than jumping from the ground', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = step(s, Math.round(G * 30 / H));
    expect(plantOf(s).height).toBeLessThan(springHeight);
    expect(s.actors[1].on).toBe(plantOf(s).id);
    const jumped = action(s, { type: 'jump', actor: 1 });
    const springRise = s.actors[1].y - apex(jumped, 1);
    const ground = setup({ level: 1 });
    const groundRise = ground.actors[1].y - apex(action(ground, { type: 'jump', actor: 1 }), 1);
    expect(springRise).toBeGreaterThan(groundRise * 1.4);
    expect(step(jumped).flags.sproutJump).toBe(true);
  });

  test('jumping from a tall tree is an ordinary jump', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1 });
    s = step(s, G / 6);
    s = action(s, { type: 'ability', actor: 0 });
    const rise = s.actors[1].y - apex(action(s, { type: 'jump', actor: 1 }), 1);
    const ground = setup({ level: 1 });
    expect(rise).toBeCloseTo(ground.actors[1].y - apex(action(ground, { type: 'jump', actor: 1 }), 1), 0);
  });

  test('an ancient barrier tree blocks the path until it withers', () => {
    let s = setup({ level: 2 });
    const tree = plantOf(s);
    Object.assign(s.actors[0], { x: tree.x - 80 });
    s = action(s, { type: 'move', actor: 0, dir: 1 });
    s = step(s, 30);
    expect(s.actors[0].x).toBeLessThan(tree.x - 42);
    s.actors[1].x = tree.x - 100;
    s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 40);
    expect(s.flags.withered).toBe(true);
    expect(s.actors[0].x).toBeGreaterThan(tree.x + 42);
  });
});

describe('still', () => {
  test('freezing a thrown crate holds it in midair with its momentum stored', () => {
    let s = setup();
    s.actors[0].x = 350;
    s = action(s, { type: 'grab', actor: 0 });
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 12);
    s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
    const before = { ...get(s, 'crate-0') };
    s = step(s, 30);
    expect(get(s, 'crate-0')).toMatchObject({ x: before.x, y: before.y, vx: before.vx, vy: before.vy });
    s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
    s = step(s);
    expect(get(s, 'crate-0').x).not.toBe(before.x);
  });

  test('bloom releases a crate frozen in midair and it flies on', () => {
    let s = setup();
    s.actors[0].x = 350;
    s = action(s, { type: 'grab', actor: 0 });
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 12);
    s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
    const before = { ...get(s, 'crate-0') };
    s.actors[1].x = 350;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1 }).valid).toBe(true);
    s = action(s, { type: 'ability', actor: 1 });
    expect(get(s, 'crate-0').frozen).toBe(false);
    s = step(s);
    expect(get(s, 'crate-0').x).toBeCloseTo(before.x + before.vx, 5);
  });

  test('bloom cannot touch a crate that is not frozen', () => {
    const s = setup();
    s.actors[1].x = 350;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'crate-0' }).error).toBe('bloomRange');
  });

  test('freezing a plant mid-growth stops both its clock and its height', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 10);
    s = action(s, { type: 'ability', actor: 0 });
    const frozen = { ...s.objects.find(o => o.kind === 'plant') };
    s = step(s, G);
    expect(plantOf(s)).toMatchObject({ age: frozen.age, height: frozen.height });
    s = action(s, { type: 'ability', actor: 1 });
    expect(plantOf(s)).toMatchObject({ frozen: false, speed: 3 });
    s = step(s, 10);
    expect(plantOf(s).height).toBeGreaterThan(frozen.height);
  });
});

describe('movers', () => {
  const moverLevel = () => { const s = setup({ level: 3 }); s.actors[0].x = 600; s.actors[0].y = 290; s.actors[0].on = 'mover-0'; s.actors[1].x = 450; return s; };

  test('a mover rests until bloomed, carries its rider, and halts when frozen', () => {
    let s = step(moverLevel(), 30);
    expect(get(s, 'mover-0').x).toBe(540);
    s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    s = step(s, 30);
    expect(get(s, 'mover-0').x).toBe(570);
    expect(s.actors[0].x).toBeCloseTo(630, 5);
    expect(s.flags.moverRide).toBe(true);
    s = action(s, { type: 'ability', actor: 0, target: 'mover-0' });
    s = step(s, 30);
    expect(get(s, 'mover-0').x).toBe(570);
  });

  test('blooming a moving mover speeds it up to a cap', () => {
    let s = moverLevel();
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    expect(get(s, 'mover-0').speed).toBe(meta.time.maxSpeed);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'mover-0' }).error).toBe('maxSpeed');
  });
});

describe('assists', () => {
  test('rewind restores world objects but not actors, and is limited per chamber', () => {
    let s = step(setup({ level: 1 }), 10);
    s.actors[1].x = 380;
    s = action(s, { type: 'grab', actor: 1 });
    s.actors[1].x = 600;
    s = step(s, 20);
    s = action(s, { type: 'grab', actor: 1 });
    expect(s.pits[0].plant).not.toBe(null);
    s = action(s, { type: 'rewind' });
    expect(s.objects.some(o => o.kind === 'plant')).toBe(false);
    expect(s.pits[0].plant).toBe(null);
    expect(get(s, 'seed-1')).toMatchObject({ held: null, x: 380 });
    expect(s.actors[1].x).toBe(600);
    expect(s.rewindsLeft).toBe(meta.time.rewinds - 1);
    s = step(s, 20); s = action(s, { type: 'rewind' });
    s = step(s, 20); s = action(s, { type: 'rewind' });
    s = step(s, 20);
    expect(validateAction(s, 'local', { type: 'rewind' }).error).toBe('noRewinds');
    expect(action(s, { type: 'restart' }).rewindsLeft).toBe(meta.time.rewinds);
  });

  test('rewind drops an item that was carried in the snapshot at its carrier\'s current feet', () => {
    let s = setup({ level: 1 });
    s.actors[1].x = 380;
    s = action(s, { type: 'grab', actor: 1 });
    s = step(s, 200);
    s.actors[1].x = 600;
    s = action(s, { type: 'grab', actor: 1 });
    s = action(s, { type: 'rewind' });
    expect(s.actors[1].carrying).toBe(null);
    expect(get(s, 'seed-1')).toMatchObject({ held: null, x: 630 });
  });

  test('the clock starts on first input and the hint escalates after 90 idle seconds of play', () => {
    let s = step(setup({ level: 1 }), 100);
    expect(s.elapsed).toBe(0);
    s = action(s, { type: 'move', actor: 0, dir: 1 });
    s = step(s, 10);
    expect(s.elapsed).toBe(10);
    expect(hintLevel(s)).toBe(0);
    s.elapsed = meta.time.hintTicks;
    expect(hintLevel(s)).toBe(1);
    s.flags.treeLifted = true;
    s = step(s);
    expect(s.lastProgressTick).toBe(s.elapsed);
    expect(hintLevel(s)).toBe(0);
  });
});

describe('room rules', () => {
  test('boundaries reject malformed, unauthorized and out-of-range actions', () => {
    const s = setup({ players: ['one', 'two'] });
    expect(validateAction(s, 'one', { type: 'move', actor: 1, dir: 1 }).valid).toBe(false);
    expect(validateAction(s, 'two', { type: 'tick' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'ability', actor: 0, target: 'plant-9' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'move', actor: 0, dir: Infinity }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'echo', actor: 0 }).valid).toBe(false);
    expect(validateAction(s, 'one', null).valid).toBe(false);
    expect(viewFor(s, 'stranger')).toBe(null); expect(isGameOver(s)).toBe(null);
  });

  test('replaying a chamber never farms duplicate collectibles', () => {
    let s = setup(); s.flags.frozenTouched = true; s.shards[0].taken = true; s.actors[0].x = s.exit.x; s.actors[0].y = s.exit.y;
    s = step(s); expect(s.totalShards).toBe(1);
    s = action(s, { type: 'restart' }); s.flags.frozenTouched = true; s.shards[0].taken = true; s.actors[0].x = s.exit.x; s.actors[0].y = s.exit.y;
    s = step(s); expect(s.totalShards).toBe(1); expect(s.collected).toEqual([true, false, false, false]);
  });
});

describe('review fixes', () => {
  test('bloom auto-target skips full-speed plants and picks the nearest usable one', () => {
    let s = setup({ level: 3 });
    s.actors[1].x = 480; s = action(s, { type: 'grab', actor: 1 });
    s.actors[1].x = 400; s = action(s, { type: 'grab', actor: 1 });
    s.actors[1].x = 110; s = action(s, { type: 'grab', actor: 1 });
    s.actors[1].x = 60; s = action(s, { type: 'grab', actor: 1 });
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-1' });
    s.actors[1].x = 70;
    s = action(s, { type: 'ability', actor: 1 });
    expect(get(s, 'plant-0').speed).toBe(1);
    expect(get(s, 'plant-1').speed).toBe(meta.time.maxSpeed);
  });

  test('bloom releases a frozen plant, waking it if it had never started', () => {
    let s = planted();
    s.actors[0].x = 560;
    s = action(s, { type: 'ability', actor: 0 });
    expect(plantOf(s)).toMatchObject({ frozen: true, speed: 0 });
    s = action(s, { type: 'ability', actor: 1 });
    expect(plantOf(s)).toMatchObject({ frozen: false, speed: 1 });
  });

  test('a seed dropped on a crate rests on it', () => {
    let s = setup();
    s.objects.push({ kind: 'seed', id: 'seed-9', x: 0, y: 0, vx: 0, vy: 0, held: 1, spawnX: 100, spawnY: 100 });
    Object.assign(s.actors[1], { x: 350, y: 466, on: 'crate-0', carrying: 'seed-9' });
    s = action(s, { type: 'grab', actor: 1 });
    s = step(s, 40);
    const seed = get(s, 'seed-9'), crate = get(s, 'crate-0');
    expect(seed.y).toBeCloseTo(crate.y - 27 - 10, 0);
    expect(crate.y).toBe(493);
  });

  test('rewind is rejected while paused', () => {
    let s = step(setup(), 12);
    s = action(s, { type: 'pause' });
    expect(validateAction(s, 'local', { type: 'rewind' })).toEqual({ valid: false, error: 'paused' });
  });

  test('the clock starts on a first grab', () => {
    let s = setup({ level: 1 });
    s = step(s, 5); expect(s.elapsed).toBe(0);
    s.actors[0].x = 90; s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 5); expect(s.elapsed).toBe(5);
  });

  test('an item resting on a growing plant rides it up', () => {
    let s = planted();
    s.actors[1].x = 300;
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 40);
    Object.assign(get(s, 'seed-0'), { x: 600, y: 540 - plantOf(s).height - 10, vx: 0, vy: 0, held: null });
    s = step(s, 120);
    expect(plantOf(s).height).toBeGreaterThan(100);
    expect(get(s, 'seed-0').y).toBeCloseTo(540 - plantOf(s).height - 10, 0);
  });
});
