# Chamber 4 (withtime) — Rewinding Bloom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder chamber 4 with the rewind level from
`docs/superpowers/specs/2026-11-08-level-four-rewind-design.md`: Bloom runs plant time backwards, a dead tree is
rewound into a stepping stone for a low tunnel, and a thorny vine lid is rewound open.

**Architecture:** All rules live in `src/logic.js` (pure state → state). A level sets `bloomReverses: true`, which is
copied onto the state, so test arenas can switch it on too. Plants already age by `age += speed * slow`; we let
`speed` go negative and handle the two new ends of life (back to maturity, back to nothing). Ceilings reuse the
crate head-bump rule. The renderer and strings only change labels, a ring tint and thorns.

**Tech Stack:** Plain ES modules, Bun (`bun test`), canvas renderer in `public/render.js`.

**Working copy:** this plan is executed in the worktree `/Users/yang/GameJam26-level-four` on branch `level-four`
(cut from `main`). The main checkout `/Users/yang/GameJam26` is on another session's `level-three` branch: do not
switch branches there. All paths below are relative to the worktree.

---

## File map

- `src/logic.js` — plant `age`/`ceiling` options, exported `plantSize`, rewinding Bloom (targeting, validation,
  cast), negative-speed aging, ceilings in `moveActors`, `rewindNeeds` in `assessFailure`, two new flags.
- `src/levels/04-withtime.js` — the new chamber.
- `tests/arena.js` — `withtimeArena` (the old chamber 4, frozen for mechanics tests), `reverseArena` (rewinding
  plant on the rootrise arena).
- `tests/reverse-bloom.test.js` — new: mechanics tests (rewind, ceilings, fail rule).
- `tests/level-four.test.js` — new: layout and run-through tests of the new chamber.
- `tests/charges.test.js`, `tests/gameplay.test.js`, `tests/jump.test.js`, `tests/logic.test.js`,
  `tests/level-one.test.js`, `tests/range.test.js` — switch `setup({ level: 3 })` to `withtimeArena()`.
- `public/strings.js` — Rewind labels, chamber 4 text, flag texts, `rewound` warning.
- `public/render.js` — Rewind target label, cool time ring for negative speed, thorns on ceiling vines.
- `public/client.js` — ability label/aria label say "Rewind" in a reversing courtyard.
- `docs/superpowers/specs/2026-11-08-level-four-rewind-design.md` — numbers corrected (Task 0).

---

### Task 0: Sync and correct the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-11-08-level-four-rewind-design.md`

- [ ] **Step 1: Bring in main if the chamber 3 work has landed**

Run: `git -C /Users/yang/GameJam26-level-four log --oneline main -5` (the worktree shares branches with the main checkout)

If `main` now contains the chamber 3 commits ("Chamber 3: arrows, canyon…"), run
`git -C /Users/yang/GameJam26-level-four merge main` and resolve conflicts (they will be in the tests that both
branches move to arenas: keep both arenas and both sets of replacements). If not, continue; the merge happens later.

- [ ] **Step 2: Correct the spec numbers**

The real jump rise measured in the engine is 156.5 (not 157). With the tunnel floor at 325 a traveller on the dead
tree's cap would clear it by only 4.5 px, so the floor is raised 5. Edit the spec:

- Tunnel floor: `{ x: 760, y: 320, w: 640, h: 320 }` (200 above the start ground).
- Tunnel roof: `{ x: 760, y: 0, w: 640, h: 261, ceiling: true }` (tunnel still 59 tall).
- Bands: hop in for ≈ 35 ≤ h < 191; walk in for 191 ≤ h ≤ 207; blocked for h > 207.
- Dead tree `age: 1915` (cap ≈ 23; a jump from it peaks 9 px short of the floor's step-up line).
- Checkpoint in the tunnel `{ x: 820, y: 320 }`.
- Both pits `plantable: false` (they only hold the level's plants).
- Events: the cast keeps the event kinds `wake` / `grow` with `{ rewind: true }` (so sound and effects keep working);
  a rewound-away plant emits `vanish` with `{ plant: true, rewound: true }`; returning to maturity emits `unwither`.
- `rewindNeeds` entries get `goneOpens: true` when the plant vanishing opens the way (the vine):
  `[{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }]`. A traveller standing on a
  higher platform than `from` does not count as waiting there.
- Task hints (`public/task-hints.js`) only cover chambers 1–2; chamber 4 uses the level hint strings only.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-08-level-four-rewind-design.md
git commit -m "Correct chamber 4 spec numbers to the measured jump"
```

---

### Task 1: Freeze the old chamber 4 as a test arena

Many mechanics tests use `setup({ level: 3 })` for its crate, mover and Freeze crossing. Move them to a fixed arena
before the level changes.

**Files:**
- Modify: `tests/arena.js`
- Modify: `tests/charges.test.js:93`, `tests/gameplay.test.js:209,255,299`, `tests/jump.test.js:207`,
  `tests/logic.test.js:262,270,326`, `tests/level-one.test.js:145`, `tests/range.test.js:43,70,97,118,138`

- [ ] **Step 1: Add the arena**

Append to `tests/arena.js`:

```js
// The original fourth courtyard, kept as a fixed test arena: a start ledge (x 0-520, y 520) with a crate at
// (300, 493), seeds at x 110 / 150 / 480 (Bloom holds one more), pits at x 400 and x 60, a sleeping mover
// (x 540-640, y 290, 120 wide) and the exit ledge (platform-1, y 300) with the moon gate at (1160, 300).
// Two Freeze charges plus an hourglass. Built on level index 0, whose `crossingNeedsFreeze` rule (from platform 0)
// drives fail checks.
export function withtimeArena(options = {}) {
  const s = setup({ ...options, level: 0 });
  const seed = (x, i) => ({ kind: 'seed', id: `seed-${i}`, x, y: 510, vx: 0, vy: 0, frozen: false, held: null, spawnX: x, spawnY: 510 });
  s.width = 1280;
  s.platforms = [{ x: 0, y: 520, w: 520, h: 160 }, { x: 1040, y: 300, w: 240, h: 400 }];
  s.objects = [
    { kind: 'crate', id: 'crate-0', x: 300, y: 493, vx: 0, vy: 0, frozen: false, held: null, spawnX: 300, spawnY: 493 },
    ...[110, 150, 480].map(seed),
    { kind: 'mover', id: 'mover-0', x: 540, y: 290, w: 120, x1: 540, x2: 640, dir: 1, speed: 0, frozen: false },
  ];
  s.pits = [{ id: 'pit-0', x: 400, y: 520, plant: null }, { id: 'pit-1', x: 60, y: 520, plant: null }];
  s.nextPlant = 0; s.nextEnemy = s.objects.length;
  s.actors.forEach((p, i) => Object.assign(p, { x: [250, 170][i], y: 520, spawnX: [250, 170][i], spawnY: 520 }));
  s.checkpoints = [];
  s.pickups = [{ x: 470, y: 430, id: 'frost-0', kind: 'frost', taken: false }, { x: 345, y: 494, id: 'bolt-0', kind: 'bolt', taken: false }];
  s.exit = { x: 1160, y: 300 }; s.shards = [{ x: 400, y: 240, id: 0, taken: false }];
  s.needs = ['treeLifted', 'moverRide', 'frozenTouched']; s.freezeCharges = 2; s.seeds = 1; s.crateRespawn = true;
  return s;
}
```

The arena sits on level index 0, so `assessFailure` uses chamber 1's rules (`exitNeedsPlant`, `crossingNeedsFreeze`
from platform 0); `LEVELS[state.level]` is only read there and in `makeLevel` (`grep -n "LEVELS\[" src/*.js`).
If a mover in `src/logic.js` `makeLevel` has more fields after the chamber 3 merge (e.g. `axis`), copy them from
what `makeLevel` builds for a horizontal mover.

- [ ] **Step 2: Switch the tests**

In each listed test, replace `setup({ level: 3 })` with `withtimeArena()` and add `withtimeArena` to that file's
`import { … } from './arena.js'` line (add the import line if the file has none). In `tests/range.test.js:138` the
variable is `level3`; rename it `old4`. In `tests/gameplay.test.js:299` change the comment to
`// The old courtyard 4 arena: the crossing is needed by anyone still on the start ledge (crossingFrom 0).`

Find every use with: `grep -n "level: 3" tests/*.js` — after this step it must print nothing.

- [ ] **Step 3: Run the whole suite**

Run: `bun test`
Expected: same pass count as before the change, 0 failures. If `gameplay.test.js` "a crossing that needs Freeze"
fails because Still is placed at `x: 1100` (platform-1 of the arena), keep it: on the arena platform-1 is the exit
ledge, as before.

- [ ] **Step 4: Commit**

```bash
git add tests
git commit -m "Keep the old courtyard 4 as a fixed test arena"
```

---

### Task 2: Plant options `age` and `ceiling`, and `plantSize`

**Files:**
- Modify: `src/logic.js:66-74` (makePlant), `src/logic.js:88` (level plants), `src/logic.js:445,724` (callers)
- Modify: `tests/arena.js` (reverseArena)
- Test: `tests/reverse-bloom.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/reverse-bloom.test.js`:

```js
import { describe, test, expect } from 'bun:test';
import { applyAction, validateAction, abilityCheck, plantSize, meta, failureReason, setup } from '../src/logic.js';
import { reverseArena, rootriseArena, vineArena } from './arena.js';

const STILL = 0, BLOOM = 1;
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const rewind = (s, target = 'plant-0') => act(s, { type: 'ability', actor: BLOOM, target });
const plant = (s, id = 'plant-0') => s.objects.find(o => o.id === id);

describe('plant size and starting age', () => {
  test('plantSize follows the life: rise, hold, wilt (mushroom) and reach, hold, shrink (vine)', () => {
    const { growTicks, matureTicks, maxHeight } = meta.plant;
    expect(plantSize(0, growTicks / 2)).toBeCloseTo(maxHeight / 2);
    expect(plantSize(0, growTicks + matureTicks)).toBeCloseTo(maxHeight);
    expect(plantSize(1, growTicks / 2)).toBeCloseTo(meta.vine.maxLength / 2);
    expect(plantSize(1, growTicks + matureTicks)).toBeCloseTo(meta.vine.maxLength);
  });

  test('reverseArena puts a sleeping plant at the given age, withered past maturity', () => {
    const young = reverseArena({ age: 480 }), old = reverseArena({ age: 1800 });
    expect(plant(young)).toMatchObject({ age: 480, speed: 0, withered: false });
    expect(plant(young).height).toBeCloseTo(meta.plant.maxHeight / 2);
    expect(plant(old).withered).toBe(true);
    expect(young.bloomReverses).toBe(true);
  });
});
```

Add to `tests/arena.js` (change its first line to `import { setup, meta, plantSize } from '../src/logic.js';`):

```js
// rootriseArena where Bloom runs time backwards, with one sleeping plant already in pit-0 (x 600, ground 540) at
// `age`. Bloom stands at x 520, within reach of it; Still at x 195.
export function reverseArena({ age = 1200 } = {}) {
  const s = rootriseArena();
  s.bloomReverses = true;
  s.objects = [{ kind: 'plant', id: 'plant-0', pit: 'pit-0', x: 600, base: 540, age, height: plantSize(0, age), withered: age > meta.plant.growTicks + meta.plant.matureTicks, speed: 0, frozen: false, barrier: false }];
  s.pits[0].plant = 'plant-0'; s.nextPlant = 1; s.nextEnemy = 1;
  s.actors[1].x = 520; // Bloom
  return s;
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/reverse-bloom.test.js`
Expected: FAIL — `plantSize` is not exported (SyntaxError on import) and `bloomReverses` is undefined.

- [ ] **Step 3: Implement**

In `src/logic.js`, export the size function (after `const sizeAt = …`):

```js
// A plant's size at an age: a mushroom's cap height (`wall` falsy) or a vine's length.
export const plantSize = (wall, age) => sizeAt(wall, age);
```

Replace `makePlant`:

```js
// A level plant may start at a `grown` fraction of grow + mature, or at an exact `age` in ticks (which wins).
// Past maturity it starts withered. `ceiling: true` makes a vine stop rising heads.
function makePlant(id, pit, { grown = 0, age, barrier = false, ceiling = false } = {}) {
  pit.plant = id;
  const start = age ?? grown * (meta.plant.growTicks + meta.plant.matureTicks);
  return { kind: 'plant', id, pit: pit.id, x: pit.x, base: pit.y, age: start, height: sizeAt(pit.wall, start), withered: start > meta.plant.growTicks + meta.plant.matureTicks, speed: 0, frozen: false, barrier, ...(ceiling && { ceiling: true }), ...(pit.wall && { wall: pit.wall }) };
}
```

Change the level plants line to `...level.plants.map((p, i) => makePlant(\`plant-${i}\`, pits[p.pit], p)),`. The two
planting callers (`makePlant(\`plant-${…}\`, pit)`) stay as they are.

In the `state` object of `makeLevel`, after `crateRespawn: …`, add:

```js
    // In a courtyard with `bloomReverses`, Bloom runs plant time backwards instead of forwards.
    bloomReverses: level.bloomReverses ?? false,
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/reverse-bloom.test.js && bun test`
Expected: PASS, whole suite green (`grown: 1` plants still start at age 1440, not withered).

- [ ] **Step 5: Commit**

```bash
git add src/logic.js tests/arena.js tests/reverse-bloom.test.js
git commit -m "Let level plants start at an exact age and carry a ceiling mark"
```

---

### Task 3: Rewinding Bloom — targeting and the cast

**Files:**
- Modify: `src/logic.js` — `canAffect` (~line 129), `abilityTargets`, `abilityCheck`, `bloomTargetAt`,
  `validateAction` ability branch (~line 336), `applyAction` Bloom cast (~line 747), flags in `makeLevel`
- Test: `tests/reverse-bloom.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/reverse-bloom.test.js`:

```js
describe('rewinding Bloom: the cast', () => {
  test('each cast lowers the speed by one and costs a charge, down to −maxSpeed', () => {
    let s = reverseArena();
    expect(s.bloomCharges).toBe(3);
    s = rewind(s); expect(plant(s).speed).toBe(-1); expect(s.bloomCharges).toBe(2);
    expect(s.events.at(-1)).toMatchObject({ kind: 'wake', rewind: true, target: 'plant-0' });
    s = rewind(s); expect(plant(s).speed).toBe(-2);
    expect(s.events.at(-1)).toMatchObject({ kind: 'grow', rewind: true });
    s.bloomCharges = 3; s = rewind(s); expect(plant(s).speed).toBe(-3);
    expect(abilityCheck(s, BLOOM, 'plant-0')).toBe('maxSpeed');
    expect(validateAction(s, 'local', { type: 'ability', actor: BLOOM, target: 'plant-0' }).error).toBe('maxSpeed');
  });

  test('in a rewinding courtyard Bloom only acts on plants; Still is unchanged', () => {
    const s = reverseArena();
    s.objects.push({ kind: 'mover', id: 'mover-0', x: 450, y: 400, w: 120, x1: 450, x2: 550, dir: 1, speed: 0, frozen: false });
    expect(abilityCheck(s, BLOOM, 'mover-0')).toBe('unsupported');
    expect(abilityCheck(s, STILL, 'mover-0')).not.toBe('unsupported');
    s.bloomReverses = false;
    expect(abilityCheck(s, BLOOM, 'mover-0')).toBe('ok');
  });

  test('rewinding the vine sets vineRewound', () => {
    let s = vineArena(); s.bloomReverses = true;
    const { growTicks } = meta.plant;
    s.objects.push({ kind: 'plant', id: 'plant-9', pit: 'pit-1', x: 760, base: 420, age: growTicks, height: plantSize(-1, growTicks), withered: false, speed: 0, frozen: false, barrier: false, wall: -1 });
    s.pits[1].plant = 'plant-9';
    Object.assign(s.actors[BLOOM], { x: 640, y: 540 });
    s = rewind(s, 'plant-9');
    expect(s.flags.vineRewound).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/reverse-bloom.test.js`
Expected: FAIL — speed becomes +1, mover is `ok`, `vineRewound` undefined.

- [ ] **Step 3: Implement**

`canAffect` takes the state (update its two callers, `abilityTargets` and `abilityCheck`):

```js
// Still's area slows anything; Bloom hastens things that have a clock of their own (not crates). In a rewinding
// courtyard Bloom's backwards time only takes hold of plants.
const canAffect = (state, actor, o) => timeObject(o) && (actor === STILL || (o.kind !== 'crate' && (!state.bloomReverses || o.kind === 'plant')));
```

The speed limit is on magnitude. In `abilityCheck`:

```js
  if (actor === BLOOM && Math.abs(o.speed) >= meta.time.maxSpeed) return 'maxSpeed';
```

In `bloomTargetAt`: `candidates.filter(o => Math.abs(o.speed) < meta.time.maxSpeed)`.
In `validateAction`: `if (Math.abs(target.speed) >= meta.time.maxSpeed) return no('maxSpeed');`.

In the Bloom branch of `applyAction` replace the last line with:

```js
      // Bloom keeps its acceleration: wake a sleeping clock, or hasten it (up to the maximum). In a rewinding
      // courtyard the same press runs it backwards, faster each time.
      const woke = o.speed === 0, step = s.bloomReverses ? -1 : 1;
      o.speed += step;
      if (s.bloomReverses && o.kind === 'plant' && o.wall) s.flags.vineRewound = true;
      event(s, woke ? 'wake' : 'grow', anchor(o).x, anchor(o).y, { caster: action.actor, target: o.id, ...(s.bloomReverses && { rewind: true }) });
```

In `makeLevel`'s `flags`, add `treeRewound: false, vineRewound: false`.

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/reverse-bloom.test.js && bun test`
Expected: PASS, suite green.

- [ ] **Step 5: Commit**

```bash
git add src/logic.js tests/reverse-bloom.test.js
git commit -m "Rewinding Bloom: casts run plant time backwards in a reversing courtyard"
```

---

### Task 4: Plants age backwards

**Files:**
- Modify: `src/logic.js` — `ageObjects` plant branch (~lines 366-386)
- Test: `tests/reverse-bloom.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('rewinding Bloom: plants age backwards', () => {
  const { growTicks, matureTicks, maxHeight } = meta.plant;

  test('a mature mushroom holds its height back through maturity, then shrinks', () => {
    let s = rewind(reverseArena({ age: 1200 }));
    s = tick(s, 240);
    expect(plant(s).age).toBeCloseTo(960);
    expect(plant(s).height).toBeCloseTo(maxHeight);
    s = tick(s, 480);
    expect(plant(s).age).toBeCloseTo(480);
    expect(plant(s).height).toBeCloseTo(maxHeight / 2);
  });

  test('a withered mushroom grows back and is alive again once it is back in maturity', () => {
    let s = rewind(reverseArena({ age: 1800 }));
    const start = plant(s).height;
    s = tick(s, 300);
    expect(plant(s).withered).toBe(true);
    expect(plant(s).height).toBeGreaterThan(start);
    s = tick(s, 100);
    expect(plant(s).withered).toBe(false);
    expect(s.events.some(e => e.kind === 'unwither')).toBe(true);
  });

  test('rewound to age 0 the plant is gone and its pit empty', () => {
    let s = rewind(reverseArena({ age: 100 }));
    s = tick(s, 101);
    expect(plant(s)).toBeUndefined();
    expect(s.pits[0].plant).toBe(null);
    expect(s.events.some(e => e.kind === 'vanish' && e.rewound)).toBe(true);
  });

  test('a Freeze Area slows the rewind to a fifth', () => {
    let s = rewind(reverseArena({ age: 1200 }));
    s.freezeAreas.push({ id: 'freeze-9', owner: 'local', x: 600, y: 420, radius: 130, ticksLeft: 600, duration: 600 });
    s = tick(s, 100);
    expect(plant(s).age).toBeCloseTo(1200 - 100 * meta.time.frozenRate);
  });

  test('a rider sinks with a shrinking cap and earns treeRewound', () => {
    let s = reverseArena({ age: 480 });
    Object.assign(s.actors[STILL], { x: 600, y: 540 - plant(s).height, vx: 0, vy: 0, grounded: true, on: 'plant-0' });
    s = rewind(s);
    s = tick(s, 60);
    expect(plant(s).height).toBeLessThan(maxHeight / 2);
    expect(s.actors[STILL].y).toBeCloseTo(540 - plant(s).height, 0);
    expect(s.actors[STILL].on).toBe('plant-0');
    expect(s.flags.treeRewound).toBe(true);
    expect(s.flags.treeLifted).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/reverse-bloom.test.js`
Expected: FAIL — negative speed is ignored (`o.speed > 0` guard).

- [ ] **Step 3: Implement**

Replace the plant branch of `ageObjects` with:

```js
    if (o.kind === 'plant' && o.speed !== 0) {
      const { growTicks, matureTicks, witherTicks } = meta.plant;
      o.age += o.speed * slow;
      const gone = o.age >= growTicks + matureTicks + witherTicks || o.age <= 0;
      if (gone) {
        state.objects = state.objects.filter(x => x !== o);
        state.pits.find(p => p.id === o.pit).plant = null;
        event(state, 'vanish', o.x, o.base - o.height, { plant: true, base: o.base, ...(o.age <= 0 && { rewound: true }) });
        continue;
      }
      // Withered past maturity; a rewinding plant that comes back into maturity is alive again.
      const past = o.age > growTicks + matureTicks;
      if (past !== o.withered) {
        o.withered = past;
        event(state, past ? 'wither' : 'unwither', o.x, o.base);
        if (past && o.barrier) state.flags.withered = true;
      }
      const rise = sizeAt(o.wall, o.age) - o.height;
      o.height += rise;
      if (rise > 0 && state.tick % 60 === 0) event(state, 'growth', o.wall ? o.x + o.wall * o.height : o.x, o.wall ? o.base : o.base - o.height);
      // A cap carries whoever stands on it, up or down; a vine only lengthens or shortens under them.
      if (rise && !o.wall) for (const p of state.actors) if (p.on === o.id && p.grounded) {
        p.y -= rise;
        if (rise > 0 && o.height > meta.plant.springHeight) state.flags.treeLifted = true;
        if (o.speed < 0) state.flags.treeRewound = true;
      }
    }
```

Check before running: the old code set `treeLifted` for any `rise` (also negative, while wilting under a rider).
Grep the tests for `treeLifted` expectations on wilting (`grep -n "treeLifted" tests/*.js`); if one expects it on a
shrinking cap, drop the `rise > 0 &&` condition and keep the old behaviour, and change the last test above to not
assert `treeLifted`.

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/reverse-bloom.test.js && bun test`
Expected: PASS, suite green.

- [ ] **Step 5: Commit**

```bash
git add src/logic.js tests/reverse-bloom.test.js
git commit -m "Plants age backwards under negative speed and vanish at age 0"
```

---

### Task 5: Ceilings

**Files:**
- Modify: `src/logic.js` — `moveActors`, the crate head-bump line (~line 517)
- Test: `tests/reverse-bloom.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
describe('ceilings', () => {
  // Jump straight up from x on the ground (y 540) and return the highest point the feet reach.
  const peak = (s, x) => {
    Object.assign(s.actors[STILL], { x, y: 540, vx: 0, vy: 0, grounded: true, on: 'platform-0' });
    s = act(s, { type: 'jump', actor: STILL });
    let top = 540;
    for (let i = 0; i < 60; i++) { s = tick(s); top = Math.min(top, s.actors[STILL].y); }
    return top;
  };

  test('a ceiling platform stops a rising head; an ordinary one lets it through', () => {
    const roofed = rootriseArena(); roofed.platforms.push({ x: 300, y: 380, w: 200, h: 40, ceiling: true });
    expect(peak(roofed, 400)).toBeGreaterThanOrEqual(420 + 52 - 0.01);
    const open = rootriseArena(); open.platforms.push({ x: 300, y: 380, w: 200, h: 40 });
    expect(peak(open, 400)).toBeLessThan(420 + 52 - 20);
  });

  test('a ceiling vine stops a rising head along its current length only', () => {
    const { growTicks } = meta.plant;
    const withVine = ceiling => {
      const s = vineArena();
      s.objects.push({ kind: 'plant', id: 'plant-9', pit: 'pit-1', x: 760, base: 420, age: growTicks, height: plantSize(-1, growTicks), withered: false, speed: 0, frozen: false, barrier: false, wall: -1, ...(ceiling && { ceiling: true }) });
      s.pits[1].plant = 'plant-9';
      return s;
    };
    // Full vine: x 520-760 at y 420, bottom 436.
    expect(peak(withVine(true), 640)).toBeGreaterThanOrEqual(436 + 52 - 0.01);
    expect(peak(withVine(false), 640)).toBeLessThan(436 + 52 - 20);
    // Beside its tip there is nothing overhead.
    expect(peak(withVine(true), 490)).toBeLessThan(436 + 52 - 20);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/reverse-bloom.test.js`
Expected: FAIL — the ceiling cases rise past the bottom.

- [ ] **Step 3: Implement**

In `moveActors`, replace the crate head-bump line
(`if (p.vy < 0) for (const c of crates) if (!inside.includes(c) && …`) with:

```js
    // Crates, platforms marked `ceiling` and thorny (`ceiling`) vines stop a rising head.
    const ceilings = [
      ...crates.filter(c => !inside.includes(c)),
      ...state.platforms.filter(f => f.ceiling),
      ...state.objects.filter(o => o.kind === 'plant' && o.wall && o.ceiling && o.height > 0).map(vineStrip),
    ];
    if (p.vy < 0) for (const c of ceilings) if (p.x + 15 > c.x && p.x - 15 < c.x + c.w && previousY - 52 >= c.y + c.h && p.y - 52 < c.y + c.h) { p.y = c.y + c.h + 52; p.vy = 0; event(state, 'collision', p.x, p.y, { actor: p.id }); }
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/reverse-bloom.test.js && bun test`
Expected: PASS, suite green.

- [ ] **Step 5: Commit**

```bash
git add src/logic.js tests/reverse-bloom.test.js
git commit -m "Ceiling platforms and thorny vines stop a rising head"
```

---

### Task 6: Fail rule `rewindNeeds`

**Files:**
- Modify: `src/logic.js` — `assessFailure` (~line 682)
- Modify: `public/strings.js:36` (`warningReasons`)
- Test: `tests/reverse-bloom.test.js` (uses the real level, so write it now and expect it to fail until Task 7)

- [ ] **Step 1: Write the failing test**

Append:

```js
describe('rewindNeeds fail rule (courtyard 4)', () => {
  const at = (s, who, x, y, on) => Object.assign(s.actors[who], { x, y, vx: 0, vy: 0, grounded: true, on });
  const fresh = () => { const s = setup({ level: 3 }); at(s, STILL, 300, 520, 'platform-0'); at(s, BLOOM, 400, 520, 'platform-0'); return s; };

  test('the tree gone with someone on the start ground is a dead end', () => {
    const s = fresh(); s.objects = s.objects.filter(o => o.id !== 'plant-0');
    expect(failureReason(s)).toBe('rewound');
    at(s, STILL, 900, 320, 'platform-1'); at(s, BLOOM, 1000, 320, 'platform-1');
    expect(failureReason(s)).toBe(null);
  });

  test('a sleeping tree with no Bloom charges left is a dead end; with a charge it is not', () => {
    const s = fresh();
    expect(failureReason(s)).toBe(null);
    s.bloomCharges = 0;
    expect(failureReason(s)).toBe('rewound');
  });

  test('the vine: asleep with no charges is a dead end; rewound away it opens the way', () => {
    const s = fresh(); at(s, STILL, 1500, 520, 'platform-3'); at(s, BLOOM, 1600, 520, 'platform-3');
    s.bloomCharges = 0;
    expect(failureReason(s)).toBe('rewound');
    s.objects = s.objects.filter(o => o.id !== 'plant-1');
    expect(failureReason(s)).toBe(null);
  });
});
```

- [ ] **Step 2: Implement**

In `assessFailure`, just before the `exitNeedsPlant` line:

```js
  // A courtyard whose way on is a plant to rewind (`rewindNeeds`): lost when someone still waits on platform `from`
  // (not standing on something higher) and the plant can no longer be rewound — gone (unless its going opens the
  // way), or asleep with no Bloom charge and no lightning left.
  const bolt = state.pickups.some(c => c.kind === 'bolt' && !c.taken);
  for (const need of level.rewindNeeds ?? []) {
    const f = state.platforms[need.from];
    if (!stuck.some(p => onLedge(f, p) && !state.platforms.some(g => g !== f && g.y < f.y && onLedge(g, p)))) continue;
    const o = find(state, need.plant);
    if (o ? o.speed === 0 && state.bloomCharges <= 0 && !bolt : !need.goneOpens) return { known: true, reason: 'rewound' };
  }
```

In `public/strings.js` `warningReasons`, after `stranded`, add:

```js
    rewound: 'Nothing is left for Bloom to rewind, so no one else can get through.',
```

- [ ] **Step 3: Commit (tests go green in Task 7)**

```bash
git add src/logic.js public/strings.js tests/reverse-bloom.test.js
git commit -m "Fail rule for courtyards that need a plant rewound"
```

---

### Task 7: The chamber

**Files:**
- Modify: `src/levels/04-withtime.js` (replace whole file)
- Create: `tests/level-four.test.js`

- [ ] **Step 1: Write the level test**

Create `tests/level-four.test.js`:

```js
import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, abilityCheck, meta } from '../src/logic.js';
import { LEVELS } from '../src/levels/index.js';

// Courtyard 4: Bloom rewinds. A dead tree in front of a low tunnel (hop in from the cap while it is about half
// height), then a thorny vine closing the shaft in front of the exit cliff (rewound, it opens a gap by the cliff).
const act = (s, a) => { expect(validateAction(s, 'local', a).valid).toBe(true); return applyAction(s, 'local', a); };
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = applyAction(s, 'local', { type: 'tick' }); return s; };
const STILL = 0, BLOOM = 1;
const level = LEVELS[3];
const [start, floor, roof, lower, block, cliff] = level.platforms;
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
  test('rewinding courtyard, six platforms in order, gate on the cliff', () => {
    const s = setup({ level: 3 });
    expect(s.bloomReverses).toBe(true);
    expect(s.width).toBe(2800);
    expect(start.y - floor.y).toBe(200);
    expect(roof.ceiling && roof.y + roof.h).toBe(261);
    expect(floor.y - (roof.y + roof.h)).toBe(59);
    expect(lower.y).toBe(520);
    expect(block.ceiling && block.y + block.h).toBe(380);
    expect(lower.y - cliff.y).toBe(140);
    expect(level.exit.y === cliff.y && level.exit.x > cliff.x).toBe(true);
    expect(s.seeds).toBe(0);
    expect(s.objects.filter(o => o.kind === 'seed' || o.kind === 'crate' || o.kind === 'mover')).toHaveLength(0);
  });

  test('the dead tree sleeps, withered and low; the vine sleeps, full and thorny', () => {
    const s = setup({ level: 3 });
    expect(get(s, 'plant-0')).toMatchObject({ speed: 0, withered: true });
    expect(get(s, 'plant-0').height).toBeLessThan(26);
    expect(get(s, 'plant-1')).toMatchObject({ speed: 0, withered: false, ceiling: true, wall: 1, x: block.x + block.w });
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
    for (const who of [STILL, BLOOM]) { s = act(s, { type: 'move', actor: who, dir: 1 }); s = act(s, { type: 'jump', actor: who }); }
    s = tick(s, 70);
    for (const who of [STILL, BLOOM]) expect(s.actors[who].on).toBe('platform-5');
    for (const who of [STILL, BLOOM]) s = act(s, { type: 'move', actor: who, dir: 0 });
    stand(s, STILL, level.exit.x - 10, cliff.y, 'platform-5'); stand(s, BLOOM, level.exit.x + 10, cliff.y, 'platform-5');
    s = tick(s, 2);
    expect(s.status).toBe('won');
  });
});
```

Two travellers jumping beside the cliff at once (x 2130 and 2140) overlap but do not collide with each other; if
the run-through is flaky there, send Still first, then Bloom.

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/level-four.test.js`
Expected: FAIL — the old chamber is still in place (`bloomReverses` false, width 1280).

- [ ] **Step 3: Write the level**

Replace `src/levels/04-withtime.js` with:

```js
export default {
  id: 'withtime',
  // Art and music by name, from public/themes.js (GROUNDS, BACKGROUNDS, MUSIC).
  theme: { ground: 'cobbleMoss', background: 'chamber4', music: 'lordOfDream' },
  // In this courtyard Bloom runs plant time backwards (Still is unchanged).
  bloomReverses: true,
  width: 2800,
  // 0 start ground; 1 tunnel floor, 200 above it (out of jumping reach); 2 the tunnel roof, 59 above the floor, so a
  // full-grown cap leaves you facing rock; 3 the lower ground past the tunnel; 4 a hanging block, its top out of
  // reach, walked under; 5 the exit cliff, 140 above the lower ground, closed off by the thorny vine.
  platforms: [
    { x: 0, y: 520, w: 760, h: 120 },
    { x: 760, y: 320, w: 640, h: 320 },
    { x: 760, y: 0, w: 640, h: 261, ceiling: true },
    { x: 1400, y: 520, w: 760, h: 120 },
    { x: 1700, y: 200, w: 220, h: 180, ceiling: true },
    { x: 2160, y: 380, w: 640, h: 260 },
  ],
  spawn: [{ x: 200, y: 520 }, { x: 270, y: 520 }],
  crates: [], seeds: [], startSeeds: 0, movers: [],
  // The dead tree (a wilted mushroom about to vanish) and the thorny vine on the hanging block's right face, fully
  // grown across the shaft to the cliff. Both pits only hold these plants.
  pits: [{ x: 640, y: 520, plantable: false }, { x: 1920, y: 370, wall: 1, plantable: false }],
  plants: [{ pit: 0, age: 1915 }, { pit: 1, age: 960, ceiling: true }],
  checkpoints: [{ x: 820, y: 320 }, { x: 1460, y: 520 }],
  // Freeze is optional: it holds the tree near half height for longer.
  freezeCharges: 1, freezePickups: [{ x: 420, y: 494 }], bloomPickups: [],
  // The tree must be rewound by anyone still on the start ground; the vine by anyone on the lower ground (once it
  // has rewound away the way is open).
  rewindNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }],
  // The shard sits above the vine's root: walk back onto the vine from the cliff before it rewinds away.
  exit: { x: 2600, y: 380 }, shards: [{ x: 1980, y: 340 }], need: ['treeRewound', 'vineRewound'],
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/level-four.test.js tests/reverse-bloom.test.js`
Expected: PASS. If a band test fails, print the cap's right edge and the traveller's path (`console.log` of
`s.actors[STILL]` each tick) and fix the layout number in both the level file and the spec — do not loosen the
test's intent (tunnel unreachable from ground and dead tree; reachable at 60/117/195; not at 235).

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: green. Tests that iterate all levels (e.g. `tests/logic.test.js` "level data", `tests/gameplay.test.js`
"no Freeze charges is not a dead end … for [1, 2, 4]") should still pass; if one assumes every level has a crate or
a seed, exclude level 3 there with a comment saying chamber 4 has neither.

- [ ] **Step 6: Commit**

```bash
git add src/levels/04-withtime.js tests/level-four.test.js
git commit -m "Chamber 4: rewind a dead tree into the tunnel and a thorny vine out of the way"
```

---

### Task 8: Words and pictures

**Files:**
- Modify: `public/strings.js:8,15,54,64-66,70`
- Modify: `public/render.js:268-272` (timeRing), `public/render.js:~334` (vine thorns), `public/render.js:821-824`
- Modify: `public/client.js:338,958`

- [ ] **Step 1: Strings**

In `public/strings.js`:
- after `ability: ['Freeze Area', 'Wake / Hasten'],` add `abilityRewind: 'Rewind',`;
- in `tapLabels` add `rewind: 'Tap · Rewind'`;
- after `targetMax: 'Full speed',` add `targetRewind: 'Rewind · F',`;
- replace the chamber 4 entry (`{ name: 'Walking with Time', … }`) with:

```js
    { name: 'Walking with Time', en: 'WITH TIME', goal: 'Rewind a dead tree into a stepping stone, then rewind a thorny vine out of your way.', lesson: 'What has been can be again.',
      hints: ['Here Bloom runs time backwards.', 'Have Bloom rewind the dead tree: it grows back to full height, then shrinks. While it is about half height, hop from its cap into the low tunnel; a Freeze Area holds it there for longer. Past the tunnel, rewind the thorny vine until a gap opens beside the cliff, and jump up through it.'] },
```

- in `flags` add `treeRewound: 'Ride a rewinding tree', vineRewound: 'Rewind the thorny vine'`.

- [ ] **Step 2: Labels in the client and renderer**

`public/client.js:338`:

```js
    document.querySelector('#ability-label').textContent = `${S.roleLabels[state.active]} · ${state.active === 1 && state.bloomReverses ? S.abilityRewind : S.ability[state.active]}`;
```

`public/client.js:950-958` (the touch skill button; the snapshot there is `view`): the aria label is cached by
`touchKey`, so add the flag to the key and use it in the label:

```js
  const rewinds = actor === 1 && !!view.bloomReverses;
  const next = `${actor}:${charges}:${interaction.kind}:${interaction.item ?? ''}:${available}:${rewinds}`;
  // …unchanged lines…
  abilityButton.setAttribute('aria-label', S.skillCount(rewinds ? S.abilityRewind : S.ability[actor], charges));
```

`public/render.js:821-824`:

```js
      const words = options.touch ? S.tapLabels : { freeze: S.targetFreeze, wake: S.targetWake, hasten: S.targetHasten, max: S.targetMax, rewind: S.targetRewind };
      if (state.active === 0) label(x, top, words.freeze);
      else if (Math.abs(selected.speed) >= meta.time.maxSpeed) label(x, top, words.max, muted);
      else label(x, top, state.bloomReverses ? words.rewind : selected.speed ? words.hasten : words.wake, gold);
```

- [ ] **Step 3: Cool ring and thorns**

`timeRing` (render.js:271): rewinding clocks turn backwards already (`t * .0012 * o.speed`); give them a cool colour:

```js
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .0012 * o.speed); ctx.setLineDash([6, 9]); circle(ctx, 0, 0, r, null, o.speed < 0 ? '#9fc4e888' : '#e1c68a88', 1.5); ctx.restore();
```

In `vine()`, right after the block that draws `vineTint` and its `ctx.restore();`, add:

```js
    // A thorny vine (a ceiling) shows thorns along its underside.
    if (o.ceiling) {
      ctx.fillStyle = '#4a5a33';
      for (let i = 10; i < L - 4; i += 18) {
        const tx = o.x + o.wall * i;
        ctx.beginPath(); ctx.moveTo(tx - 4, o.base + 14); ctx.lineTo(tx + 4, o.base + 14); ctx.lineTo(tx, o.base + 23); ctx.closePath(); ctx.fill();
      }
    }
```

- [ ] **Step 4: Run the suite**

Run: `bun test`
Expected: green (string/presentation tests may count level entries or flags; adjust only if they enumerate flag
names, adding the two new ones).

- [ ] **Step 5: Commit**

```bash
git add public/strings.js public/render.js public/client.js
git commit -m "Rewind labels, cool time ring and thorns for chamber 4"
```

---

### Task 9: Play it in the browser

- [ ] **Step 1: Start the dev server** with the preview tool (`.claude/launch.json`, `bun server.js`; add a config
  if missing — check `server.js` for the port).
- [ ] **Step 2: Open chamber 4** (unlock via the chapters list, or `setup` with level 3 through whatever debug entry
  the lobby offers; read `public/lobby.js` for how levels are chosen).
- [ ] **Step 3: Check, with screenshots:** the dead tree and tunnel read clearly; Rewind label on Bloom's ability;
  the cool ring turning backwards; the tree grows back, holds, shrinks; hopping into the tunnel at about half height
  works and at full height you face rock; the thorny vine shows thorns, bumps heads, shortens from the cliff side;
  jumping up through the gap works; the shard on the vine; the gate opens for both.
- [ ] **Step 4:** Fix anything found (with a test when it is logic), run `bun test`, commit.

---

## Notes for the implementer

- `tests/rewind.test.js` is about the *restart rewind* (playback of history), unrelated to rewinding Bloom.
- Plants in a reversing courtyard keep the same art: a rewinding mushroom picks its frame from `withered` and
  height, so it plays the wilt backwards automatically.
- The chamber 3 branch (`level-three`) also edits `makeLevel` (movers) and the same test files; expect small merge
  conflicts when either lands on `main` second.
