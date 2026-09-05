import type { PrivateObjectStorage } from '../../packages/object-storage/types.js';
import { AppError } from '../errors.js';
import type { ArtifactRepository } from '../repositories/artifact.repository.js';

export class ArtifactService {
  constructor(private readonly repository: ArtifactRepository, private readonly storage: PrivateObjectStorage) {}

  async list(userId: string, generationId: string) {
    if (!(await this.repository.generationExistsForUser(generationId, userId))) {
      throw new AppError(404, 'GENERATION_NOT_FOUND', 'Generation not found.');
    }
    return (await this.repository.listForGeneration(generationId)).map(toResource);
  }

  async download(userId: string, artifactId: string) {
    const artifact = await this.repository.getForUser(artifactId, userId);
    if (!artifact) throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Artifact not found.');
    return {
      path: await this.storage.resolvePath(artifact.objectKey),
      contentType: artifact.contentType,
      fileName: `${artifact.kind.toLowerCase()}-${artifact.id}${extensionFor(artifact.contentType)}`,
    };
  }
}

function toResource(artifact: Awaited<ReturnType<ArtifactRepository['listForGeneration']>>[number]) {
  return {
    id: artifact.id,
    generationId: artifact.generationId,
    kind: artifact.kind,
    retention: artifact.retention,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    checksum: artifact.checksum,
    createdAt: artifact.createdAt.toISOString(),
    downloadUrl: `/v1/artifacts/${artifact.id}/download`,
  };
}

function extensionFor(contentType: string) {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'video/mp4') return '.mp4';
  if (contentType === 'application/json') return '.json';
  return '';
}
