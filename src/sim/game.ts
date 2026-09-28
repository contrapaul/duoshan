/**
 * The DuoShan referee: `step(state, inputs)` advances one fixed tick.
 *
 * Pure and deterministic given the seed and inputs. It runs as the authority in
 * a Durable Object, locally for practice, and headless in tests. Rules follow
 * PROJECT_PLAN.md §4–§5 (Classic).
 */
import { CLASSIC_GYM, type ArenaDef, type Box } from './arena';
import {
  add, angleBetween, clamp, closestOnSegment, copy, dist, distXZ, dot, lenXZ, lerp, len, norm, reflect,
  rightDir, scale, sub, v3, viewDir, type Vec3,
} from './math';
import { nextFloat, nextInt } from './rng';
import { BALLS, DT, GRAVITY, HANDLING, PLAYER, RULES, SCORE, SLOWMO, type BallType } from './tuning';
import type { Ball, GameState, Player, PlayerInput, SimEvent, Team } from './types';

// ---------------------------------------------------------------------------
// Setup

export interface GameOptions {
  seed: number;
  /** Players per team. */
  teamSize: number;
  /** Which player ids are humans (the rest are bots). */
  humans?: number[];
  names?: string[];
  ballTypes?: BallType[];
  arena?: ArenaDef;
  /** "Full slow motion" setup toggle (§4.7). */
  fullSlow?: boolean;
}

const BOT_NAMES = [
  'Swift Otter', 'Rubber Duck', 'Captain Bounce', 'Noodle Arms', 'Dodge Lord', 'Sneaky Panda', 'Big Kev',
  'Slippy Socks', 'Lefty', 'The Wall', 'Turbo Nan', 'Gym Ghost', 'Mr. Whistle', 'Sir Catchalot', 'Tiny Tim', 'Boomer',
];

export function defaultBallTypes(players: number): BallType[] {
  const n = players <= 6 ? 4 : players <= 10 ? 6 : 8;
  const mix: BallType[] = ['standard', 'speed', 'standard', 'heavy', 'standard', 'speed', 'standard', 'standard'];
  return mix.slice(0, n);
}

export function createGame(opts: GameOptions): GameState {
  const arena = opts.arena ?? CLASSIC_GYM;
  const humans = new Set(opts.humans ?? []);
  const players: Player[] = [];
  for (let i = 0; i < opts.teamSize * 2; i++) {
    const team = (i % 2) as Team;
    players.push({
      id: i,
      name: opts.names?.[i] ?? (humans.has(i) ? 'You' : BOT_NAMES[i % BOT_NAMES.length]!),
      team,
      bot: !humans.has(i),
      pos: v3(), vel: v3(), yaw: 0, pitch: 0,
      onGround: true, crouching: false, sprinting: false,
      slideT: 0, slideCooldown: 0,
      stamina: PLAYER.staminaMax, staminaIdle: 0,
      life: 'active', tripT: 0, outOrder: 0, reviveT: 0, protectT: 0,
      held: -1, heldT: 0,
      action: { kind: 'none' }, catchCooldown: 0, dashCooldown: 0,
      forceT: 0, forceDur: 0, forceVel: v3(),
      prevPrimary: false, prevUse: false, prevJump: false,
      kos: 0, catches: 0, blocks: 0, coins: 0, score: 0,
    });
  }
  const ballTypes = opts.ballTypes ?? defaultBallTypes(players.length);
  const state: GameState = {
    tick: 0, time: 0, rng: { s: opts.seed | 0 }, arena, players, balls: [],
    phase: 'countdown', phaseT: RULES.countdown, round: 1, score: [0, 0],
    outCounter: 0, firstKoThisRound: false, events: [], ballTypes,
    dt: DT, timeScale: opts.fullSlow ? SLOWMO.scale : 1, slowT: 0, fullSlow: !!opts.fullSlow,
    targetTimer: SLOWMO.targetEvery, target: null,
  };
  resetRound(state);
  return state;
}

function spawnPoint(state: GameState, p: Player): Vec3 {
  const teamPlayers = state.players.filter((q) => q.team === p.team);
  const idx = teamPlayers.indexOf(p);
  const n = teamPlayers.length;
  const hw = state.arena.court.halfWidth - 0.8;
  const z = n === 1 ? 0 : -hw + (2 * hw * idx) / (n - 1);
  const x = (state.arena.court.halfLength - 1.2) * (p.team === 0 ? -1 : 1);
  return v3(x, 0, z);
}

export function resetRound(state: GameState): void {
  for (const p of state.players) {
    p.pos = spawnPoint(state, p);
    p.vel = v3();
    p.yaw = p.team === 0 ? 0 : Math.PI;
    p.pitch = 0;
    p.life = 'active';
    p.tripT = 0; p.reviveT = 0; p.protectT = 0; p.outOrder = 0;
    p.held = -1; p.heldT = 0; p.action = { kind: 'none' };
    p.slideT = 0; p.slideCooldown = 0; p.stamina = PLAYER.staminaMax;
    p.dashCooldown = 0; p.forceT = 0;
    p.crouching = false; p.sprinting = false; p.onGround = true;
  }
  const n = state.ballTypes.length;
  const hw = state.arena.court.halfWidth - 0.5;
  state.balls = state.ballTypes.map((type, i) => ({
    id: i, type,
    pos: v3(0, BALLS[type].radius, n === 1 ? 0 : -hw + (2 * hw * i) / (n - 1)),
    vel: v3(), state: 'rest', holder: -1, thrower: -1, throwerTeam: -1, hits: [], deflectedBy: -1, flags: [],
  }));
  state.firstKoThisRound = false;
  state.outCounter = 0;
}

// ---------------------------------------------------------------------------
// Geometry helpers (also used by bots and the renderer)

export const playerHeight = (p: Player): number =>
  p.life === 'tripped' ? 0.5 : p.crouching || p.slideT > 0 ? PLAYER.crouchHeight : PLAYER.height;

export function eyePos(p: Player): Vec3 {
  const h = p.crouching || p.slideT > 0 ? PLAYER.eyeCrouch : PLAYER.eyeStand;
  return v3(p.pos.x, p.pos.y + h, p.pos.z);
}

export function handPos(p: Player): Vec3 {
  const f = viewDir(p.yaw, p.pitch);
  const r = rightDir(p.yaw);
  const e = eyePos(p);
  return v3(e.x + f.x * 0.45 + r.x * 0.3, e.y + f.y * 0.45 - 0.25, e.z + f.z * 0.45 + r.z * 0.3);
}

/** Where the held ball sits in block stance: a solid shield in front of the chest (§4.3.3). */
export function shieldPos(p: Player): Vec3 {
  const f = viewDir(p.yaw, p.pitch);
  const e = eyePos(p);
  const k = HANDLING.shieldForward;
  return v3(e.x + f.x * k, e.y - 0.3 + f.y * k, e.z + f.z * k);
}

/** True once the shield is raised (block stance held past the raise time). */
export function shieldUp(state: GameState, p: Player): boolean {
  if (p.action.kind !== 'block' || p.held < 0 || p.life !== 'active') return false;
  return p.action.t >= BALLS[state.balls[p.held]!.type].blockWindup;
}

/** Opponents are on the other half of the court; the centerline sign for a team. */
export const teamSign = (team: Team): number => (team === 0 ? -1 : 1);

export function aliveCount(state: GameState, team: Team): number {
  return state.players.filter((p) => p.team === team && (p.life !== 'out' || p.reviveT > 0)).length;
}

// ---------------------------------------------------------------------------
// Step

export function step(state: GameState, inputs: readonly PlayerInput[]): SimEvent[] {
  state.events = [];
  state.tick++;
  updateTimeScale(state);
  state.time += state.dt;

  if (state.phase === 'round_end' || state.phase === 'match_end') {
    state.phaseT -= DT;
    if (state.phaseT <= 0) {
      if (state.phase === 'match_end') {
        state.score = [0, 0];
        for (const p of state.players) { p.score = 0; p.kos = 0; p.catches = 0; p.blocks = 0; }
      }
      state.round = state.phase === 'match_end' ? 1 : state.round + 1;
      resetRound(state);
      state.phase = 'countdown';
      state.phaseT = RULES.countdown;
    }
  } else if (state.phase === 'countdown') {
    state.phaseT -= DT;
    if (state.phaseT <= 0) {
      state.phase = 'play';
      state.events.push({ t: 'round_start', round: state.round });
    }
  }

  const playing = state.phase === 'play' || state.phase === 'round_end';
  for (const p of state.players) {
    const input = inputs[p.id];
    if (input) applyLook(p, input);
    if (p.life === 'out') {
      updateRevive(state, p);
      continue;
    }
    if (playing) movePlayer(state, p, input);
    if (state.phase === 'play' && p.life === 'active' && input) updateActions(state, p, input);
    if (input) {
      p.prevPrimary = input.primary;
      p.prevUse = input.use;
      p.prevJump = input.jump;
    }
  }
  if (playing) {
    collidePlayers(state);
    checkCenterline(state);
  }
  updateBalls(state);
  if (state.phase === 'play') {
    updateTarget(state);
    checkRoundEnd(state);
  }
  return state.events;
}

/** Slow motion eases the whole match's time scale; the tick rate never changes (§4.7). */
function updateTimeScale(state: GameState): void {
  state.slowT = Math.max(0, state.slowT - DT);
  const want = state.fullSlow || state.slowT > 0 ? SLOWMO.scale : 1;
  const stepMax = SLOWMO.easeRate * DT;
  state.timeScale += clamp(want - state.timeScale, -stepMax, stepMax);
  state.dt = DT * state.timeScale;
}

function startSlowmo(state: GameState, cause: 'big_oof' | 'target', seconds: number): void {
  if (state.fullSlow) return;
  state.slowT = Math.max(state.slowT, seconds);
  state.events.push({ t: 'slowmo', cause, seconds });
}

/** A target appears every 90 s of play above the centerline; hitting it starts slow motion. */
function updateTarget(state: GameState): void {
  if (state.fullSlow) return;
  const tg = state.target;
  if (!tg) {
    state.targetTimer -= DT;
    if (state.targetTimer <= 0) {
      state.targetTimer = SLOWMO.targetEvery;
      state.target = { pos: v3(0, 4 + nextFloat(state.rng) * 2, (nextFloat(state.rng) - 0.5) * 6), vz: 1.2, t: SLOWMO.targetUp };
      state.events.push({ t: 'target_spawn' });
    }
    return;
  }
  tg.t -= DT;
  tg.pos.z += tg.vz * state.dt;
  if (Math.abs(tg.pos.z) > 3.5) tg.vz = -Math.sign(tg.pos.z) * Math.abs(tg.vz);
  if (tg.t <= 0) {
    state.target = null;
    state.events.push({ t: 'target_gone' });
  }
}

function applyLook(p: Player, input: PlayerInput): void {
  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -1.45, 1.45);
}

// ---------------------------------------------------------------------------
// Movement

function movePlayer(state: GameState, p: Player, input: PlayerInput | undefined): void {
  const DT = state.dt;
  p.slideCooldown = Math.max(0, p.slideCooldown - DT);
  p.dashCooldown = Math.max(0, p.dashCooldown - DT);
  p.protectT = Math.max(0, p.protectT - DT);
  const horizSpeed = lenXZ(p.vel);
  const blocking = p.action.kind === 'block';

  if (p.life === 'tripped') {
    p.tripT -= DT;
    const decay = Math.max(0, 1 - 4 * DT);
    p.vel.x *= decay;
    p.vel.z *= decay;
    p.sprinting = false;
    p.crouching = false;
    if (p.tripT <= 0) {
      p.life = 'active';
      p.vel = v3();
      state.events.push({ t: 'getup', player: p.id });
    }
  } else if (p.forceT > 0) {
    // Dash or shove: forced velocity that eases out.
    p.forceT -= DT;
    const k = 0.5 + 0.5 * Math.max(0, p.forceT) / p.forceDur;
    p.vel.x = p.forceVel.x * k;
    p.vel.z = p.forceVel.z * k;
  } else if (input && state.phase === 'play') {
    const wantCrouch = input.crouch && !blocking;
    const moving = Math.abs(input.moveX) + Math.abs(input.moveZ) > 0.1;
    // Slide: crouch pressed while sprinting fast on the ground.
    if (wantCrouch && !p.crouching && p.sprinting && p.onGround && p.slideT <= 0 && p.slideCooldown <= 0 &&
        horizSpeed >= PLAYER.slideMinSpeedFrac * PLAYER.sprintSpeed) {
      p.slideT = PLAYER.slideTime;
      const d = norm(v3(p.vel.x, 0, p.vel.z));
      p.vel.x = d.x * PLAYER.slideSpeed;
      p.vel.z = d.z * PLAYER.slideSpeed;
      p.stamina = Math.max(0, p.stamina - PLAYER.slideStaminaCost);
      p.staminaIdle = 0;
    }
    p.crouching = wantCrouch;

    if (p.slideT > 0) {
      p.slideT -= DT;
      const d = norm(v3(p.vel.x, 0, p.vel.z));
      const speed = lerp(PLAYER.crouchSpeed, PLAYER.slideSpeed, Math.max(0, p.slideT) / PLAYER.slideTime);
      p.vel.x = d.x * speed;
      p.vel.z = d.z * speed;
      if (p.slideT <= 0) p.slideCooldown = PLAYER.slideCooldown;
      p.sprinting = false;
    } else {
      p.sprinting = input.sprint && input.moveZ > 0.1 && p.stamina > 0 && !wantCrouch && !blocking;
      const max = blocking ? PLAYER.walkSpeed : wantCrouch ? PLAYER.crouchSpeed : p.sprinting ? PLAYER.sprintSpeed : PLAYER.runSpeed;
      const f = viewDir(p.yaw, 0);
      const r = rightDir(p.yaw);
      let wx = f.x * input.moveZ + r.x * input.moveX;
      let wz = f.z * input.moveZ + r.z * input.moveX;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      const accel = PLAYER.groundAccel * (p.onGround ? 1 : PLAYER.airControl) * DT;
      const dx = wx * max - p.vel.x;
      const dz = wz * max - p.vel.z;
      const dl = Math.hypot(dx, dz);
      const k = dl > accel ? accel / dl : 1;
      p.vel.x += dx * k;
      p.vel.z += dz * k;
      if (p.sprinting && moving) { p.stamina = Math.max(0, p.stamina - DT); p.staminaIdle = 0; }
    }
    if (!(p.sprinting && moving) && p.slideT <= 0) {
      p.staminaIdle += DT;
      if (p.staminaIdle >= PLAYER.staminaRegenDelay) {
        p.stamina = Math.min(PLAYER.staminaMax, p.stamina + (PLAYER.staminaMax / PLAYER.staminaRegenTime) * DT);
      }
    }
    if (input.jump && !p.prevJump && p.onGround && p.slideT <= 0) {
      // A/D + Space is a sidestep dash; otherwise (or if it isn't available) a normal jump (§4.2).
      const side = Math.abs(input.moveX) > 0.3 ? Math.sign(input.moveX) : 0;
      const canDash = side !== 0 && !blocking && !wantCrouch && p.dashCooldown <= 0 && p.stamina >= PLAYER.dashStaminaCost;
      if (canDash) {
        const r = rightDir(p.yaw);
        p.forceVel = v3(r.x * side * PLAYER.dashSpeed, 0, r.z * side * PLAYER.dashSpeed);
        p.forceT = p.forceDur = PLAYER.dashTime;
        p.dashCooldown = PLAYER.dashCooldown;
        p.stamina -= PLAYER.dashStaminaCost;
        p.staminaIdle = 0;
        state.events.push({ t: 'dash', player: p.id });
      } else {
        p.vel.y = PLAYER.jumpSpeed;
        p.onGround = false;
      }
    }
  } else {
    // Countdown / no input: stand still.
    p.vel.x = 0;
    p.vel.z = 0;
  }

  if (p.forceT > 0 && !(input && state.phase === 'play')) p.forceT = 0;
  p.vel.y -= GRAVITY * DT;
  const prevY = p.pos.y;
  p.pos = add(p.pos, scale(p.vel, DT));
  p.onGround = false;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    if (p.vel.y < 0) p.vel.y = 0;
    p.onGround = true;
  }
  collidePlayerWorld(state, p, prevY);
}

function collidePlayerWorld(state: GameState, p: Player, prevY: number): void {
  const r = PLAYER.radius;
  const h = playerHeight(p);
  for (const b of state.arena.boxes) {
    if (p.pos.y >= b.max.y || p.pos.y + h <= b.min.y) continue;
    const cx = clamp(p.pos.x, b.min.x, b.max.x);
    const cz = clamp(p.pos.z, b.min.z, b.max.z);
    const dx = p.pos.x - cx;
    const dz = p.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    // Step up onto low boxes, or land on them from above.
    const stepUp = b.max.y - p.pos.y;
    if ((stepUp <= 0.35 || prevY >= b.max.y - 0.05) && p.vel.y <= 0.5) {
      p.pos.y = b.max.y;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
      continue;
    }
    let nx: number;
    let nz: number;
    let pen: number;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      nx = dx / d; nz = dz / d; pen = r - d;
    } else {
      // Centre inside the box footprint: push out along the shallowest axis.
      const opts = [
        { nx: -1, nz: 0, pen: p.pos.x - b.min.x + r }, { nx: 1, nz: 0, pen: b.max.x - p.pos.x + r },
        { nx: 0, nz: -1, pen: p.pos.z - b.min.z + r }, { nx: 0, nz: 1, pen: b.max.z - p.pos.z + r },
      ].sort((a, c) => a.pen - c.pen)[0]!;
      nx = opts.nx; nz = opts.nz; pen = opts.pen;
    }
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const into = -(p.vel.x * nx + p.vel.z * nz);
    p.pos.x += nx * pen;
    p.pos.z += nz * pen;
    if (into > 0) {
      p.vel.x += nx * into;
      p.vel.z += nz * into;
    }
    // Sprinting head-on into a wall trips you (§4.2).
    if (p.life === 'active' && speed >= PLAYER.tripSpeedThreshold * 0.95 &&
        into >= speed * Math.cos((PLAYER.wallTripAngleDeg * Math.PI) / 180)) {
      trip(state, p, 'wall', v3(nx * 2, 1.5, nz * 2));
    }
  }
}

function collidePlayers(state: GameState): void {
  const ps = state.players.filter((p) => p.life !== 'out');
  const r2 = PLAYER.radius * 2;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]!;
      const b = ps[j]!;
      if (a.pos.y > b.pos.y + playerHeight(b) || b.pos.y > a.pos.y + playerHeight(a)) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= r2 || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      const pen = (r2 - d) / 2;
      a.pos.x -= nx * pen; a.pos.z -= nz * pen;
      b.pos.x += nx * pen; b.pos.z += nz * pen;
      const closing = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
      if (closing >= PLAYER.tripSpeedThreshold) {
        for (const [p, s] of [[a, -1], [b, 1]] as const) {
          if (p.life !== 'active') continue;
          const stability = p.slideT > 0 ? 0.9 : !p.onGround ? 0.3 : p.sprinting ? 0.35 : p.crouching ? 0.9 : 0.7;
          if (nextFloat(state.rng) > stability) trip(state, p, 'collision', v3(nx * s * 3, 1, nz * s * 3));
        }
      }
      // Exchange the closing velocity.
      if (closing > 0) {
        a.vel.x -= nx * closing * 0.5; a.vel.z -= nz * closing * 0.5;
        b.vel.x += nx * closing * 0.5; b.vel.z += nz * closing * 0.5;
      }
    }
  }
}

function checkCenterline(state: GameState): void {
  for (const p of state.players) {
    if (p.life === 'out') continue;
    if (p.pos.x * teamSign(p.team) < 0) knockOut(state, p, -1, -1, 'line', copy(p.pos), v3());
  }
}

// ---------------------------------------------------------------------------
// Ball handling: pickup, throw, catch, block (§4.3)

function updateActions(state: GameState, p: Player, input: PlayerInput): void {
  const DT = state.dt;
  p.catchCooldown = Math.max(0, p.catchCooldown - DT);
  const pressed = input.primary && !p.prevPrimary;
  const released = !input.primary && p.prevPrimary;
  // E picks up or catches, like left click with empty hands (§4.3).
  const usePressed = input.use && !p.prevUse;

  // Block stance lasts exactly as long as RMB is held with a ball (§4.3.3).
  if (input.secondary && p.held >= 0 && (p.action.kind === 'none' || p.action.kind === 'aim')) {
    p.action = { kind: 'block', t: 0 };
  } else if (!input.secondary && p.action.kind === 'block') {
    p.action = { kind: 'none' };
  }

  if ((pressed || usePressed) && p.action.kind === 'none' && p.held < 0) {
    const ball = findPickup(state, p);
    if (ball) p.action = { kind: 'pickup', t: 0, ballId: ball.id };
    else if (p.catchCooldown <= 0) p.action = { kind: 'catch', t: 0 };
  } else if (pressed && p.action.kind === 'none' && p.held >= 0) {
    p.action = { kind: 'aim', t: 0, released: false };
  }
  if (released && p.action.kind === 'aim') p.action.released = true;

  const a = p.action;
  switch (a.kind) {
    case 'pickup': {
      a.t += DT;
      if (a.t >= HANDLING.pickupTime) {
        const ball = state.balls[a.ballId];
        if (ball && (ball.state === 'rest' || ball.state === 'dead') && distXZ(ball.pos, p.pos) <= HANDLING.pickupRange + 0.5) {
          ball.state = 'held';
          ball.holder = p.id;
          ball.vel = v3();
          p.held = ball.id;
          p.heldT = 0;
          p.protectT = 0;
          state.events.push({ t: 'pickup', player: p.id, ball: ball.id });
        }
        p.action = { kind: 'none' };
      }
      break;
    }
    case 'aim': {
      a.t += DT;
      const ball = state.balls[p.held];
      if (!ball) { p.action = { kind: 'none' }; break; }
      const def = BALLS[ball.type];
      if (a.released && a.t >= def.windup) {
        const charge = clamp((a.t - def.windup) / (HANDLING.maxCharge - def.windup), 0, 1);
        throwBall(state, p, ball, charge);
        p.action = { kind: 'none' };
      }
      break;
    }
    case 'catch': {
      a.t += DT;
      if (a.t > HANDLING.catchWindow) {
        p.catchCooldown = HANDLING.catchCooldown;
        p.action = { kind: 'none' };
        state.events.push({ t: 'catch_whiff', player: p.id });
      }
      break;
    }
    case 'block':
      a.t += DT;
      break;
    case 'none':
      break;
  }

  // Possession clock (§5.1 anti-stall).
  if (p.held >= 0) {
    p.heldT += DT;
    if (p.heldT >= HANDLING.possessionMax) {
      const ball = state.balls[p.held]!;
      dropBall(p, ball);
      state.events.push({ t: 'possession_drop', player: p.id, ball: ball.id });
    }
  }
}

export function findPickup(state: GameState, p: Player): Ball | undefined {
  let best: Ball | undefined;
  let bestD = Infinity;
  const f = viewDir(p.yaw, 0);
  for (const b of state.balls) {
    if (b.state !== 'rest' && b.state !== 'dead') continue;
    if (b.pos.y > p.pos.y + 2.2) continue;
    const d = distXZ(b.pos, p.pos);
    if (d > HANDLING.pickupRange) continue;
    const to = v3(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z);
    if (d > 0.5 && angleBetween(f, to) > (HANDLING.pickupAngleDeg * Math.PI) / 180) continue;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function throwBall(state: GameState, p: Player, ball: Ball, charge: number): void {
  const def = BALLS[ball.type];
  const spread = (lerp(def.spreadQuickDeg, def.spreadAimedDeg, charge) * Math.PI) / 180;
  const f = viewDir(p.yaw, p.pitch);
  // Random direction inside the spread cone.
  const up = Math.abs(f.y) < 0.99 ? v3(0, 1, 0) : v3(1, 0, 0);
  const u = norm(cross(f, up));
  const w = cross(u, f);
  const ang = spread * Math.sqrt(nextFloat(state.rng));
  const phi = nextFloat(state.rng) * Math.PI * 2;
  const dir = norm(add(scale(f, Math.cos(ang)), add(scale(u, Math.sin(ang) * Math.cos(phi)), scale(w, Math.sin(ang) * Math.sin(phi)))));
  const speed = lerp(def.speedQuick, def.speedAimed, charge);
  ball.vel = add(scale(dir, speed), v3(p.vel.x * HANDLING.inheritVelocity, 0, p.vel.z * HANDLING.inheritVelocity));
  const e = eyePos(p);
  ball.pos = v3(e.x + f.x * 0.4, e.y + f.y * 0.4 - 0.1, e.z + f.z * 0.4);
  ball.state = 'live';
  ball.holder = -1;
  ball.thrower = p.id;
  ball.throwerTeam = p.team;
  ball.hits = [];
  ball.deflectedBy = -1;
  ball.flags = [...(p.slideT > 0 ? ['slide'] : []), ...(!p.onGround ? ['airborne'] : [])];
  p.held = -1;
  p.heldT = 0;
  p.protectT = 0;
  state.events.push({ t: 'throw', player: p.id, ball: ball.id, charge });
}

const cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

function dropBall(p: Player, ball: Ball): void {
  ball.state = 'dead';
  ball.holder = -1;
  ball.pos = handPos(p);
  ball.vel = v3(p.vel.x, 0, p.vel.z);
  p.held = -1;
  p.heldT = 0;
  if (p.action.kind === 'aim' || p.action.kind === 'block') p.action = { kind: 'none' };
}

function trip(state: GameState, p: Player, cause: 'wall' | 'collision' | 'heavy' | 'speedball', impulse: Vec3): void {
  if (p.life !== 'active' || p.protectT > 0) return;
  p.life = 'tripped';
  p.tripT = PLAYER.tripTime + PLAYER.getUpTime;
  p.slideT = 0;
  p.action = { kind: 'none' };
  if (p.held >= 0) dropBall(p, state.balls[p.held]!);
  state.events.push({ t: 'trip', player: p.id, cause, impulse, seed: nextInt(state.rng, 1 << 30) });
}

function knockOut(
  state: GameState, p: Player, byId: number, ballId: number,
  cause: Extract<SimEvent, { t: 'ko' }>['cause'], point: Vec3, impulse: Vec3, extra: string[] = [],
): void {
  if (p.life === 'out') return;
  if (p.held >= 0) dropBall(p, state.balls[p.held]!);
  p.life = 'out';
  p.outOrder = ++state.outCounter;
  p.reviveT = 0;
  p.action = { kind: 'none' };
  p.slideT = 0;
  const special: string[] = [];
  const by = byId >= 0 ? state.players[byId] : undefined;
  if (by && by.team !== p.team) {
    by.kos++;
    const ball = state.balls[ballId];
    if (ball && cause === 'hit') {
      special.push(...ball.flags);
      // hits already includes this player, so a second entry means one throw took out two.
      if (ball.hits.length >= 2) special.push('double');
      if (ball.deflectedBy >= 0) special.push('bounce_out');
    }
    if (!state.firstKoThisRound) special.push('first');
    // A catch is scored as a catch (below), not as a knockout.
    if (cause !== 'catch') by.score += SCORE.ko + special.reduce((sum, s) => sum + (SCORE.special[s] ?? 0), 0);
  }
  special.push(...extra);
  state.firstKoThisRound = true;
  state.events.push({ t: 'ko', player: p.id, by: byId, ball: ballId, cause, point, impulse, seed: nextInt(state.rng, 1 << 30), special });
}

function updateRevive(state: GameState, p: Player): void {
  if (p.reviveT <= 0) return;
  p.reviveT -= state.dt;
  if (p.reviveT <= 0) {
    p.life = 'active';
    p.pos = spawnPoint(state, p);
    p.vel = v3();
    p.protectT = RULES.spawnProtection;
    p.yaw = p.team === 0 ? 0 : Math.PI;
    state.events.push({ t: 'revive', player: p.id });
  }
}

function reviveFirstOut(state: GameState, team: Team): void {
  const waiting = state.players
    .filter((q) => q.team === team && q.life === 'out' && q.reviveT <= 0)
    .sort((a, b) => a.outOrder - b.outOrder);
  const first = waiting[0];
  if (first) first.reviveT = RULES.reviveDelay;
}

function checkRoundEnd(state: GameState): void {
  for (const team of [0, 1] as const) {
    if (aliveCount(state, team) === 0) {
      const winner = (1 - team) as Team;
      state.score[winner]++;
      const matchWon = state.score[winner] >= RULES.roundsToWin;
      for (const p of state.players) if (p.team === winner) p.score += SCORE.roundWin + (matchWon ? SCORE.matchWin : 0);
      state.events.push({ t: 'round_end', winner, score: [state.score[0], state.score[1]] });
      if (state.score[winner] >= RULES.roundsToWin) {
        state.phase = 'match_end';
        state.events.push({ t: 'match_end', winner });
      } else {
        state.phase = 'round_end';
      }
      state.phaseT = RULES.roundEndPause;
      if (state.target) { state.target = null; state.events.push({ t: 'target_gone' }); }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Ball physics and contacts (§4.4 hit rules)

function updateBalls(state: GameState): void {
  for (const ball of state.balls) {
    if (ball.state === 'held') {
      const holder = state.players[ball.holder];
      if (!holder || holder.life === 'out') { ball.state = 'dead'; continue; }
      ball.pos = holder.action.kind === 'block' ? shieldPos(holder) : handPos(holder);
      ball.vel = copy(holder.vel);
      continue;
    }
    if (ball.state === 'rest') continue;
    const def = BALLS[ball.type];
    const speed = len(ball.vel);
    const n = clamp(Math.ceil((speed * state.dt) / def.radius), 1, 12);
    const sdt = state.dt / n;
    for (let s = 0; s < n; s++) if (substepBall(state, ball, sdt)) break;
  }
}

/** Returns true when the ball stops simulating this tick (caught or came to rest). */
function substepBall(state: GameState, ball: Ball, sdt: number): boolean {
  const def = BALLS[ball.type];
  const r = def.radius;
  ball.vel.y -= GRAVITY * def.gravityScale * sdt;
  ball.pos = add(ball.pos, scale(ball.vel, sdt));

  // Catch volumes and shields are in front of the body, so they are checked first.
  if (ball.state === 'live' && checkCatch(state, ball)) return true;
  collideBallShields(state, ball);
  if (ball.state === 'live') checkTarget(state, ball);

  // Floor.
  if (ball.pos.y < r) {
    ball.pos.y = r;
    if (ball.vel.y < -0.8) {
      const impact = -ball.vel.y;
      ball.vel.y = impact * def.restitution;
      ball.vel.x *= 0.9;
      ball.vel.z *= 0.9;
      envTouch(state, ball, impact, 'floor');
    } else {
      ball.vel.y = 0;
      if (ball.state === 'live') envTouch(state, ball, 0, 'floor');
      const sp = Math.hypot(ball.vel.x, ball.vel.z);
      const ns = Math.max(0, sp - def.rollingDrag * sdt);
      const k = sp > 1e-6 ? ns / sp : 0;
      ball.vel.x *= k;
      ball.vel.z *= k;
      if (ns < 0.05) {
        ball.vel = v3();
        ball.state = 'rest';
        ball.thrower = -1;
        ball.throwerTeam = -1;
        return true;
      }
    }
  }
  // Ceiling.
  if (ball.pos.y > state.arena.bounds.height - r) {
    ball.pos.y = state.arena.bounds.height - r;
    ball.vel.y = -Math.abs(ball.vel.y) * def.restitution;
    envTouch(state, ball, Math.abs(ball.vel.y), 'wall');
  }
  for (const b of state.arena.boxes) collideBallBox(state, ball, b);
  collideBallPlayers(state, ball);
  return false;
}

function envTouch(state: GameState, ball: Ball, speed: number, surface: 'floor' | 'wall'): void {
  if (ball.state === 'live') ball.state = 'dead';
  if (speed > 1) state.events.push({ t: 'bounce', ball: ball.id, speed, surface });
}

function collideBallBox(state: GameState, ball: Ball, b: Box): void {
  const def = BALLS[ball.type];
  const r = def.radius;
  const c = v3(clamp(ball.pos.x, b.min.x, b.max.x), clamp(ball.pos.y, b.min.y, b.max.y), clamp(ball.pos.z, b.min.z, b.max.z));
  const d = sub(ball.pos, c);
  const dl = len(d);
  if (dl >= r) return;
  const n = dl > 1e-9 ? scale(d, 1 / dl) : v3(0, 1, 0);
  ball.pos = add(c, scale(n, r));
  const vn = dot(ball.vel, n);
  if (vn < 0) {
    ball.vel = sub(ball.vel, scale(n, (1 + def.restitution) * vn));
    ball.vel = scale(ball.vel, 0.95);
    envTouch(state, ball, -vn, n.y > 0.7 ? 'floor' : 'wall');
  }
}

function capsuleContact(p: Player, pos: Vec3): { point: Vec3; d: number } {
  const h = playerHeight(p);
  const r = PLAYER.radius;
  const a = v3(p.pos.x, p.pos.y + r, p.pos.z);
  const b = v3(p.pos.x, p.pos.y + Math.max(r, h - r), p.pos.z);
  const point = closestOnSegment(pos, a, b);
  return { point, d: dist(pos, point) };
}

function collideBallPlayers(state: GameState, ball: Ball): void {
  const def = BALLS[ball.type];
  for (const p of state.players) {
    if (p.life === 'out') continue;
    const live = ball.state === 'live';
    // Live balls pass harmlessly through the thrower's team (friendly fire off).
    if (live && p.team === ball.throwerTeam) continue;
    if (live && ball.hits.includes(p.id)) continue;
    const { point, d } = capsuleContact(p, ball.pos);
    if (d >= def.radius + PLAYER.radius) continue;
    const n = norm(sub(ball.pos, point));
    const relVel = sub(ball.vel, p.vel);
    if (live && p.protectT <= 0) {
      ball.hits.push(p.id);
      const impulse = scale(ball.vel, def.koImpulse * 0.15);
      const bigOof = ball.pos.y > p.pos.y + playerHeight(p) - SLOWMO.headZone;
      knockOut(state, p, ball.thrower, ball.id, 'hit', point, impulse, bigOof ? ['big_oof'] : []);
      if (bigOof && nextFloat(state.rng) < SLOWMO.bigOofChance) startSlowmo(state, 'big_oof', SLOWMO.bigOofSeconds);
      // The ball stays live after a knockout and can take out a second player (§4.4 rule 3).
      ball.vel = scale(reflect(ball.vel, n), 0.35);
      ball.pos = add(point, scale(n, def.radius + PLAYER.radius + 0.01));
      continue;
    }
    // Harmless contact: bounce off the body.
    ball.pos = add(point, scale(n, def.radius + PLAYER.radius + 0.01));
    const vn = dot(relVel, n);
    if (vn < 0) {
      const impactSpeed = len(ball.vel);
      ball.vel = add(p.vel, scale(sub(relVel, scale(n, 1.3 * vn)), 0.6));
      if (live) ball.state = 'dead';
      state.events.push({ t: 'bounce', ball: ball.id, speed: impactSpeed, surface: 'player' });
      // A still-fast speed ball trips, knocks down or pushes (§4.5).
      if (ball.type === 'speed' && ball.state === 'dead' && impactSpeed >= def.fastDeadMinSpeed && p.life === 'active') {
        const heightOnBody = ball.pos.y - p.pos.y;
        const h = playerHeight(p);
        const dir = norm(v3(-n.x, 0, -n.z));
        if (heightOnBody > h - 0.35 || (heightOnBody < 0.8 && (p.sprinting || !p.onGround))) {
          trip(state, p, 'speedball', v3(dir.x * 3, 2, dir.z * 3));
        } else {
          p.vel.x += dir.x * 3;
          p.vel.z += dir.z * 3;
        }
      }
    }
  }
  // Heavy balls at rest trip players who run, sprint or slide over them.
  if (ball.type === 'heavy' && (ball.state === 'rest' || (ball.state === 'dead' && len(ball.vel) < 2))) {
    for (const p of state.players) {
      if (p.life !== 'active' || !p.onGround) continue;
      if (distXZ(p.pos, ball.pos) < PLAYER.radius * 0.8 + def.radius && lenXZ(p.vel) > PLAYER.runSpeed * 0.8) {
        const d = norm(v3(p.vel.x, 0, p.vel.z));
        trip(state, p, 'heavy', v3(d.x * 4, 1, d.z * 4));
      }
    }
  }
}

/** Returns true if the ball was caught (and is now held). */
function checkCatch(state: GameState, ball: Ball): boolean {
  const def = BALLS[ball.type];
  for (const p of state.players) {
    if (p.life !== 'active' || p.team === ball.throwerTeam || ball.hits.includes(p.id)) continue;
    const a = p.action;
    if (a.kind !== 'catch' || a.t > HANDLING.catchWindow) continue;
    const f = viewDir(p.yaw, p.pitch);
    const e = eyePos(p);
    const toBall = sub(ball.pos, e);
    const center = v3(e.x + f.x * 0.5, e.y - 0.3 + f.y * 0.5, e.z + f.z * 0.5);
    const inReach = dist(ball.pos, center) <= HANDLING.catchRadius * def.catchRadiusScale;
    const inView = angleBetween(f, toBall) <= (def.catchConeDeg * Math.PI) / 180;
    if (!inReach || !inView) continue;
    if (!def.catchable) {
      ball.hits.push(p.id);
      knockOut(state, p, ball.thrower, ball.id, 'heavy_catch', copy(ball.pos), scale(ball.vel, def.koImpulse * 0.15));
      return false;
    }
    const thrower = state.players[ball.thrower];
    ball.state = 'held';
    ball.holder = p.id;
    ball.vel = v3();
    p.held = ball.id;
    p.heldT = 0;
    p.catches++;
    p.score += SCORE.catch;
    p.action = { kind: 'none' };
    if (def.type === 'speed') shove(p, norm(v3(-toBall.x, 0, -toBall.z)), 2, 0.2); // jarring
    state.events.push({ t: 'catch', player: p.id, ball: ball.id, thrower: ball.thrower });
    if (thrower && thrower.life !== 'out') knockOut(state, thrower, p.id, ball.id, 'catch', copy(thrower.pos), v3());
    reviveFirstOut(state, p.team);
    return true;
  }
  return false;
}

function shove(p: Player, dir: Vec3, speed: number, dur: number): void {
  p.forceVel = v3(dir.x * speed, 0, dir.z * speed);
  p.forceT = p.forceDur = dur;
}

/**
 * Physics blocking (§4.3.3): a raised shield is a solid sphere. Any ball that
 * touches it bounces off. A live ball stays live (bounce-outs) and can no longer
 * knock out the blocker. Heavy balls bounce off weightily, shove the blocker
 * back and knock the shield ball out of their hands.
 */
function collideBallShields(state: GameState, ball: Ball): void {
  const def = BALLS[ball.type];
  for (const p of state.players) {
    if (!shieldUp(state, p)) continue;
    if (ball.state === 'live' && p.team === ball.throwerTeam) continue; // passes through teammates
    const shield = state.balls[p.held]!;
    const sr = BALLS[shield.type].radius;
    const c = shieldPos(p);
    const d = sub(ball.pos, c);
    const dl = len(d);
    if (dl >= def.radius + sr) continue;
    const n = dl > 1e-9 ? scale(d, 1 / dl) : scale(viewDir(p.yaw, p.pitch), 1);
    ball.pos = add(c, scale(n, def.radius + sr + 0.01));
    const rel = sub(ball.vel, p.vel);
    const vn = dot(rel, n);
    if (vn >= 0) continue;
    const impact = len(ball.vel);
    // A heavy ball out-masses the shield: it changes direction far less.
    const give = def.breaksShield ? 0.55 : 1;
    const e = (def.restitution + BALLS[shield.type].restitution) / 2;
    ball.vel = sub(ball.vel, scale(n, (1 + e) * vn * give));
    if (ball.state === 'live') {
      ball.deflectedBy = p.id;
      if (!ball.hits.includes(p.id)) ball.hits.push(p.id);
      p.blocks++;
      p.score += SCORE.block;
      state.events.push({ t: 'block', player: p.id, ball: ball.id, broke: def.breaksShield });
    } else {
      state.events.push({ t: 'bounce', ball: ball.id, speed: impact, surface: 'player' });
    }
    const back = norm(v3(-n.x, 0, -n.z));
    if (def.breaksShield && impact > 4) {
      dropBall(p, shield);
      shove(p, back, 5, 0.4);
    } else if (def.type === 'speed' && impact > 12) {
      shove(p, back, 2, 0.2); // jarring
    }
  }
}

/** A live ball touching the slow-motion target (§4.7). */
function checkTarget(state: GameState, ball: Ball): void {
  const tg = state.target;
  if (!tg || dist(ball.pos, tg.pos) > SLOWMO.targetRadius + BALLS[ball.type].radius) return;
  state.target = null;
  const thrower = state.players[ball.thrower];
  if (thrower) thrower.coins += SLOWMO.targetCoins;
  state.events.push({ t: 'target_hit', player: ball.thrower, coins: SLOWMO.targetCoins });
  ball.state = 'dead';
  ball.vel = scale(ball.vel, 0.2);
  startSlowmo(state, 'target', SLOWMO.targetSeconds);
}
