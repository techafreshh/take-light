// DOM glass HUD: builds #hud.panel with score/multiplier/wave/shields/dash,
// subscribes to the numbers-only hudStore bridge, patches the DOM only when
// a value actually changes. Mirrors the mountEffects mount/unmount idiom.
import './hud.css';
import { store } from '../app/state';
import { hudStore, type HudSnapshot, type HudStore } from './store';
import type { Store } from '../app/state';

export interface HudHandle {
  layer: HTMLElement;
  unmount(): void;
}

export interface MountHudOptions {
  hud?: HudStore;
  game?: Store;
}

function formatScore(score: number): string {
  return String(Math.max(0, Math.floor(score)));
}

function formatMultiplier(multiplier: number): string {
  return `x${multiplier}`;
}

function formatWave(wave: number): string {
  return `W${wave}`;
}

function dashRatio(snapshot: HudSnapshot): number {
  const max = snapshot.dashCooldownMaxMs > 0 ? snapshot.dashCooldownMaxMs : 1;
  const ms = Math.max(0, snapshot.dashCooldownMs);
  return Math.min(1, Math.max(0, 1 - ms / max));
}

/** Build #hud glass panel; subscribe to the bridge; change-gated writes. */
export function mountHud(options: MountHudOptions = {}): HudHandle {
  const bridge = options.hud ?? hudStore;
  const game = options.game ?? store;
  const root = document.getElementById('root') ?? document.body;

  const layer = document.createElement('div');
  layer.id = 'hud';
  layer.className = 'panel';

  const score = document.createElement('span');
  score.id = 'hud-score';
  score.textContent = '0';

  const multiplier = document.createElement('span');
  multiplier.id = 'hud-multiplier';
  multiplier.textContent = 'x1';

  const wave = document.createElement('span');
  wave.id = 'hud-wave';
  wave.textContent = 'W1';

  const shields = document.createElement('span');
  shields.id = 'hud-shields';

  const dash = document.createElement('span');
  dash.id = 'hud-dash';
  const fill = document.createElement('span');
  fill.className = 'dash-fill ready';
  fill.style.width = '100%';
  dash.appendChild(fill);

  layer.appendChild(score);
  layer.appendChild(multiplier);
  layer.appendChild(wave);
  layer.appendChild(shields);
  layer.appendChild(dash);
  root.appendChild(layer);

  let lastPipCount = -1;
  let last: HudSnapshot | null = null;

  function renderPips(snapshot: HudSnapshot): void {
    const count = Math.max(0, snapshot.maxShields);
    if (count !== lastPipCount) {
      shields.textContent = '';
      for (let i = 0; i < count; i += 1) {
        const pip = document.createElement('span');
        pip.className = 'pip';
        shields.appendChild(pip);
      }
      lastPipCount = count;
    }
    const pips = shields.children;
    for (let i = 0; i < pips.length; i += 1) {
      const pip = pips[i] as HTMLElement;
      const on = i < snapshot.shields;
      if (on && !pip.classList.contains('on')) {
        pip.classList.add('on');
      } else if (!on && pip.classList.contains('on')) {
        pip.classList.remove('on');
      }
    }
  }

  function render(snapshot: HudSnapshot): void {
    if (
      last !== null &&
      last.score === snapshot.score &&
      last.multiplier === snapshot.multiplier &&
      last.kills === snapshot.kills &&
      last.wave === snapshot.wave &&
      last.shields === snapshot.shields &&
      last.maxShields === snapshot.maxShields &&
      last.dashCooldownMs === snapshot.dashCooldownMs &&
      last.dashCooldownMaxMs === snapshot.dashCooldownMaxMs
    ) {
      return;
    }
    const prev = last;
    last = { ...snapshot };
    if (prev === null || prev.score !== snapshot.score) {
      score.textContent = formatScore(snapshot.score);
    }
    if (prev === null || prev.multiplier !== snapshot.multiplier) {
      multiplier.textContent = formatMultiplier(snapshot.multiplier);
    }
    if (prev === null || prev.wave !== snapshot.wave) {
      wave.textContent = formatWave(snapshot.wave);
    }
    if (
      prev === null ||
      prev.shields !== snapshot.shields ||
      prev.maxShields !== snapshot.maxShields
    ) {
      renderPips(snapshot);
    }
    if (
      prev === null ||
      prev.dashCooldownMs !== snapshot.dashCooldownMs ||
      prev.dashCooldownMaxMs !== snapshot.dashCooldownMaxMs
    ) {
      const ratio = dashRatio(snapshot);
      fill.style.width = `${String(Math.round(ratio * 100))}%`;
      if (snapshot.dashCooldownMs <= 0) {
        if (!fill.classList.contains('ready')) {
          fill.classList.add('ready');
        }
      } else if (fill.classList.contains('ready')) {
        fill.classList.remove('ready');
      }
    }
  }

  function renderVisibility(state: string): void {
    if (state === 'RUNNING' || state === 'PAUSED') {
      layer.classList.remove('hidden');
    } else {
      if (!layer.classList.contains('hidden')) {
        layer.classList.add('hidden');
      }
    }
  }

  const unsubscribeHud = bridge.subscribe(render);
  const unsubscribeGame = game.subscribe(renderVisibility);

  return {
    layer,
    unmount(): void {
      unsubscribeHud();
      unsubscribeGame();
      layer.remove();
    },
  };
}
