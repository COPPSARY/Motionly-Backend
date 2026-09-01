import { randomUUID } from 'node:crypto';

import { TransactionRollbackError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { DatabaseProjectRepository } from '../../apps/api/src/repositories/project.repository.js';
import type { ProjectSourceFiles } from '../../apps/api/src/services/project.service.js';
import { createDatabase, type Database } from '../../packages/database/src/client.js';
import { users, workspaceMembers, workspaces } from '../../packages/database/src/schema.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('DatabaseProjectRepository', () => {
  it('persists, versions, restores, and archives a four-file project atomically', async () => {
    if (!databaseUrl) return;
    const { db, pool } = createDatabase(databaseUrl);
    const suffix = randomUUID();
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const files: ProjectSourceFiles = {
      'composition.html': '<main>Version one</main>',
      'styles.css': 'main { color: red; }',
      'timeline.js': 'export function buildTimeline() {}',
      'index.ts': 'export const composition = {};',
    };

    try {
      await expect(db.transaction(async (transaction) => {
        await transaction.insert(users).values({ id: userId, email: `project-test-${suffix}@example.com`, displayName: 'Project Test' });
        await transaction.insert(workspaces).values({ id: workspaceId, name: 'Test Workspace', slug: `project-test-${suffix}`, kind: 'team', ownerId: userId });
        await transaction.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });

        const repository = new DatabaseProjectRepository(transaction as unknown as Database);
        const created = await repository.create(workspaceId, userId, {
          name: 'Launch Film', width: 1920, height: 1080, fps: 60, duration: 30, files,
        }, 'initial-source-hash');
        expect(created.project.revision).toBe(1);
        expect(created.version.versionNumber).toBe(1);
        await expect(repository.getCurrentSource(created.project.id)).resolves.toMatchObject({ files });

        const updatedFiles = { ...files, 'composition.html': '<main>Version two</main>' };
        const saved = await repository.saveSource(created.project.id, userId, {
          revision: 1,
          files: updatedFiles,
          message: 'Second version',
        }, 'second-source-hash');
        expect(saved?.project.revision).toBe(2);
        expect(saved?.version.versionNumber).toBe(2);
        await expect(repository.saveSource(created.project.id, userId, { revision: 1, files }, 'stale-hash')).resolves.toBeNull();

        const versions = await repository.listVersions(created.project.id);
        expect(versions.map((version) => version.versionNumber)).toEqual([2, 1]);
        const restored = await repository.restoreVersion(created.project.id, created.version.id, userId, 2, undefined);
        expect(restored?.project.revision).toBe(3);
        expect(restored?.version).toMatchObject({ versionNumber: 3, sourceHash: 'initial-source-hash' });
        await expect(repository.getCurrentSource(created.project.id)).resolves.toMatchObject({ files });

        await expect(repository.archive(created.project.id, 3)).resolves.toBe(true);
        await expect(repository.getProjectAccess(created.project.id, userId)).resolves.toBeNull();
        await expect(repository.list(workspaceId)).resolves.toEqual([]);
        transaction.rollback();
      })).rejects.toBeInstanceOf(TransactionRollbackError);
    } finally {
      await pool.end();
    }
  });
});
