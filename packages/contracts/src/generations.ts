import { z } from 'zod';

export const MAX_GENERATION_ASSET_BYTES = 500_000_000;
export const MAX_RENDER_PIXEL_FRAMES = 4_000_000_000;

export const generationIntentSchema = z.enum(['CREATE', 'EDIT']);
export type GenerationIntent = z.infer<typeof generationIntentSchema>;

export const generationStatusSchema = z.enum([
  'QUEUED',
  'PREPARING',
  'GENERATING',
  'VALIDATING',
  'RENDERING',
  'REVIEWING',
  'REPAIRING',
  'PUBLISHING',
  'CANCELLING',
  'COMPLETED',
  'AWAITING_APPLY',
  'CANCELLED',
  'FAILED',
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const TERMINAL_GENERATION_STATUSES = [
  'COMPLETED',
  'AWAITING_APPLY',
  'CANCELLED',
  'FAILED',
] as const satisfies readonly GenerationStatus[];

const terminalStatuses = new Set<GenerationStatus>(TERMINAL_GENERATION_STATUSES);

export function isTerminalGenerationStatus(status: GenerationStatus): boolean {
  return terminalStatuses.has(status);
}

const legalTransitions: Readonly<Record<GenerationStatus, ReadonlySet<GenerationStatus>>> = {
  QUEUED: new Set(['PREPARING', 'CANCELLING', 'CANCELLED', 'FAILED']),
  PREPARING: new Set(['GENERATING', 'CANCELLING', 'FAILED']),
  GENERATING: new Set(['PREPARING', 'VALIDATING', 'REPAIRING', 'CANCELLING', 'FAILED']),
  VALIDATING: new Set(['PREPARING', 'RENDERING', 'REPAIRING', 'CANCELLING', 'FAILED']),
  RENDERING: new Set(['PREPARING', 'REVIEWING', 'REPAIRING', 'CANCELLING', 'FAILED']),
  REVIEWING: new Set(['PREPARING', 'REPAIRING', 'PUBLISHING', 'CANCELLING', 'FAILED']),
  REPAIRING: new Set(['PREPARING', 'GENERATING', 'VALIDATING', 'CANCELLING', 'FAILED']),
  PUBLISHING: new Set(['PREPARING', 'COMPLETED', 'AWAITING_APPLY', 'CANCELLING', 'FAILED']),
  CANCELLING: new Set(['CANCELLED', 'FAILED']),
  COMPLETED: new Set(),
  AWAITING_APPLY: new Set(['PUBLISHING', 'COMPLETED']),
  CANCELLED: new Set(),
  FAILED: new Set(),
};

export function canTransitionGeneration(from: GenerationStatus, to: GenerationStatus): boolean {
  return from === to || legalTransitions[from].has(to);
}

export function assertGenerationTransition(from: GenerationStatus, to: GenerationStatus): void {
  if (!canTransitionGeneration(from, to)) {
    throw new Error(`Illegal generation transition: ${from} -> ${to}`);
  }
}

export const modelProviderSchema = z.enum(['gemini', 'openai', 'anthropic', 'openai-compatible']);
export type ModelProviderName = z.infer<typeof modelProviderSchema>;

export const generationErrorSchema = z.strictObject({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(1_000),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type GenerationError = z.infer<typeof generationErrorSchema>;

const projectSettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  width: z.number().int().min(1).max(16_384),
  height: z.number().int().min(1).max(16_384),
  fps: z.number().int().min(1).max(240),
  duration: z.number().positive().max(86_400),
}).superRefine((project, context) => {
  if (project.width > 7_680 || project.height > 7_680 || project.width * project.height > 33_177_600) {
    context.addIssue({ code: 'custom', path: ['width'], message: 'Composition dimensions exceed the renderer safety limit.' });
  }
  if (Math.ceil(project.duration * project.fps) > 18_000) {
    context.addIssue({ code: 'custom', path: ['duration'], message: 'Composition duration and frame rate exceed the 18,000-frame export limit.' });
  }
  if (project.width * project.height * Math.ceil(project.duration * project.fps) > MAX_RENDER_PIXEL_FRAMES) {
    context.addIssue({ code: 'custom', path: ['duration'], message: 'Composition dimensions, duration, and frame rate exceed the pixel-frame render budget.' });
  }
});

const promptSchema = z.string().trim().min(1).max(20_000);
const assetIdsSchema = z.array(z.string().uuid()).max(50).default([]);

export const createGenerationRequestSchema = z.strictObject({
  prompt: promptSchema,
  project: projectSettingsSchema,
  presetId: z.string().trim().min(1).max(120).default('motionly-product-promo'),
  assetIds: assetIdsSchema,
});
export type CreateGenerationRequest = z.infer<typeof createGenerationRequestSchema>;

export const editGenerationRequestSchema = z.strictObject({
  prompt: promptSchema,
  baseVersionId: z.string().uuid(),
  baseRevision: z.number().int().min(1),
  threadId: z.string().uuid().optional(),
  assetIds: assetIdsSchema,
});
export type EditGenerationRequest = z.infer<typeof editGenerationRequestSchema>;

export const retryGenerationRequestSchema = z.strictObject({
  baseVersionId: z.string().uuid().optional(),
  baseRevision: z.number().int().min(1).optional(),
}).superRefine((request, context) => {
  if ((request.baseVersionId === undefined) !== (request.baseRevision === undefined)) {
    context.addIssue({ code: 'custom', message: 'baseVersionId and baseRevision must be provided together.' });
  }
});
export type RetryGenerationRequest = z.infer<typeof retryGenerationRequestSchema>;

export const applyGenerationRequestSchema = z.strictObject({
  revision: z.number().int().min(1),
});

export const generationEventTypeSchema = z.enum([
  'STATUS_CHANGED',
  'PROGRESS',
  'ATTEMPT_STARTED',
  'ATTEMPT_COMPLETED',
  'ARTIFACT_CREATED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type GenerationEventType = z.infer<typeof generationEventTypeSchema>;

export const generationResourceSchema = z.strictObject({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  threadId: z.string().uuid(),
  intent: generationIntentSchema,
  status: generationStatusSchema,
  stage: z.string().min(1).max(80),
  progress: z.number().int().min(0).max(100),
  baseVersionId: z.string().uuid(),
  baseRevision: z.number().int().min(1),
  outputVersionId: z.string().uuid().nullable(),
  provider: modelProviderSchema,
  model: z.string().min(1).max(200),
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  error: generationErrorSchema.nullable(),
});
export type GenerationResource = z.infer<typeof generationResourceSchema>;

export const generationEventSchema = z.strictObject({
  generationId: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: generationEventTypeSchema,
  status: generationStatusSchema,
  stage: z.string().min(1).max(80),
  progress: z.number().int().min(0).max(100),
  message: z.string().max(500).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.iso.datetime(),
});
export type GenerationEvent = z.infer<typeof generationEventSchema>;

export const generationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export function parseIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error('A valid Idempotency-Key header is required.');
  }
  return key;
}
