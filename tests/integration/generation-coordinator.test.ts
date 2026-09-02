import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerationCoordinator } from '../../apps/generation-worker/src/coordinator.js';
import type { GenerationJobContext, WorkerGenerationStore } from '../../apps/generation-worker/src/repository.js';
import { FakeModelProvider } from '../../packages/ai-providers/src/fake-provider.js';
import { assertGenerationTransition, type GenerationStatus } from '../../packages/contracts/src/generations.js';
import { STARTER_SOURCE_FILES } from '../../packages/motionly-runtime/src/starter.js';
import type { SandboxRunner } from '../../packages/sandbox/src/types.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function context(): GenerationJobContext {
  return {
    job: {
      id: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      projectId: '00000000-0000-4000-8000-000000000003',
      threadId: '00000000-0000-4000-8000-000000000004',
      createdBy: '00000000-0000-4000-8000-000000000005',
      intent: 'EDIT', status: 'QUEUED', stage: 'QUEUED', progress: 0,
      baseVersionId: '00000000-0000-4000-8000-000000000006', baseRevision: 1,
      outputVersionId: null, retriedFromId: null, provider: 'gemini', model: 'fake-model',
      skillBundleVersion: '1.0.0', runtimeVersion: '2.0.0', idempotencyKey: 'test',
      attemptCount: 0, maxAttempts: 3, cancelRequestedAt: null, startedAt: null, finishedAt: null,
      errorCode: null, errorMessage: null, errorDetails: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
    messages: [{
      id: '00000000-0000-4000-8000-000000000007',
      threadId: '00000000-0000-4000-8000-000000000004',
      generationId: '00000000-0000-4000-8000-000000000001',
      role: 'user', content: 'Change the title', assetRefs: [], createdAt: new Date(),
    }],
    files: { ...STARTER_SOURCE_FILES },
    assets: [],
  };
}

function fakeStore(jobContext = context()) {
  let attempt = 0;
  let currentStatus: GenerationStatus = jobContext.job.status;
  const transitions: Array<{ status: string; stage: string; progress: number }> = [];
  const store: WorkerGenerationStore = {
    getContext: vi.fn().mockResolvedValue(jobContext),
    transition: vi.fn(async (input) => {
      assertGenerationTransition(currentStatus, input.status);
      currentStatus = input.status;
      transitions.push(input);
    }),
    startAttempt: vi.fn(async () => ({ id: `00000000-0000-4000-8000-00000000001${++attempt}`, attemptNumber: attempt })),
    completeAttempt: vi.fn().mockResolvedValue(undefined),
    recordToolCall: vi.fn().mockResolvedValue(undefined),
    saveOutput: vi.fn().mockResolvedValue('00000000-0000-4000-8000-000000000020'),
    publish: vi.fn().mockResolvedValue({ status: 'COMPLETED', versionId: '00000000-0000-4000-8000-000000000021', revision: 2 }),
    fail: vi.fn().mockResolvedValue(undefined),
    isCancellationRequested: vi.fn().mockResolvedValue(false),
  };
  return { store, transitions };
}

const sandbox: SandboxRunner = {
  run: vi.fn(async (request) => ({
    operation: request.operation,
    stdout: JSON.stringify({
      ok: true,
      runtimeVersion: '2.0.0',
      runtime: { registeredIds: ['title'], stateChanged: true },
      frames: [],
      ...(request.operation === 'export' ? {
        video: { file: 'preview.mp4', frameHashes: ['hash'], metadata: { codec: 'h264', width: 1920, height: 1080, frameCount: 300, duration: 5 } },
      } : {}),
    }),
    stderr: '',
    durationMs: 10,
  })),
};

describe('GenerationCoordinator', () => {
  it('edits, validates, visually reviews, and publishes an immutable candidate', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-'));
    temporaryDirectories.push(workspaceRoot);
    const provider = new FakeModelProvider([
      [
        { type: 'tool_call', id: 'edit-1', name: 'apply_project_patch', arguments: {
          path: 'composition.html', edits: [{ search: 'Make your product move.', replace: 'Ship your product story.' }],
        } },
        { type: 'usage', inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        { type: 'completed', finishReason: 'TOOL_CALL' },
      ],
      [
        { type: 'tool_call', id: 'submit-1', name: 'submit_candidate', arguments: {} },
        { type: 'completed', finishReason: 'TOOL_CALL' },
      ],
      [
        { type: 'text', text: 'The representative frames are publication quality.' },
        { type: 'usage', inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        { type: 'completed', finishReason: 'STOP' },
      ],
    ]);
    const { store, transitions } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(context().job.id, new AbortController().signal);

    expect(store.saveOutput).toHaveBeenCalledWith(
      context().job.id,
      expect.objectContaining({ 'composition.html': expect.stringContaining('Ship your product story.') }),
      expect.any(Object),
    );
    expect(store.publish).toHaveBeenCalledWith(context().job.id, context().job.createdBy);
    expect(store.recordToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'apply_project_patch',
      status: 'SUCCEEDED',
      inputSummary: expect.objectContaining({ path: 'composition.html', editCount: 1 }),
    }));
    expect(JSON.stringify(vi.mocked(store.recordToolCall).mock.calls)).not.toContain('Ship your product story.');
    expect(transitions.map((transition) => transition.status)).toEqual(expect.arrayContaining([
      'PREPARING', 'GENERATING', 'VALIDATING', 'RENDERING', 'REVIEWING', 'PUBLISHING',
    ]));
    expect(sandbox.run).toHaveBeenCalledWith(expect.objectContaining({ operation: 'export' }));
    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it('honors cancellation before creating a workspace', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-cancel-'));
    temporaryDirectories.push(workspaceRoot);
    const { store, transitions } = fakeStore();
    vi.mocked(store.isCancellationRequested).mockResolvedValue(true);
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(context().job.id, new AbortController().signal);

    expect(transitions.map((transition) => transition.status)).toContain('CANCELLED');
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('resumes an interrupted publication without spending another model attempt', async () => {
    const jobContext = context();
    jobContext.job.status = 'PUBLISHING';
    jobContext.job.stage = 'PUBLISHING_REVISION';
    jobContext.job.progress = 90;
    const { store } = fakeStore(jobContext);
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-publish-'));
    temporaryDirectories.push(workspaceRoot);
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(jobContext.job.id, new AbortController().signal);

    expect(store.publish).toHaveBeenCalledWith(jobContext.job.id, jobContext.job.createdBy);
    expect(store.startAttempt).not.toHaveBeenCalled();
  });

  it('fails an active job that has no model attempt budget left', async () => {
    const jobContext = context();
    jobContext.job.attemptCount = jobContext.job.maxAttempts;
    const { store } = fakeStore(jobContext);
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-budget-'));
    temporaryDirectories.push(workspaceRoot);
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(jobContext.job.id, new AbortController().signal)).rejects.toMatchObject({ code: 'ATTEMPT_BUDGET_EXHAUSTED' });
    expect(store.fail).toHaveBeenCalledWith(jobContext.job.id, 'ATTEMPT_BUDGET_EXHAUSTED', expect.any(String), undefined);
  });

  it('fails closed when a queued runtime pin is unavailable', async () => {
    const jobContext = context();
    jobContext.job.runtimeVersion = '9.0.0';
    const { store } = fakeStore(jobContext);
    const localSandbox: SandboxRunner = { run: vi.fn() };
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-runtime-pin-'));
    temporaryDirectories.push(workspaceRoot);
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), localSandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(jobContext.job.id, new AbortController().signal)).rejects.toMatchObject({ code: 'RUNTIME_VERSION_UNAVAILABLE' });
    expect(store.fail).toHaveBeenCalledWith(jobContext.job.id, 'RUNTIME_VERSION_UNAVAILABLE', expect.any(String), expect.any(Object));
    expect(localSandbox.run).not.toHaveBeenCalled();
  });

  it('rejects an oversized asset set before staging or model execution', async () => {
    const jobContext = context();
    jobContext.assets = [{
      id: '00000000-0000-4000-8000-000000000030',
      fileName: 'large.mp4',
      contentType: 'video/mp4',
      byteSize: 500_000_001,
      checksum: 'a'.repeat(64),
      objectKey: 'workspace/assets/large',
    }];
    const { store } = fakeStore(jobContext);
    const localSandbox: SandboxRunner = { run: vi.fn() };
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-asset-budget-'));
    temporaryDirectories.push(workspaceRoot);
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), localSandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(jobContext.job.id, new AbortController().signal)).rejects.toMatchObject({ code: 'ASSET_BUDGET_EXCEEDED' });

    expect(store.fail).toHaveBeenCalledWith(jobContext.job.id, 'ASSET_BUDGET_EXCEEDED', expect.any(String), expect.objectContaining({ selectedBytes: 500_000_001 }));
    expect(localSandbox.run).not.toHaveBeenCalled();
  });

  it('does not report worker interruption as user cancellation', async () => {
    const { store, transitions } = fakeStore();
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-interrupt-'));
    temporaryDirectories.push(workspaceRoot);
    const interruption = new AbortController();
    interruption.abort(new Error('Worker stopping.'));
    const coordinator = new GenerationCoordinator(store, new FakeModelProvider([]), sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(context().job.id, interruption.signal)).rejects.toThrow('Worker stopping.');
    expect(transitions.map((transition) => transition.status)).not.toContain('CANCELLED');
    expect(store.fail).not.toHaveBeenCalled();
  });

  it('audits invalid tool calls without persisting model-controlled names or paths', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-audit-'));
    temporaryDirectories.push(workspaceRoot);
    const provider = new FakeModelProvider([[
      { type: 'tool_call', id: 'bad-1', name: 'read_project_file SECRET', arguments: { path: 'C:\\secret.txt' } },
      { type: 'completed', finishReason: 'TOOL_CALL' },
    ]]);
    const { store } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(context().job.id, new AbortController().signal)).rejects.toThrow('Unknown generation tool');

    expect(store.recordToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'UNKNOWN_TOOL',
      status: 'FAILED',
      inputSummary: { tool: 'UNKNOWN_TOOL', path: 'INVALID_PATH' },
    }));
    expect(JSON.stringify(vi.mocked(store.recordToolCall).mock.calls)).not.toContain('secret');
  });

  it('blocks publication when the renderer does not prove preview export parity', async () => {
    const jobContext = context();
    jobContext.job.maxAttempts = 1;
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-export-'));
    temporaryDirectories.push(workspaceRoot);
    const provider = new FakeModelProvider([
      [{ type: 'tool_call', id: 'submit-1', name: 'submit_candidate', arguments: {} }, { type: 'completed', finishReason: 'TOOL_CALL' }],
    ]);
    const incompleteExport: SandboxRunner = {
      run: vi.fn(async (request) => ({
        operation: request.operation,
        stdout: JSON.stringify({ ok: true, runtimeVersion: '2.0.0', runtime: { registeredIds: ['title'], stateChanged: true }, frames: [], video: null }),
        stderr: '', durationMs: 10,
      })),
    };
    const { store } = fakeStore(jobContext);
    const coordinator = new GenerationCoordinator(store, provider, incompleteExport, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await expect(coordinator.run(jobContext.job.id, new AbortController().signal)).rejects.toMatchObject({ code: 'EXPORT_FAILED' });
    expect(store.completeAttempt).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ finishReason: 'EXPORT_FAILED' }));
    expect(store.publish).not.toHaveBeenCalled();
  });

  it('repairs a browser frame-capture failure before publication', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-capture-repair-'));
    temporaryDirectories.push(workspaceRoot);
    const provider = new FakeModelProvider([
      [{ type: 'tool_call', id: 'submit-1', name: 'submit_candidate', arguments: {} }, { type: 'completed', finishReason: 'TOOL_CALL' }],
      [{ type: 'tool_call', id: 'submit-2', name: 'submit_candidate', arguments: {} }, { type: 'completed', finishReason: 'TOOL_CALL' }],
      [{ type: 'text', text: 'Approved.' }, { type: 'completed', finishReason: 'STOP' }],
    ]);
    let captureCalls = 0;
    const repairableSandbox: SandboxRunner = {
      run: vi.fn(async (request) => {
        if (request.operation === 'capture' && ++captureCalls === 1) throw new Error('Chromium capture failed.');
        return sandbox.run(request);
      }),
    };
    const { store, transitions } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, repairableSandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(context().job.id, new AbortController().signal);

    expect(store.completeAttempt).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ finishReason: 'CAPTURE_FAILED' }));
    expect(transitions).toContainEqual(expect.objectContaining({ status: 'REPAIRING', stage: 'REPAIRING_CAPTURE' }));
    expect(store.publish).toHaveBeenCalled();
    expect(captureCalls).toBe(2);
  });

  it('repairs a source candidate that was not submitted', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-source-repair-'));
    temporaryDirectories.push(workspaceRoot);
    const provider = new FakeModelProvider([
      [{ type: 'text', text: 'I need another pass.' }, { type: 'completed', finishReason: 'STOP' }],
      [{ type: 'tool_call', id: 'submit-2', name: 'submit_candidate', arguments: {} }, { type: 'completed', finishReason: 'TOOL_CALL' }],
      [{ type: 'text', text: 'Approved.' }, { type: 'completed', finishReason: 'STOP' }],
    ]);
    const { store, transitions } = fakeStore();
    const coordinator = new GenerationCoordinator(store, provider, sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(context().job.id, new AbortController().signal);

    expect(transitions).toContainEqual(expect.objectContaining({ status: 'REPAIRING', stage: 'REPAIRING_SOURCE' }));
    expect(store.publish).toHaveBeenCalled();
  });

  it('bounds long-lived thread history while preserving the newest request', async () => {
    const jobContext = context();
    jobContext.messages = Array.from({ length: 10 }, (_, index) => ({
      ...jobContext.messages[0]!,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      generationId: index === 9 ? jobContext.job.id : `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      content: `${index === 9 ? 'NEWEST_REQUEST' : `history-${index}`} ${'x'.repeat(19_980)}`,
      createdAt: new Date(index),
    }));
    const provider = new FakeModelProvider([
      [{ type: 'tool_call', id: 'submit-1', name: 'submit_candidate', arguments: {} }, { type: 'completed', finishReason: 'TOOL_CALL' }],
      [{ type: 'text', text: 'Approved.' }, { type: 'completed', finishReason: 'STOP' }],
    ]);
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-history-'));
    temporaryDirectories.push(workspaceRoot);
    const { store } = fakeStore(jobContext);
    const coordinator = new GenerationCoordinator(store, provider, sandbox, {
      workspaceRoot, modelTimeoutMs: 30_000, sandboxTimeoutMs: 30_000,
    });

    await coordinator.run(jobContext.job.id, new AbortController().signal);

    const sentText = provider.inputs[0]!.messages.flatMap((message) => message.content)
      .filter((item): item is Extract<(typeof provider.inputs)[number]['messages'][number]['content'][number], { type: 'text' }> => item.type === 'text')
      .map((item) => item.text).join('\n');
    expect(sentText).toContain('NEWEST_REQUEST');
    expect(sentText).not.toContain('history-0');
    expect(sentText.length).toBeLessThan(61_000);
  });
});
