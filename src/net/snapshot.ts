/**
 * Binary snapshot codec (PROJECT_PLAN.md §13.5): quantised to 1 cm positions,
 * 16-bit angles and small fixed-point fields for the HUD (stamina, charge,
 * timers, stats). Full snapshots for now; delta compression comes in Phase 2.
 * At 8v8 with 8 balls a snapshot is ~685 bytes, ~20 KB/s at 30 Hz.
 *
 * Little-endian is pinned explicitly at every multi-byte operation: some
 * runtimes (e.g. certain Node 24 builds) default DataView to big-endian, and
 * the worker and the browser must agree regardless of their defaults.
 *
 * The server only ever calls encodeSnapshot; the browser calls decodeSnapshot
 * + applySnapshot to fill its local state container (Phase 2b).
 */
import { PLAYER } from '../sim/tuning';
import type { Action, GameState, Life } from '../sim/types';
import type { BallType } from '../sim/tuning';

export const MSG_SNAPSHOT = 1;
export const MSG_INPUT = 2;

const PHASES = ['countdown', 'play', 'round_end', 'match_end'] as const;
const LIVES: Life[] = ['active', 'tripped', 'out'];
const BALL_STATES = ['rest', 'held', 'live', 'dead'] as const;
const BALL_TYPES: BallType[] = ['standard', 'speed', 'heavy', 'bounce'];
const ACTIONS = ['none', 'pickup', 'aim', 'catch', 'block'] as const;

const TAU = Math.PI * 2;
const cm = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
const ang16 = (a: number) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);
const u16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));
const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export interface PlayerSnap {
  id: number; x: number; y: number; z: number; yaw: number; pitch: number;
  life: Life; crouching: boolean; sprinting: boolean; sliding: boolean; held: number;
  action: (typeof ACTIONS)[number];
  vx: number; vy: number; vz: number;
  stamina: number; // 0..PLAYER.staminaMax
  actionT: number; // seconds
  tripT: number; // seconds
  reviveT: number; // seconds
  outOrder: number;
  coins: number; kos: number; catches: number; blocks: number; score: number;
  onGround: boolean;
}
export interface BallSnap { id: number; x: number; y: number; z: number; state: (typeof BALL_STATES)[number]; type: BallType }
export interface Snapshot {
  tick: number; phase: (typeof PHASES)[number]; score: [number, number];
  players: PlayerSnap[]; balls: BallSnap[];
  round: number; phaseT: number; slowT: number; timeScale: number;
  target: { x: number; y: number; z: number; t: number } | null;
}

export function encodeSnapshot(s: GameState): ArrayBuffer {
  const target = s.target;
  const size = 1 + 4 + 1 + 2 + 2 + 7 + (target ? 7 : 0) + s.players.length * 33 + s.balls.length * 8;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, MSG_SNAPSHOT);
  v.setUint32(o, s.tick, true); o += 4;
  v.setUint8(o++, PHASES.indexOf(s.phase));
  v.setUint8(o++, s.score[0]); v.setUint8(o++, s.score[1]);
  v.setUint8(o++, s.players.length); v.setUint8(o++, s.balls.length);
  // HUD globals (§4.9): round, countdown, slow-mo, time scale, target.
  v.setUint8(o++, u8(s.round));
  v.setUint16(o, u16(s.phaseT * 100), true); o += 2;
  v.setUint16(o, u16(s.slowT * 100), true); o += 2;
  v.setUint8(o++, u8(s.timeScale * 255));
  v.setUint8(o++, target ? 1 : 0);
  if (target) {
    v.setInt16(o, cm(target.pos.x), true); o += 2;
    v.setInt16(o, cm(target.pos.y), true); o += 2;
    v.setInt16(o, cm(target.pos.z), true); o += 2;
    v.setUint8(o++, u8(target.t));
  }
  for (const p of s.players) {
    v.setUint8(o++, p.id);
    v.setInt16(o, cm(p.pos.x), true); o += 2;
    v.setInt16(o, cm(p.pos.y), true); o += 2;
    v.setInt16(o, cm(p.pos.z), true); o += 2;
    v.setUint16(o, ang16(p.yaw), true); o += 2;
    v.setInt8(o++, Math.round(p.pitch * 80));
    v.setUint8(o++, LIVES.indexOf(p.life) | (p.crouching ? 4 : 0) | (p.sprinting ? 8 : 0) | (p.slideT > 0 ? 16 : 0) | (p.onGround ? 32 : 0));
    v.setInt8(o++, p.held);
    v.setUint8(o++, ACTIONS.indexOf(p.action.kind));
    v.setInt16(o, cm(p.vel.x), true); o += 2;
    v.setInt16(o, cm(p.vel.y), true); o += 2;
    v.setInt16(o, cm(p.vel.z), true); o += 2;
    v.setUint8(o++, u8((p.stamina / PLAYER.staminaMax) * 255));
    v.setUint16(o, u16(('t' in p.action ? p.action.t : 0) * 1000), true); o += 2;
    v.setUint16(o, u16(p.tripT * 1000), true); o += 2;
    v.setUint16(o, u16(p.reviveT * 100), true); o += 2;
    v.setUint8(o++, u8(p.outOrder));
    v.setUint16(o, u16(p.coins), true); o += 2;
    v.setUint8(o++, u8(p.kos)); v.setUint8(o++, u8(p.catches)); v.setUint8(o++, u8(p.blocks)); v.setUint8(o++, u8(p.score));
  }
  for (const b of s.balls) {
    v.setUint8(o++, b.id);
    v.setInt16(o, cm(b.pos.x), true); o += 2;
    v.setInt16(o, cm(b.pos.y), true); o += 2;
    v.setInt16(o, cm(b.pos.z), true); o += 2;
    v.setUint8(o++, BALL_STATES.indexOf(b.state) | (BALL_TYPES.indexOf(b.type) << 4));
  }
  return buf;
}

export function decodeSnapshot(buf: ArrayBuffer): Snapshot {
  const v = new DataView(buf);
  let o = 1;
  const tick = v.getUint32(o, true); o += 4;
  const phase = PHASES[v.getUint8(o++)]!;
  const score: [number, number] = [v.getUint8(o++), v.getUint8(o++)];
  const np = v.getUint8(o++);
  const nb = v.getUint8(o++);
  const round = v.getUint8(o++);
  const phaseT = v.getUint16(o, true) / 100; o += 2;
  const slowT = v.getUint16(o, true) / 100; o += 2;
  const timeScale = v.getUint8(o++) / 255;
  const hasTarget = v.getUint8(o++) === 1;
  const target = hasTarget
    ? { x: v.getInt16(o, true) / 100, y: v.getInt16(o + 2, true) / 100, z: v.getInt16(o + 4, true) / 100, t: v.getUint8(o + 6) }
    : null;
  if (hasTarget) o += 7;
  const players: PlayerSnap[] = [];
  for (let i = 0; i < np; i++) {
    const id = v.getUint8(o++);
    const x = v.getInt16(o, true) / 100; o += 2;
    const y = v.getInt16(o, true) / 100; o += 2;
    const z = v.getInt16(o, true) / 100; o += 2;
    const yaw = (v.getUint16(o, true) / 65535) * TAU; o += 2;
    const pitch = v.getInt8(o++) / 80;
    const f = v.getUint8(o++);
    const held = v.getInt8(o++);
    const action = ACTIONS[v.getUint8(o++)]!;
    const vx = v.getInt16(o, true) / 100; o += 2;
    const vy = v.getInt16(o, true) / 100; o += 2;
    const vz = v.getInt16(o, true) / 100; o += 2;
    const stamina = v.getUint8(o++) * (PLAYER.staminaMax / 255);
    const actionT = v.getUint16(o, true) / 1000; o += 2;
    const tripT = v.getUint16(o, true) / 1000; o += 2;
    const reviveT = v.getUint16(o, true) / 100; o += 2;
    const outOrder = v.getUint8(o++);
    const coins = v.getUint16(o, true); o += 2;
    const kos = v.getUint8(o++);
    const catches = v.getUint8(o++);
    const blocks = v.getUint8(o++);
    const scoreP = v.getUint8(o++);
    players.push({ id, x, y, z, yaw, pitch, life: LIVES[f & 3]!, crouching: !!(f & 4), sprinting: !!(f & 8), sliding: !!(f & 16), held, action, vx, vy, vz, stamina, actionT, tripT, reviveT, outOrder, coins, kos, catches, blocks, score: scoreP, onGround: !!(f & 32) });
  }
  const balls: BallSnap[] = [];
  for (let i = 0; i < nb; i++) {
    const id = v.getUint8(o++);
    const x = v.getInt16(o, true) / 100; o += 2;
    const y = v.getInt16(o, true) / 100; o += 2;
    const z = v.getInt16(o, true) / 100; o += 2;
    const f = v.getUint8(o++);
    balls.push({ id, x, y, z, state: BALL_STATES[f & 15]!, type: BALL_TYPES[f >> 4]! });
  }
  return { tick, phase, score, players, balls, round, phaseT, slowT, timeScale, target };
}

/** Rebuild an Action from the wire fields; sim-only extras use local context. */
function actionOf(kind: PlayerSnap['action'], t: number, held: number): Action {
  if (kind === 'none') return { kind: 'none' };
  if (kind === 'pickup') return { kind: 'pickup', t, ballId: held };
  if (kind === 'aim') return { kind: 'aim', t, released: false };
  return { kind, t };
}

/**
 * Write a decoded snapshot into the client's local state container
 * (Phase 2b: the browser never steps the sim; the referee's snapshots are truth).
 * Fields not on the wire (rng, timers, cooldowns) keep their last values.
 */
export function applySnapshot(s: GameState, d: Snapshot): void {
  s.tick = d.tick;
  s.phase = d.phase;
  s.score = d.score;
  s.round = d.round;
  s.phaseT = d.phaseT;
  s.slowT = d.slowT;
  s.timeScale = d.timeScale;
  s.target = d.target ? { pos: { x: d.target.x, y: d.target.y, z: d.target.z }, vz: 0, t: d.target.t } : null;
  for (const ps of d.players) {
    const p = s.players[ps.id];
    if (!p) continue;
    p.pos = { x: ps.x, y: ps.y, z: ps.z };
    p.vel = { x: ps.vx, y: ps.vy, z: ps.vz };
    p.yaw = ps.yaw;
    p.pitch = ps.pitch;
    p.onGround = ps.onGround;
    p.crouching = ps.crouching;
    p.sprinting = ps.sprinting;
    p.slideT = ps.sliding ? 0.001 : 0;
    p.life = ps.life;
    p.stamina = ps.stamina;
    p.tripT = ps.tripT;
    p.reviveT = ps.reviveT;
    p.outOrder = ps.outOrder;
    p.held = ps.held;
    p.action = actionOf(ps.action, ps.actionT, ps.held);
    p.coins = ps.coins;
    p.kos = ps.kos;
    p.catches = ps.catches;
    p.blocks = ps.blocks;
    p.score = ps.score;
  }
  for (const bs of d.balls) {
    const b = s.balls[bs.id];
    if (!b) continue;
    b.pos = { x: bs.x, y: bs.y, z: bs.z };
    b.state = bs.state;
    b.type = bs.type;
  }
}

/**
 * A realistically sized input packet (~2 ticks of input + 2 redundant), used by
 * the latency probe so upstream bytes and billed messages match the real game.
 */
export function encodeProbeInput(seq: number): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 4 + 4 * 8);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, seq, true);
  return buf;
}
