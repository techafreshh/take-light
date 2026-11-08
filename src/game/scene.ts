import * as THREE from 'three';
import {
  createCity,
  createDanfoTraffic,
  createEdgeGlow,
  createLagoonGlints,
  createLaneMarkings,
  createPylons,
  type DanfoTraffic,
} from './props';
import { DUSK_EQUIRECT_URL } from './assets';

// Low-poly dusk arena: blue water plane, dark highway strip, instanced
// pylons, warm dusk lights, indigo background with matching fog.

export const DUSK_BACKGROUND = 0x1b1035;
export const WATER_COLOR = 0x0e4d7a;
export const HIGHWAY_COLOR = 0x14141c;
export const FOG_NEAR = 30;
export const FOG_FAR = 90;
export const TONE_MAPPING_EXPOSURE = 1.1;

/** Live light handles for the blackout curve, with bases for idempotent scaling. */
export interface ArenaLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  pylonEmissive: THREE.MeshStandardMaterial;
  cityEmissive: THREE.MeshStandardMaterial;
  hemiBase: number;
  sunBase: number;
  ambientBase: number;
  pylonBase: number;
  cityBase: number;
}

export interface Arena {
  scene: THREE.Scene;
  water: THREE.Mesh;
  highway: THREE.Mesh;
  pylons: THREE.InstancedMesh;
  city: THREE.InstancedMesh;
  laneMarkings: THREE.InstancedMesh;
  edgeGlow: THREE.Group;
  glints: THREE.InstancedMesh;
  traffic: DanfoTraffic;
  lights: ArenaLights;
  /** Fire-and-forget PMREM dusk environment; lights carry a fallback. */
  applyDuskEnvironment(renderer: THREE.WebGLRenderer): void;
}

/**
 * Load the vendored dusk equirect once and install it as the PMREM
 * environment. Any failure (headless GL, missing file) keeps the
 * hemisphere/sun/ambient lights as the look — never throws.
 */
function loadDuskEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
  try {
    const loader = new THREE.TextureLoader();
    loader.load(
      DUSK_EQUIRECT_URL,
      (texture) => {
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          const pmrem = new THREE.PMREMGenerator(renderer);
          scene.environment = pmrem.fromEquirectangular(texture).texture;
          texture.dispose();
          pmrem.dispose();
        } catch {
          // Keep the lights-only fallback.
        }
      },
      undefined,
      () => {
        // Keep the lights-only fallback.
      },
    );
  } catch {
    // Headless/probe-safe: TextureLoader needs DOM Image support.
  }
}

export function createArenaScene(): Arena {
  const scene = new THREE.Scene();
  const background = new THREE.Color(DUSK_BACKGROUND);
  scene.background = background;
  scene.fog = new THREE.Fog(background, FOG_NEAR, FOG_FAR);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: WATER_COLOR, flatShading: true }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const highway = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 200),
    new THREE.MeshStandardMaterial({ color: HIGHWAY_COLOR, flatShading: true }),
  );
  highway.rotation.x = -Math.PI / 2;
  highway.position.y = 0.02;
  scene.add(highway);

  const hemisphere = new THREE.HemisphereLight(0x8f7bff, 0x1b1035, 0.7);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xff9a5c, 1.6);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x8f7bff, 0.5);
  scene.add(ambient);

  const pylons = createPylons();
  scene.add(pylons);
  const pylonEmissive = pylons.material as THREE.MeshStandardMaterial;

  const city = createCity();
  scene.add(city);
  const cityEmissive = city.material as THREE.MeshStandardMaterial;

  const laneMarkings = createLaneMarkings();
  scene.add(laneMarkings);

  const edgeGlow = createEdgeGlow();
  scene.add(edgeGlow);

  const glints = createLagoonGlints();
  scene.add(glints);

  const traffic = createDanfoTraffic();
  scene.add(traffic.mesh);
  scene.add(traffic.glassMesh);
  scene.add(traffic.lightMesh);

  return {
    scene,
    water,
    highway,
    pylons,
    city,
    laneMarkings,
    edgeGlow,
    glints,
    traffic,
    lights: {
      hemi: hemisphere,
      sun,
      ambient,
      pylonEmissive,
      cityEmissive,
      hemiBase: hemisphere.intensity,
      sunBase: sun.intensity,
      ambientBase: ambient.intensity,
      pylonBase: pylonEmissive.emissiveIntensity,
      cityBase: cityEmissive.emissiveIntensity,
    },
    applyDuskEnvironment(renderer: THREE.WebGLRenderer): void {
      loadDuskEnvironment(scene, renderer);
    },
  };
}

/** Structural renderer surface sized by `sizeRenderer`. */
export interface SizeRendererTarget {
  setPixelRatio(dpr: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
}

/** Structural camera surface synced by `sizeRenderer`. */
export interface SizeCamera {
  aspect: number;
  updateProjectionMatrix(): void;
}

/** Structural composer surface synced by `sizeRenderer`. */
export interface SizePostFX {
  setSize(width: number, height: number): void;
  setPixelRatio(dpr: number): void;
}

/** Hard DPR cap: mid-tier mobile GPUs cannot hold fps above 2x. */
export const RENDERER_MAX_DPR = 2;

/** Pure clamp so every renderer call site caps identically. */
export function capDpr(dpr: number): number {
  return Math.min(dpr, RENDERER_MAX_DPR);
}

/** ACES tone mapping with DPR capped at 2 and a fixed exposure. */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.setPixelRatio(capDpr(window.devicePixelRatio));
}

/**
 * Size the renderer (and the optional bloom composer) for the given
 * viewport. Pixel ratio goes before size on both backends so the boot
 * buffer already uses the capped DPR with no resize needed.
 */
export function sizeRenderer(
  renderer: SizeRendererTarget,
  camera: SizeCamera,
  width: number,
  height: number,
  devicePixelRatio: number,
  postfx?: SizePostFX | null,
): void {
  const dpr = capDpr(devicePixelRatio);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  postfx?.setPixelRatio(dpr);
  postfx?.setSize(width, height);
}
