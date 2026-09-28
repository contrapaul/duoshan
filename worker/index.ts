/**
 * The Worker in front of the static game (Tome of Secrets layout, PROJECT_PLAN.md §13.3).
 *
 * - `/api/ping`   tiny JSON for HTTP round-trips to the nearest Cloudflare edge.
 * - `/rt/probe`   WebSocket to a fresh ProbeRoom Durable Object (Phase 0 spike S2/S3).
 * - everything else is served from the static assets.
 */
import { PROBE_HINTS, type ProbeHint } from '../src/net/probe';

export { ProbeRoom } from './ProbeRoom';

export interface Env {
  ASSETS: Fetcher;
  PROBE: DurableObjectNamespace;
}

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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
