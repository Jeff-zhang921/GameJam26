import { LEVELS } from '../src/levels/index.js';
import { SKETCH_BRIDGE } from './courtyard-one-frames.js';
import { STONE_ART } from './courtyard-two-art.js';

// The art and music a courtyard can use. Each level picks one of each by name with its `theme` parameter
// (src/levels/*.js); anything a level leaves out falls back to DEFAULT_THEME.

// Ground: `surface` is the strip that caps each platform, `fill` the texture below it.
// surface: `y`, `height` and the x ranges are source px; `walk` is where feet rest, measured from the strip's top;
// `scale` is world units per source px. A platform is capped with `left`, tiles of `fillL` / `fillR` either side
// of `emblem` (alternately mirrored), then `right`; with no `emblem` the middle is all `fillR` tiles. fill: a texture that tiles both ways, drawn at `scale`.
export const GROUNDS = {
  watercolorStone: {
    kind: 'watercolorStone',
    surface: { src: '/sprites/courtyard-two/ground.png', ...STONE_ART.ground },
    tall: { src: '/sprites/courtyard-two/ground-tall.png', ...STONE_ART['ground-tall'] },
    floating: { src: '/sprites/courtyard-two/floating-platform.png', ...STONE_ART['floating-platform'] },
    fill: { src: '/sprites/ground-fill.png', scale: .6 },
  },
  // First-courtyard watercolor viaduct: flat deck and plain, extendable pencil-sketched piers.
  sketchBridge: {
    kind: 'bridge',
    surface: { src: '/sprites/courtyard-one/bridge.png', x: 0, y: 0, ...SKETCH_BRIDGE, scale: 830 / SKETCH_BRIDGE.width, continuousShaft: true },
    fill: { src: '/sprites/ground-fill.png', scale: .6 },
  },
  // One bridge span (`x`, `y`, `width`, `height` in source px; feet rest `walk` px below its top), drawn at the same
  // `scale` (world units per source px) on every ledge: 830 / 2103 shows it exactly once on courtyard 1's 830-wide
  // middle ledge. Narrower ledges show the part of it that fits. `base` is the source y where the piers end and
  // `legs` one stone course of the pier shafts (source rows, mortar line to mortar line): on a tall ledge that
  // course repeats so the piers reach the ledge's foot at the same scale (see `bridge` in public/render.js).
  bridge: {
    kind: 'bridge',
    surface: { src: '/sprites/bridge-arches.png', x: 35, y: 16, width: 2103, height: 708, walk: 72, scale: 830 / 2103, base: 668, legs: [484, 522] },
    fill: { src: '/sprites/ground-fill.png', scale: .6 },
  },
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
// `image`; it covers the viewport proportionally, independent of the gameplay camera. `focusX` locates the clocktower.
export const BACKGROUNDS = {
  greenhouse: { draw: 'greenhouse' },
  // Floating castles over a lilac sea of clouds (picture/background/1.png).
  skyCastles: { image: '/art/sky-castles.jpg' },
  moonlitClocktower: { image: '/art/backgrounds/chamber-1.png', focusX: .7 },
  chamber1: { image: '/art/backgrounds/chamber-1.png', focusX: .7 },
  chamber2: { image: '/art/backgrounds/chamber-2.png', focusX: .665 },
  chamber3: { image: '/art/backgrounds/chamber-3.png', focusX: .65 },
  chamber4: { image: '/art/backgrounds/chamber-4.png', focusX: .72 },
  chamber5: { image: '/art/backgrounds/chamber-5.png', focusX: .68 },
  chamber6: { image: '/art/backgrounds/chamber-6.png' },
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
