import { describe, expect, it, vi } from 'vitest';
import { handleHealth } from '../../vite.config';

type Req = Parameters<typeof handleHealth>[0];
type Res = Parameters<typeof handleHealth>[1];

function mockRes(): Res & { body: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  let body = '';
  return {
    statusCode: 0,
    headers,
    get body(): string {
      return body;
    },
    setHeader(name: string, value: string): void {
      headers[name] = value;
    },
    end(payload: string): void {
      body = payload;
    },
  };
}

describe('health middleware', () => {
  it('answers bare GET /api/health with 200 {"status":"ok"}', () => {
    const res = mockRes();
    const next = vi.fn();
    handleHealth({ url: '/api/health', method: 'GET' } as Req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['/api/health?x=1', '/api/health?x=1&y=2'])(
    'answers GET %s with 200 {"status":"ok"}',
    (url) => {
      const res = mockRes();
      const next = vi.fn();
      handleHealth({ url, method: 'GET' } as Req, res, next);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('falls through for non-health paths', () => {
    const res = mockRes();
    const next = vi.fn();
    handleHealth({ url: '/other?x=1', method: 'GET' } as Req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(res.body).toBe('');
  });

  it('falls through for non-GET health requests', () => {
    const res = mockRes();
    const next = vi.fn();
    handleHealth({ url: '/api/health?x=1', method: 'POST' } as Req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(res.body).toBe('');
  });
});
