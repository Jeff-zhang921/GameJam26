// Virtual joystick maths, kept free of the DOM so it can be unit-tested.
// Input is the thumb offset from the stick centre, divided by the stick radius (so ±1 is the rim).
export const JOYSTICK = {
  deadZone: 0.22, // |x| below this is "no horizontal movement"
  // Jump fires when the thumb enters the upper region, measured as degrees above horizontal.
  // Upper-left / upper-right (~45°) and straight up all qualify; plain left / right do not.
  jumpEnter: { angle: 30, magnitude: 0.55 },
  // Hysteresis: once in the jump region, the thumb must clearly leave it (back to level or to the centre)
  // before another jump can start, so a thumb resting on the diagonal never re-triggers.
  jumpExit: { angle: 8, magnitude: 0.35 },
};

export function readJoystick(dx, dy, wasJumping = false, config = JOYSTICK) {
  const length = Math.hypot(dx, dy);
  const magnitude = Math.min(1, length);
  const scale = length > 0 ? magnitude / length : 0;
  const x = dx * scale, y = dy * scale;
  const dir = Math.abs(x) >= config.deadZone ? Math.sign(x) : 0;
  const elevation = magnitude > 0 ? Math.atan2(-y, Math.abs(x)) * 180 / Math.PI : 0;
  const gate = wasJumping ? config.jumpExit : config.jumpEnter;
  const jump = elevation >= gate.angle && magnitude >= gate.magnitude;
  return { x, y, magnitude, elevation, dir, jump };
}
