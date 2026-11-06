import { describe, expect, it } from 'vitest';
import { capDpr, RENDERER_MAX_DPR } from './scene';
import {
  POSTFX_MAX_DPR,
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
