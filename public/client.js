import { playEffect } from './sfx.js';
import { createMusic } from './music.js';
import { setup, applyAction, validateAction, viewFor, targetFor, hintLevel, levelCount } from '../src/logic.js';
import { S } from './strings.js';
import { createRenderer } from './render.js';
import { createNetwork } from './network.js';
import { createLobby } from './lobby.js';

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
  rewind: '<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6m2-2v5l4 2"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
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
let reduced = saved.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let best = Array.from({ length: levelCount }, (_, i) => Array.isArray(saved.best) && Number.isFinite(saved.best[i]) ? saved.best[i] : null);
let modal = 'intro', seenEvent = 0, shownHint = 0, toastTimer, audioContext;
const clock = ticks => { const sec = Math.floor(ticks / 60); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
let lastTime = 0, accumulator = 0, frameCount = 0, sceneKey = 0, cameraReset = 0;
let onlineMode = false, networkEpoch = null, networkStatus = 'offline';
const held = new Set();
const touchMoves = new Map();
let touchJumpActor = null, uiChapter = '', uiProgress = '', uiMode = '';
const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div class="brand"><div class="brand-mark">${icon('moon')}</div><div><h1 class="brand-title">${S.title}</h1><div class="brand-en">${S.english}</div></div><span class="top-note">${S.studio}</span></div>
      <nav class="chapter-nav" id="chapter-nav" aria-label="${S.chapters}"></nav>
      <div class="toolbar"><button class="iconbutton" data-testid="sound" data-action="sound" aria-label="${S.sound}" title="${S.sound}">${icon(sound ? 'sound' : 'mute')}</button><button class="iconbutton" data-testid="help" data-action="help" aria-label="${S.help}" title="${S.help}">${icon('help')}</button><button class="iconbutton" data-testid="settings" data-action="settings" aria-label="${S.settings}" title="${S.settings}">${icon('settings')}</button><button class="iconbutton" data-testid="pause" data-action="pause" aria-label="${S.pause}" title="${S.pause}">${icon('pause')}</button></div>
    </header>
    <main class="game-frame">
      <canvas id="game" aria-label="${S.title}" tabindex="0"></canvas>
      <section class="goal-panel" aria-label="${S.objective}">
        <div class="eyebrow" id="chapter-en"></div><h2 id="chapter-name"></h2>
        <div class="goal-heading">${icon('arrow')}<span>${S.objective}</span><span id="goal-count"></span></div>
        <p id="objective"></p><ul class="checklist" id="checklist" aria-live="polite"></ul>
      </section>
      <details class="hint-panel"><summary>${icon('leaf')}<span>${S.tip}</span><span class="hint-dot" aria-hidden="true"></span></summary><p id="tip"></p></details>
      <div class="game-bottom"><div class="status-strip"><span class="live-dot"></span><span id="hud"></span><span id="stage-count"></span></div>
        <div class="action-strip"><span class="controls-strip" id="controls"></span><button class="ability-chip" data-action="ability" id="ability" data-testid="ability">${icon('snow')}<span id="ability-label"></span>${key('F')}</button><button class="text-button switch-button" data-action="switch" aria-label="${S.switchRole}">${icon('swap')}${key('Tab')}</button><button class="text-button" data-action="rewind" data-testid="rewind">${icon('rewind')}<span>${S.rewind}</span>${key('R')}</button></div>
      </div>
      <div class="touch-controls"><div class="touch-group"><button data-hold="-1" aria-label="${S.move}">${icon('left')}</button><button data-hold="1" aria-label="${S.move}">${icon('right')}</button><button data-jump aria-label="${S.jump}">${icon('up')}</button></div><div class="touch-group"><button data-action="grab" class="action">${S.touchGrab}</button><button data-action="ability" class="action" data-testid="touch-ability">${S.ability[0]}</button><button data-action="switch" aria-label="${S.switchRole}">${icon('swap')}</button></div></div>
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
    if (game.status === 'paused' && previousStatus !== 'paused') { held.clear(); touchMoves.clear(); touchJumpActor = null; }
    if (networkEpoch !== info.epoch) {
      networkEpoch = info.epoch; sceneKey++; cameraReset++; seenEvent = state.eventSeq;
      shownHint = 0; uiChapter = ''; held.clear(); touchMoves.clear(); touchJumpActor = null;
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
  onConnection(status) { networkStatus = status; lobby.setConnection(status); if (status !== 'connected') { held.clear(); touchMoves.clear(); touchJumpActor = null; } },
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
function enterOnline() {
  clearInputs(); onlineMode = true; modal = 'online'; entering = false;
  renderer.setEntryProgress?.(1); document.body.classList.add('online-mode'); renderModal();
}
function leaveOnline() {
  network.leave(); lobby.hide(); onlineMode = false; networkEpoch = null;
  document.body.classList.remove('online-mode');
  state = setup({ level: Number.isInteger(saved.level) ? saved.level : 0 });
  sceneKey++; seenEvent = 0; uiChapter = ''; uiMode = ''; modal = 'intro';
  renderer.setEntryProgress?.(0); updateUI(); renderModal();
}

function persist() {
  try { localStorage.setItem('moonclock-v1', JSON.stringify({ level: state.level, unlocked: state.unlocked, mode, sound, reduced, best })); } catch { }
}
function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
function initAudio() {
  music.unlock();
 if (!audioContext && sound) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (audioContext?.state === 'suspended' && sound) audioContext.resume(); }
function chime(event) {
  if (sound && audioContext) playEffect(audioContext, event);
}
function dispatch(action, quiet = false) {
  if (onlineMode) {
    if (action.actor !== undefined && action.actor !== network.actor) return { valid: false };
    if (['switch', 'level', 'tick'].includes(action.type)) return { valid: false };
    return { valid: network.action(action) };
  }
  if (action.actor === undefined && ['move', 'jump', 'jumpRelease', 'grab', 'ability'].includes(action.type)) action = { ...action, actor: state.active };
  const result = validateAction(state, 'local', action);
  if (!result.valid) { if (!quiet) toast(S.errors[result.error]); return result; }
  const oldLevel = state.level, oldStatus = state.status;
  state = applyAction(state, 'local', action);
  if (action.type === 'switch') chime({ kind: 'switch' });
  if (state.level !== oldLevel || ['restart', 'rewind', 'level', 'next'].includes(action.type)) {
    seenEvent = action.type === 'rewind' ? state.eventSeq - 1 : state.eventSeq;
    sceneKey++; if (action.type !== 'rewind') cameraReset++;
    shownHint = 0;
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
  document.querySelector('#tip').textContent = chapter.hints[hint];
  document.querySelector('.hint-panel').classList.toggle('new-hint', hint > 0);
  if (hint > shownHint) toast(S.hintReady);
  shownHint = hint;
  document.querySelector('#hud').textContent = `${S.memory} ${state.shards.filter(s => s.taken).length}/${state.shards.length} · ${S.rewinds} ${state.rewindsLeft} · ${clock(state.elapsed)}`;
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
  document.querySelector('[data-testid="touch-ability"]').textContent = S.ability[state.active];
  document.body.classList.toggle('reduced-motion', reduced);
}
function clearInputs() {
  held.clear(); touchMoves.clear(); touchJumpActor = null;
  for (let i = 0; i < 2; i++) { if (onlineMode && i !== network.actor) continue; dispatch({ type: 'move', actor: i, dir: 0 }, true); dispatch({ type: 'jumpRelease', actor: i }, true); }
}
function setModal(type) {
  if (type && modal === null && state.status === 'playing') { clearInputs(); if (onlineMode) network.pause(true); else dispatch({ type: 'pause' }, true); }
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
  if (modal === 'help') contents = `${close}<div class="intro-icon">${icon('help')}</div><h2>${S.helpTitle}</h2><p>${S.helpBody}</p><div class="help-grid">${S.keys.map(([k, v]) => `${key(k)}<span>${v}</span>`).join('')}</div><p>${S.coopKeys}</p><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'settings') contents = `${close}<div class="intro-icon">${icon('settings')}</div><h2>${S.settings}</h2><p class="music-credit">Gymnopédie No. 1 · Erik Satie<br>Performed by <a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100787" target="_blank" rel="noopener">Kevin MacLeod</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>Excerpt 0:00–0:50; fades applied.</p><div class="settings-row"><span>${S.sound}</span><button class="toggle" role="switch" aria-checked="${sound}" data-action="sound" aria-label="${S.sound}" data-testid="setting-sound"></button></div><div class="settings-row"><span>${S.motion}</span><button class="toggle" role="switch" aria-checked="${reduced}" data-action="motion" aria-label="${S.motion}" data-testid="setting-motion"></button></div><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}">${S.coop}</button></div><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'pause') contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">A MOMENT OF STILLNESS</div><h2>${S.focus}</h2><p>${S.levels[state.level].goal}</p><button class="primary" data-action="close" data-testid="resume">${S.resume}${icon('play')}</button><div class="modal-actions"><button class="text-button" data-action="help">${S.help}</button><button class="text-button" data-action="restart">${S.restart}</button></div>`;
  if (modal === 'win') contents = `<div class="intro-icon">${icon('leaf')}</div><div class="eyebrow">CHAMBER 0${state.level + 1} · RESTORED</div><h2>${state.level === levelCount - 1 ? S.complete : S.chamberComplete}</h2><p>${state.level === levelCount - 1 ? S.completeBody : S.chamberCompleteBody}</p><p>${S.clear} ${clock(state.elapsed)} · ${S.best} ${clock(best[state.level] ?? state.elapsed)}</p><div class="win-stars">✦ ${state.shards[0].taken ? '✦' : '◇'} ✦</div><p>${S.memory} ${state.shards.filter(s => s.taken).length} / ${state.shards.length}</p><button class="primary" data-action="next" data-testid="next">${state.level === levelCount - 1 ? S.replay : S.next}${icon('arrow')}</button>`;
  if (modal === 'intro') {
    root.innerHTML = `<section class="entry-screen" role="dialog" aria-modal="true" aria-label="${S.title}"><div class="entry-content"><div class="entry-mark">${icon('moon')}</div><div class="eyebrow">${S.english}</div><h1>${S.title}</h1><p>${S.subtitle}</p><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}" aria-pressed="${mode === 'solo'}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}" aria-pressed="${mode === 'coop'}">${S.coop}</button></div><button class="primary" data-action="start" data-testid="start">${saved.unlocked ? S.continue : S.start}${icon('arrow')}</button><div class="online-entry-actions"><button data-action="create-room" data-testid="create-room">${S.createRoom}</button><button data-action="join-room" data-testid="join-room">${S.joinRoom}</button></div></div><span class="entry-footer"><button class="text-button" data-action="sound" aria-pressed="${sound}">${icon(sound ? 'sound' : 'mute')} Music ${sound ? 'On' : 'Off'}</button> · A COOPERATIVE TIME TALE</span></section>`;
    root.querySelector('.primary').focus({ preventScroll: true }); return;
  }
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal === 'intro' ? S.title : S[modal] || S.title}">${contents}</section></div>`;
  if (onlineMode) {
    if (!network.host) root.querySelectorAll('[data-action="next"],[data-action="restart"]').forEach(button => { button.disabled = true; button.title = S.hostControls; });
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
  if (button.dataset.action === 'create-room') { enterOnline(); network.create(); return; }
  if (button.dataset.action === 'join-room') { enterOnline(); lobby.showJoin(); return; }
  if (button.dataset.action === 'return-lobby') { clearInputs(); network.returnToLobby(); return; }
  initAudio();
  if (button.dataset.mode) { if (onlineMode) return; mode = button.dataset.mode; clearInputs(); updateUI(); persist(); renderModal(); return; }
  if (button.dataset.level !== undefined) { if (!modal && !onlineMode) { clearInputs(); dispatch({ type: 'level', level: Number(button.dataset.level) }); persist(); canvas.focus({ preventScroll: true }); } return; }
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
  if (action === 'sound') { sound = !sound; if (!sound) audioContext?.suspend(); initAudio(); updateUI(); persist(); if (modal === 'settings' || modal === 'intro') renderModal(); else if (!modal) canvas.focus({ preventScroll: true }); return; }
  if (action === 'motion') { reduced = !reduced; updateUI(); persist(); renderModal(); return; }
  if (action === 'close') { resume(); return; }
  if (['help', 'settings', 'pause'].includes(action)) { setModal(action); return; }
  if (action === 'restart') { if (onlineMode && !network.host) return; dispatch({ type: 'restart' }); modal = null; renderModal(); clearInputs(); return; }
  if (action === 'next') { if (onlineMode && !network.host) return; dispatch({ type: 'next' }); modal = null; renderModal(); persist(); return; }
  if (modal) return;
  canvas.focus({ preventScroll: true });
  if (action === 'switch') { clearInputs(); dispatch({ type: 'switch' }); return; }
  if (action === 'rewind') { clearInputs(); dispatch({ type: 'rewind' }); return; }
  dispatch({ type: action });
});
function movement() {
  if (modal || state.status !== 'playing') return;
  const touching = (actor, dir) => [...touchMoves.values()].some(touch => touch.actor === actor && touch.dir === dir);
  if (mode === 'coop' && !onlineMode) {
    dispatch({ type: 'move', actor: 0, dir: Number(held.has('KeyD') || touching(0, 1)) - Number(held.has('KeyA') || touching(0, -1)) }, true);
    dispatch({ type: 'move', actor: 1, dir: Number(held.has('ArrowRight') || touching(1, 1)) - Number(held.has('ArrowLeft') || touching(1, -1)) }, true);
  } else dispatch({ type: 'move', dir: Number(held.has('KeyD') || held.has('ArrowRight') || touching(state.active, 1)) - Number(held.has('KeyA') || held.has('ArrowLeft') || touching(state.active, -1)) }, true);
}
document.addEventListener('keydown', event => {
  const code = event.code;
  if (entering) { event.preventDefault(); return; }
  if (code === 'Escape') { event.preventDefault(); if (modal && modal !== 'intro' && modal !== 'win') resume(); else if (!modal) setModal('pause'); return; }
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
  const controls = ['KeyA', 'KeyD', 'KeyW', 'Space', 'KeyE', 'KeyF', 'KeyR', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'KeyL'];
  if (!controls.includes(code)) return;
  const actor = onlineMode ? network.actor : mode === 'coop' ? ['ArrowUp', 'Enter', 'KeyL'].includes(code) ? 1 : 0 : state.active;
  const alreadyJumping = keyboardJumpHeld(actor) || touchJumpActor === actor;
  event.preventDefault(); initAudio(); held.add(code); movement(); if (event.repeat) return;
  if (code === 'Tab' && !onlineMode) { clearInputs(); dispatch({ type: 'switch' }); }
  if (code === 'KeyR') { clearInputs(); dispatch({ type: 'rewind' }); }
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
document.querySelectorAll('[data-hold]').forEach(button => {
  button.addEventListener('pointerdown', event => { if (modal) return; event.preventDefault(); initAudio(); button.setPointerCapture(event.pointerId); touchMoves.set(event.pointerId, { actor: state.active, dir: Number(button.dataset.hold) }); movement(); });
  const release = event => { touchMoves.delete(event.pointerId); movement(); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
const touchJump = document.querySelector('[data-jump]');
touchJump.addEventListener('pointerdown', event => {
  if (modal || touchJumpActor !== null) return;
  event.preventDefault(); initAudio(); touchJump.setPointerCapture(event.pointerId);
  touchJumpActor = state.active; dispatch({ type: 'jump', actor: touchJumpActor });
});
function releaseTouchJump() {
  if (touchJumpActor === null) return;
  const actor = touchJumpActor; touchJumpActor = null;
  if (!keyboardJumpHeld(actor)) dispatch({ type: 'jumpRelease', actor }, true);
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) touchJump.addEventListener(name, releaseTouchJump);
touchJump.addEventListener('click', event => { if (event.detail === 0 && !modal) { dispatch({ type: 'jump' }); dispatch({ type: 'jumpRelease' }); } });
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
document.querySelector('.hint-panel summary').addEventListener('click', event => { if (event.detail > 0) canvas.focus({ preventScroll: true }); });
window.addEventListener('blur', () => { clearInputs(); if (!onlineMode && !modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInputs(); if (!onlineMode && !modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); } });
window.__moonclock = {
  snapshot: () => ({ ...viewFor(state, onlineMode ? network.playerId : 'local'), phase: modal || state.status, players: structuredClone(state.actors) }),
  presentation: () => renderer.inspect(),
  connection: () => ({ online: onlineMode, status: networkStatus, room: network.room, playerId: network.playerId, actor: network.actor }),
  dispatch: action => { if (action.type === 'tick' && action.count) { for (let i = 0; i < Math.min(1800, action.count); i++) dispatch({ type: 'tick' }, true); } else dispatch(action); return window.__moonclock.snapshot(); },
};
function frame(time) {
  music.sync(sound && !document.hidden && (modal === 'intro' || entering || !modal || modal === 'win'));
  if (lastTime === 0) lastTime = time;
  accumulator += Math.min(100, time - lastTime); lastTime = time;
  if (!onlineMode && !modal && state.status === 'playing') { while (accumulator >= 1000 / 60) { dispatch({ type: 'tick' }, true); accumulator -= 1000 / 60; } } else accumulator = 0;
  const displayState = onlineMode ? network.render(Math.min(.1, (time - (frame.previous ?? time)) / 1000), time) || state : state;
  frame.previous = time;
  renderer.draw(displayState, time, { reduced, mode: onlineMode ? 'solo' : mode, paused: !!modal || state.status !== 'playing' || (onlineMode && (!network.connected || network.room?.suspended)), sceneKey, cameraReset, target: targetFor(state, state.active)?.id });
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
