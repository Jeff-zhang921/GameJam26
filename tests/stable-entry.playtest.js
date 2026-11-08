// Build first. MOONCLOCK_PLAYWRIGHT may point to an external Playwright index.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';
import { throwPath, meta } from '../src/logic.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ production: true, hostname: '127.0.0.1', port: 0, countdownMs: 800 });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [], out = '.audit/stable-entry';
await mkdir(out, { recursive: true });
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());
const frames = page => page.evaluate(() => window.entryFrames);

async function open(options, reduced = false) {
  const context = await browser.newContext(options), page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(reduced => {
    localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false, reduced, unlocked: 4 }));
    window.entryFrames = [];
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => raf.call(window, time => {
      callback(time);
      const game = window.__moonclock;
      if (!game) return;
      const view = game.presentation(), s = game.snapshot();
      if (!view.camera || !Array.isArray(s.actors) || window.entryFrames.length > 6000) return;
      window.entryFrames.push({ key: view.sceneKey, phase: s.phase, level: s.level, tick: s.tick,
        transition: game.transition().phase, arrival: view.arrival, arrivalKind: view.arrivalKind, gate: view.entryGate, camera: view.camera,
        actors: s.actors.map(p => ({ x: p.x, y: p.y, grounded: p.grounded })), room: game.connection().room?.status });
    });
  }, reduced);
  await page.goto(server.url.href);
  await page.waitForFunction(() => window.entryFrames.length > 0);
  return { context, page };
}

function checkEntry(trace, key, reduced = false) {
  const scene = trace.filter(f => f.key === key);
  assert.ok(scene.length > 2, 'Missing frame trace');
  let running = false, normal = false, previous;
  for (const f of scene) {
    if (normal) { assert.equal(f.arrival, null, 'Arrival restarted after normal play'); continue; }
    if (f.transition === 'landing') running = true;
    if (!running) {
      assert.ok(f.arrival, `Spawn flashed before entry (${f.phase}, ${f.transition})`);
      assert.ok(f.arrival.every(p => p.alpha === 0), 'A waiting traveller was visible');
      if (f.arrivalKind === 'left-run') {
        const left = Math.max(0, -f.camera.offsetX / f.camera.scale);
        assert.ok(f.arrival.every(p => p.x <= left - 79), 'A waiting traveller was not fully offscreen');
      } else assert.ok(f.gate && f.gate.alpha === 0, 'Entrance gate flashed during the covered phase');
    } else if (f.arrival) {
      if (previous) for (let i = 0; i < f.arrival.length; i++) assert.ok(f.arrival[i].x >= previous[i].x - 1e-6, 'Traveller vanished or moved backwards during entry');
      previous = f.arrival;
    } else {
      assert.ok(previous, 'The running frames were never drawn');
      for (let i = 0; i < f.actors.length; i++) assert.ok(Math.abs(f.actors[i].x - previous[i].x) < (reduced ? 1 : 8), 'Entry completion jumped to spawn');
      normal = true;
    }
  }
  assert.ok(running && normal, 'Entry did not finish continuously');
}

try {
  for (const [name, width, height, touch, reduced] of [
    ['desktop', 1280, 800, false, false], ['tablet', 1194, 834, true, false],
    ['phone', 667, 375, true, false], ['reduced', 844, 390, true, true],
  ]) {
    if (process.env.ENTRY_DEVICE && process.env.ENTRY_DEVICE !== name) continue;
    const { context, page } = await open({ viewport: { width, height }, hasTouch: touch, isMobile: touch }, reduced);
    try {
      await page.getByTestId('start').click();
      await ready(page); await page.waitForTimeout(50);
      checkEntry(await frames(page), 0, reduced);
      await page.screenshot({ path: `${out}/${name}-start.png` });
      // Give any responsive layout change time to settle before measuring a complete normal jump.
      await page.waitForTimeout(800);
      const before = await page.evaluate(() => ({ count: window.entryFrames.length, camera: window.__moonclock.presentation().camera }));
      await page.keyboard.down('Space');
      await page.waitForFunction(() => !window.__moonclock.snapshot().actors[0].grounded);
      await page.waitForFunction(() => window.__moonclock.snapshot().actors[0].grounded);
      await page.keyboard.up('Space');
      const jump = (await frames(page)).slice(before.count);
      assert.ok(jump.some(f => !f.actors[0].grounded));
      for (const f of jump) {
        assert.equal(f.camera.scale, before.camera.scale, 'Jump changed the zoom');
        assert.ok(Math.abs(f.camera.y - before.camera.y) < .01, `Normal jump moved the vertical camera: ${JSON.stringify({ name, before, frame: f, first: jump[0], last: jump.at(-1) })}`);
      }
      await page.locator('.shell [data-action="pause"]:visible').click();
      await page.getByTestId('level-2').click(); await ready(page); await page.waitForTimeout(50);
      const trace = await frames(page), key = Math.max(...trace.map(f => f.key));
      checkEntry(trace, key, reduced);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${out}/${name}-third-courtyard.png` });
      console.log(`PASS ${name}: frame-by-frame hidden start and level selection, continuous entry, steady ordinary jump`);
    } finally { await context.close(); }
  }

  const a = await open({ viewport: { width: 1280, height: 800 } });
  const b = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const host = a.page, guest = b.page;
  try {
    await host.getByTestId('create-room').click(); await host.getByTestId('room-code').waitFor();
    const code = (await host.getByTestId('room-code').innerText()).trim();
    await guest.getByTestId('join-room').click(); await guest.getByTestId('room-code-input').fill(code);
    await guest.getByTestId('join-room-submit').click();
    await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
    await host.getByTestId('start-game').click(); await Promise.all([ready(host), ready(guest)]);
    await host.waitForTimeout(80);
    for (const page of [host, guest]) {
      const trace = await frames(page);
      for (const f of trace.filter(f => ['WAITING', 'READY', 'STARTING'].includes(f.room))) assert.ok(f.arrival, 'Lobby/countdown showed spawned travellers');
      checkEntry(trace, Math.max(...trace.map(f => f.key)));
    }
    console.log('PASS online start: neither player flashes in the lobby, countdown or doorway handoff');

    await host.getByTestId('pause').click(); await host.getByTestId('level-2').click();
    await host.getByTestId('confirm-level').click(); await Promise.all([ready(host), ready(guest)]);
    await host.waitForTimeout(60);
    for (const page of [host, guest]) { const trace = await frames(page); checkEntry(trace, Math.max(...trace.map(f => f.key))); }
    const room = server.rooms.rooms.get(code), pit = room.game.pits.find(p => p.wall === 1);
    Object.assign(room.game.actors[0], { x: 1300, y: 300, vx: 0, vy: 0, move: 0, on: 'platform-1', grounded: true });
    Object.assign(room.game.actors[1], { x: 1495, y: 440, vx: 0, vy: 0, move: 0, facing: -1, on: 'platform-5', grounded: true, jumpHeld: false });
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[1].x === 1495);
    await guest.waitForFunction(() => document.querySelector('[data-testid="touch-seed-counter"] b')?.textContent === '3');
    await guest.keyboard.down('KeyR'); await guest.keyboard.press('Escape'); await guest.keyboard.up('KeyR');
    await guest.waitForFunction(() => {
      const s = window.__moonclock.snapshot(); return s.seeds === 3 && s.actors[1].carrying === null;
    });
    console.log('PASS upstream seed controls: opening hand seed returns to stock once when the R aim is cancelled');
    await guest.evaluate(() => { if (window.__moonclock.snapshot().actors[1].carrying === null) window.__moonclock.dispatch({ type: 'takeSeed', actor: 1 }); });
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[1].carrying !== null);
    let aim = null;
    for (let vx = -11; vx <= 11; vx += .25) for (let vy = -11; vy <= 11; vy += .25) {
      if (Math.hypot(vx, vy) > meta.throw.maxSpeed) continue;
      const end = throwPath(room.game, 1, { vx, vy }).at(-1), d = Math.hypot(end.x - pit.x - 10, end.y - pit.y);
      if (!aim || d < aim.d) aim = { vx, vy, d };
    }
    assert.ok(aim.d <= 24);
    await guest.evaluate(({ vx, vy }) => window.__moonclock.dispatch({ type: 'grab', actor: 1, aim: { vx, vy } }), aim);
    await guest.waitForFunction(() => window.__moonclock.snapshot().pits.some(p => p.wall === 1 && p.plant));
    await guest.screenshot({ path: `${out}/wide-platform-throw.png` });
    const planted = await snapshot(guest);
    await guest.reload(); await ready(guest); await guest.waitForTimeout(80);
    const reconnected = await snapshot(guest);
    assert.equal(reconnected.seeds, planted.seeds, 'Reconnect duplicated the opening seed');
    assert.equal(reconnected.actors[1].carrying, null, 'Reconnect gave Bloom another hand seed');
    assert.equal(reconnected.pits.find(p => p.wall === 1).plant, planted.pits.find(p => p.wall === 1).plant);
    assert.equal(await guest.evaluate(() => window.__moonclock.presentation().arrival), null);
    console.log('PASS third-courtyard reconnect: opening seed stays spent, plant persists, no repeated entry');
    await guest.evaluate(() => {
      window.__moonclock.dispatch({ type: 'move', actor: 1, dir: -1 });
      window.__moonclock.dispatch({ type: 'jump', actor: 1 });
    });
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[1].on === 'platform-1');
    await guest.evaluate(() => { window.__moonclock.dispatch({ type: 'move', actor: 1, dir: 0 }); window.__moonclock.dispatch({ type: 'jumpRelease', actor: 1 }); });
    console.log('PASS online third courtyard: wider platform, real seed throw and jump back to the high ledge');

    for (const actor of room.game.actors) Object.assign(actor, { x: room.game.exit.x, y: room.game.exit.y, vx: 0, vy: 0, move: 0, grounded: true, jumpHeld: false });
    await host.waitForFunction(() => window.__moonclock.snapshot().level === 3);
    await Promise.all([ready(host), ready(guest)]); await host.waitForTimeout(80);
    for (const page of [host, guest]) { const trace = await frames(page); checkEntry(trace, Math.max(...trace.map(f => f.key))); }
    console.log('PASS automatic gate transition: next scene remains offscreen until its entry begins');

    Object.assign(room.game.actors[1], { x: 400, y: 520, vx: 0, vy: 0, move: 0, grounded: true });
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[1].x === 400);
    await guest.reload(); await ready(guest); await guest.waitForTimeout(80);
    const trace = await frames(guest), key = Math.max(...trace.map(f => f.key));
    const restored = trace.filter(f => f.key === key && f.room === 'PLAYING');
    assert.ok(restored.length > 0 && restored.every(f => f.arrival === null && f.transition === null), 'Reconnect replayed the entry');
    assert.equal((await snapshot(guest)).actors[1].x, 400);
    console.log('PASS reconnect: current position restored without running in again');
  } finally { await a.context.close(); await b.context.close(); }
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.stop(); }
