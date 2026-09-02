import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';

import type { PrivateObjectStorage } from '../../object-storage/src/types.js';
import { artifacts, assets } from './schema.js';
import type { Database } from './client.js';

export async function runRetentionCleanup(db: Database, storage: PrivateObjectStorage, now = new Date()) {
  const expiredArtifacts = await db.select({ id: artifacts.id, objectKey: artifacts.objectKey }).from(artifacts).where(and(
    isNotNull(artifacts.expiresAt), lt(artifacts.expiresAt, now),
  )).limit(1_000);
  const expiredUploads = await db.select({ id: assets.id, objectKey: assets.objectKey }).from(assets).where(and(
    eq(assets.state, 'PENDING'), isNotNull(assets.uploadExpiresAt), lt(assets.uploadExpiresAt, now),
  )).limit(1_000);

  const deletedArtifactIds = await deleteObjects(storage, expiredArtifacts);
  const deletedUploadIds = await deleteObjects(storage, expiredUploads);
  if (deletedArtifactIds.length) await db.delete(artifacts).where(inArray(artifacts.id, deletedArtifactIds));
  if (deletedUploadIds.length) await db.update(assets).set({ state: 'FAILED', updatedAt: now })
    .where(inArray(assets.id, deletedUploadIds));
  return { deletedArtifacts: deletedArtifactIds.length, expiredUploads: deletedUploadIds.length };
}

async function deleteObjects(
  storage: PrivateObjectStorage,
  items: Array<{ id: string; objectKey: string }>,
): Promise<string[]> {
  const results = await Promise.all(items.map(async (item) => {
    try {
      await storage.delete(item.objectKey);
      return item.id;
    } catch {
      // Keep the database row so a later cleanup run can retry the object deletion.
      return null;
    }
  }));
  return results.filter((id): id is string => id !== null);
}
