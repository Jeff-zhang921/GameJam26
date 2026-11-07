import { canopyWidth, meta } from '../src/logic.js';
import { enemyBox, lifeFraction, miteStage, isEnemy, attackCharge } from '../src/enemies.js';
import { createCamera, createParticles, worldPoint } from './presentation.js';

export function createRenderer(canvas, S) {
  const ctx = canvas.getContext('2d');
  const background = document.createElement('canvas'); background.width = 1280; background.height = 640;
  const b = background.getContext('2d');
  let currentDpr = 1, frameWidth = 1, frameHeight = 1, lastTime = null, visualTime = 0, lastReset = -1;
  const camera = createCamera(), effects = createParticles();
  let transform;
  let entryProgress = 0;
  const cyan = '#a1e3e5', gold = '#e1c68a', muted = '#8aa89b';
  const sprites = Object.fromEntries(['crate', 'seed', 'sprout', 'bud', 'bloom', 'bloom-wind', 'wilted', 'petals'].map(name => { const img = new Image(); img.src = `/sprites/${name}.png`; return [name, img]; }));
  const loaded = (...names) => names.every(name => sprites[name].complete && sprites[name].naturalWidth > 0);
  // Sprites are cropped to their art. baseX is where the stem meets the ground (fraction of width);
  // walk is how far below the top the standable line sits (fraction of height), so `height` matches the collision surface.
  const FLOWER = { seed: [.45, 0], sprout: [.511, .12], bud: [.494, .02], bloom: [.458, .15], 'bloom-wind': [.429, .13], wilted: [.494, .03], petals: [.5, 0] };
  const shapeOf = name => { const img = sprites[name], [baseX, walk] = FLOWER[name] ?? [.5, 0]; return { aspect: img.naturalWidth / img.naturalHeight, baseX, walk }; };
  function sprite(name, x, bottom, height, alpha, form = shapeOf(name)) {
    if (alpha <= .01 || height <= 0) return;
    const h = height / (1 - form.walk), w = h * form.aspect;
    ctx.save(); ctx.globalAlpha *= Math.min(1, alpha); ctx.drawImage(sprites[name], x - w * form.baseX, bottom - h, w, h); ctx.restore();
  }
  const smooth = p => p * p * (3 - 2 * p), lerp = (a, b, p) => a + (b - a) * p;
  // Two images drawn as one silhouette whose proportions morph from a to b while b dissolves in over a.
  function morph(a, b, p, x, bottom, height) {
    const s = smooth(Math.max(0, Math.min(1, p))), A = shapeOf(a), B = shapeOf(b);
    const form = { aspect: lerp(A.aspect, B.aspect, s), baseX: lerp(A.baseX, B.baseX, s), walk: lerp(A.walk, B.walk, s) };
    sprite(a, x, bottom, height, 1 - s * s, form);
    sprite(b, x, bottom, height, s, form);
  }
  // The seed dissolves into a tiny bloom, which then simply scales up with the plant's height.
  const GROWTH = [['seed', 0], ['bloom', 25]];
  function line(c, points, color, width = 1) { c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function circle(c, x, y, r, fill, stroke, width = 1) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function ellipse(c, x, y, rx, ry, angle, color) { c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), angle, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  function arch(c, x, y, w, h, color, width = 1) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function star(c, x, y, size, color) { c.beginPath(); c.moveTo(x, y - size); c.quadraticCurveTo(x + 1, y - 1, x + size, y); c.quadraticCurveTo(x + 1, y + 1, x, y + size); c.quadraticCurveTo(x - 1, y + 1, x - size, y); c.quadraticCurveTo(x - 1, y - 1, x, y - size); c.fillStyle = color; c.fill(); }
  function glow(c, x, y, r, color) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, '#a4dfdf00'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
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
  buildBackground();
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    frameWidth = Math.max(1, width); frameHeight = Math.max(1, height);
    currentDpr = Math.min(window.devicePixelRatio || 1, 1.75);
    if (canvas.width !== Math.round(width * currentDpr) || canvas.height !== Math.round(height * currentDpr)) {
      canvas.width = Math.round(width * currentDpr); canvas.height = Math.round(height * currentDpr);
    }
  }
  function platform(p) {
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
    if (!ghost) { ellipse(ctx, 0, 2, 23, 5, 0, '#001f2780'); if (active) { ellipse(ctx, 0, 2, 25, 7, 0, which === 0 ? '#a1e3e51b' : '#e1c68a1b'); ctx.beginPath(); ctx.ellipse(0, 2, 25, 7, 0, 0, Math.PI * 2); ctx.strokeStyle = color + '80'; ctx.lineWidth = 1; ctx.stroke(); } }
    const sway = p.grounded && p.move ? Math.sin(t * .018) * 2 : Math.sin(t * .003) * .7;
    line(ctx, [[-7, -9], [-8 + sway, -1]], '#c4d1c5', 5); line(ctx, [[7, -9], [7 - sway, -1]], '#9dafac', 5);
    ctx.beginPath(); ctx.moveTo(-11, -37); ctx.bezierCurveTo(-15, -25, -18 - sway, -12, -19, -7); ctx.quadraticCurveTo(0, -1, 19, -7); ctx.lineTo(11, -38); ctx.closePath(); const cloth = ctx.createLinearGradient(-15, -30, 17, -12); cloth.addColorStop(0, '#ece9cc'); cloth.addColorStop(.5, '#cdd7c4'); cloth.addColorStop(1, '#8ea79e'); ctx.fillStyle = cloth; ctx.fill();
    line(ctx, [[-3, -34], [-5, -7]], '#718f896b'); line(ctx, [[7, -31], [10, -8]], '#eef1d677');
    ctx.beginPath(); ctx.moveTo(-13, -36); ctx.quadraticCurveTo(-16, -58, -1, -62); ctx.quadraticCurveTo(15, -59, 14, -38); ctx.quadraticCurveTo(1, -31, -13, -36); ctx.fillStyle = '#e6e8cd'; ctx.fill();
    ellipse(ctx, p.facing * 2, -46, 9, 11, 0, '#284e51'); circle(ctx, p.facing * 4 - 2, -47, 1.1, '#f2e9bc'); circle(ctx, p.facing * 4 + 3, -47, 1.1, '#f2e9bc');
    ctx.fillStyle = color; ctx.fillRect(-12, -36, 25, 5); ctx.beginPath(); ctx.moveTo(7, -34); ctx.quadraticCurveTo(20 + sway, -29, 26 + sway * 2, -36); ctx.lineTo(23 + sway, -25); ctx.quadraticCurveTo(15, -23, 6, -29); ctx.fill();
    const side = p.facing;
    const cast = p.animation?.name === 'cast' ? Math.sin(Math.min(1, t / 300) * Math.PI) : 0;
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
    if (loaded('crate')) { const w = 62, h = w * sprites.crate.naturalHeight / sprites.crate.naturalWidth; ctx.drawImage(sprites.crate, -w / 2, 27 - h, w, h); }
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
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .0012 * o.speed); ctx.setLineDash([6, 9]); circle(ctx, 0, 0, r, null, '#e1c68a88', 1.5); ctx.restore();
  }
  function pit(p) {
    ellipse(ctx, p.x, p.y - 1, 30, 7, 0, '#2a3d33'); ellipse(ctx, p.x, p.y - 3, 24, 4, 0, p.plant ? '#4d5a41' : '#1b2a25');
    if (!p.plant) for (let i = 0; i < 4; i++) circle(ctx, p.x - 15 + i * 10, p.y - 6 - (i % 2) * 2, 1.5, '#6f7d5a');
  }
  function seed(o, t) {
    ctx.save(); ctx.translate(o.x, o.y); glow(ctx, 0, 0, 26, '#e1c68a22');
    if (loaded('seed')) { ctx.restore(); return sprite('seed', o.x, o.y + 9, 18, 1); }
    ellipse(ctx, 0, 0, 7, 10, .5, '#b39a5c'); ellipse(ctx, -1.5, -2, 3, 5, .5, '#e6d39a'); line(ctx, [[3, -7], [6, -12 + Math.sin(t * .004)]], '#9fbf7f', 1.5);
    ctx.restore();
  }
  function flower(o, targeted, t, reduced) {
    const h = o.height, x = o.x, y = o.base, { growTicks, matureTicks, witherTicks } = meta.plant;
    timeRing(x, y - h / 2, Math.max(22, h / 2 + 12), o, t);
    let i = 0; while (i < GROWTH.length - 2 && h >= GROWTH[i + 1][1]) i++;
    const [a, from] = GROWTH[i], [b, to] = GROWTH[i + 1], p = Math.min(1, (h - from) / (to - from));
    if (p < 1) morph(a, b, p, x, y, a === 'seed' ? lerp(14, to, smooth(p)) : h);
    else if (o.withered) morph('bloom', 'wilted', (o.age - growTicks - matureTicks) / (witherTicks * .3), x, y, h);
    else sprite('bloom', x, y, h, 1);
    if (targeted) { circle(ctx, x, y - h - 16, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, x, y - h - 16, 5, gold); }
  }
  function plant(o, targeted, t, reduced) {
    if (loaded('seed', 'bloom', 'wilted')) return flower(o, targeted, t, reduced);
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
    line(ctx, [[o.x1 + 6, o.y + 26], [o.x2 + o.w - 6, o.y + 26]], '#b6bea133', 1);
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
  function enemy(o, targeted, t, reduced) {
    const b = enemyBox(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2, f = lifeFraction(o);
    ctx.save(); ctx.globalAlpha = f > .9 ? 1 - (f - .9) / .1 * .6 : 1;
    timeRing(cx, cy, Math.max(b.w, b.h) / 2 + 12, o, t);
    const charge = attackCharge(o);
    if (charge > 0) { glow(ctx, cx, cy, Math.max(b.w, b.h) * (.8 + charge * .6), `rgba(255, 110, 80, ${.15 + .35 * charge})`); if (!reduced) ctx.translate(Math.sin(t * .08) * 2.5 * charge, 0); }
    const ice = o.frozen ? '#bceef0' : null;
    if (o.kind === 'guard') {
      ctx.fillStyle = '#3d4f58'; ctx.beginPath(); ctx.roundRect(b.x, b.y + 6, b.w, b.h - 6, 8); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(b.x + 8 + i * 12, b.y + 7); ctx.lineTo(b.x + 12 + i * 12, b.y); ctx.lineTo(b.x + 16 + i * 12, b.y + 7); ctx.fill(); }
      const eye = cx + o.dir * 9; if (!o.frozen) glow(ctx, eye, b.y + 20, o.chasing ? 22 : 14, '#ef8a5a55'); circle(ctx, eye, b.y + 20, 4, o.frozen ? '#9fc8c8' : o.chasing ? '#ffb27a' : '#e8875a');
    }
    if (o.kind === 'lantern') {
      line(ctx, [[cx, b.y - 8], [cx, b.y + 2]], '#8a7a52', 1.5); if (!o.frozen) glow(ctx, cx, cy, 40, '#f2c46a44');
      ellipse(ctx, cx, cy, b.w / 2, b.h / 2, 0, o.frozen ? '#c9d9c8' : '#e6b25a'); for (const dx of [-8, 8]) line(ctx, [[cx + dx, b.y + 4], [cx + dx * 1.3, cy], [cx + dx, b.y + b.h - 4]], '#b5853f88', 1);
      circle(ctx, cx - 7, cy - 2, 3, '#3b2a1c'); circle(ctx, cx + 7, cy - 2, 3, '#3b2a1c'); ellipse(ctx, cx, cy + 9, 5, o.chasing ? 4 : 2, 0, '#3b2a1c');
    }
    if (o.kind === 'launcher') {
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
    if (ice) { ctx.strokeStyle = ice; ctx.lineWidth = 1.5; ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); for (let i = 0; i < 4; i++) star(ctx, b.x + (i % 2 ? b.w + 4 : -4), b.y + (i < 2 ? -4 : b.h + 4), 2, '#c9f3ef'); }
    ctx.restore();
    if (targeted) { const a = Math.max(b.w, b.h) / 2 + 8; ctx.strokeStyle = cyan; ctx.lineWidth = 1.5; for (const [x, y] of [[-a, -a], [a, -a], [-a, a], [a, a]]) line(ctx, [[cx + x, cy + y - Math.sign(y) * 8], [cx + x, cy + y], [cx + x - Math.sign(x) * 8, cy + y]], gold); }
  }
  function door(state, t) {
    const x = state.exit.x, y = state.exit.y; const ready = state.needs.every(k => state.flags[k]);
    glow(ctx, x, y - 60, 110, ready ? '#dce2b73c' : '#a7c4ba11'); arch(ctx, x - 38, y - 107, 76, 107, '#d2c89c', 7); arch(ctx, x - 30, y - 99, 60, 99, '#a8b6a281', 1); line(ctx, [[x - 43, y], [x + 43, y]], '#e7d8a8', 3);
    ctx.save(); ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 30, y - 69); ctx.arc(x, y - 69, 30, Math.PI, 0); ctx.lineTo(x + 30, y); ctx.clip(); const g = ctx.createLinearGradient(x, y - 100, x, y); g.addColorStop(0, ready ? '#d5dfbd99' : '#497c7d33'); g.addColorStop(1, '#9ccac511'); ctx.fillStyle = g; ctx.fillRect(x - 30, y - 110, 60, 115);
    for (let i = 0; i < 9; i++) { const yy = y - ((t * .015 + i * 13) % 110); star(ctx, x + Math.sin(i * 2.2) * 19, yy, ready ? 2 : 1, ready ? '#f1e5b3bb' : '#b7d4ba44'); }
    ctx.restore(); circle(ctx, x, y - 67, 19, null, ready ? '#e4dbaf' : '#8aa89b88'); circle(ctx, x + 8, y - 73, 16, '#2c5b5c');
    ctx.font = '9px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = ready ? gold : '#9fb8a6'; ctx.fillText(ready ? S.gateOpen : S.gateClosed, x, y - 126);
  }
  function label(x, y, text, color = cyan) {
    ctx.font = '10px "Segoe UI",sans-serif'; const w = ctx.measureText(text).width + 24; ctx.fillStyle = '#0a3037e8'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 25, 5); ctx.fill(); ctx.strokeStyle = color + '55'; ctx.lineWidth = 1; ctx.stroke(); ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, x, y + 4);
  }
  function draw(state, time, options = {}) {
    resize();
    const dt = lastTime === null ? 0 : Math.min(.05, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (!options.paused && !options.reduced) visualTime += dt * 1000;
    const t = options.reduced ? 0 : visualTime;
    transform = camera.update(state, { width: frameWidth, height: frameHeight, dt, mode: options.mode, reduced: options.reduced, paused: options.paused, sceneKey: options.sceneKey, resetCamera: lastReset !== options.cameraReset });
    if (options.paused && entryProgress < 1) {
      const fit = Math.min(frameWidth / state.width, frameHeight / state.height);
      const progress = entryProgress * entryProgress * (3 - 2 * entryProgress);
      transform = { ...transform, scale: fit + (transform.scale - fit) * progress,
        offsetX: (frameWidth - state.width * fit) / 2 * (1 - progress) + transform.offsetX * progress,
        offsetY: (frameHeight - state.height * fit) / 2 * (1 - progress) + transform.offsetY * progress };
    }
    lastReset = options.cameraReset;
    effects.update(state, { dt, reduced: options.reduced, paused: options.paused && state.status !== 'won', sceneKey: options.sceneKey });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8cb7a7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(currentDpr * transform.scale, 0, 0, currentDpr * transform.scale, currentDpr * transform.offsetX, currentDpr * transform.offsetY);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, state.width, state.height); ctx.clip();
    ctx.drawImage(background, 0, 0);
    ctx.save(); ctx.translate(780, 158); ctx.rotate(t * .00003); line(ctx, [[0, 9], [0, -62]], '#d8c99777', 2); line(ctx, [[-28, 0], [8, 0]], '#d8c99777', 2); circle(ctx, 0, 0, 3, '#cfc7a1'); ctx.restore();
    for (const p of state.platforms) platform(p);
    const target = options.target;
    // Touch: bracket every object the active character can reach (what a tap would act on).
    const marked = o => options.tappable ? options.tappable.has(o.id) : o.id === target;
    for (const p of state.pits) pit(p);
    for (const cp of state.checkpoints ?? []) checkpoint(cp, cp.id === state.checkpoint, t);
    for (const o of state.objects) if (o.kind === 'mover') mover(o, marked(o), t);
    for (const o of state.objects) if (o.kind === 'plant') plant(o, marked(o), t, options.reduced);
    door(state, t);
    for (const shard of state.shards) if (!shard.taken) { const yy = shard.y + Math.sin(t * .002 + shard.id) * 5; glow(ctx, shard.x, yy, 40, '#e7d2a51b'); ctx.save(); ctx.translate(shard.x, yy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e2d194'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = '#f4e7b477'; ctx.strokeRect(-10, -10, 20, 20); ctx.restore(); }
    for (const o of state.objects) if (o.kind === 'crate' && o.held === null) crate(o, options.tappable ? marked(o) : o.id === target && state.active === 0, t);
    for (const o of state.objects) if (o.kind === 'seed' && o.held === null) seed(o, t);
    const flying = o => !o.frozen && ['dart', 'orb', 'lantern'].includes(o.kind);
    for (const o of state.objects) if (isEnemy(o) && !flying(o)) enemy(o, marked(o), t, options.reduced);
    for (const actorState of state.actors) {
      const inv = actorState.invuln > 0;
      if (inv && !options.reduced && !options.paused && Math.floor(state.tick / 4) % 2) continue;
      if (inv && options.reduced) ctx.globalAlpha = .5;
      actor(actorState, actorState.id, actorState.id === state.active, actorState.animation && !options.reduced ? state.tick * 1000 / 60 : t); ctx.globalAlpha = 1;
    }
    for (const o of state.objects) if (o.held !== undefined && o.held !== null) o.kind === 'crate' ? crate(o, false, t) : seed(o, t);
    for (const o of state.objects) if (isEnemy(o) && flying(o)) enemy(o, marked(o), t, options.reduced);
    if (loaded('petals')) for (const e of state.events) if (e.kind === 'vanish' && e.plant) {
      const age = state.tick - e.tick; if (age < 0 || age > 60) continue;
      sprite('petals', e.x, Math.min(e.base, e.y + age * 4), 18, 1 - age / 60);
    }
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
      ctx.fillStyle = { ambient: '#eef5d4a6', dust: '#f8ebc8a6', crystal: '#c8fcff', leaf: '#e6dc9f', spark: '#fff4b5' }[kind];
      ctx.fill();
    }
    if (options.reduced) for (const e of state.events) {
      if (state.tick - e.tick < 12 && ['freeze', 'unfreeze', 'wake', 'grow', 'plant', 'shard', 'win', 'hit', 'checkpoint', 'strike'].includes(e.kind)) circle(ctx, e.x, e.y, 22, null, e.kind === 'hit' ? '#ffb3a1' : e.kind === 'strike' ? '#ff8a6a' : ['freeze', 'unfreeze'].includes(e.kind) ? cyan : gold, 2);
    }
    // Touch feedback: a pulse on the tapped object; an out-of-reach tap also shows the reach ring.
    if (options.tap && options.tap.age < 1) {
      const { x, y, ok, ring, age } = options.tap;
      ctx.save(); ctx.globalAlpha = 1 - age;
      circle(ctx, x, y, 18 + age * 28, null, ok ? (state.active ? gold : cyan) : '#f1a58f', 2.5);
      const carrier = ring !== null && state.actors[ring];
      if (carrier) { ctx.setLineDash([12, 9]); circle(ctx, carrier.x, carrier.y, meta.controls.range, '#f4e7b40c', '#f4e7b4c0', 2); ctx.setLineDash([]); }
      ctx.restore();
    }
    const selected = state.objects.find(o => o.id === target);
    if (state.status === 'playing' && selected) {
      const top = isEnemy(selected) ? enemyBox(selected).y - 26 : selected.kind === 'plant' ? selected.base - selected.height - 53 : selected.kind === 'mover' ? selected.y - 30 : selected.y - 62;
      const x = selected.kind === 'mover' ? selected.x + selected.w / 2 : selected.x;
      const words = options.touch ? S.tapLabels : { freeze: S.targetFreeze, release: S.targetRelease, wake: S.targetWake, hasten: S.targetHasten, max: S.targetMax };
      if (state.active === 0) label(x, top, selected.frozen ? words.release : words.freeze);
      else if (selected.frozen) label(x, top, words.release, gold);
      else if (selected.speed >= meta.time.maxSpeed) label(x, top, words.max, muted);
      else label(x, top, selected.speed ? words.hasten : words.wake, gold);
    }
    ctx.restore();
  }
  return { setEntryProgress(value) { entryProgress = value; },
    portrait(which) {
      const width = canvas.clientWidth || canvas.width || 120, height = canvas.clientHeight || canvas.height || 120;
      canvas.width = Math.round(width * Math.min(window.devicePixelRatio || 1, 2)); canvas.height = Math.round(height * Math.min(window.devicePixelRatio || 1, 2));
      const ratio = Math.min(canvas.width / 100, canvas.height / 110);
      ctx.setTransform(ratio, 0, 0, ratio, canvas.width / 2, canvas.height * .88); ctx.clearRect(-100, -150, 200, 200);
      actor({ x: 0, y: 0, facing: 1, grounded: true, move: 0 }, which, false, 0);
    },
    draw,
    worldPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return transform ? worldPoint(transform, clientX - rect.left, clientY - rect.top) : null;
    },
    inspect: () => ({ camera: transform && { ...transform }, particles: effects.count, visualTime }),
  };
}

export function drawCharacterPortrait(canvas, which) {
  createRenderer(canvas, {}).portrait(which);
}
