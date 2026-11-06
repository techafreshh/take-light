import { describe, expect, it } from 'vitest';
import { minDurationForWave } from './clamp';
import { clearRuns } from './runsStore';
import { routeRunsRequest } from './runsStub';
import { routeSubmitRequest } from './submitStub';

describe('stateful full-run round-trip', () => {
  it('submit of 5000/wave-5 is visible on the next weekly fetch', () => {
    clearRuns();
    const duration_s = minDurationForWave(5);
    const submitted = routeSubmitRequest(
      'POST',
      '/functions/v1/submit',
      JSON.stringify({ name: 'Fullrun', score: 5000, wave: 5, duration_s }),
    );
    expect(submitted).not.toBeNull();
    expect(submitted?.status).toBe(201);
    const fetched = routeRunsRequest(
      'GET',
      '/rest/v1/runs?select=name,score,wave,duration_s,created_at&order=score.desc&limit=100',
    );
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe(200);
    const parsed: unknown = JSON.parse(fetched?.body ?? '');
    expect(Array.isArray(parsed)).toBe(true);
    const rows = parsed as Array<Record<string, unknown>>;
    const match = rows.find(
      (row) =>
        row['name'] === 'Fullrun' &&
        row['score'] === 5000 &&
        row['wave'] === 5,
    );
    expect(match).toBeDefined();
    clearRuns();
  });
});
