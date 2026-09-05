import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import type { GenerationController } from '../controllers/generation.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireCsrf } from '../middleware/authentication.js';
import { requestId } from '../middleware/request-logger.js';
import type { AuthenticatedRequest } from '../types/http.js';

const generationMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (request: AuthenticatedRequest) => request.principal?.user.id ?? ipKeyGenerator(request.ip ?? ''),
  handler: (request, response) => response.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many generation requests. Try again shortly.',
      requestId: requestId(request),
    },
  }),
});

export function createWorkspaceGenerationRoutes(controller: GenerationController) {
  const router = Router({ mergeParams: true });
  router.post('/', generationMutationLimiter, requireCsrf, asyncHandler(controller.create));
  return router;
}

export function createProjectGenerationRoutes(controller: GenerationController) {
  const router = Router({ mergeParams: true });
  router.get('/', asyncHandler(controller.list));
  router.post('/', generationMutationLimiter, requireCsrf, asyncHandler(controller.edit));
  return router;
}

export function createGenerationRoutes(controller: GenerationController) {
  const router = Router();
  router.get('/:generationId', asyncHandler(controller.get));
  router.get('/:generationId/events', asyncHandler(controller.events));
  router.post('/:generationId/cancel', generationMutationLimiter, requireCsrf, asyncHandler(controller.cancel));
  return router;
}
