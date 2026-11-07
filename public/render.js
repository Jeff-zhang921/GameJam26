export function createRenderer(canvas, S) {
  const ctx = canvas.getContext('2d');
  const background = document.createElement('canvas'); background.width = 1280; background.height = 640;
  const b = background.getContext('2d');
  let scale = 1, offsetX = 0, offsetY = 0, currentDpr = 1;
  const cyan = '#a1e3e5', gold = '#e1c68a';
  function line(c, points, color, width = 1) { c.beginPath(); c.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function circle(c, x, y, r, fill, stroke, width = 1) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); } }
  function ellipse(c, x, y, rx, ry, angle, color) { c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), angle, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  function arch(c, x, y, w, h, color, width = 1) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
  function star(c, x, y, size, color) { c.beginPath(); c.moveTo(x, y - size); c.quadraticCurveTo(x + 1, y - 1, x + size, y); c.quadraticCurveTo(x + 1, y + 1, x, y + size); c.quadraticCurveTo(x - 1, y + 1, x - size, y); c.quadraticCurveTo(x - 1, y - 1, x, y - size); c.fillStyle = color; c.fill(); }
  function glow(c, x, y, r, color) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, '#a4dfdf00'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function buildBackground() {
    const sky = b.createLinearGradient(0, 0, 0, 640); sky.addColorStop(0, '#12333c'); sky.addColorStop(.6, '#286065'); sky.addColorStop(1, '#0b3a42'); b.fillStyle = sky; b.fillRect(0, 0, 1280, 640);
    glow(b, 780, 130, 390, '#bbd2ad28');
    for (let i = 0; i < 80; i++) { const x = (i * 193.7) % 1280, y = (i * 87.9) % 380; circle(b, x, y, i % 4 === 0 ? 1.2 : .6, '#cad4b461'); }
    b.fillStyle = '#1a494f'; b.beginPath(); b.moveTo(0, 460); for (let x = 0; x <= 1300; x += 30) b.lineTo(x, 370 + Math.sin(x * .008) * 34 + Math.cos(x * .019) * 16); b.lineTo(1280, 640); b.lineTo(0, 640); b.fill();
    for (let i = 0; i < 8; i++) {
      const x = i * 180 - 50; arch(b, x, 135 + (i % 2) * 25, 150, 410, '#a2baaa17', 11); arch(b, x + 9, 144 + (i % 2) * 25, 132, 400, '#d6d9bb19', 1); line(b, [[x + 74, 151], [x + 74, 470]], '#d3d6b510');
    }
    b.save(); b.translate(780, 158);
    circle(b, 0, 0, 116, '#93bbae10', '#c6c8a25a', 1.3); circle(b, 0, 0, 108, null, '#d5cda63b'); circle(b, 0, 0, 92, null, '#c5d0af3f'); circle(b, 0, 0, 75, '#9bb4a80c', '#cfcea53d');
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r = i % 5 === 0 ? 97 : 102; line(b, [[Math.sin(a) * r, -Math.cos(a) * r], [Math.sin(a) * 107, -Math.cos(a) * 107]], '#c9c99a7a', i % 5 === 0 ? 1.5 : .7); }
    b.font = '12px Georgia'; b.textAlign = 'center'; b.fillStyle = '#d3d2b693'; ['XII', 'III', 'VI', 'IX'].forEach((s, i) => b.fillText(s, Math.sin(i * Math.PI / 2) * 84, -Math.cos(i * Math.PI / 2) * 84 + 4));
    circle(b, -22, -14, 47, '#dddcc395'); circle(b, -3, -25, 43, '#31595c'); star(b, 26, 26, 7, '#ddd4a8b0'); circle(b, 0, 0, 17, null, '#d5cba15a');
    b.restore();
    for (let i = 0; i < 5; i++) { const x = 80 + i * 265; line(b, [[x, 0], [x, 230 + i % 2 * 50]], '#bdbf9227'); const y = 240 + i % 2 * 50; glow(b, x, y, 45, '#d8bc7d22'); b.strokeStyle = '#b8ac714a'; b.strokeRect(x - 8, y - 13, 16, 27); circle(b, x, y, 4, '#d1bc7b87'); line(b, [[x - 10, y - 13], [x, y - 22], [x + 10, y - 13]], '#b8ac714a'); }
    for (let side = 0; side < 2; side++) {
      b.save(); if (side) { b.translate(1280, 0); b.scale(-1, 1); }
      b.fillStyle = '#0b343baa'; b.fillRect(0, 0, 33, 640); line(b, [[31, 0], [31, 640]], '#b6bea136', 2);
      b.beginPath(); b.moveTo(23, 0); b.bezierCurveTo(55, 150, 8, 340, 86, 460); b.strokeStyle = '#76937a77'; b.lineWidth = 3; b.stroke();
      for (let i = 0; i < 16; i++) { const y = i * 29 + 25, x = 28 + Math.sin(i * .5) * 14 + i * 1.5; ellipse(b, x + (i % 2 ? 15 : -12), y, 17, 6, i % 2 ? -.5 : .6, '#456f5d99'); }
      b.restore();
    }
    b.fillStyle = '#09333d5a'; b.fillRect(0, 570, 1280, 70);
    for (let i = 0; i < 60; i++) { const x = (i * 139.1) % 1280, y = 570 + (i * 23.3) % 70; line(b, [[x, y], [x + 15 + i % 5 * 9, y]], '#97bcb126', .7); }
  }
  buildBackground();
  function resize() {
    const { width, height } = canvas.getBoundingClientRect(); currentDpr = Math.min(window.devicePixelRatio || 1, 1.75);
    if (canvas.width !== Math.round(width * currentDpr) || canvas.height !== Math.round(height * currentDpr)) { canvas.width = Math.round(width * currentDpr); canvas.height = Math.round(height * currentDpr); }
    scale = Math.min(width / 1280, height / 640); offsetX = (width - 1280 * scale) / 2; offsetY = (height - 640 * scale) / 2;
    ctx.setTransform(currentDpr * scale, 0, 0, currentDpr * scale, currentDpr * offsetX, currentDpr * offsetY);
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
    const color = which === 0 ? cyan : gold;
    ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = ghost ? .32 : 1;
    if (!ghost) { ellipse(ctx, 0, 2, 23, 5, 0, '#001f2780'); if (active) { ellipse(ctx, 0, 2, 25, 7, 0, which === 0 ? '#a1e3e51b' : '#e1c68a1b'); ctx.beginPath(); ctx.ellipse(0, 2, 25, 7, 0, 0, Math.PI * 2); ctx.strokeStyle = color + '80'; ctx.lineWidth = 1; ctx.stroke(); } }
    const sway = p.grounded && p.move ? Math.sin(t * .018) * 2 : Math.sin(t * .003) * .7;
    line(ctx, [[-7, -9], [-8 + sway, -1]], '#c4d1c5', 5); line(ctx, [[7, -9], [7 - sway, -1]], '#9dafac', 5);
    ctx.beginPath(); ctx.moveTo(-11, -37); ctx.bezierCurveTo(-15, -25, -18 - sway, -12, -19, -7); ctx.quadraticCurveTo(0, -1, 19, -7); ctx.lineTo(11, -38); ctx.closePath(); const cloth = ctx.createLinearGradient(-15, -30, 17, -12); cloth.addColorStop(0, '#ece9cc'); cloth.addColorStop(.5, '#cdd7c4'); cloth.addColorStop(1, '#8ea79e'); ctx.fillStyle = cloth; ctx.fill();
    line(ctx, [[-3, -34], [-5, -7]], '#718f896b'); line(ctx, [[7, -31], [10, -8]], '#eef1d677');
    ctx.beginPath(); ctx.moveTo(-13, -36); ctx.quadraticCurveTo(-16, -58, -1, -62); ctx.quadraticCurveTo(15, -59, 14, -38); ctx.quadraticCurveTo(1, -31, -13, -36); ctx.fillStyle = '#e6e8cd'; ctx.fill();
    ellipse(ctx, p.facing * 2, -46, 9, 11, 0, '#284e51'); circle(ctx, p.facing * 4 - 2, -47, 1.1, '#f2e9bc'); circle(ctx, p.facing * 4 + 3, -47, 1.1, '#f2e9bc');
    ctx.fillStyle = color; ctx.fillRect(-12, -36, 25, 5); ctx.beginPath(); ctx.moveTo(7, -34); ctx.quadraticCurveTo(20 + sway, -29, 26 + sway * 2, -36); ctx.lineTo(23 + sway, -25); ctx.quadraticCurveTo(15, -23, 6, -29); ctx.fill();
    const side = p.facing; line(ctx, [[side * 16, -34], [side * 23, -25]], '#cbd8c7', 5); line(ctx, [[side * 24, -49], [side * 24, -1]], '#b7a171', 2.5);
    if (which === 0) { circle(ctx, side * 24, -53, 6, null, color, 2); circle(ctx, side * 27, -55, 4, '#21464b'); } else { line(ctx, [[side * 24, -48], [side * 19, -57]], color, 1.5); ellipse(ctx, side * 20, -57, 5, 2.5, .7, color); ellipse(ctx, side * 28, -54, 5, 2.5, -.7, color); }
    if (active && !ghost) { ctx.globalAlpha = .8; star(ctx, 0, -78 + Math.sin(t * .003) * 2, 4, color); }
    ctx.restore();
  }
  function crate(c, targeted, t) {
    ctx.save(); ctx.translate(c.x, c.y); const size = 24;
    if (c.frozen) { glow(ctx, 0, 0, 70, '#9de3e527'); circle(ctx, 0, 0, 41 + Math.sin(t * .002) * 2, null, '#a1e3e570'); circle(ctx, 0, 0, 34, null, '#a1e3e52e'); }
    ctx.fillStyle = '#61736a'; ctx.fillRect(-size, -size, 48, 48); ctx.strokeStyle = '#d4c99e'; ctx.lineWidth = 3; ctx.strokeRect(-size, -size, 48, 48); ctx.strokeStyle = '#243f3d'; ctx.lineWidth = 2; ctx.strokeRect(-18, -18, 36, 36); line(ctx, [[-20, -20], [20, 20]], '#c7b887', 3); line(ctx, [[20, -20], [-20, 20]], '#c7b887', 3);
    circle(ctx, 0, 0, 11, '#183e42', c.frozen ? cyan : '#d6bc82', 2); circle(ctx, 0, 0, 7, null, '#b6d7cd7a'); line(ctx, [[0, -5], [0, 0], [4, 2]], cyan);
    for (const x of [-21, 21]) for (const y of [-21, 21]) circle(ctx, x, y, 2, '#ede3b7');
    if (c.frozen) { line(ctx, [[-34, -7], [-31, -28], [-9, -35]], '#bceef0'); line(ctx, [[34, 9], [30, 29], [10, 35]], '#bceef0'); for (let i = 0; i < 5; i++) star(ctx, Math.sin(i * 5.2) * 40, Math.cos(i * 4.6) * 40, 2, '#c9f3ef'); }
    if (targeted) { const a = 32; ctx.strokeStyle = cyan; ctx.lineWidth = 1.5; for (const [x, y] of [[-a, -a], [a, -a], [-a, a], [a, a]]) line(ctx, [[x, y - Math.sign(y) * 8], [x, y], [x - Math.sign(x) * 8, y]], cyan); }
    ctx.restore();
  }
  function tree(tree, targeted, t) {
    const h = tree.height; const x = tree.x, y = tree.base; const dead = tree.age === 4;
    if (h < 36 && !dead) { line(ctx, [[x, y], [x, y - h]], '#c5bb80', 3); ellipse(ctx, x - 10, y - h + 5, 13, 5, .6, '#b7bd80'); ellipse(ctx, x + 10, y - h, 13, 5, -.6, '#d2c483'); circle(ctx, x, y - h + 2, 3, gold); }
    else {
      const trunkTop = y - h + (dead ? -35 : 28);
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.bezierCurveTo(x - 8, y - h * .45, x - 18, trunkTop + 30, x - 3, trunkTop); ctx.lineTo(x + 8, trunkTop); ctx.bezierCurveTo(x + 2, y - h * .45, x + 16, y - 20, x + 21, y); ctx.fillStyle = dead ? '#7c7c63' : '#a8a276'; ctx.fill();
      line(ctx, [[x - 3, y], [x + 2, y - h * .4], [x - 4, trunkTop]], '#d3bd836b', 1.5);
      for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1; const yy = y - h * (.35 + i * .075); const len = 25 + i * 6; ctx.beginPath(); ctx.moveTo(x, yy + 25); ctx.quadraticCurveTo(x + side * len * .5, yy, x + side * len, yy - 22); ctx.strokeStyle = dead ? '#949277' : '#ada875'; ctx.lineWidth = 5 - i * .3; ctx.stroke(); }
      if (!dead) {
        glow(ctx, x, y - h + 15, 100, '#d3bd7920');
        for (let i = 0; i < 67; i++) { const a = i * 2.399; const r = Math.sqrt(i / 67); const xx = x + Math.cos(a) * r * 77, yy = y - h + 12 + Math.sin(a) * r * 34; ellipse(ctx, xx, yy, 9 + i % 5, 4 + i % 3, Math.sin(a) * .7, ['#9dba81', '#bbc58a', '#d5c686', '#7b9c76', '#c6bd79'][i % 5]); }
        line(ctx, [[x - 64, y - h + 3], [x + 64, y - h + 3]], '#efdfac77');
      } else { ellipse(ctx, x, y - 6, 28, 7, 0, '#6a7966'); for (let i = 0; i < 5; i++) ellipse(ctx, x + Math.sin(i * 3) * 43, y - 4, 5, 2, i, '#b3a475'); }
    }
    if (targeted) { circle(ctx, x, y - h - 16, 13, '#d7bd7d10', '#e1c68a70'); star(ctx, x, y - h - 16, 5, gold); }
    ctx.font = '10px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cbd3b296'; ctx.fillText(S.treeStages[tree.age], x, y + 31);
  }
  function door(state, t) {
    const x = state.exit.x, y = state.exit.y; const ready = state.needs.every(k => state.flags[k]) && state.plates.every(p => p.lit);
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
    resize(); const t = options.reduced ? 0 : time; ctx.clearRect(-100, -100, 1480, 840); ctx.drawImage(background, 0, 0);
    ctx.save(); ctx.translate(780, 158); ctx.rotate(t * .00003); line(ctx, [[0, 9], [0, -62]], '#d8c99777', 2); line(ctx, [[-28, 0], [8, 0]], '#d8c99777', 2); circle(ctx, 0, 0, 3, '#cfc7a1'); ctx.restore();
    for (let i = 0; i < 22; i++) { const x = ((i * 137.5 + t * .006 * (i % 3 + 1)) % 1240) + 20; const y = 350 + Math.sin(i * 6 + t * .0006) * 145; circle(ctx, x, y, i % 4 === 0 ? 1.5 : .8, i % 4 === 0 ? '#d4d8a28c' : '#b6d4bf4d'); }
    for (const p of state.platforms) platform(p);
    for (const plate of state.plates) {
      ellipse(ctx, plate.x, plate.y - 2, plate.w / 2, 7, 0, '#b8b18b'); ellipse(ctx, plate.x, plate.y - 4, plate.w / 2 - 5, 5, 0, plate.lit ? '#b6dfd7' : '#2b5557');
      if (plate.lit) glow(ctx, plate.x, plate.y - 6, 70, '#b6e8df26'); circle(ctx, plate.x, plate.y - 5, 9, null, '#d6d2a3'); ctx.font = '9px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b5c8b1'; ctx.fillText(S.plate, plate.x, plate.y + 27);
    }
    const p = state.actors[state.active];
    let target = options.target;
    if (!target) { const objects = state.active === 0 ? state.crates.filter(c => c.held === null) : state.trees; let best = 420; for (const object of objects) { const d = Math.hypot(object.x - p.x, (object.base ?? object.y) - p.y); if (d < best) { best = d; target = object.id; } } }
    for (const tr of state.trees) tree(tr, tr.id === target && state.active === 1, t);
    door(state, t);
    for (const shard of state.shards) if (!shard.taken) { const yy = shard.y + Math.sin(t * .002 + shard.id) * 5; glow(ctx, shard.x, yy, 40, '#e7d2a51b'); ctx.save(); ctx.translate(shard.x, yy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e2d194'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = '#f4e7b477'; ctx.strokeRect(-10, -10, 20, 20); ctx.restore(); }
    for (const e of state.echoes) { actor({ ...e, grounded: true, move: 0 }, e.actor, false, 0, true); circle(ctx, e.x, e.y - 29, 42, null, '#b5dddb22'); }
    for (const c of state.crates) if (c.held === null) crate(c, c.id === target && state.active === 0, t);
    for (const actorState of state.actors) actor(actorState, actorState.id, actorState.id === state.active, t);
    for (const c of state.crates) if (c.held !== null) crate(c, false, t);
    for (const e of state.events) { const age = state.tick - e.tick; if (age > 45 || age < 0 || options.reduced) continue; const color = ['grow', 'regrow', 'shard', 'win'].includes(e.kind) ? gold : cyan; ctx.globalAlpha = Math.max(0, 1 - age / 45); circle(ctx, e.x, e.y, 12 + age * 1.8, null, color, 1); for (let i = 0; i < 6; i++) star(ctx, e.x + Math.sin(i * 1.05) * (12 + age), e.y + Math.cos(i * 1.05) * (12 + age), 2, color); ctx.globalAlpha = 1; }
    const selectedCrate = state.crates.find(c => c.id === target && c.held === null); const selectedTree = state.trees.find(tr => tr.id === target);
    if (state.status === 'playing') {
      if (selectedCrate && state.active === 0 && Math.hypot(p.x - selectedCrate.x, p.y - selectedCrate.y) < 420) label(selectedCrate.x, selectedCrate.y - 62, selectedCrate.frozen ? S.targetRelease : S.targetFreeze);
      if (selectedTree && state.active === 1 && Math.hypot(p.x - selectedTree.x, p.y - selectedTree.base) < 420) label(selectedTree.x, selectedTree.base - selectedTree.height - 53, selectedTree.age === 4 ? S.targetDead : S.targetGrow, gold);
    }
  }
  return { draw, worldPoint(clientX, clientY) { const rect = canvas.getBoundingClientRect(); return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale }; } };
}
