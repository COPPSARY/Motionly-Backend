import { Router } from 'express';

import type { ArtifactController } from '../controllers/artifact.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';

export function createArtifactRoutes(controller: ArtifactController) {
  const router = Router();
  router.get('/:artifactId/download', asyncHandler(controller.download));
  return router;
}

export function createGenerationArtifactRoutes(controller: ArtifactController) {
  const router = Router({ mergeParams: true });
  router.get('/', asyncHandler(controller.list));
  return router;
}
