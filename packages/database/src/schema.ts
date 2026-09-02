import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer']);
export const workspaceKind = pgEnum('workspace_kind', ['personal', 'team']);
export const generationIntent = pgEnum('generation_intent', ['CREATE', 'EDIT']);
export const generationStatus = pgEnum('generation_status', [
  'QUEUED',
  'PREPARING',
  'GENERATING',
  'VALIDATING',
  'RENDERING',
  'REVIEWING',
  'REPAIRING',
  'PUBLISHING',
  'CANCELLING',
  'COMPLETED',
  'AWAITING_APPLY',
  'CANCELLED',
  'FAILED',
]);
export const generationEventType = pgEnum('generation_event_type', [
  'STATUS_CHANGED',
  'PROGRESS',
  'ATTEMPT_STARTED',
  'ATTEMPT_COMPLETED',
  'ARTIFACT_CREATED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export const generationMessageRole = pgEnum('generation_message_role', ['user', 'assistant', 'system']);
export const modelProvider = pgEnum('model_provider', ['gemini', 'openai', 'anthropic', 'openai-compatible']);
export const queueTaskType = pgEnum('queue_task_type', ['GENERATION', 'RENDER', 'CLEANUP']);
export const queueTaskStatus = pgEnum('queue_task_status', ['QUEUED', 'LEASED', 'COMPLETED', 'DEAD']);
export const assetState = pgEnum('asset_state', ['PENDING', 'READY', 'FAILED', 'DELETED']);
export const artifactKind = pgEnum('artifact_kind', [
  'ASSET',
  'SCREENSHOT',
  'CONTACT_SHEET',
  'BUILD_LOG',
  'VALIDATION_REPORT',
  'THUMBNAIL',
  'VIDEO',
]);
export const artifactRetention = pgEnum('artifact_retention', ['TEMPORARY', 'PROJECT']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: workspaceKind('kind').default('team').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('workspaces_personal_owner_unique').on(table.ownerId).where(sql`${table.kind} = 'personal'`),
]);

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  index('workspace_members_user_idx').on(table.userId),
]);

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  fps: integer('fps').notNull(),
  duration: doublePrecision('duration').notNull(),
  sourceHash: text('source_hash').notNull(),
  revision: integer('revision').default(1).notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('projects_workspace_slug_unique').on(table.workspaceId, table.slug),
  index('projects_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
  check('projects_width_check', sql`${table.width} between 1 and 16384`),
  check('projects_height_check', sql`${table.height} between 1 and 16384`),
  check('projects_fps_check', sql`${table.fps} between 1 and 240`),
  check('projects_duration_check', sql`${table.duration} > 0 and ${table.duration} <= 86400`),
  check('projects_revision_check', sql`${table.revision} >= 1`),
]);

export const projectFiles = pgTable('project_files', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.path] }),
  check('project_files_path_check', sql`${table.path} in ('composition.html', 'styles.css', 'timeline.js', 'index.ts')`),
]);

export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  providerExpiresAt: timestamp('provider_expires_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('auth_sessions_user_idx').on(table.userId)]);

export const oauthAttempts = pgTable('oauth_attempts', {
  stateHash: text('state_hash').primaryKey(),
  verifierStateEncrypted: text('verifier_state_encrypted').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const generationThreads = pgTable('generation_threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('generation_threads_project_updated_idx').on(table.projectId, table.updatedAt)]);

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull().references(() => generationThreads.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  intent: generationIntent('intent').notNull(),
  status: generationStatus('status').default('QUEUED').notNull(),
  stage: text('stage').default('QUEUED').notNull(),
  progress: integer('progress').default(0).notNull(),
  baseSourceHash: text('base_source_hash').notNull(),
  baseRevision: integer('base_revision').notNull(),
  outputSourceHash: text('output_source_hash'),
  retriedFromId: uuid('retried_from_id').references((): AnyPgColumn => generationJobs.id, { onDelete: 'set null' }),
  provider: modelProvider('provider').notNull(),
  model: text('model').notNull(),
  skillBundleVersion: text('skill_bundle_version').notNull(),
  runtimeVersion: text('runtime_version').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('generation_jobs_creator_idempotency_unique').on(table.createdBy, table.idempotencyKey),
  index('generation_jobs_project_created_idx').on(table.projectId, table.createdAt),
  index('generation_jobs_status_updated_idx').on(table.status, table.updatedAt),
  index('generation_jobs_creator_status_idx').on(table.createdBy, table.status),
  check('generation_jobs_progress_check', sql`${table.progress} between 0 and 100`),
  check('generation_jobs_base_revision_check', sql`${table.baseRevision} >= 1`),
  check('generation_jobs_attempts_check', sql`${table.attemptCount} >= 0 and ${table.maxAttempts} >= 1`),
]);

export const generationInputFiles = pgTable('generation_input_files', {
  generationId: uuid('generation_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
}, (table) => [
  primaryKey({ columns: [table.generationId, table.path] }),
  check('generation_input_files_path_check', sql`${table.path} in ('composition.html', 'styles.css', 'timeline.js', 'index.ts')`),
]);

export const generationMessages = pgTable('generation_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  threadId: uuid('thread_id').notNull().references(() => generationThreads.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').references(() => generationJobs.id, { onDelete: 'set null' }),
  role: generationMessageRole('role').notNull(),
  content: text('content').notNull(),
  assetRefs: jsonb('asset_refs').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('generation_messages_thread_created_idx').on(table.threadId, table.createdAt)]);

export const generationAttempts = pgTable('generation_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  generationId: uuid('generation_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(),
  providerRequestId: text('provider_request_id'),
  finishReason: text('finish_reason'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  validationSummary: jsonb('validation_summary').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('generation_attempts_job_number_unique').on(table.generationId, table.attemptNumber),
  check('generation_attempts_number_check', sql`${table.attemptNumber} >= 1`),
]);

export const generationToolCalls = pgTable('generation_tool_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  generationId: uuid('generation_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  attemptId: uuid('attempt_id').notNull().references(() => generationAttempts.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  toolName: text('tool_name').notNull(),
  status: text('status').notNull(),
  inputSummary: jsonb('input_summary').$type<Record<string, unknown>>().notNull(),
  outputSummary: jsonb('output_summary').$type<Record<string, unknown>>(),
  errorCode: text('error_code'),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('generation_tool_calls_attempt_sequence_unique').on(table.attemptId, table.sequence),
  index('generation_tool_calls_generation_created_idx').on(table.generationId, table.createdAt),
  check('generation_tool_calls_sequence_check', sql`${table.sequence} >= 1`),
  check('generation_tool_calls_status_check', sql`${table.status} in ('SUCCEEDED', 'FAILED')`),
  check('generation_tool_calls_duration_check', sql`${table.durationMs} >= 0`),
]);

export const generationEvents = pgTable('generation_events', {
  generationId: uuid('generation_id').notNull().references(() => generationJobs.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  type: generationEventType('type').notNull(),
  status: generationStatus('status').notNull(),
  stage: text('stage').notNull(),
  progress: integer('progress').notNull(),
  message: text('message'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.generationId, table.sequence] }),
  index('generation_events_job_created_idx').on(table.generationId, table.createdAt),
  check('generation_events_sequence_check', sql`${table.sequence} >= 1`),
  check('generation_events_progress_check', sql`${table.progress} between 0 and 100`),
]);

export const generationOutputs = pgTable('generation_outputs', {
  id: uuid('id').defaultRandom().primaryKey(),
  generationId: uuid('generation_id').notNull().unique().references(() => generationJobs.id, { onDelete: 'cascade' }),
  sourceHash: text('source_hash').notNull(),
  validationReport: jsonb('validation_report').$type<Record<string, unknown>>().notNull(),
  publishedRevision: integer('published_revision'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export const generationOutputFiles = pgTable('generation_output_files', {
  generationOutputId: uuid('generation_output_id').notNull().references(() => generationOutputs.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
}, (table) => [
  primaryKey({ columns: [table.generationOutputId, table.path] }),
  check('generation_output_files_path_check', sql`${table.path} in ('composition.html', 'styles.css', 'timeline.js', 'index.ts')`),
]);

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  state: assetState('state').default('PENDING').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  checksum: text('checksum').notNull(),
  objectKey: text('object_key').notNull().unique(),
  uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('assets_workspace_created_idx').on(table.workspaceId, table.createdAt),
  check('assets_byte_size_check', sql`${table.byteSize} >= 0`),
]);

export const projectAssets = pgTable('project_assets', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.projectId, table.assetId] })]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').references(() => generationJobs.id, { onDelete: 'cascade' }),
  attemptId: uuid('attempt_id').references(() => generationAttempts.id, { onDelete: 'set null' }),
  kind: artifactKind('kind').notNull(),
  retention: artifactRetention('retention').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  checksum: text('checksum').notNull(),
  objectKey: text('object_key').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('artifacts_generation_created_idx').on(table.generationId, table.createdAt),
  index('artifacts_expiry_idx').on(table.expiresAt),
  check('artifacts_byte_size_check', sql`${table.byteSize} >= 0`),
]);

export const queueTasks = pgTable('queue_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: queueTaskType('type').notNull(),
  status: queueTaskStatus('status').default('QUEUED').notNull(),
  resourceId: uuid('resource_id').notNull(),
  priority: integer('priority').default(0).notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  lastErrorCode: text('last_error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('queue_tasks_claim_idx').on(table.status, table.availableAt, table.priority),
  index('queue_tasks_lease_expiry_idx').on(table.leaseExpiresAt),
  check('queue_tasks_attempts_check', sql`${table.attemptCount} >= 0 and ${table.maxAttempts} >= 1`),
]);
