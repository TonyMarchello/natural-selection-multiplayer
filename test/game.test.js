const test = require('node:test');
const assert = require('node:assert/strict');
const { createLobby, addPlayer, applyAction, getPlayer, publicState, tick } = require('../game');

function readyLobby() {
  const lobby = createLobby('Host');
  const joined = addPlayer(lobby, 'Rival');
  applyAction(lobby, lobby.hostId, { type: 'ready' });
  applyAction(lobby, joined.playerId, { type: 'ready' });
  assert.equal(applyAction(lobby, lobby.hostId, { type: 'start' }).ok, true);
  return { lobby, rivalId: joined.playerId };
}

test('requires two ready players before starting', () => {
  const lobby = createLobby('Host');
  assert.equal(applyAction(lobby, lobby.hostId, { type: 'start' }).ok, false);
  const joined = addPlayer(lobby, 'Rival');
  applyAction(lobby, lobby.hostId, { type: 'ready' });
  applyAction(lobby, joined.playerId, { type: 'ready' });
  assert.equal(applyAction(lobby, lobby.hostId, { type: 'start' }).ok, true);
  assert.equal(lobby.phase, 'playing');
});

test('defeated animal transitions to illness', () => {
  const { lobby, rivalId } = readyLobby();
  const host = getPlayer(lobby, lobby.hostId);
  const rival = getPlayer(lobby, rivalId);
  rival.x = host.x + 1; rival.y = host.y; rival.health = 30; host.energy = 50;
  assert.equal(applyAction(lobby, lobby.hostId, { type: 'challenge' }).ok, true);
  assert.equal(rival.role, 'illness');
  assert.equal(rival.state, 'alive');
  assert.equal(lobby.hadIllness, true);
});

test('animal victory follows neutralization', () => {
  const { lobby, rivalId } = readyLobby();
  const host = getPlayer(lobby, lobby.hostId);
  const rival = getPlayer(lobby, rivalId);
  rival.role = 'illness'; rival.virulence = 10; host.immunity = 20; host.x = rival.x; host.y = rival.y; lobby.hadIllness = true;
  assert.equal(applyAction(lobby, lobby.hostId, { type: 'neutralize' }).ok, true);
  assert.equal(lobby.phase, 'ended');
  assert.equal(lobby.winner, 'animals');
});

test('extinction victory follows the last animal infection', () => {
  const { lobby, rivalId } = readyLobby();
  const host = getPlayer(lobby, lobby.hostId);
  const rival = getPlayer(lobby, rivalId);
  rival.role = 'illness'; rival.virulence = 40; host.x = rival.x; host.y = rival.y; host.health = 20; lobby.hadIllness = true;
  assert.equal(applyAction(lobby, rivalId, { type: 'infect' }).ok, true);
  assert.equal(lobby.phase, 'ended');
  assert.equal(lobby.winner, 'illness');
});

test('invalid actions are rejected without client-controlled damage', () => {
  const { lobby } = readyLobby();
  const host = getPlayer(lobby, lobby.hostId);
  host.energy = 0;
  const result = applyAction(lobby, lobby.hostId, { type: 'move', dx: 1, dy: 0 });
  assert.equal(result.ok, false);
  assert.equal(host.x, 40);
  assert.equal(publicState(lobby, lobby.hostId).you.id, lobby.hostId);
});

test('starving animals transition instead of leaving a dead active state', () => {
  const { lobby, rivalId } = readyLobby();
  const rival = getPlayer(lobby, rivalId);
  rival.health = 1;
  rival.water = 0;
  tick(lobby);
  assert.equal(rival.role, 'illness');
  assert.equal(rival.state, 'alive');
  assert.equal(lobby.hadIllness, true);
});
