import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '../../packages/database/client.js';
import { projectFiles, projects, workspaceMembers } from '../../packages/database/schema.js';
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

function fileRows(projectId: string, files: ProjectSourceFiles) {
  return PROJECT_SOURCE_PATHS.map((path) => ({
    projectId,
    path,
    content: files[path],
    contentHash: createHash('sha256').update(files[path]).digest('hex'),
  }));
}

function toSourceFiles(rows: { path: string; content: string }[]): ProjectSourceFiles {
  const values = Object.fromEntries(rows.map((row) => [row.path, row.content])) as Partial<ProjectSourceFiles>;
  for (const path of PROJECT_SOURCE_PATHS) {
    if (typeof values[path] !== 'string') throw new Error(`Project source snapshot is missing ${path}`);
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
        sourceHash,
        createdBy: userId,
      }).returning();
      if (!project) throw new Error('Unable to create project');

      await transaction.insert(projectFiles).values(fileRows(project.id, input.files));
      return project;
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
    const [project] = await this.db.select({ sourceHash: projects.sourceHash, savedAt: projects.savedAt }).from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1);
    if (!project) return null;
    const rows = await this.db.select({ path: projectFiles.path, content: projectFiles.content })
      .from(projectFiles).where(eq(projectFiles.projectId, projectId));
    return { ...project, files: toSourceFiles(rows) };
  }

  async saveSource(projectId: string, input: SaveProjectSourceInput, sourceHash: string) {
    return this.db.transaction(async (transaction) => {
      const [project] = await transaction.select().from(projects).where(and(
        eq(projects.id, projectId),
        eq(projects.revision, input.revision),
        isNull(projects.archivedAt),
      )).limit(1).for('update');
      if (!project) return null;
      if (project.sourceHash === sourceHash) return { project, unchanged: true };

      const savedAt = new Date();
      await transaction.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
      await transaction.insert(projectFiles).values(fileRows(projectId, input.files));
      const [savedProject] = await transaction.update(projects).set({
        sourceHash,
        revision: sql`${projects.revision} + 1`,
        updatedAt: savedAt,
        savedAt,
      }).where(and(
        eq(projects.id, projectId),
        eq(projects.revision, input.revision),
        isNull(projects.archivedAt),
      )).returning();
      if (!savedProject) throw new Error('Unable to update project snapshot');
      return { project: savedProject, unchanged: false };
    });
  }
}
