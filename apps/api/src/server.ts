import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { SupabaseAuthProvider } from '../../../packages/auth/src/supabase-provider.js';
import { TokenVault } from '../../../packages/auth/src/token-vault.js';
import { createDatabase } from '../../../packages/database/src/client.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { AuthController, type AuthControllerService } from './controllers/auth.controller.js';
import { WorkspaceController, type WorkspaceControllerService } from './controllers/workspace.controller.js';
import { requireAuthentication, resolveSession } from './middleware/authentication.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { DatabaseAccountProvisioner, DatabaseAuthFlowStore, DatabaseSessionStore } from './repositories/auth.repository.js';
import { DatabaseWorkspaceRepository } from './repositories/workspace.repository.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createWorkspaceRoutes } from './routes/workspace.routes.js';
import { AuthService } from './services/auth.service.js';
import { WorkspaceService } from './services/workspace.service.js';
import type { SessionResolver } from './types/http.js';

interface AppOptions {
  services: {
    auth: AuthControllerService;
    sessions: SessionResolver;
    workspaces: WorkspaceControllerService;
  };
  frontendOrigins: string[];
  editorOrigin?: string;
  secureCookies: boolean;
  logger?: Logger;
  nodeEnv?: 'development' | 'test' | 'production';
}

export function createApp(options: AppOptions) {
  const app = express();
  const frontendOrigin = options.frontendOrigins[0];
  if (!frontendOrigin) throw new Error('At least one frontend origin is required');

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(createRequestLogger(options.logger ?? createLogger({ nodeEnv: 'test', logLevel: 'silent' }), options.nodeEnv ?? 'test'));
  app.use(cors({ origin: options.frontendOrigins, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', (_request, response) => response.json({ status: 'ready' }));

  const authController = new AuthController(
    options.services.auth,
    frontendOrigin,
    options.secureCookies,
    options.nodeEnv === 'development',
    options.editorOrigin,
  );
  const workspaceController = new WorkspaceController(options.services.workspaces);

  app.use('/v1', resolveSession(options.services.sessions));
  app.use('/v1/auth', createAuthRoutes(authController));
  app.use('/v1/workspaces', requireAuthentication, createWorkspaceRoutes(workspaceController));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export async function startServer() {
  const environment = parseEnvironment(process.env);
  const logger = createLogger({ nodeEnv: environment.nodeEnv, ...(environment.logLevel ? { logLevel: environment.logLevel } : {}) });
  const { db, pool } = createDatabase(environment.databaseUrl);
  const provider = new SupabaseAuthProvider(environment.supabaseUrl, environment.supabasePublishableKey);
  const vault = new TokenVault(environment.sessionEncryptionKey);
  const accounts = new DatabaseAccountProvisioner(db);
  const sessions = new DatabaseSessionStore(db, vault, provider);
  const flows = new DatabaseAuthFlowStore(db, vault);
  const auth = new AuthService(provider, accounts, sessions, flows, {
    emailVerificationRedirect: `${environment.apiPublicUrl}/v1/auth/verify`,
    oauthCallbackUrl: `${environment.apiPublicUrl}/v1/auth/callback`,
  });
  const workspaces = new WorkspaceService(new DatabaseWorkspaceRepository(db));
  const app = createApp({
    services: { auth, sessions, workspaces },
    frontendOrigins: environment.frontendOrigins,
    editorOrigin: environment.editorOrigin,
    secureCookies: environment.secureCookies,
    logger,
    nodeEnv: environment.nodeEnv,
  });
  const server = createServer(app);

  server.listen(environment.apiPort, environment.apiHost, () => {
    logger.info({ port: environment.apiPort }, 'Motionly API started');
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    logger.info('Motionly API stopped');
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  return server;
}

const entryFile = process.argv[1];
if (entryFile && import.meta.url === pathToFileURL(entryFile).href) {
  void startServer();
}
