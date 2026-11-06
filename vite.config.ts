import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { routeRunsRequest } from './src/net/runsStub';

interface HealthRequest {
  url?: string;
  method?: string;
}

interface HealthResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
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
    },
  };
}

export default defineConfig({
  plugins: [healthPlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
