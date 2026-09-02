import { createHash } from 'node:crypto';

import { and, eq, isNull, max } from 'drizzle-orm';

import {
  assertGenerationTransition,
  type GenerationEventType,
  type GenerationStatus,
} from '../../../packages/contracts/src/generations.js';
import type { Database } from '../../../packages/database/src/client.js';
import {
  generationEvents,
  generationInputFiles,
  generationJobs,
  generationMessages,
  projectFiles,
  projects,
} from '../../../packages/database/src/schema.js';
import { PROJECT_SOURCE_PATHS, hashSourceFiles, type ProjectSourceFiles } from '../../api/src/services/project.service.js';

export interface GenerationJobContext {
  job: typeof generationJobs.$inferSelect;
  prompt: string;
  files: ProjectSourceFiles;
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
  saveRevision(generationId: string, files: ProjectSourceFiles): Promise<{ sourceHash: string; revision: number }>;
  fail(generationId: string, code: string, message: string, details?: Record<string, unknown>): Promise<void>;
  isCancellationRequested(generationId: string): Promise<boolean>;
}

export class DatabaseWorkerGenerationStore implements WorkerGenerationStore {
  constructor(private readonly db: Database) {}

  async getContext(generationId: string): Promise<GenerationJobContext | null> {
    const [job] = await this.db.select().from(generationJobs).where(eq(generationJobs.id, generationId)).limit(1);
    if (!job) return null;
    const [message] = await this.db.select({ content: generationMessages.content }).from(generationMessages).where(and(
      eq(generationMessages.generationId, generationId),
      eq(generationMessages.role, 'user'),
    )).limit(1);
    if (!message) throw new Error('Generation prompt is missing.');
    const rows = await this.db.select({ path: generationInputFiles.path, content: generationInputFiles.content })
      .from(generationInputFiles).where(eq(generationInputFiles.generationId, generationId));
    return { job, prompt: message.content, files: toSourceFiles(rows) };
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
      if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(current.status)) return;
      assertGenerationTransition(current.status, input.status);
      if (input.progress < current.progress) throw new Error('Generation progress cannot move backwards.');
      const now = new Date();
      await transaction.update(generationJobs).set({
        status: input.status,
        stage: input.stage,
        progress: input.progress,
        updatedAt: now,
        ...(current.startedAt ? {} : { startedAt: now }),
        ...(['COMPLETED', 'CANCELLED', 'FAILED'].includes(input.status) ? { finishedAt: now } : {}),
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

  async saveRevision(generationId: string, files: ProjectSourceFiles) {
    return this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs).where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job) throw new Error('Generation job not found.');
      const [project] = await transaction.select().from(projects).where(and(
        eq(projects.id, job.projectId),
        isNull(projects.archivedAt),
      )).for('update').limit(1);
      if (!project) throw new Error('Generation project not found.');
      if (job.status === 'COMPLETED' && job.outputSourceHash) {
        return { sourceHash: job.outputSourceHash, revision: project.revision };
      }
      if (job.status !== 'PUBLISHING') throw new Error(`Generation cannot save from status ${job.status}.`);
      if (project.revision !== job.baseRevision || project.sourceHash !== job.baseSourceHash) {
        throw generationError('REVISION_CONFLICT', 'The project changed while generation was running.', {
          currentRevision: project.revision,
          currentSourceHash: project.sourceHash,
        });
      }

      const sourceHash = hashSourceFiles(files);
      const revision = project.revision + 1;
      const now = new Date();
      await transaction.delete(projectFiles).where(eq(projectFiles.projectId, project.id));
      await transaction.insert(projectFiles).values(PROJECT_SOURCE_PATHS.map((path) => ({
        projectId: project.id,
        path,
        content: files[path],
        contentHash: createHash('sha256').update(files[path]).digest('hex'),
        updatedAt: now,
      })));
      await transaction.update(projects).set({
        sourceHash,
        revision,
        updatedAt: now,
        savedAt: now,
      }).where(eq(projects.id, project.id));
      await transaction.update(generationJobs).set({
        status: 'COMPLETED',
        stage: 'COMPLETED',
        progress: 100,
        outputSourceHash: sourceHash,
        finishedAt: now,
        updatedAt: now,
      }).where(eq(generationJobs.id, generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId,
        type: 'COMPLETED',
        status: 'COMPLETED',
        stage: 'COMPLETED',
        progress: 100,
        message: 'Done. The project source was updated and saved as a new revision.',
        data: { outputSourceHash: sourceHash, projectRevision: revision },
      });
      return { sourceHash, revision };
    });
  }

  async fail(generationId: string, code: string, message: string, details?: Record<string, unknown>) {
    await this.db.transaction(async (transaction) => {
      const [job] = await transaction.select().from(generationJobs).where(eq(generationJobs.id, generationId)).for('update').limit(1);
      if (!job || ['COMPLETED', 'CANCELLED', 'FAILED'].includes(job.status)) return;
      const now = new Date();
      await transaction.update(generationJobs).set({
        status: 'FAILED',
        stage: code.slice(0, 80),
        progress: job.progress,
        finishedAt: now,
        updatedAt: now,
        errorCode: code.slice(0, 80),
        errorMessage: message.slice(0, 1_000),
        ...(details ? { errorDetails: details } : {}),
      }).where(eq(generationJobs.id, generationId));
      await appendEvent(transaction as unknown as Database, {
        generationId,
        type: 'FAILED',
        status: 'FAILED',
        stage: code.slice(0, 80),
        progress: job.progress,
        message: message.slice(0, 500),
        ...(details ? { data: details } : {}),
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
  for (const path of PROJECT_SOURCE_PATHS) {
    if (typeof values[path] !== 'string') throw new Error(`Generation input is missing ${path}`);
  }
  return values as ProjectSourceFiles;
}

function generationError(code: string, message: string, details: Record<string, unknown>): Error & { code: string; details: Record<string, unknown> } {
  const error = new Error(message) as Error & { code: string; details: Record<string, unknown> };
  error.code = code;
  error.details = details;
  return error;
}
