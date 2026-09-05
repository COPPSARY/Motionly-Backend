import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../types/http.js';

const idSchema = z.string().uuid();

export interface ArtifactControllerService {
  list(userId: string, generationId: string): Promise<unknown>;
  download(userId: string, artifactId: string): Promise<{ path: string; contentType: string; fileName: string }>;
}

export class ArtifactController {
  constructor(private readonly artifacts: ArtifactControllerService) {}

  list = async (request: AuthenticatedRequest, response: Response) => {
    const generationId = idSchema.parse(request.params.generationId);
    response.json({ data: await this.artifacts.list(request.principal!.user.id, generationId) });
  };

  download = async (request: AuthenticatedRequest, response: Response) => {
    const artifactId = idSchema.parse(request.params.artifactId);
    const artifact = await this.artifacts.download(request.principal!.user.id, artifactId);
    response.type(artifact.contentType);
    response.download(artifact.path, artifact.fileName);
  };
}
