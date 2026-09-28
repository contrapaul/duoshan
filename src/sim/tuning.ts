/**
 * Starting values from PROJECT_PLAN.md §18.1 and §4.5. Every number here is a
 * playtest starting point, not a final value.
 */

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const GRAVITY = 9.81;

export const PLAYER = {
  radius: 0.3,
  height: 1.8,
  crouchHeight: 1.1,
  eyeStand: 1.62,
  eyeCrouch: 0.95,
  runSpeed: 4.5,
  sprintSpeed: 7.0,
  crouchSpeed: 2.2,
  groundAccel: 40,
  airControl: 0.3,
  jumpSpeed: Math.sqrt(2 * GRAVITY * 0.6),
  staminaMax: 3.0,
  staminaRegenDelay: 1.0,
  staminaRegenTime: 4.0,
  slideMinSpeedFrac: 0.8,
  slideSpeed: 8.0,
  slideTime: 0.8,
  slideCooldown: 1.0,
  slideStaminaCost: 0.5,
  tripTime: 1.5,
  getUpTime: 0.6,
  tripSpeedThreshold: 6.0,
  wallTripAngleDeg: 30,
  /** Sidestep dash (A/D + Space): ~2.5 m over 0.2 s. Speed eases out, so peak = 2.5 / (0.2 × 0.75). */
  dashTime: 0.2,
  dashSpeed: 16.7,
  dashCooldown: 0.8,
  dashStaminaCost: 0.4,
  /** Block stance caps movement at walking speed. */
  walkSpeed: 2.5,
};

export const HANDLING = {
  pickupRange: 1.6,
  pickupAngleDeg: 75,
  pickupTime: 0.15,
  maxCharge: 1.2,
  catchWindow: 0.35,
  catchCooldown: 0.5,
  catchRadius: 0.7,
  catchConeDeg: 35,
  /** Block stance: the held ball becomes a solid shield this far in front of the chest. */
  shieldForward: 0.45,
  possessionWarn: 8,
  possessionMax: 10,
  inheritVelocity: 0.5,
};

export type BallType = 'standard' | 'speed' | 'heavy';

export interface BallDef {
  type: BallType;
  radius: number;
  speedQuick: number;
  speedAimed: number;
  gravityScale: number;
  restitution: number;
  rollingDrag: number;
  windup: number;
  /** Time to raise the shield in block stance with this ball held. */
  blockWindup: number;
  spreadQuickDeg: number;
  spreadAimedDeg: number;
  catchable: boolean;
  /** Hitting a shield knocks the shield ball out of the blocker's hands and shoves them (heavy). */
  breaksShield: boolean;
  catchRadiusScale: number;
  catchConeDeg: number;
  /** Knockout ragdoll impulse (cosmetic): 0 limp, 1 small, 3 dramatic. */
  koImpulse: number;
  /** After an environment bounce, above this speed the ball can still trip/push (speed ball only). */
  fastDeadMinSpeed: number;
}

export const BALLS: Record<BallType, BallDef> = {
  standard: {
    type: 'standard', radius: 0.15, speedQuick: 18, speedAimed: 18, gravityScale: 1.0,
    restitution: 0.6, rollingDrag: 1.2, windup: 0.25, blockWindup: 0.1,
    spreadQuickDeg: 4.0, spreadAimedDeg: 1.2, catchable: true, breaksShield: false,
    catchRadiusScale: 1, catchConeDeg: 35, koImpulse: 0, fastDeadMinSpeed: Infinity,
  },
  speed: {
    type: 'speed', radius: 0.135, speedQuick: 25, speedAimed: 29, gravityScale: 0.8,
    restitution: 0.7, rollingDrag: 0.7, windup: 0.25, blockWindup: 0.1,
    spreadQuickDeg: 6.0, spreadAimedDeg: 0.6, catchable: true, breaksShield: false,
    catchRadiusScale: 0.85, catchConeDeg: 30, koImpulse: 1, fastDeadMinSpeed: 12,
  },
  heavy: {
    type: 'heavy', radius: 0.17, speedQuick: 13.5, speedAimed: 13.5, gravityScale: 1.6,
    restitution: 0.15, rollingDrag: 3.0, windup: 0.65, blockWindup: 0.25,
    spreadQuickDeg: 3.0, spreadAimedDeg: 1.5, catchable: false, breaksShield: true,
    catchRadiusScale: 1, catchConeDeg: 35, koImpulse: 3, fastDeadMinSpeed: Infinity,
  },
};

export const RULES = {
  roundsToWin: 4,
  roundEndPause: 3,
  countdown: 2,
  reviveDelay: 1.0,
  spawnProtection: 1.0,
};

/** Slow motion (PROJECT_PLAN.md §4.7). Durations are real seconds. */
export const SLOWMO = {
  scale: 0.4,
  /** Time-scale change per real second (1 → 0.4 in 0.3 s). */
  easeRate: 2,
  headshotChance: 0.5,
  headshotSeconds: 8,
  headZone: 0.3,
  targetEvery: 90,
  targetUp: 15,
  targetSeconds: 12,
  targetRadius: 0.5,
  targetCoins: 100,
};
