async (page) => {
  const browser = page.context().browser();
  const base = 'http://127.0.0.1:4180';
  const contexts = [], errors = [], results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const snapshot = tab => tab.evaluate(() => window.__moonclock.snapshot());
  const readyToPlay = tab => tab.waitForFunction(() => {
    const entrance = document.querySelector('[data-testid="online-entrance"]');
    return window.__moonclock.connection().room?.status === 'PLAYING'
      && window.__moonclock.snapshot().phase === 'playing'
      && (!entrance || entrance.hidden)
      && !document.querySelector('.shell').inert;
  });
  async function open(options = {}, failArt = false) {
    const context = await browser.newContext(options); contexts.push(context);
    const tab = await context.newPage(); tab.on('pageerror', error => errors.push(error.message));
    if (failArt) await tab.route('**/art/moonlit-conservatory.svg', route => route.request().resourceType() === 'fetch' ? route.abort() : route.continue());
    await tab.goto(base); await tab.getByTestId('create-room').waitFor();
    return tab;
  }
  async function pair(host, guest) {
    await host.getByTestId('create-room').click(); await host.getByTestId('room-code').waitFor();
    const code = await host.getByTestId('room-code').innerText();
    await guest.getByTestId('join-room').click(); await guest.getByTestId('room-code-input').fill(code);
    await guest.getByTestId('join-room-submit').click(); await guest.getByTestId('room-code').waitFor();
    await host.getByTestId('character-still').click(); await guest.getByTestId('character-bloom').click();
    await host.getByTestId('ready').click(); await guest.getByTestId('ready').click();
    await host.waitForFunction(() => !document.querySelector('[data-testid="start-game"]').disabled);
  }
  async function watch(tab) {
    await tab.evaluate(() => {
      window.entranceFrames = []; window.entranceNodes = new Set(); window.entranceFinished = 0;
      let active = false;
      function sample(time) {
        const el = document.querySelector('[data-testid="online-entrance"]');
        if (el && !el.hidden) {
          active = true; window.entranceNodes.add(el);
          window.entranceFrames.push({ time, progress: Number(el.dataset.progress), key: el.dataset.key });
        } else if (active) { active = false; window.entranceFinished++; window.entranceFinishedAt = Date.now(); }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  }
  try {
    const host = await open({ viewport: { width: 1440, height: 900 } });
    const guest = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await pair(host, guest); await Promise.all([watch(host), watch(guest)]);
    await host.getByTestId('start-game').click();
    await Promise.all([host.getByTestId('online-entrance').waitFor(), guest.getByTestId('online-entrance').waitFor()]);
    await host.waitForTimeout(750);
    const before = await snapshot(host);
    check((await host.evaluate(() => window.__moonclock.connection().room.status)) === 'STARTING', 'Opening did not use the shared start interval');
    check(before.tick === 0 && before.level === 0, 'World advanced while the door was opening');
    await host.evaluate(() => { window.__moonclock.dispatch({ type: 'move', dir: 1 }); window.__moonclock.dispatch({ type: 'jump' }); window.__moonclock.dispatch({ type: 'ability' }); });
    const blocked = await snapshot(host);
    check(blocked.actors[0].x === before.actors[0].x && blocked.actors[0].y === before.actors[0].y, 'Entrance accepted movement');
    check(await host.locator('#online-root').isHidden(), 'Countdown dialog obscured the door');
    await host.screenshot({ path: '.audit/online-door-midpoint.png' });
    await guest.screenshot({ path: '.audit/online-door-mobile-midpoint.png' });
    await Promise.all([readyToPlay(host), readyToPlay(guest)]);
    await host.waitForTimeout(150);
    const samples = [];
    for (const tab of [host, guest]) {
      const data = await tab.evaluate(() => ({ frames: window.entranceFrames, nodes: window.entranceNodes.size, finished: window.entranceFinished, finishedAt: window.entranceFinishedAt }));
      check(data.nodes === 1 && data.finished === 1, 'Snapshots restarted or replaced the entrance');
      check(data.frames.length > 10, 'No intermediate animation frames rendered');
      check(data.frames.every((frame, i) => !i || frame.progress >= data.frames[i - 1].progress), 'Entrance progress moved backwards');
      check(data.frames[0].progress < .4 && data.frames.at(-1).progress > .95, 'Entrance skipped the opening or final approach');
      samples.push({ frames: data.frames.length, duration: Math.round(data.frames.at(-1).time - data.frames[0].time), nodes: data.nodes, finishedAt: data.finishedAt });
    }
    check(Math.abs(samples[0].finishedAt - samples[1].finishedAt) < 250, 'Players finished the shared entrance at different times');
    const initial = await snapshot(guest);
    check(initial.level === 0 && initial.actors.length === 2, 'Entrance created the wrong game');
    await host.keyboard.down('KeyD'); await host.waitForTimeout(200); await host.keyboard.up('KeyD');
    await guest.waitForFunction(() => window.__moonclock.snapshot().actors[0].x > 180);
    const oldFrames = await guest.evaluate(() => window.entranceFrames.length);
    const playerId = await guest.evaluate(() => window.__moonclock.connection().playerId);
    await guest.reload(); await readyToPlay(guest);
    check(await guest.getByTestId('online-entrance').isHidden(), 'Rejoining PLAYING replayed the entrance');
    check(await guest.evaluate(() => window.__moonclock.connection().playerId) === playerId, 'Rejoining changed identity');
    await host.screenshot({ path: '.audit/online-door-gameplay.png' });
    results.push({ case: 'desktop and touch', sharedTimeline: true, inputBlocked: true, samples, reconnectSkipsEntrance: true, observedFramesBeforeReconnect: oldFrames });
    await host.context().close(); await guest.context().close();

    const reducedHost = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const reducedGuest = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await pair(reducedHost, reducedGuest); await reducedHost.getByTestId('start-game').click();
    await reducedGuest.getByTestId('online-entrance').waitFor();
    await reducedGuest.waitForTimeout(350);
    check((await reducedGuest.evaluate(() => window.__moonclock.connection().room.status)) === 'STARTING', 'Reduced motion skipped the authoritative wait');
    await reducedGuest.waitForTimeout(1000);
    check(Number(await reducedGuest.getByTestId('online-entrance').getAttribute('data-zoom')) === 1, 'Reduced motion still zoomed the camera');
    await Promise.all([readyToPlay(reducedHost), readyToPlay(reducedGuest)]);
    results.push({ case: 'reduced motion and portrait', sharedWait: true, entered: true });
    await reducedHost.context().close(); await reducedGuest.context().close();

    const cancelHost = await open(), cancelGuest = await open();
    await pair(cancelHost, cancelGuest); await cancelHost.getByTestId('start-game').click();
    await cancelHost.getByTestId('online-entrance').waitFor();
    await cancelGuest.context().setOffline(true);
    await cancelHost.waitForFunction(() => window.__moonclock.connection().room.status === 'WAITING');
    check(await cancelHost.getByTestId('online-entrance').isHidden(), 'Cancelled countdown left the doorway overlay');
    check(!await cancelHost.locator('.shell').evaluate(el => el.inert), 'Cancelled countdown left input inert');
    await cancelGuest.context().setOffline(false);
    await cancelGuest.getByTestId('ready').waitFor();
    await cancelHost.getByTestId('ready').click(); await cancelGuest.getByTestId('ready').click();
    await cancelHost.waitForFunction(() => !document.querySelector('[data-testid="start-game"]').disabled);
    await cancelHost.getByTestId('start-game').click();
    await Promise.all([readyToPlay(cancelHost), readyToPlay(cancelGuest)]);
    results.push({ case: 'cancelled start', restoredLobby: true, freshStart: true });
    await cancelHost.context().close(); await cancelGuest.context().close();

    const fallbackHost = await open({}, true), fallbackGuest = await open();
    await fallbackHost.waitForFunction(() => document.querySelector('[data-testid="online-entrance"]').dataset.art === 'fallback');
    await pair(fallbackHost, fallbackGuest); await fallbackHost.getByTestId('start-game').click();
    await fallbackHost.getByTestId('online-entrance').waitFor();
    await Promise.all([readyToPlay(fallbackHost), readyToPlay(fallbackGuest)]);
    results.push({ case: 'art fetch failed', fallback: true, entered: true });
    check(errors.length === 0, errors.join('\n'));
    return { results, errors };
  } finally { for (const context of contexts) await context.close(); }
}
