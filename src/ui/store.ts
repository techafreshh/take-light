// Numbers-only HUD snapshot bridge: main.ts feeds sim numbers each render,
// hud.ts/menus.ts subscribe and patch the DOM. No 3D engine, no sim imports.

/** Dash cooldown ceiling shared by the bridge default and the HUD fill. */
export const DASH_COOLDOWN_MAX_MS = 1200;

/** Personal-best localStorage key written by the game-over name entry. */
export const PB_STORAGE_KEY = 'take-light:pb';

export interface HudSnapshot {
  score: number;
  multiplier: number;
  kills: number;
  wave: number;
  shields: number;
  maxShields: number;
  dashCooldownMs: number;
  dashCooldownMaxMs: number;
}

export type HudListener = (snapshot: HudSnapshot) => void;

export interface HudStore {
  get(): HudSnapshot;
  subscribe(listener: HudListener): () => void;
  push(next: HudSnapshot): void;
}

export function defaultSnapshot(): HudSnapshot {
  return {
    score: 0,
    multiplier: 1,
    kills: 0,
    wave: 1,
    shields: 3,
    maxShields: 3,
    dashCooldownMs: 0,
    dashCooldownMaxMs: DASH_COOLDOWN_MAX_MS,
  };
}

export function createHudStore(initial: Partial<HudSnapshot> = {}): HudStore {
  let current: HudSnapshot = { ...defaultSnapshot(), ...initial };
  const listeners = new Set<HudListener>();

  return {
    get(): HudSnapshot {
      return { ...current };
    },
    subscribe(listener: HudListener): () => void {
      listeners.add(listener);
      listener({ ...current });
      return () => {
        listeners.delete(listener);
      };
    },
    push(next: HudSnapshot): void {
      current = { ...next };
      const snapshot = { ...current };
      listeners.forEach((listener) => {
        listener(snapshot);
      });
    },
  };
}

// Singleton bridge wired up by main.ts every render.
export const hudStore: HudStore = createHudStore();
