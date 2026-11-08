import { OPENING_DURATION, NEWSPAPER_DURATION, STORY_ASSETS, NEWSPAPER_ASSET, openingFrame, openingTransform, newspaperFrame, newspaperTransform } from '../src/cinematic-timeline.js';

export function createCinematic({ onFinish }) {
  const root = document.createElement('section');
  root.className = 'cinematic'; root.dataset.testid = 'cinematic'; root.hidden = true; root.setAttribute('aria-label', 'Moonclock story');
  root.innerHTML = `<div class="cinematic-opening-scene"><div class="cinematic-world"><img class="cinematic-backdrop" src="/art/moonlit-conservatory.svg" alt=""><div class="cinematic-door"><div class="cinematic-leaf left"></div><div class="cinematic-leaf right"></div></div></div></div><div class="cinematic-paper-stack">${STORY_ASSETS.map((src, i) => `<img class="cinematic-story" data-testid="story-${i + 1}" src="${src}" alt="Opening story, page ${i + 1}">`).join('')}</div><p class="cinematic-caption" data-testid="newspaper-caption">later, report came out</p><img class="cinematic-newspaper" data-testid="newspaper" src="${NEWSPAPER_ASSET}" alt="Timekeeper Gazette, final edition">`;
  document.body.append(root);
  const scene = root.querySelector('.cinematic-opening-scene'), world = root.querySelector('.cinematic-world'), stack = root.querySelector('.cinematic-paper-stack');
  const cards = [...root.querySelectorAll('.cinematic-story')], paper = root.querySelector('.cinematic-newspaper'), leaves = [...root.querySelectorAll('.cinematic-leaf')];
  const caption = root.querySelector('.cinematic-caption');
  const loads = new Map();
  let session = null, width = 1, height = 1;
  function resize() {
    width = root.clientWidth || window.innerWidth; height = root.clientHeight || window.innerHeight;
    if (session) paint(session);
  }
  new ResizeObserver(resize).observe(root);
  function preload(kind) {
    if (!loads.has(kind)) {
      const images = kind === 'opening' ? cards : [paper];
      loads.set(kind, new Promise(resolve => {
        const timer = setTimeout(resolve, 4000);
        Promise.allSettled(images.map(image => image.decode())).then(() => { clearTimeout(timer); resolve(); });
      }));
    }
    return loads.get(kind);
  }
  function cancel() { session = null; root.hidden = true; document.body.classList.remove('cinematic-active'); }
  function paint(current) {
    const frame = current.kind === 'opening' ? openingFrame(current.elapsed, current.reduced) : newspaperFrame(current.elapsed, current.reduced);
    current.phase = root.dataset.phase = frame.phase;
    if (current.kind === 'opening') {
      const camera = openingTransform(frame, width, height);
      world.style.width = `${camera.width}px`; world.style.height = `${camera.height}px`;
      world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
      scene.style.opacity = frame.backdrop;
      leaves[0].style.transform = `rotateY(${-88 * frame.door}deg)`; leaves[1].style.transform = `rotateY(${88 * frame.door}deg)`;
      cards.forEach((card, index) => { card.style.opacity = frame.cards[index]; });
      stack.style.opacity = frame.opacity; stack.style.transform = `translateY(${frame.lift}%)`;
    } else {
      const camera = newspaperTransform(frame, width, height);
      paper.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`; paper.style.opacity = frame.reveal * frame.opacity * frame.transitionOpacity;
      caption.style.opacity = frame.caption;
    }
    root.style.backgroundColor = current.kind === 'opening' ? `rgba(10,32,43,${frame.opacity})` : `rgba(0,0,0,${frame.backdrop})`;
  }
  return {
    preload,
    play(kind, { key, shared = false, reduced = false } = {}) {
      if (session?.key === key && session.kind === kind) return;
      const current = session = { kind, key, shared, reduced, elapsed: 0, previous: null, ready: shared, duration: kind === 'opening' ? OPENING_DURATION : NEWSPAPER_DURATION, phase: kind === 'opening' ? 'door' : 'black' };
      root.hidden = true; scene.hidden = stack.hidden = kind !== 'opening'; paper.hidden = caption.hidden = kind === 'opening';
      root.style.backgroundColor = '#0a202b';
      root.dataset.kind = kind; root.dataset.phase = current.phase; document.body.classList.add('cinematic-active');
      cards.forEach(card => { card.style.opacity = 0; }); stack.style.opacity = 1; stack.style.transform = ''; scene.style.opacity = 1;
      leaves.forEach(leaf => { leaf.style.transform = 'rotateY(0deg)'; });
      paper.style.opacity = caption.style.opacity = 0;
      resize(); root.hidden = false;
      preload(kind).then(() => { if (session === current) current.ready = true; });
    },
    advance(time, { paused = false, elapsed } = {}) {
      if (!session) return;
      const current = session, gap = current.previous === null ? 0 : Math.max(0, time - current.previous); current.previous = time;
      if (elapsed !== undefined) current.elapsed = Math.max(0, elapsed);
      else if (current.ready && !paused) current.elapsed += gap;
      paint(current);
      if (current.elapsed >= current.duration) { cancel(); onFinish(current); }
    },
    cancel,
    resetClock() { if (session) session.previous = null; },
    get active() { return !!session; },
    inspect: () => session ? { active: true, kind: session.kind, key: session.key, phase: session.phase, elapsed: session.elapsed, duration: session.duration } : null,
  };
}
