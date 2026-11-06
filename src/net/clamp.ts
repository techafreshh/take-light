// Pure plausibility clamp for leaderboard writes: per-wave score ceilings
// and duration floors so forged client scores are rejected server-side.
// Plain numbers only, no DOM/three/Vite imports, safe for headless vitest.

/** Max plausible score per wave: wave-1 perfect play tops out near 2300. */
export const MAX_SCORE_PER_WAVE = 2500;
/** Min plausible run duration in seconds per wave. */
export const MIN_DURATION_S_PER_WAVE = 20;
/** Over-long names truncate instead of failing. */
export const MAX_NAME_LENGTH = 40;

/** Normalized submit fields after validation and clamping. */
export interface SubmitRow {
  name: string;
  score: number;
  wave: number;
  duration_s: number;
}

/** Machine-readable validation failure. */
export interface SubmitError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

/** validateSubmit result: clamped row on success, status + code on failure. */
export type ValidateSubmitResult =
  | { ok: true; row: SubmitRow }
  | SubmitError;

/** Floor to an integer wave >= 1 (non-finite reads as wave 1). */
function normalizedSubmitWave(wave: number): number {
  if (!Number.isFinite(wave)) {
    return 1;
  }
  return Math.max(1, Math.floor(wave));
}

/** Plausibility ceiling for a wave: 2500 per wave (wave 8 -> 20000). */
export function maxScoreForWave(wave: number): number {
  return MAX_SCORE_PER_WAVE * normalizedSubmitWave(wave);
}

/** Plausibility floor in seconds for a wave: 20 per wave (wave 8 -> 160). */
export function minDurationForWave(wave: number): number {
  return MIN_DURATION_S_PER_WAVE * normalizedSubmitWave(wave);
}

/** Clamp a score to the wave ceiling: min(floor(score), max). */
export function clampScore(score: number, wave: number): number {
  return Math.min(Math.floor(score), maxScoreForWave(wave));
}

function fail(status: number, code: string, message: string): SubmitError {
  return { ok: false, status, code, message };
}

/**
 * Validate a parsed submit body. Order is fixed: shape -> name (400) ->
 * score ceiling (422 IMPLAUSIBLE_SCORE) -> duration floor
 * (422 IMPLAUSIBLE_DURATION). Names trim (over-long truncate); wave floors
 * to >= 1; score/duration_s floor and must be finite and >= 0.
 */
export function validateSubmit(body: unknown): ValidateSubmitResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail(400, 'INVALID_PAYLOAD', 'Body must be a JSON object.');
  }
  const record = body as Record<string, unknown>;

  const rawName = record['name'];
  if (typeof rawName !== 'string') {
    return fail(400, 'MISSING_NAME', 'Name is required.');
  }
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) {
    return fail(400, 'MISSING_NAME', 'Name must not be empty.');
  }

  const rawWave = record['wave'];
  if (typeof rawWave !== 'number' || !Number.isFinite(rawWave)) {
    return fail(400, 'INVALID_WAVE', 'Wave must be a finite number.');
  }
  const wave = normalizedSubmitWave(rawWave);

  const rawScore = record['score'];
  if (
    typeof rawScore !== 'number' ||
    !Number.isFinite(rawScore) ||
    rawScore < 0
  ) {
    return fail(400, 'INVALID_SCORE', 'Score must be a finite number >= 0.');
  }
  const score = Math.floor(rawScore);

  const rawDuration = record['duration_s'];
  if (
    typeof rawDuration !== 'number' ||
    !Number.isFinite(rawDuration) ||
    rawDuration < 0
  ) {
    return fail(
      400,
      'INVALID_DURATION',
      'duration_s must be a finite number >= 0.',
    );
  }
  const duration = Math.floor(rawDuration);

  const ceiling = maxScoreForWave(wave);
  if (score > ceiling) {
    return fail(
      422,
      'IMPLAUSIBLE_SCORE',
      `Score ${score} exceeds the wave ${wave} ceiling of ${ceiling}.`,
    );
  }

  const floor = minDurationForWave(wave);
  if (duration < floor) {
    return fail(
      422,
      'IMPLAUSIBLE_DURATION',
      `Duration ${duration}s is below the wave ${wave} floor of ${floor}s.`,
    );
  }

  return {
    ok: true,
    row: { name, score: clampScore(score, wave), wave, duration_s: duration },
  };
}
