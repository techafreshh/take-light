// Cached element-rect snapshots for fixed-position hot paths. Canvas and
// stick-zone geometry only changes on viewport/layout events, so sampling
// it via getBoundingClientRect() per sim step or per pointer move forces
// needless synchronous layout. Snapshot once, serve copies from memory,
// and re-snapshot on resize / scroll / orientationchange.

import type { AimRect } from '../game/input';

export interface ElementRectCache {
  /** Current snapshot copy; never touches the DOM. */
  get(): AimRect;
  /** Take a fresh snapshot (exactly one DOM read) and return a copy. */
  refresh(): AimRect;
  /** Detach the viewport listeners; the last snapshot stays readable. */
  dispose(): void;
}

function snapshot(element: Element): AimRect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * Snapshot an element's rect once and keep it fresh across viewport
 * events. get() is safe in per-frame / per-move hot paths.
 */
export function createElementRectCache(element: Element): ElementRectCache {
  let current = snapshot(element);

  function refresh(): AimRect {
    current = snapshot(element);
    return { ...current };
  }

  function get(): AimRect {
    return { ...current };
  }

  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, { capture: true, passive: true });
  window.addEventListener('orientationchange', refresh);

  function dispose(): void {
    window.removeEventListener('resize', refresh);
    window.removeEventListener('scroll', refresh, { capture: true });
    window.removeEventListener('orientationchange', refresh);
  }

  return { get, refresh, dispose };
}
