import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { parseTrustProxy } from '../src/config/env';

const app = createApp();

describe('app scaffold', () => {
  it('serves the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('returns a JSON 404 for unknown routes without leaking internals', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules/i);
  });

  it('returns a 400 for malformed JSON instead of a stack trace', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('TRUST_PROXY parsing (L1)', () => {
  it('maps booleans, hop counts and address lists to what Express expects', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy(' 2 ')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });

  it('the app uses the configured value instead of a hardcoded one', async () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    vi.resetModules();
    try {
      const fresh = await import('../src/app');
      expect(fresh.createApp().get('trust proxy')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
