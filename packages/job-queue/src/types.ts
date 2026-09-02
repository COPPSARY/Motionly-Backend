/** `RENDER` is retained only to read historical queue rows. New tasks never use it. */
export type QueueTaskType = 'GENERATION' | 'RENDER' | 'CLEANUP';
export type QueueTaskStatus = 'QUEUED' | 'LEASED' | 'COMPLETED' | 'DEAD';

export interface QueueTask {
  id: string;
  type: QueueTaskType;
  status: QueueTaskStatus;
  resourceId: string;
  priority: number;
  availableAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueTaskInput {
  type: QueueTaskType;
  resourceId: string;
  priority?: number;
  availableAt?: Date;
  maxAttempts?: number;
}

export interface DurableJobQueue {
  enqueue(input: EnqueueTaskInput): Promise<QueueTask>;
  claim(workerId: string, leaseMs: number): Promise<QueueTask | null>;
  heartbeat(taskId: string, workerId: string, leaseMs: number): Promise<boolean>;
  complete(taskId: string, workerId: string): Promise<boolean>;
  fail(taskId: string, workerId: string, errorCode: string, retryAt?: Date | null): Promise<QueueTaskStatus | null>;
  recoverExpired(): Promise<{ requeued: number; dead: number; deadTasks: Array<Pick<QueueTask, 'id' | 'type' | 'resourceId'>> }>;
}
