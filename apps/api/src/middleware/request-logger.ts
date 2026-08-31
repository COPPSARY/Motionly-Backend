import { randomUUID } from 'node:crypto';

import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Request, RequestHandler, Response } from 'express';

import { serializeLogError } from '../config/logger.js';
import type { AuthenticatedRequest } from '../types/http.js';

type RequestWithId = Request & { id?: string };

function requestPath(request: Request) {
  return request.originalUrl.split('?')[0] ?? request.path;
}

export function requestId(request: Request): string {
  return (request as RequestWithId).id ?? randomUUID();
}

export function requestLogContext(request: AuthenticatedRequest) {
  return {
    requestId: requestId(request),
    ipAddress: request.ip,
    ...(request.principal ? { userId: request.principal.user.id } : {}),
  };
}

export function createRequestLogger(logger: Logger, nodeEnv: 'development' | 'test' | 'production'): RequestHandler[] {
  const context = pinoHttp({
    logger,
    autoLogging: false,
    genReqId(request, response) {
      const incoming = request.headers['x-request-id'];
      const id = typeof incoming === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(incoming) ? incoming : randomUUID();
      response.setHeader('x-request-id', id);
      return id;
    },
    serializers: { req: () => undefined, res: () => undefined, err: () => undefined },
  });

  const completion: RequestHandler = (request: AuthenticatedRequest, response: Response, next) => {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const responseTime = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = requestPath(request);
      const statusCode = response.statusCode;
      const level = statusCode >= 500 || (statusCode === 401 && path === '/v1/auth/login') ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const error = response.locals.logError as unknown;
      request.log[level]({
        ...requestLogContext(request),
        method: request.method,
        path,
        statusCode,
        responseTime: Math.round(responseTime),
        ...(error ? { error: serializeLogError(error, nodeEnv === 'development') } : {}),
      }, `${request.method} ${path} ${statusCode}`);
    });
    next();
  };

  return [context, completion];
}
