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

/**
 * Single InstancedMesh of neon pylons; matrices are composed once.
 * Emissive sits at 1.4 so the avenue clears the 0.85 bloom threshold
 * and reads at dusk (okada telegraph-glow precedent: hot accents >1.0).
 */
export function createPylons(count: number = PYLON_COUNT): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 6, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a1b5e,
    emissive: 0xff6ad5,
    emissiveIntensity: 1.4,
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

// Lagoon skyline: deterministic crescent of lit towers flanking the
// highway mid-field. The fixed follow camera pitches ~50 degrees down, so
// only ground within ~39 units reads in-frame: the towers sit at
// |x| 12..14, z -12..+2 (bases sunk 0.5 into the lagoon), clear of the
// pylon avenue (outer edge 8.5) and the highway (half-width 5).

/** Fixed skyline capacity: one draw call for the whole crescent. */
export const CITY_COUNT = 16;

/** Resting emissive for the window glow; clears the bloom threshold. */
export const CITY_EMISSIVE_INTENSITY = 1.4;

export interface CityBlock {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** Deterministic crescent layout (no RNG) so tests and stills stay stable. */
export function cityBlockLayout(count: number = CITY_COUNT): CityBlock[] {
  const blocks: CityBlock[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const slot = Math.floor(i / 2);
    const tier = slot % 2;
    blocks.push({
      x: side * (12 + tier * 2),
      z: -12 + slot * 2,
      w: 4 + ((slot + tier) % 3),
      h: 6 + ((slot * 7 + tier * 4) % 13),
      d: 4 + ((slot * 2 + tier) % 3),
    });
  }
  return blocks;
}

const cityTmpMatrix = new THREE.Matrix4();
const cityTmpPos = new THREE.Vector3();
const cityTmpQuat = new THREE.Quaternion();
const cityTmpScale = new THREE.Vector3();

// Procedural window grid baked once to a canvas texture: dark tower faces
// with warm amber / cool cyan lit windows. No network, no decoders, no
// per-frame cost; a null-guarded fallback keeps headless/test runtimes
// (no 2D canvas) on the plain emissive path instead of throwing.
let cachedWindowTexture: THREE.Texture | null | undefined;

function cityWindowTexture(): THREE.Texture | null {
  if (cachedWindowTexture !== undefined) {
    return cachedWindowTexture;
  }
  cachedWindowTexture = null;
  try {
    if (typeof document === 'undefined') {
      return cachedWindowTexture;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return cachedWindowTexture;
    }
    ctx.fillStyle = '#07070f';
    ctx.fillRect(0, 0, 128, 256);
    for (let row = 0; row < 24; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const hash = (row * 31 + col * 17 + row * col * 3) % 10;
        if (hash < 4) {
          continue;
        }
        ctx.fillStyle = hash < 8 ? '#ffb35c' : '#7de8ff';
        ctx.fillRect(6 + col * 10, 8 + row * 10, 5, 6);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    cachedWindowTexture = texture;
  } catch {
    cachedWindowTexture = null;
  }
  return cachedWindowTexture;
}

/** Single InstancedMesh of window-lit towers; matrices composed once. */
export function createCity(count: number = CITY_COUNT): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const windows = cityWindowTexture();
  const material =
    windows === null
      ? new THREE.MeshStandardMaterial({
          color: 0x1a1430,
          emissive: 0xffb35c,
          emissiveIntensity: CITY_EMISSIVE_INTENSITY,
          flatShading: true,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x11142a,
          emissive: 0xffffff,
          emissiveIntensity: 1.3,
          emissiveMap: windows,
          flatShading: true,
        });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  const blocks = cityBlockLayout(count);
  for (let i = 0; i < count; i += 1) {
    const block = blocks[i];
    cityTmpPos.set(block.x, block.h / 2 - 0.5, block.z);
    cityTmpQuat.identity();
    cityTmpScale.set(block.w, block.h, block.d);
    cityTmpMatrix.compose(cityTmpPos, cityTmpQuat, cityTmpScale);
    mesh.setMatrixAt(i, cityTmpMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// Highway legibility: center dashes plus curb edge glow. Both are unlit
// MeshBasicMaterial (bullets.ts tracer precedent), so the wave-10
// blackout never touches them and the highway stays readable late-run.

/** Fixed dash capacity: one quad every 4 units down the 200-unit strip. */
export const LANE_DASH_COUNT = 50;

const laneTmpMatrix = new THREE.Matrix4();
const laneTmpPos = new THREE.Vector3();
const laneTmpQuat = new THREE.Quaternion();
const laneTmpScale = new THREE.Vector3(1, 1, 1);

/** Single InstancedMesh of warm center dashes; matrices composed once. */
export function createLaneMarkings(
  count: number = LANE_DASH_COUNT,
): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(0.35, 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffd98a).multiplyScalar(1.25),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i += 1) {
    laneTmpPos.set(0, 0.03, -98 + i * 4);
    laneTmpQuat.identity();
    laneTmpMatrix.compose(laneTmpPos, laneTmpQuat, laneTmpScale);
    mesh.setMatrixAt(i, laneTmpMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Curb edge glow: two long thin unlit strips just outside the highway
 * (x = +/-5.1), cyan port-side and magenta starboard-side. Static pair,
 * so the sim loop never touches them.
 */
export function createEdgeGlow(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.18, 0.06, 200);
  const port = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x37f6ff }),
  );
  port.position.set(-5.1, 0.03, 0);
  const starboard = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
  );
  starboard.position.set(5.1, 0.03, 0);
  group.add(port, starboard);
  return group;
}

// Lagoon life: static pale-cyan glints scattered over the water plane.
// Unlit additive quads (tracer precedent) at y = 0.03, |x| > 7 so they
// never z-fight the highway strip; composed once, never updated.

/** Fixed glint capacity: one draw call for the whole lagoon shimmer. */
export const LAGOON_GLINT_COUNT = 72;

const glintTmpMatrix = new THREE.Matrix4();
const glintTmpPos = new THREE.Vector3();
const glintTmpQuat = new THREE.Quaternion();
const glintTmpScale = new THREE.Vector3();
const glintTmpEuler = new THREE.Euler();

/** Single InstancedMesh of lagoon glints; matrices composed once. */
export function createLagoonGlints(
  count: number = LAGOON_GLINT_COUNT,
): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1.2, 0.6);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9fe8ff,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i += 1) {
    const lane = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    glintTmpPos.set(
      side * (8 + ((lane * 7.3) % 46)),
      0.03,
      -90 + ((lane * 11.7) % 180),
    );
    glintTmpEuler.set(0, (lane * 2.4) % Math.PI, 0);
    glintTmpQuat.setFromEuler(glintTmpEuler);
    const s = 0.6 + (lane % 3) * 0.4;
    glintTmpScale.set(s, 1, s);
    glintTmpMatrix.compose(glintTmpPos, glintTmpQuat, glintTmpScale);
    mesh.setMatrixAt(i, glintTmpMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// Danfo traffic: pooled SoA lane state (parallel x/z/speed arrays)
// rendered through a yellow InstancedMesh down the highway, plus a dark
// window band and per-van head/taillight bars. The body keeps its exact
// lanes/wrap/speeds; glass and lights ride the same SoA through the same
// compose path on the fixed quantum. The bullets.ts zero-allocation
// idiom: preallocate at boot, never grow, module-scope temps only.

/** Fixed traffic capacity: one draw call per dressing layer. */
export const DANFO_COUNT = 10;

/** Wrap-around at the highway ends (highway is 10 wide x 200 long). */
export const DANFO_WRAP_Z = 95;

/** Alternating lanes flanking/riding the highway center. */
export const DANFO_LANE_X = [-2.5, 0.5, 2.8];

/** Per-lane cruise speeds (units/s); staggered so vans spread out. */
export const DANFO_LANE_SPEED = [7, 11, 9];

/** Light bars per van: one headlight pair plus one taillight pair. */
export const DANFO_LIGHTS_PER_VAN = 2;

export interface DanfoTraffic {
  mesh: THREE.InstancedMesh;
  glassMesh: THREE.InstancedMesh;
  lightMesh: THREE.InstancedMesh;
  count: number;
  x: Float32Array;
  z: Float32Array;
  speed: Float32Array;
}

const trafficTmpMatrix = new THREE.Matrix4();
const trafficTmpPos = new THREE.Vector3();
const trafficTmpQuat = new THREE.Quaternion();
const trafficTmpScale = new THREE.Vector3(1, 1, 1);

/** Headlight white and taillight red, both hot enough to bloom. */
const HEADLIGHT_COLOR = new THREE.Color(0xfff6d8).multiplyScalar(2.5);
const TAILLIGHT_COLOR = new THREE.Color(0xff2d2d).multiplyScalar(2.8);

/** Deterministic spread over [-90, 90] so tests and replays stay stable. */
export function danfoInitialZ(i: number, count: number = DANFO_COUNT): number {
  if (count <= 1) {
    return 0;
  }
  return -90 + (i * 180) / (count - 1);
}

function composeDanfoMatrix(traffic: DanfoTraffic, i: number): void {
  trafficTmpQuat.identity();
  // Body: 2 x 1.2 x 4.5 van centered 0.6 above the strip.
  trafficTmpPos.set(traffic.x[i], 0.6, traffic.z[i]);
  trafficTmpMatrix.compose(trafficTmpPos, trafficTmpQuat, trafficTmpScale);
  traffic.mesh.setMatrixAt(i, trafficTmpMatrix);
  // Window band: slightly proud of the body so it reads as a glass strip.
  trafficTmpPos.set(traffic.x[i], 0.85, traffic.z[i]);
  trafficTmpMatrix.compose(trafficTmpPos, trafficTmpQuat, trafficTmpScale);
  traffic.glassMesh.setMatrixAt(i, trafficTmpMatrix);
  // Light bars: headlights ahead (+z, vans cruise toward +z), taillights aft.
  trafficTmpPos.set(traffic.x[i], 0.45, traffic.z[i] + 2.28);
  trafficTmpMatrix.compose(trafficTmpPos, trafficTmpQuat, trafficTmpScale);
  traffic.lightMesh.setMatrixAt(i * DANFO_LIGHTS_PER_VAN, trafficTmpMatrix);
  trafficTmpPos.set(traffic.x[i], 0.5, traffic.z[i] - 2.28);
  trafficTmpMatrix.compose(trafficTmpPos, trafficTmpQuat, trafficTmpScale);
  traffic.lightMesh.setMatrixAt(
    i * DANFO_LIGHTS_PER_VAN + 1,
    trafficTmpMatrix,
  );
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
  // Window band: dark glass inset-reading strip proud of the body shell.
  const glassMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.02, 0.4, 4.02),
    new THREE.MeshStandardMaterial({
      color: 0x0e1626,
      emissive: 0x2a5a8a,
      emissiveIntensity: 0.55,
      flatShading: true,
    }),
    count,
  );
  glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glassMesh.frustumCulled = false;
  // Light bars: unlit HDR pair per van (white front, red rear via
  // per-instance color), exempt from the blackout like tracers.
  const lightMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.28, 0.12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    count * DANFO_LIGHTS_PER_VAN,
  );
  lightMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lightMesh.frustumCulled = false;
  for (let i = 0; i < count * DANFO_LIGHTS_PER_VAN; i += 1) {
    lightMesh.setColorAt(i, i % 2 === 0 ? HEADLIGHT_COLOR : TAILLIGHT_COLOR);
  }
  if (lightMesh.instanceColor !== null) {
    lightMesh.instanceColor.needsUpdate = true;
  }
  const traffic: DanfoTraffic = {
    mesh,
    glassMesh,
    lightMesh,
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
  glassMesh.instanceMatrix.needsUpdate = true;
  lightMesh.instanceMatrix.needsUpdate = true;
  return traffic;
}

/**
 * Fixed-step advance: cruise down the highway and wrap at the ends.
 * Recomposes body, glass, and light matrices with module temps only;
 * never allocates.
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
  traffic.glassMesh.instanceMatrix.needsUpdate = true;
  traffic.lightMesh.instanceMatrix.needsUpdate = true;
}
