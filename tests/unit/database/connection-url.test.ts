import { describe, expect, it } from 'vitest';

import { normalizeDatabaseUrl } from '../../../packages/database/src/connection-url.js';

describe('normalizeDatabaseUrl', () => {
  it('encodes reserved characters in a raw database password', () => {
    const normalized = normalizeDatabaseUrl(
      'postgresql://postgres.project:pass/word@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require',
    );

    expect(normalized).toContain('postgres.project:pass%2Fword@');
    expect(() => new URL(normalized)).not.toThrow();
  });

  it('does not double-encode an already valid URL', () => {
    const original = 'postgresql://postgres.project:pass%2Fword@aws-0-region.pooler.supabase.com:5432/postgres';

    expect(normalizeDatabaseUrl(original)).toBe(original);
  });

  it('rejects a value without database credentials', () => {
    expect(() => normalizeDatabaseUrl('not-a-database-url')).toThrow('DATABASE_URL');
  });
});

