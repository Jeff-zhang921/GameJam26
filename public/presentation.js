const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const blend = (from, to, dt, tau) => from + (to - from) * (1 - Math.exp(-dt / tau));
const boundedCenter = (center, view, world) => view >= world ? world / 2 : clamp(center, view / 2, world - view / 2);
const deadzoneTarget = (center, target, radius) => center + Math.sign(target - center) * Math.max(0, Math.abs(target - center) - radius);

export function createCamera() {
  const camera = { scale: 1, offsetX: 0, offsetY: 0, x: 640, y: 320 };
  let initialized = false, previousScene, previousSize;
  return {
    update(state, { width, height, dt = 0, reduced = false, paused = false, sceneKey, resetCamera = false, bottomInset = 0 }) {
      const worldWidth = state.width ?? 1280, worldHeight = state.height ?? 640;
      const actor = state.actors[state.active];
      // A fixed scale for this viewport and courtyard. Only this client's active traveller can move the view.
      const fit = Math.min(width / Math.min(1280, worldWidth), height / worldHeight);
      camera.scale = Math.max(fit * 1.2, width / worldWidth, height / worldHeight);
      const size = `${width}:${height}:${worldWidth}:${worldHeight}`;
      const reset = !initialized || sceneKey !== previousScene || resetCamera || size !== previousSize;
      const targetX = actor.x + actor.facing * 60, targetY = actor.y - 100;
      if (reset) { camera.x = targetX; camera.y = targetY; }
      else if (!paused) {
        const x = deadzoneTarget(camera.x, targetX, 100), y = deadzoneTarget(camera.y, targetY, 60);
        camera.x = reduced ? x : blend(camera.x, x, dt, .18);
        camera.y = reduced ? y : blend(camera.y, y, dt, .28);
      }
      const halfWidth = width / camera.scale / 2, halfHeight = height / camera.scale / 2;
      if (!paused || reset) {
        camera.x = boundedCenter(camera.x, halfWidth * 2, worldWidth);
        camera.y = boundedCenter(camera.y, halfHeight * 2, worldHeight);
        // Move the camera, never zoom out, to keep the whole sprite clear of the HUD and touch buttons.
        const bottom = Math.max(20, Math.min(bottomInset + 12, height * .55)) / camera.scale;
        const top = 40 / camera.scale;
        camera.x = boundedCenter(clamp(camera.x, actor.x - halfWidth + 30, actor.x + halfWidth - 30), halfWidth * 2, worldWidth);
        camera.y = clamp(camera.y, actor.y - halfHeight + bottom, actor.y - 84 + halfHeight - top);
      }
      camera.offsetX = width / 2 - camera.x * camera.scale;
      camera.offsetY = height / 2 - camera.y * camera.scale;
      initialized = true; previousScene = sceneKey; previousSize = size;
      return camera;
    },
  };
}

export function worldPoint(camera, x, y) {
  return { x: (x - camera.offsetX) / camera.scale, y: (y - camera.offsetY) / camera.scale };
}

const noise = seed => { const value = Math.sin(seed * 12.9898) * 43758.5453; return value - Math.floor(value); };
const effects = {
  jump: { kind: 'dust', color: '#efe6c3', count: 10, speed: 42, life: .42 },
  land: { kind: 'dust', color: '#e8deb6', count: 14, speed: 65, life: .48 },
  freeze: { kind: 'crystal', color: '#efe0b0', count: 20, speed: 95, life: .8 },
  unfreeze: { kind: 'crystal', color: '#d9c896', count: 18, speed: 85, life: .65 },
  plant: { kind: 'leaf', color: '#c9dc91', count: 14, speed: 58, life: .95 },
  grow: { kind: 'leaf', color: '#cbdc91', count: 16, speed: 65, life: .95 },
  wake: { kind: 'leaf', color: '#e3d590', count: 20, speed: 76, life: 1.1 },
  vanish: { kind: 'leaf', color: '#c8ad76', count: 18, speed: 48, life: .85 },
  shard: { kind: 'spark', color: '#fff2a9', count: 22, speed: 100, life: .8 },
  win: { kind: 'spark', color: '#fff2b8', count: 24, speed: 130, life: 1.25 },
  hit: { kind: 'spark', color: '#ffb3a1', count: 20, speed: 110, life: .7 },
  strike: { kind: 'spark', color: '#ff9b7a', count: 16, speed: 120, life: .4 },
  guardStrike: { kind: 'dust', color: '#d8c495', count: 16, speed: 85, life: .4 },
  checkpoint: { kind: 'spark', color: '#f4e2a6', count: 16, speed: 70, life: .9 },
  pop: { kind: 'dust', color: '#e8deb6', count: 8, speed: 40, life: .35 },
  spawn: { kind: 'dust', color: '#c9b58a', count: 10, speed: 45, life: .5 },
};

export function createParticles() {
  const particles = Array.from({ length: 256 }, () => ({ x: 0, y: 0, size: 0, life: 0, maxLife: 1, vx: 0, vy: 0, color: '', kind: '', angle: 0 }));
  let previousScene, initialized = false, seenEvent = 0, next = 24;
  function clear() { for (const particle of particles) particle.life = 0; next = 24; }
  function latest(state) { let id = 0; for (const event of state.events) id = Math.max(id, event.id); return id; }
  return {
    particles,
    get count() { let count = 0; for (const particle of particles) if (particle.life > 0) count++; return count; },
    clear,
    update(state, { dt = 0, paused = false, reduced = false, sceneKey }) {
      const width = state.width ?? 1280, height = state.height ?? 640;
      if (!initialized || previousScene !== sceneKey) {
        clear(); seenEvent = latest(state); previousScene = sceneKey; initialized = true;
      }
      if (reduced) { clear(); seenEvent = latest(state); return particles; }
      if (paused) return particles;
      for (let i = 0; i < 24; i++) {
        const p = particles[i];
        if (!p.life) {
          p.x = noise(i + 1) * width; p.y = 80 + noise(i + 100) * (height - 160);
          p.vx = 3 + noise(i + 200) * 5; p.vy = -2 - noise(i + 300) * 4;
          p.life = p.maxLife = 1; p.size = i % 4 === 0 ? 1.7 : .8;
          p.kind = 'ambient'; p.color = '#e4f0c8'; p.angle = i;
        }
        p.x = (p.x + p.vx * dt + width) % width;
        p.y = (p.y + p.vy * dt + height) % height;
      }
      for (let i = 24; i < particles.length; i++) {
        const p = particles[i]; if (p.life <= 0) continue;
        const elapsed = Math.min(dt, p.life);
        p.life = Math.max(0, p.life - dt); p.x += p.vx * elapsed;
        const gravity = p.kind === 'dust' ? 75 : p.kind === 'leaf' ? 30 : 45;
        p.y += p.vy * elapsed + .5 * gravity * elapsed * elapsed;
        p.vy += gravity * elapsed; p.angle += elapsed * (p.kind === 'leaf' ? 3 : 1.5);
      }
      for (const event of state.events) {
        if (event.id <= seenEvent) continue;
        seenEvent = event.id;
        const effect = effects[event.kind === 'strike' && event.sourceKind === 'guard' ? 'guardStrike' : event.kind];
        if (!effect || state.tick - event.tick > 45) continue;
        for (let i = 0; i < effect.count; i++) {
          const p = particles[next]; next = next === 255 ? 24 : next + 1;
          const seed = event.id * 97 + i, angle = noise(seed + 1) * Math.PI * 2;
          const speed = effect.speed * (.35 + noise(seed + 2) * .65);
          p.x = event.x; p.y = event.y; p.kind = effect.kind; p.color = effect.color;
          p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed - effect.speed * .35;
          if (effect.kind === 'dust') { p.vx *= 1.3; p.vy = -Math.abs(p.vy) * .5; }
          p.life = p.maxLife = effect.life * (.7 + noise(seed + 3) * .3);
          p.size = effect.kind === 'leaf' ? 3 + noise(seed + 4) * 2 : 1.2 + noise(seed + 4) * 2.1;
          p.angle = angle;
        }
      }
      return particles;
    },
  };
}
