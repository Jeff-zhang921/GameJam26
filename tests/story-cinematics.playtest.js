import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { OPENING_DURATION, NEWSPAPER_DURATION } from '../src/cinematic-timeline.js';

const { chromium } = await import(process.env.MOONCLOCK_PLAYWRIGHT ? pathToFileURL(process.env.MOONCLOCK_PLAYWRIGHT).href : 'playwright');
const child = spawn('bun', [fileURLToPath(new URL('./story-server.fixture.js', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending = new Map(); let nextId = 0, readyResolve;
const readyServer = new Promise(resolve => { readyResolve = resolve; });
createInterface({ input: child.stdout }).on('line', line => {
  const message = JSON.parse(line);
  if (message.ready) readyResolve(message.ready);
  else { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(Error(message.error)); else request.resolve(message.result); }
});
child.on('exit', code => { for (const request of pending.values()) request.reject(Error(`Test server exited ${code}`)); });
const command = data => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ ...data, id }) + '\n'); });
const server = { url: new URL(await readyServer), stop() { child.stdin.end(); } };
let serverNow;
const browser = await chromium.launch({ channel: 'chrome' });
const contexts = [], errors = [], output = '.audit/story-cinematics';
await mkdir(output, { recursive: true });
const film = page => page.evaluate(() => window.__moonclock.transition().cinematic);
const snapshot = page => page.evaluate(() => window.__moonclock.snapshot());
const idle = page => page.waitForFunction(() => window.__moonclock.snapshot().phase === 'playing' && !window.__moonclock.transition().phase);
const waitPhase = (page, phase) => page.waitForFunction(phase => window.__moonclock.transition().cinematic?.phase === phase, phase);
async function open({ width = 1194, height = 834, mobile = true, reduced = false, clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile }); contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ reduced, clock }) => {
    localStorage.setItem('moonclock-v1', JSON.stringify({ sound: false, reduced, unlocked: 4 }));
    if (!clock) return;
    window.storyClockOffset = 0;
    const now = performance.now.bind(performance), raf = window.requestAnimationFrame;
    performance.now = () => now() + window.storyClockOffset;
    window.requestAnimationFrame = callback => raf.call(window, time => callback(time + window.storyClockOffset));
  }, { reduced, clock });
  await page.goto(server.url.href);
  return page;
}
async function seek(page, elapsed, allowFinished = false) {
  const current = await film(page);
  if (!current) { assert.ok(allowFinished, 'The cinematic finished before the requested story stage'); return; }
  await page.evaluate(delta => { window.storyClockOffset += delta; }, Math.max(0, elapsed - current.elapsed));
  await page.waitForTimeout(80);
}
async function localOpening(options) {
  const page = await open({ ...options, clock: true });
  await page.screenshot({ path: `${output}/${options.width || 1194}-menu.png` });
  await page.getByTestId('start').click(); await waitPhase(page, 'door');
  await page.waitForFunction(() => document.querySelector('[data-testid="story-1"]')?.complete);
  const initial = await snapshot(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(180); await page.keyboard.up('KeyD');
  assert.equal((await snapshot(page)).tick, initial.tick, 'Gameplay advanced while the opening was visible');
  for (const [phase, at] of [['door', 2400], ['door', 4000], ['story-1', 5500], ['story-1', 9500], ['story-2', 13800], ['story-2', 17200], ['story-3', 25000], ['pull', 29000]]) {
    await seek(page, at); await waitPhase(page, phase);
    assert.equal((await snapshot(page)).tick, initial.tick);
    if (at === 4000) assert.equal(await page.getByTestId('story-1').evaluate(image => Number(image.style.opacity)), 0, 'Story starts before the door finishes opening');
    if (at === 5500) {
      const alpha = await page.getByTestId('story-1').evaluate(image => Number(image.style.opacity));
      assert.ok(alpha > .1 && alpha < .9, 'The first story image does not fade in gradually');
    }
    await page.screenshot({ path: `${output}/${options.width || 1194}-${phase}-${at}${options.reduced ? '-reduced' : ''}.png` });
  }
  await seek(page, OPENING_DURATION + 150, true); await page.waitForFunction(() => window.__moonclock.transition().phase === 'landing');
  await page.evaluate(() => { window.storyClockOffset += 1500; }); await idle(page);
  assert.equal(await page.getByTestId('cinematic').isVisible(), false, 'Opening layer still covers gameplay');
  assert.equal((await snapshot(page)).level, 0);
  console.log(`PASS local opening ${options.width || 1194}x${options.height || 834}${options.reduced ? ' reduced' : ''}: door, three story holds, pull, arrival, frozen inputs.`);
  await page.close();
}
try {
  await localOpening({ width: 1194, height: 834 });
  await localOpening({ width: 844, height: 390, reduced: true });

  const host = await open({ width: 1440, height: 900, mobile: false });
  const guest = await open({ reduced: true });
  await host.getByTestId('create-room').click(); await host.getByTestId('room-code').waitFor();
  const code = await host.getByTestId('room-code').innerText();
  await guest.getByTestId('join-room').click(); await guest.getByTestId('room-code-input').fill(code); await guest.getByTestId('join-room-submit').click();
  await guest.getByTestId('room-code').waitFor();
  await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
  await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
  await host.getByTestId('start-game').click();
  await Promise.all([waitPhase(host, 'door'), waitPhase(guest, 'door')]);
  const cancelledKey = (await film(host)).key;
  await guest.reload();
  await Promise.all([host.getByTestId('ready').waitFor(), guest.getByTestId('ready').waitFor()]);
  assert.equal(await film(host), null, 'Cancelled room countdown left its story on screen');
  await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
  await host.getByTestId('start-game').click();
  await Promise.all([waitPhase(host, 'door'), waitPhase(guest, 'door')]);
  assert.notEqual((await film(host)).key, cancelledKey, 'Fresh readiness reused the cancelled story');
  const initialRoom = await command({ code, type: 'inspect' }), room = initialRoom.room, duration = room.startDuration;
  assert.ok(duration >= OPENING_DURATION + 1200, 'Server start leaves insufficient story reading time');
  const started = room.startAt - duration;
  for (const [phase, elapsed] of [['story-1', 9500], ['story-2', 17200], ['story-3', 25000]]) {
    serverNow = started + elapsed; const current = await command({ code, type: 'time', time: serverNow });
    await Promise.all([waitPhase(host, phase), waitPhase(guest, phase)]);
    assert.equal(current.room.status, 'STARTING'); assert.equal(current.tick, 0);
    const a = await film(host), b = await film(guest);
    assert.equal(a.key, b.key); assert.ok(Math.abs(a.elapsed - b.elapsed) < 300, 'Online story clocks diverged');
  }
  serverNow = started + OPENING_DURATION + 400; const arriving = await command({ code, type: 'time', time: serverNow });
  await Promise.all([host.waitForFunction(() => __moonclock.transition().phase === 'landing'), guest.waitForFunction(() => __moonclock.transition().phase === 'landing')]);
  assert.equal(arriving.tick, 0);
  serverNow = room.startAt + 40; await command({ code, type: 'time', time: serverNow });
  await Promise.all([idle(host), idle(guest)]);
  const identity = await guest.evaluate(() => __moonclock.connection().playerId);
  await guest.reload(); await idle(guest);
  assert.equal(await guest.evaluate(() => __moonclock.connection().playerId), identity);
  assert.equal(await film(guest), null, 'PLAYING reconnect replayed opening story');
  console.log('PASS online: countdown disconnect returns to lobby; fresh start, shared story/arrival, tick zero before start, PLAYING reconnect skips opening.');

  await command({ code, type: 'finish' });
  await Promise.all([waitPhase(host, 'black'), waitPhase(guest, 'black')]);
  const key = (await film(host)).key;
  assert.equal(await host.getByTestId('ending').count(), 0, 'Ending modal appeared before the newspaper');
  const script = () => {
    window.storyClockOffset = 0;
    const now = performance.now.bind(performance), raf = requestAnimationFrame;
    performance.now = () => now() + window.storyClockOffset;
    window.requestAnimationFrame = callback => raf.call(window, time => callback(time + window.storyClockOffset));
  };
  await host.evaluate(script); await guest.evaluate(script);
  for (const [phase, at] of [['caption', 3400], ['reveal', 6800], ['whole', 9500], ['top-left', 14500], ['bottom-left', 20000], ['top-right', 25500], ['bottom-right', 32000], ['pullback', 35000], ['fade', 37400]]) {
    serverNow += 100; await command({ code, type: 'time', time: serverNow });
    await seek(host, at); await seek(guest, at); await Promise.all([waitPhase(host, phase), waitPhase(guest, phase)]);
    assert.equal((await film(host)).key, key, 'A snapshot restarted the final newspaper');
    const paperAlpha = await host.getByTestId('newspaper').evaluate(image => Number(image.style.opacity));
    if (phase === 'caption') {
      assert.equal(paperAlpha, 0, 'Newspaper appeared before the caption finished');
      assert.equal(await host.getByTestId('newspaper-caption').textContent(), '后来，人们出了报道');
      assert.equal(await host.getByTestId('newspaper-caption').evaluate(node => Number(node.style.opacity)), 1);
    }
    if (phase === 'reveal') assert.ok(paperAlpha > .1 && paperAlpha < .9, 'Newspaper did not reveal gradually');
    await host.screenshot({ path: `${output}/newspaper-${phase}.png` });
    if (phase === 'bottom-right') await guest.screenshot({ path: `${output}/newspaper-ipad-bottom-right.png` });
  }
  await seek(host, NEWSPAPER_DURATION + 200, true); await seek(guest, NEWSPAPER_DURATION + 200, true);
  await Promise.all([host.getByTestId('ending').waitFor(), guest.getByTestId('ending').waitFor()]);
  assert.ok(await host.getByTestId('play-again').isEnabled()); assert.ok(await guest.getByTestId('play-again').isDisabled());
  await host.waitForTimeout(150); assert.equal((await film(host))?.active || false, false);
  console.log('PASS final newspaper: black, caption, soft reveal, whole, faster TL/BL/TR/BR, slow finish, original ending modal; no snapshot restarts.');
  assert.deepEqual(errors, []);
} finally { for (const context of contexts) await context.close(); await browser.close(); server.stop(); }
