# TAKE LIGHT — Design Doc

> Date: 2026-11-05 · Status: designed + planned; docs handed to Techa at
> `C:\Users\h\Desktop\take-light\docs\` (2026-11-05) — build owned by Techa
> Brainstormed from a teardown of three reference games (play.skyscrap.fun,
> danforun.com, pega0x.itch.io/abuja-driver — Two are Three.js + DOM UI;
> Skyscrap is PixiJS 2D).
> Naming: "Lagos Skies" (first working title) and "JETLAG" were rejected —
> the latter collides with "Jet Lag: The Game" (Wendover/Nebula), including
> the playjetlag.com domain. "Take Light" (Nigerian power-cut idiom), "Sky
> Agbero" and "Japa Jet" were clear of collisions; Take Light chosen as the
> thematically load-bearing fit.

## Intent & Why

Techa wants to make interactive, high-graphics games that run in the browser
first, with desktop/mobile paths later. First project: a jetpack arena shooter
inspired by Skyscrap's telegraphed enemy combat and Danfo Run's Nigerian
identity + async leaderboard hook. Goal for v1 is **learning + fun**: a
polished, juicy playable prototype Techa actually enjoys, skills first,
audience and money later. Success = "I want to keep playing my own game."

## Goals

- Playable in a **mobile browser** (PWA, landscape) and desktop browser.
- 3D look (Three.js) over neon-dusk **Afrofuturist Lagos**: you're a jetpack
  rider over the lagoon highway interchange at dusk.
- Wave-based arena combat with **telegraphed attacks** (Skyscrap's "you hear
  the Rhino spin up" loop made fair and readable).
- Danfo-Run-style async competition: global/weekly **Supabase leaderboard**,
  close-call bonus scoring, personal bests.
- A serious **game-feel pass**: muzzle flash, tracers, recoil, screen shake,
  hitstop, pitch-varied positional audio.
- 60 fps on a mid-tier Android; instant-feeling load.

## Non-Goals (v1)

- Real-time multiplayer or co-op (leaderboard is the only competition).
- Accounts/auth — anonymous name-entry on the leaderboard only.
- Weapon upgrade trees, multiple maps, story/campaign, boss fights (boss is a
  stretch goal, not scope).
- App-store builds (Capacitor/Tauri wrappers come after v1 feels good).
- Server-authoritative game simulation.

## Anti-Goals (would count as failure even if it "works")

- Controls that feel mushy on a phone — touch is the primary platform.
- Perf so bad the "high graphics" claim collapses (sub-30 fps stutter).
- A tech-demo with no loop — must have waves → death → score → leaderboard →
  "one more run".
- Scope creep into RPG systems before the core loop is fun.

## Constraints

- Solo dev + AI pair; free assets first (Kenney/Quaternius low-poly packs,
  Poly Haven HDRIs), Blender for tweaks.
- Runs on WebGL2 phones, not just gaming GPUs; no plugins.
- Supabase project already exists (Techa's) — reuse, don't stand up new infra.
- English UI, Nigeria-first audience; no real-brand or celebrity likeness.
- No paid engine; stack is free/open-source.

## Approaches Considered

**Play style** (the big fork — was put to Techa with visual previews; no
answer came back):

1. **Top-down hover arena** (chosen — *my call, reversible*): 3D models,
   bird's-eye tilted camera, twin-stick movement/aim. Trades: loses
   Skyscrap's verticality (jetpack becomes quick dodge-thrusts), wins
   instantly-good touch controls, readable arena, proven mobile feel, easiest
   path to juice.
2. **Chase-cam 3D** (my original sketch): most cinematic, but touch aiming in
   3D is the hardest control problem in mobile shooters — high risk to the
   "feels good" goal. Revisit as a mode later; the 3D world and character
   survive unchanged either way.
3. **Side-view 2.5D** (Skyscrap-exact): simplest controls, but abandons the
   3D wow-factor Techa asked for and duplicates Skyscrap's identity.

Since the goal voted on was a prototype Techa *enjoys*, and phones are the
primary platform, control-feel wins over cinematic wow. Choice 1 it is.

**Renderer**: Three.js vanilla + TypeScript + Vite (matches Danfo Run /
Abuja Driver; biggest ecosystem). *My call:* no React Three Fiber — fewer
moving parts, closer to the reference games' architecture.

**Physics**: no physics engine (*my call*). Kinematic movement + distance/
raycast checks; bullets are pooled projectiles in a flat-ish plane; enemies
fly at fixed altitudes. Classic choice for top-down arenas; avoids 3 MB of
WASM physics for collisions a 2D-plane game doesn't need.

## The Game (as it now stands)

**Fantasy.** Lagos, dusk, neon — running on emergency power. Rogue security
drones rose from a corporate spire ("the Tower") and *seized the grid*: the
city's light is draining, wave by wave. You strap on a cargo jetpack with a
mounted railgun — the only rider still airborne. Fly, dodge, blast waves,
**take the light back.**

Signature setpiece (*my call, cheap to build*): as waves climb, the
emergency grid dims — later waves are fought in near-darkness lit by your
tracers, drone glows and the last neon. The title is the mechanic.

**Loop.** Drop in → waves of drones close in → kill for score, graze danger
for close-call multipliers → take a hit and your shield cracks (3 hit
grace zones) → run ends when shields break → name entry → leaderboard +
personal best → "one more run." Target shape (*my call*): a good run ≈ 3–5
minutes, skilled play survives ~8–10; tuned at playtest.

**Controls.** Phone-first: the touch regime is the one that gets tuned hardest;
desktop is a first-class secondary (Techa's original ask — "mostly play on the
web, wouldn't mind desktop and mobile too").
- Mobile: left virtual stick = move/fly; right stick = aim (autofire while
  held); dash button = burst dodge with brief invulnerability.
- Desktop: WASD move, mouse aim + hold-to-fire, Shift/Space dash.
- Light aim assist on mobile (slight bullet magnetism), tuned generously.

**Enemies (v1 roster).**
1. *Okada drone* — fast rusher, dives at you. Telegraph: rev-up glow line.
2. *Area-boy drone* ("Area Boy") — keeps distance, fires 3-round bursts;
   charges visibly (glow + unique spin-up sound) before each burst. The
   Skyscrap-Rhino analog.
3. *Danfo carrier* — slow heavy, fires slow spread of big slow orbs; killing
   it drops a score/power pickup.
- Every attack is telegraphed ≥0.4 s before it fires. No instant damage.

**Wave director.** Escalating spawn table (waves of budget points), + special
events ("rush hour": okada swarm). Pure TypeScript function — deterministic
per seed, easily unit-tested.

**Scoring.** Kill points by drone type; close-call graze multiplier (like
Danfo Run's close calls); no-hit wave bonus; multiplier decays over time.

**Leaderboard.** Supabase table + weekly top-100 view + personal best
(Danfo-Run pattern); name entered once, stored locally + with the score.
- *My calls:* scores post through a Supabase **Edge Function** that applies
  the plausibility clamp (max plausible score / min plausible time); RLS
  blocks direct table inserts so the anon key can't forge rows. Plus a
  graceful-offline fallback — results and personal bests cache locally and
  sync on next connect, so the loop never dead-ends even if the project is
  paused (free-tier auto-pause) or offline.

**Presentation.**
- Low-poly flat-shaded city + water, neon emissives, dusk HDRI (Poly Haven),
  ACES tone mapping + bloom post pass. Orange/black Lagos palette with
  green/gold accents (Danfo / Abuja Driver color cues).
- HUD 100 % DOM over the canvas (glass panels, tabular numerals) — the
  reference games' signature look; no engine UI.
- Audio via Howler: pitch-varied positional SFX, one CC0 ambient loop +
  "Radio" flavor later. Audio is information: every telegraph has a sound.

**Tech notes (my calls unless noted).**
- Vanilla TS modules (input, spawn director, pools, enemy FSMs, camera shake,
  DOM HUD store); fixed-timestep sim, variable-rate render.
- Pools for bullets/particles/enemies; zero allocations in the frame loop;
  InstancedMesh where sprites/props repeat.
- glTF/GLB + Draco + KTX2; one character model, everything else env props.
- PWA (vite-plugin-pwa), `touch-action: none`, safe-area padding (Abuja
  Driver pattern).
- Device bar (*my call*): Android Chrome is the must-hit target — steady
  60 fps on a mid-tier Snapdragon-class phone (tested on Techa's actual
  device, named at build start). iOS Safari = best-effort: graceful portrait
  fallback, no orientation-lock/fullscreen APIs there. Desktop browsers =
  secondary.
- Minimal tests: wave director math, scoring, and pool sizes — no TDD gospel.

## v1 Build Order

1. Scaffold (Vite + TS + Three), hover movement + camera + one arena scene.
2. Twin-stick input + dash + autofire; placeholder capsule player.
3. One gun (pooled tracers) + dummy drone FSM + telegraphs.
4. Full roster + wave director + death/restart loop.
5. Juice pass (flash/recoil/shake/hitstop/audio).
6. Scoring + Supabase leaderboard + name entry.
7. PWA + mobile perf pass + polish.

## Left to the Builder

- Exact tuning of every number (speeds, budgets, wave curves) — playtest.
- File/folder layout, linter config, shader/filter implementation details.
- Which CC0 asset packs get recolored/modified vs modeled from scratch.
- Final performance tricks (LOD/batching choices) to hit the fps budget.

## Open Questions for Techa

None — all resolved: title (TAKE LIGHT, my call), repo location
(`C:\Users\h\Desktop\take-light`, confirmed by Techa 2026-11-05), desktop
scope (from Techa's original request), device/OS bar and leaderboard
enforcement (my calls, documented above). These docs live in the repo's
`docs/` folder. The implementation plan is alongside:
`docs/take-light.plan.md`.
