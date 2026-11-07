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
  const lobby = document.querySelector('#online-root');
  let current = null, leaves = null, layout = null;
  const setStyle = (node, property, value) => {
    const next = String(value);
    if (node.style.getPropertyValue(property) !== next) node.style.setProperty(property, next);
  };
  const setData = (property, value) => {
    const next = String(value);
    if (root.dataset[property] !== next) root.dataset[property] = next;
  };

  async function installArt(text) {
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('Invalid conservatory artwork');
    const svg = parsed.documentElement;
    const portal = [...svg.querySelectorAll('path')].find(node => node.getAttribute('d') === DOOR);
    if (!portal) throw new Error('Missing conservatory gate');
    svg.setAttribute('width', ART.width);
    svg.setAttribute('height', ART.height);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const opening = new Path2D(DOOR);
      const scene = document.createElement('canvas');
      scene.className = 'entrance-scene';
      scene.width = Math.round(ART.width * ratio);
      scene.height = Math.round(ART.height * ratio);
      const context = scene.getContext('2d');
      if (!context) throw new Error('Conservatory canvas unavailable');
      context.scale(scene.width / ART.width, scene.height / ART.height);
      context.fillStyle = '#0a202b';
      context.fillRect(0, 0, ART.width, ART.height);
      context.drawImage(image, 0, 0, ART.width, ART.height);
      context.globalCompositeOperation = 'destination-out';
      context.fill(opening);
      const doors = ['left', 'right'].map((side, index) => {
        const x = 1034 + index * 91, y = 540, width = 91, height = 238;
        const leaf = document.createElement('canvas');
        leaf.className = 'entrance-door entrance-door-' + side;
        leaf.dataset.side = side;
        leaf.width = Math.ceil(width * ratio);
        leaf.height = Math.ceil(height * ratio);
        leaf.style.left = x / ART.width * 100 + '%';
        leaf.style.top = y / ART.height * 100 + '%';
        leaf.style.width = width / ART.width * 100 + '%';
        leaf.style.height = height / ART.height * 100 + '%';
        const face = leaf.getContext('2d');
        if (!face) throw new Error('Conservatory door canvas unavailable');
        face.scale(leaf.width / width, leaf.height / height);
        face.translate(-x, -y);
        face.clip(opening);
        face.drawImage(image, 0, 0, ART.width, ART.height);
        return leaf;
      });
      camera.append(scene, ...doors);
      leaves = doors;
      if (current) paint();
      fallback.hidden = true;
      setData('art', 'ready');
    } finally {
      URL.revokeObjectURL(url);
    }
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
    setData('progress', current.progress.toFixed(3));
    setData('motion', current.reduced ? 'reduced' : 'full');
    setStyle(root, 'opacity', timeline.opacity);
    setStyle(lobby, '--entrance-lobby-opacity', timeline.lobby);
    setStyle(lobby, '--entrance-lobby-visibility', timeline.lobby > 0 ? 'visible' : 'hidden');
    setStyle(shade, 'opacity', timeline.shade);
    const zoom = Math.exp(Math.log(layout.zoom) * timeline.camera);
    const gateX = ART.gateX * layout.scale;
    const gateY = (ART.gateY + (ART.insideY - ART.gateY) * timeline.camera) * layout.scale;
    const x = (layout.left + ART.gateX * layout.scale) * (1 - timeline.camera) + window.innerWidth / 2 * timeline.camera;
    const y = (layout.top + ART.gateY * layout.scale) * (1 - timeline.camera) + window.innerHeight / 2 * timeline.camera;
    setStyle(camera, 'transform', `translate3d(${x - layout.left - gateX * zoom}px, ${y - layout.top - gateY * zoom}px, 0) scale(${zoom})`);
    setData('zoom', zoom.toFixed(3));
    if (leaves) {
      const scale = Math.max(.015, Math.cos(timeline.door * Math.PI / 2));
      leaves.forEach((leaf, index) => {
        const shear = Math.sin(timeline.door * Math.PI) * (index ? -.055 : .055);
        setStyle(leaf, 'transform', `matrix(${scale}, ${shear}, 0, 1, 0, 0)`);
      });
    }
  }

  function cancel() {
    if (!current) return;
    current = null; root.hidden = true;
    document.body.classList.remove('online-entering');
    lobby.style.removeProperty('--entrance-lobby-opacity');
    lobby.style.removeProperty('--entrance-lobby-visibility');
    onCancel();
  }
  function finish() {
    current = null; root.hidden = true;
    document.body.classList.remove('online-entering');
    lobby.style.removeProperty('--entrance-lobby-opacity');
    lobby.style.removeProperty('--entrance-lobby-visibility');
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
      if (!current || current.epoch !== epoch || room.epoch !== epoch || current.key !== `${room.code}:${room.epoch}:${room.startAt}`) return;
      current.installed = true;
      if (current.playing && room.status === 'PLAYING') advance();
    },
    advance, cancel,
  };
}
