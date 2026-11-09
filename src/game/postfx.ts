// Bloom post chain: EffectComposer + RenderPass + UnrealBloomPass +
// OutputPass with a null fallback when headless GL cannot build it.
// Callers keep `renderer.render` as the fallback path.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RENDERER_MAX_DPR, capDpr } from './scene';
import type { QualityTier } from './quality';

export const BLOOM_STRENGTH = 0.55;
export const BLOOM_RADIUS = 0.4;
export const BLOOM_THRESHOLD = 0.85;
/** Reduced bloom strength for the balanced tier (half-res pass). */
export const BLOOM_STRENGTH_BALANCED = 0.35;
/** Balanced bloom target scale relative to the composer buffer. */
export const BLOOM_BALANCED_SCALE = 0.5;

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
  dispose(): void;
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
  tier: QualityTier = 'high',
): PostFX | null {
  const { width, coarse } = readHints(hints);
  if (tier === 'performance' || shouldDisableBloom(width, coarse)) {
    return null;
  }
  const balanced = tier === 'balanced';
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = new THREE.Vector2(
      window.innerWidth,
      window.innerHeight,
    );
    if (balanced) {
      size.multiplyScalar(0.5);
    }
    const bloom = new UnrealBloomPass(
      size,
      balanced ? BLOOM_STRENGTH_BALANCED : BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // addPass/composer.setSize always push the FULL effective buffer size
    // into every pass, so the halved constructor size above is overwritten
    // immediately. Track the viewport/DPR here and re-scale only the bloom
    // target after every composer resize, keeping the rest full-res.
    let viewWidth = window.innerWidth;
    let viewHeight = window.innerHeight;
    let currentDpr = capDpr(window.devicePixelRatio);
    const syncBloomSize = (): void => {
      if (!balanced) {
        return;
      }
      bloom.setSize(
        Math.max(
          1,
          Math.round(viewWidth * currentDpr * BLOOM_BALANCED_SCALE),
        ),
        Math.max(
          1,
          Math.round(viewHeight * currentDpr * BLOOM_BALANCED_SCALE),
        ),
      );
    };
    composer.setPixelRatio(currentDpr);
    syncBloomSize();
    return {
      setSize(width: number, height: number): void {
        viewWidth = width;
        viewHeight = height;
        composer.setSize(width, height);
        syncBloomSize();
      },
      setPixelRatio(dpr: number): void {
        currentDpr = capDpr(dpr);
        composer.setPixelRatio(currentDpr);
        syncBloomSize();
      },
      render(): void {
        composer.render();
      },
      dispose(): void {
        bloom.dispose();
        composer.dispose();
      },
    };
  } catch {
    return null;
  }
}
