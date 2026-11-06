import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync('public/manifest.webmanifest', 'utf8'),
) as {
  display: string;
  orientation: string;
  icons: { src: string; sizes: string }[];
};
const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/ui/hud.css', 'utf8');

describe('pwa installability contract', () => {
  it('manifest uses standalone display with 192 and 512 icons', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of manifest.icons) {
      expect(existsSync(`public/${icon.src}`)).toBe(true);
    }
  });

  it('index.html wires viewport-fit, manifest, theme, and notice', () => {
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('theme-color');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('id="portrait-notice"');
  });

  it('hud.css carries touch-action, notice, overflow, and safe-area', () => {
    expect(css).toContain('touch-action: none');
    expect(css).toContain('#portrait-notice');
    expect(css).toContain('orientation: portrait');
    expect(css).toContain('overflow-x');
    expect(css).toContain('env(safe-area-inset');
  });
});
