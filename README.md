# DuoShan 躲闪: Elite Dodgeball

A browser-based, physics-driven team dodgeball game. The design and roadmap are in
[`PROJECT_PLAN.md`](PROJECT_PLAN.md); the original brief is [`plans.md`](plans.md).

**Status: Phase 0 tech demo.** It has two parts:

- **`/`**: offline practice in a greybox Classic Gym against bots. Movement, pickup, throw
  (quick and aimed), catch, block, the three ball types, the centerline, rounds, revive-on-catch,
  Rapier ragdolls, first/third person, and an 8v8 stress option with an fps readout.
- **`/latency.html`**: the network test for Shenzhen. It connects to a real Cloudflare Durable Object running the
  actual game referee with 16 bots and reports round-trip time, jitter, loss, bandwidth and room tick steadiness.
  It then applies the decision rule in `PROJECT_PLAN.md` §13.10.

## Run it locally

```sh
npm install
npm run dev          # the game at http://localhost:5175 (offline practice works without the Worker)
npm run dev:api      # in a second terminal: the Worker + Durable Object for /latency.html
```

Or run everything as it will be deployed: `npx vite build && npm run dev:api`, then open http://localhost:8788.

## Deploy to duoshan.contrapaul.com

This uses the same Cloudflare account as Tome of Secrets. The custom-domain route creates the DNS record.

```sh
npx wrangler login   # once, if not already logged in on this machine
npm run deploy       # typecheck, build, wrangler deploy (Worker + static assets + Durable Object)
```

Then open https://duoshan.contrapaul.com/latency.html from school and from home, click **Full test**, and
paste the copied results into the chat.

## Checks

```sh
npm run check        # typecheck (app + worker), lint (including the sim purity boundary), tests
npm run bench        # referee CPU per tick with 16 bots (default 8v8, 120 s of game time)
npm run bench -- 3 60
```

## Layout

| Path | What |
|---|---|
| `src/sim/` | The referee. Pure TypeScript, deterministic, no DOM, Three.js or Rapier (enforced by lint). Runs in the browser and in the Durable Object. |
| `src/bots/` | Bot AI. Produces the same inputs a human does. |
| `src/net/` | Binary snapshot codec and the probe protocol. |
| `src/render/` | Three.js scene, voxel characters, cosmetic Rapier ragdolls. |
| `src/app/` | Demo entry, input, HUD, placeholder audio, the latency page. |
| `worker/` | Cloudflare Worker (`/api/ping`, `/rt/probe`) and the `ProbeRoom` Durable Object. |
| `tools/bench.ts` | Referee benchmark. |
