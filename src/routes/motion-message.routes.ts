import { Router } from 'express';
import type { MotionMessageController } from '../controllers/motion-message.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireCsrf } from '../middleware/authentication.js';
export function createMotionMessageRoutes(controller: MotionMessageController) {
  const router = Router({ mergeParams: true });
  router.post('/:projectId/messages', requireCsrf, asyncHandler(controller.send));
  return router;
}
