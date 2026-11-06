/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../app/state';
import { createHudStore } from './store';
import { mountMenus } from './menus';

function setupDom() {
  document.body.innerHTML =
    '<div id=\"root\"><div id=\"menu\" data-state=\"BOOT\"></div></div>';
}

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('menus overlays', () => {
  it('MENU render keeps #start-btn and Start sets RUNNING', () => {
    setupDom();
    const game = createStore('BOOT');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('MENU');
    const start = document.getElementById('start-btn') as HTMLButtonElement;
    expect(start).not.toBeNull();
    start.click();
    expect(game.get()).toBe('RUNNING');
    handle.unmount();
  });

  it('PAUSED render shows Resume and Restart', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('PAUSED');
    expect(document.getElementById('btn-resume')).not.toBeNull();
    expect(document.getElementById('btn-restart')).not.toBeNull();
    (document.getElementById('btn-resume') as HTMLButtonElement).click();
    expect(game.get()).toBe('RUNNING');
    handle.unmount();
  });

  it('GAMEOVER shows the name-entry form', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('GAMEOVER');
    expect(document.getElementById('pb-form')).not.toBeNull();
    expect(document.getElementById('pb-name')).not.toBeNull();
    expect(document.querySelector('#menu .error')).not.toBeNull();
    expect(document.getElementById('btn-restart')).not.toBeNull();
    handle.unmount();
  });

  it('empty name sets a required error and writes nothing', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const onSubmit = vi.fn();
    const handle = mountMenus({ store: game, hud, onSubmit });
    game.set('RUNNING');
    game.set('GAMEOVER');
    const input = document.getElementById('pb-name') as HTMLInputElement;
    input.value = '   ';
    const form = document.getElementById('pb-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const error = document.querySelector('#menu .error');
    expect(error?.textContent ?? '').toMatch(/required/i);
    expect(window.localStorage.getItem('take-light:pb')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    handle.unmount();
  });

  it('submitting Ngozi writes synchronously with the name stored', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    hud.push({
      score: 1250,
      multiplier: 3,
      kills: 9,
      wave: 4,
      shields: 0,
      maxShields: 3,
      dashCooldownMs: 0,
      dashCooldownMaxMs: 1200,
    });
    const onSubmit = vi.fn();
    const handle = mountMenus({ store: game, hud, onSubmit });
    game.set('RUNNING');
    game.set('GAMEOVER');
    const input = document.getElementById('pb-name') as HTMLInputElement;
    input.value = 'Ngozi';
    (document.getElementById('pb-submit') as HTMLButtonElement).click();
    const stored = window.localStorage.getItem('take-light:pb');
    expect(stored).not.toBeNull();
    expect(stored ?? '').toContain('Ngozi');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    handle.unmount();
  });
});
