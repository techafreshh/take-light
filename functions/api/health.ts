// Cloudflare Pages Function for GET /api/health.
// File-route convention: functions/api/health.ts answers /api/health.
// Static-first deploy also ships public/api/health.json plus a
// public/_redirects rewrite for Netlify-style hosts; the Vite
// healthPlugin middleware keeps dev/preview answering the same body.

export async function onRequest(): Promise<Response> {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
