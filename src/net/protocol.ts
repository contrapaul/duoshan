/**
 * Shared room protocol (PROJECT_PLAN.md §9.1, §13.5, §13.6).
 *
 * Binary for gameplay (snapshot in snapshot.ts, input here), JSON control
 * messages for join/leave/events. Pure: runs in the browser, in the Durable
 * Objects, and headless in tests.
 */
import { BOT_NAMES } from '../sim/game';
import { nextInt, type Rng } from '../sim/rng';
import type { PlayerInput } from '../sim/types';
import type { SimEvent } from '../sim/types';

// ---------------------------------------------------------------------------
// Room codes (§9.1): 5 characters, unambiguous alphabet (no O/0/I/1).

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[nextInt(rng, CODE_ALPHABET.length)]!;
  return code;
}

/** A safe random guest display name, e.g. "Swift Otter 42" (§9.1). */
export function guestName(rng: Rng): string {
  return `${BOT_NAMES[nextInt(rng, BOT_NAMES.length)]} ${10 + nextInt(rng, 90)}`;
}

/** Clamp a guest-supplied name to something safe to store and display. */
export function cleanName(raw: string | undefined, rng: Rng): string {
  const name = (raw ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 20);
  return name.length >= 2 ? name : guestName(rng);
}

// ---------------------------------------------------------------------------
// Binary input packets (§13.5): one tick of PlayerInput, 12 bytes total.
// The server applies the newest packet it has for each human each tick;
// sequence numbers exist so reconciliation (Phase 2c) can replay inputs.

const TAU = Math.PI * 2;

export function encodeInput(seq: number, input: PlayerInput): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 4 + 2 + 2 + 2 + 1);
  const v = new DataView(buf);
  v.setUint8(0, 2 /* MSG_INPUT */);
  v.setUint32(1, seq);
  v.setInt8(5, Math.round(Math.max(-1, Math.min(1, input.moveX)) * 127));
  v.setInt8(6, Math.round(Math.max(-1, Math.min(1, input.moveZ)) * 127));
  v.setUint16(7, Math.round((((input.yaw % TAU) + TAU) % TAU) / TAU * 65535));
  v.setInt16(9, Math.round(Math.max(-1.6, Math.min(1.6, input.pitch)) * 1000));
  v.setUint8(11,
    (input.sprint ? 1 : 0) | (input.crouch ? 2 : 0) | (input.jump ? 4 : 0) |
    (input.primary ? 8 : 0) | (input.secondary ? 16 : 0) | (input.use ? 32 : 0));
  return buf;
}

export function decodeInput(buf: ArrayBuffer | Uint8Array): { seq: number; input: PlayerInput } {
  // Runtimes deliver binary WS data as either an ArrayBuffer (production)
  // or a Uint8Array (miniflare local) — normalize to a DataView.
  const v = buf instanceof ArrayBuffer
    ? new DataView(buf)
    : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const seq = v.getUint32(1);
  return {
    seq,
    input: {
      moveX: v.getInt8(5) / 127,
      moveZ: v.getInt8(6) / 127,
      yaw: (v.getUint16(7) / 65535) * TAU,
      pitch: v.getInt16(9) / 1000,
      sprint: !!(v.getUint8(11) & 1),
      crouch: !!(v.getUint8(11) & 2),
      jump: !!(v.getUint8(11) & 4),
      primary: !!(v.getUint8(11) & 8),
      secondary: !!(v.getUint8(11) & 16),
      use: !!(v.getUint8(11) & 32),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON control messages.

export type RoomPlayer = { id: number; name: string; team: 0 | 1; bot: boolean };

export type RoomClientMsg =
  /** First message after the WebSocket opens; `name` is optional (guests). */
  { t: 'hello'; name?: string }
  /** Ask the room to start the match (host convenience; the match starts on the first join anyway). */
  | { t: 'start' };

export type RoomServerMsg =
  /** Sent after hello: the client now controls `playerId`. */
  { t: 'welcome'; code: string; playerId: number; seed: number; teamSize: number; players: RoomPlayer[] }
  | { t: 'joined'; player: RoomPlayer }
  | { t: 'left'; playerId: number }
  /** Sim events since the last message (knockouts, throws, round changes, …). */
  | { t: 'events'; e: SimEvent[] }
  | { t: 'full'; players: number }
  | { t: 'bye'; reason: string };

export function roomPlayers(state: { players: { id: number; name: string; team: 0 | 1; bot: boolean }[] }): RoomPlayer[] {
  return state.players.map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot }));
}
