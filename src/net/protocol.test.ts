import { describe, expect, it } from 'vitest';
import type { Rng } from '../sim/rng';
import type { PlayerInput } from '../sim/types';
import { cleanName, decodeInput, encodeInput, generateRoomCode, guestName } from './protocol';

const rng = (s: number): Rng => ({ s });

describe('room codes', () => {
  it('is 5 characters from the unambiguous alphabet', () => {
    for (let s = 1; s < 20; s++) {
      const code = generateRoomCode(rng(s * 7919 + 1));
      expect(code).toHaveLength(5);
      for (const ch of code) {
        expect(code).not.toMatch(/[O0I1]/);
        expect('ABCDEFGHJKMNPQRSTUVWXYZ23456789').toContain(ch);
      }
    }
  });

  it('is deterministic for a seed and distinct across seeds', () => {
    const a = generateRoomCode(rng(42));
    expect(generateRoomCode(rng(42))).toBe(a);
    const seen = new Set<string>();
    for (let s = 1; s < 50; s++) seen.add(generateRoomCode(rng(s)));
    expect(seen.size).toBeGreaterThanOrEqual(40);
  });
});

describe('guest names', () => {
  it('looks like "Word Word 42"', () => {
    const name = guestName(rng(7));
    expect(name).toMatch(/^[A-Za-z]+ [A-Za-z]+ \d{2}$/);
    expect(guestName(rng(7))).toBe(name);
  });

  it('cleans unsafe input and falls back to a guest name', () => {
    expect(cleanName('  <b>Player!</b> ', rng(1))).toBe('bPlayerb');
    expect(cleanName('x<>', rng(1))).toMatch(/^[A-Za-z]+ [A-Za-z]+ \d{2}$/); // too short → guest name
    expect(cleanName(undefined, rng(1))).toMatch(/^[A-Za-z]+ [A-Za-z]+ \d{2}$/);
    expect(cleanName('A very long display name that should be cut', rng(1))).toHaveLength(20);
  });
});

describe('binary input codec', () => {
  const input = (over: Partial<PlayerInput>): PlayerInput => ({
    moveX: 0, moveZ: 0, yaw: 0, pitch: 0,
    sprint: false, crouch: false, jump: false, primary: false, secondary: false, use: false,
    ...over,
  });

  const cases: { in: PlayerInput; expectMove: [number, number]; expectYaw: number }[] = [
    { in: input({}), expectMove: [0, 0], expectYaw: 0 },
    { in: input({ moveX: 1, moveZ: -1, yaw: Math.PI / 3, pitch: 0.5, sprint: true, jump: true }), expectMove: [1, -1], expectYaw: Math.PI / 3 },
    { in: input({ moveX: -1, moveZ: 1, yaw: -Math.PI / 3, pitch: -0.7, primary: true, secondary: true, use: true, crouch: true }), expectMove: [-1, 1], expectYaw: (Math.PI * 5) / 3 },
  ];

  for (const c of cases) {
    it(`round-trips ${JSON.stringify({ m: [c.in.moveX, c.in.moveZ], yaw: c.in.yaw, flags: [c.in.sprint, c.in.crouch, c.in.jump, c.in.primary, c.in.secondary, c.in.use] })}`, () => {
      const buf = encodeInput(123456, c.in);
      expect(buf.byteLength).toBe(12);
      const { seq, input: out } = decodeInput(buf);
      expect(seq).toBe(123456);
      expect(out.moveX).toBeCloseTo(c.expectMove[0], 2);
      expect(out.moveZ).toBeCloseTo(c.expectMove[1], 2);
      expect(out.yaw).toBeCloseTo(c.expectYaw, 1);
      expect(out.pitch).toBeCloseTo(c.in.pitch, 2);
      expect([out.sprint, out.crouch, out.jump, out.primary, out.secondary, out.use])
        .toEqual([c.in.sprint, c.in.crouch, c.in.jump, c.in.primary, c.in.secondary, c.in.use]);
    });
  }

  it('clamps out-of-range move and pitch', () => {
    const { input: out } = decodeInput(encodeInput(1, input({ moveX: 9, moveZ: -9, pitch: 9 })));
    expect(out.moveX).toBe(1);
    expect(out.moveZ).toBe(-1);
    expect(out.pitch).toBeLessThanOrEqual(1.6);
  });
});
