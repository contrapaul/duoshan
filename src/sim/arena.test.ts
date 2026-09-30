import { describe, expect, it } from 'vitest';
import { botInputs, createBrain, type BotBrain } from '../bots/bot';
import { ARENAS, CLASSIC_GYM, centerlineX, FULL_COURT, pushClear, spectatorSeats } from './arena';
import { createGame, step } from './game';
import { v3 } from './math';
import { NO_INPUT, type GameState, type PlayerInput } from './types';

const idle = (s: GameState): PlayerInput[] => s.players.map((p) => ({ ...NO_INPUT, yaw: p.yaw, pitch: p.pitch }));

describe('Full Court', () => {
  it('is the default arena: a basketball-sized, obstacle-free court', () => {
    expect(ARENAS[0]).toBe(FULL_COURT);
    expect(FULL_COURT.court.halfLength * 2).toBe(30);
    expect(FULL_COURT.court.halfWidth * 2).toBe(18);
    expect(FULL_COURT.boxes.some((b) => b.kind === 'obstacle')).toBe(false);
  });

  it('has a stepped centerline: each team gets a 2.5 m tongue into the other half', () => {
    expect(centerlineX(FULL_COURT, 4)).toBeCloseTo(2.5);
    expect(centerlineX(FULL_COURT, -4)).toBeCloseTo(-2.5);
    expect(centerlineX(FULL_COURT, 0)).toBeCloseTo(0);
  });

  it('is balanced: both teams get the same court area', () => {
    const { halfLength: L, halfWidth: W } = FULL_COURT.court;
    let blue = 0;
    const n = 9000;
    for (let i = 0; i < n; i++) {
      const z = -W + ((i + 0.5) / n) * 2 * W;
      blue += (centerlineX(FULL_COURT, z) + L) * ((2 * W) / n);
    }
    expect(blue).toBeCloseTo(2 * L * W, 3);
  });

  it('knocks out by the stepped line, not by x = 0', () => {
    const s = createGame({ seed: 1, teamSize: 1, arena: FULL_COURT });
    while (s.phase !== 'play') step(s, idle(s));
    const blue = s.players[0]!;
    blue.pos = v3(2.0, 0, 5); // inside Blue's tongue: legal
    step(s, idle(s));
    expect(blue.life).toBe('active');
    blue.pos = v3(-2.0, 0, -5); // Red's tongue: over the line
    step(s, idle(s));
    expect(blue.life).toBe('out');
  });

  it('starts balls on the centerline and outside walls', () => {
    for (const arena of ARENAS) {
      const s = createGame({ seed: 1, teamSize: 5, arena });
      for (const b of s.balls) {
        expect(b.pos.x).toBeCloseTo(centerlineX(arena, b.pos.z));
        for (const w of arena.boxes) {
          const inside = b.pos.x > w.min.x && b.pos.x < w.max.x && b.pos.z > w.min.z && b.pos.z < w.max.z && b.pos.y < w.max.y;
          expect(inside).toBe(false);
        }
      }
    }
  });
});

describe('spectator seats', () => {
  it('gives each team at least 8 seats on its own end of the bleachers, facing the court', () => {
    for (const arena of ARENAS) {
      for (const team of [0, 1] as const) {
        const seats = spectatorSeats(arena, team);
        expect(seats.length).toBeGreaterThanOrEqual(8);
        for (const seat of seats) {
          expect(team === 0 ? seat.x < 0 : seat.x > 0).toBe(true);
          // On top of a bleacher step, not inside one.
          const step = arena.boxes.find((b) => b.kind === 'bleacher' && Math.abs(b.max.y - seat.y) < 1e-9
            && seat.x >= b.min.x && seat.x <= b.max.x && seat.z >= b.min.z && seat.z <= b.max.z);
          expect(step).toBeDefined();
          const inside = arena.boxes.some((b) => b.max.y > seat.y + 0.01 && seat.x > b.min.x && seat.x < b.max.x && seat.z > b.min.z && seat.z < b.max.z);
          expect(inside).toBe(false);
          // Facing the court (the bleachers are on the +z side).
          expect(Math.cos(seat.yaw)).toBeCloseTo(0);
          expect(-Math.sin(seat.yaw) * Math.sign(seat.z)).toBeLessThan(0);
        }
      }
    }
  });
});

describe('fun-breaking bug guards', () => {
  it('pushClear moves a point out of (and away from) walls', () => {
    const stage = CLASSIC_GYM.boxes.find((b) => b.kind === 'stage')!;
    const inside = { x: (stage.min.x + stage.max.x) / 2, z: (stage.min.z + stage.max.z) / 2 };
    const out = pushClear(CLASSIC_GYM, inside.x, inside.z, 0.55);
    for (const b of CLASSIC_GYM.boxes.filter((x) => x.max.y > 0.3)) {
      const cx = Math.min(Math.max(out.x, b.min.x), b.max.x);
      const cz = Math.min(Math.max(out.z, b.min.z), b.max.z);
      expect(Math.hypot(out.x - cx, out.z - cz)).toBeGreaterThanOrEqual(0.55 - 1e-6);
    }
    // A point already clear is untouched.
    expect(pushClear(CLASSIC_GYM, 0, 0, 0.55)).toEqual({ x: 0, z: 0 });
  });

  it('a player who gets up against a wall cannot be tripped again straight away', () => {
    const s = createGame({ seed: 2, teamSize: 1, arena: FULL_COURT });
    while (s.phase !== 'play') step(s, idle(s));
    const p = s.players[0]!;
    // Sprint at the hall's back wall (behind Blue's end), between the stages.
    const wall = FULL_COURT.boxes.find((b) => b.kind === 'wall' && b.max.x <= FULL_COURT.bounds.minX)!;
    p.pos = v3(wall.max.x + 3, 0, 8);
    let trips = 0;
    let getups = 0;
    for (let t = 0; t < 60 * 8; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: Math.PI, moveZ: 1, sprint: true };
      for (const e of step(s, inputs)) {
        if (e.t === 'trip') trips++;
        if (e.t === 'getup') getups++;
      }
    }
    // Sprinting into the wall trips once per ~(1.5 + 0.6 + 2) s at most, never in a loop.
    expect(trips).toBeGreaterThanOrEqual(1);
    expect(trips).toBeLessThanOrEqual(2);
    expect(getups).toBeGreaterThanOrEqual(1);
  });

  it('bots rarely run into walls and never trip in a loop', () => {
    for (const arena of ARENAS) {
      const s = createGame({ seed: 4, teamSize: 5, arena });
      const brains = new Map<number, BotBrain>();
      for (const p of s.players) brains.set(p.id, createBrain(p, 'medium', 4));
      const inputs: PlayerInput[] = [];
      const lastGetup = new Map<number, number>();
      let wallTrips = 0;
      let loops = 0;
      for (let t = 0; t < 60 * 120; t++) {
        botInputs(s, brains, inputs);
        for (const e of step(s, inputs)) {
          if (e.t === 'getup') lastGetup.set(e.player, s.time);
          if (e.t === 'trip') {
            if (e.cause === 'wall') wallTrips++;
            const g = lastGetup.get(e.player);
            if (g !== undefined && s.time - g < 1.9) loops++;
          }
        }
      }
      expect(loops).toBe(0);
      expect(wallTrips).toBeLessThanOrEqual(3);
    }
  });

  it('5v5 bots play full rounds on Full Court', () => {
    const s = createGame({ seed: 21, teamSize: 5, arena: FULL_COURT });
    const brains = new Map<number, BotBrain>();
    for (const p of s.players) brains.set(p.id, createBrain(p, 'medium', 21));
    const inputs: PlayerInput[] = [];
    let rounds = 0;
    for (let t = 0; t < 60 * 60 * 4 && rounds < 2; t++) {
      botInputs(s, brains, inputs);
      for (const e of step(s, inputs)) if (e.t === 'round_end') rounds++;
    }
    expect(rounds).toBeGreaterThanOrEqual(1);
  });
});
