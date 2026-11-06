// Game state machine: BOOT -> MENU -> RUNNING -> GAMEOVER.
// Owns the single source of truth for game state; game code and UI meet
// only through this store (pub/sub) — game code never touches the DOM.
// Transitions outside the legal table are silently ignored.

export type GameState = 'BOOT' | 'MENU' | 'RUNNING' | 'GAMEOVER';

export type GameStateListener = (state: GameState) => void;

export interface Store {
  get(): GameState;
  subscribe(listener: GameStateListener): () => void;
  set(next: GameState): void;
}

const LEGAL_TRANSITIONS: Record<GameState, readonly GameState[]> = {
  BOOT: ['MENU'],
  MENU: ['RUNNING'],
  RUNNING: ['GAMEOVER', 'MENU'],
  GAMEOVER: ['MENU'],
};

export function isLegalTransition(from: GameState, to: GameState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function createStore(initial: GameState = 'BOOT'): Store {
  let current: GameState = initial;
  const listeners = new Set<GameStateListener>();

  return {
    get(): GameState {
      return current;
    },
    subscribe(listener: GameStateListener): () => void {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: GameState): void {
      if (next === current) {
        return;
      }
      if (!isLegalTransition(current, next)) {
        return;
      }
      current = next;
      listeners.forEach((listener) => {
        listener(current);
      });
    },
  };
}

// Singleton store wired up by main.ts at boot.
export const store: Store = createStore();
