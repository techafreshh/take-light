// Bloom post chain: EffectComposer + RenderPass + UnrealBloomPass +
// OutputPass with a null fallback when headless GL cannot build it.
// Callers keep `renderer.render` as the fallback path.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const BLOOM_STRENGTH = 0.55;
export const BLOOM_RADIUS = 0.4;
export const BLOOM_THRESHOLD = 0.85;

/** DPR cap shared with configureRenderer. */
export const POSTFX_MAX_DPR = 2;

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
): PostFX | null {
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
    composer.setPixelRatio(Math.min(window.devicePixelRatio, POSTFX_MAX_DPR));
    return {
      setSize(width: number, height: number): void {
        composer.setSize(width, height);
      },
      setPixelRatio(dpr: number): void {
        composer.setPixelRatio(Math.min(dpr, POSTFX_MAX_DPR));
      },
      render(): void {
        composer.render();
      },
    };
  } catch {
    return null;
  }
}
