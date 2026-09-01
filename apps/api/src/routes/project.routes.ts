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
  router.put('/:projectId/source', requireCsrf, asyncHandler(controller.saveSource));
  router.get('/:projectId/versions', asyncHandler(controller.listVersions));
  router.get('/:projectId/versions/:versionId', asyncHandler(controller.getVersion));
  router.post('/:projectId/versions/:versionId/restore', requireCsrf, asyncHandler(controller.restoreVersion));
  return router;
}
