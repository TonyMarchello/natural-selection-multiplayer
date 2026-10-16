import { getStore } from '@netlify/blobs';
import game from '../../game.js';

const { createLobby, addPlayer, applyAction, publicState, tick } = game as typeof import('../../game.js');
const store = getStore({ name: 'natural-selection-lobbies', consistency: 'strong' });
const TICK_MS = 2000;

type StoredLobby = {
  code: string;
  phase: string;
  hostId: string;
  winner: string | null;
  hadIllness: boolean;
  tick: number;
  players: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  nextDiseaseIndex: number;
  lastNetlifyTickAt?: number;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function serialize(lobby: any): StoredLobby {
  return {
    code: lobby.code,
    phase: lobby.phase,
    hostId: lobby.hostId,
    winner: lobby.winner,
    hadIllness: lobby.hadIllness,
    tick: lobby.tick,
    players: [...lobby.players.values()].map((player: any) => ({ ...player, connected: false })),
    resources: lobby.resources.map((resource: any) => ({ ...resource })),
    events: lobby.events.map((event: any) => ({ ...event })),
    nextDiseaseIndex: lobby.nextDiseaseIndex,
    lastNetlifyTickAt: lobby.lastNetlifyTickAt,
  };
}

function hydrate(data: StoredLobby) {
  const lobby: any = {
    ...data,
    players: new Map(data.players.map((player) => [player.id as string, { ...player, connected: false }])),
    clients: new Set(),
  };
  return lobby;
}

async function load(code: string) {
  const entry = await store.getWithMetadata(code, { type: 'json', consistency: 'strong' });
  if (!entry.data) return null;
  return { lobby: hydrate(entry.data as StoredLobby), etag: entry.etag };
}

async function save(lobby: any, etag?: string, onlyIfNew = false) {
  return store.set(lobby.code, serialize(lobby), onlyIfNew ? { onlyIfNew: true } : { onlyIfMatch: etag });
}

function advanceClock(lobby: any) {
  const now = Date.now();
  const previous = lobby.lastNetlifyTickAt || now;
  const elapsedTicks = Math.min(5, Math.floor((now - previous) / TICK_MS));
  for (let index = 0; index < elapsedTicks; index += 1) tick(lobby);
  lobby.lastNetlifyTickAt = previous + elapsedTicks * TICK_MS;
}

async function create(name: string, species: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const lobby = createLobby(name, species) as any;
    lobby.lastNetlifyTickAt = Date.now();
    const result = await save(lobby, undefined, true);
    if (result.modified) return response({ code: lobby.code, playerId: lobby.hostId }, 201);
  }
  return response({ error: 'Could not allocate a lobby. Try again.' }, 503);
}

export default async (request: Request) => {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const playerId = url.searchParams.get('playerId');
      if (!code || !playerId) return response({ error: 'Lobby code and player are required.' }, 400);
      const loaded = await load(code);
      if (!loaded || !loaded.lobby.players.has(playerId)) return response({ error: 'Saved session not found.' }, 404);
      advanceClock(loaded.lobby);
      await save(loaded.lobby, loaded.etag);
      return response(publicState(loaded.lobby, playerId));
    }

    if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
    const input = await request.json() as Record<string, any>;
    if (input.operation === 'create') return create(input.name, input.species);

    const code = String(input.code || '').toUpperCase();
    const loaded = await load(code);
    if (!loaded) return response({ error: 'Lobby not found.' }, 404);
    advanceClock(loaded.lobby);

    if (input.operation === 'join') {
      const result = addPlayer(loaded.lobby, input.name, input.species);
      if (!result.ok) return response({ error: result.message }, 409);
      if (!(await save(loaded.lobby, loaded.etag)).modified) return response({ error: 'Lobby changed; please retry.' }, 409);
      return response({ code, playerId: result.playerId }, 201);
    }

    if (input.operation === 'action') {
      const result = applyAction(loaded.lobby, input.playerId, input.action || {});
      if (!(await save(loaded.lobby, loaded.etag)).modified) return response({ error: 'Match changed; please retry.' }, 409);
      return response(result, result.ok ? 200 : 422);
    }

    return response({ error: 'Unknown operation.' }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Unexpected function error.' }, 500);
  }
};
