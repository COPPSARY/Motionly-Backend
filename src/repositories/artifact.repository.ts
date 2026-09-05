import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Database } from '../../packages/database/client.js';
import { artifacts, generationJobs, projects, workspaceMembers } from '../../packages/database/schema.js';

export interface ArtifactRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  generationId: string | null;
  kind: string;
  retention: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  objectKey: string;
  createdAt: Date;
}

export interface ArtifactRepository {
  generationExistsForUser(generationId: string, userId: string): Promise<boolean>;
  listForGeneration(generationId: string): Promise<ArtifactRecord[]>;
  getForUser(artifactId: string, userId: string): Promise<ArtifactRecord | null>;
}

export class DatabaseArtifactRepository implements ArtifactRepository {
  constructor(private readonly db: Database) {}

  async generationExistsForUser(generationId: string, userId: string) {
    const [row] = await this.db.select({ id: generationJobs.id }).from(generationJobs)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, generationJobs.workspaceId), eq(workspaceMembers.userId, userId)))
      .innerJoin(projects, and(eq(projects.id, generationJobs.projectId), isNull(projects.archivedAt)))
      .where(eq(generationJobs.id, generationId)).limit(1);
    return Boolean(row);
  }

  async listForGeneration(generationId: string) {
    return this.db.select().from(artifacts).where(eq(artifacts.generationId, generationId)).orderBy(desc(artifacts.createdAt)) as Promise<ArtifactRecord[]>;
  }

  async getForUser(artifactId: string, userId: string) {
    const [row] = await this.db.select({ artifact: artifacts }).from(artifacts)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, artifacts.workspaceId), eq(workspaceMembers.userId, userId)))
      .innerJoin(projects, and(eq(projects.id, artifacts.projectId), isNull(projects.archivedAt)))
      .where(eq(artifacts.id, artifactId)).limit(1);
    return (row?.artifact as ArtifactRecord | undefined) ?? null;
  }
}
