/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PB_STORAGE_KEY } from '../ui/store';
import { routeSubmitRequest } from './submitStub';
import {
  QUEUE_STORAGE_KEY,
  buildWeeklyRunsParams,
  buildWeeklyRunsUrl,
  computeDurationS,
  enqueueRun,
  fetchWeeklyTop100,
  flushQueue,
  isForcedOffline,
  loadQueue,
  maybeWritePb,
  normalizeQueuedRun,
  pbDisplayText,
  peekQueue,
  readPb,
  removeFirst,
  saveQueue,
  setForcedOffline,
  submitRun,
  weekStartISO,
  type FetchImpl,
  type LeaderboardRow,
  type QueuedRun,
} from './leaderboard';

const PROBE_RUN: QueuedRun = {
  name: 'Ngozi',
  score: 12400,
  wave: 8,
  duration_s: 212,
};

/** Stub fetch routing POSTs through the shared clamp-table router. */
function routeStub(onRequest?: (url: string, body: string) => void): FetchImpl {
  return (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    onRequest?.(url, body);
    const routed = routeSubmitRequest('POST', url, body);
    return new Response(routed?.body ?? '', {
      status: routed?.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as FetchImpl;
}

function rowsStub(rows: unknown[], onUrl?: (url: string) => void): FetchImpl {
  return (async (url: string) => {
    onUrl?.(url);
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as FetchImpl;
}

beforeEach(() => {
  window.localStorage.clear();
  setForcedOffline(false);
});

afterEach(() => {
  window.localStorage.clear();
  setForcedOffline(false);
});

describe('queue persistence', () => {
  it('round-trips queued runs through localStorage', () => {
    enqueueRun(PROBE_RUN);
    const queue = loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      name: 'Ngozi',
      score: 12400,
      wave: 8,
      duration_s: 212,
    });
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    expect(Array.isArray(JSON.parse(raw ?? ''))).toBe(true);
  });

  it('recovers from corrupt or non-array queue JSON as empty', () => {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, 'not-json{{{');
    expect(loadQueue()).toEqual([]);
    window.localStorage.setItem(QUEUE_STORAGE_KEY, '{"a":1}');
    expect(loadQueue()).toEqual([]);
    enqueueRun(PROBE_RUN);
    expect(loadQueue()).toHaveLength(1);
  });

  it('peeks without removing and removes the head in order', () => {
    enqueueRun({ name: 'A', score: 10, wave: 1, duration_s: 20 });
    enqueueRun({ name: 'B', score: 20, wave: 1, duration_s: 20 });
    expect(peekQueue()?.name).toBe('A');
    expect(loadQueue()).toHaveLength(2);
    removeFirst();
    expect(peekQueue()?.name).toBe('B');
    removeFirst();
    expect(peekQueue()).toBeNull();
    expect(loadQueue()).toEqual([]);
  });

  it('saveQueue persists the given queue verbatim', () => {
    saveQueue([{ name: 'A', score: 1, wave: 1, duration_s: 20 }]);
    expect(loadQueue()).toHaveLength(1);
  });
});

describe('week start', () => {
  it('pins mid-week dates to Monday 00:00 UTC', () => {
    expect(weekStartISO(new Date('2024-05-15T12:34:56.000Z'))).toBe(
      '2024-05-13T00:00:00.000Z',
    );
  });

  it('maps Sunday back six days to the same Monday', () => {
    expect(weekStartISO(new Date('2024-05-19T23:59:59.000Z'))).toBe(
      '2024-05-13T00:00:00.000Z',
    );
  });

  it('keeps Monday itself at midnight', () => {
    expect(weekStartISO(new Date('2024-05-13T00:00:00.000Z'))).toBe(
      '2024-05-13T00:00:00.000Z',
    );
  });
});

describe('weekly fetch', () => {
  it('builds the select/order/limit/gte query against the week start', () => {
    const params = buildWeeklyRunsParams(new Date('2024-05-15T12:00:00Z'));
    expect(params).toContain('select=name,score,wave,duration_s,created_at');
    expect(params).toContain('order=score.desc');
    expect(params).toContain('limit=100');
    expect(params).toContain('created_at=gte.2024-05-13T00:00:00.000Z');
    expect(buildWeeklyRunsUrl(new Date('2024-05-15T12:00:00Z'))).toBe(
      `/rest/v1/runs?${params}`,
    );
  });

  it('caps rows at 100 regardless of server count', async () => {
    const rows: LeaderboardRow[] = Array.from({ length: 150 }, (_, i) => ({
      name: `P${i}`,
      score: 150 - i,
      wave: 1,
      duration_s: 20,
      created_at: '2024-05-14T00:00:00.000Z',
    }));
    let seenUrl = '';
    const result = await fetchWeeklyTop100(
      rowsStub(rows, (url) => {
        seenUrl = url;
      }),
    );
    expect(result).toHaveLength(100);
    expect(seenUrl).toContain('limit=100');
    expect(seenUrl).toContain('order=score.desc');
    expect(seenUrl).toContain('created_at=gte.');
  });

  it('returns [] on failure, non-array, or bad status without throwing', async () => {
    const failing: FetchImpl = (() =>
      Promise.reject(new Error('down'))) as FetchImpl;
    await expect(fetchWeeklyTop100(failing)).resolves.toEqual([]);
    const badStatus: FetchImpl = (() =>
      Promise.resolve(new Response('x', { status: 500 }))) as FetchImpl;
    await expect(fetchWeeklyTop100(badStatus)).resolves.toEqual([]);
    await expect(
      fetchWeeklyTop100(rowsStub({} as unknown as [])),
    ).resolves.toEqual([]);
  });

  it('short-circuits offline without calling fetch', async () => {
    setForcedOffline(true);
    const spy = vi.fn(async () => new Response('[]', { status: 200 }));
    await expect(
      fetchWeeklyTop100(spy as unknown as FetchImpl),
    ).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    expect(isForcedOffline()).toBe(true);
  });
});

describe('submit and flush', () => {
  it('offline submitRun queues without calling fetch', async () => {
    setForcedOffline(true);
    const spy = vi.fn(async () => new Response('[]', { status: 200 }));
    const result = await submitRun(
      { name: 'Ngozi', score: 50, wave: 1, duration_s: 5 },
      spy as unknown as FetchImpl,
    );
    expect(result.status).toBe('queued');
    expect(spy).not.toHaveBeenCalled();
    expect(loadQueue()).toHaveLength(1);
    expect(loadQueue()[0]?.duration_s).toBeGreaterThanOrEqual(20);
  });

  it('online submitRun posts the Ngozi payload for a 201 with no queue', async () => {
    const result = await submitRun(PROBE_RUN, routeStub());
    expect(result.status).toBe('ok');
    expect(loadQueue()).toHaveLength(0);
  });

  it('submitRun rejects the forged 422 payload without queueing', async () => {
    const result = await submitRun(
      { name: 'Hax', score: 9999999, wave: 2, duration_s: 30 },
      routeStub(),
    );
    expect(result.status).toBe('rejected');
    expect(loadQueue()).toHaveLength(0);
  });

  it('floors sub-floor durations before submit so probes answer 201', async () => {
    const seen: string[] = [];
    const result = await submitRun(
      { name: 'Ngozi', score: 10, wave: 1, duration_s: 2 },
      routeStub((_url, body) => {
        seen.push(body);
      }),
    );
    expect(result.status).toBe('ok');
    expect(JSON.parse(seen[0] ?? '{}').duration_s).toBeGreaterThanOrEqual(20);
  });

  it('network failure returns failed for the caller fallback', async () => {
    const failing: FetchImpl = (() =>
      Promise.reject(new Error('down'))) as FetchImpl;
    const result = await submitRun(PROBE_RUN, failing);
    expect(result.status).toBe('failed');
    expect(loadQueue()).toHaveLength(0);
  });

  it('flushQueue drains to zero against the 201 path', async () => {
    enqueueRun({ name: 'A', score: 10, wave: 1, duration_s: 1 });
    enqueueRun(PROBE_RUN);
    const remaining = await flushQueue(routeStub());
    expect(remaining).toBe(0);
    expect(loadQueue()).toHaveLength(0);
  });

  it('flushQueue drops 4xx poison and keeps draining', async () => {
    enqueueRun({ name: 'Hax', score: 9999999, wave: 2, duration_s: 30 });
    enqueueRun({ name: 'A', score: 10, wave: 1, duration_s: 20 });
    const remaining = await flushQueue(routeStub());
    expect(remaining).toBe(0);
    expect(loadQueue()).toHaveLength(0);
  });

  it('flushQueue stops on 5xx keeping the entry', async () => {
    enqueueRun(PROBE_RUN);
    const bad: FetchImpl = (() =>
      Promise.resolve(new Response('{}', { status: 500 }))) as FetchImpl;
    const remaining = await flushQueue(bad);
    expect(remaining).toBe(1);
    expect(loadQueue()).toHaveLength(1);
  });

  it('flushQueue keeps the queue while forced offline', async () => {
    enqueueRun(PROBE_RUN);
    setForcedOffline(true);
    const spy = vi.fn(async () => new Response('[]', { status: 200 }));
    const remaining = await flushQueue(spy as unknown as FetchImpl);
    expect(remaining).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('personal bests', () => {
  function pb(score: number) {
    return {
      name: 'Ngozi',
      score,
      wave: 8,
      kills: 9,
      at: '2024-05-15T00:00:00.000Z',
    };
  }

  it('writes the first best and only higher scores after', () => {
    expect(readPb()).toBeNull();
    expect(maybeWritePb(pb(100))).toBe(true);
    expect(readPb()?.score).toBe(100);
    expect(maybeWritePb(pb(50))).toBe(false);
    expect(readPb()?.score).toBe(100);
    expect(maybeWritePb(pb(200))).toBe(true);
    expect(readPb()?.score).toBe(200);
  });

  it('reads corrupt pb JSON as null', () => {
    window.localStorage.setItem(PB_STORAGE_KEY, 'broken{{{');
    expect(readPb()).toBeNull();
  });

  it('pb text shows the best, a placeholder when empty, and (queued)', () => {
    expect(pbDisplayText()).toBe('No personal best yet');
    enqueueRun(PROBE_RUN);
    expect(pbDisplayText()).toBe('No personal best yet (queued)');
    window.localStorage.removeItem(QUEUE_STORAGE_KEY);
    maybeWritePb(pb(300));
    expect(pbDisplayText()).toContain('Ngozi');
    expect(pbDisplayText()).not.toContain('(queued)');
    enqueueRun(PROBE_RUN);
    expect(pbDisplayText()).toContain('(queued)');
  });

  it('normalizeQueuedRun floors duration and trims the name', () => {
    const row = normalizeQueuedRun({
      name: '  Ngozi  ',
      score: 42.9,
      wave: 2.7,
      duration_s: 3,
    });
    expect(row.name).toBe('Ngozi');
    expect(row.score).toBe(42);
    expect(row.wave).toBe(2);
    expect(row.duration_s).toBeGreaterThanOrEqual(40);
  });

  it('computeDurationS floors elapsed seconds to the wave floor', () => {
    const now = Date.now();
    expect(computeDurationS(now - 2000, now, 1)).toBe(20);
    expect(computeDurationS(now - 50000, now, 1)).toBe(50);
  });
});

describe('leaderboard module discipline', () => {
  it('imports neither three nor a client database driver', () => {
    const source = readFileSync('src/net/leaderboard.ts', 'utf8');
    expect(source).not.toMatch(/from\s+['\"]three['\"]/);
    expect(source).not.toContain('supabase-js');
  });
});
