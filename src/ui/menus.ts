// Menu / pause / game-over overlays: owns the existing #menu element,
// renders per GameState, writes the local personal best. Reads only the
// numbers-only hudStore bridge; never imports three.js or game sim code.
import { store, type Store } from '../app/state';
import { hudStore, PB_STORAGE_KEY, type HudStore } from './store';

export interface PbEntry {
  name: string;
  score: number;
  wave: number;
  kills: number;
  at: string;
}

export interface MountMenusOptions {
  onSubmit?: (entry: PbEntry) => void;
  store?: Store;
  hud?: HudStore;
}

export interface MenusHandle {
  element: HTMLElement;
  unmount(): void;
}

function getMenuElement(): HTMLElement {
  const existing = document.getElementById('menu');
  if (existing !== null) {
    return existing;
  }
  const created = document.createElement('div');
  created.id = 'menu';
  (document.getElementById('root') ?? document.body).appendChild(created);
  return created;
}

function setVisible(menu: HTMLElement, state: string): void {
  menu.dataset.state = state;
  if (state === 'RUNNING' || state === 'BOOT') {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'flex';
  }
}

function makeButton(id: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  return button;
}

/** Mount overlay ownership of #menu; unmount detaches the store listener. */
export function mountMenus(options: MountMenusOptions = {}): MenusHandle {
  const game = options.store ?? store;
  const bridge = options.hud ?? hudStore;
  const onSubmit = options.onSubmit;
  const menu = getMenuElement();

  function renderMenu(state: string): void {
    setVisible(menu, state);
    menu.textContent = '';
    if (state === 'MENU') {
      const panel = document.createElement('div');
      panel.className = 'panel';
      const title = document.createElement('h1');
      title.textContent = 'take-light';
      const subtitle = document.createElement('p');
      subtitle.textContent = 'MENU';
      const start = makeButton('start-btn', 'Start');
      start.addEventListener('click', () => {
        game.set('RUNNING');
        start.blur();
      });
      panel.appendChild(title);
      panel.appendChild(subtitle);
      panel.appendChild(start);
      menu.appendChild(panel);
    } else if (state === 'PAUSED') {
      const panel = document.createElement('div');
      panel.className = 'panel';
      const title = document.createElement('h1');
      title.textContent = 'Paused';
      const resume = makeButton('btn-resume', 'Resume');
      resume.addEventListener('click', () => {
        game.set('RUNNING');
        resume.blur();
      });
      const restart = makeButton('btn-restart', 'Restart');
      restart.addEventListener('click', () => {
        game.set('RUNNING');
        restart.blur();
      });
      panel.appendChild(title);
      panel.appendChild(resume);
      panel.appendChild(restart);
      menu.appendChild(panel);
    } else if (state === 'GAMEOVER') {
      const snapshot = bridge.get();
      const panel = document.createElement('div');
      panel.className = 'panel';
      const title = document.createElement('h1');
      title.textContent = 'Game Over';
      const summary = document.createElement('p');
      summary.id = 'go-summary';
      summary.textContent =
        `Score ${String(snapshot.score)} · Wave ${String(snapshot.wave)} · Kills ${String(snapshot.kills)}`;
      const form = document.createElement('form');
      form.id = 'pb-form';
      form.setAttribute('novalidate', '');
      const input = document.createElement('input');
      input.id = 'pb-name';
      input.setAttribute('maxlength', '24');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('placeholder', 'Your name');
      const submit = document.createElement('button');
      submit.id = 'pb-submit';
      submit.type = 'button';
      submit.textContent = 'Save';
      const error = document.createElement('div');
      error.className = 'error';
      const restart = makeButton('btn-restart', 'Restart');
      restart.addEventListener('click', () => {
        game.set('RUNNING');
        restart.blur();
      });

      function handleSubmit(event: Event): void {
        event.preventDefault();
        const raw = input.value ?? '';
        const name = raw.trim().slice(0, 24);
        if (name.length === 0) {
          error.textContent = 'Name is required';
          return;
        }
        const live = bridge.get();
        const entry: PbEntry = {
          name,
          score: live.score,
          wave: live.wave,
          kills: live.kills,
          at: new Date().toISOString(),
        };
        try {
          window.localStorage.setItem(
            PB_STORAGE_KEY,
            JSON.stringify(entry),
          );
        } catch {
          // Storage full/blocked: still confirm + callback, never throw.
        }
        error.textContent = '';
        let saved = panel.querySelector('.saved');
        if (saved === null) {
          saved = document.createElement('div');
          saved.className = 'saved';
          panel.insertBefore(saved, restart);
        }
        saved.textContent = `Best saved: ${name}`;
        if (onSubmit !== undefined) {
          onSubmit(entry);
        }
      }

      form.addEventListener('submit', handleSubmit);
      submit.addEventListener('click', handleSubmit);
      form.appendChild(input);
      form.appendChild(submit);
      form.appendChild(error);
      panel.appendChild(title);
      panel.appendChild(summary);
      panel.appendChild(form);
      panel.appendChild(restart);
      menu.appendChild(panel);
    }
  }

  const unsubscribe = game.subscribe(renderMenu);

  return {
    element: menu,
    unmount(): void {
      unsubscribe();
    },
  };
}
