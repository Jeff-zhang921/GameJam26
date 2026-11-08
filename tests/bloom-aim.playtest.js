async (page) => {
  const browser = page.context().browser(), contexts = [], errors = [], results = [];
  const check = (value, message) => { if (!value) throw Error(message); };
  async function open(level = 3) {
    const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, isMobile: true, hasTouch: true }); contexts.push(context);
    await context.addInitScript(level => localStorage.setItem('moonclock-v1', JSON.stringify({ level, unlocked: 4, sound: false })), level);
    const tab = await context.newPage(); tab.on('pageerror', e => errors.push(e.message));
    await tab.goto('http://127.0.0.1:4182'); await tab.getByTestId('start').tap();
    await tab.waitForFunction(() => document.querySelector('.scene-veil').hidden && __moonclock.snapshot().phase === 'playing');
    await tab.getByTestId('touch-switch').tap();
    if (level === 3) {
      await tab.evaluate(() => { __moonclock.dispatch({ type: 'move', actor: 1, dir: 1 }); __moonclock.dispatch({ type: 'tick', count: 22 }); __moonclock.dispatch({ type: 'move', actor: 1, dir: 0 }); });
      await tab.waitForTimeout(40);
    }
    const cdp = await context.newCDPSession(tab);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    const press = async () => { const box = await tab.getByTestId('touch-ability').boundingBox(); const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }; await touch('touchStart', point); return point; };
    const charges = () => tab.evaluate(() => __moonclock.snapshot().bloomCharges);
    return { tab, touch, press, charges };
  }
  try {
    const first = await open(), before = await first.charges();
    await first.press();
    check(await first.tab.locator('body').evaluate(el => el.classList.contains('skill-aiming')), 'Default lock preview did not activate immediately');
    check(await first.tab.getByTestId('cancel-aim').isVisible(), 'Default lock has no cancel affordance');
    check(await first.charges() === before, 'Press spent a charge before release');
    await first.tab.screenshot({ path: '.audit/bloom-default-lock.png' });
    await first.touch('touchEnd');
    await first.tab.waitForFunction(before => __moonclock.snapshot().bloomCharges === before - 1, before);
    const cast = await first.tab.evaluate(() => { const s = __moonclock.snapshot(); return { speed: s.objects.find(o => o.id === 'plant-0').speed, event: s.events.findLast(e => e.caster === 1) }; });
    check(cast.speed === -1 && cast.event?.target === 'plant-0', 'Short release did not cast the locked legal target');
    results.push({ case: 'press locks nearby target, release casts once', before, after: await first.charges(), target: cast.event.target });

    const cancelBefore = await first.charges();
    await first.press();
    const cancelBox = await first.tab.getByTestId('cancel-aim').boundingBox();
    await first.touch('touchMove', { x: cancelBox.x + cancelBox.width / 2, y: cancelBox.y + cancelBox.height / 2 });
    await first.touch('touchEnd'); await first.tab.waitForTimeout(40);
    check(await first.charges() === cancelBefore, 'Drag-to-cancel spent a charge');
    await first.press(); await first.touch('touchCancel');
    check(await first.charges() === cancelBefore, 'Interrupted touch spent a charge');
    results.push({ case: 'cancel drag and interrupted touch', consumed: false });

    const invalid = await open(); await invalid.press(); const invalidBefore = await invalid.charges();
    await invalid.tab.evaluate(() => { __moonclock.dispatch({ type: 'move', actor: 1, dir: -1 }); __moonclock.dispatch({ type: 'tick', count: 28 }); __moonclock.dispatch({ type: 'move', actor: 1, dir: 0 }); });
    await invalid.tab.waitForTimeout(60); await invalid.touch('touchEnd');
    check(await invalid.charges() === invalidBefore, 'Out-of-range locked target spent a charge');
    results.push({ case: 'target leaves range before release', consumed: false });

    const drag = await open(), dragBefore = await drag.charges(), start = await drag.press();
    await drag.touch('touchMove', { x: start.x - 90, y: start.y }); await drag.touch('touchEnd');
    check(await drag.charges() === dragBefore, 'Manual drag was ignored in favour of default lock');
    results.push({ case: 'manual drag overrides default', consumed: false });

    const empty = await open(0), emptyBefore = await empty.charges();
    await empty.tab.getByTestId('touch-ability').tap();
    check(await empty.charges() === emptyBefore, 'Crates or distant objects incorrectly became Speed targets');
    await empty.tab.getByTestId('touch-switch').tap();
    const freezeBefore = await empty.tab.evaluate(() => __moonclock.snapshot().freezeCharges);
    await empty.tab.getByTestId('touch-ability').tap();
    check(await empty.tab.evaluate(() => __moonclock.snapshot().freezeCharges) === freezeBefore, 'Still short tap behaviour changed');
    results.push({ case: 'no legal target and unchanged Still tap', consumed: false });

    const exhausted = await open();
    for (let i = 0; i < 4; i++) { await exhausted.tab.getByTestId('touch-ability').tap(); await exhausted.tab.waitForTimeout(25); }
    check(await exhausted.charges() === 0, 'Charge guard failed');
    check((await exhausted.tab.locator('#toast').textContent()).includes('No Hasten charges'), 'Empty skill did not explain missing charges');
    results.push({ case: 'empty charges reject default cast', remaining: 0 });
    const normal = await open(2);
    await normal.tab.evaluate(() => { __moonclock.dispatch({ type: 'move', actor: 1, dir: 1 }); __moonclock.dispatch({ type: 'tick', count: 70 }); __moonclock.dispatch({ type: 'move', actor: 1, dir: 0 }); });
    await normal.tab.waitForFunction(() => document.querySelector('.touch-interact').dataset.kind === 'plant');
    await normal.tab.getByTestId('touch-interact').tap();
    await normal.tab.waitForFunction(() => __moonclock.snapshot().objects.some(o => o.id === 'plant-0'));
    const normalBefore = await normal.charges();
    await normal.tab.getByTestId('touch-ability').tap();
    await normal.tab.waitForFunction(() => __moonclock.snapshot().objects.find(o => o.id === 'plant-0').speed === 1);
    check(await normal.charges() === normalBefore - 1, 'Normal Speed did not consume exactly one charge');
    results.push({ case: 'normal Speed automatically wakes nearby planted mushroom', speed: 1 });
    check(errors.length === 0, 'Browser errors: ' + errors.join(', '));
    return { results, errors };
  } finally { for (const context of contexts) await context.close(); }
}
