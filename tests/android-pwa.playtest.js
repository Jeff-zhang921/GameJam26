import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = process.env.MOONCLOCK_TEST_URL
  ? { url: new URL(process.env.MOONCLOCK_TEST_URL), stop() {} }
  : (await import('../server.js')).createGameServer({ production: true, hostname: '127.0.0.1', port: 0 });
let browser;
try {
  await mkdir('.audit/android-home-edges', { recursive: true });
  browser = await chromium.launch({ channel: 'chrome' });
  for (const mode of ['fullscreen', 'standalone', 'browser']) {
    const context = await browser.newContext({ viewport: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(mode => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = query => {
          const media = original(query);
          if (query.includes('display-mode:')) Object.defineProperty(media, 'matches', {
            value: [...query.matchAll(/display-mode:\s*([\w-]+)/g)].some(match => match[1] === mode),
          });
          return media;
        };
        localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false }));
      }, mode);
      await page.goto(server.url.href);
      await page.getByTestId('start').waitFor();
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-left', '47px');
        document.documentElement.style.setProperty('--safe-bottom', '24px');
        window.dispatchEvent(new Event('beforeinstallprompt'));
      });
      assert.equal(await page.locator('.pwa-install').isVisible(), mode === 'browser', `${mode}: installed app shows an install prompt`);
      assert.equal(await page.evaluate(() => document.fullscreenElement), null, 'Launch-mode test must not depend on the Fullscreen API');
      const entry = await page.locator('.entry-screen').boundingBox();
      assert.deepEqual({ left: entry.x, top: entry.y, right: entry.x + entry.width, bottom: entry.y + entry.height }, { left: 0, top: 0, right: 851, bottom: 393 });
      const edges = await page.evaluate(() => [[1, 196], [425, 392], [1, 392]].map(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.entry-screen')));
      assert.deepEqual(edges, [true, true, true], 'Homepage leaves its left or bottom edge uncovered');
      await page.screenshot({ path: `.audit/android-home-edges/${mode}-home.png` });
      await page.setViewportSize({ width: 393, height: 851 });
      await page.waitForFunction(() => document.body.getBoundingClientRect().height === 851);
      const portraitEdges = await page.evaluate(() => [[1, 425], [196, 850], [1, 850]].map(([x, y]) =>
        !!document.elementFromPoint(x, y)?.closest('.orientation-gate:not([hidden]), .entry-screen')));
      assert.deepEqual(portraitEdges, [true, true, true], 'Portrait rotation exposes a page edge');
      await page.setViewportSize({ width: 851, height: 393 });
      await page.waitForFunction(() => document.body.getBoundingClientRect().height === 393 && document.querySelector('.orientation-gate').hidden);
      await page.getByTestId('start').tap();
      await page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
      const canvas = await page.locator('#game').boundingBox();
      assert.deepEqual({ left: canvas.x, right: canvas.x + canvas.width, bottom: canvas.y + canvas.height }, { left: 0, right: 851, bottom: 393 });
      assert.deepEqual(errors, []);
      const cdp = await context.newCDPSession(page);
      const manifest = await cdp.send('Page.getAppManifest');
      assert.deepEqual(manifest.errors, []);
      assert.equal(manifest.manifest.display, 'kFullscreen', 'Chromium does not parse an immersive launch mode');
      console.log(`PASS Android signals, ${mode}: homepage left/bottom covered, rotation correct, install UI correct, game fills window, manifest kFullscreen`);
    } finally {
      await context.close();
    }
  }
} finally {
  try { await browser?.close(); } finally { server.stop(); }
}
