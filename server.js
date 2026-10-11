const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  createLobby,
  addPlayer,
  applyAction,
  publicState,
  tick,
} = require('./game');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const lobbies = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}

function broadcast(lobby) {
  for (const client of [...lobby.clients]) {
    if (client.res.destroyed || client.res.writableEnded) {
      removeStreamClient(lobby, client);
      continue;
    }
    try {
      client.res.write(`data: ${JSON.stringify(publicState(lobby, client.playerId))}\n\n`);
    } catch {
      removeStreamClient(lobby, client);
    }
  }
}

function removeStreamClient(lobby, client) {
  lobby.clients.delete(client);
  const player = lobby.players.get(client.playerId);
  if (player) player.connected = false;
}

function heartbeat() {
  for (const lobby of lobbies.values()) {
    for (const client of [...lobby.clients]) {
      if (client.res.destroyed || client.res.writableEnded) {
        removeStreamClient(lobby, client);
        continue;
      }
      try {
        client.res.write(': heartbeat\n\n');
      } catch {
        removeStreamClient(lobby, client);
      }
    }
  }
}

function fileResponse(req, res, pathname) {
  const relative = pathname === '/' ? 'public/index.html' : pathname.replace(/^\//, '');
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(path.resolve(ROOT, 'public'))) return json(res, 403, { error: 'Forbidden.' });
  fs.readFile(file, (error, content) => {
    if (error) return json(res, 404, { error: 'Not found.' });
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    res.writeHead(200, { 'content-type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(/^\/api\/lobbies\/([A-Z0-9]+)(?:\/([^/]+))?$/i);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, { ok: true, service: 'natural-selection' });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/lobbies/') && match && match[2] === 'stream') {
    const lobby = lobbies.get(match[1].toUpperCase());
    const playerId = url.searchParams.get('playerId');
    if (!lobby || !lobby.players.has(playerId)) return json(res, 404, { error: 'Lobby or player not found.' });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const client = { res, playerId };
    lobby.clients.add(client);
    lobby.players.get(playerId).connected = true;
    res.on('error', () => removeStreamClient(lobby, client));
    res.on('close', () => removeStreamClient(lobby, client));
    res.write(`data: ${JSON.stringify(publicState(lobby, playerId))}\n\n`);
    req.on('aborted', () => removeStreamClient(lobby, client));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/lobbies/') && match && !match[2]) {
    const lobby = lobbies.get(match[1].toUpperCase());
    const playerId = url.searchParams.get('playerId');
    if (!lobby || !lobby.players.has(playerId)) return json(res, 404, { error: 'Saved session not found.' });
    return json(res, 200, publicState(lobby, playerId));
  }

  if (req.method === 'POST' && url.pathname === '/api/lobbies') {
    try {
      const input = await body(req);
      let lobby = createLobby(input.name);
      while (lobbies.has(lobby.code)) lobby = createLobby(input.name);
      lobbies.set(lobby.code, lobby);
      return json(res, 201, { code: lobby.code, playerId: lobby.hostId });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/lobbies\/[A-Z0-9]+\/join$/i)) {
    const code = url.pathname.split('/')[3].toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) return json(res, 404, { error: 'Lobby not found.' });
    try {
      const result = addPlayer(lobby, (await body(req)).name);
      if (!result.ok) return json(res, 409, { error: result.message });
      broadcast(lobby);
      return json(res, 201, { code, playerId: result.playerId });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && match && match[2] === 'action') {
    const lobby = lobbies.get(match[1].toUpperCase());
    if (!lobby) return json(res, 404, { error: 'Lobby not found.' });
    try {
      const input = await body(req);
      const result = applyAction(lobby, input.playerId, input.action || {});
      broadcast(lobby);
      return json(res, result.ok ? 200 : 422, result);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'GET') return fileResponse(req, res, url.pathname);
  return json(res, 404, { error: 'Not found.' });
});

setInterval(() => {
  for (const lobby of lobbies.values()) {
    tick(lobby);
    if (lobby.phase === 'playing' || lobby.phase === 'ended') broadcast(lobby);
  }
}, 2000);

setInterval(heartbeat, 15_000);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Natural Selection listening on port ${PORT}`));
}

module.exports = { server, lobbies };
