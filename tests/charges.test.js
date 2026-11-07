import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, atExit } from '../src/logic.js';

const act = (s, a) => applyAction(s, 'local', a);
const send = (s, type, actor, extra = {}) => {
  const action = { type, actor, ...extra };
  expect(validateAction(s, 'local', action)).toEqual({ valid: true });
  return act(s, action);
};
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = act(s, { type: 'tick' }); return s; };
const crate = s => s.objects.find(o => o.id === 'crate-0');

// Run right, jump, and jump again the moment you land on the crate, until you stand on `goal`.
function hop(s, who, goal, limit = 260) {
  s = send(s, 'move', who, { dir: 1 }); s = send(s, 'jump', who);
  let stepped = false;
  for (let i = 0; i < limit; i++) {
    s = tick(s);
    const p = s.actors[who];
    if (!stepped && p.on === 'crate-0') { stepped = true; s = act(s, { type: 'jumpRelease', actor: who }); s = act(s, { type: 'jump', actor: who }); }
    if (p.on === goal || s.status === 'won') break;
  }
  if (s.status === 'won') return s; // reaching the gate beside your partner ends the courtyard
  s = act(s, { type: 'move', actor: who, dir: 0 }); s = act(s, { type: 'jumpRelease', actor: who });
  expect(s.actors[who].on).toBe(goal);
  return s;
}
const walkTo = (s, who, x) => { for (let i = 0; i < 600 && Math.abs(s.actors[who].x - x) > 3; i++) { s = act(s, { type: 'move', actor: who, dir: Math.sign(x - s.actors[who].x) }); s = tick(s); } return act(s, { type: 'move', actor: who, dir: 0 }); };

describe('starting Freeze charges are enough for every crossing that needs them', () => {
  test('courtyard 1: both travellers cross the broken bridge with the two starting charges', () => {
    let s = setup({ level: 0 });
    expect(s.freezeCharges).toBe(2);
    // Still throws, casts on the crate, and Bloom (ready at the edge) crosses on it.
    s.actors[0].x = 300; s = send(s, 'grab', 0);
    s.actors[0].x = 418; s.actors[1].x = 400;
    s = send(s, 'grab', 0); s = tick(s, 6);
    s = send(s, 'ability', 0, { x: crate(s).x, y: crate(s).y });
    s = hop(s, 1, 'platform-1');
    // The crate falls away and returns to the start; Still fetches it, throws, casts, and crosses alone.
    for (let i = 0; i < 800 && !(crate(s).held === null && crate(s).vy === 0 && crate(s).y < 500); i++) s = tick(s);
    s = walkTo(s, 0, crate(s).x - 40); s = send(s, 'grab', 0);
    s = walkTo(s, 0, 418); s = send(s, 'grab', 0); s = tick(s, 14);
    s = send(s, 'ability', 0, { x: crate(s).x + 100, y: crate(s).y - 30 });
    s = hop(s, 0, 'platform-1');
    expect(s.freezeCharges).toBe(0);
    // Both walk to the moon gate together.
    for (let i = 0; i < 300 && s.status === 'playing'; i++) {
      for (const who of [0, 1]) if (!atExit(s, s.actors[who])) s = act(s, { type: 'move', actor: who, dir: Math.sign(s.exit.x - s.actors[who].x) || 1 });
      else s = act(s, { type: 'move', actor: who, dir: 0 });
      s = tick(s);
    }
    expect(s.status).toBe('won');
  });

  test('courtyard 4: the last rift takes one cast per traveller, and the starting two suffice', () => {
    let s = setup({ level: 3 });
    expect(s.freezeCharges).toBe(2);
    const mover = s.objects.find(o => o.kind === 'mover');
    Object.assign(mover, { x: mover.x2, speed: 0 });
    const ride = (who, x) => Object.assign(s.actors[who], { x, y: mover.y, on: mover.id, grounded: true, facing: 1 });
    // Still rides the platform's far end with the crate: throw, cast, cross.
    ride(0, mover.x2 + 118); ride(1, mover.x2 + 20);
    Object.assign(crate(s), { held: 0 }); s.actors[0].carrying = 'crate-0'; s = tick(s);
    s = send(s, 'grab', 0); s = tick(s, 14);
    s = send(s, 'ability', 0, { x: crate(s).x + 140, y: crate(s).y });
    s = hop(s, 0, 'platform-1');
    // Bloom brings the returned crate back up (mushroom + platform, abbreviated here) and throws it;
    // Still casts the second area from the far ledge, which is within reach.
    // (That trip takes far longer than an area lasts, so the first area is long gone by then.)
    for (let i = 0; i < 1200 && (s.freezeAreas.length || !(crate(s).held === null && crate(s).vy === 0 && crate(s).y < 500)); i++) s = tick(s);
    ride(1, mover.x2 + 118);
    Object.assign(crate(s), { held: 1 }); s.actors[1].carrying = 'crate-0'; s = tick(s);
    s = send(s, 'grab', 1); s = tick(s, 14);
    const at = { x: crate(s).x + 140, y: crate(s).y };
    expect(Math.hypot(at.x - s.actors[0].x, at.y - (s.actors[0].y - 30))).toBeLessThanOrEqual(meta.freeze.range);
    s = send(s, 'ability', 0, at);
    s = hop(s, 1, 'platform-1');
    expect(s.freezeCharges).toBe(0);
    expect(s.status === 'won' || s.actors[1].on === 'platform-1').toBe(true);
  });

  test('every courtyard starts with one or two charges; crystals add spares', () => {
    const counts = [0, 1, 2, 3, 4].map(level => { const s = setup({ level }); return [s.freezeCharges, s.pickups.filter(c => c.kind === 'frost').length]; });
    expect(counts).toEqual([[2, 1], [1, 0], [1, 1], [2, 1], [2, 2]]);
  });
});
