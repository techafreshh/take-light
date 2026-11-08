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
import {
  CITY_COUNT,
  LAGOON_GLINT_COUNT,
  LANE_DASH_COUNT,
  PYLON_COUNT,
  cityBlockLayout,
  createCity,
  createEdgeGlow,
  createLagoonGlints,
  createLaneMarkings,
  createPylons,
  pylonPositions,
} from './props';
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

describe('lagoon skyline', () => {
  it('fields at least 14 towers', () => {
    expect(CITY_COUNT).toBeGreaterThanOrEqual(14);
    expect(cityBlockLayout(CITY_COUNT)).toHaveLength(CITY_COUNT);
  });

  it('is deterministic across calls', () => {
    expect(cityBlockLayout(16)).toEqual(cityBlockLayout(16));
  });

  it('keeps towers off the highway and inside the water plane', () => {
    for (const block of cityBlockLayout()) {
      expect(Math.abs(block.x)).toBeGreaterThan(7);
      expect(Math.abs(block.x)).toBeLessThan(100);
      expect(block.h).toBeGreaterThanOrEqual(6);
      expect(block.h).toBeLessThanOrEqual(18);
    }
    const heights = cityBlockLayout().map((block) => block.h);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(8);
  });

  it('builds a single bloom-passing InstancedMesh', () => {
    const city = createCity();
    expect(city).toBeInstanceOf(THREE.InstancedMesh);
    expect(city.count).toBe(CITY_COUNT);
    expect(city.frustumCulled).toBe(false);
    const material = city.material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBeGreaterThanOrEqual(1.2);
  });

  it('reads from the run-start camera at both aspects', () => {
    const centers = cityBlockLayout().map(
      (block) => new THREE.Vector3(block.x, block.h / 2 - 0.5, block.z),
    );
    for (const aspect of [16 / 9, 4 / 3]) {
      const camera = createFollowCamera(aspect);
      updateFollowCamera(camera, new THREE.Vector3(0, 0.8, 0));
      let visible = 0;
      for (const center of centers) {
        const projected = center.clone().project(camera);
        if (
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1 &&
          projected.z < 1 &&
          projected.z > -1
        ) {
          visible += 1;
        }
      }
      expect(visible).toBeGreaterThanOrEqual(aspect > 1.5 ? 10 : 8);
    }
  });
});

describe('highway legibility', () => {
  it('lays a 50-dash center line down the strip', () => {
    expect(LANE_DASH_COUNT).toBe(50);
    const lanes = createLaneMarkings();
    expect(lanes).toBeInstanceOf(THREE.InstancedMesh);
    expect(lanes.count).toBe(LANE_DASH_COUNT);
    expect(lanes.frustumCulled).toBe(false);
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < lanes.count; i += 1) {
      lanes.getMatrixAt(i, matrix);
      matrix.decompose(pos, quat, scale);
      expect(pos.x).toBeCloseTo(0, 5);
      expect(pos.y).toBeCloseTo(0.03, 5);
      expect(pos.z).toBeCloseTo(-98 + i * 4, 5);
    }
  });

  it('flanks the strip with cyan/magenta curb glow', () => {
    const edge = createEdgeGlow();
    expect(edge).toBeInstanceOf(THREE.Group);
    expect(edge.children).toHaveLength(2);
    const [port, starboard] = edge.children as THREE.Mesh[];
    expect(port.position.x).toBeCloseTo(-5.1, 5);
    expect(starboard.position.x).toBeCloseTo(5.1, 5);
    for (const curb of [port, starboard]) {
      expect(curb.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    }
  });

  it('reads from the run-start camera', () => {
    const lanes = createLaneMarkings();
    const camera = createFollowCamera(16 / 9);
    updateFollowCamera(camera, new THREE.Vector3(0, 0.8, 0));
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    let visible = 0;
    for (let i = 0; i < lanes.count; i += 1) {
      lanes.getMatrixAt(i, matrix);
      pos.setFromMatrixPosition(matrix);
      const projected = pos.clone().project(camera);
      if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1) {
        visible += 1;
      }
    }
    expect(visible).toBeGreaterThanOrEqual(6);
  });
});

describe('lagoon glints', () => {
  it('scatters at least 60 static quads over the water', () => {
    expect(LAGOON_GLINT_COUNT).toBeGreaterThanOrEqual(60);
    const glints = createLagoonGlints();
    expect(glints).toBeInstanceOf(THREE.InstancedMesh);
    expect(glints.count).toBe(LAGOON_GLINT_COUNT);
    expect(glints.frustumCulled).toBe(false);
    expect(glints.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('stays off the highway at water level, deterministically', () => {
    const first = createLagoonGlints();
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const firstPositions: number[] = [];
    for (let i = 0; i < first.count; i += 1) {
      first.getMatrixAt(i, matrix);
      pos.setFromMatrixPosition(matrix);
      expect(Math.abs(pos.x)).toBeGreaterThan(7);
      expect(pos.y).toBeCloseTo(0.03, 5);
      firstPositions.push(pos.x, pos.y, pos.z);
    }
    const second = createLagoonGlints();
    for (let i = 0; i < second.count; i += 1) {
      second.getMatrixAt(i, matrix);
      pos.setFromMatrixPosition(matrix);
      expect(pos.x).toBeCloseTo(firstPositions[i * 3] as number, 5);
      expect(pos.z).toBeCloseTo(firstPositions[i * 3 + 2] as number, 5);
    }
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

  it('contains the city, lanes, edge glow, glints, and traffic dressing', () => {
    const { city, laneMarkings, edgeGlow, glints, traffic, scene } =
      createArenaScene();
    expect(scene.children).toContain(city);
    expect(scene.children).toContain(laneMarkings);
    expect(scene.children).toContain(edgeGlow);
    expect(scene.children).toContain(glints);
    expect(scene.children).toContain(traffic.mesh);
    expect(scene.children).toContain(traffic.glassMesh);
    expect(scene.children).toContain(traffic.lightMesh);
  });

  it('exposes the city emissive handle with its base', () => {
    const { city, lights } = createArenaScene();
    expect(lights.cityEmissive).toBe(city.material);
    expect(lights.cityBase).toBe(
      (city.material as THREE.MeshStandardMaterial).emissiveIntensity,
    );
  });
});
