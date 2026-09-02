import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  artifacts,
  generationEvents,
  generationInputFiles,
  generationJobs,
  generationMessages,
  generationThreads,
  projects,
  projectFiles,
  queueTasks,
  users,
} from '../../../packages/database/src/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('stores projects as rolling multi-file snapshots', () => {
    expect(getTableName(projects)).toBe('projects');
    expect(getTableName(projectFiles)).toBe('project_files');
  });

  it('stores durable generation, event, artifact, and queue state', () => {
    expect(getTableName(generationThreads)).toBe('generation_threads');
    expect(getTableName(generationMessages)).toBe('generation_messages');
    expect(getTableName(generationJobs)).toBe('generation_jobs');
    expect(getTableName(generationInputFiles)).toBe('generation_input_files');
    expect(getTableName(generationEvents)).toBe('generation_events');
    expect(getTableName(artifacts)).toBe('artifacts');
    expect(getTableName(queueTasks)).toBe('queue_tasks');
  });
});
