import { describe, test, expect } from 'bun:test';
import { readJoystick, JOYSTICK } from '../public/joystick.js';

// Thumb offset for an angle measured in degrees counter-clockwise from "right" (screen y grows downward).
const at = (degrees, magnitude = 1) => [Math.cos(degrees * Math.PI / 180) * magnitude, -Math.sin(degrees * Math.PI / 180) * magnitude];
const read = (degrees, magnitude, wasJumping = false) => readJoystick(...at(degrees, magnitude), wasJumping);

describe('virtual joystick', () => {
  test('left and right move without jumping; neutral and the dead zone stop', () => {
    expect(read(0, 1)).toMatchObject({ dir: 1, jump: false });
    expect(read(180, 1)).toMatchObject({ dir: -1, jump: false });
    expect(readJoystick(0, 0)).toMatchObject({ dir: 0, jump: false, magnitude: 0 });
    expect(readJoystick(JOYSTICK.deadZone * 0.8, 0)).toMatchObject({ dir: 0, jump: false });
    expect(read(-90, 1)).toMatchObject({ dir: 0, jump: false });
  });

  test('upper-right is Right + Jump, upper-left is Left + Jump, straight up is Jump', () => {
    expect(read(45, 1)).toMatchObject({ dir: 1, jump: true });
    expect(read(135, 1)).toMatchObject({ dir: -1, jump: true });
    expect(read(90, 1)).toMatchObject({ dir: 0, jump: true });
    // Not exactly 45°: anything clearly in the upper diagonal counts.
    expect(read(36, 0.8)).toMatchObject({ dir: 1, jump: true });
    expect(read(60, 0.8)).toMatchObject({ dir: 1, jump: true });
  });

  test('a slight upward drift while running does not jump', () => {
    expect(read(15, 1)).toMatchObject({ dir: 1, jump: false });
    expect(read(165, 1)).toMatchObject({ dir: -1, jump: false });
    expect(read(45, 0.45)).toMatchObject({ jump: false });
  });

  test('hysteresis keeps a jump held near the boundary and releases only after clearly leaving', () => {
    expect(read(25, 1, false).jump).toBe(false);
    expect(read(25, 1, true).jump).toBe(true);
    // A thumb resting on the diagonal drifts; it still counts as "held up" until it is back to level.
    expect(read(12, 1, true).jump).toBe(true);
    expect(read(45, 0.4, true).jump).toBe(true);
    expect(read(5, 1, true).jump).toBe(false);
    expect(read(45, 0.3, true).jump).toBe(false);
  });

  test('holding the diagonal starts exactly one jump; returning below the threshold re-arms it', () => {
    let jumping = false, jumps = 0;
    const path = [0, 10, 20, 32, 40, 45, 45, 45, 28, 22, 40, 45, 12, 5, 0, 35, 45];
    for (const degrees of path) {
      const next = read(degrees, 1, jumping).jump;
      if (next && !jumping) jumps++;
      jumping = next;
    }
    expect(jumps).toBe(2);
  });

  test('input beyond the rim is clamped to full deflection', () => {
    const reading = readJoystick(3, 0);
    expect(reading.magnitude).toBe(1);
    expect(reading.x).toBeCloseTo(1, 6);
    expect(reading.dir).toBe(1);
  });
});
