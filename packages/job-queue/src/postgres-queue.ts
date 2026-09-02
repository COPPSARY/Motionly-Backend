import { and, eq, lt, sql } from 'drizzle-orm';

import type { Database } from '../../database/src/client.js';
import { queueTasks } from '../../database/src/schema.js';
import type { DurableJobQueue, EnqueueTaskInput, QueueTask, QueueTaskStatus } from './types.js';

export class PostgresJobQueue implements DurableJobQueue {
  constructor(private readonly db: Database) {}

  async enqueue(input: EnqueueTaskInput): Promise<QueueTask> {
    const [task] = await this.db.insert(queueTasks).values({
      type: input.type,
      resourceId: input.resourceId,
      priority: input.priority ?? 0,
      availableAt: input.availableAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
    }).returning();
    if (!task) throw new Error('Unable to enqueue task.');
    return task;
  }

  async claim(workerId: string, leaseMs: number): Promise<QueueTask | null> {
    validateWorker(workerId, leaseMs);
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    const result = await this.db.execute(sql`
      with candidate as (
        select ${queueTasks.id}
        from ${queueTasks}
        where ${queueTasks.status} = 'QUEUED'
          and ${queueTasks.availableAt} <= now()
        order by ${queueTasks.priority} desc, ${queueTasks.availableAt} asc, ${queueTasks.createdAt} asc
        for update skip locked
        limit 1
      )
      update ${queueTasks}
      set ${queueTasks.status} = 'LEASED',
          ${queueTasks.leaseOwner} = ${workerId},
          ${queueTasks.leaseExpiresAt} = ${leaseExpiresAt},
          ${queueTasks.attemptCount} = ${queueTasks.attemptCount} + 1,
          ${queueTasks.updatedAt} = now()
      where ${queueTasks.id} in (select ${queueTasks.id} from candidate)
      returning
        ${queueTasks.id} as "id",
        ${queueTasks.type} as "type",
        ${queueTasks.status} as "status",
        ${queueTasks.resourceId} as "resourceId",
        ${queueTasks.priority} as "priority",
        ${queueTasks.availableAt} as "availableAt",
        ${queueTasks.leaseOwner} as "leaseOwner",
        ${queueTasks.leaseExpiresAt} as "leaseExpiresAt",
        ${queueTasks.attemptCount} as "attemptCount",
        ${queueTasks.maxAttempts} as "maxAttempts",
        ${queueTasks.lastErrorCode} as "lastErrorCode",
        ${queueTasks.createdAt} as "createdAt",
        ${queueTasks.updatedAt} as "updatedAt"
    `);
    return (result.rows[0] as QueueTask | undefined) ?? null;
  }

  async heartbeat(taskId: string, workerId: string, leaseMs: number): Promise<boolean> {
    validateWorker(workerId, leaseMs);
    const [task] = await this.db.update(queueTasks).set({
      leaseExpiresAt: new Date(Date.now() + leaseMs),
      updatedAt: new Date(),
    }).where(and(
      eq(queueTasks.id, taskId),
      eq(queueTasks.status, 'LEASED'),
      eq(queueTasks.leaseOwner, workerId),
    )).returning({ id: queueTasks.id });
    return Boolean(task);
  }

  async complete(taskId: string, workerId: string): Promise<boolean> {
    const [task] = await this.db.update(queueTasks).set({
      status: 'COMPLETED',
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(queueTasks.id, taskId),
      eq(queueTasks.status, 'LEASED'),
      eq(queueTasks.leaseOwner, workerId),
    )).returning({ id: queueTasks.id });
    return Boolean(task);
  }

  async fail(taskId: string, workerId: string, errorCode: string, retryAt: Date | null = new Date()): Promise<QueueTaskStatus | null> {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(queueTasks).where(and(
        eq(queueTasks.id, taskId),
        eq(queueTasks.status, 'LEASED'),
        eq(queueTasks.leaseOwner, workerId),
      )).for('update').limit(1);
      if (!current) return null;
      const status: QueueTaskStatus = retryAt === null || current.attemptCount >= current.maxAttempts ? 'DEAD' : 'QUEUED';
      await transaction.update(queueTasks).set({
        status,
        ...(retryAt ? { availableAt: retryAt } : {}),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: errorCode,
        updatedAt: new Date(),
      }).where(eq(queueTasks.id, taskId));
      return status;
    });
  }

  async recoverExpired() {
    const now = new Date();
    const dead = await this.db.update(queueTasks).set({
      status: 'DEAD',
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: 'LEASE_EXPIRED',
      updatedAt: now,
    }).where(and(
      eq(queueTasks.status, 'LEASED'),
      lt(queueTasks.leaseExpiresAt, now),
      sql`${queueTasks.attemptCount} >= ${queueTasks.maxAttempts}`,
    )).returning({ id: queueTasks.id, type: queueTasks.type, resourceId: queueTasks.resourceId });
    const requeued = await this.db.update(queueTasks).set({
      status: 'QUEUED',
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: 'LEASE_EXPIRED',
      availableAt: now,
      updatedAt: now,
    }).where(and(
      eq(queueTasks.status, 'LEASED'),
      lt(queueTasks.leaseExpiresAt, now),
      sql`${queueTasks.attemptCount} < ${queueTasks.maxAttempts}`,
    )).returning({ id: queueTasks.id });
    return { requeued: requeued.length, dead: dead.length, deadTasks: dead };
  }
}

function validateWorker(workerId: string, leaseMs: number) {
  if (!workerId.trim() || workerId.length > 200) throw new Error('A valid worker ID is required.');
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) {
    throw new Error('Lease duration must be between 1 second and 1 hour.');
  }
}
