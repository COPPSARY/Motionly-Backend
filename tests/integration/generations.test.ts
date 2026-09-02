import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../apps/api/src/server.js';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'designer@example.com',
  emailVerified: true,
  displayName: 'Designer',
  avatarUrl: null,
};
const workspaceId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const sourceHash = 'a'.repeat(64);
const generationId = '00000000-0000-4000-8000-000000000006';

function dependencies() {
  return {
    auth: {} as never,
    sessions: { resolve: vi.fn().mockResolvedValue({ user, csrfToken: 'csrf-token' }) },
    workspaces: {} as never,
    projects: {} as never,
    generations: {
      create: vi.fn().mockResolvedValue({ id: generationId, projectId, status: 'QUEUED' }),
      edit: vi.fn().mockResolvedValue({ id: generationId, projectId, status: 'QUEUED' }),
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
      get: vi.fn().mockResolvedValue({ id: generationId, projectId, status: 'QUEUED' }),
      cancel: vi.fn().mockResolvedValue({ id: generationId, projectId, status: 'CANCELLING' }),
      retry: vi.fn().mockResolvedValue({ id: generationId, projectId, status: 'QUEUED' }),
      apply: vi.fn().mockResolvedValue({ outputSourceHash: sourceHash, projectRevision: 2 }),
      events: vi.fn().mockResolvedValue({
        events: [{ sequence: 2, type: 'COMPLETED', status: 'COMPLETED' }],
        isTerminal: true,
      }),
    },
  };
}

function authenticated(test: request.Test) {
  return test.set('Cookie', ['motionly_session=session-token']).set('X-CSRF-Token', 'csrf-token');
}

describe('Generation API', () => {
  it('submits create and edit jobs with idempotency', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });

    const createInput = {
      prompt: 'Create a launch film',
      project: { name: 'Launch', width: 1920, height: 1080, fps: 60, duration: 20 },
    };
    const createResponse = await authenticated(request(app).post(`/v1/workspaces/${workspaceId}/generations`))
      .set('Idempotency-Key', 'create-generation-1').send(createInput);
    const editInput = { prompt: 'Improve the CTA', baseSourceHash: sourceHash, baseRevision: 1 };
    const editResponse = await authenticated(request(app).post(`/v1/projects/${projectId}/generations`))
      .set('Idempotency-Key', 'edit-generation-1').send(editInput);

    expect(createResponse.status).toBe(202);
    expect(editResponse.status).toBe(202);
    expect(deps.generations.create).toHaveBeenCalledWith(user.id, workspaceId, expect.objectContaining({ assetIds: [] }), 'create-generation-1');
    expect(deps.generations.edit).toHaveBeenCalledWith(user.id, projectId, expect.objectContaining({ assetIds: [] }), 'edit-generation-1');
  });

  it('requires CSRF and an idempotency key for submission', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });
    const input = { prompt: 'Improve CTA', baseSourceHash: sourceHash, baseRevision: 1 };

    const noCsrf = await request(app).post(`/v1/projects/${projectId}/generations`)
      .set('Cookie', ['motionly_session=session-token']).set('Idempotency-Key', 'key').send(input);
    const noKey = await authenticated(request(app).post(`/v1/projects/${projectId}/generations`)).send(input);

    expect(noCsrf.status).toBe(403);
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('lists and retrieves provider-neutral generation resources', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });

    await authenticated(request(app).get(`/v1/projects/${projectId}/generations`).query({ page: 1, pageSize: 20 })).expect(200);
    await authenticated(request(app).get(`/v1/generations/${generationId}`)).expect(200);

    expect(deps.generations.list).toHaveBeenCalledWith(user.id, projectId, 1, 20);
    expect(deps.generations.get).toHaveBeenCalledWith(user.id, generationId);
  });

  it('cancels, retries, applies, and replays terminal SSE events', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });

    await authenticated(request(app).post(`/v1/generations/${generationId}/cancel`))
      .set('Idempotency-Key', 'cancel-1').send({}).expect(202);
    await authenticated(request(app).post(`/v1/generations/${generationId}/retry`))
      .set('Idempotency-Key', 'retry-1').send({}).expect(202);
    await authenticated(request(app).post(`/v1/generations/${generationId}/apply`))
      .set('Idempotency-Key', 'apply-1').send({ revision: 1 }).expect(201);
    const events = await authenticated(request(app).get(`/v1/generations/${generationId}/events`))
      .set('Last-Event-ID', '1').expect(200);

    expect(events.headers['content-type']).toContain('text/event-stream');
    expect(events.text).toContain('id: 2');
    expect(events.text).toContain('event: completed');
    expect(deps.generations.retry).toHaveBeenCalledWith(user.id, generationId, {}, 'retry-1');
    expect(deps.generations.events).toHaveBeenCalledWith(user.id, generationId, 1);
  });

  it('rate-limits generation mutations with the stable API error envelope', async () => {
    const deps = dependencies();
    const app = createApp({ services: deps, frontendOrigins: ['http://localhost:5173'], secureCookies: false });
    let response: request.Response | undefined;
    for (let index = 0; index < 61; index += 1) {
      response = await authenticated(request(app).post(`/v1/generations/${generationId}/cancel`))
        .set('Idempotency-Key', `cancel-${index}`).send({});
    }

    expect(response?.status).toBe(429);
    expect(response?.body.error).toMatchObject({ code: 'RATE_LIMITED', message: expect.any(String), requestId: expect.any(String) });
  });
});
