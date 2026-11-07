import { setup, applyAction, validateAction, viewFor, targetFor, hintLevel } from '../src/logic.js';
import { S } from './strings.js';
import { createRenderer } from './render.js';

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
state.unlocked = Math.max(state.level, Math.min(3, saved.unlocked || 0));
let mode = saved.mode === 'coop' ? 'coop' : 'solo';
let sound = saved.sound !== false;
let reduced = saved.reduced ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let best = Array.isArray(saved.best) ? [0, 1, 2, 3].map(i => Number.isFinite(saved.best[i]) ? saved.best[i] : null) : [null, null, null, null];
let modal = 'intro', seenEvent = 0, shownHint = 0, toastTimer, audioContext;
const clock = ticks => { const sec = Math.floor(ticks / 60); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
let lastTime = 0, accumulator = 0, frameCount = 0;
const held = new Set();
const app = document.querySelector('#app');
app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div class="brand"><div class="brand-mark">${icon('moon')}</div><div><h1 class="brand-title">${S.title}</h1><div class="brand-en">${S.english}</div></div><span class="top-note">${S.studio}</span></div>
      <div class="toolbar"><span class="room-pill">${S.connected}</span><span class="divider"></span><button class="iconbutton" data-testid="sound" data-action="sound" aria-label="${S.sound}" title="${S.sound}">${icon(sound ? 'sound' : 'mute')}</button><button class="iconbutton" data-testid="help" data-action="help" aria-label="${S.help}" title="${S.help}">${icon('help')}</button><button class="iconbutton" data-testid="settings" data-action="settings" aria-label="${S.settings}" title="${S.settings}">${icon('settings')}</button><button class="iconbutton" data-testid="pause" data-action="pause" aria-label="${S.pause}" title="${S.pause}">${icon('pause')}</button></div>
    </header>
    <div class="layout"><main class="main"><div class="chapterbar"><div><div class="eyebrow" id="chapter-en"></div><h2 class="chapter-name" id="chapter-name"></h2></div><nav class="chapter-nav" id="chapter-nav" aria-label="${S.chapters}"></nav></div>
      <div class="game-frame"><canvas id="game" aria-label="${S.title}" tabindex="0"></canvas><div class="frame-label">HORTUS · TEMPORIS</div><div class="stage-corner" id="hud"></div><div class="stage-count" id="stage-count"></div><div class="toast" role="status" id="toast"></div><div class="debug" id="debug" hidden></div></div>
      <div class="under-stage"><div class="controls-strip"><span>${key('A D')}${S.move}</span><span>${key('Space')}${S.jump}</span><span>${key('E')}${S.grab}</span><span class="mobile-hide">${key('Tab')}${S.switchRole}</span></div><button class="text-button" data-action="rewind" data-testid="rewind">${icon('rewind')}${S.rewind}</button></div>
      <div class="touch-controls"><div class="touch-group"><button data-hold="-1" aria-label="${S.move}">${icon('left')}</button><button data-hold="1" aria-label="${S.move}">${icon('right')}</button><button data-action="jump" aria-label="${S.jump}">${icon('up')}</button></div><div class="touch-group"><button data-action="grab" class="action">${S.grab}</button><button data-action="ability" class="action" data-testid="touch-ability">${S.ability[0]}</button><button data-action="rewind" aria-label="${S.rewind}">${icon('rewind')}</button></div></div>
      <div class="quote" id="quote"></div>
    </main><aside class="sidebar"><section class="role-section"><div class="section-kicker">${S.current}</div><div class="roles">${[0, 1].map(i => `<div class="role-card ${i ? 'bloom' : ''}" data-role="${i}" data-testid="role-${i}" role="button" tabindex="0" aria-label="${S.roleNames[i]}"><div class="role-portrait">${icon('guardian')}</div><div><strong class="role-name">${S.roleNames[i]}</strong><span class="role-en">${S.roleLabels[i]}</span></div><span class="role-badge" id="badge-${i}"></span><p class="role-help">${S.roleDescriptions[i]}</p><div class="role-tools"><button class="ability-button" data-action="ability" data-actor="${i}" data-testid="ability-${i}">${icon(i ? 'leaf' : 'snow')}${S.ability[i]}</button>${key('F')}</div></div>`).join('')}</div></section>
      <section class="objective-card"><div class="section-kicker">${S.objective}</div><p class="objective-text" id="objective"></p><ul class="checklist" id="checklist"></ul></section>
      <section class="tip-card"><div class="tip-heading">${icon('leaf')}${S.tip}</div><p class="tip-content" id="tip"></p></section><div class="side-actions"><button class="text-button" data-action="restart" data-testid="restart">${icon('restart')}${S.restart}</button></div>
    </aside></div><footer class="footer"><small>EST. IN A MOMENT · MMXXVI</small><span class="gold">${S.english} / ${S.subtitle}</span><small>01 — 04 · A TIMELESS GARDEN</small></footer>
  </div><div id="modal-root"></div>`;
const canvas = document.querySelector('#game');
const renderer = createRenderer(canvas, S);
const debug = new URLSearchParams(location.search).has('debug');
function persist() {
  try { localStorage.setItem('moonclock-v1', JSON.stringify({ level: state.level, unlocked: state.unlocked, mode, sound, reduced, best })); } catch { }
}
function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
function initAudio() { if (!audioContext && sound) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (audioContext?.state === 'suspended' && sound) audioContext.resume(); }
function chime(kind) {
  if (!sound || !audioContext || !['freeze', 'unfreeze', 'grow', 'wake', 'plant', 'vanish', 'shard', 'win', 'throw', 'return', 'rewind'].includes(kind)) return;
  const now = audioContext.currentTime; const notes = kind === 'win' ? [392, 493.88, 587.33, 783.99] : kind === 'grow' || kind === 'wake' ? [392, 587.33] : kind === 'freeze' ? [880, 1320] : kind === 'plant' ? [293.66, 440] : kind === 'vanish' ? [220] : [440];
  notes.forEach((frequency, i) => { const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now + i * .075); gain.gain.setValueAtTime(0, now + i * .075); gain.gain.linearRampToValueAtTime(.025, now + i * .075 + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + i * .075 + .55); osc.connect(gain); gain.connect(audioContext.destination); osc.start(now + i * .075); osc.stop(now + i * .075 + .6); });
}
function dispatch(action, quiet = false) {
  if (action.actor === undefined && ['move', 'jump', 'grab', 'ability'].includes(action.type)) action = { ...action, actor: state.active };
  const result = validateAction(state, 'local', action);
  if (!result.valid) { if (!quiet) toast(S.errors[result.error]); return result; }
  const oldLevel = state.level, oldStatus = state.status;
  state = applyAction(state, 'local', action);
  if (state.level !== oldLevel || ['restart', 'rewind', 'level', 'next'].includes(action.type)) { seenEvent = action.type === 'rewind' ? state.eventSeq - 1 : state.eventSeq; }
  for (const e of state.events) if (e.id > seenEvent) { chime(e.kind); seenEvent = e.id; }
  if (state.status === 'won' && oldStatus !== 'won') { held.clear(); best[state.level] = Math.min(best[state.level] ?? Infinity, state.elapsed); modal = 'win'; persist(); renderModal(); }
  if (action.type !== 'tick' || state.status !== oldStatus) updateUI();
  return { valid: true };
}
function updateUI() {
  const chapter = S.levels[state.level]; document.querySelector('#chapter-en').textContent = `${S.chapter} 0${state.level + 1} / ${chapter.en}`; document.querySelector('#chapter-name').textContent = chapter.name;
  document.querySelector('#objective').textContent = chapter.goal; const hint = hintLevel(state); document.querySelector('#tip').textContent = chapter.hints[hint];
  if (hint > shownHint) { const card = document.querySelector('.tip-card'); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  shownHint = hint;
  document.querySelector('#hud').textContent = `${S.seeds} ${state.objects.filter(o => o.kind === 'seed').length} · ${S.rewinds} ${state.rewindsLeft} · ${S.time} ${clock(state.elapsed)}`; document.querySelector('#quote').textContent = chapter.lesson;
  document.querySelector('#stage-count').textContent = `0${state.level + 1} / 04`;
  document.querySelector('#chapter-nav').innerHTML = [0, 1, 2, 3].map((i) => `${i ? '<span class="chapter-connector"></span>' : ''}<button class="chapter-button ${i === state.level ? 'active' : ''} ${i < state.unlocked ? 'done' : ''}" data-level="${i}" ${i > state.unlocked ? 'disabled' : ''} aria-label="${S.levels[i].name}" ${i === state.level ? 'aria-current="step"' : ''}>${String(i + 1).padStart(2, '0')}</button>`).join('');
  document.querySelector('#checklist').innerHTML = state.needs.map(k => `<li class="${state.flags[k] ? 'done' : ''}">${S.flags[k]}</li>`).join('');
  document.querySelectorAll('[data-role]').forEach(el => { const i = Number(el.dataset.role); el.classList.toggle('active', i === state.active); el.setAttribute('aria-pressed', String(i === state.active)); document.querySelector(`#badge-${i}`).textContent = i === state.active ? S.current : 'Tab'; });
  document.querySelector('[data-testid="sound"]').innerHTML = icon(sound ? 'sound' : 'mute');
  document.querySelector('[data-testid="touch-ability"]').textContent = S.ability[state.active];
  document.body.classList.toggle('reduced-motion', reduced);
}
function clearInputs() { held.clear(); for (let i = 0; i < 2; i++) dispatch({ type: 'move', actor: i, dir: 0 }, true); }
function setModal(type) {
  if (type && modal === null && state.status === 'playing') { clearInputs(); dispatch({ type: 'pause' }, true); }
  modal = type; renderModal();
}
function resume() { modal = null; if (state.status === 'paused') dispatch({ type: 'pause' }, true); accumulator = 0; renderModal(); canvas.focus({ preventScroll: true }); }
function renderModal() {
  const root = document.querySelector('#modal-root');
  if (!modal) { root.innerHTML = ''; return; }
  let contents = '';
  const close = `<button class="iconbutton close" data-action="close" aria-label="${S.close}">${icon('close')}</button>`;
  if (modal === 'intro') contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">${S.english} · A COOPERATIVE TIME TALE</div><h1>${S.title}</h1><p>${S.intro}<br>${S.introBody}</p><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}" data-testid="mode-solo">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}" data-testid="mode-coop">${S.coop}</button></div><button class="primary" data-action="start" data-testid="start">${saved.unlocked ? S.continue : S.start}${icon('arrow')}</button><p class="intro-foot">${S.subtitle}</p>`;
  if (modal === 'help') contents = `${close}<div class="intro-icon">${icon('help')}</div><h2>${S.helpTitle}</h2><p>${S.helpBody}</p><div class="help-grid">${S.keys.map(([k, v]) => `${key(k)}<span>${v}</span>`).join('')}</div><p>${S.coopKeys}</p><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'settings') contents = `${close}<div class="intro-icon">${icon('settings')}</div><h2>${S.settings}</h2><div class="settings-row"><span>${S.sound}</span><button class="toggle" role="switch" aria-checked="${sound}" data-action="sound" aria-label="${S.sound}" data-testid="setting-sound"></button></div><div class="settings-row"><span>${S.motion}</span><button class="toggle" role="switch" aria-checked="${reduced}" data-action="motion" aria-label="${S.motion}" data-testid="setting-motion"></button></div><div class="mode-selector"><button data-mode="solo" class="${mode === 'solo' ? 'selected' : ''}">${S.solo}</button><button data-mode="coop" class="${mode === 'coop' ? 'selected' : ''}">${S.coop}</button></div><button class="primary" data-action="close">${S.continue}${icon('arrow')}</button>`;
  if (modal === 'pause') contents = `<div class="intro-icon">${icon('moon')}</div><div class="eyebrow">A MOMENT OF STILLNESS</div><h2>${S.focus}</h2><p>${S.levels[state.level].goal}</p><button class="primary" data-action="close" data-testid="resume">${S.resume}${icon('play')}</button><div class="modal-actions"><button class="text-button" data-action="help">${S.help}</button><button class="text-button" data-action="restart">${S.restart}</button></div>`;
  if (modal === 'win') contents = `<div class="intro-icon">${icon('leaf')}</div><div class="eyebrow">CHAMBER 0${state.level + 1} · RESTORED</div><h2>${state.level === 3 ? S.complete : S.chamberComplete}</h2><p>${state.level === 3 ? S.completeBody : S.chamberCompleteBody}</p><p>${S.clear} ${clock(state.elapsed)} · ${S.best} ${clock(best[state.level] ?? state.elapsed)}</p><div class="win-stars">✦ ${state.shards[0].taken ? '✦' : '◇'} ✦</div><p>${S.memory} ${state.shards.filter(s => s.taken).length} / ${state.shards.length}</p><button class="primary" data-action="next" data-testid="next">${state.level === 3 ? S.replay : S.next}${icon('arrow')}</button>`;
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${modal === 'intro' ? S.title : S[modal] || S.title}">${contents}</section></div>`;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action], [data-role], [data-level], [data-mode]'); if (!button) return;
  initAudio();
  if (button.dataset.mode) { mode = button.dataset.mode; clearInputs(); persist(); renderModal(); return; }
  if (button.dataset.role !== undefined && !button.dataset.action) { if (modal) return; const i = Number(button.dataset.role); if (state.active !== i) { clearInputs(); dispatch({ type: 'switch' }); } return; }
  if (button.dataset.level !== undefined) { if (!modal) { clearInputs(); dispatch({ type: 'level', level: Number(button.dataset.level) }); persist(); } return; }
  const action = button.dataset.action;
  if (action === 'start') { modal = null; initAudio(); renderModal(); canvas.focus({ preventScroll: true }); return; }
  if (action === 'sound') { sound = !sound; initAudio(); updateUI(); persist(); if (modal === 'settings') renderModal(); return; }
  if (action === 'motion') { reduced = !reduced; updateUI(); persist(); renderModal(); return; }
  if (action === 'close') { resume(); return; }
  if (['help', 'settings', 'pause'].includes(action)) { setModal(action); return; }
  if (action === 'restart') { dispatch({ type: 'restart' }); modal = null; renderModal(); clearInputs(); return; }
  if (action === 'next') { dispatch({ type: 'next' }); modal = null; renderModal(); persist(); return; }
  if (modal) return;
  if (action === 'ability') {
    const actor = button.dataset.actor === undefined ? state.active : Number(button.dataset.actor);
    if (actor !== state.active) { clearInputs(); dispatch({ type: 'switch' }); }
    dispatch({ type: 'ability', actor });
  } else dispatch({ type: action });
});
function movement() {
  if (modal || state.status !== 'playing') return;
  if (mode === 'coop') {
    dispatch({ type: 'move', actor: 0, dir: Number(held.has('KeyD')) - Number(held.has('KeyA')) }, true);
    dispatch({ type: 'move', actor: 1, dir: Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft')) }, true);
  } else dispatch({ type: 'move', dir: Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft')) }, true);
}
document.addEventListener('keydown', event => {
  const code = event.code;
  if (code === 'Space' || code === 'Enter') event.preventDefault();
  if (code === 'Escape') { event.preventDefault(); if (modal && modal !== 'intro' && modal !== 'win') resume(); else if (!modal) setModal('pause'); return; }
  if (modal) return;
  const controls = ['KeyA', 'KeyD', 'KeyW', 'Space', 'KeyE', 'KeyF', 'KeyR', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'KeyL'];
  if (!controls.includes(code)) return;
  event.preventDefault(); initAudio(); held.add(code); movement(); if (event.repeat) return;
  if (code === 'Tab') { clearInputs(); dispatch({ type: 'switch' }); }
  if (code === 'KeyR') dispatch({ type: 'rewind' });
  const actor = mode === 'coop' ? ['ArrowUp', 'Enter', 'KeyL'].includes(code) ? 1 : 0 : state.active;
  if (['KeyW', 'Space', 'ArrowUp'].includes(code)) dispatch({ type: 'jump', actor });
  if (['KeyE', 'Enter'].includes(code)) dispatch({ type: 'grab', actor });
  if (['KeyF', 'KeyL'].includes(code)) dispatch({ type: 'ability', actor });
});
document.addEventListener('keyup', event => { held.delete(event.code); movement(); });
document.querySelectorAll('[data-hold]').forEach(button => {
  button.addEventListener('pointerdown', event => { if (modal) return; event.preventDefault(); initAudio(); button.setPointerCapture(event.pointerId); held.add(button.dataset.hold === '-1' ? 'KeyA' : 'KeyD'); movement(); });
  const release = () => { held.delete(button.dataset.hold === '-1' ? 'KeyA' : 'KeyD'); movement(); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
document.addEventListener('mousedown', event => { if (event.target.closest('button,[role="button"]')) event.preventDefault(); });
document.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') event.preventDefault(); }, true);
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
window.addEventListener('blur', () => { clearInputs(); if (!modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInputs(); if (!modal && state.status === 'playing') setModal('pause'); audioContext?.suspend(); } });
window.__moonclock = {
  snapshot: () => ({ ...viewFor(state, 'local'), phase: modal || state.status, players: structuredClone(state.actors) }),
  dispatch: action => { if (action.type === 'tick' && action.count) { for (let i = 0; i < Math.min(1800, action.count); i++) dispatch({ type: 'tick' }, true); } else dispatch(action); return window.__moonclock.snapshot(); },
};
function frame(time) {
  if (lastTime === 0) lastTime = time;
  accumulator += Math.min(100, time - lastTime); lastTime = time;
  if (!modal && state.status === 'playing') { while (accumulator >= 1000 / 60) { dispatch({ type: 'tick' }, true); accumulator -= 1000 / 60; } } else accumulator = 0;
  renderer.draw(state, time, { reduced, target: targetFor(state, state.active)?.id });
  frameCount++; if (frameCount % 10 === 0) updateUI();
  if (debug) { const el = document.querySelector('#debug'); el.hidden = false; el.textContent = `tick ${state.tick} | phase ${modal || state.status}\nentities ${state.actors.length + state.objects.length}\nactor ${state.active} | ${Math.round(state.actors[state.active].x)},${Math.round(state.actors[state.active].y)}`; }
  requestAnimationFrame(frame);
}
updateUI(); renderModal(); requestAnimationFrame(frame);
