import { attackCharge } from '../src/enemies.js';

const ease = n => n * n * (3 - 2 * n);
export function guardAttackFrame(guard) {
  const charge = attackCharge(guard);
  const wave = guard.strikeSeq > 0 && guard.attack < 8 ? Math.max(0, guard.attack / 8) : null;
  const recoil = wave === null ? 0 : 1 - ease(wave);
  return { charge, wave, recoil, retract: Math.max(charge, recoil * .65) };
}
