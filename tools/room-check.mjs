/**
 * Slice 2a end-to-end check against a running `npm run dev:api` (wrangler dev).
 *
 *   node tools/room-check.mjs [base]   (base defaults to http://127.0.0.1:8788)
 *
 * 1. POST /api/rooms          → room code
 * 2. GET  /api/rooms/CODE     → status row
 * 3. two WebSocket players join /rt/room?code=CODE, say hello
 *    → each must get a welcome (distinct slots, teams balanced)
 * 4. each sends input packets at 30 Hz; both must receive binary snapshots
 *    and JSON events, with ticks advancing
 * 5. player 2 leaves → player 1 must see a `left` broadcast
 *
 * Exits 0 on success, 1 on any failure.
 */
const base = process.argv[2] ?? 'http://127.0.0.1:8788';
const failures = [];
const ok = (cond, what) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}`);
  if (!cond) failures.push(what);
};
const deadline = (ms) => new Promise((res) => setTimeout(res, ms));

// 1. create a room
const created = await fetch(`${base}/api/rooms`, {
  method: 'POST',
  body: JSON.stringify({ teamSize: 3 }),
}).then((r) => r.json());
ok(typeof created.code === 'string' && /^[A-HJ-NP-Z2-9]{5}$/.test(created.code), `create room → ${created.code}`);
ok(created.url?.includes(`/${created.code}`), `share url ${created.url}`);
const code = created.code;

// 2. status
const status = await fetch(`${base}/api/rooms/${code}`).then((r) => r.json());
ok(status.code === code && status.team_size === 3 && status.seats === 6, `room status ${JSON.stringify(status)}`);

// 3. two players
function play(name) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/rt/room?code=${code}`);
  const state = { welcome: null, snaps: 0, firstTick: null, lastTick: null, events: [], joined: 0, left: -1, closed: false, err: null };
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'welcome') state.welcome = msg;
      if (msg.t === 'joined') state.joined++;
      if (msg.t === 'left') state.left = msg.playerId;
      if (msg.t === 'events') state.events.push(...msg.e);
      if (msg.t === 'full') { state.welcome = null; }
    } else {
      const v = new DataView(ev.data);
      state.snaps++;
      const tick = v.getUint32(1);
      if (state.firstTick === null) state.firstTick = tick;
      state.lastTick = tick;
    }
  };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
  ws.onerror = (e) => { state.err = String(e); };
  ws.onclose = () => { state.closed = true; };
  return { ws, state };
}

const p1 = play('Ada');
const p2 = play('Grace');
await deadline(2500);
ok(p1.state.welcome?.code === code, `player 1 welcome (slot ${p1.state.welcome?.playerId})`);
ok(p2.state.welcome?.code === code, `player 2 welcome (slot ${p2.state.welcome?.playerId})`);
if (p1.state.welcome && p2.state.welcome) {
  ok(p1.state.welcome.playerId !== p2.state.welcome.playerId, 'slots are distinct');
  const teams = [p1.state.welcome.players, p2.state.welcome.players];
  const me1 = teams[0].find((p) => p.id === p1.state.welcome.playerId);
  const me2 = teams[1].find((p) => p.id === p2.state.welcome.playerId);
  ok(me1 && me2 && me1.team !== me2.team, `teams balanced (${me1?.team} vs ${me2?.team})`);
  ok(teams[0].every((p) => p.name && p.name.length >= 2) && teams[0].length === 6, 'roster has 6 named players');
}

// 4. inputs at 30 Hz for 4 seconds, watch snapshots and ticks advance
const t0 = Date.now();
const sendInput = () => {
  for (const p of [p1, p2]) {
    if (!p.ws.readyState || p.ws.readyState !== 1) continue;
    // 12-byte packet: type=2, seq, move, yaw, pitch, flags — run forward and sprint
    const buf = new ArrayBuffer(12);
    const v = new DataView(buf);
    v.setUint8(0, 2);
    v.setUint32(1, Math.floor((Date.now() - t0) / 33));
    v.setInt8(5, 0);
    v.setInt8(6, 127);
    v.setUint16(7, 16384);
    v.setInt16(9, 0);
    v.setUint8(11, 1);
    p.ws.send(buf);
  }
};
setInterval(sendInput, 33);
await deadline(4000);
for (const [i, p] of [p1, p2].entries()) {
  ok(p.state.snaps > 50, `player ${i + 1}: ${p.state.snaps} snapshots in ~4s (want >50)`);
  ok(p.state.lastTick !== null && p.state.lastTick > p.state.firstTick, `player ${i + 1}: ticks advanced ${p.state.firstTick}→${p.state.lastTick}`);
  ok(p.state.joined >= 1, `player ${i + 1}: saw ${p.state.joined} join broadcast(s)`);
}
ok(p1.state.events.length > 0 || p2.state.events.length > 0, `events flowed (${p1.state.events.length + p2.state.events.length} events)`);

// 5. player 2 leaves, player 1 sees it
p2.ws.close();
for (let i = 0; i < 20 && p1.state.left !== p2.state.welcome?.playerId; i++) await deadline(250);
ok(p1.state.left === p2.state.welcome?.playerId, `player 1 saw player 2 leave (id ${p1.state.left})`);

p1.ws.close();
const status2 = await deadline(6000).then(() => fetch(`${base}/api/rooms/${code}`).then((r) => r.json()));
ok(status2.players === 0, `directory updated: 0 players after all left (${JSON.stringify(status2)})`);

console.log(failures.length === 0 ? '\nROOM CHECK: OK' : `\nROOM CHECK: ${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
