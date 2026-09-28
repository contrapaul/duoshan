/**
 * Phase 0 latency test page (PROJECT_PLAN.md §13.10). Opens a WebSocket to a
 * fresh ProbeRoom Durable Object, pings it 10×/s, sends input-sized packets at
 * 30 Hz, receives real 30 Hz snapshots, and applies the plan's decision rule.
 */
import { PROBE_MAX_SECONDS, type ProbeServerMsg } from '../net/probe';
import { encodeProbeInput } from '../net/snapshot';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface RunResult {
  hint: string;
  edgeColo: string;
  country: string;
  doColo: string;
  httpRtt: number[];
  rtt: number[];
  sent: number;
  lost: number;
  snapGaps: number[];
  snapBytes: number;
  upBytes: number;
  seconds: number;
  doTicks: number[];
  doMaxGap: number[];
  error?: string;
}

const pct = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]!;
};
const maxOf = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const jitter = (xs: number[]) => (xs.length < 2 ? NaN : mean(xs.slice(1).map((x, i) => Math.abs(x - xs[i]!))));
const f0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toString() : '–');

async function httpPings(n: number): Promise<{ rtts: number[]; colo: string; country: string }> {
  const rtts: number[] = [];
  let colo = '?';
  let country = '?';
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/ping?i=${i}&r=${Math.random()}`, { cache: 'no-store' });
      const j = (await r.json()) as { colo: string; country: string };
      rtts.push(performance.now() - t0);
      colo = j.colo;
      country = j.country;
    } catch { /* counted as missing */ }
  }
  return { rtts: rtts.slice(1), colo, country }; // first request includes TLS/DNS warm-up
}

function runProbe(hint: string, seconds: number, onUpdate: (r: RunResult) => void): Promise<RunResult> {
  return new Promise((resolve) => {
    const r: RunResult = {
      hint, edgeColo: '?', country: '?', doColo: '?', httpRtt: [], rtt: [], sent: 0, lost: 0,
      snapGaps: [], snapBytes: 0, upBytes: 0, seconds: 0, doTicks: [], doMaxGap: [],
    };
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/rt/probe?hint=${hint}`);
    ws.binaryType = 'arraybuffer';
    const pending = new Map<number, number>();
    let id = 0;
    let seq = 0;
    let lastSnap = 0;
    let t0 = 0;
    const timers: ReturnType<typeof setInterval>[] = [];
    const finish = (error?: string) => {
      for (const t of timers) clearInterval(t);
      // Pings still unanswered 1 s after sending count as lost.
      const now = performance.now();
      for (const [, sentAt] of pending) if (now - sentAt > 1000) r.lost++;
      if (error) r.error = error;
      r.seconds = (performance.now() - t0) / 1000;
      try { ws.close(); } catch { /* already closed */ }
      resolve(r);
    };
    ws.onopen = () => {
      t0 = performance.now();
      timers.push(setInterval(() => {
        const now = performance.now();
        for (const [k, sentAt] of pending) if (now - sentAt > 1000) { pending.delete(k); r.lost++; }
        pending.set(id, now);
        ws.send(JSON.stringify({ t: 'ping', id: id++, c: now }));
        r.sent++;
      }, 100));
      timers.push(setInterval(() => {
        const buf = encodeProbeInput(seq++);
        ws.send(buf);
        r.upBytes += buf.byteLength;
      }, 1000 / 30));
      timers.push(setInterval(() => {
        onUpdate(r);
        if ((performance.now() - t0) / 1000 >= seconds) finish();
      }, 250));
    };
    ws.onmessage = (ev) => {
      const now = performance.now();
      if (typeof ev.data !== 'string') {
        if (lastSnap) r.snapGaps.push(now - lastSnap);
        lastSnap = now;
        r.snapBytes += (ev.data as ArrayBuffer).byteLength;
        return;
      }
      const m = JSON.parse(ev.data) as ProbeServerMsg;
      if (m.t === 'pong') {
        const sentAt = pending.get(m.id);
        if (sentAt !== undefined) { pending.delete(m.id); r.rtt.push(now - sentAt); }
      } else if (m.t === 'hello') { r.edgeColo = m.edgeColo; r.country = m.country; }
      else if (m.t === 'where') r.doColo = m.doColo;
      else if (m.t === 'stats') { r.doTicks.push(m.ticks); r.doMaxGap.push(m.maxGapMs); }
    };
    ws.onerror = () => finish('WebSocket error (blocked, or the Worker is not deployed)');
    ws.onclose = () => { if (r.seconds === 0) finish(); };
  });
}

type Verdict = { level: 'good' | 'warn' | 'bad'; text: string };

function verdictFor(r: RunResult): Verdict {
  const med = pct(r.rtt, 0.5);
  const jit = jitter(r.rtt);
  const loss = r.sent ? r.lost / r.sent : 1;
  if (r.error || !r.rtt.length) return { level: 'bad', text: `No connection: ${r.error ?? 'no replies'}.` };
  // Unstable: spiky or lossy, which hurts a real-time game more than a steady high ping.
  const unstable = jit > 30 || loss > 0.02 || pct(r.rtt, 0.95) - med > 60;
  if (med <= 100 && !unstable) return { level: 'good', text: `Median ${f0(med)} ms and steady. <b>Proceed as designed</b> (plan §13.10, row 1).` };
  if (med <= 180 && !unstable) return { level: 'warn', text: `Median ${f0(med)} ms. <b>Playable with the planned netcode</b>; also build Local Host mode for in-school games (plan §13.10, row 2).` };
  return { level: 'bad', text: `Median ${f0(med)} ms, jitter ${f0(jit)} ms, loss ${(loss * 100).toFixed(1)}%. <b>Make Local Host mode the default for school play</b> (plan §13.10, row 3).` };
}

function stat(k: string, v: string): string {
  return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function render(r: RunResult): void {
  $('where').innerHTML = `You → Cloudflare edge <b>${r.edgeColo}</b> (${r.country}) → game room in <b>${r.doColo}</b> · location hint <b>${r.hint}</b>`;
  const elapsed = Math.max(0.001, r.seconds || r.snapGaps.length / 30);
  $('stats').innerHTML = [
    stat('Round trip (median)', `${f0(pct(r.rtt, 0.5))} ms`),
    stat('Round trip (95th %)', `${f0(pct(r.rtt, 0.95))} ms`),
    stat('Round trip (worst)', `${f0(maxOf(r.rtt))} ms`),
    stat('Jitter', `${f0(jitter(r.rtt))} ms`),
    stat('Lost pings', `${r.sent ? ((r.lost / r.sent) * 100).toFixed(1) : '0'}%`),
    stat('Game updates received', `${(r.snapGaps.length / elapsed).toFixed(0)}/s`),
    stat('Update gap (95th %)', `${f0(pct(r.snapGaps, 0.95))} ms`),
    stat('Download', `${(r.snapBytes / elapsed / 1024).toFixed(1)} KB/s`),
    stat('Upload', `${(r.upBytes / elapsed / 1024).toFixed(1)} KB/s`),
    stat('Room ticks (target 60/s)', `${f0(mean(r.doTicks))}/s`),
    stat('Room timer worst gap', `${f0(maxOf(r.doMaxGap))} ms`),
    stat('HTTP to edge (median)', `${f0(pct(r.httpRtt, 0.5))} ms`),
  ].join('');
  drawChart(r.rtt);
  const v = verdictFor(r);
  const el = $('verdict');
  el.className = v.level;
  el.innerHTML = v.text;
}

function drawChart(rtts: number[]): void {
  const c = $<HTMLCanvasElement>('chart');
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const max = Math.max(200, ...rtts.slice(-300));
  g.strokeStyle = '#2c3444';
  g.fillStyle = '#9aa4b5';
  g.font = '12px sans-serif';
  for (const y of [50, 100, 150, 200].filter((v) => v <= max)) {
    const py = c.height - (y / max) * c.height;
    g.beginPath(); g.moveTo(0, py); g.lineTo(c.width, py); g.stroke();
    g.fillText(`${y} ms`, 4, py - 2);
  }
  const pts = rtts.slice(-300);
  g.strokeStyle = '#ffdd33';
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach((v, i) => {
    const x = (i / Math.max(1, pts.length - 1)) * c.width;
    const y = c.height - (v / max) * c.height;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke();
}

function reportLine(r: RunResult): string {
  const v = verdictFor(r).text.replace(/<[^>]+>/g, '');
  return [
    `Location hint: ${r.hint} | edge ${r.edgeColo} (${r.country}) → room ${r.doColo}`,
    `  RTT median ${f0(pct(r.rtt, 0.5))} ms, p95 ${f0(pct(r.rtt, 0.95))} ms, max ${f0(maxOf(r.rtt))} ms, jitter ${f0(jitter(r.rtt))} ms, loss ${r.sent ? ((r.lost / r.sent) * 100).toFixed(1) : '0'}% (${r.rtt.length} pings)`,
    `  Updates ${(r.snapGaps.length / Math.max(1, r.seconds)).toFixed(1)}/s, gap p95 ${f0(pct(r.snapGaps, 0.95))} ms, down ${(r.snapBytes / Math.max(1, r.seconds) / 1024).toFixed(1)} KB/s, up ${(r.upBytes / Math.max(1, r.seconds) / 1024).toFixed(1)} KB/s`,
    `  Room ticks ${f0(mean(r.doTicks))}/s, worst timer gap ${f0(maxOf(r.doMaxGap))} ms | HTTP edge median ${f0(pct(r.httpRtt, 0.5))} ms`,
    `  Verdict: ${v}${r.error ? ` | error: ${r.error}` : ''}`,
  ].join('\n');
}

async function runSeries(hints: string[], seconds: number): Promise<void> {
  const buttons = [$<HTMLButtonElement>('run'), $<HTMLButtonElement>('runAll')];
  buttons.forEach((b) => (b.disabled = true));
  $('live').classList.remove('hidden');
  $('results').classList.add('hidden');
  const results: RunResult[] = [];
  for (const hint of hints) {
    $('verdict').className = '';
    $('verdict').textContent = `Testing ${hint}… measuring HTTP to the nearest edge first.`;
    const http = await httpPings(8);
    const r = await runProbe(hint, Math.min(seconds, PROBE_MAX_SECONDS - 5), (live) => { live.httpRtt = http.rtts; render(live); });
    r.httpRtt = http.rtts;
    render(r);
    results.push(r);
  }
  const header = `DuoShan network test · ${new Date().toString()}\n${navigator.userAgent}\n`;
  $('report').textContent = `${header}\n${results.map(reportLine).join('\n\n')}`;
  $('results').classList.remove('hidden');
  buttons.forEach((b) => (b.disabled = false));
}

$('run').onclick = () => void runSeries([$<HTMLSelectElement>('hint').value], Number($<HTMLSelectElement>('duration').value));
$('runAll').onclick = () => void runSeries(['apac', 'auto', 'wnam'], 30);
$('copy').onclick = async () => {
  await navigator.clipboard.writeText($('report').textContent ?? '');
  $('copied').textContent = 'Copied. Paste it into the chat.';
};
