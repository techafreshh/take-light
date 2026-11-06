// Pure PostgREST-shaped router mirroring the runs table RLS contract:
// anonymous reads are allowed, all direct writes are denied. No DOM,
// no Vite imports: method + URL in, status/body out, safe for headless tests.

import { listRuns } from './runsStore';

/** PostgREST RLS denial code, surfaced so probes can match on it. */
export const RLS_DENIAL_CODE = '42501';

export interface RunsRouteResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function denialBody(): string {
  return JSON.stringify({
    code: RLS_DENIAL_CODE,
    message: 'new row violates row-level security policy for table "runs"',
  });
}

/**
 * Route a request for the local runs stub. Returns null when the path is
 * not /rest/v1/runs so the caller falls through to the next middleware;
 * GET returns 200 with a JSON array, POST/PUT/PATCH/DELETE return 403
 * with a 42501 RLS body. Query strings never break matching.
 */
export function routeRunsRequest(
  method: string | undefined,
  url: string | undefined,
): RunsRouteResult | null {
  if (url === undefined) {
    return null;
  }
  let pathname: string;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
  if (pathname !== '/rest/v1/runs') {
    return null;
  }
  const verb = (method ?? 'GET').toUpperCase();
  if (verb === 'GET') {
    return {
      status: 200,
      body: JSON.stringify(listRuns()),
      headers: { ...JSON_HEADERS },
    };
  }
  if (verb === 'POST' || verb === 'PUT' || verb === 'PATCH' || verb === 'DELETE') {
    return { status: 403, body: denialBody(), headers: { ...JSON_HEADERS } };
  }
  return null;
}
