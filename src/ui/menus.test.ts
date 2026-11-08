/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../app/state';
import { createHudStore } from './store';
import { enqueueRun, type LeaderboardRow } from '../net/leaderboard';
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

  it('PAUSED Restart routes via MENU to RUNNING while Resume goes direct', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('PAUSED');
    const trace: string[] = [];
    const stop = game.subscribe((state) => {
      trace.push(state);
    });
    trace.length = 0;
    (document.getElementById('btn-restart') as HTMLButtonElement).click();
    expect(game.get()).toBe('RUNNING');
    expect(trace.slice(-2)).toEqual(['MENU', 'RUNNING']);
    stop();
    handle.unmount();
  });

  it('PAUSED Resume goes directly to RUNNING with no MENU hop', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('PAUSED');
    const trace: string[] = [];
    const stop = game.subscribe((state) => {
      trace.push(state);
    });
    trace.length = 0;
    (document.getElementById('btn-resume') as HTMLButtonElement).click();
    expect(game.get()).toBe('RUNNING');
    expect(trace).toEqual(['RUNNING']);
    stop();
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

  it('GAMEOVER summary reads the live wave (Wave 10)', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    hud.push({
      score: 5000,
      multiplier: 2,
      kills: 12,
      wave: 10,
      shields: 0,
      maxShields: 3,
      dashCooldownMs: 0,
      dashCooldownMaxMs: 1200,
    });
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('GAMEOVER');
    expect(document.getElementById('go-summary')?.textContent).toContain(
      'Wave 10',
    );
    handle.unmount();
  });
});

describe('leaderboard board and personal best', () => {
  function toGameOver() {
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('RUNNING');
    game.set('GAMEOVER');
    return handle;
  }

  function sampleRows(count: number): LeaderboardRow[] {
    return Array.from({ length: count }, (_, i) => ({
      name: `P${i}`,
      score: count - i,
      wave: 1,
      duration_s: 20,
      created_at: '2024-05-14T00:00:00.000Z',
    }));
  }

  it('GAMEOVER renders #leaderboard with <= 100 rows and a visible #pb', () => {
    setupDom();
    const handle = toGameOver();
    const board = document.getElementById('leaderboard');
    expect(board).not.toBeNull();
    expect(board?.tagName).toBe('OL');
    expect(board?.querySelectorAll('li').length).toBeLessThanOrEqual(100);
    const pb = document.getElementById('pb') as HTMLElement | null;
    expect(pb).not.toBeNull();
    expect((pb?.textContent ?? '').length).toBeGreaterThan(0);
    expect(pb?.style.display).not.toBe('none');
    handle.unmount();
  });

  it('MENU renders #leaderboard and #pb', () => {
    setupDom();
    const game = createStore('MENU');
    const hud = createHudStore();
    const handle = mountMenus({ store: game, hud });
    game.set('MENU');
    expect(document.getElementById('leaderboard')).not.toBeNull();
    expect(document.getElementById('pb')).not.toBeNull();
    handle.unmount();
  });

  it('refreshBoard caps pushed rows at 100', () => {
    setupDom();
    const handle = toGameOver();
    handle.refreshBoard(sampleRows(150));
    expect(
      document.querySelectorAll('#leaderboard li').length,
    ).toBeLessThanOrEqual(100);
    expect(document.querySelectorAll('#leaderboard li').length).toBe(100);
    handle.unmount();
  });

  it('#pb shows (queued) only while the queue is non-empty', () => {
    setupDom();
    const handle = toGameOver();
    expect(document.getElementById('pb')?.textContent).not.toContain(
      '(queued)',
    );
    enqueueRun({ name: 'Ngozi', score: 50, wave: 1, duration_s: 20 });
    handle.refreshBoard();
    expect(document.getElementById('pb')?.textContent).toContain('(queued)');
    handle.unmount();
  });
});
