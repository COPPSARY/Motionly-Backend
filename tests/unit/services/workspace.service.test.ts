import { describe, expect, it, vi } from 'vitest';

import { WorkspaceService } from '../../../src/services/workspace.service.js';

describe('WorkspaceService authorization rules', () => {
  it('prevents removing the last owner', async () => {
    const repository = {
      getMembership: vi.fn().mockResolvedValue({ role: 'owner' }),
      countOwners: vi.fn().mockResolvedValue(1),
      removeMember: vi.fn(),
    };
    const service = new WorkspaceService(repository as never);

    await expect(
      service.removeMember('workspace-1', 'owner-1', 'owner-1'),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
    expect(repository.removeMember).not.toHaveBeenCalled();
  });

  it('does not allow editors to manage members', async () => {
    const repository = {
      getMembership: vi.fn().mockResolvedValue({ role: 'editor' }),
      countOwners: vi.fn(),
      removeMember: vi.fn(),
    };
    const service = new WorkspaceService(repository as never);

    await expect(
      service.removeMember('workspace-1', 'editor-1', 'member-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
