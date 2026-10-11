const SESSION_KEY = 'natural-selection-session-v1';
const session = { code: null, playerId: null, stream: null, state: null };
const $ = (id) => document.getElementById(id);

function saveSession() {
  const value = JSON.stringify({ code: session.code, playerId: session.playerId });
  sessionStorage.setItem(SESSION_KEY, value);
  localStorage.setItem(SESSION_KEY, value);
}

function savedSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null');
    return value?.code && value?.playerId ? value : null;
  } catch {
    return null;
  }
}

function forgetSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  session.code = null;
  session.playerId = null;
}

function show(screen) {
  document.querySelectorAll('.screen').forEach((element) => element.classList.remove('active'));
  $(screen).classList.add('active');
}

function setStatus(id, message, error = false) {
  const element = $(id);
  element.textContent = message || '';
  element.style.color = error ? '#e88967' : '';
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  let response;
  try {
    response = await fetch(url, { headers: { 'content-type': 'application/json' }, signal: controller.signal, ...options });
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function connect(code, playerId) {
  session.code = code;
  session.playerId = playerId;
  saveSession();
  if (session.stream) session.stream.close();
  session.stream = new EventSource(`/api/lobbies/${code}/stream?playerId=${encodeURIComponent(playerId)}`);
  session.stream.onmessage = (event) => update(JSON.parse(event.data));
  session.stream.onopen = () => {
    if ($('connection')) {
      $('connection').textContent = '● online';
      $('connection').style.color = '#6db889';
    }
  };
  session.stream.onerror = () => {
    if ($('connection')) {
      $('connection').textContent = '● reconnecting';
      $('connection').style.color = '#e88967';
    }
  };
}

async function resumeSession() {
  const saved = savedSession();
  if (!saved) return false;
  try {
    await request(`/api/lobbies/${saved.code}?playerId=${encodeURIComponent(saved.playerId)}`);
    connect(saved.code, saved.playerId);
    return true;
  } catch {
    forgetSession();
    setStatus('menu-status', 'That saved session is no longer available. Create or join a new refuge.', true);
    return false;
  }
}

async function action(type, extra = {}) {
  try {
    await request(`/api/lobbies/${session.code}/action`, { method: 'POST', body: JSON.stringify({ playerId: session.playerId, action: { type, ...extra } }) });
    setStatus('action-status', '');
  } catch (error) { setStatus('action-status', error.message, true); }
}

function update(state) {
  session.state = state;
  if (state.phase === 'lobby') renderLobby(state);
  if (state.phase === 'playing') renderGame(state);
  if (state.phase === 'ended') renderEnded(state);
}

function renderLobby(state) {
  show('lobby');
  $('room-code').textContent = state.code;
  $('player-count').textContent = `${state.players.length}/6`;
  $('players').innerHTML = state.players.map((player) => `<div class="player-row"><span class="player-name">${escapeHtml(player.name)}${player.id === state.hostId ? ' <small>HOST</small>' : ''}</span><span class="tag ${player.ready ? '' : 'waiting'}">${player.ready ? 'READY' : 'WAITING'}</span></div>`).join('');
  $('ready').textContent = state.you?.ready ? 'Stand down' : 'Mark ready';
  $('start').classList.toggle('hidden', state.you?.id !== state.hostId);
  setStatus('lobby-status', state.you?.ready ? 'You are ready. Waiting for the ecosystem.' : 'Ready up when you are set.');
}

function renderGame(state) {
  show('game');
  const you = state.you;
  const illness = you?.role === 'illness';
  $('game-room').textContent = state.code;
  $('role-label').textContent = illness ? 'Illness phase' : 'Animal phase';
  $('objective').textContent = illness ? 'Spread before immunity catches up.' : 'Keep the species alive.';
  $('player-role').textContent = illness ? `Illness / ${you?.state || 'active'}` : `Animal / ${you?.state || 'active'}`;
  $('connection').textContent = '● online'; $('connection').style.color = '#6db889';
  $('health').textContent = Math.max(0, Math.round(you?.health || 0));
  $('health-bar').style.width = `${Math.max(0, Math.min(100, you?.health || 0))}%`;
  $('immunity').textContent = you?.immunity || 0;
  $('virulence').textContent = you?.virulence || 0;
  $('food').textContent = you?.food || 0;
  $('water').textContent = you?.water || 0;
  $('tick').textContent = `TICK ${state.tick}`;
  $('animal-actions').classList.toggle('hidden', illness);
  $('illness-actions').classList.toggle('hidden', !illness);
  document.querySelectorAll('[data-action]').forEach((button) => { button.disabled = you?.state !== 'alive'; });
  $('events').innerHTML = state.events.map((event) => `<div class="event">${escapeHtml(event.message)}</div>`).join('');
  draw(state);
}

function renderEnded(state) {
  show('ended');
  $('winner').textContent = state.winner === 'animals' ? 'The species survives.' : 'Extinction has arrived.';
  $('summary').textContent = state.winner === 'animals' ? 'Immunity outlasted every active illness. The refuge can evolve again.' : 'Every animal fell, but every player stayed in the story as the illness spread.';
  $('end-status').textContent = state.you?.id === state.hostId ? 'As host, you can return everyone to the refuge.' : 'Waiting for the host to start a rematch.';
}

function draw(state) {
  const canvas = $('arena'); const ctx = canvas.getContext('2d');
  const sx = canvas.width / 100; const sy = canvas.height / 100;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b2c25'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(184,217,138,.08)'; ctx.lineWidth = 1;
  for (let i = 10; i < 100; i += 10) { ctx.beginPath(); ctx.moveTo(i * sx, 0); ctx.lineTo(i * sx, canvas.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * sy); ctx.lineTo(canvas.width, i * sy); ctx.stroke(); }
  state.resources.forEach((resource) => { ctx.fillStyle = resource.kind === 'food' ? '#b8d98a' : resource.kind === 'water' ? '#75b7ca' : '#f0c56d'; ctx.beginPath(); ctx.arc(resource.x * sx, resource.y * sy, 7, 0, Math.PI * 2); ctx.fill(); });
  state.players.forEach((player) => { if (player.state !== 'alive') return; const illness = player.role === 'illness'; const mine = player.id === state.you?.id; ctx.fillStyle = illness ? '#b997df' : '#e8efe0'; ctx.strokeStyle = mine ? '#b8d98a' : illness ? '#6f5192' : '#5f9c78'; ctx.lineWidth = mine ? 4 : 2; ctx.beginPath(); ctx.arc(player.x * sx, player.y * sy, mine ? 12 : 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#eef5e8'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(player.name, player.x * sx, player.y * sy - 16); });
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

$('create').onclick = async () => { try { const result = await request('/api/lobbies', { method: 'POST', body: JSON.stringify({ name: $('name').value }) }); connect(result.code, result.playerId); } catch (error) { setStatus('menu-status', error.name === 'AbortError' ? 'The server took too long to respond.' : error.message, true); } };
$('join').onclick = async () => { try { const code = $('code').value.trim().toUpperCase(); const result = await request(`/api/lobbies/${code}/join`, { method: 'POST', body: JSON.stringify({ name: $('name').value }) }); connect(result.code, result.playerId); } catch (error) { setStatus('menu-status', error.name === 'AbortError' ? 'The server took too long to respond.' : error.message, true); } };
$('resume').onclick = () => resumeSession();
$('ready').onclick = () => action('ready');
$('start').onclick = () => action('start');
$('restart').onclick = () => action('restart');
document.querySelectorAll('[data-move]').forEach((button) => button.onclick = () => { const [dx, dy] = button.dataset.move.split(',').map(Number); action('move', { dx, dy }); });
document.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => action(button.dataset.action, button.dataset.mutation ? { mutation: button.dataset.mutation } : {}));

const previousInThisTab = sessionStorage.getItem(SESSION_KEY);
const previousInAnotherTab = localStorage.getItem(SESSION_KEY);
if (previousInAnotherTab) $('resume').classList.remove('hidden');
if (previousInThisTab) {
  $('resume').classList.remove('hidden');
  resumeSession();
}
