import { canopyWidth, meta, atExit, anchor, exitStatus, heldPosition } from '../src/logic.js';
import { GROW, DIE, growFrame, dieFrame } from '../src/mushroom.js';
import { enemyBox, lifeFraction, miteStage, isEnemy, attackCharge } from '../src/enemies.js';
import { createCamera, createParticles, worldPoint } from './presentation.js';
import { themeFor } from './themes.js';
import { portalFrame, arrivalFrame, GATE_DURATION, ARRIVAL_DURATION } from './portal.js';
import { measureCharacterFrames, characterPlacement } from './character-sprites.js';
import { guardAttackFrame } from './guard-animation.js';

export function createRenderer(canvas, S) {
  const ctx = canvas.getContext('2d');
  const background = document.createElement('canvas'); background.width = 1280; background.height = 640;
  // World width of the courtyard being drawn (1280 unless a level is wider); the backdrop is built at this width.
  let worldWidth = 1280;
  const b = background.getContext('2d');
  let currentDpr = 1, frameWidth = 1, frameHeight = 1, lastTime = null, visualTime = 0, lastReset = -1;
  const renderLevels = [1.75, 1.5, 1.25, 1];
  const budget = { level: 0, previous: null, elapsed: 0, frames: 0, slow: 0, scene: null };
  function sampleFrame(time, state, options) {
    if (options.paused || document.hidden || state.status !== 'playing' || budget.scene !== options.sceneKey) {
      budget.previous = null; budget.elapsed = budget.frames = budget.slow = 0; budget.scene = options.sceneKey;
      return;
    }
    const gap = budget.previous === null ? 0 : time - budget.previous;
    budget.previous = time;
    if (gap <= 0 || gap >= 120) { budget.elapsed = budget.frames = budget.slow = 0; return; }
    budget.elapsed += gap; budget.frames++; if (gap > 22) budget.slow++;
    if (budget.elapsed < 1000) return;
    // Sustained missed 60 Hz frames lower only rendering cost. Keep the tier for this session to avoid resize churn.
    if (budget.slow >= 8 && budget.slow / budget.frames >= .25) budget.level = Math.min(renderLevels.length - 1, budget.level + 1);
    budget.elapsed = budget.frames = budget.slow = 0;
  }
  const camera = createCamera(), effects = createParticles();
  let transform, portalView = null, arrivalView = null;
  const cyan = '#a1e3e5', gold = '#e1c68a', muted = '#8aa89b';
  const sprites = Object.fromEntries(['crate', 'seed', 'mushroom-grow', 'mushroom-die', 'still', 'mage', 'snail', 'pit', 'vine', 'crossbow'].map(name => { const img = new Image(); img.src = `/sprites/${name}.png`; return [name, img]; }));
  const loaded = (...names) => names.every(name => sprites[name].complete && sprites[name].naturalWidth > 0);
  // Theme art (ground, background images) is loaded on first use, by path. `theme` is the current courtyard's.
  const artCache = new Map();
  function art(src) {
    if (!artCache.has(src)) { const img = new Image(); img.onload = () => { backgroundKey = null; }; img.src = src; artCache.set(src, img); }
    const img = artCache.get(src); return img.complete && img.naturalWidth > 0 ? img : null;
  }
  let theme = themeFor(0), backgroundKey = null;
  // The backdrop's average colour along its top and bottom edges, for the space beyond the world.
  let edge = { top: '#86b4b0', bottom: '#609d91' };
  // Draws a sprite cropped to its art, centred on x and standing on `bottom`.
  function sprite(name, x, bottom, height, alpha) {
    if (alpha <= .01 || height <= 0) return;
    const img = sprites[name], w = height * img.naturalWidth / img.naturalHeight;
    ctx.save(); ctx.globalAlpha *= Math.min(1, alpha); ctx.drawImage(img, x - w / 2, bottom - height, w, height); ctx.restore();
  }
  // Each character's sheet is 8 columns x 2 rows (idle, run), art facing right. feetX is where the boots sit
  // within a frame; hands are where spells leave from in the idle and run rows, relative to the feet when facing right.
  const CHARACTERS = [{ sheet: 'still', feetX: .6, hands: [[12, -28], [15, -34]] }, { sheet: 'mage', feetX: .58, hands: [[17, -24], [13, -29]] }];
  const characterFrames = new Map();
  function framesFor(look) {
    if (!characterFrames.has(look.sheet)) {
      const img = sprites[look.sheet], surface = document.createElement('canvas');
      surface.width = img.naturalWidth; surface.height = img.naturalHeight;
      const context = surface.getContext('2d', { willReadFrequently: true });
      context.drawImage(img, 0, 0);
      characterFrames.set(look.sheet, measureCharacterFrames(context.getImageData(0, 0, surface.width, surface.height)));
    }
    return characterFrames.get(look.sheet);
  }
  const handOf = (p, which) => { const [x, y] = CHARACTERS[which].hands[p.grounded && !p.move ? 0 : 1]; return [p.x + p.facing * x, p.y + y]; };
  const smooth = p => p * p * (3 - 2 * p);
  function line(c, points, color, width = 1) { c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  // A negative radius makes arc() throw, which would abort the whole frame; a shrinking ring just vanishes instead.
  function circle(c, x, y, r, fill, stroke, width = 1) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function ellipse(c, x, y, rx, ry, angle, color) { c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), angle, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  function arch(c, x, y, w, h, color, width = 1) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function star(c, x, y, size, color) { c.beginPath(); c.moveTo(x, y - size); c.quadraticCurveTo(x + 1, y - 1, x + size, y); c.quadraticCurveTo(x + 1, y + 1, x, y + size); c.quadraticCurveTo(x - 1, y + 1, x - size, y); c.quadraticCurveTo(x - 1, y - 1, x, y - size); c.fillStyle = color; c.fill(); }
  function glow(c, x, y, r, color) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, '#a4dfdf00'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  // The backdrop canvas is rebuilt when the courtyard's background changes (or its image finishes loading).
  function updateBackground() {
    const look = theme.background, img = look.image ? art(look.image) : null, W = worldWidth;
    const key = `${theme.names.background}:${!!img}:${W}`;
    if (key === backgroundKey) return;
    backgroundKey = key;
    if (background.width !== W) background.width = W;
    // The painted greenhouse is drawn for 1280 and stretched; an image covers the whole world, centred.
    if (!look.image) { b.save(); b.scale(W / 1280, 1); buildBackground(); b.restore(); }
    else {
      b.fillStyle = '#86b4b0'; b.fillRect(0, 0, W, 640);
      if (img) { const k = Math.max(W / img.naturalWidth, 640 / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k; b.drawImage(img, (W - w) / 2, (640 - h) / 2, w, h); }
    }
    edge = { top: averageRow(0), bottom: averageRow(636) };
  }
  function averageRow(y) {
    const data = b.getImageData(0, y, background.width, 4).data; let r = 0, g = 0, bl = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; bl += data[i + 2]; }
    const n = data.length / 4; return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)})`;
  }
  function buildBackground() {
    const sky = b.createLinearGradient(0, 0, 0, 640); sky.addColorStop(0, '#86b4b0'); sky.addColorStop(.6, '#a5c9b5'); sky.addColorStop(1, '#609d91'); b.fillStyle = sky; b.fillRect(0, 0, 1280, 640);
    glow(b, 780, 130, 390, '#bbd2ad28');
    for (let i = 0; i < 80; i++) { const x = (i * 193.7) % 1280, y = (i * 87.9) % 380; circle(b, x, y, i % 4 === 0 ? 1.2 : .6, '#cad4b461'); }
    b.fillStyle = '#679b8c'; b.beginPath(); b.moveTo(0, 460); for (let x = 0; x <= 1300; x += 30) b.lineTo(x, 370 + Math.sin(x * .008) * 34 + Math.cos(x * .019) * 16); b.lineTo(1280, 640); b.lineTo(0, 640); b.fill();
    for (let i = 0; i < 8; i++) {
      const x = i * 180 - 50; arch(b, x, 135 + (i % 2) * 25, 150, 410, '#e8efd535', 11); arch(b, x + 9, 144 + (i % 2) * 25, 132, 400, '#f5f4da66', 1); line(b, [[x + 74, 151], [x + 74, 470]], '#d3d6b510');
    }
    b.save(); b.translate(780, 158);
    circle(b, 0, 0, 116, '#e3ecd51c', '#e7e6bfa6', 1.3); circle(b, 0, 0, 108, null, '#e4e7b777'); circle(b, 0, 0, 92, null, '#edf1d077'); circle(b, 0, 0, 75, '#9bb4a80c', '#cfcea53d');
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r = i % 5 === 0 ? 97 : 102; line(b, [[Math.sin(a) * r, -Math.cos(a) * r], [Math.sin(a) * 107, -Math.cos(a) * 107]], '#c9c99a7a', i % 5 === 0 ? 1.5 : .7); }
    b.font = '12px Georgia'; b.textAlign = 'center'; b.fillStyle = '#d3d2b693';['XII', 'III', 'VI', 'IX'].forEach((s, i) => b.fillText(s, Math.sin(i * Math.PI / 2) * 84, -Math.cos(i * Math.PI / 2) * 84 + 4));
    circle(b, -22, -14, 47, '#dddcc395'); circle(b, -3, -25, 43, '#83b1a8'); star(b, 26, 26, 7, '#ddd4a8b0'); circle(b, 0, 0, 17, null, '#d5cba15a');
    b.restore();
    for (let i = 0; i < 5; i++) { const x = 80 + i * 265; line(b, [[x, 0], [x, 230 + i % 2 * 50]], '#bdbf9227'); const y = 240 + i % 2 * 50; glow(b, x, y, 45, '#d8bc7d22'); b.strokeStyle = '#b8ac714a'; b.strokeRect(x - 8, y - 13, 16, 27); circle(b, x, y, 4, '#d1bc7b87'); line(b, [[x - 10, y - 13], [x, y - 22], [x + 10, y - 13]], '#b8ac714a'); }
    for (let side = 0; side < 2; side++) {
      b.save(); if (side) { b.translate(1280, 0); b.scale(-1, 1); }
      b.fillStyle = '#3f766d80'; b.fillRect(0, 0, 33, 640); line(b, [[31, 0], [31, 640]], '#b6bea136', 2);
      b.beginPath(); b.moveTo(23, 0); b.bezierCurveTo(55, 150, 8, 340, 86, 460); b.strokeStyle = '#76937a77'; b.lineWidth = 3; b.stroke();
      for (let i = 0; i < 16; i++) { const y = i * 29 + 25, x = 28 + Math.sin(i * .5) * 14 + i * 1.5; ellipse(b, x + (i % 2 ? 15 : -12), y, 17, 6, i % 2 ? -.5 : .6, '#456f5d99'); }
      b.restore();
    }
    b.fillStyle = '#386f6644'; b.fillRect(0, 570, 1280, 70);
    for (let i = 0; i < 60; i++) { const x = (i * 139.1) % 1280, y = 570 + (i * 23.3) % 70; line(b, [[x, y], [x + 15 + i % 5 * 9, y]], '#97bcb126', .7); }
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    frameWidth = Math.max(1, width); frameHeight = Math.max(1, height);
    currentDpr = Math.min(window.devicePixelRatio || 1, renderLevels[budget.level]);
    if (canvas.width !== Math.ceil(width * currentDpr) || canvas.height !== Math.ceil(height * currentDpr)) {
      canvas.width = Math.ceil(width * currentDpr); canvas.height = Math.ceil(height * currentDpr);
    }
  }
  // A platform's top is capped with the theme's ground strip (see GROUNDS in themes.js): left end, wall tiles on
  // either side of the emblem, right end. Tiles alternate mirrored so every seam meets a matching edge, and the
  // tile next to the emblem is the one cut beside it, so those seams are seamless. Ends that touch the world
  // edge stay open.
  function groundCap(p, img) {
    const GROUND = theme.ground.surface, k = GROUND.scale, h = GROUND.height * k, top = p.y - GROUND.walk * k, sourceY = GROUND.y ?? 0;
    const width = ([from, to]) => (to - from) * k;
    const piece = ([from, to], x, w, mirror = false) => {
      if (!mirror) return ctx.drawImage(img, from, sourceY, to - from, GROUND.height, x, top, w, h);
      ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(img, from, sourceY, to - from, GROUND.height, 0, top, w, h); ctx.restore();
    };
    // Tiles fill x0..x1; the first one counted from `fromRight ? x1 : x0` is unmirrored.
    const run = (src, x0, x1, fromRight) => {
      const span = x1 - x0; if (span <= 0) return;
      const count = Math.max(1, Math.round(span / width(src))), tile = span / count;
      for (let i = 0; i < count; i++) piece(src, x0 + i * tile, tile + .5, (fromRight ? count - 1 - i : i) % 2 === 1);
    };
    const openLeft = p.x <= 0, openRight = p.x + p.w >= worldWidth;
    const L = openLeft ? 0 : width(GROUND.left), R = openRight ? 0 : width(GROUND.right);
    const x0 = p.x + L, x1 = p.x + p.w - R, E = GROUND.emblem ? width(GROUND.emblem) : 0;
    if (GROUND.emblem && x1 - x0 >= E + width(GROUND.fillR)) {
      const ex = Math.round((x0 + x1 - E) / 2);
      run(GROUND.fillL, x0, ex, true); run(GROUND.fillR, ex + E, x1, false); piece(GROUND.emblem, ex, E);
    } else run(GROUND.fillR, x0, x1, false);
    if (!openLeft) piece(GROUND.left, p.x, L);
    if (!openRight) piece(GROUND.right, x1, R);
  }
  // Below the ground strip: the theme's fill texture, anchored to the world (one pattern per texture), darkening
  // with depth below `top` (the platform's fill top) only, so a platform's fill and its continuation below the
  // world's bottom edge blend into one gradient.
  const fillPatterns = new Map();
  const FILL_SHADE = { from: .12, to: .72, depth: 190 };
  // The fill starts just under the moss, behind the strip's lower stones (which fade into it).
  const FILL_TOP = 10;
  function groundFill(x, y, w, h, top = y) {
    const fill = theme.ground.fill, img = art(fill.src);
    if (w <= 0 || h <= 0 || !img) return;
    if (!fillPatterns.has(fill.src)) { const pattern = ctx.createPattern(img, 'repeat'); pattern.setTransform(new DOMMatrix().scale(fill.scale)); fillPatterns.set(fill.src, pattern); }
    ctx.fillStyle = fillPatterns.get(fill.src); ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(0, top, 0, top + FILL_SHADE.depth);
    g.addColorStop(0, `rgba(14,16,24,${FILL_SHADE.from})`); g.addColorStop(1, `rgba(10,14,18,${FILL_SHADE.to})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }

  // The bridge span is drawn at one scale on every ledge, so its arches and stones match from ledge to ledge (a
  // theme without `scale` stretches it to each ledge's width instead). A narrower ledge shows the part that fits,
  // keeping the end that faces the open side: the span's right end on a ledge starting at the world's left edge,
  // its left end on one reaching the right edge, its middle otherwise. A wider ledge repeats the span. The piers
  // grow longer to reach the ledge's foot: one stone course of their shafts (`legs`) repeats above their bases. A
  // ledge standing on the world's floor carries its legs on below it, for screens that show more than the world.
  function bridge(p, img) {
    const g = theme.ground.surface, k = g.scale ?? p.w / g.width, span = g.width * k, top = p.y - g.walk * k;
    // One horizontal band of source rows sy..sy+sh at world y (bands overlap by half a unit, so no seam shows).
    const row = (sy, sh, y) => {
      const piece = (sx, sw, x) => ctx.drawImage(img, g.x + sx, sy, sw, sh, x, y, sw * k, sh * k + .5);
      if (p.w <= span + .5) {
        const sw = Math.min(g.width, p.w / k), atLeft = p.x <= 0, atRight = p.x + p.w >= worldWidth;
        return piece(atLeft && !atRight ? g.width - sw : atRight && !atLeft ? 0 : (g.width - sw) / 2, sw, p.x);
      }
      for (let x = p.x; x < p.x + p.w - .5; x += span) piece(0, Math.min(g.width, (p.x + p.w - x) / k), x);
    };
    if (!g.scale || !g.base || !g.legs) return row(g.y, g.height, top);
    const [l0, l1] = g.legs, course = (l1 - l0) * k;
    const viewportBottom = (frameHeight - transform.offsetY) / transform.scale;
    const foot = p.y + p.h >= background.height - 1 ? Math.max(p.y + p.h, viewportBottom) : p.y + p.h;
    const natural = top + (g.base - g.y) * k;
    const courses = 1 + Math.max(0, Math.ceil((foot - natural) / course));
    row(g.y, l0 - g.y, top);
    let y = top + (l0 - g.y) * k;
    for (let i = 0; i < courses; i++, y += course) row(l0, l1 - l0, y);
    row(l1, g.y + g.height - l1, y);
  }
  function platform(p) {
    const surface = art(theme.ground.surface.src);
    if (theme.ground.kind === 'bridge') {
      if (surface) bridge(p, surface);
      return;
    }
    if (surface && art(theme.ground.fill.src)) {
      // The fill sits a little inside the ledge's ends, which step inward below the moss.
      const x0 = p.x <= 0 ? p.x : p.x + 12, x1 = p.x + p.w >= worldWidth ? p.x + p.w : p.x + p.w - 12;
      groundFill(x0, p.y + FILL_TOP, x1 - x0, p.h - FILL_TOP);
      if (p.x > 0) line(ctx, [[x0 + 1, p.y + 40], [x0 + 1, p.y + p.h]], '#15141c80', 2);
      if (p.x + p.w < worldWidth) line(ctx, [[x1 - 1, p.y + 40], [x1 - 1, p.y + p.h]], '#15141c80', 2);
      return groundCap(p, surface);
    }
    const g = ctx.createLinearGradient(0, p.y, 0, 650); g.addColorStop(0, '#35534c'); g.addColorStop(1, '#123239'); ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#b9c0a4'; ctx.fillRect(p.x, p.y, p.w, 8); ctx.fillStyle = '#647c66'; ctx.fillRect(p.x, p.y + 8, p.w, 13); ctx.fillStyle = '#1b3839'; ctx.fillRect(p.x, p.y + 21, p.w, 6);
    line(ctx, [[p.x, p.y - 1], [p.x + p.w, p.y - 1]], '#e5ddba', 1.5);
    for (let x = p.x + 18; x < p.x + p.w - 10; x += 55) { line(ctx, [[x, p.y + 1], [x + 4, p.y + 9], [x - 3, p.y + 18]], '#4e6553', 1); if ((Math.round(x) % 3) === 0) line(ctx, [[x + 18, p.y + 7], [x + 23, p.y + 4]], '#798a6d'); }
    for (let x = p.x + 20; x < p.x + p.w - 30; x += 99) {
      arch(ctx, x, p.y + 45, 63, p.h + 30, '#7b8e7136', 2); arch(ctx, x + 7, p.y + 53, 49, p.h + 30, '#b8ba8a19');
      for (let j = 0; j < 3; j++) ellipse(ctx, x + 10 + j * 14, p.y - 2, 10, 3, -.4 + j * .3, '#618466');
    }
    for (let i = 0; i < Math.min(p.w / 50, 12); i++) { const x = p.x + i * 53 + 5, l = 14 + i % 4 * 11; line(ctx, [[x, p.y + 12], [x + 4, p.y + l]], '#72907170', 2); }
    line(ctx, [[p.x, p.y + 30], [p.x, 640]], '#b7bd8e32'); line(ctx, [[p.x + p.w, p.y + 30], [p.x + p.w, 640]], '#b7bd8e32');
  }
  function actor(p, which, active, t, ghost = false) {
    if (p.animation) t = Math.max(0, t - p.animation.startTick * 1000 / 60);
    const color = which === 0 ? cyan : gold;
    ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha *= ghost ? .32 : 1;
    if (!ghost && p.grounded) { ellipse(ctx, 0, 2, 23, 5, 0, '#001f2780'); if (active) { ellipse(ctx, 0, 2, 25, 7, 0, which === 0 ? '#a1e3e51b' : '#e1c68a1b'); ctx.beginPath(); ctx.ellipse(0, 2, 25, 7, 0, 0, Math.PI * 2); ctx.strokeStyle = color + '80'; ctx.lineWidth = 1; ctx.stroke(); } }
    const side = p.facing;
    const cast = p.animation?.name === 'cast' ? Math.sin(Math.min(1, t / 300) * Math.PI) : 0;
    const look = CHARACTERS[which];
    if (loaded(look.sheet)) {
      const img = sprites[look.sheet];
      const running = p.grounded && p.move, row = running || !p.grounded ? 1 : 0;
      const frame = p.grounded ? Math.floor(t * (running ? .014 : .008)) % 8 : 3;
      const crop = framesFor(look)[row * 8 + frame], place = characterPlacement(crop, look.feetX);
      ctx.save(); ctx.scale(side, 1); ctx.translate(0, -cast * 4);
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, place.x, place.y, place.w, place.h);
      ctx.restore();
      if (cast) circle(ctx, ...handOf({ ...p, x: 0, y: -cast * 4 }, which), 9 + cast * 13, null, color, 1.5);

      if (active && !ghost) { ctx.globalAlpha *= .8; star(ctx, 0, -84 + Math.sin(t * .003) * 2, 4, color); }
      return ctx.restore();
    }
    const sway = p.grounded && p.move ? Math.sin(t * .018) * 2 : Math.sin(t * .003) * .7;
    line(ctx, [[-7, -9], [-8 + sway, -1]], '#c4d1c5', 5); line(ctx, [[7, -9], [7 - sway, -1]], '#9dafac', 5);
    ctx.beginPath(); ctx.moveTo(-11, -37); ctx.bezierCurveTo(-15, -25, -18 - sway, -12, -19, -7); ctx.quadraticCurveTo(0, -1, 19, -7); ctx.lineTo(11, -38); ctx.closePath(); const cloth = ctx.createLinearGradient(-15, -30, 17, -12); cloth.addColorStop(0, '#ece9cc'); cloth.addColorStop(.5, '#cdd7c4'); cloth.addColorStop(1, '#8ea79e'); ctx.fillStyle = cloth; ctx.fill();
    line(ctx, [[-3, -34], [-5, -7]], '#718f896b'); line(ctx, [[7, -31], [10, -8]], '#eef1d677');
    ctx.beginPath(); ctx.moveTo(-13, -36); ctx.quadraticCurveTo(-16, -58, -1, -62); ctx.quadraticCurveTo(15, -59, 14, -38); ctx.quadraticCurveTo(1, -31, -13, -36); ctx.fillStyle = '#e6e8cd'; ctx.fill();
    ellipse(ctx, p.facing * 2, -46, 9, 11, 0, '#284e51'); circle(ctx, p.facing * 4 - 2, -47, 1.1, '#f2e9bc'); circle(ctx, p.facing * 4 + 3, -47, 1.1, '#f2e9bc');
    ctx.fillStyle = color; ctx.fillRect(-12, -36, 25, 5); ctx.beginPath(); ctx.moveTo(7, -34); ctx.quadraticCurveTo(20 + sway, -29, 26 + sway * 2, -36); ctx.lineTo(23 + sway, -25); ctx.quadraticCurveTo(15, -23, 6, -29); ctx.fill();
    ctx.save(); ctx.translate(0, -cast * 12);
    line(ctx, [[side * 16, -34], [side * 23, -25]], '#cbd8c7', 5); line(ctx, [[side * 24, -49], [side * 24, -1]], '#b7a171', 2.5);
    if (which === 0) { circle(ctx, side * 24, -53, 6, null, color, 2); circle(ctx, side * 27, -55, 4, '#21464b'); } else { line(ctx, [[side * 24, -48], [side * 19, -57]], color, 1.5); ellipse(ctx, side * 20, -57, 5, 2.5, .7, color); ellipse(ctx, side * 28, -54, 5, 2.5, -.7, color); }
    if (cast) circle(ctx, side * 24, -53, 9 + cast * 13, null, color, 1.5);
    ctx.restore();
    if (active && !ghost) { ctx.globalAlpha *= .8; star(ctx, 0, -78 + Math.sin(t * .003) * 2, 4, color); }
    ctx.restore();
  }
  function crate(c, targeted, t) {
    ctx.save(); ctx.translate(c.x, c.y); const size = 24;
    if (c.frozen) { glow(ctx, 0, 0, 70, '#9de3e527'); circle(ctx, 0, 0, 41 + Math.sin(t * .002) * 2, null, '#a1e3e570'); circle(ctx, 0, 0, 34, null, '#a1e3e52e'); }
    if (loaded('crate')) { const h = 55, w = h * sprites.crate.naturalWidth / sprites.crate.naturalHeight; ctx.drawImage(sprites.crate, -w / 2, 27.5 - h, w, h); } // fills the 54x54 collision box
    else {
      ctx.fillStyle = '#61736a'; ctx.fillRect(-size, -size, 48, 48); ctx.strokeStyle = '#d4c99e'; ctx.lineWidth = 3; ctx.strokeRect(-size, -size, 48, 48); ctx.strokeStyle = '#243f3d'; ctx.lineWidth = 2; ctx.strokeRect(-18, -18, 36, 36); line(ctx, [[-20, -20], [20, 20]], '#c7b887', 3); line(ctx, [[20, -20], [-20, 20]], '#c7b887', 3);
      circle(ctx, 0, 0, 11, '#183e42', c.frozen ? cyan : '#d6bc82', 2); circle(ctx, 0, 0, 7, null, '#b6d7cd7a'); line(ctx, [[0, -5], [0, 0], [4, 2]], cyan);
      for (const x of [-21, 21]) for (const y of [-21, 21]) circle(ctx, x, y, 2, '#ede3b7');
    }
    if (c.frozen) { line(ctx, [[-34, -7], [-31, -28], [-9, -35]], '#bceef0'); line(ctx, [[34, 9], [30, 29], [10, 35]], '#bceef0'); for (let i = 0; i < 5; i++) star(ctx, Math.sin(i * 5.2) * 40, Math.cos(i * 4.6) * 40, 2, '#c9f3ef'); }
    if (targeted) { const a = 32; ctx.strokeStyle = cyan; ctx.lineWidth = 1.5; for (const [x, y] of [[-a, -a], [a, -a], [-a, a], [a, a]]) line(ctx, [[x, y - Math.sign(y) * 8], [x, y], [x - Math.sign(x) * 8, y]], cyan); }
    ctx.restore();
  }
  function timeRing(x, y, r, o, t) {
    if (o.frozen) { glow(ctx, x, y, r * 1.7, '#9de3e527'); circle(ctx, x, y, r + Math.sin(t * .002) * 2, null, '#a1e3e570'); return; }
    if (!o.speed) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .0012 * o.speed); ctx.setLineDash([6, 9]); circle(ctx, 0, 0, r, null, o.speed < 0 ? '#9fc4e888' : '#e1c68a88', 1.5); ctx.restore();
  }
  // A stone-rimmed bed of soil (sprite 480x100, soil centred 38% down), drawn 100 wide with the soil just above
  // the ground line so a mushroom rises out of it and the rim's front sinks a little into the ledge.
  const PIT = { w: 100, soil: .38 };
  function pit(p) {
    if (!p.plant && p.plantable === false) return;
    if (p.wall) {
      // A wall pit is the same bed turned on its side, its soil facing the way the vine grows.
      ctx.save(); ctx.translate(p.x - p.wall * 8, p.y + 8); ctx.rotate(-p.wall * Math.PI / 2);
      if (loaded('pit')) { const img = sprites.pit, w = 60, h = w * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, -w / 2, -h * PIT.soil, w, h); }
      else { ellipse(ctx, 0, 0, 20, 6, 0, '#2a3d33'); ellipse(ctx, 0, -2, 15, 3, 0, p.plant ? '#4d5a41' : '#1b2a25'); }
      ctx.restore();
      return;
    }
    if (loaded('pit')) {
      const img = sprites.pit, h = PIT.w * img.naturalHeight / img.naturalWidth;
      ctx.drawImage(img, p.x - PIT.w / 2, p.y - 2 - h * PIT.soil, PIT.w, h);
      return;
    }
    ellipse(ctx, p.x, p.y - 1, 30, 7, 0, '#2a3d33'); ellipse(ctx, p.x, p.y - 3, 24, 4, 0, p.plant ? '#4d5a41' : '#1b2a25');
    if (!p.plant) for (let i = 0; i < 4; i++) circle(ctx, p.x - 15 + i * 10, p.y - 6 - (i % 2) * 2, 1.5, '#6f7d5a');
  }
  function seed(o, t) {
    ctx.save(); ctx.translate(o.x, o.y); glow(ctx, 0, 0, 26, '#e1c68a22');
    if (loaded('seed')) { ctx.restore(); return sprite('seed', o.x, o.y + 9, 18, 1); }
    ellipse(ctx, 0, 0, 7, 10, .5, '#b39a5c'); ellipse(ctx, -1.5, -2, 3, 5, .5, '#e6d39a'); line(ctx, [[3, -7], [6, -12 + Math.sin(t * .004)]], '#9fbf7f', 1.5);
    ctx.restore();
  }
  // Mushroom sheets are 4x4 frames with every stem foot centred on the cell bottom. One frame is drawn at a time,
  // squashed or stretched so its cap top sits at the plant's height and its cap is exactly as wide as the standable
  // surface; that width eases between frames, so swapping to the next frame at the midpoint never changes the outline.
  function mushroom(o, targeted, t) {
    const h = o.height, x = o.x, y = o.base, { growTicks, matureTicks, witherTicks, maxHeight, springHeight } = meta.plant;
    timeRing(x, y - h / 2, Math.max(22, h / 2 + 12), o, t);
    const table = o.withered ? DIE : GROW, img = sprites[o.withered ? 'mushroom-die' : 'mushroom-grow'];
    const { i, p, ratio } = o.withered ? dieFrame((o.age - growTicks - matureTicks) / witherTicks) : growFrame(h, maxHeight, springHeight);
    const frame = p < .5 ? i : i + 1, sprout = o.withered ? 1 : Math.min(1, h / 14);
    if (sprout < 1) sprite('seed', x, y, 14, 1 - sprout);
    if (h > .5) {
      const fw = img.naturalWidth / 4, fh = img.naturalHeight / 4, sy = h / (table[frame][0] * fh), sx = sy * ratio / table[frame][1];
      ctx.save(); ctx.globalAlpha *= sprout; ctx.drawImage(img, frame % 4 * fw, Math.floor(frame / 4) * fh, fw, fh, x - fw * sx / 2, y - fh * sy, fw * sx, fh * sy); ctx.restore();
    }
    if (targeted) { circle(ctx, x, y - h - 16, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, x, y - h - 16, 5, gold); }
  }
  // The vine sheet is 4x2 frames of 443.5px, each vine growing right from the cell's left edge. Per frame: the
  // art's left and right edge in the cell, and the y of the stem's top (where travellers stand). The frame for
  // the vine's length is stretched to exactly the standable strip and mirrored for a vine growing left. Withered,
  // it shrinks back through the frames and dries to yellow-brown.
  const VINE = { cell: 443.5, scale: .67, frames: [[9, 111, 232], [10, 152, 232], [9, 206, 232], [9, 345, 232], [9, 338, 200], [10, 376, 200], [8, 431, 200], [8, 435, 200]] };
  let vineTint;
  function vine(o, targeted, t) {
    const L = o.height, a = anchor(o);
    timeRing(a.x, a.y, Math.max(22, L / 2 + 10), o, t);
    if (L < .5) { sprite('seed', o.x + o.wall * 10, o.base + 9, 14, 1); return; }
    if (!loaded('vine')) { line(ctx, [[o.x, o.base + 6], [o.x + o.wall * L, o.base + 6]], o.withered ? '#a08a52' : '#6f8f4a', 10); return; }
    const f = Math.max(0, Math.min(7, Math.round(L / meta.vine.maxLength * 7))), [left, right, top] = VINE.frames[f];
    const sx = f % 4 * VINE.cell + left, sy = Math.floor(f / 4) * VINE.cell, sw = right - left, sh = VINE.cell;
    const k = VINE.scale, w = Math.ceil(L), h = Math.ceil(sh * k);
    vineTint ??= document.createElement('canvas');
    if (vineTint.width !== w || vineTint.height !== h) { vineTint.width = w; vineTint.height = h; }
    const c = vineTint.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    c.drawImage(sprites.vine, sx, sy, sw, sh, 0, 0, w, h);
    if (o.withered) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(176, 140, 70, .55)'; c.fillRect(0, 0, w, h); }
    ctx.save(); ctx.translate(o.x, o.base - top * k); ctx.scale(o.wall, 1);
    ctx.drawImage(vineTint, 0, 0);
    ctx.restore();
    if (targeted) { circle(ctx, a.x, o.base - 22, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, a.x, o.base - 22, 5, gold); }
  }
  function plant(o, targeted, t, reduced) {
    if (o.wall) return vine(o, targeted, t);
    if (loaded('seed', 'mushroom-grow', 'mushroom-die')) return mushroom(o, targeted, t);
    const h = o.height, x = o.x, y = o.base, dead = o.withered, g = Math.min(1, h / meta.plant.maxHeight), top = y - h;
    timeRing(x, y - h / 2, Math.max(22, h / 2 + 12), o, t);
    if (h < 12 && !dead) { ctx.globalAlpha = 1 - h / 12; ellipse(ctx, x, y - 5, 6, 8, .4, '#b39a5c'); ellipse(ctx, x - 1, y - 7, 2.5, 4, .4, '#e6d39a'); ctx.globalAlpha = 1; }
    if (h > .5) {
      const base = 1.5 + 13 * g, tip = Math.max(1, base * .3);
      ctx.beginPath(); ctx.moveTo(x - base, y); ctx.quadraticCurveTo(x - base * .5, y - h * .5, x - tip, top); ctx.lineTo(x + tip, top); ctx.quadraticCurveTo(x + base * .6, y - h * .5, x + base * 1.4, y); ctx.fillStyle = dead ? '#7c7c63' : '#a8a276'; ctx.fill();
      if (h > 30) line(ctx, [[x - base * .2, y], [x + base * .15, y - h * .4], [x - tip * .5, top + 6]], '#d3bd836b', 1.5);
      for (let i = 0; i < 7; i++) {
        const grow = Math.max(0, Math.min(1, g * 9 - i - 1)); if (!grow) continue;
        const side = i % 2 ? 1 : -1, yy = y - h * (.35 + i * .075), len = (25 + i * 6) * (.4 + .6 * g) * grow, lift = 22 * g * grow;
        ctx.beginPath(); ctx.moveTo(x, yy + lift); ctx.quadraticCurveTo(x + side * len * .5, yy, x + side * len, yy - lift); ctx.strokeStyle = dead ? '#949277' : '#ada875'; ctx.lineWidth = Math.max(1, (5 - i * .3) * g); ctx.stroke();
      }
      if (!dead) {
        const crown = (canopyWidth(o) / 2 + 8) * Math.min(1, .25 + h / 80), leaf = .3 + .7 * g, count = Math.max(2, Math.round(67 * Math.min(1, h / 140)));
        glow(ctx, x, top + 10, crown + 23, '#d3bd7920');
        for (let i = 0; i < count; i++) { const a = i * 2.399, r = Math.sqrt(i / 67) * crown; ellipse(ctx, x + Math.cos(a) * r, top + 12 * leaf + Math.sin(a) * r * .44, (9 + i % 5) * leaf, (4 + i % 3) * leaf, Math.sin(a) * .7, ['#9dba81', '#bbc58a', '#d5c686', '#7b9c76', '#c6bd79'][i % 5]); }
        if (h < 60) { ctx.globalAlpha = 1 - h / 60; circle(ctx, x, top + 2, 3, gold); ctx.globalAlpha = 1; }
        if (h > 40) line(ctx, [[x - crown + 13 * leaf, top + 3], [x + crown - 13 * leaf, top + 3]], '#efdfac77');
      } else { ellipse(ctx, x, top, 25, 5, 0, '#8d8a6c'); for (let i = 0; i < 5; i++) ellipse(ctx, x + Math.sin(i * 3) * 43, y - 4, 5, 2, i, '#b3a475'); }
    }
    if (targeted) { circle(ctx, x, top - 16, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, x, top - 16, 5, gold); }
  }
  function mover(o, targeted, t) {
    timeRing(o.x + o.w / 2, o.y + 10, o.w / 2 + 10, o, t);
    if (o.axis === 'y') line(ctx, [[o.x + o.w / 2, o.y1 + 10], [o.x + o.w / 2, o.y2 + 30]], '#b6bea133', 1);
    else line(ctx, [[o.x1 + 6, o.y + 26], [o.x2 + o.w - 6, o.y + 26]], '#b6bea133', 1);
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + 20); g.addColorStop(0, '#b9c0a4'); g.addColorStop(.4, '#647c66'); g.addColorStop(1, '#1b3839');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, 20, 4); ctx.fill();
    line(ctx, [[o.x, o.y - 1], [o.x + o.w, o.y - 1]], '#e5ddba', 1.5); circle(ctx, o.x + o.w / 2, o.y + 10, 5, '#183e42', o.speed ? gold : '#8aa89b', 1.5);
    if (targeted) { const a = o.w / 2 + 6, cx = o.x + o.w / 2, cy = o.y + 10; for (const [x, y] of [[-a, -18], [a, -18], [-a, 18], [a, 18]]) line(ctx, [[cx + x, cy + y - Math.sign(y) * 8], [cx + x, cy + y], [cx + x - Math.sign(x) * 8, cy + y]], gold); }
  }
  function checkpoint(cp, active, t) {
    line(ctx, [[cp.x, cp.y], [cp.x, cp.y - 34]], '#b8ac71', 2);
    if (cp.lit) glow(ctx, cp.x, cp.y - 38, 46 + Math.sin(t * .003) * 3, active ? '#f1dc9a66' : '#e1c68a33');
    circle(ctx, cp.x, cp.y - 38, 7, cp.lit ? '#f4e2a6' : '#2c5050', cp.lit ? gold : '#8aa89b', 1.5);
    circle(ctx, cp.x + 3, cp.y - 40, 5, cp.lit ? '#e9cf86' : '#3d6563');
  }
  // The guard is a clock-shelled snail: a 4x2 sheet of 300px walking frames facing right. The art (rows 76-244 of
  // each cell) is scaled to the collision box's height, so its shell top is where travellers stand, with the shell
  // (centred at x=128 of the cell) over the box and the head reaching out ahead. It steps through its frames as it
  // travels. The head retracts behind the shell to wind up; the shell springs back on its local strike clock.
  // A launcher is a crossbow from a 4x2 sheet of 443.5px frames, facing right. Three frames are used: loaded
  // (frame 0), just fired with the string forward (4) and cocked again without a bolt (7). Each is cropped
  // [left, top, width, height] in its cell from the stock's end to the bow, leaving out the loose bolts the sheet
  // draws in flight (the real dart is drawn on its own), and drawn with the stock's end at the same spot so the
  // stock stays still between frames. Every crop's top is the bow's tip; the bolt rail is `rail` below it.
  const CROSSBOW = { cell: 443.5, stock: 301, rail: 84, length: 76, frames: {
    loaded: [0, 29, 141, 337, 200], fired: [4, 28, 129, 237, 203], cocked: [7, 0, 130, 246, 202] } };
  function crossbow(o, cx, cy) {
    const [i, left, top, w, h] = CROSSBOW.frames[o.timer < 12 ? 'fired' : o.timer < 30 ? 'cocked' : 'loaded'];
    const k = CROSSBOW.length / CROSSBOW.stock;
    ctx.save(); ctx.translate(cx, cy);
    // Mirrored when it fires left (so it is never drawn upside down), turned for up or down.
    if (Math.abs(o.dx) >= Math.abs(o.dy)) ctx.scale(o.dx < 0 ? -1 : 1, 1); else ctx.rotate(o.dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.drawImage(sprites.crossbow, i % 4 * CROSSBOW.cell + left, Math.floor(i / 4) * CROSSBOW.cell + top, w, h,
      -CROSSBOW.length / 2, -CROSSBOW.rail * k, w * k, h * k);
    ctx.restore();
  }
  const SNAIL = { cell: 300, top: 76, bottom: 244, shellX: 128 };
  let snailTint;
  function snail(o, b, pose) {
    const img = sprites.snail, k = b.h / (SNAIL.bottom - SNAIL.top), size = Math.ceil(SNAIL.cell * k);
    const frame = Math.floor(Math.abs(o.x) / 6) % 8, sx = frame % 4 * SNAIL.cell, sy = Math.floor(frame / 4) * SNAIL.cell;
    snailTint ??= document.createElement('canvas');
    if (snailTint.width !== size) snailTint.width = snailTint.height = size;
    const t = snailTint.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, size, size);
    t.drawImage(img, sx, sy, SNAIL.cell, SNAIL.cell, 0, 0, size, size);
    const tint = o.frozen ? 'rgba(188, 238, 240, .35)' : null;
    if (tint) { t.globalCompositeOperation = 'source-atop'; t.fillStyle = tint; t.fillRect(0, 0, size, size); }
    const dir = o.dir < 0 ? -1 : 1;
    ctx.save(); ctx.translate(b.x + b.w / 2, o.y);
    ctx.scale(dir * (1 + pose.charge * .05 + pose.recoil * .06), 1 - pose.charge * .12 + pose.recoil * .06);
    ctx.translate(-SNAIL.shellX * k, -SNAIL.bottom * k);
    const head = Math.min(size - 1, Math.round(198 * k));
    ctx.drawImage(snailTint, head, 0, size - head, size, head - 40 * k * pose.retract, 0, (size - head) * (1 - .85 * pose.retract), size);
    ctx.drawImage(snailTint, 0, 0, head, size, 0, 0, head, size);
    ctx.restore();
  }
  function enemy(o, targeted, t, reduced) {
    const b = enemyBox(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2, f = lifeFraction(o);
    ctx.save(); ctx.globalAlpha = f > .9 ? 1 - (f - .9) / .1 * .6 : 1;
    timeRing(cx, cy, Math.max(b.w, b.h) / 2 + 12, o, t);
    const charge = attackCharge(o);
    // The guard retracts into its shell; the other creatures keep their own warning glow.
    if (o.kind !== 'guard' && charge > 0) {
      glow(ctx, cx, cy, Math.max(b.w, b.h) * (.9 + charge * .8), `rgba(255, 50, 35, ${.3 + .5 * charge})`);
      if (!reduced) ctx.translate(Math.sin(t * .08) * 2.5 * charge, 0);
    }
    if (o.kind === 'guard') {
      const pose = guardAttackFrame(o), artPose = reduced ? { ...pose, recoil: 0, charge: 0, retract: 0 } : pose;
      if (loaded('snail')) snail(o, b, artPose);
      else {
        ellipse(ctx, cx, cy + pose.charge * 3, b.w / 2, b.h / 2 * (1 - artPose.charge * .12), 0, o.frozen ? '#adcac5' : '#8d9b79');
        circle(ctx, cx, cy, 15, null, '#d8c495', 2);
        circle(ctx, cx + o.dir * (20 - artPose.retract * 14), cy + 8, 6, '#b6bf96');
      }
      if (pose.charge > 0) ellipse(ctx, cx, o.y + 2, 28 + pose.charge * 4, 5, 0, '#c8b48255');
      if (pose.wave !== null) {
        ctx.save(); ctx.globalAlpha *= 1 - pose.wave;
        ctx.strokeStyle = '#d8c495'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, o.y + 2, reduced ? 32 : 26 + pose.wave * 22, 6 + pose.wave * 3, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) circle(ctx, cx + (i - 2.5) * (8 + pose.wave * 4), o.y - Math.sin(i + .5) ** 2 * 15 * pose.wave, 1.5, '#d8c495');
        ctx.restore();
      }
    }
    if (o.kind === 'lantern') {
      line(ctx, [[cx, b.y - 8], [cx, b.y + 2]], '#8a7a52', 1.5); if (!o.frozen) glow(ctx, cx, cy, 40, '#f2c46a44');
      ellipse(ctx, cx, cy, b.w / 2, b.h / 2, 0, o.frozen ? '#c9d9c8' : '#e6b25a'); for (const dx of [-8, 8]) line(ctx, [[cx + dx, b.y + 4], [cx + dx * 1.3, cy], [cx + dx, b.y + b.h - 4]], '#b5853f88', 1);
      circle(ctx, cx - 7, cy - 2, 3, '#3b2a1c'); circle(ctx, cx + 7, cy - 2, 3, '#3b2a1c'); ellipse(ctx, cx, cy + 9, 5, o.chasing ? 4 : 2, 0, '#3b2a1c');
    }
    if (o.kind === 'launcher' && loaded('crossbow')) crossbow(o, cx, cy);
    else if (o.kind === 'launcher') {
      ctx.fillStyle = '#56656a'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill(); circle(ctx, cx, cy, 13, null, '#b8ac7188', 1.5);
      circle(ctx, cx + o.dx * 12, cy + o.dy * 12, 6, '#1c2b2c'); circle(ctx, cx, cy, 3, o.speed ? gold : '#8aa89b');
    }
    if (o.kind === 'dart') {
      const len = 18, hx = cx + o.dx * len, hy = cy + o.dy * len, tx = cx - o.dx * len, ty = cy - o.dy * len;
      line(ctx, [[tx, ty], [hx, hy]], o.frozen ? '#bceef0' : '#d9c27a', 3);
      ctx.fillStyle = o.frozen ? '#bceef0' : '#f0dc96'; ctx.beginPath(); ctx.moveTo(hx + o.dx * 6, hy + o.dy * 6); ctx.lineTo(hx - o.dy * 5, hy + o.dx * 5); ctx.lineTo(hx + o.dy * 5, hy - o.dx * 5); ctx.fill();
      line(ctx, [[tx, ty], [tx - o.dx * 6 - o.dy * 5, ty - o.dy * 6 + o.dx * 5]], '#c98f6b', 2); line(ctx, [[tx, ty], [tx - o.dx * 6 + o.dy * 5, ty - o.dy * 6 - o.dx * 5]], '#c98f6b', 2);
    }
    if (o.kind === 'orb') { if (!o.frozen) glow(ctx, cx, cy, 30, '#e3b8ff55'); circle(ctx, cx, cy, b.w / 2, o.frozen ? '#cfeaf0' : '#f2d6ff', '#b98be0', 1.5); circle(ctx, cx - 3, cy - 3, 3, '#ffffffcc'); }
    if (o.kind === 'nest') {
      ellipse(ctx, cx, b.y + b.h * .6, b.w / 2, b.h / 2, 0, '#6b5a45'); ellipse(ctx, cx, b.y + b.h * .45, b.w / 2.6, b.h / 2.6, 0, '#7d6a50');
      for (const dx of [-14, 0, 14]) ellipse(ctx, cx + dx, b.y + b.h * .5, 4, 3, 0, '#2b2219');
    }
    if (o.kind === 'mite') {
      const stage = miteStage(o), color = o.frozen ? '#c9d9c8' : ['#8fae7a', '#c9604a', '#9a9a8a'][stage];
      for (const dx of [-.3, 0, .3]) line(ctx, [[cx + b.w * dx, b.y + b.h * .7], [cx + b.w * dx * 1.4, b.y + b.h]], '#3b3a2e', 2);
      ellipse(ctx, cx, b.y + b.h * .55, b.w / 2, b.h * .45, 0, color);
      if (stage === 1) { const gap = (b.w - 16) / 4; for (let i = 0; i < 4; i++) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b.x + 4 + i * gap, b.y + 10); ctx.lineTo(b.x + 4 + i * gap + gap / 2, b.y); ctx.lineTo(b.x + 4 + (i + 1) * gap, b.y + 10); ctx.fill(); } }
      circle(ctx, cx + o.dir * b.w * .3, b.y + b.h * .45, 2.5, '#1f1a14');
    }
    ctx.restore();
  }
  // Outside the world: mirror the artwork and continue the ground columns
  // to the screen edge, including wide courtyards and tall tablet viewports.
  // Purely visual; the world, its coordinates and collisions are unchanged.
  function surroundings(state) {
    const W = state.width, H = state.height, scale = transform.scale;
    const left = -transform.offsetX / scale, top = -transform.offsetY / scale;
    const right = (frameWidth - transform.offsetX) / scale, bottom = (frameHeight - transform.offsetY) / scale;
    // Mirror each neighbouring tile across the shared edge, including corners.
    // The central world is painted below; this adds no collision geometry.
    for (let row = Math.floor(top / H); row < Math.ceil(bottom / H); row++) {
      for (let col = Math.floor(left / W); col < Math.ceil(right / W); col++) {
        if (row === 0 && col === 0) continue;
        const flipX = Math.abs(col % 2) === 1, flipY = Math.abs(row % 2) === 1;
        ctx.save(); ctx.translate((col + Number(flipX)) * W, (row + Number(flipY)) * H);
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        const overlap = 1 / scale;
        ctx.drawImage(background, -overlap, -overlap, W + overlap * 2, H + overlap * 2); ctx.restore();
      }
    }
    if (bottom > H) {
      const deep = ctx.createLinearGradient(0, H, 0, Math.max(H + 1, bottom)); deep.addColorStop(0, '#16131f00'); deep.addColorStop(1, '#16131f66');
      ctx.fillStyle = deep; ctx.fillRect(left, H, right - left, bottom - H);
    }
    if (theme.ground.kind === 'bridge') {
      if (bottom > H) {
        ctx.save(); ctx.beginPath(); ctx.rect(left, H, right - left, bottom - H); ctx.clip();
        state.platforms.forEach(platform);
        ctx.restore();
      }
      return;
    }
    for (const p of state.platforms) {
      const x0 = p.x <= 0 && left < 0 ? left : p.x, x1 = p.x + p.w >= W && right > W ? right : p.x + p.w;
      if (x0 !== p.x || x1 !== p.x + p.w) platform({ ...p, x: x0, w: x1 - x0 });
      if (bottom > H && p.y + p.h >= H - 1) {
        // The fill below the world lines up with the fill above it, inset like it at ends that are not open.
        const f0 = p.x <= 0 ? x0 : p.x + 12, f1 = p.x + p.w >= W ? x1 : p.x + p.w - 12;
        if (art(theme.ground.fill.src)) groundFill(f0, H - 2, f1 - f0, bottom - H + 2, p.y + FILL_TOP); // the same gradient, continued
        // While the ground texture loads, the mirrored scene behind it already covers the viewport.
      }
    }
  }
  // Still's Freeze Area: time inside fades to a grey-yellow, like an old photograph, strongest at the centre and
  // easing back to normal colour toward the edge. When cast it spreads out from the centre over FREEZE_SPREAD
  // ticks with a soft wave at its front; it fades out at the end and pulses gently in its last two seconds.
  const FREEZE_SPREAD = 36, SEPIA = [178, 162, 112];
  let freezeWash;
  const easeOut = u => 1 - (1 - u) ** 3;
  function freezeLook(a, t) {
    const age = a.duration - a.ticksLeft, spread = easeOut(Math.min(1, Math.max(0, age) / FREEZE_SPREAD));
    const alpha = Math.min(1, a.ticksLeft / 30) * (a.ticksLeft < 120 ? .65 + .35 * Math.abs(Math.cos(t * .006)) : 1);
    return { r: Math.max(1, a.radius * spread), spread, alpha };
  }
  // The colour change itself, drawn over the world (below the travellers): desaturate, then tint grey-yellow.
  function freezeTint(a, t) {
    const { r, alpha } = freezeLook(a, t);
    if (alpha <= 0) return;
    if (budget.level > 0) {
      if (!freezeWash) {
        freezeWash = document.createElement('canvas'); freezeWash.width = freezeWash.height = 256;
        const wash = freezeWash.getContext('2d'), gradient = wash.createRadialGradient(128, 128, 0, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(176,158,104,.6)'); gradient.addColorStop(.45, 'rgba(176,158,104,.46)'); gradient.addColorStop(1, 'rgba(176,158,104,0)');
        wash.fillStyle = gradient; wash.fillRect(0, 0, 256, 256);
      }
      ctx.save(); ctx.globalAlpha *= alpha;
      ctx.drawImage(freezeWash, a.x - r, a.y - r, 2 * r, 2 * r);
      ctx.restore();
      return;
    }
    const ramp = (rgb, strength) => {
      const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      g.addColorStop(0, `rgba(${rgb},${strength * alpha})`); g.addColorStop(.45, `rgba(${rgb},${strength * .75 * alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
      return g;
    };
    ctx.save(); ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = ramp('128,128,128', 1); ctx.fill();
    ctx.globalCompositeOperation = 'color'; ctx.fillStyle = ramp(SEPIA.join(','), .92); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = ramp('200,180,120', .22); ctx.fill();
    ctx.restore();
  }
  // Its marks, drawn first (under everything): a faint dashed reach, the wave while it spreads, its remaining time
  // as an arc, and a few drifting motes of dust.
  function freezeArea(a, t) {
    const { r, spread, alpha } = freezeLook(a, t), life = Math.max(0, a.ticksLeft / a.duration);
    ctx.save(); ctx.globalAlpha *= alpha;
    if (spread < 1) { ctx.globalAlpha *= 1 - spread; circle(ctx, a.x, a.y, r, null, '#f2d98e', 4.5); ctx.globalAlpha /= 1 - spread; }
    ctx.setLineDash([5, 12]); ctx.lineDashOffset = -t * .012; circle(ctx, a.x, a.y, Math.max(0, r - 2), null, '#e6cc80b0', 2.2); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(a.x, a.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * life); ctx.strokeStyle = '#f2d98ee6'; ctx.lineWidth = 3; ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const turn = i * 2.39996 + t * .00025 * (i % 2 ? 1 : -1), d = r * (.15 + ((i * 37) % 70) / 100);
      circle(ctx, a.x + Math.cos(turn) * d, a.y + Math.sin(turn) * d, 1.3 + (i % 3) * .7, '#f6e2a6dd');
    }
    ctx.restore();
  }
  // Slowed objects carry a small mark so it is clear what the area is holding.
  function frostMark(o, t) {
    const b = isEnemy(o) ? enemyBox(o) : o.kind === 'plant' ? (o.wall ? { x: anchor(o).x - 10, y: o.base - 4, w: 20, h: 0 } : { x: o.x - 10, y: o.base - o.height - 4, w: 20, h: 0 }) : o.kind === 'mover' ? { x: o.x, y: o.y, w: o.w, h: 0 } : { x: o.x - 10, y: o.y - (o.kind === 'crate' ? 30 : 14), w: 20, h: 0 };
    const x = b.x + b.w / 2 + Math.sin(t * .003 + b.x) * 3, y = b.y - 10;
    ctx.save(); ctx.globalAlpha *= .85; glow(ctx, x, y, 12, '#e6d6a366'); star(ctx, x, y, 4, '#f6ecc8'); ctx.restore();
  }
  // Still's pickup (an extra Freeze charge): a small hourglass that bobs and slowly rocks, its sand trickling.
  function frostCrystal(c, t) {
    const y = c.y + Math.sin(t * .0025 + c.x) * 4;
    glow(ctx, c.x, y, 34, '#bdf0f640');
    ctx.save(); ctx.translate(c.x, y); ctx.rotate(Math.sin(t * .0012 + c.x) * .18);
    ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(8, -11); ctx.bezierCurveTo(8, -4, 2, -2, 1.5, 0); ctx.bezierCurveTo(2, 2, 8, 4, 8, 11);
    ctx.lineTo(-8, 11); ctx.bezierCurveTo(-8, 4, -2, 2, -1.5, 0); ctx.bezierCurveTo(-2, -2, -8, -4, -8, -11); ctx.closePath();
    ctx.fillStyle = '#d9f8fb66'; ctx.fill(); ctx.strokeStyle = '#effcfd'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#f2c768';
    ctx.beginPath(); ctx.moveTo(-5.5, -7); ctx.lineTo(5.5, -7); ctx.quadraticCurveTo(3, -3, 0, -1.5); ctx.quadraticCurveTo(-3, -3, -5.5, -7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(5, 6, 6.5, 9.5); ctx.lineTo(-6.5, 9.5); ctx.quadraticCurveTo(-5, 6, 0, 4); ctx.fill();
    if (Math.floor(t / 180) % 2 === 0) { ctx.fillRect(-.5, -1, 1, 5); }
    ctx.fillStyle = '#e8c27a'; ctx.fillRect(-10, -13, 20, 2.6); ctx.fillRect(-10, 10.4, 20, 2.6);
    ctx.restore();
  }
  function lightningCrystal(c, t) {
    const y = c.y + Math.sin(t * .0025 + c.x) * 4;
    glow(ctx, c.x, y, 28, '#fbe09e71');
    ctx.save(); ctx.translate(c.x, y);
    ctx.beginPath(); ctx.moveTo(2, -15); ctx.lineTo(-9, 1); ctx.lineTo(-2, 1);
    ctx.lineTo(-5, 14); ctx.lineTo(10, -4); ctx.lineTo(2, -4); ctx.closePath();
    ctx.fillStyle = '#f8d17d'; ctx.fill(); ctx.strokeStyle = '#fff2c6'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  function aimedCast({ actor, origin, point, range, radius, target, reason }) {
    const color = reason === 'ok' || reason === 'aim' ? actor === 0 ? '#e9dcae' : '#ffe293' : '#f4a58a'; // Still: the Freeze Area's grey-yellow
    ctx.save(); ctx.setLineDash([8, 9]);
    circle(ctx, origin.x, origin.y, range, null, `${color}64`, 1.5);
    if (!point) { ctx.restore(); return; } // not aimed yet: just the reach
    line(ctx, [[origin.x, origin.y - (actor === 1 ? 25 : 0)], [point.x, point.y]], `${color}ae`, 1.5);
    ctx.setLineDash([]);
    circle(ctx, point.x, point.y, radius ?? (target ? 23 : 12), `${color}18`, color, 2.5);
    star(ctx, point.x, point.y, 5, color);
    ctx.restore();
  }
  // Aiming a throw: the crate's flight as a dashed arc (the real physics, see throwPath), ending in a ring where
  // it comes down, or a short tick against the wall it would hit.
  function throwArc({ points }) {
    if (points.length < 2) return;
    const end = points[points.length - 1];
    ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([7, 9]);
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const q of points) ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = '#173c37aa'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#fff3cfee'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.ellipse(end.x, end.y + 27, 30, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff3cf26'; ctx.fill(); ctx.strokeStyle = '#fff3cfcc'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  function freezePreview(p) {
    if (p.cancel) {
      circle(ctx, p.x, p.y, p.radius + 2, null, '#f6db9fe6', 2.5);
      label(p.x, p.y - p.radius - 14, S.cancelFreezePreview, gold);
      return;
    }
    ctx.save(); ctx.setLineDash([8, 8]);
    circle(ctx, p.x, p.y, p.radius, p.valid ? '#e6cc8024' : '#f1a58f1c', p.valid ? '#ecd38ae6' : '#f1a58fe6', 2.2);
    ctx.setLineDash([]); star(ctx, p.x, p.y, 5, p.valid ? '#f6ecc8' : '#f6c3b5'); ctx.restore();
  }
  // Rewind: a cool wash with a vignette, a clock hand sweeping backwards and streaks of time running right to left.
  function rewindOverlay(u, t) {
    const W = canvas.width, H = canvas.height, swell = Math.sin(Math.min(1, u) * Math.PI);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = .16 + .1 * swell; ctx.fillStyle = '#b4d4e6'; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .72);
    v.addColorStop(0, '#9fc3d800'); v.addColorStop(1, '#173a48d0');
    ctx.globalAlpha = .3 + .45 * swell; ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .2;
    for (let i = 0; i < 22; i++) { const y = ((i * 61) % 100) / 100 * H, x = W - ((t * .9 + i * 211) % (W + 240)); ctx.fillStyle = '#eef8f2'; ctx.fillRect(x, y, 50 + (i % 5) * 26, Math.max(1, currentDpr)); }
    const r = Math.min(W, H) * .08, cx = W / 2, cy = H * .4, hand = -Math.PI / 2 - u * Math.PI * 6;
    ctx.globalAlpha = .85; ctx.lineCap = 'round';
    circle(ctx, cx, cy, r, '#163a4466', '#e8f3eecc', Math.max(2, r * .05));
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.2, -Math.PI / 2, -Math.PI / 2 - u * Math.PI * 2, true); ctx.strokeStyle = '#f2dd9a'; ctx.lineWidth = Math.max(2, r * .06); ctx.stroke();
    line(ctx, [[cx, cy], [cx + Math.cos(hand) * r * .78, cy + Math.sin(hand) * r * .78]], '#f6f1d8', Math.max(2, r * .07));
    ctx.font = `${Math.round(Math.max(11, r * .28))}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#eef6ec';
    ctx.fillText(S.rewinding, cx, cy + r * 1.75);
    ctx.restore();
  }
  function door(state, t, opening = 0) {
    const { x, y } = state.exit, open = state.status === 'won' || state.actors.some(p => atExit(state, p));
    ctx.save(); ctx.translate(x, y);
    glow(ctx, 0, -65, 105, open ? '#e8d49838' : '#b8d8d31c');
    const stone = ctx.createLinearGradient(-50, 0, 50, 0);
    stone.addColorStop(0, '#294843'); stone.addColorStop(.35, '#698277'); stone.addColorStop(.65, '#526e63'); stone.addColorStop(1, '#243d39');
    ctx.fillStyle = '#203f38'; ctx.fillRect(-54, -4, 108, 8);
    arch(ctx, -43, -134, 86, 134, '#223d35', 13);
    arch(ctx, -43, -134, 86, 134, stone, 9);
    arch(ctx, -38, -129, 76, 129, '#b19c66', 1.5);
    arch(ctx, -33, -123, 66, 123, '#e6d5a48c', .8);
    for (const side of [-1, 1]) {
      ctx.fillStyle = stone; ctx.fillRect(side * 44 - 6, -85, 12, 84);
      for (const yy of [-84, -34, -8]) { ctx.fillStyle = '#b3a276'; ctx.fillRect(side * 44 - 8, yy, 16, 3); }
      line(ctx, [[side * 44, -73], [side * 44, -44]], '#d6c38a66', 1);
    }
    ctx.save(); ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(-31, -90);
    ctx.arc(0, -90, 31, Math.PI, 0); ctx.lineTo(31, 0); ctx.closePath(); ctx.clip();
    const night = ctx.createLinearGradient(0, -122, 0, 0);
    night.addColorStop(0, '#102f37'); night.addColorStop(.55, '#345d5e'); night.addColorStop(1, open ? '#c4cbae' : '#668e82');
    ctx.fillStyle = night; ctx.fillRect(-32, -124, 64, 125);
    for (let i = 0; i < 18; i++) {
      const yy = -((t * .008 + i * 19.7) % 120), xx = Math.sin(i * 7.2) * 28;
      circle(ctx, xx, yy, i % 4 ? .65 : 1.3, '#e7e3bd99');
    }
    glow(ctx, 0, -49, 39, open ? '#f9e9b35c' : '#b0d6cf27');
    if (opening > 0) {
      ctx.save(); ctx.globalAlpha *= opening;
      glow(ctx, 0, -70, 55 + opening * 30, '#fff1b7d9');
      ctx.restore();
    }
    circle(ctx, 0, -70, 19, null, '#d4c38bc0', .9);
    circle(ctx, 0, -70, 23, null, '#d4c38b44', .6);
    ctx.save(); ctx.translate(0, -70); ctx.rotate(t * .00012);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(ctx, [[Math.cos(a) * 25, Math.sin(a) * 25], [Math.cos(a) * 28, Math.sin(a) * 28]], '#e5d4a2', 1); }
    ctx.restore();
    star(ctx, 0, -70, 9, '#f1e1ad');
    line(ctx, [[-30, -1], [30, -1]], '#fff1b7', 2);
    ctx.restore();
    star(ctx, 0, -133, 6, '#d8c595');
    if (state.status !== 'won') {
      const waiting = exitStatus(state).waiting;
      ctx.textAlign = 'center'; ctx.font = '9px Georgia'; ctx.fillStyle = '#efe6c6';
      ctx.fillText(waiting !== null ? S.gateWaiting[waiting] : 'THE MOON GATE', 0, -153);
    }
    ctx.restore();
  }
  // An orb flies from the caster's hand to what they targeted (following it if it moves), then bursts on arrival.
  const FLIGHT = 12, BURST = 14;
  function spell(state, e, reduced) {
    const age = state.tick - e.tick, caster = state.actors[e.caster];
    if (!caster || age < 0 || age > FLIGHT + BURST) return;
    if (e.kind === 'freeze' && !state.freezeAreas.some(area => area.id === e.area)) return;
    // Still's spell is the Freeze Area's grey-yellow; Bloom's stays gold.
    const color = e.caster === 0 ? '#e9dcae' : gold, [sx, sy] = handOf(caster, e.caster);
    const target = state.objects.find(o => o.id === e.target), { x: tx, y: ty } = target ? anchor(target) : e;
    const lift = Math.min(40, Math.hypot(tx - sx, ty - sy) * .2), cx = (sx + tx) / 2, cy = Math.min(sy, ty) - lift;
    const at = u => [(1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * tx, (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ty];
    ctx.save();
    if (reduced) { ctx.globalAlpha = 1 - age / (FLIGHT + BURST); circle(ctx, tx, ty, 14, null, color, 2); return ctx.restore(); }
    if (age <= FLIGHT) {
      const u = smooth(age / FLIGHT);
      for (let i = 5; i > 0; i--) { const [x, y] = at(Math.max(0, u - i * .045)); circle(ctx, x, y, 5 - i * .6, color + ['', 'cc', '99', '77', '55', '33'][i]); }
      const [x, y] = at(u); glow(ctx, x, y, 22, color + 'aa'); circle(ctx, x, y, 7, color); circle(ctx, x - 1.5, y - 1.5, 3.5, '#fffbe8');
      if (age < 5) glow(ctx, sx, sy, 14 - age * 2, color + 'cc');
    } else {
      const b = (age - FLIGHT) / BURST; ctx.globalAlpha = 1 - b;
      glow(ctx, tx, ty, 30 + b * 20, color + '88'); circle(ctx, tx, ty, 8 + b * 28, null, color, 2);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + .4, r = 10 + b * 26; circle(ctx, tx + Math.cos(a) * r, ty + Math.sin(a) * r, 2.2 * (1 - b) + .5, '#fffbe8'); }
    }
    ctx.restore();
  }
  function label(x, y, text, color = cyan) {
    ctx.font = '10px "Segoe UI",sans-serif'; const w = ctx.measureText(text).width + 24; ctx.fillStyle = '#0a3037e8'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 25, 5); ctx.fill(); ctx.strokeStyle = color + '55'; ctx.lineWidth = 1; ctx.stroke(); ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, x, y + 4);
  }
  function draw(state, time, options = {}) {
    sampleFrame(time, state, options);
    resize();
    theme = themeFor(state.level); worldWidth = state.width ?? 1280; updateBackground();
    const dt = lastTime === null ? 0 : Math.min(.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (!options.paused && !options.reduced) visualTime += dt * 1000;
    const t = options.reduced ? 0 : visualTime + (options.celebration?.progress ?? 0) * GATE_DURATION + (options.arrival?.progress ?? 0) * ARRIVAL_DURATION;
    transform = camera.update(state, { width: frameWidth, height: frameHeight, dt, reduced: options.reduced, paused: options.paused, sceneKey: options.sceneKey, resetCamera: lastReset !== options.cameraReset, bottomInset: options.bottomInset || 0 });
    const departure = options.celebration && portalFrame(options.celebration.progress, options.reduced);
    portalView = departure;
    if (departure) {
      const baseScale = transform.scale;
      const targetScale = Math.max(baseScale, Math.min(frameWidth / 90, frameHeight / 72));
      const scale = baseScale * (targetScale / baseScale) ** departure.zoom;
      const cx = (frameWidth / 2 - transform.offsetX) / baseScale;
      const cy = (frameHeight / 2 - transform.offsetY) / baseScale;
      const focusY = state.exit.y - 70;
      transform = { ...transform, scale,
        offsetX: frameWidth / 2 - (cx + (state.exit.x - cx) * departure.focus) * scale,
        offsetY: frameHeight / 2 - (cy + (focusY - cy) * departure.focus) * scale,
      };
    }
    arrivalView = options.arrival ? arrivalFrame(options.arrival.progress, state.actors, Math.max(0, -transform.offsetX / transform.scale), options.reduced) : null;
    if (arrivalView) state = { ...state, actors: arrivalView, objects: state.objects.map(o => o.held != null ? { ...o, ...heldPosition(o, arrivalView[o.held]) } : o) };
    lastReset = options.cameraReset;
    effects.update(state, { dt, reduced: options.reduced, paused: options.paused && state.status !== 'won', sceneKey: options.sceneKey });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = edge.top; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(currentDpr * transform.scale, 0, 0, currentDpr * transform.scale, currentDpr * transform.offsetX, currentDpr * transform.offsetY);
    surroundings(state);
    // Clip to the world on whole device pixels: a clip edge through the middle of a pixel row lets the sky show
    // through as a faint line where the world meets what lies beyond it.
    const k = currentDpr * transform.scale, ox = currentDpr * transform.offsetX, oy = currentDpr * transform.offsetY;
    const [cx0, cy0, cx1, cy1] = [ox, Math.min(0, oy), ox + state.width * k, oy + state.height * k].map(Math.round);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); ctx.clip();
    ctx.setTransform(k, 0, 0, k, ox, oy);
    ctx.drawImage(background, 0, 0);
    if (theme.background.draw === 'greenhouse') { ctx.save(); ctx.translate(780, 158); ctx.rotate(t * .00003); line(ctx, [[0, 9], [0, -62]], '#d8c99777', 2); line(ctx, [[-28, 0], [8, 0]], '#d8c99777', 2); circle(ctx, 0, 0, 3, '#cfc7a1'); ctx.restore(); }
    state.platforms.forEach(platform);
    for (const a of state.freezeAreas ?? []) freezeArea(a, t);
    const target = options.target;
    // Touch: bracket every object the active character can reach (what a tap would act on).
    const marked = o => options.tappable ? options.tappable.has(o.id) : o.id === target;
    for (const p of state.pits) pit(p);
    for (const cp of state.checkpoints ?? []) checkpoint(cp, cp.id === state.actors[state.active].checkpoint, t);
    for (const o of state.objects) if (o.kind === 'mover') mover(o, marked(o), t);
    for (const o of state.objects) if (o.kind === 'plant') plant(o, marked(o), t, options.reduced);
    // Let the gate's glow extend beyond the world clip while keeping it behind the travellers.
    ctx.restore();
    door(state, t, departure?.opening);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); ctx.clip();
    ctx.setTransform(k, 0, 0, k, ox, oy);
    for (const shard of state.shards) if (!shard.taken) { const yy = shard.y + Math.sin(t * .002 + shard.id) * 5; glow(ctx, shard.x, yy, 40, '#e7d2a51b'); ctx.save(); ctx.translate(shard.x, yy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e2d194'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = '#f4e7b477'; ctx.strokeRect(-10, -10, 20, 20); ctx.restore(); }
    for (const c of state.pickups ?? []) if (!c.taken) (c.kind === 'bolt' ? lightningCrystal : frostCrystal)(c, t);
    for (const o of state.objects) if (o.kind === 'crate' && o.held === null) crate(o,options.tappable ? marked(o) : o.id === target && state.active === 0, t);
    for (const o of state.objects) if (o.kind === 'seed' && o.held === null) seed(o, t);
    const flying = o => !o.frozen && ['dart', 'orb', 'lantern'].includes(o.kind);
    for (const o of state.objects) if (isEnemy(o) && !flying(o)) enemy(o, marked(o), t, options.reduced);
    for (const a of state.freezeAreas ?? []) freezeTint(a, t);
    for (const actorState of state.actors) {
      const inv = actorState.invuln > 0;
      if (inv && !options.reduced && !options.paused && Math.floor(state.tick / 4) % 2) continue;
      if (inv && options.reduced) ctx.globalAlpha = .5;
      ctx.save();
      let traveller = actorState;
      if (departure) {
        const side = actorState.id === 0 ? -1 : 1;
        const slot = state.exit.x + side * 34;
        const approachX = actorState.x + (slot - actorState.x) * departure.approach;
        traveller = { ...actorState,
          x: approachX + (state.exit.x + side * 13 - approachX) * departure.walk,
          y: actorState.y + (state.exit.y - actorState.y) * departure.approach - departure.walk * 30,
          facing: -side, grounded: true,
          animation: null,
          move: departure.walk > 0 || departure.approach < 1 ? 1 : 0,
        };
        ctx.globalAlpha *= 1 - departure.fade;
        const size = 1 - departure.walk * .38;
        ctx.translate(traveller.x, traveller.y); ctx.scale(size, size); ctx.translate(-traveller.x, -traveller.y);
      }
      actor(traveller, actorState.id, !departure && actorState.id === state.active, !departure && actorState.animation && !options.reduced ? state.tick * 1000 / 60 : t);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    for (const o of state.objects) if (!departure && o.held != null) {
      const held = { ...o, ...heldPosition(o, state.actors[o.held]) };
      o.kind === 'crate' ? crate(held, false, t) : seed(held, t);
    }
    for (const o of state.objects) if (isEnemy(o) && flying(o)) enemy(o, marked(o), t, options.reduced);
    for (const o of state.objects) if (o.frozen && (o.held === null || o.held === undefined)) frostMark(o, t);
    // While time rewinds, faint afterimages trail the travellers.
    if (options.rewind) for (const ghost of options.rewind.ghosts) if (ghost) for (const a of ghost.actors) actor(a, a.id, false, t, true);
    for (const e of state.events) if (e.caster !== undefined) spell(state, e, options.reduced);
    for (const kind of ['ambient', 'dust', 'crystal', 'leaf', 'spark']) {
      ctx.beginPath();
      for (const p of effects.particles) {
        if (p.life <= 0 || p.kind !== kind) continue;
        const size = p.size * (kind === 'ambient' ? 1 : Math.min(1, p.life / p.maxLife * 2));
        if (kind === 'crystal' || kind === 'spark') {
          ctx.moveTo(p.x, p.y - size * 1.8); ctx.lineTo(p.x + size, p.y); ctx.lineTo(p.x, p.y + size * 1.8); ctx.lineTo(p.x - size, p.y); ctx.closePath();
        } else if (kind === 'leaf') {
          ctx.moveTo(p.x + size, p.y); ctx.ellipse(p.x, p.y, size, size * .45, p.angle, 0, Math.PI * 2);
        } else { ctx.moveTo(p.x + size, p.y); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); }
      }
      ctx.fillStyle = { ambient: '#eef5d4a6', dust: '#f8ebc8a6', crystal: '#efe0b0', leaf: '#e6dc9f', spark: '#fff4b5' }[kind];
      ctx.fill();
    }
    if (options.reduced) for (const e of state.events) {
      if (state.tick - e.tick < 12 && ['unfreeze', 'wake', 'grow', 'plant', 'shard', 'win', 'hit', 'checkpoint', 'strike'].includes(e.kind)) circle(ctx, e.x, e.y, 22, null, e.kind === 'hit' ? '#ffb3a1' : e.kind === 'strike' ? e.sourceKind === 'guard' ? '#d8c495' : '#ff8a6a' : e.kind === 'unfreeze' ? cyan : gold, 2);
    }
    // Touch feedback: a pulse on the tapped object; an out-of-reach tap also shows the reach ring.
    if (options.tap && options.tap.age < 1) {
      const { x, y, ok, ring, age } = options.tap;
      ctx.save(); ctx.globalAlpha = 1 - age;
      circle(ctx, x, y, options.tap.area && ok ? 20 + age * (meta.freeze.radius - 20) : 18 + age * 28, null, ok ? (options.tap.area || !state.active ? '#e9dcae' : gold) : '#f1a58f', 2.5);
      const carrier = ring !== null && state.actors[ring];
      if (carrier) { ctx.setLineDash([12, 9]); circle(ctx, carrier.x, carrier.y - (options.tap.area ? 30 : 0), options.tap.ringRadius ?? meta.controls.range, '#f4e7b40c', '#f4e7b4c0', 2); ctx.setLineDash([]); }
      ctx.restore();
    }
    if (options.preview) freezePreview(options.preview);
    if (options.aim) aimedCast(options.aim);
    if (options.throwArc) throwArc(options.throwArc);
    const selected = state.objects.find(o => o.id === target);
    if (state.status === 'playing' && selected) {
      const top = isEnemy(selected) ? enemyBox(selected).y - 26 : selected.kind === 'plant' ? (selected.wall ? selected.base - 45 : selected.base - selected.height - 53) : selected.kind === 'mover' ? selected.y - 30 : selected.y - 62;
      const x = selected.kind === 'mover' ? selected.x + selected.w / 2 : selected.kind === 'plant' && selected.wall ? anchor(selected).x : selected.x;
      const words = options.touch ? S.tapLabels : { freeze: S.targetFreeze, wake: S.targetWake, hasten: S.targetHasten, max: S.targetMax, rewind: S.targetRewind };
      if (state.active === 0) label(x, top, words.freeze);
      else if (Math.abs(selected.speed) >= meta.time.maxSpeed) label(x, top, words.max, muted);
      else label(x, top, state.bloomReverses ? words.rewind : selected.speed ? words.hasten : words.wake, gold);
    }
    ctx.restore();
    if (options.rewind) rewindOverlay(options.rewind.progress, t);
  }
  return {
    portrait(which) {
      const width = canvas.clientWidth || canvas.width || 120, height = canvas.clientHeight || canvas.height || 120;
      canvas.width = Math.round(width * Math.min(window.devicePixelRatio || 1, 2)); canvas.height = Math.round(height * Math.min(window.devicePixelRatio || 1, 2));
      const ratio = Math.min(canvas.width / 100, canvas.height / 110);
      ctx.setTransform(ratio, 0, 0, ratio, canvas.width / 2, canvas.height * .88); ctx.clearRect(-100, -150, 200, 200);
      actor({ x: 0, y: 0, facing: 1, grounded: true, move: 0 }, which, false, 0);
      const sheet = sprites[CHARACTERS[which].sheet];
      if (!loaded(CHARACTERS[which].sheet)) sheet.addEventListener('load', () => this.portrait(which), { once: true });
    },
    draw,
    worldPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return transform ? worldPoint(transform, clientX - rect.left, clientY - rect.top) : null;
    },
    inspect: () => ({ camera: transform && { ...transform }, portal: portalView && { ...portalView }, arrival: arrivalView?.map(p => ({ id: p.id, x: p.x, y: p.y, move: p.move })) ?? null, particles: effects.count, visualTime, pixelRatio: currentDpr, effectQuality: budget.level === 0 ? 'full' : 'light' }),
    // After a failed frame: drop any clip / transform / save it left behind (resizing a canvas resets its state).
    resetContext: () => { const w = canvas.width; canvas.width = 0; canvas.width = w; },
  };
}

export function drawCharacterPortrait(canvas, which) {
  createRenderer(canvas, {}).portrait(which);
}
