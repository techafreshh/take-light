// DOM damage-number / hit-marker layer. Imports nothing from
// three.js: main.ts projects world kills to screen pixels and hands the
// coordinates over. Mirrors the mountSticks mount/unmount idiom.

/** Damage numbers float up and fade inside this bound (under 2000). */
export const DAMAGE_TTL_MS = 1200;

/** Hit markers flash briefly at the impact point. */
export const MARKER_TTL_MS = 300;

/**
 * Max live fx nodes: mid-fight kill bursts drop the oldest past this
 * cap instead of stacking unbounded DOM + timers under bloom.
 */
export const FX_MAX_NODES = 24;

function enforceFxCap(layer: HTMLElement): void {
  while (layer.childElementCount > FX_MAX_NODES) {
    layer.firstElementChild?.remove();
  }
}

export interface EffectsHandle {
  layer: HTMLElement;
  unmount(): void;
}

/** Append the #fx-layer to #root; unmount removes it again. */
export function mountEffects(): EffectsHandle {
  const root = document.getElementById('root') ?? document.body;
  const layer = document.createElement('div');
  layer.id = 'fx-layer';
  root.appendChild(layer);
  return {
    layer,
    unmount(): void {
      layer.remove();
    },
  };
}

function place(element: HTMLElement, xPx: number, yPx: number): void {
  element.style.left = `${xPx.toString()}px`;
  element.style.top = `${yPx.toString()}px`;
}

/** Spawn a floating damage number; self-removes after DAMAGE_TTL_MS. */
export function spawnDamageNumber(
  handle: EffectsHandle,
  xPx: number,
  yPx: number,
  text: string,
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'damage-number';
  element.textContent = text;
  place(element, xPx, yPx);
  handle.layer.appendChild(element);
  enforceFxCap(handle.layer);
  window.setTimeout(() => {
    element.remove();
  }, DAMAGE_TTL_MS);
  return element;
}

/** Spawn a short-lived hit flash; self-removes after MARKER_TTL_MS. */
export function spawnHitMarker(
  handle: EffectsHandle,
  xPx: number,
  yPx: number,
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hit-marker';
  place(element, xPx, yPx);
  handle.layer.appendChild(element);
  enforceFxCap(handle.layer);
  window.setTimeout(() => {
    element.remove();
  }, MARKER_TTL_MS);
  return element;
}
