import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer']);
export const workspaceKind = pgEnum('workspace_kind', ['personal', 'team']);

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
