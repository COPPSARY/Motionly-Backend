import { describe, expect, it, vi } from 'vitest';
import { ProjectService, type ProjectRepository } from '../../../src/services/project.service.js';

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const repo = () => ({ getWorkspaceMembership: vi.fn(), getProjectAccess: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() });
describe('ProjectService', () => {
  it('creates a two-field project with safe empty source defaults', async () => {
    const repository = repo(); repository.getWorkspaceMembership.mockResolvedValue({ role: 'owner' }); repository.create.mockResolvedValue({ id: 'project' });
    const service = new ProjectService(repository as unknown as ProjectRepository);
    await service.create(userId, workspaceId, { name: 'Launch', width: 1920, height: 1080, fps: 30, duration: 8 });
    expect(repository.create).toHaveBeenCalledWith(workspaceId, userId, expect.objectContaining({ compositionHtml: '<template><style></style></template>', timelineJs: 'export function buildTimeline() { return []; }', scenes: [] }));
  });
  it('does not allow a viewer to mutate a project', async () => {
    const repository = repo(); repository.getProjectAccess.mockResolvedValue({ project: { revision: 1 }, role: 'viewer' });
    const service = new ProjectService(repository as unknown as ProjectRepository);
    await expect(service.update(userId, 'project', { revision: 1, name: 'Nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
