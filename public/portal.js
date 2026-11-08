const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
export const GATE_DURATION = 4400;
export const ARRIVAL_DURATION = 1200;
export const GATE_ZOOM = 1.15;
export function portalFrame(progress, reduced = false) {
  const p = clamp(progress);
  return {
    approach: ease(p / .18),
    opening: ease((p - .18) / .27),
    walk: ease((p - .35) / .53),
    fade: ease((p - .87) / .12),
    focus: reduced ? 0 : ease(p / .24),
    zoom: reduced ? 0 : .16 * ease(p / .25) + .84 * ease((p - .35) / .65),
  };
}
export function arrivalPortal(progress, actors, waiting = false) {
  const first = actors.reduce((a, b) => (a.spawnX ?? a.x) <= (b.spawnX ?? b.x) ? a : b);
  const p = clamp(progress);
  return { x: (first.spawnX ?? first.x) - 100, y: first.spawnY ?? first.y,
    opening: waiting ? 0 : ease(p / .16), alpha: waiting ? 0 : 1 - ease((p - .82) / .18) };
}
export function arrivalFrame(progress, actors, leftEdge = 0, reduced = false, kind = 'left-run', waiting = false) {
  const p = waiting ? 0 : reduced ? 1 : clamp(progress);
  if (kind === 'portal') {
    const gate = arrivalPortal(progress, actors, waiting);
    return actors.map(actor => {
      const delay = actor.id === 1 ? .125 : 0, walk = ease((p - delay) / (1 - delay));
      return { ...actor, x: gate.x + (actor.x - gate.x) * walk,
        alpha: waiting ? 0 : reduced ? 1 : ease((p - delay) / .12),
        facing: 1, grounded: true, move: !waiting && p < 1 ? 1 : 0, animation: null };
    });
  }
  const distance = Math.max(...actors.map(actor => actor.x)) - leftEdge + 80;
  return actors.map(actor => ({ ...actor,
    x: actor.x - distance * (1 - ease(p)),
    alpha: waiting ? 0 : 1,
    facing: 1, grounded: true, move: p < 1 ? 1 : 0, animation: null,
  }));
}
