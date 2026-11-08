import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityCheck, meta } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 4 uses the same forward clock as the other gardens. Ride a growing flower into the low tunnel,
// then let the mature thorny vine age and wither until it opens a gap beside the cliff.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[3];
const [start, floor, roof, lower, block, cliff] = level.platforms;
const get = (s, id) => s.objects.find(o => o.id === id);
const stand = (s, who, x, y, on) => Object.assign(s.actors[who], { x, y, vx: 0, vy: 0, grounded: true, on });
const { growTicks, maxHeight } = meta.plant;
// Put the flower in its growing phase at petal height h, awake or not.
const treeAt = (s, h) => Object.assign(get(s, 'plant-0'), { age: h / maxHeight * growTicks, height: h, withered: false });
const vineAt = (s, length) => Object.assign(get(s, 'plant-1'), { age: growTicks + meta.plant.matureTicks + (1 - length / meta.vine.maxLength) * meta.plant.witherTicks, height: length, withered: true });

// Jump toward `dir` at every delay from standing to past the coyote grace; whether the feet ever rest on `goal`.
function anyJumpReaches(build, goal, dir = 1) {
  for (let delay = 0; delay <= 40; delay++) {
    let s = build();
    s = act(s, { type: 'move', actor: STILL, dir });
    for (let t = 0; t < 200; t++) {
      if (t === delay) s = act(s, { type: 'jump', actor: STILL });
      s = tick(s);
      if (s.actors[STILL].on === goal && s.actors[STILL].grounded) return true;
    }
  }
  return false;
}
// Bloom parked far away on the start ground so only Still moves.
const solo = (prepare = () => {}) => () => { const s = setup({ level: 3 }); stand(s, BLOOM, 40, 520, 'platform-0'); prepare(s); return s; };

describe('courtyard 4 layout', () => {
  test('forward-time courtyard, six platforms in order, gate on the cliff', () => {
    const s = setup({ level: 3 });
    expect(s.bloomReverses).toBe(false);
    expect(s.width).toBe(2800);
    expect(start.y - floor.y).toBe(200);
    expect(roof.ceiling && roof.y + roof.h).toBe(251);
    expect(floor.y - (roof.y + roof.h)).toBe(69);
    expect(lower.y).toBe(520);
    expect(block.ceiling && block.y + block.h).toBe(380);
    expect(lower.y - cliff.y).toBe(140);
    expect(level.exit.y === cliff.y && level.exit.x > cliff.x).toBe(true);
    expect(s.seeds).toBe(0);
    expect(s.objects.filter(o => o.kind === 'seed' || o.kind === 'crate' || o.kind === 'mover')).toHaveLength(0);
  });

  test('the flower starts as a sleeping seed; the vine sleeps, full and thorny', () => {
    const s = setup({ level: 3 });
    expect(get(s, 'plant-0')).toMatchObject({ speed: 0, age: 0, height: 0, withered: false });
    expect(get(s, 'plant-1')).toMatchObject({ speed: 0, withered: false, wall: 1, x: block.x + block.w });
    expect(get(s, 'plant-1').height).toBeCloseTo(meta.vine.maxLength);
    expect(get(s, 'plant-1').x + get(s, 'plant-1').height).toBeCloseTo(cliff.x);
  });

  test('Bloom can reach the tree from the start ground and the vine from the shaft floor', () => {
    const s = setup({ level: 3 });
    stand(s, BLOOM, 560, 520, 'platform-0');
    expect(abilityCheck(s, BLOOM, 'plant-0')).toBe('ok');
    stand(s, BLOOM, 2040, 520, 'platform-3');
    expect(abilityCheck(s, BLOOM, 'plant-1')).toBe('ok');
  });
});

describe('courtyard 4: the tunnel', () => {
  const onCap = h => solo(s => { treeAt(s, h); stand(s, STILL, 640, 520 - h, 'plant-0'); });
  const seed = solo(s => stand(s, STILL, 640, 520, 'platform-0'));

  test('out of reach from the start ground and the unactivated seed', () => {
    for (const x of [700, 744]) expect(anyJumpReaches(solo(s => stand(s, STILL, x, 520, 'platform-0')), 'platform-1')).toBe(false);
    expect(anyJumpReaches(seed, 'platform-1')).toBe(false);
  });

  test('reached from a cap around half height, not from a full-grown one', () => {
    expect(anyJumpReaches(onCap(60), 'platform-1')).toBe(true);
    expect(anyJumpReaches(onCap(117), 'platform-1')).toBe(true);
    expect(anyJumpReaches(onCap(195), 'platform-1')).toBe(true);
    const full = solo(s => { Object.assign(get(s, 'plant-0'), { age: 1200, height: maxHeight, withered: false }); stand(s, STILL, 640, 520 - maxHeight, 'plant-0'); });
    expect(anyJumpReaches(full, 'platform-1')).toBe(false);
  });

  test('woken, the flower grows, holds, wilts through all stages and vanishes', () => {
    let s = setup({ level: 3 });
    stand(s, BLOOM, 560, 520, 'platform-0');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    expect(get(s, 'plant-0').speed).toBe(1);
    let tallest = 0, half = false, sawMature = false, sawWilt = false, lastAge = -1;
    for (let t = 0; t < 2000 && get(s, 'plant-0'); t++) {
      s = tick(s);
      const p = get(s, 'plant-0');
      if (p) {
        expect(p.age).toBeGreaterThan(lastAge); lastAge = p.age;
        tallest = Math.max(tallest, p.height);
        if (p.age >= growTicks && !p.withered) sawMature = true;
        if (p.withered) { sawWilt = true; expect(sawMature).toBe(true); }
        if (sawWilt && Math.abs(p.height - maxHeight / 2) < 2) half = true;
      }
    }
    expect(tallest).toBeGreaterThan(maxHeight - 1);
    expect(half).toBe(true);
    expect(sawWilt).toBe(true);
    expect(s.events.some(e => e.kind === 'unwither')).toBe(false);
    expect(get(s, 'plant-0')).toBeUndefined();
  });
});

describe('courtyard 4: the shaft', () => {
  const inShaft = (length, x = 2140) => solo(s => { if (length !== undefined) vineAt(s, length); stand(s, STILL, x, 520, 'platform-3'); });

  test('the full thorny vine keeps everyone off the cliff', () => {
    for (const x of [1940, 2040, 2140]) expect(anyJumpReaches(inShaft(undefined, x), 'platform-5')).toBe(false);
  });

  test('withered down to 180 it leaves a gap by the cliff to jump up through', () => {
    expect(anyJumpReaches(inShaft(180, 2135), 'platform-5')).toBe(true);
  });

  test('no way over: the hanging block and the vine top are out of reach from below and from the tunnel', () => {
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1810, 520, 'platform-3')), 'platform-4')).toBe(false);
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1385, 320, 'platform-1')), 'platform-4')).toBe(false);
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1385, 320, 'platform-1')), 'plant-1')).toBe(false);
  });
});

describe('courtyard 4 can be finished', () => {
  test('grow the flower, both ride and hop into the tunnel, age the vine, both jump up and reach the gate', () => {
    let s = setup({ level: 3 });
    stand(s, STILL, 625, 520, 'platform-0'); stand(s, BLOOM, 655, 520, 'platform-0');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    // Both start over the seed; its real growth lifts them into the tunnel's useful height range.
    for (let t = 0; t < growTicks && get(s, 'plant-0').height < 125; t++) s = tick(s);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('plant-0');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 1 });
    s = tick(s, 4);
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'jump', actor: who });
    s = tick(s, 60);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('platform-1');
    expect(s.flags.treeLifted).toBe(true);
    expect(s.flags.treeRewound).toBe(false);
    // Through the tunnel and down to the shaft (positions set directly).
    stand(s, STILL, 2130, 520, 'platform-3'); stand(s, BLOOM, 2040, 520, 'platform-3');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 0 });
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-1' });
    // Let its mature phase finish, then wait until natural withering leaves a useful gap.
    for (let t = 0; t < 1100 && get(s, 'plant-1').height >= 170; t++) s = tick(s);
    expect(get(s, 'plant-1').height).toBeLessThan(170);
    expect(get(s, 'plant-1').withered).toBe(true);
    expect(s.flags.withered).toBe(true);
    expect(s.flags.vineRewound).toBe(false);
    stand(s, BLOOM, 2140, 520, 'platform-3');
    // Let go of jump from the tunnel hop so this press counts as a new jump.
    for (const who of [STILL, BLOOM]) { s = act(s, { type: 'jumpRelease', actor: who }); s = act(s, { type: 'move', actor: who, dir: 1 }); s = act(s, { type: 'jump', actor: who }); }
    s = tick(s, 70);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('platform-5');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 0 });
    stand(s, STILL, level.exit.x - 10, cliff.y, 'platform-5'); stand(s, BLOOM, level.exit.x + 10, cliff.y, 'platform-5');
    s = tick(s, 2);
    expect(s.status).toBe('won');
  });
});
