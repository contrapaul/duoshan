import { describe, expect, it } from 'vitest';
import { createGame, step } from '../sim/game';
import { NO_INPUT } from '../sim/types';
import { applySnapshot, decodeSnapshot, encodeSnapshot } from './snapshot';

describe('snapshot codec', () => {
  it('round-trips positions to 1 cm and angles closely', () => {
    const s = createGame({ seed: 1, teamSize: 8 });
    s.players[3]!.pos = { x: -3.456, y: 0.42, z: 2.001 };
    s.players[3]!.vel = { x: 4.25, y: -1.75, z: 0.999 };
    s.players[3]!.yaw = 2.5;
    s.players[3]!.pitch = -0.3;
    s.players[3]!.stamina = 1.25;
    s.players[3]!.onGround = false;
    s.players[3]!.life = 'tripped';
    s.players[3]!.tripT = 0.77;
    s.players[3]!.action = { kind: 'aim', t: 0.42, released: false };
    s.balls[2]!.pos = { x: 1.234, y: 3.21, z: -4.4 };
    const buf = encodeSnapshot(s);
    expect(buf.byteLength).toBeLessThan(720);
    const d = decodeSnapshot(buf);
    const p = d.players[3]!;
    expect(p.x).toBeCloseTo(-3.46, 2);
    expect(p.z).toBeCloseTo(2.0, 2);
    expect(p.yaw).toBeCloseTo(2.5, 3);
    expect(p.pitch).toBeCloseTo(-0.3, 1);
    expect(p.vx).toBeCloseTo(4.25, 1);
    expect(p.vy).toBeCloseTo(-1.75, 1);
    expect(p.stamina).toBeCloseTo(1.25, 0);
    expect(p.onGround).toBe(false);
    expect(p.life).toBe('tripped');
    expect(p.tripT).toBeCloseTo(0.77, 2);
    expect(p.action).toBe('aim');
    expect(p.actionT).toBeCloseTo(0.42, 2);
    expect(d.balls[2]!.y).toBeCloseTo(3.21, 2);
    expect(d.balls[2]!.type).toBe(s.balls[2]!.type);
    expect(d.players).toHaveLength(16);
  });

  it('round-trips HUD globals and the target block layout', () => {
    const s = createGame({ seed: 7, teamSize: 3 });
    s.round = 2;
    s.phase = 'countdown';
    s.phaseT = 3.42;
    s.slowT = 1.11;
    s.timeScale = 0.55;
    s.target = { pos: { x: -12.5, y: 4.2, z: 0 }, vz: 0, t: 42 };
    const d = decodeSnapshot(encodeSnapshot(s));
    expect(d.round).toBe(2);
    expect(d.phase).toBe('countdown');
    expect(d.phaseT).toBeCloseTo(3.42, 2);
    expect(d.slowT).toBeCloseTo(1.11, 2);
    expect(d.timeScale).toBeCloseTo(0.55, 2);
    expect(d.target).toEqual({ x: -12.5, y: 4.2, z: 0, t: 42 });
    // Player fields must line up after the 7-byte target block.
    s.players[1]!.pos = { x: 1.5, y: 0, z: -2.25 };
    s.players[1]!.coins = 120;
    s.players[1]!.kos = 3;
    s.players[1]!.score = 5;
    s.players[1]!.outOrder = 2;
    s.players[1]!.reviveT = 2.4;
    const d2 = decodeSnapshot(encodeSnapshot(s));
    const p = d2.players[1]!;
    expect(p.x).toBeCloseTo(1.5, 2);
    expect(p.z).toBeCloseTo(-2.25, 2);
    expect(p.coins).toBe(120);
    expect(p.kos).toBe(3);
    expect(p.score).toBe(5);
    expect(p.outOrder).toBe(2);
    expect(p.reviveT).toBeCloseTo(2.4, 2);
    expect(d2.target).toEqual({ x: -12.5, y: 4.2, z: 0, t: 42 });
  });

  it('applySnapshot writes the decoded state back into a client state container', () => {
    const server = createGame({ seed: 11, teamSize: 3 });
    // Let it run a moment so players move and timers tick down.
    for (let i = 0; i < 120; i++) step(server, server.players.map(() => NO_INPUT));
    server.players[0]!.stamina = 0.4;
    server.players[2]!.coins = 300;
    const client = createGame({ seed: 11, teamSize: 3 });
    applySnapshot(client, decodeSnapshot(encodeSnapshot(server)));
    expect(client.tick).toBe(server.tick);
    expect(client.phase).toBe(server.phase);
    expect(client.round).toBe(server.round);
    expect(client.phaseT).toBeCloseTo(server.phaseT, 2);
    for (let i = 0; i < server.players.length; i++) {
      const a = server.players[i]!;
      const b = client.players[i]!;
      expect(b.pos.x).toBeCloseTo(a.pos.x, 2);
      expect(b.pos.y).toBeCloseTo(a.pos.y, 2);
      expect(b.pos.z).toBeCloseTo(a.pos.z, 2);
      expect(b.vel.x).toBeCloseTo(a.vel.x, 1);
      expect(b.life).toBe(a.life);
      expect(b.held).toBe(a.held);
      expect(b.action.kind).toBe(a.action.kind);
      expect(b.coins).toBe(a.coins);
      expect(b.kos).toBe(a.kos);
      expect(b.score).toBe(a.score);
      expect(b.stamina).toBeCloseTo(a.stamina, 0);
    }
    for (let i = 0; i < server.balls.length; i++) {
      const a = server.balls[i]!;
      const b = client.balls[i]!;
      expect(b.pos.x).toBeCloseTo(a.pos.x, 2);
      expect(b.state).toBe(a.state);
      expect(b.type).toBe(a.type);
    }
    // A later snapshot (no target now, different positions) must overwrite cleanly.
    server.target = null;
    server.players[1]!.pos = { x: 0, y: 0.1, z: 5 };
    applySnapshot(client, decodeSnapshot(encodeSnapshot(server)));
    expect(client.target).toBeNull();
    expect(client.players[1]!.pos.z).toBeCloseTo(5, 2);
  });
});
