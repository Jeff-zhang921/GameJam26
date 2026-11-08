import { describe, test, expect } from 'bun:test';
import { setup } from '../src/logic.js';
import { taskHints } from '../public/task-hints.js';
const hint = (state, actor) => taskHints(state).find(h => h.actor === actor)?.text;
function onMiddle(state) {
  const middle = state.platforms[2];
  for (const p of state.actors) Object.assign(p, { x: middle.x + 40, y: middle.y, grounded: true, on: 'platform-2' });
}

describe('shared tasks over the travellers', () => {
  test('level one names the crate, throw and Freeze jobs as the crossing changes', () => {
    const s = setup({ level: 0 });
    expect(hint(s, 0)).toContain('Pick up a crate');
    expect(hint(s, 1)).toContain('Still will slow');
    s.actors[1].carrying = 'crate-1';
    expect(hint(s, 1)).toContain('Throw');
    const crate = s.objects.find(o => o.id === 'crate-0');
    Object.assign(crate, { x: 500, vx: 6, held: null, frozen: false });
    expect(hint(s, 0)).toContain('Cast Freeze');
    crate.frozen = true;
    expect(hint(s, 1)).toContain('slowed crate');
    s.actors[1].on = crate.id;
    expect(hint(s, 1)).toContain('next ledge');
  });
  test('level one guides seed collection, the ancient mushroom and planting in order', () => {
    const s = setup({ level: 0 }); onMiddle(s);
    expect(hint(s, 1)).toContain('seed');
    s.seeds = 1; s.objects = s.objects.filter(o => o.kind !== 'seed');
    const ancient = s.objects.find(o => o.barrier);
    expect(hint(s, 1)).toContain('Speed on the ancient');
    expect(hint(s, 0)).toContain('Let Bloom clear');
    ancient.speed = 3;
    expect(hint(s, 1)).toContain('wither');
    ancient.withered = true;
    expect(hint(s, 1)).toContain('Bring the seed');
    s.actors[1].x = s.pits.find(p => p.plantable !== false).x;
    expect(hint(s, 1)).toContain('Plant the seed');
  });
  test('level two: fetch the seed, lure and freeze the snail, then climb off its shell', () => {
    const s = setup({ level: 1 });
    const snail = s.objects.find(o => o.kind === 'guard'), trench = s.platforms[3];
    for (const p of s.actors) Object.assign(p, { x: trench.x + 100, y: trench.y, grounded: true, on: 'platform-3' });
    expect(hint(s, 1)).toContain('Grab the seed');
    expect(hint(s, 0)).toContain('Freeze the snail');
    s.seeds = 1; s.objects = s.objects.filter(o => o.kind !== 'seed');
    expect(hint(s, 1)).toContain('Lure the snail');
    snail.frozen = true;
    expect(hint(s, 1)).toContain('slowed snail');
    s.actors[1].on = snail.id;
    expect(hint(s, 1)).toContain('ledge above');
    onMiddle(s); s.actors[0].x = trench.x + 100; s.actors[0].y = trench.y;
    expect(hint(s, 1)).toContain('Wait on the ledge for Still');
    s.freezeCharges = 0; snail.frozen = false;
    expect(hint(s, 0)).toContain('hourglass');
  });
  test('level two progresses from planting to Speed, freezing and jumping', () => {
    const s = setup({ level: 1 }); onMiddle(s);
    expect(hint(s, 1)).toContain('seed');
    const p = s.pits[0];
    const mushroom = { kind: 'plant', id: 'new-plant', x: p.x, base: p.y, height: 0, speed: 0, withered: false, frozen: false };
    s.objects.push(mushroom); p.plant = mushroom.id; s.seeds = 0;
    expect(hint(s, 1)).toContain('tap Speed');
    mushroom.speed = 1; mushroom.height = 50;
    expect(hint(s, 1)).toContain('Ride');
    mushroom.height = 220;
    expect(hint(s, 0)).toContain('Freeze the mushroom');
    mushroom.frozen = true;
    expect(hint(s, 0)).toContain('Jump');
    Object.assign(s.actors[0], s.exit);
    expect(hint(s, 0)).toContain('Wait at the gate for Bloom');
  });
  test('missing charges give an achievable resource prompt instead of an impossible cast', () => {
    const s = setup({ level: 0 }); onMiddle(s);
    s.seeds = 1; s.bloomCharges = 0;
    expect(hint(s, 1)).toContain('lightning');
    s.pickups = s.pickups.filter(p => p.kind !== 'bolt');
    expect(hint(s, 1)).toContain('restart');
  });
  test('both players receive the same tasks; hints never change the world or survive completion', () => {
    const s = setup({ level: 0, players: ['host', 'guest'] }), before = structuredClone(s);
    const host = taskHints(s);
    expect(host.map(h => h.actor)).toEqual([0, 1]);
    expect(s).toEqual(before);
    s.active = 1;
    expect(taskHints(s)).toEqual(host);
    s.status = 'won'; expect(taskHints(s)).toEqual([]);
    s.status = 'paused'; expect(taskHints(s)).toEqual([]);
    expect(taskHints(setup({ level: 2 }))).toEqual([]);
  });
});
