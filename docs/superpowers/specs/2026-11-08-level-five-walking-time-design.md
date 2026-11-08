# Chamber 5 — In Step with Time (walking time)

The hidden last courtyard. Time here keeps the travellers' pace.

## Rule

- Every time object in the courtyard belongs to one traveller and wears their colour: **teal = Still** (`walker: 0`),
  **gold = Bloom** (`walker: 1`).
- Each tick, an object's clock moves by its walker's own horizontal steps of the previous tick (`actor.stride`, px,
  right positive) times its `pace`. Walking right runs its time on, walking left runs it back, standing still stops it.
- Only the traveller's own walking counts (in the air included). Being carried by a platform or a cap, walking into
  a wall and respawning move nothing.
- Playing alone, Tab switches traveller; the one not controlled stands still, so the same rule holds.
- Abilities are off: no Freeze or Hasten charges, no pickups. Bloom's ability never targets a pace-keeping object.

Consequence: you cannot drive what you ride, so each traveller crosses on the partner's colour.

## Objects

- **Movers** (`walker`, `pace`): the run is back-and-forth over time (`moverAt` maps the clock to a position), so
  rewinding plays the same back-and-forth backwards. Pace 1 = the platform moves exactly as far as its walker walks.
- **Plants** (`walker`, `pace`): age moves with the clock, clamped between `meta.walk.minAge` (a sprout still showing)
  and the end of the wilt. A pace-keeping plant never vanishes; walking back revives a husk.
- Rendering: a dashed ring in the walker's colour that turns with the object's own clock (it spins backwards when
  time does); mover rims and hubs in the walker's colour. A 7-second notice explains the rule on entry.

## Layout (2560 wide)

| Part | What |
|---|---|
| Start ground x 0-760, y 520 | Gold sprout in a pit at x 110, pace 2; shard at (110, 250): Still on the cap while Bloom walks right. |
| Rift x 760-1280 | 520 wide, unjumpable. Teal ferry y 470 and gold ferry y 570, both w 140, run x 760-1140, start at the start ground. |
| Far ground x 1280-2560, y 520 | Checkpoint at x 1330. |
| Plateau x 1740-2260, y 100, h 60, ceiling | Moon gate at x 2000. Gold lift on the left (x 1650, w 80), teal lift on the right (x 2270, w 80), both y 100-470, starting at the bottom. |

Intended route: Bloom boards the teal ferry, Still walks right to carry Bloom over; Bloom walks the gold ferry back,
Still steps down onto it, Bloom walks it over. Still rides the gold lift up while Bloom walks, then walks on the
plateau to bring the teal lift down and up again for Bloom.

Room to walk: every ledge a walker drives from is wider than half the run of what they drive, so whatever happened
before, one walk there sweeps it end to end (tests/level-five.test.js "room to walk").

Not exploit-proof: with both ferries in one rift, clever solo combinations exist; that is fine for an easter egg.
The old enemy showcase lives on as `trialsArena` in tests/arena.js.
