import { describe, expect, it } from 'vitest';
import { sizeRenderer } from './scene';

function createStubs() {
  const calls: string[] = [];
  const renderer = {
    pixelRatio: 0,
    width: 0,
    height: 0,
    setPixelRatio(dpr: number): void {
      this.pixelRatio = dpr;
      calls.push('renderer.setPixelRatio');
    },
    setSize(width: number, height: number, _updateStyle?: boolean): void {
      this.width = width;
      this.height = height;
      calls.push('renderer.setSize');
    },
  };
  const camera = {
    aspect: 0,
    projectionCalls: 0,
    updateProjectionMatrix(): void {
      this.projectionCalls += 1;
      calls.push('camera.updateProjectionMatrix');
    },
  };
  const composer = {
    pixelRatio: 0,
    width: 0,
    height: 0,
    setPixelRatio(dpr: number): void {
      this.pixelRatio = dpr;
      calls.push('composer.setPixelRatio');
    },
    setSize(width: number, height: number): void {
      this.width = width;
      this.height = height;
      calls.push('composer.setSize');
    },
  };
  return { calls, renderer, camera, composer };
}

describe('sizeRenderer', () => {
  it('applies renderer pixel ratio before size', () => {
    const { calls, renderer, camera, composer } = createStubs();
    sizeRenderer(renderer, camera, 800, 600, 2, composer);
    expect(calls.indexOf('renderer.setPixelRatio')).toBeLessThan(
      calls.indexOf('renderer.setSize'),
    );
    expect(renderer.pixelRatio).toBe(2);
    expect(renderer.width).toBe(800);
    expect(renderer.height).toBe(600);
  });

  it('applies composer pixel ratio before size', () => {
    const { calls, renderer, camera, composer } = createStubs();
    sizeRenderer(renderer, camera, 800, 600, 2, composer);
    expect(calls.indexOf('composer.setPixelRatio')).toBeLessThan(
      calls.indexOf('composer.setSize'),
    );
    expect(composer.pixelRatio).toBe(2);
    expect(composer.width).toBe(800);
    expect(composer.height).toBe(600);
  });

  it('caps DPR at 2 and passes smaller values through to both backends', () => {
    const capped = createStubs();
    sizeRenderer(capped.renderer, capped.camera, 800, 600, 3, capped.composer);
    expect(capped.renderer.pixelRatio).toBe(2);
    expect(capped.composer.pixelRatio).toBe(2);
    const passthrough = createStubs();
    sizeRenderer(
      passthrough.renderer,
      passthrough.camera,
      800,
      600,
      1.5,
      passthrough.composer,
    );
    expect(passthrough.renderer.pixelRatio).toBe(1.5);
    expect(passthrough.composer.pixelRatio).toBe(1.5);
  });

  it('syncs the camera aspect and updates the projection matrix', () => {
    const { renderer, camera, composer } = createStubs();
    sizeRenderer(renderer, camera, 800, 600, 1, composer);
    expect(camera.aspect).toBe(800 / 600);
    expect(camera.projectionCalls).toBe(1);
  });

  it('sizes the renderer without throwing when the composer is missing', () => {
    const { renderer, camera } = createStubs();
    expect(() =>
      sizeRenderer(renderer, camera, 800, 600, 2, undefined),
    ).not.toThrow();
    expect(() =>
      sizeRenderer(renderer, camera, 800, 600, 2, null),
    ).not.toThrow();
    expect(renderer.width).toBe(800);
    expect(renderer.height).toBe(600);
    expect(renderer.pixelRatio).toBe(2);
  });
});
