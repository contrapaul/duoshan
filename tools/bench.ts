/**
 * Referee cost benchmark (Phase 0 spike S3, local half).
 *
 *   npm run bench -- [teamSize=8] [seconds=120]
 *
 * Runs the real sim with all-bot teams and reports CPU per tick. A Durable Object
 * cannot time its own CPU (Workers freeze clocks during execution), so this is
 * where the per-tick cost is measured; the latency page measures tick steadiness.
 */
import { botInputs, createBrain, type BotBrain } from '../src/bots/bot';
import { createGame, step } from '../src/sim/game';
import { TICK_HZ } from '../src/sim/tuning';
import type { PlayerInput } from '../src/sim/types';

const teamSize = Number(process.argv[2] ?? 8);
const seconds = Number(process.argv[3] ?? 120);

const state = createGame({ seed: 7, teamSize });
const brains = new Map<number, BotBrain>();
for (const p of state.players) brains.set(p.id, createBrain(p, 'medium', 7));
const inputs: PlayerInput[] = [];
const counts: Record<string, number> = {};
const times: number[] = [];

for (let t = 0; t < seconds * TICK_HZ; t++) {
  const t0 = performance.now();
  botInputs(state, brains, inputs);
  const events = step(state, inputs);
  times.push(performance.now() - t0);
  for (const e of events) counts[e.t] = (counts[e.t] ?? 0) + 1;
}

times.sort((a, b) => a - b);
const pct = (q: number) => times[Math.floor(times.length * q)]!.toFixed(3);
const mean = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
console.log(`${teamSize}v${teamSize}, ${seconds}s of game time, ${times.length} ticks`);
console.log(`ms/tick (sim + bots): mean ${mean}  p50 ${pct(0.5)}  p99 ${pct(0.99)}  max ${times[times.length - 1]!.toFixed(3)}`);
console.log(`budget at 60 Hz is 16.7 ms; target p99 < 4 ms`);
console.log('events:', counts);
