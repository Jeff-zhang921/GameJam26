import { resolve, sep } from 'node:path';
import { createRoomManager } from './src/rooms.js';

const publicRoot = resolve(import.meta.dir, 'public');
const sourceRoot = resolve(import.meta.dir, 'src');

export function createGameServer({ port = Number(process.env.PORT || 4173), hostname = process.env.HOST || '127.0.0.1', ...roomOptions } = {}) {
  const rooms = createRoomManager(roomOptions);
  const server = Bun.serve({
    hostname, port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === '/ws') {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return new Response('Forbidden origin', { status: 403 });
        if (server.upgrade(request, { data: { roomCode: null, playerId: null } })) return;
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
      if (pathname === '/logic.js') pathname = '/src/logic.js';
      const base = pathname.startsWith('/src/') ? sourceRoot : publicRoot;
      const path = resolve(base, '.' + (base === sourceRoot ? pathname.slice(4) : pathname));
      if (path !== base && !path.startsWith(base + sep)) return new Response('Forbidden', { status: 403 });
      const file = Bun.file(pathname === '/' ? resolve(publicRoot, 'index.html') : path);
      if (!(await file.exists())) return new Response('Not found', { status: 404 });
      return new Response(file, { headers: { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
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
