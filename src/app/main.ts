/**
 * Tech demo entry: offline Practice in the greybox Classic Gym vs bots
 * (PROJECT_PLAN.md Phase 0/1). The referee (`src/sim`) runs locally here at a
 * fixed 60 Hz; the same code runs in the Durable Object for online play.
 */
import { botInputs, createBrain, type BotBrain, type Difficulty } from '../bots/bot';
import { ARENAS, CLASSIC_GYM } from '../sim/arena';
import { createGame, defaultBallTypes, step } from '../sim/game';
import { DT } from '../sim/tuning';
import type { BallType } from '../sim/tuning';
import type { GameState, PlayerInput } from '../sim/types';
import { GameView, snapPositions, type Snap } from '../render/view';
import type { Quality } from '../render/scene';
import { applySnapshot } from '../net/snapshot';
import { playEvents, unlockAudio } from './audio';
import { Hud } from './hud';
import { LocalInput } from './input';
import { OnlineSession, type WelcomeMsg } from './online';

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
  if (mix === 'bounce') return Array<BallType>(n).fill('bounce');
  if (mix === 'chaos') return Array.from({ length: n }, (_, i): BallType => (i % 2 ? 'heavy' : 'speed'));
  return defaultBallTypes(players);
}

let running: { stop: () => void } | undefined;
let input: LocalInput | undefined;
let hud: Hud | undefined;
let session: OnlineSession | undefined;

const ROOM_RE = /^[A-HJ-NP-Z2-9]{5}$/;

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

  $('pause-title').textContent = 'Paused';
  $('room-share').classList.add('hidden');
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
        // Knocked out: once the kill camera ends you're in the bleachers, so face the court.
        if (events.some((e) => e.t === 'ko' && e.player === LOCAL)) {
          input!.yaw = view.seatYaw(state, LOCAL);
          input!.pitch = -0.3;
        }
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

/**
 * Online (Phase 2b): create or join a room, then hand the WebSocket to the
 * frame loop. The referee's snapshots are truth; the local state is only a
 * container they are applied into.
 */
async function startOnline(mode: 'create' | 'join'): Promise<void> {
  const s = readSettings();
  try { localStorage.setItem('duoshan.settings', JSON.stringify(s)); } catch { /* ignore */ }
  const status = (text: string) => { $('online-status').textContent = text; };
  let code = mode === 'join' ? $<HTMLInputElement>('join-code').value.trim().toUpperCase() : '';
  if (mode === 'join' && !ROOM_RE.test(code)) { status('Room codes are 5 letters/digits (no O, I, 1, 0).'); return; }

  running?.stop();
  session?.close();
  unlockAudio();
  $('menu').classList.add('hidden');
  $('loading').classList.remove('hidden');

  let roomUrl = '';
  if (mode === 'create') {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teamSize: s.teamSize }) });
    const data = await res.json().catch(() => ({})) as { code?: string; url?: string; error?: string };
    if (!res.ok || !data.code || !data.url) { showMenu(); status(`Could not create a room (${data.error ?? res.status}).`); return; }
    code = data.code;
    roomUrl = data.url;
  } else {
    const res = await fetch(`/api/rooms/${code}`);
    if (!res.ok) { showMenu(); status(`No such room (${code}). It may have expired.`); return; }
    roomUrl = `${location.origin}/r/${code}`;
  }

  // Local match state, filled in once welcome + view are ready.
  let state: GameState | undefined;
  let view: GameView | undefined;
  let h: Hud | undefined;
  let myId = -1;
  let prev: Snap | undefined;
  let lastSnapAt = performance.now();
  let lastPhase = '';
  let raf = 0;
  let last = performance.now();

  const fail = (msg: string) => {
    session?.close();
    showMenu();
    status(msg);
  };
  const welcomeTimer = setTimeout(() => { if (!state) fail('Connection timed out.'); }, 10000);

  session = new OnlineSession(code, $<HTMLInputElement>('opt-name').value.trim(), {
    onWelcome: (w: WelcomeMsg) => {
      myId = w.playerId;
      const st = createGame({ seed: w.seed, teamSize: w.teamSize, humans: [myId], arena: CLASSIC_GYM });
      for (const rp of w.players) {
        const p = st.players[rp.id];
        if (p) { p.name = rp.name; p.bot = rp.bot; }
      }
      state = st;
      void (async () => {
        const canvas = $<HTMLCanvasElement>('game');
        const v = await GameView.create(canvas, st, myId, s.quality);
        if (session?.closed || !state) return; // left while loading
        view = v;
        clearTimeout(welcomeTimer);
        input ??= new LocalInput(canvas);
        input.sensitivity = s.sensitivity / 1000;
        input.yaw = st.players[myId]!.yaw;
        h = new Hud(myId);
        hud = h;
        $('pause-title').textContent = 'The match continues while you are away';
        $('room-share').innerHTML = `Room <b>${code}</b> · share <a href="${roomUrl}">${roomUrl}</a>`;
        $('room-share').classList.remove('hidden');
        prev = snapPositions(st);
        lastSnapAt = performance.now();
        $('loading').classList.add('hidden');
        $('hud').classList.remove('hidden');
        const onResize = () => v.resize(window.innerWidth, window.innerHeight);
        onResize();
        window.addEventListener('resize', onResize);
        input.onToggleView = () => { v.thirdPerson = !v.thirdPerson; };
        input.onPauseChange = (p) => $('pause').classList.toggle('hidden', !p);
        canvas.onclick = () => { if (!input?.locked) input?.lock(); };
        $('resume').onclick = () => input?.lock();
        input.lock();
        session?.begin(() => input!.sample());

        const frame = (now: number) => {
          raf = requestAnimationFrame(frame);
          if (!state || !view) return;
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          // Cosmetic physics (ragdolls, trails) run locally; the referee owns game time.
          view.stepPhysics(dt * state.timeScale, state);
          state.time += dt * state.timeScale;
          const alpha = Math.min(1, (now - lastSnapAt) / (1000 / 30));
          view.render(state, prev ?? snapPositions(state), alpha, dt * state.timeScale, { yaw: input!.yaw, pitch: input!.pitch });
          document.body.classList.toggle('slowmo', state.timeScale < 0.95);
          h!.update(state, dt, 'online', view.thirdPerson);
          if (state.phase !== lastPhase) { lastPhase = state.phase; }
        };
        raf = requestAnimationFrame(frame);
        running = { stop: () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); v.renderer.dispose(); } };
      })().catch(() => fail('Could not start the game view.'));
    },
    onSnapshot: (snap) => {
      if (!state) return; // first frames before the view is up
      prev = snapPositions(state);
      applySnapshot(state, snap);
      lastSnapAt = performance.now();
    },
    onEvents: (events) => {
      if (!state || !view || !h) return;
      view.onEvents(state, events);
      h.onEvents(state, events);
      playEvents(events, myId, state.timeScale);
      if (events.some((e) => e.t === 'ko' && e.player === myId)) {
        input!.yaw = view.seatYaw(state, myId);
        input!.pitch = -0.3;
      }
      if (events.some((e) => e.t === 'revive' && e.player === myId) || (state.phase === 'countdown' && lastPhase !== 'countdown')) {
        input!.yaw = state.players[myId]!.yaw;
        input!.pitch = 0;
      }
      lastPhase = state.phase;
    },
    onRoster: (msg) => {
      if (!state) return;
      if (msg.t === 'joined') {
        const p = state.players[msg.player.id];
        if (p) { p.name = msg.player.name; p.bot = msg.player.bot; }
      } else {
        const p = state.players[msg.playerId];
        if (p) p.bot = true;
      }
    },
    onFull: () => fail('That room is full.'),
    onClosed: (reason) => {
      if (!state) { clearTimeout(welcomeTimer); fail(reason || 'Disconnected before the match started.'); }
      else { showMenu(); status(reason || 'Disconnected.'); }
    },
  });
  session.connect();
}

function showMenu(): void {
  document.exitPointerLock();
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
}

restoreSettings();
$('play').onclick = () => void start();
$('online-create').onclick = () => void startOnline('create');
$('online-join').onclick = () => void startOnline('join');
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') void startOnline('join'); });
$('quit').onclick = () => { running?.stop(); running = undefined; session?.close(); session = undefined; showMenu(); };
// Share link: /r/CODE opens the menu with the code ready to join.
const shareMatch = /^\/r\/([A-HJ-NP-Z2-9]{5})/.exec(location.pathname);
if (shareMatch) {
  $<HTMLInputElement>('join-code').value = shareMatch[1]!;
  history.replaceState(null, '', '/');
  void startOnline('join');
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
  // Hold Tab for the scoreboard (§4.9).
  if (e.code === 'Tab' && hud) { e.preventDefault(); hud.showScoreboard = true; }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab' && hud) hud.showScoreboard = false;
});
