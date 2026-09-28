import { describe, expect, it } from 'vitest';
import { aimAt, createBrain, botInputs, type BotBrain } from '../bots/bot';
import { createGame, step } from './game';
import { v3 } from './math';
import { NO_INPUT, type GameState, type PlayerInput, type SimEvent } from './types';

function idle(state: GameState): PlayerInput[] {
  return state.players.map((p) => ({ ...NO_INPUT, yaw: p.yaw, pitch: p.pitch }));
}

function runTicks(state: GameState, n: number, inputs: (s: GameState) => PlayerInput[] = idle): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...step(state, inputs(state)));
  return all;
}

/** Skip the countdown so the round is live. */
function live(state: GameState): void {
  while (state.phase !== 'play') step(state, idle(state));
}

describe('setup', () => {
  it('spawns teams on their own halves with balls on the centerline', () => {
    const s = createGame({ seed: 1, teamSize: 3 });
    expect(s.players).toHaveLength(6);
    for (const p of s.players) expect(p.pos.x * (p.team === 0 ? -1 : 1)).toBeGreaterThan(0);
    expect(s.balls.length).toBe(4);
    for (const b of s.balls) expect(b.pos.x).toBe(0);
  });
});

describe('centerline', () => {
  it('knocks out a player whose root crosses the line', () => {
    const s = createGame({ seed: 1, teamSize: 1 });
    live(s);
    s.players[0]!.pos = v3(0.05, 0, 0);
    const ev = runTicks(s, 1);
    expect(s.players[0]!.life).toBe('out');
    expect(ev.some((e) => e.t === 'ko' && e.cause === 'line')).toBe(true);
  });
});

describe('ball handling', () => {
  function setupThrow(): GameState {
    const s = createGame({ seed: 3, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); a.yaw = 0;
    b.pos = v3(5, 0, 0); b.yaw = Math.PI;
    const ball = s.balls[0]!;
    ball.state = 'held'; ball.holder = a.id; a.held = ball.id;
    return s;
  }

  function throwAt(s: GameState, catchAtTick: number | null, blockTick: number | null = null): SimEvent[] {
    const a = s.players[0]!;
    const b = s.players[1]!;
    // Fully aimed throw (1.2 s hold → tightest spread) with a ballistic solution.
    const { yaw, pitch } = aimAt(a, b, 18, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 180; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, pitch: 0.05, primary: catchAtTick !== null && t >= catchAtTick, secondary: blockTick !== null && t >= blockTick };
      events.push(...step(s, inputs));
      if (b.life === 'out' || b.held >= 0) break;
    }
    return events;
  }

  it('a live ball knocks out an opponent', () => {
    const s = setupThrow();
    const ev = throwAt(s, null);
    expect(ev.some((e) => e.t === 'throw')).toBe(true);
    expect(s.players[1]!.life).toBe('out');
  });

  it('a well-timed catch knocks out the thrower instead', () => {
    const s = setupThrow();
    // Release at tick 72; 10 m at 18 m/s ≈ 33 ticks; press ~0.2 s before arrival.
    const ev = throwAt(s, 94);
    expect(ev.some((e) => e.t === 'catch')).toBe(true);
    expect(s.players[1]!.held).toBeGreaterThanOrEqual(0);
    expect(s.players[0]!.life).toBe('out');
  });

  it('a catch pressed far too early whiffs and the ball hits', () => {
    const s = setupThrow();
    throwAt(s, 75);
    expect(s.players[1]!.life).toBe('out');
  });

  it('heavy balls cannot be caught', () => {
    const s = setupThrow();
    s.balls[0]!.type = 'heavy';
    // Heavy is slow (11 m/s) with a steep arc; aim higher.
    const a = s.players[0]!;
    const b = s.players[1]!;
    const events: SimEvent[] = [];
    for (let t = 0; t < 150 && b.life !== 'out' && b.held < 0; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: 0, pitch: 0.42, primary: t < 31 };
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, pitch: 0.2, primary: t > 70 };
      events.push(...step(s, inputs));
    }
    void a;
    expect(b.held).toBe(-1);
  });
});

describe('bots', () => {
  it('play a full 3v3 match to completion without errors', () => {
    const s = createGame({ seed: 42, teamSize: 3 });
    const brains = new Map<number, BotBrain>();
    for (const p of s.players) brains.set(p.id, createBrain(p, 'medium', 42));
    const inputs: PlayerInput[] = [];
    let rounds = 0;
    let throws = 0;
    for (let t = 0; t < 60 * 60 * 6 && rounds < 3; t++) {
      botInputs(s, brains, inputs);
      for (const e of step(s, inputs)) {
        if (e.t === 'round_end') rounds++;
        if (e.t === 'throw') throws++;
      }
      for (const p of s.players) expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z)).toBe(true);
      for (const b of s.balls) expect(Number.isFinite(b.pos.x + b.pos.y + b.pos.z)).toBe(true);
    }
    expect(throws).toBeGreaterThan(5);
    expect(rounds).toBeGreaterThanOrEqual(1);
  });
});

describe('specials', () => {
  it('does not tag an ordinary single knockout as a double', () => {
    const s = createGame({ seed: 5, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); b.pos = v3(5, 0, 0);
    const ball = s.balls[0]!;
    ball.state = 'held'; ball.holder = a.id; a.held = ball.id;
    const { yaw, pitch } = aimAt(a, b, 18, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 180 && b.life !== 'out'; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      events.push(...step(s, inputs));
    }
    const ko = events.find((e) => e.t === 'ko');
    expect(ko && ko.t === 'ko' && ko.special).toEqual(['first']);
  });
});
