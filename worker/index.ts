/**
 * The Worker in front of the static game (Tome of Secrets layout, PROJECT_PLAN.md §13.3).
 *
 * - `/api/ping`          tiny JSON for HTTP round-trips to the nearest Cloudflare edge.
 * - `/api/rooms`         create a room (POST) / room status (GET /api/rooms/:code).
 * - `/rt/probe`          WebSocket to a fresh ProbeRoom Durable Object (Phase 0 spike S2/S3).
 * - `/rt/room`           WebSocket to the GameRoom referee for a room code.
 * - `/r/CODE`            share link: serves the app, which prefills the join code.
 * - everything else is served from the static assets.
 */
import { PROBE_HINTS, type ProbeHint } from '../src/net/probe';

export { GameRoom } from './GameRoom';
export { ProbeRoom } from './ProbeRoom';
export { RoomDirectory } from './RoomDirectory';

export interface Env {
  ASSETS: Fetcher;
  PROBE: DurableObjectNamespace;
  GAMEROOM: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
}

/** Map the request's continent to a Durable Object location hint (§13.6). */
function locationHint(cf: Request['cf']): DurableObjectLocationHint | undefined {
  switch (cf?.continent) {
    case 'AP': return 'apac';
    case 'EU': return 'weur';
    case 'NA': return 'wnam';
    default: return undefined;
  }
}

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cf = request.cf as { colo?: string; country?: string } | undefined;

    if (url.pathname === '/api/ping') {
      return Response.json(
        { colo: cf?.colo ?? 'local', country: cf?.country ?? '??', t: Date.now() },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { teamSize?: number };
      const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
      const res = await dir.fetch(new Request('https://internal/create', {
        method: 'POST',
        body: JSON.stringify({ t: 'create', teamSize: body.teamSize }),
      }));
      const data = await res.json() as { code?: string; teamSize?: number; error?: string };
      if (!res.ok || !data.code) return Response.json(data, { status: res.status || 502 });
      const shareUrl = `${url.origin}/r/${data.code}`;
      return Response.json({ code: data.code, teamSize: data.teamSize, url: shareUrl }, { status: 201 });
    }

    const roomMatch = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{5})$/.exec(url.pathname);
    if (roomMatch) {
      const row = await roomStatus(env, roomMatch[1]!);
      return row ? Response.json(row) : Response.json({ error: 'no such room' }, { status: 404 });
    }

    if (url.pathname === '/rt/room') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const code = url.searchParams.get('code') ?? '';
      if (!ROOM_CODE.test(code)) return new Response('Bad room code', { status: 400 });
      const info = await roomStatus(env, code);
      if (!info) return new Response('No such room', { status: 404 });
      const headers = new Headers(request.headers);
      headers.set('x-team-size', String(info.team_size));
      const id = env.GAMEROOM.idFromName(`room-${code}`);
      const hint = locationHint(request.cf as Request['cf']);
      const stub = hint ? env.GAMEROOM.get(id, { locationHint: hint }) : env.GAMEROOM.get(id);
      return stub.fetch(new Request(request.url, { headers }));
    }

    if (url.pathname === '/rt/probe') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const hint = (url.searchParams.get('hint') ?? 'apac') as ProbeHint;
      // A fresh object per test so tests never share a room, placed by the location hint.
      const id = env.PROBE.newUniqueId();
      const stub = (PROBE_HINTS as readonly string[]).includes(hint)
        ? env.PROBE.get(id, { locationHint: hint as DurableObjectLocationHint })
        : env.PROBE.get(id);
      const headers = new Headers(request.headers);
      headers.set('x-edge-colo', cf?.colo ?? 'local');
      headers.set('x-country', cf?.country ?? '??');
      headers.set('x-hint', hint);
      return stub.fetch(new Request(request.url, { headers }));
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/rt/')) {
      return new Response('Not found', { status: 404 });
    }
    // Share links (/r/CODE): serve the app, which prefills the join code.
    if (url.pathname.startsWith('/r/')) {
      const u = new URL(request.url);
      u.pathname = '/';
      return env.ASSETS.fetch(new Request(u, request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

type RoomStatus = { code: string; team_size: number; players: number; seats: number; phase: string } | null;

async function roomStatus(env: Env, code: string): Promise<RoomStatus> {
  const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('directory'));
  const res = await dir.fetch(new Request('https://internal/rooms', {
    method: 'POST',
    body: JSON.stringify({ t: 'get', code }),
  }));
  const row = await res.json() as { code: string; team_size: number; players: number; seats: number; phase: string } | null;
  return row;
}
