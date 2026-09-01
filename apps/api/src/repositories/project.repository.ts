import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, max, sql } from 'drizzle-orm';

import type { Database } from '../../../../packages/database/src/client.js';
import { projects, projectVersionFiles, projectVersions, workspaceMembers } from '../../../../packages/database/src/schema.js';
import {
  PROJECT_SOURCE_PATHS,
  type CreateProjectInput,
  type ProjectRecord,
  type ProjectRepository,
  type ProjectSourceFiles,
  type SaveProjectSourceInput,
  type UpdateProjectInput,
} from '../services/project.service.js';

function slugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'project';
}

function fileRows(versionId: string, files: ProjectSourceFiles) {
  return PROJECT_SOURCE_PATHS.map((path) => ({
    projectVersionId: versionId,
    path,
    content: files[path],
    contentHash: createHash('sha256').update(files[path]).digest('hex'),
  }));
}

function toSourceFiles(rows: { path: string; content: string }[]): ProjectSourceFiles {
  const values = Object.fromEntries(rows.map((row) => [row.path, row.content])) as Partial<ProjectSourceFiles>;
  for (const path of PROJECT_SOURCE_PATHS) {
    if (typeof values[path] !== 'string') throw new Error(`Project source version is missing ${path}`);
  }
  return values as ProjectSourceFiles;
}

export class DatabaseProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async getWorkspaceMembership(workspaceId: string, userId: string) {
    const [membership] = await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
    )).limit(1);
    return membership ?? null;
  }

  async getProjectAccess(projectId: string, userId: string) {
    const [access] = await this.db.select({ project: projects, role: workspaceMembers.role })
      .from(projects)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, projects.workspaceId),
        eq(workspaceMembers.userId, userId),
      ))
      .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
      .limit(1);
    return access ?? null;
  }

  async list(workspaceId: string) {
    return this.db.select().from(projects).where(and(
      eq(projects.workspaceId, workspaceId),
      isNull(projects.archivedAt),
    )).orderBy(desc(projects.updatedAt));
  }

  async create(workspaceId: string, userId: string, input: CreateProjectInput, sourceHash: string) {
    return this.db.transaction(async (transaction) => {
      const suffix = randomUUID().slice(0, 8);
      const [project] = await transaction.insert(projects).values({
        workspaceId,
        name: input.name,
        slug: `${slugPart(input.name)}-${suffix}`,
        width: input.width,
        height: input.height,
        fps: input.fps,
        duration: input.duration,
        createdBy: userId,
      }).returning();
      if (!project) throw new Error('Unable to create project');

      const [version] = await transaction.insert(projectVersions).values({
        projectId: project.id,
        versionNumber: 1,
        sourceHash,
        message: input.message,
        createdBy: userId,
      }).returning();
      if (!version) throw new Error('Unable to create initial project version');

      await transaction.insert(projectVersionFiles).values(fileRows(version.id, input.files));
      await transaction.update(projects).set({ currentVersionId: version.id }).where(eq(projects.id, project.id));
      return { project: { ...project, currentVersionId: version.id }, version };
    });
  }

  async update(projectId: string, input: UpdateProjectInput) {
    const values = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.fps !== undefined ? { fps: input.fps } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      revision: sql`${projects.revision} + 1`,
      updatedAt: new Date(),
    };
    const [project] = await this.db.update(projects).set(values).where(and(
      eq(projects.id, projectId),
      eq(projects.revision, input.revision),
      isNull(projects.archivedAt),
    )).returning();
    return project ?? null;
  }

  async archive(projectId: string, revision: number) {
    const [project] = await this.db.update(projects).set({
      archivedAt: new Date(),
      updatedAt: new Date(),
      revision: sql`${projects.revision} + 1`,
    }).where(and(
      eq(projects.id, projectId),
      eq(projects.revision, revision),
      isNull(projects.archivedAt),
    )).returning({ id: projects.id });
    return Boolean(project);
  }

  async getCurrentSource(projectId: string) {
    const [project] = await this.db.select({ currentVersionId: projects.currentVersionId }).from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1);
    if (!project?.currentVersionId) return null;
    return this.getVersion(projectId, project.currentVersionId);
  }

  async saveSource(projectId: string, userId: string, input: SaveProjectSourceInput, sourceHash: string) {
    return this.db.transaction(async (transaction) => {
      const [project] = await transaction.update(projects).set({
        revision: sql`${projects.revision} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(projects.id, projectId),
        eq(projects.revision, input.revision),
        isNull(projects.archivedAt),
      )).returning();
      if (!project) return null;

      const [latest] = await transaction.select({ value: max(projectVersions.versionNumber) }).from(projectVersions)
        .where(eq(projectVersions.projectId, projectId));
      const [version] = await transaction.insert(projectVersions).values({
        projectId,
        versionNumber: (latest?.value ?? 0) + 1,
        sourceHash,
        message: input.message,
        createdBy: userId,
      }).returning();
      if (!version) throw new Error('Unable to create project version');

      await transaction.insert(projectVersionFiles).values(fileRows(version.id, input.files));
      await transaction.update(projects).set({ currentVersionId: version.id }).where(eq(projects.id, projectId));
      return { project: { ...project, currentVersionId: version.id }, version };
    });
  }

  async listVersions(projectId: string) {
    return this.db.select().from(projectVersions).where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.versionNumber));
  }

  async getVersion(projectId: string, versionId: string) {
    const [version] = await this.db.select().from(projectVersions).where(and(
      eq(projectVersions.id, versionId),
      eq(projectVersions.projectId, projectId),
    )).limit(1);
    if (!version) return null;
    const files = await this.db.select({ path: projectVersionFiles.path, content: projectVersionFiles.content })
      .from(projectVersionFiles).where(eq(projectVersionFiles.projectVersionId, versionId));
    return { ...version, files: toSourceFiles(files) };
  }

  async restoreVersion(projectId: string, versionId: string, userId: string, revision: number, message: string | undefined) {
    return this.db.transaction(async (transaction) => {
      const [target] = await transaction.select().from(projectVersions).where(and(
        eq(projectVersions.id, versionId),
        eq(projectVersions.projectId, projectId),
      )).limit(1);
      if (!target) return null;
      const targetFiles = await transaction.select({ path: projectVersionFiles.path, content: projectVersionFiles.content })
        .from(projectVersionFiles).where(eq(projectVersionFiles.projectVersionId, versionId));
      const files = toSourceFiles(targetFiles);

      const [project] = await transaction.update(projects).set({
        revision: sql`${projects.revision} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(projects.id, projectId),
        eq(projects.revision, revision),
        isNull(projects.archivedAt),
      )).returning();
      if (!project) return null;

      const [latest] = await transaction.select({ value: max(projectVersions.versionNumber) }).from(projectVersions)
        .where(eq(projectVersions.projectId, projectId));
      const [restored] = await transaction.insert(projectVersions).values({
        projectId,
        versionNumber: (latest?.value ?? 0) + 1,
        sourceHash: target.sourceHash,
        message: message ?? `Restore version ${target.versionNumber}`,
        createdBy: userId,
      }).returning();
      if (!restored) throw new Error('Unable to restore project version');

      await transaction.insert(projectVersionFiles).values(fileRows(restored.id, files));
      await transaction.update(projects).set({ currentVersionId: restored.id }).where(eq(projects.id, projectId));
      return { project: { ...project, currentVersionId: restored.id }, version: restored };
    });
  }
}
