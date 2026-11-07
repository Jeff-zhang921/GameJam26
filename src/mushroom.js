// Mushroom art metrics, shared by logic (collision) and the renderer so the standable cap matches the picture.
// Each sheet is 4x4 frames. Per frame: [art height relative to the tallest frame, cap width / art height].
export const GROW = [[0.137, 3.211], [0.187, 2.0], [0.478, 1.632], [0.568, 1.487], [0.651, 1.309], [0.719, 1.21], [0.777, 1.125], [0.813, 1.102], [0.845, 1.055], [0.871, 1.037], [0.896, 1.016], [0.914, 1.012], [0.993, 0.931], [0.993, 0.931], [0.996, 0.924], [1.0, 0.932]];
export const DIE = [[1.0, 0.902], [0.982, 0.932], [0.954, 0.963], [0.909, 0.988], [0.87, 1.004], [0.811, 1.017], [0.737, 1.095], [0.635, 1.116], [0.618, 1.068], [0.551, 0.981], [0.484, 0.928], [0.4, 0.877], [0.337, 0.99], [0.235, 1.388], [0.147, 1.833], [0.088, 2.16]];

// A fractional position f in 0..15 sits between frames i and i + 1, p of the way along; metrics ease between them.
function between(table, f) {
  f = Math.max(0, Math.min(15, f));
  const i = Math.min(14, Math.floor(f)), p = f - i, [h0, r0] = table[i], [h1, r1] = table[i + 1];
  return { i, p, height: h0 + (h1 - h0) * p, ratio: r0 + (r1 - r0) * p };
}
// Growing: sprout to bud covers the springy young stage, the remaining frames spread over the rest of the growth.
export function growFrame(height, maxHeight, springHeight) {
  return between(GROW, height <= springHeight ? height / springHeight : 1 + (height - springHeight) / (maxHeight - springHeight) * 14);
}
// Withering: progress 0..1 through the wilt.
export function dieFrame(progress) { return between(DIE, progress * 15); }
