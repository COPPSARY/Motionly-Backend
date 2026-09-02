import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { projectFiles, projects, users } from '../../../packages/database/src/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('stores one rolling multi-file snapshot per project', () => {
    expect(getTableName(projects)).toBe('projects');
    expect(getTableName(projectFiles)).toBe('project_files');
  });
});
