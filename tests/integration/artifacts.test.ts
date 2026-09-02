import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../apps/api/src/server.js';

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'designer@example.com', emailVerified: true, displayName: 'Designer', avatarUrl: null };
const generationId = '00000000-0000-4000-8000-000000000002';
const artifactId = '00000000-0000-4000-8000-000000000003';
const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('Artifact API', () => {
  it('lists metadata and streams an authorized private artifact', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'motionly-artifact-api-'));
    directories.push(directory);
    const file = path.join(directory, 'report.json');
    await writeFile(file, '{"ok":true}', 'utf8');
    const artifacts = {
      list: vi.fn().mockResolvedValue([{ id: artifactId, kind: 'VALIDATION_REPORT' }]),
      download: vi.fn().mockResolvedValue({ path: file, contentType: 'application/json', fileName: 'validation.json' }),
    };
    const app = createApp({
      services: {
        auth: {} as never,
        sessions: { resolve: vi.fn().mockResolvedValue({ user, csrfToken: 'csrf' }) },
        workspaces: {} as never,
        projects: {} as never,
        artifacts,
      },
      frontendOrigins: ['http://localhost:5173'], secureCookies: false,
    });

    const cookie = ['motionly_session=session'];
    const list = await request(app).get(`/v1/generations/${generationId}/artifacts`).set('Cookie', cookie);
    const download = await request(app).get(`/v1/artifacts/${artifactId}/download`).set('Cookie', cookie);

    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([{ id: artifactId, kind: 'VALIDATION_REPORT' }]);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('validation.json');
    expect(artifacts.download).toHaveBeenCalledWith(user.id, artifactId);
  });
});
