/**
 * Phase 0 latency probe (PROJECT_PLAN.md §13.10, spikes S2 + S3).
 *
 * Behaves like a real match room: runs the actual referee (`src/sim`) at 60 Hz
 * with 16 bots, broadcasts binary snapshots at 30 Hz and accepts input-sized
 * packets at 30 Hz, so latency, tick steadiness, bandwidth and billing all match
 * a real 8v8 game. It also answers pings immediately for round-trip timing.
 *
 * Workers freeze the clock during execution, so CPU per tick is measured locally
 * with `npm run bench`; here we measure how steadily the timer fires.
 */
import { DurableObject } from 'cloudflare:workers';
import { botInputs, createBrain, type BotBrain } from '../src/bots/bot';
import { PROBE_MAX_SECONDS, type ProbeClientMsg, type ProbeServerMsg } from '../src/net/probe';
import { encodeSnapshot } from '../src/net/snapshot';
import { createGame, step } from '../src/sim/game';
import { TICK_HZ } from '../src/sim/tuning';
import type { GameState, PlayerInput } from '../src/sim/types';

const TICK_MS = 1000 / TICK_HZ;

export class ProbeRoom extends DurableObject {
  private ws: WebSocket | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private state: GameState | undefined;
  private brains = new Map<number, BotBrain>();
  private inputs: PlayerInput[] = [];
  private startMs = 0;
  private ticksDone = 0;
  private lastFire = 0;
  private win = { ticks: 0, fires: 0, maxGap: 0, snaps: 0, inputs: 0, bytes: 0, since: 0 };

  override async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.ws = server;

    this.send({
      t: 'hello',
      edgeColo: request.headers.get('x-edge-colo') ?? '?',
      country: request.headers.get('x-country') ?? '?',
      hint: request.headers.get('x-hint') ?? '?',
    });
    // Where this Durable Object actually lives.
    void fetch('https://www.cloudflare.com/cdn-cgi/trace')
      .then((r) => r.text())
      .then((txt) => this.send({ t: 'where', doColo: /colo=(\w+)/.exec(txt)?.[1] ?? '?' }))
      .catch(() => this.send({ t: 'where', doColo: 'unknown' }));

    server.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data) as ProbeClientMsg;
        if (msg.t === 'ping') this.send({ t: 'pong', id: msg.id, c: msg.c });
      } else {
        this.win.inputs++;
      }
    });
    server.addEventListener('close', () => this.stop());
    server.addEventListener('error', () => this.stop());

    this.state = createGame({ seed: Date.now() & 0xffff, teamSize: 8 });
    for (const p of this.state.players) this.brains.set(p.id, createBrain(p, 'medium', p.id + 1));
    this.startMs = Date.now();
    this.lastFire = this.startMs;
    this.win.since = this.startMs;
    this.timer = setInterval(() => this.onTimer(), TICK_MS);

    return new Response(null, { status: 101, webSocket: client });
  }

  private onTimer(): void {
    const now = Date.now();
    const s = this.state;
    if (!s || !this.ws) return;
    this.win.fires++;
    this.win.maxGap = Math.max(this.win.maxGap, now - this.lastFire);
    this.lastFire = now;

    // Catch up to wall-clock time, capped so a long stall does not spiral.
    const due = Math.floor((now - this.startMs) / TICK_MS);
    let n = Math.min(due - this.ticksDone, 6);
    if (due - this.ticksDone > 6) this.ticksDone = due - 6;
    while (n-- > 0) {
      botInputs(s, this.brains, this.inputs);
      step(s, this.inputs);
      this.ticksDone++;
      this.win.ticks++;
      if (this.ticksDone % 2 === 0) {
        const buf = encodeSnapshot(s);
        this.ws.send(buf);
        this.win.snaps++;
        this.win.bytes += buf.byteLength;
      }
    }

    if (now - this.win.since >= 1000) {
      this.send({
        t: 'stats', up: Math.round((now - this.startMs) / 1000), ticks: this.win.ticks, fires: this.win.fires,
        maxGapMs: this.win.maxGap, snaps: this.win.snaps, inputs: this.win.inputs, snapBytes: this.win.bytes,
      });
      this.win = { ticks: 0, fires: 0, maxGap: 0, snaps: 0, inputs: 0, bytes: 0, since: now };
    }
    if (now - this.startMs > PROBE_MAX_SECONDS * 1000) {
      this.send({ t: 'bye', reason: 'time limit' });
      this.ws.close(1000, 'time limit');
      this.stop();
    }
  }

  private send(msg: ProbeServerMsg): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {
      this.stop();
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.ws = undefined;
    this.state = undefined;
  }
}
