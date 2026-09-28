/**
 * Bot AI (PROJECT_PLAN.md §8.2). A bot only produces a PlayerInput each tick, the
 * same as a human, so the referee applies every rule to it automatically.
 *
 * Human-like limits: reaction delay, aim error, and a per-ball decision to catch,
 * block or dodge made once when the bot "notices" the throw.
 */
import { centerlineX } from '../sim/arena';
import { eyePos, findPickup, sideDepth, teamSign } from '../sim/game';
import { angleDiff, clamp, dist, distXZ, dot, len, norm, rightDir, sub, v3, viewDir, type Vec3 } from '../sim/math';
import { nextFloat, nextGauss, type Rng } from '../sim/rng';
import { BALLS, GRAVITY } from '../sim/tuning';
import type { Ball, GameState, Player, PlayerInput } from '../sim/types';

export type Difficulty = 'easy' | 'medium' | 'hard';

const SKILL: Record<Difficulty, { react: number; aimErr: number; catchP: number; blockP: number; turn: number }> = {
  easy: { react: 0.45, aimErr: 0.06, catchP: 0.15, blockP: 0.15, turn: 6 },
  medium: { react: 0.3, aimErr: 0.035, catchP: 0.35, blockP: 0.35, turn: 9 },
  hard: { react: 0.2, aimErr: 0.018, catchP: 0.6, blockP: 0.6, turn: 14 },
};

type Plan = 'catch' | 'block' | 'dodge';

export interface BotBrain {
  difficulty: Difficulty;
  rng: Rng;
  yaw: number;
  pitch: number;
  target: number;
  holdFor: number;
  holdT: number;
  primary: boolean;
  secondary: boolean;
  strafe: number;
  strafeT: number;
  /** ball id → { noticedAt, plan } for incoming live balls. */
  seen: Map<number, { at: number; plan: Plan; throwTick: number }>;
  wanderX: number;
  errYaw: number;
  errPitch: number;
}

export function createBrain(p: Player, difficulty: Difficulty, seed: number): BotBrain {
  return {
    difficulty, rng: { s: (seed * 7919 + p.id * 104729) | 0 }, yaw: p.yaw, pitch: 0, target: -1,
    holdFor: 0, holdT: 0, primary: false, secondary: false, strafe: 1, strafeT: 0, seen: new Map(), wanderX: 4, errYaw: 0, errPitch: 0,
  };
}

const DT = 1 / 60;

export function botInput(state: GameState, p: Player, brain: BotBrain): PlayerInput {
  const skill = SKILL[brain.difficulty];
  const idle: PlayerInput = {
    moveX: 0, moveZ: 0, yaw: brain.yaw, pitch: brain.pitch, sprint: false, crouch: false, jump: false, primary: false, secondary: false, use: false,
  };
  if (p.life !== 'active' || state.phase !== 'play') {
    brain.primary = false;
    brain.holdT = 0;
    brain.yaw = p.yaw;
    return { ...idle, yaw: p.yaw };
  }
  const sign = teamSign(p.team);
  const chest = v3(p.pos.x, p.pos.y + 1.2, p.pos.z);
  let wish = v3();
  let sprint = false;
  let crouch = false;
  let jump = false;
  let primary = false;
  let secondary = false;
  let lookAt: Vec3 | undefined;

  brain.strafeT -= DT;
  if (brain.strafeT <= 0) {
    brain.strafe = nextFloat(brain.rng) < 0.5 ? -1 : 1;
    brain.strafeT = 0.6 + nextFloat(brain.rng) * 1.2;
    brain.wanderX = 2.5 + nextFloat(brain.rng) * 4;
  }

  // 1. Threats: incoming live balls from the other team.
  const threat = findThreat(state, p, chest, brain, skill.react);
  if (threat) {
    const { ball, tHit, plan } = threat;
    lookAt = ball.pos;
    if (plan === 'catch' && p.held < 0) {
      if (tHit < 0.22) primary = true;
    } else if (plan === 'block' && p.held >= 0) {
      // Raise the shield early and hold it until the ball arrives (§4.3.3).
      if (tHit < 0.5) secondary = true;
    } else {
      // Dodge sideways, away from where the ball is heading.
      const bv = norm(v3(ball.vel.x, 0, ball.vel.z));
      const side = v3(-bv.z, 0, bv.x);
      const rel = sub(chest, ball.pos);
      const s = dot(side, rel) >= 0 ? 1 : -1;
      wish = v3(side.x * s, 0, side.z * s);
      sprint = true;
      const impactY = ball.pos.y + ball.vel.y * tHit - 0.5 * GRAVITY * BALLS[ball.type].gravityScale * tHit * tHit;
      if (impactY > p.pos.y + 1.1 && nextFloat(brain.rng) < 0.5) crouch = true;
      else if (tHit < 0.35) jump = true; // moving sideways, so Space is a sidestep dash
    }
  } else if (p.held >= 0) {
    // 2. Holding a ball: pick a target, move up, aim and throw.
    const ball = state.balls[p.held]!;
    const def = BALLS[ball.type];
    const target = pickTarget(state, p, brain);
    if (target) {
      const aim = aimAt(p, target, def.speedQuick, def.gravityScale);
      brain.yaw = turnToward(brain.yaw, aim.yaw + brain.errYaw, skill.turn);
      brain.pitch = aim.pitch + brain.errPitch;
      const x = centerlineX(state.arena, p.pos.z) + sign * brain.wanderX;
      wish = norm(v3(x - p.pos.x, 0, brain.strafe * 3));
      const range = def.type === 'heavy' ? 11 : 17;
      const aligned = Math.abs(angleDiff(brain.yaw, aim.yaw + brain.errYaw)) < 0.08;
      if (distXZ(p.pos, target.pos) < range && aligned) {
        if (!brain.primary && brain.holdT === 0) {
          brain.holdFor = def.windup + nextFloat(brain.rng) * 0.8;
          // Aim error is sampled once per throw.
          brain.errYaw = nextGauss(brain.rng) * skill.aimErr;
          brain.errPitch = nextGauss(brain.rng) * skill.aimErr * 0.6;
        }
        brain.holdT += DT;
        primary = brain.holdT < brain.holdFor;
        if (!primary) brain.holdT = 0;
      } else {
        brain.holdT = 0;
      }
    }
    return finish(state, p, brain, wish, sprint, crouch, jump, primary, secondary, undefined);
  } else {
    // 3. Empty-handed: go get the nearest free ball on our side.
    const ball = nearestFreeBall(state, p);
    if (ball) {
      lookAt = v3(ball.pos.x, p.pos.y + 1.2, ball.pos.z);
      wish = norm(v3(ball.pos.x - p.pos.x, 0, ball.pos.z - p.pos.z));
      sprint = distXZ(ball.pos, p.pos) > 3 && p.stamina > 1;
      if (findPickup(state, p)?.id === ball.id && !brain.primary) primary = true;
    } else {
      // Nothing to grab: hang back and strafe, facing the other team.
      wish = norm(v3(centerlineX(state.arena, p.pos.z) + sign * 6 - p.pos.x, 0, brain.strafe * 2));
      lookAt = v3(-sign * 6, 1.2, p.pos.z);
    }
  }
  return finish(state, p, brain, wish, sprint, crouch, jump, primary, secondary, lookAt);
}

function finish(
  state: GameState, p: Player, brain: BotBrain, wish: Vec3, sprint: boolean, crouch: boolean, jump: boolean,
  primary: boolean, secondary: boolean, lookAt: Vec3 | undefined,
): PlayerInput {
  const skill = SKILL[brain.difficulty];
  if (lookAt) {
    const e = eyePos(p);
    const d = sub(lookAt, e);
    const yaw = Math.atan2(-d.z, d.x);
    brain.yaw = turnToward(brain.yaw, yaw, skill.turn);
    brain.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  // Never wander over the centerline: steer back if close.
  const sign = teamSign(p.team);
  const depth = sideDepth(state, p.team, p.pos.x, p.pos.z);
  if (depth < 1.2 && wish.x * sign < 0) wish = v3(0, 0, wish.z);
  if (depth < 0.8) wish = v3(sign, 0, wish.z);
  const f = viewDir(brain.yaw, 0);
  const r = rightDir(brain.yaw);
  brain.primary = primary;
  brain.secondary = secondary;
  return {
    moveX: clamp(dot(wish, r), -1, 1),
    moveZ: clamp(dot(wish, f), -1, 1),
    yaw: brain.yaw,
    pitch: brain.pitch,
    sprint: sprint && dot(wish, f) > 0.3,
    crouch, jump, primary, secondary, use: false,
  };
}

function turnToward(from: number, to: number, rate: number): number {
  const d = angleDiff(from, to);
  const max = rate * DT;
  return from + clamp(d, -max, max);
}

function findThreat(
  state: GameState, p: Player, chest: Vec3, brain: BotBrain, react: number,
): { ball: Ball; tHit: number; plan: Plan } | undefined {
  let best: { ball: Ball; tHit: number; plan: Plan } | undefined;
  for (const ball of state.balls) {
    if (ball.state !== 'live' || ball.throwerTeam === p.team || ball.hits.includes(p.id)) {
      if (ball.state !== 'live') brain.seen.delete(ball.id);
      continue;
    }
    const rel = sub(chest, ball.pos);
    const v = ball.vel;
    const vv = dot(v, v);
    if (vv < 1) continue;
    const tHit = dot(rel, v) / vv;
    if (tHit < 0 || tHit > 1.0) continue;
    const miss = len(sub(rel, v3(v.x * tHit, v.y * tHit, v.z * tHit)));
    if (miss > 1.1) continue;
    let seen = brain.seen.get(ball.id);
    if (!seen || seen.throwTick !== ball.thrower) {
      const def = BALLS[ball.type];
      const skill = SKILL[brain.difficulty];
      const roll = nextFloat(brain.rng);
      const plan: Plan = p.held < 0 && def.catchable && roll < skill.catchP ? 'catch'
        : p.held >= 0 && !def.breaksShield && roll < skill.blockP ? 'block' : 'dodge';
      seen = { at: state.time, plan, throwTick: ball.thrower };
      brain.seen.set(ball.id, seen);
    }
    if (state.time - seen.at < react) continue;
    if (!best || tHit < best.tHit) best = { ball, tHit, plan: seen.plan };
  }
  return best;
}

function pickTarget(state: GameState, p: Player, brain: BotBrain): Player | undefined {
  const current = state.players[brain.target];
  if (current && current.team !== p.team && current.life !== 'out' && nextFloat(brain.rng) > 0.01) return current;
  let best: Player | undefined;
  let bestD = Infinity;
  for (const q of state.players) {
    if (q.team === p.team || q.life === 'out') continue;
    const d = dist(q.pos, p.pos) + nextFloat(brain.rng) * 3;
    if (d < bestD) { bestD = d; best = q; }
  }
  brain.target = best?.id ?? -1;
  return best;
}

function nearestFreeBall(state: GameState, p: Player): Ball | undefined {
  let best: Ball | undefined;
  let bestD = Infinity;
  for (const b of state.balls) {
    if (b.state !== 'rest' && b.state !== 'dead') continue;
    if (sideDepth(state, p.team, b.pos.x, b.pos.z) < -0.9) continue; // out of reach on the other side
    if (Math.abs(b.pos.z) > state.arena.bounds.maxZ - 0.5) continue;
    const d = distXZ(b.pos, p.pos);
    // Prefer balls nobody else on our team is closer to.
    const mateCloser = state.players.some((q) => q !== p && q.team === p.team && q.life === 'active' && q.held < 0 && distXZ(q.pos, b.pos) < d - 1);
    const score = d + (mateCloser ? 6 : 0);
    if (score < bestD) { bestD = score; best = b; }
  }
  return best;
}

/** Ballistic aim with target lead. */
export function aimAt(p: Player, target: Player, speed: number, gravityScale: number): { yaw: number; pitch: number } {
  const e = eyePos(p);
  const g = GRAVITY * gravityScale;
  let aimPoint = v3(target.pos.x, target.pos.y + 1.1, target.pos.z);
  let pitch = 0;
  for (let i = 0; i < 3; i++) {
    const d = sub(aimPoint, e);
    const h = Math.hypot(d.x, d.z);
    const v2 = speed * speed;
    const disc = v2 * v2 - g * (g * h * h + 2 * d.y * v2);
    pitch = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * h)) : Math.PI / 4;
    const t = h / Math.max(0.1, speed * Math.cos(pitch));
    aimPoint = v3(target.pos.x + target.vel.x * t * 0.7, target.pos.y + 1.1, target.pos.z + target.vel.z * t * 0.7);
  }
  const d = sub(aimPoint, e);
  return { yaw: Math.atan2(-d.z, d.x), pitch: clamp(pitch, -1.2, 1.2) };
}

/** Convenience: inputs for every bot in the game. Humans get NO input here. */
export function botInputs(state: GameState, brains: Map<number, BotBrain>, out: PlayerInput[]): void {
  for (const p of state.players) {
    const brain = brains.get(p.id);
    if (brain) out[p.id] = botInput(state, p, brain);
  }
}

