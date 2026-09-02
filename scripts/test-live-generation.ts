import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GenerationCoordinator } from '../apps/generation-worker/src/coordinator.js';
import type { GenerationJobContext, WorkerGenerationStore } from '../apps/generation-worker/src/repository.js';
import { STARTER_SOURCE_FILES } from '../packages/motionly-runtime/src/starter.js';
import { LocalProcessSandboxRunner } from '../packages/sandbox/src/local-runner.js';
import { OpenAICompatibleProvider } from '../packages/ai-providers/src/openai-compatible.js';
import { FakeModelProvider } from '../packages/ai-providers/src/fake-provider.js';

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
      outputVersionId: null, retriedFromId: null, provider: 'openai-compatible', model: 'claude-opus-4-8',
      skillBundleVersion: '1.0.0', runtimeVersion: '2.0.0', idempotencyKey: 'test',
      attemptCount: 0, maxAttempts: 1, cancelRequestedAt: null, startedAt: null, finishedAt: null,
      errorCode: null, errorMessage: null, errorDetails: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
    messages: [{
      id: '00000000-0000-4000-8000-000000000007',
      threadId: '00000000-0000-4000-8000-000000000004',
      generationId: '00000000-0000-4000-8000-000000000001',
      role: 'user', content: process.argv[2] || 'Add the text "Hello" with a simple fade-in animation.', assetRefs: [], createdAt: new Date(),
    }],
    files: { ...STARTER_SOURCE_FILES },
    assets: [],
  };
}

function fakeStore(jobContext = context()) {
  let attempt = 0;
  const store: WorkerGenerationStore = {
    getContext: async () => jobContext,
    transition: async (input) => { console.log(`[Status] ${input.status}: ${input.message || input.stage}`); },
    startAttempt: async () => ({ id: `00000000-0000-4000-8000-00000000001${++attempt}`, attemptNumber: attempt }),
    completeAttempt: async () => {},
    recordToolCall: async (call) => {
      console.log(`[Tool] ${call.toolName} ${call.status}`);
      if (call.inputSummary) console.log(`   Input:`, JSON.stringify(call.inputSummary));
    },
    saveOutput: async (genId, files) => { 
      console.log('\n--- OUTPUT FILES ---');
      for (const [name, content] of Object.entries(files)) {
        if (name === 'composition.html' || name === 'timeline.js' || name === 'styles.css') {
          console.log(`\n=== ${name} ===\n${content}`);
        }
      }
      return 'output-id';
    },
    publish: async () => ({ status: 'COMPLETED', versionId: 'ver-id', revision: 2 }),
    fail: async (id, code, msg) => { console.error(`[Failed] ${code}: ${msg}`); },
    isCancellationRequested: async () => false,
  };
  return store;
}

async function main() {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'motionly-coordinator-live-'));
  const store = fakeStore();
  const provider = new OpenAICompatibleProvider('https://anajak.sbs/v1', 'sk-qkIeXHo93zI6KgOkcyIlRy9EmT-e4jP2k6dxVic64qk');
  const sandbox = {
    run: async (request: any) => ({
      operation: request.operation,
      stdout: JSON.stringify({
        ok: true,
        runtimeVersion: '2.0.0',
        runtime: { registeredIds: ['stage'], stateChanged: true },
        frames: [],
        video: { file: 'preview.mp4', frameHashes: ['hash'], metadata: { codec: 'h264', width: 1920, height: 1080, frameCount: 300, duration: 5 } },
      }),
      stderr: '',
      durationMs: 10,
    })
  };
  
  const coordinator = new GenerationCoordinator(store, provider, sandbox, {
    workspaceRoot,
    modelTimeoutMs: 180_000,
    sandboxTimeoutMs: 180_000,
  });

  console.log('Starting live generation test...');
  const start = performance.now();
  
  try {
    await coordinator.run(context().job.id, new AbortController().signal);
    const end = performance.now();
    console.log(`\nGeneration finished successfully in ${Math.round(end - start)}ms.`);
  } catch (err) {
    console.error('Generation failed:', err);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch(console.error);
