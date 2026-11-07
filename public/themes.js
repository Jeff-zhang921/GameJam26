import { LEVELS } from '../src/levels/index.js';

// The art and music a courtyard can use. Each level picks one of each by name with its `theme` parameter
// (src/levels/*.js); anything a level leaves out falls back to DEFAULT_THEME.

// Ground: `surface` is the strip that caps each platform, `fill` the texture below it.
// surface: `height` and the x ranges are source px; `walk` is where feet rest, measured from the strip's top;
// `scale` is world units per source px. A platform is capped with `left`, tiles of `fillL` / `fillR` either side
// of `emblem` (alternately mirrored), then `right`; with no `emblem` the middle is all `fillR` tiles. fill: a texture that tiles both ways, drawn at `scale`.
export const GROUNDS = {
  mossy: {
    surface: { src: '/sprites/ground.png', height: 174, walk: 28, scale: .45, left: [0, 160], right: [1540, 1690], fillL: [240, 740], emblem: [740, 960], fillR: [960, 1460] },
    fill: { src: '/sprites/ground-fill.png', scale: .6 },
  },
  // Mossy cobble ledge (picture/ground/1.png) over cobblestones (picture/ground/1_1.png). The strip keeps its moss
  // and top row of stones, fading out below (and on the inner side of its rounded ends) into the seamless fill.
  cobbleMoss: {
    surface: { src: '/sprites/ground-moss.png', height: 173, walk: 26, scale: .45, left: [0, 160], right: [1545, 1715], fillR: [400, 1100] },
    fill: { src: '/sprites/ground-fill.png', scale: .6 },
  },
};

// Background: `draw: 'greenhouse'` is the painted conservatory (arches, moon clock, lanterns). Or give an
// `image`; it is scaled to cover the 1280 x 640 world and centred.
export const BACKGROUNDS = {
  greenhouse: { draw: 'greenhouse' },
  // Floating castles over a lilac sea of clouds (picture/background/1.png).
  skyCastles: { image: '/art/sky-castles.jpg' },
};

// Music: `length` is how many seconds of the file are used (default: all of it); the last `fade` seconds are
// blended into the first `fade`, and the loop then runs from `fade` to `length`. `volume` is the gain.
// Tracks credited in public/audio/CREDITS.md.
export const MUSIC = {
  gymnopedie: { src: '/audio/gymnopedie-no-1.mp3', length: 50, fade: 2, volume: 1.5 },
  symbiosis: { src: '/audio/symbiosis.mp3', volume: .5 },
  whatSheHasntSeen: { src: '/audio/what-she-hasnt-seen.mp3', volume: .5 },
  doubledPawns: { src: '/audio/doubled-pawns.mp3', volume: .5 },
  deathKnell: { src: '/audio/death-knell-at-mount-rainier.mp3', volume: .5 },
  lordOfDream: { src: '/audio/lord-of-dream.mp3', volume: .5 },
  behemoth: { src: '/audio/behemoth.mp3', volume: .5 },
};
// The title screen and the pause / settings / help menus play this instead of the courtyard's track.
export const MENU_MUSIC = MUSIC.symbiosis;

export const DEFAULT_THEME = { ground: 'cobbleMoss', background: 'skyCastles', music: 'gymnopedie' };

// The resolved art and music of a courtyard (by its index in LEVELS).
export function themeFor(level) {
  const names = { ...DEFAULT_THEME, ...LEVELS[level]?.theme };
  return {
    names,
    ground: GROUNDS[names.ground] ?? GROUNDS[DEFAULT_THEME.ground],
    background: BACKGROUNDS[names.background] ?? BACKGROUNDS[DEFAULT_THEME.background],
    music: MUSIC[names.music] ?? MUSIC[DEFAULT_THEME.music],
  };
}
