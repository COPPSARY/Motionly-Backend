import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/server.js';
import { AppError } from '../../src/errors.js';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'designer@example.com',
  emailVerified: true,
  displayName: 'Designer',
  avatarUrl: null,
};
const workspaceId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const files = {
  'composition.html': '<main class="scene">Hello</main>',
  'styles.css': '.scene { color: white; }',
  'timeline.js': 'export function buildTimeline(context) { return context; }',
  'index.ts': 'export const composition = {};',
};

function dependencies() {
  return {
    auth: {} as never,
    sessions: { resolve: vi.fn().mockResolvedValue({ user, csrfToken: 'csrf-token' }) },
    workspaces: {} as never,
    projects: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: projectId, revision: 1 }),
      get: vi.fn().mockResolvedValue({ id: projectId, revision: 1 }),
      update: vi.fn().mockResolvedValue({ id: projectId, revision: 2 }),
      remove: vi.fn(),
      getSource: vi.fn().mockResolvedValue({ revision: 1, sourceHash: 'hash', savedAt: new Date(), files }),
      getPreview: vi.fn().mockResolvedValue({ sourceHash: 'hash', bundle: 'export default {};', styles: '' }),
      saveSource: vi.fn().mockResolvedValue({ project: { id: projectId, revision: 2 }, unchanged: false }),
    },
  };
}

function authenticated(test: request.Test) {
  return test.set('Cookie', ['motionly_session=session-token']).set('X-CSRF-Token', 'csrf-token');
}

describe('Project API', () => {
  it('creates a project with exactly four canonical source files', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });
    const input = { name: 'Launch Film', width: 1920, height: 1080, fps: 60, duration: 30, files };

    const response = await authenticated(request(app).post(`/v1/workspaces/${workspaceId}/projects`)).send(input);

    expect(response.status).toBe(201);
    expect(deps.projects.create).toHaveBeenCalledWith(user.id, workspaceId, input);
  });

  it('rejects a source bundle with a missing or additional file', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });
    const { 'styles.css': _styles, ...missingFile } = files;

    const missing = await authenticated(request(app).post(`/v1/workspaces/${workspaceId}/projects`)).send({
      name: 'Incomplete', width: 1920, height: 1080, fps: 60, duration: 30, files: missingFile,
    });
    const additional = await authenticated(request(app).put(`/v1/projects/${projectId}/source`)).send({
      revision: 1, files: { ...files, 'metadata.json': '{}' },
    });

    expect(missing.status).toBe(400);
    expect(additional.status).toBe(400);
    expect(deps.projects.create).not.toHaveBeenCalled();
    expect(deps.projects.saveSource).not.toHaveBeenCalled();
  });

  it('routes project reads, metadata updates, rolling source saves, and deletion', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });

    await authenticated(request(app).get(`/v1/workspaces/${workspaceId}/projects`)).expect(200);
    await authenticated(request(app).get(`/v1/projects/${projectId}`)).expect(200);
    await authenticated(request(app).patch(`/v1/projects/${projectId}`)).send({ revision: 1, name: 'Updated' }).expect(200);
    await authenticated(request(app).get(`/v1/projects/${projectId}/source`)).expect(200);
    await authenticated(request(app).get(`/v1/projects/${projectId}/preview`)).expect(200);
    await authenticated(request(app).put(`/v1/projects/${projectId}/source`)).send({ revision: 1, files }).expect(200);
    await authenticated(request(app).get(`/v1/projects/${projectId}/versions`)).expect(404);
    await authenticated(request(app).delete(`/v1/projects/${projectId}`)).send({ revision: 2 }).expect(204);

    expect(deps.projects.saveSource).toHaveBeenCalledWith(user.id, projectId, { revision: 1, files });
    expect(deps.projects.remove).toHaveBeenCalledWith(user.id, projectId, 2);
  });

  it('returns a stable conflict response for stale revisions', async () => {
    const deps = dependencies();
    deps.projects.saveSource.mockRejectedValue(new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', { currentRevision: 8 }));
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });

    const response = await authenticated(request(app).put(`/v1/projects/${projectId}/source`)).send({ revision: 4, files });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'REVISION_CONFLICT', details: { currentRevision: 8 } });
  });

  it('requires both authentication and CSRF protection', async () => {
    const deps = dependencies();
    deps.sessions.resolve.mockResolvedValue(null);
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });
    await request(app).get(`/v1/projects/${projectId}`).expect(401);

    deps.sessions.resolve.mockResolvedValue({ user, csrfToken: 'csrf-token' });
    const csrfResponse = await request(app)
      .patch(`/v1/projects/${projectId}`)
      .set('Cookie', ['motionly_session=session-token'])
      .send({ revision: 1, name: 'Blocked' });
    expect(csrfResponse.status).toBe(403);
    expect(csrfResponse.body.error.code).toBe('CSRF_INVALID');
  });
});
