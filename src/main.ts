import * as THREE from 'three';
import { store } from './app/state';

// Walking-skeleton boot: renderer on the static canvas, a placeholder dusk
// scene, store-driven MENU overlay, rAF loop, resize handling.

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

function sizeRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function boot(): void {
  const canvas = getCanvas();
  const menu = getMenu();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  sizeRenderer(renderer);

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

  // UI reflects the store; scene code never touches the DOM.
  store.subscribe((state) => {
    menu.dataset.state = state;
    menu.style.display = state === 'MENU' ? 'flex' : 'none';
  });
  store.set('MENU');

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    sizeRenderer(renderer);
  });

  renderer.setAnimationLoop(() => {
    mesh.rotation.y += 0.01;
    mesh.rotation.x += 0.004;
    renderer.render(scene, camera);
  });
}

boot();
