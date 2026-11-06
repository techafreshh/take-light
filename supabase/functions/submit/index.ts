// Supabase Edge Function: POST /functions/v1/submit.
// Validates leaderboard writes server-side and inserts via the service key.
//
// KEEP IN SYNC with src/net/clamp.ts (same constants, same validation order:
// shape -> name 400 -> score ceiling 422 -> duration floor 422 -> 201).
// SUPABASE_SERVICE_KEY is read only from Deno.env here, never bundled
// or referenced client-side.

const MAX_SCORE_PER_WAVE = 2500;
const MIN_DURATION_S_PER_WAVE = 20;
const MAX_NAME_LENGTH = 40;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normalizedSubmitWave(wave: number): number {
  if (!Number.isFinite(wave)) {
    return 1;
  }
  return Math.max(1, Math.floor(wave));
}

function maxScoreForWave(wave: number): number {
  return MAX_SCORE_PER_WAVE * normalizedSubmitWave(wave);
}

function minDurationForWave(wave: number): number {
  return MIN_DURATION_S_PER_WAVE * normalizedSubmitWave(wave);
}

function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse(status, { code, error: code, message });
}

function validateBody(body: unknown):
  | { ok: true; row: { name: string; score: number; wave: number; duration_s: number } }
  | { ok: false; status: number; code: string; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, code: 'INVALID_PAYLOAD', message: 'Body must be a JSON object.' };
  }
  const record = body as Record<string, unknown>;

  const rawName = record['name'];
  if (typeof rawName !== 'string') {
    return { ok: false, status: 400, code: 'MISSING_NAME', message: 'Name is required.' };
  }
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length === 0) {
    return { ok: false, status: 400, code: 'MISSING_NAME', message: 'Name must not be empty.' };
  }

  const rawWave = record['wave'];
  if (typeof rawWave !== 'number' || !Number.isFinite(rawWave)) {
    return { ok: false, status: 400, code: 'INVALID_WAVE', message: 'Wave must be a finite number.' };
  }
  const wave = normalizedSubmitWave(rawWave);

  const rawScore = record['score'];
  if (typeof rawScore !== 'number' || !Number.isFinite(rawScore) || rawScore < 0) {
    return { ok: false, status: 400, code: 'INVALID_SCORE', message: 'Score must be a finite number >= 0.' };
  }
  const score = Math.floor(rawScore);

  const rawDuration = record['duration_s'];
  if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration < 0) {
    return { ok: false, status: 400, code: 'INVALID_DURATION', message: 'duration_s must be a finite number >= 0.' };
  }
  const duration = Math.floor(rawDuration);

  const ceiling = maxScoreForWave(wave);
  if (score > ceiling) {
    return {
      ok: false,
      status: 422,
      code: 'IMPLAUSIBLE_SCORE',
      message: `Score ${score} exceeds the wave ${wave} ceiling of ${ceiling}.`,
    };
  }

  const floor = minDurationForWave(wave);
  if (duration < floor) {
    return {
      ok: false,
      status: 422,
      code: 'IMPLAUSIBLE_DURATION',
      message: `Duration ${duration}s is below the wave ${wave} floor of ${floor}s.`,
    };
  }

  return {
    ok: true,
    row: { name, score: Math.min(score, ceiling), wave, duration_s: duration },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }
  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST /functions/v1/submit.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Body must be valid JSON.');
  }

  const validated = validateBody(body);
  if (!validated.ok) {
    return errorResponse(validated.status, validated.code, validated.message);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(500, 'SERVER_MISCONFIGURED', 'Submit is not configured.');
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/runs`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(validated.row),
  });

  if (!insertRes.ok) {
    return errorResponse(502, 'STORAGE_ERROR', 'Failed to store the run.');
  }

  const inserted: unknown = await insertRes.json();
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  return jsonResponse(201, row);
});
