import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_BACK,
  CAMERA_PITCH_DEG,
  CAMERA_UP,
  createFollowCamera,
  pitchDegForOffset,
  updateFollowCamera,
} from './camera';
import { PYLON_COUNT, createPylons, pylonPositions } from './props';
import { createArenaScene } from './scene';

describe('camera pitch', () => {
  it('offset pitch is ~50 degrees by construction', () => {
    expect(pitchDegForOffset(CAMERA_UP, CAMERA_BACK)).toBeGreaterThanOrEqual(49);
    expect(pitchDegForOffset(CAMERA_UP, CAMERA_BACK)).toBeLessThanOrEqual(51);
  });

  it('reported pitch constant stays inside the 45-55 acceptance band', () => {
    expect(CAMERA_PITCH_DEG).toBeGreaterThanOrEqual(45);
    expect(CAMERA_PITCH_DEG).toBeLessThanOrEqual(55);
  });

  it('follow camera looks down at the target from above and behind', () => {
    const camera = createFollowCamera(16 / 9);
    updateFollowCamera(camera, new THREE.Vector3(10, 0, -5));
    expect(camera.position.x).toBeCloseTo(10, 5);
    expect(camera.position.y).toBeCloseTo(CAMERA_UP, 5);
    expect(camera.position.z).toBeCloseTo(-5 + CAMERA_BACK, 5);
  });
});

describe('pylon layout', () => {
  it('meets the 8-pylon minimum', () => {
    expect(PYLON_COUNT).toBeGreaterThanOrEqual(8);
    expect(pylonPositions(PYLON_COUNT)).toHaveLength(PYLON_COUNT);
  });

  it('is deterministic across calls', () => {
    expect(pylonPositions(10)).toEqual(pylonPositions(10));
  });

  it('spans both sides of the highway without overlaps', () => {
    const positions = pylonPositions(10);
    const left = positions.filter((p) => p.x < 0);
    const right = positions.filter((p) => p.x > 0);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    const keys = new Set(positions.map((p) => `${p.x}:${p.z}`));
    expect(keys.size).toBe(positions.length);
    const zs = positions.map((p) => p.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(10);
  });

  it('builds a single InstancedMesh with one matrix per pylon', () => {
    const pylons = createPylons();
    expect(pylons).toBeInstanceOf(THREE.InstancedMesh);
    expect(pylons.count).toBe(PYLON_COUNT);
  });
});

describe('arena scene', () => {
  it('enables fog with a dusk background', () => {
    const { scene } = createArenaScene();
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.background).toBeInstanceOf(THREE.Color);
  });

  it('contains water, highway, and the full pylon avenue', () => {
    const { water, highway, pylons, scene } = createArenaScene();
    expect(scene.children).toContain(water);
    expect(scene.children).toContain(highway);
    expect(scene.children).toContain(pylons);
    expect(pylons.count).toBeGreaterThanOrEqual(8);
  });
});
