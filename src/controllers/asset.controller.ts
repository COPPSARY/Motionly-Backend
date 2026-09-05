import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../types/http.js';
import type { CreateAssetUploadInput } from '../services/asset.service.js';

const idSchema = z.string().uuid();
const createUploadSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().regex(/^(?:image|video|audio|font)\/[a-zA-Z0-9.+-]+$/),
  byteSize: z.number().int().min(1).max(100_000_000),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
const listSchema = z.strictObject({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const attachSchema = z.strictObject({ assetId: z.string().uuid() });

export interface AssetControllerService {
  createUpload(userId: string, workspaceId: string, input: CreateAssetUploadInput): Promise<unknown>;
  upload(userId: string, uploadId: string, content: Readable, contentType: string): Promise<unknown>;
  complete(userId: string, workspaceId: string, uploadId: string): Promise<unknown>;
  list(userId: string, workspaceId: string, page: number, pageSize: number): Promise<unknown>;
  get(userId: string, assetId: string): Promise<unknown>;
  download(userId: string, assetId: string): Promise<{ path: string; contentType: string; fileName: string }>;
  remove(userId: string, assetId: string): Promise<void>;
  attach(userId: string, projectId: string, assetId: string): Promise<void>;
  detach(userId: string, projectId: string, assetId: string): Promise<void>;
}

export class AssetController {
  constructor(private readonly assets: AssetControllerService) {}

  createUpload = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    response.status(201).json({ data: await this.assets.createUpload(request.principal!.user.id, workspaceId, createUploadSchema.parse(request.body)) });
  };
  upload = async (request: AuthenticatedRequest, response: Response) => {
    const uploadId = idSchema.parse(request.params.uploadId);
    response.json({ data: await this.assets.upload(request.principal!.user.id, uploadId, request, request.header('content-type') ?? 'application/octet-stream') });
  };
  complete = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    const uploadId = idSchema.parse(request.params.uploadId);
    response.json({ data: await this.assets.complete(request.principal!.user.id, workspaceId, uploadId) });
  };
  list = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    const { page, pageSize } = listSchema.parse(request.query);
    response.json(await this.assets.list(request.principal!.user.id, workspaceId, page, pageSize));
  };
  get = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ data: await this.assets.get(request.principal!.user.id, idSchema.parse(request.params.assetId)) });
  };
  download = async (request: AuthenticatedRequest, response: Response) => {
    const asset = await this.assets.download(request.principal!.user.id, idSchema.parse(request.params.assetId));
    response.type(asset.contentType).download(asset.path, asset.fileName);
  };
  remove = async (request: AuthenticatedRequest, response: Response) => {
    await this.assets.remove(request.principal!.user.id, idSchema.parse(request.params.assetId));
    response.status(204).end();
  };
  attach = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const { assetId } = attachSchema.parse(request.body);
    await this.assets.attach(request.principal!.user.id, projectId, assetId);
    response.status(204).end();
  };
  detach = async (request: AuthenticatedRequest, response: Response) => {
    await this.assets.detach(request.principal!.user.id, idSchema.parse(request.params.projectId), idSchema.parse(request.params.assetId));
    response.status(204).end();
  };
}
