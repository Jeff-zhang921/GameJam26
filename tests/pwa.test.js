import { expect, test } from 'bun:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const assets = ['/', '/offline.html', '/assets/client-abcdefgh.js', '/client.js', '/manifest.webmanifest'];
const origin = 'https://moonclock.example';

function fixture({ networkFails = false, clients = [] } = {}) {
  const handlers = {}, stored = new Map(), messages = [], names = ['moonclock-old', 'another-app'];
  let skipped = 0, claimed = 0, fetched = 0;
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const cache = {
    async addAll(urls) { for (const url of urls) stored.set(key(url), new Response(`cached:${url}`)); },
    async match(request) { return stored.get(key(request))?.clone(); },
    async put(request, response) { stored.set(key(request), response.clone()); },
  };
  class Channel {
    constructor() {
      this.port1 = { onmessage: null, close() {} };
      this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
    }
  }
  const windows = clients.map((idle, i) => ({
    url: `${origin}/${i ? '?second' : ''}`,
    postMessage(message, ports) {
      messages.push(message.type);
      if (message.type === 'PWA_IDLE_QUERY' && idle !== null) ports[0].postMessage({ idle });
    },
  }));
  const context = vm.createContext({
    URL, Request, Response, Set, Promise, Error, MessageChannel: Channel,
    setTimeout: callback => setTimeout(callback, 10), clearTimeout,
    caches: {
      async open() { return cache; }, async keys() { return [...names]; },
      async delete(name) { names.splice(names.indexOf(name), 1); return true; },
    },
    fetch: async () => { fetched++; if (networkFails) throw new Error('Offline'); return new Response('fresh'); },
    self: {
      location: { origin }, registration: { scope: `${origin}/` },
      clients: { async matchAll() { return windows; }, async claim() { claimed++; } },
      addEventListener(type, handler) { handlers[type] = handler; },
      async skipWaiting() { skipped++; },
    },
  });
  vm.runInContext(source.replace('{"version":"dev","assets":[]}', JSON.stringify({ version: 'release-a', assets })), context);
  return {
    handlers, stored, messages, names, cache,
    get skipped() { return skipped; }, get claimed() { return claimed; }, get fetched() { return fetched; },
    async lifecycle(type, data = {}) {
      let task;
      handlers[type]({ ...data, waitUntil(value) { task = value; } });
      await task;
    },
    async request(path, options) {
      let result;
      handlers.fetch({ request: new Request(new URL(path, origin), options), respondWith(value) { result = value; } });
      return await result;
    },
  };
}

test('installed Moonclock requests fullscreen from launch with landscape preference and complete local icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  expect(manifest.name).toBe('Moonclock'); expect(manifest.short_name).toBe('Moonclock');
  expect(manifest.start_url).toBe('/'); expect(manifest.scope).toBe('/'); expect(manifest.display).toBe('fullscreen');
  expect(manifest.orientation).toBe('landscape');
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const buffer = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    expect(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(`${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const apple = await readFile(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
  expect(apple.readUInt32BE(16)).toBe(180); expect(apple.readUInt32BE(20)).toBe(180);
});

test('install precaches its release without forcibly activating and activation removes only obsolete Moonclock caches', async () => {
  const f = fixture(); await f.lifecycle('install');
  expect(f.skipped).toBe(0); expect(f.stored.size).toBe(assets.length);
  await f.lifecycle('activate');
  expect(f.names).toEqual(['another-app']); expect(f.claimed).toBe(1);
});

test('service worker ignores live routes, credentials, query strings, foreign origins and non-GET requests', async () => {
  const f = fixture(); await f.lifecycle('install');
  for (const path of ['/ws', '/health', '/api/rooms', '/room/ABC123', '/?token=secret', '/client.js?session=private', 'https://other.example/client.js']) expect(await f.request(path)).toBeUndefined();
  expect(await f.request('/client.js', { method: 'POST', body: 'input' })).toBeUndefined();
  expect(await f.request('/client.js', { headers: { authorization: 'secret' } })).toBeUndefined();
  expect(f.fetched).toBe(0);
});

test('hashed assets use their release cache while unversioned entry points prefer fresh responses', async () => {
  const f = fixture(); await f.lifecycle('install');
  expect(await (await f.request('/assets/client-abcdefgh.js')).text()).toBe('cached:/assets/client-abcdefgh.js');
  expect(f.fetched).toBe(0);
  expect(await (await f.request('/client.js')).text()).toBe('fresh');
  expect(f.fetched).toBe(1);
});

test('fresh HTML never replaces the cached old-release shell, and offline navigation retains a coherent cached shell', async () => {
  const f = fixture(); await f.lifecycle('install');
  expect(await (await f.request('/')).text()).toBe('fresh');
  expect(await (await f.cache.match('/')).text()).toBe('cached:/');
  const offline = fixture({ networkFails: true }); await offline.lifecycle('install');
  expect(await (await offline.request('/')).text()).toBe('cached:/');
});

test('an explicit update waits for every open session to report idle', async () => {
  const f = fixture({ clients: [true, true] });
  await f.lifecycle('message', { data: { type: 'PWA_ACTIVATE_WHEN_IDLE' } });
  expect(f.skipped).toBe(1); expect(f.messages).toEqual(['PWA_IDLE_QUERY', 'PWA_IDLE_QUERY']);
});

test('an active or nonresponding session prevents update activation and releases locks on the idle tabs', async () => {
  for (const clients of [[true, false], [true, null]]) {
    const f = fixture({ clients }), messages = [];
    await f.lifecycle('message', { data: { type: 'PWA_ACTIVATE_WHEN_IDLE' }, source: { postMessage(message) { messages.push(message.type); } } });
    expect(f.skipped).toBe(0);
    expect(f.messages.filter(type => type === 'PWA_RELEASE_UPDATE_LOCK')).toHaveLength(2);
    expect(messages).toEqual(['PWA_UPDATE_DEFERRED']);
  }
});
