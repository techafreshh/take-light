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

// Danfo traffic: pooled SoA lane state (parallel x/z/speed arrays)
// rendered through a single yellow InstancedMesh down the highway. The
// bullets.ts zero-allocation idiom: preallocate at boot, never grow,
// module-scope temps only, matrix compose on the fixed quantum.

/** Fixed traffic capacity: one draw call for the whole avenue. */
export const DANFO_COUNT = 10;

/** Wrap-around at the highway ends (highway is 10 wide x 200 long). */
export const DANFO_WRAP_Z = 95;

/** Alternating lanes flanking/riding the highway center. */
export const DANFO_LANE_X = [-2.5, 0.5, 2.8];

/** Per-lane cruise speeds (units/s); staggered so vans spread out. */
export const DANFO_LANE_SPEED = [7, 11, 9];

export interface DanfoTraffic {
  mesh: THREE.InstancedMesh;
  count: number;
  x: Float32Array;
  z: Float32Array;
  speed: Float32Array;
}

const trafficTmpMatrix = new THREE.Matrix4();
const trafficTmpPos = new THREE.Vector3();
const trafficTmpQuat = new THREE.Quaternion();
const trafficTmpScale = new THREE.Vector3(1, 1, 1);

/** Deterministic spread over [-90, 90] so tests and replays stay stable. */
export function danfoInitialZ(i: number, count: number = DANFO_COUNT): number {
  if (count <= 1) {
    return 0;
  }
  return -90 + (i * 180) / (count - 1);
}

function composeDanfoMatrix(traffic: DanfoTraffic, i: number): void {
  trafficTmpPos.set(traffic.x[i], 0.6, traffic.z[i]);
  trafficTmpQuat.identity();
  trafficTmpMatrix.compose(trafficTmpPos, trafficTmpQuat, trafficTmpScale);
  traffic.mesh.setMatrixAt(i, trafficTmpMatrix);
}

/** Preallocate the full traffic field; matrices are composed once. */
export function createDanfoTraffic(count: number = DANFO_COUNT): DanfoTraffic {
  const geometry = new THREE.BoxGeometry(2, 1.2, 4.5);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffc21a,
    emissive: 0x593300,
    emissiveIntensity: 0.35,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const traffic: DanfoTraffic = {
    mesh,
    count,
    x: new Float32Array(count),
    z: new Float32Array(count),
    speed: new Float32Array(count),
  };
  for (let i = 0; i < count; i += 1) {
    traffic.x[i] = DANFO_LANE_X[i % DANFO_LANE_X.length];
    traffic.z[i] = danfoInitialZ(i, count);
    traffic.speed[i] = DANFO_LANE_SPEED[i % DANFO_LANE_SPEED.length];
    composeDanfoMatrix(traffic, i);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return traffic;
}

/**
 * Fixed-step advance: cruise down the highway and wrap at the ends.
 * Recomposes matrices with module temps only; never allocates.
 */
export function updateDanfoTraffic(traffic: DanfoTraffic, dtMs: number): void {
  const dt = Math.max(dtMs, 0) / 1000;
  const span = DANFO_WRAP_Z * 2;
  for (let i = 0; i < traffic.count; i += 1) {
    let z = traffic.z[i] + traffic.speed[i] * dt;
    if (z > DANFO_WRAP_Z) {
      z -= span;
    } else if (z < -DANFO_WRAP_Z) {
      z += span;
    }
    traffic.z[i] = z;
    composeDanfoMatrix(traffic, i);
  }
  traffic.mesh.instanceMatrix.needsUpdate = true;
}
