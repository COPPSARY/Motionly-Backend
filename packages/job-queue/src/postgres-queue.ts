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
      availableAt: input.availableAt ?? sql`now()`,
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
        select "id"
        from "queue_tasks"
        where "status" = 'QUEUED'
          and "available_at" <= now()
        order by "priority" desc, "available_at" asc, "created_at" asc
        for update skip locked
        limit 1
      )
      update "queue_tasks" as task
      set "status" = 'LEASED',
          "lease_owner" = ${workerId},
          "lease_expires_at" = ${leaseExpiresAt},
          "attempt_count" = task."attempt_count" + 1,
          "updated_at" = now()
      where task."id" in (select candidate."id" from candidate)
      returning
        task."id" as "id",
        task."type" as "type",
        task."status" as "status",
        task."resource_id" as "resourceId",
        task."priority" as "priority",
        task."available_at" as "availableAt",
        task."lease_owner" as "leaseOwner",
        task."lease_expires_at" as "leaseExpiresAt",
        task."attempt_count" as "attemptCount",
        task."max_attempts" as "maxAttempts",
        task."last_error_code" as "lastErrorCode",
        task."created_at" as "createdAt",
        task."updated_at" as "updatedAt"
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

  async fail(taskId: string, workerId: string, errorCode: string, retryAt?: Date | null): Promise<QueueTaskStatus | null> {
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
        ...(status === 'QUEUED' ? { availableAt: retryAt ?? sql`now()` } : {}),
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
