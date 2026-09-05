import type { Response } from 'express';
import { z } from 'zod';

import {
  createGenerationRequestSchema,
  editGenerationRequestSchema,
  generationListQuerySchema,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  type CreateGenerationRequest,
  type EditGenerationRequest,
} from '../../packages/contracts/generations.js';
import { AppError } from '../errors.js';
import type { AuthenticatedRequest } from '../types/http.js';

const idSchema = z.string().uuid();
const SSE_POLL_INTERVAL_MS = 1_000;
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

export interface GenerationControllerService {
  create(userId: string, workspaceId: string, input: CreateGenerationRequest, idempotencyKey: string): Promise<unknown>;
  edit(userId: string, projectId: string, input: EditGenerationRequest, idempotencyKey: string): Promise<unknown>;
  list(userId: string, projectId: string, page: number, pageSize: number): Promise<unknown>;
  get(userId: string, generationId: string): Promise<unknown>;
  cancel(userId: string, generationId: string): Promise<unknown>;
  events(userId: string, generationId: string, afterSequence: number): Promise<{
    events: Array<{ sequence: number; type: string; [key: string]: unknown }>;
    isTerminal: boolean;
  }>;
}

function idempotencyKey(request: AuthenticatedRequest) {
  const value = request.header('idempotency-key')?.trim();
  if (!value || value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
  }
  return value;
}

export class GenerationController {
  constructor(private readonly generations: GenerationControllerService) {}

  create = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    const input = createGenerationRequestSchema.parse(request.body);
    response.status(202).json({
      data: await this.generations.create(request.principal!.user.id, workspaceId, input, idempotencyKey(request)),
    });
  };

  edit = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const input = editGenerationRequestSchema.parse(request.body);
    response.status(202).json({
      data: await this.generations.edit(request.principal!.user.id, projectId, input, idempotencyKey(request)),
    });
  };

  list = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const { page, pageSize } = generationListQuerySchema.parse(request.query);
    response.json(await this.generations.list(request.principal!.user.id, projectId, page, pageSize));
  };

  get = async (request: AuthenticatedRequest, response: Response) => {
    const generationId = idSchema.parse(request.params.generationId);
    response.json({ data: await this.generations.get(request.principal!.user.id, generationId) });
  };

  cancel = async (request: AuthenticatedRequest, response: Response) => {
    const generationId = idSchema.parse(request.params.generationId);
    idempotencyKey(request);
    response.status(202).json({ data: await this.generations.cancel(request.principal!.user.id, generationId) });
  };

  events = async (request: AuthenticatedRequest, response: Response) => {
    const generationId = idSchema.parse(request.params.generationId);
    const rawLastEventId = request.header('last-event-id') ?? '0';
    let afterSequence = z.coerce.number().int().min(0).parse(rawLastEventId);
    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    let closed = false;
    let lastHeartbeatAt = Date.now();
    request.once('close', () => { closed = true; });
    while (!closed) {
      const batch = await this.generations.events(request.principal!.user.id, generationId, afterSequence);
      for (const event of batch.events) {
        afterSequence = Math.max(afterSequence, event.sequence);
        const writable = await writeSse(response, `id: ${event.sequence}\nevent: ${sseEventName(event.type)}\ndata: ${JSON.stringify(event)}\n\n`);
        if (!writable) break;
      }
      if (closed || batch.isTerminal) break;
      if (Date.now() - lastHeartbeatAt >= SSE_HEARTBEAT_INTERVAL_MS) {
        if (!(await writeSse(response, ': heartbeat\n\n'))) break;
        lastHeartbeatAt = Date.now();
      }
      await waitForDisconnect(SSE_POLL_INTERVAL_MS, () => closed);
    }
    response.end();
  };
}

function writeSse(response: Response, chunk: string): Promise<boolean> {
  if (response.destroyed || response.writableEnded) return Promise.resolve(false);
  if (response.write(chunk)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onDrain = () => finish(true);
    const onClose = () => finish(false);
    const finish = (writable: boolean) => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      resolve(writable);
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
  });
}

function sseEventName(type: string) {
  if (type === 'COMPLETED') return 'completed';
  if (type === 'FAILED') return 'failed';
  if (type === 'CANCELLED') return 'cancelled';
  return 'progress';
}

function waitForDisconnect(milliseconds: number, isClosed: () => boolean) {
  return new Promise<void>((resolve) => {
    if (isClosed()) return resolve();
    setTimeout(resolve, milliseconds);
  });
}
