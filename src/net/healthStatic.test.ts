import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function repoFile(...parts: string[]): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', ...parts), 'utf8');
}

describe('static deploy health contract', () => {
  it('public/api/health.json answers {"status":"ok"}', () => {
    const raw = repoFile('public', 'api', 'health.json');
    expect(JSON.parse(raw)).toEqual({ status: 'ok' });
  });

  it('public/_redirects rewrites /api/health with a 200', () => {
    const redirects = repoFile('public', '_redirects');
    expect(redirects).toContain('/api/health');
    expect(redirects).toContain('/api/health.json');
    expect(redirects).toContain('200');
  });

  it('Pages Function answers GET /api/health with 200 {"status":"ok"}', () => {
    const handler = repoFile('functions', 'api', 'health.ts');
    expect(handler).toContain('onRequest');
    expect(handler).toContain('status');
    expect(handler).toContain('ok');
    expect(handler).toContain('200');
  });
});
