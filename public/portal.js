const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
export const GATE_DURATION = 4400;
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
export function landingFrame(progress, reduced = false) {
  const p = clamp(progress);
  return { drop: reduced ? 0 : 110 * (1 - Math.min(1, p / .78) ** 2), landed: p >= .78 };
}
