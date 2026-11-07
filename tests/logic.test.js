import { describe, test, expect } from 'bun:test';
import { setup, validateAction, applyAction, isGameOver, viewFor } from '../src/logic.js';

function step(state, n = 1) { for (let i = 0; i < n; i++) state = applyAction(state, 'local', { type: 'tick' }); return state; }
function action(state, value) { expect(validateAction(state, 'local', value).valid).toBe(true); return applyAction(state, 'local', value); }

describe('time manipulation', () => {
  test('freeze suspends a thrown crate with its stored momentum intact', () => {
    let s = setup();
    s.actors[0].x = 350;
    s = action(s, { type: 'grab', actor: 0 });
    s = action(s, { type: 'grab', actor: 0 });
    s = step(s, 12);
    s = action(s, { type: 'ability', actor: 0 });
    const before = { x: s.crates[0].x, y: s.crates[0].y, vx: s.crates[0].vx, vy: s.crates[0].vy };
    s = step(s, 30);
    expect({ x: s.crates[0].x, y: s.crates[0].y, vx: s.crates[0].vx, vy: s.crates[0].vy }).toEqual(before);
    s = action(s, { type: 'ability', actor: 0 });
    s = step(s);
    expect(s.crates[0].x).not.toBe(before.x);
  });

  test('tree growth lifts an actual rider and decay opens the obstruction', () => {
    let s = setup({ level: 1 });
    const tree = s.trees[0];
    s.actors[0].x = tree.x; s.actors[0].y = tree.y; s.actors[0].on = tree.id;
    s.actors[1].x = tree.x - 100;
    s = action(s, { type: 'ability', actor: 1 }); s = step(s, 45);
    expect(s.actors[0].y).toBeCloseTo(445, 5);
    expect(s.flags.treeLifted).toBe(true);
    s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 }); s = action(s, { type: 'ability', actor: 1 });
    expect(s.trees[0].age).toBe(4); expect(s.flags.decayed).toBe(true);
    s = action(s, { type: 'ability', actor: 1, reverse: true });
    expect(s.trees[0].age).toBe(3);
  });

  test('an afterimage keeps a pressure plate held when its owner leaves', () => {
    let s = setup({ level: 3 });
    s = action(s, { type: 'echo', actor: 1 });
    s = action(s, { type: 'move', actor: 1, dir: 1 }); s = step(s, 35);
    expect(s.actors[1].x).toBeGreaterThan(350);
    expect(s.plates[0].lit).toBe(true); expect(s.flags.echoPlate).toBe(true);
    s = action(s, { type: 'echo', actor: 1 }); s = step(s);
    expect(s.plates[0].lit).toBe(false);
  });

  test('rewind restores world state and leaves valid collectible and plate state', () => {
    let s = setup({ level: 3 }); s = step(s, 10);
    s = action(s, { type: 'echo', actor: 1 }); s = action(s, { type: 'move', actor: 1, dir: 1 }); s = step(s, 80);
    s = action(s, { type: 'rewind' }); s = step(s);
    expect(s.echoes).toHaveLength(0); expect(s.flags.echoPlate).toBe(false); expect(s.shards[0].taken).toBe(false); expect(s.plates[0].lit).toBe(true);
  });

  test('room boundaries reject malformed, unauthorized and out-of-range actions', () => {
    const s = setup({ players: ['one', 'two'] });
    expect(validateAction(s, 'one', { type: 'move', actor: 1, dir: 1 }).valid).toBe(false);
    expect(validateAction(s, 'two', { type: 'tick' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'ability', actor: 0, target: 'tree-0' }).valid).toBe(false);
    expect(validateAction(s, 'one', { type: 'move', actor: 0, dir: Infinity }).valid).toBe(false);
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
