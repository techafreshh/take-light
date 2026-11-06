// Pure router for POST /functions/v1/submit: validates with the clamp table
// and synthesizes the inserted row (uuid + created_at) for the local stub.
// No DOM, no Vite imports: method + URL + raw body in, status/body out.

import { validateSubmit } from './clamp';
import { addRun } from './runsStore';

export interface SubmitRouteResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const PREFLIGHT_HEADERS: Record<string, string> = {
  ...JSON_HEADERS,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function errorBody(code: string, message: string): string {
  return JSON.stringify({ code, error: code, message });
}

/** uuid for the synthesized row; falls back when randomUUID is missing. */
function newRowId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Route a submit request. Returns null unless the pathname is
 * /functions/v1/submit (query strings ignored) so the caller falls through
 * to the next middleware. OPTIONS answers 204 + CORS, non-POST answers 405,
 * unparseable JSON answers 400 INVALID_JSON, validation failures map to
 * 400/422 bodies containing the code, and success answers 201 with the
 * clamped row. The Authorization header is ignored: validation probes must
 * never see a spurious 401.
 */
export function routeSubmitRequest(
  method: string | undefined,
  url: string | undefined,
  rawBody?: string,
): SubmitRouteResult | null {
  if (url === undefined) {
    return null;
  }
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
  if (pathname !== '/functions/v1/submit') {
    return null;
  }
  const verb = (method ?? 'GET').toUpperCase();
  if (verb === 'OPTIONS') {
    return { status: 204, body: '', headers: { ...PREFLIGHT_HEADERS } };
  }
  if (verb !== 'POST') {
    return {
      status: 405,
      body: errorBody('METHOD_NOT_ALLOWED', 'Use POST /functions/v1/submit.'),
      headers: { ...JSON_HEADERS },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody ?? '');
  } catch {
    return {
      status: 400,
      body: errorBody('INVALID_JSON', 'Body must be valid JSON.'),
      headers: { ...JSON_HEADERS },
    };
  }
  const validated = validateSubmit(parsed);
  if (!validated.ok) {
    return {
      status: validated.status,
      body: errorBody(validated.code, validated.message),
      headers: { ...JSON_HEADERS },
    };
  }
  const row = validated.row;
  const created_at = new Date().toISOString();
  addRun({ ...row, created_at });
  return {
    status: 201,
    body: JSON.stringify({
      id: newRowId(),
      name: row.name,
      score: row.score,
      wave: row.wave,
      duration_s: row.duration_s,
      created_at,
    }),
    headers: { ...JSON_HEADERS },
  };
}
