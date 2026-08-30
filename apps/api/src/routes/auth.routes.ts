import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { AuthController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuthentication, requireCsrf } from '../middleware/authentication.js';

export function createAuthRoutes(controller: AuthController) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  router.post('/sign-up', limiter, asyncHandler(controller.signUp));
  router.post('/login', limiter, asyncHandler(controller.login));
  router.get('/verify', limiter, asyncHandler(controller.verifyEmail));
  router.get('/google', limiter, asyncHandler(controller.google));
  router.get('/callback', asyncHandler(controller.callback));
  router.get('/me', requireAuthentication, asyncHandler(controller.me));
  router.post('/logout', requireAuthentication, requireCsrf, asyncHandler(controller.logout));
  return router;
}
