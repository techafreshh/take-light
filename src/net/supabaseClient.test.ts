import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  anonHeaders,
  getSupabaseConfig,
  isSupabaseConfigured,
  restRunsUrl,
  submitFunctionUrl,
} from './supabaseClient';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabase client env override', () => {
  it('uses the env origin and anon key when both are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xyz.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-123');
    const config = getSupabaseConfig();
    expect(config.url).toBe('https://xyz.supabase.co');
    expect(config.anonKey).toBe('anon-key-123');
    expect(isSupabaseConfigured(config)).toBe(true);
    expect(restRunsUrl('select=*', config)).toBe(
      'https://xyz.supabase.co/rest/v1/runs?select=*',
    );
    expect(submitFunctionUrl(config)).toBe(
      'https://xyz.supabase.co/functions/v1/submit',
    );
    const headers = anonHeaders(config);
    expect(headers['apikey']).toBe('anon-key-123');
    expect(headers['Authorization']).toBe('Bearer anon-key-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('trims whitespace-only env into the unconfigured state', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '   ');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const config = getSupabaseConfig();
    expect(isSupabaseConfigured(config)).toBe(false);
  });
});

describe('supabase client same-origin fallback', () => {
  it('falls back to relative paths when env is absent', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const config = getSupabaseConfig();
    expect(isSupabaseConfigured(config)).toBe(false);
    expect(restRunsUrl('select=*', config)).toBe('/rest/v1/runs?select=*');
    expect(submitFunctionUrl(config)).toBe('/functions/v1/submit');
  });

  it('omits the query string when params are empty', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(restRunsUrl('', getSupabaseConfig())).toBe('/rest/v1/runs');
  });

  it('omits auth headers when no anon key is configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const headers = anonHeaders(getSupabaseConfig());
    expect(headers['apikey']).toBeUndefined();
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('supabase client credentials', () => {
  it('references only the anon key, never another credential', () => {
    const source = readFileSync('src/net/supabaseClient.ts', 'utf8');
    const lowered = source.toLowerCase();
    expect(lowered).not.toContain('service_role');
    expect(lowered).not.toContain('service_key');
    expect(lowered).not.toContain('servicekey');
    expect(source).not.toContain('supabase-js');
    expect(source).toContain('VITE_SUPABASE_ANON_KEY');
    expect(source).not.toContain('VITE_SUPABASE_SERVICE');
  });
});
