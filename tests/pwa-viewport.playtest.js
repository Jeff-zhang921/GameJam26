// Tests app-mode signals and viewport geometry, not the OS home indicator.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = process.env.MOONCLOCK_TEST_URL
  ? { url: new URL(process.env.MOONCLOCK_TEST_URL), stop() {} }
  : (await import('../server.js')).createGameServer({ production: true, hostname: '127.0.0.1', port: 0 });
await mkdir('.audit/pwa-viewport', { recursive: true });
try {
  for (const [name, launch] of [['chromium', () => chromium.launch({ channel: 'chrome' })], ['webkit', () => webkit.launch()]]) {
    const browser = await launch();
    try {
      for (const [device, width, height] of [['ipad', 1194, 834], ['iphone', 844, 390]]) {
        for (const { shortfall, shortLayout = false, installed = true } of [
          { shortfall: .5 }, { shortfall: 21 }, { shortfall: 21, shortLayout: true },
          { shortfall: 0, installed: false }, { shortfall: 21, shortLayout: true, installed: false },
        ]) {
          const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
          const page = await context.newPage(), errors = [];
          page.on('pageerror', error => errors.push(error.message));
          await page.addInitScript(({ shortfall, shortLayout, installed }) => {
            Object.defineProperty(navigator, 'standalone', { get: () => installed });
            localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false }));
            if (shortLayout) Object.defineProperty(window, 'innerHeight', { get: () => document.documentElement.clientHeight - shortfall });
            window.viewportFixture = { keyboardHeight: null, offsetTop: 0 };
            const original = visualViewport;
            Object.defineProperty(window, 'visualViewport', { value: {
              get width() { return original.width; }, get height() { return window.viewportFixture.keyboardHeight ?? original.height - shortfall; },
              get scale() { return original.scale; }, offsetLeft: 0, get offsetTop() { return window.viewportFixture.offsetTop; },
              addEventListener: (...args) => original.addEventListener(...args),
            } });
          }, { shortfall, shortLayout, installed });
          await page.goto(server.url.href);
          await page.getByTestId('start').waitFor();
          const expectedHeight = height - (shortLayout && !installed ? shortfall : 0);
          const titleBottom = await page.locator('.entry-screen').evaluate(node => node.getBoundingClientRect().bottom);
          assert.equal(titleBottom, expectedHeight, `${name} ${device}: title backdrop ends at ${titleBottom}px instead of ${expectedHeight}px`);
          if (installed && shortLayout && device === 'ipad') {
            await page.getByTestId('join-room').tap();
            const input = page.getByTestId('room-code-input');
            await input.waitFor();
            await input.evaluate(node => {
              node.blur();
              window.viewportFixture.keyboardHeight = 420;
              window.viewportFixture.offsetTop = 24;
              node.focus();
            });
            await page.waitForFunction(() => document.body.getBoundingClientRect().height === 420);
            const keyboard = await page.locator('body').evaluate(node => node.getBoundingClientRect().toJSON());
            assert.equal(keyboard.top, 24, 'Text entry loses the visual viewport offset');
            await input.evaluate(node => {
              window.viewportFixture.keyboardHeight = null;
              window.viewportFixture.offsetTop = 0;
              node.blur();
            });
            await page.waitForFunction(height => document.body.getBoundingClientRect().height === height, height);
            await page.getByRole('button', { name: 'Leave Room', exact: true }).tap();
          }
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
          assert.equal(metrics.canvas.bottom, expectedHeight, `App backdrop ends at ${metrics.canvas.bottom}px instead of ${expectedHeight}px`);
          assert.equal(metrics.body.bottom, expectedHeight);
          assert.ok(metrics.canvas.right >= width && metrics.scrollWidth <= width, 'App width leaves a gap or scrolls');
          assert.equal(metrics.transparent, 0, 'Canvas bottom has unpainted pixels');
          assert.equal(metrics.root, 'rgb(10, 32, 43)');
          await page.screenshot({ path: `.audit/pwa-viewport/${name}-${device}-${shortfall}${shortLayout ? '-layout' : ''}${installed ? '' : '-browser'}.png` });
          if (installed && shortLayout && device === 'ipad') {
            for (const viewport of [{ width: 1024, height: 600 }, { width: 768, height: 1024 }, { width, height }]) {
              await page.setViewportSize(viewport);
              await page.waitForFunction(height => document.body.getBoundingClientRect().height === height, viewport.height);
              const resized = await page.locator('body').evaluate(node => node.getBoundingClientRect().toJSON());
              assert.equal(resized.width, viewport.width, 'Resizing follows physical screen instead of the current window');
              assert.equal(resized.bottom, viewport.height, 'Resizing retains the previous window height');
            }
            console.log(`PASS ${name} ipad: keyboard focus/blur without resize, split-window shrink and rotation`);
          }
          assert.deepEqual(errors, []);
          console.log(`PASS ${name} ${device}: ${installed ? 'standalone' : 'browser'} ${shortLayout ? 'visual and layout viewports' : 'visual viewport'} shorter by ${shortfall}px, title and game bounds correct`);
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
} finally { server.stop(); }
