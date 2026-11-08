import { describe, test, expect } from 'bun:test';
import { measureCharacterFrames, characterPlacement } from '../public/character-sprites.js';
import { createHitFeedback } from '../public/hit-feedback.js';
import { guardAttackFrame } from '../public/guard-animation.js';
import { makeEnemy, ENEMY } from '../src/enemies.js';
import { setup, applyAction, meta } from '../src/logic.js';

describe('consistent character art', () => {
  test('different transparent padding cannot shrink jumping or running frames', () => {
    const width = 40, height = 24, data = new Uint8ClampedArray(width * height * 4);
    for (let frame = 0; frame < 8; frame++) {
      const ox = frame % 4 * 10, oy = Math.floor(frame / 4) * 12, padding = frame % 4;
      for (let y = padding; y < 12 - padding; y++) for (let x = 2; x < 8; x++) data[((oy + y) * width + ox + x) * 4 + 3] = 255;
    }
    const frames = measureCharacterFrames({ data, width, height }, 4, 2);
    expect(frames.map(f => f.h)).toEqual([12, 10, 8, 6, 12, 10, 8, 6]);
    for (const frame of frames) {
      const place = characterPlacement(frame, .6);
      expect(place.h).toBe(72); expect(place.y + place.h).toBe(2);
      expect(place.w / place.h).toBeCloseTo(frame.w / frame.h);
      expect(place.x + (frame.cellWidth * .6 - frame.left) * place.h / frame.h).toBeCloseTo(0);
    }
  });
});

describe('confirmed local hit feedback', () => {
  const hit = (id, actor = 0, sourceKind = 'guard') => ({ id, actor, sourceKind, kind: 'hit' });
  test('only an own guard hit vibrates, once per event', () => {
    const calls = [], feedback = createHitFeedback({ vibrate: ms => calls.push(ms) });
    feedback.handle(hit(1, 1), 0); feedback.handle(hit(2, 0, 'dart'), 0);
    feedback.handle({ ...hit(3), kind: 'strike' }, 0);
    feedback.handle(hit(4), 0); feedback.handle(hit(4), 0); feedback.handle(hit(3), 0);
    expect(calls).toEqual([25]);
    feedback.reset(10); feedback.handle(hit(10), 0); feedback.handle(hit(11), 0);
    expect(calls).toEqual([25, 25]);
    feedback.reset(); feedback.handle(hit(1), 0);
    expect(calls).toEqual([25, 25, 25]);
  });
  test('hidden, unsupported and old events remain harmless', () => {
    let calls = 0;
    const hidden = createHitFeedback({ visible: () => false, vibrate: () => { calls++; } });
    hidden.handle(hit(1), 0); expect(calls).toBe(0);
    const unsupported = createHitFeedback({ vibrate: () => { throw new Error('unavailable'); } });
    expect(() => unsupported.handle(hit(1), 0)).not.toThrow();
    expect(() => unsupported.handle({ id: 2, kind: 'hit', actor: 0 }, 0)).not.toThrow();
  });
});

describe('guard shell strike', () => {
  function courtyard(frozen = false) {
    const s = setup({ level: 4 });
    s.platforms = [{ x: 0, y: 520, w: 1280, h: 160 }];
    s.objects = [makeEnemy('guard', { x: 500, y: 520, minX: 500, maxX: 500 }, 'guard-test')];
    Object.assign(s.actors[0], { x: 500, y: 470, on: 'guard-test', grounded: true });
    Object.assign(s.actors[1], { x: 60, y: 520 });
    if (frozen) s.freezeAreas.push({ id: 'test-area', x: 500, y: 490, radius: 130, ticksLeft: 600, duration: 600 });
    return s;
  }
  const tick = s => applyAction(s, 'local', { type: 'tick' });
  test('windup and recoil use the enemy clock and hits identify their source', () => {
    let s = courtyard();
    s.objects[0].attack = ENEMY.guard.attackEvery - 1;
    s = tick(s);
    const strike = s.events.find(e => e.kind === 'strike'), hit = s.events.find(e => e.kind === 'hit');
    expect(strike).toMatchObject({ source: 'guard-test', sourceKind: 'guard' });
    expect(hit).toMatchObject({ actor: 0, source: 'guard-test', sourceKind: 'guard' });
    expect(s.actors[0].invuln).toBe(meta.time.invulnTicks);
    expect(guardAttackFrame(s.objects[0])).toMatchObject({ wave: 0, recoil: 1 });
    const saved = structuredClone(s);
    s = applyAction(s, 'local', { type: 'pause' });
    for (let i = 0; i < 20; i++) s = tick(s);
    expect(guardAttackFrame(s.objects[0])).toEqual(guardAttackFrame(saved.objects[0]));
  });
  test('Freeze slows both the hit and the shell recoil; a fresh guard is not already attacking', () => {
    let normal = courtyard(), slow = courtyard(true);
    expect(guardAttackFrame(normal.objects[0])).toMatchObject({ charge: 0, recoil: 0, wave: null });
    normal.objects[0].attack = slow.objects[0].attack = ENEMY.guard.attackEvery - 2;
    normal = tick(normal); slow = tick(slow);
    expect(guardAttackFrame(slow.objects[0]).charge).toBeLessThan(guardAttackFrame(normal.objects[0]).charge);
    for (let i = 0; i < 10; i++) slow = tick(slow);
    expect(slow.objects[0].strikeSeq).toBe(1);
    expect(slow.objects[0].attack).toBeLessThan(1);
    expect(guardAttackFrame(slow.objects[0]).recoil).toBeGreaterThan(.9);
  });
});
