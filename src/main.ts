import * as THREE from 'three';
import { store } from './app/state';
import { CAMERA_PITCH_DEG, createFollowCamera, updateFollowCamera } from './game/camera';
import { createArenaScene, configureRenderer } from './game/scene';
import { PYLON_COUNT } from './game/props';
import { createFixedLoop } from './game/loop';
import { sampleKeyboard } from './game/input';
import {
  createPlayer,
  createPlayerMesh,
  resetPlayer,
  syncPlayerMesh,
  toPlayerSnapshot,
  tryDash,
  updatePlayer,
} from './game/player';

// Boot: renderer on the static canvas, the dusk arena with the hover
// player, the 60 Hz fixed-step loop wired to the store, resize handling,
// keyboard drive, and the dev overlay. Game code never touches the DOM:
// all window/DOM mirroring lives here.

declare global {
  interface Window {
    __TAKELIGHT_STATE__?: string;
    __TAKELIGHT_TICK__?: number;
    __TAKELIGHT_START__?: () => void;
    __TAKELIGHT_FPS__?: number;
    __TAKELIGHT_SCENE__?: {
      pylonCount: number;
      cameraPitchDeg: number;
      toneMapping: string;
      fog: boolean;
    };
    __TAKELIGHT_PLAYER__?: {
      pos: { x: number; y: number; z: number };
      vel: { x: number; y: number; z: number };
      invulnerable: boolean;
      dashCooldownMs: number;
      shields: number;
    };
    __TAKELIGHT_DASH__?: () => boolean;
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
  configureRenderer(renderer);

  // Low-poly dusk arena: water, highway, pylons, dusk lights and fog.
  const { scene } = createArenaScene();

  const camera = createFollowCamera(
    window.innerWidth / window.innerHeight,
  );
  sizeRenderer(renderer, camera);

  // Kinematic hover player owned here; the sim core stays DOM-free.
  const player = createPlayer();
  const playerMesh = createPlayerMesh();
  scene.add(playerMesh);
  syncPlayerMesh(playerMesh, player);
  updateFollowCamera(camera, player.pos);

  // Keyboard drive: held codes sampled fresh every sim step.
  const pressedKeys = new Set<string>();
  let prevDashHeld = false;
  window.addEventListener('keydown', (event) => {
    if (
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight'
    ) {
      event.preventDefault();
    }
    pressedKeys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    prevDashHeld = false;
  });

  function triggerDash(): boolean {
    const input = sampleKeyboard(pressedKeys);
    let dirX = input.moveX;
    let dirZ = -input.moveY;
    if (dirX === 0 && dirZ === 0) {
      dirX = player.headingX;
      dirZ = player.headingZ;
    }
    return tryDash(player, dirX, dirZ);
  }

  // Fixed-step sim with variable-rate render every animation frame.
  let lastOverlayMs = -250;
  const loop = createFixedLoop(
    (stepMs) => {
      const input = sampleKeyboard(pressedKeys);
      if (input.dashPressed && !prevDashHeld) {
        let dirX = input.moveX;
        let dirZ = -input.moveY;
        if (dirX === 0 && dirZ === 0) {
          dirX = player.headingX;
          dirZ = player.headingZ;
        }
        tryDash(player, dirX, dirZ);
      }
      prevDashHeld = input.dashPressed;
      updatePlayer(player, input, stepMs);
    },
    () => {
      syncPlayerMesh(playerMesh, player);
      updateFollowCamera(camera, player.pos);
      window.__TAKELIGHT_TICK__ = loop.getTick();
      // Probe contracts refreshed every frame, never throttled.
      window.__TAKELIGHT_PLAYER__ = toPlayerSnapshot(player);
      window.__TAKELIGHT_DASH__ = triggerDash;
      const now = performance.now();
      if (now - lastOverlayMs >= 250) {
        lastOverlayMs = now;
        overlay.textContent =
          `fps: ${loop.getFps()} tick: ${loop.getTick()} ` +
          `dash: ${Math.ceil(player.dashCooldownMsLeft)}ms ` +
          `shields: ${player.shields}`;
        window.__TAKELIGHT_FPS__ = loop.getFps();
        window.__TAKELIGHT_SCENE__ = {
          pylonCount: PYLON_COUNT,
          cameraPitchDeg: CAMERA_PITCH_DEG,
          toneMapping: 'ACES',
          fog: true,
        };
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
      resetPlayer(player);
      prevDashHeld = false;
    }
  });

  startButton.addEventListener('click', () => {
    store.set('RUNNING');
    startButton.blur();
  });
  window.__TAKELIGHT_START__ = () => {
    store.set('RUNNING');
  };

  window.addEventListener('resize', () => {
    sizeRenderer(renderer, camera);
  });

  window.__TAKELIGHT_STATE__ = 'MENU';
  window.__TAKELIGHT_TICK__ = 0;
  window.__TAKELIGHT_PLAYER__ = toPlayerSnapshot(player);
  window.__TAKELIGHT_DASH__ = triggerDash;
  store.set('MENU');

  renderer.setAnimationLoop((time) => {
    loop.frame(time);
  });
}

boot();
