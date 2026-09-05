import { createHash, randomUUID } from 'node:crypto';

import { and, count, desc, eq, gt, inArray, isNull, max, sql, sum } from 'drizzle-orm';

import type { Database } from '../../packages/database/client.js';
import {
  generationEvents,
  generationInputFiles,
  generationJobs,
  generationMessages,
  generationThreads,
  assets,
  projectAssets,
  projectFiles,
  projects,
  workspaceMembers,
} from '../../packages/database/schema.js';
import type { GenerationRecord, GenerationRepository } from '../services/generation.service.js';
import { hashSourceFiles, PROJECT_SOURCE_PATHS, type ProjectSourceFiles } from '../services/project.service.js';
import { AppError } from '../errors.js';

function projectFileRows(projectId: string, files: ProjectSourceFiles) {
  return PROJECT_SOURCE_PATHS.map((path) => ({
    projectId,
    path,
    content: files[path],
    contentHash: createHash('sha256').update(files[path]).digest('hex'),
  }));
}

function inputFileRows(generationId: string, files: ProjectSourceFiles) {
  return PROJECT_SOURCE_PATHS.map((path) => ({
    generationId,
    path,
    content: files[path],
    contentHash: createHash('sha256').update(files[path]).digest('hex'),
  }));
}

function toSourceFiles(rows: Array<{ path: string; content: string }>): ProjectSourceFiles {
  const values = Object.fromEntries(rows.map((row) => [row.path, row.content])) as Partial<ProjectSourceFiles>;
  for (const path of PROJECT_SOURCE_PATHS) {
    if (typeof values[path] !== 'string') throw new Error(`Project source snapshot is missing ${path}`);
  }
  return values as ProjectSourceFiles;
}

function slugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'project';
}

export class DatabaseGenerationRepository implements GenerationRepository {
  constructor(private readonly db: Database) {}

  async getWorkspaceMembership(workspaceId: string, userId: string) {
    const [membership] = await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId),
    )).limit(1);
    return membership ?? null;
  }

  async getProjectAccess(projectId: string, userId: string) {
    const [access] = await this.db.select({
      project: {
        id: projects.id,
        workspaceId: projects.workspaceId,
        sourceHash: projects.sourceHash,
        revision: projects.revision,
      },
      role: workspaceMembers.role,
    }).from(projects).innerJoin(workspaceMembers, and(
      eq(workspaceMembers.workspaceId, projects.workspaceId),
      eq(workspaceMembers.userId, userId),
    )).where(and(eq(projects.id, projectId), isNull(projects.archivedAt))).limit(1);
    return access ?? null;
  }

  async findByIdempotency(userId: string, idempotencyKey: string) {
    const [job] = await this.db.select().from(generationJobs).where(and(
      eq(generationJobs.createdBy, userId),
      eq(generationJobs.idempotencyKey, idempotencyKey),
    )).limit(1);
    return (job as GenerationRecord | undefined) ?? null;
  }

  async createProjectGeneration(input: Parameters<GenerationRepository['createProjectGeneration']>[0]) {
    try {
      return await this.db.transaction(async (transaction) => {
        const transactionDb = transaction as unknown as Database;
        await lockGenerationSubmissions(transactionDb, input.userId);
        const duplicate = await findIdempotent(transactionDb, input.userId, input.idempotencyKey);
        if (duplicate) return duplicate;
        await assertGenerationCapacity(transactionDb, input.userId, input.defaults.maxActivePerUser);
        const suffix = randomUUID().slice(0, 8);
        const [project] = await transaction.insert(projects).values({
          workspaceId: input.workspaceId,
          name: input.request.project.name,
          slug: `${slugPart(input.request.project.name)}-${suffix}`,
          width: input.request.project.width,
          height: input.request.project.height,
          fps: input.request.project.fps,
          duration: input.request.project.duration,
          sourceHash: hashSourceFiles(input.starterFiles),
          createdBy: input.userId,
        }).returning();
        if (!project) throw new Error('Unable to create generated project');

        await transaction.insert(projectFiles).values(projectFileRows(project.id, input.starterFiles));

        return this.insertGeneration(transactionDb, {
          userId: input.userId,
          workspaceId: input.workspaceId,
          projectId: project.id,
          threadId: undefined,
          intent: 'CREATE',
          prompt: input.request.prompt,
          assetIds: input.request.assetIds,
          baseSourceHash: project.sourceHash,
          baseRevision: project.revision,
          idempotencyKey: input.idempotencyKey,
          defaults: input.defaults,
        });
      });
    } catch (error) {
      return this.resolveIdempotencyRace(error, input.userId, input.idempotencyKey);
    }
  }

  async createEditGeneration(input: Parameters<GenerationRepository['createEditGeneration']>[0]) {
    try {
      return await this.db.transaction(async (transaction) => {
        const transactionDb = transaction as unknown as Database;
        await lockGenerationSubmissions(transactionDb, input.userId);
        const duplicate = await findIdempotent(transactionDb, input.userId, input.idempotencyKey);
        if (duplicate) return duplicate;
        await assertGenerationCapacity(transactionDb, input.userId, input.defaults.maxActivePerUser);
        return this.insertGeneration(transactionDb, {
          userId: input.userId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          threadId: input.request.threadId,
          intent: 'EDIT',
          prompt: input.request.prompt,
          assetIds: input.request.assetIds,
          baseSourceHash: input.request.baseSourceHash,
          baseRevision: input.request.baseRevision,
          idempotencyKey: input.idempotencyKey,
          defaults: input.defaults,
        });
      });
    } catch (error) {
      return this.resolveIdempotencyRace(error, input.userId, input.idempotencyKey);
    }
  }

  async list(projectId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [rows, totals] = await Promise.all([
      this.db.select().from(generationJobs).where(eq(generationJobs.projectId, projectId))
        .orderBy(desc(generationJobs.createdAt)).limit(pageSize).offset(offset),
      this.db.select({ value: count() }).from(generationJobs).where(eq(generationJobs.projectId, projectId)),
    ]);
    return { data: rows as GenerationRecord[], totalItems: totals[0]?.value ?? 0 };
  }

  async getForUser(generationId: string, userId: string) {
    const [row] = await this.db.select({ job: generationJobs }).from(generationJobs)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, generationJobs.workspaceId),
        eq(workspaceMembers.userId, userId),
      ))
      .innerJoin(projects, and(eq(projects.id, generationJobs.projectId), isNull(projects.archivedAt)))
      .where(eq(generationJobs.id, generationId)).limit(1);
    return (row?.job as GenerationRecord | undefined) ?? null;
  }

  async requestCancellation(generationId: string) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs).where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job || ['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status)) return null;
      if (job.status === 'CANCELLING') return job as GenerationRecord;
      const now = new Date();
      const [updated] = await transaction.update(generationJobs).set({
        status: 'CANCELLING', stage: 'CANCELLING', cancelRequestedAt: now, updatedAt: now,
      }).where(eq(generationJobs.id, generationId)).returning();
      await appendGenerationEvent(transaction as unknown as Database, {
        generationId, type: 'STATUS_CHANGED', status: 'CANCELLING', stage: 'CANCELLING', progress: job.progress,
        message: 'Cancellation requested.',
      });
      return (updated as GenerationRecord | undefined) ?? null;
    });
  }

  async listEvents(generationId: string, afterSequence: number) {
    return this.db.select().from(generationEvents).where(and(
      eq(generationEvents.generationId, generationId),
      gt(generationEvents.sequence, afterSequence),
    )).orderBy(generationEvents.sequence).limit(500);
  }

  async countActiveForUser(userId: string) {
    const [row] = await this.db.select({ value: count() }).from(generationJobs).where(and(
      eq(generationJobs.createdBy, userId),
      inArray(generationJobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'PUBLISHING', 'CANCELLING']),
    ));
    return row?.value ?? 0;
  }

  async summarizeReadyAssets(workspaceId: string, assetIds: string[]) {
    if (!assetIds.length) return { count: 0, totalBytes: 0 };
    const [row] = await this.db.select({ count: count(), totalBytes: sum(assets.byteSize) }).from(assets).where(and(
      eq(assets.workspaceId, workspaceId), eq(assets.state, 'READY'), inArray(assets.id, assetIds),
    ));
    return { count: row?.count ?? 0, totalBytes: Number(row?.totalBytes ?? 0) };
  }

  private async insertGeneration(db: Database, input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    threadId: string | undefined;
    intent: 'CREATE' | 'EDIT';
    prompt: string;
    assetIds: string[];
    baseSourceHash: string;
    baseRevision: number;
    idempotencyKey: string;
    defaults: Parameters<GenerationRepository['createEditGeneration']>[0]['defaults'];
  }): Promise<GenerationRecord> {
    const [baseProject] = await db.select({ revision: projects.revision, sourceHash: projects.sourceHash })
      .from(projects).where(and(eq(projects.id, input.projectId), isNull(projects.archivedAt))).for('update').limit(1);
    if (!baseProject || baseProject.revision !== input.baseRevision || baseProject.sourceHash !== input.baseSourceHash) {
      throw new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', {
        currentRevision: baseProject?.revision,
        currentSourceHash: baseProject?.sourceHash,
      });
    }
    let threadId = input.threadId;
    if (threadId) {
      const [thread] = await db.select({ id: generationThreads.id }).from(generationThreads).where(and(
        eq(generationThreads.id, threadId),
        eq(generationThreads.projectId, input.projectId),
      )).limit(1);
      if (!thread) throw new Error('Generation thread does not belong to project');
    } else {
      const [thread] = await db.insert(generationThreads).values({
        projectId: input.projectId,
        createdBy: input.userId,
      }).returning({ id: generationThreads.id });
      if (!thread) throw new Error('Unable to create generation thread');
      threadId = thread.id;
    }

    const [job] = await db.insert(generationJobs).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      threadId,
      createdBy: input.userId,
      intent: input.intent,
      baseSourceHash: input.baseSourceHash,
      baseRevision: input.baseRevision,
      provider: input.defaults.provider,
      model: input.defaults.model,
      skillBundleVersion: input.defaults.skillBundleVersion,
      runtimeVersion: input.defaults.runtimeVersion,
      idempotencyKey: input.idempotencyKey,
    }).returning();
    if (!job) throw new Error('Unable to create generation job');

    const sourceRows = await db.select({ path: projectFiles.path, content: projectFiles.content })
      .from(projectFiles).where(eq(projectFiles.projectId, input.projectId));
    const source = toSourceFiles(sourceRows);
    if (hashSourceFiles(source) !== input.baseSourceHash) {
      throw new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.');
    }
    await db.insert(generationInputFiles).values(inputFileRows(job.id, source));

    await db.insert(generationMessages).values({
      threadId,
      generationId: job.id,
      role: 'user',
      content: input.prompt,
      assetRefs: input.assetIds,
    });
    if (input.assetIds.length) {
      await db.insert(projectAssets).values([...new Set(input.assetIds)].map((assetId) => ({ projectId: input.projectId, assetId }))).onConflictDoNothing();
    }
    await db.insert(generationEvents).values({
      generationId: job.id,
      sequence: 1,
      type: 'STATUS_CHANGED',
      status: 'QUEUED',
      stage: 'QUEUED',
      progress: 0,
      message: 'Got it — I’m working on that now.',
    });
    return job as GenerationRecord;
  }

  private async resolveIdempotencyRace(error: unknown, userId: string, idempotencyKey: string) {
    if (!hasPostgresConstraint(error, 'generation_jobs_creator_idempotency_unique')) throw error;
    const existing = await this.findByIdempotency(userId, idempotencyKey);
    if (!existing) throw error;
    return existing;
  }
}

function hasPostgresConstraint(error: unknown, expectedConstraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if ('code' in current && current.code === '23505' && 'constraint' in current && current.constraint === expectedConstraint) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

async function appendGenerationEvent(db: Database, input: Omit<typeof generationEvents.$inferInsert, 'sequence'>) {
  const [latest] = await db.select({ value: max(generationEvents.sequence) }).from(generationEvents)
    .where(eq(generationEvents.generationId, input.generationId));
  await db.insert(generationEvents).values({ ...input, sequence: (latest?.value ?? 0) + 1 });
}

async function assertGenerationCapacity(db: Database, userId: string, limit: number) {
  const [row] = await db.select({ value: count() }).from(generationJobs).where(and(
    eq(generationJobs.createdBy, userId),
    inArray(generationJobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'VALIDATING', 'PUBLISHING', 'CANCELLING']),
  ));
  if ((row?.value ?? 0) >= limit) throw new AppError(429, 'GENERATION_LIMIT_EXCEEDED', 'Too many active generation jobs.', { limit });
}

async function lockGenerationSubmissions(db: Database, userId: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}

async function findIdempotent(db: Database, userId: string, idempotencyKey: string) {
  const [job] = await db.select().from(generationJobs).where(and(
    eq(generationJobs.createdBy, userId),
    eq(generationJobs.idempotencyKey, idempotencyKey),
  )).limit(1);
  return (job as GenerationRecord | undefined) ?? null;
}
