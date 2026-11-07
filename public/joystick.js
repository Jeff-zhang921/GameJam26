// Input is the thumb offset from the stick centre, divided by the stick radius (so ±1 is the rim).
export const JOYSTICK = { deadZone: 0.06, releaseZone: 0.035 };

export function readJoystick(dx, dy, previousDir = 0) {
  const scale = 1 / Math.max(1, Math.hypot(dx, dy));
  const x = dx * scale, y = dy * scale;
  const direction = Math.sign(x);
  const threshold = direction === previousDir ? JOYSTICK.releaseZone : JOYSTICK.deadZone;
  return { x, y, dir: Math.abs(x) >= threshold ? direction : 0 };
}

// A short drag leaves the default aim in place. Dragging past the virtual rim caps the cast at range.
export function skillAimOffset(dx, dy, travel, range) {
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return null;
  const scale = range / Math.max(travel, distance);
  return { x: dx * scale, y: dy * scale };
}
