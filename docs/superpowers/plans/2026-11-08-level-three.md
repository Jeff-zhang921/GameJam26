# Chamber 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder chamber 3 (`src/levels/03-afterbloom.js`) with the arrows / canyon / twin-movers level from the spec, adding the mover and projectile mechanics it needs.

**Architecture:** Movers gain an optional vertical axis and level-set `speed` / `dir` (a `makeMover` helper in `src/logic.js`); projectiles are bounded by `state.width`. Tests that used the old chamber-3 layout as a mechanics fixture move to a fixed `afterbloomArena()` first, so the redesign cannot break them. The new level is pure data plus a layout test file.

**Tech Stack:** Plain ES modules, Bun (`bun test`), Canvas 2D renderer.

Spec: `docs/superpowers/specs/2026-11-08-level-three-design.md`.

---

## File map

- `src/logic.js` — `makeMover`, vertical mover motion.
- `src/enemies.js` — projectile bounds use `state.width`.
- `public/render.js` — vertical mover track.
- `src/levels/03-afterbloom.js` — new level data.
- `tests/arena.js` — `afterbloomArena()` (old chamber-3 layout).
- `tests/movers.test.js` — new: mover / projectile / rider-clamp mechanics.
- `tests/level-three.test.js` — new: layout and solvability checks.
- `tests/gameplay.test.js`, `tests/logic.test.js`, `tests/range.test.js`, `tests/level-one.test.js` — point old-layout tests at the arena / another level.

---

### Task 1: Vertical movers and level-set speed / direction

**Files:**
- Modify: `src/logic.js` (mover creation in `makeLevel` ~line 87; mover branch in `ageObjects` ~line 386)
- Create: `tests/movers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/movers.test.js`:

```js
import { describe, test, expect } from 'bun:test';
import { setup, applyAction } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';
import { rootriseArena } from './arena.js';

const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const mover = s => s.objects.find(o => o.kind === 'mover');
// Load level 1 with these movers in place of its own (restored afterwards).
function withMovers(movers, run) {
  const original = LEVELS[1].movers;
  LEVELS[1].movers = movers;
  try { return run(setup({ level: 1 })); } finally { LEVELS[1].movers = original; }
}

describe('movers', () => {
  test('a level mover can start running from its far end', () => {
    withMovers([{ x1: 300, x2: 500, y: 400, w: 100, speed: 1, dir: -1 }], s => {
      expect(mover(s)).toMatchObject({ x: 500, dir: -1, speed: 1 });
      expect(mover(tick(s, 10)).x).toBeCloseTo(490, 6);
    });
  });
  test('without speed a mover sleeps where it starts', () => {
    withMovers([{ x1: 300, x2: 500, y: 400, w: 100 }], s => {
      expect(mover(s)).toMatchObject({ x: 300, dir: 1, speed: 0 });
      expect(mover(tick(s, 10)).x).toBe(300);
    });
  });
  test('a vertical mover runs between y1 and y2 and turns at each end', () => {
    withMovers([{ axis: 'y', x: 300, w: 100, y1: 300, y2: 400, speed: 1, dir: -1 }], s => {
      expect(mover(s)).toMatchObject({ axis: 'y', x: 300, y: 400, y1: 300, y2: 400 });
      s = tick(s, 50); expect(mover(s).y).toBeCloseTo(350, 6);
      s = tick(s, 60); expect(mover(s)).toMatchObject({ dir: 1 }); expect(mover(s).y).toBeCloseTo(310, 6);
      expect(mover(s).x).toBe(300);
    });
  });
  test('a vertical mover carries its rider up and down', () => {
    let s = rootriseArena();
    s.objects.push({ kind: 'mover', id: 'mover-x', axis: 'y', x: 300, y: 450, w: 120, y1: 400, y2: 450, dir: -1, speed: 1, frozen: false });
    Object.assign(s.actors[1], { x: 360, y: 450, vx: 0, vy: 0, grounded: true, on: 'mover-x' });
    s = tick(s, 30);
    expect(s.actors[1]).toMatchObject({ grounded: true, on: 'mover-x' }); expect(s.actors[1].y).toBeCloseTo(420, 0);
    s = tick(s, 50); // up to 400, then 30 back down
    expect(s.actors[1]).toMatchObject({ grounded: true, on: 'mover-x' }); expect(s.actors[1].y).toBeCloseTo(430, 0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/movers.test.js`
Expected: FAIL — `speed` / `dir` / `axis` from level data are ignored (mover starts at x1, asleep, no `axis`).

- [ ] **Step 3: Implement**

In `src/logic.js`, add after `makeSeed`:

```js
// A moving platform runs between x1 and x2 (with `axis: 'y'`, between y1 and y2). It sleeps until Bloom wakes it
// unless the level gives it a `speed`; `dir: -1` starts it at the far end heading back.
function makeMover(id, p) {
  const dir = p.dir ?? 1, base = { kind: 'mover', id, w: p.w, dir, speed: p.speed ?? 0, frozen: false };
  return p.axis === 'y' ? { ...base, axis: 'y', x: p.x, y: dir < 0 ? p.y2 : p.y1, y1: p.y1, y2: p.y2 }
    : { ...base, x: dir < 0 ? p.x2 : p.x1, y: p.y, x1: p.x1, x2: p.x2 };
}
```

In `makeLevel`, replace the movers line:

```js
    ...level.movers.map((p, i) => makeMover(`mover-${i}`, p)),
```

In `ageObjects`, replace the mover branch:

```js
    if (o.kind === 'mover' && o.speed > 0) {
      const [k, lo, hi] = o.axis === 'y' ? ['y', o.y1, o.y2] : ['x', o.x1, o.x2];
      o[k] += o.dir * o.speed * meta.time.moverSpeed * slow;
      if (o[k] >= hi) { o[k] = hi; o.dir = -1; } else if (o[k] <= lo) { o[k] = lo; o.dir = 1; }
    }
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/movers.test.js && bun test`
Expected: PASS (existing mover tests unchanged: a level mover without `speed`/`dir` is built exactly as before).

- [ ] **Step 5: Commit**

```bash
git add src/logic.js tests/movers.test.js
git commit -m "Add vertical movers and level-set mover speed and direction"
```

---

### Task 2: Projectiles cross wide levels; rider clamp check

**Files:**
- Modify: `src/enemies.js` (`fly`, ~line 121)
- Test: `tests/movers.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/movers.test.js` (add `import { makeEnemy } from '../src/enemies.js';` to the imports):

```js
describe('wide levels', () => {
  test('a dart keeps flying past x 1330 in a wider courtyard', () => {
    let s = rootriseArena(); s.width = 3000;
    s.platforms = [{ x: 0, y: 540, w: 3000, h: 120 }];
    s.objects.push(makeEnemy('dart', { x: 1300, y: 200, dx: 1, dy: 0 }, 'dart-x'));
    s = tick(s, 20);
    const dart = s.objects.find(o => o.id === 'dart-x');
    expect(dart).toBeDefined(); expect(dart.x).toBeGreaterThan(1330);
    s = tick(s, 400);
    expect(s.objects.find(o => o.id === 'dart-x')).toBeUndefined(); // gone once it leaves the world
  });
});

describe('riders', () => {
  test('a rider carried toward a wall stops at it instead of sticking in it', () => {
    let s = rootriseArena(); // platform-1 (the exit ledge) starts at x 760, top 290
    s.objects.push({ kind: 'mover', id: 'mover-x', x: 600, y: 400, w: 120, x1: 500, x2: 700, dir: 1, speed: 1, frozen: false });
    Object.assign(s.actors[1], { x: 700, y: 400, vx: 0, vy: 0, grounded: true, on: 'mover-x' });
    s = tick(s, 120);
    expect(s.actors[1].x).toBeLessThanOrEqual(760 - 15 + 1e-6);
    s = applyAction(s, 'local', { type: 'move', actor: 1, dir: -1 });
    const x = s.actors[1].x; s = tick(s, 10);
    expect(s.actors[1].x).toBeLessThan(x); // free to walk away
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/movers.test.js`
Expected: the dart test FAILS (the dart is removed at x > 1330). The rider test may already pass — if it does, the old "rider sticks in walls" note is obsolete and needs no fix; if it fails, stop and report the failure output (do not invent a fix in this task).

- [ ] **Step 3: Implement**

In `src/enemies.js` `fly`, replace `box.x > 1330` with `box.x > state.width + 50`:

```js
    if (box.x > state.width + 50 || box.x + box.w < -50 || box.y > 700 || box.y + box.h < -50 || blockers.some(b => b.id !== o.id && overlap(box, b))) {
```

(`state` is in scope in `updateEnemies`; check with `grep -n "export function updateEnemies" src/enemies.js`.)

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/enemies.js tests/movers.test.js
git commit -m "Bound projectiles by the courtyard width"
```

---

### Task 3: Move old-layout tests onto a fixed arena

**Files:**
- Modify: `tests/arena.js` (append)
- Modify: `tests/gameplay.test.js` (~line 326), `tests/logic.test.js` (~line 184), `tests/range.test.js` (~line 37), `tests/level-one.test.js` (~line 49)

The current chamber 3 is used as a fixture for the ancient barrier mushroom. Freeze that layout into an arena while the level is still unchanged, so Task 4 can redesign it.

- [ ] **Step 1: Add the arena**

Append to `tests/arena.js` (add `meta` to the `import { setup } from '../src/logic.js'` line):

```js
// The original third courtyard, kept as a fixed test arena: flat ground (y 520) with an ancient barrier mushroom
// grown in the pit at x 600, an empty pit at x 880, a seed at x 330 (Bloom holds one more), and the exit ledge
// (platform-1, y 265) with the moon gate at (1160, 265). Level index 2 keeps `exitNeedsPlant` for fail checks.
export function afterbloomArena(options = {}) {
  const s = setup({ ...options, level: 2 });
  const { growTicks, matureTicks, maxHeight } = meta.plant;
  s.width = 1280;
  s.platforms = [{ x: 0, y: 520, w: 1280, h: 140 }, { x: 1000, y: 265, w: 280, h: 400 }];
  s.objects = [
    { kind: 'seed', id: 'seed-0', x: 330, y: 510, vx: 0, vy: 0, frozen: false, held: null, spawnX: 330, spawnY: 510 },
    { kind: 'plant', id: 'plant-0', pit: 'pit-0', x: 600, base: 520, age: growTicks + matureTicks, height: maxHeight, withered: false, speed: 0, frozen: false, barrier: true },
  ];
  s.pits = [{ id: 'pit-0', x: 600, y: 520, plant: 'plant-0' }, { id: 'pit-1', x: 880, y: 520, plant: null }];
  s.nextPlant = 1; s.nextEnemy = s.objects.length;
  s.actors.forEach((p, i) => Object.assign(p, { x: [190, 265][i], y: 520, spawnX: [190, 265][i], spawnY: 520 }));
  s.checkpoints = [];
  s.pickups = [{ x: 760, y: 430, id: 'frost-0', kind: 'frost', taken: false }, { x: 450, y: 494, id: 'bolt-0', kind: 'bolt', taken: false }];
  s.exit = { x: 1160, y: 265 }; s.shards = [{ x: 880, y: 300, id: 0, taken: false }];
  s.needs = ['withered', 'sproutJump']; s.freezeCharges = 1; s.seeds = 1;
  return s;
}
```

Before relying on it, check it matches the current level exactly: run

```bash
bun -e "import { setup } from './src/logic.js'; import { afterbloomArena } from './tests/arena.js'; const a = JSON.stringify(afterbloomArena()), b = JSON.stringify(setup({ level: 2 })); console.log(a === b ? 'same' : 'DIFF'); if (a !== b) { const A = JSON.parse(a), B = JSON.parse(b); for (const k of Object.keys(B)) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) console.log(k, JSON.stringify(A[k]), JSON.stringify(B[k])); }"
```

Expected: `same`. If keys differ, adjust the arena (not the level) until it prints `same` — e.g. actor fields added upstream (per-actor checkpoints) come from `setup` and should stay as `setup` builds them.

- [ ] **Step 2: Point the tests at it**

- `tests/gameplay.test.js` "a wilting ancient mushroom still counts as hope until it is gone": replace `const s = setup({ level: 2 });` with `const s = afterbloomArena();` and import `afterbloomArena` from `./arena.js` (extend the existing arena import if there is one).
- `tests/logic.test.js` "an ancient barrier tree blocks the path until it withers": replace `let s = setup({ level: 2 });` with `let s = afterbloomArena();`; extend its `./arena.js` import.
- `tests/range.test.js` "courtyard 3: Bloom can wake the ancient mushroom …": replace `const state = setup({ level: 2 });` with `const state = afterbloomArena();`, import it, and rename the test to `'the ancient-mushroom arena: Bloom can wake it from the closest spot the barrier allows'`.
- `tests/level-one.test.js:49`: change `expect(setup({ level: 2 }).width).toBe(1280); // the later courtyards keep their size` to `expect(setup({ level: 3 }).width).toBe(1280); // courtyard 4 keeps the classic size`.
- `tests/task-hints.test.js:139` (`taskHints(setup({ level: 2 }))` is `[]`) stays: chamber 3 has no hints before or after.

Also check `tests/camera-spawn.playtest.js:113` (a Playwright script, not run by `bun test`): read what it asserts about `setup({ level: 2 })`; if it depends on the old layout, switch it to `afterbloomArena()` the same way, otherwise leave it.

- [ ] **Step 3: Run tests**

Run: `bun test`
Expected: PASS (same count as before plus none lost).

- [ ] **Step 4: Commit**

```bash
git add tests/arena.js tests/gameplay.test.js tests/logic.test.js tests/range.test.js tests/level-one.test.js tests/camera-spawn.playtest.js
git commit -m "Keep the old courtyard 3 as a fixed test arena"
```

(Leave `tests/camera-spawn.playtest.js` out of `git add` if it was not changed.)

---

### Task 4: The new chamber 3

**Files:**
- Modify: `src/levels/03-afterbloom.js` (replace contents)
- Create: `tests/level-three.test.js`

- [ ] **Step 1: Write the failing layout tests**

Create `tests/level-three.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/level-three.test.js`
Expected: FAIL (old layout: width 1280, no launchers — `level.enemies` is undefined, so the file may fail at load; that is the expected red).

- [ ] **Step 3: Write the level**

Replace `src/levels/03-afterbloom.js` with:

```js
export default {
  id: 'afterbloom',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber3', music: 'deathKnell' },
  // Wide (3840): three sections left to right.
  width: 3840,
  // Start ground; the high ledge (220 up: only a mushroom gets you there) with a pillar that stops the upper arrow
  // lane before the canyon; the far cliff across the canyon; the exit ledge across the chasm. No floors in between.
  platforms: [
    { x: 0, y: 520, w: 760, h: 140 },
    { x: 760, y: 300, w: 640, h: 340 },
    { x: 1180, y: 160, w: 40, h: 140 },
    { x: 2020, y: 200, w: 480, h: 440 },
    { x: 3400, y: 200, w: 440, h: 440 },
  ],
  spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
  crates: [],
  // Three seeds in hand (the mushroom and two vines) and a spare on the start ground.
  seeds: [{ x: 350, y: 510 }], startSeeds: 3,
  // The mushroom's pit on the start ground; wall pits on the near cliff (vine grows right, 30 below the ledge top)
  // and the far cliff (vine grows left, 50 below its top).
  pits: [{ x: 600, y: 520 }, { x: 1400, y: 330, wall: 1 }, { x: 2020, y: 250, wall: -1 }],
  plants: [],
  // The canyon lift runs between the two vine heights; two movers in opposite phase cross the chasm and meet in the
  // middle (a 30 gap). All three start running.
  movers: [
    { axis: 'y', x: 1660, w: 120, y1: 250, y2: 330, speed: 1, dir: -1 },
    { x1: 2520, x2: 2820, y: 200, w: 120, speed: 1 },
    { x1: 2970, x2: 3270, y: 200, w: 120, speed: 1, dir: -1 },
  ],
  // Two launchers on the left wall fire right across the start: darts at y 350 (pop on the high ledge's face) and
  // y 238 (pop on the pillar). A rider on the mushroom is clear of both with its cap about 175-225 high.
  enemies: [
    { kind: 'launcher', x: 20, y: 370, dir: [1, 0], every: 180 },
    { kind: 'launcher', x: 20, y: 258, dir: [1, 0], every: 180 },
  ],
  checkpoints: [{ x: 820, y: 300 }, { x: 2080, y: 200 }],
  // Freeze stretches the safe band, the vines' window and the movers' meeting; hourglasses on the high ledge and the
  // far cliff. A spare bolt on the high ledge.
  freezeCharges: 1, freezePickups: [{ x: 900, y: 274 }, { x: 2200, y: 174 }],
  bloomPickups: [{ x: 1100, y: 274 }],
  // The high ledge is out of jumping reach without a mushroom (used by fail detection).
  exitNeedsPlant: true,
  exit: { x: 3700, y: 200 }, shards: [{ x: 1720, y: 200 }], need: ['treeLifted', 'moverRide'],
};
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/level-three.test.js && bun test`
Expected: PASS. If a layout assertion fails, fix the **level numbers** (not the test's intent) and note what changed; if the "planted by throws" test cannot find an aim within 24 px, report the best distance and the throw start before changing pit positions. Other suites that used `setup({ level: 2 })` were moved to the arena in Task 3; if any other test now fails, report it rather than weakening it.

- [ ] **Step 5: Commit**

```bash
git add src/levels/03-afterbloom.js tests/level-three.test.js
git commit -m "Chamber 3: arrows, canyon with vines and a lift, twin movers"
```

---

### Task 5: Draw vertical movers

**Files:**
- Modify: `public/render.js` (`mover`, ~line 366)

- [ ] **Step 1: Implement**

In `mover(o, targeted, t)`, the track line uses `o.x1` / `o.x2`, which a vertical mover does not have. Replace that line with:

```js
    if (o.axis === 'y') line(ctx, [[o.x + o.w / 2, o.y1 + 10], [o.x + o.w / 2, o.y2 + 30]], '#b6bea133', 1);
    else line(ctx, [[o.x1 + 6, o.y + 26], [o.x2 + o.w - 6, o.y + 26]], '#b6bea133', 1);
```

- [ ] **Step 2: Check**

Run: `bun test && bun build public/render.js --outdir /tmp/rbuild >/dev/null && echo ok`
Expected: PASS and `ok`.

- [ ] **Step 3: Commit**

```bash
git add public/render.js
git commit -m "Draw the track of a vertical mover"
```

---

### Task 6: Check it in the browser

No commit unless numbers are tuned.

- [ ] Run the game (`bun server.js`), open chamber 3 from the level select, and check each section with both travellers: arrows fire on both lanes and pop at the ledge face and the pillar; the mushroom ride is survivable in the band and the hop reaches the ledge; the near seed can be thrown into the near pit from the ledge (arc preview), the far one from the lift; vines, lift and far vine connect at vine length ~200; the twin movers meet and B drops you at the exit ledge; checkpoints catch falls. Tune numbers in `src/levels/03-afterbloom.js` only if something is unplayable, re-run `bun test`, and commit with "Tune chamber 3".
