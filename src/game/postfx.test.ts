import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { capDpr, RENDERER_MAX_DPR } from './scene';
import {
  BLOOM_BALANCED_SCALE,
  POSTFX_MAX_DPR,
  createPostFX,
  shouldDisableBloom,
} from './postfx';

describe('perf caps', () => {
  it('caps DPR at 2 and passes smaller values through', () => {
    expect(RENDERER_MAX_DPR).toBe(2);
    expect(POSTFX_MAX_DPR).toBe(2);
    expect(capDpr(3)).toBe(2);
    expect(capDpr(1.5)).toBe(1.5);
  });

  it('disables bloom on coarse pointers or narrow viewports', () => {
    expect(shouldDisableBloom(360, false)).toBe(true);
    expect(shouldDisableBloom(1024, true)).toBe(true);
    expect(shouldDisableBloom(1024, false)).toBe(false);
  });
});

describe('tier-aware bloom sizing', () => {
  // Headless stubs: EffectComposer only needs getPixelRatio/getSize plus
  // data-side render targets, so the wrapper (never .render()) builds
  // without a GL context and the bloom setSize routing is observable.
  // Tests run under node (no window), so stub the viewport globals the
  // composer wrapper sizes against.
  function stubRenderer(): THREE.WebGLRenderer {
    return {
      getPixelRatio: () => 1,
      getSize: (target: THREE.Vector2) => target.set(800, 600),
    } as unknown as THREE.WebGLRenderer;
  }

  function stubWindow(): void {
    vi.stubGlobal('window', {
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
    });
  }

  function lastBloomSize(
    spy: ReturnType<typeof vi.spyOn>,
  ): [number, number] | undefined {
    const calls = spy.mock.calls;
    return calls[calls.length - 1] as [number, number] | undefined;
  }

  it('keeps the balanced bloom pass at half composer resolution', () => {
    expect(BLOOM_BALANCED_SCALE).toBe(0.5);
    stubWindow();
    const spy = vi.spyOn(UnrealBloomPass.prototype, 'setSize');
    try {
      const postfx = createPostFX(
        stubRenderer(),
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
        { width: 1920, coarse: false },
        'balanced',
      );
      expect(postfx).not.toBeNull();
      // A composer resize must leave the bloom target at half the
      // effective buffer: addPass/setSize overwrite the halved
      // constructor size with full-res, so the wrapper re-scales it.
      spy.mockClear();
      postfx!.setSize(800, 600);
      const pr = capDpr(window.devicePixelRatio);
      expect(lastBloomSize(spy)).toEqual([
        Math.round(800 * pr * BLOOM_BALANCED_SCALE),
        Math.round(600 * pr * BLOOM_BALANCED_SCALE),
      ]);
      // DPR changes re-apply the same half scale, then dispose frees
      // the composer targets without touching GL.
      spy.mockClear();
      postfx!.setPixelRatio(2);
      expect(lastBloomSize(spy)).toEqual([
        Math.round(800 * capDpr(2) * BLOOM_BALANCED_SCALE),
        Math.round(600 * capDpr(2) * BLOOM_BALANCED_SCALE),
      ]);
      expect(() => postfx!.dispose()).not.toThrow();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('sizes high-tier bloom at the full composer resolution', () => {
    stubWindow();
    const spy = vi.spyOn(UnrealBloomPass.prototype, 'setSize');
    try {
      const postfx = createPostFX(
        stubRenderer(),
        new THREE.Scene(),
        new THREE.PerspectiveCamera(),
        { width: 1920, coarse: false },
        'high',
      );
      expect(postfx).not.toBeNull();
      spy.mockClear();
      postfx!.setSize(800, 600);
      const pr = capDpr(window.devicePixelRatio);
      expect(lastBloomSize(spy)).toEqual([
        Math.round(800 * pr),
        Math.round(600 * pr),
      ]);
      expect(() => postfx!.dispose()).not.toThrow();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
