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
  blockWindow: 0.35,
  blockCooldown: 0.4,
  blockRadius: 0.65,
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
  blockWindup: number;
  spreadQuickDeg: number;
  spreadAimedDeg: number;
  catchable: boolean;
  blockable: boolean;
  catchRadiusScale: number;
  catchConeDeg: number;
  /** Knockout ragdoll impulse (cosmetic): 0 limp, 1 small, 3 dramatic. */
  koImpulse: number;
  /** After an environment bounce, above this speed the ball can still trip/push (speed ball only). */
  fastDeadMinSpeed: number;
}

export const BALLS: Record<BallType, BallDef> = {
  standard: {
    type: 'standard', radius: 0.105, speedQuick: 18, speedAimed: 18, gravityScale: 1.0,
    restitution: 0.6, rollingDrag: 1.2, windup: 0.25, blockWindup: 0.05,
    spreadQuickDeg: 4.0, spreadAimedDeg: 1.2, catchable: true, blockable: true,
    catchRadiusScale: 1, catchConeDeg: 35, koImpulse: 0, fastDeadMinSpeed: Infinity,
  },
  speed: {
    type: 'speed', radius: 0.095, speedQuick: 25, speedAimed: 29, gravityScale: 0.8,
    restitution: 0.7, rollingDrag: 0.7, windup: 0.25, blockWindup: 0.05,
    spreadQuickDeg: 6.0, spreadAimedDeg: 0.6, catchable: true, blockable: true,
    catchRadiusScale: 0.85, catchConeDeg: 30, koImpulse: 1, fastDeadMinSpeed: 12,
  },
  heavy: {
    type: 'heavy', radius: 0.12, speedQuick: 11, speedAimed: 11, gravityScale: 1.6,
    restitution: 0.15, rollingDrag: 3.0, windup: 0.5, blockWindup: 0.2,
    spreadQuickDeg: 3.0, spreadAimedDeg: 1.5, catchable: false, blockable: false,
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
