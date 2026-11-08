// Cached oak textures on a rectangular double door; only the leaves rotate.
// Native canvas art stays sharp during the camera's passage into the doorway.
export const WOODEN_GATE = { halfWidth: 82, height: 224, outerWidth: 204, outerHeight: 250 };

export function createWoodenGate() {
  const { halfWidth: W, height: H } = WOODEN_GATE;
  let textures;
  function leafTexture(side) {
    const canvas = document.createElement('canvas'); canvas.width = W * 3; canvas.height = H * 3;
    const c = canvas.getContext('2d'); c.scale(3, 3);
    const shade = c.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, '#482a19'); shade.addColorStop(.25, '#895631'); shade.addColorStop(.65, '#734326'); shade.addColorStop(1, '#4b2b18');
    c.fillStyle = shade; c.fillRect(0, 0, W, H);
    for (let plank = 0; plank < 6; plank++) {
      const x = plank * W / 6;
      c.fillStyle = plank % 2 ? '#d6a15d12' : '#21130b1c'; c.fillRect(x, 0, W / 6, H);
      c.strokeStyle = '#24170eaa'; c.lineWidth = .7; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      for (let grain = 0; grain < 6; grain++) {
        const gx = x + 1.5 + grain * 1.9;
        c.beginPath(); c.moveTo(gx, 0);
        for (let y = 0; y <= H; y += 8) c.lineTo(gx + Math.sin(y * .06 + grain + plank * 7 + side) * .7, y);
        c.strokeStyle = grain % 2 ? '#e1ad622b' : '#2d180d3b'; c.lineWidth = .35; c.stroke();
      }
    }
    // Raised frames, worn edges, hand-forged straps and studs.
    for (const [y, h] of [[13, 80], [125, 83]]) {
      c.strokeStyle = '#2c1a0f'; c.lineWidth = 5; c.strokeRect(10, y, W - 20, h);
      c.strokeStyle = '#bd8b4e'; c.lineWidth = .8; c.strokeRect(8, y - 2, W - 16, h + 4);
      c.strokeStyle = '#dca45c55'; c.strokeRect(13, y + 3, W - 26, h - 6);
    }
    for (const y of [8, 105, 213]) {
      const iron = c.createLinearGradient(0, y, 0, y + 8);
      iron.addColorStop(0, '#6b6b57'); iron.addColorStop(.25, '#434b41'); iron.addColorStop(1, '#242e2b');
      c.fillStyle = iron; c.fillRect(1, y, W - 2, 8);
      for (const x of [6, 23, W - 23, W - 6]) {
        c.beginPath(); c.arc(x, y + 4, 1.5, 0, Math.PI * 2); c.fillStyle = '#b5a47b'; c.fill();
        c.beginPath(); c.arc(x - .4, y + 3.5, .5, 0, Math.PI * 2); c.fillStyle = '#e2c98e'; c.fill();
      }
    }
    const handleX = W - 15;
    c.fillStyle = '#303a31'; c.fillRect(handleX - 5, 111, 10, 23);
    c.beginPath(); c.arc(handleX, 122, 5.5, 0, Math.PI * 2); c.strokeStyle = '#c5ab6b'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(handleX, 117, 2, 0, Math.PI * 2); c.fillStyle = '#d4b478'; c.fill();
    return canvas;
  }
  // An affine texture triangle, used in narrow strips to preserve perspective.
  function triangle(c, image, source, target) {
    const [[u0, v0], [u1, v1], [u2, v2]] = source;
    const [[x0, y0], [x1, y1], [x2, y2]] = target;
    const det = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(det) < .001) return;
    const coefficient = values => [
      (values[0] * (v1 - v2) + values[1] * (v2 - v0) + values[2] * (v0 - v1)) / det,
      (values[0] * (u2 - u1) + values[1] * (u0 - u2) + values[2] * (u1 - u0)) / det,
      (values[0] * (u1 * v2 - u2 * v1) + values[1] * (u2 * v0 - u0 * v2) + values[2] * (u0 * v1 - u1 * v0)) / det,
    ];
    const [a, cc, e] = coefficient([x0, x1, x2]), [b, d, f] = coefficient([y0, y1, y2]);
    c.save(); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.clip();
    c.transform(a, b, cc, d, e, f); c.drawImage(image, 0, 0); c.restore();
  }
  function leaf(c, image, side, opening) {
    const hinge = side * W, inward = -side, angle = opening * 1.42;
    if (opening < .0001) {
      c.save(); c.translate(hinge, -H); c.scale(inward, 1); c.drawImage(image, 0, 0, W, H); c.restore(); return;
    }
    const point = (u, v) => {
      const distance = u * Math.sin(angle), perspective = 1 / (1 + distance * .55);
      return [hinge + inward * u * W * Math.cos(angle), -H + v * H * perspective + H * (1 - perspective) * .8];
    };
    for (let i = 0; i < 8; i++) {
      const u0 = i / 8, u1 = (i + 1) / 8, x0 = u0 * image.width, x1 = u1 * image.width;
      const a = point(u0, 0), b = point(u1, 0), cc = point(u1, 1), d = point(u0, 1);
      triangle(c, image, [[x0, 0], [x1, 0], [x1, image.height]], [a, b, cc]);
      triangle(c, image, [[x0, 0], [x1, image.height], [x0, image.height]], [a, cc, d]);
    }
    const top = point(1, 0), bottom = point(1, 1);
    c.beginPath(); c.moveTo(...top); c.lineTo(...bottom); c.strokeStyle = '#301d13'; c.lineWidth = 3; c.stroke();
  }
  return {
    draw(c, exit, { opening = 0, push = 0 } = {}) {
      textures ??= [leafTexture(0), leafTexture(1)];
      c.save(); c.translate(exit.x, exit.y);
      c.fillStyle = '#23342bc9'; c.fillRect(-102, 0, 204, 9);
      const inside = c.createLinearGradient(0, -H, 0, 0);
      inside.addColorStop(0, '#122726'); inside.addColorStop(.65, '#233c33'); inside.addColorStop(1, '#8f885b');
      c.fillStyle = inside; c.fillRect(-W, -H, W * 2, H);
      // A receding floor and warm light make the camera's destination tangible.
      c.strokeStyle = '#dec58a24'; c.lineWidth = .7;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 24, 0); c.lineTo(i * 8, -90); c.stroke(); }
      for (const y of [-4, -18, -36, -60, -90]) { c.beginPath(); c.moveTo(-W, y); c.lineTo(W, y); c.stroke(); }
      for (const side of [-1, 1]) {
        const post = c.createLinearGradient(side * 88 - 9, 0, side * 88 + 9, 0);
        post.addColorStop(0, '#39271a'); post.addColorStop(.35, '#aa7c48'); post.addColorStop(1, '#51402b');
        c.fillStyle = post; c.fillRect(side * 92 - 10, -H - 9, 20, H + 13);
        for (const y of [-H + 9, -H / 2, -10]) {
          c.fillStyle = '#3a4439'; c.fillRect(side * 92 - 11, y, 22, 9);
          c.beginPath(); c.arc(side * 92, y + 4, 2, 0, Math.PI * 2); c.fillStyle = '#b49a68'; c.fill();
        }
      }
      c.fillStyle = '#332719'; c.fillRect(-104, -H - 25, 208, 26);
      c.fillStyle = '#946b3d'; c.fillRect(-101, -H - 23, 202, 17);
      c.fillStyle = '#d5ad665c'; c.fillRect(-101, -H - 23, 202, 2);
      c.fillStyle = '#4b4b35'; c.fillRect(-23, -H - 24, 46, 23);
      c.strokeStyle = '#c3a56e'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-9, -H - 19); c.lineTo(9, -H - 19); c.lineTo(-7, -H - 6); c.lineTo(7, -H - 6); c.closePath(); c.stroke();
      // Both hands brace before the hinge starts moving.
      c.save(); c.translate(0, -Math.sin(push * Math.PI) * .25);
      leaf(c, textures[0], -1, opening); leaf(c, textures[1], 1, opening); c.restore();
      c.fillStyle = '#d7bd87'; c.fillRect(-85, -1, 170, 3);
      c.restore();
    },
  };
}
