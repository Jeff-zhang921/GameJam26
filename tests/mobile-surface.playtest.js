// MOONCLOCK_PLAYWRIGHT can point to an existing Playwright index.mjs.
// Build first. Screenshots and the device report are saved under .audit/mobile/.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';
import { levelCount } from '../src/logic.js';

const { chromium, webkit } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const out = '.audit/mobile';
await mkdir(out, { recursive: true });
const server = createGameServer({ production: true, hostname: '127.0.0.1', port: 0 });
const report = [], failures = [];
const cases = [
  ['ipad-pro', 1194, 834, false], // iPadOS also advertises a desktop browser.
  ['ipad-4-3', 1024, 768, true],
  ['iphone', 844, 390, true],
  ['iphone-small', 667, 375, true],
  ['android', 915, 412, true],
];
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && document.querySelector('.scene-veil').hidden);

try {
  for (const [engine, launch] of [['chromium', () => chromium.launch({ channel: 'chrome', headless: true })], ['webkit', () => webkit.launch({ headless: true })]]) {
    const browser = await launch();
    try {
      for (const [name, width, height, isMobile] of cases) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', response => { if (response.status() >= 400 && /\.(png|jpg|svg|js|css)(\?|$)/.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
        try {
          await page.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false, unlocked: 4 })));
          await page.goto(server.url.href);
          // Explicit inset values cover notched landscape devices in headless browsers.
          if (name === 'iphone') await page.evaluate(() => {
            for (const [side, px] of [['left', 44], ['right', 44], ['bottom', 21]]) document.documentElement.style.setProperty(`--safe-${side}`, `${px}px`);
          });
          await page.getByTestId('start').tap();
          await ready(page);
          for (let level = 0; level < levelCount; level++) {
            if (level) {
              await page.getByTestId('touch-pause').tap();
              await page.getByTestId(`level-${level}`).tap();
              await ready(page);
            }
            await page.waitForLoadState('networkidle');
            const metrics = await page.evaluate(() => {
              const surface = document.querySelector('#game'), rect = surface.getBoundingClientRect();
              const { camera } = window.__moonclock.presentation();
              const ctx = surface.getContext('2d'), y = surface.height - 8;
              const pixels = ctx.getImageData(0, y, surface.width, 1).data;
              const colours = new Set();
              for (let x = 0; x < surface.width; x += 3) colours.add(`${pixels[x * 4]},${pixels[x * 4 + 1]},${pixels[x * 4 + 2]}`);
              const controls = ['joystick', 'touch-jump', 'touch-ability', 'touch-interact', 'touch-pause', 'touch-switch'].map(id => {
                const node = document.querySelector(`[data-testid="${id}"]`), box = node.getBoundingClientRect();
                const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                return { id, x: box.x, y: box.y, w: box.width, h: box.height, reachable: !!hit && (hit === node || node.contains(hit)) };
              });
              return { touch: document.body.classList.contains('touch-layout'), width: innerWidth, height: innerHeight,
                canvas: rect.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth,
                belowWorld: rect.height - (camera.offsetY + 640 * camera.scale), bottomColours: colours.size, controls };
            });
            assert.ok(metrics.touch, `${name} missed touch detection`);
            assert.equal(metrics.overflow, false, `${name} horizontal overflow`);
            assert.ok(Math.abs(metrics.canvas.height - height) <= 1 && Math.abs(metrics.canvas.width - width) <= 1, `${name} canvas does not fill viewport`);
            assert.ok(metrics.bottomColours > 12, `${name}, level ${level + 1}: untextured screen bottom (${metrics.bottomColours} colours)`);
            for (const c of metrics.controls) {
              assert.ok(c.w >= 43.9 && c.h >= 43.9, `${name}: ${c.id} target is smaller than 44px`);
              assert.ok(c.x >= -.5 && c.y >= -.5 && c.x + c.w <= width + .5 && c.y + c.h <= height + .5, `${name}: ${c.id} clipped`);
              assert.ok(c.reachable, `${name}: ${c.id} obscured`);
            }
            await page.screenshot({ path: `${out}/${engine}-${name}-level-${level + 1}.png` });
            report.push({ engine, device: name, level: level + 1, ...metrics });
          }
          // Real pointer input: walk, jump, switch, cast, pause/resume.
          await page.getByTestId('touch-pause').tap();
          await page.getByTestId('level-0').tap();
          await ready(page);
          let before = await snapshot(page);
          const stick = await page.getByTestId('joystick').boundingBox();
          await page.mouse.move(stick.x + stick.width * .78, stick.y + stick.height / 2);
          await page.mouse.down();
          await page.waitForFunction(x => window.__moonclock.snapshot().actors[0].x > x + 12, before.actors[0].x);
          await page.mouse.up();
          const ground = (await snapshot(page)).actors[0].y;
          await page.getByTestId('touch-jump').tap();
          await page.waitForFunction(y => window.__moonclock.snapshot().actors[0].y < y - 5, ground);
          await page.waitForFunction(() => window.__moonclock.snapshot().actors[0].grounded);
          await page.getByTestId('touch-switch').tap();
          assert.equal((await snapshot(page)).active, 1);
          await page.getByTestId('touch-switch').tap();
          before = await snapshot(page);
          const cast = await page.evaluate(() => {
            const p = window.__moonclock.snapshot().actors[0], c = window.__moonclock.presentation().camera;
            return { x: (p.x + 120) * c.scale + c.offsetX, y: (p.y - 120) * c.scale + c.offsetY };
          });
          await page.touchscreen.tap(cast.x, cast.y);
          await page.waitForFunction(n => window.__moonclock.snapshot().freezeCharges === n - 1, before.freezeCharges);
          await page.getByTestId('touch-pause').tap();
          const pausedTick = (await snapshot(page)).tick;
          await page.waitForTimeout(120);
          assert.equal((await snapshot(page)).tick, pausedTick);
          await page.getByTestId('resume').tap();
          await ready(page);
          await page.waitForFunction(tick => window.__moonclock.snapshot().tick > tick, pausedTick);
          if (isMobile) {
            await page.setViewportSize({ width: height, height: width });
            await page.locator('.orientation-gate').waitFor({ state: 'visible' });
            const heldTick = (await snapshot(page)).tick;
            await page.waitForTimeout(120);
            assert.equal((await snapshot(page)).tick, heldTick, 'Portrait gate did not pause local play');
            await page.setViewportSize({ width, height });
            await page.locator('.orientation-gate').waitFor({ state: 'hidden' });
            await page.waitForFunction(tick => window.__moonclock.snapshot().tick > tick, heldTick);
          }
          assert.deepEqual(errors, []);
          console.log(`PASS ${engine} ${name}: ${levelCount} textured levels, controls and input`);
        } catch (error) {
          await page.screenshot({ path: `${out}/${engine}-${name}-failure.png` }).catch(() => {});
          failures.push(`${engine} ${name}: ${error.stack}`);
          console.error(failures.at(-1));
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.stop();
  await writeFile(`${out}/report.json`, JSON.stringify({ report, failures }, null, 2));
}
assert.deepEqual(failures, []);
console.log(`Mobile surface checks passed: ${report.length} engine/device/level combinations.`);
