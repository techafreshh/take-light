import * as THREE from 'three';

// Pylon avenue props: one deterministic InstancedMesh flanking the highway.
// Layout is seeded constants (no RNG) so tests and replays stay stable.

export const PYLON_COUNT = 10;

export interface PylonPosition {
  x: number;
  z: number;
}

/** Deterministic two-avenue grid flanking the highway (x = +/-8). */
export function pylonPositions(count: number = PYLON_COUNT): PylonPosition[] {
  const positions: PylonPosition[] = [];
  const half = Math.ceil(count / 2);
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    // Spread along z from -32 to +32 across the avenue rows.
    const z = half <= 1 ? 0 : -32 + (row * 64) / (half - 1);
    positions.push({ x: side * 8, z });
  }
  return positions;
}

/** Single InstancedMesh of neon pylons; matrices are composed once. */
export function createPylons(count: number = PYLON_COUNT): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 6, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a1b5e,
    emissive: 0xff6ad5,
    emissiveIntensity: 0.7,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const positions = pylonPositions(count);
  for (let i = 0; i < count; i += 1) {
    matrix.makeTranslation(positions[i].x, 3, positions[i].z);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
