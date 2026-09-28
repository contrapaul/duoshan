/**
 * Tech demo entry: offline Practice in the greybox Classic Gym vs bots
 * (PROJECT_PLAN.md Phase 0/1). The referee (`src/sim`) runs locally here at a
 * fixed 60 Hz; the same code runs in the Durable Object for online play.
 */
import { botInputs, createBrain, type BotBrain, type Difficulty } from '../bots/bot';
import { ARENAS } from '../sim/arena';
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

interface Settings { arena: string; teamSize: number; difficulty: Difficulty; quality: Quality; balls: string; slowmo: string; sensitivity: number }

/** Put the last-used settings back into the menu. Only on page load, never on Play. */
function restoreSettings(): void {
  let saved: Partial<Settings> = {};
  try { saved = JSON.parse(localStorage.getItem('duoshan.settings') ?? '{}') as Partial<Settings>; } catch { /* private mode */ }
  for (const [k, v] of Object.entries(saved)) {
    const el = document.getElementById(`opt-${k}`) as HTMLSelectElement | HTMLInputElement | null;
    // Ignore saved values the menu no longer offers (e.g. a removed option).
    if (el && (!(el instanceof HTMLSelectElement) || [...el.options].some((o) => o.value === String(v)))) el.value = String(v);
  }
}

/** What the menu shows right now. */
function readSettings(): Settings {
  const get = (id: string) => ($(id) as HTMLSelectElement | HTMLInputElement);
  return {
    arena: get('opt-arena').value,
    teamSize: Number(get('opt-teamSize').value),
    difficulty: get('opt-difficulty').value as Difficulty,
    quality: get('opt-quality').value as Quality,
    balls: get('opt-balls').value,
    slowmo: get('opt-slowmo').value,
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
let hud: Hud | undefined;

async function start(): Promise<void> {
  const s = readSettings();
  try { localStorage.setItem('duoshan.settings', JSON.stringify(s)); } catch { /* ignore */ }
  running?.stop();
  unlockAudio();
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');

  const state = createGame({ seed: (Date.now() & 0xffffff) | 1, teamSize: s.teamSize, humans: [LOCAL], ballTypes: ballMix(s.balls, s.teamSize * 2), fullSlow: s.slowmo === 'full',
    arena: ARENAS.find((a) => a.id === s.arena) ?? ARENAS[0]! });
  const brains = new Map<number, BotBrain>();
  for (const p of state.players) if (p.bot) brains.set(p.id, createBrain(p, s.difficulty, state.rng.s + p.id));

  const canvas = $<HTMLCanvasElement>('game');
  const view = await GameView.create(canvas, state, LOCAL, s.quality);
  input ??= new LocalInput(canvas);
  input.sensitivity = s.sensitivity / 1000;
  input.yaw = state.players[LOCAL]!.yaw;
  hud = new Hud(LOCAL);
  const h = hud;
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
        view.stepPhysics(state.dt, state);
        h.onEvents(state, events);
        playEvents(events, LOCAL, state.timeScale);
        if (events.some((e) => e.t === 'revive' && e.player === LOCAL) || (state.phase === 'countdown' && lastPhase !== 'countdown')) {
          input!.yaw = state.players[LOCAL]!.yaw;
          input!.pitch = 0;
        }
        lastPhase = state.phase;
        acc -= DT;
      }
      simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    // Animation clocks follow game time, so slow motion slows the characters too.
    view.render(state, prev, paused ? 1 : acc / DT, dt * state.timeScale, { yaw: input!.yaw, pitch: input!.pitch });
    document.body.classList.toggle('slowmo', state.timeScale < 0.95);

    perfT -= dt;
    if (perfT <= 0) {
      perfT = 0.5;
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      const info = view.renderer.info.render;
      perfText = `${Math.round(1000 / avg)} fps · p95 ${p95.toFixed(1)} ms · sim ${simMs.toFixed(2)} ms · ${info.calls} draws · ${state.players.length} players`;
    }
    h.update(state, dt, perfText, view.thirdPerson);
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

restoreSettings();
$('play').onclick = () => void start();
$('quit').onclick = () => { running?.stop(); running = undefined; showMenu(); };
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
  // Hold Tab for the scoreboard (§4.9).
  if (e.code === 'Tab' && hud) { e.preventDefault(); hud.showScoreboard = true; }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab' && hud) hud.showScoreboard = false;
});
