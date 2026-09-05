import { Router } from 'express';

import type { ProjectController } from '../controllers/project.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireCsrf } from '../middleware/authentication.js';

export function createWorkspaceProjectRoutes(controller: ProjectController) {
  const router = Router({ mergeParams: true });
  router.get('/', asyncHandler(controller.list));
  router.post('/', requireCsrf, asyncHandler(controller.create));
  return router;
}

export function createProjectRoutes(controller: ProjectController) {
  const router = Router();
  router.get('/:projectId', asyncHandler(controller.get));
  router.patch('/:projectId', requireCsrf, asyncHandler(controller.update));
  router.delete('/:projectId', requireCsrf, asyncHandler(controller.remove));
  router.get('/:projectId/source', asyncHandler(controller.getSource));
  router.get('/:projectId/preview', asyncHandler(controller.getPreview));
  router.put('/:projectId/source', requireCsrf, asyncHandler(controller.saveSource));
  return router;
}
