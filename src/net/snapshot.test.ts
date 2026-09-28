import { describe, expect, it } from 'vitest';
import { createGame } from '../sim/game';
import { decodeSnapshot, encodeSnapshot } from './snapshot';

describe('snapshot codec', () => {
  it('round-trips positions to 1 cm and angles closely', () => {
    const s = createGame({ seed: 1, teamSize: 8 });
    s.players[3]!.pos = { x: -3.456, y: 0.42, z: 2.001 };
    s.players[3]!.yaw = 2.5;
    s.players[3]!.pitch = -0.3;
    s.balls[2]!.pos = { x: 1.234, y: 3.21, z: -4.4 };
    const buf = encodeSnapshot(s);
    expect(buf.byteLength).toBeLessThan(300);
    const d = decodeSnapshot(buf);
    const p = d.players[3]!;
    expect(p.x).toBeCloseTo(-3.46, 2);
    expect(p.z).toBeCloseTo(2.0, 2);
    expect(p.yaw).toBeCloseTo(2.5, 3);
    expect(p.pitch).toBeCloseTo(-0.3, 1);
    expect(d.balls[2]!.y).toBeCloseTo(3.21, 2);
    expect(d.balls[2]!.type).toBe(s.balls[2]!.type);
    expect(d.players).toHaveLength(16);
  });
});
