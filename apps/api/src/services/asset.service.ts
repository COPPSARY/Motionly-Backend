import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { PrivateObjectStorage } from '../../../../packages/object-storage/src/types.js';
import { validateAssetMetadata, validateStoredAsset } from '../../../../packages/object-storage/src/asset-validation.js';
import { inspectFileIntegrity } from '../../../../packages/object-storage/src/file-integrity.js';
import { AppError } from '../errors.js';
import type { DatabaseAssetRepository } from '../repositories/asset.repository.js';
import type { WorkspaceRole } from './workspace.service.js';

export interface CreateAssetUploadInput {
  fileName: string;
  contentType: string;
  byteSize: number;
  checksum: string;
}

export class AssetService {
  constructor(private readonly repository: DatabaseAssetRepository, private readonly storage: PrivateObjectStorage) {}

  async createUpload(userId: string, workspaceId: string, input: CreateAssetUploadInput) {
    const access = await this.repository.getWorkspaceAccess(workspaceId, userId);
    if (!access) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    requireWrite(access.role);
    try { validateAssetMetadata(input.fileName, input.contentType, input.byteSize); } catch (error) {
      throw new AppError(422, 'ASSET_METADATA_INVALID', error instanceof Error ? error.message : 'Asset metadata is invalid.');
    }
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const objectKey = `${workspaceId}/assets/${randomUUID()}`;
    const asset = await this.repository.create({
      workspaceId, createdBy: userId, fileName: input.fileName, contentType: input.contentType,
      byteSize: input.byteSize, checksum: input.checksum.toLowerCase(), objectKey, uploadExpiresAt: expiresAt,
    });
    return { uploadId: asset.id, assetId: asset.id, uploadUrl: `/v1/assets/uploads/${asset.id}/content`, expiresAt: expiresAt.toISOString() };
  }

  async upload(userId: string, uploadId: string, content: Readable, contentType: string) {
    const access = await this.repository.getForUser(uploadId, userId);
    if (!access) throw new AppError(404, 'ASSET_UPLOAD_NOT_FOUND', 'Asset upload not found.');
    requireWrite(access.role);
    if (!access.asset.uploadExpiresAt || access.asset.uploadExpiresAt.getTime() < Date.now()) {
      await this.repository.updateState(uploadId, 'FAILED');
      throw new AppError(410, 'ASSET_UPLOAD_EXPIRED', 'Asset upload expired.');
    }
    if (contentType !== access.asset.contentType) throw new AppError(422, 'ASSET_TYPE_MISMATCH', 'Uploaded asset type does not match the declared type.');
    let stored;
    try {
      stored = await this.storage.putStream(access.asset.objectKey, content, contentType, access.asset.byteSize);
    } catch (error) {
      if (error instanceof Error && error.message === 'Stored object exceeded its size limit.') {
        throw new AppError(422, 'ASSET_SIZE_MISMATCH', 'Uploaded asset size does not match the declared size.');
      }
      throw error;
    }
    if (stored.byteSize !== access.asset.byteSize || stored.checksum !== access.asset.checksum) {
      await this.storage.delete(stored.key);
      await this.repository.updateState(uploadId, 'FAILED');
      if (stored.byteSize !== access.asset.byteSize) throw new AppError(422, 'ASSET_SIZE_MISMATCH', 'Uploaded asset size does not match the declared size.');
      throw new AppError(422, 'ASSET_CHECKSUM_MISMATCH', 'Uploaded asset checksum does not match.');
    }
    try {
      await validateStoredAsset(await this.storage.resolvePath(stored.key), contentType);
    } catch {
      await this.storage.delete(stored.key);
      await this.repository.updateState(uploadId, 'FAILED');
      throw new AppError(422, 'ASSET_CONTENT_INVALID', 'Uploaded asset bytes do not match an allowed safe asset type.');
    }
    return { uploaded: true };
  }

  async complete(userId: string, workspaceId: string, uploadId: string) {
    const access = await this.repository.getForCompletion(uploadId, userId);
    if (!access || access.asset.workspaceId !== workspaceId) throw new AppError(404, 'ASSET_UPLOAD_NOT_FOUND', 'Asset upload not found.');
    requireWrite(access.role);
    if (access.asset.state === 'READY') return toAssetResource(access.asset);
    let storedPath: string;
    try { storedPath = await this.storage.resolvePath(access.asset.objectKey); } catch {
      throw new AppError(409, 'ASSET_NOT_UPLOADED', 'Asset content has not been uploaded.');
    }
    const integrity = await inspectFileIntegrity(storedPath);
    if (integrity.byteSize !== access.asset.byteSize || integrity.checksum !== access.asset.checksum) {
      throw new AppError(409, 'ASSET_UPLOAD_INCOMPLETE', 'Asset content has not finished uploading or failed integrity verification.');
    }
    try { await validateStoredAsset(storedPath, access.asset.contentType); } catch {
      throw new AppError(422, 'ASSET_CONTENT_INVALID', 'Uploaded asset bytes do not match an allowed safe asset type.');
    }
    const asset = await this.repository.updateState(uploadId, 'READY');
    return toAssetResource(asset!);
  }

  async list(userId: string, workspaceId: string, page: number, pageSize: number) {
    if (!(await this.repository.getWorkspaceAccess(workspaceId, userId))) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    const result = await this.repository.list(workspaceId, page, pageSize);
    return { data: result.data.map(toAssetResource), pagination: { page, pageSize, totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / pageSize) } };
  }

  async get(userId: string, assetId: string) {
    const access = await this.repository.getReadableForUser(assetId, userId);
    if (!access) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    return toAssetResource(access.asset);
  }

  async download(userId: string, assetId: string) {
    const access = await this.repository.getReadableForUser(assetId, userId);
    if (!access) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    return { path: await this.storage.resolvePath(access.asset.objectKey), contentType: access.asset.contentType, fileName: access.asset.fileName };
  }

  async remove(userId: string, assetId: string) {
    const access = await this.repository.getReadableForUser(assetId, userId);
    if (!access) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    requireWrite(access.role);
    await this.repository.updateState(assetId, 'DELETED');
    await this.storage.delete(access.asset.objectKey);
  }

  async attach(userId: string, projectId: string, assetId: string) {
    const project = await this.repository.getProjectAccess(projectId, userId);
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    requireWrite(project.role);
    const asset = await this.repository.getReadableForUser(assetId, userId);
    if (!asset || asset.asset.workspaceId !== project.project.workspaceId) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    await this.repository.attach(projectId, assetId);
  }

  async detach(userId: string, projectId: string, assetId: string) {
    const project = await this.repository.getProjectAccess(projectId, userId);
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    requireWrite(project.role);
    await this.repository.detach(projectId, assetId);
  }
}

function requireWrite(role: WorkspaceRole) {
  if (role === 'viewer') throw new AppError(403, 'FORBIDDEN', 'Viewer access is read-only.');
}

function toAssetResource(asset: NonNullable<Awaited<ReturnType<DatabaseAssetRepository['updateState']>>>) {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    state: asset.state,
    fileName: asset.fileName,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksum: asset.checksum,
    createdAt: asset.createdAt.toISOString(),
    downloadUrl: asset.state === 'READY' ? `/v1/assets/${asset.id}/download` : null,
  };
}
