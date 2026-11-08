// Build first. Run with Bun and Chrome; MOONCLOCK_PLAYWRIGHT can select an installed Playwright.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const production = createGameServer({ production: true, hostname: '127.0.0.1', port: 0 });
const development = createGameServer({ production: false, hostname: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [], cutsceneRequests = [], out = '.audit/cutscene-removal';
await mkdir(out, { recursive: true });
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const ending = page => page.getByTestId('ending').waitFor();
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());

async function open(server, { touch = false, final = false } = {}) {
  const context = await browser.newContext({ viewport: touch ? { width: 844, height: 390 } : { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/\/(?:prologue|epilogue)(?:[/.])/.test(request.url())) cutsceneRequests.push(request.url()); });
  await page.addInitScript(final => {
    localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false, unlocked: 4, level: final ? 4 : 0 }));
    window.seenPhases = [];
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector('#modal-root');
      new MutationObserver(() => window.seenPhases.push(root.dataset.phase)).observe(root, { attributes: true, attributeFilter: ['data-phase'] });
    }, { once: true });
  }, final);
  if (final) await page.route(url => url.pathname === '/src/logic.js' && !url.search, route => route.fulfill({ contentType: 'application/javascript', body: `
    export * from '/src/logic.js?cutscene-removal-original';
    import { setup as original } from '/src/logic.js?cutscene-removal-original';
    export function setup(options) {
      const state = original(options);
      if (state.level === 4) for (const actor of state.actors) Object.assign(actor, { x: state.exit.x, y: state.exit.y });
      return state;
    }
  ` }));
  await page.goto(server.url.href);
  return { context, page };
}

try {
  const manifest = await (await fetch(new URL('/build.json', production.url))).json();
  assert.ok(!manifest.assets.some(path => /\/(?:prologue|epilogue)(?:[/.])/.test(path)), 'Release still includes cutscene assets');
  for (const touch of [false, true]) {
    const { context, page } = await open(production, { touch });
    try {
      const began = Date.now();
      await page.getByTestId('start').click(); await ready(page);
      assert.ok(Date.now() - began < 4000, 'Local start still waits for the opening film');
      assert.equal(await page.locator('.prologue,.epilogue,.online-entrance').count(), 0);
      const before = (await snapshot(page)).actors[0].x;
      await page.keyboard.down('KeyD'); await page.waitForTimeout(120); await page.keyboard.up('KeyD');
      assert.ok((await snapshot(page)).actors[0].x > before, 'Start left gameplay input blocked');
      console.log(`PASS ${touch ? 'phone' : 'desktop'} local start: direct gameplay, working controls, no opening overlay.`);
    } finally { await context.close(); }
  }
  for (const touch of [false, true]) {
    const { context, page } = await open(development, { touch, final: true });
    try {
      const began = Date.now();
      await page.getByTestId('start').click(); await ending(page);
      assert.ok(Date.now() - began < 4000, 'Final completion still waits for a film');
      assert.equal(await page.locator('.prologue,.epilogue,.online-entrance').count(), 0);
      const phases = await page.evaluate(() => window.seenPhases);
      assert.ok(phases.every(phase => !['prologue', 'epilogue', 'celebration'].includes(phase)));
      assert.ok(await page.getByTestId('play-again').isEnabled());
      for (const id of ['play-again', 'ending-leave']) {
        const box = await page.getByTestId(id).boundingBox(), size = page.viewportSize();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height, `${id} must be visible without scrolling`);
      }
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${touch ? 'phone' : 'desktop'}-results.png` });
      if (touch) {
        await page.getByTestId('ending-leave').tap(); await page.getByTestId('start').waitFor();
      } else {
        await page.getByTestId('play-again').click(); await ready(page);
        assert.equal((await snapshot(page)).level, 0);
      }
      console.log(`PASS ${touch ? 'phone' : 'desktop'} completion: immediate results and working replay/menu.`);
    } finally { await context.close(); }
  }

  const hostSession = await open(production), guestSession = await open(production, { touch: true });
  const host = hostSession.page, guest = guestSession.page;
  try {
    await host.getByTestId('create-room').click(); await host.getByTestId('room-code').waitFor();
    const code = (await host.getByTestId('room-code').innerText()).trim();
    await guest.getByTestId('join-room').click(); await guest.getByTestId('room-code-input').fill(code); await guest.getByTestId('join-room-submit').click();
    await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
    const began = Date.now();
    await host.getByTestId('start-game').click(); await Promise.all([ready(host), ready(guest)]);
    assert.ok(Date.now() - began < 4000, 'Online start still waits for an opening film');
    const room = production.rooms.rooms.get(code);
    assert.equal(production.rooms.publicRoom(room).startDuration, 0);
    await host.evaluate(() => window.__moonclock.dispatch({ type: 'level', level: 4 }));
    await Promise.all([host.waitForFunction(() => window.__moonclock.snapshot().level === 4), guest.waitForFunction(() => window.__moonclock.snapshot().level === 4)]);
    await Promise.all([ready(host), ready(guest)]);
    room.game.objects = [];
    for (const actor of room.game.actors) Object.assign(actor, { x: room.game.exit.x, y: room.game.exit.y, vx: 0, vy: 0, move: 0, grounded: true, invuln: 1000 });
    const finished = Date.now();
    await Promise.all([ending(host), ending(guest)]);
    assert.ok(Date.now() - finished < 2000, 'Online completion still waits for an ending film');
    assert.ok(await host.getByTestId('play-again').isEnabled()); assert.ok(await guest.getByTestId('play-again').isDisabled());
    await host.getByTestId('play-again').click(); await Promise.all([ready(host), ready(guest)]);
    assert.equal((await snapshot(host)).level, 0); assert.equal((await snapshot(guest)).level, 0);
    console.log('PASS online: instant start, direct final results on both clients, host-controlled replay.');
  } finally { await hostSession.context.close(); await guestSession.context.close(); }
  assert.deepEqual(cutsceneRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS no cutscene resources are requested or packaged.');
} finally { await browser.close(); production.stop(); development.stop(); }
