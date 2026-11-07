const DURATION = 3000;
const ART = { width: 1600, height: 1000, gateX: 1125, gateY: 657, insideY: 704.5 };
const DOOR = 'M1034 777V632a91 91 0 0 1 182 0v145Z';
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const span = (progress, start, end) => ease((progress - start) / (end - start));

export function entranceTimeline(progress, reduced = false) {
  const p = clamp(progress);
  return {
    lobby: 1 - span(p, 0, .08),
    door: reduced ? 0 : span(p, .10, .74),
    camera: reduced ? 0 : span(p, .18, .97),
    shade: reduced ? 1 : 1 - span(p, .12, .55),
    opacity: 1 - span(p, reduced ? .82 : .90, 1),
  };
}

export function entranceLayout(width, height) {
  const portrait = height > width;
  const scale = portrait ? height * .76 / ART.height : Math.max(width / ART.width, height / ART.height);
  const artWidth = ART.width * scale, artHeight = ART.height * scale;
  return {
    width: artWidth, height: artHeight, scale,
    left: (width - artWidth) * (portrait ? .72 : .68),
    top: portrait ? 0 : (height - artHeight) / 2,
    zoom: Math.max(width / (182 * scale), height / (145 * scale)) * 1.18,
  };
}

export function createEntrance({ reduced, onStart, onFinish, onCancel }) {
  const root = document.createElement('div');
  root.className = 'online-entrance';
  root.dataset.testid = 'online-entrance';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  root.innerHTML = '<div class="entrance-fallback"></div><div class="entrance-camera"></div><div class="entrance-shade"></div>';
  document.body.append(root);
  const camera = root.querySelector('.entrance-camera');
  const shade = root.querySelector('.entrance-shade');
  const fallback = root.querySelector('.entrance-fallback');
  let current = null, leaves = null, layout = null;
  const svgNS = 'http://www.w3.org/2000/svg';
  const make = (name, attributes = {}) => {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };

  function installArt(text) {
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('Invalid conservatory artwork');
    const svg = document.importNode(parsed.documentElement, true);
    for (const node of svg.querySelectorAll('[id]')) node.id = 'entrance-' + node.id;
    for (const node of svg.querySelectorAll('*')) for (const attribute of [...node.attributes]) {
      const value = attribute.value.replaceAll('url(#', 'url(#entrance-');
      node.setAttribute(attribute.name, attribute.localName === 'href' && value.startsWith('#') ? '#entrance-' + value.slice(1) : value);
    }
    const portal = [...svg.querySelectorAll('path')].find(node => node.getAttribute('d') === DOOR);
    if (!portal) throw new Error('Missing conservatory gate');
    const face = [];
    let node = portal;
    for (let i = 0; i < 7; i++, node = node.nextElementSibling) {
      if (!node) throw new Error('Incomplete conservatory gate');
      face.push(node.cloneNode(true));
    }
    const defs = svg.querySelector('defs');
    const mask = make('mask', { id: 'entrance-opening', maskUnits: 'userSpaceOnUse', x: -1600, y: -1000, width: 4800, height: 3000 });
    mask.append(make('rect', { x: -1600, y: -1000, width: 4800, height: 3000, fill: 'white' }), make('path', { d: DOOR, fill: 'black' }));
    const opening = make('clipPath', { id: 'entrance-door-face' });
    opening.append(make('path', { d: DOOR }));
    defs.append(mask, opening);
    const scene = make('g', { mask: 'url(#entrance-opening)' });
    scene.append(make('rect', { x: -1600, y: -1000, width: 4800, height: 3000, fill: '#0a202b' }));
    for (const child of [...svg.children]) if (child !== defs) scene.append(child);
    svg.append(scene);
    leaves = ['left', 'right'].map((side, index) => {
      const clip = make('clipPath', { id: 'entrance-door-' + side });
      clip.append(make('rect', { x: 1034 + index * 91, y: 540, width: 91, height: 238 }));
      defs.append(clip);
      const leaf = make('g', { class: 'entrance-door entrance-door-' + side, 'data-side': side });
      const half = make('g', { 'clip-path': 'url(#entrance-door-' + side + ')' });
      const shape = make('g', { 'clip-path': 'url(#entrance-door-face)' });
      shape.append(make('path', { d: DOOR, fill: '#203a42' }), ...face.map(part => part.cloneNode(true)));
      half.append(shape); leaf.append(half); svg.append(leaf);
      return leaf;
    });
    svg.classList.add('entrance-scene');
    svg.setAttribute('aria-hidden', 'true');
    camera.append(svg);
    fallback.hidden = true;
    root.dataset.art = 'ready';
    if (current) paint();
  }
  fetch('/art/moonlit-conservatory.svg').then(response => {
    if (!response.ok) throw new Error('Conservatory artwork unavailable');
    return response.text();
  }).then(installArt).catch(() => { root.dataset.art = 'fallback'; });

  function measure() {
    layout = entranceLayout(window.innerWidth, window.innerHeight);
    camera.style.width = layout.width + 'px'; camera.style.height = layout.height + 'px';
    camera.style.left = layout.left + 'px'; camera.style.top = layout.top + 'px';
    if (current) paint();
  }
  window.addEventListener('resize', measure);
  measure();

  function paint() {
    const timeline = entranceTimeline(current.progress, current.reduced);
    root.dataset.progress = current.progress.toFixed(3);
    root.dataset.motion = current.reduced ? 'reduced' : 'full';
    root.style.opacity = timeline.opacity;
    document.body.style.setProperty('--entrance-lobby-opacity', timeline.lobby);
    document.body.style.setProperty('--entrance-lobby-visibility', timeline.lobby > 0 ? 'visible' : 'hidden');
    shade.style.opacity = timeline.shade;
    const zoom = Math.exp(Math.log(layout.zoom) * timeline.camera);
    const gateX = ART.gateX * layout.scale;
    const gateY = (ART.gateY + (ART.insideY - ART.gateY) * timeline.camera) * layout.scale;
    const x = (layout.left + ART.gateX * layout.scale) * (1 - timeline.camera) + window.innerWidth / 2 * timeline.camera;
    const y = (layout.top + ART.gateY * layout.scale) * (1 - timeline.camera) + window.innerHeight / 2 * timeline.camera;
    camera.style.transform = `translate(${x - layout.left - gateX * zoom}px, ${y - layout.top - gateY * zoom}px) scale(${zoom})`;
    root.dataset.zoom = zoom.toFixed(3);
    if (leaves) {
      const scale = Math.max(.015, Math.cos(timeline.door * Math.PI / 2));
      leaves.forEach((leaf, index) => {
        const hinge = index ? 1216 : 1034;
        const shear = Math.sin(timeline.door * Math.PI) * (index ? -.055 : .055);
        leaf.setAttribute('transform', `matrix(${scale} ${shear} 0 1 ${hinge * (1 - scale)} ${-hinge * shear})`);
      });
    }
  }

  function cancel() {
    if (!current) return;
    current = null; root.hidden = true;
    document.body.classList.remove('online-entering');
    document.body.style.removeProperty('--entrance-lobby-opacity');
    document.body.style.removeProperty('--entrance-lobby-visibility');
    onCancel();
  }
  function finish() {
    current = null; root.hidden = true;
    document.body.classList.remove('online-entering');
    document.body.style.removeProperty('--entrance-lobby-opacity');
    document.body.style.removeProperty('--entrance-lobby-visibility');
    onFinish();
  }
  function advance(now = performance.now()) {
    if (!current) return;
    current.progress = Math.max(current.progress, clamp((now - current.origin) / DURATION));
    if (current.playing && current.installed) current.progress = 1;
    paint();
    if (current.progress === 1 && current.playing && current.installed) finish();
  }
  return {
    get active() { return current !== null; },
    update(room, serverTime = Date.now()) {
      const key = `${room.code}:${room.epoch}:${room.startAt}`;
      if (room.suspended || room.canReturnLobby || !['STARTING', 'PLAYING'].includes(room.status) || (current && current.key !== key)) cancel();
      if (room.status === 'STARTING' && !room.suspended && !room.canReturnLobby && Number.isFinite(room.startAt) && !current) {
        const now = performance.now();
        current = { key, epoch: room.epoch, origin: now - (serverTime - room.startAt + DURATION), progress: 0, playing: false, installed: false, reduced: reduced() };
        current.progress = clamp((now - current.origin) / DURATION);
        root.dataset.key = key; root.dataset.epoch = room.epoch; root.hidden = false;
        document.body.classList.add('online-entering');
        onStart(); paint();
      }
      if (current) {
        const playing = room.status === 'PLAYING';
        if (playing && !current.playing) current.installed = false;
        current.playing = playing;
      }
    },
    confirm(room, epoch) {
      if (!current || current.epoch !== epoch || room.epoch !== epoch) return;
      current.installed = true;
      advance();
    },
    advance, cancel,
  };
}
