# Duǒshǎn 躲闪 — Elite Dodgeball
## Detailed Project Plan

> **Status:** Draft v0.2, 2026-09-26. Built from `plans.md`.
> **v0.2 changes (owner answers):**
> - The architecture is now serverless Cloudflare (Workers, D1, Durable Objects), matching the owner's other projects. There are no dedicated game servers.
> - Auth is ported from Tome of Secrets.
> - The primary hardware is the MacBook Air M1+.
> - The school is in Shenzhen, and players are worldwide.
> - School IT is out of scope, and the owner has obtained leadership approval.
> - Answered questions are recorded in §17.
> Where `plans.md` leaves something open, this plan proposes a default and marks it with **[DECISION]**. Every **[DECISION]** is also listed in [§17 Open Questions](#17-open-questions-for-the-project-owner) so the owner can confirm or change it. Numbers in the tuning tables are starting points for playtesting, not final values.

---

## Table of Contents

1. [Summary](#1-summary)
2. [Design Pillars](#2-design-pillars)
3. [Target Players, Hardware, and Networks](#3-target-players-hardware-and-networks)
4. [Core Gameplay Specification](#4-core-gameplay-specification)
5. [Game Modes and Rules](#5-game-modes-and-rules)
6. [Scoring, Dodgecoins, and Progression](#6-scoring-dodgecoins-and-progression)
7. [Arenas](#7-arenas)
8. [Bots and Practice Mode](#8-bots-and-practice-mode)
9. [Multiplayer, Lobbies, and Social](#9-multiplayer-lobbies-and-social)
10. [Accounts, Safety, and Moderation](#10-accounts-safety-and-moderation)
11. [Art, Characters, and Audio](#11-art-characters-and-audio)
12. [School Messages and Banner System](#12-school-messages-and-banner-system)
13. [Technical Architecture](#13-technical-architecture)
14. [Live Operations and Content Updates](#14-live-operations-and-content-updates)
15. [Milestones and Timeline](#15-milestones-and-timeline)
16. [Risk Register](#16-risk-register)
17. [Open Questions for the Project Owner](#17-open-questions-for-the-project-owner)
18. [Appendices](#18-appendices)

---

## 1. Summary

Duǒshǎn is a browser-based, physics-driven, team dodgeball game that plays like a skill-based arena shooter. It uses dodgeballs instead of guns. Players sprint, slide, jump, duck, catch, block, and throw across a centerline they cannot cross. Characters ragdoll, which gives the game both its comedy and its skill ceiling.

**What we are building:**

| Area | Commitment |
|---|---|
| Platform | Desktop web browser (Safari/Chrome/Edge/Firefox), keyboard + mouse (trackpad playable). MacBook Air M1+ is the primary target. |
| Access | Instant play as a guest. Optional account for chat, voice, skins, and Dodgecoins. |
| Modes | Classic (3rd/1st person toggle), Classic FPV (1st person locked), Ultimate (free-for-all). Practice (offline vs bots). |
| Players | Classic up to 8v8. Ultimate up to 8. Bots fill a match up to 6 players. |
| Balls | Standard (red), Speed (orange), Heavy (blue). New balls can be added later. |
| Arenas | Classic Gym, Hypergym, Neighborhood, City Block (Ultimate). |
| Social | Room codes and share URLs, walk-around pre-match lobby, text chat, proximity voice (accounts only). |
| Safety | Word filter ("NOPE"), incident logging, admin dashboard for renames, warnings, and bans. |
| Ops | Ad-free. A banner framework carries school messages. Content (arenas, skins, balls) is added without touching account data. |
| Reach | Worldwide, with the school in **Shenzhen**, so it must play well from mainland China. English only. |
| Infrastructure | **Serverless Cloudflare**, like the owner's other projects: Workers + static assets, D1, Durable Objects as match referees. No dedicated servers to run. |

**Success:** students choose it over ad-riddled web games, and adults enjoy it too. §15.4 lists measurable proxies.

---

## 2. Design Pillars

Use these to settle design arguments. If a feature doesn't serve at least one pillar, cut it.

1. **Skill over spam.** Timing, movement, and reads beat clicking fast. Wind-ups, catch windows, and limited sprint reward commitment and punish panic. (The model is Mordhau/Chivalry, not Call of Duty.)
2. **Physics is the comedy.** Ragdolls, trips, faceplants, and flying inflatables should produce stories students retell at lunch. The comedy must never make outcomes feel random: *knockouts* are rules-based and readable, while *falls* are the physics show.
3. **In a game in 10 seconds.** Open a URL, click Play, and you're throwing. No install, no account, no ads, no long loads.
4. **Fair across the Pacific.** Players in Shenzhen and worldwide should both get a fair match. The netcode is designed for 100–180 ms, not just the ideal.
5. **Safe by default.** Guests can't talk. Accounts are accountable. The owner can see and act on what happens.

---

## 3. Target Players, Hardware, and Networks

### 3.1 Players
- **Primary:** students at the owner's school. They play in short sessions (breaks, lunch, after school), often with friends in the same room.
- **Secondary:** adults (staff, parents, the wider public through the owner's domain).
- **Skill spread:** very wide. Bots, easy-to-read rules, and the comedy keep beginners engaged. Catch/block timing and movement tech give experts depth.

### 3.2 Hardware (performance budget baseline)
| Item | Target |
|---|---|
| Reference device | **MacBook Air M1 (8 GB)**, Safari and Chrome. This is what most students use. |
| Frame rate | 60 fps at native-scaled resolution (about 1470×956) on the "High" preset, running on battery |
| Floor device (secondary) | A 2018-era Intel laptop or mid-range Chromebook reaches 60 fps at 720p on "Low", with dynamic resolution down to 540p. It should be playable but isn't the primary target. |
| Trackpad | Playable with the trackpad (tap to throw, two-finger tap to block, adjustable sensitivity). A mouse is recommended in the tutorial. |
| Memory | < 500 MB browser tab |
| Initial download | < 10 MB compressed before the first match can start (arena assets stream after) |
| Time to first throw | < 10 s from page open on a 10 Mbps connection |
| GPU API | WebGL2 required; WebGPU optional later |

### 3.3 Networks
- School IT is **out of scope** (owner). The game runs entirely over **HTTPS/WSS on port 443** on `contrapaul.com`, which is already reachable on the school network and in mainland China.
- **Mainland China:** Google services (Fonts, reCAPTCHA, Analytics, Firebase) and Discord are blocked. Nothing on the critical path may depend on them. Fonts are self-hosted, as in the owner's other sites.
- **Latency target:** feels good at ≤ 80 ms RTT, still playable at 150 ms, degrades gracefully to 250 ms. Latency from Shenzhen to Cloudflare is the top technical unknown (§13.11).
- **Load size:** M1 Macs on home broadband make a 10 MB first load comfortable, but slow school Wi-Fi at lunch should still reach a match within about 15 s.

---

## 4. Core Gameplay Specification

All units are metres, seconds, and kilograms. Values marked ◆ are tuning starting points; §18.1 collects them in one table.

### 4.1 Controls (default bindings)

| Action | Key | Notes |
|---|---|---|
| Move | W A S D | |
| Sprint | Shift (hold) | Uses stamina |
| Jump | Space | Short hop |
| Crouch / duck | C (hold) | **Not Ctrl.** Ctrl+W closes the browser tab and can't be intercepted outside fullscreen Keyboard Lock. |
| Slide | Crouch while sprinting | |
| Pick up / Catch / Throw | Left mouse | Context-sensitive (§4.3) |
| Block | Right mouse (tap) | Requires holding a ball |
| Toggle 1st/3rd person | V | Disabled in Classic FPV |
| Text chat | Enter (all) / Y (team) | Accounts only; guests see a sign-up prompt |
| Voice push-to-talk | B (hold) | Default PTT; open-mic optional in settings |
| Scoreboard | Tab | |
| Menu | Esc | Also releases pointer lock |

All keys are rebindable. The game uses Pointer Lock for mouse look and offers optional fullscreen, which enables Keyboard Lock where supported.

### 4.2 Movement

| State | Behaviour ◆ |
|---|---|
| Run | 4.5 m/s |
| Sprint | 7.0 m/s. Stamina lasts 3.0 s from full. Regeneration starts after 1.0 s and refills fully in 4.0 s. |
| Crouch walk | 2.2 m/s. Hitbox height drops to about 60%. |
| Jump | About 0.6 m apex. No double jump. Air control 30%. |
| Slide | Needs ≥ 80% sprint speed. Starts at 8.0 m/s, decays over 0.8 s. Hitbox is low. Cooldown 1.0 s. Costs 0.5 s of stamina. |
| Tripped | Ragdoll for 1.2–2.0 s (depends on the cause), then a get-up animation of 0.6 s. The player cannot act during either. |

**Trip triggers:**
- Sprinting into a wall head-on (angle within about 30° of the wall normal, speed ≥ 6 m/s).
- Colliding with another player when the relative speed is ≥ 6 m/s. Both players roll against a stability value: sprinting or airborne players are less stable, and crouched or standing players are more stable.
- Walking, sprinting, or sliding over a resting **Heavy** ball.
- A fast **Speed** ball bounce hitting the legs while the target sprints or jumps (§4.5).

**Rule:** a trip is *not* a knockout. It only removes control briefly. The single exception is a trip that carries a player across the centerline (§5.1).

### 4.3 Ball handling — the core verbs

A player holds **at most one ball** **[DECISION]**. The left mouse button is context-sensitive:

| Hands | Input | Result |
|---|---|---|
| Empty | Tap LMB, targeting a ball on the ground within 1.6 m | **Pick up** (0.15 s) |
| Empty | Press and hold LMB with no ball in reach | **Catch stance** (§4.3.2) |
| Holding | Tap LMB | **Quick throw.** Wind-up, then release (§4.3.1). |
| Holding | Hold LMB (up to 1.2 s), release | **Aimed throw.** Spread shrinks as the hold lengthens. |
| Holding | Tap RMB | **Block** (§4.3.3) |
| Empty | Tap RMB | Nothing, plus a "need a ball to block" hint the first few times |

This produces the game's central trade-off: **holding a ball lets you block, empty hands let you catch.**

Throwing, catching, and blocking work in every movement state (run, sprint, crouch, slide, jump). They do not work while tripped, recovering, or knocked out.

#### 4.3.1 Throwing
- **Wind-up** ◆: Standard 0.25 s, Speed 0.25 s, Heavy 0.50 s (twice as long, per spec). Other players can see the wind-up animation. That tell is part of the skill.
- **Aim charge:** holding LMB after the wind-up for up to 1.2 s shrinks the spread cone linearly from "quick" to "aimed" (it never reaches zero, per spec). Releasing before the wind-up finishes queues the throw at the end of the wind-up.
- **Spread cone** (half-angle) ◆: Standard quick 4.0° → aimed 1.2°. Speed quick 6.0° → aimed 0.6° (plus up to +15% speed when aimed). Heavy quick 3.0° → aimed 1.5°.
- **Inherited velocity:** the ball inherits 50% of the thrower's horizontal velocity. Sprint-throws are stronger but less controlled.
- **Throw origin:** hand position. Aim comes from the camera ray, corrected so that third-person camera offset doesn't let players throw from behind cover they can't see around. The server raycasts from the character's eyes.

#### 4.3.2 Catching
- Pressing LMB with empty hands (and no pickup target) starts a **catch attempt**.
- **Active window** ◆: 0.35 s from the press. If a **live** ball (§4.4) enters the *catch volume* during that window, the catch succeeds. The catch volume is a sphere of radius 0.7 m centred 0.5 m in front of the chest, and the ball must be within 35° of the view direction.
- After the window ends, holding the button keeps a "brace" pose that does **not** catch.
- **Failed attempt cooldown:** 0.5 s before another catch attempt. This stops players spamming the button.
- **Speed ball:** a successful catch plays a "jarring" reaction: 0.3 s of camera shake and a small backward push. Catch volume is 0.6 m and the view cone is 30°. Catching it is harder but possible.
- **Heavy ball:** **cannot be caught.** A catch attempt against a live heavy ball counts as a hit, so the player is knocked out.
- **Outcome of a catch (Classic):** the thrower is knocked out, the catcher keeps the ball, and one knocked-out teammate of the catcher returns (§5.1).

#### 4.3.3 Blocking
- Tap RMB while holding a ball. Its **active window** and proximity rules match catching: 0.35 s, a block volume in front of the held ball, and a 35° view cone.
- **Block wind-up** ◆: 0.05 s with Standard or Speed held, 0.20 s with Heavy held (per spec, "takes longer to wind up").
- A blocked ball deflects off the held ball with physical restitution. **Deflected balls stay live** (§4.4), which makes bounce-outs possible.
- **Speed ball** blocks are jarring (the same reaction as catching).
- **Heavy ball cannot be blocked.** A block against a live heavy ball knocks the blocker out, and the heavy ball keeps going.
- Block cooldown after a whiffed block: 0.4 s.

### 4.4 Ball states and hit rules

Every ball carries a **state** that the server tracks and the client shows visually.

| State | Visual | Meaning |
|---|---|---|
| **Resting / Dead** | Light tint (light red / light orange / light blue) | On the ground or rolling. Harmless. Can be picked up. |
| **Held** | Full colour in hand | Being carried |
| **Live** | Full colour + subtle trail | Thrown, and has not yet touched the environment |
| **Dead-fast** (Speed only) | Light orange + short trail | Has bounced off the environment but is still fast. Can trip or push but not knock out (§4.5). |

**Hit rules (Classic)** **[DECISION — confirm]:**
1. A **live** ball that touches an opposing player's body knocks that player out.
2. A live ball goes **dead** when it touches the floor, a wall, the ceiling, an obstacle, or an out-of-bounds volume.
3. A live ball that hits a player (knocking them out) **stays live** until it touches the environment. It can knock out a second player, which is a *double knockout*.
4. A ball deflected by a **block** stays live. If it then knocks out an *opposing* player, that's a **bounce-out**.
5. **Friendly fire:** live balls pass off teammates harmlessly. They bounce physically but cause no knockout.
6. **Headshots** count as knockouts **[DECISION]**. Many school rules disallow them. §17 has this as an open question.
7. **Saves** (real-dodgeball rule: a teammate catches a ball that has just hit you, before it goes dead, and cancels your knockout) are **not in v1** **[DECISION]**. They're a candidate for a later update.

**Knockout reaction:** per spec, a *standard* ball knockout triggers a ragdoll with **no impact reaction**. The character just goes limp. Speed balls add a modest impulse, and Heavy balls add a dramatic one (§4.5). A knocked-out player's ragdoll stays for 2 s and then fades. The player enters the spectator/waiting state (§5.1).

### 4.5 Ball types

| Property ◆ | Standard (red) | Speed (orange) | Heavy (blue) |
|---|---|---|---|
| Diameter | 0.21 m | 0.19 m | 0.24 m |
| Throw speed (quick → aimed) | 18 m/s | 25 → 29 m/s | 11 m/s |
| Gravity scale | 1.0 | 0.8 (flatter arc) | 1.6 (steep arc) |
| Max effective range | ~Full court | Full court | ~60% of court |
| Restitution (bounciness) | 0.60 | 0.70 | 0.15 ("barely bounces") |
| Rolling friction | Medium | Low | High |
| Catchable | Yes | Yes (jarring, smaller window) | **No** |
| Blockable | Yes | Yes (jarring) | **No** |
| Knockout impulse to ragdoll | None (limp) | Small | Large: faceplant, spin, or flip depending on hit zone |
| After-bounce effect | Harmless | While speed > 12 m/s: leg hit on a sprinting/jumping player causes a **trip**. Body hit on a stable player causes a **push** of about 0.5 m. Head hit causes a **knockdown** (trip, not KO). Below 12 m/s: harmless. | Harmless, but a resting heavy ball **trips** players who run, sprint, or slide over it |
| Other | — | Aimed throws are faster and more accurate. Unaimed throws are less accurate. | Knocks Neighborhood inflatables around (§7.3) |

**Heavy ball hit-zone reactions (cosmetic):**
- Head: flip up and over.
- Upper body: twirl.
- Legs: faceplant.

A per-hit random seed adds variety. The server sends the seed so every client shows the *same* comedy.

**Adding new balls later:** each ball type is a data definition (§14.2) with its physics, rules flags (`catchable`, `blockable`, `onHitEffect`, `afterBounceEffect`), visuals, and audio. New behaviours need code, but new variations of the existing parameters need only data.

### 4.6 Camera

- **Third person:** over-the-shoulder, with a swappable shoulder. The camera collides with world geometry so it cannot clip through walls.
- **Anti-peek rule:** in third person, the **server** decides visibility and throw origin from the character's eyes. The camera can still see over cover, which is exactly why **Classic FPV** exists as a mode.
- **First person:** the player sees their own arms and ball. The camera follows the head during slides and knockdowns, with a comfort option to reduce camera roll.
- **Team outlines:** in Classic, teammates get a blue outline and opponents a bright red one. Ultimate has no team outlines **[DECISION]**; opponents get a subtle neutral outline for readability.
- **Accessibility:** outline colours can be changed. The defaults avoid relying only on red/green. Blue and red are distinguishable for most colour-vision deficiencies. An optional pattern or icon overhead marks the team.

---

## 5. Game Modes and Rules

### 5.1 Classic

- **Teams:** 2 teams (Blue side / Red side, independent of outline colours), up to 8v8.
- **Court:** each team is confined to its half. The centerline cannot be crossed.
- **Centerline rule:** if a player's **pelvis/root** crosses the centerline, that player is knocked out and drops any held ball. Limbs and ragdoll flailing don't count. A tripping or pushed player *can* be carried across the line and knocked out, which is intentional comedy.
- **Round start:** balls sit on the centerline (count scales with player count, §18.1). Players spawn at their back line. There's a 3-2-1 countdown, then "Dodge!" and players rush for the balls. A ball on the centerline can be picked up from either side, but the player's root must stay on their own side.
- **Round win:** every player on the other team is knocked out.
- **Revive on catch:** when a player catches a ball, the **earliest-knocked-out** teammate returns (first out, first in) **[DECISION]**. The returning player spawns at their team's back line after 1.0 s with 1.0 s of spawn protection. Spawn protection breaks early if they pick up or throw a ball.
- **Knocked-out players:** they spectate (free camera over their team's half, or follow-cam on a teammate) and see their position in the return queue. They keep text chat and can use voice with other knocked-out teammates **[DECISION]**.
- **Anti-stall:**
  - **Possession clock:** a held ball starts pulsing after 8 s and **goes dead in the holder's hand at 10 s**, dropping at their feet. The pulsing warns the holder first.
  - **Round overtime:** after 2:30 in a round, the court's back boundaries slowly move inward. In Classic Gym this is shown as the out-of-bounds lines advancing, which squeezes players toward the centerline. In Hypergym it happens through the dynamic line system.
- **Match end:** first team to **4 round wins** (best of 7), or **10:00** of match time. If time runs out, the team with more round wins wins. If round wins are tied, the current round finishes with **sudden death**: the next knockout of either side ends it **[DECISION]**.
- **Round transition:** 5 s scoreboard and highlight, then reset.

### 5.2 Classic FPV
Identical to Classic, except that the camera is locked to first person. It gets its own matchmaking queue and room setting.

### 5.3 Ultimate (free-for-all)

`plans.md` describes Ultimate both as "last-man standing" and as "respawn after 6 seconds throughout the game". Proposed reconciliation **[DECISION]**:

- **Phase 1, Brawl (0:00–8:00):** free-for-all for up to 8 players with no centerline. A knockout gives the thrower points. Knocked-out players respawn after **6 s** at a random safe spawn point, away from nearby opponents.
- **Phase 2, Last Stand (final 2:00, or earlier if the owner prefers):** respawns turn off. The last player standing earns a large bonus.
- **Winner:** highest score at the end (knockouts plus the Last Stand bonus).
- **Catches** knock out the thrower and give the catcher points. Nobody revives, because the mode has no teams.
- Heavy and Speed balls are plentiful. Balls respawn at spawn pads if the number of dead balls drops too low.
- Players wear the **exact uniform shown in their menu** (per spec). No team colours.

### 5.4 Practice (offline)
- Single player versus bots in any arena and mode. It runs fully in the browser with no server needed (§13.4).
- Options include bot count, bot difficulty, ball mix, and infinite-balls mode.
- A **target range** sub-mode offers static and moving targets, plus a catch machine that fires balls at the player on a rhythm for catch/block timing practice.
- Guests and accounts alike can use it. It earns no Dodgecoins, which prevents farming.

### 5.5 Mode × arena matrix (v1)
| | Classic Gym | Hypergym | Neighborhood | City Block |
|---|---|---|---|---|
| Classic | ✅ | ✅ | ✅ | — |
| Classic FPV | ✅ | ✅ | ✅ | — |
| Ultimate | — | — | — | ✅ |
| Practice | ✅ | ✅ | ✅ | ✅ |

---

## 6. Scoring, Dodgecoins, and Progression

### 6.1 In-match score ◆

| Event | Points | Definition |
|---|---|---|
| Knockout | 100 | Your live ball knocks out an opponent |
| Catch | 150 | Catching an opponent's live ball (also knocks out the thrower and revives a teammate) |
| Block | 50 | A successful block of a live ball |
| Assist | 50 | Within 4 s before a teammate knocks out an opponent, you (a) tripped, pushed, or knocked down that opponent, or (b) forced them to drop a ball by catching it from them *(later)*. Or: your block deflected the ball that became a bounce-out. |
| Round win | 100 | Each surviving *and* knocked-out member of the winning team |
| Match win | 300 | Every member of the winning team |
| **Specials** (added on top of the knockout) | | |
| Slide KO | +50 | You were sliding when you released the throw |
| Airborne KO | +50 | You were airborne when you released the throw |
| Double KO | +100 | One throw knocks out two or more players (+100 for each extra player) |
| First KO | +50 | First knockout of the round |
| Bounce-out | +75 | An opponent is knocked out by a deflected (blocked or player-ricocheted) live ball that you threw |
| Last One Standing clutch | +150 | You're the last player on your team and you win the round *(proposed)* |
| Centerline KO | 0 | An opponent crossing the line gets no credit, except an assist to whoever tripped or pushed them across |

A kill feed shows these events with icons, and the round/match summary shows a highlight tally.

### 6.2 Dodgecoins

- **Earned by accounts.** Guests see a "you would have earned N Dodgecoins, sign up to keep them" message at the end of a match. **[DECISION]** When a guest signs up, the coins from their **current session** transfer to the new account, which gives a strong sign-up nudge.
- **Conversion:** coins = floor(score ÷ 20). Participation minimum: 5 coins for finishing a match.
- **Daily soft cap:** after 400 coins per day, earnings drop to 25% **[DECISION]**. This limits farming and keeps the economy the owner controls meaningful.
- **Anti-farming:** no coins in private rooms with fewer than 4 humans, and none in Practice. Matches where a player was AFK for more than 50% of the time earn nothing.
- **Ledger:** coins are stored as an append-only transaction ledger (`earn`, `spend`, `grant`, `refund`, `adjust`) with a reason and match ID, so any balance can be audited and corrected by an admin.

### 6.3 Cosmetics shop

- **Guests:** a basic uniform and a random skin tone.
- **New accounts:** the basic uniform plus **1 bonus uniform**. The account chooses its skin tone.
- **Shop:** uniforms created by the owner cost ◆ 300–2,000 coins by rarity. Items can be time-limited or permanently available.
- **Loadout:** skin tone, uniform. Later loadout slots can cover a head accessory, a victory celebration, a ball-trail colour (cosmetic only), and a knockout "ragdoll flair" sound.
- **Gifting by admin:** the owner can grant any item or coins to one account, a list of accounts, or all accounts. Examples: "everyone gets the Sports Day uniform."
- **Never pay-to-win.** Cosmetics never change hitboxes. Every uniform uses the same rig and silhouette (§11.2).

### 6.4 Player profile (accounts)
A lightweight profile covers: display name, level (derived from lifetime score, for flavour only), matches played, win rate, knockouts, catches, blocks, favourite ball, and showcase uniform. It is visible in lobbies. There's no public leaderboard at launch **[DECISION]**. It could be added later as weekly school leaderboards.

---

## 7. Arenas

Every arena ships with **authoring metadata** (§14.3): play bounds, team zones, the centerline definition (static or dynamic), ball spawn points, player spawn points, banner slots, out-of-bounds volumes, camera-blocker volumes, and a minimap.

### 7.1 Classic Gym (first arena, used for all prototyping)
- A modern school gym. The court is ~18 × 9 m (volleyball-court scale) with bleachers, a stage, and basketball hoops.
- **Static centerline.**
- Walls give bounces, and balls that leave the court roll back via slight floor slopes and walls (ball return).
- Banner slots cover the wall banners, a scoreboard screen, and the bleacher front.
- It's the performance baseline and the reference for "readable" design.

### 7.2 Hypergym
- A high-tech sports hall with light strips, holographic lines, and a jumbotron.
- **Dynamic centerline:** the line is a spline or polygon that animates between presets over a round, such as a zig-zag, a diagonal, an S-curve, or a "fort" shape. It always gives both teams equal area. Changes are announced 3 s in advance with floor lights. A player who is on the wrong side when the line moves gets a **1.5 s grace period** in which they're pushed back rather than knocked out **[DECISION]**.
- **Obstacles:** low walls to crouch behind, ramps to jump from (airborne KO bait), and a raised platform on each side.
- **Dynamic shapes:** the court outline can change during overtime.

### 7.3 Neighborhood (outdoor)
- An outdoor court between houses, with a basketball hoop, a fence, and a driveway.
- **Inflatable cover:** 3–5 large inflatables (bouncy castle wedge, giant duck, inflatable pillar) that are **server-simulated physics bodies**.
  - Players can push them by walking into them, which is slow.
  - Standard and Speed balls nudge them slightly.
  - **Heavy balls knock them hard** and can knock them out of bounds, past the fence line. Out-of-bounds inflatables respawn after 30 s.
  - An inflatable knocked into players **trips** them (per spec, "used to knock players down if hiding behind them").
  - Inflatables may cross the centerline. They're objects, not players.
- Wind, a sun angle, and ambient suburb sounds give it character.

### 7.4 City Block (Ultimate)
- A bigger free-for-all space: a closed-off city block with a street, a plaza, low walls, stairs, and cars as cover. It has **no centerline**.
- Players spawn at spread-out pads. Balls spawn at pads that refill in rotation.
- Sponsor billboards on buildings are prime banner slots (§12).

---

## 8. Bots and Practice Mode

### 8.1 Fill rules
- Every online match holds **at least 6 participants** (humans + bots). In Classic that's 3v3. **[DECISION]**
- When a human joins, one bot on the team the human is assigned to leaves. If that bot is currently alive, the swap happens at the next round start. Otherwise it happens immediately.
- Bots never exceed what's needed to reach 6. With 6 or more humans, there are no bots.
- Ultimate: bots fill to 6 participants on the same rules.

### 8.2 Bot design
- Bots use **the same input interface as humans**: a virtual controller produces move, look, and button inputs every tick. The server treats them as players, so they automatically follow every rule.
- A **utility AI** chooses each tick among:
  - fetch ball
  - throw at target
  - dodge incoming
  - attempt catch
  - attempt block
  - retreat to cover
  - wait/strafe
- Human limits keep bots fair:
  - **Reaction time:** easy 450 ms, medium 300 ms, hard 200 ms ◆
  - **Aim error:** a Gaussian added to the aim point, scaled by difficulty and target speed
  - **Catch success:** a bot picks catch vs dodge by difficulty. It still has to time the catch window correctly using its (delayed) perception.
  - **Mistakes:** bots sometimes sprint into walls or over heavy balls, because comedy matters.
- In online rooms, bot difficulty scales to the average skill of the humans (simple Elo-lite) **[DECISION]**.
- Bot names come from a curated fun list, marked with a `[BOT]` tag.

### 8.3 Practice mode
- The full simulation runs in a **Web Worker** on the client, using the same `src/sim` code the Durable Object runs (§13.4). It works offline once the assets are cached.

---

## 9. Multiplayer, Lobbies, and Social

### 9.1 Joining a game
- **Quick Play:** pick a mode, or "Any". The server places the player in the fullest public room for that mode that has space and isn't in its final 2 minutes. If no such room exists, it creates one, and bots fill it.
- **Create Room:** private by default. The host picks mode, arena, ball mix, and max players, and gets a **room code**: 5 characters from an unambiguous alphabet (no O/0/I/1), e.g. `K7QXM`. The share URL is `https://<domain>/r/K7QXM`.
- **Join by code / URL:** opening the URL goes straight to the lobby of that room. If needed, the player first picks a guest name (from a safe random generator, e.g. "Swift Otter 42") **[DECISION: guests cannot type custom names]**.
- **Join in progress:** a player joining a Classic match mid-round is placed on the **team with fewer players** and cannot switch. They start knocked out, **at the back of that team's return queue**, and are guaranteed to play from the next round **[DECISION]**.
- **Reconnect:** if a player disconnects, their slot is held for 60 s. A bot controls their character in the meantime **[DECISION]**.

### 9.2 Pre-match lobby (social space)
- A small walkable "locker room / gym foyer" map. Players can run, slide, jump, and throw practice balls at each other with **no knockouts**, only physics fun. The ragdoll from a hit is limited to a short stagger so it doesn't become harassment.
- **Team swap:** stand on the Blue or Red team pad. Team sizes are capped at ±1 of each other unless the host allows uneven teams.
- **Host panel:** mode, arena, and ball mix, plus start and kick. Kicking is available only in private rooms, with a vote-kick in public rooms (later).
- **Show-off:** each player's uniform is visible, and a mirror wall lets players see themselves.
- **Start:** the host clicks Start in private rooms. Public rooms auto-start when 2+ humans are ready, or 45 s after the first human arrives. Bots fill the rest.
- Proximity voice and text chat are active here too (accounts only).

### 9.3 Text chat
- Channels: **All** and **Team**, plus lobby. Messages are limited to 140 characters. Rate limit: 3 messages per 5 s, with escalating mutes for spam.
- Guests see chat. When they press Enter they see: *"Make a free account to chat. [Sign up] [Log in]"*.
- **Filtering** (§10.4): banned words are replaced with `NOPE` before other players see the message, and the incident is logged.
- **Per-player mute** and a **report** button (with a reason) are available on the scoreboard and in the chat context menu.
- A **quick-chat wheel** of pre-written, safe messages ("Nice catch!", "Ball!", "Cover me") works for **everyone, including guests** **[DECISION]**. It improves teamwork without moderation risk.

### 9.4 Proximity voice chat
- **Accounts only.** Guests get the same sign-up prompt as for text chat.
- **Proximity model:** full volume within 5 m, fading to silent at 25 m. Team-radio voice (which ignores distance) is available to teammates **[DECISION]**. Knocked-out players can talk only with other knocked-out teammates.
- **Defaults:** voice is **off** until the player opts in, and push-to-talk is the default. A per-player volume and mute control exists, plus a global "mute all voice" option.
- **Moderation:** voice cannot be word-filtered in real time. Mitigations are described in §10.5.
- **Technology:** a WebRTC SFU with client-side spatialisation (§13.7).

### 9.5 Spectating
- Knocked-out players spectate as described in §5.1.
- Full spectator slots for non-players (for example, a teacher projecting a match) are a stretch goal for 1.0.

---

## 10. Accounts, Safety, and Moderation

### 10.1 Account model
- **Sign-up fields:** email, display name, password. Per spec, **no other personal data** is collected.
- **Sign-up flow:**
  1. The player enters email, display name, and password.
  2. The display name is checked against the word filter and the uniqueness rule, and suggestions are offered if it's rejected.
  3. The **Code of Conduct** screen requires the player to scroll to the end, then tick "I have read and agree".
  4. The **How we use your data** screen is plain-language (§10.6), with a checkbox.
  5. A verification link is emailed to the player (the existing Tome of Secrets flow).
  6. The account is created. It gets the bonus uniform and a welcome message.
- **Login and sessions:** exactly as in the owner's other projects (ported code).
- **Password reset** works by emailing a link (the ported flow).
- **Display names:** 3–16 characters, drawn from letters, numbers, spaces, underscores, and hyphens. They are unique ignoring case. A player can change their own name once every 30 days **[DECISION]**. Admins can rename anyone at any time (§10.3).
- **Deleting an account:** players can delete their own account from settings. Their personal data is removed, and chat incident logs are anonymised but kept for the retention period (§10.6).
- **Auth implementation:** ported verbatim from Tome of Secrets (§13.1): PBKDF2-SHA256, hashed session tokens, rate-limited signup/login/reset, verification and reset emails through Resend. The shared `users.username` column is the display name.

### 10.2 Roles
| Role | Can do |
|---|---|
| Guest | Play, quick-chat, see chat |
| Player (account) | Plus text/voice chat, earn and spend coins, profile |
| Moderator (e.g. other trusted staff) **[DECISION]** | Review incidents and reports, warn, mute, temp-ban, rename |
| Admin (owner) | Everything, plus permanent bans, coin/item grants, content and banner management, moderator management |

Moderator and admin access is a `role` on the profile, checked on every admin request. Every admin action is written to an **audit log**. TOTP two-factor authentication is optional later.

### 10.3 Admin dashboard
Role-gated pages at `/admin`, served by the same Worker.

- **Accounts:** search by name or email. View sign-up date, last seen, matches, coin balance, inventory, name history, warnings, bans, and reports. Actions:
  - rename, with a reason, which notifies the player at their next login: "Your name was changed by a moderator"
  - warn, which shows a message the player must acknowledge at their next login
  - mute text or voice for a duration
  - ban for a duration or permanently, with a reason shown to the player
  - grant coins or items
  - force a password reset
  - delete the account
- **New sign-ups feed:** the latest accounts, with names highlighted if they come close to the filter (fuzzy match), for quick sanity checks.
- **Chat incidents** (§10.4): a queue of flagged rounds. Each shows the offending message(s) highlighted inside the full round transcript. Actions are one click: warn, mute, ban, dismiss.
- **Player reports:** a queue with context (the match, the chat transcript of that round, the reporter's reason).
- **Word list:** add or remove banned words and phrases, set whole-word or substring matching, and add an allow-list of false positives. Changes take effect live without a deploy.
- **Content and banners** (§12, §14).
- **Live view:** active rooms and player counts, with the ability to close a room or broadcast a server message ("Servers restarting in 5 minutes").
- **Metrics:** daily active players, matches, peak concurrency, sign-ups.

### 10.4 Word filter and incident logging (per spec)
1. **Normalise** each message before matching:
   - lowercase it
   - convert Unicode confusables and full-width characters to their ASCII equivalents
   - map leetspeak (`@`→a, `3`→e, `0`→o, `$`→s, and so on)
   - collapse repeated characters
   - check both a version with spacing and punctuation removed ("b a d") and the normal version
2. **Match** against the banned list with whole-word and substring rules, then apply the allow-list to avoid the Scunthorpe problem. The list includes **Chinese profanity** as well as English, because students in China may type Chinese even though the game is English-only.
3. **Replace** only the matched span with `NOPE` in the message that gets broadcast.
4. **Record an incident.** The server already keeps a buffer of **every chat message in the current round** (it has to, in order to deliver chat). When a message is flagged, the round is marked. **When the round ends**, the **entire round transcript** is saved: every message before *and* after the flag, with sender account IDs, names, team, and timestamps. The flagged messages are marked in it.
   - If the room closes early, the transcript is saved at that point.
5. Offending names at sign-up or rename are **rejected**, not NOPE'd. Rejections are counted for anomaly detection.
6. **Escalation** is automatic but conservative: three flagged messages in one match mute the player's text chat for the rest of the match. Everything else is left to human moderators.

### 10.5 Voice safety
Voice can't be filtered like text, so the plan relies on layers:
- Voice is **accounts only**, **opt-in**, push-to-talk by default, and requires a minimum account age of 24 h or 3 completed matches **[DECISION]**.
- Every player can **mute** any other player with one click. That mute persists across sessions.
- A **report** can include the "voice" category. The report records who was in voice range at the time.
- Admins can **revoke voice** per account.
- A **global voice kill switch** exists, plus an optional **schedule** (for example, voice disabled during school hours, if the school wants that).
- **No recording by default.** Recording voice raises consent and privacy concerns, especially for minors. If the owner wants recordings, it needs school/legal sign-off first (§17).

### 10.6 Privacy and data use (plain language, per spec)
- **Collected:** email, display name, password hash, gameplay stats, purchases made with Dodgecoins, chat messages *only when a round contains a flagged message or a report*, IP addresses in security logs for 30 days (for ban evasion and abuse), and anonymous performance telemetry (fps, ping) with no personal data.
- **Used for:** running the game, account recovery, contacting players about their account, and moderation. **Nothing is ever sold or shared** for advertising. There is no third-party analytics or tracking.
- **Retention** ◆:
  - incident transcripts: 1 year
  - security logs: 30 days
  - deleted accounts: personal data purged within 30 days
- **Children's data:** players are middle and high school students. This is a personal (not official school) project, and the owner has school leadership's approval to share it with students. The plan still collects the minimum data: email, name, and password, the same as the owner's other projects. Voice is off by default and never recorded, which keeps things low-risk for younger users.

### 10.7 Code of Conduct (outline, final wording by owner)
1. Be kind. No insults, slurs, harassment, or bullying, in text or voice.
2. Keep it school-appropriate. No sexual, violent, or hateful content.
3. No cheating, exploiting bugs, or using scripts or macros.
4. Protect privacy. Don't share your own or others' personal information.
5. One account per person. Don't share accounts or impersonate others.
6. Moderators can warn, mute, rename, or ban. Serious issues may be passed on to the school.
7. How to report.

---

## 11. Art, Characters, and Audio

### 11.1 Visual direction
- **Style:** voxel characters in the spirit of *Teardown*. They're blocky and voxel-textured like Minecraft, but with **realistic proportions, visible joints, and hands** that can grip a ball.
- **Environments** use the same voxel language at a matching scale. Clean, readable colour blocking keeps players and balls high-contrast against backgrounds.
- **Readability rules:**
  - Balls are always the most saturated objects in the scene. Environments avoid saturated red, orange, and blue.
  - Live balls have a subtle trail. Dead balls are desaturated.
  - Team outlines are drawn on top of everything.
- **Lighting:** baked lighting (lightmaps or vertex AO) plus one dynamic directional shadow for players and balls only, which the M1 handles easily. "High" adds SSAO and soft shadows, while the "Low" preset turns off the dynamic shadow and uses a blob shadow instead.

### 11.2 Character rig
- **One shared skeleton** with about 15 bones: pelvis, spine, chest, head, and for each side upper arm, forearm, hand, thigh, shin, and foot.
- Each body segment is a rigid voxel mesh parented to one bone. There is no skinned mesh, which is cheap to render and trivially ragdolls.
- **Ragdoll:** each segment is a physics body (capsule or box) linked by joints with angular limits. The limits are tuned for comedy but still anatomically plausible.
- **Animation:** a small procedural and keyframed set: idle, run, sprint, crouch, slide, jump, wind-up (per ball weight), throw, catch stance, catch success, block, jarred, get-up, victory, and defeat. **Active ragdoll blending** is a stretch goal: a partial physics reaction layered on animation for pushes and jarring.
- **Hitboxes:** simplified gameplay capsules (head, torso, legs) that are **independent of the uniform**. Cosmetics can't change hitboxes.

### 11.3 Uniform (skin) authoring pipeline for the owner
- Uniforms are **palette + texture swaps on the shared voxel rig**, plus optional small accessory meshes (headband, cap, wristbands) that attach to the head or hands.
- The project supplies:
  - a **MagicaVoxel template** with one layer per body segment, locked dimensions, and a named palette
  - a **validation tool** (`tools/skin-check`) that confirms dimensions, polygon or voxel counts, colour count, and naming, and renders a preview turntable
  - a **how-to guide** in `docs/skins.md`
- **Skin tone** is a separate palette channel, so every uniform works with every skin tone.
- The team outline makes team identity independent of the uniform, so **uniforms need no team variants**.

### 11.4 Audio direction
- **Tone:** funny, punchy, and readable. Gameplay cues come first. Each sound has a job:
  - wind-up whoosh, varied by ball weight
  - distinct impact sounds for live hit, dead bounce, catch, and block
  - "incoming" whistle for live balls near the listener, which is important for 3D awareness
  - centerline warning buzz
  - knockout sting
  - comedic ragdoll voice barks
- **Plan:**
  1. **Prototype:** placeholder CC0 sounds and a simple MIDI-style music loop.
  2. **Pre-launch:** the owner records real gym ball sounds (bounces on wood, wall hits, catches, sneaker squeaks, crowd) and custom effects. A **recording checklist** will be supplied, covering the list of sounds, variations per sound (≥ 4 for frequent ones), a 48 kHz WAV format, and mic distance notes.
  3. Audio is delivered as Opus/WebM (with an AAC fallback for Safari), loaded per arena.
- **Mixing:** a spatial 3D mixer (Web Audio `PannerNode`, HRTF on "High" preset) with a small number of voices and priority rules so the important cues always play.
- **Volume sliders:** master, effects, music, voice, UI.

---

## 12. School Messages and Banner System

`plans.md` asks for an ad framework used only for school messages and site resources. It isn't used for monetisation.

### 12.1 Placement slots
| Slot | Where | Size / format | Clickable |
|---|---|---|---|
| `menu.hero` | Main menu | 1200×400 | Yes (opens link in new tab) |
| `menu.side` | Main menu sidebar | 400×400 | Yes |
| `loading` | Loading/connecting screen | 1200×400 | No |
| `lobby.billboard` | In the lobby map | 1024×512 texture | No |
| `arena.banner.*` | Defined per arena: wall banners, jumbotron, bleacher front, billboards | Aspect ratio per slot (e.g. 4:1, 2:1) | No |
| `postmatch` | End-of-match screen | 800×200 | Yes |

### 12.2 Campaigns
- The admin uploads an image (stored in R2, WebP/PNG/JPEG, ≤ 200 KB) and sets:
  - a title
  - the target slots
  - start and end dates/times
  - a weight (for rotation)
  - an optional link URL (only allowed for clickable slots, and restricted to an allow-list of domains, such as the owner's domain)
  - an optional audience: everyone, accounts only, or guests only
- Examples: "Dress code reminder", "Test tomorrow: Unit 3", "Visit <domain>/resources".
- **Delivery:** the client fetches the active campaign manifest at startup, and the game server includes the arena banner assignment in the match-start message. Every client in a match therefore sees the **same banners**, which is funnier and makes it possible to screenshot them.
- **Fallback:** when no campaign targets a slot, it shows default in-world art (a fictional sponsor like "DuoShan Sports Drinks™").
- **No tracking** beyond an aggregate view/click count per campaign.

---

## 13. Technical Architecture

> **Revised v0.2 (owner feedback):** no dedicated game servers. DuoShan uses the same serverless Cloudflare platform as the owner's other projects (Tome of Secrets, Flashstone, make/bloodbowl, time):
> - **Workers with static assets** serve the game.
> - **D1** stores accounts and game data.
> - The **auth code** is ported verbatim from Tome of Secrets.
> - **Durable Objects** run the real-time matches, as Flashstone's `workers/realtime` does.
>
> The client is **TypeScript + Three.js**, as agreed.

### 13.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** everywhere | The simulation is shared by browser, Durable Object, practice mode, and tests |
| Rendering | **Three.js** (WebGL2) | Agreed with owner |
| Client build | **Vite** + **Vitest** | Same as Tome of Secrets |
| UI (menus/HUD) | Plain TS + DOM/CSS | As in Tome's `src/ui/kit`; no framework needed |
| Hosting | **Cloudflare Workers + static assets**, custom domain on `contrapaul.com` (proposed `duoshan.contrapaul.com`) | Tome of Secrets layout: `wrangler.jsonc` with `assets` + `run_worker_first: ["/api/*", "/rt/*"]` |
| Real-time matches | **Durable Objects** (SQLite-backed): one `GameRoom` per room, plus a `Directory` for Quick Play and room codes | "Serverless game server". It's created on demand, sleeps when empty, and needs no machines to manage. |
| Database | **D1** | Accounts, coins, inventory, moderation, banners |
| Accounts / auth | **Ported verbatim** from `tomeofsecrets/worker/lib`: `crypto.ts` (PBKDF2-SHA256 100k), `session.ts` (hashed tokens, HttpOnly cookie), `ratelimit.ts`, `email.ts` (Resend) | Plus the same four shared tables (`users`, `sessions`, `auth_tokens`, `rate_limits`). "Reviewed and in production. Do not improve it." |
| Gameplay physics | **Custom lightweight TS physics** inside `src/sim` (spheres vs boxes/capsules/planes) | Runs in the Durable Object. See §13.4 for why not Rapier here. |
| Cosmetic physics | **Rapier 3D (WASM), client only** | Ragdolls, knockout flops, trip tumbles, debris |
| Voice | **Cloudflare Realtime** (serverless WebRTC SFU + TURN), with signalling through the `GameRoom` DO | Needs a spike (§13.7). The fallback is peer-to-peer WebRTC. |
| Banner images | Static assets for defaults. Admin uploads go to **R2** (Cloudflare object storage). | |
| Observability | Workers `observability` (as Tome has it enabled) plus a small `/api/telemetry` endpoint | No third-party trackers |
| CI | GitHub Actions: typecheck, lint, test, boundary check, build | Same `npm run check` shape as Tome |

### 13.2 Does Rapier need a server? (owner's question)

**No.** Rapier is a physics *library*, not a service. It runs wherever you call it: a browser tab, a Web Worker, or a Durable Object.

The real question is **who runs the authoritative simulation**, meaning which copy of the game decides "that ball hit you". For a fair action game, one copy must be the referee. Otherwise two players' screens disagree, and a cheater can simply claim hits. In this plan the referee is the **`GameRoom` Durable Object**: one per match, started on demand by Cloudflare, with nothing to rent or maintain.

**What the referee simulates, and why it's a custom physics system rather than Rapier:**
- The gameplay-critical physics is narrow: players are **capsules** moving on floors, ramps, and against walls, and balls are **spheres** bouncing off boxes, planes, and capsules. Inflatables are a few large bodies that slide and tip on the ground plane. About 1–2k lines of well-tested TS covers this.
- Custom TS runs *identically* in the browser (for prediction) and in the DO (for authority). That makes client prediction accurate and is easy to unit-test.
- It avoids loading a WASM binary into the Worker. Workers restrict runtime WASM compilation, `rapier3d-compat` embeds its WASM as base64 and compiles at runtime, and bundle size limits apply. It also keeps DO CPU time low, which keeps ticks steady and costs down.
- **Rapier still does the fun part**: every ragdoll, faceplant, twirl, and flip is simulated in the browser from the referee's event (impact point, force, random seed). All players therefore see the same *kind* of comedic reaction, while the outcome (knocked out, tripped for 1.5 s) is decided by the referee.
- **Escape hatch:** if custom physics proves too limited (Neighborhood inflatables are the likely pressure point), the Phase 0 spike also checks running Rapier's non-compat WASM build inside a DO, imported as a WASM module.

### 13.3 System overview

```
 Browser (MacBook Air etc.)                     Cloudflare (serverless)
┌────────────────────────────┐         ┌──────────────────────────────────────────┐
│ Three.js renderer          │  HTTPS  │ Worker: duoshan.contrapaul.com            │
│ Rapier (ragdolls only)     │────────▶│  • static assets (game, arenas, audio)    │
│ src/sim (prediction)       │         │  • /api/*  auth, profile, shop, coins,    │
│ Practice: src/sim in a     │         │            moderation, admin, banners     │
│   Web Worker + bots        │         │  • /rt/*   ticket check → Durable Object  │
│                            │   WSS   │                                            │
│ Net client ────────────────┼────────▶│  Durable Object: GameRoom (one per room)  │
│                            │         │   authoritative src/sim @ 60 Hz, bots,     │
│                            │         │   chat + filter, voice signalling          │
│                            │         │  Durable Object: Directory                 │
│                            │         │   room codes, Quick Play, public list      │
│ Voice (WebRTC) ────────────┼────────▶│  Cloudflare Realtime SFU / TURN            │
└────────────────────────────┘         │  D1: users, coins, items, incidents, …     │
                                       │  R2: uploaded banner images                │
 Owner ──▶ /admin (same Worker, role-gated) ──▶ D1                                  │
                                       └──────────────────────────────────────────┘
```

**Deployment shape:** Tome of Secrets already uses **Workers with static assets** rather than Pages. Because of that, the **Durable Object classes can live in the same Worker**. No separate realtime Worker, no cross-origin ticket secret shared between two projects, and one `wrangler deploy`. This avoids the Pages limitation that forced Flashstone into two deployments (Flashstone `PHASE-5-MULTIPLAYER.md` §1, Option B). A **signed join ticket** (Flashstone's `ticket.ts` pattern) is still used when the socket connects, so the DO knows who the player is.

### 13.4 Repository layout (single package, Tome of Secrets style)

```
duoshan/
├─ src/
│  ├─ sim/          # PURE game simulation: rules, movement, balls, custom physics.
│  │                #   No DOM, no Three.js, no Rapier. Runs in DO, browser, worker, tests.
│  ├─ content/      # Data definitions: balls, arenas, uniforms, modes (stable IDs)
│  ├─ bots/         # Bot AI → standard inputs (pure; runs in DO and practice worker)
│  ├─ net/          # Protocol (binary codec + Zod for control msgs), client, prediction
│  ├─ filter/       # Chat/name normalisation + matching (pure; used by DO and API)
│  ├─ render/       # Three.js scene, characters, ragdolls (Rapier), effects, outlines
│  ├─ audio/        # Web Audio mixer, spatial audio, voice spatialisation
│  ├─ ui/           # Menus, HUD, settings, shop, lobby UI
│  └─ app/          # Boot, router, account (ported from Tome), settings, practice worker
├─ worker/
│  ├─ index.ts      # fetch handler: /api/*, /rt/*, exports GameRoom + Directory
│  ├─ lib/          # crypto.ts, session.ts, ratelimit.ts, email.ts, http.ts — VERBATIM from Tome
│  ├─ routes/       # auth, profile, shop, coins, reports, admin, banners, telemetry
│  └─ rooms/        # GameRoom.ts, Directory.ts
├─ db/migrations/   # 0001_init.sql (shared auth tables verbatim) + DuoShan tables; append-only
├─ public/          # static assets: arenas (glTF), audio, UI art
├─ art-src/         # MagicaVoxel/Blender sources, uniform template
├─ tools/           # arena-export, skin-check, audio-pack, headless sim, load-test bots
├─ scripts/         # check-boundary.mjs (sim/bots/filter must not import DOM/Three/Rapier)
├─ docs/            # plan phases, decisions, CoC, privacy, skins how-to
├─ CLAUDE.md        # same guidelines file as the other projects
├─ wrangler.jsonc
├─ plans.md         # original brief
└─ PROJECT_PLAN.md  # this file
```

The key architectural bet is that **`src/sim` is pure**: `step(state, inputs, dt) → state + events`. A boundary check (as in Tome's `check:boundary` and Flashstone's engine test) fails CI if it ever imports DOM, Three.js, or Rapier. The same code runs:
- in the **`GameRoom` DO** as the referee
- in the **browser** for local-player prediction
- in a **Web Worker** for offline Practice with bots
- in **headless tests**, where bot-vs-bot matches run in CI

### 13.5 Netcode

| Parameter ◆ | Value |
|---|---|
| DO simulation tick | 60 Hz (fixed step, `setInterval` loop while players are connected) |
| Snapshot broadcast | 20–30 Hz (adaptive) |
| Client input send | **30 Hz**, each packet carrying the last 2 ticks of input plus 2 redundant earlier ones. This halves billable WebSocket messages compared with 60 Hz (§13.10). |
| Remote interpolation buffer | ~100 ms, adaptive to jitter |
| Max lag-compensation rewind | 200 ms |
| Bandwidth | ≤ 20 KB/s down, ≤ 3 KB/s up per client at 8v8 |

**Model:** a server-authoritative simulation (in the DO) with client-side prediction and reconciliation.

- **Local player movement:** predicted immediately with the same `src/sim` code and reconciled against snapshots. Unacknowledged inputs are replayed, and errors are smoothed over about 100 ms.
- **Remote players:** interpolated between snapshots, so they're shown slightly in the past.
- **Balls in flight — the hard part:**
  - Clients **forward-predict flying balls to the estimated current server time**. Incoming balls are drawn *where they really are*, which is essential for dodging and catch timing.
  - Collisions are corrected by the authoritative event, with smoothing.
  - Your own throw appears instantly (predicted). If the referee rejects it, the ball fades out.
- **Catch and block adjudication (favour the defender, bounded):**
  - Each input carries its client tick.
  - The DO checks a catch or block against the ball's position at the tick the defender *saw*, using up to 200 ms of history.
  - The catch wins if it was valid from the defender's view and the ball hadn't already been confirmed hitting someone else. This fixes the "I caught it on my screen" complaint.
- **Hits on players:** evaluated in present DO time against authoritative capsules.
- **Ragdolls are cosmetic** (Rapier, client-side), driven by the referee's event and seed. **Trips** are authoritative in effect: the DO moves a tumbling capsule and runs the timer, and the client ragdoll is loosely pinned to that capsule. Centerline crossing during a trip uses the DO capsule.
- **Inflatables:** simulated by the DO and interpolated on clients.
- **Protocol:**
  - Gameplay messages are **binary** (bit-packed, 1 cm position quantisation, smallest-three quaternions, delta against the last acknowledged snapshot).
  - Control messages (join, chat, lobby) are JSON validated with **Zod**, the Flashstone pattern.
  - A version handshake forces a refresh after a deploy.
- **Anti-cheat:** the referee alone decides throws, catches, and knockouts. Inputs are clamped (move vectors, maximum turn rate). Messages and chat are rate-limited.

### 13.6 Durable Objects in detail

- **`GameRoom`:** one instance per room code, addressed with `idFromName(code)`.
  - It owns the room lifecycle: Lobby → Countdown → Round → Round End → … → Match End → Lobby (the same code, so friends can rematch).
  - It runs the 60 Hz loop only while at least one human is connected. When empty for 5 minutes it saves nothing important and lets itself be evicted. Match results are written to D1 at match end.
  - It also runs bots, chat with the filter and the round transcript buffer, the **incident writes to D1**, join-in-progress, and reconnect. A dropped socket reconnects into the same slot within 60 s, as Flashstone's `MatchRoom` already does.
  - It runs voice signalling and proximity rules, and pays out Dodgecoins at match end, idempotently per match ID. Flashstone's room already pays gold this way.
- **`Directory`:** a single instance.
  - It keeps a map of public rooms (mode, player count, region, phase), updated by `GameRoom`s every few seconds.
  - It serves Quick Play ("find a public room of mode X in my region with space, else create one"), reserves room codes, and checks the codes are unique.
- **Placement (worldwide + Shenzhen):**
  - A DO lives in one Cloudflare location, chosen when it's first created. `GameRoom`s are created with a **`locationHint`** from the creator's region, using `request.cf.continent`/`country`. Mainland China and the rest of Asia map to `apac`.
  - Players in Shenzhen therefore play on an Asia-Pacific room, while a group in Europe gets a European room.
  - Quick Play prefers rooms in the player's own region.
- **Limits to design around** ◆ (verify current Cloudflare limits during Phase 0):
  - A DO is single-threaded. 16 players with 12 balls on custom physics is well under 1 ms per tick. That's a reason for custom physics over WASM here.
  - DO memory is 128 MB, which is ample.
  - WebSocket messages per second per DO are fine at 16 × 30 Hz.

### 13.7 Voice (proximity)
- **Primary:** **Cloudflare Realtime SFU + TURN** (serverless, pay-as-you-go with a free monthly allowance).
  - The Worker issues SFU sessions only to accounts in good standing that have voice enabled.
  - The `GameRoom` DO tells each client **which tracks to subscribe to** (players within about 30 m, plus team radio and knocked-out-teammates rules). The client spatialises them with Web Audio, fading from full volume at 5 m to silent at 25 m.
- **Fallback:** **peer-to-peer WebRTC** audio, with the `GameRoom` DO as the signalling server and Cloudflare TURN for hard networks. Proximity limits keep each player connected to only a few peers at once, and M1 MacBooks handle that easily.
- **Risk:** WebRTC reachability from mainland China is the unknown, so a **spike before Phase 6** decides which to use (Risk R5).

### 13.8 Data model (D1 / SQLite)

`0001_init.sql` starts with the **four shared auth tables verbatim** from Tome of Secrets (`users`, `sessions`, `auth_tokens`, `rate_limits`), so the ported code works unchanged. DuoShan's own tables follow, and migrations are **append-only**, as in the other projects.

```sql
-- DuoShan additions (sketch)
CREATE TABLE profiles (          -- one row per user
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','moderator','admin')),
  skin_tone INTEGER NOT NULL DEFAULT 0,
  uniform_id TEXT NOT NULL DEFAULT 'uniform.basic',
  coins INTEGER NOT NULL DEFAULT 0,           -- cache of SUM(coin_ledger.delta)
  voice_enabled INTEGER NOT NULL DEFAULT 0,
  voice_revoked INTEGER NOT NULL DEFAULT 0,
  text_muted_until INTEGER, banned_until INTEGER, ban_reason TEXT,
  name_changed_at INTEGER, created_at INTEGER NOT NULL);

CREATE TABLE owned_items (       -- item_id is a free-text stable slug; never enumerate the catalogue
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL, source TEXT NOT NULL, acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id));

CREATE TABLE coin_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earn','spend','grant','refund','adjust')),
  reason TEXT, match_id TEXT, admin_id TEXT, created_at INTEGER NOT NULL,
  UNIQUE (user_id, match_id, kind));        -- idempotent match payouts

CREATE TABLE matches (id TEXT PRIMARY KEY, room_code TEXT, mode TEXT, arena_id TEXT,
  started_at INTEGER, ended_at INTEGER, result TEXT /* JSON */);
CREATE TABLE match_players (match_id TEXT, user_id TEXT, guest_label TEXT, team TEXT,
  score INTEGER, kos INTEGER, catches INTEGER, blocks INTEGER, assists INTEGER, coins INTEGER);

CREATE TABLE name_history (id TEXT PRIMARY KEY, user_id TEXT, old_name TEXT, new_name TEXT,
  changed_by TEXT, reason TEXT, changed_at INTEGER);

CREATE TABLE chat_incidents (id TEXT PRIMARY KEY, match_id TEXT, round_no INTEGER,
  room_code TEXT, created_at INTEGER, status TEXT DEFAULT 'open', reviewed_by TEXT,
  reviewed_at INTEGER, note TEXT);
CREATE TABLE chat_incident_messages (incident_id TEXT, seq INTEGER, sent_at INTEGER,
  user_id TEXT, display_name TEXT, team TEXT, channel TEXT,
  original_text TEXT, delivered_text TEXT, flagged INTEGER,
  PRIMARY KEY (incident_id, seq));

CREATE TABLE reports (id TEXT PRIMARY KEY, reporter_id TEXT, reported_id TEXT, match_id TEXT,
  category TEXT, note TEXT, context TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE moderation_actions (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, reason TEXT,
  expires_at INTEGER, acknowledged_at INTEGER, created_by TEXT, created_at INTEGER);
CREATE TABLE banned_words (id TEXT PRIMARY KEY, pattern TEXT, match_type TEXT, lang TEXT);
CREATE TABLE allowed_words (word TEXT PRIMARY KEY);

CREATE TABLE banner_campaigns (id TEXT PRIMARY KEY, title TEXT, image_key TEXT /* R2 */,
  link_url TEXT, slots TEXT /* JSON */, audience TEXT, starts_at INTEGER, ends_at INTEGER,
  weight INTEGER, views INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0);

CREATE TABLE audit_log (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, target TEXT,
  details TEXT, created_at INTEGER);
```

- **Content-safe accounts:** item IDs are stable slugs that are never reused or deleted, only *retired*. A missing item falls back to the basic uniform. No migration ever lists the catalogue, following Flashstone's `card_id` rule.
- `GameRoom` DOs read the word list from D1 on start (cached, refreshed every 60 s), so admin edits apply live.

### 13.9 Security checklist
- **Auth** uses the Tome code as-is: PBKDF2 at 100k iterations, hashed session tokens in HttpOnly + Secure cookies, and rate limits on signup, login, reset, and verify.
- **Join tickets:** short-lived HMAC tickets (user or guest ID + room + expiry) are verified by the DO when the socket connects. Guests get a signed guest ID stored in `localStorage`.
- **Admin routes** check `profiles.role` on every request, and every action is written to `audit_log`. Optional TOTP later. Given the owner is the only admin, and CLAUDE.md prefers simplicity, it's not needed at first.
- **Uploads** go to R2 through an admin-only route, with type and size limits (≤ 200 KB, WebP/PNG/JPEG).
- **Rate limits** cover chat, room creation, and room-code lookups (code guessing).

### 13.10 Cost estimate (Cloudflare) ◆ (verify current pricing in Phase 0)
- The **Workers Paid plan (~$5/month)** is expected to be needed. Long-running game rooms exceed the free daily Durable Object allowances quickly.
- **What's billed:**
  - DO **wall-clock duration** while a room is active: roughly 450 GB-s per room-hour at 128 MB.
  - **Incoming** WebSocket messages, billed as requests at 20 messages to 1 request. A full 16-player room at 30 Hz input is roughly 86k billable requests per hour.
  - D1 reads and writes are tiny.
- **Example:** 5 full rooms × 2 hours per school day × 22 days = 220 room-hours per month. That's about 19M requests and 100k GB-s, which comes to **roughly $5–10/month on top of the $5 plan**. Bot-heavy rooms with few humans cost far less.
- **Voice:** Cloudflare Realtime/TURN egress is charged per GB after a free allowance. Voice ships last, so its cost is measured in Phase 6.
- **No machines to rent, patch, or back up.** D1 has Time Travel point-in-time restore.

### 13.11 Latency: Shenzhen and worldwide
- The owner confirms the domain is accessible from mainland China. **Accessibility isn't the same as latency, though.** On standard Cloudflare plans, mainland traffic is not served from mainland data centres, and it is sometimes routed to distant PoPs (e.g. US West) rather than Hong Kong. A real-time game is far more sensitive to this than a card game or a website.
- **Phase 0 spike S2 measures it:**
  - Deploy an echo `GameRoom` (with `locationHint: apac`) and measure WebSocket RTT and jitter **from the school in Shenzhen**, from home connections there, and from overseas.
  - Also compare connecting via `duoshan.contrapaul.com` with a `*.workers.dev` hostname.
- **Decision rule:**

| Measured median RTT from Shenzhen | Plan |
|---|---|
| ≤ 100 ms | Proceed as designed |
| 100–180 ms | Proceed. The netcode above (forward-predicted balls, defender-favoured catches) is built for this. Tune catch and block windows wider. Also add **Local Host mode** (below) for in-school play. |
| > 180 ms or unstable | Make **Local Host mode** the default for school play, with Cloudflare rooms for worldwide play |

- **Local Host mode (fallback, cheap to add because of the pure sim):**
  - One player's browser runs `src/sim` as the referee, the same code as the DO.
  - The other players connect **peer-to-peer over WebRTC data channels**. The `GameRoom` DO only does matchmaking and signalling, with Cloudflare TURN as backup.
  - Students on the same school network get single-digit-millisecond latency.
  - Trade-offs:
    - The host has zero latency, a slight advantage.
    - A host leaving ends or migrates the match.
    - A malicious host could cheat, which is acceptable among classmates.
  - Coins and incidents are still reported to the API, and coin payouts from host-run matches are capped.

### 13.12 Observability and testing
- **Server:** Workers observability logs, plus DO metrics posted to D1 or Workers Analytics Engine every minute: tick p99, players, rooms, reconnects, catch-rewind use.
- **Client telemetry** (anonymous): fps, frame-time p95, RTT, packet loss, sent to `/api/telemetry`.

| Level | What | Tooling |
|---|---|---|
| Unit | Rules, catch windows, centerline, scoring, filter normalisation, ledger | Vitest |
| Simulation | Headless bot-vs-bot matches in CI: no crashes, no stuck balls, balanced sides | Vitest + `src/sim` (`npm run sim`, as in Tome) |
| Netcode | Simulated 50/150/250 ms latency, jitter, and loss. Reconciliation error, catch fairness, bandwidth. | Custom harness |
| Room | `GameRoom` tests with real WebSocket clients against `wrangler dev`, following Flashstone's `MatchRoom.test.ts` | Vitest |
| Load | 16 headless bot clients per room × N rooms against a preview deploy | `tools/load-test` |
| Browser smoke | Load, practice round, join by code | Playwright |

### 13.13 Environments and deployment
- **Local:**
  - `npm run dev` for the client (Vite)
  - `npm run dev:api` for `wrangler dev --local`, which includes D1 and the DOs
  - `npm run db:migrate` for migrations
  - These are the same scripts Tome uses.
- **Preview:** `wrangler versions upload` gives a preview URL for playtests.
- **Production:** `npm run deploy` (build + `wrangler deploy`).
  - Before deploying, the admin panel broadcasts "update in 5 minutes".
  - Rooms on the old version finish their match. The client version handshake then prompts a refresh.
- **Secrets:** `RESEND_API_KEY`, `RESEND_FROM`, `TICKET_SECRET`, and the Realtime app ID/token, set with `wrangler secret put`. They're never committed.

---

## 14. Live Operations and Content Updates

### 14.1 Principle
New arenas, uniforms, and balls are **additive data plus assets**, deployed without schema changes and without touching accounts. Free materials go out only through explicit admin grants (per spec).

### 14.2 Content definitions (`src/content`)
```ts
// Illustrative — balls are data + a small set of coded behaviours
export const speedBall: BallDef = {
  id: 'ball.speed',              // stable, never reused
  displayName: 'Speed Ball',
  color: '#FF8A00', deadColor: '#FFC98A',
  radius: 0.095, mass: 0.25, restitution: 0.70, gravityScale: 0.8,
  throw: { windup: 0.25, speedQuick: 25, speedAimed: 29, spreadQuickDeg: 6, spreadAimedDeg: 0.6 },
  rules: { catchable: true, blockable: true, catchWindowScale: 0.85, jarring: true },
  afterBounce: { effect: 'trip_push_knockdown', minSpeed: 12 },
  koImpulse: 'small',
  audio: { windup: 'sfx/windup_light', hit: 'sfx/hit_speed', bounce: 'sfx/bounce_speed' },
};
```
- **Arenas:** an `ArenaDef` pointing at a glTF scene plus a metadata file (bounds, zones, line definition, spawns, banner slots).
- **Uniforms:** `UniformDef` with ID, voxel file reference, palette, rarity, price, and release/retire dates.
- **Modes:** `ModeDef` with rules parameters (round count, timers, respawn, possession clock), so variants like "Heavy-only Friday" become configuration.
- **Validation:** a CI step checks every definition, including unique IDs, referenced assets that exist, banner slot aspect ratios, and a correct centerline definition.

### 14.3 Arena authoring
- Arenas are built in **Blender** (or MagicaVoxel + Blender) using a naming convention for gameplay objects, e.g. `COL_*` collision, `SPAWN_BLUE_*`, `BALL_*`, `LINE_*`, `BANNER_<aspect>_*`, `OOB_*`.
- `tools/arena-export` converts the scene to an optimised glTF (Draco/Meshopt compression, KTX2 textures) and a metadata JSON. It also produces a simplified collision mesh for Rapier.
- A **greybox-first** workflow: every arena ships as a greybox and is playtested before any art pass.

### 14.4 Release cadence (after launch)
- **Content drops:** about every 4–6 weeks. Each adds 1–3 uniforms and occasionally a ball, arena, or mode variant.
- **Events:** themed weeks (e.g. "Heavy Ball Week", school spirit uniforms), toggled by admin config with no deploy needed.
- **Balance patches:** tuning changes are data-only and ship with patch notes shown on the main menu.

---

## 15. Milestones and Timeline

### 15.1 Assumptions
- **Team:** the owner (design, art, audio, playtesting, moderation) plus AI-assisted development (Claude Code) doing most of the programming, with the owner reviewing.
  - The owner is assumed to work part-time on the project alongside teaching.
  - Estimates are **calendar weeks at a part-time pace** with a steady flow of agent-driven implementation.
- **Start:** early October 2026.
- **Priorities:** "Physics, low-latency online play" are the must-haves (per spec), so they come first. Chat, accounts, and voice come **after** the core is fun.
- **Early releases are safe:** the first playable releases have **no free text or voice chat**, so they can go to students without moderation risk.

### 15.2 Phases

#### Phase 0: Foundations and Spikes (Weeks 1–2)
**Goal:** remove the largest technical unknowns before committing.
- Answer the remaining Priority-A open questions (§17).
- Scaffold the repo in the Tome of Secrets layout (§13.4): Vite, TS, ESLint, Vitest, `wrangler.jsonc` with static assets, a D1 database, the boundary check, CI, and `CLAUDE.md`. Deploy a hello-world to `duoshan.contrapaul.com`.
- **Spike S1, performance:** Three.js scene plus Rapier ragdolls (6 active), 16 characters, and 12 balls on an **M1 MacBook Air in Safari and Chrome**, and on one older floor device. Measure fps and battery drain.
- **Spike S2, latency (the most important):** an echo `GameRoom` Durable Object with `locationHint: apac`. Measure WebSocket RTT and jitter from the Shenzhen school, from Shenzhen homes, and from overseas, over a school week at different times of day. Apply the §13.11 decision rule.
- **Spike S3, referee loop:** a 60 Hz `setInterval` sim in a DO with 16 fake clients. Measure tick stability, CPU per tick, and billed requests. Also test whether Rapier's WASM build loads in a DO (the escape hatch in §13.2).
- **Spike S4, netcode feel:** predicted movement plus a DO-authoritative ball throw at 150 ms of simulated latency.

**Exit criteria:** 60 fps on the M1 Air, a Local Host decision from the §13.11 table, a stable DO tick (p99 < 4 ms of CPU), and cost per room-hour confirmed.

#### Phase 1: "Feel" Prototype, offline (Weeks 3–7)
**Goal:** the core verbs are fun in single player against bots.
- `src/sim` (custom physics: capsules, spheres, boxes, ramps): movement (run, sprint, crouch, slide, jump), stamina, trips.
- Standard ball: pickup, throw (quick and aimed), catch, block, live/dead states, hit rules, centerline rule.
- Ragdoll knockouts, team outlines, and the first- and third-person camera.
- Greybox Classic Gym.
- Basic bots (fetch, throw, dodge).
- A minimal HUD (held ball, stamina, catch-window feedback) and placeholder audio.
- Practice mode in a Web Worker.

**Exit criteria:** 5+ students play it and ask to play again. The catch/block feel is tuned. There's a gameplay video of the owner's favourite moments.

#### Phase 2: Networked Core (Weeks 8–12)
**Goal:** low-latency online play that feels fair.
- The `GameRoom` Durable Object (the referee) and the `Directory` DO, with a fixed tick and snapshots with delta compression. Join tickets follow Flashstone's pattern.
- Client prediction and reconciliation, entity interpolation, forward-predicted balls, and catch/block lag compensation.
- Room codes, share URLs, Quick Play, bot fill to 6, join-in-progress, and reconnect.
- The load-test harness and netcode test harness, plus a capacity measurement.

**Exit criteria:** an 8v8 playtest (with bots filling in) at school feels fair, and there are no "I caught it on my screen" complaints above a small threshold. DO tick CPU p99 stays under 4 ms per room.
- **If spike S2 said so:** Local Host mode (WebRTC peer-to-peer with the same sim) is built in this phase.

#### Phase 3: Classic Complete → **ALPHA** (Weeks 13–16)
**Goal:** a complete Classic match loop, playable by students.
- Rounds, revive-on-catch, the return queue, spectating, possession clock, overtime, match end, and sudden death.
- Scoring, kill feed, special KOs, and the scoreboard and end-of-match screens.
- **Speed and Heavy balls** with their full effects.
- The Classic FPV mode, the settings menu (sensitivity, FOV, keybinds, graphics presets, audio), and the quick-chat wheel.
- A first art pass on Classic Gym and the character rig with the basic uniform and skin tones.
- Performance pass 1 (M1 Air on battery, plus the floor device on Low).

**🚩 ALPHA RELEASE (~end of January 2027):** guests only, quick-chat only, Classic and Classic FPV in the Gym, shared with a limited group of students by URL.

#### Phase 4: Accounts, Chat, and Moderation (Weeks 17–21)
**Goal:** safe social features.
- **Port auth from Tome of Secrets verbatim** (`worker/lib/*`, the four shared tables). Add the DuoShan screens: sign-up with the CoC and data-use steps, login, reset, and sessions. This is mostly a port, so it's quicker than a greenfield build.
- Text chat with channels, rate limits, the filter, NOPE replacement, and incident transcripts.
- The admin dashboard: accounts, rename, warn, mute, ban, the incident queue, reports, the word list, and the audit log (role-gated `/admin`).
- Dodgecoins ledger, profile, starter bonus uniform, and guest-to-account coin carry-over.
- Privacy policy and CoC published (final wording by the owner).

#### Phase 5: Arenas and Ultimate → **BETA** (Weeks 22–27)
- Hypergym with the dynamic centerline and obstacles.
- Neighborhood with server-simulated inflatables.
- City Block and the **Ultimate** mode (Brawl + Last Stand).
- Arena export tooling and the greybox → art pipeline.
- Balance pass on all three balls, based on alpha telemetry.

**🚩 BETA RELEASE (~mid-April 2027):** accounts, text chat, all four arenas, all modes, open to the whole school.

#### Phase 6: Social and Live-Ops Features (Weeks 28–32)
- The walkable pre-match lobby with team pads, a mirror, and host controls.
- A voice spike first (Cloudflare Realtime SFU vs peer-to-peer, tested from Shenzhen). Then proximity voice with PTT, mutes, reports, revoke, kill switch, and schedule.
- The shop and loadout, uniform authoring template and validator, and the first owner-made uniforms.
- The banner/campaign system in the menu, loading screen, lobby, and arenas.
- Admin tools for content (grant items, schedule campaigns, events).

#### Phase 7: Polish, Audio, and Launch → **1.0** (Weeks 33–37)
- **The owner's recorded audio** goes in (per spec, before going properly live), plus the final mix.
- Performance pass 2, accessibility pass, and tutorial/onboarding (a 60-second interactive "Coach" tutorial).
- Security review, a D1 Time Travel restore drill, a load test at 3× expected peak (cost checked too), and latency verification from Shenzhen and overseas.
- Links are placed around the owner's domain, with a launch announcement at school.

**🚩 1.0 LAUNCH (~mid-June 2027, before the summer break), or at the start of the next school year if the owner prefers a September launch.**

#### Phase 8: Post-launch (ongoing)
- Content drops every 4–6 weeks, events, balance patches, and moderation.
- Backlog candidates: saves rule, spectator slots, weekly school leaderboards, gamepad support, active-ragdoll blending, more balls (Sticky? Split? Bouncy?), WebTransport, and a touch/tablet mode.

### 15.3 Timeline at a glance

```
2026        Oct       Nov       Dec       Jan       Feb       Mar       Apr       May       Jun
Phase 0   ██
Phase 1     █████
Phase 2           █████
Phase 3                  ████ ▲ALPHA
Phase 4                       █████
Phase 5                            ██████ ▲BETA
Phase 6                                   █████
Phase 7                                        █████ ▲1.0
Playtests   ●    ●    ●    ●    ●    ●    ●    ●    ●     (every ~2 weeks at school)
```

These dates assume part-time owner availability and include normal school holidays loosely. **Re-plan at the end of each phase.**

### 15.4 Success metrics (measurable proxies for "a hit at school")
| Metric | Alpha target | 1.0 target |
|---|---|---|
| Weekly active players (unique devices) | 30 | 200+ (or ~30% of the student body) |
| Matches per active player per week | 3 | 5 |
| Day-7 return rate | 25% | 35% |
| Guest → account conversion | — | 40% |
| Median time from page open to first throw | < 15 s | < 10 s |
| p95 frame time on M1 MacBook Air | < 16.7 ms | < 16.7 ms (on battery) |
| Median RTT from Shenzhen to its room (or Local Host) | < 150 ms | < 100 ms |
| Hosting cost | — | < $25/month at school scale |
| "Would you recommend it to a friend?" (playtest survey, 0–10) | 7 | 8.5 |
| Moderation incidents resolved within 48 h | — | 95% |

### 15.5 Definition of Done (every feature)
- Implemented in `src/sim` (if it's gameplay) with unit tests. Headless bot matches stay green.
- It works in online and practice modes.
- It's in the performance budget on the M1 MacBook Air.
- Placeholder or final audio and visual feedback exist, so no silent actions.
- Relevant settings and keybinds are exposed. Admin tooling exists if the feature creates moderation or content needs.
- Docs are updated (player-facing help and/or the owner runbook).

---

## 16. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Latency from Shenzhen to Cloudflare is high or unstable.** Standard Cloudflare plans don't serve from the mainland and can route via distant PoPs. | **High** | Critical | Phase 0 spike S2 with a decision rule (§13.11), netcode built for 100–180 ms, and the **Local Host mode** fallback for in-school play |
| R2 | **Netcode feels unfair**, especially catches and blocks | High | Critical | Forward-predicted balls, defender-favoured bounded rewind, the Phase 2 harness, and early playtests from Shenzhen |
| R3 | **Custom gameplay physics is too limited** (inflatables, ramps, edge cases) | Medium | Medium | Keep the physics needs narrow by design. Rapier-in-DO is the tested escape hatch (spike S3), and headless bot matches catch stuck or tunnelling balls. |
| R4 | **Durable Object limits or tick jitter** (single thread, timer precision, eviction) | Medium | High | Spike S3 measures it. Keep the sim cheap. Clients tolerate jitter through interpolation, and reconnect-to-seat exists (the Flashstone pattern). |
| R5 | **WebRTC voice unreachable or poor from mainland China** | Medium | Medium | Voice ships last and is optional. Spike Cloudflare Realtime vs peer-to-peer with TURN. It can be cut from 1.0. |
| R6 | **Voice chat abuse** can't be filtered | Medium | High | Accounts only, opt-in, PTT, mutes, reports, revoke, a kill switch and schedule, and no recording |
| R7 | **Ragdoll comedy undermines readability or fairness** | Medium | Medium | Knockouts are rules-based. Ragdolls are cosmetic. Trips use a referee capsule. Heavy-ball trips are tuned in playtests. |
| R8 | **Scope creep** (4 arenas, 3 modes, voice, lobby, shop, banners) | High | Medium | Phase gates and an early alpha. Optional features (walkable lobby, voice) are explicitly cuttable for 1.0. |
| R9 | **Owner time constraints** (teaching load) block art, audio, and moderation | High | Medium | Placeholder-first pipeline, validator tools, optional staff moderators, and incident queue triage in under 10 min/day |
| R10 | **Word-filter evasion or false positives** | High | Low–Med | Normalisation, allow-list, live-editable lists, human review, reports |
| R11 | **Cost spike** if the game spreads widely (billed DO duration and messages) | Low | Medium | 30 Hz input batching, rooms sleep when empty, a per-room idle timeout, a cap on concurrent rooms, and Cloudflare usage alerts |
| R12 | **Cheating** (aim scripts, macros, malicious Local Host) | Low | Medium | Referee authority, input validation, reports, bans, and capped coin payouts from Local Host matches |
| R13 | **Balance of third person vs first person** (peeking) | Medium | Low | Eye-origin visibility for throws, and Classic FPV as a separate mode |
| R14 | **Safari/WebGL quirks on macOS** (pointer lock, audio unlock, WASM performance) | Medium | Medium | Safari is a first-class test target in every phase, and Playwright WebKit smoke tests run in CI |
| R15 | **Email deliverability to Chinese mailboxes** (QQ, 163) through Resend | Medium | Medium | SPF/DKIM/DMARC on `contrapaul.com` and test sends in Phase 4. Unverified accounts can still play and earn. |
| R16 | **Regulatory exposure in mainland China** for an online game | Low | Medium | Free, non-commercial, school-community scope with no payments. Get advice if it grows well beyond the school. |

---

## 17. Open Questions for the Project Owner

Priority **A** = needed before or during Phase 0. **B** = needed before the phase that builds the feature. **C** = can wait.

### 17.0 Answered (v0.2)
| ID | Question | Owner's answer → plan change |
|---|---|---|
| Q-T1 | Stack? | TypeScript + Three.js: yes. **No dedicated game servers.** Accounts as in Flashstone, make/bloodbowl, and Tome of Secrets. → Serverless Cloudflare stack (§13) |
| Q-T2 | Where are players? | Worldwide. The school is in **Shenzhen**. → DO `locationHint` by region, and the Shenzhen latency spike (§13.11) |
| Q-T3 | Domain? | `contrapaul.com`, reachable on the school network and in mainland China. → proposed `duoshan.contrapaul.com` |
| Q-T5 | Devices? | Mostly **MacBook Air M1+**. → §3.2 |
| Q-T6 | School IT? | Out of scope. → removed from the plan |
| Q-S1 | Ages and approval? | Middle and high school. Leadership has approved, and it's not an official school project. → §10.6 |
| — | "Does Rapier need a simulation?" | Rapier is a library and doesn't need a server. The referee runs in a Durable Object. See §13.2. |

### 17.1 Technology
| ID | Pri | Question | Proposed default |
|---|---|---|---|
| Q-T9 | A | Is **`duoshan.contrapaul.com`** the right address? | Yes |
| Q-T10 | A | Is the **Workers Paid plan (~$5/month)** on your Cloudflare account OK? Durable Object rooms will outgrow the free tier. Expected total is roughly $5–15/month at school scale (§13.10). | Yes |
| Q-T11 | A | Can you (or a colleague) run the **latency test page** from school and home in Shenzhen during Phase 0? It's one click and reports the numbers. | Yes |
| Q-T12 | B | If Shenzhen latency is poor, is **Local Host mode** (one student's browser referees, and classmates connect peer-to-peer) acceptable for in-school play? | Yes, as a fallback |
| Q-T13 | B | Should the game be playable during school hours, or is it after-school/home only? This affects the voice schedule defaults. | Both, with admin schedule toggles |
| Q-T8 | C | Is mobile/tablet (touch) support ever desired? | Out of scope for 1.0 |

### 17.2 Gameplay rules
| ID | Pri | Question | Proposed default |
|---|---|---|---|
| Q-G1 | A | Do **headshots** count as knockouts? | Yes |
| Q-G2 | B | Does a ball that hits one player **stay live** and knock out a second (double KO)? Do **deflected (blocked)** balls stay live (bounce-outs)? | Yes to both |
| Q-G3 | B | Should the real-dodgeball **"save"** rule exist (a teammate catches a ball that just hit you)? | Not in v1 |
| Q-G4 | B | Max balls held at once: 1 or 2? | 1 |
| Q-G5 | B | **Ultimate:** is the Brawl (respawns) → Last Stand (no respawns) reconciliation right? Or should it be pure deathmatch, or pure last-man-standing rounds? | Brawl 8 min + Last Stand 2 min |
| Q-G6 | B | Do bots fill to **6 total participants** (3v3)? | Yes |
| Q-G7 | B | Are you happy with the possession clock (10 s) and round overtime (shrinking court) as anti-stall rules? | Yes |
| Q-G8 | B | Match timeout tiebreak: is sudden death OK? | Yes |
| Q-G9 | C | Which revive order: first-out-first-in, or the catcher chooses? | First out, first in |

### 17.3 Social, safety, and school policy
| ID | Pri | Question | Proposed default |
|---|---|---|---|
| Q-S2 | B | Should sign-up be **restricted to school email domains**, open to anyone, or open with a school "verified" badge? | Open, with an optional school badge |
| Q-S3 | B | Will other staff act as **moderators**, or only you? | Only you at first. The role exists for later. |
| Q-S4 | B | Should voice chat be **proximity only**, or also team radio? Should knocked-out players talk to each other? | Proximity + team radio. KO'd players talk to KO'd teammates. |
| Q-S5 | B | Should guests be allowed a **custom name** (filtered), or only generated names? | Generated names only |
| Q-S6 | B | Is the **guest-to-account coin carry-over** OK? | Yes, current session only |
| Q-S7 | C | Are public leaderboards wanted (weekly, school-wide)? | Post-launch |
| Q-S8 | C | Should all chat be retained for a short period (e.g. 7 days) to support reports, or only flagged rounds (per spec)? | Only flagged/reported rounds (per spec) |
| Q-S9 | C | Should voice ever be recorded for moderation? | **No** (privacy) |

### 17.4 Content and art
| ID | Pri | Question | Proposed default |
|---|---|---|---|
| Q-C1 | B | What tools will you use to make uniforms (MagicaVoxel, Blockbench, other)? | MagicaVoxel template |
| Q-C2 | B | How many uniforms are planned for launch? What price range in Dodgecoins? | 6–10, priced 300–2,000 |
| Q-C3 | B | Will you model arenas yourself, or should the development work produce them (greybox + voxel kit)? | Dev produces greybox + kit, owner themes |
| Q-C4 | C | What is the music direction: none in matches, lobby music only, or full soundtrack? | Lobby/menu music, light in-match stings |
| Q-C5 | C | Is there a fictional default sponsor brand for empty banner slots? | "DuoShan Sports Drinks™" (placeholder) |

---

## 18. Appendices

### 18.1 Tuning table (starting values ◆)

| Parameter | Value |
|---|---|
| **Player** | |
| Run speed | 4.5 m/s |
| Sprint speed | 7.0 m/s |
| Sprint stamina | 3.0 s; regen delay 1.0 s; full regen 4.0 s |
| Crouch speed | 2.2 m/s |
| Jump apex | 0.6 m |
| Slide | 8.0 m/s start, 0.8 s, cooldown 1.0 s |
| Trip duration | 1.2–2.0 s + 0.6 s get-up |
| Collision trip threshold | 6 m/s relative speed |
| Wall trip threshold | ≥ 6 m/s, within 30° of the wall normal |
| **Ball handling** | |
| Pickup range / time | 1.6 m / 0.15 s |
| Throw wind-up (Std/Spd/Hvy) | 0.25 / 0.25 / 0.50 s |
| Max aim charge | 1.2 s |
| Catch window / cooldown | 0.35 s / 0.5 s |
| Catch volume / view cone | 0.7 m / 35° (Speed ball: 0.6 m / 30°) |
| Block window / cooldown | 0.35 s / 0.4 s |
| Block wind-up (holding Std or Spd / holding Hvy) | 0.05 / 0.20 s |
| Possession clock | warn 8 s, dead at 10 s |
| **Balls per Classic match** (by total players) | 6 players: 4 balls; 10 players: 6 balls; 16 players: 8 balls. Default mix: 60% Standard, 25% Speed, 15% Heavy. |
| **Rules** | |
| Classic match | first to 4 rounds, or 10:00 |
| Round overtime start | 2:30 |
| Revive spawn delay / protection | 1.0 s / 1.0 s |
| Ultimate respawn | 6 s |
| Ultimate phases | Brawl 8:00, Last Stand 2:00 |
| Dynamic line warning / grace | 3 s / 1.5 s |
| Inflatable respawn | 30 s |

### 18.2 Epic backlog (for issue tracking)

Each epic becomes a GitHub milestone/label. Stories are sized S (< 1 day of agent work), M (1–3 days), or L (> 3 days, which should be split).

| Epic | Key stories | Phase |
|---|---|---|
| E01 Repo & CI | Tome-style scaffold + wrangler.jsonc (S), D1 create + 0001 migration (S), boundary check (S), CI (S), custom domain deploy (S) | 0 |
| E02 Sim core | fixed-step loop (S), Rapier world wrapper (M), player controller (L→split), stamina (S), trips (M) | 1 |
| E03 Ball mechanics | pickup (S), throw + spread (M), live/dead states (S), hit rules (M), catch (M), block (M), centerline (S) | 1 |
| E04 Rendering | Three.js scene & camera (M), outlines (M), ball trails/tints (S), ragdoll render (M), LOD & perf presets (M) | 1–3 |
| E05 Bots | input-driven bot shell (S), utility AI (L→split), difficulty (S), fill rules (S) | 1–2 |
| E06 Netcode | protocol & bitpacking (M), snapshots + delta (M), prediction/reconciliation (L), interpolation (M), ball forward-prediction (M), lag-comp catches (M), harness (M) | 2 |
| E07 Rooms & matchmaking | GameRoom DO + tickets (M), Directory DO + locationHint (M), room lifecycle (M), codes/URLs (S), quick play (M), join-in-progress (S), reconnect (M) | 2 |
| E08 Classic mode | rounds (M), revive queue (M), spectate (M), anti-stall (M), match end (S) | 3 |
| E09 Scoring & HUD | score events (M), kill feed (S), scoreboard (M), end screens (M), quick-chat wheel (S) | 3 |
| E10 Speed/Heavy balls | speed effects (M), heavy effects + reactions (M), heavy trip (S) | 3 |
| E11 Settings & onboarding | settings menu (M), keybinds (M), tutorial (M) | 3, 7 |
| E12 Accounts | port Tome auth lib + routes (M), sign-up flow + CoC (M), email verify/reset via Resend (S), sessions (S), profile (S), delete account (S) | 4 |
| E13 Chat & filter | chat channels (M), filter normalisation (M), NOPE + incidents (M), rate limits (S), mute/report (M) | 4 |
| E14 Admin dashboard | auth + 2FA (M), accounts view + actions (L), incident queue (M), reports (M), word list (S), audit log (S), live view (M) | 4 |
| E15 Economy | coin ledger (M), earnings calc (S), guest carry-over (S), shop (M), loadout (M), grants (S) | 4, 6 |
| E16 Arenas | export tool (M), Hypergym dynamic line (L), Neighborhood inflatables (L), City Block (M) | 5 |
| E17 Ultimate | FFA rules (M), respawn system (S), Last Stand (S) | 5 |
| E18 Social lobby | lobby map (M), team pads (S), host controls (M), mirror (S) | 6 |
| E19 Voice | China reachability spike (S), Cloudflare Realtime sessions or P2P signalling (M), proximity subscribe + spatial audio (M), controls & safety (M) | 6 |
| E20 Banners | slots in client (M), campaign admin (M), manifest delivery (S) | 6 |
| E21 Audio | audio engine + mixer (M), placeholder set (S), owner recording integration (M) | 1, 7 |
| E22 Ops | DO metrics + telemetry endpoint (M), latency probe page (S), usage/cost alerts (S), load test (M) | 0, 2, 7 |
| E23 Local Host mode (conditional) | host-side referee in Web Worker (M), WebRTC data channels + DO signalling (M), host migration or graceful end (M) | 2 |

### 18.3 Glossary
- **Live ball:** a thrown ball that hasn't touched the environment yet. It can knock players out.
- **Dead ball:** a ball that has touched the floor or environment. It's harmless (tinted light).
- **Knockout (KO):** eliminated for the round (Classic) or until respawn (Ultimate).
- **Trip:** temporary ragdoll or loss of control. It is not a knockout.
- **Revive:** a knocked-out player returns because a teammate made a catch.
- **Bounce-out:** a knockout by a deflected live ball.
- **Reconciliation:** the client corrects its predicted state to match the server's authoritative state.
- **Forward prediction:** showing a ball where it is *now* on the server, not where it was when the last snapshot was sent.
- **SFU:** Selective Forwarding Unit, a server that relays voice streams between players. Cloudflare Realtime provides one without us running a server.
- **Durable Object (DO):** a Cloudflare serverless object with its own memory and storage, created on demand. One `GameRoom` DO per match is the referee.
- **Server (in this plan):** the `GameRoom` Durable Object running on Cloudflare, not a machine anyone rents or maintains.
- **Referee:** the one authoritative copy of the simulation that decides hits, catches, and knockouts.
- **Local Host mode:** a fallback where one player's browser is the referee and others connect peer-to-peer.

---

*Next step:* the owner answers the remaining Priority-A questions (§17.1). Phase 0 then begins with the Tome-style scaffold and spikes S1–S4, where S2 (Shenzhen latency) is the most important.
