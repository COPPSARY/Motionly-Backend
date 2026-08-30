import { and, asc, count, eq } from 'drizzle-orm';

import type { Database } from '../../../../packages/database/src/client.js';
import { profiles, workspaceMembers, workspaces } from '../../../../packages/database/src/schema.js';
import type { WorkspaceRepository, WorkspaceRole } from '../services/workspace.service.js';

function slugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'workspace';
}

export class DatabaseWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Database) {}

  async getMembership(workspaceId: string, userId: string) {
    const [membership] = await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
    return membership ?? null;
  }

  async countOwners(workspaceId: string) {
    const [result] = await this.db.select({ value: count() }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')));
    return result?.value ?? 0;
  }

  async list(userId: string) {
    return this.db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, kind: workspaces.kind, role: workspaceMembers.role })
      .from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId)).orderBy(asc(workspaces.name));
  }

  async create(userId: string, name: string) {
    return this.db.transaction(async (transaction) => {
      const suffix = crypto.randomUUID().slice(0, 8);
      const [workspace] = await transaction.insert(workspaces).values({ name, slug: `${slugPart(name)}-${suffix}`, kind: 'team', ownerId: userId }).returning();
      if (!workspace) throw new Error('Unable to create workspace');
      await transaction.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: 'owner' });
      return { ...workspace, role: 'owner' as const };
    });
  }

  async get(workspaceId: string) {
    const [workspace] = await this.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    return workspace ?? null;
  }

  async update(workspaceId: string, name: string) {
    const [workspace] = await this.db.update(workspaces).set({ name, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId)).returning();
    return workspace ?? null;
  }

  async listMembers(workspaceId: string) {
    return this.db.select({ userId: profiles.id, email: profiles.email, displayName: profiles.displayName, avatarUrl: profiles.avatarUrl, role: workspaceMembers.role })
      .from(workspaceMembers).innerJoin(profiles, eq(profiles.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(asc(profiles.displayName));
  }

  async findProfileByEmail(email: string) {
    const [profile] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email.toLowerCase())).limit(1);
    return profile ?? null;
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
    const [membership] = await this.db.insert(workspaceMembers).values({ workspaceId, userId, role }).onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role, updatedAt: new Date() },
    }).returning();
    return membership;
  }

  async updateMember(workspaceId: string, userId: string, role: WorkspaceRole) {
    const [membership] = await this.db.update(workspaceMembers).set({ role, updatedAt: new Date() }).where(and(
      eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId),
    )).returning();
    return membership ?? null;
  }

  async removeMember(workspaceId: string, userId: string) {
    await this.db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  }
}
