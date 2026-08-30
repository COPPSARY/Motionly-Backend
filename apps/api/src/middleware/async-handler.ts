import type { NextFunction, RequestHandler, Response } from 'express';

import type { AuthenticatedRequest } from '../types/http.js';

export function asyncHandler(
  handler: (request: AuthenticatedRequest, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    handler(request as AuthenticatedRequest, response).catch(next);
  };
}

