import type {
  CreateGenerationRequest,
  EditGenerationRequest,
  GenerationIntent,
  GenerationStatus,
  ModelProviderName,
  RetryGenerationRequest,
} from '../../../../packages/contracts/src/generations.js';
import { MAX_GENERATION_ASSET_BYTES } from '../../../../packages/contracts/src/generations.js';
import {
  MOTIONLY_RUNTIME_VERSION,
  MOTIONLY_SKILL_BUNDLE_VERSION,
  createStarterSource,
} from '../../../../packages/motionly-runtime/src/starter.js';
import { AppError } from '../errors.js';
import type { ProjectSourceFiles } from './project.service.js';
import type { WorkspaceRole } from './workspace.service.js';

export interface GenerationRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  threadId: string;
  createdBy: string;
  intent: GenerationIntent;
  status: GenerationStatus;
  stage: string;
  progress: number;
  baseVersionId: string;
  baseRevision: number;
  outputVersionId: string | null;
  provider: ModelProviderName;
  model: string;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerationDefaults {
  provider: ModelProviderName;
  model: string;
  maxAttempts: number;
  runtimeVersion?: string;
  skillBundleVersion?: string;
  maxActivePerUser?: number;
}

export interface GenerationRepository {
  getWorkspaceMembership(workspaceId: string, userId: string): Promise<{ role: WorkspaceRole } | null>;
  getProjectAccess(projectId: string, userId: string): Promise<{
    project: { id: string; workspaceId: string; currentVersionId: string | null; revision: number };
    role: WorkspaceRole;
  } | null>;
  versionBelongsToProject(projectId: string, versionId: string): Promise<boolean>;
  findByIdempotency(userId: string, idempotencyKey: string): Promise<GenerationRecord | null>;
  createProjectGeneration(input: {
    userId: string;
    workspaceId: string;
    request: CreateGenerationRequest;
    idempotencyKey: string;
    defaults: Required<GenerationDefaults>;
    starterFiles: ProjectSourceFiles;
  }): Promise<GenerationRecord>;
  createEditGeneration(input: {
    userId: string;
    projectId: string;
    workspaceId: string;
    request: EditGenerationRequest;
    idempotencyKey: string;
    defaults: Required<GenerationDefaults>;
  }): Promise<GenerationRecord>;
  list(projectId: string, page: number, pageSize: number): Promise<{ data: GenerationRecord[]; totalItems: number }>;
  getForUser(generationId: string, userId: string): Promise<GenerationRecord | null>;
  requestCancellation(generationId: string): Promise<GenerationRecord | null>;
  createRetryGeneration(input: {
    userId: string;
    originalGenerationId: string;
    projectId: string;
    workspaceId: string;
    threadId: string;
    prompt: string;
    assetIds: string[];
    baseVersionId: string;
    baseRevision: number;
    idempotencyKey: string;
    defaults: Required<GenerationDefaults>;
  }): Promise<GenerationRecord>;
  getLatestUserMessage(generationId: string): Promise<{ content: string; assetIds: string[] } | null>;
  listEvents(generationId: string, afterSequence: number): Promise<Array<{
    generationId: string;
    sequence: number;
    type: string;
    status: GenerationStatus;
    stage: string;
    progress: number;
    message: string | null;
    data: Record<string, unknown> | null;
    createdAt: Date;
  }>>;
  applyCandidate(generationId: string, userId: string, revision: number): Promise<{ versionId: string; revision: number } | null>;
  countActiveForUser(userId: string): Promise<number>;
  summarizeReadyAssets(workspaceId: string, assetIds: string[]): Promise<{ count: number; totalBytes: number }>;
}

export class GenerationService {
  private readonly defaults: Required<GenerationDefaults>;

  constructor(private readonly repository: GenerationRepository, defaults: GenerationDefaults) {
    this.defaults = {
      ...defaults,
      runtimeVersion: defaults.runtimeVersion ?? MOTIONLY_RUNTIME_VERSION,
      skillBundleVersion: defaults.skillBundleVersion ?? MOTIONLY_SKILL_BUNDLE_VERSION,
      maxActivePerUser: defaults.maxActivePerUser ?? 3,
    };
  }

  async create(
    userId: string,
    workspaceId: string,
    request: CreateGenerationRequest,
    idempotencyKey: string,
  ) {
    const duplicate = await this.repository.findByIdempotency(userId, idempotencyKey);
    if (duplicate) return toGenerationResource(duplicate);
    await this.requireCapacity(userId);
    const membership = await this.repository.getWorkspaceMembership(workspaceId, userId);
    if (!membership) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    this.requireWriteAccess(membership.role);
    await this.requireAssets(workspaceId, request.assetIds);
    const starterFiles: ProjectSourceFiles = createStarterSource(request.project);
    const created = await this.repository.createProjectGeneration({
      userId,
      workspaceId,
      request,
      idempotencyKey,
      defaults: this.defaults,
      starterFiles,
    });
    return toGenerationResource(created);
  }

  async edit(
    userId: string,
    projectId: string,
    request: EditGenerationRequest,
    idempotencyKey: string,
  ) {
    const duplicate = await this.repository.findByIdempotency(userId, idempotencyKey);
    if (duplicate) return toGenerationResource(duplicate);
    await this.requireCapacity(userId);
    const access = await this.repository.getProjectAccess(projectId, userId);
    if (!access) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    this.requireWriteAccess(access.role);
    if (access.project.revision !== request.baseRevision || access.project.currentVersionId !== request.baseVersionId) {
      throw new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', {
        currentRevision: access.project.revision,
        currentVersionId: access.project.currentVersionId,
      });
    }
    if (!(await this.repository.versionBelongsToProject(projectId, request.baseVersionId))) {
      throw new AppError(404, 'PROJECT_VERSION_NOT_FOUND', 'Project version not found.');
    }
    await this.requireAssets(access.project.workspaceId, request.assetIds);
    const created = await this.repository.createEditGeneration({
      userId,
      projectId,
      workspaceId: access.project.workspaceId,
      request,
      idempotencyKey,
      defaults: this.defaults,
    });
    return toGenerationResource(created);
  }

  async list(userId: string, projectId: string, page: number, pageSize: number) {
    const access = await this.repository.getProjectAccess(projectId, userId);
    if (!access) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    const result = await this.repository.list(projectId, page, pageSize);
    return {
      data: result.data.map(toGenerationResource),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(userId: string, generationId: string) {
    const record = await this.repository.getForUser(generationId, userId);
    if (!record) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    return toGenerationResource(record);
  }

  async cancel(userId: string, generationId: string) {
    const record = await this.repository.getForUser(generationId, userId);
    if (!record) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    if (record.status === 'CANCELLED' || record.status === 'CANCELLING') return toGenerationResource(record);
    if (['COMPLETED', 'AWAITING_APPLY', 'FAILED'].includes(record.status)) {
      throw new AppError(409, 'GENERATION_ALREADY_TERMINAL', 'The generation can no longer be cancelled.');
    }
    const updated = await this.repository.requestCancellation(generationId);
    if (!updated) throw new AppError(409, 'GENERATION_ALREADY_TERMINAL', 'The generation can no longer be cancelled.');
    return toGenerationResource(updated);
  }

  async retry(userId: string, generationId: string, request: RetryGenerationRequest, idempotencyKey: string) {
    const duplicate = await this.repository.findByIdempotency(userId, idempotencyKey);
    if (duplicate) return toGenerationResource(duplicate);
    await this.requireCapacity(userId);
    const original = await this.repository.getForUser(generationId, userId);
    if (!original) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    if (!['FAILED', 'CANCELLED', 'AWAITING_APPLY'].includes(original.status)) {
      throw new AppError(409, 'GENERATION_NOT_RETRYABLE', 'Only failed, cancelled, or conflicting generations can be retried.');
    }
    const access = await this.repository.getProjectAccess(original.projectId, userId);
    if (!access) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    this.requireWriteAccess(access.role);
    if (!access.project.currentVersionId) throw new AppError(409, 'PROJECT_SOURCE_MISSING', 'The project does not have a current source version.');
    const baseVersionId = request.baseVersionId ?? access.project.currentVersionId;
    const baseRevision = request.baseRevision ?? access.project.revision;
    if (baseVersionId !== access.project.currentVersionId || baseRevision !== access.project.revision) {
      throw new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', {
        currentRevision: access.project.revision, currentVersionId: access.project.currentVersionId,
      });
    }
    if (!(await this.repository.versionBelongsToProject(original.projectId, baseVersionId))) {
      throw new AppError(404, 'PROJECT_VERSION_NOT_FOUND', 'Project version not found.');
    }
    const message = await this.repository.getLatestUserMessage(generationId);
    if (!message) throw new AppError(409, 'GENERATION_PROMPT_MISSING', 'The generation prompt could not be recovered.');
    await this.requireAssets(original.workspaceId, message.assetIds);
    const retry = await this.repository.createRetryGeneration({
      userId,
      originalGenerationId: generationId,
      projectId: original.projectId,
      workspaceId: original.workspaceId,
      threadId: original.threadId,
      prompt: message.content,
      assetIds: message.assetIds,
      baseVersionId,
      baseRevision,
      idempotencyKey,
      defaults: this.defaults,
    });
    return toGenerationResource(retry);
  }

  async events(userId: string, generationId: string, afterSequence: number) {
    const record = await this.repository.getForUser(generationId, userId);
    if (!record) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    const events = await this.repository.listEvents(generationId, afterSequence);
    const terminal = ['COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED'].includes(record.status);
    return {
      events: events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      // A full page may have more durable events after it. Let the SSE controller
      // advance the cursor and drain another page before closing a terminal job.
      isTerminal: terminal && events.length < 500,
    };
  }

  async apply(userId: string, generationId: string, revision: number) {
    const record = await this.repository.getForUser(generationId, userId);
    if (!record) throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    if (record.status === 'COMPLETED' && record.outputVersionId) return { outputVersionId: record.outputVersionId };
    if (record.status !== 'AWAITING_APPLY') throw new AppError(409, 'GENERATION_NOT_APPLICABLE', 'This generation has no conflicting candidate to apply.');
    const access = await this.repository.getProjectAccess(record.projectId, userId);
    if (!access) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    this.requireWriteAccess(access.role);
    const applied = await this.repository.applyCandidate(generationId, userId, revision);
    if (!applied) throw new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', { currentRevision: access.project.revision });
    return { outputVersionId: applied.versionId, projectRevision: applied.revision };
  }

  private requireWriteAccess(role: WorkspaceRole) {
    if (role === 'viewer') throw new AppError(403, 'FORBIDDEN', 'Viewer access is read-only.');
  }

  private async requireCapacity(userId: string) {
    const active = await this.repository.countActiveForUser(userId);
    if (active >= this.defaults.maxActivePerUser) {
      throw new AppError(429, 'GENERATION_LIMIT_EXCEEDED', 'Too many active generation jobs.', {
        limit: this.defaults.maxActivePerUser,
      });
    }
  }

  private async requireAssets(workspaceId: string, assetIds: string[]) {
    if (!assetIds.length) return;
    const uniqueIds = [...new Set(assetIds)];
    const summary = await this.repository.summarizeReadyAssets(workspaceId, uniqueIds);
    if (summary.count !== uniqueIds.length) throw new AppError(422, 'ASSET_NOT_READY', 'One or more assets are missing or not ready.');
    if (summary.totalBytes > MAX_GENERATION_ASSET_BYTES) {
      throw new AppError(422, 'ASSET_BUDGET_EXCEEDED', 'Selected assets exceed the generation workspace budget.', {
        maxBytes: MAX_GENERATION_ASSET_BYTES,
        selectedBytes: summary.totalBytes,
      });
    }
  }
}

export function toGenerationResource(record: GenerationRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    threadId: record.threadId,
    intent: record.intent,
    status: record.status,
    stage: record.stage,
    progress: record.progress,
    baseVersionId: record.baseVersionId,
    baseRevision: record.baseRevision,
    outputVersionId: record.outputVersionId,
    provider: record.provider,
    model: record.model,
    attempt: record.attemptCount,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    error: record.errorCode && record.errorMessage ? {
      code: record.errorCode,
      message: record.errorMessage,
      ...(record.errorDetails ? { details: record.errorDetails } : {}),
    } : null,
  };
}
