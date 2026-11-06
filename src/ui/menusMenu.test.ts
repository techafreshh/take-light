/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../app/state';
import { createHudStore } from './store';
import { mountMenus } from './menus';

function setupDom() {
  document.body.innerHTML =
    '<div id="root"><div id="menu" data-state="BOOT"></div></div>';
}

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('menus Menu exits', () => {
  it('GAMEOVER exposes a Menu button returning to MENU', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('GAMEOVER');
    const toMenu = document.getElementById('btn-menu') as HTMLButtonElement;
    expect(toMenu).not.toBeNull();
    expect(toMenu.textContent).toMatch(/menu/i);
    toMenu.click();
    expect(game.get()).toBe('MENU');
    handle.unmount();
  });

  it('PAUSED exposes a Menu button returning to MENU', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('PAUSED');
    const toMenu = document.getElementById(
      'btn-menu-pause',
    ) as HTMLButtonElement;
    expect(toMenu).not.toBeNull();
    expect(toMenu.textContent).toMatch(/menu/i);
    toMenu.click();
    expect(game.get()).toBe('MENU');
    handle.unmount();
  });
});
