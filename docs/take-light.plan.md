# Plan: TAKE LIGHT — v1 (playable jetpack arena shooter)

## Summary

Build the v1 prototype of TAKE LIGHT from the approved design
(`docs/2026-11-05-take-light-design.md`, repo-local): a top-down 3D
jetpack arena shooter over neon-dusk Lagos — Three.js + TypeScript + Vite, DOM
HUD/menus, pooled tracer bullets, FSM drones with telegraphed attacks, wave
director, dimming-grid setpiece, Supabase leaderboard, PWA. Greenfield repo at
`C:\Users\h\Desktop\take-light`; docs live in the repo's `docs/` folder.

## User Story

As a mobile-web player in Nigeria
I want a fast, juicy jetpack shooter I can open from a link and play in
landscape on my phone
So that I finish a 3–5 minute run, see my name on the weekly board, and start
another one.

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY (greenfield) |
| Complexity | HIGH (first 3D game · mobile perf bar · netcode-lite) |
| Systems Affected | game loop, rendering, input, combat, audio, UI (DOM), net (Supabase), PWA |
| Design doc | `docs/2026-11-05-take-light-design.md` (repo-local) |
| Jira Issue | N/A |

## Toolchain (verified on this machine)

Node v22.18.0, npm 10.9.3, git 2.52.0 — Vite 7 + vanilla-ts template. Package
manager: **npm** (not pnpm). Test runner: **vitest**.

## Patterns to Follow (greenfield — house rules distilled from the
reference teardowns + design doc; no local codebase exists yet)

### Architecture
```
// SOURCE: danforun.com bundle analysis (Vite hashed chunks; 56KB shell +
// lazy-loaded 1.4MB game) and design doc "Tech notes"
src/
  main.ts            — boot: renderer, loop, state machine wiring only
  app/state.ts       — BOOT→MENU→RUNNING→GAMEOVER machine, tiny pub/sub store
  game/loop.ts       — fixed-timestep sim (60 Hz accumulator), variable render
  game/scene.ts      — arena, lights, fog, tone mapping, post FX
  game/camera.ts     — bird's-eye rig, shake
  game/player.ts     — kinematic hover movement + dash + i-frames
  game/input.ts      — normalized vectors; DOM sticks + keyboard/mouse adapters
  game/pool.ts       — generic ObjectPool<T>; preallocate at boot
  game/bullets.ts    — pooled tracers (InstancedMesh), no per-frame allocation
  game/enemy.ts      — FSM base: idle→telegraph→fire→cooldown→chase
  game/enemies/*.ts  — okada (rusher), areaboy (burst shooter), carrier (heavy)
  game/director.ts   — PURE wave director (budget table + seeded RNG)
  game/blackout.ts   — wave→light-intensity curve (the title mechanic)
  game/combat.ts     — plane distance checks, graze/close-call detection
  game/score.ts      — pure scoring math (multiply, decay, wave bonus)
  game/audio.ts      — Howler wrapper, pitch-varied SFX, unlock-on-first-input
  net/supabaseClient.ts, net/leaderboard.ts — submit w/ clamp + offline queue
  ui/                — DOM HUD, sticks, menus, damage numbers; zero game logic
supabase/
  migrations/0001_init.sql        — runs table + RLS (deny direct inserts)
  functions/submit/index.ts       — Edge Function: plausibility clamp + insert
```

### Hard rules (each one enforced in review)
- **Pool everything that spawns per-frame** (bullets, flashes, drones,
  particles) — preallocated, zero `new` in the hot loop.
- **Game code never touches the DOM** and UI never imports three.js — they
  meet only in the state store (pub/sub).
- **Every attack is telegraphed ≥ 0.4 s** with a visible glow AND a sound.
- **Fixed-timestep sim**: gameplay math uses accumulator dt, rendering is
  free-running; never multiply gameplay by frame delta.
- Placeholder geometry first (boxes/capsules); real assets are a later task,
  never a blocker.

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `C:\Users\h\Desktop\take-light\**` | CREATE | whole repo per task list below (~25 files) |
| `<repo>\docs\take-light.plan.md` (this file) | UPDATE | tick off tasks as completed |
| `<repo>\docs\2026-11-05-take-light-design.md` | UPDATE | record any deviation made during the build |

## Tasks

Execute in order; each task is atomic and verifiable. **All paths are inside
`C:\Users\h\Desktop\take-light\` once Task 1 runs.**

### Task 1: Scaffold the repo
- **Action**: create project — `npm create vite@latest . -- --template vanilla-ts`,
  add deps `three howler @supabase/supabase-js`, dev deps `vitest vite-plugin-pwa
  @types/three @types/howler `; folder skeleton per house rules; `.gitignore`
  (`node_modules`, `dist`, `.env`); `git init` + first commit; copy design doc +
  plan into `docs/`.
- **Validate**: `npm run dev` serves, `npm run build` passes, `git log` has 1 commit.

### Task 2: Loop + state machine
- **Files**: `src/app/state.ts`, `src/game/loop.ts`, edit `src/main.ts`
- **Implement**: fixed-timestep accumulator (sim 60 Hz), resize handling,
  BOOT→MENU stub; boot-time pool allocation hook.
- **Validate**: `npm run build`; dev overlay shows fps and sim ticks.

### Task 3: Arena scene + camera rig
- **Files**: `src/game/scene.ts`, `src/game/camera.ts`
- **Implement**: water plane, highway strip, instanced pylon boxes, hemisphere +
  directional dusk rig, fog, ACES tone mapping, tilted follow camera (~50°).
  Placeholder-only.
- **Validate**: dev server shows dusk arena, fps ≥ 120 on desktop.

### Task 4: Player hover movement + dash
- **Files**: `src/game/player.ts`
- **Implement**: kinematic velocity model (accel + drag), arena bounds clamp,
  dash burst (cost, cooldown, 0.3 s i-frames), placeholder capsule + tilt.
- **Mirror**: house rules in this doc (fixed dt).
- **Validate**: manual keyboard drive-around.

### Task 5: Input system
- **Files**: `src/game/input.ts`, `src/ui/sticks.ts`, `src/ui/hud.css`
- **Implement**: pointer-event dual virtual sticks (left move, right aim with
  autofire), dash button, floating origin, dead zones; desktop WASD + mouse aim
  + hold-fire + Shift/Space dash; single `InputFrame` struct consumed by sim.
- **Validate**: Chrome touch emulation; both regimes produce identical
  InputFrame shapes.

### Task 6: Pooling + bullets
- **Files**: `src/game/pool.ts`, `src/game/bullets.ts`
- **Implement**: `ObjectPool<T>`; tracer bullets as InstancedMesh with
  velocity + TTL; additive muzzleflash sprites from pool.
- **Validate**: vitest — pool never grows past capacity, exhausted pool
  reuses oldest; manual: hold fire 30 s, heap stays flat in DevTools.

### Task 7: Weapon feel
- **Files**: `src/game/weapon.ts`
- **Implement**: fire rate, spread, bullet speed, recoil offset (camera + model
  kick), barrel point TransformNode.
- **Validate**: manual feel check vs design "game feel" bar.

### Task 8: Enemy FSM + Okada rusher
- **Files**: `src/game/enemy.ts`, `src/game/enemies/okada.ts`, `src/game/combat.ts` (stub)
- **Implement**: FSM base (state, timer, enter/exit); Okada: spawn→chase→
  telegraph glow ≥0.4 s→dive (dash-lunge)→recover; hp, hit flash, death FX pool.
- **Validate**: manual: dives telegraphed, kills register.

### Task 9: Area Boy + Danfo Carrier
- **Files**: `src/game/enemies/areaboy.ts`, `src/game/enemies/carrier.ts`,
  `src/game/enemies/orbs.ts`
- **Implement**: Area Boy — keep-distance strafing, burst of 3 telegraphed
  shots (glow + spin-up SFX); Carrier — slow, slow spread orbs, drops pickup
  on death (score burst / heal).
- **Validate**: all three live simultaneously without frame drops.

### Task 10: Combat + scoring math
- **Files**: `src/game/combat.ts`, `src/game/score.ts`
- **Implement**: plane-distance hits (bullet↔drone, orb↔player), shield = 3
  grace hits, dash i-frames; graze (close-call) detection → multiplier event,
  multiplier decay, per-drone points, no-hit wave bonus.
- **Validate**: vitest — score math + graze rules + multiplier decay tables.

### Task 11: Wave director + blackout
- **Files**: `src/game/director.ts`, `src/game/blackout.ts`
- **Implement**: budget-based waves + seeded RNG (deterministic), "Rush Hour"
  okada-swarm event, run-length target (good run ≈ 3–5 min) as tuning constants;
  light-intensity + emissive curve keyed to wave number.
- **Validate**: vitest — same seed ⇒ same wave plan; curve hits near-dark by
  late waves.

### Task 12: Game-feel + audio pass
- **Files**: `src/game/audio.ts`, `src/game/camera.ts` (shake), `src/ui/effects.ts`,
  `src/game/postfx.ts`
- **Implement**: screen shake, 60 ms hitstop on kills, DOM damage numbers +
  hit markers, bloom (UnrealBloomPass) with mobile DPR cap, Howler SFX bank with
  pitch variation, first-input audio unlock, 1 CC0 ambient loop.
- **Validate**: manual juice checklist; fps still ≥ 55 with 4× CPU throttle.

### Task 13: HUD + menus (DOM)
- **Files**: `src/ui/hud.ts`, `src/ui/menus.ts`, `src/ui/store.ts`
- **Implement**: glass HUD (score, multiplier, wave, shield pips, dash
  cooldown), menu / pause / game-over, name entry (save when 6+ chars? just non-empty),
  tabular numerals, Abuja-Driver-style `.panel` CSS, store bridging game→DOM.
- **Validate**: full loop playable MENU→RUN→GAMEOVER→MENU; no layout jank on
  360 px width.

### Task 14: Leaderboard (Supabase)
- **Files**: `supabase/migrations/0001_init.sql`,
  `supabase/functions/submit/index.ts`, `src/net/supabaseClient.ts`,
  `src/net/leaderboard.ts`
- **Implement**: `runs` table (name, score, wave, duration, created_at) + RLS
  deny direct inserts; Edge Function with plausibility clamp (max score/min
  duration per wave) applied then inserted via service key; client submits to
  function, caches offline (localStorage queue), fetches weekly top-100 +
  personal bests; env via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
  `.env`.
- **Validate**: `supabase functions serve` + curl — direct insert blocked,
  forged score clamped; vitest — clamp table; airplane-mode run submits on
  reconnect.

### Task 15: PWA + performance pass
- **Files**: `vite.config.ts`, `public/manifest.webmanifest`, icons, `src/main.ts`
- **Implement**: vite-plugin-pwa (installable, standalone display, landscape
  preferred), `touch-action: none`, safe-area padding, no portrait lock hacks
  (graceful portrait notice instead), DPR cap 2, texture compression only when
  real textures arrive, allocation audit pass, load budget: first playable
  < 10 s on throttled 4G.
- **Validate**: Lighthouse PWA pass; throttled-4G load; 60 fps on device bar.

### Task 16: Real asset pass
- **Files**: `public/assets/**`, `src/game/props.ts` (danfo traffic et al.)
- **Implement**: swap placeholders — Kenney/Quaternius packs, Poly Haven dusk
  HDRI, one character + jetpack model (Blender tweaks), moving danfo traffic as
  ambient life below the arena.
- **Validate**: build size + load budget still met; scene reads as "neon-dusk
  Lagos".

### Task 17: Tune, deploy, ship v1
- **Files**: tuning constants across `src/game/**`, `README.md`, host config
- **Implement**: playtest against design targets (good run 3–5 min, wave-10
  near-dark), difficulty ramp pass, deploy static build (Cloudflare Pages or
  Netlify, envs set), leaderboard live.
- **Validate**: Techa's actual Android phone: 60 fps, full run, score on the
  live board. **v1 done.**

## Risks

| Risk | Mitigation |
|------|------------|
| Mobile perf misses 60 fps bar | pool/instancing from day 1 (Tasks 6/9), DPR cap + bloom cap (12/15), device test at Task 12 not at the end |
| Touch aim feels bad | generous bullet magnetism (design note), tune in Task 5/12 with real phone, not emulator |
| iOS Safari quirks (no orientation lock) | graceful portrait notice + screen-fit math (Task 15), design already accepts best-effort |
| Supabase free-tier pause kills loop | offline queue + local personal bests (Task 14); campaign traffic keeps project awake |
| Art pipeline eats weeks | placeholder-first rule until Task 16; CC0 packs + recolor, no bespoke modeling |
| Scope creep (PvP, weapons trees) | v1 roster locked in design doc; any addition goes back through brainstorm gate |

## Validation

```bash
# per task (from repo root, after Task 1)
npm run build        # type check + bundle
npx vitest run       # pure-logic suites (director, score, pool, clamp)
npm run dev          # manual feel checks on desktop + phone (LAN)
```

## Acceptance Criteria

- [ ] All 17 tasks completed and validated
- [ ] `npm run build` clean; vitest suites green
- [ ] Full loop: menu → run → game over → leaderboard → restart
- [ ] 60 fps on Techa's mid-tier Android in landscape; graceful portrait on iOS
- [ ] Live leaderboard receives real scores; forged/clamped and direct-insert denied
- [ ] Design targets met: good run ≈ 3–5 min, blackout by late waves, telegraphs ≥ 0.4 s
