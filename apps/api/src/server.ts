import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { sql } from 'drizzle-orm';

import { SupabaseAuthProvider } from '../../../packages/auth/src/supabase-provider.js';
import { TokenVault } from '../../../packages/auth/src/token-vault.js';
import { createDatabase } from '../../../packages/database/src/client.js';
import { parseEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { AuthController, type AuthControllerService } from './controllers/auth.controller.js';
import { ProjectController, type ProjectControllerService } from './controllers/project.controller.js';
import { GenerationController, type GenerationControllerService } from './controllers/generation.controller.js';
import { ArtifactController, type ArtifactControllerService } from './controllers/artifact.controller.js';
import { AssetController, type AssetControllerService } from './controllers/asset.controller.js';
import { WorkspaceController, type WorkspaceControllerService } from './controllers/workspace.controller.js';
import { requireAuthentication, resolveSession } from './middleware/authentication.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { DatabaseAccountProvisioner, DatabaseAuthFlowStore, DatabaseSessionStore } from './repositories/auth.repository.js';
import { DatabaseProjectRepository } from './repositories/project.repository.js';
import { DatabaseGenerationRepository } from './repositories/generation.repository.js';
import { DatabaseArtifactRepository } from './repositories/artifact.repository.js';
import { DatabaseAssetRepository } from './repositories/asset.repository.js';
import { DatabaseWorkspaceRepository } from './repositories/workspace.repository.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createProjectRoutes, createWorkspaceProjectRoutes } from './routes/project.routes.js';
import { createGenerationRoutes, createProjectGenerationRoutes, createWorkspaceGenerationRoutes } from './routes/generation.routes.js';
import { createArtifactRoutes, createGenerationArtifactRoutes } from './routes/artifact.routes.js';
import { createAssetRoutes, createProjectAssetRoutes, createWorkspaceAssetRoutes } from './routes/asset.routes.js';
import { createWorkspaceRoutes } from './routes/workspace.routes.js';
import { AuthService } from './services/auth.service.js';
import { ProjectService } from './services/project.service.js';
import { GenerationService } from './services/generation.service.js';
import { ArtifactService } from './services/artifact.service.js';
import { AssetService } from './services/asset.service.js';
import { LocalFilesystemObjectStorage } from '../../../packages/object-storage/src/local-filesystem.js';
import { openApiDocument } from '../../../packages/contracts/src/openapi.js';
import { WorkspaceService } from './services/workspace.service.js';
import type { SessionResolver } from './types/http.js';

interface AppOptions {
  services: {
    auth: AuthControllerService;
    sessions: SessionResolver;
    workspaces: WorkspaceControllerService;
    projects: ProjectControllerService;
    generations?: GenerationControllerService;
    artifacts?: ArtifactControllerService;
    assets?: AssetControllerService;
  };
  frontendOrigins: string[];
  secureCookies: boolean;
  logger?: Logger;
  nodeEnv?: 'development' | 'test' | 'production';
  readiness?: () => Promise<void>;
}

export function createApp(options: AppOptions) {
  const app = express();
  const frontendOrigin = options.frontendOrigins[0];
  if (!frontendOrigin) throw new Error('At least one frontend origin is required');

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(createRequestLogger(options.logger ?? createLogger({ nodeEnv: 'test', logLevel: 'silent' }), options.nodeEnv ?? 'test'));
  app.use(cors({ origin: options.frontendOrigins, credentials: true }));
  app.use(express.json({ limit: '20mb' }));
  app.use(cookieParser());

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', async (_request, response) => {
    try {
      await options.readiness?.();
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument));

  const authController = new AuthController(
    options.services.auth,
    frontendOrigin,
    options.secureCookies,
    options.nodeEnv === 'development',
  );
  const workspaceController = new WorkspaceController(options.services.workspaces);
  const projectController = new ProjectController(options.services.projects);
  const generationController = options.services.generations ? new GenerationController(options.services.generations) : null;
  const artifactController = options.services.artifacts ? new ArtifactController(options.services.artifacts) : null;
  const assetController = options.services.assets ? new AssetController(options.services.assets) : null;

  app.use('/v1', resolveSession(options.services.sessions));
  app.use('/v1/auth', createAuthRoutes(authController));
  if (generationController) {
    app.use('/v1/workspaces/:workspaceId/generations', requireAuthentication, createWorkspaceGenerationRoutes(generationController));
    app.use('/v1/projects/:projectId/generations', requireAuthentication, createProjectGenerationRoutes(generationController));
    app.use('/v1/generations', requireAuthentication, createGenerationRoutes(generationController));
  }
  if (artifactController) {
    app.use('/v1/generations/:generationId/artifacts', requireAuthentication, createGenerationArtifactRoutes(artifactController));
    app.use('/v1/artifacts', requireAuthentication, createArtifactRoutes(artifactController));
  }
  if (assetController) {
    app.use('/v1/workspaces/:workspaceId/assets', requireAuthentication, createWorkspaceAssetRoutes(assetController));
    app.use('/v1/projects/:projectId/assets', requireAuthentication, createProjectAssetRoutes(assetController));
    app.use('/v1/assets', requireAuthentication, createAssetRoutes(assetController));
  }
  app.use('/v1/workspaces/:workspaceId/projects', requireAuthentication, createWorkspaceProjectRoutes(projectController));
  app.use('/v1/workspaces', requireAuthentication, createWorkspaceRoutes(workspaceController));
  app.use('/v1/projects', requireAuthentication, createProjectRoutes(projectController));
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
  const projects = new ProjectService(new DatabaseProjectRepository(db));
  const generations = new GenerationService(new DatabaseGenerationRepository(db), {
    provider: environment.aiProvider,
    model: environment.aiModel,
    maxActivePerUser: environment.generationMaxActivePerUser,
  });
  const objectStorage = await LocalFilesystemObjectStorage.create(path.resolve(environment.objectStorageLocalRoot));
  const artifacts = new ArtifactService(new DatabaseArtifactRepository(db), objectStorage);
  const assetService = new AssetService(new DatabaseAssetRepository(db), objectStorage);
  const app = createApp({
    services: { auth, sessions, workspaces, projects, generations, artifacts, assets: assetService },
    frontendOrigins: environment.frontendOrigins,
    secureCookies: environment.secureCookies,
    logger,
    nodeEnv: environment.nodeEnv,
    readiness: async () => { await db.execute(sql`select 1`); },
  });
  const server = createServer(app);

  server.listen(environment.apiPort, environment.apiHost, () => {
    logger.info({ port: environment.apiPort }, 'Motionly API started');
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () => shutdownPromise ??= (async () => {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        resolve();
      };
      const forceTimer = setTimeout(() => {
        server.closeAllConnections();
        finish();
      }, 10_000);
      forceTimer.unref();
      server.close(finish);
      server.closeIdleConnections();
    });
    await pool.end();
    logger.info('Motionly API stopped');
  })();
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  return server;
}

const entryFile = process.argv[1];
if (entryFile && import.meta.url === pathToFileURL(entryFile).href) {
  void startServer();
}
