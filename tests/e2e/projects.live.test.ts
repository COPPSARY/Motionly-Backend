import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { AuthProvider } from '../../packages/auth/src/types.js';
import { TokenVault } from '../../packages/auth/src/token-vault.js';
import { createDatabase } from '../../packages/database/src/client.js';
import { projectFiles, projects, users, workspaceMembers, workspaces } from '../../packages/database/src/schema.js';
import { DatabaseSessionStore } from '../../apps/api/src/repositories/auth.repository.js';
import { DatabaseProjectRepository } from '../../apps/api/src/repositories/project.repository.js';
import { DatabaseWorkspaceRepository } from '../../apps/api/src/repositories/workspace.repository.js';
import { createApp } from '../../apps/api/src/server.js';
import { ProjectService } from '../../apps/api/src/services/project.service.js';
import { WorkspaceService } from '../../apps/api/src/services/workspace.service.js';

const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.SESSION_ENCRYPTION_KEY;
const runLive = process.env.RUN_LIVE_E2E === 'true' && Boolean(databaseUrl && encryptionKey);

describe.skipIf(!runLive)('Projects live HTTP flow', () => {
  it('creates, opens, replaces one rolling snapshot, skips no-op saves, and archives an owned project', async () => {
    if (!databaseUrl || !encryptionKey) return;
    const { db, pool } = createDatabase(databaseUrl);
    const userId = randomUUID();
    const viewerId = randomUUID();
    const outsiderId = randomUUID();
    const workspaceId = randomUUID();
    const suffix = randomUUID();
    const provider = { revokeSession: async () => undefined } as unknown as AuthProvider;
    const sessions = new DatabaseSessionStore(db, new TokenVault(encryptionKey), provider);
    const workspacesService = new WorkspaceService(new DatabaseWorkspaceRepository(db));
    const projectsService = new ProjectService(new DatabaseProjectRepository(db));
    const app = createApp({
      services: { auth: {} as never, sessions, workspaces: workspacesService, projects: projectsService },
      frontendOrigins: ['http://localhost:5173'],
      secureCookies: false,
    });
    const files = {
      'composition.html': '<template id="live"><main>Live one</main></template>',
      'styles.css': 'main { color: white; }',
      'timeline.js': 'export function buildTimeline() {}',
      'index.ts': 'export const composition = {};',
    };

    try {
      await db.insert(users).values({ id: userId, email: `live-project-${suffix}@example.com`, displayName: 'Live Project Test' });
      await db.insert(users).values([
        { id: viewerId, email: `live-viewer-${suffix}@example.com`, displayName: 'Live Viewer Test' },
        { id: outsiderId, email: `live-outsider-${suffix}@example.com`, displayName: 'Live Outsider Test' },
      ]);
      await db.insert(workspaces).values({ id: workspaceId, name: 'Live Workspace', slug: `live-project-${suffix}`, kind: 'team', ownerId: userId });
      await db.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
      await db.insert(workspaceMembers).values({ workspaceId, userId: viewerId, role: 'viewer' });
      const session = await sessions.create(userId, 'access-token', 'refresh-token', new Date(Date.now() + 60_000));
      const viewerSession = await sessions.create(viewerId, 'viewer-access', 'viewer-refresh', new Date(Date.now() + 60_000));
      const outsiderSession = await sessions.create(outsiderId, 'outsider-access', 'outsider-refresh', new Date(Date.now() + 60_000));
      const authenticated = (test: request.Test) => test
        .set('Cookie', [`motionly_session=${session.sessionToken}`])
        .set('X-CSRF-Token', session.csrfToken);
      const asViewer = (test: request.Test) => test
        .set('Cookie', [`motionly_session=${viewerSession.sessionToken}`])
        .set('X-CSRF-Token', viewerSession.csrfToken);
      const asOutsider = (test: request.Test) => test
        .set('Cookie', [`motionly_session=${outsiderSession.sessionToken}`])
        .set('X-CSRF-Token', outsiderSession.csrfToken);

      const created = await authenticated(request(app).post(`/v1/workspaces/${workspaceId}/projects`)).send({
        name: 'End-to-end Film', width: 1920, height: 1080, fps: 60, duration: 24, files,
      }).expect(201);
      const projectId = created.body.data.id as string;
      expect(created.body.data).toMatchObject({ workspaceId, revision: 1 });

      const listed = await authenticated(request(app).get(`/v1/workspaces/${workspaceId}/projects`)).expect(200);
      expect(listed.body.data).toHaveLength(1);
      await asOutsider(request(app).get(`/v1/workspaces/${workspaceId}/projects`)).expect(404);
      await asOutsider(request(app).get(`/v1/projects/${projectId}`)).expect(404);
      await asOutsider(request(app).put(`/v1/projects/${projectId}/source`)).send({ revision: 1, files }).expect(404);
      await asViewer(request(app).get(`/v1/projects/${projectId}`)).expect(200);
      await asViewer(request(app).get(`/v1/projects/${projectId}/source`)).expect(200);
      await asViewer(request(app).patch(`/v1/projects/${projectId}`)).send({ revision: 1, name: 'Viewer Edit' }).expect(403);
      await asViewer(request(app).put(`/v1/projects/${projectId}/source`)).send({ revision: 1, files }).expect(403);

      const renamed = await authenticated(request(app).patch(`/v1/projects/${projectId}`))
        .send({ revision: 1, name: 'Renamed Film' }).expect(200);
      expect(renamed.body.data).toMatchObject({ name: 'Renamed Film', revision: 2 });

      const secondFiles = { ...files, 'composition.html': '<template id="live"><main>Live two</main></template>' };
      const saved = await authenticated(request(app).put(`/v1/projects/${projectId}/source`))
        .send({ revision: 2, files: secondFiles }).expect(200);
      expect(saved.body.data).toMatchObject({ project: { revision: 3 }, unchanged: false });

      const source = await authenticated(request(app).get(`/v1/projects/${projectId}/source`)).expect(200);
      expect(source.body.data).toMatchObject({ revision: 3, files: secondFiles });
      const unchanged = await authenticated(request(app).put(`/v1/projects/${projectId}/source`))
        .send({ revision: 3, files: secondFiles }).expect(200);
      expect(unchanged.body.data).toMatchObject({ project: { revision: 3 }, unchanged: true });
      const storedFiles = await db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId));
      expect(storedFiles).toHaveLength(4);
      await authenticated(request(app).get(`/v1/projects/${projectId}/versions`)).expect(404);

      const stale = await authenticated(request(app).put(`/v1/projects/${projectId}/source`))
        .send({ revision: 2, files }).expect(409);
      expect(stale.body.error).toMatchObject({ code: 'REVISION_CONFLICT', details: { currentRevision: 3 } });

      await authenticated(request(app).delete(`/v1/projects/${projectId}`)).send({ revision: 3 }).expect(204);
      const empty = await authenticated(request(app).get(`/v1/workspaces/${workspaceId}/projects`)).expect(200);
      expect(empty.body.data).toEqual([]);
      await authenticated(request(app).get(`/v1/projects/${projectId}`)).expect(404);
    } finally {
      await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(users).where(and(eq(users.id, userId), eq(users.email, `live-project-${suffix}@example.com`)));
      await db.delete(users).where(eq(users.id, viewerId));
      await db.delete(users).where(eq(users.id, outsiderId));
      await pool.end();
    }
  }, 60_000);
});
