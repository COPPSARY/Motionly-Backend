import type { Response } from 'express';
import { z } from 'zod';

import type {
  CreateProjectInput,
  ProjectSourceFiles,
  SaveProjectSourceInput,
  UpdateProjectInput,
} from '../services/project.service.js';
import type { AuthenticatedRequest } from '../types/http.js';

const sourceFilesSchema = z.strictObject({
  'composition.html': z.string().min(1).max(1_000_000),
  'styles.css': z.string().max(1_000_000),
  'timeline.js': z.string().min(1).max(1_000_000),
  'index.ts': z.string().min(1).max(1_000_000),
});
const dimensionsSchema = {
  width: z.number().int().min(1).max(16_384),
  height: z.number().int().min(1).max(16_384),
  fps: z.number().int().min(1).max(240),
  duration: z.number().positive().max(86_400),
};
const createProjectSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  ...dimensionsSchema,
  files: sourceFilesSchema,
});
const updateProjectSchema = z.strictObject({
  revision: z.number().int().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  width: dimensionsSchema.width.optional(),
  height: dimensionsSchema.height.optional(),
  fps: dimensionsSchema.fps.optional(),
  duration: dimensionsSchema.duration.optional(),
}).refine((input) => Object.keys(input).some((key) => key !== 'revision'), {
  message: 'At least one project field must be updated.',
});
const saveSourceSchema = z.strictObject({
  revision: z.number().int().min(1),
  files: sourceFilesSchema,
});
const revisionSchema = z.strictObject({ revision: z.number().int().min(1) });
const idSchema = z.string().uuid();

export interface ProjectControllerService {
  list(userId: string, workspaceId: string): Promise<unknown>;
  create(userId: string, workspaceId: string, input: CreateProjectInput): Promise<unknown>;
  get(userId: string, projectId: string): Promise<unknown>;
  update(userId: string, projectId: string, input: UpdateProjectInput): Promise<unknown>;
  remove(userId: string, projectId: string, revision: number): Promise<void>;
  getSource(userId: string, projectId: string): Promise<unknown>;
  getPreview(userId: string, projectId: string): Promise<unknown>;
  saveSource(userId: string, projectId: string, input: SaveProjectSourceInput): Promise<unknown>;
}

export class ProjectController {
  constructor(private readonly projects: ProjectControllerService) {}

  list = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    response.json({ data: await this.projects.list(request.principal!.user.id, workspaceId) });
  };

  create = async (request: AuthenticatedRequest, response: Response) => {
    const workspaceId = idSchema.parse(request.params.workspaceId);
    const input = createProjectSchema.parse(request.body) as CreateProjectInput;
    response.status(201).json({ data: await this.projects.create(request.principal!.user.id, workspaceId, input) });
  };

  get = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    response.json({ data: await this.projects.get(request.principal!.user.id, projectId) });
  };

  update = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const input = updateProjectSchema.parse(request.body) as UpdateProjectInput;
    response.json({ data: await this.projects.update(request.principal!.user.id, projectId, input) });
  };

  remove = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const { revision } = revisionSchema.parse(request.body);
    await this.projects.remove(request.principal!.user.id, projectId, revision);
    response.status(204).end();
  };

  getSource = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    response.json({ data: await this.projects.getSource(request.principal!.user.id, projectId) });
  };

  getPreview = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    response.json({ data: await this.projects.getPreview(request.principal!.user.id, projectId) });
  };

  saveSource = async (request: AuthenticatedRequest, response: Response) => {
    const projectId = idSchema.parse(request.params.projectId);
    const input = saveSourceSchema.parse(request.body) as { revision: number; files: ProjectSourceFiles; message?: string };
    response.json({ data: await this.projects.saveSource(request.principal!.user.id, projectId, input) });
  };

}
