import { test, expect, afterEach } from 'bun:test';
import { createMusic } from '../public/music.js';

// The fake replaces globals; put them back so other test files see the real fetch.
const realFetch = globalThis.fetch, realWindow = globalThis.window;
afterEach(() => { globalThis.fetch = realFetch; if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow; });

// A minimal Web Audio stand-in: enough to check which track plays and from where.
function fakeAudio() {
  const started = [], contexts = [], decoded = [], allocated = [];
  class Context {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this); }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() { }, linearRampToValueAtTime() { } }, connect() { } }; }
    decodeAudioData(src) {
      const data = Float32Array.from({ length: 600 }, (_, i) => i / 600);
      const buffer = { src, duration: 60, sampleRate: 10, numberOfChannels: 1, getChannelData: () => data };
      decoded.push(buffer); return Promise.resolve(buffer);
    }
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = { duration: length / rate, sampleRate: rate, numberOfChannels: channels, getChannelData: channel => data[channel] };
      allocated.push(buffer); return buffer;
    }
    createBufferSource() { const s = { connect() { }, disconnect() { }, stop() { s.stopped = true; }, start(_, offset) { started.push({ src: s.buffer.src, buffer: s.buffer, offset }); } }; return s; }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = async src => ({ ok: true, arrayBuffer: async () => src });
  return { started, decoded, allocated, clock: () => contexts[0] };
}

test('each courtyard plays its own track and resumes it where it left off', async () => {
  const { started, clock } = fakeAudio(), music = createMusic();
  const a = { src: '/a.mp3', length: 50, fade: 2 }, b = { src: '/b.mp3' };
  music.select(a); music.sync(true); music.unlock();
  await Bun.sleep(5);
  expect(started).toHaveLength(1);
  expect(started[0].offset).toBe(0);
  clock().currentTime = 10; // ten seconds into track a
  music.select(b); await Bun.sleep(5);
  expect(started).toHaveLength(2); // switching tracks starts the new one
  music.select(b); expect(started).toHaveLength(2); // same track: nothing restarts
  music.select(a); await Bun.sleep(5);
  expect(started).toHaveLength(3); // back to the first track, from its saved position
  expect(started[2].offset).toBe(10);
  music.sync(false); music.select(b); await Bun.sleep(5);
  expect(started).toHaveLength(3); // nothing plays while music is off
});

test('full tracks play the decoded samples without allocating a second audio buffer', async () => {
  const { started, decoded, allocated } = fakeAudio(), music = createMusic();
  music.select({ src: '/full.mp3' }); music.sync(true); music.unlock();
  await Bun.sleep(5);
  expect(started).toHaveLength(1);
  expect(started[0].buffer).toBe(decoded[0]);
  expect(allocated).toHaveLength(0);
});

test('trimmed crossfaded tracks preserve every sample of the existing blend', async () => {
  const { started, decoded, allocated } = fakeAudio(), music = createMusic();
  music.select({ src: '/trimmed.mp3', length: 50, fade: 2 }); music.sync(true); music.unlock();
  await Bun.sleep(5);
  expect(started).toHaveLength(1);
  expect(allocated).toHaveLength(1);
  expect(started[0].buffer.duration).toBe(50);
  const original = decoded[0].getChannelData(0), samples = started[0].buffer.getChannelData(0);
  const expected = original.slice(0, 500);
  for (let i = 0; i < 20; i++) expected[480 + i] = original[480 + i] * (1 - i / 20) + original[i] * (i / 20);
  expect(samples).toEqual(expected);
});
