import { randomUUID } from 'node:crypto';

import { eq, TransactionRollbackError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { DatabaseProjectRepository } from '../../apps/api/src/repositories/project.repository.js';
import { hashSourceFiles, type ProjectSourceFiles } from '../../apps/api/src/services/project.service.js';
import { createDatabase, type Database } from '../../packages/database/src/client.js';
import { projectFiles, users, workspaceMembers, workspaces } from '../../packages/database/src/schema.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('DatabaseProjectRepository', () => {
  it('replaces one rolling four-file snapshot atomically and skips unchanged saves', async () => {
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
        }, hashSourceFiles(files));
        expect(created.revision).toBe(1);
        await expect(repository.getCurrentSource(created.id)).resolves.toMatchObject({ files });

        const updatedFiles = { ...files, 'composition.html': '<main>Version two</main>' };
        const updatedHash = hashSourceFiles(updatedFiles);
        const saved = await repository.saveSource(created.id, {
          revision: 1,
          files: updatedFiles,
        }, updatedHash);
        expect(saved?.project.revision).toBe(2);
        expect(saved?.unchanged).toBe(false);
        await expect(repository.getCurrentSource(created.id)).resolves.toMatchObject({
          sourceHash: updatedHash,
          files: updatedFiles,
        });

        const unchanged = await repository.saveSource(created.id, { revision: 2, files: updatedFiles }, updatedHash);
        expect(unchanged).toMatchObject({ project: { revision: 2 }, unchanged: true });
        await expect(repository.saveSource(created.id, { revision: 1, files }, hashSourceFiles(files))).resolves.toBeNull();
        const storedFiles = await transaction.select().from(projectFiles).where(eq(projectFiles.projectId, created.id));
        expect(storedFiles).toHaveLength(4);

        await expect(repository.archive(created.id, 2)).resolves.toBe(true);
        await expect(repository.getProjectAccess(created.id, userId)).resolves.toBeNull();
        await expect(repository.list(workspaceId)).resolves.toEqual([]);
        transaction.rollback();
      })).rejects.toBeInstanceOf(TransactionRollbackError);
    } finally {
      await pool.end();
    }
  });
});
