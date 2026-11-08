import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityCheck, meta, cloudSolid } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 4: Bloom rewinds. A dead tree in front of a low tunnel (hop in from the cap while it is about half
// height), then a thorny vine closing the shaft in front of the cliff (rewound, it opens a gap by the cliff), then a
// cloud over a basin: the crate is the step from the cliff's edge up onto it, and it is the step to the gate.
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[3];
const [start, floor, roof, lower, block, cliff, basinLeft, groove, basinRight, gate] = level.platforms;
const GATE = `platform-${level.platforms.indexOf(gate)}`;
const on = (f, x) => x > f.x && x < f.x + f.w;
const get = (s, id) => s.objects.find(o => o.id === id);
const stand = (s, who, x, y, on) => Object.assign(s.actors[who], { x, y, vx: 0, vy: 0, grounded: true, on });
const { growTicks, maxHeight } = meta.plant;
// Put the tree in its shrinking (young) phase at cap height h, awake or not.
const treeAt = (s, h) => Object.assign(get(s, 'plant-0'), { age: h / maxHeight * growTicks, height: h, withered: false });
const vineAt = (s, length) => Object.assign(get(s, 'plant-1'), { age: length / meta.vine.maxLength * growTicks, height: length });

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
  test('rewinding courtyard, platforms in order, gate on its own ledge past the cloud basin', () => {
    const s = setup({ level: 3 });
    expect(s.bloomReverses).toBe(true);
    expect(s.width).toBe(3460);
    expect(start.y - floor.y).toBe(200);
    expect(roof.ceiling && roof.y + roof.h).toBe(251);
    expect(floor.y - (roof.y + roof.h)).toBe(69);
    expect(lower.y).toBe(520);
    expect(block.ceiling && block.y + block.h).toBe(380);
    expect(lower.y - cliff.y).toBe(140);
    expect(level.exit.y === gate.y && level.exit.x > gate.x).toBe(true);
    expect(s.seeds).toBe(0);
    expect(s.objects.filter(o => o.kind === 'seed' || o.kind === 'mover')).toHaveLength(0);
  });

  test('past the cliff: a basin with a water-filled groove under a high cloud, and one crate on the cliff', () => {
    const s = setup({ level: 3 }), c = s.objects.find(o => o.kind === 'cloud'), box = s.objects.find(o => o.kind === 'crate');
    expect([cliff.x + cliff.w, basinLeft.x + basinLeft.w, groove.x + groove.w, basinRight.x + basinRight.w]).toEqual([basinLeft.x, groove.x, basinRight.x, gate.x]);
    expect(basinLeft.y - cliff.y).toBe(70);
    expect(c.pool).toEqual({ x: groove.x, y: basinLeft.y, w: groove.w, h: groove.y - basinLeft.y });
    expect(c.x - c.w / 2 >= groove.x && c.x + c.w / 2 <= groove.x + groove.w).toBe(true);
    // Too high to jump to from the cliff (a jump rises about 163), reachable from the crate. The gate's ledge lies
    // beyond any jump from the crate, even one caught in the air while it is still rising from a throw.
    expect(cliff.y - c.y).toBe(175);
    expect(gate.x - (cliff.x + cliff.w)).toBe(540);
    expect(c.w).toBe(160);
    expect(s.objects.filter(o => o.kind === 'crate')).toHaveLength(1);
    expect(box).toMatchObject({ y: cliff.y - 27, homes: [level.platforms.indexOf(lower), level.platforms.indexOf(cliff)] });
    expect(box.respawnRight).toBeUndefined();
    expect(on(cliff, box.x)).toBe(true);
    expect(s.freezeEndsX).toBeNull();
  });

  test('the dead tree sleeps, withered and low; the vine sleeps, full and thorny', () => {
    const s = setup({ level: 3 });
    expect(get(s, 'plant-0')).toMatchObject({ speed: 0, withered: true });
    expect(get(s, 'plant-0').height).toBeLessThan(26);
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
  const dead = solo(s => stand(s, STILL, 640, 520 - get(s, 'plant-0').height, 'plant-0'));

  test('out of reach from the start ground and from the dead tree', () => {
    for (const x of [700, 744]) expect(anyJumpReaches(solo(s => stand(s, STILL, x, 520, 'platform-0')), 'platform-1')).toBe(false);
    expect(anyJumpReaches(dead, 'platform-1')).toBe(false);
  });

  test('reached from a cap around half height, not from a full-grown one', () => {
    expect(anyJumpReaches(onCap(60), 'platform-1')).toBe(true);
    expect(anyJumpReaches(onCap(117), 'platform-1')).toBe(true);
    expect(anyJumpReaches(onCap(195), 'platform-1')).toBe(true);
    const full = solo(s => { Object.assign(get(s, 'plant-0'), { age: 1200, height: maxHeight, withered: false }); stand(s, STILL, 640, 520 - maxHeight, 'plant-0'); });
    expect(anyJumpReaches(full, 'platform-1')).toBe(false);
  });

  test('rewound, the tree grows back to full, then shrinks through half height and vanishes', () => {
    let s = setup({ level: 3 });
    stand(s, BLOOM, 560, 520, 'platform-0');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    let tallest = 0, half = false;
    for (let t = 0; t < 2000 && get(s, 'plant-0'); t++) {
      s = tick(s);
      const p = get(s, 'plant-0');
      if (p) { tallest = Math.max(tallest, p.height); if (tallest > maxHeight - 1 && Math.abs(p.height - maxHeight / 2) < 2) half = true; }
    }
    expect(tallest).toBeGreaterThan(maxHeight - 1);
    expect(half).toBe(true);
    expect(get(s, 'plant-0')).toBeUndefined();
  });
});

describe('courtyard 4: the shaft', () => {
  const inShaft = (length, x = 2140) => solo(s => { if (length !== undefined) vineAt(s, length); stand(s, STILL, x, 520, 'platform-3'); });

  test('the full thorny vine keeps everyone off the cliff', () => {
    for (const x of [1940, 2040, 2140]) expect(anyJumpReaches(inShaft(undefined, x), 'platform-5')).toBe(false);
  });

  test('rewound to 180 it leaves a gap by the cliff to jump up through', () => {
    expect(anyJumpReaches(inShaft(180, 2135), 'platform-5')).toBe(true);
  });

  test('no way over: the hanging block and the vine top are out of reach from below and from the tunnel', () => {
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1810, 520, 'platform-3')), 'platform-4')).toBe(false);
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1385, 320, 'platform-1')), 'platform-4')).toBe(false);
    expect(anyJumpReaches(solo(s => stand(s, STILL, 1385, 320, 'platform-1')), 'plant-1')).toBe(false);
  });
});

describe('courtyard 4: the cloud basin', () => {
  // Only the travellers, the ledges, the cloud (formed, or a full pool) and, if asked, the crate; Bloom waits on the cliff.
  const section = ({ formed = false, crate = false, prepare = () => {} } = {}) => () => {
    const s = setup({ level: 3 });
    s.objects = s.objects.filter(o => o.kind === 'cloud' || (crate && o.kind === 'crate'));
    get(s, 'cloud-0').age = formed ? meta.cloud.waterTicks + meta.cloud.formTicks + 1 : 10;
    stand(s, BLOOM, cliff.x + 40, cliff.y, 'platform-5');
    prepare(s);
    return s;
  };
  const edge = cliff.x + cliff.w;

  test('the cloud is out of jumping reach from the cliff, but not from the crate at its edge', () => {
    for (const x of [edge - 80, edge - 20, edge + 14]) {
      expect(anyJumpReaches(section({ formed: true, prepare: s => stand(s, STILL, x, cliff.y, 'platform-5') }), 'cloud-0')).toBe(false);
    }
    expect(anyJumpReaches(section({ formed: true, crate: true, prepare: s => {
      Object.assign(get(s, 'crate-0'), { x: edge - 30 });
      stand(s, STILL, edge - 40, cliff.y - 54, 'crate-0');
    } }), 'cloud-0')).toBe(true);
  });

  test('from the cloud the gate\'s ledge is a jump away', () => {
    const c = get(setup({ level: 3 }), 'cloud-0');
    for (const x of [c.x - 60, c.x, c.x + 60]) expect(anyJumpReaches(section({ formed: true, prepare: s => stand(s, STILL, x, c.y, 'cloud-0') }), GATE)).toBe(true);
  });

  test('without the cloud, nothing reaches the gate\'s ledge: not the cliff, the crate, a crate held in mid-air, or the basin', () => {
    for (const x of [edge - 60, edge + 14]) expect(anyJumpReaches(section({ prepare: s => stand(s, STILL, x, cliff.y, 'platform-5') }), GATE)).toBe(false);
    expect(anyJumpReaches(section({ crate: true, prepare: s => {
      Object.assign(get(s, 'crate-0'), { x: edge - 30 });
      stand(s, STILL, edge - 20, cliff.y - 54, 'crate-0');
    } }), GATE)).toBe(false);
    // A crate held in the air at the cliff's edge is not itself a step all the way to the gate.
    for (const top of [-60, 60, 160, 260]) {
      expect(anyJumpReaches(section({ prepare: s => {
        s.platforms.push({ x: edge - 27, y: top, w: 54, h: 54 });
        stand(s, STILL, edge + 10, top, `platform-${s.platforms.length - 1}`);
      } }), GATE)).toBe(false);
    }
    for (const [f, x] of [[basinRight, basinRight.x + 20], [basinRight, gate.x - 16], [groove, groove.x + groove.w - 16]]) {
      expect(anyJumpReaches(section({ prepare: s => stand(s, STILL, x, f.y, `platform-${level.platforms.indexOf(f)}`) }), GATE)).toBe(false);
    }
  });

  test('anyone who drops into the basin can jump back up onto the cliff', () => {
    for (const x of [basinLeft.x + 20, basinLeft.x + 90]) {
      expect(anyJumpReaches(section({ prepare: s => stand(s, STILL, x, basinLeft.y, `platform-${level.platforms.indexOf(basinLeft)}`) }), 'platform-5', -1)).toBe(true);
    }
  });

  test('the crate may rest on the cliff, down in the shaft or on the vine, and is never sent back for leaving the cliff', () => {
    let s = setup({ level: 3 });
    s.objects = s.objects.filter(o => o.kind !== 'plant');
    Object.assign(get(s, 'crate-0'), { x: cliff.x - 20, y: 420, vx: -1, vy: 0 });
    s = tick(s, 80);
    expect(get(s, 'crate-0')).toMatchObject({ y: lower.y - 27 });
    expect(on(lower, get(s, 'crate-0').x)).toBe(true);
    s = setup({ level: 3 });
    Object.assign(get(s, 'crate-0'), { x: 1990, y: 300, vx: 0, vy: 0 });
    s = tick(s, 30);
    expect(get(s, 'crate-0').y).toBe(get(s, 'plant-1').base - 27);
    expect(s.events.some(e => e.kind === 'return')).toBe(false);
  });

  test('a crate that lands in the basin or out of reach (the gate\'s ledge, the hanging block) returns to the cliff', () => {
    let s = setup({ level: 3 });
    const home = { x: get(s, 'crate-0').spawnX, y: get(s, 'crate-0').spawnY };
    // Thrown off the edge, it flies out and falls into the basin first, and only then returns.
    Object.assign(get(s, 'crate-0'), { x: edge - 10, vx: 3 });
    let flew = false, returned = false;
    for (let i = 0; i < 80 && !returned; i++) {
      s = tick(s);
      const box = get(s, 'crate-0');
      if (box.x > edge + 27) flew = true;
      if (flew && box.x === home.x && box.y === home.y) returned = true;
    }
    expect(flew && returned).toBe(true);
    for (const [x, y] of [[gate.x + 100, gate.y - 160], [block.x + 100, block.y - 100]]) {
      s = setup({ level: 3 });
      Object.assign(get(s, 'crate-0'), { x, y, vx: 0, vy: 0 });
      s = tick(s, 40);
      expect(get(s, 'crate-0')).toMatchObject(home);
    }
  });

  test('carried down into the basin, the crate leaves its carrier\'s hands and returns to the cliff', () => {
    let s = setup({ level: 3 });
    stand(s, STILL, 2330, cliff.y, 'platform-5');
    s = act(s, { type: 'grab', actor: STILL });
    expect(s.actors[STILL].carrying).toBe('crate-0');
    s = act(s, { type: 'move', actor: STILL, dir: 1 });
    for (let i = 0; i < 120 && s.actors[STILL].on !== `platform-${level.platforms.indexOf(basinLeft)}`; i++) s = tick(s);
    expect(s.actors[STILL].carrying).toBeNull();
    expect(get(s, 'crate-0')).toMatchObject({ held: null, x: get(s, 'crate-0').spawnX, y: get(s, 'crate-0').spawnY });
  });

  test('Still keeps Freeze at the cliff and can hold the cloud from its edge', () => {
    let s = setup({ level: 3 });
    s.freezeCharges = 2;
    s.freezeAreas.push({ id: 'freeze-x', owner: 'local', x: 2000, y: 400, radius: meta.freeze.radius, ticksLeft: 300, duration: 600 });
    stand(s, STILL, cliff.x - 15, lower.y, 'platform-3');
    s = tick(s);
    expect(s.freezeCharges).toBe(2);
    expect(s.freezeAreas).toHaveLength(1);
    stand(s, STILL, cliff.x + 40, cliff.y, 'platform-5');
    s = tick(s);
    expect(s.freezeCharges).toBe(2);
    expect(s.freezeAreas).toHaveLength(1);
    expect(s.events.some(e => e.kind === 'freezeSpent')).toBe(false);
    const c = get(s, 'cloud-0'); c.age = meta.cloud.waterTicks + meta.cloud.formTicks + 20;
    const age = c.age;
    stand(s, STILL, cliff.x + cliff.w - 20, cliff.y, 'platform-5');
    s = act(s, { type: 'ability', actor: STILL, target: c.id });
    expect(s.freezeCharges).toBe(1);
    s = tick(s, meta.cloud.cloudTicks + 30);
    expect(get(s, c.id)).toMatchObject({ age, frozen: true });
    expect(cloudSolid(get(s, c.id))).toBe(true);
  });

  test('Bloom rewinds the cloud here: water that has just rained away rises back into a fresh cloud', () => {
    let s = setup({ level: 3 });
    const { waterTicks, formTicks, cloudTicks, rainTicks } = meta.cloud;
    get(s, 'cloud-0').age = waterTicks + formTicks + cloudTicks + rainTicks + 100;
    stand(s, BLOOM, edge - 20, cliff.y, 'platform-5');
    expect(abilityCheck(s, BLOOM, 'cloud-0')).toBe('ok');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'cloud-0' });
    expect(get(s, 'cloud-0').speed).toBe(-1);
    let n = 0; while (!cloudSolid(get(s, 'cloud-0')) && n < 1000) { s = tick(s); n++; }
    expect(n).toBeLessThanOrEqual(100 + rainTicks + 2);
    expect(get(s, 'cloud-0').speed).toBe(0);
  });
});

describe('courtyard 4 can be finished', () => {
  test('rewind the tree, both hop into the tunnel, rewind the vine, both jump up, both reach the gate', () => {
    let s = setup({ level: 3 });
    stand(s, BLOOM, 560, 520, 'platform-0');
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-0' });
    // Wait for the shrinking phase at about 150 (past full height), then both stand on the cap and go.
    for (let t = 0; t < 2000 && !(get(s, 'plant-0').age < growTicks && get(s, 'plant-0').height < 150); t++) s = tick(s);
    const h = get(s, 'plant-0').height;
    stand(s, STILL, 625, 520 - h, 'plant-0'); stand(s, BLOOM, 655, 520 - h, 'plant-0');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 1 });
    s = tick(s, 4);
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'jump', actor: who });
    s = tick(s, 60);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('platform-1');
    expect(s.flags.treeRewound).toBe(true);
    // Through the tunnel and down to the shaft (positions set directly).
    stand(s, STILL, 2130, 520, 'platform-3'); stand(s, BLOOM, 2040, 520, 'platform-3');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 0 });
    s = act(s, { type: 'ability', actor: BLOOM, target: 'plant-1' });
    s = tick(s, 300);
    expect(get(s, 'plant-1').height).toBeLessThan(170);
    expect(s.flags.vineRewound).toBe(true);
    stand(s, BLOOM, 2140, 520, 'platform-3');
    // Let go of jump from the tunnel hop so this press counts as a new jump.
    for (const who of [STILL, BLOOM]) { s = act(s, { type: 'jumpRelease', actor: who }); s = act(s, { type: 'move', actor: who, dir: 1 }); s = act(s, { type: 'jump', actor: who }); }
    s = tick(s, 70);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('platform-5');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 0 });

    // On the cliff: Still carries the crate to the edge and sets it down with a gentle throw; both stand on it.
    s = act(s, { type: 'grab', actor: STILL });
    s = act(s, { type: 'move', actor: STILL, dir: 1 });
    for (let i = 0; i < 100 && s.actors[STILL].x < cliff.x + cliff.w - 90; i++) s = tick(s);
    s = act(s, { type: 'move', actor: STILL, dir: 0 });
    s = act(s, { type: 'grab', actor: STILL, aim: { vx: 0.6, vy: 0 } });
    s = tick(s, 40);
    const box = get(s, 'crate-0');
    expect(box.x).toBeGreaterThan(cliff.x + cliff.w - 60);
    expect(box.x).toBeLessThanOrEqual(cliff.x + cliff.w);
    for (const who of [STILL, BLOOM]) {
      s = act(s, { type: 'jumpRelease', actor: who });
      s = act(s, { type: 'move', actor: who, dir: 1 });
      for (let i = 0; i < 80 && s.actors[who].x < box.x - 60; i++) s = tick(s);
      s = act(s, { type: 'jump', actor: who });
      for (let i = 0; i < 60 && s.actors[who].on !== box.id; i++) {
        s = tick(s);
        if (s.actors[who].x > box.x + (who === STILL ? 10 : -10)) s = act(s, { type: 'move', actor: who, dir: 0 });
      }
      s = act(s, { type: 'move', actor: who, dir: 0 }); s = act(s, { type: 'jumpRelease', actor: who });
      expect(s.actors[who].on).toBe(box.id);
    }

    // Still can save the unused Freeze for the cloud crossing.
    expect(s.freezeCharges).toBe(2);
    // Once a cloud has formed: Still walks to the crate's right end and jumps onto it, and Bloom follows as Still
    // lands (never both on it for long); each walks on to the cloud's right part and jumps to the gate's ledge.
    for (let i = 0; i < 2400 && !cloudSolid(get(s, 'cloud-0')); i++) s = tick(s);
    expect(cloudSolid(get(s, 'cloud-0'))).toBe(true);
    const cloud = get(s, 'cloud-0'), stage = [0, 0];
    for (let i = 0; i < 400 && !s.actors.every(a => a.on === GATE); i++) {
      for (const who of [STILL, BLOOM]) {
        const a = s.actors[who];
        if (stage[who] === 0 && (who === STILL || stage[STILL] >= 2)) {
          s = act(s, { type: 'move', actor: who, dir: 1 });
          if (a.x >= box.x + 12) { s = act(s, { type: 'jump', actor: who }); stage[who] = 1; }
        }
        else if (stage[who] === 1 && a.on === 'cloud-0') { s = act(s, { type: 'jumpRelease', actor: who }); stage[who] = 2; }
        else if (stage[who] === 2 && a.x >= cloud.x + cloud.w / 2 - 20) { s = act(s, { type: 'jump', actor: who }); stage[who] = 3; }
        else if (stage[who] === 3 && a.on === GATE && a.move) s = act(s, { type: 'move', actor: who, dir: 0 });
      }
      s = tick(s);
    }
    expect(s.actors.map(a => a.on)).toEqual([GATE, GATE]);
    expect(s.flags.cloudRide).toBe(true);
    for (let i = 0; i < 300 && s.status !== 'won'; i++) {
      for (const who of [STILL, BLOOM]) { const a = s.actors[who]; s = act(s, { type: 'move', actor: who, dir: Math.abs(a.x - level.exit.x) < 10 ? 0 : Math.sign(level.exit.x - a.x) }); }
      s = tick(s);
    }
    expect(s.status).toBe('won');
  });
});
