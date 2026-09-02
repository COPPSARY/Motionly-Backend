import { describe, expect, it, vi } from 'vitest';

import { GenerationCoordinator } from '../../apps/generation-worker/src/coordinator.js';
import type { GenerationJobContext, WorkerGenerationStore } from '../../apps/generation-worker/src/repository.js';
import { hashSourceFiles } from '../../apps/api/src/services/project.service.js';
import { FakeModelProvider } from '../../packages/ai-providers/src/fake-provider.js';
import { assertGenerationTransition, type GenerationStatus } from '../../packages/contracts/src/generations.js';
import { STARTER_SOURCE_FILES } from '../../packages/motionly-runtime/src/starter.js';

const generationId = '00000000-0000-4000-8000-000000000001';

function context(): GenerationJobContext {
  return {
    job: {
      id: generationId,
      workspaceId: '00000000-0000-4000-8000-000000000002',
      projectId: '00000000-0000-4000-8000-000000000003',
      threadId: '00000000-0000-4000-8000-000000000004',
      createdBy: '00000000-0000-4000-8000-000000000005',
      intent: 'EDIT',
      status: 'QUEUED',
      stage: 'QUEUED',
      progress: 0,
      baseSourceHash: hashSourceFiles(STARTER_SOURCE_FILES),
      baseRevision: 1,
      outputSourceHash: null,
      provider: 'gemini',
      model: 'fake-model',
      skillBundleVersion: '1.0.0',
      runtimeVersion: '2.0.0',
      idempotencyKey: 'test',
      cancelRequestedAt: null,
      startedAt: null,
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    prompt: 'Change the text to yellow',
    files: { ...STARTER_SOURCE_FILES },
  };
}

function response(changes: Array<{ path: string; content: string }>) {
  return {
    text: '',
    toolCalls: [{ id: 'change-1', name: 'return_changed_files', arguments: { changes } }],
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    finishReason: 'tool_calls',
  };
}

function fakeStore(jobContext = context()) {
  let status: GenerationStatus = jobContext.job.status;
  const transitions: Array<{ status: GenerationStatus; stage: string; progress: number }> = [];
  const store: WorkerGenerationStore = {
    getContext: vi.fn().mockResolvedValue(jobContext),
    transition: vi.fn(async (input) => {
      assertGenerationTransition(status, input.status);
      status = input.status;
      transitions.push(input);
    }),
    saveRevision: vi.fn().mockResolvedValue({ sourceHash: 'b'.repeat(64), revision: 2 }),
    fail: vi.fn().mockResolvedValue(undefined),
    isCancellationRequested: vi.fn().mockResolvedValue(false),
  };
  return { store, transitions };
}

describe('GenerationCoordinator', () => {
  it('makes one model request, checks the bundle, and saves a revision', async () => {
    const files = { ...STARTER_SOURCE_FILES, 'styles.css': `${STARTER_SOURCE_FILES['styles.css']}\n.motionly-stage { color: yellow; }\n` };
    const provider = new FakeModelProvider(response([{ path: 'styles.css', content: files['styles.css'] }]));
    const createContext = { ...context(), job: { ...context().job, intent: 'CREATE' as const } };
    const { store, transitions } = fakeStore(createContext);
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000, maxRepairAttempts: 0 });

    await coordinator.run(generationId, new AbortController().signal);

    expect(provider.inputs).toHaveLength(1);
    expect(provider.inputs[0]!.prompt).toContain('--- composition.html ---');
    expect(provider.inputs[0]!.systemInstructions).toContain('vendored Motionly promo reference');
    expect(provider.inputs[0]!.systemInstructions).toContain('Reference: motionly-promo/composition.html');
    expect(provider.inputs[0]!.tools).toHaveLength(1);
    expect(store.saveRevision).toHaveBeenCalledWith(generationId, files);
    expect(transitions.map((transition) => transition.status)).toEqual([
      'PREPARING',
      'GENERATING',
      'VALIDATING',
      'PUBLISHING',
    ]);
  });

  it('fails if the model returns no changed source', async () => {
    const provider = new FakeModelProvider(response([{ path: 'styles.css', content: STARTER_SOURCE_FILES['styles.css'] }]));
    const { store } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000, maxRepairAttempts: 0 });

    await expect(coordinator.run(generationId, new AbortController().signal)).rejects.toMatchObject({ code: 'NO_SOURCE_CHANGES' });
    expect(provider.inputs).toHaveLength(1);
    expect(store.saveRevision).not.toHaveBeenCalled();
  });

  it('rejects a create result that removes the visual system', async () => {
    const jobContext = { ...context(), job: { ...context().job, intent: 'CREATE' as const } };
    const provider = new FakeModelProvider(response([{ path: 'styles.css', content: '' }]));
    const { store } = fakeStore(jobContext);
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000, maxRepairAttempts: 0 });

    await expect(coordinator.run(generationId, new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCE_QUALITY_INVALID' });
    expect(store.saveRevision).not.toHaveBeenCalled();
  });

  it('fails if the model edits outside the allowed source files', async () => {
    const provider = new FakeModelProvider(response([{ path: 'package.json', content: '{}' }]));
    const { store } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000 });

    await expect(coordinator.run(generationId, new AbortController().signal)).rejects.toMatchObject({ code: 'FILE_NOT_ALLOWED' });
    expect(store.saveRevision).not.toHaveBeenCalled();
  });

  it('returns the actual compile error without retrying', async () => {
    const provider = new FakeModelProvider(response([{ path: 'index.ts', content: 'export default {' }]));
    const { store } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000, maxRepairAttempts: 0 });

    await expect(coordinator.run(generationId, new AbortController().signal)).rejects.toThrow('Expected identifier');
    expect(provider.inputs).toHaveLength(1);
    expect(store.saveRevision).not.toHaveBeenCalled();
  });

  it('asks the model to repair a rejected create result', async () => {
    const jobContext = { ...context(), job: { ...context().job, intent: 'CREATE' as const } };
    const validFiles = { ...STARTER_SOURCE_FILES, 'styles.css': `${STARTER_SOURCE_FILES['styles.css']}\n.repaired { color: yellow; }\n` };
    let calls = 0;
    const provider = new FakeModelProvider(() => {
      calls += 1;
      return calls === 1
        ? response([{ path: 'styles.css', content: '' }])
        : response([{ path: 'styles.css', content: validFiles['styles.css'] }]);
    });
    const { store } = fakeStore(jobContext);
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000 });

    await coordinator.run(generationId, new AbortController().signal);

    expect(provider.inputs).toHaveLength(2);
    expect(provider.inputs[1]!.prompt).toContain('SOURCE_QUALITY_INVALID');
    expect(store.saveRevision).toHaveBeenCalledWith(generationId, validFiles);
  });

  it('honors cancellation before calling the model', async () => {
    const provider = new FakeModelProvider(response([]));
    const { store, transitions } = fakeStore();
    vi.mocked(store.isCancellationRequested).mockResolvedValue(true);
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000 });

    await expect(coordinator.run(generationId, new AbortController().signal)).rejects.toMatchObject({ code: 'GENERATION_CANCELLED' });
    expect(provider.inputs).toHaveLength(0);
    expect(transitions.map((transition) => transition.status)).toEqual(['CANCELLED']);
  });

  it('allows generated source containing remote access', async () => {
    const files = { ...STARTER_SOURCE_FILES, 'timeline.js': `${STARTER_SOURCE_FILES['timeline.js']}\nfetch('https://example.com');\n` };
    const provider = new FakeModelProvider(response([{ path: 'timeline.js', content: files['timeline.js'] }]));
    const { store } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, { modelTimeoutMs: 30_000 });

    await coordinator.run(generationId, new AbortController().signal);

    expect(store.saveRevision).toHaveBeenCalledWith(generationId, files);
  });
});
