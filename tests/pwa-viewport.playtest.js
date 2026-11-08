// Tests app-mode signals and viewport geometry, not the OS home indicator.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';
const { chromium, webkit } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ production: true, hostname: '127.0.0.1', port: 0 });
await mkdir('.audit/pwa-viewport', { recursive: true });
try {
  for (const [name, launch] of [['chromium', () => chromium.launch({ channel: 'chrome' })], ['webkit', () => webkit.launch()]]) {
    const browser = await launch();
    try {
      for (const [device, width, height] of [['ipad', 1194, 834], ['iphone', 844, 390]]) {
        for (const shortfall of [.5, 21]) {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
          const page = await context.newPage(), errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.addInitScript(shortfall => {
            Object.defineProperty(navigator, 'standalone', { get: () => true });
            localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false }));
            const original = visualViewport;
            Object.defineProperty(window, 'visualViewport', { value: {
              get width() { return original.width; }, get height() { return original.height - shortfall; },
              get scale() { return original.scale; }, offsetLeft: 0, offsetTop: 0,
              addEventListener: (...args) => original.addEventListener(...args),
            } });
          }, shortfall);
          await page.goto(server.url.href);
          await page.getByTestId('start').tap();
          await page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
          const metrics = await page.evaluate(() => {
            const canvas = document.querySelector('#game'), rect = canvas.getBoundingClientRect();
            const row = canvas.getContext('2d').getImageData(0, canvas.height - 1, canvas.width, 1).data;
            let transparent = 0;
            for (let i = 3; i < row.length; i += 4) if (row[i] !== 255) transparent++;
            return { body: document.body.getBoundingClientRect().toJSON(), canvas: rect.toJSON(), width: innerWidth, height: innerHeight, transparent,
              root: getComputedStyle(document.documentElement).backgroundColor, scrollWidth: document.documentElement.scrollWidth };
          });
          assert.ok(metrics.canvas.bottom >= height && metrics.body.bottom >= height, 'App backdrop leaves a bottom strip');
          assert.ok(metrics.canvas.right >= width && metrics.scrollWidth <= width, 'App width leaves a gap or scrolls');
          assert.equal(metrics.transparent, 0, 'Canvas bottom has unpainted pixels');
          assert.equal(metrics.root, 'rgb(10, 32, 43)');
          await page.screenshot({ path: `.audit/pwa-viewport/${name}-${device}-${shortfall}.png` });
          assert.deepEqual(errors, []);
          console.log(`PASS ${name} ${device}: standalone visual viewport shorter by ${shortfall}px, bottom covered`);
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
} finally { server.stop(); }
