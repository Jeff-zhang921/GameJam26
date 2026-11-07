import { readdir, readFile, writeFile, mkdir, rm, lstat } from 'node:fs/promises';
import { resolve, relative, dirname, extname, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dir, '..');
const publicRoot = resolve(root, 'public');
const dist = resolve(root, 'dist');
if (!dist.startsWith(root + sep) || basename(dist) !== 'dist') throw new Error('Invalid build destination');
try { if ((await lstat(dist)).isSymbolicLink()) throw new Error('Build destination must not be a symlink'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'assets'), { recursive: true });

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
const assets = ['/'];
let html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
for (const path of await files(publicRoot)) {
  const name = relative(publicRoot, path).split(sep).join('/');
  if (name === 'index.html' || extname(name) === '.js') continue;
  const content = await readFile(path);
  const output = extname(name) === '.css' ? `assets/${basename(name, '.css')}-${hash(content)}.css` : name;
  await mkdir(dirname(resolve(dist, output)), { recursive: true });
  await writeFile(resolve(dist, output), content);
  assets.push('/' + output);
  if (extname(name) === '.css') html = html.replaceAll(`/${name}`, '/' + output);
}
const result = await Bun.build({
  entrypoints: [resolve(publicRoot, 'client.js')], outdir: resolve(dist, 'assets'),
  naming: 'client-[hash].js', minify: true, target: 'browser',
});
if (!result.success) throw new AggregateError(result.logs, 'Frontend build failed');
const bundle = result.outputs.find(output => output.kind === 'entry-point');
if (!bundle) throw new Error('Missing frontend entry point');
for (const output of result.outputs) assets.push('/' + relative(dist, output.path).split(sep).join('/'));
html = html.replace('/client.js', '/' + relative(dist, bundle.path).split(sep).join('/'));
for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
  if (!assets.includes(match[1])) throw new Error(`Missing HTML asset: ${match[1]}`);
}
const fingerprint = createHash('sha256').update(html);
for (const path of await files(dist)) fingerprint.update(relative(dist, path)).update(await readFile(path));
fingerprint.update(process.env.BUILD_REVISION || '');
const version = fingerprint.digest('hex').slice(0, 16);
html = html.replace('</head>', `  <meta name="moonclock-build" content="${version}" />\n</head>`);
await writeFile(resolve(dist, 'index.html'), html);
const swTemplate = await readFile(resolve(publicRoot, 'sw.js'), 'utf8');
const marker = 'const BUILD = /* BUILD_MANIFEST */ {"version":"dev","assets":[]};';
if (!swTemplate.includes(marker)) throw new Error('Missing service worker build marker');
await writeFile(resolve(dist, 'sw.js'), swTemplate.replace(marker, `const BUILD = /* BUILD_MANIFEST */ ${JSON.stringify({ version, assets: assets.sort() })};`));
await writeFile(resolve(dist, 'build.json'), JSON.stringify({ version, assets: assets.sort() }));
console.log(`Built Moonclock ${version}: ${assets.length} static assets.`);
