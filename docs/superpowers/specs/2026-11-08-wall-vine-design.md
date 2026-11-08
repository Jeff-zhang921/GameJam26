# Wall pits and vines — design

Date: 2026-11-08

## Goal

A pit can sit on a vertical wall. Bloom throws a seed into it; a vine grows horizontally out of the wall and
travellers can stand on it. The vine lives and dies like a mushroom and responds to both time powers.

## Approach

A vine is a `plant` whose pit is on a wall. It shares the mushroom's lifecycle code (age, grow / mature / wither,
freeze, hasten, targeting, the "stranded" failure check); only its standable surface, its side collision and its
drawing differ. A separate object kind was rejected because it would duplicate all of that.

## Level data

A pit may carry `wall: 1 | -1`: the pit sits on a wall face and the vine grows toward +x (`1`) or −x (`-1`).
`x` is the wall face, `y` the height of the vine's top surface. Ground pits are unchanged.

```js
pits: [{ x: 640, y: 560 }, { x: 400, y: 380, wall: 1 }]
```

Runtime pits copy `wall` through. A plant made in a wall pit gets `wall` copied onto it as well, so later code
reads `o.wall` without looking up the pit.

## Vine behaviour (src/logic.js)

- `meta.vine = { maxLength: 240 }`. Length uses the same timing as a mushroom (`growTicks`, `matureTicks`,
  `witherTicks`): it grows from 0 to `maxLength`, holds, then shrinks back to 0 while withered and vanishes,
  freeing the pit. The plant's `height` field holds the vine's length and `ageObjects` is reused. A vine's length
  comes from its own function: `min(age, growTicks) / growTicks × maxLength` while growing and mature, then
  `maxLength × (1 − witherProgress)` while withered (linear; the mushroom's die-sheet curve does not apply).
  Bounding boxes that use `canopyWidth` (targeting, surfaces) take a vine branch instead.
- Standable surface (in `surfaces`): `{ x: wall === 1 ? o.x : o.x - length, y: o.base, w: length, h: 16 }` — a
  one-way top like every other surface. No spring: vines never bounce.
- No stem box: a vine is not solid from the side, so `stemBoxes` skips vines.
- Riders: a growing vine needs no special handling (the surface widens under them). A shrinking vine drops
  anyone left past its tip through normal physics.
- Freeze slows its growth to the frozen rate, as for a mushroom; Hasten speeds it, both via the existing `speed` / `frozen` fields.
- The ancient-mushroom flags (`treeLifted`, barrier wither) stay mushroom-only.

## Throwing a seed

### Rules (src/logic.js)

- New action `{ type: 'takeSeed', actor }`. Valid only for Bloom, with `state.seeds > 0`, hands free, status
  playing. Effect: `state.seeds--`, a seed object is created held by Bloom (`held: BLOOM`, `p.carrying = id`),
  event `seedTake`.
- A held seed is thrown with the existing `grab` action (`aim` optional), the same path as a crate:
  `throwLaunch`, `throwPath`, `attachHeld` all handle a seed (`attachHeld` places it at the hand).
- A held seed is dropped when Bloom is hit, as a crate is.
- `interactionFor` reports `'throw'` while Bloom carries a seed.
- Planting by throw: during `moveItems`, a seed in flight (`thrown: true`, set when thrown, cleared when it lands
  or returns) whose centre comes within 24 px of an
  empty, plantable pit (ground or wall) is removed and a plant is created in that pit (event `plant`). For a wall
  pit the test point is `(pit.x + wall * 10, pit.y)`.
- A seed that lands elsewhere stays loose; Bloom picks it up by touch (`seeds++`), as now. A seed leaving the
  world returns to its spawn point, as now. A taken seed's spawn point is where it was taken.

### Input (public/client.js)

- Desktop: when E / Enter is pressed and `interactionFor` is not `'throw'`, start a 300 ms hold timer instead of
  dispatching at once. Released before 300 ms → dispatch `grab` as today (plant beside a ground pit, pick up a
  crate). Held 300 ms with Bloom able to take a seed → dispatch `takeSeed` and start the existing mouse throw aim
  (`startMouseAim('throw', code, actor)`); releasing the key throws.
- Touch: the interact button gets the same 300 ms hold. Held long enough → dispatch `takeSeed` and start the
  existing `throwAim` on that pointer, so dragging aims and releasing throws (or cancels over the cancel button,
  which keeps the seed in hand).
- A short press keeps every current behaviour unchanged.

## Drawing (public/render.js)

- New sprite `public/sprites/vine.png` copied from `picture/tool/vine.png`: a 4×2 sheet of 8 frames
  (443.5 × 443.5 cells), the vine growing rightward from the cell's left edge. Frame = round(length / maxLength
  × 7). The frame's art is stretched horizontally to exactly the surface width and drawn with its top on the
  surface; mirrored for `wall: -1`.
- Withered: frames play in reverse with the length, tinted toward dry yellow-brown (`source-atop` tint like the
  snail).
- Wall pit: `pit.png` rotated 90° and drawn flat against the wall face at the pit's height.
- The time ring and targeting label use the vine's centre.

## Online

`takeSeed` goes through `validateAction` / `applyAction`, which `src/rooms.js` already calls, so the server needs
no change beyond the logic.

## Testing

- Logic (bun test): a seed thrown at a wall pit plants a vine; the vine's length grows over time and an actor can
  stand on it; frozen, it grows at the frozen rate; after withering it vanishes and the pit is empty again; a missed seed
  can be picked up and the count restored; `takeSeed` is rejected for Still, with no seeds, or with hands full.
- Visual: a wall pit added to a test layout and checked by eye in the browser.

## Out of scope

Placing wall pits in the real levels (level design is separate), climbing animations, vine-specific sounds.
