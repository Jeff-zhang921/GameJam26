# Chamber 4 (withtime) — rewinding Bloom, dead tree, thorn-vine lid — design

Date: 2026-11-08

## Goal

Replace the placeholder chamber 4 with a level built around one new rule: **in this chamber Bloom runs time
backwards.** Still is unchanged (Freeze Areas slow local time, including rewinding time). Two sections, left to
right:

1. **Dead tree** — a withered mushroom ("dead tree") sits in front of a cliff with a low tunnel. Rewound, it grows
   back up and later shrinks; only while its cap is around half height can a traveller step or hop into the tunnel.
2. **Thorn-vine lid** — a fully grown vine closes the top of a shaft in front of the exit cliff and cannot be jumped
   through from below. Rewound, it shortens from its tip and opens a gap by the cliff to jump up through.

Both travellers must reach the gate. All old placeholder content (crates, mover, frozen-crate crossing) goes.

## Mechanics to add first

1. **Rewinding Bloom (`bloomReverses: true` on a level).** Bloom's cast lowers a plant's `speed` by 1 instead of
   raising it (0 → −1 → −2 → −3; `meta.time.maxSpeed` caps the magnitude). It costs a Bloom charge as usual. The
   cast keeps the event kinds `wake` / `grow` (so sound and effects keep working), with `{ rewind: true }` in the event.
   - In such a level Bloom can only target plants (no movers, creatures exist here; keep the rule explicit).
   - `abilityCheck` / validation use `Math.abs(o.speed) >= maxSpeed` for `maxSpeed`.
2. **Plants age backwards.** `ageObjects` already does `o.age += o.speed * slow`; let it run with negative speed:
   - Height/length still come from `sizeAt(wall, age)`, so the life plays in reverse: wilt → full → shrinking.
   - `withered` is recomputed both ways: when age drops back to `growTicks + matureTicks` or below, the plant is
     alive again (`withered = false`, stem solid again), with an `unwither` event (returning to maturity).
   - The cap moves riders by `rise` in both directions (already the case: `if (rise && !o.wall)`); `treeLifted` is
     only set on positive rise, unchanged.
   - When `age <= 0` the plant is removed and its pit emptied, event `vanish` with `{ plant: true, rewound: true }`. No seed comes back.
   - Freeze Areas slow rewinding the same way (`slow = frozenRate`).
3. **Initial plant age.** A level plant may give `age` (ticks) instead of `grown`; `age` wins when both are set.
   A plant whose `age` is past `growTicks + matureTicks` starts `withered: true`.
4. **Ceilings.** A platform or plant with `ceiling: true` stops a rising traveller's head, with the same rule crates
   use today (`previousY - 52 >= bottom && p.y - 52 < bottom` → `p.y = bottom + 52`, `vy = 0`, `collision` event).
   For a vine the bottom is `base + 16` over the vine strip's current x-range. Ordinary platforms and vines keep
   letting you jump up through them.
5. **Fail detection for rewinding (`rewindNeeds` on a level).** A list of `{ plant, from, goneOpens? }`: plant id and the platform
   index a traveller is stuck on until that plant has been rewound. `goneOpens: true` marks a plant whose vanishing
   opens the way (the vine), so its disappearance is not a failure. A traveller standing on a higher platform than
   `from` does not count as waiting there. The courtyard is lost (`reason: 'rewound'`) when
   a traveller is still on platform `from` (by `onLedge`, not at the gate) and either the plant is gone (unless `goneOpens`), or it is
   still asleep (`speed === 0`) and Bloom has no charges and no bolt can still be collected. New string:
   `rewound: 'The tree has rewound into nothing, so no one else can reach the tunnel.'`
6. **Visuals.** A rewinding plant shows reversed growth particles (moving inward/downward) and a cool tint; the Bloom
   cast shows a counter-clockwise swirl. HUD/tooltip for Bloom in this chamber reads "Rewind" instead of "Bloom".

## Timings (speed −1, frozen ×0.2)

Plant life: grow 0–960, mature 960–1440, wilt 1440–1920. Mushroom max height 235; vine max length 240.

- Dead tree starts at `age: 1915` (wilt progress ≈ 0.99) → cap height ≈ 23.
- Rewound: wilting plays backwards (1915 → 1440, about 8 s) with the cap rising 23 → 235; it holds 235 through
  maturity (1440 → 960, 8 s); then it shrinks 235 → 0 (960 → 0, 16 s) and vanishes.
- Vine starts at `age: 960` (just fully grown, length 240): rewound it shortens 0.25 px per tick at once —
  length 180 after 4 s, gone after 16 s.

## Layout (width 2800, height 640)

Coordinates are world units; a platform's `y` is its top. Jump reach is about 156.5 up (−12.5, gravity 0.48); a
traveller is 30 wide and 52 tall.

### Platforms, in this order

0 start ground, 1 tunnel floor, 2 tunnel roof, 3 lower ground, 4 hanging block, 5 exit cliff (the indices are used
by `rewindNeeds` and fail detection).

### Section 1 — dead tree (x 0–1400)

- Start ground: `{ x: 0, y: 520, w: 760, h: 120 }` (platform 0). Spawn at x 200 / 270.
- Pit `{ x: 640, y: 520, plantable: false }` with plant `{ pit: 0, age: 1915 }` (the dead tree, asleep).
- Tunnel floor (cliff): `{ x: 760, y: 320, w: 640, h: 320 }` — 200 above the start ground, out of jump reach.
- Tunnel roof: `{ x: 760, y: 0, w: 640, h: 261, ceiling: true }` — the tunnel is 59 tall (body 52).
- Who gets in, by cap height h (feet at 520 − h):
  - h < ≈ 35: a jump falls short of the floor at 320 (a jump from the cap at h 23 peaks 9 px short of the step-up line).
  - ≈ 35 ≤ h < 191: hop in (the roof stops the head; on the way down, step onto the floor).
  - 191 ≤ h ≤ 207: walk straight in (feet within 9 of the floor, head below the roof at 261).
  - h > 207 (incl. the full 235): the body overlaps the roof face, so the traveller cannot move in.
  The working band is roughly "half height". On the way up through the wilt it lasts about 5 s, on the way down
  about 11 s; a Freeze Area on the tree stretches either by 5×.
- Freeze: `freezeCharges: 1`, plus an hourglass on the start ground `{ x: 420, y: 494 }`.
- Checkpoint inside the tunnel `{ x: 820, y: 320 }`.
- Shard: none here.

### Section 2 — thorn-vine lid (x 1400–2800)

- Lower ground: `{ x: 1400, y: 520, w: 760, h: 120 }` — the travellers drop out of the tunnel onto it.
- Hanging block: `{ x: 1700, y: 200, w: 220, h: 180, ceiling: true }` — bottom at 380, so the travellers walk
  under it; its top (200) is out of reach from the ground and from the tunnel floor (125 up, 300 across).
- Wall pit on its right face: `{ x: 1920, y: 370, wall: 1, plantable: false }` with plant `{ pit: 1, age: 960, ceiling: true }`. Full
  length 240 spans x 1920 → 2160, closing the shaft x 1920–2160 at y 370.
- Exit cliff: `{ x: 2160, y: 380, w: 640, h: 260 }` — 140 above the ground (a normal jump would reach it).
- With the full vine a jump from the shaft floor bumps its head at feet ≈ 438, below the cliff top — no way up.
  Once the vine is 180 or shorter, the gap x 2100–2160 (60 wide) lets a traveller jump up beside the cliff
  (apex feet ≈ 363) and step onto it.
- Checkpoint on the lower ground `{ x: 1460, y: 520 }`.
- Shard `{ x: 1980, y: 340 }` above the vine root: only reachable by walking back onto the vine from the cliff top
  before the vine has rewound away (optional).
- Gate: `exit: { x: 2600, y: 380 }`.

### Resources and rest

- Seeds: `startSeeds: 0`, no lying seeds (planting is pointless when every cast rewinds).
- Bloom: the usual 3 charges (tree, vine, one spare); no bolt.
- `bloomReverses: true`, `rewindNeeds: [{ plant: 'plant-0', from: 0 }, { plant: 'plant-1', from: 3, goneOpens: true }]`
  (platform 3 is the lower ground). No `exitNeedsPlant`, no `crossingNeedsFreeze`.
- New flags: `treeRewound` (a traveller stands on the tree while its speed is negative) and `vineRewound` (the vine
  has been rewound). `need: ['treeRewound', 'vineRewound']`.
- Strings in `public/strings.js` for the new flags and the rewind rule. `public/task-hints.js` only covers chambers 1–2;
  chamber 4 uses the level hint strings only.
- Both pits are `plantable: false`: they only hold the level's own plants.
- Theme unchanged; level id stays `withtime`.

## Testing

- Mechanics (bun test, fixed arenas in `tests/arena.js` so later map edits don't break them):
  - with `bloomReverses`, a cast sets speed −1, a second −2, a fourth is refused (`maxSpeed`), each costs a charge;
  - a rewinding plant's age falls and its height follows the reversed life (wilt → 235 → shrink); `withered` turns
    false when it passes back into maturity; at age 0 it is removed and the pit emptied;
  - a Freeze Area makes the rewind 5× slower;
  - a rider on a shrinking cap goes down with it;
  - a plant given `age` starts at that age (withered if past maturity);
  - a `ceiling: true` platform and a `ceiling: true` vine stop a rising head; an ordinary one does not;
  - `rewindNeeds` reports `rewound` when the tree is gone with someone on the start ground, and when it is asleep with
    no Bloom charges; nothing once everyone is past.
- Level (`tests/level-four.test.js`, in the style of `tests/level-three.test.js`):
  - the tunnel floor is out of jump reach from the start ground and from the dead tree at age 1915;
  - a scripted traveller on the cap gets into the tunnel at h 117 and h 200, and not at h 235 (nor at h 23);
  - with the full vine a jump from the shaft floor cannot reach the cliff top; with the vine at 180 it can;
  - the hanging block's top and the vine top are out of reach from the lower ground and from the tunnel floor;
  - a logic-level run: rewind the tree, both travellers enter the tunnel, rewind the vine, both jump up, both reach
    the gate (positions set directly where steering would be fragile).
- Existing tests that assume chamber 4's old layout (crates, mover, `crossingNeedsFreeze`) are updated.
- Visual check in the browser of both sections.
