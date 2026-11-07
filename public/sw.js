const BUILD = /* BUILD_MANIFEST */ {"version":"dev","assets":[]};
const CACHE = `moonclock-${BUILD.version}`;
const STATIC = new Set(BUILD.assets);
const shellPaths = new Set(['/', '/index.html']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(BUILD.assets)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('moonclock-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

function askIdle(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = idle => { clearTimeout(timer); channel.port1.close(); resolve(idle); };
    const timer = setTimeout(() => finish(false), 1500);
    channel.port1.onmessage = event => finish(event.data?.idle === true);
    try { client.postMessage({ type: 'PWA_IDLE_QUERY' }, [channel.port2]); } catch { finish(false); }
  });
}

let activating = false;
self.addEventListener('message', event => {
  if (event.data?.type !== 'PWA_ACTIVATE_WHEN_IDLE') return;
  event.waitUntil((async () => {
    if (activating) return;
    activating = true;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const scoped = clients.filter(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    const decisions = await Promise.all(scoped.map(askIdle));
    if (decisions.every(Boolean)) {
      try { await self.skipWaiting(); return; } catch { }
    }
    for (const client of scoped) client.postMessage({ type: 'PWA_RELEASE_UPDATE_LOCK' });
    event.source?.postMessage({ type: 'PWA_UPDATE_DEFERRED' });
    activating = false;
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('authorization')) return;
  if (!STATIC.has(url.pathname) || ['/ws', '/health'].includes(url.pathname) || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fresh = shellPaths.has(url.pathname) || !/[-.][a-z0-9]{8,}\./i.test(url.pathname);
    if (!fresh) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && !shellPaths.has(url.pathname) && !response.headers.has('set-cookie')) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (shellPaths.has(url.pathname)) return await cache.match('/offline.html') || new Response('Offline. Online rooms need a connection.', { status: 503 });
      throw new Error('This asset is not available offline.');
    }
  })());
});
