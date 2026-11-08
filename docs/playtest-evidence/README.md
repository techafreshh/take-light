# Playtest evidence — TAKE LIGHT v1 (2026-11-07/08)

Human/agent-browser playtest of `main` @ `0804e72` via Vite dev on :5174
(plain `npm run dev`). Screenshots captured from live runs — every claim in
the filed issues references the image that proves it.

| # | File | What it shows |
|---|------|---------------|
| 01 | `01-menu-1280.png` | Menu at 1280px. Clean, readable. |
| 02 | `02-menu-1080p.png` | Menu at 1920×1080. Panel tiny vs screen; sticks visible on desktop. |
| 03 | `03-gameplay-start.png` | Run start, HUD (score ×1, W1, 3 shield pips), ship glow, empty arena. |
| 04 | `04-gameover-idle.png` | Idle death: Wave 2, Score 0, Kills 0, tick 1972. Name entry + Save/Restart/Menu. |
| 05 | `05-save-0-score.png` | Save accepted a 0-score run: "Best saved: Techa", leaderboard #1 = 0 pts. |
| 06 | `06-idle-death.png` | Second idle run: same Wave 2 / 0-kill death (tick 1652). Doubled experiment. |
| 07 | `07-combat-400.png` | Held-key + hold-fire bot: tracers flying, score 400, ship moving. Combat gun works. |
| 08 | `08-bot-death-w2.png` | Same bot died anyway: Wave 2, 4 kills, shields 0, fps 39. Damage-in outpaces evasion + firepower. |
| 09 | `09-wave9-blackout.png` | Forced wave 9 (`__TAKELIGHT_SETWAVE__(9)`, HUD W9): world dimmed, telegraphs indistinguishable from tracers. |
| 10 | `10-portrait-gameover.png` | iPhone portrait Game Over: text overflows panel edge-to-edge, sticks bleed off screen. |
| 11 | `11-portrait-menu.png` | iPhone portrait Menu: "Rotate … to play" clipped both sides; title overflows. |

## Reproduction (agent-browser)
1. `npm run dev -- --port 5174 --host 127.0.0.1 --strictPort`
2. `agent-browser open http://127.0.0.1:5174/`, `set viewport 1920 1080`
3. Menu: `snapshot -i` → click Start.
4. Idle: do nothing ~30 s → Game Over (Score 0 · Wave 2 · Kills 0).
5. Bot (works — gun proves functional): via `eval --stdin` dispatch sustained
   `keydown/KeyW` holds, canvas `mousedown` hold-fire with moving aim points,
   `Space` dashes. Kills register (Score 400) but death still lands at Wave 2.
6. Blackout: `__TAKELIGHT_SETWAVE__(9)` mid-run (test hook in `src/main.ts`).
7. Portrait: `agent-browser set device "iPhone 14"`.

Note: `agent-browser press` does not hold keys — sustained input requires the
`eval` dispatch pattern above; that is a harness limit, not a game bug.
