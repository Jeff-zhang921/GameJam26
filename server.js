import { resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { createRoomManager } from './src/rooms.js';
import { OPENING_DURATION } from './src/cinematic-timeline.js';
import { ARRIVAL_DURATION } from './public/portal.js';

const publicRoot = resolve(import.meta.dir, 'public');
const sourceRoot = resolve(import.meta.dir, 'src');

export function createGameServer({
  production = process.env.NODE_ENV === 'production',
  port = Number(process.env.PORT || 4173),
  hostname = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
  publicOrigin = process.env.PUBLIC_ORIGIN,
  buildRoot = resolve(import.meta.dir, 'dist'),
  ...roomOptions
} = {}) {
  if (production && !existsSync(resolve(buildRoot, 'index.html'))) throw new Error('Production frontend is missing. Run bun run build before starting.');
  let configuredOrigin;
  if (publicOrigin) {
    const parsed = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('PUBLIC_ORIGIN must be one HTTP or HTTPS origin, without a path or credentials.');
    configuredOrigin = parsed.origin;
  }
  const staticRoot = production ? resolve(buildRoot) : publicRoot;
  const rooms = createRoomManager({ countdownMs: OPENING_DURATION + ARRIVAL_DURATION, ...roomOptions });
  const server = Bun.serve({
    hostname, port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
      if (url.pathname === '/health') return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
      if (url.pathname === '/ws') {
        const origin = request.headers.get('origin');
        const allowed = configuredOrigin ? origin === configuredOrigin : origin === url.origin || (production && origin === `https://${url.host}`);
        if (origin && !allowed) return new Response('Forbidden origin', { status: 403, headers: { 'Cache-Control': 'no-store' } });
        if (server.upgrade(request, { data: { roomCode: null, playerId: null } })) return;
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
      if (pathname.split(/[\\/]/).some(segment => segment.startsWith('.'))) return new Response('Not found', { status: 404 });
      if (!production && pathname === '/logic.js') pathname = '/src/logic.js';
      if (production && (pathname === '/src' || pathname.startsWith('/src/'))) return new Response('Not found', { status: 404 });
      const base = !production && pathname.startsWith('/src/') ? sourceRoot : staticRoot;
      const path = resolve(base, '.' + (base === sourceRoot ? pathname.slice(4) : pathname));
      if (path !== base && !path.startsWith(base + sep)) return new Response('Forbidden', { status: 403 });
      const file = Bun.file(pathname === '/' ? resolve(staticRoot, 'index.html') : path);
      if (!(await file.exists())) return new Response('Not found', { status: 404 });
      const immutable = production && /^\/assets\/.+-[a-zA-Z0-9]{8,}\.[a-zA-Z0-9]+$/.test(pathname);
      return new Response(request.method === 'HEAD' ? null : file, { headers: { 'Content-Type': file.type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
    },
    websocket: {
      maxPayloadLength: 4096, idleTimeout: 30, sendPings: true,
      backpressureLimit: 1024 * 1024, closeOnBackpressureLimit: true,
      message(ws, message) { rooms.receive(ws, message); },
      close(ws) { rooms.disconnect(ws); },
    },
  });
  const timer = setInterval(() => rooms.advance(), 1000 / 60);
  timer.unref();
  return { server, rooms, get url() { return server.url; }, get port() { return server.port; }, stop(force = true) { clearInterval(timer); server.stop(force); } };
}

if (import.meta.main) {
  const game = createGameServer();
  console.log(`Moonclock ready at ${game.url}`);
}
