import { describe, expect, it } from 'vitest';
import {
  MAX_SCORE_PER_WAVE,
  MIN_DURATION_S_PER_WAVE,
  clampScore,
  maxScoreForWave,
  minDurationForWave,
  validateSubmit,
} from './clamp';
import { routeSubmitRequest } from './submitStub';

describe('clamp table', () => {
  it('accepts the Ngozi wave-8 score under the ceiling', () => {
    expect(maxScoreForWave(8)).toBeGreaterThanOrEqual(12400);
  });

  it('rejects the forged wave-2 score above the ceiling', () => {
    expect(maxScoreForWave(2)).toBeLessThan(9999999);
  });

  it('accepts the Ngozi duration above the wave-8 floor', () => {
    expect(minDurationForWave(8)).toBeLessThanOrEqual(212);
  });

  it('grows monotonically with the wave', () => {
    for (let wave = 1; wave < 12; wave += 1) {
      expect(maxScoreForWave(wave + 1)).toBeGreaterThan(
        maxScoreForWave(wave),
      );
      expect(minDurationForWave(wave + 1)).toBeGreaterThan(
        minDurationForWave(wave),
      );
    }
  });

  it('scales linearly from the per-wave constants', () => {
    expect(maxScoreForWave(1)).toBe(MAX_SCORE_PER_WAVE);
    expect(maxScoreForWave(4)).toBe(MAX_SCORE_PER_WAVE * 4);
    expect(minDurationForWave(1)).toBe(MIN_DURATION_S_PER_WAVE);
    expect(minDurationForWave(4)).toBe(MIN_DURATION_S_PER_WAVE * 4);
  });

  it('normalizes waves the way the director does', () => {
    expect(maxScoreForWave(0)).toBe(maxScoreForWave(1));
    expect(maxScoreForWave(2.9)).toBe(maxScoreForWave(2));
    expect(maxScoreForWave(Number.NaN)).toBe(maxScoreForWave(1));
  });

  it('clamps scores to the ceiling without ever raising them', () => {
    expect(clampScore(12400, 8)).toBe(12400);
    expect(clampScore(9999999, 2)).toBe(maxScoreForWave(2));
    expect(clampScore(0, 1)).toBe(0);
  });
});

describe('validateSubmit', () => {
  it('accepts the valid Ngozi payload with a clamped score', () => {
    const result = validateSubmit({
      name: 'Ngozi',
      score: 12400,
      wave: 8,
      duration_s: 212,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.name).toBe('Ngozi');
      expect(result.row.score).toBeLessThanOrEqual(12400);
      expect(result.row.wave).toBe(8);
      expect(result.row.duration_s).toBe(212);
    }
  });

  it('rejects the forged wave-2 score with IMPLAUSIBLE_SCORE', () => {
    const result = validateSubmit({
      name: 'Hax',
      score: 9999999,
      wave: 2,
      duration_s: 30,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe('IMPLAUSIBLE_SCORE');
    }
  });

  it('checks score before duration so the forged case is deterministic', () => {
    const result = validateSubmit({
      name: 'Hax',
      score: 9999999,
      wave: 2,
      duration_s: 30,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('IMPLAUSIBLE_SCORE');
    }
  });

  it.each(['', '   ', '\t\n '])('rejects blank name %j with 400', (name) => {
    const result = validateSubmit({
      name,
      score: 100,
      wave: 1,
      duration_s: 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('rejects missing and non-string names with 400', () => {
    for (const body of [
      { score: 100, wave: 1, duration_s: 60 },
      { name: 42, score: 100, wave: 1, duration_s: 60 },
      { name: null, score: 100, wave: 1, duration_s: 60 },
    ]) {
      const result = validateSubmit(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
      }
    }
  });

  it('trims names and truncates over-long names instead of failing', () => {
    const trimmed = validateSubmit({
      name: '  Ngozi  ',
      score: 100,
      wave: 1,
      duration_s: 60,
    });
    expect(trimmed.ok).toBe(true);
    if (trimmed.ok) {
      expect(trimmed.row.name).toBe('Ngozi');
    }
    const long = validateSubmit({
      name: 'x'.repeat(100),
      score: 100,
      wave: 1,
      duration_s: 60,
    });
    expect(long.ok).toBe(true);
    if (long.ok) {
      expect(long.row.name.length).toBeLessThanOrEqual(40);
    }
  });

  it('passes a score exactly at the ceiling unclamped', () => {
    const ceiling = maxScoreForWave(3);
    const result = validateSubmit({
      name: 'Edge',
      score: ceiling,
      wave: 3,
      duration_s: 120,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.score).toBe(ceiling);
    }
  });

  it('passes a zero score and rejects negative scores with 400', () => {
    const zero = validateSubmit({
      name: 'Zero',
      score: 0,
      wave: 1,
      duration_s: 60,
    });
    expect(zero.ok).toBe(true);
    const negative = validateSubmit({
      name: 'Neg',
      score: -5,
      wave: 1,
      duration_s: 60,
    });
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.status).toBe(400);
    }
  });

  it('rejects non-finite scores and durations with 400', () => {
    for (const body of [
      { name: 'N', score: Number.NaN, wave: 1, duration_s: 60 },
      { name: 'N', score: Number.POSITIVE_INFINITY, wave: 1, duration_s: 60 },
      { name: 'N', score: 100, wave: 1, duration_s: Number.NaN },
      { name: 'N', score: 100, wave: Number.NaN, duration_s: 60 },
    ]) {
      const result = validateSubmit(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
      }
    }
  });

  it('rejects too-fast durations with 422 IMPLAUSIBLE_DURATION', () => {
    const result = validateSubmit({
      name: 'Speedy',
      score: 100,
      wave: 8,
      duration_s: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe('IMPLAUSIBLE_DURATION');
    }
  });

  it('rejects non-object bodies with 400', () => {
    for (const body of [null, 42, 'nope', [1, 2]]) {
      const result = validateSubmit(body);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
      }
    }
  });
});

describe('submit router', () => {
  it('returns 201 with the clamped Ngozi row', () => {
    const routed = routeSubmitRequest(
      'POST',
      '/functions/v1/submit',
      JSON.stringify({ name: 'Ngozi', score: 12400, wave: 8, duration_s: 212 }),
    );
    expect(routed).not.toBeNull();
    expect(routed?.status).toBe(201);
    const body = JSON.parse(routed?.body ?? '{}') as Record<string, unknown>;
    expect(body['name']).toBe('Ngozi');
    expect(body['score'] as number).toBeLessThanOrEqual(12400);
    for (const key of [
      'id',
      'name',
      'score',
      'wave',
      'duration_s',
      'created_at',
    ]) {
      expect(body).toHaveProperty(key);
    }
  });

  it('returns 422 containing IMPLAUSIBLE_SCORE for the forged payload', () => {
    const routed = routeSubmitRequest(
      'POST',
      '/functions/v1/submit',
      JSON.stringify({ name: 'Hax', score: 9999999, wave: 2, duration_s: 30 }),
    );
    expect(routed?.status).toBe(422);
    expect(routed?.body).toContain('IMPLAUSIBLE_SCORE');
  });

  it('returns 400 for an empty name', () => {
    const routed = routeSubmitRequest(
      'POST',
      '/functions/v1/submit',
      JSON.stringify({ name: '', score: 100, wave: 1, duration_s: 60 }),
    );
    expect(routed?.status).toBe(400);
  });

  it('returns 400 INVALID_JSON for unparseable bodies', () => {
    const routed = routeSubmitRequest('POST', '/functions/v1/submit', '{oops');
    expect(routed?.status).toBe(400);
    expect(routed?.body).toContain('INVALID_JSON');
  });

  it('answers OPTIONS with 204 and GET with 405', () => {
    expect(routeSubmitRequest('OPTIONS', '/functions/v1/submit')?.status).toBe(
      204,
    );
    const get = routeSubmitRequest('GET', '/functions/v1/submit');
    expect(get?.status).toBe(405);
    expect(get?.body).toContain('METHOD_NOT_ALLOWED');
  });

  it('ignores query strings but passes other paths through', () => {
    const withQuery = routeSubmitRequest(
      'POST',
      '/functions/v1/submit?x=1',
      JSON.stringify({ name: 'Ngozi', score: 12400, wave: 8, duration_s: 212 }),
    );
    expect(withQuery?.status).toBe(201);
    expect(routeSubmitRequest('GET', '/api/health')).toBeNull();
    expect(routeSubmitRequest('GET', '/rest/v1/runs')).toBeNull();
  });
});
