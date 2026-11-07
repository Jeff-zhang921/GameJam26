import { describe, test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEVELS } from '../src/levels/index.js';
import { GROUNDS, BACKGROUNDS, MUSIC, DEFAULT_THEME, themeFor } from '../public/themes.js';

const exists = src => existsSync(resolve(import.meta.dir, '../public', src.replace(/^\//, '')));

describe('courtyard themes', () => {
  test('every level names a registered ground, background and music', () => {
    for (const level of LEVELS) {
      expect(GROUNDS[level.theme.ground]).toBeDefined();
      expect(BACKGROUNDS[level.theme.background]).toBeDefined();
      expect(MUSIC[level.theme.music]).toBeDefined();
    }
  });

  test('every registered asset file exists', () => {
    for (const ground of Object.values(GROUNDS)) { expect(exists(ground.surface.src)).toBe(true); expect(exists(ground.fill.src)).toBe(true); }
    for (const background of Object.values(BACKGROUNDS)) if (background.image) expect(exists(background.image)).toBe(true);
    for (const track of Object.values(MUSIC)) expect(exists(track.src)).toBe(true);
  });

  test('a missing or unknown theme falls back to the defaults', () => {
    const fallback = themeFor(99);
    expect(fallback.names).toEqual(DEFAULT_THEME);
    expect(fallback.ground).toBe(GROUNDS[DEFAULT_THEME.ground]);
    expect(themeFor(0).music).toBe(MUSIC[LEVELS[0].theme.music]);
  });
});
