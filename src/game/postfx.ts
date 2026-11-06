// Bloom post chain: EffectComposer + RenderPass + UnrealBloomPass +
// OutputPass with a null fallback when headless GL cannot build it.
// Callers keep `renderer.render` as the fallback path.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RENDERER_MAX_DPR, capDpr } from './scene';

export const BLOOM_STRENGTH = 0.55;
export const BLOOM_RADIUS = 0.4;
export const BLOOM_THRESHOLD = 0.85;

/** DPR cap shared with configureRenderer. */
export const POSTFX_MAX_DPR = RENDERER_MAX_DPR;

/** Narrow-viewport cutover below which bloom is skipped outright. */
export const BLOOM_DISABLE_VIEWPORT_PX = 768;

/**
 * Pure mobile check: the composer passes cost fill-rate on the GPUs
 * this targets, so coarse pointers or narrow viewports skip bloom
 * entirely (via the null fallback) instead of running it weakened.
 */
export function shouldDisableBloom(
  viewportWidthPx: number,
  coarsePointer: boolean,
): boolean {
  return coarsePointer || viewportWidthPx < BLOOM_DISABLE_VIEWPORT_PX;
}

/** Override for tests/probes; defaults read the live viewport. */
export interface PostFXHints {
  width?: number;
  coarse?: boolean;
}

function readHints(hints: PostFXHints = {}): { width: number; coarse: boolean } {
  if (typeof window === 'undefined') {
    return { width: hints.width ?? 1024, coarse: hints.coarse ?? false };
  }
  return {
    width: hints.width ?? window.innerWidth,
    coarse:
      hints.coarse ??
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches),
  };
}

export interface PostFX {
  setSize(width: number, height: number): void;
  setPixelRatio(dpr: number): void;
  render(): void;
}

/**
 * Build the composer chain. Returns null when construction fails
 * (headless GL) so callers fall back to direct renderer.render.
 */
export function createPostFX(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  hints: PostFXHints = {},
): PostFX | null {
  const { width, coarse } = readHints(hints);
  if (shouldDisableBloom(width, coarse)) {
    return null;
  }
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = new THREE.Vector2(
      window.innerWidth,
      window.innerHeight,
    );
    const bloom = new UnrealBloomPass(
      size,
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(capDpr(window.devicePixelRatio));
    return {
      setSize(width: number, height: number): void {
        composer.setSize(width, height);
      },
      setPixelRatio(dpr: number): void {
        composer.setPixelRatio(capDpr(dpr));
      },
      render(): void {
        composer.render();
      },
    };
  } catch {
    return null;
  }
}
