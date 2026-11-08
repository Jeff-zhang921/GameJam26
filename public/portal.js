const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
export const GATE_DURATION = 4400;
export const ARRIVAL_DURATION = 1200;
export function portalFrame(progress, reduced = false) {
  const p = clamp(progress);
  return {
    approach: ease(p / .18),
    push: ease((p - .12) / .12) * (1 - ease((p - .58) / .10)),
    opening: ease((p - .28) / .40),
    walk: ease((p - .68) / .23),
    fade: ease((p - .87) / .12),
    focus: reduced ? 0 : ease(p / .24),
    zoom: reduced ? 0 : .16 * ease(p / .25) + .84 * ease((p - .69) / .31),
  };
}
export function arrivalFrame(progress, actors, leftEdge = 0, reduced = false) {
  const p = reduced ? 1 : clamp(progress);
  const distance = Math.max(...actors.map(actor => actor.x)) - leftEdge + 80;
  return actors.map(actor => ({ ...actor,
    x: actor.x - distance * (1 - ease(p)),
    facing: 1, grounded: true, move: p < 1 ? 1 : 0, animation: null,
  }));
}
