import { afterAll, describe, expect, test } from 'bun:test';
import { createRenderer } from '../public/render.js';
import { setup } from '../src/logic.js';
import { S } from '../public/strings.js';

const original = { document: globalThis.document, window: globalThis.window, Image: globalThis.Image };
let blendCalls = 0, canvases = [];
function canvas() {
  const context = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 50 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(1280 * 4) });
      return () => {};
    },
    set(target, key, value) { if (key === 'globalCompositeOperation' && ['saturation', 'color'].includes(value)) blendCalls++; target[key] = value; return true; },
  });
  const node = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 1024, height: 768, left: 0, top: 0 }) };
  canvases.push(node); return node;
}
globalThis.document = { hidden: false, createElement: canvas };
globalThis.window = { devicePixelRatio: 2 };
globalThis.Image = class { complete = false; naturalWidth = 0; };
afterAll(() => { for (const key of Object.keys(original)) { if (original[key] === undefined) delete globalThis[key]; else globalThis[key] = original[key]; } });

function game() {
  globalThis.document.hidden = false; blendCalls = 0; canvases = [];
  const surface = canvas(), renderer = createRenderer(surface, S), state = setup();
  let time = 0;
  const draw = (gap = 1000 / 60, options = {}) => { time += gap; renderer.draw(state, time, { sceneKey: 0, ...options }); };
  return { surface, renderer, state, draw };
}

describe('adaptive render budget', () => {
  test('healthy frames and isolated hitches retain full detail', () => {
    const { renderer, draw } = game();
    for (let i = 0; i < 240; i++) draw(i % 60 === 0 ? 50 : 1000 / 60);
    expect(renderer.inspect().pixelRatio).toBe(1.75);
    expect(renderer.inspect().effectQuality).toBe('full');
  });
  test('sustained missed frames reduce pixels without changing world coordinates or state', () => {
    const { surface, renderer, state, draw } = game();
    draw(); const camera = renderer.inspect().camera, before = structuredClone(state);
    for (let i = 0; i < 100; i++) draw(1000 / 30);
    expect(renderer.inspect().pixelRatio).toBe(1);
    expect(renderer.inspect().effectQuality).toBe('light');
    expect([surface.width, surface.height]).toEqual([1024, 768]);
    expect(renderer.inspect().camera).toEqual(camera);
    expect(state).toEqual(before);
    for (let i = 0; i < 240; i++) draw();
    expect(renderer.inspect().pixelRatio).toBe(1);
  });
  test('pause, hidden tabs, scene changes and long resume gaps do not lower detail', () => {
    const { renderer, draw } = game();
    for (let i = 0; i < 100; i++) draw(1000 / 30, { paused: true });
    document.hidden = true;
    for (let i = 0; i < 100; i++) draw(1000 / 30);
    document.hidden = false;
    for (let i = 0; i < 100; i++) draw(1000 / 30, { sceneKey: i });
    for (let i = 0; i < 100; i++) draw(500);
    expect(renderer.inspect().pixelRatio).toBe(1.75);
    expect(renderer.inspect().effectQuality).toBe('full');
  });
  test('light freeze effect reuses one wash and avoids HSL compositing', () => {
    const { renderer, state, draw } = game();
    state.freezeAreas.push({ id: 'test', x: 280, y: 470, radius: 130, duration: 600, ticksLeft: 500 });
    draw(); expect(blendCalls).toBe(2);
    for (let i = 0; i < 40; i++) draw(1000 / 30);
    expect(renderer.inspect().effectQuality).toBe('light');
    const before = blendCalls;
    for (let i = 0; i < 60; i++) draw();
    expect(blendCalls).toBe(before);
    expect(canvases.filter(node => node.width === 256 && node.height === 256)).toHaveLength(1);
    expect(state.freezeAreas).toHaveLength(1);
  });
});
