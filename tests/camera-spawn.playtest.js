// Run with Bun, Chrome and MOONCLOCK_PLAYWRIGHT pointing to Playwright's index.mjs if installed externally.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ hostname: '127.0.0.1', port: 0, countdownMs: 650 });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());
await mkdir('.audit/camera-spawn', { recursive: true });

async function open(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({ unlocked: 4, sound: false })));
  await page.goto(server.url.href);
  return { context, page };
}

async function checkArrival(page, name) {
  await page.waitForFunction(() => window.__moonclock.transition().phase === 'landing' && window.__moonclock.presentation().arrival?.every(p => p.x < 0));
  const before = await page.evaluate(() => ({ actors: window.__moonclock.presentation().arrival, spawn: window.__moonclock.snapshot().actors }));
  await page.waitForTimeout(650);
  const during = await page.evaluate(() => window.__moonclock.presentation().arrival);
  assert.ok(during, 'The entry should still be running');
  for (const [i, actor] of during.entries()) {
    assert.ok(actor.x > before.actors[i].x && actor.x < before.spawn[i].x, 'Entry must move right toward the spawn');
    assert.equal(actor.y, before.spawn[i].y, 'Entry must stay at ground height');
    assert.equal(actor.move, 1, 'Entry must animate walking');
  }
  if (name) await page.screenshot({ path: `.audit/camera-spawn/${name}.png` });
  await ready(page);
}

try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1280, height: 800 } }],
    ['phone', { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }],
  ]) {
    const { context, page } = await open(options);
    try {
      await page.getByTestId('start').click();
      await checkArrival(page, `${name}-level-1`);
      for (let level = 1; level < 5; level++) {
        await page.getByTestId(name === 'phone' ? 'touch-pause' : 'pause').click();
        await page.getByTestId(`level-${level}`).click();
        await checkArrival(page, level === 4 ? `${name}-level-5` : null);
        assert.equal((await snapshot(page)).level, level);
      }
      if (name === 'desktop') await checkHighJumpPixels(page);
      console.log(`PASS ${name}: all five courtyards walk in from the left`);
    } finally { await context.close(); }
  }

  const hostSession = await open({ viewport: { width: 1280, height: 800 } });
  const guestSession = await open({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
  const host = hostSession.page, guest = guestSession.page;
  try {
    await host.getByTestId('create-room').click();
    await host.getByTestId('room-code').waitFor();
    const code = (await host.getByTestId('room-code').innerText()).trim();
    await guest.getByTestId('join-room').click();
    await guest.getByTestId('room-code-input').fill(code);
    await guest.getByTestId('join-room-submit').click();
    await host.getByTestId('character-still').click();
    await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click();
    await guest.getByTestId('ready').click();
    await host.getByTestId('start-game').click();
    await Promise.all([checkArrival(host, 'online-host-start'), checkArrival(guest, 'online-guest-start')]);
    await host.getByTestId('pause').click();
    await host.getByTestId('level-4').click();
    await host.getByTestId('confirm-level').click();
    await Promise.all([checkArrival(host, 'online-host-level-5'), checkArrival(guest, 'online-guest-level-5')]);
    const room = server.rooms.rooms.get(code);
    room.game.objects = [];
    const stand = (id, x) => Object.assign(room.game.actors[id], { x, y: 520, vy: 0, vx: 0, move: 0, grounded: true, checkpoint: null });
    stand(0, 520); stand(1, 100);
    for (const page of [host, guest]) await page.waitForFunction(() => window.__moonclock.snapshot().actors[0].checkpoint === 'cp-0');
    const beforeFall = room.game.eventSeq;
    Object.assign(room.game.actors[1], { x: 680, y: 720, grounded: false });
    for (const page of [host, guest]) await page.waitForFunction(seq => {
      const state = window.__moonclock.snapshot(), p = state.actors;
      return p[0].x === 520 && p[1].x === 100 && p[1].checkpoint === null && state.events.some(e => e.id > seq && e.kind === 'return' && e.actor === 1);
    }, beforeFall);
    stand(1, 840);
    for (const page of [host, guest]) await page.waitForFunction(() => window.__moonclock.snapshot().actors[1].checkpoint === 'cp-1');
    Object.assign(room.game.actors[0], { x: 680, y: 720, grounded: false });
    for (const page of [host, guest]) await page.waitForFunction(() => {
      const p = window.__moonclock.snapshot().actors;
      return p[0].x === 502 && p[1].x === 840 && p[0].checkpoint === 'cp-0' && p[1].checkpoint === 'cp-1';
    });
    console.log('PASS online: both entry paths and independent checkpoint respawns agree on both clients');
  } finally { await hostSession.context.close(); await guestSession.context.close(); }
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.stop(); }

async function checkHighJumpPixels(page) {
  await page.evaluate(async () => {
    const { createRenderer } = await import('/render.js');
    const { setup } = await import('/src/logic.js');
    const { S } = await import('/strings.js');
    const surface = document.createElement('canvas');
    surface.dataset.testid = 'high-jump-canvas';
    Object.assign(surface.style, { position: 'fixed', left: '0', top: '0', width: '1280px', height: '640px', zIndex: '1000' });
    document.body.append(surface);
    const state = setup({ level: 3 });
    state.tick = 4;
    Object.assign(state.actors[0], { x: 600, y: -180, grounded: false });
    const renderer = createRenderer(surface, S);
    renderer.draw(state, 100, { sceneKey: 0 });
    await new Promise(resolve => setTimeout(resolve, 200));
    renderer.draw(state, 100, { sceneKey: 0 });
    const before = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
    window.highJumpTest = { surface, renderer, state, before };
  });
  await page.getByTestId('high-jump-canvas').screenshot({ path: '.audit/camera-spawn/high-jump.png' });
  const result = await page.evaluate(() => {
    const { surface, renderer, state, before } = window.highJumpTest;
    const camera = renderer.inspect().camera;
    state.actors[0].invuln = 1; // tick 4 blinks only this character out; keep the same camera and world.
    renderer.draw(state, 100, { sceneKey: 0 });
    const after = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height);
    const ratio = surface.width / 1280;
    let changed = 0;
    for (let y = 0; y < Math.min(surface.height, Math.floor(camera.offsetY * ratio)); y++) {
      for (let x = 0; x < surface.width; x++) {
        const i = (y * surface.width + x) * 4;
        if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]) changed++;
      }
    }
    surface.remove(); delete window.highJumpTest;
    return { changed, head: (-180 - 84) * camera.scale + camera.offsetY, feet: -180 * camera.scale + camera.offsetY };
  });
  assert.ok(result.head >= 0 && result.feet <= 640, 'Camera must frame the entire high-jumping sprite');
  assert.ok(result.changed > 100, 'The real canvas must draw the character above the map top');
  console.log(`PASS high jump: ${result.changed} character pixels rendered above the map`);
}
