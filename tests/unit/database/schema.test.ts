import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  artifacts,
  generationAttempts,
  generationToolCalls,
  generationEvents,
  generationJobs,
  generationMessages,
  generationOutputFiles,
  generationOutputs,
  generationThreads,
  projects,
  projectVersionFiles,
  projectVersions,
  queueTasks,
  users,
} from '../../../packages/database/src/schema.js';

describe('database schema', () => {
  it('stores application accounts in the users table', () => {
    expect(getTableName(users)).toBe('users');
  });

  it('stores projects as immutable multi-file versions', () => {
    expect(getTableName(projects)).toBe('projects');
    expect(getTableName(projectVersions)).toBe('project_versions');
    expect(getTableName(projectVersionFiles)).toBe('project_version_files');
  });

  it('stores durable generation, event, output, artifact, and queue state', () => {
    expect(getTableName(generationThreads)).toBe('generation_threads');
    expect(getTableName(generationMessages)).toBe('generation_messages');
    expect(getTableName(generationJobs)).toBe('generation_jobs');
    expect(getTableName(generationAttempts)).toBe('generation_attempts');
    expect(getTableName(generationToolCalls)).toBe('generation_tool_calls');
    expect(getTableName(generationEvents)).toBe('generation_events');
    expect(getTableName(generationOutputs)).toBe('generation_outputs');
    expect(getTableName(generationOutputFiles)).toBe('generation_output_files');
    expect(getTableName(artifacts)).toBe('artifacts');
    expect(getTableName(queueTasks)).toBe('queue_tasks');
  });
});
