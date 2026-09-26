# Duǒshǎn 躲闪 — Elite Dodgeball
## Detailed Project Plan

> **Status:** Draft v0.1, 2026-09-26. Built from `plans.md`.
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
13. [Technical Architecture (Proposal)](#13-technical-architecture-proposal)
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
| Platform | Desktop web browser (Chrome/Edge/Firefox/Safari), keyboard + mouse. Chromebooks are a first-class target. |
| Access | Instant play as a guest. Optional account for chat, voice, skins, and Dodgecoins. |
| Modes | Classic (3rd/1st person toggle), Classic FPV (1st person locked), Ultimate (free-for-all). Practice (offline vs bots). |
| Players | Classic up to 8v8. Ultimate up to 8. Bots fill a match up to 6 players. |
| Balls | Standard (red), Speed (orange), Heavy (blue). New balls can be added later. |
| Arenas | Classic Gym, Hypergym, Neighborhood, City Block (Ultimate). |
| Social | Room codes and share URLs, walk-around pre-match lobby, text chat, proximity voice (accounts only). |
| Safety | Word filter ("NOPE"), incident logging, admin dashboard for renames, warnings, and bans. |
| Ops | Ad-free. A banner framework carries school messages. Content (arenas, skins, balls) is added without touching account data. |
| Reach | Must be playable from mainland China. English only. |

**Success:** students choose it over ad-riddled web games, and adults enjoy it too. §15.4 lists measurable proxies.

---

## 2. Design Pillars

Use these to settle design arguments. If a feature doesn't serve at least one pillar, cut it.

1. **Skill over spam.** Timing, movement, and reads beat clicking fast. Wind-ups, catch windows, and limited sprint reward commitment and punish panic. (The model is Mordhau/Chivalry, not Call of Duty.)
2. **Physics is the comedy.** Ragdolls, trips, faceplants, and flying inflatables should produce stories students retell at lunch. The comedy must never make outcomes feel random: *knockouts* are rules-based and readable, while *falls* are the physics show.
3. **In a game in 10 seconds.** Open a URL, click Play, and you're throwing. No install, no account, no ads, no long loads.
4. **Fair on school Wi-Fi.** Low-end Chromebooks and congested networks are the baseline, not an edge case.
5. **Safe by default.** Guests can't talk. Accounts are accountable. The owner can see and act on what happens.

---

## 3. Target Players, Hardware, and Networks

### 3.1 Players
- **Primary:** students at the owner's school. They play in short sessions (breaks, lunch, after school), often with friends in the same room.
- **Secondary:** adults (staff, parents, the wider public through the owner's domain).
- **Skill spread:** very wide. Bots, easy-to-read rules, and the comedy keep beginners engaged. Catch/block timing and movement tech give experts depth.

### 3.2 Minimum hardware (performance budget baseline)
| Item | Target |
|---|---|
| Reference device | Low-end Chromebook (Intel Celeron/MediaTek class, 4 GB RAM, integrated GPU) |
| Frame rate | 60 fps at 720p on the reference device with "Low" preset; dynamic resolution allowed down to 540p |
| Memory | < 500 MB browser tab |
| Initial download | < 10 MB compressed before the first match can start (arena assets stream after) |
| Time to first throw | < 10 s from page open on a 10 Mbps connection |
| GPU API | WebGL2 required; WebGPU optional later |

### 3.3 Networks
- **School networks** often block UDP and non-443 ports and run web filters (GoGuardian, Securly, and similar). All gameplay traffic must work over **TLS on port 443**, and the domain may need allow-listing by school IT.
- **Mainland China:** Google services (Fonts, reCAPTCHA, Analytics, Firebase), Discord, and many CDNs are blocked or unreliable. Nothing on the critical path may depend on them (§13.9).
- **Latency target:** feels good at ≤ 80 ms RTT, still playable at 150 ms, degrades gracefully to 250 ms.

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
- Single player versus bots in any arena and mode. It runs fully in the browser with no server needed (§13.3).
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
- The full simulation runs in a **Web Worker** on the client, using the same simulation package as the server (§13.3). It works offline once the assets are cached.

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
- **Technology:** a WebRTC SFU with client-side spatialisation (§13.6).

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
  5. A 6-digit code is emailed to the player to confirm the address.
  6. The account is created. It gets the bonus uniform and a welcome message.
- **Login:** email + password. A "remember me" session cookie lasts 30 days.
- **Password reset** works by emailing a code.
- **Display names:** 3–16 characters, drawn from letters, numbers, spaces, underscores, and hyphens. They are unique ignoring case. A player can change their own name once every 30 days **[DECISION]**. Admins can rename anyone at any time (§10.3).
- **Deleting an account:** players can delete their own account from settings. Their personal data is removed, and chat incident logs are anonymised but kept for the retention period (§10.6).
- **Passwords** are hashed with Argon2id. Login and sign-up are rate-limited. A captcha that works in China is used on sign-up only (§13.9).

### 10.2 Roles
| Role | Can do |
|---|---|
| Guest | Play, quick-chat, see chat |
| Player (account) | Plus text/voice chat, earn and spend coins, profile |
| Moderator (e.g. other trusted staff) **[DECISION]** | Review incidents and reports, warn, mute, temp-ban, rename |
| Admin (owner) | Everything, plus permanent bans, coin/item grants, content and banner management, moderator management |

Moderator and admin logins require **TOTP two-factor authentication**. Every admin action is written to an **audit log**.

### 10.3 Admin dashboard
A separate web app at `/admin` on its own subdomain.

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
- **Children's data:** see Risk R4 and Open Question Q-S1. Depending on the players' ages and locations, laws such as COPPA (US, under 13), PIPL (China, where under-14 data is "sensitive"), and GDPR-K may apply. **The owner should confirm the approach with the school** before accounts launch.

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
- **Lighting:** baked lighting (lightmaps or vertex AO) plus one dynamic directional shadow for players and balls only, which is cheap on Chromebooks. The "Low" preset turns off the dynamic shadow and uses a blob shadow instead.

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
- The admin uploads an image (it's automatically converted to WebP and must be ≤ 200 KB) and sets:
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

## 13. Technical Architecture (Proposal)

> `plans.md` says "To be completed — ask me about this." This section is a **recommendation** with rationale. [§17.1](#171-technology) lists the specific decisions that need the owner's input.

### 13.1 Recommended stack

| Layer | Recommendation | Why | Alternatives |
|---|---|---|---|
| Language | **TypeScript** everywhere | The simulation code can be shared between client, server, and practice mode. One language. | — |
| Rendering | **Three.js** (WebGL2) | Small, mature, performant on low-end GPUs, full control | Babylon.js (heavier, more batteries included); PlayCanvas |
| Physics | **Rapier 3D (WASM)** | Fast, runs identically in browser and Node, supports joints for ragdolls, has deterministic mode | Havok (via Babylon); cannon-es (slower, JS) |
| Client build | **Vite** | Fast builds, good code-splitting for arena assets | — |
| UI (menus/HUD) | **Preact** or plain DOM + CSS | Tiny bundle, easy menus | React (bigger), Svelte |
| Game server | **Node.js 22 LTS**, custom room server | Runs the same TS simulation authoritatively | Colyseus (rooms/matchmaking built in, but its state sync fights custom prediction); Rust/Go (no shared sim code) |
| Transport | **WebSocket over TLS (443)**, binary messages; **WebTransport** later as an optional upgrade | WebSocket works through school firewalls and in China. WebTransport (UDP/QUIC) is lower latency but often blocked on school networks. | geckos.io (WebRTC data channels, UDP) |
| API server | **Node + Fastify** | Accounts, shop, moderation, banners | — |
| Database | **PostgreSQL 16** | Relational data (accounts, ledger, incidents), reliable | — |
| Cache / presence | **Redis** (optional in phase 1) | Room directory across multiple game servers, rate limits | In-memory while there's one server |
| Voice | **LiveKit (self-hosted, open source)** WebRTC SFU | Self-hostable (works in China), token auth, selective subscription for proximity, TURN over TLS 443 | Agora (strong China presence, paid, a third party); mediasoup (lower level) |
| Admin app | **Preact/React + a simple component library** | Internal tool, doesn't need to be tiny | Server-rendered pages |
| Email | Transactional provider with good delivery to QQ/163/school domains (§13.9) | Account verification and recovery | — |
| Hosting | **Hong Kong** region VPS/cloud (§13.9) | Best latency for mainland China without an ICP licence | Singapore; mainland (needs an ICP licence) |
| Reverse proxy / TLS | **Caddy** | Automatic HTTPS, simple configuration | nginx + certbot |
| Error tracking | **Self-hosted GlitchTip** (Sentry-compatible) | Reachable from China, private | Sentry SaaS (reachability varies) |
| Analytics | **Self-hosted Umami/Plausible**, or none | No third-party trackers | — |
| CI/CD | **GitHub Actions** → Docker images → deploy script | The repository already lives on GitHub | — |
| Tests | **Vitest** (unit and simulation), **Playwright** (browser smoke and bot matches) | — | — |

### 13.2 System overview

```
                         ┌──────────────────────────────────────────────┐
  Browser (student)      │  Hong Kong region                            │
 ┌──────────────────┐    │                                              │
 │ Game client      │    │  ┌────────────┐   ┌──────────────────────┐   │
 │  Three.js render │HTTPS  │  Caddy     │──▶│ Static assets (+CDN) │   │
 │  Rapier predict  │──────▶│  TLS :443  │   └──────────────────────┘   │
 │  UI (Preact)     │    │  │            │   ┌──────────────────────┐   │
 │  Practice worker │ WSS│  │            │──▶│ API (Fastify)        │──┐│
 │  (sim + bots)    │──────▶│            │   │ accounts/shop/mod/   │  ││
 │                  │    │  │            │   │ banners/matchmaking  │  ││
 │  Voice (WebRTC)  │    │  │            │   └──────────────────────┘  ││
 └────────┬─────────┘    │  │            │   ┌──────────────────────┐  ││
          │              │  │            │──▶│ Game server(s) (Node)│──┤│
          │              │  └────────────┘   │ rooms, authoritative │  ││
          │  WebRTC/TURN │                   │ sim, bots, chat      │  ││
          └──────────────┼──▶┌───────────┐   └──────────────────────┘  ││
                         │   │ LiveKit   │   ┌──────────┐ ┌─────────┐  ││
                         │   │ SFU+TURN  │   │PostgreSQL│ │ Redis   │◀─┘│
                         │   └───────────┘   └──────────┘ └─────────┘   │
                         └──────────────────────────────────────────────┘
  Admin (owner) ──HTTPS──▶ admin.<domain> → API (role: admin/mod, TOTP)
```

### 13.3 Repository layout (monorepo, pnpm workspaces)

```
duoshan/
├─ apps/
│  ├─ client/          # Vite + Three.js game client, menus, HUD
│  ├─ server/          # Authoritative game server (rooms, netcode, chat relay)
│  ├─ api/             # Fastify: auth, profiles, shop, moderation, banners, room directory
│  └─ admin/           # Moderation & content dashboard
├─ packages/
│  ├─ sim/             # Shared game simulation: rules, movement, balls, Rapier world
│  │                   #   (runs in server, client prediction, and practice Web Worker)
│  ├─ protocol/        # Binary message schemas, bit-packing, versioning
│  ├─ content/         # Data definitions: balls, arenas, uniforms, modes (stable IDs)
│  ├─ bots/            # Bot AI → produces standard inputs
│  ├─ filter/          # Chat/name normalisation + matching (shared by server & api)
│  └─ shared/          # Math, constants, types, utils
├─ assets/             # Source art (MagicaVoxel .vox, Blender .blend), audio masters
├─ tools/              # arena-export, skin-check, audio-pack, load-test bots
├─ infra/              # docker-compose, Caddy, deploy scripts, backups
├─ docs/               # This plan, CoC, privacy policy, skins how-to, runbooks
├─ plans.md            # Original brief
└─ PROJECT_PLAN.md     # This file
```

The **key architectural bet** is that `packages/sim` is a pure, deterministic-as-possible simulation (`step(state, inputs, dt) → state + events`). It has no rendering and no networking. It runs:
- on the **server** as the authority
- on the **client** for prediction of the local player
- in a **Web Worker** for offline practice

It's also used in **headless tests**, where bot-vs-bot matches run in CI.

### 13.4 Simulation and netcode

| Parameter ◆ | Value |
|---|---|
| Server simulation tick | 60 Hz |
| Snapshot send rate | 30 Hz (20 Hz under load) |
| Client input send | Every tick, batched 2 per packet, plus the last 3 inputs repeated for loss resilience |
| Remote entity interpolation buffer | ~100 ms (adaptive to jitter) |
| Max lag compensation rewind | 200 ms |
| Target bandwidth | ≤ 20 KB/s down and ≤ 5 KB/s up per client at 8v8 |

**Model:** a server-authoritative simulation with client-side prediction and server reconciliation.

- **Local player movement:** the client predicts it immediately and reconciles against server snapshots. It replays unacknowledged inputs, and small errors are smoothed over about 100 ms.
- **Remote players:** interpolated between snapshots, so they are shown slightly in the past.
- **Balls in flight — the hard part:**
  - Ballistic flight is predictable, so clients **forward-predict flying balls to the estimated current server time** instead of interpolating them in the past. Players then see incoming balls *where they actually are*, which is essential for dodging and catch timing.
  - When a ball hits something, the server's authoritative event corrects the client, and the correction is smoothed.
  - **Your own throw** appears instantly on your client, predicted from your input. The server confirms it with a network ID. If the server rejects the throw (for example, because you'd been knocked out before throwing), the predicted ball fades out.
- **Catch and block adjudication (favour the defender, bounded):**
  - Each input carries the client's tick number.
  - The server validates a catch or block attempt against the ball's position at the tick the defender *saw*, using server-side history rewound by up to 200 ms.
  - If the catch was valid from the defender's view and the ball has not yet been confirmed as hitting anyone else in the meantime, the catch wins.
  - This resolves the classic "I caught it on my screen" complaint.
- **Hits on players:** evaluated in present server time against server-side hitboxes. Forward-predicted balls keep this consistent with what dodgers see.
- **Ragdolls:**
  - **Knockout ragdolls are cosmetic.** Each client simulates them locally from a server event that carries the impact point, velocity, and random seed. Only the *knocked-out* state is authoritative. Knocked-out ragdolls don't affect live balls or players, which keeps them cheap and fair.
  - **Trips are authoritative in effect, cosmetic in look.** The server tracks each tripped player as a simple capsule that slides or tumbles to a rest position and runs the timer. Clients render a ragdoll that is loosely constrained to that capsule.
  - This rule matters for the centerline: crossing the line during a trip uses the server capsule.
- **Physics props** (Neighborhood inflatables): simulated by the server and interpolated on clients. Ownership is never transferred.
- **Determinism:** Rapier's cross-platform determinism is used where possible, so reconciliation errors stay tiny. Correctness never *depends* on determinism, because the server is always the authority.
- **Protocol:**
  - Binary, bit-packed messages with quantised positions (1 cm) and rotations (smallest-three quaternions).
  - Delta-compressed against the last snapshot the client acknowledged.
  - A version handshake means old clients are asked to refresh after a deploy.
- **Anti-cheat (server authority covers most of it):**
  - The server validates inputs: move vectors are clamped, and view angles can change at most a set amount per tick.
  - The server alone decides throws, catches, and knockouts. Clients can't teleport, speed-hack, or spawn balls.
  - Aim-assist cheats are possible (as in any shooter) but have less impact here, because wind-up, spread, and travel time dominate outcomes. Reporting is the backstop.
  - Rate limits apply to messages, room creation, and room-code guessing.

### 13.5 Game server design
- A single Node process hosts many rooms, and each room runs its own fixed-step loop. Rooms are pinned to worker threads (one per CPU core) so that one room's slow tick can't stall the others.
- **Capacity estimate** ◆: one core runs 8–15 Classic rooms at 16 players, because the server has no ragdolls, only capsules plus balls. A 4-vCPU server therefore handles about 400+ concurrent players. **This must be measured** with a load-test bot harness in Phase 2.
- **Room lifecycle:** Lobby → Countdown → Round (Active) → Round End → … → Match End → back to Lobby (the same room code persists so friends can rematch).
- **Matchmaking** lives in the API. It keeps a room directory (in memory, or in Redis once there are multiple servers) and returns `{server URL, room ID, join token}`.
- **Chat relay** runs in the game server, which applies the filter from `packages/filter`. Incidents are posted to the API asynchronously.

### 13.6 Voice architecture
- The API issues **LiveKit tokens** only to accounts in good standing that have voice enabled. Each room code maps to a LiveKit room.
- **Proximity:** every client subscribes only to the audio tracks of participants within 30 m, using positions from game snapshots. It spatialises them with Web Audio, which saves bandwidth and CPU on Chromebooks.
- **Team radio and knocked-out channels** are implemented as subscription rules plus volume logic on the client. The server enforces permissions through LiveKit token grants and track subscription permissions.
- **TURN over TLS on 443** gets through school firewalls.

### 13.7 Data model (initial)

```
accounts(id, email UNIQUE, email_verified_at, display_name, display_name_lower UNIQUE,
         password_hash, skin_tone, role, created_at, last_seen_at, voice_enabled,
         voice_revoked, text_muted_until, deleted_at)
sessions(id, account_id, created_at, expires_at, ip_hash, user_agent)
email_codes(id, account_id|email, purpose[verify|reset], code_hash, expires_at, used_at)
name_history(id, account_id, old_name, new_name, changed_by, reason, changed_at)

items(id TEXT PK /* stable slug e.g. 'uniform.sportsday_2026' */, kind, rarity,
      price_coins, released_at, retired_at, metadata JSONB)
entitlements(account_id, item_id, source[starter|shop|grant|event], acquired_at,
             PRIMARY KEY(account_id, item_id))
loadouts(account_id PK, uniform_item_id, accessory_item_id, ...)
coin_ledger(id, account_id, delta, kind[earn|spend|grant|refund|adjust], reason,
            match_id NULL, admin_id NULL, created_at)   -- balance = SUM(delta), cached on accounts

matches(id, room_code, mode, arena_id, started_at, ended_at, result JSONB)
match_players(match_id, account_id NULL, guest_label NULL, team, score, kos, catches,
              blocks, assists, coins_awarded)

chat_incidents(id, match_id, round_no, room_code, created_at, status[open|actioned|dismissed],
               reviewed_by, reviewed_at, resolution_note)
chat_incident_messages(incident_id, seq, sent_at, account_id, display_name, team,
                       channel, original_text, delivered_text, flagged BOOL)
reports(id, reporter_id, reported_id, match_id, category[text|voice|name|cheating|other],
        note, created_at, status, context JSONB)
moderation_actions(id, account_id, action[warn|mute_text|mute_voice|revoke_voice|ban|unban|rename],
                   reason, expires_at, acknowledged_at, created_by, created_at)
banned_words(id, pattern, match_type[word|substring], language, created_by, created_at)
allowed_words(id, word)

banner_campaigns(id, title, image_url, link_url NULL, slots TEXT[], audience,
                 starts_at, ends_at, weight, created_by, views, clicks)

audit_log(id, actor_id, action, target_type, target_id, details JSONB, created_at)
```

Design rules for content-safe accounts (per spec, "accounts must not be affected by content updates"):
- Items use **stable string IDs** that are **never reused or deleted**. They are only *retired* (hidden from the shop, still owned and equippable).
- If a loadout references a missing item, the client falls back to the basic uniform and never errors.
- **Database migrations** are versioned (e.g. with Kysely/Drizzle migrations) and are additive by default.

### 13.8 Security checklist
- Argon2id password hashing. Sessions live in httpOnly, Secure, SameSite=Lax cookies, with CSRF tokens on state-changing API calls.
- Game-server join uses short-lived signed **join tokens** (JWT, 60 s) issued by the API. Guests get a signed guest token.
- Rate limits cover login, sign-up, chat, room creation, and code lookup.
- Admin has TOTP 2FA, an IP allow-list option, an audit log, and a separate subdomain.
- Uploaded banner images are re-encoded server-side, which strips metadata and any payloads.
- There is a Content-Security-Policy with no inline scripts, and dependency scanning via Dependabot.
- Nightly encrypted **database backups** go off-server. Restores are tested monthly.

### 13.9 China reachability plan
- **Hosting:** Hong Kong, on a provider with **CN2 GIA / premium China routing**. Candidates include Alibaba Cloud HK, Tencent Cloud HK (Lighthouse), and HK VPS providers with CN2 GIA. Typical RTT from Shanghai/Shenzhen is 20–60 ms, and from Beijing 40–80 ms.
  - Hosting *inside* mainland China would give the best latency, but it needs an **ICP filing (备案)**, which in practice requires a mainland entity or resident and a mainland host. This is **not recommended for v1**.
- **No blocked dependencies:**
  - fonts are self-hosted
  - no Google APIs, reCAPTCHA, Firebase, or YouTube embeds
  - no third-party analytics
  - the captcha must work in China, e.g. self-hosted **Cap / ALTCHA proof-of-work** (no third party) **[DECISION]**
- **CDN:** static assets are served from the HK origin at first. If needed later, a CDN with good China performance (Cloudflare's China Network needs an Enterprise plan and ICP, so it's unsuitable) or Alibaba/Tencent HK edge can be added.
- **Email:** deliverability to QQ/163/126 inboxes matters. Candidates include Alibaba Cloud DirectMail (HK/SG regions), AWS SES (ap-east-1 Hong Kong), and Postmark. SPF, DKIM, and DMARC must be configured. Send a small test to each major Chinese provider before launch.
- **Continuous testing:** a synthetic probe from a mainland vantage point (a cheap mainland cloud VM, or a teacher's machine at school) checks page load and WebSocket RTT daily and alerts on regressions.
- **Regulatory note (not legal advice):** online games offered *to the public in mainland China* have licensing and minor-protection requirements. A free, non-commercial school game hosted outside the mainland is lower-profile, but it still carries a risk that the owner should consider with the school (Risk R5).

### 13.10 Observability
- **Server metrics:** tick duration (p50/p99), rooms, players, bandwidth, reconciliation corrections, catch/block rewind usage. These go to Prometheus + Grafana, or a lightweight hosted alternative that is reachable from China.
- **Client telemetry** (anonymous, aggregated): fps, frame time p95, RTT, packet loss, and the device GPU string (bucketed). It drives graphics defaults and the Chromebook budget.
- **Error tracking:** self-hosted GlitchTip, with source maps.
- **Uptime:** an external ping that alerts the owner by email or push.

### 13.11 Testing strategy
| Level | What | Tooling |
|---|---|---|
| Unit | Rules (hit, catch windows, centerline, scoring), filter normalisation, ledger math | Vitest |
| Simulation | Headless bot-vs-bot matches (1,000 rounds per night): no crashes, no stuck balls, win rates balanced across sides, no NaNs | Vitest + `packages/sim` |
| Netcode | Simulated latency, jitter, and loss (50/150/250 ms, 0–5% loss). Checks catch-favouring bounds, reconciliation error, and bandwidth budgets. | Custom harness |
| Load | 500 headless bot clients against a staging server, measuring tick time and CPU | `tools/load-test` |
| Browser smoke | Load the page, play a practice round, join by code | Playwright (CI, Chromium) |
| Performance | Automated frame-time capture on a reference scene, with regressions failing CI above +10%. Manual checks on real Chromebooks before each release. | Playwright + a perf scene |
| Playtests | Scheduled sessions with students (§15.3) | Survey + telemetry |

### 13.12 Environments and deployment
- **Local:** `pnpm dev` runs client, server, API, Postgres (Docker), and LiveKit (optional).
- **Staging:** a small VPS that updates on every merge to `main`. It's for internal and playtest use.
- **Production:** deployed by tag. The server sends a "restart in N minutes" broadcast, drains rooms (new matches go to the new version), and switches over. A client-version handshake forces a refresh when the protocol changes.
- **Cost estimate** ◆ (monthly, USD):
  - game + API VPS in HK (4 vCPU / 8 GB): $40–80
  - LiveKit VPS: $30–60
  - backups and object storage: $5
  - email: $0–15
  - domain: about $1
  - **Total: about $80–160/month** at school scale

---

## 14. Live Operations and Content Updates

### 14.1 Principle
New arenas, uniforms, and balls are **additive data plus assets**, deployed without schema changes and without touching accounts. Free materials go out only through explicit admin grants (per spec).

### 14.2 Content definitions (`packages/content`)
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
- Answer the Priority-A open questions (§17).
- Set up the monorepo, lint/format/typecheck, CI, and a staging VPS in HK.
- **Spike 1:** a Rapier ragdoll plus 16 capsules and 12 balls in Three.js on a real low-end Chromebook. Measure fps.
- **Spike 2:** WebSocket RTT and jitter from school (and from mainland China) to the HK VPS.
- **Spike 3:** a minimal predicted-movement plus server-ball-throw prototype at 150 ms of simulated latency.

**Exit criteria:** 60 fps is achievable on the reference Chromebook, RTT from school is ≤ 80 ms p50, and the stack is confirmed.

#### Phase 1: "Feel" Prototype, offline (Weeks 3–7)
**Goal:** the core verbs are fun in single player against bots.
- `packages/sim`: movement (run, sprint, crouch, slide, jump), stamina, trips.
- Standard ball: pickup, throw (quick and aimed), catch, block, live/dead states, hit rules, centerline rule.
- Ragdoll knockouts, team outlines, and the first- and third-person camera.
- Greybox Classic Gym.
- Basic bots (fetch, throw, dodge).
- A minimal HUD (held ball, stamina, catch-window feedback) and placeholder audio.
- Practice mode in a Web Worker.

**Exit criteria:** 5+ students play it and ask to play again. The catch/block feel is tuned. There's a gameplay video of the owner's favourite moments.

#### Phase 2: Networked Core (Weeks 8–12)
**Goal:** low-latency online play that feels fair.
- The game server with rooms, a fixed tick, and snapshots with delta compression.
- Client prediction and reconciliation, entity interpolation, forward-predicted balls, and catch/block lag compensation.
- Room codes, share URLs, Quick Play, bot fill to 6, join-in-progress, and reconnect.
- The load-test harness and netcode test harness, plus a capacity measurement.

**Exit criteria:** an 8v8 playtest (with bots filling in) at school feels fair, and there are no "I caught it on my screen" complaints above a small threshold. The server tick p99 stays under 8 ms per room.

#### Phase 3: Classic Complete → **ALPHA** (Weeks 13–16)
**Goal:** a complete Classic match loop, playable by students.
- Rounds, revive-on-catch, the return queue, spectating, possession clock, overtime, match end, and sudden death.
- Scoring, kill feed, special KOs, and the scoreboard and end-of-match screens.
- **Speed and Heavy balls** with their full effects.
- The Classic FPV mode, the settings menu (sensitivity, FOV, keybinds, graphics presets, audio), and the quick-chat wheel.
- A first art pass on Classic Gym and the character rig with the basic uniform and skin tones.
- Performance pass 1 on Chromebooks.

**🚩 ALPHA RELEASE (~end of January 2027):** guests only, quick-chat only, Classic and Classic FPV in the Gym, shared with a limited group of students by URL.

#### Phase 4: Accounts, Chat, and Moderation (Weeks 17–21)
**Goal:** safe social features.
- The API with sign-up (CoC + data use screens), email verification, login, reset, and sessions.
- Text chat with channels, rate limits, the filter, NOPE replacement, and incident transcripts.
- The admin dashboard: accounts, rename, warn, mute, ban, the incident queue, reports, the word list, and the audit log with 2FA.
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
- Proximity voice via LiveKit, with PTT, mutes, reports, revoke, kill switch, and schedule.
- The shop and loadout, uniform authoring template and validator, and the first owner-made uniforms.
- The banner/campaign system in the menu, loading screen, lobby, and arenas.
- Admin tools for content (grant items, schedule campaigns, events).

#### Phase 7: Polish, Audio, and Launch → **1.0** (Weeks 33–37)
- **The owner's recorded audio** goes in (per spec, before going properly live), plus the final mix.
- Performance pass 2, accessibility pass, and tutorial/onboarding (a 60-second interactive "Coach" tutorial).
- Security review, backup and restore drill, load test at 3× expected peak, and China reachability verification.
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
| p95 frame time on reference Chromebook | < 20 ms | < 16.7 ms |
| Median RTT from school | < 80 ms | < 60 ms |
| "Would you recommend it to a friend?" (playtest survey, 0–10) | 7 | 8.5 |
| Moderation incidents resolved within 48 h | — | 95% |

### 15.5 Definition of Done (every feature)
- Implemented in `sim` (if it's gameplay) with unit tests. Headless bot matches stay green.
- It works in online and practice modes.
- It's in the performance budget on the reference Chromebook.
- Placeholder or final audio and visual feedback exist, so no silent actions.
- Relevant settings and keybinds are exposed. Admin tooling exists if the feature creates moderation or content needs.
- Docs are updated (player-facing help and/or the owner runbook).

---

## 16. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Netcode feels unfair**, especially catches and blocks at school latency | High | Critical | Forward-predicted balls, defender-favoured bounded rewind, the Phase 2 harness, early playtests. The server is in HK, close to players. |
| R2 | **Chromebooks can't hold 60 fps** with physics and ragdolls | Medium | High | Phase 0 spike on real hardware, cosmetic client ragdolls with a cap on active ragdolls (e.g. 6), Low preset, dynamic resolution, and a perf regression test in CI |
| R3 | **School network blocks the game** (web filter, WebSocket, WebRTC) | Medium | High | Everything on 443/TLS, TURN over TLS, and ask school IT to allow-list the domain early. Voice is optional. |
| R4 | **Children's privacy law and school policy** (COPPA/PIPL/GDPR-K, school IT policy) around accounts, email, and voice | Medium | High | Collect minimal data, voice off by default, no voice recording. **Confirm with school leadership before Phase 4.** Consider school-email-only sign-up or a teacher-issued code. |
| R5 | **China reachability or regulation**: GFW interference, blocked dependencies, game licensing rules | Medium | High | HK hosting with CN2, no Google or third-party dependencies, a daily mainland probe, a low profile (non-commercial, school-focused). Get advice if the game grows beyond the school. |
| R6 | **Voice chat abuse** can't be filtered | Medium | High | Accounts only, opt-in, PTT, mutes, reports, revoke, a kill switch and schedule. Voice ships last (Phase 6), and it can be cut if too risky. |
| R7 | **Ragdoll comedy undermines readability or fairness** | Medium | Medium | Knockouts are rules-based. Ragdolls are cosmetic. Trips use a server capsule. Heavy-ball trips are tuned in playtests. |
| R8 | **Scope creep** (4 arenas, 3 modes, voice, lobby, shop, banners) | High | Medium | Phase gates, the alpha comes first with a minimal feature set, and optional features (walkable lobby, voice) are explicitly cuttable for 1.0. |
| R9 | **Owner time constraints** (teaching load) block art, audio, and moderation | High | Medium | Placeholder-first pipeline, validator tools, recruit 1–2 staff moderators, and incident queue triage in under 10 min/day |
| R10 | **Word-filter evasion or false positives** | High | Low–Med | Normalisation, allow-list, live-editable lists, human review of incidents, reports |
| R11 | **Server costs or a traffic spike** if the game spreads beyond school | Low | Medium | Capacity measured in Phase 2, horizontal scaling via the room directory, and a cap on concurrent rooms with a friendly "servers full" message |
| R12 | **Cheating** (aim scripts, input macros) | Low | Medium | Server authority, input validation, reports, bans |
| R13 | **Balance of third person vs first person** (peeking) | Medium | Low | Server-side eye-origin visibility, and Classic FPV as a separate mode |
| R14 | **Physics non-determinism** causes visible prediction corrections | Medium | Low | Rapier deterministic build, smoothing, and authoritative correction. Correctness never depends on determinism. |
| R15 | **Email deliverability to Chinese mailboxes** | Medium | Medium | Choose a provider with HK/SG sending, SPF/DKIM/DMARC, test sends in Phase 4, and a support contact for manual verification |

---

## 17. Open Questions for the Project Owner

Priority **A** = needed before or during Phase 0. **B** = needed before the phase that builds the feature. **C** = can wait.

### 17.1 Technology
| ID | Pri | Question | Proposed default |
|---|---|---|---|
| Q-T1 | A | Are you comfortable with the proposed stack (TypeScript, Three.js, Rapier, Node, PostgreSQL, LiveKit)? Do you have preferences or existing experience (e.g. Unity/Godot web export, Babylon.js)? | Stack in §13.1 |
| Q-T2 | A | **Where are most players physically?** Mainland China (which city?), elsewhere, or mixed? This decides the server region. | Hong Kong |
| Q-T3 | A | What is the domain, and who controls its DNS? Will the game live at a subdomain (e.g. `play.<domain>`)? | `play.<domain>`, `admin.<domain>` |
| Q-T4 | A | What is the hosting budget per month? Is there a preferred cloud (Alibaba, Tencent, AWS, other)? | ~$80–160/mo, HK VPS |
| Q-T5 | A | Can you get **a representative low-end school device** (model?) for performance testing? Are school devices managed Chromebooks, Windows laptops, or personal (BYOD)? | Chromebook reference |
| Q-T6 | A | Does the school network use a web filter or firewall that might block WebSockets/WebRTC? Who is the IT contact? | Allow-list request in Phase 0 |
| Q-T7 | B | Should the game be playable **during school hours on school devices**, or is it an after-school/home game? This affects the voice schedule and IT involvement. | Both, with admin schedule toggles |
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
| Q-S1 | A | **What ages are the students**, and in which country or countries do they live? Has school leadership approved student accounts, email collection, and voice chat? | Confirm before Phase 4 |
| Q-S2 | B | Should sign-up be **restricted to school email domains**, open to anyone, or open with a school "verified" badge? | Open, with an optional school badge |
| Q-S3 | B | Will other staff act as **moderators**? | Yes, 1–2 staff |
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
| E01 Repo & CI | monorepo scaffold (S), lint/typecheck/test CI (S), staging deploy (M), Docker compose (S) | 0 |
| E02 Sim core | fixed-step loop (S), Rapier world wrapper (M), player controller (L→split), stamina (S), trips (M) | 1 |
| E03 Ball mechanics | pickup (S), throw + spread (M), live/dead states (S), hit rules (M), catch (M), block (M), centerline (S) | 1 |
| E04 Rendering | Three.js scene & camera (M), outlines (M), ball trails/tints (S), ragdoll render (M), LOD & perf presets (M) | 1–3 |
| E05 Bots | input-driven bot shell (S), utility AI (L→split), difficulty (S), fill rules (S) | 1–2 |
| E06 Netcode | protocol & bitpacking (M), snapshots + delta (M), prediction/reconciliation (L), interpolation (M), ball forward-prediction (M), lag-comp catches (M), harness (M) | 2 |
| E07 Rooms & matchmaking | room lifecycle (M), codes/URLs (S), quick play (M), join-in-progress (S), reconnect (M) | 2 |
| E08 Classic mode | rounds (M), revive queue (M), spectate (M), anti-stall (M), match end (S) | 3 |
| E09 Scoring & HUD | score events (M), kill feed (S), scoreboard (M), end screens (M), quick-chat wheel (S) | 3 |
| E10 Speed/Heavy balls | speed effects (M), heavy effects + reactions (M), heavy trip (S) | 3 |
| E11 Settings & onboarding | settings menu (M), keybinds (M), tutorial (M) | 3, 7 |
| E12 Accounts | sign-up flow + CoC (M), email verify/reset (M), sessions (S), profile (S), delete account (S) | 4 |
| E13 Chat & filter | chat channels (M), filter normalisation (M), NOPE + incidents (M), rate limits (S), mute/report (M) | 4 |
| E14 Admin dashboard | auth + 2FA (M), accounts view + actions (L), incident queue (M), reports (M), word list (S), audit log (S), live view (M) | 4 |
| E15 Economy | coin ledger (M), earnings calc (S), guest carry-over (S), shop (M), loadout (M), grants (S) | 4, 6 |
| E16 Arenas | export tool (M), Hypergym dynamic line (L), Neighborhood inflatables (L), City Block (M) | 5 |
| E17 Ultimate | FFA rules (M), respawn system (S), Last Stand (S) | 5 |
| E18 Social lobby | lobby map (M), team pads (S), host controls (M), mirror (S) | 6 |
| E19 Voice | LiveKit deploy (M), token service (S), proximity subscribe + spatial audio (M), controls & safety (M) | 6 |
| E20 Banners | slots in client (M), campaign admin (M), manifest delivery (S) | 6 |
| E21 Audio | audio engine + mixer (M), placeholder set (S), owner recording integration (M) | 1, 7 |
| E22 Ops | metrics (M), error tracking (S), backups (S), China probe (S), load test (M) | 2, 7 |

### 18.3 Glossary
- **Live ball:** a thrown ball that hasn't touched the environment yet. It can knock players out.
- **Dead ball:** a ball that has touched the floor or environment. It's harmless (tinted light).
- **Knockout (KO):** eliminated for the round (Classic) or until respawn (Ultimate).
- **Trip:** temporary ragdoll or loss of control. It is not a knockout.
- **Revive:** a knocked-out player returns because a teammate made a catch.
- **Bounce-out:** a knockout by a deflected live ball.
- **Reconciliation:** the client corrects its predicted state to match the server's authoritative state.
- **Forward prediction:** showing a ball where it is *now* on the server, not where it was when the last snapshot was sent.
- **SFU:** Selective Forwarding Unit, a server that relays voice streams between players.
- **ICP 备案:** China's website registration, required for hosting inside mainland China.

---

*Next step:* the owner answers the Priority-A questions in §17. Phase 0 then begins with repository scaffolding and the three technical spikes.
