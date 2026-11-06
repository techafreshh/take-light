import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RLS_DENIAL_CODE, routeRunsRequest } from './runsStub';

function readMigration(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', 'supabase', 'migrations', '0001_init.sql'), 'utf8');
}

describe('runs stub reads', () => {
  it('routes GET with query string to 200 with a JSON array body', () => {
    const routed = routeRunsRequest('GET', '/rest/v1/runs?select=name,score&limit=1');
    expect(routed).not.toBeNull();
    expect(routed?.status).toBe(200);
    expect(JSON.parse(routed?.body ?? '')).toEqual([]);
  });
});

describe('runs stub writes', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('denies %s with 403 and 42501', (method) => {
    const routed = routeRunsRequest(method, '/rest/v1/runs');
    expect(routed).not.toBeNull();
    expect(routed?.status).toBe(403);
    expect(routed?.body).toContain(RLS_DENIAL_CODE);
    expect(routed?.body).toContain('42501');
  });
});

describe('runs stub pass-through', () => {
  it('returns null for non-runs paths', () => {
    expect(routeRunsRequest('GET', '/api/health')).toBeNull();
    expect(routeRunsRequest('GET', '/rest/v1/other?select=*')).toBeNull();
  });
});

describe('runs migration', () => {
  it('creates the runs table with RLS enabled', () => {
    const sql = readMigration();
    expect(sql).toContain('CREATE TABLE runs');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('allows anon SELECT and denies direct writes', () => {
    const sql = readMigration();
    expect(sql).toContain('FOR SELECT');
    expect(sql).not.toContain('FOR INSERT');
    expect(sql).not.toContain('FOR UPDATE');
    expect(sql).not.toContain('FOR DELETE');
  });
});
