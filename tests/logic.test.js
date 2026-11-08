import { describe, test, expect } from 'bun:test';
import { LEVELS } from '../src/levels/index.js';
import { ENEMY } from '../src/enemies.js';
import { setup, validateAction, applyAction, isGameOver, viewFor, hintLevel, meta, abilityTarget, levelCount } from '../src/logic.js';
import { classicCourtyard, rootriseArena, withtimeArena } from './arena.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }
const get = (state, id) => state.objects.find(o => o.id === id);
const { growTicks: G, matureTicks: M, witherTicks: W, maxHeight: H, springHeight } = meta.plant;
const plantOf = s => s.objects.find(o => o.kind === 'plant');
const apex = (s, actor) => { let top = s.actors[actor].y; for (let i = 0; i < 60; i++) { s = step(s); top = Math.min(top, s.actors[actor].y); } return top; };

// Level 1 (index 1) has one empty pit at x=600 on ground y=540 and seeds at x=90 / x=380.
function planted() {
  let s = rootriseArena();
  s.actors[1].x = 600;
  s = action(s, { type: 'grab', actor: 1 });
  return s;
}

describe('seeds and pits', () => {
  test('Bloom collects a seed by touch and plants from the count beside an empty pit', () => {
    let s = rootriseArena();
    expect(s.seeds).toBe(1);
    Object.assign(s.actors[0], { x: 380 }); // Still walks over a seed: it stays, and Still cannot take it
    s = step(s);
    expect(get(s, 'seed-1')).toBeDefined();
    expect(validateAction(s, 'local', { type: 'grab', actor: 0 }).error).toBe('grabRange');
    s.actors[0].x = 200;
    s.actors[1].x = 380; // Bloom touches it: gone, and the count goes up
    s = step(s);
    expect(get(s, 'seed-1')).toBeUndefined();
    expect(s.seeds).toBe(2);
    expect(s.events.some(e => e.kind === 'seedPick')).toBe(true);
    expect(s.actors[1].carrying).toBe(null);
    s.actors[1].x = 300; // no pit here: nothing to do
    expect(validateAction(s, 'local', { type: 'grab', actor: 1 }).error).toBe('grabRange');
    s.actors[1].x = 610;
    s = action(s, { type: 'grab', actor: 1 });
    const plant = s.objects.find(o => o.kind === 'plant');
    expect(plant).toMatchObject({ age: 0, height: 0, speed: 0, x: 600 });
    expect(s.pits[0].plant).toBe(plant.id);
    expect(s.seeds).toBe(1);
  });

  test('an occupied pit takes no second seed, and an empty one needs a seed in the count', () => {
    let s = planted();
    expect(s.seeds).toBe(0);
    s.seeds = 1;
    expect(validateAction(s, 'local', { type: 'grab', actor: 1 }).error).toBe('grabRange');
    s.pits.push({ id: 'pit-9', x: 300, y: 540, plant: null });
    s.seeds = 0; s.actors[1].x = 300;
    expect(validateAction(s, 'local', { type: 'grab', actor: 1 }).error).toBe('noSeeds');
  });

  test('bloom ignores loose seeds and crates', () => {
    let s = rootriseArena();
    s.actors[1].x = 380;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'seed-1' }).error).toBe('bloomRange');
    s = classicCourtyard();
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
    let s = action(planted(), { type: 'ability', actor: 1, target: 'plant-0' });
    expect(plantOf(s).speed).toBe(1);
    s = step(s, G / 4);
    expect(plantOf(s).height).toBeCloseTo(H / 4, 5);
    s = step(s, G / 4);
    expect(plantOf(s).height).toBeCloseTo(H / 2, 5);
  });

  test('blooming an awake plant makes it grow faster, up to a cap', () => {
    let s = planted();
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    expect(plantOf(s).speed).toBe(meta.time.maxSpeed);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'plant-0' }).error).toBe('maxSpeed');
    s = step(s, 100);
    expect(plantOf(s).height).toBeCloseTo(H * 100 * meta.time.maxSpeed / G, 5);
  });

  test('a plant growing under an actor standing on its pit lifts them', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, G / 6);
    expect(s.actors[1].on).toBe(plantOf(s).id);
    expect(s.actors[1].y).toBeCloseTo(540 - plantOf(s).height, 5);
    expect(plantOf(s).height).toBeCloseTo(H / 2, 5);
    expect(s.flags.treeLifted).toBe(true);
  });

  test('a growing plant is solid from the side', () => {
    let s = planted();
    s.actors[1].x = 400;
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, G / 2);
    s.actors[0].x = 500;
    s = action(s, { type: 'move', actor: 0, dir: 1 });
    s = step(s, 60);
    expect(s.actors[0].x).toBeLessThan(600 - 15);
    expect(s.actors[0].grounded).toBe(true);
  });

  test('a plant that grows into an actor beside it lets them walk out but not through', () => {
    let s = planted();
    s.actors[1].x = 400;
    s.actors[0].x = 545;
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, G / 2);
    s = action(s, { type: 'move', actor: 0, dir: 1 });
    s = step(s, 30);
    expect(s.actors[0].x).toBe(545);
    s = action(s, { type: 'move', actor: 0, dir: -1 });
    s = step(s, 30);
    expect(s.actors[0].x).toBeLessThan(545);
  });

  test('crates and seeds thrown at a growing plant stop against its stem', () => {
    let s = planted();
    s.actors[1].x = 400;
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, G / 2);
    s.objects.push(
      { kind: 'crate', id: 'crate-test', x: 500, y: 513, vx: 6, vy: 0, frozen: false, held: null, spawnX: 500, spawnY: 513 },
      { kind: 'seed', id: 'seed-test', x: 700, y: 500, vx: -6, vy: 0, frozen: false, held: null, spawnX: 700, spawnY: 500 });
    s = step(s, 40);
    expect(get(s, 'crate-test').x).toBeLessThan(600 - 15 - 27 + 1);
    expect(get(s, 'seed-test').x).toBeGreaterThan(600 + 15 + 10 - 1);
  });

  test('a fully grown plant stays lush for a while, then withers, then vanishes, freeing its pit and dropping its rider', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
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
    expect(s.events.find(e => e.kind === 'vanish')).toMatchObject({ plant: true, base: 540 });
    expect(s.pits[0].plant).toBe(null);
    s = step(s, 5);
    expect(s.actors[1].grounded).toBe(false);
  });

  test('jumping from a young sprout goes higher than jumping from the ground', () => {
    let s = action(planted(), { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, Math.round(G * 30 / H));
    expect(plantOf(s).height).toBeLessThan(springHeight);
    expect(s.actors[1].on).toBe(plantOf(s).id);
    const jumped = action(s, { type: 'jump', actor: 1 });
    const springRise = s.actors[1].y - apex(jumped, 1);
    const ground = rootriseArena();
    const groundRise = ground.actors[1].y - apex(action(ground, { type: 'jump', actor: 1 }), 1);
    expect(springRise).toBeGreaterThan(groundRise * 1.4);
    expect(step(jumped).flags.sproutJump).toBe(true);
  });

  test('jumping from a tall tree is an ordinary jump', () => {
    let s = planted();
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, G / 6);
    s.actors[0].x = 450; // Still walks within reach of the mushroom
    s = action(s, { type: 'ability', actor: 0, target: 'plant-0' });
    const rise = s.actors[1].y - apex(action(s, { type: 'jump', actor: 1 }), 1);
    const ground = rootriseArena();
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
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, 40);
    expect(s.flags.withered).toBe(true);
    expect(s.actors[0].x).toBeGreaterThan(tree.x + 42);
  });
});

describe('still', () => {
  test('freezing a thrown crate slows it to a crawl along its arc, keeping its momentum', () => {
    let s = classicCourtyard();
    s.actors[0].x = 350;
    s = action(s, { type: 'grab', actor: 0 });
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 12);
    s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
    const before = { ...get(s, 'crate-0') };
    s = step(s, 30);
    const rate = meta.time.frozenRate;
    expect(get(s, 'crate-0').x).toBeCloseTo(before.x + before.vx * rate * 30, 5);
    expect(get(s, 'crate-0').vx).toBe(before.vx);
    // Local time runs at `rate`, so the arc's drop is about rate^2 of a free fall over the same time.
    expect(Math.abs(get(s, 'crate-0').y - before.y)).toBeLessThan(Math.abs(before.vy) * rate * 30 + 0.3 * (rate * 30) ** 2 + 1);
    const slowX = get(s, 'crate-0').x;
    s.freezeAreas[0].ticksLeft = 1; // the area fades: its tick already runs at full speed
    s = step(s);
    expect(get(s, 'crate-0').x).toBeCloseTo(slowX + before.vx, 5);
  });

  test('a crate flies on at full speed once its Freeze Area fades (Bloom cannot hasten crates)', () => {
    let s = classicCourtyard();
    s.actors[0].x = 350;
    s = action(s, { type: 'grab', actor: 0 });
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 12);
    s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
    s.actors[1].x = 350;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'crate-0' }).valid).toBe(false);
    s.freezeAreas[0].ticksLeft = 1;
    const before = { ...get(s, 'crate-0') };
    s = step(s);
    expect(get(s, 'crate-0').frozen).toBe(false);
    expect(get(s, 'crate-0').x).toBeCloseTo(before.x + before.vx, 5);
  });

  test('bloom cannot touch a crate that is not frozen', () => {
    const s = classicCourtyard();
    s.actors[1].x = 350;
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'crate-0' }).error).toBe('bloomRange');
  });

  test('freezing a plant mid-growth slows its clock and its growth to a crawl', () => {
    let s = action(planted(), { type: 'ability', actor: 1, target: 'plant-0' });
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' }); s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, 10);
    s.actors[0].x = 450; // Still walks within reach of the mushroom
    s = action(s, { type: 'ability', actor: 0, target: 'plant-0' });
    const frozen = { ...s.objects.find(o => o.kind === 'plant') };
    s = step(s, G / 10);
    expect(plantOf(s).age).toBeCloseTo(frozen.age + 3 * meta.time.frozenRate * G / 10, 5);
    expect(plantOf(s).height).toBeCloseTo(frozen.height + H * 3 * meta.time.frozenRate * (G / 10) / G, 5);
    const slowHeight = plantOf(s).height;
    s.freezeAreas[0].ticksLeft = 1; // the area fades: full speed again
    s = step(s);
    expect(plantOf(s)).toMatchObject({ frozen: false, speed: 3 });
    s = step(s, 10);
    expect(plantOf(s).height).toBeCloseTo(slowHeight + H * 3 * 11 / G, 5);
  });
});

describe('aiming is always the player\'s', () => {
  test('an ability with no aim is refused: nothing is picked for the player', () => {
    const s = withtimeArena();
    Object.assign(s.actors[0], { x: 300 }); Object.assign(s.actors[1], { x: 300 });
    expect(validateAction(s, 'local', { type: 'ability', actor: 0 }).error).toBe('aim');
    expect(validateAction(s, 'local', { type: 'ability', actor: 1 }).error).toBe('aim');
    expect(abilityTarget(s, 1)).toBeUndefined();
  });

  test('an aimed cast works: a point for Still, a named object within reach for Bloom', () => {
    const s = withtimeArena();
    Object.assign(s.actors[0], { x: 300 }); Object.assign(s.actors[1], { x: 520 });
    expect(validateAction(s, 'local', { type: 'ability', actor: 0, x: 360, y: 480 }).valid).toBe(true);
    const near = s.objects.find(o => o.kind === 'mover');
    expect(abilityTarget(s, 1, { target: near.id })?.id).toBe(near.id);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: near.id }).valid).toBe(true);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'nothing-here' }).error).toBe('bloomRange');
  });
});

describe('crate collision', () => {
  test('a crate thrown into a cliff face stops against it instead of passing through', () => {
    let s = classicCourtyard(), wall = s.platforms[1];
    Object.assign(get(s, 'crate-0'), { x: wall.x - 60, y: wall.y + 40, vx: 8, vy: 0 });
    for (let i = 0; i < 20; i++) { s = step(s); expect(get(s, 'crate-0').x).toBeLessThanOrEqual(wall.x - 27); }
    expect(get(s, 'crate-0').vx).toBe(0);
  });
  test('an actor walking into a resting crate stops at its side', () => {
    let s = classicCourtyard();
    const crate = get(s, 'crate-0');
    s = action(s, { type: 'move', actor: 1, dir: 1 });
    s = step(s, 40);
    expect(s.actors[1].x).toBeLessThanOrEqual(crate.x - 27 - 15);
    expect(s.actors[1].y).toBe(520);
  });

  test('jumping up into a frozen crate bumps the head', () => {
    let s = classicCourtyard();
    Object.assign(get(s, 'crate-0'), { x: 250, y: 400, frozen: true });
    s = action(s, { type: 'jump', actor: 1 });
    let top = s.actors[1].y;
    for (let i = 0; i < 40; i++) { s = step(s); top = Math.min(top, s.actors[1].y); }
    expect(top).toBeGreaterThanOrEqual(400 + 27 + 52 - 0.5);
    expect(s.actors[1].on).not.toBe('crate-0');
  });

  test('an actor already overlapping a crate can still walk out of it', () => {
    let s = classicCourtyard();
    s.actors[1].x = 340;
    s = action(s, { type: 'move', actor: 1, dir: -1 });
    s = step(s, 10);
    expect(s.actors[1].x).toBeLessThan(330);
  });

  test('a carried crate is not solid to the other actor', () => {
    let s = classicCourtyard();
    s.actors[0].x = 330;
    s = action(s, { type: 'grab', actor: 0 });
    s.actors[1].x = 300;
    s = action(s, { type: 'move', actor: 1, dir: 1 });
    s = step(s, 20);
    expect(s.actors[1].x).toBeGreaterThan(360);
  });
});

describe('movers', () => {
  const moverLevel = () => { const s = withtimeArena(); s.actors[0].x = 600; s.actors[0].y = 290; s.actors[0].on = 'mover-0'; s.actors[1].x = 450; return s; };

  test('a mover rests until bloomed, carries its rider, and crawls when frozen', () => {
    let s = step(moverLevel(), 30);
    expect(get(s, 'mover-0').x).toBe(540);
    s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    s = step(s, 30);
    expect(get(s, 'mover-0').x).toBe(570);
    expect(s.actors[0].x).toBeCloseTo(630, 5);
    expect(s.flags.moverRide).toBe(true);
    s = action(s, { type: 'ability', actor: 0, target: 'mover-0' });
    s = step(s, 30);
    expect(get(s, 'mover-0').x).toBeCloseTo(570 + 30 * meta.time.frozenRate, 5);
    expect(s.actors[0].x).toBeCloseTo(630 + 30 * meta.time.frozenRate, 5);
  });

  test('a mover never carries its rider into a wall', () => {
    let s = moverLevel();
    s.platforms.push({ x: 690, y: 200, w: 40, h: 200 });
    Object.assign(s.actors[0], { x: 650, y: 290, on: 'mover-0', grounded: true });
    s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    s = step(s, 60);
    expect(get(s, 'mover-0').x).toBeGreaterThanOrEqual(590);
    expect(s.actors[0].x + 15).toBeLessThanOrEqual(690);
    expect(s.flags.moverRide).toBe(true);
  });

  test('a mover never carries its rider into a crate', () => {
    let s = moverLevel();
    s.platforms.push({ x: 690, y: 317, w: 100, h: 20 });
    s.objects.push({ kind: 'crate', id: 'wall', x: 727, y: 290, vx: 0, vy: 0, frozen: false, held: null, spawnX: 727, spawnY: 290 });
    Object.assign(s.actors[0], { x: 650, y: 290, on: 'mover-0', grounded: true });
    s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    s = step(s, 60);
    expect(get(s, 'mover-0').x).toBeGreaterThanOrEqual(590);
    expect(s.actors[0].x + 15).toBeLessThanOrEqual(700);
  });

  test('blooming a moving mover speeds it up to a cap', () => {
    let s = moverLevel();
    for (let i = 0; i < meta.time.maxSpeed; i++) s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    expect(get(s, 'mover-0').speed).toBe(meta.time.maxSpeed);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'mover-0' }).error).toBe('maxSpeed');
  });
});

describe('assists', () => {
  test('rewind is no longer an action and the state keeps no rewind history', () => {
    const s = step(rootriseArena(), 30);
    expect(validateAction(s, 'local', { type: 'rewind', actor: 0 }).valid).toBe(false);
    expect(applyAction(s, 'local', { type: 'rewind' })).toBe(s);
    expect('history' in s).toBe(false);
    expect('rewindsLeft' in s).toBe(false);
  });

  test('the clock starts on first input and the hint escalates after 90 idle seconds of play', () => {
    let s = step(rootriseArena(), 100);
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
    const s = classicCourtyard({ players: ['one', 'two'] });
    expect(validateAction(s, 'one', { type: 'move', actor: 1, dir: 1 }).valid).toBe(false);
    expect(validateAction(s, 'two', { type: 'tick' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'ability', actor: 0, target: 'plant-9' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'move', actor: 0, dir: Infinity }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'echo', actor: 0 }).valid).toBe(false);
    expect(validateAction(s, 'one', null).valid).toBe(false);
    expect(viewFor(s, 'stranger')).toBe(null); expect(isGameOver(s)).toBe(null);
  });

  test('any chamber can be chosen directly, without unlocking it first', () => {
    const s = classicCourtyard();
    expect(s.unlocked).toBe(0);
    for (let level = 1; level < levelCount; level++) expect(action(s, { type: 'level', level }).level).toBe(level);
    for (const level of [-1, levelCount, 1.5, '2']) expect(validateAction(s, 'local', { type: 'level', level }).error).toBe('invalid');
  });

  test('needs are optional, but both travelers must stand in the moon gate', () => {
    let s = classicCourtyard(); Object.assign(s.actors[0], { x: s.exit.x, y: s.exit.y });
    s = step(s); expect(s.status).toBe('playing');
    Object.assign(s.actors[1], { x: s.exit.x, y: s.exit.y });
    s = step(s); expect(s.status).toBe('won'); expect(s.needsDone).toBe(0);
  });

  test('replaying a chamber never farms duplicate collectibles', () => {
    let s = classicCourtyard(); s.flags.frozenTouched = true; s.shards[0].taken = true; for (const p of s.actors) Object.assign(p, { x: s.exit.x, y: s.exit.y });
    s = step(s); expect(s.totalShards).toBe(1);
    s = action(s, { type: 'restart' }); s.flags.frozenTouched = true; s.shards[0].taken = true; for (const p of s.actors) Object.assign(p, { x: s.exit.x, y: s.exit.y });
    s = step(s); expect(s.totalShards).toBe(1); expect(s.collected).toEqual(Array.from({ length: levelCount }, (_, i) => i === 0));
  });
});

describe('review fixes', () => {
  test('bloom still wakes and hastens a mushroom inside a Freeze Area; it then grows at the slowed rate', () => {
    let s = planted();
    s.actors[0].x = 560;
    s = action(s, { type: 'ability', actor: 0, target: 'plant-0' });
    expect(plantOf(s)).toMatchObject({ frozen: true, speed: 0 });
    s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    expect(plantOf(s)).toMatchObject({ frozen: true, speed: 1 });
    const age = plantOf(s).age;
    s = step(s, 10);
    expect(plantOf(s).age).toBeCloseTo(age + 10 * meta.time.frozenRate, 5);
  });

  test('a seed falling onto a crate rests on it', () => {
    let s = classicCourtyard();
    s.objects.push({ kind: 'seed', id: 'seed-9', x: 350, y: 380, vx: 0, vy: 0, frozen: false, held: null, spawnX: 100, spawnY: 100 });
    s = step(s, 40);
    const seed = get(s, 'seed-9'), crate = get(s, 'crate-0');
    expect(seed.y).toBeCloseTo(crate.y - 27 - 10, 0);
    expect(crate.y).toBe(493);
  });

  test('the clock starts on a first grab', () => {
    let s = classicCourtyard();
    s = step(s, 5); expect(s.elapsed).toBe(0);
    s.actors[0].x = 300; s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 5); expect(s.elapsed).toBe(5);
  });

  test('an item resting on a growing plant rides it up', () => {
    let s = planted();
    s.actors[1].x = 300;
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1, target: 'plant-0' });
    s = step(s, 40);
    Object.assign(get(s, 'seed-0'), { x: 600, y: 540 - plantOf(s).height - 10, vx: 0, vy: 0, held: null });
    s = step(s, 120);
    expect(plantOf(s).height).toBeGreaterThan(100);
    expect(get(s, 'seed-0').y).toBeCloseTo(540 - plantOf(s).height - 10, 0);
  });
});

describe('level data', () => {
  test('no checkpoint respawns an actor inside a guard patrol', () => {
    for (const level of LEVELS) for (const cp of level.checkpoints ?? []) for (const g of (level.enemies ?? []).filter(e => e.kind === 'guard' && e.y === cp.y)) {
      const lo = g.minX - ENEMY.guard.w / 2, hi = g.maxX + ENEMY.guard.w / 2;
      for (const x of [cp.x - 18, cp.x + 18]) expect(x + 15 <= lo || x - 15 >= hi).toBe(true);
    }
  });
});

describe('carried riders', () => {
  const stand = (s, id) => { Object.assign(s.actors[0], { x: 350, y: 466, on: id, grounded: true }); return s; };

  test('grabbing the crate you stand on does not lift you with it', () => {
    let s = stand(classicCourtyard(), 'crate-0');
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 1);
    expect(s.actors[0].y).toBeGreaterThanOrEqual(466 - 1);
    expect(Math.abs(s.actors[0].x - 350)).toBeLessThanOrEqual(5);
  });

  test('a rider is not teleported when its crate is reset to spawn', () => {
    let s = classicCourtyard();
    Object.assign(get(s, 'crate-0'), { x: 1255, y: 300, vx: 10 });
    Object.assign(s.actors[0], { x: 1255, y: 273, on: 'crate-0', grounded: true });
    s = step(s, 1);
    expect(get(s, 'crate-0').x).toBe(350);
    expect(s.actors[0].x).toBeGreaterThan(1000);
    expect(s.actors[0].y).toBeGreaterThanOrEqual(273);
  });

  test('a frozen crate keeps sliding at the slowed friction', () => {
    let s = classicCourtyard();
    Object.assign(get(s, 'crate-0'), { vx: 4 });
    s.freezeAreas.push({ id: 'test', x: 350, y: 493, radius: 130, ticksLeft: 1e6, duration: 1e6 });
    s = step(s, 20);
    expect(get(s, 'crate-0').vx).toBeCloseTo(4 * 0.88 ** (meta.time.frozenRate * 20), 3);
  });
});
