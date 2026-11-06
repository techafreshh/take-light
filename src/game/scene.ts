import * as THREE from 'three';
import { createDanfoTraffic, createPylons, type DanfoTraffic } from './props';
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
  hemiBase: number;
  sunBase: number;
  ambientBase: number;
  pylonBase: number;
}

export interface Arena {
  scene: THREE.Scene;
  water: THREE.Mesh;
  highway: THREE.Mesh;
  pylons: THREE.InstancedMesh;
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

  const traffic = createDanfoTraffic();
  scene.add(traffic.mesh);

  return {
    scene,
    water,
    highway,
    pylons,
    traffic,
    lights: {
      hemi: hemisphere,
      sun,
      ambient,
      pylonEmissive,
      hemiBase: hemisphere.intensity,
      sunBase: sun.intensity,
      ambientBase: ambient.intensity,
      pylonBase: pylonEmissive.emissiveIntensity,
    },
    applyDuskEnvironment(renderer: THREE.WebGLRenderer): void {
      loadDuskEnvironment(scene, renderer);
    },
  };
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
