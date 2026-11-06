// Game state machine: BOOT -> MENU -> RUNNING -> GAMEOVER.
// Owns the single source of truth for game state; game code and UI meet
// only through this store (pub/sub) — game code never touches the DOM.

export type GameState = 'BOOT' | 'MENU' | 'RUNNING' | 'GAMEOVER';

export type GameStateListener = (state: GameState) => void;

export interface Store {
  get(): GameState;
  subscribe(listener: GameStateListener): () => void;
  set(next: GameState): void;
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
      current = next;
      listeners.forEach((listener) => {
        listener(current);
      });
    },
  };
}

// Singleton store wired up by main.ts at boot.
export const store: Store = createStore();
