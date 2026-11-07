async (page) => {
  const browser = page.context().browser();
  const contexts = [];
  const errors = [];
  const base = 'http://127.0.0.1:4180';
  for (const [name, options] of [
    ['pwa-host', { viewport: { width: 1194, height: 834 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' }],
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
    await a.getByTestId('new-game').click();
    await a.getByTestId('create-room').click();
    await a.getByTestId('room-code').waitFor({ state: 'visible' });
    const code = await a.getByTestId('room-code').innerText(); rooms.push(code);
    await b.getByTestId('new-game').click();
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
  const layout = tab => tab.evaluate(() => {
    const ids = ['joystick', 'touch-jump', 'touch-ability', 'touch-interact'];
    const circles = ids.map(id => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      const x = left + width / 2, y = top + height / 2;
      if (Math.abs(width - height) > 1 || left < 0 || top < 0 || right > innerWidth || bottom > innerHeight) throw new Error(`${id} overflows`);
      if (document.elementFromPoint(x, y)?.closest('[data-testid]') !== element) throw new Error(`${id} has no hit target`);
      return { x, y, radius: width / 2 };
    });
    for (const [i, a] of circles.entries()) for (const b of circles.slice(i + 1)) {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + 5) throw new Error('Touch circles overlap or are too close');
    }
    if (circles.slice(1).some(c => c.radius !== circles[1].radius)) throw new Error('Jump, Ability and Interact differ in size');
    const canvas = document.querySelector('#game').getBoundingClientRect();
    if (canvas.height !== innerHeight || canvas.width !== innerWidth) throw new Error('Touch controls resized the canvas');
    return circles;
  });
  const [stick, jump, ability, interact] = await layout(host);
  if (stick.radius * 2 < 200 || ability.radius * 2 < 130) throw new Error('iPad controls are too small');
  await layout(guest);
  const cdp = await contexts[0].newCDPSession(host);
  const finger = ({ x, y }, id) => ({ x, y, id });
  const touch = (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const at = (dx, dy) => finger({ x: stick.x + dx * stick.radius, y: stick.y + dy * stick.radius }, 1);
  await touch('touchStart', at(0, -.8));
  await host.waitForTimeout(110);
  if ((await snapshot(guest)).actors[0].x !== 180 || !(await snapshot(guest)).actors[0].grounded) throw new Error('Up on the joystick moved or jumped');
  await touch('touchMove', at(.65, -.65));
  await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].x > 250);
  if (!(await snapshot(guest)).actors[0].grounded) throw new Error('Diagonal joystick still jumps');
  const moving = at(.8, 0), jumpFinger = finger(jump, 2), abilityFinger = finger(ability, 3);
  await touch('touchMove', moving);
  await touch('touchStart', moving, jumpFinger, abilityFinger);
  await guest.waitForFunction(() => {
    const game = window.__moonclock.snapshot();
    return game.actors[0].move === 1 && !game.actors[0].grounded && game.freezeAreas.length === 1;
  });
  await touch('touchMove', at(0, 0), jumpFinger, abilityFinger);
  await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].grounded);
  const landing = (await snapshot(guest)).eventSeq;
  await host.waitForTimeout(220);
  if ((await snapshot(guest)).events.some(e => e.kind === 'jump' && e.id > landing)) throw new Error('Holding Jump triggered another jump');
  await touch('touchEnd');
  await host.touchscreen.tap(jump.x, jump.y);
  await guest.waitForFunction(id => window.__moonclock.snapshot().events.some(e => e.kind === 'jump' && e.id > id), landing);
  if ((await snapshot(otherHost)).actors[0].x !== 180) throw new Error('Cross-room movement leak');
  const world = (tab, x, y) => tab.evaluate(({ x, y }) => {
    const camera = window.__moonclock.presentation().camera;
    const rect = document.querySelector('#game').getBoundingClientRect();
    return { x: rect.left + camera.offsetX + x * camera.scale, y: rect.top + camera.offsetY + y * camera.scale };
  }, { x, y });
  // Cancel the button's cast from the world, then place and cancel a second area in empty space.
  for (const castInWorld of [false, true]) {
    if (castInWorld) {
      const spot = await world(host, 410, 425); await host.touchscreen.tap(spot.x, spot.y);
    }
    await host.waitForFunction(() => window.__moonclock.snapshot().freezeAreas.length === 1);
    const game = await snapshot(host), area = game.freezeAreas[0];
    if (castInWorld && (Math.abs(area.x - 410) > 2 || Math.abs(area.y - 425) > 2)) throw new Error('World tap did not centre the area');
    const spot = await world(host, area.x + 30, area.y - 55); await host.touchscreen.tap(spot.x, spot.y);
    for (const tab of [host, guest]) await tab.waitForFunction(() => !window.__moonclock.snapshot().freezeAreas.length && !window.__moonclock.snapshot().objects[0].frozen);
    if ((await snapshot(guest)).freezeCharges !== game.freezeCharges) throw new Error('Cancellation changed charges');
  }
  await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].grounded);
  await touch('touchStart', moving, finger(interact, 4));
  await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].carrying === 'crate-0');
  await touch('touchEnd');
  await host.touchscreen.tap(interact.x, interact.y);
  await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].carrying === null);
  const clickWorld = async (x, y) => {
    const spot = await world(otherHost, x, y);
    await otherHost.mouse.click(spot.x, spot.y);
  };
  await clickWorld(350, 420);
  await otherGuest.waitForFunction(() => window.__moonclock.snapshot().objects[0].frozen);
  await otherHost.waitForFunction(() => window.__moonclock.snapshot().freezeAreas.length === 1);
  await clickWorld(350, 420);
  await otherGuest.waitForFunction(() => {
    const game = window.__moonclock.snapshot();
    return !game.freezeAreas.length && !game.objects[0].frozen && game.freezeCharges === 1;
  });
  const id = await guest.evaluate(() => window.__moonclock.connection().playerId);
  await contexts[1].setOffline(true);
  await host.waitForFunction(() => window.__moonclock.connection().room.suspended);
  if ((await snapshot(host)).actors.some(actor => actor.move !== 0)) throw new Error('Disconnect left movement held');
  await contexts[1].setOffline(false);
  await guest.waitForFunction(() => window.__moonclock.connection().status === 'connected' && !window.__moonclock.connection().room.suspended);
  if (id !== await guest.evaluate(() => window.__moonclock.connection().playerId)) throw new Error('Foreground reconnect changed identity');
  await guest.setViewportSize({ width: 667, height: 320 });
  await guest.evaluate(() => {
    for (const [side, inset] of [['left', 44], ['right', 44], ['bottom', 21]]) document.documentElement.style.setProperty(`--safe-${side}`, `${inset}px`);
  });
  const safe = await layout(guest);
  if (safe.some(({ x, y, radius }) => x - radius < 44 || x + radius > 667 - 44 || y + radius > 320 - 21)) throw new Error('Controls intrude into the safe area');
  await guest.evaluate(() => document.documentElement.removeAttribute('style'));
  await guest.setViewportSize({ width: 390, height: 844 }); await layout(guest);
  await guest.setViewportSize({ width: 320, height: 568 }); await layout(guest);
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
  return { rooms: 2, players: 4, simultaneousTouch: true, isolated: true, responsiveControls: true, freezeToggle: true, reconnectIdentity: true, cachedAssets: cached.keys.length, version: cached.version, errors };
}
