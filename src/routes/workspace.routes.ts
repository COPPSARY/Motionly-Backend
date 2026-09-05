import { Router } from 'express';

import type { WorkspaceController } from '../controllers/workspace.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireCsrf } from '../middleware/authentication.js';

export function createWorkspaceRoutes(controller: WorkspaceController) {
  const router = Router();
  router.get('/', asyncHandler(controller.list));
  router.post('/', requireCsrf, asyncHandler(controller.create));
  router.get('/:workspaceId', asyncHandler(controller.get));
  router.patch('/:workspaceId', requireCsrf, asyncHandler(controller.update));
  router.get('/:workspaceId/members', asyncHandler(controller.listMembers));
  router.post('/:workspaceId/members', requireCsrf, asyncHandler(controller.addMember));
  router.patch('/:workspaceId/members/:userId', requireCsrf, asyncHandler(controller.updateMember));
  router.delete('/:workspaceId/members/:userId', requireCsrf, asyncHandler(controller.removeMember));
  return router;
}

