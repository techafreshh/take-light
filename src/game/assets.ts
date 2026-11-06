// Vendored CC0-stand-in model registry: names, static URLs, and the
// load-time-only GLTF fetch. No per-frame work lives here; the sim hot
// loop never touches this module. Failures resolve to null so the
// capsule/box fallbacks stay visible (silent-stub convention like
// audio.ts), and probes are populated synchronously at boot regardless.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Models exposed on `window.__TAKELIGHT_ASSETS__` and served from /assets. */
export const ASSET_MODEL_NAMES = ['player-jetpack', 'danfo'] as const;

export type AssetModelName = (typeof ASSET_MODEL_NAMES)[number];

/** Static URL table; the dev/preview server serves these from public/. */
export const ASSET_URLS: Record<AssetModelName, string> = {
  'player-jetpack': '/assets/player-jetpack.glb',
  danfo: '/assets/danfo.glb',
};

/** Dusk equirect consumed once by the PMREM environment path. */
export const DUSK_EQUIRECT_URL = '/assets/dusk-equirect.jpg';

/** Fresh copy per call so probe consumers cannot mutate the registry. */
export function getAssetModels(): string[] {
  return [...ASSET_MODEL_NAMES];
}

/**
 * Fetch one vendored GLB via the stock GLTFLoader (no Draco/KTX2: the
 * binaries are uncompressed). Never throws; null means keep fallbacks.
 */
export function loadModelAsync(name: AssetModelName): Promise<THREE.Group | null> {
  const url = ASSET_URLS[name];
  const loader = new GLTFLoader();
  return loader
    .loadAsync(url)
    .then((gltf) => gltf.scene ?? null)
    .catch(() => null);
}

/**
 * Live heap bytes for the 30 s hold-fire probe. Returns 0 when the
 * `performance.memory` API is absent (Firefox/jsdom) so growth diffs
 * stay a passing 0 there instead of NaN.
 */
export function readHeapBytes(): number {
  try {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize?: unknown } }).memory;
    const bytes = memory?.usedJSHeapSize;
    return typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0;
  } catch {
    return 0;
  }
}
