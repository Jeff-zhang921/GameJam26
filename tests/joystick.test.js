import { describe, test, expect } from 'bun:test';
import { readJoystick, skillAimOffset, JOYSTICK } from '../public/joystick.js';

describe('virtual joystick', () => {
  test('straight up and down are idle, and diagonals only steer', () => {
    expect(readJoystick(0, 0)).toEqual({ x: 0, y: 0, dir: 0 });
    expect(readJoystick(0, -1)).toEqual({ x: 0, y: -1, dir: 0 });
    expect(readJoystick(0, 1)).toEqual({ x: 0, y: 1, dir: 0 });
    expect(readJoystick(0.65, -0.65)).toEqual({ x: 0.65, y: -0.65, dir: 1 });
    expect(readJoystick(-0.65, -0.65)).toEqual({ x: -0.65, y: -0.65, dir: -1 });
    expect(readJoystick(-.08, -.95).dir).toBe(-1);
  });

  test('dead zone and hysteresis avoid starting or stopping on small drift', () => {
    const between = (JOYSTICK.deadZone + JOYSTICK.releaseZone) / 2;
    expect(readJoystick(between, 0).dir).toBe(0);
    expect(readJoystick(between, 0, 1).dir).toBe(1);
    expect(readJoystick(-between, 0, 1).dir).toBe(0);
    expect(readJoystick(JOYSTICK.releaseZone / 2, 0, 1).dir).toBe(0);
    expect(readJoystick(-0.8, 0, 1).dir).toBe(-1);
  });

  test('input beyond the rim remains clamped to full deflection', () => {
    expect(readJoystick(3, 0)).toEqual({ x: 1, y: 0, dir: 1 });
    const { x, y, dir } = readJoystick(-3, -4);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
    expect(dir).toBe(-1);
  });
});

test('skill aim keeps small presses centred and clamps a directional drag to cast range', () => {
  expect(skillAimOffset(3, -3, 100, 380)).toBe(null);
  expect(skillAimOffset(-50, 0, 100, 380)).toEqual({ x: -190, y: 0 });
  const offset = skillAimOffset(-300, -400, 100, 380);
  expect(offset.x).toBeLessThan(0);
  expect(offset.y).toBeLessThan(0);
  expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(380, 6);
});
