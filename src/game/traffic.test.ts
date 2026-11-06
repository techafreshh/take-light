// Danfo traffic contract: fixed capacity, deterministic lanes,
// wrap-around at the highway ends, and zero allocation per update.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STEP_MS } from './loop';
import {
  DANFO_COUNT,
  DANFO_WRAP_Z,
  createDanfoTraffic,
  danfoInitialZ,
  updateDanfoTraffic,
} from './props';

describe('danfo traffic capacity', () => {
  it('defaults to 10 slots on one InstancedMesh', () => {
    expect(DANFO_COUNT).toBe(10);
    const traffic = createDanfoTraffic();
    expect(traffic.count).toBe(DANFO_COUNT);
    expect(traffic.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(traffic.mesh.count).toBe(DANFO_COUNT);
  });

  it('preallocates fixed SoA lane state', () => {
    const traffic = createDanfoTraffic();
    expect(traffic.x).toBeInstanceOf(Float32Array);
    expect(traffic.z).toBeInstanceOf(Float32Array);
    expect(traffic.speed).toBeInstanceOf(Float32Array);
    expect(traffic.x.length).toBe(DANFO_COUNT);
    expect(traffic.z.length).toBe(DANFO_COUNT);
    expect(traffic.speed.length).toBe(DANFO_COUNT);
  });
});

describe('danfo traffic determinism', () => {
  it('spreads initial z deterministically over [-90, 90]', () => {
    expect(danfoInitialZ(0)).toBe(-90);
    expect(danfoInitialZ(DANFO_COUNT - 1)).toBe(90);
    expect(danfoInitialZ(0)).toBe(danfoInitialZ(0));
  });

  it('lays out identical lanes across calls', () => {
    const first = createDanfoTraffic();
    const second = createDanfoTraffic();
    expect(Array.from(first.x)).toEqual(Array.from(second.x));
    expect(Array.from(first.z)).toEqual(Array.from(second.z));
    expect(Array.from(first.speed)).toEqual(Array.from(second.speed));
  });

  it('alternates lanes across the highway', () => {
    const traffic = createDanfoTraffic();
    const lanes = new Set(Array.from(traffic.x));
    expect(lanes.size).toBeGreaterThan(1);
    for (const x of traffic.x) {
      const nearest = [-2.5, 0.5, 2.8].reduce((best, lane) =>
        Math.abs(lane - x) < Math.abs(best - x) ? lane : best,
      );
      expect(Math.abs(nearest - x)).toBeLessThan(1e-6);
    }
  });
});

describe('danfo traffic update', () => {
  it('advances down the highway on the fixed quantum', () => {
    const traffic = createDanfoTraffic();
    const before = Array.from(traffic.z);
    updateDanfoTraffic(traffic, STEP_MS);
    for (let i = 0; i < traffic.count; i += 1) {
      expect(traffic.z[i]).toBeGreaterThan(before[i]);
    }
  });

  it('wraps around the highway ends', () => {
    const traffic = createDanfoTraffic();
    traffic.z[0] = DANFO_WRAP_Z - 0.01;
    updateDanfoTraffic(traffic, STEP_MS);
    expect(traffic.z[0]).toBeLessThan(0);
    expect(traffic.z[0]).toBeGreaterThanOrEqual(-DANFO_WRAP_Z);
  });

  it('holds capacity with z inside +-95 across 60 s of steps', () => {
    const traffic = createDanfoTraffic();
    const steps = Math.round(60000 / STEP_MS);
    for (let i = 0; i < steps; i += 1) {
      updateDanfoTraffic(traffic, STEP_MS);
    }
    expect(traffic.count).toBe(DANFO_COUNT);
    expect(traffic.x.length).toBe(DANFO_COUNT);
    expect(traffic.z.length).toBe(DANFO_COUNT);
    expect(traffic.speed.length).toBe(DANFO_COUNT);
    for (let i = 0; i < traffic.count; i += 1) {
      expect(Math.abs(traffic.z[i])).toBeLessThanOrEqual(DANFO_WRAP_Z);
    }
  });

  it('performs zero allocation across 600 updates', () => {
    const traffic = createDanfoTraffic();
    const xRef = traffic.x;
    const zRef = traffic.z;
    const speedRef = traffic.speed;
    const matrixLength = traffic.mesh.instanceMatrix.array.length;
    for (let i = 0; i < 600; i += 1) {
      updateDanfoTraffic(traffic, STEP_MS);
    }
    expect(traffic.x).toBe(xRef);
    expect(traffic.z).toBe(zRef);
    expect(traffic.speed).toBe(speedRef);
    expect(traffic.mesh.instanceMatrix.array.length).toBe(matrixLength);
    expect(traffic.count).toBe(DANFO_COUNT);
  });
});
