import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { users } from '../../../packages/database/src/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });
});
