export const CHARACTER_HEIGHT = 72;

// Cache these bounds once per sheet; transparent cell padding must not change a traveller's size.
export function measureCharacterFrames({ data, width, height }, columns = 8, rows = 2) {
  const cellWidth = Math.floor(width / columns), cellHeight = Math.floor(height / rows);
  return Array.from({ length: columns * rows }, (_, frame) => {
    const ox = frame % columns * cellWidth, oy = Math.floor(frame / columns) * cellHeight;
    let left = cellWidth, top = cellHeight, right = -1, bottom = -1;
    for (let y = 0; y < cellHeight; y++) for (let x = 0; x < cellWidth; x++) {
      if (data[((oy + y) * width + ox + x) * 4 + 3] <= 16) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) { left = top = 0; right = cellWidth - 1; bottom = cellHeight - 1; }
    return { x: ox + left, y: oy + top, w: right - left + 1, h: bottom - top + 1, left, cellWidth };
  });
}

export function characterPlacement(frame, feetX) {
  const scale = CHARACTER_HEIGHT / frame.h;
  return { x: (frame.left - frame.cellWidth * feetX) * scale, y: 2 - CHARACTER_HEIGHT, w: frame.w * scale, h: CHARACTER_HEIGHT };
}
