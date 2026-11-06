import * as THREE from 'three';
import { store } from './app/state';
import { createFixedLoop } from './game/loop';

// Boot: renderer on the static canvas, a placeholder dusk scene, the 60 Hz
// fixed-step loop wired to the store, resize handling, and the dev overlay.
// Game code never touches the DOM: all window/DOM mirroring lives here.

declare global {
  interface Window {
    __TAKELIGHT_STATE__?: string;
    __TAKELIGHT_TICK__?: number;
    __TAKELIGHT_START__?: () => void;
  }
}

function getCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (canvas === null) {
    throw new Error('take-light: missing canvas#game-canvas');
  }
  return canvas;
}

function getMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('#menu');
  if (menu === null) {
    throw new Error('take-light: missing #menu overlay');
  }
  return menu;
}

function getStartButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('#start-btn');
  if (button === null) {
    throw new Error('take-light: missing button#start-btn');
  }
  return button;
}

function getOverlay(): HTMLElement {
  const overlay = document.querySelector<HTMLElement>('#dev-overlay');
  if (overlay === null) {
    throw new Error('take-light: missing #dev-overlay');
  }
  return overlay;
}

function sizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function boot(): void {
  const canvas = getCanvas();
  const menu = getMenu();
  const startButton = getStartButton();
  const overlay = getOverlay();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  // Placeholder dusk scene: deep indigo clear color, one emissive marker
  // mesh, one warm directional light plus ambient fill.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1035);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);
  sizeRenderer(renderer, camera);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({
      color: 0x7c5cff,
      emissive: 0xff6ad5,
      emissiveIntensity: 0.55,
    }),
  );
  mesh.position.y = 1;
  scene.add(mesh);

  const sun = new THREE.DirectionalLight(0xff9a5c, 1.6);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8f7bff, 0.5));

  // Fixed-step sim: one deterministic quantum per tick, mesh advanced by a
  // constant increment. Variable-rate render every animation frame.
  let lastOverlayMs = -250;
  const loop = createFixedLoop(
    () => {
      mesh.rotation.y += 0.02;
      mesh.rotation.x += 0.007;
    },
    () => {
      window.__TAKELIGHT_TICK__ = loop.getTick();
      const now = performance.now();
      if (now - lastOverlayMs >= 250) {
        lastOverlayMs = now;
        overlay.textContent = `fps: ${loop.getFps()} tick: ${loop.getTick()}`;
      }
      renderer.render(scene, camera);
    },
    () => store.get() === 'RUNNING',
  );

  // UI reflects the store; scene code never touches the DOM.
  store.subscribe((state) => {
    menu.dataset.state = state;
    menu.style.display = state === 'MENU' ? 'flex' : 'none';
    window.__TAKELIGHT_STATE__ = state;
    if (state === 'RUNNING') {
      loop.resetTick();
      window.__TAKELIGHT_TICK__ = 0;
    }
  });

  startButton.addEventListener('click', () => {
    store.set('RUNNING');
  });
  window.__TAKELIGHT_START__ = () => {
    store.set('RUNNING');
  };

  window.addEventListener('resize', () => {
    sizeRenderer(renderer, camera);
  });

  window.__TAKELIGHT_STATE__ = 'MENU';
  window.__TAKELIGHT_TICK__ = 0;
  store.set('MENU');

  renderer.setAnimationLoop((time) => {
    loop.frame(time);
  });
}

boot();
