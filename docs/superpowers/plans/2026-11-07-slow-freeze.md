# Slow Freeze & Rhythmic Strikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-11-07-slow-freeze-design.md`: freezing slows everything to 5% instead of stopping it, Still can hold only one creature at a time, creatures are always solid and strike whoever touches them on a fixed rhythm (with a visible wind-up), and riders are carried by anything moving under them.

**Architecture:** `src/enemies.js` gains `FROZEN_RATE`, per-kind `attackEvery` / `windup`, an `attack` timer on every enemy, `canStrike` / `attackCharge`, and `pace()` now folds in the frozen rate; `updateEnemies` no longer skips frozen enemies and returns the ids that struck this tick. `src/logic.js` scales plants, movers and loose crates by `meta.time.frozenRate` when frozen, carries riders on moving crates/enemies (`carryRiders`, wall-safe), resolves strikes after actors move (`resolveStrikes`, 2 px reach), and releases any other frozen enemy when Still freezes a new one. The renderer adds a red wind-up glow + shake (no shake in reduced motion); particles, sfx and the reduced-motion ring get a `strike` entry.

**Tech Stack:** Bun, vanilla ES modules, Canvas 2D.

**Baseline:** `main` at `a1da32c`. All patches below were generated against it, `git apply --check` passes, and the end state was run in a scratch copy: `98 pass, 0 fail`.

## File map

| File | Change |
|---|---|
| `src/enemies.js` | `FROZEN_RATE`, attack timers, `canStrike`, `attackCharge`, solid creatures, projectile-only touch hazard, frozen enemies keep updating at 5%, `updateEnemies` returns strikes |
| `src/logic.js` | `frozenRate`, slowed plants/movers/crates, `carryRiders`, `resolveStrikes`, one-frozen-creature rule |
| `tests/logic.test.js` | Frozen crate / plant / mover tests assert 5% motion |
| `tests/enemies.test.js` | Frozen enemies crawl & carry; checkpoint tests use darts; new `strikes and slow freezing` suite |
| `public/render.js` | Wind-up glow and shake, `strike` reduced-motion ring |
| `public/presentation.js`, `public/sfx.js` | `strike` particles and sound |
| `public/strings.js` | Still description and help text describe slowing and strikes |

---

### Task 1: Engine (TDD)

**Files:** `tests/logic.test.js`, `tests/enemies.test.js`, `src/enemies.js`, `src/logic.js`

- [ ] **Step 1: Update the tests** — save and `git apply` both:

````diff
--- a/tests/logic.test.js
+++ b/tests/logic.test.js
@@ -149,7 +149,7 @@
 });
 
 describe('still', () => {
-  test('freezing a thrown crate holds it in midair with its momentum stored', () => {
+  test('freezing a thrown crate slows it to a crawl along its arc, keeping its momentum', () => {
     let s = setup();
     s.actors[0].x = 350;
     s = action(s, { type: 'grab', actor: 0 });
@@ -158,10 +158,14 @@
     s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
     const before = { ...get(s, 'crate-0') };
     s = step(s, 30);
-    expect(get(s, 'crate-0')).toMatchObject({ x: before.x, y: before.y, vx: before.vx, vy: before.vy });
+    const rate = meta.time.frozenRate;
+    expect(get(s, 'crate-0').x).toBeCloseTo(before.x + before.vx * rate * 30, 5);
+    expect(get(s, 'crate-0').vx).toBe(before.vx);
+    expect(Math.abs(get(s, 'crate-0').y - before.y)).toBeLessThan(5);
+    const slowX = get(s, 'crate-0').x;
     s = action(s, { type: 'ability', actor: 0, target: 'crate-0' });
     s = step(s);
-    expect(get(s, 'crate-0').x).not.toBe(before.x);
+    expect(get(s, 'crate-0').x).toBeCloseTo(slowX + before.vx, 5);
   });
 
   test('bloom releases a crate frozen in midair and it flies on', () => {
@@ -186,18 +190,21 @@
     expect(validateAction(s, 'local', { type: 'ability', actor: 1, target: 'crate-0' }).error).toBe('bloomRange');
   });
 
-  test('freezing a plant mid-growth stops both its clock and its height', () => {
+  test('freezing a plant mid-growth slows its clock and its growth to a crawl', () => {
     let s = action(planted(), { type: 'ability', actor: 1 });
     s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 });
     s = step(s, 10);
     s = action(s, { type: 'ability', actor: 0 });
     const frozen = { ...s.objects.find(o => o.kind === 'plant') };
-    s = step(s, G);
-    expect(plantOf(s)).toMatchObject({ age: frozen.age, height: frozen.height });
+    s = step(s, G / 10);
+    expect(plantOf(s).age).toBeCloseTo(frozen.age + 3 * meta.time.frozenRate * G / 10, 5);
+    expect(plantOf(s).height).toBeGreaterThan(frozen.height);
+    expect(plantOf(s).height - frozen.height).toBeLessThan(H * 3 * G / 10 / G * 0.1);
+    const slowHeight = plantOf(s).height;
     s = action(s, { type: 'ability', actor: 1 });
     expect(plantOf(s)).toMatchObject({ frozen: false, speed: 3 });
     s = step(s, 10);
-    expect(plantOf(s).height).toBeGreaterThan(frozen.height);
+    expect(plantOf(s).height).toBeCloseTo(slowHeight + H * 3 * 10 / G, 5);
   });
 });
 
@@ -286,7 +293,7 @@
 describe('movers', () => {
   const moverLevel = () => { const s = setup({ level: 3 }); s.actors[0].x = 600; s.actors[0].y = 290; s.actors[0].on = 'mover-0'; s.actors[1].x = 450; return s; };
 
-  test('a mover rests until bloomed, carries its rider, and halts when frozen', () => {
+  test('a mover rests until bloomed, carries its rider, and crawls when frozen', () => {
     let s = step(moverLevel(), 30);
     expect(get(s, 'mover-0').x).toBe(540);
     s = action(s, { type: 'ability', actor: 1, target: 'mover-0' });
@@ -296,7 +303,8 @@
     expect(s.flags.moverRide).toBe(true);
     s = action(s, { type: 'ability', actor: 0, target: 'mover-0' });
     s = step(s, 30);
-    expect(get(s, 'mover-0').x).toBe(570);
+    expect(get(s, 'mover-0').x).toBeCloseTo(570 + 30 * meta.time.frozenRate, 5);
+    expect(s.actors[0].x).toBeCloseTo(630 + 30 * meta.time.frozenRate, 5);
   });
 
   test('blooming a moving mover speeds it up to a cap', () => {
````

````diff
--- a/tests/enemies.test.js
+++ b/tests/enemies.test.js
@@ -1,6 +1,6 @@
 import { describe, test, expect } from 'bun:test';
 import { setup, validateAction, applyAction, meta } from '../src/logic.js';
-import { ENEMY, makeEnemy, enemyBox, isHazard, miteStage } from '../src/enemies.js';
+import { ENEMY, makeEnemy, enemyBox, isHazard, miteStage, canStrike, attackCharge } from '../src/enemies.js';
 
 function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
 function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }
@@ -36,16 +36,21 @@
     expect(get(s, 'g').x).toBeLessThanOrEqual(680 - ENEMY.guard.w / 2);
   });
 
-  test('a frozen guard stops and can be stood on', () => {
+  test('a frozen guard crawls on and carries whoever stands on it', () => {
     let s = arena([{ kind: 'guard', id: 'g', x: 500, y: 540, minX: 400, maxX: 600 }], [{ x: 380 }, { x: 60 }]);
     s = action(s, { type: 'ability', actor: 0, target: 'g' });
     const x = get(s, 'g').x;
     s = step(s, 60);
-    expect(get(s, 'g').x).toBe(x);
+    const moved = Math.abs(get(s, 'g').x - x);
+    expect(moved).toBeGreaterThan(0);
+    expect(moved).toBeLessThanOrEqual(60 * ENEMY.guard.chase * meta.time.frozenRate + 1e-9);
     expect(isHazard(get(s, 'g'))).toBe(false);
-    Object.assign(s.actors[0], { x, y: 540 - ENEMY.guard.h - 1, vy: 0, grounded: false, on: null });
+    Object.assign(s.actors[0], { x: get(s, 'g').x, y: 540 - ENEMY.guard.h - 1, vy: 0, grounded: false, on: null });
     s = step(s, 3);
     expect(s.actors[0]).toMatchObject({ on: 'g', y: 540 - ENEMY.guard.h });
+    const offset = s.actors[0].x - get(s, 'g').x;
+    s = step(s, 40);
+    expect(s.actors[0].x - get(s, 'g').x).toBeCloseTo(offset, 5);
   });
 
   test('never ages on its own, and vanishes once Bloom has hastened it long enough', () => {
@@ -76,7 +81,8 @@
     const top = enemyBox(get(s, 'l')).y;
     Object.assign(s.actors[0], { x: 600, y: top - 1, vy: 0, grounded: false, on: null });
     s = step(s, 30);
-    expect(s.actors[0]).toMatchObject({ on: 'l', y: top });
+    expect(s.actors[0].on).toBe('l');
+    expect(s.actors[0].y).toBeCloseTo(enemyBox(get(s, 'l')).y, 5);
   });
 });
 
@@ -184,31 +190,29 @@
     const id = ofKind(s, 'mite')[0].id;
     s = step(s, 600);
     expect(get(s, id).age).toBe(0);
-    expect(isHazard(get(s, id))).toBe(false);
+    expect(canStrike(get(s, id))).toBe(false);
     s.actors[1].x = get(s, id).x - 150;
     s = action(s, { type: 'ability', actor: 1, target: id });
     s.actors[1].x = 120;
     s = step(s, ENEMY.mite.life * 0.5);
     expect(miteStage(get(s, id))).toBe(1);
-    expect(isHazard(get(s, id))).toBe(true);
+    expect(canStrike(get(s, id))).toBe(true);
     s = step(s, ENEMY.mite.life * 0.35);
     expect(miteStage(get(s, id))).toBe(2);
-    expect(isHazard(get(s, id))).toBe(false);
+    expect(canStrike(get(s, id))).toBe(false);
     s = step(s, ENEMY.mite.life * 0.2);
     expect(get(s, id)).toBeUndefined();
     expect(s.flags.miteGone).toBe(true);
   });
 
-  test('a frozen adult mite is a harmless block', () => {
+  test('a frozen adult mite winds up its strike twenty times slower', () => {
     let s = step(nestAt(), 60);
     const mite = get(s, ofKind(s, 'mite')[0].id);
-    mite.age = ENEMY.mite.life * 0.5; mite.speed = 1;
+    mite.age = ENEMY.mite.life * 0.5; mite.speed = 1; mite.attack = 0;
     s.actors[0].x = mite.x - 100;
     s = action(s, { type: 'ability', actor: 0, target: mite.id });
-    expect(isHazard(get(s, mite.id))).toBe(false);
-    s.actors[0].x = mite.x - 30;
-    s = step(s, 5);
-    expect(s.actors[0].x).toBe(mite.x - 30);
+    s = step(s, 100);
+    expect(get(s, mite.id).attack).toBeCloseTo(100 * 1.5 * meta.time.frozenRate, 5);
   });
 });
 
@@ -225,11 +229,11 @@
   };
 
   test('an actor touching a checkpoint lights it for both, and hits and falls return there', () => {
-    let s = withCheckpoint([{ kind: 'guard', id: 'g', x: 300, y: 540, minX: 250, maxX: 350 }], [{ x: 520 }, { x: 60 }]);
+    let s = withCheckpoint([{ kind: 'dart', id: 'd', x: 300, y: 540, dx: 1, dy: 0 }], [{ x: 520 }, { x: 60 }]);
     s = step(s);
     expect(s.checkpoint).toBe('cp-0');
     expect(s.checkpoints[0].lit).toBe(true);
-    Object.assign(s.actors[1], { x: 300, y: 540 });
+    Object.assign(s.actors[1], { x: get(s, 'd').x, y: 540 });
     s = step(s);
     expect(s.actors[1]).toMatchObject({ x: 538, y: 540 });
     Object.assign(s.actors[0], { x: 680, y: 720 });
@@ -241,23 +245,24 @@
     let s = setup({ level: 0 });
     s.actors[0].x = 330;
     s = action(s, { type: 'grab', actor: 0 });
-    s.objects.push(makeEnemy('guard', { x: 330, y: 520, minX: 300, maxX: 360 }, 'g'));
+    s.objects.push(makeEnemy('dart', { x: 330, y: 520, dx: 1, dy: 0 }, 'd'));
     s = step(s);
     expect(s.actors[0].carrying).toBe(null);
     expect(get(s, 'crate-0')).toMatchObject({ held: null, x: 330 });
     expect(s.actors[0].x).toBe(s.actors[0].spawnX);
     expect(s.actors[0].invuln).toBe(meta.time.invulnTicks);
     expect(s.actors[1].x).toBe(250);
-    Object.assign(get(s, 'g'), { x: s.actors[0].x, minX: 0, maxX: 1280 });
+    s.objects.push(makeEnemy('dart', { x: s.actors[0].x, y: 520, dx: -1, dy: 0 }, 'd2'));
     s = step(s, 10);
     expect(s.events.filter(e => e.kind === 'hit')).toHaveLength(1);
   });
 
   test('once invulnerability runs out, a hazard hits again', () => {
     const s = arena([{ kind: 'guard', id: 'g', x: 300, y: 540, minX: 0, maxX: 1280 }], [{ x: 300 }, { x: 1220 }]);
+    get(s, 'g').attack = ENEMY.guard.attackEvery - 1;
     const stay = st => { Object.assign(get(st, 'g'), { x: st.actors[0].x }); return st; };
     expect(hitsOver(s, 59, stay).hits).toBe(1);
-    expect(hitsOver(s, 70, stay).hits).toBe(2);
+    expect(hitsOver(s, ENEMY.guard.attackEvery + 5, stay).hits).toBe(2);
   });
 
   test('two actors on one dart in the same tick cost one hit event and the dart', () => {
@@ -268,7 +273,7 @@
   });
 
   test('a fall keeps the invulnerability a hit just gave', () => {
-    let s = arena([{ kind: 'guard', id: 'g', x: 300, y: 540, minX: 250, maxX: 350 }], [{ x: 300 }, { x: 1220 }]);
+    let s = arena([{ kind: 'dart', id: 'd', x: 300, y: 540, dx: 1, dy: 0 }], [{ x: 300 }, { x: 1220 }]);
     s = step(s);
     expect(s.actors[0].invuln).toBeGreaterThan(0);
     s.actors[0].y = 720;
@@ -294,5 +299,82 @@
     s = action(s, { type: 'restart' });
     expect(s.checkpoint).toBe(null);
     expect(s.checkpoints.every(c => !c.lit)).toBe(true);
+  });
+});
+
+describe('strikes and slow freezing', () => {
+  const onGuard = (extra = {}) => {
+    const s = arena([{ kind: 'guard', id: 'g', x: 500, y: 540, minX: 499, maxX: 501, ...extra }], [{ x: 500, y: 540 - ENEMY.guard.h, on: 'g' }, { x: 60 }]);
+    return s;
+  };
+  const hitCount = s => s.events.filter(e => e.kind === 'hit').length;
+
+  test('standing on a guard is safe until it strikes, then you are hit', () => {
+    let s = step(onGuard(), ENEMY.guard.attackEvery - 2);
+    expect(hitCount(s)).toBe(0);
+    expect(s.actors[0].on).toBe('g');
+    s = step(s, 3);
+    expect(hitCount(s)).toBe(1);
+    expect(s.actors[0].x).toBe(s.actors[0].spawnX);
   });
+
+  test('stepping off before the strike avoids it', () => {
+    let s = step(onGuard(), ENEMY.guard.attackEvery - 10);
+    Object.assign(s.actors[0], { x: 200, y: 540, on: 'platform-0' });
+    s = step(s, 20);
+    expect(hitCount(s)).toBe(0);
+    expect(s.events.some(e => e.kind === 'strike')).toBe(true);
+  });
+
+  test('a frozen guard takes twenty times longer to strike', () => {
+    let s = action(onGuard(), { type: 'ability', actor: 0, target: 'g' });
+    expect(get(s, 'g').frozen).toBe(true);
+    s = step(s, ENEMY.guard.attackEvery * 5);
+    expect(hitCount(s)).toBe(0);
+    expect(s.actors[0].on).toBe('g');
+    expect(get(s, 'g').attack).toBeCloseTo(ENEMY.guard.attackEvery * 5 * meta.time.frozenRate, 5);
+    s = step(s, ENEMY.guard.attackEvery * 16);
+    expect(hitCount(s)).toBe(1);
+  });
+
+  test('the wind-up charge only rises in the last moments before a strike', () => {
+    const g = makeEnemy('guard', { x: 0, y: 0, minX: 0, maxX: 0 }, 'g');
+    const { attackEvery, windup } = ENEMY.guard;
+    g.attack = attackEvery - windup - 1; expect(attackCharge(g)).toBe(0);
+    g.attack = attackEvery - windup / 2; expect(attackCharge(g)).toBeCloseTo(0.5, 5);
+    g.attack = attackEvery - 0.001; expect(attackCharge(g)).toBeCloseTo(1, 2);
+  });
+
+  test('young and old mites never wind up or strike', () => {
+    const m = makeEnemy('mite', { x: 0, y: 0, nest: 'n', homeX: 0 }, 'm');
+    expect(canStrike(m)).toBe(false);
+    m.age = ENEMY.mite.life * 0.9;
+    expect(canStrike(m)).toBe(false);
+    m.attack = 50;
+    expect(attackCharge(m)).toBe(0);
+  });
+
+  test('freezing a second enemy releases the first, while crates stay frozen', () => {
+    let s = arena([{ kind: 'guard', id: 'a', x: 400, y: 540, minX: 399, maxX: 401 }, { kind: 'guard', id: 'b', x: 600, y: 540, minX: 599, maxX: 601 }], [{ x: 500 }, { x: 60 }]);
+    s.objects.push({ kind: 'crate', id: 'c', x: 500, y: 300, vx: 0, vy: 0, frozen: false, held: null, spawnX: 500, spawnY: 300 });
+    s = action(s, { type: 'ability', actor: 0, target: 'a' });
+    s = action(s, { type: 'ability', actor: 0, target: 'c' });
+    s = action(s, { type: 'ability', actor: 0, target: 'b' });
+    expect(get(s, 'a').frozen).toBe(false);
+    expect(get(s, 'b').frozen).toBe(true);
+    expect(get(s, 'c').frozen).toBe(true);
+  });
+
+  test('an actor standing on a frozen dart drifts along with it', () => {
+    let s = arena([{ kind: 'dart', id: 'd', x: 500, y: 400, dx: -1, dy: 0 }], [{ x: 450 }, { x: 1220 }]);
+    s = action(s, { type: 'ability', actor: 0, target: 'd' });
+    const top = enemyBox(get(s, 'd')).y;
+    Object.assign(s.actors[0], { x: 500, y: top - 1, vy: 0, grounded: false, on: null });
+    s = step(s, 3);
+    expect(s.actors[0].on).toBe('d');
+    const offset = s.actors[0].x - get(s, 'd').x;
+    s = step(s, 60);
+    expect(get(s, 'd').x).toBeLessThan(500 - 60 * ENEMY.dart.fly * meta.time.frozenRate + 1);
+    expect(s.actors[0].x - get(s, 'd').x).toBeCloseTo(offset, 5);
+  });
 });
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test` — expected: the three `still`/`movers` frozen tests fail, and `tests/enemies.test.js` fails to load with `Export named 'canStrike' not found`.

- [ ] **Step 3: Implement** — save and `git apply` both:

````diff
--- a/src/enemies.js
+++ b/src/enemies.js
@@ -1,23 +1,33 @@
 // Enemy-type world objects: guards, lanterns, launchers with their darts and orbs, nests with their mites.
-// They are always active, but only age once Bloom has hastened them; Still freezes them into harmless solid blocks.
+// They are always active, but only age once Bloom has hastened them. Still slows them to FROZEN_RATE.
+// Guards, lanterns and adult mites are solid and strike whoever touches them on a fixed rhythm.
+export const FROZEN_RATE = 0.05;
 export const ENEMY = {
-  guard: { w: 40, h: 50, life: 1200, patrol: 1.2, chase: 2.6, see: 260, seeHeight: 80 },
-  lantern: { w: 44, h: 44, life: 1200, fly: 1, notice: 320, giveUp: 480, bob: 6 },
+  guard: { w: 40, h: 50, life: 1200, patrol: 1.2, chase: 2.6, see: 260, seeHeight: 80, attackEvery: 90, windup: 24 },
+  lantern: { w: 44, h: 44, life: 1200, fly: 1, notice: 320, giveUp: 480, bob: 6, attackEvery: 72, windup: 24 },
   launcher: { w: 40, h: 40, every: 180 },
   dart: { w: 36, h: 10, fly: 5 },
   orb: { w: 20, h: 20, fly: 2, turn: Math.PI / 60, life: 360 },
   nest: { w: 60, h: 30, every: 300, max: 3 },
-  mite: { life: 900, roam: 120, walk: [0.6, 1.4, 0], see: 80 },
+  mite: { life: 900, roam: 120, walk: [0.6, 1.4, 0], see: 80, attackEvery: 54, windup: 24 },
 };
 const MITE_SIZE = [[0, 36, 30], [0.35, 36, 30], [0.45, 44, 40], [0.75, 44, 40], [0.85, 40, 34], [1, 40, 34]];
 
 export const isEnemy = o => Object.hasOwn(ENEMY, o.kind);
-export const pace = o => 1 + 0.5 * o.speed;
+export const pace = o => (1 + 0.5 * o.speed) * (o.frozen ? FROZEN_RATE : 1);
 export const lifeFraction = o => ENEMY[o.kind].life ? Math.min(1, o.age / ENEMY[o.kind].life) : 0;
 export const miteStage = o => { const f = lifeFraction(o); return f < 0.4 ? 0 : f < 0.8 ? 1 : 2; };
-export const isHazard = o => isEnemy(o) && !o.frozen && (['guard', 'lantern', 'dart', 'orb'].includes(o.kind) || (o.kind === 'mite' && miteStage(o) === 1));
+const isProjectile = o => o.kind === 'dart' || o.kind === 'orb';
+export const isHazard = o => isProjectile(o) && !o.frozen;
 export const isMoving = o => isEnemy(o) && !o.frozen && ['guard', 'lantern', 'dart', 'orb', 'mite'].includes(o.kind);
 export const isSolidEnemy = o => isEnemy(o) && !isHazard(o);
+export const canStrike = o => o.kind === 'guard' || o.kind === 'lantern' || (o.kind === 'mite' && miteStage(o) === 1);
+// 0 when idle, rising to 1 over the wind-up before a strike.
+export const attackCharge = o => {
+  if (!canStrike(o)) return 0;
+  const { attackEvery, windup } = ENEMY[o.kind];
+  return Math.max(0, (o.attack - (attackEvery - windup)) / windup);
+};
 
 function miteSize(o) {
   const f = lifeFraction(o);
@@ -36,7 +46,7 @@
 }
 
 export function makeEnemy(kind, data, id) {
-  const base = { kind, id, x: data.x, y: data.y, speed: 0, age: 0, frozen: false, timer: 0 };
+  const base = { kind, id, x: data.x, y: data.y, speed: 0, age: 0, frozen: false, timer: 0, attack: 0 };
   if (kind === 'guard') return { ...base, minX: data.minX, maxX: data.maxX, dir: 1, chasing: false };
   if (kind === 'lantern') return { ...base, homeX: data.x, homeY: data.y, chasing: false, bob: 0 };
   if (kind === 'launcher') return { ...base, dx: data.dir[0], dy: data.dir[1], every: data.every ?? ENEMY.launcher.every, shot: data.shot ?? 'dart' };
@@ -50,6 +60,7 @@
 const center = o => { const b = enemyBox(o); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
 
 export function updateEnemies(state, { event, nextId }) {
+  const strikes = [];
   const remove = o => { state.objects = state.objects.filter(x => x !== o); };
   const spawn = (kind, data) => { const o = makeEnemy(kind, data, nextId(kind)); state.objects.push(o); return o; };
   const nearest = (o, ok = () => true) => {
@@ -76,9 +87,9 @@
     }
   };
   for (const o of [...state.objects]) {
-    if (!isEnemy(o) || o.frozen || !state.objects.includes(o)) continue;
-    const spec = ENEMY[o.kind], k = pace(o);
-    const rate = o.kind === 'orb' ? Math.max(1, o.speed) : o.speed;
+    if (!isEnemy(o) || !state.objects.includes(o)) continue;
+    const spec = ENEMY[o.kind], k = pace(o), slow = o.frozen ? FROZEN_RATE : 1;
+    const rate = (o.kind === 'orb' ? Math.max(1, o.speed) : o.speed) * slow;
     if (spec.life && rate) {
       o.age += rate;
       if (o.age >= spec.life) {
@@ -87,6 +98,13 @@
         continue;
       }
     }
+    if (canStrike(o)) {
+      o.attack += k;
+      if (o.attack >= spec.attackEvery) {
+        o.attack -= spec.attackEvery; strikes.push(o.id);
+        const b = enemyBox(o); event(state, 'strike', b.x + b.w / 2, b.y + b.h / 2);
+      }
+    } else o.attack = 0;
     if (o.kind === 'guard') {
       const p = state.actors.filter(a => Math.abs(a.y - o.y) <= spec.seeHeight && Math.abs(a.x - o.x) <= spec.see && (o.chasing || Math.sign(a.x - o.x) === o.dir)).sort((a, b) => Math.abs(a.x - o.x) - Math.abs(b.x - o.x))[0];
       o.chasing = !!p;
@@ -118,7 +136,7 @@
       const near = nearest(o);
       if (near) {
         const c = center(o), cur = Math.atan2(o.dy, o.dx), want = Math.atan2(near.p.y - 26 - c.y, near.p.x - c.x);
-        const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), a = cur + Math.max(-spec.turn, Math.min(spec.turn, diff));
+        const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), a = cur + Math.max(-spec.turn * slow, Math.min(spec.turn * slow, diff));
         o.dx = Math.cos(a); o.dy = Math.sin(a);
       }
       fly(o, spec);
@@ -143,4 +161,5 @@
       else if (!walk(o, o.dir * spec.walk[stage] * k, inRoam)) o.dir = -o.dir;
     }
   }
+  return strikes;
 }
````

````diff
--- a/src/logic.js
+++ b/src/logic.js
@@ -1,10 +1,10 @@
-import { makeEnemy, updateEnemies, enemyBox, isEnemy, isHazard, isMoving, isSolidEnemy } from './enemies.js';
+import { makeEnemy, updateEnemies, enemyBox, isEnemy, isHazard, isMoving, isSolidEnemy, FROZEN_RATE } from './enemies.js';
 import { LEVELS } from './levels/index.js';
 
 export const meta = {
   name: 'CLOCKBLOOM', minPlayers: 1, maxPlayers: 2, tickRate: 60,
   controls: { speed: 4.2, airSpeed: 4.8, jump: -12.5, springJump: -15.3, gravity: 0.48, fallGravity: 0.8, maxFall: 16, jumpCut: 0.45, coyote: 7, jumpBuffer: 7, range: 420, reach: 95, pitReach: 50 },
-  time: { moverSpeed: 1, maxSpeed: 3, rewinds: 3, hintTicks: 90 * 60, invulnTicks: 60 },
+  time: { moverSpeed: 1, maxSpeed: 3, rewinds: 3, hintTicks: 90 * 60, invulnTicks: 60, frozenRate: FROZEN_RATE },
   plant: { maxHeight: 235, springHeight: 45, growTicks: 960, matureTicks: 480, witherTicks: 480 },
 };
 const STILL = 0, BLOOM = 1;
@@ -141,9 +141,10 @@
 
 function ageObjects(state) {
   for (const o of [...state.objects]) {
-    if (o.kind === 'plant' && !o.frozen && o.speed > 0) {
+    const slow = o.frozen ? meta.time.frozenRate : 1;
+    if (o.kind === 'plant' && o.speed > 0) {
       const { growTicks, matureTicks, witherTicks } = meta.plant;
-      o.age += o.speed;
+      o.age += o.speed * slow;
       if (o.age >= growTicks + matureTicks + witherTicks) {
         state.objects = state.objects.filter(x => x !== o);
         state.pits.find(p => p.id === o.pit).plant = null;
@@ -159,9 +160,9 @@
         if (o.height > meta.plant.springHeight) state.flags.treeLifted = true;
       }
     }
-    if (o.kind === 'mover' && !o.frozen && o.speed > 0) {
+    if (o.kind === 'mover' && o.speed > 0) {
       const before = o.x;
-      o.x += o.dir * o.speed * meta.time.moverSpeed;
+      o.x += o.dir * o.speed * meta.time.moverSpeed * slow;
       if (o.x >= o.x2) { o.x = o.x2; o.dir = -1; } else if (o.x <= o.x1) { o.x = o.x1; o.dir = 1; }
       const dx = o.x - before;
       for (const p of state.actors) if (p.on === o.id && p.grounded && dx) { p.x += dx; state.flags.moverRide = true; }
@@ -179,9 +180,8 @@
       o.x = p.x + p.facing * (crate ? 37 : 22); o.y = p.y - (crate ? 53 : 40); o.vx = 0; o.vy = 0;
       continue;
     }
-    if (o.frozen) continue;
-    const previous = o.y + half;
-    o.vy += 0.3; o.x += o.vx; o.y += o.vy;
+    const k = o.frozen ? meta.time.frozenRate : 1, previous = o.y + half;
+    o.vy += 0.3 * k; o.x += o.vx * k; o.y += o.vy * k;
     for (const f of all) if (f.id !== o.id) if (o.vy >= 0 && previous <= f.y + 3 && o.y + half >= f.y && o.x + half > f.x && o.x - half < f.x + f.w) {
       if (o.vy > 1) event(state, crate ? 'crateLand' : 'seedLand', o.x, f.y);
       o.y = f.y - half; o.vy = 0; o.vx *= 0.88;
@@ -266,16 +266,39 @@
   p.vx = 0; p.vy = 0; p.grounded = true; p.on = 'ground'; p.jumpHeld = false; p.jumpCut = true; p.jumpBuffer = 0;
   p.invuln = kind === 'hit' ? meta.time.invulnTicks : p.invuln;
   event(state, 'return', p.x, p.y, { actor: p.id });
+}
+
+// Actors standing on a crate or enemy move with it, but are never pushed into a wall.
+function carryRiders(state, before) {
+  for (const p of state.actors) {
+    const o = p.grounded && find(state, p.on), from = o && before.get(o.id);
+    if (!from) continue;
+    const dx = o.x - from[0], dy = o.y - from[1];
+    p.y += dy;
+    const x = Math.max(22, Math.min(1258, p.x + dx));
+    if (!state.platforms.some(f => rectOverlap({ x: x - 15, y: p.y - 52, w: 30, h: 51 }, f) && p.y > f.y + 9)) p.x = x;
+  }
 }
 
+function resolveStrikes(state, strikes) {
+  for (const id of strikes) {
+    const o = find(state, id); if (!o) continue;
+    const b = enemyBox(o), reach = { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 };
+    for (const p of state.actors) if (p.invuln <= 0 && rectOverlap({ x: p.x - 15, y: p.y - 52, w: 30, h: 51 }, reach)) respawn(state, p, 'hit');
+  }
+}
+
 function tick(state) {
   remember(state);
   state.tick++;
   if (state.started) state.elapsed++;
+  const before = new Map(state.objects.filter(o => o.kind === 'crate' || isEnemy(o)).map(o => [o.id, [o.x, o.y]]));
   ageObjects(state);
-  updateEnemies(state, { event, nextId: kind => `${kind}-${state.nextEnemy++}` });
+  const strikes = updateEnemies(state, { event, nextId: kind => `${kind}-${state.nextEnemy++}` });
   moveItems(state);
+  carryRiders(state, before);
   moveActors(state);
+  resolveStrikes(state, strikes);
   const done = state.needs.filter(key => state.flags[key]).length;
   if (done > state.needsDone) { state.needsDone = done; state.lastProgressTick = state.elapsed; }
   if (done === state.needs.length && state.actors.some(p => Math.abs(p.x - state.exit.x) < 46 && Math.abs(p.y - state.exit.y) < 55)) {
@@ -339,7 +362,10 @@
   }
   if (action.type === 'ability') {
     const o = targetFor(s, action.actor, action);
-    if (action.actor === STILL) { o.frozen = !o.frozen; event(s, o.frozen ? 'freeze' : 'unfreeze', anchor(o).x, anchor(o).y); }
+    if (action.actor === STILL) {
+      if (!o.frozen && isEnemy(o)) for (const other of s.objects) if (other !== o && other.frozen && isEnemy(other)) { other.frozen = false; event(s, 'unfreeze', anchor(other).x, anchor(other).y); }
+      o.frozen = !o.frozen; event(s, o.frozen ? 'freeze' : 'unfreeze', anchor(o).x, anchor(o).y);
+    }
     else if (o.frozen) { o.frozen = false; if (o.speed === 0) o.speed = 1; event(s, 'unfreeze', anchor(o).x, anchor(o).y); }
     else { const woke = o.speed === 0; o.speed++; event(s, woke ? 'wake' : 'grow', anchor(o).x, anchor(o).y); }
   }
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test` — expected: `98 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src tests docs/superpowers/specs
git commit -m "feat: freezing slows to 5%, creatures strike on a rhythm, one frozen creature at a time"
```

---

### Task 2: Wind-up, strike feedback and copy

**Files:** `public/render.js`, `public/presentation.js`, `public/sfx.js`, `public/strings.js`

- [ ] **Step 1: Save and `git apply` all four**

````diff
--- a/public/render.js
+++ b/public/render.js
@@ -1,5 +1,5 @@
 import { canopyWidth, meta } from '../src/logic.js';
-import { enemyBox, lifeFraction, miteStage, isEnemy } from '../src/enemies.js';
+import { enemyBox, lifeFraction, miteStage, isEnemy, attackCharge } from '../src/enemies.js';
 import { createCamera, createParticles, worldPoint } from './presentation.js';
 
 export function createRenderer(canvas, S) {
@@ -140,10 +140,12 @@
     circle(ctx, cp.x, cp.y - 38, 7, cp.lit ? '#f4e2a6' : '#2c5050', cp.lit ? gold : '#8aa89b', 1.5);
     circle(ctx, cp.x + 3, cp.y - 40, 5, cp.lit ? '#e9cf86' : '#3d6563');
   }
-  function enemy(o, targeted, t) {
+  function enemy(o, targeted, t, reduced) {
     const b = enemyBox(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2, f = lifeFraction(o);
     ctx.save(); ctx.globalAlpha = f > .9 ? 1 - (f - .9) / .1 * .6 : 1;
     timeRing(cx, cy, Math.max(b.w, b.h) / 2 + 12, o, t);
+    const charge = attackCharge(o);
+    if (charge > 0) { glow(ctx, cx, cy, Math.max(b.w, b.h) * (.8 + charge * .6), `rgba(255, 110, 80, ${.15 + .35 * charge})`); if (!reduced) ctx.translate(Math.sin(t * .08) * 2.5 * charge, 0); }
     const ice = o.frozen ? '#bceef0' : null;
     if (o.kind === 'guard') {
       ctx.fillStyle = '#3d4f58'; ctx.beginPath(); ctx.roundRect(b.x, b.y + 6, b.w, b.h - 6, 8); ctx.fill();
@@ -225,7 +227,7 @@
     for (const o of state.objects) if (o.kind === 'crate' && o.held === null) crate(o, o.id === target && state.active === 0, t);
     for (const o of state.objects) if (o.kind === 'seed' && o.held === null) seed(o, t);
     const flying = o => !o.frozen && ['dart', 'orb', 'lantern'].includes(o.kind);
-    for (const o of state.objects) if (isEnemy(o) && !flying(o)) enemy(o, o.id === target, t);
+    for (const o of state.objects) if (isEnemy(o) && !flying(o)) enemy(o, o.id === target, t, options.reduced);
     for (const actorState of state.actors) {
       const inv = actorState.invuln > 0;
       if (inv && !options.reduced && !options.paused && Math.floor(state.tick / 4) % 2) continue;
@@ -233,7 +235,7 @@
       actor(actorState, actorState.id, actorState.id === state.active, t); ctx.globalAlpha = 1;
     }
     for (const o of state.objects) if (o.held !== undefined && o.held !== null) o.kind === 'crate' ? crate(o, false, t) : seed(o, t);
-    for (const o of state.objects) if (isEnemy(o) && flying(o)) enemy(o, o.id === target, t);
+    for (const o of state.objects) if (isEnemy(o) && flying(o)) enemy(o, o.id === target, t, options.reduced);
     for (const kind of ['ambient', 'dust', 'crystal', 'leaf', 'spark']) {
       ctx.beginPath();
       for (const p of effects.particles) {
@@ -249,7 +251,7 @@
       ctx.fill();
     }
     if (options.reduced) for (const e of state.events) {
-      if (state.tick - e.tick < 12 && ['freeze', 'unfreeze', 'wake', 'grow', 'plant', 'shard', 'win', 'hit', 'checkpoint'].includes(e.kind)) circle(ctx, e.x, e.y, 22, null, e.kind === 'hit' ? '#ffb3a1' : ['freeze', 'unfreeze'].includes(e.kind) ? cyan : gold, 2);
+      if (state.tick - e.tick < 12 && ['freeze', 'unfreeze', 'wake', 'grow', 'plant', 'shard', 'win', 'hit', 'checkpoint', 'strike'].includes(e.kind)) circle(ctx, e.x, e.y, 22, null, e.kind === 'hit' ? '#ffb3a1' : e.kind === 'strike' ? '#ff8a6a' : ['freeze', 'unfreeze'].includes(e.kind) ? cyan : gold, 2);
     }
     const selected = state.objects.find(o => o.id === target);
     if (state.status === 'playing' && selected) {
````

````diff
--- a/public/presentation.js
+++ b/public/presentation.js
@@ -69,6 +69,7 @@
   shard: { kind: 'spark', color: '#fff2a9', count: 22, speed: 100, life: .8 },
   win: { kind: 'spark', color: '#fff2b8', count: 24, speed: 130, life: 1.25 },
   hit: { kind: 'spark', color: '#ffb3a1', count: 20, speed: 110, life: .7 },
+  strike: { kind: 'spark', color: '#ff9b7a', count: 16, speed: 120, life: .4 },
   checkpoint: { kind: 'spark', color: '#f4e2a6', count: 16, speed: 70, life: .9 },
   pop: { kind: 'dust', color: '#e8deb6', count: 8, speed: 40, life: .35 },
   spawn: { kind: 'dust', color: '#c9b58a', count: 10, speed: 45, life: .5 },
````

````diff
--- a/public/sfx.js
+++ b/public/sfx.js
@@ -74,7 +74,7 @@
     plant: [260, 520, .25, .025], vanish: [330, 80, .45, .02],
     shard: [880, 1760, .45, .025], win: [392, 784, .8, .03],
     return: [180, 440, .35, .02], rewind: [800, 200, .5, .025],
-    hit: [300, 90, .35, .035], checkpoint: [523, 1046, .5, .025],
+    hit: [300, 90, .35, .035], checkpoint: [523, 1046, .5, .025], strike: [260, 70, .18, .04],
   };
   const profile = profiles[kind]; if (!profile) return;
   const [from, to, duration, volume] = profile;
````

````diff
--- a/public/strings.js
+++ b/public/strings.js
@@ -3,7 +3,7 @@
   start: 'Let Time Bloom', continue: 'Continue Journey', chapter: 'CHAMBER', chapters: 'Courtyards',
   intro: 'In a forgotten greenhouse, nothing moves until you touch it.', introBody: 'Bloom sets time flowing and hurries it along. Still holds any moment in place. One clock, two hands.',
   solo: 'Solo · Switch Roles', coop: 'Local Co-op', mode: 'Play Mode',
-  roleNames: ['Stillkeeper', 'Bloomkeeper'], roleLabels: ['STILL', 'BLOOM'], roleDescriptions: ['Freezes anything in time — even midair — until released.', 'Starts an object\'s clock, hurries it onward, and releases what Still holds.'],
+  roleNames: ['Stillkeeper', 'Bloomkeeper'], roleLabels: ['STILL', 'BLOOM'], roleDescriptions: ['Slows anything to a crawl — even midair — until released. Holds one creature at a time.', 'Starts an object\'s clock, hurries it onward, and releases what Still holds.'],
   current: 'Active', switchRole: 'Switch Role', ability: ['Freeze / Release', 'Wake / Hasten'],
   move: 'Move', jump: 'Jump', grab: 'Pick Up / Throw / Plant', touchGrab: 'Interact', skills: 'Skills', rewind: 'Rewind 3s', restart: 'Reset Courtyard',
   hintReady: 'A new courtyard whisper is ready. Open the leaf for a hint.',
@@ -12,7 +12,7 @@
   seeds: 'Seeds', rewinds: 'Rewinds', time: 'Time', best: 'Best', clear: 'Cleared in',
   complete: 'Time flows once more.', completeBody: 'Every moment you borrowed grew into a path that led you to each other.',
   chamberComplete: 'You rewrote this moment.', chamberCompleteBody: 'The courtyard bells draw a little closer.',
-  helpTitle: 'Make Time Your Tool', helpBody: 'Nothing ages until Bloom wakes it, and once awake it never stops on its own — only Still can hold it. Each press of Bloom makes time flow faster. A planted seed grows steadily taller, lifting whoever stands on it, then withers and vanishes. Creatures move on their own but only age once Bloom hastens them; frozen, they become harmless blocks. A hit sends you back to the last moon lamp you lit.',
+  helpTitle: 'Make Time Your Tool', helpBody: 'Nothing ages until Bloom wakes it, and once awake it never stops on its own — only Still can slow it to a crawl. Each press of Bloom makes time flow faster. A planted seed grows steadily taller, lifting whoever stands on it, then withers and vanishes. Creatures can be stood on, but they strike on a rhythm — they glow red just before. Still slows anything to a crawl, strikes included, but holds only one creature at a time. Darts and orbs hit on touch unless slowed. Creatures only age once Bloom hastens them. A hit sends you back to the last moon lamp you lit.',
   keys: [['A / D', 'Move'], ['Space', 'Tap for a short hop, hold for a full jump. Young sprouts launch you higher.'], ['E', 'Pick up, throw a crate, plant a seed in a pit, or set a seed down'], ['F', 'Use your timekeeper’s ability'], ['Tab', 'Switch between the two roles'], ['Shift + Tab', 'Focus the toolbar'], ['R', 'Rewind the world about three seconds (limited)'], ['Esc', 'Pause / Resume']],
   coopKeys: 'In co-op, the Stillkeeper uses A / D, W, E, F; the Bloomkeeper uses ← / →, ↑, Enter, L.',
   targetFreeze: 'Freeze · F', targetRelease: 'Release · F', targetWake: 'Wake · F', targetHasten: 'Hasten · F', targetMax: 'Full speed',
````

- [ ] **Step 2: Check syntax and tests**

Run: `for f in public/render.js public/presentation.js public/sfx.js public/strings.js; do cp $f /tmp/chk.mjs && node --check /tmp/chk.mjs; done && bun test` — expected: no syntax errors, `98 pass`.

---

### Task 3: Verify in the browser and commit

- [ ] **Step 1: Start a throwaway server** on a free port (do not touch the user's 4173): `PORT=4195 bun server.js &`

- [ ] **Step 2: Save this driver as `/tmp/mc-shot/slow.mjs`** (Playwright is installed in `/tmp/mc-shot`; change `4173` to your port):

```js
import { chromium } from 'playwright';
const b = await chromium.launch(); const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(e.message)); p.on('response', r => r.status() >= 400 && errs.push(`HTTP ${r.status()} ${r.url()}`));
await p.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({ level: 4, unlocked: 0, reduced: false })));
await p.goto('http://127.0.0.1:4173/'); await p.getByTestId('start').click(); await p.waitForTimeout(2600);
const guard = () => p.evaluate(() => { const g = window.__moonclock.snapshot().objects.find(o => o.kind === 'guard'); return { x: +g.x.toFixed(2), attack: +g.attack.toFixed(2), frozen: g.frozen }; });
// pause the sim and step manually so we can catch the wind-up
await p.evaluate(() => window.__moonclock.dispatch({ type: 'pause' }));
await p.evaluate(() => { const m = window.__moonclock; m.dispatch({ type: 'pause' }); for (let i = 0; i < 400; i++) { const g = m.snapshot().objects.find(o => o.kind === 'guard'); if (g.attack > 85) break; m.dispatch({ type: 'tick' }); } m.dispatch({ type: 'pause' }); });
console.log('charging guard', JSON.stringify(await guard()));
await p.waitForTimeout(150); await p.screenshot({ path: '/tmp/mc-shot/slow-charge.png', clip: { x: 0, y: 380, width: 640, height: 300 } });
await p.evaluate(() => { const m = window.__moonclock; m.dispatch({ type: 'pause' }); m.dispatch({ type: 'ability', actor: 0, target: m.snapshot().objects.find(o => o.kind === 'guard').id }); });
const g0 = await guard(); await p.evaluate(() => window.__moonclock.dispatch({ type: 'tick', count: 120 })); const g1 = await guard();
console.log('frozen guard before/after 120 ticks', JSON.stringify(g0), JSON.stringify(g1));
await p.waitForTimeout(150); await p.screenshot({ path: '/tmp/mc-shot/slow-frozen.png', clip: { x: 0, y: 380, width: 640, height: 300 } });
console.log('errors', JSON.stringify(errs)); await b.close();
```

Run it. Expected:
- `charging guard` with `attack` above 85 and `frozen: false`
- `frozen guard before/after 120 ticks`: x moved by about `120 × 1.2 × 0.05 ≈ 7` px (not 0, not ~144), and the attack timer advanced by about 6 (it may wrap past 90 and restart once)
- `errors []` (an `.mp3` 404 is fine only if the scratch copy lacks `public/audio`)

- [ ] **Step 3: Look at `/tmp/mc-shot/slow-charge.png` and `slow-frozen.png`** — a red halo around the guard while charging; cyan ring and ice crystals while frozen with a `Release · F` label.

- [ ] **Step 4: Stop only your server and commit**

```bash
git add public docs/superpowers/plans/2026-11-07-slow-freeze.md
git commit -m "feat: wind-up glow, strike effects and slow-freeze copy"
```
