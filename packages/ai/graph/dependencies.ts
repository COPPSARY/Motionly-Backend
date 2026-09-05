import { loadSkillBundle, type LoadedSkill, type SkillManifest } from '../../motionly-skills/loader.js';
import type { ChatMessage, MotionlyGeneration, MotionModelProvider } from '../providers/model.provider.js';
import type { Intent } from '../schemas/intent.schema.js';
import { validateMotionlyGeneration, type ValidationError, type ValidationReport } from '../validation/generation-validator.js';

/** Scenes are stored exactly as the model produced them inside the generation contract. */
export type MotionlyScene = MotionlyGeneration['scenes'][number];

/** Intents that load project context, generate source, and may overwrite the project. */
export type GenerationIntent = Extract<Intent, 'CREATE' | 'EDIT' | 'FIX'>;

/** Mirrors the `workspace_role` database enum. */
export type GraphWorkspaceRole = 'owner' | 'editor' | 'viewer';

/** The current, mutable Motionly project state the frontend renders. */
export interface MotionlyProject {
    id: string;
    workspaceId: string;
    title: string;
    duration: number;
    width: number;
    height: number;
    fps: number;
    scenes: MotionlyScene[];
    compositionHtml: string;
    timelineJs: string;
    revision: number;
}

export interface StoredMessageInput {
    projectId: string;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    intent: Intent;
}

export interface OverwriteGraphProjectInput {
    userId: string;
    expectedRevision: number;
    intent: GenerationIntent;
    generation: MotionlyGeneration;
    model: string;
    selectedSkills: string[];
    repairAttempts: number;
    latencyMs: number;
}

export interface CreateGraphProjectInput {
    message: string;
    generation: MotionlyGeneration;
    model: string;
    selectedSkills: string[];
    repairAttempts: number;
    latencyMs: number;
}

export interface GenerationRunInput {
    projectId: string;
    baseRevision: number;
    savedRevision: number | null;
    intent: GenerationIntent;
    model: string;
    selectedSkills: string[];
    repairAttempts: number;
    status: 'COMPLETED' | 'FAILED';
    latencyMs: number;
}

/**
 * Persistence port for the graph. `overwriteForGraph` must compare the expected
 * revision, write every generated field, append the assistant message, and record
 * the completed run inside one transaction, returning `null` for a stale revision.
 * `createForGraph` must verify workspace write access itself and return `null` when
 * the user may not create in that workspace.
 */
export interface GraphProjectRepository {
    loadProjectAccess(projectId: string, userId: string): Promise<{ workspaceId: string; role: GraphWorkspaceRole } | null>;
    loadForGraph(projectId: string, userId: string): Promise<{ project: MotionlyProject; role: GraphWorkspaceRole } | null>;
    listRecentMessages(projectId: string, limit: number): Promise<ChatMessage[]>;
    appendMessage(input: StoredMessageInput): Promise<void>;
    createForGraph(workspaceId: string, userId: string, input: CreateGraphProjectInput): Promise<MotionlyProject | null>;
    overwriteForGraph(projectId: string, input: OverwriteGraphProjectInput): Promise<MotionlyProject | null>;
    recordRun(input: GenerationRunInput): Promise<void>;
}

export type MotionGraphResponse =
    | { type: 'chat'; message: string }
    | { type: 'plan'; message: string }
    | { type: 'generation'; message: string; projectId: string; revision: number; created: boolean }
    | { type: 'error'; code: 'PROJECT_NOT_FOUND' | 'FORBIDDEN'; message: string }
    | { type: 'error'; code: 'REVISION_CONFLICT'; message: string; currentRevision: number }
    | { type: 'error'; code: 'GENERATION_INVALID'; message: string; errors: ValidationError[] };

export interface MotionGraphInput {
    userId: string;
    workspaceId: string;
    message: string;
    /** Absent for a first generation: the graph then creates a project in the workspace. */
    projectId?: string;
    /** Present only when the frontend reports a rendering failure; selects `FIX`. */
    runtimeError?: { message: string };
    /** Revision the caller generated against; required for runtime repair. */
    revision?: number;
}

export interface SkillBundle {
    manifest: SkillManifest;
    skills: LoadedSkill[];
}

export interface MotionGraphDependencies {
    provider: MotionModelProvider;
    repository: GraphProjectRepository;
    model: string;
    loadSkills?: () => Promise<SkillBundle>;
    validate?: (generation: MotionlyGeneration) => ValidationReport;
    now?: () => number;
    maxRepairAttempts?: number;
    historyLimit?: number;
}

export interface ResolvedMotionGraphDependencies {
    provider: MotionModelProvider;
    repository: GraphProjectRepository;
    model: string;
    loadSkills: () => Promise<SkillBundle>;
    validate: (generation: MotionlyGeneration) => ValidationReport;
    now: () => number;
    maxRepairAttempts: number;
    historyLimit: number;
}

export const MAX_REPAIR_ATTEMPTS = 2;
export const RECENT_MESSAGE_LIMIT = 12;

export function resolveMotionGraphDependencies(
    dependencies: MotionGraphDependencies,
): ResolvedMotionGraphDependencies {
    return {
        provider: dependencies.provider,
        repository: dependencies.repository,
        model: dependencies.model,
        loadSkills: dependencies.loadSkills ?? (() => loadSkillBundle('v1')),
        validate: dependencies.validate ?? validateMotionlyGeneration,
        now: dependencies.now ?? (() => Date.now()),
        maxRepairAttempts: dependencies.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS,
        historyLimit: dependencies.historyLimit ?? RECENT_MESSAGE_LIMIT,
    };
}

export function isGenerationIntent(intent: Intent | undefined): intent is GenerationIntent {
    return intent === 'CREATE' || intent === 'EDIT' || intent === 'FIX';
}

/**
 * Graph routing guarantees these values before the generation nodes run; the guards
 * turn a broken graph wiring into an obvious error instead of a bad model call.
 */
export function requireGenerationIntent(intent: Intent | undefined): GenerationIntent {
    if (!isGenerationIntent(intent)) throw new Error('A Motionly generation node ran without a generation intent.');
    return intent;
}

export function requireProject(project: MotionlyProject | undefined): MotionlyProject {
    if (!project) throw new Error('A Motionly generation node ran without a loaded project.');
    return project;
}

export function requireCandidate(generation: MotionlyGeneration | undefined): MotionlyGeneration {
    if (!generation) throw new Error('A Motionly generation node ran without a candidate generation.');
    return generation;
}
