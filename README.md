# take-light — neon-dusk jetpack arena

A low-poly neon-dusk arena shooter: hover on a jetpack, railgun Okada
rushers, AreaBoy shooters, and Danfo Carrier heavies across 10 timed
waves that dim toward near-dark, then post your score to the weekly
top-100 board.

## Quickstart

```sh
npm install
npm run dev        # Vite dev server on :5173 with /api/health + stubs
npm run build      # tsc -b + vite build into dist/
npx vitest run     # headless suites (director, score, pool, clamp, ...)
npm run preview -- --port 5173 --strictPort  # serve dist/ like deploy
```

## Controls

- Desktop: `WASD` / arrows to move, mouse to aim, hold left-click to fire,
  `Space` or double-tap direction to dash (`DASH_COOLDOWN_MS`), `Esc`/`P`
  to pause.
- Touch: left stick to move, right stick to aim/fire, `dash-btn` to dash.
- Probes: `window.__TAKELIGHT_INPUT__.firing`,
  `window.__TAKELIGHT_FORCE_FIRE__`, `__TAKELIGHT_SPAWN__`,
  `__TAKELIGHT_SETWAVE__`, `__TAKELIGHT_START__`,
  `__TAKELIGHT_GAMEOVER__`, `__TAKELIGHT_FULLRUN__`.

## Game loop

`MENU → RUNNING ⇄ PAUSED → GAMEOVER → name → leaderboard → restart`

1. `MENU` shows Start plus the weekly board (`#leaderboard`) and `#pb`.
2. `RUNNING` spawns the wave-1 plan, advances waves on
   `planWave(...).durationMs`, dims lights via `applyBlackout`, and
   tracks `runStartAtMs` for `duration_s`.
3. `GAMEOVER` shows score/wave/kills, the `#pb-form` name entry
   (`#pb-name`, `#pb-submit`), the board, Restart, and Menu.
4. Saving writes the personal best synchronously (`maybeWritePb`),
   submits via `submitRun` (offline failures queue via `enqueueRun`),
   and repaints the board.
5. `PAUSED` offers Resume, Restart, and Menu — every overlay has an
   exit, no dead-ends.

## Tuning

| Constant | Value | Notes |
| --- | --- | --- |
| `WAVE_DURATION_MS` | 25000 | standard wave window |
| `RUSH_HOUR_MS` | 10000 | every 4th wave swarm window |
| `RUSH_EVERY_WAVES` / `RUSH_BONUS_OKADA` | 4 / 6 | cost-free Okada swarm |
| `budgetForWave(w)` | `4 + w * 2` | wave 1 → 6, wave 10 → 24 |
| `MAX_AREABOY_WAVE_2` / `MAX_CARRIER_WAVE_2` | 1 / 0 | wave-2 shooter cap: worst-case volley 3 orbs |
| `MAX_AREABOY_WAVE_3` / `MAX_CARRIER_WAVE_3` | 1 / 1 | wave-3 shooter cap: worst-case volley 8 orbs; waves 4+ uncapped |
| `BLACKOUT_MIN_LIGHT` | 0.28 | `lightIntensityForWave(10)` |
| `BLACKOUT_MIN_EMISSIVE` | 0.35 | emissive floor at wave 10 |
| `OKADA_TELEGRAPH_MS` | 450 | ≥400 ms visible + audible |
| `AREABOY_TELEGRAPH_MS` | 450 | ≥400 ms visible + audible |
| `CARRIER_TELEGRAPH_MS` | 450 | ≥400 ms visible + audible |
| `MAX_SCORE_PER_WAVE` | 2500 | ceiling 2500/wave |
| `MIN_DURATION_S_PER_WAVE` | 20 | floor 20 s/wave |

Waves 1–10 elapse `8 × 25 s + 2 × 10 s = 220 s` (~3.7 min), inside the
3–5 minute good-run window. Wave 10 light is `0.28` (near-dark).

## Supabase + offline queue

- Build-time env (see `.env.example`): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. Only the anon key is ever bundled.
- Absent env means same-origin stubs: `GET /rest/v1/runs` and
  `POST /functions/v1/submit` served by the Vite middleware locally
  and by the static deploy otherwise.
- `submitRun` stores offline/forced-offline runs via `enqueueRun`
  (`take-light:queue`); `flushQueue` drains in order, dropping
  definitive 4xx so one bad row never wedges the queue.
- `fetchWeeklyTop100` never throws; the board caps at 100 rows.

## Deploy

- Cloudflare Pages (primary): build command `npm run build`, output
  `dist`. `functions/api/health.ts` answers `GET /api/health` with
  `{"status":"ok"}`.
- Netlify / static-only: same `dist` output plus `public/_redirects`
  (`/api/health → /api/health.json 200`) and the static payload
  `public/api/health.json` (`{"status":"ok"}`).
- `npm run build` must stay clean (enforced chunk budget: split `three-vendor` chunk, entry ≤200 kB, total JS ≤850 kB, checked by `npm run build`); throttled-4G first-playable <10 s,
  60 fps on the device bar.

## Verification

```sh
# health (dev or preview, <2000 ms)
curl -s http://localhost:5173/api/health  # {"status":"ok"}

# full run hook + weekly board (browser console, <10000 ms to board)
await window.__TAKELIGHT_FULLRUN__()
# → { status: 'ok', row: { name: 'Fullrun', score: 5000, wave: 5, ... } }

# submit clamp boundary (dev or preview serving the same-origin stub)
./scripts/verify-submit-clamp.sh  # 201 / 422 / 422 / 422
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5173/functions/v1/submit \
  -H 'Content-Type: application/json' -d '{"name":"Ngozi","score":12400,"wave":8,"duration_s":212}'  # 201
curl -s -X POST http://localhost:5173/functions/v1/submit \
  -H 'Content-Type: application/json' -d '{"name":"Techa","score":0,"wave":2,"duration_s":60}'  # 422 NON_QUALIFYING_SCORE
curl -s -X POST http://localhost:5173/functions/v1/submit \
  -H 'Content-Type: application/json' -d '{"name":"Hax","score":9999999,"wave":2,"duration_s":60}'  # 422 IMPLAUSIBLE_SCORE
curl -s -X POST http://localhost:5173/functions/v1/submit \
  -H 'Content-Type: application/json' -d '{"name":"Speedy","score":100,"wave":8,"duration_s":5}'  # 422 IMPLAUSIBLE_DURATION

# suites
npx vitest run   # director, score, pool, clamp suites green
```
