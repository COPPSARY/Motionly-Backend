import { createHash } from 'node:crypto';

import { AppError } from '../errors.js';
import type { WorkspaceRole } from './workspace.service.js';

export const PROJECT_SOURCE_PATHS = ['composition.html', 'styles.css', 'timeline.js', 'index.ts'] as const;

export type ProjectSourcePath = (typeof PROJECT_SOURCE_PATHS)[number];
export type ProjectSourceFiles = Record<ProjectSourcePath, string>;

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  currentVersionId: string | null;
  revision: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface ProjectVersionRecord {
  id: string;
  projectId: string;
  versionNumber: number;
  sourceHash: string;
  message: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface ProjectSource extends ProjectVersionRecord {
  files: ProjectSourceFiles;
}

export interface CreateProjectInput {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  files: ProjectSourceFiles;
  message?: string;
}

export interface UpdateProjectInput {
  revision: number;
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
}

export interface SaveProjectSourceInput {
  revision: number;
  files: ProjectSourceFiles;
  message?: string;
}

export interface ProjectRepository {
  getWorkspaceMembership(workspaceId: string, userId: string): Promise<{ role: WorkspaceRole } | null>;
  getProjectAccess(projectId: string, userId: string): Promise<{ project: ProjectRecord; role: WorkspaceRole } | null>;
  list(workspaceId: string): Promise<ProjectRecord[]>;
  create(workspaceId: string, userId: string, input: CreateProjectInput, sourceHash: string): Promise<{ project: ProjectRecord; version: ProjectVersionRecord }>;
  update(projectId: string, input: UpdateProjectInput): Promise<ProjectRecord | null>;
  archive(projectId: string, revision: number): Promise<boolean>;
  getCurrentSource(projectId: string): Promise<ProjectSource | null>;
  saveSource(projectId: string, userId: string, input: SaveProjectSourceInput, sourceHash: string): Promise<{ project: ProjectRecord; version: ProjectVersionRecord } | null>;
  listVersions(projectId: string): Promise<ProjectVersionRecord[]>;
  getVersion(projectId: string, versionId: string): Promise<ProjectSource | null>;
  restoreVersion(projectId: string, versionId: string, userId: string, revision: number, message: string | undefined): Promise<{ project: ProjectRecord; version: ProjectVersionRecord } | null>;
}

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async list(userId: string, workspaceId: string) {
    await this.requireWorkspaceMembership(workspaceId, userId);
    return this.repository.list(workspaceId);
  }

  async create(userId: string, workspaceId: string, input: CreateProjectInput) {
    const membership = await this.requireWorkspaceMembership(workspaceId, userId);
    this.requireWriteAccess(membership.role);
    return this.repository.create(workspaceId, userId, input, hashSourceFiles(input.files));
  }

  async get(userId: string, projectId: string) {
    return (await this.requireProjectAccess(projectId, userId)).project;
  }

  async update(userId: string, projectId: string, input: UpdateProjectInput) {
    const access = await this.requireProjectAccess(projectId, userId);
    this.requireWriteAccess(access.role);
    const project = await this.repository.update(projectId, input);
    if (!project) throw await this.revisionConflict(projectId, userId, access.project.revision);
    return project;
  }

  async remove(userId: string, projectId: string, revision: number) {
    const access = await this.requireProjectAccess(projectId, userId);
    this.requireWriteAccess(access.role);
    if (!(await this.repository.archive(projectId, revision))) {
      throw await this.revisionConflict(projectId, userId, access.project.revision);
    }
  }

  async getSource(userId: string, projectId: string) {
    const access = await this.requireProjectAccess(projectId, userId);
    const source = await this.repository.getCurrentSource(projectId);
    if (!source) throw new AppError(409, 'PROJECT_SOURCE_MISSING', 'The project does not have a current source version.');
    return { ...source, revision: access.project.revision };
  }

  async saveSource(userId: string, projectId: string, input: SaveProjectSourceInput) {
    const access = await this.requireProjectAccess(projectId, userId);
    this.requireWriteAccess(access.role);
    const result = await this.repository.saveSource(projectId, userId, input, hashSourceFiles(input.files));
    if (!result) throw await this.revisionConflict(projectId, userId, access.project.revision);
    return result;
  }

  async listVersions(userId: string, projectId: string) {
    await this.requireProjectAccess(projectId, userId);
    return this.repository.listVersions(projectId);
  }

  async getVersion(userId: string, projectId: string, versionId: string) {
    await this.requireProjectAccess(projectId, userId);
    const version = await this.repository.getVersion(projectId, versionId);
    if (!version) throw new AppError(404, 'PROJECT_VERSION_NOT_FOUND', 'Project version not found.');
    return version;
  }

  async restoreVersion(userId: string, projectId: string, versionId: string, revision: number, message?: string) {
    const access = await this.requireProjectAccess(projectId, userId);
    this.requireWriteAccess(access.role);
    if (!(await this.repository.getVersion(projectId, versionId))) {
      throw new AppError(404, 'PROJECT_VERSION_NOT_FOUND', 'Project version not found.');
    }
    const result = await this.repository.restoreVersion(projectId, versionId, userId, revision, message);
    if (!result) throw await this.revisionConflict(projectId, userId, access.project.revision);
    return result;
  }

  private async requireWorkspaceMembership(workspaceId: string, userId: string) {
    const membership = await this.repository.getWorkspaceMembership(workspaceId, userId);
    if (!membership) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found.');
    return membership;
  }

  private async requireProjectAccess(projectId: string, userId: string) {
    const access = await this.repository.getProjectAccess(projectId, userId);
    if (!access) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    return access;
  }

  private requireWriteAccess(role: WorkspaceRole) {
    if (role === 'viewer') throw new AppError(403, 'FORBIDDEN', 'Viewer access is read-only.');
  }

  private async revisionConflict(projectId: string, userId: string, fallbackRevision: number) {
    const current = await this.repository.getProjectAccess(projectId, userId);
    return new AppError(409, 'REVISION_CONFLICT', 'The project changed since it was loaded.', {
      currentRevision: current?.project.revision ?? fallbackRevision,
    });
  }
}

export function hashSourceFiles(files: ProjectSourceFiles) {
  const hash = createHash('sha256');
  for (const path of PROJECT_SOURCE_PATHS) hash.update(path).update('\0').update(files[path]).update('\0');
  return hash.digest('hex');
}
