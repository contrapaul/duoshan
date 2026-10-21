/**
 * The match referee (PROJECT_PLAN.md §13.6): one `GameRoom` Durable Object per
 * room code. Runs the authoritative sim (`src/sim`) at 60 Hz while at least
 * one human is connected, broadcasts binary snapshots at 30 Hz, and applies
 * each human's newest input packet every tick. Bots fill the rest of the court.
 *
 * Lifecycle: the sim starts when the first human joins and stops when the last
 * leaves; the next group of joiners gets a fresh match. A human who connects
 * mid-match takes over the least-used bot slot on the smaller team (§9.1
 * join-in-progress); if that slot is knocked out they spectate until it is
 * revived. Reconnect-with-slot-hold and Quick Play arrive in later slices.
 */
import { DurableObject } from 'cloudflare:workers';
import { createBrain, botInputs, type BotBrain } from '../src/bots/bot';
import { cleanName, decodeInput, roomPlayers, type RoomClientMsg, type RoomServerMsg } from '../src/net/protocol';
import { encodeSnapshot } from '../src/net/snapshot';
import { createGame, step } from '../src/sim/game';
import type { Rng } from '../src/sim/rng';
import { nextInt } from '../src/sim/rng';
import { TICK_HZ } from '../src/sim/tuning';
import type { GameState, PlayerInput } from '../src/sim/types';
import { NO_INPUT } from '../src/sim/types';

const TICK_MS = 1000 / TICK_HZ;
const TEAM_SIZES = [3, 5, 8] as const;

interface Slot {
  ws: WebSocket;
  input: PlayerInput;
  hasInput: boolean;
  seq: number;
}

interface RoomEnv {
  DIRECTORY: DurableObjectNamespace;
}

export class GameRoom extends DurableObject<RoomEnv> {
  private rng: Rng = { s: 1 };
  private teamSize = 3;
  private seed = 0;
  private state: GameState | undefined;
  private brains = new Map<number, BotBrain>();
  /** Human player id → connection. */
  private humans = new Map<number, Slot>();
  /** Connected sockets that have not said hello yet. */
  private pending = new Set<WebSocket>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tickCount = 0;
  private startMs = 0;
  private ticksDone = 0;
  private lastDirectoryPing = 0;

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const team = Number(request.headers.get('x-team-size'));
    if ((TEAM_SIZES as readonly number[]).includes(team)) this.teamSize = team;
    this.rng = { s: (Date.now() ^ (this.teamSize * 0x9e3779b9)) | 1 };

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.pending.add(server);

    server.addEventListener('message', (ev) => {
      try {
        if (typeof ev.data === 'string') {
          this.onControl(server, JSON.parse(ev.data) as RoomClientMsg);
        } else if (this.pending.has(server)) {
          // Input before hello is dropped; the client waits for welcome first.
        } else {
          const slot = this.slotByWs(server);
          if (slot) {
            const { seq, input } = decodeInput(ev.data as ArrayBuffer | Uint8Array);
            slot.input = input;
            slot.hasInput = true;
            slot.seq = seq;
          }
        }
      } catch (err) {
        // A malformed packet must not kill the room — drop it and move on.
        console.error(`room ${this.ctx.id.name} bad message`, err);
      }
    });
    const drop = () => this.dropSlot(server);
    server.addEventListener('close', drop);
    server.addEventListener('error', drop);

    return new Response(null, { status: 101, webSocket: client });
  }

  private slotByWs(ws: WebSocket): Slot | undefined {
    for (const slot of this.humans.values()) if (slot.ws === ws) return slot;
    return undefined;
  }

  private onControl(ws: WebSocket, msg: RoomClientMsg): void {
    if (msg.t === 'hello' && this.pending.has(ws)) {
      this.pending.delete(ws);
      this.join(ws, msg.name);
    }
    // `start` needs no work: the match runs from the first join onward.
  }

  private join(ws: WebSocket, rawName?: string): void {
    if (!this.state) this.startMatch();
    const s = this.state!;

    // Take over a bot slot: smaller team first, then lowest id.
    const humansPerTeam = [0, 0];
    for (const id of this.humans.keys()) humansPerTeam[s.players[id]!.team]!++;
    const team = (humansPerTeam[0]! <= humansPerTeam[1]! ? 0 : 1) as 0 | 1;
    const id = s.players.findIndex((p) => p.bot && p.team === team);
    if (id < 0) {
      this.send(ws, { t: 'full', players: s.players.length });
      ws.close(1000, 'room full');
      return;
    }

    const p = s.players[id]!;
    p.bot = false;
    p.name = cleanName(rawName, this.rng);
    this.brains.delete(id);
    this.humans.set(id, { ws, input: NO_INPUT, hasInput: false, seq: 0 });
    this.send(ws, { t: 'welcome', code: this.ctx.id.name?.replace(/^room-/, '') ?? '', playerId: id, seed: this.seed, teamSize: s.players.length / 2, players: roomPlayers(s) });
    this.broadcast({ t: 'joined', player: { id, name: p.name, team: p.team, bot: false } });
    this.heartbeat();
  }

  private dropSlot(ws: WebSocket): void {
    this.pending.delete(ws);
    const s = this.state;
    for (const [id, slot] of this.humans) {
      if (slot.ws !== ws) continue;
      this.humans.delete(id);
      if (s) {
        // The seat reverts to a bot so the court stays full.
        s.players[id]!.bot = true;
        this.brains.set(id, createBrain(s.players[id]!, 'medium', id + 1));
      }
      this.broadcast({ t: 'left', playerId: id });
      break;
    }
    if (this.humans.size === 0) {
      this.heartbeat(); // final 0-players status before the loop stops
      this.stopLoop();
      this.state = undefined;
    } else {
      this.heartbeat();
    }
  }

  private startMatch(): void {
    this.seed = nextInt(this.rng, 0xffffff) | 1;
    this.state = createGame({ seed: this.seed, teamSize: this.teamSize, humans: [] });
    for (const p of this.state.players) this.brains.set(p.id, createBrain(p, 'medium', p.id + 1));
    this.ensureLoop();
    this.tickCount = 0;
    this.ticksDone = 0;
    this.startMs = Date.now();
  }

  /**
   * Start the 60 Hz simulation loop if it is not already running.
   */
  private ensureLoop(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      try {
        void this.onTimer();
      } catch (err) {
        console.error(`room ${this.ctx.id.name} loop error`, err);
      }
    }, Math.ceil(1000 / TICK_HZ));
  }

  private stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private onTimer(): void {
    const s = this.state;
    if (!s) return;
    const now = Date.now();
    const due = Math.floor((now - this.startMs) / TICK_MS);
    let n = Math.min(due - this.ticksDone, 6);
    if (due - this.ticksDone > 6) this.ticksDone = due - 6;

    while (n-- > 0) {
      const inputs: PlayerInput[] = s.players.map((p) => {
        const slot = this.humans.get(p.id);
        return slot?.hasInput ? slot.input : NO_INPUT;
      });
      botInputs(s, this.brains, inputs);
      step(s, inputs);
      this.ticksDone++;
      this.tickCount++;
      if (s.events.length > 0) {
        this.broadcast({ t: 'events', e: s.events });
        s.events.length = 0;
      }
      if (this.tickCount % 2 === 0) {
        const buf = encodeSnapshot(s);
        for (const slot of this.humans.values()) {
          try {
            slot.ws.send(buf);
          } catch {
            /* close handler drops the slot */
          }
        }
      }
    }
    if (now - this.lastDirectoryPing > 5000) this.heartbeat();
  }

  private heartbeat(): void {
    this.lastDirectoryPing = Date.now();
    const dir = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('directory'));
    void dir.fetch(new Request('https://internal/status', {
      method: 'POST',
      body: JSON.stringify({
        t: 'status',
        code: this.ctx.id.name?.replace(/^room-/, ''),
        players: this.humans.size,
        seats: this.state?.players.length ?? this.teamSize * 2,
        phase: this.state?.phase ?? 'lobby',
      }),
    })).catch(() => undefined);
  }

  private send(ws: WebSocket, msg: RoomServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      this.dropSlot(ws);
    }
  }

  private broadcast(msg: RoomServerMsg): void {
    const text = JSON.stringify(msg);
    for (const slot of this.humans.values()) {
      try {
        slot.ws.send(text);
      } catch {
        /* close handler drops the slot */
      }
    }
  }
}
