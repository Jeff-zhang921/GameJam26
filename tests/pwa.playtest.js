async (page) => {
  const browser = page.context().browser();
  const contexts = [];
  const errors = [];
  const base = 'http://127.0.0.1:4180';
  for (const [name, options] of [
    ['pwa-host', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }],
    ['pwa-guest', { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' }],
    ['pwa-other-host', { viewport: { width: 1280, height: 800 } }],
    ['pwa-other-guest', { viewport: { width: 1280, height: 800 } }],
  ]) {
    const context = await browser.newContext(options); contexts.push(context);
    const tab = await context.newPage(); tab.on('pageerror', error => errors.push(error.message));
    await tab.goto(base); await tab.evaluate(value => { window.name = value; }, name);
    await tab.waitForFunction(() => navigator.serviceWorker.controller);
  }
  const [host, guest, otherHost, otherGuest] = contexts.map(context => context.pages()[0]);
  const rooms = [];
  for (const [a, b] of [[host, guest], [otherHost, otherGuest]]) {
    await a.getByTestId('create-room').click();
    await a.getByTestId('room-code').waitFor({ state: 'visible' });
    const code = await a.getByTestId('room-code').innerText(); rooms.push(code);
    await b.getByTestId('join-room').click(); await b.getByTestId('room-code-input').fill(code);
    await b.getByTestId('join-room-submit').click(); await b.getByTestId('room-code').waitFor({ state: 'visible' });
    await a.getByTestId('character-still').click(); await b.getByTestId('character-bloom').click();
    await a.getByTestId('ready').click(); await b.getByTestId('ready').click();
    await a.waitForFunction(() => !document.querySelector('[data-testid="start-game"]').disabled);
    await a.getByTestId('start-game').click();
    for (const tab of [a, b]) await tab.waitForFunction(() => window.__moonclock.connection().room.status === 'PLAYING');
  }
  if (rooms[0] === rooms[1]) throw new Error('Room isolation failed');
  const snapshot = tab => tab.evaluate(() => window.__moonclock.snapshot());
  const move = await host.locator('[data-hold="1"]').boundingBox();
  const jump = await host.locator('[data-jump]').boundingBox();
  const cdp = await contexts[0].newCDPSession(host);
  const point = (box, id) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, id });
  const before = await snapshot(host);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(move, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(move, 1), point(jump, 2)] });
  await host.waitForTimeout(180);
  const jumped = await snapshot(guest);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (jumped.actors[0].x <= before.actors[0].x || jumped.actors[0].grounded || jumped.actors[0].animation.name !== 'jump') throw new Error('Simultaneous touch move+jump failed');
  await host.waitForTimeout(100);
  if ((await snapshot(otherHost)).actors[0].x !== 180) throw new Error('Cross-room movement leak');
  await host.getByTestId('touch-ability').tap();
  await guest.waitForFunction(() => window.__moonclock.snapshot().objects[0].frozen);
  await guest.getByTestId('touch-ability').tap();
  await host.waitForFunction(() => !window.__moonclock.snapshot().objects[0].frozen);
  const id = await guest.evaluate(() => window.__moonclock.connection().playerId);
  await contexts[1].setOffline(true);
  await host.waitForFunction(() => window.__moonclock.connection().room.suspended);
  if ((await snapshot(host)).actors.some(actor => actor.move !== 0)) throw new Error('Disconnect left movement held');
  await contexts[1].setOffline(false);
  await guest.waitForFunction(() => window.__moonclock.connection().status === 'connected' && !window.__moonclock.connection().room.suspended);
  if (id !== await guest.evaluate(() => window.__moonclock.connection().playerId)) throw new Error('Foreground reconnect changed identity');
  const cached = await host.evaluate(async () => {
    const names = await caches.keys(), keys = [];
    for (const name of names) for (const request of await (await caches.open(name)).keys()) keys.push(new URL(request.url).pathname);
    return { names, keys, version: document.querySelector('meta[name="moonclock-build"]').content };
  });
  if (cached.keys.some(path => path === '/ws' || path === '/health' || path.startsWith('/api/'))) throw new Error('Live data cached');
  const idle = await contexts[0].newPage(); idle.on('pageerror', error => errors.push(error.message));
  await idle.goto(base); await idle.evaluate(() => { window.name = 'pwa-idle'; });
  await idle.waitForFunction(() => navigator.serviceWorker.controller);
  if (errors.length) throw new Error(errors.join('\n'));
  await host.screenshot({ path: '.audit/pwa-production-mobile.png' });
  return { rooms: 2, players: 4, simultaneousTouch: true, isolated: true, abilities: true, reconnectIdentity: true, cachedAssets: cached.keys.length, version: cached.version, errors };
}
