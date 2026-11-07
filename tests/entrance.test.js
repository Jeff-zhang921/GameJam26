import { describe, test, expect } from 'bun:test';
import { entranceTimeline, entranceLayout } from '../public/entrance.js';

describe('shared courtyard entrance', () => {
  test('the gate opens before the camera enters and the art only dissolves at the threshold', () => {
    expect(entranceTimeline(0)).toEqual({ lobby: 1, door: 0, camera: 0, shade: 1, opacity: 1 });
    const beginning = entranceTimeline(.15);
    expect(beginning.lobby).toBe(0);
    expect(beginning.door).toBeGreaterThan(0);
    expect(beginning.camera).toBe(0);
    const threshold = entranceTimeline(.9);
    expect(threshold.door).toBe(1);
    expect(threshold.opacity).toBe(1);
    expect(entranceTimeline(1)).toEqual({ lobby: 0, door: 1, camera: 1, shade: 0, opacity: 0 });
  });

  test('returning to the foreground can render any point without replaying earlier frames', () => {
    let previous = entranceTimeline(0);
    for (const time of [.12, .25, .51, .89, 1]) {
      const next = entranceTimeline(time);
      expect(next.door).toBeGreaterThanOrEqual(previous.door);
      expect(next.camera).toBeGreaterThanOrEqual(previous.camera);
      expect(next.lobby).toBeLessThanOrEqual(previous.lobby);
      expect(next.opacity).toBeLessThanOrEqual(previous.opacity);
      previous = next;
    }
    expect(entranceTimeline(20)).toEqual(entranceTimeline(1));
    expect(entranceTimeline(-1)).toEqual(entranceTimeline(0));
  });

  test('reduced motion uses the same complete interval without opening or zooming', () => {
    for (const time of [0, .2, .5, .9, 1]) {
      const frame = entranceTimeline(time, true);
      expect(frame.door).toBe(0);
      expect(frame.camera).toBe(0);
    }
    expect(entranceTimeline(.8, true).opacity).toBe(1);
    expect(entranceTimeline(.9, true).opacity).toBeGreaterThan(0);
    expect(entranceTimeline(.9, true).opacity).toBeLessThan(1);
    expect(entranceTimeline(1, true).opacity).toBe(0);
  });

  test('the final camera fits every viewport fully inside the rectangular part of the original gate', () => {
    for (const [width, height] of [[1600, 1000], [1365, 768], [844, 390], [390, 844], [768, 1024]]) {
      const frame = entranceLayout(width, height);
      const zoom = frame.scale * frame.zoom;
      expect(182 * zoom).toBeGreaterThan(width);
      expect(145 * zoom).toBeGreaterThan(height);
      if (height > width) {
        expect(frame.height).toBeCloseTo(height * .76);
        expect(frame.top).toBe(0);
        expect(frame.left).toBeCloseTo((width - frame.width) * .72);
      } else {
        expect(frame.width).toBeGreaterThanOrEqual(width);
        expect(frame.height).toBeGreaterThanOrEqual(height);
        expect(frame.left).toBeCloseTo((width - frame.width) * .68);
      }
    }
  });
});
