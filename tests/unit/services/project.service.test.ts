import { describe, expect, it, vi } from 'vitest';

import {
  hashSourceFiles,
  ProjectService,
  type ProjectRecord,
  type ProjectRepository,
  type ProjectSourceFiles,
} from '../../../apps/api/src/services/project.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const files: ProjectSourceFiles = {
  'composition.html': '<main>Hello</main>',
  'styles.css': 'main { color: red; }',
  'timeline.js': 'export function buildTimeline() {}',
  'index.ts': 'export const composition = {};',
};
const project: ProjectRecord = {
  id: projectId,
  workspaceId,
  name: 'Launch Film',
  slug: 'launch-film-abcd1234',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 30,
  sourceHash: hashSourceFiles(files),
  revision: 4,
  createdBy: userId,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  savedAt: new Date('2026-01-01T00:00:00.000Z'),
  archivedAt: null,
};

function repository() {
  return {
    getWorkspaceMembership: vi.fn(),
    getProjectAccess: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    getCurrentSource: vi.fn(),
    saveSource: vi.fn(),
  };
}

describe('ProjectService ownership and rolling snapshot rules', () => {
  it('hides workspaces from non-members', async () => {
    const repo = repository();
    repo.getWorkspaceMembership.mockResolvedValue(null);
    const service = new ProjectService(repo as unknown as ProjectRepository);

    await expect(service.list(userId, workspaceId)).rejects.toMatchObject({ status: 404, code: 'WORKSPACE_NOT_FOUND' });
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('allows viewers to read projects but not create them', async () => {
    const repo = repository();
    repo.getProjectAccess.mockResolvedValue({ project, role: 'viewer' });
    repo.getWorkspaceMembership.mockResolvedValue({ role: 'viewer' });
    const service = new ProjectService(repo as unknown as ProjectRepository);

    await expect(service.get(userId, projectId)).resolves.toEqual(project);
    await expect(service.create(userId, workspaceId, {
      name: 'Blocked', width: 1920, height: 1080, fps: 60, duration: 10, files,
    })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not reveal a project outside the user workspace', async () => {
    const repo = repository();
    repo.getProjectAccess.mockResolvedValue(null);
    const service = new ProjectService(repo as unknown as ProjectRepository);

    await expect(service.get(userId, projectId)).rejects.toMatchObject({ status: 404, code: 'PROJECT_NOT_FOUND' });
  });

  it('returns the latest revision when a source save conflicts', async () => {
    const repo = repository();
    repo.getProjectAccess
      .mockResolvedValueOnce({ project, role: 'editor' })
      .mockResolvedValueOnce({ project: { ...project, revision: 6 }, role: 'editor' });
    repo.saveSource.mockResolvedValue(null);
    const service = new ProjectService(repo as unknown as ProjectRepository);

    await expect(service.saveSource(userId, projectId, { revision: 3, files }))
      .rejects.toMatchObject({ status: 409, code: 'REVISION_CONFLICT', details: { currentRevision: 6 } });
  });

  it('passes the rolling snapshot hash to the repository', async () => {
    const repo = repository();
    repo.getProjectAccess.mockResolvedValue({ project, role: 'owner' });
    repo.saveSource.mockResolvedValue({ project, unchanged: true });
    const service = new ProjectService(repo as unknown as ProjectRepository);

    await expect(service.saveSource(userId, projectId, { revision: 4, files }))
      .resolves.toMatchObject({ unchanged: true });
    expect(repo.saveSource).toHaveBeenCalledWith(projectId, { revision: 4, files }, hashSourceFiles(files));
  });

  it('hashes every canonical source file deterministically', () => {
    expect(hashSourceFiles(files)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSourceFiles({ ...files, 'styles.css': 'main { color: blue; }' })).not.toBe(hashSourceFiles(files));
  });
});
