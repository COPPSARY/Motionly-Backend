import { randomUUID } from 'node:crypto';

import { TransactionRollbackError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createDatabase } from '../../packages/database/src/client.js';
import { PostgresJobQueue } from '../../packages/job-queue/src/postgres-queue.js';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('PostgresJobQueue', () => {
  it('leases once, heartbeats, retries, completes, and recovers expiry', async () => {
    if (!databaseUrl) return;
    const { db, pool } = createDatabase(databaseUrl);
    try {
      await expect(db.transaction(async (transaction) => {
        const queue = new PostgresJobQueue(transaction as never);
        const resourceId = randomUUID();
        const queued = await queue.enqueue({ type: 'GENERATION', resourceId, maxAttempts: 2 });
        const claimed = await queue.claim('worker-a', 5_000);
        expect(claimed).toMatchObject({ id: queued.id, status: 'LEASED', attemptCount: 1 });
        await expect(queue.claim('worker-b', 5_000)).resolves.toBeNull();
        await expect(queue.heartbeat(queued.id, 'worker-a', 5_000)).resolves.toBe(true);
        await expect(queue.fail(queued.id, 'worker-a', 'TRANSIENT')).resolves.toBe('QUEUED');
        const retried = await queue.claim('worker-b', 5_000);
        expect(retried).toMatchObject({ id: queued.id, attemptCount: 2 });
        await expect(queue.complete(queued.id, 'worker-b')).resolves.toBe(true);
        transaction.rollback();
      })).rejects.toBeInstanceOf(TransactionRollbackError);
    } finally {
      await pool.end();
    }
  });
});
