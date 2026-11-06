import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { routeRunsRequest } from './src/net/runsStub';
import { routeSubmitRequest } from './src/net/submitStub';

interface HealthRequest {
  url?: string;
  method?: string;
}

interface HealthResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

interface SubmitStubRequest {
  url?: string;
  method?: string;
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (err: unknown) => void): void;
}

// Serves GET /api/health -> 200 {"status":"ok"} on the single dev port,
// so `npm run dev` alone satisfies the walking-skeleton health probe.
// Shared by the dev server and the preview server below.
function handleHealth(
  req: HealthRequest,
  res: HealthResponse,
  next: () => void,
): void {
  if (req.url === '/api/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  next();
}

function handleRunsStub(
  req: HealthRequest,
  res: HealthResponse,
  next: () => void,
): void {
  const routed = routeRunsRequest(req.method, req.url);
  if (routed === null) {
    next();
    return;
  }
  res.statusCode = routed.status;
  for (const [name, value] of Object.entries(routed.headers)) {
    res.setHeader(name, value);
  }
  res.end(routed.body);
}

function writeRouted(
  res: HealthResponse,
  routed: { status: number; body: string; headers: Record<string, string> },
): void {
  res.statusCode = routed.status;
  for (const [name, value] of Object.entries(routed.headers)) {
    res.setHeader(name, value);
  }
  res.end(routed.body);
}

// Serves POST /functions/v1/submit -> 201/400/422 JSON on the single dev
// port, sharing the clamp table with the Edge Function. Non-submit paths
// fall through untouched; only submit POST bodies are buffered.
function handleSubmitStub(
  req: SubmitStubRequest,
  res: HealthResponse,
  next: () => void,
): void {
  let pathname: string;
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    next();
    return;
  }
  if (pathname !== '/functions/v1/submit') {
    next();
    return;
  }
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    const routed = routeSubmitRequest(req.method, req.url);
    if (routed === null) {
      next();
      return;
    }
    writeRouted(res, routed);
    return;
  }
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => {
    chunks.push(chunk);
  });
  req.on('end', () => {
    const routed = routeSubmitRequest(
      req.method,
      req.url,
      Buffer.concat(chunks).toString('utf8'),
    );
    if (routed === null) {
      next();
      return;
    }
    writeRouted(res, routed);
  });
  req.on('error', () => {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ code: 'INVALID_JSON', error: 'INVALID_JSON', message: 'Body must be valid JSON.' }),
    );
  });
}

function healthPlugin(): Plugin {
  return {
    name: 'take-light-health',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleHealth(
          req as unknown as HealthRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
      server.middlewares.use((req, res, next) => {
        handleRunsStub(
          req as unknown as HealthRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
      server.middlewares.use((req, res, next) => {
        handleSubmitStub(
          req as unknown as SubmitStubRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        handleHealth(
          req as unknown as HealthRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
      server.middlewares.use((req, res, next) => {
        handleRunsStub(
          req as unknown as HealthRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
      server.middlewares.use((req, res, next) => {
        handleSubmitStub(
          req as unknown as SubmitStubRequest,
          res as unknown as HealthResponse,
          next,
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [
    healthPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
