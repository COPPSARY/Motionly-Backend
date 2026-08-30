import type { Response } from 'express';
import { z } from 'zod';

import type { WorkspaceRole } from '../services/workspace.service.js';
import type { AuthenticatedRequest } from '../types/http.js';

const workspaceSchema = z.object({ name: z.string().trim().min(1).max(80) });
const memberSchema = z.object({ email: z.email().max(320), role: z.enum(['owner', 'editor', 'viewer']) });
const roleSchema = z.object({ role: z.enum(['owner', 'editor', 'viewer']) });

export interface WorkspaceControllerService {
  list(userId: string): Promise<unknown>;
  create(userId: string, input: { name: string }): Promise<unknown>;
  get(userId: string, workspaceId: string): Promise<unknown>;
  update(userId: string, workspaceId: string, input: { name: string }): Promise<unknown>;
  listMembers(userId: string, workspaceId: string): Promise<unknown>;
  addMember(userId: string, workspaceId: string, input: { email: string; role: WorkspaceRole }): Promise<unknown>;
  updateMember(userId: string, workspaceId: string, memberId: string, role: WorkspaceRole): Promise<unknown>;
  removeMember(workspaceId: string, actorId: string, targetId: string): Promise<void>;
}

export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceControllerService) {}

  list = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ data: await this.workspaces.list(request.principal!.user.id) });
  };
  create = async (request: AuthenticatedRequest, response: Response) => {
    response.status(201).json({ data: await this.workspaces.create(request.principal!.user.id, workspaceSchema.parse(request.body)) });
  };
  get = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ data: await this.workspaces.get(request.principal!.user.id, request.params.workspaceId as string) });
  };
  update = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ data: await this.workspaces.update(request.principal!.user.id, request.params.workspaceId as string, workspaceSchema.parse(request.body)) });
  };
  listMembers = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ data: await this.workspaces.listMembers(request.principal!.user.id, request.params.workspaceId as string) });
  };
  addMember = async (request: AuthenticatedRequest, response: Response) => {
    response.status(201).json({ data: await this.workspaces.addMember(request.principal!.user.id, request.params.workspaceId as string, memberSchema.parse(request.body)) });
  };
  updateMember = async (request: AuthenticatedRequest, response: Response) => {
    const { role } = roleSchema.parse(request.body);
    response.json({ data: await this.workspaces.updateMember(request.principal!.user.id, request.params.workspaceId as string, request.params.userId as string, role) });
  };
  removeMember = async (request: AuthenticatedRequest, response: Response) => {
    await this.workspaces.removeMember(request.params.workspaceId as string, request.principal!.user.id, request.params.userId as string);
    response.status(204).end();
  };
}
