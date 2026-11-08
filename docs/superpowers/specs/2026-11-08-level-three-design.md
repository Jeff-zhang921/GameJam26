# Chamber 3 (afterbloom) — arrows, canyon, twin movers — design

Date: 2026-11-08

## Goal

Replace the placeholder chamber 3 with a real level in three sections, left to right:

1. **Arrows** — two launchers fire across the start area at two heights. A mushroom carries the travellers up; they
   must leave it while its cap is in the safe band between the two lanes and jump to a high ledge. Grown too far,
   it lifts them into the upper lane.
2. **Canyon** — a vine from a wall pit on the near cliff, a vertical lift in the middle, and a vine from a wall pit
   on the far cliff growing back toward it. Near vine → lift → far vine → up onto the far cliff.
3. **Twin movers** — two horizontal movers over a chasm, moving in opposite directions. Ride the first, jump to the
   second when they meet, ride it to the exit ledge.

Both travellers must reach the gate, so every section has to be crossable by both.

## Mechanics to add first

1. **Vertical movers.** A level mover may be `{ axis: 'y', x, w, y1, y2 }`; its object keeps `axis: 'y'`, `y1`,
   `y2` and moves `y` between them at the usual mover speed (`meta.time.moverSpeed` px per tick of local time).
   Riders already follow through `carryRiders` (it applies `dy`; a ceiling stops the lift carrying them through).
2. **Movers that start running, and their start side.** A level mover may set `speed` (default 0 = asleep until
   Bloom wakes it) and `dir` (default 1; `-1` starts it at `x2` / `y2` heading back). Bloom can still hasten them
   and Still can slow them.
3. **Projectile bounds by world size.** Darts and orbs are removed past `x > 1330` today (`src/enemies.js` `fly`);
   use `state.width + 50` so they fly across wide levels.
4. **Mover rider clamp check.** An old note says a rider carried into a wall gets stuck. `carryRiders` already skips
   a horizontal step into a solid; add a test that a rider carried toward a wall stops at it, and fix only if the
   test fails.

## Layout (width 3840, height 640)

Coordinates are world units; a platform's `y` is its top. Jump reach is about 160 up.

### Section 1 — arrows (x 0–1400)

- Start ground: `{ x: 0, y: 520, w: 760, h: 140 }`. Spawn at x 190 / 265.
- High ledge: `{ x: 760, y: 300, w: 640, h: 340 }` — 220 above the start, out of reach without the mushroom.
- Pillar on the high ledge: `{ x: 1180, y: 160, w: 40, h: 140 }` — stops the upper lane's darts before the canyon;
  travellers hop over it (140 tall).
- Ground pit `{ x: 600, y: 520 }` for the mushroom.
- Launchers on the left wall, firing right (a launcher's `y` is its bottom; its darts fly at `y - 20`):
  - lower lane: `{ kind: 'launcher', x: 20, y: 370, dir: [1, 0], every: 180 }` → darts at y 350;
  - upper lane: `{ kind: 'launcher', x: 20, y: 258, dir: [1, 0], every: 180 }` → darts at y 238.
  Lower-lane darts pop on the high ledge's face (x 760); upper-lane darts pop on the pillar.
- What hits a traveller on the cap (body is 52 tall above the feet; cap height h, feet at 520 − h):
  - lower lane while h is about 113–175 (crossed on the way up — time it between darts);
  - upper lane while h is about 225–287, which includes the grown mushroom (235).
  - **Safe band: h ≈ 175–225**, about 3.4 s at speed 1. From there the ledge top (300 ≙ h 220) is a short hop.
  Still's Freeze stretches the band; Bloom's hasten shrinks it. Standing on the ground or on the ledge is safe;
  a full jump on either can reach a lane.

### Section 2 — canyon (x 1400–2020)

- No floor: falling in returns the traveller to their checkpoint.
- Near wall pit `{ x: 1400, y: 330, wall: 1 }` on the high ledge's right face, 30 below its top. Bloom plants it by
  standing about 40 back from the edge and throwing almost straight down (the throw arc shows the hit). Vine 1
  spans x 1400 → 1640 at y 330 when full.
- Lift: `{ axis: 'y', x: 1660, w: 120, y1: 250, y2: 330, speed: 1, dir: -1 }` — starts at the vine-1 height and
  rises to the far-vine height, back and forth (80 px each way, 80 ticks).
- Far cliff: `{ x: 2020, y: 200, w: 480, h: 440 }`.
- Far wall pit `{ x: 2020, y: 250, wall: -1 }` on the far cliff's left face, 50 below its top. Planted by a throw
  from the lift or the tip of vine 1. Vine 2 spans x 1780 → 2020 at y 250 when full.
- Gaps: vine-1 tip to lift 20 (60 at vine length 200); lift to vine-2 tip 0–40 at length 200–240; vine 2 to the
  far cliff top is a 50 hop.
- Time pressure: vines are usable from about length 200 (800 ticks after waking at speed 1) until withering shrinks
  them below 200 (about 80 ticks into withering), roughly 12 s for both travellers. Freeze slows them; a withered
  vine frees its pit for another seed.

### Section 3 — twin movers (x 2500–3840)

- Chasm x 2500–3400, no floor.
- Mover A: `{ x1: 2520, x2: 2820, y: 200, w: 120, speed: 1 }` — starts at x1 heading right.
- Mover B: `{ x1: 2970, x2: 3270, y: 200, w: 120, speed: 1, dir: -1 }` — starts at x2 heading left.
  Equal ranges, opposite phases: they meet when A is at x2 (right edge 2940) and B at x1 (left edge 2970) — a 30 gap
  — then part again. B at x2 ends 10 short of the exit ledge.
- Exit ledge: `{ x: 3400, y: 200, w: 440, h: 440 }`, gate at x 3700.
- Freezing one mover changes their meeting point and gives more time.

### Resources and rest

- Seeds: `startSeeds: 3` (mushroom + two vines) and one lying seed at `{ x: 350, y: 510 }` as a spare.
- Bloom: the usual 3 charges (mushroom + two vines), plus a bolt on the high ledge `{ x: 1100, y: 274 }`.
- Still: `freezeCharges: 1`, hourglasses on the high ledge `{ x: 900, y: 274 }` and the far cliff `{ x: 2200, y: 174 }`.
- Checkpoints: high ledge `{ x: 820, y: 300 }`, far cliff `{ x: 2080, y: 200 }`.
- Shard: `{ x: 1720, y: 200 }`, above the lift's top stop.
- `exitNeedsPlant: true`; `need: ['treeLifted', 'moverRide']`; theme unchanged; level id stays `afterbloom`.

## Testing

- Mechanics (bun test): a vertical mover moves between y1 and y2 and carries a rider both ways; a mover with
  `speed`/`dir` starts running from the right end; a dart crosses x 1330 in a wide world; a rider carried toward a
  wall stops at it.
- Level (`tests/level-three.test.js`, in the style of `tests/level-two.test.js`): the high ledge is out of jump
  reach from the start; the safe band exists (a cap at h 200 is clear of both lanes, at 235 in the upper lane);
  lower-lane darts stop at the ledge face and upper-lane darts at the pillar; the near and far pits sit on wall
  faces; the vine/lift/vine gaps at vine length 200 are within a jump; the twin movers' closest gap is within a jump
  and they meet; the exit ledge needs crossing; a scripted run plants and uses the vines (logic-level, positions set
  directly where steering would be fragile).
- Existing tests that assume chamber 3's old size or layout are updated.
- Visual check in the browser of each section.
