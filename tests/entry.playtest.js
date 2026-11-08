// Run after bun run build with Playwright and Chrome available. MOONCLOCK_PLAYWRIGHT may point to an external Playwright entry file.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createGameServer } from '../server.js';

const externalPlaywright = process.env.MOONCLOCK_PLAYWRIGHT;
const { chromium } = await import(externalPlaywright ? pathToFileURL(externalPlaywright).href : 'playwright');
const servers = [];
const errors = [];
const art = '/art/moonlit-conservatory.svg';
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());
const stage = (page, phase) => page.waitForFunction(value => document.querySelector('#modal-root')?.dataset.phase === value, phase);
const ready = page => page.waitForFunction(() => window.__moonclock.snapshot()?.phase === 'playing' && document.querySelector('.scene-veil').hidden && !window.__moonclock.transition().phase);
const watchReveal = page => page.evaluate(() => {
  window.swapOpacity = null;
  const root = document.querySelector('#modal-root');
  const observer = new MutationObserver(() => {
    if (root.dataset.phase !== 'null') return;
    window.swapOpacity = Number(document.querySelector('.scene-veil').style.opacity);
    observer.disconnect();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-phase'] });
});
let browser;
try {
  const dev = createGameServer({ production: false, hostname: '127.0.0.1', port: 0 });
  servers.push(dev);
  const production = createGameServer({ production: true, hostname: '127.0.0.1', port: 0, countdownMs: 650 });
  servers.push(production);
  browser = await chromium.launch({ channel: 'chrome' });
  await checkMenu(production.url.href);
  await checkLocal(dev.url.href);
  await checkLocal(dev.url.href, { finale: true });
  await checkLocal(dev.url.href, { reducedMotion: 'reduce', finale: true });
  await checkOnline(production);
  assert.deepEqual(errors, []);
  console.log('Moonclock entry and win playtest passed (responsive, offline, local, reduced motion, online).');
} finally {
  try { await browser?.close(); } finally { for (const server of servers) server.stop(); }
}

async function openPage(options) {
  const page = await browser.newPage(options);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}

async function checkMenu(url) {
  for (const [name, width, height] of [['desktop', 1440, 900], ['ipad', 1194, 834], ['phone-wide', 844, 390], ['phone', 390, 844], ['compact', 320, 568]]) {
    const page = await openPage({ viewport: { width, height }, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
    await page.goto(url);
    assert.equal(await page.getByRole('heading', { name: 'Moonclock', exact: true }).count(), 1);
    for (const id of ['start', 'create-room', 'join-room']) {
      const bounds = await page.getByTestId(id).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, `${name}: ${id} is outside the screen`);
    }
    assert.ok(await page.locator('.entry-screen').evaluate(el => getComputedStyle(el).backgroundImage.includes('moonlit-conservatory.svg')));
    if (['desktop', 'ipad', 'phone'].includes(name)) await page.screenshot({ path: `.audit/entry-${name}.png` });
    if (name === 'desktop') {
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      assert.ok(await page.evaluate(async path => !!await caches.match(path), art));
      await page.context().setOffline(true);
      await page.reload();
      await page.getByTestId('start').waitFor();
      assert.ok(await page.evaluate(async path => (await fetch(path)).ok, art), 'Conservatory SVG missing offline');
    }
    await page.close();
  }
}

async function checkLocal(url, { reducedMotion = 'no-preference', finale = false } = {}) {
  const page = await openPage({ reducedMotion });
  const level = finale ? 4 : 0;
  if (finale) await page.addInitScript(() => localStorage.setItem('moonclock-v1', JSON.stringify({ level: 4, unlocked: 4 })));
  // Replace only the test's starting positions. The real physics, gate rule and next-level reset still run.
  await page.route(url => url.pathname === '/src/logic.js' && !url.search, route => route.fulfill({ contentType: 'application/javascript', body: `
    export * from '/src/logic.js?playtest-original';
    import { setup as original } from '/src/logic.js?playtest-original';
    export function setup(options) {
      const state = original(options);
      Object.assign(state.actors[0], { x: state.exit.x, y: state.exit.y });
      Object.assign(state.actors[1], { x: state.exit.x - 64, y: state.exit.y });
      return state;
    }
  ` }));
  await page.goto(url);
  if (finale) assert.match(await page.getByTestId('start').innerText(), /Continue Journey/);
  await watchReveal(page);
  await page.getByTestId('start').click();
  await page.locator('.scene-veil').waitFor({ state: 'visible' });
  if (!finale) {
    await page.keyboard.down('KeyD');
    await ready(page);
    await page.evaluate(() => document.querySelector('#game').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', repeat: true, bubbles: true })));
    await page.keyboard.up('KeyD');
  } else await ready(page);
  const waiting = await snapshot(page);
  assert.equal(await page.evaluate(() => window.swapOpacity), 1, 'The menu disappeared before the world was covered');
  assert.equal(waiting.level, level);
  assert.equal(waiting.actors[0].x, waiting.exit.x);
  assert.equal(waiting.status, 'playing');
  await page.keyboard.press('Tab'); // switch to Bloom, who waits beside the gate
  if (!finale) {
    await watchReveal(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__moonclock.snapshot().phase === 'advancing');
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.getByTestId('next').count(), 0, 'First courtyard must advance without results');
    await ready(page);
    assert.equal((await snapshot(page)).level, 1);
    assert.equal(await page.evaluate(() => window.swapOpacity), 1, 'First courtyard changed before the fade covered it');
    await page.close();
    return;
  }
  await page.keyboard.down('ArrowRight');
  await stage(page, 'celebration');
  const began = Date.now();
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.getByTestId('next').count(), 0, 'Results opened before the animation');
  if (finale && reducedMotion !== 'reduce') {
    await page.waitForTimeout(1800);
    await page.screenshot({ path: '.audit/win-finale.png' });
  }
  if (finale) {
    // The last chamber ends on the ending screen with credits instead of looping straight back.
    await stage(page, 'ending');
    assert.match(await page.getByTestId('ending').innerText(), /Credits/);
    await page.getByTestId('play-again').click();
  }
  await ready(page);
  assert.equal(await page.getByTestId('next').count(), 0, 'Gate passage must not show results');
  assert.equal((await snapshot(page)).level, (level + 1) % 5);
  await page.close();
}

async function checkOnline(server) {
  const host = await openPage({ viewport: { width: 1280, height: 800 } });
  const guest = await openPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
  await guest.addInitScript(() => {
    window.celebrations = 0;
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector('#modal-root');
      new MutationObserver(() => { if (root.dataset.phase === 'celebration') window.celebrations++; })
        .observe(root, { attributes: true, attributeFilter: ['data-phase'] });
    }, { once: true });
  });
  await Promise.all([host.goto(server.url.href), guest.goto(server.url.href)]);
  await host.getByTestId('create-room').click();
  const codeLabel = host.getByTestId('room-code'); await codeLabel.waitFor();
  const code = await codeLabel.innerText();
  await guest.getByTestId('join-room').click();
  await guest.getByTestId('room-code-input').fill(code);
  await guest.getByTestId('join-room-submit').click();
  await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
  await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
  await host.getByTestId('start-game').click();
  await host.getByTestId('online-entrance').waitFor({ state: 'visible' });
  await Promise.all([ready(host), ready(guest)]);

  const room = server.rooms.rooms.get(code);
  const enterGate = index => Object.assign(room.game.actors[index], { x: room.game.exit.x, y: room.game.exit.y });
  enterGate(0);
  await host.waitForFunction(() => window.__moonclock.snapshot().actors[0].x === window.__moonclock.snapshot().exit.x);
  assert.equal((await snapshot(host)).status, 'playing');
  enterGate(1);
  await Promise.all([host.waitForFunction(() => window.__moonclock.snapshot().level === 1), guest.waitForFunction(() => window.__moonclock.snapshot().level === 1)]);
  await Promise.all([ready(host), ready(guest)]);
  assert.equal(await host.getByTestId('next').count(), 0, 'First courtyard needs no Next click');
  assert.equal(await guest.evaluate(() => window.celebrations), 1, 'First courtyard must enter the gate once');
  await checkBloomAim(guest, room);

  // Every courtyard now enters its gate and advances automatically.
  enterGate(0); enterGate(1);
  await Promise.all([host.waitForFunction(() => window.__moonclock.snapshot().level === 2), guest.waitForFunction(() => window.__moonclock.snapshot().level === 2)]);
  await Promise.all([ready(host), ready(guest)]);
  const playerId = await guest.evaluate(() => window.__moonclock.connection().playerId);
  await guest.reload();
  await ready(guest);
  assert.equal(await guest.evaluate(() => window.celebrations), 0, 'Reconnect replayed an old gate animation');
  assert.equal(await guest.evaluate(() => window.__moonclock.connection().playerId), playerId);
  assert.equal((await snapshot(host)).level, 2);
  assert.equal((await snapshot(guest)).level, 2);
  await host.close(); await guest.close();
}

async function checkBloomAim(page, room) {
  const bloom = room.game.actors[1];
  for (const [id, offset] of [['left', -115], ['right', 70]]) {
    room.game.objects.push({ id, kind: 'plant', x: bloom.x + offset, base: bloom.y, height: 0, age: 0, speed: 0, frozen: false });
  }
  await page.waitForFunction(() => window.__moonclock.snapshot().objects.some(o => o.id === 'left'));
  const skill = page.getByTestId('touch-ability');
  const rect = await skill.boundingBox();
  const travel = await skill.evaluate(button => Math.max(76, button.clientWidth * 1.15));
  const cdp = await page.context().newCDPSession(page);
  const center = { id: 1, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...center, x: center.x - travel * 115 / 300 }] });
  await page.getByTestId('cancel-aim').waitFor();
  assert.equal((await snapshot(page)).bloomCharges, 3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__moonclock.snapshot().bloomCharges === 2);
  const game = await snapshot(page);
  assert.equal(game.objects.find(o => o.id === 'left').speed, 1);
  assert.equal(game.objects.find(o => o.id === 'right').speed, 0);
  await page.waitForFunction(() => document.querySelector('[data-testid="skill-charges"]').textContent === '2');
}
