/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHudStore } from './store';
import { createStore } from '../app/state';
import { mountHud } from './hud';

function pushSnapshot(
  bridge: ReturnType<typeof createHudStore>,
  partial: Record<string, number> = {},
) {
  bridge.push({
    score: 0,
    multiplier: 1,
    kills: 0,
    wave: 1,
    shields: 3,
    maxShields: 3,
    dashCooldownMs: 0,
    dashCooldownMaxMs: 1200,
    ...partial,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('hud panel', () => {
  it('mount creates the four ids with 3 pips', () => {
    document.body.innerHTML = '<div id=\"root\"></div>';
    const hud = createHudStore();
    const game = createStore('MENU');
    const handle = mountHud({ hud, game });
    pushSnapshot(hud);
    expect(document.getElementById('hud-score')).not.toBeNull();
    expect(document.getElementById('hud-multiplier')).not.toBeNull();
    expect(document.getElementById('hud-wave')).not.toBeNull();
    const shields = document.getElementById('hud-shields');
    expect(shields).not.toBeNull();
    expect(document.getElementById('hud-dash')).not.toBeNull();
    expect(shields?.querySelectorAll('.pip').length).toBe(3);
    expect(shields?.querySelectorAll('.pip.on').length).toBe(3);
    handle.unmount();
  });

  it('pushing shields 1 leaves 1 lit pip', () => {
    document.body.innerHTML = '<div id=\"root\"></div>';
    const hud = createHudStore();
    const game = createStore('MENU');
    const handle = mountHud({ hud, game });
    pushSnapshot(hud, { shields: 3 });
    pushSnapshot(hud, { shields: 1 });
    expect(
      document.querySelectorAll('#hud-shields .pip').length,
    ).toBe(3);
    expect(
      document.querySelectorAll('#hud-shields .pip.on').length,
    ).toBe(1);
    handle.unmount();
  });

  it('dash fill width tracks 1 - ms/max and readies at zero', () => {
    document.body.innerHTML = '<div id=\"root\"></div>';
    const hud = createHudStore();
    const game = createStore('MENU');
    const handle = mountHud({ hud, game });
    pushSnapshot(hud, { dashCooldownMs: 600, dashCooldownMaxMs: 1200 });
    const fill = document.querySelector(
      '#hud-dash .dash-fill',
    ) as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('50%');
    expect(fill?.classList.contains('ready')).toBe(false);
    pushSnapshot(hud, { dashCooldownMs: 0, dashCooldownMaxMs: 1200 });
    expect(fill?.style.width).toBe('100%');
    expect(fill?.classList.contains('ready')).toBe(true);
    handle.unmount();
  });

  it('multiplier text updates', () => {
    document.body.innerHTML = '<div id=\"root\"></div>';
    const hud = createHudStore();
    const game = createStore('MENU');
    const handle = mountHud({ hud, game });
    pushSnapshot(hud, { multiplier: 1 });
    expect(document.getElementById('hud-multiplier')?.textContent).toContain(
      '1',
    );
    pushSnapshot(hud, { multiplier: 3 });
    expect(document.getElementById('hud-multiplier')?.textContent).toContain(
      '3',
    );
    handle.unmount();
  });

  it('identical push performs zero DOM writes', () => {
    document.body.innerHTML = '<div id=\"root\"></div>';
    const hud = createHudStore();
    const game = createStore('MENU');
    const handle = mountHud({ hud, game });
    pushSnapshot(hud, { score: 100, multiplier: 2, wave: 2 });
    const scoreElement = document.getElementById('hud-score') as HTMLElement;
    let writes = 0;
    let current: string | null = scoreElement.textContent;
    Object.defineProperty(scoreElement, 'textContent', {
      get(): string | null {
        return current;
      },
      set(value: string | null) {
        writes += 1;
        current = value;
      },
      configurable: true,
    });
    const snapshot = hud.get();
    hud.push({ ...snapshot });
    expect(writes).toBe(0);
    handle.unmount();
  });

  it('hud.css carries the glass + tabular + compact contract', () => {
    const css = readFileSync('src/ui/hud.css', 'utf8');
    expect(css).toContain('.panel');
    expect(css).toContain('tabular-nums');
    expect(css).toMatch(/420px|360px/);
  });
});
