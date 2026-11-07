import { test, expect, afterEach } from 'bun:test';
import { createMusic } from '../public/music.js';

// The fake replaces globals; put them back so other test files see the real fetch.
const realFetch = globalThis.fetch, realWindow = globalThis.window;
afterEach(() => { globalThis.fetch = realFetch; if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow; });

// A minimal Web Audio stand-in: enough to check which track plays and from where.
function fakeAudio() {
  const started = [], contexts = [];
  class Context {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; contexts.push(this); }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() { }, linearRampToValueAtTime() { } }, connect() { } }; }
    decodeAudioData() { return Promise.resolve({ duration: 60, sampleRate: 10, numberOfChannels: 1, getChannelData: () => new Float32Array(600) }); }
    createBuffer(channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
    createBufferSource() { const s = { connect() { }, disconnect() { }, stop() { s.stopped = true; }, start(_, offset) { started.push({ src: s.buffer.src, offset }); } }; return s; }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = async src => ({ ok: true, arrayBuffer: async () => src });
  return { started, clock: () => contexts[0] };
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
