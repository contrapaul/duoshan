import type { ArenaDef } from './arena';
import type { Vec3 } from './math';
import type { Rng } from './rng';
import type { BallType } from './tuning';

export type Team = 0 | 1; // 0 = Blue (x < 0), 1 = Red (x > 0)

/** One tick of intent from a human or a bot. Bots use exactly this interface. */
export interface PlayerInput {
  /** -1..1 strafe (right positive) and forward. */
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  /** Left mouse: pick up / catch / throw. Held state; the sim detects edges. */
  primary: boolean;
  /** Right mouse, held: block stance. */
  secondary: boolean;
  /** E: pick up / catch (same as primary with empty hands). */
  use: boolean;
}

export const NO_INPUT: PlayerInput = {
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, primary: false, secondary: false, use: false,
};

export type Life = 'active' | 'tripped' | 'out';

export type Action =
  | { kind: 'none' }
  | { kind: 'pickup'; t: number; ballId: number }
  | { kind: 'aim'; t: number; released: boolean }
  | { kind: 'catch'; t: number }
  | { kind: 'block'; t: number };

export interface Player {
  id: number;
  name: string;
  team: Team;
  bot: boolean;
  pos: Vec3; // feet
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  crouching: boolean;
  sprinting: boolean;
  slideT: number; // > 0 while sliding
  slideCooldown: number;
  stamina: number;
  staminaIdle: number; // seconds since stamina was last used
  life: Life;
  tripT: number; // remaining trip + get-up time
  tripImmuneT: number; // > 0: can't be tripped (just got up)
  outOrder: number; // for first-out-first-in revives
  reviveT: number; // > 0: waiting to re-enter
  protectT: number; // spawn protection
  held: number; // ball id or -1
  heldT: number; // possession clock
  action: Action;
  catchCooldown: number;
  dashCooldown: number;
  /** Forced movement (dash, shove): velocity eases out over forceDur. */
  forceT: number;
  forceDur: number;
  forceVel: Vec3;
  prevPrimary: boolean;
  prevUse: boolean;
  prevJump: boolean;
  /** Dodgecoins earned this session (target hits). */
  coins: number;
  /** In-match score (§6.1). */
  score: number;
  // Stats (in-match score, §6.1).
  kos: number;
  catches: number;
  blocks: number;
}

export type BallState = 'rest' | 'held' | 'live' | 'dead';

export interface Ball {
  id: number;
  type: BallType;
  pos: Vec3;
  vel: Vec3;
  state: BallState;
  holder: number; // player id when held
  thrower: number; // last thrower, -1 if none
  throwerTeam: Team | -1;
  /** Players this live ball has already knocked out (for double KOs). */
  hits: number[];
  deflectedBy: number; // blocker id if deflected while live, else -1
  /** Thrower's movement at release ('slide', 'airborne'), for special KOs. */
  flags: string[];
  /** Near misses in progress: closest distance so far to each nearby opponent, and who has already dodged it. */
  near: { id: number; d: number }[];
  dodged: number[];
}

export type SimEvent =
  | { t: 'throw'; player: number; ball: number; charge: number }
  | { t: 'pickup'; player: number; ball: number }
  | { t: 'catch'; player: number; ball: number; thrower: number }
  | { t: 'block'; player: number; ball: number; broke: boolean }
  | { t: 'dash'; player: number }
  | { t: 'slowmo'; cause: 'big_oof' | 'target'; seconds: number }
  | { t: 'target_spawn' }
  | { t: 'target_hit'; player: number; coins: number }
  | { t: 'target_gone' }
  | { t: 'ko'; player: number; by: number; ball: number; cause: 'hit' | 'catch' | 'line' | 'heavy_catch'; point: Vec3; impulse: Vec3; seed: number; special: string[] }
  | { t: 'trip'; player: number; cause: 'wall' | 'collision' | 'heavy' | 'speedball'; impulse: Vec3; seed: number }
  | { t: 'getup'; player: number }
  | { t: 'revive'; player: number }
  | { t: 'bounce'; ball: number; speed: number; surface: 'floor' | 'wall' | 'player' }
  | { t: 'catch_whiff'; player: number }
  | { t: 'dodge'; player: number; ball: number }
  | { t: 'possession_drop'; player: number; ball: number }
  | { t: 'round_start'; round: number }
  | { t: 'round_end'; winner: Team; score: [number, number] }
  | { t: 'match_end'; winner: Team };

export type Phase = 'countdown' | 'play' | 'round_end' | 'match_end';

export interface GameState {
  tick: number;
  time: number;
  rng: Rng;
  arena: ArenaDef;
  players: Player[];
  balls: Ball[];
  phase: Phase;
  phaseT: number;
  round: number;
  score: [number, number];
  outCounter: number;
  firstKoThisRound: boolean;
  events: SimEvent[];
  /** Ball type mix used on round reset. */
  ballTypes: BallType[];
  /** Game seconds this tick (DT × timeScale). Slow motion scales everything in play. */
  dt: number;
  timeScale: number;
  /** Real seconds of slow motion remaining. */
  slowT: number;
  /** "Full slow motion" setup toggle: the whole match is slow; random triggers are off. */
  fullSlow: boolean;
  /** Real seconds of play until the next target appears. */
  targetTimer: number;
  target: { pos: Vec3; vz: number; t: number } | null;
}
