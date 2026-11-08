import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/ui/hud.css', 'utf8');

describe('portrait graceful-notice contract', () => {
  it('both sheets hide interactive UI in portrait behind a single notice', () => {
    for (const sheet of [html, css]) {
      expect(sheet).toContain('@media (orientation: portrait)');
      expect(sheet).toContain('#stick-left');
      expect(sheet).toContain('#stick-right');
      expect(sheet).toContain('#dash-btn');
      expect(sheet).toContain('#hud');
      expect(sheet).toContain('display: none !important');
      // Notice keeps the sim running behind it.
      expect(sheet).toContain('pointer-events: none');
    }
  });

  it('notice sits above the menu with a centered safe-area card', () => {
    for (const sheet of [html, css]) {
      expect(sheet).toContain('#portrait-notice');
      expect(sheet).toContain('z-index: 30');
      expect(sheet).toContain('.portrait-card');
      expect(sheet).toContain('max-width: min(90vw, 26rem)');
      expect(sheet).toContain('text-wrap: balance');
      expect(sheet).toContain('overflow-wrap: anywhere');
    }
    // DOM keeps the notice id/role with the card wrapper.
    expect(html).toContain('id="portrait-notice"');
    expect(html).toContain('role="note"');
    expect(html).toContain('portrait-card');
  });

  it('menu panel and children clamp to the viewport width', () => {
    for (const sheet of [html, css]) {
      expect(sheet).toContain('max-width: min(calc(100vw - 32px), 28rem)');
      expect(sheet).toContain('#menu .panel > *');
      expect(sheet).toContain('min-width: 0');
    }
  });

  it('game-over summary and leaderboard wrap instead of overflowing', () => {
    for (const sheet of [html, css]) {
      expect(sheet).toContain('#go-summary');
      expect(sheet).toContain('#leaderboard');
      expect(sheet).toContain('overflow-wrap: anywhere');
    }
    expect(css).toContain('#menu input');
    expect(css).toContain('width: min(100%, 16rem)');
    expect(css).toContain('#menu form');
  });

  it('safe-area padding and short-height landscape compaction exist', () => {
    for (const sheet of [html, css]) {
      expect(sheet).toContain('env(safe-area-inset');
      expect(sheet).toContain(
        '@media (max-height: 430px) and (orientation: landscape)',
      );
    }
    expect(css).toContain('width: 96px');
    expect(css).toContain('width: 64px');
  });
});
