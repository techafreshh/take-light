import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_BACK,
  CAMERA_UP,
  SHAKE_MAX_OFFSET,
  addShake,
  createFollowCamera,
  createShake,
  shakeOffset,
  updateFollowCamera,
  updateShake,
} from './camera';

describe('shake', () => {
  it('trauma clamps to [0, 1]', () => {
    const state = createShake();
    addShake(state, 2);
    expect(state.trauma).toBe(1);
    addShake(state, -5);
    expect(state.trauma).toBe(0);
    addShake(state, 0.4);
    expect(state.trauma).toBeCloseTo(0.4);
  });

  it('trauma decays to zero over time', () => {
    const state = createShake();
    addShake(state, 1);
    updateShake(state, 200);
    expect(state.trauma).toBeGreaterThan(0);
    expect(state.trauma).toBeLessThan(1);
    updateShake(state, 10_000);
    expect(state.trauma).toBe(0);
  });

  it('non-positive dt never changes trauma', () => {
    const state = createShake();
    addShake(state, 0.5);
    updateShake(state, 0);
    updateShake(state, -100);
    expect(state.trauma).toBeCloseTo(0.5);
  });

  it('offset is bounded by the max and zero at rest', () => {
    const rest = createShake();
    const atRest = shakeOffset(rest);
    expect(atRest.x).toBe(0);
    expect(atRest.y).toBe(0);
    const state = createShake();
    addShake(state, 1);
    const kicked = shakeOffset(state);
    expect(Math.hypot(kicked.x, kicked.y)).toBeLessThanOrEqual(
      SHAKE_MAX_OFFSET,
    );
  });

  it('zero shake leaves the follow position unchanged', () => {
    const camera = createFollowCamera(16 / 9);
    const target = new THREE.Vector3(3, 0, -4);
    updateFollowCamera(camera, target);
    const plain = camera.position.clone();
    const state = createShake();
    const offset = shakeOffset(state);
    updateFollowCamera(camera, target, offset.x, offset.y);
    expect(camera.position.x).toBeCloseTo(plain.x);
    expect(camera.position.y).toBeCloseTo(plain.y);
    expect(camera.position.z).toBeCloseTo(plain.z);
  });

  it('shake offset shifts the follow position', () => {
    const camera = createFollowCamera(16 / 9);
    const target = new THREE.Vector3(0, 0, 0);
    updateFollowCamera(camera, target);
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.y).toBeCloseTo(CAMERA_UP);
    expect(camera.position.z).toBeCloseTo(CAMERA_BACK);
    updateFollowCamera(camera, target, 0.2, -0.1);
    expect(camera.position.x).toBeCloseTo(0.2);
    expect(camera.position.y).toBeCloseTo(CAMERA_UP - 0.1);
  });
});
