/**
 * Online match session (Phase 2b): one WebSocket to the GameRoom referee.
 * The browser never steps the sim — it sends 30 Hz input packets and renders
 * the referee's 30 Hz snapshots into its local state container. Prediction,
 * reconciliation and reconnect arrive in Phase 2c/2d.
 */
import { encodeInput, type RoomClientMsg, type RoomServerMsg } from '../net/protocol';
import { decodeSnapshot, type Snapshot } from '../net/snapshot';
import type { PlayerInput, SimEvent } from '../sim/types';

const INPUT_MS = 33; // 30 Hz, same rate as the referee's snapshots

export interface WelcomeMsg {
  code: string;
  playerId: number;
  seed: number;
  teamSize: number;
  players: { id: number; name: string; team: 0 | 1; bot: boolean }[];
}

export interface OnlineCallbacks {
  onWelcome(w: WelcomeMsg): void;
  onSnapshot(snap: Snapshot): void;
  onEvents(events: SimEvent[]): void;
  /** A human joined/left: apply the roster to the local state. */
  onRoster(msg: { t: 'joined'; player: { id: number; name: string; team: 0 | 1; bot: boolean } } | { t: 'left'; playerId: number }): void;
  onFull(players: number): void;
  /** Connection closed: `reason` is '' when we closed it ourselves. */
  onClosed(reason: string): void;
}

export class OnlineSession {
  private ws: WebSocket | undefined;
  private seq = 0;
  private inputTimer: ReturnType<typeof setInterval> | undefined;
  private sample: (() => PlayerInput) | undefined;

  constructor(readonly code: string, readonly name: string, private cbs: OnlineCallbacks) {}

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/rt/room?code=${this.code}`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      const hello: RoomClientMsg = { t: 'hello', name: this.name };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = (ev) => {
      this.stopInput();
      if (this.closed) return;
      this.closed = true;
      this.cbs.onClosed(ev.reason ? `room closed: ${ev.reason}` : `connection lost (${ev.code})`);
    };
  }

  /** Start pumping the player's inputs at 30 Hz. Called once the local view is ready. */
  begin(sample: () => PlayerInput): void {
    this.sample = sample;
    this.inputTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || !this.sample) return;
      try {
        ws.send(encodeInput(this.seq++, this.sample()));
      } catch {
        /* close handler reports the disconnect */
      }
    }, INPUT_MS);
  }

  closed = false;

  close(): void {
    this.closed = true;
    this.stopInput();
    try {
      this.ws?.close(1000, 'leaving');
    } catch { /* already gone */ }
    this.ws = undefined;
  }

  private stopInput(): void {
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.inputTimer = undefined;
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.cbs.onSnapshot(decodeSnapshot(data as ArrayBuffer));
      return;
    }
    const msg = JSON.parse(data) as RoomServerMsg;
    switch (msg.t) {
      case 'welcome':
        this.cbs.onWelcome(msg);
        break;
      case 'joined':
      case 'left':
        this.cbs.onRoster(msg);
        break;
      case 'events':
        this.cbs.onEvents(msg.e);
        break;
      case 'full':
        this.cbs.onFull(msg.players);
        break;
      case 'bye':
        this.cbs.onClosed(msg.reason);
        break;
    }
  }
}
