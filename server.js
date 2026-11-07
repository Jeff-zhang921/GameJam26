import { resolve, sep } from 'node:path';

const root = resolve(import.meta.dir, 'public');
const src = resolve(import.meta.dir, 'src');
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT || 4173),
  async fetch(request) {
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
    if (pathname === '/logic.js') pathname = '/src/logic.js';
    const base = pathname.startsWith('/src/') ? src : root;
    const path = resolve(base, '.' + (base === src ? pathname.slice(4) : pathname));
    if (path !== base && !path.startsWith(base + sep)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(pathname === '/' ? resolve(root, 'index.html') : path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  },
});
console.log(`Moonclock ready at ${server.url}`);
