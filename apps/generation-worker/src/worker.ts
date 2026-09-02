import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { GeminiModelProvider } from '../../../packages/ai-providers/src/gemini.js';
import { OpenAICompatibleProvider } from '../../../packages/ai-providers/src/openai-compatible.js';
import type { GenerationModelProvider } from '../../../packages/ai-providers/src/types.js';
import { createDatabase } from '../../../packages/database/src/client.js';
import { PostgresJobQueue } from '../../../packages/job-queue/src/postgres-queue.js';
import { parseEnvironment } from '../../api/src/config/env.js';
import { createLogger } from '../../api/src/config/logger.js';
import { GenerationCoordinator } from './coordinator.js';
import { DatabaseWorkerGenerationStore } from './repository.js';

export async function startGenerationWorker() {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({ nodeEnv: environment.nodeEnv, ...(environment.logLevel ? { logLevel: environment.logLevel } : {}) });
  const { db, pool } = createDatabase(environment.databaseUrl);
  const queue = new PostgresJobQueue(db);
  const store = new DatabaseWorkerGenerationStore(db);
  const provider = createProvider(environment);
  const coordinator = new GenerationCoordinator(store, provider, {
    modelTimeoutMs: environment.generationJobTimeoutSeconds * 1_000,
  });
  const workerId = `generation-${randomUUID()}`;
  const shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort(new Error('Worker stopping.')));
  process.once('SIGTERM', () => shutdown.abort(new Error('Worker stopping.')));
  logger.info({ workerId }, 'Motionly generation worker started');

  try {
    while (!shutdown.signal.aborted) {
      const recovered = await queue.recoverExpired();
      for (const deadTask of recovered.deadTasks) {
        if (deadTask.type === 'GENERATION') {
          await store.fail(deadTask.resourceId, 'WORKER_LEASE_EXHAUSTED', 'Generation stopped after the worker lease expired.');
        }
      }
      const task = await queue.claim(workerId, environment.generationLeaseMs);
      if (!task) {
        await wait(environment.generationWorkerPollMs, shutdown.signal);
        continue;
      }
      if (task.type !== 'GENERATION') {
        await queue.fail(task.id, workerId, 'UNSUPPORTED_TASK_TYPE', null);
        continue;
      }
      const leaseLost = new AbortController();
      const jobSignal = AbortSignal.any([
        shutdown.signal,
        leaseLost.signal,
        AbortSignal.timeout(environment.generationJobTimeoutSeconds * 1_000),
      ]);
      const heartbeat = setInterval(() => {
        void queue.heartbeat(task.id, workerId, environment.generationLeaseMs).then((owned) => {
          if (!owned && !leaseLost.signal.aborted) leaseLost.abort(new Error('Generation worker lease was lost.'));
        }).catch((error) => {
          logger.error({ workerId, taskId: task.id, errorName: errorName(error) }, 'Generation lease heartbeat failed');
          if (!leaseLost.signal.aborted) leaseLost.abort(new Error('Generation worker lease heartbeat failed.'));
        });
      }, Math.max(1_000, Math.floor(environment.generationLeaseMs / 3)));
      try {
        await coordinator.run(task.resourceId, jobSignal);
        await queue.complete(task.id, workerId);
      } catch (error) {
        const code = errorCode(error);
        await store.fail(task.resourceId, code, errorMessage(error), errorDetails(error));
        await queue.fail(task.id, workerId, code, null);
        logger.error({ workerId, generationId: task.resourceId, code, errorName: errorName(error) }, 'Generation task failed');
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    await pool.end();
    logger.info({ workerId }, 'Motionly generation worker stopped');
  }
}

function createProvider(environment: ReturnType<typeof parseEnvironment>): GenerationModelProvider {
  if (environment.aiProvider === 'gemini') {
    if (!environment.geminiApiKey) throw new Error('GEMINI_API_KEY is required by the generation worker.');
    return new GeminiModelProvider({ apiKey: environment.geminiApiKey });
  }
  if (environment.aiProvider === 'openai-compatible') {
    if (!environment.openAiCompatibleApiKey) throw new Error('OPENAI_COMPATIBLE_API_KEY is required by the generation worker.');
    return new OpenAICompatibleProvider(
      environment.openAiCompatibleBaseUrl || 'https://api.tokenrouter.com/v1',
      environment.openAiCompatibleApiKey,
    );
  }
  throw new Error(`Unsupported generation AI provider: ${environment.aiProvider}`);
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code).slice(0, 80) : 'GENERATION_FAILED';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Generation failed.';
}

function errorDetails(error: unknown) {
  return error && typeof error === 'object' && 'details' in error && error.details && typeof error.details === 'object'
    ? error.details as Record<string, unknown>
    : undefined;
}

function errorName(error: unknown) {
  return error instanceof Error && /^[a-zA-Z0-9_.-]{1,120}$/.test(error.name) ? error.name : 'Error';
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => finish();
    const timer = setTimeout(finish, milliseconds);
    if (signal.aborted) finish();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

const entryFile = process.argv[1];
if (entryFile && import.meta.url === pathToFileURL(entryFile).href) {
  void startGenerationWorker();
}
