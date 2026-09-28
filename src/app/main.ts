/**
 * Tech demo entry: offline Practice in the greybox Classic Gym vs bots
 * (PROJECT_PLAN.md Phase 0/1). The referee (`src/sim`) runs locally here at a
 * fixed 60 Hz; the same code runs in the Durable Object for online play.
 */
import { botInputs, createBrain, type BotBrain, type Difficulty } from '../bots/bot';
import { createGame, defaultBallTypes, step } from '../sim/game';
import { DT } from '../sim/tuning';
import type { BallType } from '../sim/tuning';
import type { PlayerInput } from '../sim/types';
import { GameView, snapPositions, type Snap } from '../render/view';
import type { Quality } from '../render/scene';
import { playEvents, unlockAudio } from './audio';
import { Hud } from './hud';
import { LocalInput } from './input';

const LOCAL = 0;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Settings { teamSize: number; difficulty: Difficulty; quality: Quality; balls: string; sensitivity: number }

function readSettings(): Settings {
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem('duoshan.settings') ?? '{}') as Partial<Settings>; } catch { /* private mode */ }
  const get = (id: string) => ($(id) as HTMLSelectElement | HTMLInputElement);
  for (const [k, v] of Object.entries(saved)) { const el = document.getElementById(`opt-${k}`) as HTMLInputElement | null; if (el) el.value = String(v); }
  return {
    teamSize: Number(get('opt-teamSize').value),
    difficulty: get('opt-difficulty').value as Difficulty,
    quality: get('opt-quality').value as Quality,
    balls: get('opt-balls').value,
    sensitivity: Number(get('opt-sensitivity').value),
  };
}

function ballMix(mix: string, players: number): BallType[] {
  const n = defaultBallTypes(players).length;
  if (mix === 'standard') return Array<BallType>(n).fill('standard');
  if (mix === 'chaos') return Array.from({ length: n }, (_, i): BallType => (i % 2 ? 'heavy' : 'speed'));
  return defaultBallTypes(players);
}

let running: { stop: () => void } | undefined;
let input: LocalInput | undefined;

async function start(): Promise<void> {
  const s = readSettings();
  try { localStorage.setItem('duoshan.settings', JSON.stringify(s)); } catch { /* ignore */ }
  running?.stop();
  unlockAudio();
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');

  const state = createGame({ seed: (Date.now() & 0xffffff) | 1, teamSize: s.teamSize, humans: [LOCAL], ballTypes: ballMix(s.balls, s.teamSize * 2) });
  const brains = new Map<number, BotBrain>();
  for (const p of state.players) if (p.bot) brains.set(p.id, createBrain(p, s.difficulty, state.rng.s + p.id));

  const canvas = $<HTMLCanvasElement>('game');
  const view = await GameView.create(canvas, state, LOCAL, s.quality);
  input ??= new LocalInput(canvas);
  input.sensitivity = s.sensitivity / 1000;
  input.yaw = state.players[LOCAL]!.yaw;
  const hud = new Hud(LOCAL);
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');

  const onResize = () => view.resize(window.innerWidth, window.innerHeight);
  onResize();
  window.addEventListener('resize', onResize);
  input.onToggleView = () => { view.thirdPerson = !view.thirdPerson; };
  let paused = false;
  input.onPauseChange = (p) => {
    paused = p;
    $('pause').classList.toggle('hidden', !p);
  };
  canvas.onclick = () => { if (!input?.locked) input?.lock(); };
  $('resume').onclick = () => input?.lock();
  input.lock();

  const inputs: PlayerInput[] = [];
  let prev: Snap = snapPositions(state);
  let acc = 0;
  let last = performance.now();
  let lastPhase = state.phase;
  const frameTimes: number[] = [];
  let simMs = 0;
  let perfText = '';
  let perfT = 0;
  let raf = 0;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frameTimes.push(dt * 1000);
    if (frameTimes.length > 120) frameTimes.shift();

    if (!paused) {
      acc += dt;
      const t0 = performance.now();
      while (acc >= DT) {
        prev = snapPositions(state);
        botInputs(state, brains, inputs);
        inputs[LOCAL] = input!.sample();
        const events = step(state, inputs);
        view.onEvents(state, events);
        view.stepPhysics(DT, state);
        hud.onEvents(state, events);
        playEvents(events, LOCAL);
        if (events.some((e) => e.t === 'revive' && e.player === LOCAL) || (state.phase === 'countdown' && lastPhase !== 'countdown')) {
          input!.yaw = state.players[LOCAL]!.yaw;
          input!.pitch = 0;
        }
        lastPhase = state.phase;
        acc -= DT;
      }
      simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    view.render(state, prev, paused ? 1 : acc / DT, dt, { yaw: input!.yaw, pitch: input!.pitch });

    perfT -= dt;
    if (perfT <= 0) {
      perfT = 0.5;
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const info = view.renderer.info.render;
      perfText = `${Math.round(1000 / avg)} fps · p95 ${p95.toFixed(1)} ms · sim ${simMs.toFixed(2)} ms · ${info.calls} draws · ${state.players.length} players`;
    }
    hud.update(state, dt, perfText, view.thirdPerson);
  };
  raf = requestAnimationFrame(frame);

  running = {
    stop: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      view.renderer.dispose();
    },
  };
  (window as unknown as { duoshan: unknown }).duoshan = { state, view };
}

function showMenu(): void {
  document.exitPointerLock();
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

readSettings();
$('play').onclick = () => void start();
$('quit').onclick = () => { running?.stop(); running = undefined; showMenu(); };
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
});
