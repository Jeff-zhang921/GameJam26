import { drawCharacterPortrait } from './render.js';

const characters = [
  { id: 'still', name: 'Stillkeeper', label: 'STILL', ability: 'Freeze / Release', description: 'Hold a crate, plant or platform in time. Release it when the moment is right.' },
  { id: 'bloom', name: 'Bloomkeeper', label: 'BLOOM', ability: 'Wake / Hasten', description: 'Wake an object, hasten it up to 3×, or release what Still has frozen.' },
];

export function createLobby(callbacks) {
  const root = document.createElement('div');
  root.id = 'online-root';
  root.hidden = true;
  root.innerHTML = `
    <section class="online-dialog" role="dialog" aria-modal="true" aria-labelledby="online-title">
      <header class="online-heading"><span class="online-eyebrow">MOONCLOCK · ONLINE CO-OP</span><button class="online-leave" type="button" data-online="leave" aria-label="Leave Room">Leave</button></header>
      <div class="online-join" data-view="join">
        <h2 id="online-title">A moment for two.</h2><p class="online-intro">Meet in the same courtyard. Share an invite code with your partner.</p>
        <form class="online-code-form"><label for="online-code-input">Room Code</label><div class="online-code-entry"><input id="online-code-input" data-testid="room-code-input" name="code" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-describedby="online-code-help" required><button class="online-primary" type="submit" data-testid="join-room-submit">Join Room</button></div><p id="online-code-help">Enter the six-character code from your host.</p></form>
        <div class="online-divider"><span>or start your own</span></div><button class="online-secondary online-create" type="button" data-online="create" data-testid="create-room-submit">Create Room</button>
      </div>
      <div class="online-room" data-view="room" hidden>
        <div class="online-room-heading"><div><h2 id="online-room-title">Your shared courtyard</h2><p class="online-intro">Two travelers. Two ways to move time.</p></div><div class="online-code-box"><span class="online-eyebrow">INVITE CODE</span><div><code id="online-room-code" data-testid="room-code" tabindex="0"></code><button type="button" class="online-copy" data-online="copy" aria-label="Copy Invite Code">Copy code</button></div><span class="online-copy-status" aria-live="polite"></span></div></div>
        <div class="online-slots" aria-label="Players">${[0, 1].map(i => `<article class="online-slot" data-slot="${i}"><span class="online-slot-dot" aria-hidden="true"></span><div><strong class="online-slot-name"></strong><span class="online-slot-character"></span></div><span class="online-slot-status"></span></article>`).join('')}</div>
        <div class="online-selection-heading"><h3>Choose your timekeeper</h3><span class="online-selection-help">One of each, together.</span></div>
        <div class="online-characters">${characters.map((character, i) => `<button type="button" class="online-character ${character.id}" data-character="${character.id}" data-testid="character-${character.id}" aria-label="${character.name}" aria-pressed="false"><div class="online-art"><canvas width="180" height="150" data-portrait="${i}" aria-label="${character.name} artwork"></canvas><span class="online-character-owner"></span></div><div class="online-character-copy"><span class="online-eyebrow">${character.label}</span><h4>${character.name}</h4><strong>${character.ability}</strong><p>${character.description}</p></div></button>`).join('')}</div>
        <div class="online-lobby-actions"><button type="button" class="online-secondary" data-online="ready" data-testid="ready">Ready</button><button type="button" class="online-primary" data-online="start" data-testid="start-game">Start Game</button></div><p class="online-room-note" aria-live="polite"></p>
      </div>
      <div class="online-session" data-view="session" hidden><div class="online-session-symbol" aria-hidden="true">✦</div><h2 class="online-session-title"></h2><strong class="online-countdown" aria-live="off"></strong><p class="online-session-message"></p><div class="online-session-actions"><button type="button" class="online-secondary" data-online="retry">Reconnect</button><button type="button" class="online-primary" data-online="return" data-testid="return-to-lobby">Return to Lobby</button></div></div>
      <p class="online-connection" role="status"></p><p class="online-error" role="alert" hidden></p>
    </section>`;
  const badge = document.createElement('div');
  badge.id = 'online-room-badge';
  badge.hidden = true;
  // Leaving during play lives in the pause menu; the badge only shows the room code.
  badge.innerHTML = '<span class="online-badge-dot" aria-hidden="true"></span><span class="online-badge-code"></span>';
  document.body.append(root, badge);

  let room = null, playerId = null, connection = 'connected', view = null, timeOffset = 0;
  let copyTimer = null, destroyed = false, enabled = false;
  const $ = selector => root.querySelector(selector);
  const views = [...root.querySelectorAll('[data-view]')];
  const roomCode = $('#online-room-code');
  const input = $('#online-code-input');
  const readyButton = $('[data-online="ready"]');
  const startButton = $('[data-online="start"]');
  const retryButton = $('[data-online="retry"]');
  const returnButton = $('[data-online="return"]');
  const error = $('.online-error');
  const slots = [...root.querySelectorAll('[data-slot]')];
  const cards = [...root.querySelectorAll('[data-character]')];

  for (const canvas of root.querySelectorAll('[data-portrait]')) drawCharacterPortrait(canvas, Number(canvas.dataset.portrait));

  function focusView() {
    const target = view === 'join' ? input : view === 'room' ? cards.find(card => !card.disabled) || $('[data-online="leave"]') : retryButton.hidden ? $('[data-online="leave"]') : retryButton;
    target.focus({ preventScroll: true });
  }

  function showView(next) {
    const changed = view !== next || root.hidden;
    view = next;
    root.hidden = false;
    badge.hidden = true;
    for (const element of views) element.hidden = element.dataset.view !== next;
    const title = next === 'join' ? 'online-title' : next === 'room' ? 'online-room-title' : 'online-session-title';
    $('.online-session-title').id = 'online-session-title';
    $('.online-dialog').setAttribute('aria-labelledby', title);
    if (changed) focusView();
  }

  function setError(message = '') {
    error.textContent = String(message);
    error.hidden = !message;
  }

  function invoke(name, ...args) {
    setError('');
    try {
      const result = callbacks[name](...args);
      if (result && typeof result.catch === 'function') result.catch(reason => setError(reason?.message || 'That request could not be completed. Please try again.'));
    } catch (reason) {
      setError(reason?.message || 'That request could not be completed. Please try again.');
    }
  }

  function clockText() {
    if (view !== 'session' || !room) return;
    const now = Date.now() + timeOffset;
    if (room.status === 'STARTING' && !room.suspended && connection === 'connected') {
      const seconds = Math.max(0, Math.ceil((room.startAt - now) / 1000));
      $('.online-countdown').textContent = seconds > 0 ? String(seconds) : '✦';
      $('.online-session-message').textContent = seconds > 0 ? 'Both timekeepers are ready. The courtyard opens together.' : 'Waiting for the shared start…';
    } else {
      $('.online-countdown').textContent = '';
      const seconds = room.reconnectUntil ? Math.max(0, Math.ceil((room.reconnectUntil - now) / 1000)) : 0;
      $('.online-session-message').textContent = room.canReturnLobby ? 'The reconnection window has ended. Return to the lobby to begin again.' : seconds > 0 ? `The shared world is held in place. Reconnecting for up to ${seconds}s.` : 'The shared world is held in place while the connection returns.';
    }
  }

  function draw() {
    if (destroyed || !enabled) return;
    const online = connection === 'connected';
    $('.online-connection').textContent = connection === 'connecting' ? 'Connecting to the courtyard…' : connection === 'reconnecting' ? 'Connection lost. Reconnecting…' : connection === 'offline' ? 'You are disconnected.' : room ? 'Connected to the shared courtyard' : '';
    $('.online-connection').dataset.state = connection;
    input.disabled = connection === 'connecting' || connection === 'reconnecting';
    $('[data-testid="join-room-submit"]').disabled = input.disabled;
    $('[data-online="create"]').disabled = input.disabled;
    if (!room) {
      if (view !== 'join' && connection !== 'connected') {
        $('.online-session-title').textContent = connection === 'connecting' ? 'Opening your courtyard.' : 'The courtyard is out of reach.';
        $('.online-countdown').textContent = '';
        $('.online-session-message').textContent = connection === 'connecting' ? 'Finding a moment you can share with your partner…' : 'Check your connection, then reconnect or return to the main menu.';
        retryButton.hidden = connection === 'connecting';
        returnButton.hidden = true;
        showView('session');
      }
      return;
    }

    roomCode.textContent = room.code;
    badge.querySelector('.online-badge-code').textContent = `ROOM ${room.code}`;
    const self = room.players.find(player => player.id === playerId);
    const host = room.hostId === playerId;
    const selecting = ['WAITING', 'READY'].includes(room.status);
    slots.forEach((slot, i) => {
      const player = room.players[i];
      slot.classList.toggle('online-slot-empty', !player);
      slot.classList.toggle('online-slot-ready', !!player?.ready);
      slot.classList.toggle('online-slot-offline', !!player && !player.connected);
      slot.querySelector('.online-slot-name').textContent = !player ? 'Waiting for a partner' : `${player.id === playerId ? 'You' : 'Your partner'}${player.id === room.hostId ? ' · Host' : ''}`;
      slot.querySelector('.online-slot-character').textContent = !player ? 'Share the invite code to meet here.' : characters.find(character => character.id === player.character)?.name || 'Choosing a timekeeper';
      slot.querySelector('.online-slot-status').textContent = !player ? 'Open slot' : !player.connected ? 'Disconnected' : player.ready ? 'Ready' : 'Connected';
    });
    for (const card of cards) {
      const owner = room.players.find(player => player.character === card.dataset.character);
      const yours = owner?.id === playerId;
      card.disabled = !online || !selecting || (!!owner && !yours);
      card.setAttribute('aria-pressed', String(yours));
      card.classList.toggle('online-character-taken', !!owner && !yours);
      card.querySelector('.online-character-owner').textContent = owner ? yours ? 'Your timekeeper' : 'Partner’s timekeeper' : 'Available';
    }
    readyButton.disabled = !online || !selecting || !self?.character || !self.connected;
    readyButton.textContent = self?.ready ? 'Not Ready' : 'Ready';
    readyButton.setAttribute('aria-pressed', String(!!self?.ready));
    startButton.hidden = !host;
    startButton.disabled = !online || room.status !== 'READY' || room.players.length !== 2 || room.players.some(player => !player.connected || !player.ready);
    $('.online-room-note').textContent = room.status === 'READY' ? host ? 'Both ready. Open the courtyard when you are ready.' : 'Both ready. Waiting for the host to start.' : room.players.length < 2 ? 'Waiting for your partner to join.' : 'Choose different timekeepers, then both mark yourselves Ready.';

    if ((room.status === 'PLAYING' || room.status === 'FINISHED') && !room.suspended && online && !room.canReturnLobby) {
      root.hidden = true; badge.hidden = false; view = null;
      return;
    }
    if (!online || room.suspended || room.status === 'STARTING' || room.canReturnLobby) {
      $('.online-session-title').textContent = room.canReturnLobby ? 'A moment interrupted.' : room.status === 'STARTING' && online && !room.suspended ? 'The courtyard is opening.' : 'Holding this moment.';
      retryButton.hidden = online;
      returnButton.hidden = !room.canReturnLobby;
      showView('session');
      clockText();
    } else {
      showView('room');
    }
  }

  async function copyCode() {
    const status = $('.online-copy-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(room.code);
      status.textContent = 'Copied. Send it to your partner.';
    } catch {
      const range = document.createRange(); range.selectNodeContents(roomCode);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      roomCode.focus(); status.textContent = 'Code selected. Copy it to share.';
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { status.textContent = ''; }, 4000);
  }

  $('.online-code-form').addEventListener('submit', event => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase(); input.value = code;
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError('Enter a six-character room code using letters and numbers.'); input.focus(); return; }
    invoke('joinRoom', code);
  });
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); setError(''); });
  root.addEventListener('click', event => {
    const card = event.target.closest('[data-character]');
    if (card && !card.disabled) { invoke('selectCharacter', card.dataset.character); return; }
    const button = event.target.closest('[data-online]');
    if (!button || button.disabled) return;
    const action = button.dataset.online;
    if (action === 'copy') { copyCode(); return; }
    if (action === 'ready') { invoke('setReady', !room?.players.find(player => player.id === playerId)?.ready); return; }
    const method = { create: 'createRoom', leave: 'leaveRoom', start: 'startGame', retry: 'retry', return: 'returnToLobby' }[action];
    if (method) invoke(method);
  });

  function keyboard(event) {
    if (root.hidden) return;
    event.stopPropagation();
    if (event.type === 'keyup') return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (view === 'join') invoke('leaveRoom');
    }
    if (event.code !== 'Tab') return;
    const focusable = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length);
    const index = focusable.indexOf(document.activeElement);
    event.preventDefault();
    focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
  }
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('keyup', keyboard, true);
  const timer = setInterval(clockText, 100);

  return {
    showJoin() { enabled = true; room = null; playerId = null; connection = 'connected'; input.value = ''; setError(''); showView('join'); draw(); },
    update(nextRoom, nextPlayerId, serverTime = Date.now()) { enabled = true; room = nextRoom; playerId = nextPlayerId; timeOffset = serverTime - Date.now(); draw(); },
    setConnection(status) { connection = status; if (status === 'connecting' || status === 'reconnecting') enabled = true; draw(); },
    setError,
    hide() { enabled = false; root.hidden = true; badge.hidden = true; view = null; room = null; playerId = null; },
    destroy() {
      destroyed = true; clearInterval(timer); clearTimeout(copyTimer);
      document.removeEventListener('keydown', keyboard, true); document.removeEventListener('keyup', keyboard, true);
      root.remove(); badge.remove();
    },
  };
}
