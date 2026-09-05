import pino, { type DestinationStream } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/server.js';
import { AppError } from '../../src/errors.js';

describe('HTTP logging', () => {
  it('logs a concise request summary without headers or request objects', async () => {
    const records: Record<string, unknown>[] = [];
    const sink: DestinationStream = {
      write(chunk) {
        records.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        return true;
      },
    } as DestinationStream;
    const logger = pino({ level: 'info' }, sink);
    const app = createApp({
      services: { auth: {} as never, sessions: { resolve: vi.fn() }, workspaces: {} as never, projects: {} as never },
      frontendOrigins: ['http://localhost:5173'],
      secureCookies: false,
      logger,
    });

    await request(app)
      .get('/health')
      .set('Authorization', 'Bearer should-not-appear')
      .set('X-Request-Id', 'request-5')
      .expect('X-Request-Id', 'request-5')
      .expect(200);

    const log = records.find((record) => record.msg === 'GET /health 200');
    expect(log).toMatchObject({ method: 'GET', path: '/health', statusCode: 200 });
    expect(log).toHaveProperty('requestId', 'request-5');
    expect(log).toHaveProperty('responseTime');
    expect(log).toHaveProperty('ipAddress');
    expect(log).not.toHaveProperty('req');
    expect(log).not.toHaveProperty('res');
    expect(JSON.stringify(records)).not.toContain('should-not-appear');
  });

  it('records an OAuth start event without the provider redirect URL', async () => {
    const records: Record<string, unknown>[] = [];
    const sink: DestinationStream = {
      write(chunk) {
        records.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        return true;
      },
    } as DestinationStream;
    const logger = pino({ level: 'info' }, sink);
    const app = createApp({
      services: {
        auth: { beginGoogleLogin: vi.fn().mockResolvedValue({ url: 'https://accounts.google.com/private-oauth-url' }) } as never,
        sessions: { resolve: vi.fn() },
        workspaces: {} as never,
        projects: {} as never,
      },
      frontendOrigins: ['http://localhost:5173'],
      secureCookies: false,
      logger,
    });

    await request(app).get('/v1/auth/google').expect(302);

    expect(records.find((record) => record.msg === 'OAuth login started')).toMatchObject({ provider: 'google' });
    expect(JSON.stringify(records)).not.toContain('private-oauth-url');
  });

  it('adds safe error information to a failed request without an error stack in test mode', async () => {
    const records: Record<string, unknown>[] = [];
    const sink: DestinationStream = {
      write(chunk) {
        records.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        return true;
      },
    } as DestinationStream;
    const logger = pino({ level: 'info' }, sink);
    const app = createApp({
      services: {
        auth: { loginWithEmail: vi.fn().mockRejectedValue(new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials')) } as never,
        sessions: { resolve: vi.fn() },
        workspaces: {} as never,
        projects: {} as never,
      },
      frontendOrigins: ['http://localhost:5173'],
      secureCookies: false,
      logger,
    });

    await request(app).post('/v1/auth/login').send({ email: 'person@example.com', password: 'password123' }).expect(401);

    const log = records.find((record) => record.msg === 'POST /v1/auth/login 401');
    expect(log).toMatchObject({
      error: { name: 'AppError', message: 'Invalid credentials' },
      statusCode: 401,
    });
    expect((log?.error as Record<string, unknown>).stack).toBeUndefined();
  });
});
