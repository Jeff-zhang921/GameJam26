import { describe, test, expect } from 'bun:test';
import { setup, applyAction, validateAction, meta, atExit } from '../src/logic.js';
import { withtimeArena } from './arena.js';

const act = (s, a) => applyAction(s, 'local', a);
const send = (s, type, actor, extra = {}) => {
  const action = { type, actor, ...extra };
  expect(validateAction(s, 'local', action)).toEqual({ valid: true });
  return act(s, action);
};
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = act(s, { type: 'tick' }); return s; };
const crate = (s, id = 'crate-0') => s.objects.find(o => o.id === id);

// Run right, jump, and jump again the moment you land on a crate, until you stand on `goal`.
function hop(s, who, goal, runup = 0) {
  s = send(s, 'move', who, { dir: 1 }); s = tick(s, runup); s = send(s, 'jump', who);
  let stepped = false;
  for (let i = 0; i < 260; i++) {
    s = tick(s);
    const p = s.actors[who];
    if (!stepped && String(p.on).startsWith('crate')) { stepped = true; s = act(s, { type: 'jumpRelease', actor: who }); s = act(s, { type: 'jump', actor: who }); }
    if (p.on === goal || s.status === 'won') break;
  }
  if (s.status === 'won') return s; // reaching the gate beside your partner ends the courtyard
  s = act(s, { type: 'move', actor: who, dir: 0 }); s = act(s, { type: 'jumpRelease', actor: who });
  expect(s.actors[who].on).toBe(goal);
  return s;
}
// Walk to `x`, hopping over anything (a resting crate) that stops you, and stand there.
function walkTo(s, who, x) {
  for (let i = 0, stuck = 0; i < 600 && (Math.abs(s.actors[who].x - x) > 3 || !s.actors[who].grounded); i++) {
    const from = s.actors[who].x;
    s = act(s, { type: 'move', actor: who, dir: Math.sign(x - from) });
    // A full jump: hold it while airborne, release once back on the ground.
    if (s.actors[who].grounded) s = act(s, stuck > 1 ? { type: 'jump', actor: who } : { type: 'jumpRelease', actor: who });
    s = tick(s);
    stuck = s.actors[who].x === from ? stuck + 1 : 0;
  }
  return act(act(s, { type: 'move', actor: who, dir: 0 }), { type: 'jumpRelease', actor: who });
}
const settle = (s, limit = 600) => { for (let i = 0; i < limit && s.actors.some(p => !p.grounded); i++) s = tick(s); return s; };

describe('starting Freeze charges are enough for every crossing that needs them', () => {
  test('courtyard 1: a crate and a cast per traveller cross the gap, the ancient mushroom is aged away, a new one lifts both to the gate', () => {
    let s = setup({ level: 0 });
    expect(s).toMatchObject({ freezeCharges: 2, seeds: 0 });
    // Still throws the first crate and casts on it; Bloom (ready at the edge) crosses on it to the long ledge.
    s.actors[0].x = 300; s = send(s, 'grab', 0);
    expect(s.actors[0].carrying).toBe('crate-0');
    s.actors[0].x = 375; s.actors[1].x = 385;
    s = send(s, 'grab', 0); s = tick(s, 6);
    s = send(s, 'ability', 0, { x: crate(s).x, y: crate(s).y });
    // Take a few steps before jumping so the first leap catches the moving crate past the edge.
    s = hop(s, 1, 'platform-2', 4);
    // Once the first area has faded, Still fetches the second crate, throws it, casts and crosses alone.
    for (let i = 0; i < 700 && s.freezeAreas.length; i++) s = tick(s);
    s = walkTo(s, 0, 130); s = send(s, 'grab', 0);
    expect(s.actors[0].carrying).toBe('crate-1');
    s = walkTo(s, 0, 375); s = send(s, 'grab', 0); s = tick(s, 6);
    s = send(s, 'ability', 0, { x: crate(s, 'crate-1').x, y: crate(s, 'crate-1').y });
    s = hop(s, 0, 'platform-2', 6);
    expect(s.freezeCharges).toBe(0);
    s = settle(tick(s, 300));
    // On the long ledge, Still collects the hourglass and Bloom the seed.
    s = walkTo(s, 0, 900);
    expect(s.freezeCharges).toBe(1);
    s = walkTo(s, 1, 1000);
    expect(s.seeds).toBe(1);
    // The ancient mushroom blocks the way until Bloom ages it: it wilts at once and lets them pass.
    s = send(s, 'ability', 1, { target: 'plant-0' }); s = tick(s, 2);
    expect(s.flags.withered).toBe(true);
    // Bloom plants the seed in the far pit and wakes it with both standing on it; they ride it up and jump to the gate's ledge.
    s = walkTo(s, 1, 1530); s = send(s, 'grab', 1);
    expect(s.seeds).toBe(0);
    s = walkTo(s, 0, 1540); s = tick(s, 3);
    s = send(s, 'ability', 1, { target: 'plant-1' });
    for (let i = 0; i < 2000 && s.objects.find(o => o.id === 'plant-1').height < 130; i++) s = tick(s);
    expect(s.actors.map(p => p.on)).toEqual(['plant-1', 'plant-1']);
    expect(s.flags.treeLifted).toBe(true);
    for (const who of [0, 1]) { s = send(s, 'move', who, { dir: 1 }); s = send(s, 'jump', who); }
    s = settle(tick(s, 2));
    expect(s.actors.map(p => p.on)).toEqual(['platform-1', 'platform-1']);
    for (let i = 0; i < 300 && s.status === 'playing'; i++) {
      for (const who of [0, 1]) {
        s = act(s, { type: 'jumpRelease', actor: who });
        s = act(s, { type: 'move', actor: who, dir: atExit(s, s.actors[who]) ? 0 : Math.sign(s.exit.x - s.actors[who].x) || 1 });
      }
      s = tick(s);
    }
    expect(s.status).toBe('won');
  });

  test('courtyard 4: the last rift takes one cast per traveller, and the starting two suffice', () => {
    let s = withtimeArena();
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
    expect(counts).toEqual([[2, 1], [1, 2], [1, 1], [2, 1], [2, 2]]);
  });
});
