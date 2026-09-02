import { createHash } from 'node:crypto';

import { and, desc, eq, inArray, isNull, lte, max, sql } from 'drizzle-orm';

import {
  assertGenerationTransition,
  type GenerationEventType,
  type GenerationStatus,
} from '../../../packages/contracts/src/generations.js';
import type { Database } from '../../../packages/database/src/client.js';
import {
  generationAttempts,
  generationToolCalls,
  assets,
  generationEvents,
  generationJobs,
  generationMessages,
  generationOutputFiles,
  generationOutputs,
  projects,
  projectVersionFiles,
  projectVersions,
} from '../../../packages/database/src/schema.js';
import { projectSettingsFromValidation } from '../../../packages/generation-tools/src/validation-report.js';
import { PROJECT_SOURCE_PATHS, type ProjectSourceFiles } from '../../api/src/services/project.service.js';

export interface GenerationJobContext {
  job: typeof generationJobs.$inferSelect;
  messages: Array<typeof generationMessages.$inferSelect>;
  files: ProjectSourceFiles;
  assets: Array<{ id: string; fileName: string; contentType: string; byteSize: number; checksum: string; objectKey: string }>;
}

export interface WorkerGenerationStore {
  getContext(generationId: string): Promise<GenerationJobContext | null>;
  transition(input: {
    generationId: string;
    status: GenerationStatus;
    stage: string;
    progress: number;
    type?: GenerationEventType;
    message?: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  startAttempt(generationId: string): Promise<{ id: string; attemptNumber: number }>;
  completeAttempt(attemptId: string, input: {
    finishReason: string;
    inputTokens: number;
    outputTokens: number;
    validationSummary: Record<string, unknown>;
    providerRequestId?: string;
  }): Promise<void>;
  recordToolCall(input: {
    generationId: string;
    attemptId: string;
    sequence: number;
    toolName: string;
    status: 'SUCCEEDED' | 'FAILED';
    inputSummary: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    errorCode?: string;
    durationMs: number;
  }): Promise<void>;
  saveOutput(generationId: string, files: ProjectSourceFiles, validationReport: Record<string, unknown>): Promise<string>;
  publish(generationId: string, userId: string): Promise<{ status: 'COMPLETED' | 'AWAITING_APPLY'; versionId: string | null; revision: number }>;
  fail(generationId: string, code: string, message: string, details?: Record<string, unknown>): Promise<void>;
  isCancellationRequested(generationId: string): Promise<boolean>;
}

export class DatabaseWorkerGenerationStore implements WorkerGenerationStore {
  constructor(private readonly db: Database) {}

  async getContext(generationId: string): Promise<GenerationJobContext | null> {
    const [job] = await this.db.select().from(generationJobs).where(eq(generationJobs.id, generationId)).limit(1);
    if (!job) return null;
    const [currentMessage] = await this.db.select().from(generationMessages).where(and(
      eq(generationMessages.generationId, generationId),
      eq(generationMessages.role, 'user'),
    )).orderBy(desc(generationMessages.createdAt)).limit(1);
    if (!currentMessage) throw new Error('Generation prompt is missing.');
    const [messages, rows] = await Promise.all([
      this.db.select().from(generationMessages).where(and(
        eq(generationMessages.threadId, job.threadId),
        lte(generationMessages.createdAt, currentMessage.createdAt),
      ))
        .orderBy(desc(generationMessages.createdAt)).limit(50),
      this.db.select({ path: projectVersionFiles.path, content: projectVersionFiles.content })
        .from(projectVersionFiles).where(eq(projectVersionFiles.projectVersionId, job.baseVersionId)),
    ]);
    messages.reverse();
    const assetIds = currentMessage.assetRefs;
    const jobAssets = assetIds.length ? await this.db.select({
      id: assets.id,
      fileName: assets.fileName,
      contentType: assets.contentType,
      byteSize: assets.byteSize,
      checksum: assets.checksum,
      objectKey: assets.objectKey,
    }).from(assets).where(and(inArray(assets.id, assetIds), eq(assets.state, 'READY'))) : [];
    if (jobAssets.length !== new Set(assetIds).size) throw new Error('Generation asset is missing or not ready.');
    return { job, messages, files: toSourceFiles(rows), assets: jobAssets };
  }

  async transition(input: {
    generationId: string;
    status: GenerationStatus;
    stage: string;
    progress: number;
    type?: GenerationEventType;
    message?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!Number.isInteger(input.progress) || input.progress < 0 || input.progress > 100) throw new Error('Invalid generation progress.');
    await this.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(generationJobs)
        .where(eq(generationJobs.id, input.generationId)).for('update').limit(1);
      if (!current) throw new Error('Generation job not found.');
      assertGenerationTransition(current.status, input.status);
      if (input.progress < current.progress) throw new Error('Generation progress cannot move backwards.');
      const now = new Date();
      if (input.status === 'CANCELLED') {
        await transaction.update(generationAttempts).set({
          finishReason: 'GENERATION_CANCELLED',
          validationSummary: { cancelled: true },
          finishedAt: now,
        }).where(and(
          eq(generationAttempts.generationId, input.generationId),
          isNull(generationAttempts.finishedAt),
        ));
      }
      await transaction.update(generationJobs).set({
        status: input.status,
        stage: input.stage,
        progress: input.progress,
        updatedAt: now,
        ...(current.startedAt ? {} : { startedAt: now }),
        ...(['COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED'].includes(input.status) ? { finishedAt: now } : {}),
      }).where(eq(generationJobs.id, input.generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId: input.generationId,
        type: input.type ?? 'STATUS_CHANGED',
        status: input.status,
        stage: input.stage,
        progress: input.progress,
        ...(input.message ? { message: input.message } : {}),
        ...(input.data ? { data: input.data } : {}),
      });
    });
  }

  async startAttempt(generationId: string) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs)
        .where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job) throw new Error('Generation job not found.');
      const attemptNumber = job.attemptCount + 1;
      if (attemptNumber > job.maxAttempts) throw new Error('Generation attempt budget exhausted.');
      await transaction.update(generationAttempts).set({
        finishReason: 'WORKER_INTERRUPTED',
        validationSummary: { interrupted: true },
        finishedAt: new Date(),
      }).where(and(
        eq(generationAttempts.generationId, generationId),
        isNull(generationAttempts.finishedAt),
      ));
      const [attempt] = await transaction.insert(generationAttempts).values({ generationId, attemptNumber }).returning({ id: generationAttempts.id });
      if (!attempt) throw new Error('Unable to create generation attempt.');
      await transaction.update(generationJobs).set({ attemptCount: attemptNumber, updatedAt: new Date() }).where(eq(generationJobs.id, generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId,
        type: 'ATTEMPT_STARTED',
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        message: `Generation attempt ${attemptNumber} started.`,
        data: { attemptNumber },
      });
      return { id: attempt.id, attemptNumber };
    });
  }

  async completeAttempt(attemptId: string, input: {
    finishReason: string;
    inputTokens: number;
    outputTokens: number;
    validationSummary: Record<string, unknown>;
    providerRequestId?: string;
  }) {
    await this.db.transaction(async (transaction) => {
      const [attempt] = await transaction.update(generationAttempts).set({
        finishReason: input.finishReason,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        validationSummary: input.validationSummary,
        ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
        finishedAt: new Date(),
      }).where(eq(generationAttempts.id, attemptId)).returning({
        generationId: generationAttempts.generationId,
        attemptNumber: generationAttempts.attemptNumber,
      });
      if (!attempt) throw new Error('Generation attempt not found.');
      const [job] = await transaction.select().from(generationJobs)
        .where(eq(generationJobs.id, attempt.generationId)).for('update').limit(1);
      if (!job) throw new Error('Generation job not found.');
      await appendEvent(transaction as unknown as Database, {
        generationId: attempt.generationId,
        type: 'ATTEMPT_COMPLETED',
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        message: `Generation attempt ${attempt.attemptNumber} completed.`,
        data: { attemptNumber: attempt.attemptNumber, finishReason: input.finishReason },
      });
    });
  }

  async recordToolCall(input: {
    generationId: string;
    attemptId: string;
    sequence: number;
    toolName: string;
    status: 'SUCCEEDED' | 'FAILED';
    inputSummary: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    errorCode?: string;
    durationMs: number;
  }) {
    await this.db.insert(generationToolCalls).values({
      generationId: input.generationId,
      attemptId: input.attemptId,
      sequence: input.sequence,
      toolName: input.toolName.slice(0, 120),
      status: input.status,
      inputSummary: input.inputSummary,
      ...(input.outputSummary ? { outputSummary: input.outputSummary } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode.slice(0, 120) } : {}),
      durationMs: Math.max(0, Math.round(input.durationMs)),
    });
  }

  async saveOutput(generationId: string, files: ProjectSourceFiles, validationReport: Record<string, unknown>) {
    return this.db.transaction(async (transaction) => {
      const sourceHash = hashFiles(files);
      const [existing] = await transaction.select({ id: generationOutputs.id }).from(generationOutputs)
        .where(eq(generationOutputs.generationId, generationId)).limit(1);
      if (existing) {
        await transaction.delete(generationOutputFiles).where(eq(generationOutputFiles.generationOutputId, existing.id));
        await transaction.update(generationOutputs).set({ sourceHash, validationReport }).where(eq(generationOutputs.id, existing.id));
        await transaction.insert(generationOutputFiles).values(outputFileRows(existing.id, files));
        return existing.id;
      }
      const [output] = await transaction.insert(generationOutputs).values({ generationId, sourceHash, validationReport }).returning({ id: generationOutputs.id });
      if (!output) throw new Error('Unable to save generation output.');
      await transaction.insert(generationOutputFiles).values(outputFileRows(output.id, files));
      return output.id;
    });
  }

  async publish(generationId: string, userId: string) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs).where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job) throw new Error('Generation job not found.');
      const [project] = await transaction.select().from(projects).where(eq(projects.id, job.projectId)).for('update').limit(1);
      if (!project) throw new Error('Generation project not found.');
      if (job.status === 'COMPLETED' && job.outputVersionId) {
        return { status: 'COMPLETED' as const, versionId: job.outputVersionId, revision: project.revision };
      }
      if (job.status === 'AWAITING_APPLY') {
        return { status: 'AWAITING_APPLY' as const, versionId: null, revision: project.revision };
      }
      if (job.status !== 'PUBLISHING') throw new Error(`Generation cannot publish from status ${job.status}.`);
      const [output] = await transaction.select().from(generationOutputs).where(eq(generationOutputs.generationId, generationId)).limit(1);
      if (!output) throw new Error('Generation output not found.');
      const projectSettings = projectSettingsFromValidation(output.validationReport);

      if (project.revision !== job.baseRevision || project.currentVersionId !== job.baseVersionId) {
        const now = new Date();
        await transaction.update(generationJobs).set({
          status: 'AWAITING_APPLY', stage: 'REVISION_CONFLICT', progress: 100, finishedAt: now, updatedAt: now,
          errorCode: 'REVISION_CONFLICT', errorMessage: 'The project changed while generation was running.',
          errorDetails: { currentRevision: project.revision, currentVersionId: project.currentVersionId },
        }).where(eq(generationJobs.id, generationId));
        await appendEvent(transaction as unknown as Database, {
          generationId, type: 'COMPLETED', status: 'AWAITING_APPLY', stage: 'REVISION_CONFLICT', progress: 100,
          message: 'Candidate preserved because the project changed.', data: { currentRevision: project.revision },
        });
        return { status: 'AWAITING_APPLY' as const, versionId: null, revision: project.revision };
      }

      const files = await transaction.select().from(generationOutputFiles).where(eq(generationOutputFiles.generationOutputId, output.id));
      const [latest] = await transaction.select({ value: max(projectVersions.versionNumber) }).from(projectVersions)
        .where(eq(projectVersions.projectId, project.id));
      const [version] = await transaction.insert(projectVersions).values({
        projectId: project.id,
        versionNumber: (latest?.value ?? 0) + 1,
        sourceHash: output.sourceHash,
        message: 'Cloud AI generation',
        parentVersionId: job.baseVersionId,
        runtimeVersion: job.runtimeVersion,
        skillBundleVersion: job.skillBundleVersion,
        createdBy: userId,
      }).returning();
      if (!version) throw new Error('Unable to publish generated project version.');
      await transaction.insert(projectVersionFiles).values(files.map((file) => ({
        projectVersionId: version.id, path: file.path, content: file.content, contentHash: file.contentHash,
      })));
      const revision = project.revision + 1;
      const now = new Date();
      await transaction.update(projects).set({
        currentVersionId: version.id, revision, updatedAt: now, ...projectSettings,
      }).where(eq(projects.id, project.id));
      await transaction.update(generationOutputs).set({ publishedVersionId: version.id, publishedAt: now }).where(eq(generationOutputs.id, output.id));
      await transaction.update(generationJobs).set({
        status: 'COMPLETED', stage: 'COMPLETED', progress: 100, outputVersionId: version.id, finishedAt: now, updatedAt: now,
      }).where(eq(generationJobs.id, generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId, type: 'COMPLETED', status: 'COMPLETED', stage: 'COMPLETED', progress: 100,
        message: 'Generation published as a new project revision.', data: { outputVersionId: version.id, projectRevision: revision },
      });
      return { status: 'COMPLETED' as const, versionId: version.id, revision };
    });
  }

  async fail(generationId: string, code: string, message: string, details?: Record<string, unknown>) {
    await this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs).where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job || ['COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED'].includes(job.status)) return;
      const now = new Date();
      await transaction.update(generationAttempts).set({
        finishReason: code,
        validationSummary: { failed: true, code },
        finishedAt: now,
      }).where(and(
        eq(generationAttempts.generationId, generationId),
        isNull(generationAttempts.finishedAt),
      ));
      await transaction.update(generationJobs).set({
        status: 'FAILED', stage: code, finishedAt: now, updatedAt: now,
        errorCode: code, errorMessage: message, ...(details ? { errorDetails: details } : {}),
      }).where(eq(generationJobs.id, generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId, type: 'FAILED', status: 'FAILED', stage: code, progress: job.progress, message,
      });
    });
  }

  async isCancellationRequested(generationId: string) {
    const [job] = await this.db.select({ cancelRequestedAt: generationJobs.cancelRequestedAt, status: generationJobs.status })
      .from(generationJobs).where(eq(generationJobs.id, generationId)).limit(1);
    return Boolean(job?.cancelRequestedAt) || job?.status === 'CANCELLING' || job?.status === 'CANCELLED';
  }
}

async function appendEvent(db: Database, input: Omit<typeof generationEvents.$inferInsert, 'sequence'>) {
  const [latest] = await db.select({ value: max(generationEvents.sequence) }).from(generationEvents)
    .where(eq(generationEvents.generationId, input.generationId));
  await db.insert(generationEvents).values({ ...input, sequence: (latest?.value ?? 0) + 1 });
}

function toSourceFiles(rows: Array<{ path: string; content: string }>): ProjectSourceFiles {
  const values = Object.fromEntries(rows.map((row) => [row.path, row.content])) as Partial<ProjectSourceFiles>;
  for (const path of PROJECT_SOURCE_PATHS) if (typeof values[path] !== 'string') throw new Error(`Project version is missing ${path}`);
  return values as ProjectSourceFiles;
}

function hashFiles(files: ProjectSourceFiles) {
  const hash = createHash('sha256');
  for (const filePath of PROJECT_SOURCE_PATHS) hash.update(filePath).update('\0').update(files[filePath]).update('\0');
  return hash.digest('hex');
}

function outputFileRows(outputId: string, files: ProjectSourceFiles) {
  return PROJECT_SOURCE_PATHS.map((filePath) => ({
    generationOutputId: outputId,
    path: filePath,
    content: files[filePath],
    contentHash: createHash('sha256').update(files[filePath]).digest('hex'),
  }));
}
