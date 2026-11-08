// Telegraph marker contract: an unlit blackout-exempt ring follows every
// telegraphing enemy, pulses over time, and hides everywhere else.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { STEP_MS } from './loop';
import { createEnemyManager, spawnEnemy, updateEnemies } from './enemy';
import { OKADA_PARAMS } from './enemies/okada';
import { applyBlackout } from './blackout';
import {
  TELEGRAPH_PULSE_DEPTH,
  clearTelegraphMarkers,
  createTelegraphField,
  syncTelegraphMarkers,
  telegraphPulse,
} from './telegraph';

const PLAYER = { x: 0, z: 0 };

function updateEnemiesStep(
  manager: ReturnType<typeof createEnemyManager>,
): void {
  updateEnemies(manager, PLAYER, STEP_MS);
}

function stepToTelegraph(
  manager: ReturnType<typeof createEnemyManager>,
  maxSteps = 400,
): void {
  for (let i = 0; i < maxSteps; i += 1) {
    updateEnemiesStep(manager);
    if (manager.live[0]?.state === 'telegraph') {
      return;
    }
  }
  throw new Error('enemy never reached telegraph');
}

function visibleSlotCount(
  field: ReturnType<typeof createTelegraphField>,
): number {
  const matrix = new THREE.Matrix4();
  let count = 0;
  for (let i = 0; i < field.capacity; i += 1) {
    field.mesh.getMatrixAt(i, matrix);
    if (matrix.elements[0] !== 0) {
      count += 1;
    }
  }
  return count;
}

describe('telegraph markers', () => {
  it('shows exactly one ring at the telegraphing enemy XZ', () => {
    const manager = createEnemyManager();
    const enemy = spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    const field = createTelegraphField();
    stepToTelegraph(manager);
    expect(enemy.state).toBe('telegraph');
    syncTelegraphMarkers(field, manager);
    expect(field.mesh.visible).toBe(true);
    expect(visibleSlotCount(field)).toBe(1);
    const matrix = new THREE.Matrix4();
    field.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12]).toBeCloseTo(enemy.x, 5);
    expect(matrix.elements[14]).toBeCloseTo(enemy.z, 5);
  });

  it('uses an unlit material the blackout curve never touches', () => {
    const field = createTelegraphField();
    const material = field.mesh.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const colorBefore = (material.color as THREE.Color).getHex();
    const opacityBefore = material.opacity;
    const lights = {
      hemi: { intensity: 0.7 },
      pylonEmissive: { emissiveIntensity: 1.4 },
    };
    applyBlackout(lights, 10);
    expect((material.color as THREE.Color).getHex()).toBe(colorBefore);
    expect(material.opacity).toBe(opacityBefore);
  });

  it('pulses at distinct scales across telegraph time', () => {
    const early = telegraphPulse(0);
    const peak = telegraphPulse(42);
    expect(peak).not.toBe(early);
    for (const ms of [0, 42, 83, 125, 400]) {
      const scale = telegraphPulse(ms);
      expect(scale).toBeGreaterThanOrEqual(1 - TELEGRAPH_PULSE_DEPTH - 1e-9);
      expect(scale).toBeLessThanOrEqual(1 + TELEGRAPH_PULSE_DEPTH + 1e-9);
    }
    expect(telegraphPulse(Number.NaN)).toBe(1);
  });

  it('hides idle, dive, and recover enemies plus clearTelegraphMarkers', () => {
    const manager = createEnemyManager();
    spawnEnemy(manager, 'okada', OKADA_PARAMS, 5, 0);
    const field = createTelegraphField();
    // Idle: no ring.
    syncTelegraphMarkers(field, manager);
    expect(field.mesh.visible).toBe(false);
    expect(visibleSlotCount(field)).toBe(0);
    // Telegraph: ring; then step past the window into dive: no ring.
    stepToTelegraph(manager);
    syncTelegraphMarkers(field, manager);
    expect(visibleSlotCount(field)).toBe(1);
    for (let i = 0; i < 60; i += 1) {
      updateEnemiesStep(manager);
      if (manager.live[0]?.state === 'dive') {
        break;
      }
    }
    expect(manager.live[0]?.state).toBe('dive');
    syncTelegraphMarkers(field, manager);
    expect(field.mesh.visible).toBe(false);
    expect(visibleSlotCount(field)).toBe(0);
    // Recover: still no ring.
    for (let i = 0; i < 200; i += 1) {
      updateEnemiesStep(manager);
      if (manager.live[0]?.state === 'recover') {
        break;
      }
    }
    expect(manager.live[0]?.state).toBe('recover');
    syncTelegraphMarkers(field, manager);
    expect(visibleSlotCount(field)).toBe(0);
    // Re-telegraph then clear: hidden.
    for (let i = 0; i < 400; i += 1) {
      updateEnemiesStep(manager);
      if (manager.live[0]?.state === 'telegraph') {
        break;
      }
    }
    expect(manager.live[0]?.state).toBe('telegraph');
    syncTelegraphMarkers(field, manager);
    expect(visibleSlotCount(field)).toBe(1);
    clearTelegraphMarkers(field);
    expect(field.mesh.visible).toBe(false);
    expect(visibleSlotCount(field)).toBe(0);
  });
});
