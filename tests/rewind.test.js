import { describe, test, expect } from 'bun:test';
import { setup, applyAction } from '../src/logic.js';
import { rootriseArena, trialsArena } from './arena.js';
import { createHistory, compactFrame, rewindFrame, easeRewind, REWIND } from '../public/rewind.js';

const act = (s, a) => applyAction(s, 'local', a);
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) s = act(s, { type: 'tick' }); return s; };

describe('rewind history', () => {
  test('a long session stays within a fixed number of frames and memory, yet always spans start to now', () => {
    // The creature trials have the most moving parts (creatures, darts, orbs, mites). Play ~8 minutes.
    let s = trialsArena();
    const history = createHistory();
    history.reset(s);
    s = act(s, { type: 'move', actor: 0, dir: 1 });
    let peak = 0;
    for (let i = 0; i < 30000; i++) {
      s = act(s, { type: 'tick' });
      history.record(s);
      if (i % 5000 === 0) peak = Math.max(peak, history.bytes());
    }
    peak = Math.max(peak, history.bytes());
    expect(history.frames.length).toBeLessThanOrEqual(REWIND.capacity);
    expect(history.frames[0].tick).toBe(0);
    expect(s.tick - history.frames[history.frames.length - 1].tick).toBeLessThan(history.stride * 2);
    expect(peak).toBeLessThan(1_000_000); // well under 1 MB of serialised history, however long the run
    const ticks = history.frames.map(f => f.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  test('restarting or changing courtyard starts a fresh history', () => {
    let s = setup({ level: 0 });
    const history = createHistory();
    history.reset(s);
    s = tick(s, 50); history.record(s);
    expect(history.frames.length).toBeGreaterThan(1);
    history.record(act(s, { type: 'restart' }));
    expect(history.frames.map(f => f.tick)).toEqual([0]);
    history.record(act(s, { type: 'level', level: 2 }));
    expect(history.frames).toHaveLength(1);
    expect(history.frames[0].level).toBe(2);
  });
});

describe('rewind playback', () => {
  test('rewind keeps each traveller\'s saved checkpoint and restores the unsaved start', () => {
    const s = setup({ level: 4 }), start = compactFrame(s);
    s.tick = 10;
    s.actors[0].checkpoint = 'cp-0'; s.actors[1].checkpoint = 'cp-1';
    s.checkpoints.forEach(cp => { cp.lit = true; });
    const frames = [start, compactFrame(s)];
    expect(rewindFrame(frames, 0).actors.map(p => p.checkpoint)).toEqual(['cp-0', 'cp-1']);
    expect(rewindFrame(frames, 1).actors.map(p => p.checkpoint)).toEqual([null, null]);
    expect(rewindFrame(frames, 1).checkpoints.every(cp => !cp.lit)).toBe(true);
    expect(s.actors.map(p => p.checkpoint)).toEqual(['cp-0', 'cp-1']);
  });

  const recorded = () => {
    // Courtyard 2 has long flat ground: Still walks right for two seconds (no falls, no respawns).
    let s = rootriseArena();
    const history = createHistory();
    history.reset(s);
    s = act(s, { type: 'move', actor: 0, dir: 1 });
    for (let i = 0; i < 120; i++) { s = act(s, { type: 'tick' }); history.record(s); }
    return { s, frames: [...history.frames, compactFrame(s)] };
  };

  test('starts at the present, ends exactly at the courtyard start, and moves steadily back in time', () => {
    const { s, frames } = recorded();
    expect(rewindFrame(frames, 0).actors[0].x).toBeCloseTo(s.actors[0].x, 6);
    const end = rewindFrame(frames, 1), start = compactFrame(rootriseArena());
    expect(end.actors).toEqual(start.actors);
    expect(end.objects).toEqual(start.objects);
    expect(end.freezeAreas).toEqual([]);
    let previous = Infinity;
    for (let u = 0; u <= 1.0001; u += .05) {
      const x = rewindFrame(frames, u).actors[0].x;
      expect(x).toBeLessThanOrEqual(previous + 1e-6); // the traveller walked right, so rewinding walks left
      previous = x;
    }
  });

  test('positions blend between recorded frames (no teleporting), even for a very short run', () => {
    const { frames } = recorded();
    let last = rewindFrame(frames, 0).actors[0].x, worst = 0;
    for (let i = 1; i <= 240; i++) { const x = rewindFrame(frames, i / 240).actors[0].x; worst = Math.max(worst, Math.abs(x - last)); last = x; }
    expect(worst).toBeLessThan(20);
    const short = [compactFrame(setup({ level: 0 })), compactFrame(tick(setup({ level: 0 }), 3))];
    expect(rewindFrame(short, .5)).not.toBe(null);
    expect(easeRewind(0)).toBe(0); expect(easeRewind(1)).toBe(1); expect(easeRewind(.5)).toBeCloseTo(.5, 6);
  });
});
