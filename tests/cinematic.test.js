import { afterEach, expect, test } from 'bun:test';
import { OPENING_DURATION, NEWSPAPER_DURATION, openingFrame, openingTransform, newspaperFrame, newspaperTransform } from '../src/cinematic-timeline.js';
import { createCinematic } from '../public/cinematic.js';
import { createGameServer } from '../server.js';
import { ARRIVAL_DURATION } from '../public/portal.js';

test('opening holds three readable cards in order before pulling away', () => {
  expect(openingFrame(0).phase).toBe('door');
  for (const [time, page] of [[9400, 0], [16900, 1], [24400, 2]]) {
    expect(openingFrame(time).phase).toBe(`story-${page + 1}`);
    expect(openingFrame(time).cards[page]).toBe(1);
    expect(openingFrame(time + 6000).cards[page]).toBe(1);
  }
  expect(openingFrame(30900).lift).toBeCloseTo(0, 8);
  expect(openingFrame(OPENING_DURATION)).toMatchObject({ phase: 'pull', opacity: 0, lift: -115 });
});

test('first story waits for the open door and camera approach, then dissolves over 2.6 seconds', () => {
  expect(openingFrame(4000)).toMatchObject({ door: 1, backdrop: 1, cards: [0, 0, 0] });
  expect(openingFrame(4000).phase).toBe('approach');
  expect(openingFrame(6800).cards[0]).toBe(0);
  expect(openingFrame(8100)).toMatchObject({ backdrop: .5, cards: [.5, 0, 0] });
  expect(openingFrame(9400)).toMatchObject({ backdrop: 0, cards: [1, 0, 0] });
  expect(openingFrame(15899).cards[1]).toBe(0);
});

test('opening camera follows the door into the viewport centre without uncovering edges', () => {
  for (const [width, height] of [[844, 390], [1194, 834], [1440, 900]]) {
    const base = openingTransform(openingFrame(4000), width, height), cover = base.width / 1600;
    const startDistance = Math.hypot(base.x + 1125 * cover - width / 2, base.y + 659 * cover - height / 2);
    let previousScale = 1, previousDistance = startDistance;
    expect(openingTransform(openingFrame(0), width, height)).toEqual(base);
    for (const time of [4000, 4400, 4800, 5400, 6000, 6800, 7200, 7400]) {
      const camera = openingTransform(openingFrame(time), width, height);
      const distance = Math.hypot(camera.x + 1125 * cover * camera.scale - width / 2, camera.y + 659 * cover * camera.scale - height / 2);
      expect(camera.scale).toBeGreaterThanOrEqual(previousScale);
      expect(distance).toBeLessThanOrEqual(previousDistance + .000001);
      expect(camera.x).toBeLessThanOrEqual(.000001); expect(camera.y).toBeLessThanOrEqual(.000001);
      expect(camera.x + camera.width * camera.scale).toBeGreaterThanOrEqual(width - .000001);
      expect(camera.y + camera.height * camera.scale).toBeGreaterThanOrEqual(height - .000001);
      previousScale = camera.scale; previousDistance = distance;
    }
    expect(previousScale).toBeCloseTo(4.2);
    expect(previousDistance).toBeLessThan(.000001);
    expect(openingTransform(openingFrame(7400, true), width, height)).toEqual(base);
    for (const boundary of [4000, 7400]) {
      const before = openingTransform(openingFrame(boundary - .001), width, height), after = openingTransform(openingFrame(boundary + .001), width, height);
      expect(Math.abs(before.x - after.x) + Math.abs(before.y - after.y) + Math.abs(before.scale - after.scale)).toBeLessThan(.00001);
    }
  }
});

test('newspaper fades through black and caption before revealing the whole sheet', () => {
  expect(newspaperFrame(0)).toMatchObject({ phase: 'black', backdrop: 0, caption: 0, reveal: 0 });
  expect(newspaperFrame(600).backdrop).toBeCloseTo(.5);
  expect(newspaperFrame(1200)).toMatchObject({ phase: 'caption', backdrop: 1, caption: 0, reveal: 0 });
  expect(newspaperFrame(2200)).toMatchObject({ caption: 1, reveal: 0 });
  expect(newspaperFrame(4700)).toMatchObject({ caption: 1, reveal: 0 });
  expect(newspaperFrame(5700)).toMatchObject({ phase: 'reveal', caption: 0, reveal: 0 });
  expect(newspaperFrame(6800)).toMatchObject({ backdrop: 1, caption: 0, reveal: .5 });
  expect(newspaperFrame(7900)).toMatchObject({ phase: 'whole', backdrop: 1, caption: 0, reveal: 1 });
});
test('newspaper visits the whole sheet then left top, left bottom, right top, right bottom', () => {
  expect(newspaperFrame(9000)).toMatchObject({ phase: 'whole', x: .5, y: .5, zoom: 1 });
  for (const [time, phase, x, y] of [[12400, 'top-left', .25, .25], [18100, 'bottom-left', .25, .75], [23800, 'top-right', .75, .25], [29500, 'bottom-right', .75, .75]]) {
    expect(newspaperFrame(time)).toMatchObject({ phase, x, y, zoom: 1.9 });
    expect(newspaperFrame(time + 4000)).toMatchObject({ phase, x, y });
  }
  expect(newspaperFrame(36000)).toMatchObject({ phase: 'fade', x: .5, y: .5, zoom: 1 });
  expect(newspaperFrame(NEWSPAPER_DURATION).opacity).toBe(0);
});
test('newspaper camera has continuous pan boundaries and fits full portrait art on landscape viewports', () => {
  for (const time of [11200, 12400, 16900, 18100, 22600, 23800, 28300, 29500, 34000, 36000]) {
    const a = newspaperFrame(time - .001), b = newspaperFrame(time + .001);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.zoom - b.zoom)).toBeLessThan(.0001);
  }
  for (const [width, height] of [[844, 390], [1194, 834], [1440, 900]]) {
    const pose = newspaperTransform(newspaperFrame(0), width, height);
    expect(pose.x).toBeGreaterThanOrEqual(0); expect(pose.y).toBeGreaterThanOrEqual(0);
    expect(pose.x + 1122 * pose.scale).toBeLessThanOrEqual(width);
    expect(pose.y + 1402 * pose.scale).toBeLessThanOrEqual(height);
  }
});
test('reduced motion retains reading time and removes the paper pull', () => {
  expect(openingFrame(OPENING_DURATION - 500, true).lift).toBe(0);
  expect(newspaperFrame(12500, true)).toMatchObject({ phase: 'top-left', x: .25, y: .25 });
  expect(newspaperFrame(NEWSPAPER_DURATION, true).opacity).toBe(0);
});

const originals = Object.fromEntries(['document', 'window', 'ResizeObserver'].map(key => [key, globalThis[key]]));
afterEach(() => { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
function controller() {
  const element = () => ({ style: {}, classList: { add() {}, remove() {} }, hidden: true, decode: async () => {}, setAttribute() {} });
  const nodes = { '.cinematic-opening-scene': element(), '.cinematic-world': element(), '.cinematic-paper-stack': element(), '.cinematic-newspaper': element(), '.cinematic-caption': element() };
  const root = { ...element(), dataset: {}, clientWidth: 1194, clientHeight: 834, querySelector: selector => nodes[selector], querySelectorAll: selector => Array.from({ length: selector === '.cinematic-story' ? 3 : 2 }, element) };
  const shown = []; let hidden = true, resized;
  Object.defineProperty(root, 'hidden', { get: () => hidden, set(value) { hidden = value; if (!value) shown.push({ ...nodes['.cinematic-newspaper'].style }); } });
  globalThis.document = { createElement: () => root, body: { append() {}, classList: { add() {}, remove() {} } } };
  globalThis.window = { innerWidth: 1194, innerHeight: 834 };
  globalThis.ResizeObserver = class { constructor(callback) { resized = callback; } observe() {} };
  let finished = 0;
  return { film: createCinematic({ onFinish: () => finished++ }), finished: () => finished, shown, root, nodes, resize: () => resized() };
}

test('newspaper is fitted before first visible frame and resets after replay and resize', () => {
  const { film, shown, root, nodes, resize } = controller();
  const transform = (width, height) => { const p = newspaperTransform(newspaperFrame(0), width, height); return `translate(${p.x}px,${p.y}px) scale(${p.scale})`; };
  film.play('newspaper', { key: 'first', shared: true });
  expect(shown[0].transform).toBe(transform(1194, 834));
  expect(shown[0].opacity).toBe(0);
  expect(root.style.backgroundColor).toBe('rgba(0,0,0,0)');
  film.advance(1, { elapsed: 3000 });
  expect(nodes['.cinematic-caption'].style.opacity).toBe(1);
  expect(nodes['.cinematic-newspaper'].style.opacity).toBe(0);
  film.advance(2, { elapsed: 6800 });
  expect(nodes['.cinematic-caption'].style.opacity).toBe(0);
  expect(nodes['.cinematic-newspaper'].style.opacity).toBe(.5);
  film.advance(1, { elapsed: 28000 }); film.cancel();
  film.play('newspaper', { key: 'again', shared: true });
  expect(shown[1].transform).toBe(transform(1194, 834));
  expect(shown[1].opacity).toBe(0);
  root.clientWidth = 844; root.clientHeight = 390; resize();
  expect(nodes['.cinematic-newspaper'].style.transform).toBe(transform(844, 390));
});

test('opening camera keeps current progress on resize and resets only for a fresh opening', () => {
  const { film, root, nodes, resize } = controller();
  const transform = (time, width, height) => { const p = openingTransform(openingFrame(time), width, height); return `translate(${p.x}px,${p.y}px) scale(${p.scale})`; };
  film.play('opening', { key: 'door', shared: true });
  expect(nodes['.cinematic-world'].style.transform).toBe(transform(0, 1194, 834));
  film.advance(0, { elapsed: 5700 });
  expect(nodes['.cinematic-world'].style.transform).toBe(transform(5700, 1194, 834));
  root.clientWidth = 844; root.clientHeight = 390; resize();
  expect(nodes['.cinematic-world'].style.transform).toBe(transform(5700, 844, 390));
  film.cancel(); film.play('opening', { key: 'again', shared: true });
  expect(nodes['.cinematic-world'].style.transform).toBe(transform(0, 844, 390));
});

test('reduced newspaper fades old pose out before switching and fades the next pose in', () => {
  for (const [start, travel] of [[11200, 1200], [16900, 1200], [22600, 1200], [28300, 1200], [34000, 2000]]) {
    const before = newspaperFrame(start - .001, true), boundary = newspaperFrame(start, true);
    expect([boundary.x, boundary.y, boundary.zoom]).toEqual([before.x, before.y, before.zoom]);
    const oldPose = newspaperFrame(start + travel * .4999, true), newPose = newspaperFrame(start + travel * .5001, true);
    expect(oldPose.transitionOpacity).toBeLessThan(.001); expect(newPose.transitionOpacity).toBeLessThan(.001);
    expect(newspaperFrame(start + travel, true).transitionOpacity).toBe(1);
  }
  expect(openingFrame(2400, true).door).toBe(0);
});
test('repeated snapshots keep one keyed film and completion runs once', async () => {
  const { film, finished } = controller();
  film.play('opening', { key: 'room:1', shared: true });
  film.advance(100, { elapsed: 6000 }); film.play('opening', { key: 'room:1', shared: true });
  expect(film.inspect().elapsed).toBe(6000);
  film.advance(200, { elapsed: OPENING_DURATION }); film.advance(300);
  expect(film.active).toBe(false); expect(finished()).toBe(1);
});
test('local hidden and orientation pauses retain reading time without a resume jump', async () => {
  const { film } = controller(); await film.preload('opening');
  film.play('opening', { key: 'local' }); await film.preload('opening');
  film.advance(0); film.advance(1000); film.advance(2000, { paused: true });
  expect(film.inspect().elapsed).toBe(1000);
  film.resetClock(); film.advance(50000); film.advance(51000);
  expect(film.inspect().elapsed).toBe(2000);
  film.cancel(); expect(film.inspect()).toBe(null);
});
test('server default holds the authoritative start for the story and arrival, with explicit overrides preserved', () => {
  for (const override of [undefined, 0, 800]) {
    const game = createGameServer({ port: 0, hostname: '127.0.0.1', ...(override === undefined ? {} : { countdownMs: override }) });
    try { expect(game.rooms.publicRoom({ code: 'ABC123', status: 'STARTING', players: [], createdAt: Date.now() }).startDuration).toBe(override ?? OPENING_DURATION + ARRIVAL_DURATION); }
    finally { game.stop(); }
  }
});
