import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { GeminiModelProvider } from '../../../packages/ai-providers/src/gemini.js';
import { OpenAICompatibleProvider } from '../../../packages/ai-providers/src/openai-compatible.js';
import { RoutingProvider } from '../../../packages/ai-providers/src/routing-provider.js';
import { createDatabase } from '../../../packages/database/src/client.js';
import { PostgresJobQueue } from '../../../packages/job-queue/src/postgres-queue.js';
import { parseEnvironment } from '../../api/src/config/env.js';
import { createLogger } from '../../api/src/config/logger.js';
import { GenerationCoordinator } from './coordinator.js';
import { DatabaseWorkerGenerationStore } from './repository.js';

export interface GenerationWorkerOptions {
  signal?: AbortSignal;
}

export async function startGenerationWorker(options: GenerationWorkerOptions = {}) {
  const environment = parseEnvironment(process.env);
  if (environment.aiProvider === 'gemini' && !environment.geminiApiKey) throw new Error('GEMINI_API_KEY is required by the generation worker.');
  if (environment.aiProvider === 'openai-compatible' && !environment.openAiCompatibleApiKey) throw new Error('OPENAI_COMPATIBLE_API_KEY is required by the generation worker.');
  const logger = createLogger({ nodeEnv: environment.nodeEnv, ...(environment.logLevel ? { logLevel: environment.logLevel } : {}) });
  const { db, pool } = createDatabase(environment.databaseUrl);
  const queue = new PostgresJobQueue(db);
  const store = new DatabaseWorkerGenerationStore(db);
  
    let primaryProvider: any;
    if (environment.aiProvider === 'gemini' && environment.geminiApiKey) {
      primaryProvider = new GeminiModelProvider({
        apiKey: environment.geminiApiKey,
        maxTransientRetries: 1,
      });
    } else if (environment.aiProvider === 'openai-compatible' && environment.openAiCompatibleApiKey) {
      primaryProvider = new OpenAICompatibleProvider(
        environment.openAiCompatibleBaseUrl || 'https://api.tokenrouter.com/v1',
        environment.openAiCompatibleApiKey,
      );
    } else {
      throw new Error(`AI provider is not configured: ${environment.aiProvider}`);
    }
    
    let secondaryProvider: any;
    if (environment.aiProvider === 'gemini' && environment.openAiCompatibleApiKey) {
      secondaryProvider = new OpenAICompatibleProvider(
        environment.openAiCompatibleBaseUrl || 'https://api.tokenrouter.com/v1',
        environment.openAiCompatibleApiKey
      );
    }
    
    const provider = new RoutingProvider(primaryProvider, secondaryProvider);
  
  const workspaceRoot = path.resolve(environment.generationWorkspaceRoot);
  
  const coordinator = new GenerationCoordinator(store, provider, {
    workspaceRoot,
    modelTimeoutMs: environment.generationJobTimeoutSeconds * 1_000,
  });
  const workerId = `generation-${randomUUID()}`;
  const localShutdown = new AbortController();
  const shutdownSignal = options.signal ?? localShutdown.signal;
  const stopWorker = () => localShutdown.abort(new Error('Worker stopping.'));
  if (!options.signal) {
    process.once('SIGINT', stopWorker);
    process.once('SIGTERM', stopWorker);
  }
  logger.info({ workerId }, 'Motionly generation worker started');

  try {
    while (!shutdownSignal.aborted) {
      const recovered = await queue.recoverExpired();
      for (const deadTask of recovered.deadTasks) {
        if (deadTask.type === 'GENERATION') {
          await store.fail(deadTask.resourceId, 'WORKER_LEASE_EXHAUSTED', 'Generation stopped after repeated worker lease loss.');
        }
      }
      const task = await queue.claim(workerId, environment.generationLeaseMs);
      if (!task) {
        await wait(environment.generationWorkerPollMs, shutdownSignal);
        continue;
      }
      if (task.type !== 'GENERATION') {
        await queue.fail(task.id, workerId, 'UNSUPPORTED_TASK_TYPE', null);
        continue;
      }
      const leaseLost = new AbortController();
      const jobSignal = AbortSignal.any([
        shutdownSignal,
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
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'GENERATION_FAILED';
        const interrupted = shutdownSignal.aborted || leaseLost.signal.aborted;
        const queueStatus = await queue.fail(task.id, workerId, code, interrupted ? undefined : null);
        if (queueStatus === 'DEAD' && interrupted) {
          await store.fail(task.resourceId, 'WORKER_LEASE_EXHAUSTED', 'Generation stopped after repeated worker interruption.');
        }
        logger.error({ workerId, generationId: task.resourceId, code, errorName: errorName(error) }, 'Generation task failed');
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    if (!options.signal) {
      process.off('SIGINT', stopWorker);
      process.off('SIGTERM', stopWorker);
    }
    await pool.end();
    logger.info({ workerId }, 'Motionly generation worker stopped');
  }
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
