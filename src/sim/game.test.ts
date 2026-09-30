import { describe, expect, it } from 'vitest';
import { aimAt, createBrain, botInputs, type BotBrain } from '../bots/bot';
import { createGame, eyePos, step } from './game';
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

describe('playtest 1 changes', () => {
  function duel(): { s: GameState; a: GameState['players'][0]; b: GameState['players'][0] } {
    const s = createGame({ seed: 11, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); a.yaw = 0;
    b.pos = v3(5, 0, 0); b.yaw = Math.PI;
    return { s, a, b };
  }

  function give(s: GameState, p: GameState['players'][0], ballId: number, type?: 'standard' | 'speed' | 'heavy'): void {
    const ball = s.balls[ballId]!;
    if (type) ball.type = type;
    ball.state = 'held'; ball.holder = p.id; p.held = ball.id;
  }

  /** a throws at b's chest (fully aimed) while b holds the given input. */
  function throwAtB(s: GameState, bInput: Partial<PlayerInput>, speed = 18, gScale = 1, hold = 72): SimEvent[] {
    const a = s.players[0]!;
    const b = s.players[1]!;
    const { yaw, pitch } = aimAt(a, b, speed, gScale);
    const events: SimEvent[] = [];
    for (let t = 0; t < 200; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < hold };
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, pitch: 0, ...bInput };
      events.push(...step(s, inputs));
    }
    return events;
  }

  it('balls are larger (0.30 / 0.27 / 0.34 m)', async () => {
    const { BALLS } = await import('./tuning');
    expect(BALLS.standard.radius * 2).toBeCloseTo(0.3);
    expect(BALLS.speed.radius * 2).toBeCloseTo(0.27);
    expect(BALLS.heavy.radius * 2).toBeCloseTo(0.34);
  });

  it('E picks up a ball', () => {
    const { s, a } = duel();
    const ball = s.balls[0]!;
    ball.pos = v3(-4.2, ball.pos.y, 0);
    for (let t = 0; t < 20; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: 0, pitch: 0, use: t < 2 };
      step(s, inputs);
    }
    expect(a.held).toBe(ball.id);
  });

  it('E catches a live ball', () => {
    const e = duel();
    give(e.s, e.a, 0);
    const { yaw, pitch } = aimAt(e.a, e.b, 18, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 200; t++) {
      const inputs = idle(e.s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, pitch: 0.05, use: t >= 94 };
      events.push(...step(e.s, inputs));
    }
    expect(events.some((x) => x.t === 'catch')).toBe(true);
    expect(e.b.held).toBeGreaterThanOrEqual(0);
  });

  it('A/D + Space is a sidestep dash of about 2.5 m, not a jump', () => {
    const { s, a } = duel();
    const z0 = a.pos.z;
    let maxY = 0;
    for (let t = 0; t < 30; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: 0, pitch: 0, moveX: t < 12 ? 1 : 0, jump: t < 2 };
      step(s, inputs);
      maxY = Math.max(maxY, a.pos.y);
    }
    // Facing +x, right is +z.
    expect(a.pos.z - z0).toBeGreaterThan(2.2);
    expect(maxY).toBe(0);
  });

  it('Space alone still jumps', () => {
    const { s, a } = duel();
    let maxY = 0;
    for (let t = 0; t < 30; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: 0, pitch: 0, jump: t < 2 };
      step(s, inputs);
      maxY = Math.max(maxY, a.pos.y);
    }
    expect(maxY).toBeGreaterThan(0.5);
  });

  it('a raised shield physically deflects a thrown ball and saves the blocker', () => {
    const { s, a, b } = duel();
    give(s, a, 0);
    give(s, b, 1, 'standard');
    // b aims the shield along the incoming line (looking back at a's hand height).
    const { pitch } = aimAt(b, a, 18, 1);
    const ev = throwAtB(s, { secondary: true, pitch: pitch - 0.08 });
    expect(ev.some((e) => e.t === 'block')).toBe(true);
    expect(b.life).toBe('active');
    expect(b.held).toBe(1);
  });

  it('a casually carried ball is not a shield', () => {
    const { s, a, b } = duel();
    give(s, a, 0);
    give(s, b, 1, 'standard');
    throwAtB(s, {});
    expect(b.life).toBe('out');
  });

  it('a heavy ball bounces off a shield, shoves the blocker and knocks the ball out of their hands', () => {
    const { s, a, b } = duel();
    a.pos = v3(-3, 0, 0);
    give(s, a, 0, 'heavy');
    give(s, b, 1, 'standard');
    const { pitch } = aimAt(b, a, 13.5, 1.6);
    const x0 = b.pos.x;
    const ev = throwAtB(s, { secondary: true, pitch: pitch - 0.1 }, 13.5, 1.6);
    const block = ev.find((e) => e.t === 'block');
    expect(block && block.t === 'block' && block.broke).toBe(true);
    expect(b.life).toBe('active');
    expect(b.held).toBe(-1);
    expect(b.pos.x - x0).toBeGreaterThan(0.5); // shoved back (away from a, toward +x)
  });

  it('hitting the target starts 12 s of slow motion and pays 100 Dodgecoins', () => {
    const { s, a } = duel();
    give(s, a, 0);
    s.target = { pos: v3(-2, 2.2, 0), vz: 0, t: 15 };
    const ev: SimEvent[] = [];
    for (let t = 0; t < 120; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw: 0, pitch: 0.12, primary: t < 72 };
      ev.push(...step(s, inputs));
    }
    expect(ev.some((e) => e.t === 'target_hit')).toBe(true);
    expect(a.coins).toBe(100);
    expect(s.slowT).toBeGreaterThan(10);
    expect(s.timeScale).toBeCloseTo(0.4, 5);
  });

  it('a target appears after 90 s of play', () => {
    const { s } = duel();
    s.targetTimer = 0.05;
    const ev = runTicks(s, 5);
    expect(ev.some((e) => e.t === 'target_spawn')).toBe(true);
    expect(s.target).not.toBeNull();
  });

  it('Big oof knockouts (head hits) start 8 s of slow motion about half the time', () => {
    let slow = 0;
    let heads = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ seed, teamSize: 1 });
      live(s);
      const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
      a.pos = v3(-3, 0, 0); b.pos = v3(3, 0, 0); b.yaw = Math.PI;
      give(s, a, 0);
      // Aim at the head (~1.65 m at 6 m): solve the drop for an 18 m/s throw.
      const e = eyePos(a);
      const dy = 1.65 - e.y;
      const pitch = Math.atan((dy + (9.81 * 36) / (2 * 18 * 18)) / 6);
      const ev: SimEvent[] = [];
      for (let t = 0; t < 120 && b.life !== 'out'; t++) {
        const inputs = idle(s);
        inputs[0] = { ...NO_INPUT, yaw: 0, pitch, primary: t < 72 };
        ev.push(...step(s, inputs));
      }
      if (b.life === 'out') heads++;
      if (ev.some((x) => x.t === 'slowmo' && x.cause === 'big_oof' && x.seconds === 8)) slow++;
      const ko = ev.find((x) => x.t === 'ko');
      if (ko && ko.t === 'ko' && b.life === 'out') expect(ko.special).toContain('big_oof');
    }
    expect(heads).toBeGreaterThan(20);
    expect(slow / heads).toBeGreaterThan(0.25);
    expect(slow / heads).toBeLessThan(0.75);
  });

  it('full slow motion runs the whole match at 0.4× and disables targets', () => {
    const s = createGame({ seed: 1, teamSize: 1, fullSlow: true });
    live(s);
    s.targetTimer = 0.01;
    runTicks(s, 10);
    expect(s.timeScale).toBeCloseTo(0.4);
    expect(s.target).toBeNull();
  });
});

describe('scoring', () => {
  it('scores 100 + 50 (first) for the first knockout, and 150 for a catch', () => {
    const s = createGame({ seed: 5, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); b.pos = v3(5, 0, 0);
    const ball = s.balls[0]!;
    ball.state = 'held'; ball.holder = a.id; a.held = ball.id;
    const { yaw, pitch } = aimAt(a, b, 18, 1);
    for (let t = 0; t < 180 && b.life !== 'out'; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      step(s, inputs);
    }
    // Knockout 100 + first 50, plus 100 for winning the round (1v1).
    expect(a.score).toBe(250);

    const c = createGame({ seed: 3, teamSize: 1 });
    live(c);
    const [ca, cb] = c.players as [GameState['players'][0], GameState['players'][0]];
    ca.pos = v3(-5, 0, 0); cb.pos = v3(5, 0, 0); cb.yaw = Math.PI;
    const cball = c.balls[0]!;
    cball.state = 'held'; cball.holder = ca.id; ca.held = cball.id;
    const aim = aimAt(ca, cb, 18, 1);
    for (let t = 0; t < 180; t++) {
      const inputs = idle(c);
      inputs[0] = { ...NO_INPUT, yaw: aim.yaw, pitch: aim.pitch, primary: t < 72 };
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, pitch: 0.05, primary: t >= 94 };
      step(c, inputs);
    }
    expect(cb.catches).toBe(1);
    expect(cb.score).toBe(150 + 100); // catch + round win
  });
});

describe('dodge', () => {
  function setup(): { s: GameState; a: GameState['players'][0]; b: GameState['players'][0] } {
    const s = createGame({ seed: 9, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); b.pos = v3(5, 0, 0); b.yaw = Math.PI;
    const ball = s.balls[0]!;
    ball.state = 'held'; ball.holder = a.id; a.held = ball.id;
    return { s, a, b };
  }

  it('a live ball passing close without hitting is a Dodge', () => {
    const { s, a, b } = setup();
    const { yaw, pitch } = aimAt(a, b, 18, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 150; t++) {
      const inputs = idle(s);
      // Aim just wide of b: about 0.75 m to the side at 10 m.
      inputs[0] = { ...NO_INPUT, yaw: yaw + 0.075, pitch, primary: t < 72 };
      events.push(...step(s, inputs));
    }
    expect(b.life).toBe('active');
    expect(events.filter((e) => e.t === 'dodge' && e.player === b.id)).toHaveLength(1);
  });

  it('pressing E (or clicking) with nothing to catch is not a Dodge', () => {
    const { s } = setup();
    const events: SimEvent[] = [];
    for (let t = 0; t < 60; t++) {
      const inputs = idle(s);
      inputs[1] = { ...NO_INPUT, yaw: Math.PI, use: t % 20 < 2, primary: t % 30 < 2 };
      events.push(...step(s, inputs));
    }
    expect(events.some((e) => e.t === 'dodge')).toBe(false);
  });

  it('a hit is not a Dodge', () => {
    const { s, a, b } = setup();
    const { yaw, pitch } = aimAt(a, b, 18, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 150; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      events.push(...step(s, inputs));
    }
    expect(b.life).toBe('out');
    expect(events.some((e) => e.t === 'dodge')).toBe(false);
  });
});

describe('bounce ball', () => {
  function bankShot(type: 'bounce' | 'standard'): { s: GameState; events: SimEvent[] } {
    const s = createGame({ seed: 12, teamSize: 1 });
    live(s);
    const [a, b] = s.players as [GameState['players'][0], GameState['players'][0]];
    a.pos = v3(-5, 0, 0); b.pos = v3(5, 0, 0); b.yaw = Math.PI;
    const ball = s.balls[0]!;
    ball.type = type;
    ball.state = 'held'; ball.holder = a.id; a.held = ball.id;
    // Aim at the floor 2.5 m short of b, so the ball has to bounce to reach them.
    const floorSpot = { ...b, pos: v3(2.5, 0.15 - 1.1, 0), vel: v3() };
    const { yaw, pitch } = aimAt(a, floorSpot, 17, 1);
    const events: SimEvent[] = [];
    for (let t = 0; t < 200; t++) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, yaw, pitch, primary: t < 72 };
      events.push(...step(s, inputs));
    }
    return { s, events };
  }

  it('can still knock a player out after bouncing (a bank shot)', () => {
    const { s, events } = bankShot('bounce');
    const ko = events.find((e) => e.t === 'ko');
    expect(s.players[1]!.life).toBe('out');
    expect(ko && ko.t === 'ko' && ko.special).toContain('bank_shot');
  });

  it('the same throw with a standard ball is harmless after the bounce', () => {
    const { s } = bankShot('standard');
    expect(s.players[1]!.life).toBe('active');
  });

  it('stays live for two bounces and goes dead on the third', () => {
    const s = createGame({ seed: 1, teamSize: 1 });
    live(s);
    for (const p of s.players) p.pos = v3(p.team === 0 ? -8 : 8, 0, 0);
    const ball = s.balls[0]!;
    Object.assign(ball, { type: 'bounce', state: 'live', pos: v3(0, 3, 4), vel: v3(0, -6, 0), thrower: 0, throwerTeam: 0, bounces: 0 });
    const states: string[] = [];
    for (let t = 0; t < 400 && states.length < 3; t++) {
      for (const e of step(s, idle(s))) if (e.t === 'bounce' && e.surface === 'floor') states.push(ball.state);
    }
    expect(states).toEqual(['live', 'live', 'dead']);
  });
});
