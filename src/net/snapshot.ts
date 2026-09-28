/**
 * Binary snapshot codec (PROJECT_PLAN.md §13.5): quantised to 1 cm positions and
 * 16-bit angles. Full snapshots for now; delta compression comes in Phase 2.
 * At 8v8 with 8 balls a snapshot is ~250 bytes, ~7.5 KB/s at 30 Hz.
 */
import type { GameState, Life } from '../sim/types';
import type { BallType } from '../sim/tuning';

export const MSG_SNAPSHOT = 1;
export const MSG_INPUT = 2;

const PHASES = ['countdown', 'play', 'round_end', 'match_end'] as const;
const LIVES: Life[] = ['active', 'tripped', 'out'];
const BALL_STATES = ['rest', 'held', 'live', 'dead'] as const;
const BALL_TYPES: BallType[] = ['standard', 'speed', 'heavy'];
const ACTIONS = ['none', 'pickup', 'aim', 'catch', 'block'] as const;

const TAU = Math.PI * 2;
const cm = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
const ang16 = (a: number) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);

export interface PlayerSnap {
  id: number; x: number; y: number; z: number; yaw: number; pitch: number;
  life: Life; crouching: boolean; sprinting: boolean; sliding: boolean; held: number;
  action: (typeof ACTIONS)[number];
}
export interface BallSnap { id: number; x: number; y: number; z: number; state: (typeof BALL_STATES)[number]; type: BallType }
export interface Snapshot {
  tick: number; phase: (typeof PHASES)[number]; score: [number, number];
  players: PlayerSnap[]; balls: BallSnap[];
}

export function encodeSnapshot(s: GameState): ArrayBuffer {
  const size = 1 + 4 + 1 + 2 + 2 + s.players.length * 14 + s.balls.length * 8;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, MSG_SNAPSHOT);
  v.setUint32(o, s.tick); o += 4;
  v.setUint8(o++, PHASES.indexOf(s.phase));
  v.setUint8(o++, s.score[0]); v.setUint8(o++, s.score[1]);
  v.setUint8(o++, s.players.length); v.setUint8(o++, s.balls.length);
  for (const p of s.players) {
    v.setUint8(o++, p.id);
    v.setInt16(o, cm(p.pos.x)); o += 2;
    v.setInt16(o, cm(p.pos.y)); o += 2;
    v.setInt16(o, cm(p.pos.z)); o += 2;
    v.setUint16(o, ang16(p.yaw)); o += 2;
    v.setInt8(o++, Math.round(p.pitch * 80));
    v.setUint8(o++, LIVES.indexOf(p.life) | (p.crouching ? 4 : 0) | (p.sprinting ? 8 : 0) | (p.slideT > 0 ? 16 : 0));
    v.setInt8(o++, p.held);
    v.setUint8(o++, ACTIONS.indexOf(p.action.kind));
  }
  for (const b of s.balls) {
    v.setUint8(o++, b.id);
    v.setInt16(o, cm(b.pos.x)); o += 2;
    v.setInt16(o, cm(b.pos.y)); o += 2;
    v.setInt16(o, cm(b.pos.z)); o += 2;
    v.setUint8(o++, BALL_STATES.indexOf(b.state) | (BALL_TYPES.indexOf(b.type) << 4));
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  let o = 1;
  const tick = v.getUint32(o); o += 4;
  const phase = PHASES[v.getUint8(o++)]!;
  const score: [number, number] = [v.getUint8(o++), v.getUint8(o++)];
  const np = v.getUint8(o++);
  const nb = v.getUint8(o++);
  const players: PlayerSnap[] = [];
  for (let i = 0; i < np; i++) {
    const id = v.getUint8(o++);
    const x = v.getInt16(o) / 100; o += 2;
    const y = v.getInt16(o) / 100; o += 2;
    const z = v.getInt16(o) / 100; o += 2;
    const yaw = (v.getUint16(o) / 65535) * TAU; o += 2;
    const pitch = v.getInt8(o++) / 80;
    const f = v.getUint8(o++);
    const held = v.getInt8(o++);
    const action = ACTIONS[v.getUint8(o++)]!;
    players.push({ id, x, y, z, yaw, pitch, life: LIVES[f & 3]!, crouching: !!(f & 4), sprinting: !!(f & 8), sliding: !!(f & 16), held, action });
  }
  const balls: BallSnap[] = [];
  for (let i = 0; i < nb; i++) {
    const id = v.getUint8(o++);
    const x = v.getInt16(o) / 100; o += 2;
    const y = v.getInt16(o) / 100; o += 2;
    const z = v.getInt16(o) / 100; o += 2;
    const f = v.getUint8(o++);
    balls.push({ id, x, y, z, state: BALL_STATES[f & 15]!, type: BALL_TYPES[f >> 4]! });
  }
  return { tick, phase, score, players, balls };
}

/**
 * A realistically sized input packet (~2 ticks of input + 2 redundant), used by
 * the latency probe so upstream bytes and billed messages match the real game.
 */
export function encodeProbeInput(seq: number): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 4 + 4 * 8);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, seq);
  return buf;
}
