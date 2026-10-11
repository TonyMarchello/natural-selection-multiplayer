const crypto = require('node:crypto');

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const ARENA_SIZE = 100;

const SPECIES = {
  deer: { id: 'deer', name: 'Deer', kind: 'prey', maxHealth: 100, energy: 50, challengeDamage: 35 },
  wolf: { id: 'wolf', name: 'Wolf', kind: 'predator', maxHealth: 112, energy: 60, challengeDamage: 40 },
  fox: { id: 'fox', name: 'Fox', kind: 'predator', maxHealth: 94, energy: 72, challengeDamage: 32 },
  bear: { id: 'bear', name: 'Bear', kind: 'predator', maxHealth: 136, energy: 38, challengeDamage: 45 },
  rabbit: { id: 'rabbit', name: 'Rabbit', kind: 'prey', maxHealth: 84, energy: 78, challengeDamage: 28 },
};

const DISEASES = [
  { id: 'rabies', name: 'Rabies', virulence: 20, damage: 30, color: '#d7a8ef' },
  { id: 'plague', name: 'Plague', virulence: 24, damage: 32, color: '#b884d9' },
  { id: 'anthrax', name: 'Anthrax', virulence: 28, damage: 34, color: '#f09b83' },
  { id: 'smallpox', name: 'Smallpox', virulence: 22, damage: 31, color: '#e6c36a' },
];

const RESOURCE_TEMPLATES = [
  { id: 'food-1', kind: 'food', x: 18, y: 22, amount: 20 },
  { id: 'food-2', kind: 'food', x: 78, y: 26, amount: 20 },
  { id: 'food-3', kind: 'food', x: 50, y: 78, amount: 20 },
  { id: 'water-1', kind: 'water', x: 24, y: 72, amount: 18 },
  { id: 'water-2', kind: 'water', x: 76, y: 70, amount: 18 },
  { id: 'energy-1', kind: 'energy', x: 50, y: 20, amount: 18 },
  { id: 'energy-2', kind: 'energy', x: 50, y: 52, amount: 18 },
];

function id() {
  return crypto.randomUUID();
}

function roomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function cleanName(name) {
  const value = String(name || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 18);
  return value || 'Explorer';
}

function createLobby(hostName, species) {
  const hostId = id();
  const lobby = {
    code: roomCode(),
    phase: 'lobby',
    hostId,
    winner: null,
    hadIllness: false,
    tick: 0,
    players: new Map(),
    resources: RESOURCE_TEMPLATES.map((resource) => ({ ...resource, available: true })),
    events: [],
    clients: new Set(),
    nextDiseaseIndex: 0,
  };
  lobby.players.set(hostId, makePlayer(hostId, hostName, 1, species));
  announce(lobby, `${cleanName(hostName)} created a new species refuge.`);
  return lobby;
}

function normalizeSpecies(value, slot = 1) {
  if (value && SPECIES[value]) return value;
  return slot % 2 === 0 ? 'wolf' : 'deer';
}

function makePlayer(playerId, name, slot, requestedSpecies) {
  const starts = [
    { x: 40, y: 42 },
    { x: 60, y: 42 },
    { x: 42, y: 60 },
    { x: 58, y: 60 },
    { x: 32, y: 52 },
    { x: 68, y: 52 },
  ];
  const species = SPECIES[normalizeSpecies(requestedSpecies, slot)];
  return {
    id: playerId,
    name: cleanName(name),
    species: species.id,
    speciesName: species.name,
    speciesKind: species.kind,
    challengeDamage: species.challengeDamage,
    ready: false,
    role: 'animal',
    state: 'alive',
    x: starts[(slot - 1) % starts.length].x,
    y: starts[(slot - 1) % starts.length].y,
    health: species.maxHealth,
    maxHealth: species.maxHealth,
    immunity: 0,
    virulence: 0,
    food: 0,
    water: 0,
    energy: species.energy,
    mutations: [],
    disease: null,
    facing: { x: 1, y: 0 },
    stats: {
      moves: 0,
      resources: 0,
      damageDealt: 0,
      damageTaken: 0,
      infections: 0,
      neutralizations: 0,
      mutations: 0,
    },
    connected: false,
  };
}

function addPlayer(lobby, name, species) {
  if (lobby.phase !== 'lobby') return { ok: false, message: 'This match has already started.' };
  if (lobby.players.size >= MAX_PLAYERS) return { ok: false, message: 'This lobby is full.' };
  const playerId = id();
  lobby.players.set(playerId, makePlayer(playerId, name, lobby.players.size + 1, species));
  announce(lobby, `${cleanName(name)} joined the refuge.`);
  return { ok: true, playerId };
}

function getPlayer(lobby, playerId) {
  return lobby.players.get(playerId);
}

function announce(lobby, message) {
  lobby.events.unshift({ id: id(), tick: lobby.tick, message });
  lobby.events = lobby.events.slice(0, 30);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function active(player) {
  return player && player.state === 'alive';
}

function setReady(lobby, playerId) {
  const player = getPlayer(lobby, playerId);
  if (!player || lobby.phase !== 'lobby') return { ok: false, message: 'Ready state is unavailable.' };
  player.ready = !player.ready;
  announce(lobby, `${player.name} is ${player.ready ? 'ready' : 'not ready'}.`);
  return { ok: true };
}

function startGame(lobby, playerId) {
  if (lobby.phase !== 'lobby') return { ok: false, message: 'The match is not in the lobby.' };
  if (playerId !== lobby.hostId) return { ok: false, message: 'Only the host can start the match.' };
  if (lobby.players.size < MIN_PLAYERS) return { ok: false, message: 'At least two players are required.' };
  if ([...lobby.players.values()].some((player) => !player.ready)) {
    return { ok: false, message: 'Every player must be ready.' };
  }
  lobby.phase = 'playing';
  announce(lobby, 'The ecosystem awakens. Gather, adapt, and survive.');
  return { ok: true };
}

function transformToIllness(lobby, animal) {
  const disease = DISEASES[lobby.nextDiseaseIndex % DISEASES.length];
  lobby.nextDiseaseIndex += 1;
  animal.role = 'illness';
  animal.state = 'alive';
  animal.health = 100;
  animal.maxHealth = 100;
  animal.immunity = 0;
  animal.virulence = disease.virulence;
  animal.food = 0;
  animal.water = 0;
  animal.energy = 50;
  animal.mutations = [];
  animal.disease = { id: disease.id, name: disease.name, color: disease.color, damage: disease.damage };
  lobby.hadIllness = true;
  announce(lobby, `${animal.name}'s ${animal.speciesName.toLowerCase()} fell to ${disease.name}. They return as an active disease.`);
}

function checkVictory(lobby) {
  if (lobby.phase !== 'playing') return;
  const animals = [...lobby.players.values()].filter((player) => player.role === 'animal' && active(player));
  const illnesses = [...lobby.players.values()].filter((player) => player.role === 'illness' && active(player));
  if (animals.length === 0) {
    lobby.phase = 'ended';
    lobby.winner = 'illness';
    announce(lobby, 'EXTINCTION: the illness overcame the species.');
  } else if (lobby.hadIllness && illnesses.length === 0) {
    lobby.phase = 'ended';
    lobby.winner = 'animals';
    announce(lobby, 'SPECIES SURVIVAL: every illness was neutralized.');
  }
}

function nearest(lobby, player, predicate) {
  return [...lobby.players.values()]
    .filter((candidate) => candidate.id !== player.id && active(candidate) && predicate(candidate))
    .sort((a, b) => distance(player, a) - distance(player, b))[0];
}

function move(lobby, player, dx, dy) {
  if (!active(player)) return { ok: false, message: 'Your role is no longer active.' };
  if (player.role === 'animal' && player.energy < 2) return { ok: false, message: 'You need energy to move.' };
  const x = Number(dx);
  const y = Number(dy);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1 || (x === 0 && y === 0)) {
    return { ok: false, message: 'Movement must be one valid step.' };
  }
  player.x = Math.max(5, Math.min(95, player.x + x * 4));
  player.y = Math.max(5, Math.min(95, player.y + y * 4));
  player.facing = { x, y };
  player.stats.moves += 1;
  if (player.role === 'animal') player.energy -= 2;
  return { ok: true };
}

function gather(lobby, player) {
  if (!active(player) || player.role !== 'animal') return { ok: false, message: 'Only animals can gather.' };
  const resource = lobby.resources.find((item) => item.available && distance(player, item) <= 10);
  if (!resource) return { ok: false, message: 'Move closer to a resource node.' };
  resource.available = false;
  player[resource.kind] += resource.amount;
  player.stats.resources += resource.amount;
  announce(lobby, `${player.name} gathered ${resource.amount} ${resource.kind}.`);
  return { ok: true };
}

function challenge(lobby, player) {
  if (!active(player) || player.role !== 'animal') return { ok: false, message: 'Only animals can challenge.' };
  if (player.energy < 12) return { ok: false, message: 'You need 12 energy to challenge.' };
  const target = nearest(lobby, player, (candidate) => candidate.role === 'animal' && distance(player, candidate) <= 14);
  if (!target) return { ok: false, message: 'No rival animal is close enough.' };
  player.energy -= 12;
  const damage = player.challengeDamage || 35;
  const dealt = Math.min(damage, target.health);
  target.health -= damage;
  player.stats.damageDealt += dealt;
  target.stats.damageTaken += dealt;
  announce(lobby, `${player.name} (${player.speciesName}) challenged ${target.name} for ${damage} damage.`);
  if (target.health <= 0) transformToIllness(lobby, target);
  checkVictory(lobby);
  return { ok: true };
}

function infect(lobby, player) {
  if (!active(player) || player.role !== 'illness') return { ok: false, message: 'Only illness players can infect.' };
  if (player.virulence < 10) return { ok: false, message: 'You need 10 virulence to infect.' };
  const target = nearest(lobby, player, (candidate) => candidate.role === 'animal' && distance(player, candidate) <= 16);
  if (!target) return { ok: false, message: 'No animal is in transmission range.' };
  player.virulence -= 10;
  const resistance = target.immunity + (target.mutations.includes('shield') ? 10 : 0);
  if (resistance >= player.virulence + 18) {
    target.immunity += 5;
    announce(lobby, `${target.name} resisted ${player.name}'s infection and learned from it.`);
  } else {
    const disease = player.disease || DISEASES[0];
    const damage = disease.damage || 30;
    const dealt = Math.min(damage, target.health);
    target.health -= damage;
    target.immunity += 3;
    player.stats.infections += 1;
    player.stats.damageDealt += dealt;
    target.stats.damageTaken += dealt;
    announce(lobby, `${player.name}'s ${disease.name} infected ${target.name} for ${damage} damage.`);
    if (target.health <= 0) transformToIllness(lobby, target);
  }
  checkVictory(lobby);
  return { ok: true };
}

function evolve(lobby, player, mutation) {
  if (!active(player) || player.role !== 'animal') return { ok: false, message: 'Only animals can evolve.' };
  if (!['shield', 'scavenger'].includes(mutation) || player.mutations.includes(mutation)) {
    return { ok: false, message: 'That animal mutation is unavailable.' };
  }
  if (player.food < 15 || player.water < 10) return { ok: false, message: 'Evolution costs 15 food and 10 water.' };
  player.food -= 15;
  player.water -= 10;
  player.mutations.push(mutation);
  if (mutation === 'shield') player.immunity += 12;
  if (mutation === 'scavenger') player.energy += 20;
  player.stats.mutations += 1;
  announce(lobby, `${player.name} evolved ${mutation === 'shield' ? 'Thick Hide' : 'Scavenger Instinct'}.`);
  return { ok: true };
}

function mutate(lobby, player, mutation) {
  if (!active(player) || player.role !== 'illness') return { ok: false, message: 'Only illness players can mutate.' };
  if (!['spore', 'adaptive'].includes(mutation) || player.mutations.includes(mutation)) {
    return { ok: false, message: 'That pathogen mutation is unavailable.' };
  }
  if (player.virulence < 15) return { ok: false, message: 'Mutation costs 15 virulence.' };
  player.virulence -= 15;
  player.mutations.push(mutation);
  if (mutation === 'spore') player.virulence += 18;
  if (mutation === 'adaptive') player.virulence += 8;
  player.stats.mutations += 1;
  announce(lobby, `${player.name} mutated their pathogen with ${mutation}.`);
  return { ok: true };
}

function neutralize(lobby, player) {
  if (!active(player) || player.role !== 'animal') return { ok: false, message: 'Only animals can neutralize illness.' };
  const target = nearest(lobby, player, (candidate) => candidate.role === 'illness' && distance(player, candidate) <= 14);
  if (!target) return { ok: false, message: 'No illness is close enough.' };
  if (player.immunity < target.virulence) {
    return { ok: false, message: `Your immunity (${player.immunity}) is below pathogen strength (${target.virulence}).` };
  }
  target.state = 'neutralized';
  player.stats.neutralizations += 1;
  announce(lobby, `${player.name} neutralized ${target.name}'s illness.`);
  checkVictory(lobby);
  return { ok: true };
}

function applyAction(lobby, playerId, action) {
  if (action.type === 'ready') return setReady(lobby, playerId);
  if (action.type === 'start') return startGame(lobby, playerId);
  if (action.type === 'restart') {
    if (playerId !== lobby.hostId || lobby.phase !== 'ended') return { ok: false, message: 'Only the host can restart an ended match.' };
    const players = [...lobby.players.values()];
    const names = players.map((player) => player.name);
    const species = players.map((player) => player.species);
    const ids = [...lobby.players.keys()];
    lobby.phase = 'lobby';
    lobby.winner = null;
    lobby.hadIllness = false;
    lobby.tick = 0;
    lobby.nextDiseaseIndex = 0;
    lobby.resources = RESOURCE_TEMPLATES.map((resource) => ({ ...resource, available: true }));
    lobby.events = [];
    ids.forEach((playerId, index) => lobby.players.set(playerId, makePlayer(playerId, names[index], index + 1, species[index])));
    announce(lobby, 'The refuge is ready for a rematch.');
    return { ok: true };
  }
  if (lobby.phase !== 'playing') return { ok: false, message: 'The match is not active.' };
  const player = getPlayer(lobby, playerId);
  if (!player) return { ok: false, message: 'Player not found.' };
  switch (action.type) {
    case 'move': return move(lobby, player, action.dx, action.dy);
    case 'gather': return gather(lobby, player);
    case 'challenge': return challenge(lobby, player);
    case 'infect': return infect(lobby, player);
    case 'evolve': return evolve(lobby, player, action.mutation);
    case 'mutate': return mutate(lobby, player, action.mutation);
    case 'neutralize': return neutralize(lobby, player);
    default: return { ok: false, message: 'Unknown action.' };
  }
}

function tick(lobby) {
  if (lobby.phase !== 'playing') return;
  lobby.tick += 1;
  const newlyIllness = [];
  for (const player of lobby.players.values()) {
    if (!active(player)) continue;
    if (player.role === 'illness') player.virulence = Math.min(100, player.virulence + 2);
    if (player.role === 'animal' && player.food > 0 && player.health < player.maxHealth) {
      player.food -= 1;
      player.health = Math.min(player.maxHealth, player.health + 2);
    }
    if (player.role === 'animal' && player.water > 0) player.water -= 1;
    if (player.role === 'animal' && player.water === 0) {
      player.health -= 1;
      player.stats.damageTaken += 1;
    }
    if (player.role === 'animal' && player.health <= 0) newlyIllness.push(player);
  }
  newlyIllness.forEach((player) => transformToIllness(lobby, player));
  if (lobby.tick % 4 === 0) {
    const unavailable = lobby.resources.filter((resource) => !resource.available);
    if (unavailable.length) unavailable[0].available = true;
  }
  checkVictory(lobby);
}

function publicState(lobby, viewerId) {
  const players = [...lobby.players.values()].map((player) => ({ ...player }));
  const you = players.find((player) => player.id === viewerId) || null;
  return {
    code: lobby.code,
    phase: lobby.phase,
    winner: lobby.winner,
    hostId: lobby.hostId,
    tick: lobby.tick,
    you: you ? { ...you } : null,
    players,
    resources: lobby.resources.filter((resource) => resource.available).map((resource) => ({ ...resource })),
    events: lobby.events,
  };
}

module.exports = {
  ARENA_SIZE,
  MAX_PLAYERS,
  createLobby,
  addPlayer,
  applyAction,
  getPlayer,
  publicState,
  tick,
};
