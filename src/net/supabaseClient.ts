// Supabase client config for the browser: env-clamped URL plus anon key,
// same-origin REST/function URL builders, and anon-only headers. Plain
// fetch against the local /rest/v1/runs and /functions/v1/submit stubs is
// the default when env is absent; env only overrides the origin. The anon
// key is the only credential ever read here.

/** Env lookup: import.meta.env in the browser, process.env under node. */
function readEnvVar(key: string): string {
  try {
    const meta = (import.meta as unknown as { env?: Record<string, unknown> })
      .env;
    const fromMeta = meta?.[key];
    if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) {
      return fromMeta.trim();
    }
  } catch {
    // import.meta.env is unavailable: fall through to process.env.
  }
  try {
    const proc = (
      globalThis as unknown as { process?: { env?: Record<string, unknown> } }
    ).process;
    const fromProc = proc?.env?.[key];
    if (typeof fromProc === 'string' && fromProc.trim().length > 0) {
      return fromProc.trim();
    }
  } catch {
    // No process env: unconfigured.
  }
  return '';
}

/** Trimmed VITE_SUPABASE_URL origin, or '' when unconfigured. */
function readUrl(): string {
  return readEnvVar('VITE_SUPABASE_URL').replace(/\/+$/, '');
}

/** Trimmed VITE_SUPABASE_ANON_KEY, or '' when unconfigured. */
function readAnonKey(): string {
  return readEnvVar('VITE_SUPABASE_ANON_KEY');
}

/** Env-clamped config: trimmed URL origin plus the anon key. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Factory for the env-clamped config; headless-testable like clamp.ts. */
export function getSupabaseConfig(): SupabaseConfig {
  return { url: readUrl(), anonKey: readAnonKey() };
}

/** Singleton config mirroring the createHudStore factory/singleton split. */
let cached: SupabaseConfig | null = null;

/** Cached singleton config for runtime call sites. */
export function supabaseConfig(): SupabaseConfig {
  if (cached === null) {
    cached = getSupabaseConfig();
  }
  return cached;
}

/** True only when both the URL origin and the anon key are configured. */
export function isSupabaseConfigured(
  config: SupabaseConfig = supabaseConfig(),
): boolean {
  return config.url.length > 0 && config.anonKey.length > 0;
}

/**
 * Weekly-board read URL: env origin when configured, same-origin relative
 * /rest/v1/runs otherwise. Params carry the select/order/limit/gte query.
 */
export function restRunsUrl(
  params: string,
  config: SupabaseConfig = supabaseConfig(),
): string {
  const query = params.length > 0 ? `?${params}` : '';
  if (config.url.length > 0) {
    return `${config.url}/rest/v1/runs${query}`;
  }
  return `/rest/v1/runs${query}`;
}

/**
 * Submit Function URL: env origin when configured, same-origin relative
 * /functions/v1/submit otherwise.
 */
export function submitFunctionUrl(
  config: SupabaseConfig = supabaseConfig(),
): string {
  if (config.url.length > 0) {
    return `${config.url}/functions/v1/submit`;
  }
  return '/functions/v1/submit';
}

/**
 * Anon-only headers for REST/Function calls: apikey plus Bearer anon plus
 * JSON content type. No other credential is ever attached.
 */
export function anonHeaders(
  config: SupabaseConfig = supabaseConfig(),
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.anonKey.length > 0) {
    headers['apikey'] = config.anonKey;
    headers['Authorization'] = `Bearer ${config.anonKey}`;
  }
  return headers;
}
