import { bundleProjectPreview } from '../../api/src/services/project-preview.service.js';
import { PROJECT_SOURCE_PATHS, type ProjectSourceFiles, type ProjectSourcePath, hashSourceFiles } from '../../api/src/services/project.service.js';
import type { GenerationModelProvider, ModelResponse, ModelToolDefinition } from '../../../packages/ai-providers/src/types.js';
import { loadSkillBundle } from '../../../packages/motionly-skills/src/loader.js';
import { routeSkills } from '../../../packages/motionly-skills/src/router.js';
import type { GenerationJobContext, WorkerGenerationStore } from './repository.js';

const changedFilesTool: ModelToolDefinition = {
  name: 'return_changed_files',
  description: 'Return the Motionly source files that must be changed for the user request.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['changes'],
    properties: {
      changes: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', enum: PROJECT_SOURCE_PATHS },
            content: { type: 'string' },
          },
        },
      },
    },
  },
};

export interface GenerationCoordinatorOptions {
  modelTimeoutMs: number;
  maxOutputTokens?: number;
}

export class GenerationCoordinator {
  constructor(
    private readonly store: WorkerGenerationStore,
    private readonly provider: GenerationModelProvider,
    private readonly options: GenerationCoordinatorOptions,
  ) {}

  async run(generationId: string, signal: AbortSignal): Promise<void> {
    const context = await this.store.getContext(generationId);
    if (!context || isTerminal(context.job.status)) return;

    await this.abortIfCancelled(generationId);
    await this.store.transition({
      generationId,
      status: 'PREPARING',
      stage: 'LOADING_SOURCE',
      progress: 10,
      message: 'Reading the current Motionly source.',
    });

    const bundle = await loadSkillBundle();
    const routedSkills = routeSkills(bundle, {
      prompt: context.prompt,
      intent: context.job.intent,
      maxCharacters: 12_000,
    });

    await this.store.transition({
      generationId,
      status: 'GENERATING',
      stage: 'GENERATING',
      progress: 35,
      message: 'Asking AI for the source edit.',
    });

    const response = await this.provider.generate({
      model: context.job.model,
      systemInstructions: buildSystemInstructions(routedSkills),
      prompt: buildPrompt(context),
      tools: [changedFilesTool],
      limits: {
        maxOutputTokens: this.options.maxOutputTokens ?? 8_000,
        timeoutMs: this.options.modelTimeoutMs,
      },
    }, signal);

    const changes = extractChanges(response);
    const files = applyChanges(context.files, changes);
    assertChanged(context.files, files);

    await this.abortIfCancelled(generationId);
    await this.store.transition({
      generationId,
      status: 'VALIDATING',
      stage: 'COMPILE_CHECK',
      progress: 75,
      message: 'Checking the edited source.',
    });
    await bundleProjectPreview(files);

    await this.store.transition({
      generationId,
      status: 'PUBLISHING',
      stage: 'SAVING_REVISION',
      progress: 90,
      message: 'Saving the new revision.',
    });
    await this.store.saveRevision(generationId, files);
  }

  private async abortIfCancelled(generationId: string) {
    if (await this.store.isCancellationRequested(generationId)) {
      await this.store.transition({
        generationId,
        status: 'CANCELLED',
        stage: 'CANCELLED',
        progress: 100,
        type: 'CANCELLED',
        message: 'Generation cancelled.',
      });
      throw generationError('GENERATION_CANCELLED', 'Generation cancelled.');
    }
  }
}

function buildSystemInstructions(skills: ReturnType<typeof routeSkills>): string {
  return [
    'You are editing a Motionly code-first composition.',
    'Make exactly one tool call to return_changed_files. Return only changed files, not the full project.',
    'Only these files may be edited: composition.html, styles.css, timeline.js, index.ts.',
    'Do not add generated code that uses network access, Node/system APIs, external scripts, or remote URLs.',
    'Preserve unrelated source exactly.',
    '',
    skills.map((skill) => `# Skill: ${skill.id}\n${skill.content}`).join('\n\n'),
  ].join('\n');
}

function buildPrompt(context: GenerationJobContext): string {
  return [
    `User request:\n${context.prompt}`,
    '',
    'Current files:',
    ...PROJECT_SOURCE_PATHS.map((path) => `\n--- ${path} ---\n${context.files[path]}`),
  ].join('\n');
}

function extractChanges(response: ModelResponse): Partial<ProjectSourceFiles> {
  const call = response.toolCalls.find((toolCall) => toolCall.name === changedFilesTool.name);
  if (!call) throw generationError('MODEL_DID_NOT_RETURN_FILES', 'The AI did not return changed files.');
  const rawChanges = call.arguments.changes;
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    throw generationError('MODEL_DID_NOT_RETURN_FILES', 'The AI returned no changed files.');
  }
  const changes: Partial<ProjectSourceFiles> = {};
  for (const rawChange of rawChanges) {
    if (!rawChange || typeof rawChange !== 'object') {
      throw generationError('MODEL_OUTPUT_INVALID', 'The AI returned an invalid changed file entry.');
    }
    const path = (rawChange as { path?: unknown }).path;
    const content = (rawChange as { content?: unknown }).content;
    if (!isProjectSourcePath(path)) {
      throw generationError('FILE_NOT_ALLOWED', `AI tried to edit a file that is not allowed: ${String(path)}`);
    }
    if (typeof content !== 'string') {
      throw generationError('MODEL_OUTPUT_INVALID', `AI returned non-text content for ${path}.`);
    }
    if (changes[path] !== undefined) {
      throw generationError('MODEL_OUTPUT_INVALID', `AI returned ${path} more than once.`);
    }
    changes[path] = content;
  }
  return changes;
}

function applyChanges(current: ProjectSourceFiles, changes: Partial<ProjectSourceFiles>): ProjectSourceFiles {
  return {
    'composition.html': changes['composition.html'] ?? current['composition.html'],
    'styles.css': changes['styles.css'] ?? current['styles.css'],
    'timeline.js': changes['timeline.js'] ?? current['timeline.js'],
    'index.ts': changes['index.ts'] ?? current['index.ts'],
  };
}

function assertChanged(current: ProjectSourceFiles, next: ProjectSourceFiles): void {
  if (hashSourceFiles(current) === hashSourceFiles(next)) {
    throw generationError('NO_SOURCE_CHANGES', 'The AI did not change any source file.');
  }
}

function isProjectSourcePath(value: unknown): value is ProjectSourcePath {
  return typeof value === 'string' && (PROJECT_SOURCE_PATHS as readonly string[]).includes(value);
}

function isTerminal(status: string): boolean {
  return ['COMPLETED', 'CANCELLED', 'FAILED'].includes(status);
}

function generationError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
