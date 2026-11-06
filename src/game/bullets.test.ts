import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STEP_MS } from './loop';
import {
  BULLET_CAPACITY,
  BULLET_SPEED,
  BULLET_TTL_MS,
  MUZZLE_FADE_MS,
  clearBullets,
  createBulletField,
  fireBullet,
  muzzleOpacityForAge,
  syncBulletMeshes,
  updateBullets,
} from './bullets';

function origin(): THREE.Vector3 {
  return new THREE.Vector3(0, 0.8, 0);
}

function forward(): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1);
}

describe('bullet capacity', () => {
  it('preallocates 64 slots and never grows past it', () => {
    const field = createBulletField();
    expect(field.capacity).toBe(64);
    expect(BULLET_CAPACITY).toBe(64);
    expect(field.mesh.count).toBe(64);
    for (let i = 0; i < BULLET_CAPACITY + 20; i += 1) {
      fireBullet(field, origin(), forward());
    }
    expect(field.alive).toBe(BULLET_CAPACITY);
    expect(field.capacity).toBe(BULLET_CAPACITY);
    expect(field.px.length).toBe(BULLET_CAPACITY);
  });

  it('fires tracers at bullet speed along the bearing', () => {
    const field = createBulletField();
    fireBullet(field, origin(), forward());
    expect(field.alive).toBe(1);
    expect(field.vx[0]).toBeCloseTo(0, 10);
    expect(field.vz[0]).toBeCloseTo(-BULLET_SPEED, 10);
    expect(field.ttlMs[0]).toBe(BULLET_TTL_MS);
  });
});

describe('bullet TTL', () => {
  it('kills tracers at 1200 ms', () => {
    const field = createBulletField();
    fireBullet(field, origin(), forward());
    updateBullets(field, BULLET_TTL_MS - 1);
    expect(field.alive).toBe(1);
    updateBullets(field, 1);
    expect(field.alive).toBe(0);
  });

  it('holds 8 alive when firing 8/s for 1000 ms of fixed steps', () => {
    const field = createBulletField();
    // Emulate the weapon cadence: decrement-then-fire on 125 ms.
    const steps = Math.round(1000 / STEP_MS);
    let cooldown = 0;
    for (let i = 0; i < steps; i += 1) {
      if (cooldown > 0) {
        cooldown -= STEP_MS;
      }
      if (cooldown <= 0) {
        fireBullet(field, origin(), forward());
        cooldown = 125;
      }
      updateBullets(field, STEP_MS);
    }
    expect(field.alive).toBe(8);
  });

  it('integrates position at 40 units/s', () => {
    const field = createBulletField();
    fireBullet(field, origin(), forward());
    updateBullets(field, 500);
    expect(field.pz[0]).toBeCloseTo(-BULLET_SPEED * 0.5, 5);
  });
});

describe('mesh sync', () => {
  it('maps alive count 1:1 to visible instances', () => {
    const field = createBulletField();
    syncBulletMeshes(field);
    expect(field.mesh.visible).toBe(false);
    fireBullet(field, origin(), forward());
    fireBullet(field, origin(), forward());
    syncBulletMeshes(field);
    expect(field.mesh.visible).toBe(true);
    const m = new THREE.Matrix4();
    field.mesh.getMatrixAt(0, m);
    expect(m.elements[0]).not.toBe(0);
    field.mesh.getMatrixAt(2, m);
    const isZero =
      m.elements[0] === 0 &&
      m.elements[5] === 0 &&
      m.elements[10] === 0;
    expect(isZero).toBe(true);
  });

  it('collapses dead instances to zero scale', () => {
    const field = createBulletField();
    fireBullet(field, origin(), forward());
    syncBulletMeshes(field);
    updateBullets(field, BULLET_TTL_MS);
    syncBulletMeshes(field);
    expect(field.alive).toBe(0);
    expect(field.mesh.visible).toBe(false);
    const m = new THREE.Matrix4();
    field.mesh.getMatrixAt(0, m);
    expect(m.elements[0]).toBe(0);
    expect(m.elements[5]).toBe(0);
    expect(m.elements[10]).toBe(0);
  });

  it('clears to a hidden deterministic state', () => {
    const field = createBulletField();
    fireBullet(field, origin(), forward());
    clearBullets(field);
    expect(field.alive).toBe(0);
    expect(field.mesh.visible).toBe(false);
    expect(field.muzzle.visible).toBe(false);
  });
});

describe('muzzle fade', () => {
  it('opacity reaches 0 by 60 ms', () => {
    expect(muzzleOpacityForAge(0)).toBe(1);
    expect(muzzleOpacityForAge(MUZZLE_FADE_MS - 1)).toBeGreaterThan(0);
    expect(muzzleOpacityForAge(MUZZLE_FADE_MS)).toBe(0);
    expect(muzzleOpacityForAge(MUZZLE_FADE_MS + 60)).toBe(0);
  });
});
