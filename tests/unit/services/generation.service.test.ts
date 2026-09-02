import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../../apps/api/src/errors.js';
import { GenerationService, type GenerationRecord } from '../../../apps/api/src/services/generation.service.js';

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  workspace: '00000000-0000-4000-8000-000000000002',
  project: '00000000-0000-4000-8000-000000000003',
  sourceHash: 'a'.repeat(64),
  thread: '00000000-0000-4000-8000-000000000005',
  generation: '00000000-0000-4000-8000-000000000006',
};

function record(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    id: ids.generation,
    workspaceId: ids.workspace,
    projectId: ids.project,
    threadId: ids.thread,
    createdBy: ids.user,
    intent: 'EDIT',
    status: 'QUEUED',
    stage: 'QUEUED',
    progress: 0,
    baseSourceHash: ids.sourceHash,
    baseRevision: 2,
    outputSourceHash: null,
    provider: 'gemini',
    model: 'gemini-test',
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function repository() {
  return {
    getWorkspaceMembership: vi.fn().mockResolvedValue({ role: 'owner' as const }),
    getProjectAccess: vi.fn().mockResolvedValue({
      project: { id: ids.project, workspaceId: ids.workspace, sourceHash: ids.sourceHash, revision: 2 },
      role: 'editor' as const,
    }),
    findByIdempotency: vi.fn().mockResolvedValue(null),
    createProjectGeneration: vi.fn().mockResolvedValue(record({ intent: 'CREATE', baseRevision: 1 })),
    createEditGeneration: vi.fn().mockResolvedValue(record()),
    list: vi.fn().mockResolvedValue({ data: [record()], totalItems: 1 }),
    getForUser: vi.fn().mockResolvedValue(record()),
    requestCancellation: vi.fn().mockResolvedValue(record({ status: 'CANCELLING' })),
    listEvents: vi.fn().mockResolvedValue([]),
    countActiveForUser: vi.fn().mockResolvedValue(0),
    summarizeReadyAssets: vi.fn().mockImplementation(async (_workspaceId: string, assetIds: string[]) => ({
      count: new Set(assetIds).size,
      totalBytes: assetIds.length * 1_000,
    })),
  };
}

function service(repo = repository()) {
  return { service: new GenerationService(repo, { provider: 'gemini', model: 'gemini-test' }), repo };
}

describe('GenerationService', () => {
  it('creates a new project generation from the backend-owned starter', async () => {
    const { service: generations, repo } = service();
    const result = await generations.create(ids.user, ids.workspace, {
      prompt: 'Create a product launch film',
      project: { name: 'Launch', width: 1920, height: 1080, fps: 60, duration: 20 },
      presetId: 'motionly-product-promo',
      assetIds: [],
    }, 'create-key');

    expect(result).toMatchObject({ intent: 'CREATE', provider: 'gemini', status: 'QUEUED' });
    expect(repo.createProjectGeneration).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'create-key',
      starterFiles: expect.objectContaining({
        'composition.html': expect.stringContaining('motionly-template'),
        'timeline.js': expect.stringContaining('register'),
        'index.ts': expect.stringContaining('defineComposition'),
      }),
    }));
    expect(repo.createProjectGeneration.mock.calls[0]?.[0].starterFiles['index.ts']).toContain('duration: 20');
  });

  it('returns an existing job for an idempotent retry', async () => {
    const repo = repository();
    repo.findByIdempotency.mockResolvedValue(record());
    const { service: generations } = service(repo);

    const result = await generations.edit(ids.user, ids.project, {
      prompt: 'Change the title', baseSourceHash: ids.sourceHash, baseRevision: 2, assetIds: [],
    }, 'same-key');

    expect(result.id).toBe(ids.generation);
    expect(repo.getProjectAccess).not.toHaveBeenCalled();
    expect(repo.createEditGeneration).not.toHaveBeenCalled();
  });

  it('rejects stale edits before enqueueing', async () => {
    const repo = repository();
    repo.getProjectAccess.mockResolvedValue({
      project: { id: ids.project, workspaceId: ids.workspace, sourceHash: ids.sourceHash, revision: 5 },
      role: 'editor',
    });
    const { service: generations } = service(repo);

    await expect(generations.edit(ids.user, ids.project, {
      prompt: 'Change the title', baseSourceHash: ids.sourceHash, baseRevision: 2, assetIds: [],
    }, 'stale-key')).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 } satisfies Partial<AppError>);
    expect(repo.createEditGeneration).not.toHaveBeenCalled();
  });

  it('keeps viewers read-only', async () => {
    const repo = repository();
    repo.getWorkspaceMembership.mockResolvedValue({ role: 'viewer' });
    const { service: generations } = service(repo);

    await expect(generations.create(ids.user, ids.workspace, {
      prompt: 'Create a film',
      project: { name: 'Launch', width: 1920, height: 1080, fps: 60, duration: 20 },
      presetId: 'motionly-product-promo',
      assetIds: [],
    }, 'viewer-key')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 } satisfies Partial<AppError>);
  });

  it('enforces the active generation limit without enqueueing partial work', async () => {
    const repo = repository();
    repo.countActiveForUser.mockResolvedValue(3);
    const { service: generations } = service(repo);
    await expect(generations.edit(ids.user, ids.project, {
      prompt: 'Change title', baseSourceHash: ids.sourceHash, baseRevision: 2, assetIds: [],
    }, 'capacity-key')).rejects.toMatchObject({ code: 'GENERATION_LIMIT_EXCEEDED', status: 429 });
    expect(repo.createEditGeneration).not.toHaveBeenCalled();
  });

  it('rejects an aggregate asset selection above the workspace budget', async () => {
    const repo = repository();
    repo.summarizeReadyAssets.mockResolvedValue({ count: 1, totalBytes: 500_000_001 });
    const { service: generations } = service(repo);

    await expect(generations.edit(ids.user, ids.project, {
      prompt: 'Use the uploaded video', baseSourceHash: ids.sourceHash, baseRevision: 2,
      assetIds: ['00000000-0000-4000-8000-000000000008'],
    }, 'large-assets')).rejects.toMatchObject({ code: 'ASSET_BUDGET_EXCEEDED', status: 422 });
    expect(repo.createEditGeneration).not.toHaveBeenCalled();
  });

  it('drains a full event page before closing a terminal SSE stream', async () => {
    const repo = repository();
    repo.getForUser.mockResolvedValue(record({ status: 'COMPLETED' }));
    repo.listEvents.mockResolvedValue(Array.from({ length: 500 }, (_, index) => ({
      generationId: ids.generation,
      sequence: index + 1,
      type: 'PROGRESS',
      status: 'VALIDATING' as const,
      stage: 'COMPILE_CHECK',
      progress: 75,
      message: null,
      data: null,
      createdAt: new Date(),
    })));
    const { service: generations } = service(repo);

    await expect(generations.events(ids.user, ids.generation, 0)).resolves.toMatchObject({ isTerminal: false });
  });
});
