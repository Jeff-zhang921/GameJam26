const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
export function portalFrame(progress, reduced = false) {
  return { walk: ease((progress - .08) / .5), fade: ease((progress - .52) / .3), zoom: reduced ? 0 : ease((progress - .08) / .84) };
}
export function landingFrame(progress, reduced = false) {
  const p = clamp(progress);
  return { drop: reduced ? 0 : 110 * (1 - Math.min(1, p / .78) ** 2), landed: p >= .78 };
}
