export function createPWA({ isBusy }) {
  let registration = null, installPrompt = null, updateLocked = false, destroyed = false, deferred = false;
  let hadController = !!navigator.serviceWorker?.controller;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const appWindow = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  const root = document.createElement('aside');
  root.className = 'pwa-tools'; root.setAttribute('aria-label', 'Application status');
  root.innerHTML = '<p class="pwa-offline" role="status" hidden>Offline. Online rooms need a connection.</p><div class="pwa-actions"><button type="button" class="pwa-install" hidden>Install Moonclock</button><button type="button" class="pwa-ios" hidden>Install on iPhone</button><button type="button" class="pwa-update" hidden>Update ready</button></div><div class="pwa-help" role="status" hidden><span></span><button type="button" class="pwa-dismiss" aria-label="Dismiss installation guidance">×</button></div><p class="pwa-update-status" role="status" hidden></p>';
  document.body.append(root);
  const offline = root.querySelector('.pwa-offline'), install = root.querySelector('.pwa-install');
  const iosButton = root.querySelector('.pwa-ios'), update = root.querySelector('.pwa-update');
  const status = root.querySelector('.pwa-update-status'), help = root.querySelector('.pwa-help');
  const listeners = [];
  function listen(target, type, callback) { target.addEventListener(type, callback); listeners.push(() => target.removeEventListener(type, callback)); }
  function refresh() {
    if (destroyed) return;
    const busy = !!isBusy();
    offline.hidden = navigator.onLine !== false;
    install.hidden = !installPrompt || appWindow || busy;
    iosButton.hidden = !ios || appWindow || busy;
    update.hidden = !registration?.waiting;
    update.disabled = busy || updateLocked;
    update.textContent = updateLocked ? 'Updating…' : busy ? 'Update ready · after this session' : 'Update ready';
    update.title = busy ? 'Finish or leave your session before updating.' : 'Apply the new version while every open Moonclock window is at the main menu.';
    if (!registration?.waiting) { status.hidden = true; deferred = false; }
    else if (deferred) { status.textContent = 'Another Moonclock window is playing. Leave all sessions, then try the update again.'; status.hidden = false; }
  }
  listen(window, 'online', refresh); listen(window, 'offline', refresh);
  listen(window, 'beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; refresh(); });
  listen(window, 'appinstalled', () => { installPrompt = null; install.hidden = true; iosButton.hidden = true; });
  listen(install, 'click', async () => {
    if (!installPrompt || isBusy()) return;
    const prompt = installPrompt; installPrompt = null;
    await prompt.prompt(); await prompt.userChoice; refresh();
  });
  listen(iosButton, 'click', () => { help.querySelector('span').textContent = 'In Safari, tap Share, then Add to Home Screen. Open Moonclock from its new icon.'; help.hidden = false; });
  listen(root.querySelector('.pwa-dismiss'), 'click', () => { help.hidden = true; });
  listen(update, 'click', () => {
    if (isBusy() || updateLocked || !registration?.waiting) return;
    deferred = false; status.textContent = 'Checking other Moonclock windows…'; status.hidden = false;
    registration.waiting.postMessage({ type: 'PWA_ACTIVATE_WHEN_IDLE' });
  });
  if ('serviceWorker' in navigator) {
    listen(navigator.serviceWorker, 'message', event => {
      if (event.data?.type === 'PWA_IDLE_QUERY') {
        const idle = !isBusy();
        if (idle) updateLocked = true;
        event.ports[0]?.postMessage({ idle }); refresh();
      } else if (event.data?.type === 'PWA_RELEASE_UPDATE_LOCK') { updateLocked = false; refresh(); }
      else if (event.data?.type === 'PWA_UPDATE_DEFERRED') { updateLocked = false; deferred = true; refresh(); }
    });
    listen(navigator.serviceWorker, 'controllerchange', () => {
      updateLocked = false;
      if (hadController && !isBusy()) location.reload();
      hadController = true; refresh();
    });
    listen(document, 'visibilitychange', () => { if (!document.hidden) { registration?.update().catch(() => {}); refresh(); } });
    if (window.isSecureContext && document.querySelector('meta[name="moonclock-build"]')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
        if (destroyed) return;
        registration = value; refresh();
        listen(value, 'updatefound', () => {
          const worker = value.installing;
          if (worker) listen(worker, 'statechange', refresh);
        });
      }).catch(() => { status.textContent = 'Installation support is unavailable right now. You can keep playing in this browser.'; status.hidden = false; });
    }
  }
  refresh();
  return {
    sessionAllowed() { return !updateLocked; },
    refresh,
    destroy() { destroyed = true; for (const remove of listeners) remove(); root.remove(); },
  };
}
