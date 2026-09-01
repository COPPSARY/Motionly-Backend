import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { projects, projectVersionFiles, projectVersions, users } from '../../../packages/database/src/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('stores projects as immutable multi-file versions', () => {
    expect(getTableName(projects)).toBe('projects');
    expect(getTableName(projectVersions)).toBe('project_versions');
    expect(getTableName(projectVersionFiles)).toBe('project_version_files');
  });
});
