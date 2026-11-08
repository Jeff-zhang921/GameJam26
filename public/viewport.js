// Expand fractional viewport edges outwards so the compositor cannot expose a
// one-device-pixel strip. All game windows keep their full backdrop behind
// safe areas, while text entry still follows the smaller keyboard viewport.
export function viewportBounds(visual, layout, { standalone = false, editing = false } = {}) {
  const left = Math.floor(visual.offsetLeft || 0), top = Math.floor(visual.offsetTop || 0);
  const right = Math.ceil((visual.offsetLeft || 0) + visual.width);
  const bottom = Math.ceil((visual.offsetTop || 0) + visual.height);
  return {
    left, top,
    width: Math.max(1, right - left, !editing ? layout.width - left : 0),
    height: Math.max(1, bottom - top, !editing ? layout.height - top : 0),
  };
}

export function createViewport({ isMobile, onBlocked, onResize }) {
  const root = document.documentElement;
  const gate = document.createElement('section');
  gate.className = 'orientation-gate';
  gate.hidden = true;
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'orientation-title');
  gate.setAttribute('aria-describedby', 'orientation-help');
  gate.innerHTML = `<div class="orientation-card">
    <svg class="orientation-icon" viewBox="0 0 80 80" aria-hidden="true"><rect x="25" y="15" width="30" height="50" rx="5" transform="rotate(90 40 40)"/><path d="M14 29A29 29 0 0 1 64 20m0-10v10H54M66 51A29 29 0 0 1 16 60m0 10V60h10"/></svg>
    <h1 id="orientation-title">Moonclock supports landscape only</h1>
    <p id="orientation-help">Rotate your device to landscape. Enable rotation in your device settings if needed.</p>
    <button type="button">Enable landscape</button>
    <p class="orientation-status" role="status"></p>
  </div>`;
  document.body.append(gate);
  const button = gate.querySelector('button');
  const status = gate.querySelector('.orientation-status');
  const orientation = screen.orientation;
  const canLock = typeof orientation?.lock === 'function';
  const appWindow = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
  let blocked = false, scheduled = false, previousFocus = null;
  let locking = false, locked = false, fullscreenAttempted = false, gestureAttempted = false;
  let geometry = '';

  function landscape() {
    if (orientation?.type) return orientation.type.startsWith('landscape');
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
    return window.innerWidth > window.innerHeight;
  }

  function sync() {
    scheduled = false;
    const visual = window.visualViewport;
    // Keep the layout steady while the browser magnifies the page.
    if (!visual || Math.abs(visual.scale - 1) < .01) {
      const standalone = appWindow.matches || navigator.standalone === true;
      const editing = !!document.activeElement?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])');
      const layoutHeight = standalone && !editing
        ? Math.max(window.innerHeight, Math.ceil(root.getBoundingClientRect().height))
        : window.innerHeight;
      const { width, height, left, top } = viewportBounds({
        width: visual?.width || window.innerWidth, height: visual?.height || window.innerHeight,
        offsetLeft: visual?.offsetLeft || 0, offsetTop: visual?.offsetTop || 0,
      }, { width: window.innerWidth, height: layoutHeight }, { standalone, editing });
      const next = `${width}:${height}:${left}:${top}`;
      if (next !== geometry) {
        geometry = next;
        root.style.setProperty('--viewport-width', `${width}px`);
        root.style.setProperty('--viewport-height', `${height}px`);
        root.style.setProperty('--viewport-left', `${left}px`);
        root.style.setProperty('--viewport-top', `${top}px`);
      }
      onResize();
    }
    const nextBlocked = isMobile() && !landscape();
    if (nextBlocked === blocked) return;
    blocked = nextBlocked;
    gate.hidden = !blocked;
    document.body.classList.toggle('portrait-blocked', blocked);
    if (blocked) previousFocus = document.activeElement;
    onBlocked(blocked);
    if (blocked) button.focus({ preventScroll: true });
    else if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
  }

  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  async function requestLandscape(fromGesture = false) {
    if (!isMobile() || locking) return;
    if (!canLock) {
      status.textContent = 'This browser needs you to rotate the device manually.';
      return;
    }
    locking = true;
    try {
      if (fromGesture && !locked && !document.fullscreenElement && !fullscreenAttempted && document.documentElement.requestFullscreen) {
        fullscreenAttempted = true;
        try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { }
      }
      await orientation.lock('landscape');
      locked = true;
      status.textContent = '';
    } catch {
      locked = false;
      status.textContent = 'Automatic rotation is unavailable here. Rotate your device to landscape and check that rotation is enabled.';
    } finally {
      locking = false;
      refresh();
    }
  }

  function firstGesture(event) {
    if (!event.isTrusted || gestureAttempted || locking || !isMobile()) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    gestureAttempted = true;
    void requestLandscape(true);
  }

  function capture(event) {
    if (!blocked || gate.contains(event.target)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'focusin') button.focus({ preventScroll: true });
  }

  button.addEventListener('click', () => {
    if (locking) return;
    fullscreenAttempted = false; locked = false;
    void requestLandscape(true);
  });
  document.addEventListener('pointerdown', firstGesture, true);
  document.addEventListener('keydown', firstGesture, true);
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'keydown', 'keyup', 'submit', 'focusin']) document.addEventListener(name, capture, true);
  gate.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.preventDefault();
    if (event.key === 'Tab') { event.preventDefault(); button.focus({ preventScroll: true }); }
    event.stopPropagation();
  });
  for (const name of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(name, refresh);
  for (const name of ['resize', 'scroll']) window.visualViewport?.addEventListener(name, refresh);
  for (const name of ['focusin', 'focusout']) document.addEventListener(name, refresh);
  orientation?.addEventListener('change', refresh);
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); void requestLandscape(); } });
  window.addEventListener('pageshow', () => { void requestLandscape(); });
  queueMicrotask(() => { refresh(); void requestLandscape(); });
  return { get blocked() { return blocked; }, refresh };
}
