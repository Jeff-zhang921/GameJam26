// Run with the same MOONCLOCK_PLAYWRIGHT / PLAYWRIGHT_BROWSERS_PATH as mobile-surface.playtest.js.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';
const { chromium, webkit } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const server = createGameServer({ hostname: '127.0.0.1', port: 0, countdownMs: 150 });
const ready = page => page.waitForFunction(() => window.__moonclock?.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const snap = page => page.evaluate(() => window.__moonclock.snapshot());
const errors = [];
await mkdir('.audit/portal', { recursive: true });
try {
  for (const [engine, launch, levels] of [
    ['chromium', () => chromium.launch({ channel: 'chrome' }), [0, 1, 2, 3, 4]],
    ['webkit', () => webkit.launch(), [0, 4]],
  ]) {
    const browser = await launch();
    try {
      for (const level of process.env.PORTAL_ONLINE_ONLY ? [] : levels) {
        const phone = level % 2 === 0 && level !== 0;
        const context = await browser.newContext({ viewport: phone ? { width: 667, height: 375 } : { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.addInitScript(level => localStorage.setItem('moonclock-v1', JSON.stringify({ level, unlocked: 4, sound: false })), level);
        await page.route(url => url.pathname === '/src/logic.js' && !url.search, route => route.fulfill({ contentType: 'application/javascript', body: `
          export * from '/src/logic.js?original';
          import { setup as original } from '/src/logic.js?original';
          export function setup(options) {
            const state = original(options);
            Object.assign(state.actors[0], { x: state.exit.x, y: state.exit.y });
            Object.assign(state.actors[1], { x: state.exit.x - 70, y: state.exit.y });
            return state;
          }` }));
        await page.goto(server.url.href);
        await page.getByTestId('start').tap();
        await ready(page);
        assert.equal(await page.locator('.goal-panel').count(), 0);
        await page.getByTestId('dialogue').waitFor({ state: 'visible' });
        const first = await page.locator('.dialogue-text').innerText();
        await page.waitForFunction(n => document.querySelector('.dialogue-text').textContent.length > n, first.length);
        assert.equal((await snap(page)).status, 'playing');
        assert.equal(await page.evaluate(() => window.__moonclock.presentation().portal), null, 'One traveller cannot push or open the gate');
        const skip = await page.getByTestId('skip-dialogue').boundingBox();
        const bubble = await page.getByTestId('dialogue').boundingBox();
        assert.ok(skip.x + skip.width <= bubble.x + bubble.width && skip.y >= bubble.y);
        await page.screenshot({ path: `.audit/portal/${engine}-${level + 1}-dialogue.png` });
        await page.getByTestId('skip-dialogue').tap();
        await page.getByTestId('dialogue').waitFor({ state: 'hidden' });
        await page.locator('#game').focus();
        await page.keyboard.press('Tab');
        const before = await page.evaluate(() => window.__moonclock.presentation().camera.scale);
        await page.keyboard.down('ArrowRight');
        await page.waitForFunction(() => window.__moonclock.transition().phase === 'entering');
        await page.keyboard.up('ArrowRight');
        await page.waitForFunction(() => { const p = window.__moonclock.presentation().portal; return p?.push > .8 && p.opening < .15; });
        await page.screenshot({ path: `.audit/portal/${engine}-${level + 1}-push.png` });
        await page.waitForFunction(scale => window.__moonclock.presentation().camera.scale > scale * 1.2, before);
        await page.screenshot({ path: `.audit/portal/${engine}-${level + 1}-enter.png` });
        assert.equal(await page.getByTestId('next').count(), 0);
        await page.waitForFunction(() => { const p = window.__moonclock.presentation().portal; return p?.opening > .95 && p.walk > .3; });
        await page.screenshot({ path: `.audit/portal/${engine}-${level + 1}-through.png` });
        await page.waitForFunction(() => window.__moonclock.transition().phase === 'landing');
        assert.equal((await snap(page)).level, (level + 1) % 5);
        await page.screenshot({ path: `.audit/portal/${engine}-${level + 1}-landing.png` });
        await ready(page);
        await page.waitForFunction(() => window.__moonclock.snapshot().actors.every(p => p.grounded));
        const y = (await snap(page)).actors[0].y;
        await page.getByTestId('touch-jump').tap();
        await page.waitForFunction(y => window.__moonclock.snapshot().actors[0].y < y - 5, y);
        assert.equal(await page.locator('[data-phase="win"]').count(), 0);
        console.log(`PASS ${engine} level ${level + 1}: dialogue, Skip, zoom, enter, next, landing and jump`);
        await context.close();
      }
      await checkOnline(browser, engine);
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []);
} finally { server.stop(); }

async function checkOnline(browser, engine) {
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true }), browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })]);
  try {
    const [host, guest] = await Promise.all(contexts.map(c => c.newPage()));
    for (const page of [host, guest]) { page.on('pageerror', e => errors.push(e.message)); await page.goto(server.url.href); }
    await host.getByTestId('create-room').tap();
    await host.waitForFunction(() => /^[0-9]{2}$/.test(document.querySelector('[data-testid="room-code"]').textContent.trim()));
    const code = await host.getByTestId('room-code').innerText();
    await guest.getByTestId('join-room').tap();
    await guest.getByTestId('room-code-input').fill(code);
    await guest.getByTestId('join-room-submit').tap();
    await guest.getByTestId('room-code').waitFor({ state: 'visible' });
    await host.getByTestId('character-still').tap(); await guest.getByTestId('character-bloom').tap();
    await host.getByTestId('ready').tap(); await guest.getByTestId('ready').tap();
    await host.getByTestId('start-game').tap();
    await Promise.all([ready(host), ready(guest)]);
    const room = server.rooms.rooms.get(code);
    const sharedTexts = page => page.locator('.task-hint:not([hidden])').allTextContents();
    for (const page of [host, guest]) await page.waitForFunction(() => document.querySelectorAll('.task-hint:not([hidden])').length === 2);
    assert.deepEqual(await sharedTexts(host), await sharedTexts(guest), 'Both roles must see the same initial tasks');
    await host.waitForFunction(() => Number(document.querySelector('[data-testid="task-hint-0"]').style.opacity) === 1);
    await host.waitForFunction(() => {
      const card = document.querySelector('[data-testid="task-hint-0"]');
      return !card.hidden && Number(card.style.opacity) > 0 && Number(card.style.opacity) < .75;
    });
    await host.screenshot({ path: `.audit/portal/${engine}-tasks-fading.png` });
    for (const page of [host, guest]) {
      await page.waitForFunction(() => [...document.querySelectorAll('.task-hint')].every(card => card.hidden));
      await page.getByTestId('dialogue').waitFor({ state: 'hidden' });
    }
    const middle = room.game.platforms[2];
    for (const p of room.game.actors) Object.assign(p, { x: middle.x + 40, y: middle.y, grounded: true, on: 'platform-2' });
    for (const page of [host, guest]) await page.waitForFunction(() => document.querySelector('[data-testid="task-hint-1"] span')?.textContent.includes('seed'));
    assert.deepEqual(await sharedTexts(host), await sharedTexts(guest), 'Shared tasks must update for both clients after crossing');
    await guest.screenshot({ path: `.audit/portal/${engine}-shared-tasks.png` });
    for (const p of room.game.actors) Object.assign(p, { x: room.game.exit.x, y: room.game.exit.y });
    await Promise.all([host.waitForFunction(() => window.__moonclock.transition().phase === 'entering'), guest.waitForFunction(() => window.__moonclock.transition().phase === 'entering')]);
    await Promise.all([host.waitForFunction(() => window.__moonclock.snapshot().level === 1), guest.waitForFunction(() => window.__moonclock.snapshot().level === 1)]);
    await Promise.all([ready(host), ready(guest)]);
    assert.equal(room.game.level, 1);
    const guard = () => room.game.objects.find(o => o.kind === 'guard');
    const stand = (actor, platform, x) => Object.assign(room.game.actors[actor], { x, y: room.game.platforms[platform].y, vx: 0, vy: 0, grounded: true, on: `platform-${platform}`, move: 0 });
    guard().x = 750;
    stand(0, 0, 684); stand(1, 3, 920);
    for (const page of [host, guest]) await page.waitForFunction(() => window.__moonclock.snapshot().objects.find(o => o.kind === 'guard')?.target === 1);
    assert.equal(guard().platformIndex, 3, 'The nearer player on the upper ledge must not become the target');
    guard().x = 1100;
    stand(0, 3, 950); stand(1, 2, 1520);
    for (const page of [host, guest]) await page.waitForFunction(() => window.__moonclock.snapshot().objects.find(o => o.kind === 'guard')?.target === 0);
    stand(1, 3, guard().x + 45);
    for (const page of [host, guest]) await page.waitForFunction(() => {
      const state = window.__moonclock.snapshot(), g = state.objects.find(o => o.kind === 'guard');
      return g.target === 0 && state.tick < g.targetLockUntil
        && state.actors[1].on === 'platform-3' && Math.abs(state.actors[1].x - g.x) < Math.abs(state.actors[0].x - g.x);
    });
    stand(0, 2, 1520);
    for (const page of [host, guest]) await page.waitForFunction(() => window.__moonclock.snapshot().objects.find(o => o.kind === 'guard')?.target === 1);
    guard().x = 1450;
    stand(0, 3, 1330); stand(1, 3, 1370);
    await host.evaluate(() => window.__moonclock.dispatch({ type: 'ability', actor: 0, x: 1450, y: 555 }));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => window.__moonclock.snapshot().objects.find(o => o.kind === 'guard')?.frozen);
      await page.waitForFunction(() => document.querySelector('[data-testid="task-hint-1"] span').textContent.includes("snail's shell"));
      await page.waitForFunction(() => document.querySelector('[data-testid="task-hint-0"] span').textContent.includes("snail's shell"));
      await page.waitForFunction(() => Number(document.querySelector('[data-testid="task-hint-1"]').style.opacity) > .9);
    }
    assert.deepEqual(await sharedTexts(host), await sharedTexts(guest), 'Both clients see the Freeze and head-jump task');
    await guest.getByTestId('skip-dialogue').tap();
    await guest.screenshot({ path: `.audit/portal/${engine}-guard-head-jump.png` });
    for (const page of [host, guest]) { assert.equal(await page.getByTestId('next').count(), 0); assert.equal((await snap(page)).status, 'playing'); }
    console.log(`PASS ${engine} online: subtitles fade, new tasks return, shared gate transition, shared guard lock and Freeze head-jump cues`);
  } finally { for (const c of contexts) await c.close(); }
}
