import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { eq, max } from 'drizzle-orm';

import type { Database } from '../../../packages/database/src/client.js';
import { artifacts, generationEvents, generationJobs } from '../../../packages/database/src/schema.js';
import type { PrivateObjectStorage } from '../../../packages/object-storage/src/types.js';
import type { GenerationArtifactSink } from './coordinator.js';

export class DatabaseGenerationArtifactSink implements GenerationArtifactSink {
  constructor(private readonly db: Database, private readonly storage: PrivateObjectStorage) {}

  async persistWorkspaceArtifacts(input: {
    workspaceId: string;
    projectId: string;
    generationId: string;
    attemptId: string;
    workspacePath: string;
  }) {
    const manifestPath = path.join(input.workspacePath, 'artifacts-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frames?: Array<{ file?: unknown }>; video?: { file?: unknown } | null };
    const candidates = [
      { sourcePath: manifestPath, kind: 'VALIDATION_REPORT' as const, retention: 'PROJECT' as const, contentType: 'application/json', extension: 'json', expiresAt: null },
      ...(manifest.frames ?? []).filter((frame): frame is { file: string } => typeof frame.file === 'string').map((frame) => ({
        sourcePath: safeArtifactPath(input.workspacePath, frame.file),
        kind: 'SCREENSHOT' as const,
        retention: 'TEMPORARY' as const,
        contentType: 'image/png',
        extension: 'png',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      })),
      ...(manifest.video && typeof manifest.video.file === 'string' ? [{
        sourcePath: safeArtifactPath(input.workspacePath, manifest.video.file),
        kind: 'VIDEO' as const,
        retention: 'PROJECT' as const,
        contentType: 'video/mp4',
        extension: 'mp4',
        expiresAt: null,
      }] : []),
    ];
    for (const candidate of candidates) {
      const key = [input.workspaceId, input.projectId, input.generationId, input.attemptId, candidate.kind.toLowerCase(), `${randomUUID()}.${candidate.extension}`].join('/');
      const stored = await this.storage.putFile(key, candidate.sourcePath, candidate.contentType);
      let artifact: { id: string } | undefined;
      try {
        [artifact] = await this.db.insert(artifacts).values({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          generationId: input.generationId,
          attemptId: input.attemptId,
          kind: candidate.kind,
          retention: candidate.retention,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksum: stored.checksum,
          objectKey: stored.key,
          expiresAt: candidate.expiresAt,
        }).returning({ id: artifacts.id });
      } catch (error) {
        await this.storage.delete(stored.key).catch(() => undefined);
        throw error;
      }
      if (!artifact) {
        await this.storage.delete(stored.key).catch(() => undefined);
        throw new Error('Unable to persist generation artifact metadata.');
      }
      await this.db.transaction(async (transaction) => {
        const [job] = await transaction.select({ status: generationJobs.status, stage: generationJobs.stage, progress: generationJobs.progress })
          .from(generationJobs).where(eq(generationJobs.id, input.generationId)).for('update').limit(1);
        if (!job) return;
        const [latest] = await transaction.select({ value: max(generationEvents.sequence) }).from(generationEvents)
          .where(eq(generationEvents.generationId, input.generationId));
        await transaction.insert(generationEvents).values({
          generationId: input.generationId,
          sequence: (latest?.value ?? 0) + 1,
          type: 'ARTIFACT_CREATED',
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          data: { artifactId: artifact.id, kind: candidate.kind },
        });
      });
    }
  }
}

function safeArtifactPath(workspace: string, relative: string) {
  const resolved = path.resolve(workspace, relative);
  const root = path.resolve(workspace);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Artifact path escaped workspace.');
  return resolved;
}
