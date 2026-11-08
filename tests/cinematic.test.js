import { afterEach, expect, test } from 'bun:test';
import { OPENING_DURATION, NEWSPAPER_DURATION, openingFrame, newspaperFrame, newspaperTransform } from '../src/cinematic-timeline.js';
import { createCinematic } from '../public/cinematic.js';
import { createGameServer } from '../server.js';
import { ARRIVAL_DURATION } from '../public/portal.js';

test('opening holds three readable cards in order before pulling away', () => {
  expect(openingFrame(0).phase).toBe('door');
  for (const [time, page] of [[4500, 0], [12000, 1], [19500, 2]]) {
    expect(openingFrame(time).phase).toBe(`story-${page + 1}`);
    expect(openingFrame(time).cards[page]).toBe(1);
    expect(openingFrame(time + 6000).cards[page]).toBe(1);
  }
  expect(openingFrame(26000).lift).toBeCloseTo(0, 8);
  expect(openingFrame(OPENING_DURATION)).toMatchObject({ phase: 'pull', opacity: 0, lift: -115 });
});
test('newspaper visits the whole sheet then left top, left bottom, right top, right bottom', () => {
  expect(newspaperFrame(4000)).toMatchObject({ phase: 'whole', x: .5, y: .5, zoom: 1 });
  for (const [time, phase, x, y] of [[6500, 'top-left', .25, .25], [13000, 'bottom-left', .25, .75], [19500, 'top-right', .75, .25], [26000, 'bottom-right', .75, .75]]) {
    expect(newspaperFrame(time)).toMatchObject({ phase, x, y, zoom: 1.9 });
    expect(newspaperFrame(time + 4000)).toMatchObject({ phase, x, y });
  }
  expect(newspaperFrame(33000)).toMatchObject({ phase: 'fade', x: .5, y: .5, zoom: 1 });
  expect(newspaperFrame(NEWSPAPER_DURATION).opacity).toBe(0);
});
test('newspaper camera has continuous pan boundaries and fits full portrait art on landscape viewports', () => {
  for (const time of [4500, 6500, 11000, 13000, 17500, 19500, 24000, 26000, 30500, 33000]) {
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
  expect(newspaperFrame(7000, true)).toMatchObject({ phase: 'top-left', x: .25, y: .25 });
  expect(newspaperFrame(NEWSPAPER_DURATION, true).opacity).toBe(0);
});

const originals = Object.fromEntries(['document', 'window', 'ResizeObserver'].map(key => [key, globalThis[key]]));
afterEach(() => { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
function controller() {
  const element = () => ({ style: {}, classList: { add() {}, remove() {} }, hidden: true, decode: async () => {}, setAttribute() {} });
  const nodes = { '.cinematic-opening-scene': element(), '.cinematic-world': element(), '.cinematic-paper-stack': element(), '.cinematic-newspaper': element() };
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
  film.advance(1, { elapsed: 28000 }); film.cancel();
  film.play('newspaper', { key: 'again', shared: true });
  expect(shown[1].transform).toBe(transform(1194, 834));
  root.clientWidth = 844; root.clientHeight = 390; resize();
  expect(nodes['.cinematic-newspaper'].style.transform).toBe(transform(844, 390));
});

test('reduced newspaper fades old pose out before switching and fades the next pose in', () => {
  for (const [start, travel] of [[4500, 2000], [11000, 2000], [17500, 2000], [24000, 2000], [30500, 2500]]) {
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
