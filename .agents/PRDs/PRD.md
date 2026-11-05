# PRD: TAKE LIGHT — v1 (playable jetpack arena shooter)

**Document:** Product Requirements Document
**Product:** TAKE LIGHT
**Version:** v1 (MVP / playable prototype)
**Date:** 2026-11-05
**Status:** Draft for review
**Source docs:**
- `docs/2026-11-05-take-light-design.md` — approved design (approved 2026-11-05)
- `docs/take-light.plan.md` — 17-task implementation plan
- Repo: `C:\Users\h\Desktop\take-light` (greenfield, pre-scaffold)

---

## 1. Executive Summary

TAKE LIGHT is a browser-first, top-down 3D jetpack arena shooter set over a neon-dusk Afrofuturist Lagos. You are the last airborne rider — a cargo jetpack with a mounted railgun — fighting waves of rogue security drones that have seized the city's grid. As waves climb, your emergency light drains: later waves are fought in near-darkness lit only by tracers, drone glows, and the last neon. The title is the mechanic.

The v1 prototype prioritizes learning and fun over audience and monetization: a polished, juicy, immediately playable single-run arena loop — move, dodge, shoot, graze danger for multiplier, take hits, die, post a score, start another. The reference games are Skyscrap (telegraphed enemy combat fairness), Danfo Run (Nigerian identity + async leaderboard), and Abuja Driver (mobile UI patterns). The game is designed for landscape mobile-web play first, with desktop-browser as first-class secondary.

**Core value proposition:** A 3–5 minute, instantly-loadable, high-graphics arcade survival loop that feels great on a phone, is fair via telegraphed attacks, and hooks you with a weekly leaderboard and "one more run."

**MVP goal statement:** Ship a 60 fps, playable, leaderboard-connected TAKE LIGHT v1 on Techa's actual mid-tier Android phone where a full run ends with a real score on the live weekly board — polished enough that Techa wants to keep playing his own game.

---

## 2. Mission

**Mission statement:** Take the light back — build interactive, high-graphic browser games that run first on the mobile web, earn their wow through game feel, and make players want one more run.

**Core principles (5):**

1. **Mobile-first feel wins over cinematic spectacle.** If a control feels mushy on a phone, it fails — even if it works on desktop.
2. **Fairness is legible.** Every damaging attack is telegraphed ≥ 0.4s with a visible glow and a unique sound — players lose because they mistimed, never because they were surprised.
3. **Juice is the feature.** Muzzle flash, tracers, recoil, screen shake, hitstop, and pitch-varied positional audio are not polish on top; they *are* the product.
4. **Instant loop, zero friction.** Open link → landscape play → death → name entry → leaderboard → restart. No accounts, no installs, no dead-ends (even offline).
5. **Placeholder-first, solo + AI, free stack only.** Boxes/capsules and CC0 assets until the loop is fun; no paid engine, no bespoke art pipelines, no scope creep into RPG systems before the core is fun.

---

## 3. Target Users

### Primary Persona 1 — Mobile web player (Nigeria)
- **Description:** 16–35, Android Chrome on mid-tier Snapdragon-class hardware, plays arcade games in short bursts on mobile data.
- **Technical comfort:** High — comfortable with touch twin-stick games, low patience for installs/sign-ups.
- **Needs / pain points:**
  - Opens from a link; must be playable in landscape within seconds, not minutes.
  - Wants fair, readable action — skill-based losses, not cheap deaths.
  - Wants lightweight competition without accounts: name on a weekly board, personal bests.
  - Pain: mushy touch controls, sub-30 fps stutter, long load times on throttled 4G, portrait-lock hacks that break layout.

### Primary Persona 2 — Techa (solo developer + playtest owner)
- **Description:** Solo dev + AI pair. Wants to learn Three.js/game craft through a polished prototype he actually enjoys.
- **Technical comfort:** Expert with TypeScript/data; new to 3D games and mobile perf.
- **Needs / pain points:**
  - A clear, verifiable build order with cheap validation per task.
  - A real device (his own Android) as the perf bar, not an emulator.
  - Free/open-source assets only (Kenney/Quaternius, Poly Haven); Blender for tweaks.
  - Pain: art pipeline stalls, physics/WASM bloat, Supabase free-tier pauses killing the loop, scope creep (weapons trees, multiplayer).

### Secondary Persona — Desktop browser player
- **Description:** Plays on web via keyboard + mouse; Techa's original ask ("mostly play on the web").
- **Needs:** WASD + mouse aim + Shift/Space dash, no touch-stick UI clutter, same InputFrame behavior.

**Geography / language:** English UI, Nigeria-first audience. No real-brand or celebrity likeness.

---

## 4. MVP Scope

### In Scope
#### Core Functionality
- [ ] Playable arena loop: menu → wave run → death → score/name entry → leaderboard → restart (3–5 min typical run)
- [ ] Twin-stick controls with dash: dual virtual sticks (left move, right aim + autofire) on touch; WASD + mouse aim/hold-fire + Shift/Space dash on desktop
- [ ] Kinematic hover player: run/walk flight, dash burst with brief invulnerability, 3-hit shield, arena bounds clamp
- [ ] One weapon (railgun): pooled tracer bullets, fire rate/spread/recoil, autofire, light aim assist on mobile
- [ ] 3 enemy types with FSMs and telegraphs: Okada rusher (dive), Area Boy burst shooter (3-round bursts), Danfo Carrier heavy (slow spread orbs + pickup drop)
- [ ] Terrible-as-fair combat: every attack telegraphed ≥ 0.4s visually + audibly; no instant damage
- [ ] Wave director: budget-point escalation + special events (e.g., "Rush Hour" Okada swarm), seeded deterministic plans
- [ ] Blackout / dimming-grid setpiece: light intensity + emissive curve keys to wave number (near-dark by late waves)
- [ ] Scoring: per-drone kill points, close-call graze multiplier with decay, no-hit wave bonus
- [ ] Juice pass: muzzle flash, tracers, recoil, screen shake, 60 ms hitstop on kills, DOM damage numbers/hit markers
- [ ] DOM HUD/menus: glass panels (score, multiplier, wave, shield pips, dash cooldown), menu/pause/game-over, name entry, tabular numerals

#### Technical
- [ ] Fixed-timestep sim (60 Hz accumulator) + variable-rate render; resize handling
- [ ] Object pooling for bullets/particles/enemies; zero allocations in frame loop; `InstancedMesh` for tracers/props
- [ ] Low-poly dusk arena: water plane, highway, instanced pylons, fog, ACES tone mapping, bloom post pass, tilted follow camera (~50°), DPR capped
- [ ] Howler audio: pitch-varied positional SFX, telegraph sounds as information, first-input unlock, 1 CC0 ambient loop
- [ ] Minimal vitest suites: wave director math, scoring, pool behavior, score clamp table

#### Integration
- [ ] Supabase leaderboard: `runs` table + RLS (deny direct inserts), Edge Function plausibility clamp, weekly top-100 + personal bests
- [ ] Graceful-offline queue: localStorage cache of results/personal bests, sync on reconnect

#### Deployment
- [ ] PWA: installable, `display: standalone`, landscape-preferred, graceful portrait notice on iOS Safari
- [ ] Static deploy (Cloudflare Pages or Netlify) with env set; live leaderboard verified end-to-end

### Out of Scope
#### Core Functionality (future phases)
- [ ] Real-time multiplayer / co-op — leaderboard is the only competition
- [ ] Accounts/auth — anonymous name-entry only
- [ ] Weapon upgrade trees, multiple maps, story/campaign
- [ ] Boss fights (stretch goal, explicitly not v1 scope)
- [ ] App-store builds (Capacitor/Tauri wrappers after v1 feels good)
- [ ] Server-authoritative game simulation
- [ ] Additional enemies beyond the 3-roster, multiple weapons, power-up variety beyond Carrier pickup

#### Technical
- [ ] Physics engine (no WASM/physics lib in v1; kinematic + distance/raycast only)
- [ ] Full TDD / extensive test coverage (minimal suites only, per design)
- [ ] Bespoke character art / real-time LOD system (CC0 packs + recolor, Blender tweaks only)

#### Integration / Deployment
- [ ] Paid Supabase tier or custom auth; score posting via direct table inserts
- [ ] iOS orientation-lock / fullscreen APIs (not supported there; graceful fallback instead)

---

## 5. User Stories

**US1. As a mobile-web player in Nigeria, I want a fast, juicy jetpack shooter I can open from a link and play in landscape on my phone, so that I finish a 3–5 minute run, see my name on the weekly board, and start another one.**
- Example: I tap a shared link, rotate to landscape, tap Run, and within seconds I'm flying over a dusk lagoon highway dodging drones.
- Example: I die at wave 7, enter my name, see myself at #12 on the weekly top-100, and tap "One more run" without reloading.

**US2. As a mobile player, I want left-stick movement and right-stick aim with a dash button, so that twin-stick combat feels instant and precise without a keyboard.**
- Example: I push the left stick to fly, drag the right stick to aim, hold it to autofire, and tap Dash to burst through a dive with 0.3s invulnerability.
- Example: Aim assist nudges my shots toward the nearest drone within a small cone so aiming feels fair on a 360px-wide screen.

**US3. As a desktop player, I want WASD movement, mouse aim with hold-to-fire, and Shift/Space dash, so that the same game is fully playable without touch.**
- Example: I mouse-aim at a hovering Area Boy while strafing left with A, firing continuously, then Shift-dash to dodge its burst.
- Example: Both touch and desktop inputs produce identical `InputFrame` shapes in-game, so gameplay tuning is regime-agnostic.

**US4. As a player, I want every enemy attack to glow and sound for at least 0.4s before it fires, so that I can dodge fairly and learn patterns instead of dying to surprises.**
- Example: An Okada drone revs up a bright glow line before its dive lunge; I dash sideways and it misses.
- Example: An Area Boy charges with a visible glow and a unique spin-up sound before each 3-shot burst; I break distance before the burst lands.

**US5. As a competitive player, I want a weekly leaderboard with close-call bonuses and a personal best, so that I chase higher scores and replay to beat my own record.**
- Example: I graze a slow orb to trigger a close-call multiplier ×3, then chain kills while it decays.
- Example: My personal best (e.g., 12,400 at wave 8) shows on the HUD/game-over screen even when Supabase is unreachable, and syncs later.

**US6. As a player, I want waves to escalate and the lights to dim as I survive longer, so that later waves feel a distinct climax and the night closes in.**
- Example: At wave 10 the arena is near-dark, lit by my tracers and drone glows; kills are harder to track but more dramatic.
- Example: "Rush Hour" spawns an Okada swarm for 10 seconds — high intensity, high close-call income.

**US7. As a player, I want a run to end in a clean loop even if I'm offline, so that I can always see my best and try again without a dead-end.**
- Example: On airplane mode I finish a run, see "Personal best 12,400 (queued)", then reconnect and it posts to the weekly board automatically.

**US8. (Technical) As the builder, I want pooled entities, a fixed-timestep sim, and pure wave/scoring functions with vitest suites, so that 60 fps on mid-tier Android holds and balancing numbers can be tested without a browser.**
- Example: Same seed yields the same wave plan every run in `director.test.ts`.
- Example: `score.test.ts` verifies multiplier decay and no-hit wave bonus tables; `pool.test.ts` verifies pools never grow past capacity.

---

## 6. Core Architecture & Patterns

**High-level approach:** Vanilla TypeScript modules with a strict split — `game/` (simulation + Three.js rendering) and `ui/` (DOM-only) communicate only through a tiny pub/sub state store (`app/state.ts`). The sim runs on a fixed 60 Hz timestep; rendering is variable-rate. All per-frame spawning is pooled; deterministic wave/score logic is pure and separately unit-tested.

### Directory structure (planned — greenfield, no code yet)

```
src/
  main.ts            — boot: renderer, loop, state machine wiring only
  app/state.ts       — BOOT→MENU→RUNNING→GAMEOVER machine, tiny pub/sub store
  game/
    loop.ts          — fixed-timestep sim (60 Hz accumulator), variable render
    scene.ts         — arena, lights, fog, tone mapping, post FX
    camera.ts        — bird's-eye rig (~50° tilted follow), shake
    player.ts        — kinematic hover movement + dash + i-frames
    input.ts         — normalized vectors; DOM sticks + keyboard/mouse adapters
    pool.ts          — generic ObjectPool<T>; preallocate at boot
    bullets.ts       — pooled tracers (InstancedMesh), no per-frame allocation
    weapon.ts        — fire rate, spread, recoil, barrel transform
    enemy.ts         — FSM base: idle→telegraph→fire→cooldown→chase
    enemies/
      okada.ts       — fast rusher (rev-up glow → dive lunge → recover)
      areaboy.ts     — burst shooter (keep-distance strafing, 3-round bursts)
      carrier.ts     — slow heavy (slow spread orbs, drops pickup)
      orbs.ts        — pooled slow orbs
    director.ts      — PURE wave director (budget table + seeded RNG)
    blackout.ts      — wave→light-intensity/emissive curve (title mechanic)
    combat.ts        — plane distance checks, graze/close-call detection
    score.ts         — pure scoring math (multiplier, decay, wave bonus)
    audio.ts         — Howler wrapper, pitch-varied SFX, unlock-on-first-input
    postfx.ts        — bloom (UnrealBloomPass), mobile DPR cap
    props.ts         — danfo traffic / ambient props
  ui/
    store.ts         — game→DOM bridge (pub/sub only, no three.js)
    hud.ts / hud.css — glass HUD panels, shield pips, dash cooldown
    menus.ts         — menu / pause / game-over, name entry
    sticks.ts        — virtual sticks, floating origin, dead zones
    effects.ts       — DOM damage numbers / hit markers
  net/
    supabaseClient.ts — env-clamped client
    leaderboard.ts    — submit w/ offline queue, fetch weekly top-100 + PB
supabase/
  migrations/0001_init.sql        — runs table + RLS (deny direct inserts)
  functions/submit/index.ts       — Edge Function: plausibility clamp + insert
```

### Key design patterns & principles
- **Fixed-timestep simulation** (accumulator, 60 Hz) — gameplay math never scales by frame delta.
- **Object pools + zero-alloc hot loop** — bullets, flashes, drones, particles, orbs preallocated; exhausted pools reuse oldest.
- **FSM enemies** — base with `state/timer/enter/exit`; telegraph is a first-class state (≥ 0.4s).
- **Pure director/score functions** — deterministic per seed, unit-testable in Node.
- **Unidirectional store** — UI reads game state via pub/sub; game never writes to DOM; UI never imports `three`.
- **Kinematic collision** — flat-plane distance checks (bullet↔drone, orb↔player); enemies at fixed altitudes; no physics engine.

### Technology-specific patterns
- Three.js: flat-shaded low-poly + neon emissives, `InstancedMesh` for repeats, placeholder boxes/capsules first.
- DOM HUD: 100% DOM over canvas (glass panels, tabular numerals) — the reference games' signature look; no engine-generated UI.
- PWA: `touch-action: none`, safe-area padding, no portrait-lock hacks (graceful portrait notice instead).

---

## 7. Tools/Features (Core Feature Breakdown)

| Feature | Purpose | Key operations / details |
|---|---|---|
| **Player movement + dash** | Instant, juicy flight | Kinematic accel+drag; bounds clamp; dash burst w/ cost, cooldown, 0.3s i-frames; tilt on turn |
| **Dual-regime input** | Touch and desktop both first-class | Touch: left move stick, right aim+autofire stick, dash button, floating origin, dead zones, bullet magnetism. Desktop: WASD, mouse aim, hold-fire, Shift/Space dash. Output: single `InputFrame` struct |
| **Railgun + pooled tracers** | Core gunfeel, readable fights | Pooled `InstancedMesh` tracers with velocity+TTL; fire rate/spread/bullet speed; recoil kick (camera+model); additive muzzle-flash sprite pool |
| **Enemy FSMs (×3)** | Fair, telegraphed combat | All attacks telegraph ≥ 0.4s with glow + sound. Okada: spawn→chase→telegraph→dive→recover. Area Boy: strafe→charge (glow+spin-up)→burst×3→cooldown. Carrier: slow chase→spread orbs→pickup drop |
| **Wave director + Rush Hour** | Escalating, replayable runs | Budget-point waves, seeded RNG (deterministic), okada-swarm event; tuning constants for ~3–5 min good runs |
| **Blackout curve** | Title mechanic, climax | `wave → light intensity/emissive` easing into near-dark; enemy glows/tracers carry readability |
| **Combat + scoring** | Hits, shields, close-calls | Plane-distance hits; shield = 3 grace hits; dash i-frames; graze detection → multiplier event; multiplier decay; per-drone points; no-hit wave bonus |
| **Game-feel + audio** | The "I want to keep playing" bar | Screen shake, 60 ms hitstop on kills, DOM damage numbers + hit markers, bloom, pitch-varied positional SFX, audio unlock on first input, 1 CC0 ambient loop |
| **DOM HUD / menus** | Readable, zero-jank UI | Score, multiplier, wave, shield pips, dash cooldown; menu/pause/game-over; name entry (non-empty); tabular numerals; `.panel` glass CSS; 360 px-wide safe |
| **Leaderboard + offline queue** | Weekly competition, never dead-ends | Weekly top-100, personal bests, score submit via Edge Function clamp; localStorage queue synced on reconnect |
| **PWA + perf pass** | Installable, 60 fps on phones | `vite-plugin-pwa`, landscape-preferred standalone, `touch-action: none`, safe-area padding, DPR cap 2, allocation audit, < 10s first-playable on throttled 4G |

---

## 8. Technology Stack

- **Languages:** TypeScript (vanilla-ts template), SQL (Supabase migration), TypeScript (Edge Function).
- **Runtime/toolchain** (verified on this machine): Node `v22.18.0`, npm `10.9.3`, git `2.52.0.windows.1`. Package manager: npm.
- **Build/bundling:** Vite 7 (vanilla-ts), `npm run build` (type check + bundle), `npm run dev` for playtest, static deploy to Cloudflare Pages or Netlify.
- **3D/rendering:** Three.js (+ `@types/three`), UnrealBloomPass, ACES tone mapping, glTF/GLB + Draco + KTX2, Poly Haven HDRI, Kenney/Quaternius CC0 packs, Blender for tweaks.
- **Core deps:** `three`, `howler` (+ `@types/howler`), `@supabase/supabase-js`.
- **Dev deps:** `vitest`, `vite-plugin-pwa`, `@types/three`, `@types/howler`.
- **Testing:** `vitest` — pure-logic suites only (`director`, `score`, `pool`, clamp table). Validation commands per task: `npm run build`, `npx vitest run`, `npm run dev`.
- **Third-party integrations:** Supabase (hosted Postgres + Edge Functions + RLS) — Techa's existing project reused, not new infra. No paid engine.

**Versions note:** Exact `three`/`howler`/`@supabase/supabase-js` pins to be set at Task 1 scaffold (`npm create vite@latest . -- --template vanilla-ts`). No lockfile exists yet.

---

## 9. Security & Configuration

### Authentication / authorization
- **No user accounts.** Leaderboard is anonymous name-entry only — no sign-in, no PII.
- **Score integrity via Edge Function, not client trust:**
  - RLS on `runs` table denies direct INSERTs from the anon key, so the client cannot forge rows.
  - All writes go through `POST /functions/v1/submit`, which applies a plausibility clamp (max plausible score / min plausible time per wave) then inserts via the service key.
- **In-scope threats:** Forged scores via direct inserts (blocked by RLS + clamp), offline leaderboard gaps (local queue + sync), env leakage (anon key only in client; service key only in Edge Function).
- **Out-of-scope:** Real-time anti-cheat / server-authoritative sim (explicit non-goal), per-user rate limiting beyond the clamp, auth flows.

### Configuration management (environment variables)
| Variable | Use | Where |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Client `.env` (build-time) |
| `VITE_SUPABASE_ANON_KEY` | Anonymous key (RLS-guarded) | Client `.env` |
| `SUPABASE_SERVICE_KEY` (service role) | Insert via Edge Function only | Edge Function secret — never in client |
| `.env` gitignored | Prevent key commits | `.gitignore` (`node_modules`, `dist`, `.env`) |

### Deployment considerations
- Static build deployed to Cloudflare Pages or Netlify; Supabase project reused (Techa's existing), with local `supabase functions serve` for pre-deploy testing.
- Free-tier auto-pause mitigation: offline queue + local personal bests keep the loop alive; campaign traffic expected to keep the project awake.

---

## 10. API Specification

### 10.1 `runs` table (Postgres, via Supabase)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (pk, default `gen_random_uuid()`) | |
| `name` | `text` | Non-empty player name (entered once, stored locally + with score) |
| `score` | `int` | Final score after client math (server clamps) |
| `wave` | `int` | Wave reached |
| `duration_s` | `int` | Run duration in seconds |
| `created_at` | `timestamptz` | Server-set by Edge Function |

**RLS:** `SELECT` allowed for anon (read leaderboard); `INSERT/UPDATE/DELETE` denied for anon (denied except via Edge Function service key).

### 10.2 Edge Function `POST /functions/v1/submit`
- **Auth:** anon key (validated by Supabase); service key used server-side to insert.
- **Behavior:** Apply plausibility clamp (max plausible score / min plausible duration per wave) → clamp or reject implausible values → insert `runs` row → return clamped row.

**Request:**
```json
POST /functions/v1/submit
Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "name": "Ngozi",
  "score": 12400,
  "wave": 8,
  "duration_s": 212
}
```

**Response (201) — clamped row:**
```json
{
  "name": "Ngozi",
  "score": 11800,
  "wave": 8,
  "duration_s": 212,
  "created_at": "2026-11-05T18:00:00Z"
}
```

**Response (422) — implausible (e.g., score/time exceeds clamp ceiling):**
```json
{ "error": "IMPLAUSIBLE_SCORE", "message": "Score exceeds max plausible for wave 8" }
```

**Client behavior on failure/offline:** Cache `{name, score, wave, duration_s}` to `localStorage` queue; retry on reconnect.

### 10.3 `GET /rest/v1/runs` — weekly leaderboard (anon, read-only)
```http
GET /rest/v1/runs?select=name,score,wave,duration_s,created_at&order=score.desc&limit=100&created_at=gte.<week_start>
Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
```
Example response:
```json
[
  { "name": "Ngozi", "score": 12400, "wave": 8, "duration_s": 212, "created_at": "2026-11-05T18:00:00Z" },
  { "name": "Chinedu", "score": 11200, "wave": 7, "duration_s": 188, "created_at": "2026-11-05T18:02:00Z" }
]
```

### 10.4 Personal bests (client-local)
- Stored in `localStorage` (key: e.g. `take-light:pb`), read by HUD/game-over, synced when leaderboard fetch succeeds. No server endpoint in v1.

---

## 11. Success Criteria

### Functional requirements
- [ ] Full loop playable: menu → run → game over → leaderboard → restart
- [ ] Both input regimes produce identical `InputFrame` behavior (touch twin-stick + dash; WASD + mouse + Shift/Space)
- [ ] All 3 enemies spawn, telegraph ≥ 0.4s (glow + sound), and can be killed; Carrier drops a pickup
- [ ] Waves escalate via budget table; Rush Hour event fires; same seed ⇒ same wave plan
- [ ] Blackout curve reaches near-dark by late waves (~wave 10)
- [ ] Score math, graze multiplier + decay, no-hit bonus, and 3-hit shield behave per spec
- [ ] Leaderboard shows weekly top-100 + personal best; name entry is non-empty; offline queue syncs on reconnect
- [ ] Attacking the API directly: direct insert blocked by RLS; forged score (score/time beyond plausible) clamped/rejected

### Quality indicators
- [ ] `npm run build` clean (type check + bundle); `npx vitest run` green (director, score, pool, clamp)
- [ ] 60 fps steady on Techa's mid-tier Android in landscape; fps ≥ 55 with 4× CPU throttle at juice pass
- [ ] First playable < 10s on throttled 4G; allocation audit shows no per-frame allocation growth
- [ ] 360 px-wide layout has no jank; no portrait-lock hacks (graceful portrait notice on iOS)

### User experience goals
- [ ] A good run lands ≈ 3–5 min, skilled ~8–10 min; difficulty ramp playtested
- [ ] "I want to keep playing my own game" — Techa reports wanting another run after a full loop
- [ ] Every telegraph is both visible and audible; no surprise damage in any tested run
- [ ] No touch complaint about mushiness (landmark loss = MVP failure even if desk-playable)

---

## 12. Implementation Phases

### Phase 1 — Scaffold and Core Movement (Tasks 1–5)
- **Goal:** Runnable project + fixed-timestep loop + arena + player + input.
- **Deliverables:**
  - [ ] Repo scaffold (`npm create vite@latest`, deps, `.gitignore`, `git init` + first commit, docs copied in); `npm run dev` serves and `npm run build` passes
  - [ ] Fixed-timestep loop + BOOT/MENU state machine + fps/sim-tick dev overlay; resize handling; boot pool allocation hook
  - [ ] Placeholder dusk arena (water, highway, instanced pylons, lighting/fog, ~50° follow camera)
  - [ ] Hover player (kinematic accel/drag, bounds clamp, dash + i-frames, capsule + tilt)
  - [ ] Dual-regime input (`InputFrame` for both touch and desktop)
- **Validation:** `npm run build` clean; fps ≥ 120 on desktop in placeholder arena; manual keyboard drive + Chrome touch emulation produce identical frames.
- **Estimate:** Days (solo + AI; mostly wiring, low risk)

### Phase 2 — Combat, Waves, and Game Feel (Tasks 6–12)
- **Goal:** Fun, fair, juicy armed prototype — the core loop works.
- **Deliverables:**
  - [ ] Object pools + tracer bullets + muzzle-flash sprites (InstancedMesh)
  - [ ] Weapon feel (fire rate/spread/recoil)
  - [ ] Enemy FSM base + Okada rusher (telegraphed dive)
  - [ ] Area Boy + Danfo Carrier + slow orbs (bursts, spread, pickup drop) — all three live simultaneously
  - [ ] Combat + scoring math (hits, shields, graze, multiplier decay, wave bonus)
  - [ ] Wave director (seeded, budget-based, Rush Hour) + blackout curve
  - [ ] Juice + audio (shake, 60 ms hitstop, damage numbers, bloom, Howler SFX bank)
- **Validation:** Vitest green (pool caps, score/graze tables, director determinism, dark-curve check); hold-fire 30s heap flat; fps ≥ 55 with 4× CPU throttle; all telegraphs ≥ 0.4s manually checked.
- **Estimate:** 1–2 weeks (highest gameplay iteration; tune with real phone, not emulator)

### Phase 3 — Score, Leaderboard, and HUD (Tasks 13–14)
- **Goal:** Full loop with competition — death → name → board → restart.
- **Deliverables:**
  - [ ] Glass HUD + menu/pause/game-over + name entry (DOM-only, store-bridged)
  - [ ] Supabase `runs` table + RLS + submit Edge Function with plausibility clamp
  - [ ] Client submit/fetch + offline queue; personal bests (local + weekly top-100)
  - [ ] Vitest clamp-table suite
- **Validation:** Full MENU→RUN→GAMEOVER→MENU loop with zero jank at 360 px; `supabase functions serve` + curl proves direct insert blocked and forged score clamped; airplane-mode run posts on reconnect.
- **Estimate:** Days to 1 week (Edge Function + offline edge cases are the risk)

### Phase 4 — PWA, Assets, Tuning, and Ship (Tasks 15–17)
- **Goal:** Installable, polished, deployed v1 at 60 fps on the device bar.
- **Deliverables:**
  - [ ] PWA manifest + icons in `vite.config.ts`; `touch-action: none`; safe-area padding; portrait fallback; DPR cap; allocation audit
  - [ ] Real assets (Kenney/Quaternius recolor, Poly Haven HDRI, one character+jetpack model, danfo traffic ambient)
  - [ ] Tuning to design targets (good run 3–5 min, wave-10 near-dark, difficulty ramp); `README.md`; deploy static build; leaderboard live
- **Validation:** Lighthouse PWA pass; throttled-4G load < 10s; 60 fps on Techa's actual Android; full run posts to the live board. **v1 done.**
- **Estimate:** 1 week (art swap + device tuning are the swing tasks)

---

## 13. Future Considerations

**Post-MVP enhancements (explicitly deferred in design):**
- Boss fight (stretch goal) — designed after v1 loop is proven fun.
- Real-time multiplayer / co-op — requires server-authoritative sim; leaderboard remains the only competition until then.
- Weapon variety + upgrade trees, additional maps, story/campaign — only via a new brainstorm gate (no indie scope creep before the core loop sings).

**Integration opportunities:**
- Capacitor/Tauri wrappers for app-store builds (after v1 feels good).
- "Radio" flavor audio pass (ambient/vocal variety), extra CC0 ambient loops.
- Social/competitive layer: shareable weekly recap, friend boards, season events — without breaking anonymous-first identity.

**Advanced features for later phases:**
- Revisit chase-cam 3D as an optional mode — the 3D world/character survive the camera change.
- LOD/batching/render-scale tuning for lower-end devices; texture compression if real textures grow the bundle.
- Richer wave events (weather, blackout flicker, elite variants) keyed to the same director infrastructure.

---

## 14. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Mobile perf misses 60 fps bar** (bloom + instancing + DPR over budget) | Pooling/instancing from day 1; DPR cap + bloom cap in Phase 2; device test at Task 12 (not at the end); allocation audit in PWA pass |
| 2 | **Touch aim feels bad** (3D aim on a 360 px screen is famously hard) | Generous bullet magnetism; tune with real phone in Tasks 5/12, not emulator; dual-stick floating origin + dead zones |
| 3 | **Supabase free-tier pause kills the loop** (auto-pause → leaderboard fetch fails) | Offline queue + local personal bests (Task 14); loop never dead-ends offline; campaign traffic keeps project awake |
| 4 | **iOS Safari quirks** (no orientation lock/fullscreen) | Graceful portrait notice + screen-fit math (Task 15); Android is the must-hit bar, iOS is best-effort per design |
| 5 | **Art pipeline eats weeks** (bespoke models block gameplay) | Placeholder-first hard rule until Task 16; CC0 packs + recolor, Blender tweaks only; no bespoke modeling |
| 6 | **Scope creep** (PvP, weapons trees, story) | v1 roster locked in design doc; any addition goes back through a brainstorm gate before planning |

---

## 15. Appendix

### Related documents
- Design doc (source of truth): `docs/2026-11-05-take-light-design.md`
- Implementation plan (17 tasks): `docs/take-light.plan.md`
- This PRD: `.agents/PRDs/PRD.md`
- Reference games studied: Skyscrap (PixiJS 2D), Danfo Run (Three.js + DOM UI), Abuja Driver (Three.js + DOM UI)

### Repository / project structure (current + planned)
```
C:\Users\h\Desktop\take-light\
├─ docs/
│   ├─ 2026-11-05-take-light-design.md
│   └─ take-light.plan.md
├─ .agents/PRDs/
│   └─ PRD.md            ← this file
├─ src/                  ← (not yet created — Phase 1)
│   ├─ main.ts
│   ├─ app/state.ts
│   ├─ game/ (loop, scene, camera, player, input, pool, bullets, weapon,
│   │         enemy, enemies/{okada,areaboy,carrier,orbs}, director,
│   │         blackout, combat, score, audio, postfx, props)
│   ├─ ui/ (store, hud, menus, sticks, effects)
│   └─ net/ (supabaseClient, leaderboard)
├─ supabase/             ← (not yet created — Phase 3)
│   ├─ migrations/0001_init.sql
│   └─ functions/submit/index.ts
└─ public/               ← (not yet created — Phase 4: manifest, icons, assets)
```

### Key dependencies
- Three.js — 3D renderer (no paid engine)
- Vite 7 + vanilla-ts — bundler/dev (Node v22.18.0, npm 10.9.3)
- Howler — audio (pitch-varied positional SFX)
- `@supabase/supabase-js` — Postgres/Edge Functions/RLS + RLS-guarded anon key
- `vite-plugin-pwa` — installable PWA
- `vitest` — pure-logic test runner

### Naming / domain notes
- Working titles "Lagos Skies" (first) and "JETLAG" rejected — latter collides with *Jet Lag: The Game* (Wendover/Nebula) including playjetlag.com. "Take Light" chosen (Nigerian power-cut idiom); "Sky Agbero" / "Japa Jet" also clear but not chosen.
- Todos for implementation: exact tuning numbers, file/folder layout, linter config, shader/filter details, CC0 pack selection, final perf tricks — all left to the builder per design doc.
