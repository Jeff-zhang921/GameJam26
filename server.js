import { resolve, sep } from 'node:path';

const root = resolve(import.meta.dir, 'public');
const logic = resolve(import.meta.dir, 'src/logic.js');
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT || 4173),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/logic.js' || url.pathname === '/src/logic.js') return new Response(Bun.file(logic));
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
    const path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(pathname === '/' ? resolve(root, 'index.html') : path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  },
});
console.log(`Moonclock ready at ${server.url}`);
