// Debug-overlay flag: pure query/dev predicates for the #dev-overlay
// gate in main.ts. No DOM or import.meta access here: main.ts supplies
// both arguments, so these stay unit-testable under jsdom.

/**
 * True when the `debug` query key is present in the search string
 * (any value). Defensive: unparseable input falls through to false.
 */
export function hasDebugFlag(search: string): boolean {
  try {
    return new URLSearchParams(search).has('debug');
  } catch {
    return false;
  }
}

/**
 * Overlay visibility: dev-server shows it always, production builds only
 * under an explicit `?debug` flag.
 */
export function shouldShowDebugOverlay(search: string, dev: boolean): boolean {
  return dev || hasDebugFlag(search);
}
