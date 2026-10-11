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
    const result = await request(`/api/lobbies/${session.code}/action`, { method: 'POST', body: JSON.stringify({ playerId: session.playerId, action: { type, ...extra } }) });
    const feedback = { move: 'Moved through the habitat.', gather: 'Gather attempt sent.', challenge: 'Challenge attempt sent.', infect: 'Transmission attempt sent.', evolve: 'Evolution attempt sent.', mutate: 'Mutation attempt sent.', neutralize: 'Neutralization attempt sent.' };
    setStatus('action-status', result.message || feedback[type] || 'Action complete.');
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
  $('role-label').textContent = illness ? `${you?.disease?.name || 'Disease'} phase` : `${you?.speciesName || 'Animal'} phase`;
  $('objective').textContent = illness ? `Spread ${you?.disease?.name || 'your disease'} before immunity catches up.` : 'Gather, adapt, and keep the species alive.';
  $('player-role').textContent = illness ? `${you?.disease?.name || 'Disease'} / ${you?.state || 'active'}` : `${you?.speciesName || 'Animal'} / ${you?.state || 'active'}`;
  $('connection').textContent = '● online'; $('connection').style.color = '#6db889';
  $('health').textContent = Math.max(0, Math.round(you?.health || 0));
  $('health-bar').style.width = `${Math.max(0, Math.min(100, you?.health || 0))}%`;
  $('immunity').textContent = you?.immunity || 0;
  $('virulence').textContent = you?.virulence || 0;
  $('energy').textContent = you?.energy || 0;
  $('food').textContent = you?.food || 0;
  $('water').textContent = you?.water || 0;
  $('tick').textContent = `TICK ${state.tick}`;
  $('animal-actions').classList.toggle('hidden', illness);
  $('illness-actions').classList.toggle('hidden', !illness);
  document.querySelectorAll('[data-action]').forEach((button) => { button.disabled = you?.state !== 'alive'; });
  $('events').innerHTML = state.events.map((event) => `<div class="event">${escapeHtml(event.message)}</div>`).join('');
  renderTargeting(state);
  draw(state);
}

function renderEnded(state) {
  show('ended');
  $('winner').textContent = state.winner === 'animals' ? 'The species survives.' : 'Extinction has arrived.';
  $('summary').textContent = state.winner === 'animals' ? 'Immunity outlasted every active disease. The refuge can evolve again.' : 'Every animal fell, but every player stayed in the story as the disease spread.';
  const stats = state.you?.stats || {};
  $('summary-stats').innerHTML = [
    ['Moves', stats.moves || 0],
    ['Resources', stats.resources || 0],
    ['Damage dealt', stats.damageDealt || 0],
    ['Damage taken', stats.damageTaken || 0],
    ['Mutations', stats.mutations || 0],
    ['Neutralizations', stats.neutralizations || 0],
  ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('');
  $('final-roster').innerHTML = state.players.map((player) => {
    const identity = player.role === 'illness' ? (player.disease?.name || 'Disease') : (player.speciesName || 'Animal');
    return `<div><span>${escapeHtml(player.name)} · ${escapeHtml(identity)}</span><small>${escapeHtml(player.state)}</small></div>`;
  }).join('');
  $('end-status').textContent = state.you?.id === state.hostId ? 'As host, you can return everyone to the refuge.' : 'Waiting for the host to start a rematch.';
}

function renderTargeting(state) {
  const you = state.you;
  if (!you) return;
  const targetRole = you.role === 'illness' ? 'animal' : 'animal';
  const range = you.role === 'illness' ? 16 : 14;
  const candidates = state.players.filter((player) => player.id !== you.id && player.state === 'alive' && player.role === targetRole && (you.role === 'illness' || player.role === 'illness'));
  const target = candidates.sort((a, b) => distance(you, a) - distance(you, b))[0];
  if (!target) {
    $('targeting').textContent = you.role === 'illness' ? 'Targeting: no animal in range.' : 'Targeting: no nearby rival or disease.';
    return;
  }
  const distanceAway = Math.round(distance(you, target));
  const identity = target.role === 'illness' ? (target.disease?.name || 'Disease') : (target.speciesName || 'Animal');
  $('targeting').textContent = `${target.name} · ${identity} · ${distanceAway}m ${distanceAway <= range ? '· IN RANGE' : '· move closer'}`;
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function draw(state) {
  const canvas = $('arena'); const ctx = canvas.getContext('2d');
  const sx = canvas.width / 100; const sy = canvas.height / 100;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createRadialGradient(canvas.width * .45, canvas.height * .45, 20, canvas.width * .5, canvas.height * .5, canvas.width * .75);
  gradient.addColorStop(0, '#315242'); gradient.addColorStop(1, '#16241e');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(184,217,138,.11)'; ctx.lineWidth = 1;
  for (let i = 10; i < 100; i += 10) { ctx.beginPath(); ctx.moveTo(i * sx, 0); ctx.lineTo(i * sx, canvas.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * sy); ctx.lineTo(canvas.width, i * sy); ctx.stroke(); }
  state.resources.forEach((resource) => drawResource(ctx, resource, resource.x * sx, resource.y * sy));
  state.players.forEach((player) => {
    if (player.state !== 'alive') return;
    const mine = player.id === state.you?.id;
    const x = player.x * sx; const y = player.y * sy;
    ctx.save();
    ctx.translate(x, y);
    if (mine) { ctx.strokeStyle = '#f4e6a1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke(); }
    if (player.role === 'illness') drawDisease(ctx, player);
    else if (player.species === 'wolf') drawWolf(ctx, player, mine);
    else drawDeer(ctx, player, mine);
    ctx.restore();
    ctx.fillStyle = '#eef5e8'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(player.name, x, y - 25);
    const identity = player.role === 'illness' ? (player.disease?.name || 'Disease') : (player.speciesName || 'Animal');
    ctx.fillStyle = player.role === 'illness' ? '#e4c8fa' : '#b8d98a'; ctx.font = '10px system-ui';
    ctx.fillText(identity, x, y + 28);
  });
}

function drawResource(ctx, resource, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = resource.kind === 'food' ? '#b8d98a' : resource.kind === 'water' ? '#75b7ca' : '#f0c56d';
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5;
  if (resource.kind === 'water') { ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(9, 2, 0, 9); ctx.quadraticCurveTo(-9, 2, 0, -9); ctx.fill(); }
  else if (resource.kind === 'energy') { ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); }
  else { [-5, 5].forEach((offset) => { ctx.beginPath(); ctx.arc(offset, 1, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }); }
  ctx.restore();
}

function drawDeer(ctx, player, mine) {
  const body = mine ? '#f2e4c3' : '#cba978'; const dark = '#704e36';
  ctx.fillStyle = dark; ctx.strokeStyle = '#241d18'; ctx.lineWidth = 2;
  [-9, 7].forEach((leg) => { ctx.beginPath(); ctx.roundRect(leg, 3, 4, 13, 2); ctx.fill(); });
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 1, 15, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(14, -15); ctx.lineTo(20, -17); ctx.lineTo(21, -8); ctx.lineTo(14, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f4ead9'; ctx.beginPath(); ctx.ellipse(20, -11, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(15, -16); ctx.lineTo(12, -24); ctx.lineTo(15, -21); ctx.lineTo(19, -27); ctx.lineTo(19, -19); ctx.moveTo(18, -17); ctx.lineTo(23, -24); ctx.lineTo(22, -16); ctx.stroke();
  ctx.fillStyle = '#17120f'; ctx.beginPath(); ctx.arc(22, -12, 1.5, 0, Math.PI * 2); ctx.fill();
}

function drawWolf(ctx, player, mine) {
  const body = mine ? '#c8d1d2' : '#849399'; const dark = '#313b40';
  ctx.fillStyle = dark; ctx.strokeStyle = '#171d20'; ctx.lineWidth = 2;
  [-9, 7].forEach((leg) => { ctx.beginPath(); ctx.roundRect(leg, 3, 4, 13, 2); ctx.fill(); });
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 1, 16, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, -4); ctx.lineTo(15, -15); ctx.lineTo(23, -12); ctx.lineTo(24, -5); ctx.lineTo(14, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(14, -14); ctx.lineTo(13, -24); ctx.lineTo(19, -17); ctx.lineTo(24, -22); ctx.lineTo(22, -12); ctx.fill();
  ctx.fillStyle = '#171d20'; ctx.beginPath(); ctx.arc(20, -10, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = body; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-13, -1); ctx.quadraticCurveTo(-23, -10, -22, -18); ctx.stroke();
}

function drawDisease(ctx, player) {
  const color = player.disease?.color || '#b997df';
  ctx.fillStyle = color; ctx.strokeStyle = '#271d32'; ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) { const angle = (Math.PI * 2 * i) / 10; ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -18); ctx.stroke(); ctx.restore(); }
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff4ff'; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

$('create').onclick = async () => { try { const result = await request('/api/lobbies', { method: 'POST', body: JSON.stringify({ name: $('name').value, species: $('species').value }) }); connect(result.code, result.playerId); } catch (error) { setStatus('menu-status', error.name === 'AbortError' ? 'The server took too long to respond.' : error.message, true); } };
$('join').onclick = async () => { try { const code = $('code').value.trim().toUpperCase(); const result = await request(`/api/lobbies/${code}/join`, { method: 'POST', body: JSON.stringify({ name: $('name').value, species: $('species').value }) }); connect(result.code, result.playerId); } catch (error) { setStatus('menu-status', error.name === 'AbortError' ? 'The server took too long to respond.' : error.message, true); } };
$('resume').onclick = () => resumeSession();
$('ready').onclick = () => action('ready');
$('start').onclick = () => action('start');
$('restart').onclick = () => action('restart');
document.querySelectorAll('[data-move]').forEach((button) => button.onclick = () => { const [dx, dy] = button.dataset.move.split(',').map(Number); action('move', { dx, dy }); });
document.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => action(button.dataset.action, button.dataset.mutation ? { mutation: button.dataset.mutation } : {}));

const keyMoves = {
  ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
};
window.addEventListener('keydown', (event) => {
  if (event.repeat || document.activeElement?.matches('input, select, textarea')) return;
  if (!session.state || session.state.phase !== 'playing') return;
  const move = keyMoves[event.key] || keyMoves[event.key.toLowerCase()];
  if (!move) return;
  event.preventDefault();
  action('move', { dx: move[0], dy: move[1] });
});

const previousInThisTab = sessionStorage.getItem(SESSION_KEY);
const previousInAnotherTab = localStorage.getItem(SESSION_KEY);
if (previousInAnotherTab) $('resume').classList.remove('hidden');
if (previousInThisTab) {
  $('resume').classList.remove('hidden');
  resumeSession();
}
