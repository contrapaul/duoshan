# DuoShan — Session Handoff

*Status as of 2026-10-01. Read this first, then `PROJECT_PLAN.md` (the source of truth for design and architecture) and `CLAUDE.md` (coding guidelines).*

## 1. What this is

DuoShan is a browser-based multiplayer dodgeball game (first person, voxel characters, ragdolls). It is being built for middle and high school students at the owner's school in Shenzhen, and should also be playable worldwide. It is an unofficial project, but school leadership has approved it. Most players use M1+ MacBook Airs.

- **Repo:** `contrapaul/duoshan`. Work on branch `claude/vigilant-goodall-60nmx3`.
- **Domain:** `duoshan.contrapaul.com`, which is reachable from mainland China.
- **Hosting:** Cloudflare Workers Paid ($5/mo, already paid). No dedicated game servers.
- **Original brief:** `plans.md`. The expanded plan is `PROJECT_PLAN.md`.

## 2. Standing rules for any session

- Commit and push only to `claude/vigilant-goodall-60nmx3` (`git push -u origin claude/vigilant-goodall-60nmx3`).
- **Do not open a pull request** unless the owner asks for one.
- Never commit secrets (`TICKET_SECRET`, `RESEND_API_KEY`). Never put model identifiers in commits or code.
- Follow `CLAUDE.md`: simplest solution, surgical diffs, and verify each goal.
- Update `PROJECT_PLAN.md` whenever the owner changes the design. The owner's usual flow is to describe changes, have them added to the plan, then say "build".
- Run `npm run check` (typecheck + lint + tests) before every push.

## 3. Decisions already made (don't relitigate)

| Topic | Decision |
|---|---|
| Stack | TypeScript, Three.js (WebGL2), Vite. Rapier3D runs **client-only**, for cosmetic ragdolls, and is lazy-loaded. |
| Backend | Cloudflare Workers + Durable Objects (SQLite-backed, `locationHint: apac`) + D1, laid out like the owner's other projects (Tome of Secrets, Flashstone, make/bloodbowl). |
| Auth | Port the auth code verbatim from tomeofsecrets `worker/lib` (PBKDF2 100k, hashed sessions). Email goes through Resend. |
| Simulation | A pure, deterministic TS sim in `src/sim` that runs identically as the server referee (in the DO), in the browser, and in tests. An ESLint boundary forbids DOM, three, rapier and `Math.random` in `src/sim`, `src/bots` and `src/net`. |
| Netcode plan | The server-authoritative DO runs at 60 Hz. Clients use prediction and reconciliation. Balls are forward-predicted. Catches are defender-favoured, with up to 200 ms of rewind. Binary snapshots are ~300 B at 8v8, about 9 KB/s per client. |
| Voice chat | Scrapped. |
| Possession clock | Removed. Players can hold a ball indefinitely. Anti-stall is handled by the planned **round overtime** (Phase 3). |
| Latency rule (§13.10) | Median RTT from Shenzhen to Cloudflare decides the netcode path:<br>• ≤100 ms: proceed as planned.<br>• 100–180 ms: also build **Local Host mode** (P2P WebRTC running the same sim).<br>• >180 ms: Local Host mode becomes the default. |

## 4. Progress by phase (§15)

| Phase | Status |
|---|---|
| 0 Foundations | ✅ Done. Two checks remain, and only the owner can run them (§6). |
| 1 Offline feel prototype | ✅ Done, and well beyond the plan (two playtest rounds incorporated) |
| 2 Networked core (GameRoom DO, prediction, room codes, Quick Play, reconnect, join-in-progress) | ⬜ Not started. Gated on the latency results. |
| 3 Alpha (round overtime/shrinking court, sudden death, match clock, tutorial, art pass) | ⬜ Not started |
| 4 Accounts, chat, moderation, admin (D1 not yet created) | ⬜ Not started |
| 5 Arenas: Hypergym, Neighborhood, City Block, Ultimate | ⬜ Not started |
| 6 Lobby, shop, banners | ⬜ Not started |
| 7 Real audio, launch | ⬜ Not started |

That puts the project at roughly week 1 of a ~37-week part-time plan, and ahead on gameplay.

## 5. What the build does today (offline vs bots)

**Controls**

| Input | Action |
|---|---|
| WASD | Move |
| Shift | Sprint. The body leans forward and the head-locked camera drops. |
| C | Crouch |
| Space | Jump |
| A/D + Space | Sidestep dash |
| Slide | Triggered from a sprint |
| E | Pick up or catch. With a ball, press and hold E to raise it as a shield. |
| Left click / Q | Throw. Q exists for trackpad players. |
| Right click | Block stance: no stamina drain, no sprint, walk speed |
| Tab | Scoreboard |

**Balls** (`src/sim/tuning.ts`)

| Ball | Behaviour |
|---|---|
| Standard | Baseline ball |
| Speed | Faster throw |
| Heavy | +50% range, slow windup. Breaks shields: the hit knocks the blocker back and knocks the ball from their hands. |
| Bounce | Lime green. Stays live for 2 bounces (counts as a "bank shot"). |

Balls keep their colour on the ground and glow in their own colour while live. Blocking is physics-only: a held shield ball deflects incoming balls.

**Arenas** (`src/sim/arena.ts`)
- **Full Court** is the default: 30×18 court with basketball markings and a straight line. Its id is still `arena.offset_court` so saved settings keep working. Stepped-centerline support remains in the engine.
- **Classic Gym** is 18×9.

**Slow motion (§4.7)**
- A "Big oof" (head hit) has a 50% chance to trigger 8 s of slow motion.
- A target appears every 90 s. Hitting it gives 12 s of slow motion and +100 Dodgecoins. Dodgecoins are currency, not score.
- During slow motion the screen desaturates to 80%.
- A "Full slow motion" setup toggle slows the whole match.

**Feedback and spectating**
- Top-right knockout feed (`Player [icon] Player`, with icons for ball, Big oof, catch and line). Entries fade in and out.
- "Dodge" flashes only when a live ball near-misses the player.
- Trips show a hurt vignette and a recovery bar, with the camera locked to the head.
- Knockout: a 3 s third-person kill cam, then the player is seated in the bleachers. They can look around but not move, in first or third person.

**Rendering**
- First-person arms with posed hands.
- Voxel character rig.
- Rapier ragdolls tuned so players don't flip off walls or loop through repeated trips (realistic masses, welded hands and feet, clamped velocities, spawn clearance, trip immunity after getting up).

**Bots**
- Utility AI that produces the same `PlayerInput` as humans: ballistic aim, reaction delay, dash dodges, wall avoidance.
- Menu team sizes: 3v3, 5v5 (the default), and an 8v8 stress test.

**Menu settings**
- Arena, team size, difficulty, quality, ball mix (mixed/standard/chaos/bounce), slow motion, sensitivity.
- Settings are saved, and restored only on page load.

**Known gaps**
- Practice runs on the main thread, not in a Web Worker.
- No match clock or overtime, so rounds can stall.
- Sounds are synthesized placeholders.

## 6. Waiting on the owner (blocks Phase 2)

1. **Deploy:** `git pull origin claude/vigilant-goodall-60nmx3 && npm run deploy`.
2. **Spike S2, latency:** run the Full test at `https://duoshan.contrapaul.com/latency.html` from school and from home in Shenzhen, then paste the copied results. Apply the §13.10 rule.
3. **Spike S1, fps:** check frame rate on an M1 Air using the menu's "8v8 stress test" match.

**While waiting:** work that doesn't depend on latency is safe to do. Candidates are round overtime, the tutorial, and more arenas. Ask the owner which one first.

## 7. Code map

| Path | Purpose |
|---|---|
| `src/sim/game.ts` | `createGame`, `resetRound`, and `step()`, which handles movement, dash, trips, centre line, actions (pickup, catch, shield, aim, throw), ball physics, catches, shield collisions, target, near-miss/dodge, knockouts and scoring, revive, and round/match end |
| `src/sim/types.ts` | `PlayerInput`, `Player`, `Ball`, the `SimEvent` union, and `GameState` (`dt = DT × timeScale` for slow motion) |
| `src/sim/tuning.ts` | All tunable numbers: PLAYER, HANDLING, BALLS, RULES, SCORE, SLOWMO |
| `src/sim/arena.ts` | Arena defs, `centerlineX`, `pushClear`, `spectatorSeats`, `ARENAS` |
| `src/bots/bot.ts` | Bot brains; `aimAt` (ballistic aim) is exported |
| `src/net/snapshot.ts`, `probe.ts` | Binary snapshot codec and the latency-probe protocol |
| `src/render/` | `scene.ts` (court, lights), `character.ts` (rig, poses, first-person arms), `ragdoll.ts` (Rapier), `view.ts` (GameView: balls, glow, trails, cameras, kill cam, bleachers) |
| `src/app/` | `main.ts` (menu, settings, fixed-step loop), `input.ts`, `hud.ts` (feed, scoreboard, flashes), `audio.ts`, `latency.ts` (latency page), `style.css` |
| `worker/index.ts` | Routes `/api/ping` and `/rt/probe` (a new `ProbeRoom` DO per test); serves assets for everything else |
| `worker/ProbeRoom.ts` | Runs the real sim with 16 bots at 60 Hz, sends snapshots at 30 Hz, stops after 90 s. This is the only DO so far. |
| `tools/bench.ts` | Referee benchmark (`npm run bench`). 8v8 costs about 0.075 ms per tick. |
| `wrangler.jsonc` | Worker config: assets `./dist`, `run_worker_first` for `/api/*` and `/rt/*`, DO `PROBE`, custom domain |

## 8. Commands and verification

```
npm run dev        # Vite client
npm run dev:api    # wrangler dev --port 8788 --local (Vite proxies /api and /rt to it)
npm run check      # typecheck + lint + vitest (42 tests passing)
npm run build      # multi-page build: index.html, latency.html
npm run bench      # referee benchmark
npm run deploy     # build + wrangler deploy (owner runs this)
```

**Visual checks:**
- Use Playwright with the preinstalled Chromium (`/opt/pw-browsers`) and swiftshader.
- Mock pointer lock with `addInitScript`.
- Wait for the game to load with `waitForFunction` before driving input.
- Every feature so far has been checked with screenshots this way.

CI (`.github/workflows/check.yml`) runs the same checks.

## 9. Recent history

```
3d260db Remove the possession clock: players can hold a ball indefinitely
76bffe1 Straight line on Full Court, E-hold shield, Q throw, sprint lean, trip head-cam
cb6df95 Add bounce ball, Full Court default arena, and bleacher spectating
44363da Fix menu ignoring new choices: restore saved settings only on page load
b09f082 Fix wall flipping and trip loops; enlarge Offset Court
```

Playtest feedback logs are in `PROJECT_PLAN.md` §4.8 and §4.9. Open and answered owner questions are in §17.
