import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  artifacts,
  generationRuns,
  messages,
  projects,
  users,
} from '../../../packages/database/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('stores the current generated project as two source fields', () => {
    expect(getTableName(projects)).toBe('projects');
    expect(projects.name.name).toBe('name');
    expect(projects.updatedAt.name).toBe('updated_at');
    expect(projects.compositionHtml.name).toBe('composition_html');
    expect(projects.timelineJs.name).toBe('timeline_js');
  });

  it('stores direct graph messages and runs without queue state', () => {
    expect(getTableName(messages)).toBe('messages');
    expect(getTableName(generationRuns)).toBe('generation_runs');
    expect(getTableName(artifacts)).toBe('artifacts');
  });
});
