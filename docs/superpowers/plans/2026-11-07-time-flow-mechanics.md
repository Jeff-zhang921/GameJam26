# Time-Flow Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the echo / pressure-plate / reversible-tree mechanics with the "every object has its own clock" model from `docs/superpowers/specs/2026-11-07-time-flow-redesign-design.md`.

**Architecture:** All rules stay in the pure reducer `src/logic.js` (`setup` / `validateAction` / `applyAction`). World things live in one `state.objects` list (`plant` / `mover` / `crate` / `seed`) plus `state.pits`. `public/render.js` only draws state; `public/client.js` maps input to actions, picks the auto-target with the exported `targetFor`, and renders HUD / hints / best times. Level layouts are **temporary placeholders** (map design is deferred) — they load and showcase each mechanic but are not tuned for solvability.

**Tech Stack:** Bun (server + `bun test`), vanilla ES modules, Canvas 2D. No dependencies.

**Baseline note:** The patches in Tasks 4–5 were generated against the current working tree, which includes the uncommitted English translation and an editor's whitespace reformat of `client.js` / `render.js` (`catch {}` → `catch { }`). Task 0 commits that baseline so the patches apply cleanly.

## File map

| File | Change |
|---|---|
| `src/logic.js` | Full rewrite: unified objects, plant life chain, Bloom / Still, seeds + pits, movers, sprout spring, limited rewind, clock + hint tracking |
| `tests/logic.test.js` | Full rewrite: 18 mechanic tests |
| `public/strings.js` | Full rewrite: new copy, two-tier hints per level, new errors / flags |
| `public/render.js` | Patch: draw pits, seeds, plants (5 stages), movers, time rings; drop echoes / plates; target comes from client |
| `public/client.js` | Patch: remove echo / reverse input, HUD, two-tier hint + flash, best times, target selection via `targetFor` / `anchor` |
| `public/styles.css` | Patch: tip-card flash animation |

---

### Task 0: Commit the baseline

**Files:** working tree as-is (English translation, spec, this plan, formatter whitespace).

- [ ] **Step 1: Confirm with the user, then commit**

```bash
git add public/ docs/
git commit -m "chore: translate UI to English and add time-flow design docs"
```

- [ ] **Step 2: Confirm the old suite still passes**

Run: `bun test`
Expected: `6 pass, 0 fail`

---

### Task 1: Write the mechanic tests

**Files:**
- Replace: `tests/logic.test.js`

- [ ] **Step 1: Replace the whole file with:**

```js
import { describe, test, expect } from 'bun:test';
import { setup, validateAction, applyAction, isGameOver, viewFor, hintLevel, meta } from '../src/logic.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }
const get = (state, id) => state.objects.find(o => o.id === id);
const STAGE = meta.time.stageTicks;

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
    expect(plant).toMatchObject({ stage: 0, speed: 0, x: 600 });
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
    let s = step(planted(), STAGE * 2);
    expect(s.objects.find(o => o.kind === 'plant')).toMatchObject({ stage: 0, progress: 0 });
  });

  test('bloom wakes a plant, which then ages one stage per stageTicks', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    expect(s.objects.find(o => o.kind === 'plant').speed).toBe(1);
    s = step(s, STAGE);
    expect(s.objects.find(o => o.kind === 'plant').stage).toBe(1);
  });

  test('blooming an awake plant skips straight to the next stage', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = step(s, 100);
    s = action(s, { type: 'ability', actor: 1 });
    expect(s.objects.find(o => o.kind === 'plant')).toMatchObject({ stage: 1, progress: 0, speed: 1 });
  });

  test('a withered plant vanishes, frees its pit and drops its rider', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    for (let i = 0; i < 3; i++) s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 120);
    const plant = s.objects.find(o => o.kind === 'plant');
    expect(plant.stage).toBe(3);
    s.actors[0].x = plant.x; s.actors[0].y = plant.base - plant.height; s.actors[0].on = plant.id;
    s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 30);
    expect(s.actors[0].on).toBe(plant.id);
    s = action(s, { type: 'ability', actor: 1 });
    expect(s.objects.some(o => o.kind === 'plant')).toBe(false);
    expect(s.pits[0].plant).toBe(null);
    s = step(s, 5);
    expect(s.actors[0].grounded).toBe(false);
  });

  test('growing from sapling to grown lifts the rider', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 40);
    const plant = s.objects.find(o => o.kind === 'plant');
    s.actors[0].x = plant.x; s.actors[0].y = plant.base - plant.height; s.actors[0].on = plant.id;
    s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 90);
    expect(s.actors[0].y).toBeCloseTo(540 - 235, 5);
    expect(s.flags.treeLifted).toBe(true);
  });

  test('jumping from a sprout goes higher than jumping from the ground', () => {
    const apex = s => { let top = s.actors[0].y; for (let i = 0; i < 60; i++) { s = step(s); top = Math.min(top, s.actors[0].y); } return top; };
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 20);
    const plant = s.objects.find(o => o.kind === 'plant');
    s.actors[0].x = plant.x; s.actors[0].y = plant.base - plant.height; s.actors[0].on = plant.id;
    s = step(s);
    const springRise = s.actors[0].y - apex(action(s, { type: 'jump', actor: 0 }));
    const ground = setup({ level: 1 });
    const groundRise = ground.actors[0].y - apex(action(ground, { type: 'jump', actor: 0 }));
    expect(springRise).toBeGreaterThan(groundRise * 1.4);
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

  test('freezing a plant mid-growth stops both its clock and its height', () => {
    let s = action(planted(), { type: 'ability', actor: 1 });
    s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 });
    s = step(s, 10);
    s = action(s, { type: 'ability', actor: 0 });
    const frozen = { ...s.objects.find(o => o.kind === 'plant') };
    s = step(s, STAGE * 2);
    expect(s.objects.find(o => o.kind === 'plant')).toMatchObject({ stage: frozen.stage, progress: frozen.progress, height: frozen.height });
    expect(validateAction(s, 'local', { type: 'ability', actor: 1 }).error).toBe('heldByStill');
    s = action(s, { type: 'ability', actor: 0 });
    s = step(s, 10);
    expect(s.objects.find(o => o.kind === 'plant').height).toBeGreaterThan(frozen.height);
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
    for (let i = 0; i < meta.time.maxGear; i++) s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
    expect(get(s, 'mover-0').speed).toBe(meta.time.maxGear);
    expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'mover-0' }).error).toBe('moverMax');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test`
Expected: FAIL — `SyntaxError: Export named 'hintLevel' not found` (the old `logic.js` has no `hintLevel` / `objects`).

---

### Task 2: Rewrite the rules engine

**Files:**
- Replace: `src/logic.js`

Key behaviours (all covered by Task 1 tests):
- Plants: `stage` 0–4 = seed, sprout, sapling, grown, withered; past 4 the plant is removed and its pit freed. `speed` 0 = untouched. `progress` advances `speed / stageTicks` per tick (with a `1e-9` tolerance against float drift).
- Bloom on a still plant sets `speed = 1`; on an awake plant calls `advance()` (skip a stage); on a mover raises `speed` up to `maxGear`. Bloom on anything frozen → `heldByStill`.
- Still toggles `frozen` on plants, movers and loose crates; frozen plants keep `height`, frozen crates keep position and velocity.
- `grab` (E): pick up the nearest crate or seed; a carried crate is thrown; a carried seed is planted into an empty pit within `pitReach` px, otherwise set down at the actor's feet.
- Sprout surfaces carry `spring: true`; jumping from one uses `springJump` (≈1.5× height) and sets `sproutJump`.
- Rewind restores only `objects` + `pits` from the oldest snapshot (~3 s), empties hands, drops items that were carried in the snapshot at the carrier's current feet, and decrements `rewindsLeft` (3 per chamber).
- `started` flips on first move / jump; `elapsed` counts play ticks after that. `lastProgressTick` updates when a new need is met; `hintLevel()` returns 1 after `hintTicks` (90 s) without progress.

- [ ] **Step 1: Replace the whole file with:**

```js
export const meta = {
  name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
  controls: { speed: 4.2, jump: -12.5, springJump: -15.3, gravity: 0.48, coyote: 7, jumpBuffer: 7, range: 420, reach: 95, pitReach: 50 },
  time: { stageTicks: 480, moverSpeed: 1, maxGear: 3, rewinds: 3, hintTicks: 90 * 60 },
};

export const STAGES = ['seed', 'sprout', 'sapling', 'grown', 'withered'];
const HEIGHTS = [6, 30, 80, 235, 200];
const CANOPY = [0, 60, 110, 138, 50];
const STILL = 0, BLOOM = 1;

const LEVELS = [
  {
    id: 'stillwater',
    platforms: [{ x: 0, y: 520, w: 435, h: 160 }, { x: 795, y: 430, w: 485, h: 220 }],
    spawn: [{ x: 180, y: 520 }, { x: 250, y: 520 }],
    crates: [{ x: 350, y: 493 }], seeds: [], pits: [], plants: [], movers: [],
    exit: { x: 1160, y: 430 }, shards: [{ x: 620, y: 300 }], need: ['frozenTouched'],
  },
  {
    id: 'rootrise',
    platforms: [{ x: 0, y: 540, w: 1280, h: 120 }, { x: 760, y: 290, w: 520, h: 360 }],
    spawn: [{ x: 195, y: 540 }, { x: 270, y: 540 }],
    crates: [], seeds: [{ x: 90, y: 530 }, { x: 380, y: 530 }], pits: [{ x: 600, y: 540 }], plants: [], movers: [],
    exit: { x: 1160, y: 290 }, shards: [{ x: 600, y: 250 }], need: ['treeLifted'],
  },
  {
    id: 'afterbloom',
    platforms: [{ x: 0, y: 520, w: 1280, h: 140 }, { x: 1000, y: 265, w: 280, h: 400 }],
    spawn: [{ x: 190, y: 520 }, { x: 265, y: 520 }],
    crates: [], seeds: [{ x: 330, y: 510 }], pits: [{ x: 600, y: 520 }, { x: 880, y: 520 }],
    plants: [{ pit: 0, stage: 3, barrier: true }], movers: [],
    exit: { x: 1160, y: 265 }, shards: [{ x: 880, y: 300 }], need: ['withered', 'sproutJump'],
  },
  {
    id: 'withtime',
    platforms: [{ x: 0, y: 520, w: 520, h: 160 }, { x: 1040, y: 300, w: 240, h: 400 }],
    spawn: [{ x: 250, y: 520 }, { x: 170, y: 520 }],
    crates: [{ x: 300, y: 493 }], seeds: [{ x: 110, y: 510 }, { x: 150, y: 510 }, { x: 480, y: 510 }],
    pits: [{ x: 400, y: 520 }, { x: 60, y: 520 }], plants: [],
    movers: [{ x1: 540, x2: 640, y: 290, w: 120 }],
    exit: { x: 1160, y: 300 }, shards: [{ x: 400, y: 240 }], need: ['treeLifted', 'moverRide', 'frozenTouched'],
  },
];

const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rectOverlap = (a, b) => a.x + a.w > b.x && a.x < b.x + b.w && a.y + a.h > b.y && a.y < b.y + b.h;
const find = (state, id) => state.objects.find(o => o.id === id);
const free = o => o.held === undefined || o.held === null;

export function anchor(o) {
  if (o.kind === 'plant') return { x: o.x, y: o.base - o.height / 2 };
  if (o.kind === 'mover') return { x: o.x + o.w / 2, y: o.y + 10 };
  return { x: o.x, y: o.y };
}

function makePlant(id, pit, stage = 0, barrier = false) {
  pit.plant = id;
  return { kind: 'plant', id, pit: pit.id, x: pit.x, base: pit.y, stage, progress: 0, speed: 0, frozen: false, height: HEIGHTS[stage], barrier };
}

function makeLevel(index, players, unlocked, totalShards, collected = [false, false, false, false]) {
  const level = LEVELS[index];
  const pits = level.pits.map((p, i) => ({ id: `pit-${i}`, x: p.x, y: p.y, plant: null }));
  const objects = [
    ...level.crates.map((p, i) => ({ kind: 'crate', id: `crate-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, frozen: false, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.seeds.map((p, i) => ({ kind: 'seed', id: `seed-${i}`, x: p.x, y: p.y, vx: 0, vy: 0, held: null, spawnX: p.x, spawnY: p.y })),
    ...level.movers.map((p, i) => ({ kind: 'mover', id: `mover-${i}`, x: p.x1, y: p.y, w: p.w, x1: p.x1, x2: p.x2, dir: 1, speed: 0, frozen: false })),
    ...level.plants.map((p, i) => makePlant(`plant-${i}`, pits[p.pit], p.stage, p.barrier)),
  ];
  return {
    level: index, levelId: level.id, unlocked, totalShards, collected: clone(collected), tick: 0, status: 'playing', active: 0,
    playerIds: players, width: 1280, height: 640,
    actors: level.spawn.map((p, i) => ({ id: i, x: p.x, y: p.y, vx: 0, vy: 0, facing: 1, grounded: true, on: 'ground', coyote: 7, jumpBuffer: 0, move: 0, carrying: null, spawnX: p.x, spawnY: p.y })),
    platforms: clone(level.platforms), objects, pits, nextPlant: level.plants.length,
    exit: clone(level.exit), shards: level.shards.map((p, i) => ({ ...p, id: i, taken: false })),
    flags: { frozenTouched: false, treeLifted: false, withered: false, sproutJump: false, moverRide: false },
    needs: clone(level.need), needsDone: 0, events: [], eventSeq: 0, history: [], rewindsLeft: meta.time.rewinds,
    started: false, elapsed: 0, lastProgressTick: 0, falls: 0,
  };
}

export function setup(options = {}) {
  const players = Array.isArray(options.players) && options.players.length ? options.players.slice(0, 2).map(p => typeof p === 'string' ? p : p.id) : ['local'];
  const level = Number.isInteger(options.level) ? Math.max(0, Math.min(3, options.level)) : 0;
  return makeLevel(level, players, level, 0);
}

function actorAllowed(state, playerId, actor) {
  const index = state.playerIds.indexOf(playerId);
  return index >= 0 && (state.playerIds.length === 1 || actor === index);
}

export function targetFor(state, actor, action = {}) {
  const p = state.actors[actor];
  const kinds = actor === STILL ? ['plant', 'mover', 'crate'] : ['plant', 'mover'];
  const candidates = state.objects.filter(o => kinds.includes(o.kind) && free(o) && dist(p, anchor(o)) <= meta.controls.range);
  if (action.target) return candidates.find(o => o.id === action.target);
  return candidates.sort((a, b) => dist(p, anchor(a)) - dist(p, anchor(b)))[0];
}

function pickable(state, p) {
  return state.objects.filter(o => (o.kind === 'crate' || o.kind === 'seed') && o.held === null && dist(p, o) < meta.controls.reach)
    .sort((a, b) => dist(p, a) - dist(p, b));
}

export function validateAction(state, playerId, action) {
  const no = error => ({ valid: false, error });
  if (!state || !action || typeof action !== 'object' || Array.isArray(action)) return no('invalid');
  if (!state.playerIds.includes(playerId)) return no('player');
  if (['tick', 'switch', 'pause', 'restart', 'rewind', 'next', 'level'].includes(action.type)) {
    if (action.type === 'tick' && playerId !== state.playerIds[0]) return no('host');
    if (action.type === 'next' && state.status !== 'won') return no('unfinished');
    if (action.type === 'level' && (!Number.isInteger(action.level) || action.level < 0 || action.level > state.unlocked || action.level > 3)) return no('locked');
    if (action.type === 'rewind' && state.rewindsLeft <= 0) return no('noRewinds');
    if (action.type === 'rewind' && !state.history.length) return no('history');
    return { valid: true };
  }
  if (state.status !== 'playing') return no('paused');
  if (!Number.isInteger(action.actor) || action.actor < 0 || action.actor > 1 || !actorAllowed(state, playerId, action.actor)) return no('role');
  if (action.type === 'move') return [-1, 0, 1].includes(action.dir) ? { valid: true } : no('invalid');
  if (action.type === 'jump') return { valid: true };
  if (action.type === 'grab') {
    const p = state.actors[action.actor];
    return p.carrying !== null || pickable(state, p).length ? { valid: true } : no('grabRange');
  }
  if (action.type === 'ability') {
    if (action.target !== undefined && typeof action.target !== 'string') return no('invalid');
    const target = targetFor(state, action.actor, action);
    if (!target) return no(action.actor === STILL ? 'freezeRange' : 'bloomRange');
    if (action.actor === BLOOM && target.frozen) return no('heldByStill');
    if (action.actor === BLOOM && target.kind === 'mover' && target.speed >= meta.time.maxGear) return no('moverMax');
    return { valid: true };
  }
  return no('invalid');
}

function event(state, kind, x, y) {
  state.events.push({ id: ++state.eventSeq, kind, x, y, tick: state.tick });
  if (state.events.length > 10) state.events.shift();
}

function advance(state, plant) {
  plant.stage++; plant.progress = 0;
  if (plant.barrier && plant.stage >= 4) state.flags.withered = true;
  if (plant.stage >= STAGES.length) {
    state.objects = state.objects.filter(o => o !== plant);
    state.pits.find(p => p.id === plant.pit).plant = null;
    event(state, 'vanish', plant.x, plant.base - plant.height);
  } else event(state, 'grow', plant.x, plant.base - plant.height);
}

function surfaces(state) {
  const result = state.platforms.map((p, i) => ({ ...p, id: `platform-${i}` }));
  for (const o of state.objects) {
    if (o.kind === 'crate' && o.held === null) result.push({ id: o.id, x: o.x - 27, y: o.y - 27, w: 54, h: 54 });
    if (o.kind === 'mover') result.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: 20 });
    if (o.kind === 'plant' && o.stage > 0) result.push({ id: o.id, x: o.x - CANOPY[o.stage] / 2, y: o.base - o.height, w: CANOPY[o.stage], h: 16, spring: o.stage === 1 });
  }
  return result;
}

function remember(state) {
  if (state.tick % 10 !== 0) return;
  state.history.push({ objects: clone(state.objects), pits: clone(state.pits), tick: state.tick });
  if (state.history.length > 19) state.history.shift();
}

function ageObjects(state) {
  for (const o of [...state.objects]) {
    if (o.kind === 'plant') {
      if (!o.frozen && o.speed > 0) {
        o.progress += o.speed / meta.time.stageTicks;
        if (o.progress >= 1 - 1e-9) advance(state, o);
        if (!state.objects.includes(o)) continue;
      }
      const before = o.height;
      if (!o.frozen) o.height += Math.sign(HEIGHTS[o.stage] - o.height) * Math.min(Math.abs(HEIGHTS[o.stage] - o.height), 2.2);
      const rise = o.height - before;
      if (rise) for (const p of state.actors) if (p.on === o.id && p.grounded) {
        p.y -= rise;
        if (rise > 0.1) state.flags.treeLifted = true;
      }
    }
    if (o.kind === 'mover' && !o.frozen && o.speed > 0) {
      const before = o.x;
      o.x += o.dir * o.speed * meta.time.moverSpeed;
      if (o.x >= o.x2) { o.x = o.x2; o.dir = -1; } else if (o.x <= o.x1) { o.x = o.x1; o.dir = 1; }
      const dx = o.x - before;
      for (const p of state.actors) if (p.on === o.id && p.grounded && dx) { p.x += dx; state.flags.moverRide = true; }
    }
  }
}

function moveItems(state) {
  const floors = [...state.platforms, ...state.objects.filter(o => o.kind === 'mover')];
  for (const o of state.objects) {
    if (o.kind !== 'crate' && o.kind !== 'seed') continue;
    const crate = o.kind === 'crate', half = crate ? 27 : 10;
    if (o.held !== null) {
      const p = state.actors[o.held];
      o.x = p.x + p.facing * (crate ? 37 : 22); o.y = p.y - (crate ? 53 : 40); o.vx = 0; o.vy = 0;
      continue;
    }
    if (o.frozen) continue;
    const previous = o.y + half;
    o.vy += 0.3; o.x += o.vx; o.y += o.vy;
    for (const f of floors) if (o.vy >= 0 && previous <= f.y + 1 && o.y + half >= f.y && o.x + half > f.x && o.x - half < f.x + f.w) {
      o.y = f.y - half; o.vy = 0; o.vx *= 0.88;
    }
    if (o.y > 720 || o.x < 20 || o.x > 1260) { o.x = o.spawnX; o.y = o.spawnY; o.vx = 0; o.vy = 0; event(state, 'return', o.x, o.y); }
  }
}

function moveActors(state) {
  const solid = surfaces(state);
  for (const p of state.actors) {
    if (p.grounded) p.coyote = meta.controls.coyote; else p.coyote--;
    if (p.jumpBuffer > 0) p.jumpBuffer--;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      const spring = p.grounded && solid.find(f => f.id === p.on)?.spring;
      p.vy = spring ? meta.controls.springJump : meta.controls.jump; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0;
      if (spring) state.flags.sproutJump = true;
      event(state, 'jump', p.x, p.y);
    }
    p.vx = p.move * meta.controls.speed;
    if (p.move) p.facing = p.move;
    const oldX = p.x;
    p.x = Math.max(22, Math.min(1258, p.x + p.vx));
    const body = () => ({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 });
    for (const f of state.platforms) if (rectOverlap(body(), f) && p.y > f.y + 9) p.x = oldX;
    for (const o of state.objects) if (o.kind === 'plant' && o.barrier && o.stage < 4 && rectOverlap(body(), { x: o.x - 42, y: o.base - o.height, w: 84, h: o.height })) p.x = oldX;
    const previousY = p.y;
    p.vy += meta.controls.gravity;
    p.y += p.vy;
    p.grounded = false; p.on = null;
    for (const f of solid) {
      if (f.id === p.carrying) continue;
      if (p.vy >= 0 && previousY <= f.y + 5 && p.y >= f.y && p.x + 15 > f.x && p.x - 15 < f.x + f.w) {
        p.y = f.y; p.vy = 0; p.grounded = true; p.on = f.id;
        const o = find(state, f.id);
        if (o?.kind === 'crate' && o.frozen) state.flags.frozenTouched = true;
      }
    }
    if (p.y > 710) {
      p.x = p.spawnX; p.y = p.spawnY; p.vy = 0; p.grounded = true; p.on = 'ground'; state.falls++;
      event(state, 'return', p.x, p.y);
    }
    for (const shard of state.shards) if (!shard.taken && dist({ x: p.x, y: p.y - 28 }, shard) < 42) {
      shard.taken = true; event(state, 'shard', shard.x, shard.y);
    }
  }
}

function tick(state) {
  remember(state);
  state.tick++;
  if (!state.started && state.actors.some(p => p.move || p.jumpBuffer)) state.started = true;
  if (state.started) state.elapsed++;
  ageObjects(state);
  moveItems(state);
  moveActors(state);
  const done = state.needs.filter(key => state.flags[key]).length;
  if (done > state.needsDone) { state.needsDone = done; state.lastProgressTick = state.elapsed; }
  if (done === state.needs.length && state.actors.some(p => Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55)) {
    state.status = 'won'; state.unlocked = Math.max(state.unlocked, Math.min(3, state.level + 1));
    if (state.shards.some(s => s.taken)) state.collected[state.level] = true;
    state.totalShards = state.collected.filter(Boolean).length;
    for (const p of state.actors) p.move = 0;
    event(state, 'win', state.exit.x, state.exit.y - 45);
  }
}

export function applyAction(state, playerId, action) {
  if (!validateAction(state, playerId, action).valid) return state;
  if (action.type === 'restart') return makeLevel(state.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'level') return makeLevel(action.level, state.playerIds, state.unlocked, state.totalShards, state.collected);
  if (action.type === 'next') return makeLevel((state.level + 1) % 4, state.playerIds, state.unlocked, state.totalShards, state.collected);
  const s = clone(state);
  if (action.type === 'tick') { if (s.status === 'playing') tick(s); return s; }
  if (action.type === 'pause') { if (s.status !== 'won') s.status = s.status === 'paused' ? 'playing' : 'paused'; for (const p of s.actors) p.move = 0; return s; }
  if (action.type === 'switch') { s.active = 1 - s.active; return s; }
  if (action.type === 'rewind') {
    const frame = s.history[0];
    s.objects = clone(frame.objects); s.pits = clone(frame.pits); s.history = []; s.rewindsLeft--; s.status = 'playing';
    for (const p of s.actors) { p.carrying = null; p.move = 0; }
    for (const o of s.objects) if (!free(o)) {
      const p = s.actors[o.held];
      o.held = null; o.x = p.x + p.facing * 30; o.y = p.y - (o.kind === 'crate' ? 27 : 10); o.vx = 0; o.vy = 0;
    }
    event(s, 'rewind', s.actors[s.active].x, s.actors[s.active].y - 30);
    return s;
  }
  const p = s.actors[action.actor];
  if (action.type === 'move') p.move = action.dir;
  if (action.type === 'jump') p.jumpBuffer = meta.controls.jumpBuffer;
  if (action.type === 'grab') {
    if (p.carrying !== null) {
      const o = find(s, p.carrying);
      p.carrying = null; o.held = null;
      if (o.kind === 'crate') {
        o.frozen = false; o.x = p.x + p.facing * 48; o.y = p.y - 48; o.vx = p.facing * 6.8; o.vy = -6;
        event(s, 'throw', o.x, o.y);
      } else {
        const pit = s.pits.filter(t => t.plant === null && Math.abs(t.x - p.x) <= meta.controls.pitReach && Math.abs(t.y - p.y) <= 30)
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        if (pit) {
          s.objects = s.objects.filter(x => x !== o);
          s.objects.push(makePlant(`plant-${s.nextPlant++}`, pit));
          event(s, 'plant', pit.x, pit.y - 10);
        } else {
          o.x = p.x + p.facing * 22; o.y = p.y - 10; o.vx = 0; o.vy = 0;
          event(s, 'drop', o.x, o.y);
        }
      }
    } else {
      const o = pickable(s, p)[0];
      o.held = action.actor; if (o.kind === 'crate') o.frozen = false; p.carrying = o.id;
      event(s, 'grab', o.x, o.y);
    }
  }
  if (action.type === 'ability') {
    const o = targetFor(s, action.actor, action);
    if (action.actor === STILL) { o.frozen = !o.frozen; event(s, o.frozen ? 'freeze' : 'unfreeze', anchor(o).x, anchor(o).y); }
    else if (o.kind === 'mover') { o.speed++; event(s, 'grow', anchor(o).x, o.y); }
    else if (o.speed === 0) { o.speed = 1; event(s, 'wake', o.x, o.base - o.height); }
    else advance(s, o);
  }
  return s;
}

export function hintLevel(state) { return state.elapsed - state.lastProgressTick >= meta.time.hintTicks ? 1 : 0; }
export function isGameOver(state) { return state.status === 'won' ? { winner: 'together', level: state.level, complete: state.level === 3 } : null; }
export function viewFor(state, playerId) { return state.playerIds.includes(playerId) ? clone(state) : null; }
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun test`
Expected: `18 pass, 0 fail`

- [ ] **Step 3: Commit**

```bash
git add src/logic.js tests/logic.test.js
git commit -m "feat: per-object time flow with seeds, pits, movers and limited rewind"
```

Note: the browser UI is broken between this commit and Task 5 (client still reads `state.crates` / `state.trees`).

---

### Task 3: Rewrite the copy

**Files:**
- Replace: `public/strings.js`

- [ ] **Step 1: Replace the whole file with:**

```js
export const S = {
  title: 'Moonclock', english: 'CLOCKBLOOM', subtitle: 'Two travelers, one borrowed moment.', studio: 'A cooperative adventure in time',
  start: 'Let Time Bloom', continue: 'Continue Journey', chapter: 'CHAMBER', chapters: 'Four Courtyards',
  intro: 'In a forgotten greenhouse, nothing moves until you touch it.', introBody: 'Bloom sets time flowing and hurries it along. Still holds any moment in place. One clock, two hands.',
  solo: 'Solo · Switch Roles', coop: 'Local Co-op', mode: 'Play Mode',
  roleNames: ['Stillkeeper', 'Bloomkeeper'], roleLabels: ['STILL', 'BLOOM'], roleDescriptions: ['Freezes anything in time — even midair — until released.', 'Starts an object\'s clock, and hurries it onward.'],
  current: 'Active', switchRole: 'Switch Role', ability: ['Freeze / Release', 'Wake / Hasten'],
  move: 'Move', jump: 'Jump', grab: 'Pick Up / Throw / Plant', rewind: 'Rewind 3s', restart: 'Reset Courtyard',
  pause: 'Pause', resume: 'Resume', help: 'Controls', settings: 'Settings', sound: 'Sound', motion: 'Reduce Motion', on: 'On', off: 'Off', close: 'Close',
  objective: 'Current Goal', tip: 'Courtyard Whisper', memory: 'Time Shards', next: 'Onward to the Next Courtyard', replay: 'Play Again',
  seeds: 'Seeds', rewinds: 'Rewinds', time: 'Time', best: 'Best', clear: 'Cleared in',
  complete: 'Time flows once more.', completeBody: 'Every moment you borrowed grew into a path that led you to each other.',
  chamberComplete: 'You rewrote this moment.', chamberCompleteBody: 'The courtyard bells draw a little closer.',
  helpTitle: 'Make Time Your Tool', helpBody: 'Nothing ages until Bloom wakes it, and once awake it never stops on its own — only Still can hold it. Plants grow seed → sprout → sapling → grown → withered, then vanish.',
  keys: [['A / D', 'Move'], ['Space', 'Jump (higher from a sprout)'], ['E', 'Pick up, throw a crate, plant a seed in a pit, or set a seed down'], ['F', "Use the active role's ability"], ['Tab', 'Switch between the two roles'], ['R', 'Rewind the world about three seconds (limited)'], ['Esc', 'Pause / Resume']],
  coopKeys: 'In co-op, the Stillkeeper uses A / D, W, E, F; the Bloomkeeper uses ← / →, ↑, Enter, L.',
  targetFreeze: 'Freeze · F', targetRelease: 'Release · F', targetWake: 'Wake · F', targetHasten: 'Hasten · F',
  plantStages: ['Seed', 'Sprout', 'Sapling', 'Grown', 'Withered'], gateClosed: 'The moon gate awaits an answer', gateOpen: 'The moon gate is awake',
  shard: 'Optional time shard', touch: 'Tap an object to target it',
  saved: 'Your journey has been saved', focus: 'The courtyard is waiting for you.', connected: 'Local Adventure',
  levels: [
    { name: 'A Moment Held', en: 'THE STILL MOMENT', goal: 'Use a frozen crate to cross the broken bridge.', lesson: 'Turn a fall into a stair.',
      hints: ['Throw the crate toward the gap and freeze it in the air.', 'Stand near the edge, press E to throw right, wait a beat, then press F as Still. Jump onto the crate, then leap across.'] },
    { name: 'Rising Rings', en: 'WHERE ROOTS RISE', goal: 'Let a tree lift you to the high ledge.', lesson: 'Some paths must be grown.',
      hints: ['Seeds only grow in pits. Carry one over and plant it.', 'Plant a seed in the pit, wake it with Bloom, and stand on the sprout. Hasten it to grown, then freeze it with Still before it withers.'] },
    { name: 'Past the Prime', en: 'AFTER THE BLOOM', goal: 'Age the ancient tree out of your way, then spring up the cliff.', lesson: 'An ending is also a beginning.',
      hints: ['A withered trunk no longer blocks the path.', 'Hasten the ancient tree until it withers. Plant the seed in the far pit, grow it to a sprout, and jump from the sprout to reach the cliff.'] },
    { name: 'Walking with Time', en: 'WITH TIME', goal: 'Grow, ride and freeze your way across the last rift.', lesson: 'Every clock you start is a promise.',
      hints: ['Some platforms are waiting for time, too.', 'Carry the crate up a grown tree, step onto the platform and have Bloom wake it. At the far end, throw the crate, freeze it, and hop across.'] },
  ],
  flags: { frozenTouched: 'Stand on a frozen crate', treeLifted: 'Ride a growing tree', withered: 'Let the ancient tree wither', sproutJump: 'Spring from a sprout', moverRide: 'Ride a moving platform' },
  errors: { invalid: "That action can't be done right now.", player: "This timekeeper hasn't entered the courtyard yet.", role: 'That ability belongs to the other timekeeper.', host: 'Your partner is advancing time.', unfinished: "Wake this courtyard's moon gate first.", locked: "This courtyard hasn't awakened yet.", history: 'Take a few more steps before borrowing back the past.', noRewinds: 'No rewinds left in this courtyard. Reset to start over.', paused: 'Let time flow again first.', grabRange: 'Get closer to a crate or seed, then press E.', freezeRange: 'Get near a plant, platform or loose crate, then try freezing it.', bloomRange: 'Walk up to a planted seed, tree or platform to wake it.', heldByStill: 'Still is holding this one in time.', moverMax: "It's already moving as fast as it can." },
};
```

- [ ] **Step 2: Check nothing references removed keys**

Run: `grep -nE "S\.(echo|reverse|plate|echoTip|treeStages|targetDead|targetGrow|hints)\b" public/*.js`
Expected: matches only in `public/client.js` / `public/render.js` (fixed by Tasks 4–5).

---

### Task 4: Draw the new world objects

**Files:**
- Modify: `public/render.js` (replaces `tree()` with `timeRing` / `pit` / `seed` / `plant` / `mover`, simplifies `door` readiness, rewrites the object part of `draw()`)

- [ ] **Step 1: Save this patch as `/tmp/render.patch` and apply it**

````diff
--- a/public/render.js
+++ b/public/render.js
@@ -80,25 +80,49 @@
     if (targeted) { const a = 32; ctx.strokeStyle = cyan; ctx.lineWidth = 1.5; for (const [x, y] of [[-a, -a], [a, -a], [-a, a], [a, a]]) line(ctx, [[x, y - Math.sign(y) * 8], [x, y], [x - Math.sign(x) * 8, y]], cyan); }
     ctx.restore();
   }
-  function tree(tree, targeted, t) {
-    const h = tree.height; const x = tree.x, y = tree.base; const dead = tree.age === 4;
-    if (h < 36 && !dead) { line(ctx, [[x, y], [x, y - h]], '#c5bb80', 3); ellipse(ctx, x - 10, y - h + 5, 13, 5, .6, '#b7bd80'); ellipse(ctx, x + 10, y - h, 13, 5, -.6, '#d2c483'); circle(ctx, x, y - h + 2, 3, gold); }
+  function timeRing(x, y, r, o, t) {
+    if (o.frozen) { glow(ctx, x, y, r * 1.7, '#9de3e527'); circle(ctx, x, y, r + Math.sin(t * .002) * 2, null, '#a1e3e570'); return; }
+    if (!o.speed) return;
+    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .0012 * o.speed); ctx.setLineDash([6, 9]); circle(ctx, 0, 0, r, null, '#e1c68a88', 1.5); ctx.restore();
+  }
+  function pit(p) {
+    ellipse(ctx, p.x, p.y - 1, 30, 7, 0, '#2a3d33'); ellipse(ctx, p.x, p.y - 3, 24, 4, 0, p.plant ? '#4d5a41' : '#1b2a25');
+    if (!p.plant) for (let i = 0; i < 4; i++) circle(ctx, p.x - 15 + i * 10, p.y - 6 - (i % 2) * 2, 1.5, '#6f7d5a');
+  }
+  function seed(o, t) {
+    ctx.save(); ctx.translate(o.x, o.y); glow(ctx, 0, 0, 26, '#e1c68a22');
+    ellipse(ctx, 0, 0, 7, 10, .5, '#b39a5c'); ellipse(ctx, -1.5, -2, 3, 5, .5, '#e6d39a'); line(ctx, [[3, -7], [6, -12 + Math.sin(t * .004)]], '#9fbf7f', 1.5);
+    ctx.restore();
+  }
+  function plant(o, targeted, t) {
+    const h = o.height, x = o.x, y = o.base, stage = o.stage, dead = stage === 4;
+    timeRing(x, y - h / 2, Math.max(22, h / 2 + 12), o, t);
+    if (stage === 0) { ellipse(ctx, x, y - 5, 6, 8, .4, '#b39a5c'); ellipse(ctx, x - 1, y - 7, 2.5, 4, .4, '#e6d39a'); }
+    else if (stage === 1) { line(ctx, [[x, y], [x, y - h]], '#c5bb80', 3); ellipse(ctx, x - 10, y - h + 5, 13, 5, .6, '#b7bd80'); ellipse(ctx, x + 10, y - h, 13, 5, -.6, '#d2c483'); circle(ctx, x, y - h + 2, 3, gold); }
     else {
-      const trunkTop = y - h + (dead ? -35 : 28);
+      const crown = stage === 2 ? 55 : 77, trunkTop = y - h + (dead ? 0 : 28);
       ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.bezierCurveTo(x - 8, y - h * .45, x - 18, trunkTop + 30, x - 3, trunkTop); ctx.lineTo(x + 8, trunkTop); ctx.bezierCurveTo(x + 2, y - h * .45, x + 16, y - 20, x + 21, y); ctx.fillStyle = dead ? '#7c7c63' : '#a8a276'; ctx.fill();
       line(ctx, [[x - 3, y], [x + 2, y - h * .4], [x - 4, trunkTop]], '#d3bd836b', 1.5);
-      for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1; const yy = y - h * (.35 + i * .075); const len = 25 + i * 6; ctx.beginPath(); ctx.moveTo(x, yy + 25); ctx.quadraticCurveTo(x + side * len * .5, yy, x + side * len, yy - 22); ctx.strokeStyle = dead ? '#949277' : '#ada875'; ctx.lineWidth = 5 - i * .3; ctx.stroke(); }
+      for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1; const yy = y - h * (.35 + i * .075); const len = (25 + i * 6) * crown / 77; ctx.beginPath(); ctx.moveTo(x, yy + 25); ctx.quadraticCurveTo(x + side * len * .5, yy, x + side * len, yy - 22); ctx.strokeStyle = dead ? '#949277' : '#ada875'; ctx.lineWidth = 5 - i * .3; ctx.stroke(); }
       if (!dead) {
-        glow(ctx, x, y - h + 15, 100, '#d3bd7920');
-        for (let i = 0; i < 67; i++) { const a = i * 2.399; const r = Math.sqrt(i / 67); const xx = x + Math.cos(a) * r * 77, yy = y - h + 12 + Math.sin(a) * r * 34; ellipse(ctx, xx, yy, 9 + i % 5, 4 + i % 3, Math.sin(a) * .7, ['#9dba81', '#bbc58a', '#d5c686', '#7b9c76', '#c6bd79'][i % 5]); }
-        line(ctx, [[x - 64, y - h + 3], [x + 64, y - h + 3]], '#efdfac77');
-      } else { ellipse(ctx, x, y - 6, 28, 7, 0, '#6a7966'); for (let i = 0; i < 5; i++) ellipse(ctx, x + Math.sin(i * 3) * 43, y - 4, 5, 2, i, '#b3a475'); }
+        glow(ctx, x, y - h + 15, crown + 23, '#d3bd7920');
+        for (let i = 0; i < 67; i++) { const a = i * 2.399; const r = Math.sqrt(i / 67); const xx = x + Math.cos(a) * r * crown, yy = y - h + 12 + Math.sin(a) * r * crown * .44; ellipse(ctx, xx, yy, 9 + i % 5, 4 + i % 3, Math.sin(a) * .7, ['#9dba81', '#bbc58a', '#d5c686', '#7b9c76', '#c6bd79'][i % 5]); }
+        line(ctx, [[x - crown + 13, y - h + 3], [x + crown - 13, y - h + 3]], '#efdfac77');
+      } else { ellipse(ctx, x, y - h, 25, 5, 0, '#8d8a6c'); for (let i = 0; i < 5; i++) ellipse(ctx, x + Math.sin(i * 3) * 43, y - 4, 5, 2, i, '#b3a475'); }
     }
     if (targeted) { circle(ctx, x, y - h - 16, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, x, y - h - 16, 5, gold); }
-    ctx.font = '10px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cbd3b296'; ctx.fillText(S.treeStages[tree.age], x, y + 31);
+    ctx.font = '10px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cbd3b296'; ctx.fillText(S.plantStages[stage], x, y + 31);
   }
+  function mover(o, targeted, t) {
+    timeRing(o.x + o.w / 2, o.y + 10, o.w / 2 + 10, o, t);
+    line(ctx, [[o.x1 + 6, o.y + 26], [o.x2 + o.w - 6, o.y + 26]], '#b6bea133', 1);
+    const g = ctx.createLinearGradient(0, o.y, 0, o.y + 20); g.addColorStop(0, '#b9c0a4'); g.addColorStop(.4, '#647c66'); g.addColorStop(1, '#1b3839');
+    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, 20, 4); ctx.fill();
+    line(ctx, [[o.x, o.y - 1], [o.x + o.w, o.y - 1]], '#e5ddba', 1.5); circle(ctx, o.x + o.w / 2, o.y + 10, 5, '#183e42', o.speed ? gold : '#8aa89b', 1.5);
+    if (targeted) { const a = o.w / 2 + 6, cx = o.x + o.w / 2, cy = o.y + 10; for (const [x, y] of [[-a, -18], [a, -18], [-a, 18], [a, 18]]) line(ctx, [[cx + x, cy + y - Math.sign(y) * 8], [cx + x, cy + y], [cx + x - Math.sign(x) * 8, cy + y]], gold); }
+  }
   function door(state, t) {
-    const x = state.exit.x, y = state.exit.y; const ready = state.needs.every(k => state.flags[k]) && state.plates.every(p => p.lit);
+    const x = state.exit.x, y = state.exit.y; const ready = state.needs.every(k => state.flags[k]);
     glow(ctx, x, y - 60, 110, ready ? '#dce2b73c' : '#a7c4ba11'); arch(ctx, x - 38, y - 107, 76, 107, '#d2c89c', 7); arch(ctx, x - 30, y - 99, 60, 99, '#a8b6a281', 1); line(ctx, [[x - 43, y], [x + 43, y]], '#e7d8a8', 3);
     ctx.save(); ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 30, y - 69); ctx.arc(x, y - 69, 30, Math.PI, 0); ctx.lineTo(x + 30, y); ctx.clip(); const g = ctx.createLinearGradient(x, y - 100, x, y); g.addColorStop(0, ready ? '#d5dfbd99' : '#497c7d33'); g.addColorStop(1, '#9ccac511'); ctx.fillStyle = g; ctx.fillRect(x - 30, y - 110, 60, 115);
     for (let i = 0; i < 9; i++) { const yy = y - ((t * .015 + i * 13) % 110); star(ctx, x + Math.sin(i * 2.2) * 19, yy, ready ? 2 : 1, ready ? '#f1e5b3bb' : '#b7d4ba44'); }
@@ -113,25 +137,23 @@
     ctx.save(); ctx.translate(780, 158); ctx.rotate(t * .00003); line(ctx, [[0, 9], [0, -62]], '#d8c99777', 2); line(ctx, [[-28, 0], [8, 0]], '#d8c99777', 2); circle(ctx, 0, 0, 3, '#cfc7a1'); ctx.restore();
     for (let i = 0; i < 22; i++) { const x = ((i * 137.5 + t * .006 * (i % 3 + 1)) % 1240) + 20; const y = 350 + Math.sin(i * 6 + t * .0006) * 145; circle(ctx, x, y, i % 4 === 0 ? 1.5 : .8, i % 4 === 0 ? '#d4d8a28c' : '#b6d4bf4d'); }
     for (const p of state.platforms) platform(p);
-    for (const plate of state.plates) {
-      ellipse(ctx, plate.x, plate.y - 2, plate.w / 2, 7, 0, '#b8b18b'); ellipse(ctx, plate.x, plate.y - 4, plate.w / 2 - 5, 5, 0, plate.lit ? '#b6dfd7' : '#2b5557');
-      if (plate.lit) glow(ctx, plate.x, plate.y - 6, 70, '#b6e8df26'); circle(ctx, plate.x, plate.y - 5, 9, null, '#d6d2a3'); ctx.font = '9px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b5c8b1'; ctx.fillText(S.plate, plate.x, plate.y + 27);
-    }
-    const p = state.actors[state.active];
-    let target = options.target;
-    if (!target) { const objects = state.active === 0 ? state.crates.filter(c => c.held === null) : state.trees; let best = 420; for (const object of objects) { const d = Math.hypot(object.x - p.x, (object.base ?? object.y) - p.y); if (d < best) { best = d; target = object.id; } } }
-    for (const tr of state.trees) tree(tr, tr.id === target && state.active === 1, t);
+    const target = options.target;
+    for (const p of state.pits) pit(p);
+    for (const o of state.objects) if (o.kind === 'mover') mover(o, o.id === target, t);
+    for (const o of state.objects) if (o.kind === 'plant') plant(o, o.id === target && state.active === 1, t);
     door(state, t);
     for (const shard of state.shards) if (!shard.taken) { const yy = shard.y + Math.sin(t * .002 + shard.id) * 5; glow(ctx, shard.x, yy, 40, '#e7d2a51b'); ctx.save(); ctx.translate(shard.x, yy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e2d194'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = '#f4e7b477'; ctx.strokeRect(-10, -10, 20, 20); ctx.restore(); }
-    for (const e of state.echoes) { actor({ ...e, grounded: true, move: 0 }, e.actor, false, 0, true); circle(ctx, e.x, e.y - 29, 42, null, '#b5dddb22'); }
-    for (const c of state.crates) if (c.held === null) crate(c, c.id === target && state.active === 0, t);
+    for (const o of state.objects) if (o.kind === 'crate' && o.held === null) crate(o, o.id === target && state.active === 0, t);
+    for (const o of state.objects) if (o.kind === 'seed' && o.held === null) seed(o, t);
     for (const actorState of state.actors) actor(actorState, actorState.id, actorState.id === state.active, t);
-    for (const c of state.crates) if (c.held !== null) crate(c, false, t);
-    for (const e of state.events) { const age = state.tick - e.tick; if (age > 45 || age < 0 || options.reduced) continue; const color = ['grow', 'regrow', 'shard', 'win'].includes(e.kind) ? gold : cyan; ctx.globalAlpha = Math.max(0, 1 - age / 45); circle(ctx, e.x, e.y, 12 + age * 1.8, null, color, 1); for (let i = 0; i < 6; i++) star(ctx, e.x + Math.sin(i * 1.05) * (12 + age), e.y + Math.cos(i * 1.05) * (12 + age), 2, color); ctx.globalAlpha = 1; }
-    const selectedCrate = state.crates.find(c => c.id === target && c.held === null); const selectedTree = state.trees.find(tr => tr.id === target);
-    if (state.status === 'playing') {
-      if (selectedCrate && state.active === 0 && Math.hypot(p.x - selectedCrate.x, p.y - selectedCrate.y) < 420) label(selectedCrate.x, selectedCrate.y - 62, selectedCrate.frozen ? S.targetRelease : S.targetFreeze);
-      if (selectedTree && state.active === 1 && Math.hypot(p.x - selectedTree.x, p.y - selectedTree.base) < 420) label(selectedTree.x, selectedTree.base - selectedTree.height - 53, selectedTree.age === 4 ? S.targetDead : S.targetGrow, gold);
+    for (const o of state.objects) if (o.held !== undefined && o.held !== null) o.kind === 'crate' ? crate(o, false, t) : seed(o, t);
+    for (const e of state.events) { const age = state.tick - e.tick; if (age > 45 || age < 0 || options.reduced) continue; const color = ['grow', 'wake', 'plant', 'shard', 'win'].includes(e.kind) ? gold : cyan; ctx.globalAlpha = Math.max(0, 1 - age / 45); circle(ctx, e.x, e.y, 12 + age * 1.8, null, color, 1); for (let i = 0; i < 6; i++) star(ctx, e.x + Math.sin(i * 1.05) * (12 + age), e.y + Math.cos(i * 1.05) * (12 + age), 2, color); ctx.globalAlpha = 1; }
+    const selected = state.objects.find(o => o.id === target);
+    if (state.status === 'playing' && selected) {
+      const top = selected.kind === 'plant' ? selected.base - selected.height - 53 : selected.kind === 'mover' ? selected.y - 30 : selected.y - 62;
+      const x = selected.kind === 'mover' ? selected.x + selected.w / 2 : selected.x;
+      if (state.active === 0) label(x, top, selected.frozen ? S.targetRelease : S.targetFreeze);
+      else label(x, top, selected.speed ? S.targetHasten : S.targetWake, gold);
     }
   }
   return { draw, worldPoint(clientX, clientY) { const rect = canvas.getBoundingClientRect(); return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale }; } };
````

Run: `git apply /tmp/render.patch`
Expected: no output.

- [ ] **Step 2: Confirm no stale fields remain**

Run: `grep -nE "plates|echoes|state\.trees|state\.crates|treeStages" public/render.js`
Expected: no output.

---

### Task 5: Wire input, HUD, hints and best times

**Files:**
- Modify: `public/client.js`
- Modify: `public/styles.css`

What the client patch does:
- Imports `targetFor`, `anchor`, `hintLevel`; removes the echo icon / buttons / Q-K keys and the Shift+F reverse path.
- `#hud` (bottom-left of the stage) shows `Seeds n · Rewinds n · Time mm:ss`.
- Tip text = `S.levels[level].hints[hintLevel(state)]`; when it escalates, `.tip-card` gets a `flash` class.
- On win, stores `best[level]` (ticks) in `localStorage['moonclock-v1'].best` and the win modal shows `Cleared in … · Best …`.
- Auto-target = clicked target if it still exists, else `targetFor(state, state.active)`; click-to-target uses `anchor()` over the active role's targetable kinds.

- [ ] **Step 1: Save this patch as `/tmp/client.patch` and apply it**

````diff
--- a/public/client.js
+++ b/public/client.js
@@ -1,4 +1,4 @@
-import { setup, applyAction, validateAction, viewFor } from '../src/logic.js';
+import { setup, applyAction, validateAction, viewFor, targetFor, anchor, hintLevel } from '../src/logic.js';
 import { S } from './strings.js';
 import { createRenderer } from './render.js';
 
@@ -15,7 +15,6 @@
   restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
   arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>', left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>', up: '<path d="m5 15 7-7 7 7"/>',
   swap: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4 4-4-4 4-4"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
-  echo: '<path d="M16 21v-6a5 5 0 0 0-10 0v6m10-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3 4a6 6 0 0 1 2 4v4"/>',
   guardian: '<path d="M8 12C4 8 7 2 12 2s8 6 4 10m-8 0-4 9c5 2 11 2 16 0l-4-9Zm0 1h8m-7-6h.01m6 0h.01M12 14v7M3 6v16m-2-19 2-2 2 2-2 3Z"/>',
 };
 const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.moon}</svg>`;
@@ -27,7 +26,9 @@
 let mode = saved.mode === 'coop' ? 'coop' : 'solo';
 let sound = saved.sound !== false;
 let reduced = saved.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
-let modal = 'intro', selectedTarget = null, seenEvent = 0, toastTimer, audioContext;
+let best = Array.isArray(saved.best) ? saved.best : [null, null, null, null];
+let modal = 'intro', selectedTarget = null, seenEvent = 0, shownHint = 0, toastTimer, audioContext;
+const clock = ticks => { const sec = Math.floor(ticks / 60); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
 let lastTime = 0, accumulator = 0, frameCount = 0;
 const held = new Set();
 const app = document.querySelector('#app');
@@ -37,44 +38,47 @@
       <div class="toolbar"><span class="room-pill">${S.connected}</span><span class="divider"></span><button class="iconbutton" data-testid="sound" data-action="sound" aria-label="${S.sound}" title="${S.sound}">${icon(sound ? 'sound' : 'mute')}</button><button class="iconbutton" data-testid="help" data-action="help" aria-label="${S.help}" title="${S.help}">${icon('help')}</button><button class="iconbutton" data-testid="settings" data-action="settings" aria-label="${S.settings}" title="${S.settings}">${icon('settings')}</button><button class="iconbutton" data-testid="pause" data-action="pause" aria-label="${S.pause}" title="${S.pause}">${icon('pause')}</button></div>
     </header>
     <div class="layout"><main class="main"><div class="chapterbar"><div><div class="eyebrow" id="chapter-en"></div><h2 class="chapter-name" id="chapter-name"></h2></div><nav class="chapter-nav" id="chapter-nav" aria-label="${S.chapters}"></nav></div>
-      <div class="game-frame"><canvas id="game" aria-label="${S.title}" tabindex="0"></canvas><div class="frame-label">HORTUS · TEMPORIS</div><div class="stage-corner">${S.subtitle}</div><div class="stage-count" id="stage-count"></div><div class="toast" role="status" id="toast"></div><div class="debug" id="debug" hidden></div></div>
-      <div class="under-stage"><div class="controls-strip"><span>${key('A D')}${S.move}</span><span>${key('Space')}${S.jump}</span><span>${key('E')}${S.grab}</span><span class="optional">${key('Q')}${S.echo}</span><span class="mobile-hide">${key('Tab')}${S.switchRole}</span></div><button class="text-button" data-action="rewind" data-testid="rewind">${icon('rewind')}${S.rewind}</button></div>
-      <div class="touch-controls"><div class="touch-group"><button data-hold="-1" aria-label="${S.move}">${icon('left')}</button><button data-hold="1" aria-label="${S.move}">${icon('right')}</button><button data-action="jump" aria-label="${S.jump}">${icon('up')}</button></div><div class="touch-group"><button data-action="grab" class="action">${S.grab}</button><button data-action="ability" class="action" data-testid="touch-ability">${S.ability[0]}</button><button data-action="echo" aria-label="${S.echo}">${icon('echo')}</button><button data-action="reverse" aria-label="${S.reverse}">${icon('rewind')}</button></div></div>
+      <div class="game-frame"><canvas id="game" aria-label="${S.title}" tabindex="0"></canvas><div class="frame-label">HORTUS · TEMPORIS</div><div class="stage-corner" id="hud"></div><div class="stage-count" id="stage-count"></div><div class="toast" role="status" id="toast"></div><div class="debug" id="debug" hidden></div></div>
+      <div class="under-stage"><div class="controls-strip"><span>${key('A D')}${S.move}</span><span>${key('Space')}${S.jump}</span><span>${key('E')}${S.grab}</span><span class="mobile-hide">${key('Tab')}${S.switchRole}</span></div><button class="text-button" data-action="rewind" data-testid="rewind">${icon('rewind')}${S.rewind}</button></div>
+      <div class="touch-controls"><div class="touch-group"><button data-hold="-1" aria-label="${S.move}">${icon('left')}</button><button data-hold="1" aria-label="${S.move}">${icon('right')}</button><button data-action="jump" aria-label="${S.jump}">${icon('up')}</button></div><div class="touch-group"><button data-action="grab" class="action">${S.grab}</button><button data-action="ability" class="action" data-testid="touch-ability">${S.ability[0]}</button><button data-action="rewind" aria-label="${S.rewind}">${icon('rewind')}</button></div></div>
       <div class="quote" id="quote"></div>
     </main><aside class="sidebar"><section class="role-section"><div class="section-kicker">${S.current}</div><div class="roles">${[0, 1].map(i => `<div class="role-card ${i ? 'bloom' : ''}" data-role="${i}" data-testid="role-${i}" role="button" tabindex="0" aria-label="${S.roleNames[i]}"><div class="role-portrait">${icon('guardian')}</div><div><strong class="role-name">${S.roleNames[i]}</strong><span class="role-en">${S.roleLabels[i]}</span></div><span class="role-badge" id="badge-${i}"></span><p class="role-help">${S.roleDescriptions[i]}</p><div class="role-tools"><button class="ability-button" data-action="ability" data-actor="${i}" data-testid="ability-${i}">${icon(i ? 'leaf' : 'snow')}${S.ability[i]}</button>${key('F')}</div></div>`).join('')}</div></section>
       <section class="objective-card"><div class="section-kicker">${S.objective}</div><p class="objective-text" id="objective"></p><ul class="checklist" id="checklist"></ul></section>
-      <section class="tip-card"><div class="tip-heading">${icon('leaf')}${S.tip}</div><p class="tip-content" id="tip"></p></section><div class="side-actions"><button class="text-button" data-action="echo" data-testid="echo">${icon('echo')}${S.echo}</button><button class="text-button" data-action="restart" data-testid="restart">${icon('restart')}${S.restart}</button></div>
+      <section class="tip-card"><div class="tip-heading">${icon('leaf')}${S.tip}</div><p class="tip-content" id="tip"></p></section><div class="side-actions"><button class="text-button" data-action="restart" data-testid="restart">${icon('restart')}${S.restart}</button></div>
     </aside></div><footer class="footer"><small>EST. IN A MOMENT · MMXXVI</small><span class="gold">${S.english} / ${S.subtitle}</span><small>01 — 04 · A TIMELESS GARDEN</small></footer>
   </div><div id="modal-root"></div>`;
 const canvas = document.querySelector('#game');
 const renderer = createRenderer(canvas, S);
 const debug = new URLSearchParams(location.search).has('debug');
 function persist() {
-  try { localStorage.setItem('moonclock-v1', JSON.stringify({ level: state.level, unlocked: state.unlocked, mode, sound, reduced })); } catch { }
+  try { localStorage.setItem('moonclock-v1', JSON.stringify({ level: state.level, unlocked: state.unlocked, mode, sound, reduced, best })); } catch { }
 }
 function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
 function initAudio() { if (!audioContext && sound) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (audioContext?.state === 'suspended' && sound) audioContext.resume(); }
 function chime(kind) {
-  if (!sound || !audioContext || !['freeze', 'unfreeze', 'grow', 'regrow', 'echo', 'shard', 'win', 'throw', 'return', 'rewind'].includes(kind)) return;
-  const now = audioContext.currentTime; const notes = kind === 'win' ? [392, 493.88, 587.33, 783.99] : kind === 'grow' || kind === 'regrow' ? [392, 587.33] : kind === 'freeze' ? [880, 1320] : kind === 'echo' ? [293.66, 440] : [440];
+  if (!sound || !audioContext || !['freeze', 'unfreeze', 'grow', 'wake', 'plant', 'vanish', 'shard', 'win', 'throw', 'return', 'rewind'].includes(kind)) return;
+  const now = audioContext.currentTime; const notes = kind === 'win' ? [392, 493.88, 587.33, 783.99] : kind === 'grow' || kind === 'wake' ? [392, 587.33] : kind === 'freeze' ? [880, 1320] : kind === 'plant' ? [293.66, 440] : kind === 'vanish' ? [220] : [440];
   notes.forEach((frequency, i) => { const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now + i * .075); gain.gain.setValueAtTime(0, now + i * .075); gain.gain.linearRampToValueAtTime(.025, now + i * .075 + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + i * .075 + .55); osc.connect(gain); gain.connect(audioContext.destination); osc.start(now + i * .075); osc.stop(now + i * .075 + .6); });
 }
 function dispatch(action, quiet = false) {
-  if (action.actor === undefined && ['move', 'jump', 'grab', 'ability', 'echo'].includes(action.type)) action = { ...action, actor: state.active };
+  if (action.actor === undefined && ['move', 'jump', 'grab', 'ability'].includes(action.type)) action = { ...action, actor: state.active };
   if (action.type === 'ability' && !action.target && selectedTarget) action = { ...action, target: selectedTarget };
   const result = validateAction(state, 'local', action);
   if (!result.valid) { if (!quiet) toast(S.errors[result.error]); return result; }
   const oldLevel = state.level, oldStatus = state.status;
   state = applyAction(state, 'local', action);
-  if (state.level !== oldLevel || ['restart', 'rewind'].includes(action.type)) { selectedTarget = null; seenEvent = state.eventSeq; }
+  if (state.level !== oldLevel || ['restart', 'rewind'].includes(action.type)) { selectedTarget = null; seenEvent = state.eventSeq; shownHint = 0; }
   for (const e of state.events) if (e.id > seenEvent) { chime(e.kind); seenEvent = e.id; }
-  if (state.status === 'won' && oldStatus !== 'won') { held.clear(); modal = 'win'; persist(); renderModal(); }
+  if (state.status === 'won' && oldStatus !== 'won') { held.clear(); best[state.level] = Math.min(best[state.level] ?? Infinity, state.elapsed); modal = 'win'; persist(); renderModal(); }
   if (action.type !== 'tick' || state.status !== oldStatus) updateUI();
   return { valid: true };
 }
 function updateUI() {
   const chapter = S.levels[state.level]; document.querySelector('#chapter-en').textContent = `${S.chapter} 0${state.level + 1} / ${chapter.en}`; document.querySelector('#chapter-name').textContent = chapter.name;
-  document.querySelector('#objective').textContent = chapter.goal; document.querySelector('#tip').textContent = S.hints[state.level]; document.querySelector('#quote').textContent = chapter.lesson;
+  document.querySelector('#objective').textContent = chapter.goal; const hint = hintLevel(state); document.querySelector('#tip').textContent = chapter.hints[hint];
+  if (hint > shownHint) { const card = document.querySelector('.tip-card'); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
+  shownHint = hint;
+  document.querySelector('#hud').textContent = `${S.seeds} ${state.objects.filter(o => o.kind === 'seed').length} · ${S.rewinds} ${state.rewindsLeft} · ${S.time} ${clock(state.elapsed)}`; document.querySelector('#quote').textContent = chapter.lesson;
   document.querySelector('#stage-count').textContent = `0${state.level + 1} / 04`;
   document.querySelector('#chapter-nav').innerHTML = [0, 1, 2, 3].map((i) => `${i ? '<span class="chapter-connector"></span>' : ''}<button class="chapter-button ${i === state.level ? 'active' : ''} ${i < state.unlocked ? 'done' : ''}" data-level="${i}" ${i > state.unlocked ? 'disabled' : ''} aria-label="${S.levels[i].name}" ${i === state.level ? 'aria-current="step"' : ''}>${String(i + 1).padStart(2, '0')}</button>`).join('');
   document.querySelector('#checklist').innerHTML = state.needs.map(k => `<li class="${state.flags[k] ? 'done' : ''}">${S.flags[k]}</li>`).join('');
@@ -98,7 +102,7 @@
   if (modal === 'help') contents = `${close}<div class="intro-icon">${icon('help')}</div><h2>${S.helpTitle}</h2><p>${S.helpBody}</p><div class="help-grid">${S.keys.map(([k, v]) => `${key(k)}<span>${v}</span>`).join('')}</div><p>${S.coopKeys}</p><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
   if (modal === 'settings') contents = `${close}<div class="intro-icon">${icon('settings')}</div><h2>${S.settings}</h2><div class="settings-row"><span>${S.sound}</span><button class="toggle" role="switch" aria-checked="${sound}" data-action="sound" aria-label="${S.sound}" data-testid="setting-sound"></button></div><div class="settings-row"><span>${S.motion}</span><button class="toggle" role="switch" aria-checked="${reduced}" data-action="motion" aria-label="${S.motion}" data-testid="setting-motion"></button></div><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}">${S.coop}</button></div><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
   if (modal === 'pause') contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">A MOMENT OF STILLNESS</div><h2>${S.focus}</h2><p>${S.levels[state.level].goal}</p><button class="primary" data-action="close" data-testid="resume">${S.resume}${icon('play')}</button><div class="modal-actions"><button class="text-button" data-action="help">${S.help}</button><button class="text-button" data-action="restart">${S.restart}</button></div>`;
-  if (modal === 'win') contents = `<div class="intro-icon">${icon('leaf')}</div><div class="eyebrow">CHAMBER 0${state.level + 1} · RESTORED</div><h2>${state.level === 3 ? S.complete : S.chamberComplete}</h2><p>${state.level === 3 ? S.completeBody : S.chamberCompleteBody}</p><div class="win-stars">✦ ${state.shards[0].taken ? '✦' : '◇'} ✦</div><p>${S.memory} ${state.shards.filter(s => s.taken).length} / ${state.shards.length}</p><button class="primary" data-action="next" data-testid="next">${state.level === 3 ? S.replay : S.next}${icon('arrow')}</button>`;
+  if (modal === 'win') contents = `<div class="intro-icon">${icon('leaf')}</div><div class="eyebrow">CHAMBER 0${state.level + 1} · RESTORED</div><h2>${state.level === 3 ? S.complete : S.chamberComplete}</h2><p>${state.level === 3 ? S.completeBody : S.chamberCompleteBody}</p><p>${S.clear} ${clock(state.elapsed)} · ${S.best} ${clock(best[state.level] ?? state.elapsed)}</p><div class="win-stars">✦ ${state.shards[0].taken ? '✦' : '◇'} ✦</div><p>${S.memory} ${state.shards.filter(s => s.taken).length} / ${state.shards.length}</p><button class="primary" data-action="next" data-testid="next">${state.level === 3 ? S.replay : S.next}${icon('arrow')}</button>`;
   root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal === 'intro' ? S.title : S[modal] || S.title}">${contents}</section></div>`;
 }
 document.addEventListener('click', event => {
@@ -116,10 +120,10 @@
   if (action === 'restart') { dispatch({ type: 'restart' }); modal = null; renderModal(); clearInputs(); return; }
   if (action === 'next') { dispatch({ type: 'next' }); modal = null; renderModal(); selectedTarget = null; persist(); return; }
   if (modal) return;
-  if (action === 'ability' || action === 'reverse') {
+  if (action === 'ability') {
     const actor = button.dataset.actor === undefined ? state.active : Number(button.dataset.actor);
     if (actor !== state.active) { clearInputs(); dispatch({ type: 'switch' }); selectedTarget = null; }
-    dispatch({ type: 'ability', actor, reverse: action === 'reverse' });
+    dispatch({ type: 'ability', actor });
   } else dispatch({ type: action });
 });
 function movement() {
@@ -134,16 +138,15 @@
   if (event.target.closest('button,[role="button"]') && ['Enter', 'Space'].includes(code)) return;
   if (code === 'Escape') { event.preventDefault(); if (modal && modal !== 'intro' && modal !== 'win') resume(); else if (!modal) setModal('pause'); return; }
   if (modal) return;
-  const controls = ['KeyA', 'KeyD', 'KeyW', 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'KeyL', 'KeyK'];
+  const controls = ['KeyA', 'KeyD', 'KeyW', 'Space', 'KeyE', 'KeyF', 'KeyR', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'KeyL'];
   if (!controls.includes(code)) return;
   event.preventDefault(); initAudio(); held.add(code); movement(); if (event.repeat) return;
   if (code === 'Tab') { clearInputs(); dispatch({ type: 'switch' }); selectedTarget = null; }
   if (code === 'KeyR') dispatch({ type: 'rewind' });
-  const actor = mode === 'coop' ? ['ArrowUp', 'Enter', 'KeyL', 'KeyK'].includes(code) ? 1 : 0 : state.active;
+  const actor = mode === 'coop' ? ['ArrowUp', 'Enter', 'KeyL'].includes(code) ? 1 : 0 : state.active;
   if (['KeyW', 'Space', 'ArrowUp'].includes(code)) dispatch({ type: 'jump', actor });
   if (['KeyE', 'Enter'].includes(code)) dispatch({ type: 'grab', actor });
-  if (['KeyF', 'KeyL'].includes(code)) dispatch({ type: 'ability', actor, reverse: event.shiftKey });
-  if (['KeyQ', 'KeyK'].includes(code)) dispatch({ type: 'echo', actor });
+  if (['KeyF', 'KeyL'].includes(code)) dispatch({ type: 'ability', actor });
 });
 document.addEventListener('keyup', event => { held.delete(event.code); movement(); });
 document.querySelectorAll('[data-hold]').forEach(button => {
@@ -153,7 +156,8 @@
 });
 canvas.addEventListener('pointerdown', event => {
   if (modal) return; const point = renderer.worldPoint(event.clientX, event.clientY); let closest = null, distance = 90;
-  for (const object of [...state.crates.filter(c => c.held === null), ...state.trees]) { const d = Math.hypot(point.x - object.x, point.y - (object.base ? object.base - object.height / 2 : object.y)); if (d < distance) { distance = d; closest = object; } }
+  const kinds = state.active === 0 ? ['plant', 'mover', 'crate'] : ['plant', 'mover'];
+  for (const object of state.objects) { if (!kinds.includes(object.kind) || (object.held ?? null) !== null) continue; const a = anchor(object); const d = Math.hypot(point.x - a.x, point.y - a.y); if (d < distance) { distance = d; closest = object; } }
   selectedTarget = closest?.id || null; canvas.focus({ preventScroll: true });
 });
 window.addEventListener('blur', () => { clearInputs(); if (!modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); });
@@ -166,9 +170,10 @@
   if (lastTime === 0) lastTime = time;
   accumulator += Math.min(100, time - lastTime); lastTime = time;
   if (!modal && state.status === 'playing') { while (accumulator >= 1000 / 60) { dispatch({ type: 'tick' }, true); accumulator -= 1000 / 60; } } else accumulator = 0;
-  renderer.draw(state, time, { reduced, target: selectedTarget });
+  if (selectedTarget && !state.objects.some(o => o.id === selectedTarget)) selectedTarget = null;
+  renderer.draw(state, time, { reduced, target: selectedTarget || targetFor(state, state.active)?.id });
   frameCount++; if (frameCount % 10 === 0) updateUI();
-  if (debug) { const el = document.querySelector('#debug'); el.hidden = false; el.textContent = `tick ${state.tick} | phase ${modal || state.status}\nentities ${state.actors.length + state.crates.length + state.trees.length}\nactor ${state.active} | ${Math.round(state.actors[state.active].x)},${Math.round(state.actors[state.active].y)}`; }
+  if (debug) { const el = document.querySelector('#debug'); el.hidden = false; el.textContent = `tick ${state.tick} | phase ${modal || state.status}\nentities ${state.actors.length + state.objects.length}\nactor ${state.active} | ${Math.round(state.actors[state.active].x)},${Math.round(state.actors[state.active].y)}`; }
   requestAnimationFrame(frame);
 }
 updateUI(); renderModal(); requestAnimationFrame(frame);
````

- [ ] **Step 2: Save this patch as `/tmp/styles.patch` and apply it**

````diff
--- a/public/styles.css
+++ b/public/styles.css
@@ -11,3 +11,4 @@
 @media(max-width:540px){.topbar{height:74px;padding:0 17px}.brand-mark{width:34px;height:34px}.brand-mark svg{width:24px;height:24px}.brand{gap:10px}.brand-title{font-size:17px;letter-spacing:4px}.brand-en{font-size:7px;letter-spacing:3px}.toolbar .divider{display:none}.iconbutton{width:33px;height:33px}.iconbutton svg{width:16px;height:16px}.layout{padding:17px 12px}.chapterbar{padding:0 5px 16px}.eyebrow{font-size:7px;letter-spacing:2px}.chapter-name{font-size:17px;letter-spacing:2px}.chapter-button{width:26px;height:26px;font-size:10px}.chapter-connector{width:4px}.chapter-nav{gap:2px}.game-frame{aspect-ratio:1.7/1;border-radius:65px 65px 5px 5px}.game-frame:after{border-radius:59px 59px 3px 3px}.frame-label{top:13px;font-size:6px}.stage-corner{bottom:10px;font-size:6px;left:14px;letter-spacing:1px}.stage-count{bottom:10px;right:13px;font-size:8px}.under-stage{padding:15px 3px 12px}.controls-strip{font-size:8px;gap:9px}.controls-strip .key{min-width:18px;height:19px;font-size:8px}.controls-strip .mobile-hide{display:none}.text-button{font-size:9px}.quote{font-size:10px;letter-spacing:2px}.quote:before,.quote:after{width:18px;margin:0 9px}.sidebar{gap:18px 14px}.role-card{padding:12px 10px;gap:8px;grid-template-columns:30px 1fr}.role-portrait{width:30px;height:43px}.role-portrait svg{width:28px;height:38px}.role-name{font-size:12px;letter-spacing:1px}.role-badge{font-size:6px;top:10px;right:8px}.role-en{font-size:7px;letter-spacing:2px}.role-help{font-size:9px;line-height:1.8;min-height:32px}.role-tools,.ability-button{font-size:9px}.role-tools .key{font-size:8px;min-width:17px;height:19px}.objective-text{font-size:11px;line-height:1.9}.checklist li{font-size:9px;line-height:1.7}.tip-content{font-size:9px}.tip-card{padding:11px}.section-kicker{font-size:8px;margin-bottom:11px}.touch-controls{gap:6px}.touch-group{gap:5px}.touch-controls button{height:41px;min-width:37px}.touch-controls button.action{padding:0 8px;font-size:9px}.touch-controls button svg{width:17px;height:17px}.footer{font-size:6px;padding:0 16px 18px;letter-spacing:1px}.footer small{font-size:6px}.modal{padding:42px 25px 30px;border-radius:140px 140px 8px 8px}.modal h1{font-size:29px;letter-spacing:5px}.modal h2{font-size:22px}.modal p{font-size:11px}.modal .close{top:32px;right:27px}.modal-backdrop{padding:16px}.help-grid{grid-template-columns:95px 1fr;font-size:10px}.toast{bottom:40px;font-size:10px;max-width:90%;width:max-content}}
 @media(pointer:fine) and (min-width:851px){.touch-controls{display:none}}
 @media(min-width:851px) and (max-height:850px){.topbar{height:72px;flex:none}.layout{padding:18px 28px 10px;gap:25px}.chapterbar{padding-bottom:14px}.chapter-name{font-size:20px;margin-top:6px}.game-frame{flex:none;aspect-ratio:auto;height:calc(100dvh - 285px);min-height:300px;max-height:565px}.under-stage{padding:14px 5px 8px}.quote{padding:4px 0;font-size:12px}.sidebar{gap:15px}.role-card{padding:12px 15px;gap:9px}.role-help{line-height:1.65}.role-tools{padding-top:8px}.role-portrait{height:43px}.objective-card{padding-top:14px}.objective-text{margin-bottom:12px}.tip-card{padding:12px}.footer{padding:8px 30px 14px}}
+.tip-card.flash{animation:tip-flash 1.6s ease-out 2}@keyframes tip-flash{0%{border-color:#e1c68a;box-shadow:0 0 0 0 #e1c68a55}100%{border-color:#b2b88c20;box-shadow:0 0 0 14px #e1c68a00}}
````

Run: `git apply /tmp/client.patch /tmp/styles.patch`
Expected: no output.

- [ ] **Step 3: Confirm no stale references remain**

Run: `grep -nE "echo|reverse|state\.crates|state\.trees|S\.hints|plates" public/client.js`
Expected: no output.

- [ ] **Step 4: Run the tests**

Run: `bun test`
Expected: `18 pass, 0 fail`

---

### Task 6: Verify in the browser

**Files:**
- Create (outside the repo): `/tmp/mc-shot/mech.mjs`

- [ ] **Step 1: Start the server**

Run: `bun server.js` (background)
Expected: `Moonclock ready at http://127.0.0.1:4173/`

- [ ] **Step 2: Save and run this driver** (needs `npm i playwright` + `npx playwright install chromium` in `/tmp/mc-shot`)

```js
import { chromium } from 'playwright';
const b = await chromium.launch(); const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({ level: 1, unlocked: 3 })));
await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500);
await p.getByTestId('start').click(); await p.waitForTimeout(300);
const run = js => p.evaluate(js);
// Level 2: carry seed to pit, plant, wake, hasten to sapling, put Still on it, freeze mid-growth
await run(() => { const m = window.__moonclock; let s = m.snapshot();
  s = m.dispatch({ type: 'move', actor: 1, dir: 1 }); for (let i = 0; i < 200 && m.snapshot().actors[1].x < 378; i++) m.dispatch({ type: 'tick' });
  m.dispatch({ type: 'move', actor: 1, dir: 0 }); m.dispatch({ type: 'grab', actor: 1 });
  m.dispatch({ type: 'move', actor: 1, dir: 1 }); for (let i = 0; i < 200 && m.snapshot().actors[1].x < 598; i++) m.dispatch({ type: 'tick' });
  m.dispatch({ type: 'move', actor: 1, dir: 0 }); m.dispatch({ type: 'grab', actor: 1 });
  m.dispatch({ type: 'switch' });
  m.dispatch({ type: 'ability', actor: 1 }); m.dispatch({ type: 'ability', actor: 1 }); m.dispatch({ type: 'ability', actor: 1 }); m.dispatch({ type: 'tick', count: 25 });
  m.dispatch({ type: 'switch' }); m.dispatch({ type: 'ability', actor: 0 });
});
await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/mc-shot/m-l2.png' });
console.log('l2', await run(() => JSON.stringify(window.__moonclock.snapshot().objects.map(o => [o.id, o.stage, o.frozen, o.speed]))));
console.log('hud', await p.locator('#hud').textContent());
// Level 4: wake mover
await run(() => { const m = window.__moonclock; m.dispatch({ type: 'level', level: 3 }); m.dispatch({ type: 'switch' });
  m.dispatch({ type: 'move', actor: 1, dir: 1 }); m.dispatch({ type: 'tick', count: 50 }); m.dispatch({ type: 'move', actor: 1, dir: 0 });
  m.dispatch({ type: 'ability', actor: 1, target: 'mover-0' }); m.dispatch({ type: 'tick', count: 40 }); });
await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/mc-shot/m-l4.png' });
// Level 3: ancient tree default view
await run(() => window.__moonclock.dispatch({ type: 'level', level: 2 }));
await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/mc-shot/m-l3.png' });
// hint escalation
await run(() => { const m = window.__moonclock; m.dispatch({ type: 'move', actor: 0, dir: 1 }); m.dispatch({ type: 'tick', count: 1 }); m.dispatch({ type: 'move', actor: 0, dir: 0 }); for (let i = 0; i < 4; i++) m.dispatch({ type: 'tick', count: 1800 }); });
await p.waitForTimeout(700); console.log('tip', await p.locator('#tip').textContent(), '| flash', await p.locator('.tip-card').getAttribute('class'));
console.log('errors:', JSON.stringify(errs)); await b.close();
```

Run: `cd /tmp/mc-shot && node mech.mjs`
Expected:
- `l2 [["seed-0",null,null,null],["plant-0",2,true,1]]` — one seed left, planted sapling frozen while awake
- `hud Seeds 1 · Rewinds 3 · Time 00:0x`
- `tip` prints the second-tier hint for chamber 3 and `flash tip-card flash`
- `errors: []`

- [ ] **Step 3: Look at the screenshots**

Open `/tmp/mc-shot/m-l2.png`, `m-l3.png`, `m-l4.png`. Expect: a cyan ring around the frozen sapling with Still standing on it (L2); a grown ancient tree labelled "Grown" and an empty pit (L3); pits, seeds, crate and a woken mover with a dashed gold ring and "Hasten · F" label (L4).

- [ ] **Step 4: Stop the server and commit**

```bash
git add public/render.js public/client.js public/styles.css public/strings.js
git commit -m "feat: render and control the time-flow mechanics"
```
