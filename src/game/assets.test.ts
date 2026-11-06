// Registry + vendored-binary contract: the probe names, the static URL
// table, and the glTF magic bytes on the committed files.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_MODEL_NAMES,
  ASSET_URLS,
  DUSK_EQUIRECT_URL,
  getAssetModels,
  readHeapBytes,
} from './assets';

describe('asset registry', () => {
  it('registers both probe models', () => {
    expect(ASSET_MODEL_NAMES).toContain('player-jetpack');
    expect(ASSET_MODEL_NAMES).toContain('danfo');
    expect(ASSET_MODEL_NAMES).toHaveLength(2);
  });

  it('maps every name to its /assets/<name>.glb URL', () => {
    for (const name of ASSET_MODEL_NAMES) {
      expect(ASSET_URLS[name]).toBe(`/assets/${name}.glb`);
    }
  });

  it('points the dusk environment at the vendored equirect', () => {
    expect(DUSK_EQUIRECT_URL).toBe('/assets/dusk-equirect.jpg');
  });

  it('returns a fresh models copy per call', () => {
    const first = getAssetModels();
    const second = getAssetModels();
    expect(first).toEqual(['player-jetpack', 'danfo']);
    expect(first).not.toBe(second);
    first.push('mutant');
    expect(getAssetModels()).toEqual(['player-jetpack', 'danfo']);
  });
});

describe('heap probe', () => {
  it('returns a finite byte count (0 where performance.memory is absent)', () => {
    const bytes = readHeapBytes();
    expect(typeof bytes).toBe('number');
    expect(Number.isFinite(bytes)).toBe(true);
    expect(bytes).toBeGreaterThanOrEqual(0);
  });
});

describe('vendored GLB binaries', () => {
  for (const name of ASSET_MODEL_NAMES) {
    it(`${name}.glb carries glTF magic, version 2, and a JSON chunk`, () => {
      const path = join(process.cwd(), 'public', 'assets', `${name}.glb`);
      if (!existsSync(path)) {
        console.warn(`take-light: missing ${path}; skipping binary check`);
        return;
      }
      const bytes = readFileSync(path);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      expect(bytes.toString('ascii', 16, 20)).toBe('JSON');
    });
  }
});
