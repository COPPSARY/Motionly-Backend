import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../../../src/config/env.js';

const valid = {
  NODE_ENV: 'production',
  API_HOST: '0.0.0.0',
  API_PORT: '4000',
  API_PUBLIC_URL: 'https://api.motionly.example',
  FRONTEND_ORIGINS: 'https://motionly.example',
  DATABASE_URL: 'postgresql://postgres.motionlyref:pass@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  SESSION_COOKIE_SECURE: 'true',
};

describe('parseEnvironment', () => {
  it('rejects insecure production cookies', () => {
    expect(() => parseEnvironment({ ...valid, SESSION_COOKIE_SECURE: 'false' })).toThrow(
      'SESSION_COOKIE_SECURE',
    );
  });

  it('parses an allow-list of frontend origins', () => {
    const environment = parseEnvironment({
      ...valid,
      FRONTEND_ORIGINS: 'https://motionly.example,https://studio.motionly.example',
    });

    expect(environment.frontendOrigins).toEqual([
      'https://motionly.example',
      'https://studio.motionly.example',
    ]);
  });

  it('derives the Supabase Auth URL from a session-pooler database URL', () => {
    const environment = parseEnvironment({
      ...valid,
      DATABASE_URL: 'postgresql://postgres.motionlyref:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
    });

    expect(environment.supabaseUrl).toBe('https://motionlyref.supabase.co');
  });

  it('derives the Supabase Auth URL from a direct database URL', () => {
    const environment = parseEnvironment({
      ...valid,
      DATABASE_URL: 'postgresql://postgres:password@db.motionlyref.supabase.co:5432/postgres',
    });

    expect(environment.supabaseUrl).toBe('https://motionlyref.supabase.co');
  });
});
