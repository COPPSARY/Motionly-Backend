import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

import { AppError } from '../errors.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const requestId = request.header('x-request-id') ?? randomUUID();
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', requestId, details: z.treeifyError(error) } });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, requestId, ...(error.details ? { details: error.details } : {}) } });
    return;
  }
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId } });
};

