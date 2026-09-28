import { describe, expect, it } from 'vitest';
import { botInputs, createBrain, type BotBrain } from '../bots/bot';
import { ARENAS, centerlineX, OFFSET_COURT } from './arena';
import { createGame, step } from './game';
import { v3 } from './math';
import { NO_INPUT, type GameState, type PlayerInput } from './types';

const idle = (s: GameState): PlayerInput[] => s.players.map((p) => ({ ...NO_INPUT, yaw: p.yaw, pitch: p.pitch }));

describe('Offset Court', () => {
  it('has a stepped centerline: each team gets a 1.5 m tongue into the other half', () => {
    expect(centerlineX(OFFSET_COURT, 3)).toBeCloseTo(1.5);
    expect(centerlineX(OFFSET_COURT, -3)).toBeCloseTo(-1.5);
    expect(centerlineX(OFFSET_COURT, 0)).toBeCloseTo(0);
  });

  it('is balanced: both teams get the same court area', () => {
    const { halfLength: L, halfWidth: W } = OFFSET_COURT.court;
    let blue = 0;
    const n = 9000;
    for (let i = 0; i < n; i++) {
      const z = -W + ((i + 0.5) / n) * 2 * W;
      blue += (centerlineX(OFFSET_COURT, z) + L) * ((2 * W) / n);
    }
    expect(blue).toBeCloseTo(2 * L * W, 3);
  });

  it('every wall has a twin rotated 180° about the court centre', () => {
    const walls = OFFSET_COURT.boxes.filter((b) => b.kind === 'obstacle');
    expect(walls.length).toBe(6);
    for (const w of walls) {
      const twin = walls.find((t) =>
        Math.abs(t.min.x + w.max.x) < 1e-9 && Math.abs(t.max.x + w.min.x) < 1e-9 &&
        Math.abs(t.min.z + w.max.z) < 1e-9 && Math.abs(t.max.z + w.min.z) < 1e-9);
      expect(twin).toBeDefined();
      expect(w.max.y).toBeCloseTo(1.1); // chest high
    }
  });

  it('knocks out by the stepped line, not by x = 0', () => {
    const s = createGame({ seed: 1, teamSize: 1, arena: OFFSET_COURT });
    while (s.phase !== 'play') step(s, idle(s));
    const blue = s.players[0]!;
    blue.pos = v3(1.0, 0, 3.5); // inside Blue's tongue: legal
    step(s, idle(s));
    expect(blue.life).toBe('active');
    blue.pos = v3(-1.0, 0, -3.5); // Red's tongue: over the line
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

  it('5v5 bots play full rounds without anyone ending up inside a wall', () => {
    const s = createGame({ seed: 21, teamSize: 5, arena: OFFSET_COURT });
    const brains = new Map<number, BotBrain>();
    for (const p of s.players) brains.set(p.id, createBrain(p, 'medium', 21));
    const inputs: PlayerInput[] = [];
    let rounds = 0;
    for (let t = 0; t < 60 * 60 * 4 && rounds < 2; t++) {
      botInputs(s, brains, inputs);
      for (const e of step(s, inputs)) if (e.t === 'round_end') rounds++;
      for (const p of s.players) {
        if (p.life === 'out') continue;
        for (const w of OFFSET_COURT.boxes.filter((b) => b.kind === 'obstacle')) {
          const deep = p.pos.x > w.min.x + 0.05 && p.pos.x < w.max.x - 0.05 && p.pos.z > w.min.z + 0.05 && p.pos.z < w.max.z - 0.05 && p.pos.y < w.max.y - 0.05;
          expect(deep).toBe(false);
        }
      }
    }
    expect(rounds).toBeGreaterThanOrEqual(1);
  });
});
