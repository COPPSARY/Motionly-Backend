import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../packages/database/client.js';
import { projects, workspaceMembers } from '../../packages/database/schema.js';
import type { CreateProjectInput, ProjectRepository, UpdateProjectInput } from '../services/project.service.js';

function slugPart(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'project'; }
export class DatabaseProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}
  async getWorkspaceMembership(workspaceId: string, userId: string) { const [row] = await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1); return row ?? null; }
  async getProjectAccess(projectId: string, userId: string) { const [row] = await this.db.select({ project: projects, role: workspaceMembers.role }).from(projects).innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, projects.workspaceId), eq(workspaceMembers.userId, userId))).where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1); return row ?? null; }
  async list(workspaceId: string) { return this.db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt))).orderBy(desc(projects.updatedAt)); }
  async create(workspaceId: string, userId: string, input: CreateProjectInput) {
    const [project] = await this.db.insert(projects).values({ workspaceId, createdBy: userId, name: input.name, slug: `${slugPart(input.name)}-${randomUUID().slice(0, 8)}`, width: input.width, height: input.height, fps: input.fps, duration: input.duration, scenes: input.scenes ?? [], compositionHtml: input.compositionHtml ?? '<template><style></style></template>', timelineJs: input.timelineJs ?? 'export function buildTimeline() { return []; }' }).returning();
    if (!project) throw new Error('Unable to create project'); return project;
  }
  async update(projectId: string, input: UpdateProjectInput) {
    const [project] = await this.db.update(projects).set({ ...(input.name !== undefined ? { name: input.name } : {}), ...(input.width !== undefined ? { width: input.width } : {}), ...(input.height !== undefined ? { height: input.height } : {}), ...(input.fps !== undefined ? { fps: input.fps } : {}), ...(input.duration !== undefined ? { duration: input.duration } : {}), ...(input.scenes !== undefined ? { scenes: input.scenes } : {}), ...(input.compositionHtml !== undefined ? { compositionHtml: input.compositionHtml } : {}), ...(input.timelineJs !== undefined ? { timelineJs: input.timelineJs } : {}), revision: sql`${projects.revision} + 1`, updatedAt: new Date() }).where(and(eq(projects.id, projectId), eq(projects.revision, input.revision), isNull(projects.archivedAt))).returning(); return project ?? null;
  }
  async archive(projectId: string, revision: number) { const [project] = await this.db.update(projects).set({ archivedAt: new Date(), updatedAt: new Date(), revision: sql`${projects.revision} + 1` }).where(and(eq(projects.id, projectId), eq(projects.revision, revision), isNull(projects.archivedAt))).returning({ id: projects.id }); return Boolean(project); }
}
