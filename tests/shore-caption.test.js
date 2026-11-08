import { describe, test, expect } from 'bun:test';
import { createShoreCaption } from '../public/shore-caption.js';
import { setup, applyAction, validateAction } from '../src/logic.js';

function onBank() {
  const state = setup({ level: 0 });
  for (const actor of state.actors) Object.assign(actor, { x: 850, y: 430, grounded: true, on: 'platform-1' });
  return state;
}
const tick = state => applyAction(state, 'local', { type: 'tick' });

describe('first crossing subtitle', () => {
  test('waits for both players to stand on the far bank', () => {
    const caption = createShoreCaption(), state = onBank();
    state.actors[1].x = 400;
    expect(caption.update(state)).toBeNull();
    state.actors[1].x = 850; state.actors[1].grounded = false;
    expect(caption.update(state)).toBeNull();
    state.actors[1].grounded = true;
    expect(caption.update(state)).toEqual({ progress: 0 });
  });

  test('the arrival cue leaves movement, jumps and simulation running', () => {
    const caption = createShoreCaption();
    let state = onBank();
    const before = structuredClone(state);
    expect(caption.update(state)).not.toBeNull();
    expect(state).toEqual(before);
    const move = { type: 'move', actor: 0, dir: 1 };
    expect(validateAction(state, 'local', move).valid).toBe(true);
    state = applyAction(state, 'local', move);
    for (let i = 0; i < 30; i++) {
      state = tick(state);
      expect(caption.update(state)).not.toBeNull();
    }
    expect(state.tick).toBe(before.tick + 30);
    expect(state.actors[0].x).toBeGreaterThan(before.actors[0].x);
    expect(state.status).toBe('playing');
    const jump = { type: 'jump', actor: 0 };
    expect(validateAction(state, 'local', jump).valid).toBe(true);
    state = tick(applyAction(state, 'local', jump));
    expect(state.actors[0].y).toBeLessThan(430);
  });

  test('expires once, survives pauses and resets with a new attempt', () => {
    const caption = createShoreCaption(), state = onBank();
    caption.update(state, { sceneKey: 1 });
    state.tick = 120;
    expect(caption.update(state, { sceneKey: 1, enabled: false })).toBeNull();
    expect(caption.update(state, { sceneKey: 1 }).progress).toBeCloseTo(1 / 3);
    state.tick = 360;
    expect(caption.update(state, { sceneKey: 1 })).toBeNull();
    state.tick = 400;
    expect(caption.update(state, { sceneKey: 1 })).toBeNull();
    expect(caption.update(state, { sceneKey: 2 })).toEqual({ progress: 0 });
  });

  test('reaching the gate clears the subtitle and holds the level until next is requested', () => {
    const caption = createShoreCaption();
    let state = onBank();
    caption.update(state);
    for (const actor of state.actors) actor.x = state.exit.x;
    state = tick(state);
    expect(state.status).toBe('won');
    expect(caption.update(state)).toBeNull();
    for (let i = 0; i < 120; i++) state = tick(state);
    expect(state.level).toBe(0);
    expect(state.status).toBe('won');
    state = applyAction(state, 'local', { type: 'next' });
    expect(state.level).toBe(1);
    expect(state.status).toBe('playing');
  });
});
