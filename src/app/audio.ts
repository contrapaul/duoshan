/**
 * Placeholder synthesised sound effects (PROJECT_PLAN.md §11.4: placeholders
 * first; the owner's gym recordings replace these before launch).
 */
import type { SimEvent } from '../sim/types';

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noise: AudioBuffer | undefined;

export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  void ctx.resume();
}

function toneRaw(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

function hissRaw(dur: number, vol: number, freq: number): void {
  if (!ctx || !master || !noise) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur);
}

/** In slow motion, sounds drop in pitch and stretch out (§4.7). */
export function playEvents(events: SimEvent[], local: number, timeScale = 1): void {
  const pitch = Math.sqrt(timeScale);
  const tone = (f: number, d: number, v: number, type?: OscillatorType, slide?: number) => toneRaw(f * pitch, d / pitch, v, type, slide);
  const hiss = (d: number, v: number, f: number) => hissRaw(d / pitch, v, f * pitch);
  for (const e of events) {
    switch (e.t) {
      case 'throw': hiss(0.18, e.player === local ? 0.5 : 0.25, 900); break;
      case 'bounce': if (e.speed > 2) tone(e.surface === 'floor' ? 140 : 220, 0.08, Math.min(0.4, e.speed / 40), 'triangle', 0.6); break;
      case 'ko': tone(90, 0.25, 0.5, 'square', 0.5); tone(600, 0.35, 0.25, 'sine', 0.3); break;
      case 'catch': hiss(0.06, 0.8, 2500); tone(880, 0.15, 0.2, 'sine', 1.5); break;
      case 'block': tone(e.broke ? 140 : 300, e.broke ? 0.25 : 0.1, 0.4, 'square', 0.8); break;
      case 'dash': hiss(0.12, 0.25, 1400); break;
      case 'slowmo': toneRaw(400, 1.2, 0.3, 'sine', 0.25); hissRaw(0.8, 0.3, 300); break;
      case 'target_spawn': tone(1320, 0.3, 0.2); setTimeout(() => tone(1760, 0.4, 0.2), 150); break;
      case 'target_hit': tone(880, 0.2, 0.3, 'triangle'); setTimeout(() => tone(1320, 0.5, 0.3, 'triangle'), 120); break;
      case 'trip': tone(200, 0.3, 0.3, 'sawtooth', 0.4); break;
      case 'round_start': tone(2100, 0.5, 0.15, 'sine'); break;
      case 'round_end': tone(520, 0.2, 0.2); setTimeout(() => tone(780, 0.35, 0.2), 180); break;
      default: break;
    }
  }
}
