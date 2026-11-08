// Build first; MOONCLOCK_PLAYWRIGHT may point to an external Playwright index.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';
import { makeEnemy, ENEMY } from '../src/enemies.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ production: true, hostname: '127.0.0.1', port: 0, countdownMs: 700 });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [], out = '.audit/experience';
await mkdir(out, { recursive: true });
const snap = page => page.evaluate(() => window.__moonclock.snapshot());
const phase = (page, value) => page.waitForFunction(value => window.__moonclock?.snapshot().phase === value, value);
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const pauseButton = page => page.locator('.shell [data-action="pause"]:visible');

async function open(options, sound = false, viewportOptions = {}) {
  const context = await browser.newContext(options), page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(({ sound, shortfall, standalone }) => {
    localStorage.setItem('moonclock-v1', JSON.stringify({ sound, unlocked: 4 }));
    window.haptics = [];
    Object.defineProperty(navigator, 'vibrate', { value: ms => { window.haptics.push(ms); return true; }, configurable: true });
    if (standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
    if (shortfall) {
      const original = visualViewport;
      Object.defineProperty(window, 'visualViewport', { value: {
        get width() { return original.width; }, get height() { return original.height - shortfall; },
        get scale() { return original.scale; }, offsetLeft: 0, offsetTop: 0,
        addEventListener: (...args) => original.addEventListener(...args),
      } });
    }
  }, { sound, ...viewportOptions });
  await page.goto(server.url.href);
  return { context, page };
}

try {
  for (const [name, width, height, touch, viewportOptions] of [
    ['desktop', 1280, 800, false, {}], ['tablet', 1194, 834, true, {}],
    ['phone', 844, 390, true, { shortfall: .5 }], ['pwa', 1024, 768, true, { shortfall: 21, standalone: true }],
  ]) {
    if (process.env.EXPERIENCE_CASE && process.env.EXPERIENCE_CASE !== name) continue;
    const { context, page } = await open({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 }, false, viewportOptions);
    try {
      if (touch) await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '21px'));
      await page.getByTestId('start').click(); await ready(page);
      for (let level = 0; level < 5; level++) {
        if (level) await page.evaluate(level => window.__moonclock.dispatch({ type: 'level', level }), level);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await page.evaluate(() => {
          const canvas = document.querySelector('#game'), rect = canvas.getBoundingClientRect();
          const pixels = canvas.getContext('2d').getImageData(0, canvas.height - 1, canvas.width, 1).data;
          const colors = new Set(); let transparent = 0;
          for (let i = 0; i < pixels.length; i += 4) { colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); if (pixels[i + 3] !== 255) transparent++; }
          const camera = window.__moonclock.presentation().camera, state = window.__moonclock.snapshot();
          const controls = [...document.querySelectorAll('.joystick-base, .touch-controls button')].map(node => node.getBoundingClientRect()).filter(box => box.height > 0);
          return { bottom: rect.bottom, right: rect.right, colors: colors.size, transparent, width: innerWidth, height: innerHeight, camera,
            controlTop: controls.length ? Math.min(...controls.map(box => box.top)) : null, feet: rect.top + camera.offsetY + state.actors[state.active].y * camera.scale };
        });
        await page.screenshot({ path: `${out}/${name}-level-${level + 1}.png` });
        assert.ok(metrics.bottom >= metrics.height && metrics.right >= metrics.width, `${name} level ${level + 1}: viewport gap`);
        assert.equal(metrics.transparent, 0, `${name}: unpainted bottom pixels`);
        assert.ok(metrics.colors > 8, `${name} level ${level + 1}: flat bottom strip (${JSON.stringify(metrics)})`);
        if (touch) assert.ok(metrics.feet <= metrics.controlTop - 6, `${name}: touch controls obscure the active traveller`);
      }
      console.log(`PASS ${name}: all five courtyards cover the bottom with scene texture`);
    } finally { await context.close(); }
  }

  if (!process.env.EXPERIENCE_OFFLINE_ONLY) {
  const a = await open({ viewport: { width: 1280, height: 800 } }, true);
  const b = await open({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
  const host = a.page, guest = b.page;
  try {
    await host.getByTestId('create-room').click();
    await host.getByTestId('room-code').waitFor();
    const code = (await host.getByTestId('room-code').innerText()).trim();
    await host.waitForFunction(() => window.__moonclock.audio().playing && window.__moonclock.audio().track === '/audio/symbiosis.mp3');
    await guest.getByTestId('join-room').click();
    await guest.getByTestId('room-code-input').fill(code); await guest.getByTestId('join-room-submit').click();
    await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
    assert.deepEqual(await host.evaluate(() => window.__moonclock.audio()), { track: '/audio/symbiosis.mp3', enabled: true, playing: true });
    assert.equal(await guest.evaluate(() => window.__moonclock.audio().enabled), false);
    await host.getByTestId('start-game').click();
    assert.equal(await host.evaluate(() => window.__moonclock.audio().track), '/audio/symbiosis.mp3');
    await Promise.all([ready(host), ready(guest)]);
    await host.waitForFunction(() => window.__moonclock.audio().playing && window.__moonclock.audio().track !== '/audio/symbiosis.mp3');
    console.log('PASS lobby: Symbiosis continues through selection/readiness/countdown, mute is respected, then courtyard music starts');

    const room = server.rooms.rooms.get(code);
    await host.keyboard.down('ArrowRight');
    await pauseButton(guest).click(); await Promise.all([phase(host, 'pause'), phase(guest, 'pause')]);
    const stopped = JSON.stringify(room.game);
    await host.locator('#modal-root [data-action="settings"]').click(); await phase(host, 'settings');
    await host.waitForTimeout(200); assert.equal(JSON.stringify(room.game), stopped);
    await host.locator('#modal-root [data-action="close"]').first().click(); await phase(host, 'pause');
    await host.locator('#modal-root [data-action="help"]').click(); await phase(host, 'help');
    await guest.getByTestId('resume').click(); await Promise.all([ready(host), ready(guest)]);
    assert.ok(room.game.actors.every(p => p.move === 0 && !p.jumpHeld && p.jumpBuffer === 0));
    await host.keyboard.up('ArrowRight');
    await pauseButton(host).click(); await Promise.all([phase(host, 'pause'), phase(guest, 'pause')]);
    await guest.reload(); await phase(guest, 'pause');
    await host.getByTestId('resume').click(); await Promise.all([ready(host), ready(guest)]);
    console.log('PASS shared pause: either initiator, menu subpages, remote Resume, cleared held keys and paused reconnection');

    await host.evaluate(() => window.__moonclock.dispatch({ type: 'level', level: 4 }));
    await Promise.all([ready(host), ready(guest)]);
    room.game.objects = [];
    Object.assign(room.game.actors[0], { x: 60, y: 520, move: 0, vx: 0, vy: 0, grounded: true, invuln: 0 });
    Object.assign(room.game.actors[1], { x: 100, y: 520, move: 0, vx: 0, vy: 0, grounded: true, invuln: 0 });
    await guest.waitForFunction(() => window.__moonclock.snapshot().objects.length === 0);
    await host.waitForTimeout(100);
    const before = await host.evaluate(() => window.__moonclock.presentation().camera);
    const guestScale = await guest.evaluate(() => window.__moonclock.presentation().camera.scale);
    Object.assign(room.game.actors[1], { y: -280, vy: 0, grounded: false });
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[1].y < -200 && window.__moonclock.presentation().camera.offsetY > 100);
    assert.deepEqual(await host.evaluate(() => window.__moonclock.presentation().camera), before, 'The jumping partner changed the host camera');
    assert.equal(await guest.evaluate(() => window.__moonclock.presentation().camera.scale), guestScale);
    const frames = await guest.evaluate(async () => {
      const context = document.querySelector('#game').getContext('2d'), original = context.drawImage, seen = [];
      context.drawImage = function (...args) {
        if (/\/(still|mage)\.png$/.test(args[0]?.src ?? '') && args.length === 9) seen.push({ sourceHeight: args[4], height: args[8], feet: args[6] + args[8] });
        return original.apply(this, args);
      };
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      context.drawImage = original; return seen;
    });
    assert.ok(frames.length >= 2);
    assert.ok(frames.every(frame => frame.height === 72 && frame.feet === 2), 'Real sprite drawing changed size or foot anchor');
    await guest.screenshot({ path: `${out}/independent-high-jump.png` });
    console.log('PASS cameras and sprites: partner unaffected, own high jump keeps scale, actual sheet frames draw at 72 world units');

    await Promise.all([host.evaluate(() => { window.haptics = []; }), guest.evaluate(() => { window.haptics = []; })]);
    await host.bringToFront();
    room.game.objects = [makeEnemy('guard', { x: 330, y: 520, minX: 330, maxX: 330 }, 'test-shell')];
    Object.assign(room.game.actors[0], { x: 330, y: 470, grounded: true, on: 'test-shell', invuln: 0, checkpoint: null });
    Object.assign(room.game.actors[1], { x: 100, y: 520, vy: 0, grounded: true, invuln: 1000 });
    room.game.objects[0].attack = ENEMY.guard.attackEvery - 2;
    await host.waitForFunction(() => window.haptics.length >= 1);
    await host.waitForTimeout(150);
    assert.deepEqual(await host.evaluate(() => window.haptics), [25]);
    assert.deepEqual(await guest.evaluate(() => window.haptics), []);
    assert.ok((await snap(host)).events.some(e => e.kind === 'hit' && e.sourceKind === 'guard' && e.actor === 0));
    room.game.freezeAreas.push({ id: 'shell-test-freeze', x: 330, y: 490, radius: 130, ticksLeft: 600, duration: 600 });
    const guard = room.game.objects.find(o => o.id === 'test-shell');
    guard.attack = 27; // A slowed windup remains visible long enough to review the retracted head.
    await host.waitForTimeout(100);
    await host.screenshot({ path: `${out}/frozen-shell-windup.png` });
    console.log('PASS shell hit: confirmed source, only the hit player vibrates once, slowed shell pose renders');

    for (const actor of room.game.actors) Object.assign(actor, { x: room.game.exit.x, y: room.game.exit.y, move: 0, vx: 0, vy: 0, invuln: 1000 });
    await host.waitForFunction(() => window.__moonclock.transition().phase === 'entering');
    await host.waitForTimeout(1800);
    const gate = await host.evaluate(() => window.__moonclock.presentation().portal);
    assert.ok(gate.walk > 0 && !Object.hasOwn(gate, 'push'));
    await host.screenshot({ path: `${out}/starlit-gate-walk.png` });
    await Promise.all([ready(host), ready(guest)]);
    assert.equal((await snap(host)).level, 0); assert.equal((await snap(guest)).level, 0);
    console.log('PASS moon gate: walking and camera passage without a push phase; both clients reach the next courtyard');
  } finally { await a.context.close(); await b.context.close(); }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.stop(); }
