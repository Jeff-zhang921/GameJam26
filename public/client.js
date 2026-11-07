import { playEffect } from './sfx.js';
import { createMusic } from './music.js';
import { setup, applyAction, validateAction, viewFor, targetFor, hintLevel, levelCount, interactionFor, abilityCheck, abilityTargets, timeObjectAt, anchor, exitStatus, freezeAreaAt, freezeCheck, meta } from '../src/logic.js';
import { createHistory, compactFrame, rewindFrame, REWIND } from './rewind.js';
import { S } from './strings.js';
import { createRenderer } from './render.js';
import { createNetwork } from './network.js';
import { readJoystick } from './joystick.js';
import { createLobby } from './lobby.js';
import { createPWA } from './pwa.js';

const music = createMusic();
const icons = {
  moon: '<path d="M19 15.5A8 8 0 0 1 8.5 5a8.5 8.5 0 1 0 10.5 10.5Z"/><path d="m17 3 .5 2.5L20 6l-2.5.5L17 9l-.5-2.5L14 6l2.5-.5Z"/>',
  leaf: '<path d="M19 4C7 3 3 10 7 16c6 4 13 0 12-12Z"/><path d="M5 21 17 7M10 15l-1-5m5 1 4 1"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 3 4-3M8 20l4-3 4 3M3 11l4-2V5m14 8-4 2v4M3 13l4 2v4m14-8-4-2V5"/>',
  sound: '<path d="m4 9 4 0 5-4v14l-5-4H4Zm12-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>',
  mute: '<path d="m4 9 4 0 5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 3m0 3h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>', play: '<path d="m9 5 10 7-10 7Z"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="m10 8-4 4 4 4M6 12h10"/>',
  pickup: '<path d="M5 12h14v8H5Z"/><path d="M12 3v6m-3-3 3-3 3 3"/>',
  throw: '<path d="M4 19c1-8 7-13 15-13"/><path d="m15 2 4 4-4 4"/><path d="M3 15h5v5H3Z"/>',
  drop: '<path d="M5 15h14v6H5Z"/><path d="M12 3v8m-3-3 3 3 3-3"/>',
  plant: '<path d="M12 21v-9"/><path d="M12 12C12 7 8 5 4 5c0 4 3 7 8 7Z"/><path d="M12 14c0-4 3-6 8-6 0 4-3 6-8 6Z"/><path d="M7 21h10"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>', left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>', up: '<path d="m5 15 7-7 7 7"/>',
  swap: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4 4-4-4 4-4"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  guardian: '<path d="M8 12C4 8 7 2 12 2s8 6 4 10m-8 0-4 9c5 2 11 2 16 0l-4-9Zm0 1h8m-7-6h.01m6 0h.01M12 14v7M3 6v16m-2-19 2-2 2 2-2 3Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.moon}</svg>`;
const key = text => `<kbd class="key">${text}</kbd>`;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('moonclock-v1') || '{}'); } catch { }
let state = setup({ level: Number.isInteger(saved.level) ? saved.level : 0 });
state.unlocked = Math.max(state.level, Math.min(levelCount - 1, saved.unlocked || 0));
let mode = saved.mode === 'coop' ? 'coop' : 'solo';
let sound = saved.sound !== false;
let touchControls = saved.touchControls === true;
const touchMedia = window.matchMedia('(pointer: coarse)');
// iPadOS Safari reports a desktop (Macintosh) user agent and, with a trackpad attached, a fine pointer.
const iPadDesktop = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
const touchDevice = () => touchMedia.matches || iPadDesktop;
const touchLayout = () => touchControls || touchDevice();
let reduced = saved.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let best = Array.from({ length: levelCount }, (_, i) => Array.isArray(saved.best) && Number.isFinite(saved.best[i]) ? saved.best[i] : null);
let modal = 'intro', seenEvent = 0, shownHint = 0, toastTimer, audioContext;
const clock = ticks => { const sec = Math.floor(ticks / 60); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
let lastTime = 0, accumulator = 0, frameCount = 0, sceneKey = 0, cameraReset = 0;
let onlineMode = false, networkEpoch = null, networkStatus = 'offline';
const held = new Set();
const touchPointers = new Map();
let touchJumpActor = null, uiChapter = '', uiProgress = '', uiMode = '', touchKey = '';
// Touch: the last drawn world (for tap hit-testing) and the short-lived feedback of the last tap.
let lastView = null, tapEffect = null, tapIntroShown = false;
// Height (px) the bottom touch controls take up; the camera lowers the world only as far as keeps the
// ground clear of them. Level select target awaiting the host's confirmation; last "waiting" notice shown.
let controlsReserve = 0, pendingLevel = null, waitingKey = '';
// Time-rewind restart: the courtyard's bounded history and the rewind being played (if any).
const history = createHistory();
history.reset(state);
let rewind = null;
// Dead-end warnings already shown on this screen (per courtyard run), and the desktop Freeze preview.
let warnedSeq = 0, warnKey = '', freezePreview = null;
const joy = { pointer: null, actor: null, dx: 0, dy: 0, dir: 0 };
const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div class="brand"><div class="brand-mark">${icon('moon')}</div><div><h1 class="brand-title">${S.title}</h1><div class="brand-en">${S.english}</div></div><span class="top-note">${S.studio}</span></div>
      <nav class="chapter-nav" id="chapter-nav" aria-label="${S.chapters}"></nav>
      <div class="toolbar"><button class="iconbutton" data-testid="sound" data-action="sound" aria-label="${S.sound}" title="${S.sound}">${icon(sound ? 'sound' : 'mute')}</button><button class="iconbutton" data-testid="help" data-action="help" aria-label="${S.help}" title="${S.help}">${icon('help')}</button><button class="iconbutton" data-testid="settings" data-action="settings" aria-label="${S.settings}" title="${S.settings}">${icon('settings')}</button><button class="iconbutton" data-testid="pause" data-action="pause" aria-label="${S.pause}" title="${S.pause}">${icon('pause')}<span class="hint-dot" aria-hidden="true"></span></button></div>
    </header>
    <main class="game-frame">
      <canvas id="game" aria-label="${S.title}" tabindex="0"></canvas>
      <section class="goal-panel" aria-label="${S.objective}">
        <div class="eyebrow" id="chapter-en"></div><h2 id="chapter-name"></h2>
        <div class="goal-heading">${icon('arrow')}<span>${S.objective}</span><span id="goal-count"></span></div>
        <p id="objective"></p><ul class="checklist" id="checklist" aria-live="polite"></ul>
      </section>
      <div class="game-bottom"><div class="status-strip"><span class="live-dot"></span><span id="hud"></span><span class="freeze-count" id="freeze-count" data-testid="freeze-count"></span><span id="stage-count"></span></div>
        <div class="action-strip"><span class="controls-strip" id="controls"></span><button class="ability-chip" data-action="ability" id="ability" data-testid="ability">${icon('snow')}<span id="ability-label"></span>${key('F')}</button><button class="text-button switch-button" data-action="switch" aria-label="${S.switchRole}">${icon('swap')}${key('Tab')}</button></div>
      </div>
      <div class="touch-controls" data-testid="touch-controls">
        <div class="touch-movement">
          <div class="joystick" data-testid="joystick" role="group" aria-label="${S.joystick}"><div class="joystick-base" aria-hidden="true"></div><div class="joystick-thumb" aria-hidden="true"></div></div>
          <button type="button" class="touch-skill touch-jump" data-touch="jump" data-testid="touch-jump" aria-label="${S.jump}">${icon('up')}<span>${S.jump}</span></button>
        </div>
        <div class="touch-actions">
          <button type="button" class="touch-switch" data-touch="switch" data-testid="touch-switch" aria-label="${S.switchRole}">${icon('swap')}</button>
          <button type="button" class="touch-skill touch-interact" data-touch="grab" data-testid="touch-interact" aria-label="${S.interact.pickup}">${icon('pickup')}<span>${S.interact.pickup}</span></button>
          <button type="button" class="touch-skill touch-ability" data-touch="ability" data-testid="touch-ability" aria-label="${S.ability[0]}">${icon('snow')}<span>${S.ability[0]}</span></button>
        </div>
      </div>
      <button type="button" class="touch-pause" data-action="pause" data-testid="touch-pause" aria-label="${S.pause}" title="${S.pause}">${icon('pause')}<span class="hint-dot" aria-hidden="true"></span></button>
      <div class="toast" role="status" id="toast"></div><div class="debug" id="debug" hidden></div>
    </main>
  </div><div id="modal-root"></div>`;
let entering = false;
const canvas = document.querySelector('#game');
const renderer = createRenderer(canvas, S);
const debug = new URLSearchParams(location.search).has('debug');
const network = createNetwork({
  onRoom(room, playerId, serverTime) {
    lobby.update(room, playerId, serverTime);
    if (['WAITING', 'READY', 'STARTING'].includes(room.status) || room.canReturnLobby) {
      modal = 'online'; renderModal();
    } else if (room.status === 'PLAYING' && network.latest && modal === 'online' && !room.suspended) {
      modal = null; renderModal(); canvas.focus({ preventScroll: true });
    }
  },
  onState(game, info) {
    const previousStatus = state.status;
    state = { ...game, active: network.actor };
    if (!rewind) history.record(game);
    if (game.status === 'paused' && previousStatus !== 'paused') resetTouchState();
    if (networkEpoch !== info.epoch) {
      networkEpoch = info.epoch; sceneKey++; cameraReset++; seenEvent = state.eventSeq;
      shownHint = 0; uiChapter = ''; resetTouchState(); history.reset(game);
      if (rewind) rewind.arrived = true; // the server has installed the courtyard's start
      modal = network.room.status === 'STARTING' ? 'online' : null;
    }
    const seenBefore = seenEvent;
    for (const e of state.events) if (e.id > seenEvent) {
      if (!(e.kind === 'return' && state.events.some(h => h.kind === 'hit' && h.actor === e.actor && h.id > seenBefore))) chime(e);
      if (e.kind === 'return' && e.actor === network.actor) cameraReset++; seenEvent = e.id;
    }
    if (game.status === 'won') modal = 'win';
    else if (game.status === 'paused' && (!modal || modal === 'online')) modal = 'pause';
    else if (game.status === 'playing' && modal === 'pause' && previousStatus === 'paused') modal = null;
    if (network.room.status === 'STARTING') modal = 'online';
    updateUI();
    const root = document.querySelector('#modal-root');
    if (root.dataset.phase !== String(modal)) { renderModal(); if (!modal) canvas.focus({ preventScroll: true }); }
  },
  onReplay(replay, game) { startRewind({ end: replay.end, current: game, online: true }); },
  onConnection(status) { networkStatus = status; lobby.setConnection(status); if (status !== 'connected') resetTouchState(); },
  onError(message) { lobby.setError(message); toast(message); },
});
const lobby = createLobby({
  createRoom() { enterOnline(); network.create(); },
  joinRoom(code) { enterOnline(); network.join(code); },
  selectCharacter(character) { network.selectCharacter(character); },
  setReady(ready) { network.setReady(ready); },
  startGame() { network.start(); },
  leaveRoom() { leaveOnline(); },
  returnToLobby() { network.returnToLobby(); },
  retry() { network.retry(); },
});
const pwa = createPWA({ isBusy: () => onlineMode || entering || modal !== 'intro' });
const orientationTip = document.createElement('aside'); orientationTip.className = 'orientation-tip'; orientationTip.setAttribute('role', 'status');
orientationTip.innerHTML = '<span>Rotate to landscape for a wider view. You can keep playing.</span><button type="button" aria-label="Dismiss orientation tip">×</button>';
orientationTip.querySelector('button').addEventListener('click', () => { orientationTip.hidden = true; }); document.body.append(orientationTip);
function enterOnline() {
  clearInputs(); onlineMode = true; modal = 'online'; entering = false;
  renderer.setEntryProgress?.(1); document.body.classList.add('online-mode'); renderModal();
}
function leaveOnline() {
  resetTouchState();
  network.leave(); lobby.hide(); onlineMode = false; networkEpoch = null;
  document.body.classList.remove('online-mode');
  state = setup({ level: Number.isInteger(saved.level) ? saved.level : 0 });
  sceneKey++; seenEvent = 0; uiChapter = ''; uiMode = ''; modal = 'intro'; history.reset(state);
  renderer.setEntryProgress?.(0); updateUI(); renderModal();
}
// Solo / local co-op "Leave": back to the main menu, keeping the current courtyard and unlocks.
function returnToMenu() {
  clearInputs(); persist();
  const { level, unlocked } = state;
  state = setup({ level }); state.unlocked = unlocked;
  sceneKey++; cameraReset++; seenEvent = 0; shownHint = 0; uiChapter = ''; uiMode = ''; modal = 'intro'; history.reset(state);
  renderer.setEntryProgress?.(0); updateUI(); renderModal();
}

function persist() {
  const data = { level: state.level, unlocked: state.unlocked, mode, sound, reduced, best, touchControls };
  saved = data;
  try { localStorage.setItem('moonclock-v1', JSON.stringify(data)); } catch { }
}
function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
function initAudio() {
  music.unlock();
 if (!audioContext && sound) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (audioContext?.state === 'suspended' && sound) audioContext.resume(); }
function chime(event) {
  if (sound && audioContext) playEffect(audioContext, event);
}
function dispatch(action, quiet = false) {
  if (rewind && action.type !== 'tick') return { valid: false };
  if (onlineMode) {
    if (action.actor !== undefined && action.actor !== network.actor) return { valid: false };
    if (['switch', 'tick'].includes(action.type)) return { valid: false };
    if (action.type === 'level' && !network.host) return { valid: false }; // the server enforces this too
    return { valid: network.action(action) };
  }
  if (action.actor === undefined && ['move', 'jump', 'jumpRelease', 'grab', 'ability'].includes(action.type)) action = { ...action, actor: state.active };
  const result = validateAction(state, 'local', action);
  if (!result.valid) { if (!quiet) toast(S.errors[result.error]); return result; }
  const oldLevel = state.level, oldStatus = state.status;
  state = applyAction(state, 'local', action);
  if (action.type === 'switch') chime({ kind: 'switch' });
  if (state.level !== oldLevel || ['restart', 'level', 'next'].includes(action.type)) {
    seenEvent = state.eventSeq; sceneKey++; cameraReset++; shownHint = 0;
    history.reset(state);
  }
  const seenBefore = seenEvent;
  for (const e of state.events) if (e.id > seenEvent) { if (!(e.kind === 'return' && state.events.some(h => h.kind === 'hit' && h.actor === e.actor && h.id > seenBefore))) chime(e); if (e.kind === 'return' && e.actor !== undefined) cameraReset++; seenEvent = e.id; }
  if (state.status === 'won' && oldStatus !== 'won') { held.clear(); best[state.level] = Math.min(best[state.level] ?? Infinity, state.elapsed); modal = 'win'; persist(); renderModal(); }
  if (action.type !== 'tick' || state.status !== oldStatus) updateUI();
  return { valid: true };
}
function updateUI() {
  const chapter = S.levels[state.level];
  document.querySelector('#chapter-en').textContent = `${S.chapter} 0${state.level + 1} / ${chapter.en}`;
  document.querySelector('#chapter-name').textContent = chapter.name;
  document.querySelector('#objective').textContent = chapter.goal;
  const hint = hintLevel(state);
  for (const button of document.querySelectorAll('.shell [data-action="pause"]')) button.classList.toggle('new-hint', hint > 0);
  if (hint > shownHint) toast(S.hintReady);
  shownHint = hint;
  document.querySelector('#hud').innerHTML = `<span class="hud-label">${S.memory} </span>${state.shards.filter(s => s.taken).length}/${state.shards.length} · ${clock(state.elapsed)}`;
  document.querySelector('#stage-count').textContent = `${String(state.level + 1).padStart(2, '0')} / ${String(levelCount).padStart(2, '0')}`;
  const chapterKey = `${state.level}:${state.unlocked}:${onlineMode}`;
  if (chapterKey !== uiChapter) {
    document.querySelector('#chapter-nav').innerHTML = Array.from({ length: levelCount }, (_, i) => i).map(i => `<button class="chapter-button ${i < state.unlocked ? 'done' : ''}" data-level="${i}" ${onlineMode ? 'disabled' : ''} aria-label="${S.levels[i].name}" ${i === state.level ? 'aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span></button>`).join('');
    uiChapter = chapterKey;
  }
  const progress = `${state.level}:${state.needs.map(k => Number(state.flags[k])).join('')}`;
  if (progress !== uiProgress) {
    document.querySelector('#checklist').innerHTML = state.needs.map(k => `<li class="${state.flags[k] ? 'done' : ''}">${S.flags[k]}</li>`).join('');
    document.querySelector('#goal-count').textContent = `${state.needs.filter(k => state.flags[k]).length}/${state.needs.length}`;
    if (uiProgress && !reduced) document.querySelector('.goal-panel').animate([{ borderColor: '#dcba63', background: '#fffce9' }, {}], { duration: 900 });
    uiProgress = progress;
  }
  if (uiMode !== `${mode}:${onlineMode}`) {
    document.querySelector('#controls').innerHTML = mode === 'coop' && !onlineMode ? `<span>${key('A D / ← →')}${S.move}</span><span>${key('W / ↑')}${S.jump}</span><span>${key('E / Enter')}${S.touchGrab}</span><span>${key('F / L')}${S.skills}</span>` : `<span>${key('A D')}${S.move}</span><span>${key('Space')}${S.jump}</span><span>${key('E')}${S.touchGrab}</span>`;
    uiMode = `${mode}:${onlineMode}`;
  }
  document.querySelector('#ability-label').textContent = `${S.roleLabels[state.active]} · ${S.ability[state.active]}`;
  document.querySelector('#ability').classList.toggle('bloom', state.active === 1);
  document.querySelector('#ability svg').innerHTML = icons[state.active ? 'leaf' : 'snow'];
  document.querySelector('[data-testid="sound"]').innerHTML = icon(sound ? 'sound' : 'mute');
  document.body.classList.toggle('reduced-motion', reduced);
  document.body.classList.toggle('touch-enabled', touchControls);
  document.body.classList.toggle('touch-device', touchDevice());
  document.body.classList.toggle('touch-layout', touchLayout());
  measureControls();
  noticeWaiting();
  const charges = state.freezeCharges ?? 0, freezeCount = document.querySelector('#freeze-count');
  freezeCount.textContent = S.freezeCount(charges); freezeCount.classList.toggle('empty', charges <= 0);
  checkWarning();
  document.body.classList.toggle('in-session', modal !== 'intro');
  pwa.refresh();
}
// Forget every held key, finger and joystick state without sending anything.
function resetTouchState() {
  held.clear(); touchPointers.clear(); touchJumpActor = null;
  Object.assign(joy, { pointer: null, actor: null, dx: 0, dy: 0, dir: 0 });
  const stick = document.querySelector('.joystick');
  if (stick) { stick.classList.remove('active'); stick.style.setProperty('--tx', '0px'); stick.style.setProperty('--ty', '0px'); }
  for (const button of document.querySelectorAll('.touch-controls .pressed')) button.classList.remove('pressed');
}
function measureControls() {
  const base = document.querySelector('.joystick-base'), frameEl = document.querySelector('.game-frame');
  controlsReserve = base && frameEl && document.body.classList.contains('touch-layout') ? Math.max(0, frameEl.getBoundingClientRect().bottom - base.getBoundingClientRect().top) : 0;
}
// One timekeeper reached the open moon gate: tell the players who is still on the way (once per arrival).
function noticeWaiting() {
  const { waiting } = exitStatus(state);
  const key = state.status === 'playing' && waiting !== null ? `${state.level}:${waiting}` : '';
  if (key && key !== waitingKey) toast(S.waitingFor[waiting]);
  waitingKey = key;
}
function clearInputs() {
  resetTouchState();
  for (let i = 0; i < 2; i++) { if (onlineMode && i !== network.actor) continue; dispatch({ type: 'move', actor: i, dir: 0 }, true); dispatch({ type: 'jumpRelease', actor: i }, true); }
}
// Opening any menu releases held input. Offline it also pauses the local simulation; online the
// server-authoritative world keeps running for both players (the menu is local to this screen).
// A possible dead end (decided by the game/server) opens a warning once per new reason. Closing it changes
// nothing; it closes by itself if the situation recovers.
function checkWarning() {
  const key = `${state.level}:${onlineMode ? networkEpoch : sceneKey}`;
  if (key !== warnKey) { warnKey = key; warnedSeq = 0; }
  if (modal === 'warning' && !state.failure) { resume(); return; }
  if (rewind || entering || modal || !state.failure || state.status !== 'playing') return;
  if ((state.failureSeq ?? 0) > warnedSeq) { warnedSeq = state.failureSeq; setModal('warning'); }
}
// Restart = rewind time to the courtyard's start over 4 s. Local play rewinds at once; online the host asks
// the server, which starts the same rewind for both players.
function requestRestart() {
  if (rewind) return;
  if (onlineMode) { if (!network.host) return; clearInputs(); dispatch({ type: 'restart' }); modal = null; renderModal(); return; }
  startRewind({ end: applyAction(state, 'local', { type: 'restart' }), current: state, online: false });
}
function startRewind({ end, current, online }) {
  if (rewind) return;
  clearInputs();
  const frames = [...history.frames];
  if (current && (!frames.length || frames[frames.length - 1].tick !== current.tick)) frames.push(compactFrame(current));
  // Whatever this screen saw, the rewind always lands on the courtyard's true start.
  if (end && (!frames.length || frames[0].tick !== 0 || frames[0].level !== end.level)) frames.unshift(compactFrame(end));
  rewind = { start: performance.now(), duration: REWIND.duration, frames, end, online, arrived: false, u: 0 };
  modal = null; renderModal(); document.body.classList.add('rewinding'); document.querySelector('#toast').classList.remove('show');
}
function finishRewind() {
  const done = rewind; rewind = null; document.body.classList.remove('rewinding');
  if (!done.online) dispatch({ type: 'restart' });
  clearInputs(); history.reset(state); accumulator = 0; previousTick = null;
  modal = null; renderModal(); updateUI(); canvas.focus({ preventScroll: true });
}
function setModal(type) {
  if (rewind) return;
  if (type && modal === null) { clearInputs(); if (!onlineMode && state.status === 'playing') dispatch({ type: 'pause' }, true); }
  modal = type; renderModal();
}
function resume() { modal = null; if (state.status === 'paused') { if (onlineMode) network.pause(false); else dispatch({ type: 'pause' }, true); } accumulator = 0; renderModal(); canvas.focus({ preventScroll: true }); }
function renderModal() {
  const root = document.querySelector('#modal-root');
  root.dataset.phase = String(modal);
  if (modal === 'online') { root.innerHTML = ''; document.querySelector('.shell').classList.remove('at-entry'); return; }
  document.querySelector('.shell').classList.toggle('at-entry', modal === 'intro' || entering);
  if (!modal) { root.innerHTML = ''; return; }
  let contents = '';
  const close = `<button class="iconbutton close" data-action="close" aria-label="${S.close}">${icon('close')}</button>`;
  if (modal === 'intro') contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">${S.english} · A COOPERATIVE TIME TALE</div><h1>${S.title}</h1><p>${S.intro}<br>${S.introBody}</p><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}" data-testid="mode-solo">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}" data-testid="mode-coop">${S.coop}</button></div><button class="primary" data-action="start" data-testid="start">${saved.unlocked ? S.continue : S.start}${icon('arrow')}</button><p class="intro-foot">${S.subtitle}</p>`;
  if (modal === 'help') contents = `${close}<div class="intro-icon">${icon('help')}</div><h2>${S.helpTitle}</h2><p>${S.helpBody}</p><div class="help-grid">${(touchLayout() ? S.touchKeys : S.keys).map(([k, v]) => `${key(k)}<span>${v}</span>`).join('')}</div>${touchLayout() ? '' : `<p>${S.coopKeys}</p>`}<button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'settings') contents = `${close}<div class="intro-icon">${icon('settings')}</div><h2>${S.settings}</h2><p class="music-credit">Gymnopédie No. 1 · Erik Satie<br>Performed by <a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100787" target="_blank" rel="noopener">Kevin MacLeod</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>Excerpt 0:00–0:50; fades applied.</p><div class="settings-row"><span>${S.sound}</span><button class="toggle" role="switch" aria-checked="${sound}" data-action="sound" aria-label="${S.sound}" data-testid="setting-sound"></button></div><div class="settings-row"><span>${S.motion}</span><button class="toggle" role="switch" aria-checked="${reduced}" data-action="motion" aria-label="${S.motion}" data-testid="setting-motion"></button></div><div class="settings-row"><span>${S.touchControls}</span><button class="toggle" role="switch" aria-checked="${touchControls}" data-action="touch-controls" aria-label="${S.touchControls}" data-testid="setting-touch"></button></div><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}">${S.coop}</button></div><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'pause') {
    const lockLevels = onlineMode && !network.host;
    const chapters = `<div class="pause-levels"><div class="goal-heading">${icon('arrow')}<span>${S.chooseLevel}</span></div><nav class="pause-chapters" aria-label="${S.chapters}">${Array.from({ length: levelCount }, (_, i) => `<button class="chapter-button ${i < state.unlocked ? 'done' : ''}" data-level="${i}" data-testid="level-${i}" aria-label="${S.levels[i].name}" title="${S.levels[i].name}" ${i === state.level ? 'aria-current="step"' : ''} ${lockLevels ? 'disabled' : ''}><span>${String(i + 1).padStart(2, '0')}</span></button>`).join('')}</nav></div>`;
    contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">A MOMENT OF STILLNESS</div><h2>${S.focus}</h2><p>${onlineMode ? S.onlinePauseNote : S.levels[state.level].goal}</p>`
      + `<button class="primary" data-action="close" data-testid="resume">${S.resume}${icon('play')}</button>`
      + `<div class="pause-actions"><button class="pause-button" data-action="restart" data-testid="restart">${icon('restart')}<span>${S.restartLevel}</span></button><button class="pause-button" data-action="leave" data-testid="leave">${icon('exit')}<span>${onlineMode ? S.leaveRoom : S.mainMenu}</span></button></div>`
      + (onlineMode && !network.host ? `<p class="pause-note">${S.hostControls}</p>` : '')
      + `<section class="pause-whisper" aria-label="${S.tip}"><div class="goal-heading">${icon('leaf')}<span>${S.tip}</span></div><p data-testid="pause-hint">${S.levels[state.level].hints[hintLevel(state)]}</p></section>`
      + chapters
      + `<div class="modal-actions"><button class="text-button" data-action="help">${S.help}</button><button class="text-button" data-action="settings">${S.settings}</button><button class="text-button" data-action="sound" aria-pressed="${sound}">${icon(sound ? 'sound' : 'mute')}<span>${S.sound}</span></button></div>`;
  }
  if (modal === 'confirm-level' && pendingLevel !== null) contents = `<div class="intro-icon">${icon('arrow')}</div><div class="eyebrow">${S.chapter} 0${pendingLevel + 1}</div><h2>${S.levelBothTitle(S.levels[pendingLevel].name)}</h2><p>${S.levelBothBody}</p><button class="primary" data-action="confirm-level" data-testid="confirm-level">${S.levelBoth}${icon('arrow')}</button><div class="modal-actions"><button class="text-button" data-action="pause" data-testid="cancel-level">${S.cancel}</button></div>`;
  if (modal === 'warning') contents = `${close}<div class="intro-icon">${icon('restart')}</div><div class="eyebrow">${S.chapter} 0${state.level + 1} · ${S.levels[state.level].en}</div><h2>${S.warningTitle}</h2><p data-testid="warning-reason">${S.warningReasons[state.failure] || ''}</p><button class="primary" data-action="rewind-restart" data-testid="warning-restart">${S.warningRestart}${icon('restart')}</button>${onlineMode && !network.host ? `<p class="pause-note">${S.warningHostOnly}</p>` : ''}<div class="modal-actions"><button class="text-button" data-action="close" data-testid="warning-close">${S.keepTrying}</button></div>`;
  if (modal === 'confirm-restart') contents = `<div class="intro-icon">${icon('restart')}</div><div class="eyebrow">${S.restartLevel}</div><h2>${S.restartBothTitle}</h2><p>${S.restartBothBody}</p><button class="primary" data-action="confirm-restart" data-testid="confirm-restart">${S.restartBoth}${icon('restart')}</button><div class="modal-actions"><button class="text-button" data-action="pause" data-testid="cancel-restart">${S.cancel}</button></div>`;
  if (modal === 'win') contents = `<div class="intro-icon">${icon('leaf')}</div><div class="eyebrow">CHAMBER 0${state.level + 1} · RESTORED</div><h2>${state.level === levelCount - 1 ? S.complete : S.chamberComplete}</h2><p>${state.level === levelCount - 1 ? S.completeBody : S.chamberCompleteBody}</p><p>${S.clear} ${clock(state.elapsed)} · ${S.best} ${clock(best[state.level] ?? state.elapsed)}</p><div class="win-stars">✦ ${state.shards[0].taken ? '✦' : '◇'} ✦</div><p>${S.memory} ${state.shards.filter(s => s.taken).length} / ${state.shards.length}</p><button class="primary" data-action="next" data-testid="next">${state.level === levelCount - 1 ? S.replay : S.next}${icon('arrow')}</button>`;
  if (modal === 'intro') {
    root.innerHTML = `<section class="entry-screen" role="dialog" aria-modal="true" aria-label="${S.title}"><div class="entry-content"><div class="entry-mark">${icon('moon')}</div><div class="eyebrow">${S.english}</div><h1>${S.title}</h1><p>${S.subtitle}</p><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}" aria-pressed="${mode === 'solo'}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}" aria-pressed="${mode === 'coop'}">${S.coop}</button></div><button class="primary" data-action="start" data-testid="start">${saved.unlocked ? S.continue : S.start}${icon('arrow')}</button><div class="online-entry-actions"><button data-action="create-room" data-testid="create-room">${S.createRoom}</button><button data-action="join-room" data-testid="join-room">${S.joinRoom}</button></div></div><span class="entry-footer"><button class="text-button" data-action="sound" aria-pressed="${sound}">${icon(sound ? 'sound' : 'mute')} Music ${sound ? 'On' : 'Off'}</button> · A COOPERATIVE TIME TALE</span></section>`;
    root.querySelector('.primary').focus({ preventScroll: true }); return;
  }
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal === 'intro' ? S.title : S[modal] || S.title}">${contents}</section></div>`;
  if (onlineMode) {
    if (!network.host) root.querySelectorAll('[data-action="next"],[data-action="restart"],[data-action="rewind-restart"]').forEach(button => { button.disabled = true; button.title = S.hostControls; });
    if (modal === 'win') {
      const back = document.createElement('button'); back.className = 'text-button'; back.dataset.action = 'return-lobby'; back.textContent = S.returnLobby; root.querySelector('.modal').append(back);
    }
  }
  root.querySelector('button.primary:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
}
// Unlock entry music on the first gesture, including clicks on the backdrop.
function unlockEntryMusic() {
  if (modal === 'intro' && sound) {
    music.sync(!document.hidden);
    music.unlock();
  }
}
document.addEventListener('pointerdown', unlockEntryMusic, { capture: true });
document.addEventListener('keydown', unlockEntryMusic, { capture: true });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-level], [data-mode]'); if (!button) return;
  if (entering) return;
  if (['start', 'create-room', 'join-room'].includes(button.dataset.action) && !pwa.sessionAllowed()) return;
  if (button.dataset.action === 'create-room') { enterOnline(); network.create(); return; }
  if (button.dataset.action === 'join-room') { enterOnline(); lobby.showJoin(); return; }
  if (button.dataset.action === 'return-lobby') { clearInputs(); network.returnToLobby(); return; }
  initAudio();
  if (button.dataset.mode) { if (onlineMode) return; mode = button.dataset.mode; clearInputs(); updateUI(); persist(); renderModal(); return; }
  if (button.dataset.level !== undefined) {
    const level = Number(button.dataset.level);
    if ((!modal || modal === 'pause') && !onlineMode) { clearInputs(); dispatch({ type: 'level', level }); modal = null; renderModal(); persist(); canvas.focus({ preventScroll: true }); }
    else if (modal === 'pause' && onlineMode && network.host) { pendingLevel = level; modal = 'confirm-level'; renderModal(); }
    return;
  }
  const action = button.dataset.action;
  if (action === 'start') {
    if (entering) return;
    entering = true; clearInputs(); initAudio();
    const entry = document.querySelector('.entry-screen');
    entry.classList.add('departing');
    const duration = reduced ? 200 : 2000;
    let elapsed = 0, previous;
    function advance(now) {
      if (previous !== undefined && !document.hidden && document.hasFocus()) elapsed += Math.min(now - previous, 50);
      previous = now;
      renderer.setEntryProgress?.(Math.min(1, elapsed / duration));
      if (elapsed < duration) { requestAnimationFrame(advance); return; }
      entering = false; modal = null; accumulator = 0; persist(); renderModal();
      canvas.focus({ preventScroll: true });
    }
    requestAnimationFrame(advance); return;
  }
  if (action === 'sound') { sound = !sound; if (!sound) audioContext?.suspend(); initAudio(); updateUI(); persist(); if (['settings', 'intro', 'pause'].includes(modal)) renderModal(); else if (!modal) canvas.focus({ preventScroll: true }); return; }
  if (action === 'touch-controls') { touchControls = !touchControls; updateUI(); persist(); renderModal(); return; }
  if (action === 'motion') { reduced = !reduced; updateUI(); persist(); renderModal(); return; }
  if (action === 'close') { resume(); return; }
  if (['help', 'settings', 'pause'].includes(action)) { setModal(action); return; }
  if (action === 'restart') {
    if (onlineMode) { if (!network.host) return; modal = 'confirm-restart'; renderModal(); return; }
    requestRestart(); return;
  }
  // A shared restart is a server control action, so both screens reset together (host only).
  if (action === 'confirm-level') { if (!onlineMode || !network.host || pendingLevel === null) return; clearInputs(); dispatch({ type: 'level', level: pendingLevel }); pendingLevel = null; modal = null; renderModal(); canvas.focus({ preventScroll: true }); return; }
  if (action === 'confirm-restart') { if (!onlineMode || !network.host) return; requestRestart(); return; }
  if (action === 'rewind-restart') { if (onlineMode && !network.host) return; requestRestart(); return; }
  if (action === 'leave') { if (onlineMode) leaveOnline(); else returnToMenu(); return; }
  if (action === 'next') { if (onlineMode && !network.host) return; dispatch({ type: 'next' }); modal = null; renderModal(); persist(); return; }
  if (modal) return;
  canvas.focus({ preventScroll: true });
  if (action === 'switch') { clearInputs(); dispatch({ type: 'switch' }); return; }
  dispatch({ type: action });
});
function movement() {
  if (modal || state.status !== 'playing') return;
  const touching = (actor, dir) => joy.actor === actor && joy.dir === dir;
  if (mode === 'coop' && !onlineMode) {
    dispatch({ type: 'move', actor: 0, dir: Number(held.has('KeyD') || touching(0, 1)) - Number(held.has('KeyA') || touching(0, -1)) }, true);
    dispatch({ type: 'move', actor: 1, dir: Number(held.has('ArrowRight') || touching(1, 1)) - Number(held.has('ArrowLeft') || touching(1, -1)) }, true);
  } else dispatch({ type: 'move', dir: Number(held.has('KeyD') || held.has('ArrowRight') || touching(state.active, 1)) - Number(held.has('KeyA') || held.has('ArrowLeft') || touching(state.active, -1)) }, true);
}
document.addEventListener('keydown', event => {
  const code = event.code;
  if (rewind) return;
  if (entering) { event.preventDefault(); return; }
  if (code === 'Escape') { event.preventDefault(); if (modal && !['intro', 'win'].includes(modal)) resume(); else if (!modal) setModal('pause'); return; }
  if (modal) {
    if (code === 'Tab') {
      const buttons = [...document.querySelectorAll('#modal-root button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement);
      const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    }
    return;
  }
  if (event.target.closest('input,textarea,[contenteditable=true]')) return;
  if ((code === 'Tab' && event.shiftKey) || (event.target.closest('button,summary') && ['Space', 'Enter', 'Tab'].includes(code))) return;
  const controls = ['KeyA', 'KeyD', 'KeyW', 'Space', 'KeyE', 'KeyF', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'KeyL'];
  if (!controls.includes(code)) return;
  const actor = onlineMode ? network.actor : mode === 'coop' ? ['ArrowUp', 'Enter', 'KeyL'].includes(code) ? 1 : 0 : state.active;
  const alreadyJumping = keyboardJumpHeld(actor) || touchJumpActor === actor;
  event.preventDefault(); initAudio(); held.add(code); movement(); if (event.repeat) return;
  if (code === 'Tab' && !onlineMode) { clearInputs(); dispatch({ type: 'switch' }); }
  if (['KeyW', 'Space', 'ArrowUp'].includes(code) && !alreadyJumping) dispatch({ type: 'jump', actor });
  if (['KeyE', 'Enter'].includes(code)) dispatch({ type: 'grab', actor });
  if (['KeyF', 'KeyL'].includes(code)) dispatch({ type: 'ability', actor });
});
function keyboardJumpHeld(actor) {
  const keys = mode === 'coop' && !onlineMode ? actor === 0 ? ['KeyW', 'Space'] : ['ArrowUp'] : ['KeyW', 'Space', 'ArrowUp'];
  return keys.some(code => held.has(code));
}
document.addEventListener('keyup', event => {
  held.delete(event.code);
  if (['KeyW', 'Space', 'ArrowUp'].includes(event.code) && !modal) {
    const actor = onlineMode ? network.actor : mode === 'coop' ? event.code === 'ArrowUp' ? 1 : 0 : state.active;
    if (!keyboardJumpHeld(actor) && touchJumpActor !== actor) dispatch({ type: 'jumpRelease', actor }, true);
  }
  movement();
});
// The joystick only sends horizontal movement. Jump owns a separate pointer and shares the keyboard's jump state.
const joystick = document.querySelector('.joystick');
const joystickBase = joystick.querySelector('.joystick-base');
const touchActor = () => onlineMode ? network.actor : state.active;
// On the ground or within coyote time (just stepped off a ledge). Online this is the locally predicted
// character, which is what the player sees.
function canJumpNow(actor) {
  const p = onlineMode ? network.ownActor : state.actors[actor];
  return !!p && (p.grounded || p.coyote > 0);
}
function applyStick() {
  const reading = readJoystick(joy.dx, joy.dy, joy.dir);
  const travel = joystickBase.clientWidth * 0.3;
  joystick.style.setProperty('--tx', `${(reading.x * travel).toFixed(1)}px`);
  joystick.style.setProperty('--ty', `${(reading.y * travel).toFixed(1)}px`);
  if (reading.dir !== joy.dir) { joy.dir = reading.dir; movement(); }
}
function readStick(event) {
  const rect = joystickBase.getBoundingClientRect(), radius = rect.width / 2 || 1;
  joy.dx = (event.clientX - rect.left - radius) / radius; joy.dy = (event.clientY - rect.top - radius) / radius;
  applyStick();
}
function releaseStick() {
  if (joy.pointer === null) return;
  Object.assign(joy, { pointer: null, actor: null, dx: 0, dy: 0, dir: 0 });
  joystick.classList.remove('active'); joystick.style.setProperty('--tx', '0px'); joystick.style.setProperty('--ty', '0px');
  movement();
}
joystick.addEventListener('pointerdown', event => {
  if (modal || entering || rewind || event.button !== 0 || joy.pointer !== null) return;
  event.preventDefault(); initAudio();
  try { joystick.setPointerCapture(event.pointerId); } catch { }
  joy.pointer = event.pointerId; joy.actor = touchActor(); joystick.classList.add('active'); readStick(event);
});
joystick.addEventListener('pointermove', event => { if (event.pointerId === joy.pointer) { event.preventDefault(); readStick(event); } });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(name, event => { if (event.pointerId === joy.pointer) releaseStick(); });

function releaseTouchJump() {
  const actor = touchJumpActor; touchJumpActor = null;
  if (actor !== null && !keyboardJumpHeld(actor)) dispatch({ type: 'jumpRelease', actor }, true);
}

function touchAction(type) {
  if (type === 'switch') {
    if (onlineMode) return;
    const stick = joy.pointer !== null && joystick.hasPointerCapture?.(joy.pointer) ? { pointer: joy.pointer, dx: joy.dx, dy: joy.dy } : null;
    clearInputs(); dispatch({ type: 'switch' });
    if (stick) { Object.assign(joy, stick, { actor: touchActor() }); joystick.classList.add('active'); applyStick(); }
    return;
  }
  const actor = touchActor();
  if (type === 'jump') {
    touchJumpActor = actor;
    if (!keyboardJumpHeld(actor) && canJumpNow(actor)) dispatch({ type, actor }, true);
  } else dispatch({ type, actor });
}
// Each circle captures only its own pointer, so presses coexist with held movement and with each other.
for (const button of document.querySelectorAll('[data-touch]')) {
  button.addEventListener('pointerdown', event => {
    if (modal || entering || rewind || event.button !== 0 || touchPointers.has(button)) return;
    event.preventDefault(); initAudio();
    try { button.setPointerCapture(event.pointerId); } catch { }
    touchAction(button.dataset.touch);
    touchPointers.set(button, event.pointerId); button.classList.add('pressed');
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, event => {
    if (touchPointers.get(button) !== event.pointerId) return;
    touchPointers.delete(button); button.classList.remove('pressed');
    if (button.dataset.touch === 'jump') releaseTouchJump();
  });
  // Keyboard / switch-access activation (pointer taps were already handled on pointerdown).
  button.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
  button.addEventListener('click', event => {
    if (event.detail !== 0 || modal || entering || rewind || touchPointers.has(button)) return;
    touchAction(button.dataset.touch);
    if (button.dataset.touch === 'jump') releaseTouchJump();
  });
}
const interactButton = document.querySelector('.touch-interact');
const abilityButton = document.querySelector('.touch-ability');
function updateTouchControls(view) {
  if (!document.body.classList.contains('touch-layout') || !view?.actors) return;
  const actor = onlineMode ? network.actor : view.active;
  const interaction = interactionFor(view, actor);
  const next = `${actor}:${interaction.kind}:${interaction.available}`;
  if (next === touchKey) return;
  touchKey = next;
  abilityButton.classList.toggle('bloom', actor === 1);
  abilityButton.innerHTML = `${icon(actor === 1 ? 'leaf' : 'snow')}<span>${S.ability[actor]}</span>`;
  abilityButton.setAttribute('aria-label', S.ability[actor]);
  interactButton.classList.toggle('bloom', actor === 1);
  interactButton.classList.toggle('unavailable', !interaction.available);
  interactButton.dataset.kind = interaction.kind;
  interactButton.innerHTML = `${icon(interaction.kind)}<span>${S.interact[interaction.kind]}</span>`;
  interactButton.setAttribute('aria-label', S.interact[interaction.kind]);
}

// ---- Keep the browser's own long-press / selection / drag / pinch behaviour off the game surface only. ----
// The lobby, room-code input and dialogs live outside .shell and keep normal text behaviour.
const gameSurface = document.querySelector('.shell');
for (const type of ['contextmenu', 'selectstart', 'dragstart']) gameSurface.addEventListener(type, event => event.preventDefault());
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, event => { if (event.target?.closest?.('.shell')) event.preventDefault(); }, { passive: false });
gameSurface.addEventListener('dblclick', event => event.preventDefault());

// ---- Tap a time object in the world to use your character's ability on it (touch layout only). ----
// The tap becomes the existing Ability action with an explicit target, so reach and rules stay
// server-authoritative online; this only explains locally why a tap could not act.
function toggleFreeze(view, point) {
  const area = freezeAreaAt(view, point);
  if (area) {
    tapEffect = freezePreview = null;
    dispatch({ type: 'ability', actor: 0, area: area.id });
    return { result: 'cancel' };
  }
  const result = freezeCheck(view, point);
  tapEffect = { x: point.x, y: point.y, at: performance.now(), ok: result === 'ok', ring: result === 'range' ? 0 : null, ringRadius: meta.freeze.range, area: true };
  if (result === 'ok') { document.querySelector('#toast').classList.remove('show'); dispatch({ type: 'ability', actor: 0, x: point.x, y: point.y }); }
  else if (result === 'noCharges') toast(S.noCharges);
  else if (result === 'range') toast(S.freezeTooFar);
  return { result };
}
function tapWorld(clientX, clientY) {
  const view = lastView, camera = renderer.inspect().camera;
  if (!view || !camera || view.status !== 'playing' || rewind) return { result: 'idle' };
  const point = renderer.worldPoint(clientX, clientY);
  if (!point) return { result: 'idle' };
  if (touchActor() === 0) return toggleFreeze(view, point);
  const hit = timeObjectAt(view, point, Math.max(12, 30 / camera.scale));
  if (!hit) return { result: 'empty' };
  const actor = touchActor();
  const result = abilityCheck(view, actor, hit.id), at = anchor(hit);
  tapEffect = { x: at.x, y: at.y, at: performance.now(), ok: result === 'ok', ring: result === 'range' ? actor : null };
  if (result === 'ok') { document.querySelector('#toast').classList.remove('show'); dispatch({ type: 'ability', actor, target: hit.id }); }
  else toast(result === 'range' ? S.tapTooFar : result === 'unsupported' ? S.tapUnsupported[actor] : result === 'maxSpeed' ? S.errors.maxSpeed : S.errors.invalid);
  return { result, target: hit.id };
}
// With a mouse (no touch layout), clicking the world places Still's Freeze Area; Bloom keeps F / L.
// Locally that is always Still's power; online only the Still player's clicks cast.
const mouseCasts = () => !document.body.classList.contains('touch-layout') && (!onlineMode || network.actor === 0);
canvas.addEventListener('pointerdown', event => {
  canvas.focus({ preventScroll: true });
  if (modal || entering || rewind || event.button !== 0) return;
  if (document.body.classList.contains('touch-layout')) { event.preventDefault(); initAudio(); tapWorld(event.clientX, event.clientY); return; }
  if (event.pointerType !== 'mouse' || !mouseCasts()) return;
  const point = renderer.worldPoint(event.clientX, event.clientY);
  if (point && lastView?.status === 'playing') { initAudio(); toggleFreeze(lastView, point); }
});
canvas.addEventListener('pointermove', event => {
  freezePreview = event.pointerType === 'mouse' && mouseCasts() && !modal && !rewind ? renderer.worldPoint(event.clientX, event.clientY) : null;
});
canvas.addEventListener('pointerleave', () => { freezePreview = null; });
window.addEventListener('blur', () => { clearInputs(); if (!onlineMode && !modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); });
window.addEventListener('orientationchange', () => clearInputs());
// A hidden tab stops drawing frames. A local rewind picks up where it left off; an online one follows the
// server's clock, so it simply catches up (the server has already installed the start).
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = performance.now(); clearInputs(); if (!onlineMode && !modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); return; }
  if (rewind && !rewind.online && hiddenAt !== null) rewind.start += performance.now() - hiddenAt;
  hiddenAt = null;
  if (onlineMode) network.wake();
});
window.addEventListener('pageshow', () => { if (onlineMode) network.wake(); });
touchMedia.addEventListener('change', updateUI);
window.__moonclock = {
  snapshot: () => ({ ...viewFor(state, onlineMode ? network.playerId : 'local'), phase: modal || state.status, players: structuredClone(state.actors) }),
  presentation: () => renderer.inspect(),
  history: () => ({ frames: history.frames.length, stride: history.stride, bytes: history.bytes(), first: history.frames[0]?.tick ?? null, last: history.frames[history.frames.length - 1]?.tick ?? null }),
  rewind: () => rewind && { progress: rewind.u, frames: rewind.frames.length, online: rewind.online },
  connection: () => ({ online: onlineMode, status: networkStatus, room: network.room, playerId: network.playerId, actor: network.actor }),
  dispatch: action => { if (action.type === 'tick' && action.count) { for (let i = 0; i < Math.min(1800, action.count); i++) { dispatch({ type: 'tick' }, true); history.record(state); } } else dispatch(action); return window.__moonclock.snapshot(); },
};
let previousTick = null;
function blendTicks(a, b, t) {
  const mix = (p, q) => Math.hypot(q.x - p.x, q.y - p.y) > 80 ? q : { ...q, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  const before = new Map(a.objects.map(o => [o.id, o]));
  return {
    ...b,
    actors: b.actors.map((q, i) => a.actors[i] ? mix(a.actors[i], q) : q),
    objects: b.objects.map(q => { const p = before.get(q.id); return p && Number.isFinite(p.y) && Number.isFinite(q.y) ? mix(p, q) : q; }),
  };
}
function frame(time) {
  music.sync(sound && !document.hidden && (modal === 'intro' || entering || !modal || modal === 'win'));
  pwa.refresh();
  if (lastTime === 0) lastTime = time;
  accumulator += Math.min(100, time - lastTime); lastTime = time;
  const step = 1000 / 60;
  if (!onlineMode && !modal && !rewind && state.status === 'playing') { while (accumulator >= step) { previousTick = state; dispatch({ type: 'tick' }, true); history.record(state); accumulator -= step; } } else accumulator = 0;
  let rewindView = null, rewindInfo = null;
  if (rewind) {
    const now = performance.now(), u = Math.min(1, (now - rewind.start) / rewind.duration);
    rewind.u = u;
    rewindView = { ...state, ...rewindFrame(rewind.frames, u), status: 'rewinding', events: [] };
    rewindInfo = { progress: u, ghosts: [.035, .07].map(d => rewindFrame(rewind.frames, Math.max(0, u - d))) };
    // Online, the final picture holds until the server's fresh start arrives (with a safety timeout).
    if (u >= 1 && (!rewind.online || rewind.arrived || now - rewind.start > rewind.duration + 3000)) finishRewind();
  }
  // Local play: the simulation runs at 60 ticks/s but the screen may refresh faster (120 Hz iPads) or out
  // of step, so draw positions blended between the last two ticks instead of holding/jumping frames.
  const smooth = !onlineMode && !modal && state.status === 'playing' && previousTick?.level === state.level && previousTick.tick === state.tick - 1;
  const liveView = onlineMode ? network.render(Math.min(.1, (time - (frame.previous ?? time)) / 1000), time) || state : smooth ? blendTicks(previousTick, state, accumulator / step) : state;
  const displayState = rewindView && rewind ? rewindView : liveView;
  frame.previous = time;
  // Online, a local menu does not stop the shared world, so keep animating behind it.
  const localMenu = ['pause', 'help', 'settings', 'confirm-restart', 'confirm-level'].includes(modal);
  const worldPaused = (onlineMode ? modal !== null && !localMenu : !!modal) || state.status !== 'playing' || (onlineMode && (!network.connected || network.room?.suspended));
  const touch = touchLayout(), viewActor = onlineMode ? network.actor : state.active;
  const cancelPreview = freezePreview && freezeAreaAt(displayState, freezePreview);
  lastView = displayState;
  const tapAge = tapEffect ? (performance.now() - tapEffect.at) / 1400 : 1;
  if (tapAge >= 1) tapEffect = null;
  renderer.draw(displayState, time, {
    reduced, mode: touch ? 'coop' : onlineMode ? 'solo' : mode, paused: worldPaused && !rewindInfo, sceneKey, cameraReset,
    target: touch && viewActor === 0 ? null : targetFor(state, state.active)?.id,
    touch, tappable: touch && viewActor === 1 && displayState.status === 'playing' ? new Set(abilityTargets(displayState, viewActor).map(o => o.id)) : null,
    rewind: rewindInfo,
    preview: freezePreview && displayState.status === 'playing' ? cancelPreview ? { ...cancelPreview, cancel: true } : { ...freezePreview, radius: meta.freeze.radius, valid: freezeCheck(displayState, freezePreview) === 'ok' } : null,
    tap: tapEffect && { ...tapEffect, age: tapAge },
    bottomInset: touch ? controlsReserve : 0,
  });
  updateTouchControls(displayState);
  if (touch && !tapIntroShown && !modal && !entering && state.status === 'playing') { tapIntroShown = true; toast(S.tapIntro); }
  checkWarning();
  frameCount++; if (frameCount % 10 === 0) updateUI();
  if (debug) { const el = document.querySelector('#debug'); el.hidden = false; el.textContent = `tick ${state.tick} | phase ${modal || state.status}\nentities ${state.actors.length + state.objects.length}\nactor ${state.active} | ${Math.round(state.actors[state.active].x)},${Math.round(state.actors[state.active].y)}`; }
  requestAnimationFrame(frame);
}
updateUI(); renderModal();
// Try immediately; trusted gestures remain a fallback for autoplay restrictions.
if (sound) {
  music.sync(!document.hidden);
  music.unlock();
}
requestAnimationFrame(frame);
if (network.restore()) enterOnline();
