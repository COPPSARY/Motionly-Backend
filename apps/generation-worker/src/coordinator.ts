import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GenerationModelProvider, ModelContent, ModelEvent, ModelMessage } from '../../../packages/ai-providers/src/types.js';
import { ModelProviderError } from '../../../packages/ai-providers/src/types.js';
import { GenerationToolRegistry, SOURCE_TOOL_DEFINITIONS } from '../../../packages/generation-tools/src/tool-registry.js';
import { SourceWorkspace } from '../../../packages/generation-tools/src/source-workspace.js';
import { compileMotionlySource, type SourceCompileResult } from '../../../packages/generation-tools/src/source-compiler.js';
import { buildCompileRepairPrompt } from '../../../packages/generation-tools/src/prompts/repair-prompt.js';
import { buildMotionlySourceContext } from '../../../packages/generation-tools/src/prompts/source-context.js';
import { buildMotionlySystemPrompt } from '../../../packages/generation-tools/src/prompts/system-prompt.js';
import { loadSkillBundle } from '../../../packages/motionly-skills/src/loader.js';
import { routeSkills } from '../../../packages/motionly-skills/src/router.js';
import type { ProjectSourceFiles } from '../../api/src/services/project.service.js';
import type { GenerationJobContext, WorkerGenerationStore } from './repository.js';

const auditedToolNames = new Set(SOURCE_TOOL_DEFINITIONS.map((tool) => tool.name));
const auditedSourcePaths = new Set(['composition.html', 'styles.css', 'timeline.js', 'index.ts']);
const MAX_MODEL_HISTORY_CHARACTERS = 60_000;

export interface GenerationCoordinatorOptions {
  workspaceRoot: string;
  modelTimeoutMs: number;
  /** @deprecated Rendering sandboxes were removed; retained for callers during migration. */
  sandboxTimeoutMs?: number;
  maxToolTurns?: number;
  maxToolCalls?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  compiler?: (files: ProjectSourceFiles) => Promise<SourceCompileResult>;
}

export class GenerationCoordinator {
  constructor(
    private readonly store: WorkerGenerationStore,
    private readonly provider: GenerationModelProvider,
    optionsOrLegacy: GenerationCoordinatorOptions | unknown,
    legacyOptions?: GenerationCoordinatorOptions,
  ) {
    this.options = legacyOptions ?? optionsOrLegacy as GenerationCoordinatorOptions;
  }

  private readonly options: GenerationCoordinatorOptions;

  async run(generationId: string, signal: AbortSignal): Promise<void> {
    const context = await this.store.getContext(generationId);
    if (!context) throw new Error('Generation job not found.');
    if (['COMPLETED', 'AWAITING_APPLY', 'CANCELLED', 'FAILED'].includes(context.job.status)) return;
    let workspacePath: string | undefined;
    let progress = context.job.progress;
    const modelBudget = { tokens: 0, toolCalls: 0 };
    const cancellation = new AbortController();
    const operationSignal = AbortSignal.any([signal, cancellation.signal]);
    const cancellationPoll = setInterval(() => {
      void this.store.isCancellationRequested(generationId).then((requested) => {
        if (requested && !cancellation.signal.aborted) cancellation.abort(new Error('Generation cancelled.'));
      }).catch(() => undefined);
    }, 500);
    const advance = async (status: Parameters<WorkerGenerationStore['transition']>[0]['status'], stage: string, target: number, message: string) => {
      progress = Math.max(progress, target);
      await this.store.transition({ generationId, status, stage, progress, message });
    };

    try {
      if (context.job.status === 'CANCELLING') {
        await this.finishCancellation(generationId, progress);
        return;
      }
      if (context.job.status === 'PUBLISHING') {
        await this.store.publish(generationId, context.job.createdBy);
        return;
      }
      if (context.job.attemptCount >= context.job.maxAttempts) {
        throw new GenerationFailure('ATTEMPT_BUDGET_EXHAUSTED', 'Generation attempt budget was exhausted before the job could finish.');
      }
      await this.throwIfCancelled(context, progress, operationSignal);
      const bundle = await loadPinnedSkillBundle(context.job.skillBundleVersion);
      const prompt = context.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
      const selectedSkills = routeSkills(bundle, {
        prompt,
        intent: context.job.intent,
        assetTypes: context.assets.map((asset) => asset.contentType),
      });
      const provenance = {
        provider: context.job.provider,
        model: context.job.model,
        skillBundleVersion: context.job.skillBundleVersion,
        skills: selectedSkills.map((skill) => ({ id: skill.id, sha256: skill.sha256, reason: skill.reason })),
      };
      await advance('PREPARING', 'PREPARING_WORKSPACE', 5, 'Preparing isolated project workspace.');
      await mkdir(this.options.workspaceRoot, { recursive: true });
      workspacePath = await mkdtemp(path.join(this.options.workspaceRoot, 'generation-'));
      await writeSourceBundle(workspacePath, context.files);
      const workspace = await SourceWorkspace.open(workspacePath);
      const tools = new GenerationToolRegistry(workspace);
      const systemInstructions = buildMotionlySystemPrompt(selectedSkills.map((skill) => skill.content));
      const history: ModelMessage[] = boundedModelHistory(context.messages.filter((message) => message.role !== 'system')).map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: [{ type: 'text', text: message.content }],
      }));
      history.push({
        role: 'user',
        content: [{
          type: 'text',
          text: buildMotionlySourceContext(context.files),
        }],
      });

      const maxAttempts = Math.min(context.job.maxAttempts, 2);
      let previousFiles = context.files;
      for (let attemptIndex = context.job.attemptCount; attemptIndex < maxAttempts; attemptIndex += 1) {
        await this.throwIfCancelled(context, progress, operationSignal);
        const attempt = await this.store.startAttempt(generationId);
        await advance(attempt.attemptNumber === 1 ? 'GENERATING' : 'GENERATING', 'EDITING_SOURCE', 20, `Editing Motionly source (attempt ${attempt.attemptNumber}).`);
        const toolAudit = { generationId, attemptId: attempt.id, sequence: 0 };
        const modelResult = await this.runToolLoop(context.job.model, systemInstructions, history, tools, modelBudget, toolAudit, operationSignal);
        const files = await workspace.readAll();
        if (sameSourceFiles(previousFiles, files)) {
          await this.store.completeAttempt(attempt.id, {
            finishReason: modelResult.finishReason,
            inputTokens: modelResult.inputTokens,
            outputTokens: modelResult.outputTokens,
            validationSummary: { valid: false, diagnostics: [{ code: 'NO_SOURCE_CHANGE', message: 'The model did not change the Motionly source.' }] },
          });
          throw new GenerationFailure('SOURCE_VALIDATION_FAILED', 'The model did not change the Motionly source.');
        }
        if (!modelResult.submitted) {
          const diagnostics = { valid: false, diagnostics: [{ code: 'CANDIDATE_NOT_SUBMITTED', message: 'The model did not submit a candidate.' }] };
          await this.store.completeAttempt(attempt.id, {
            finishReason: modelResult.finishReason,
            inputTokens: modelResult.inputTokens,
            outputTokens: modelResult.outputTokens,
            validationSummary: { ...diagnostics, provenance } as unknown as Record<string, unknown>,
            ...(modelResult.providerRequestId ? { providerRequestId: modelResult.providerRequestId } : {}),
          });
          throw new GenerationFailure('SOURCE_VALIDATION_FAILED', 'Generated source did not satisfy Motionly requirements.', diagnostics as unknown as Record<string, unknown>);
        }

        await advance('VALIDATING', 'BUILDING_PREVIEW', 50, 'Building and validating the composition.');
        const validationResult = await (this.options.compiler ?? compileMotionlySource)(files);
        const validationSummary = { provenance, source: validationResult };
        await this.store.completeAttempt(attempt.id, {
          finishReason: modelResult.finishReason,
          inputTokens: modelResult.inputTokens,
          outputTokens: modelResult.outputTokens,
          validationSummary,
          ...(modelResult.providerRequestId ? { providerRequestId: modelResult.providerRequestId } : {}),
        });

        if (!validationResult.valid) {
          if (attemptIndex + 1 >= maxAttempts) {
            throw new GenerationFailure('BUILD_FAILED', 'Generated source could not compile.', { diagnostics: validationResult.diagnostics });
          }
          previousFiles = files;
          history.push({
            role: 'user',
            content: [{ type: 'text', text: buildCompileRepairPrompt(validationResult.diagnostics) }],
          });
          await advance('REPAIRING', 'REPAIRING_SOURCE', 65, 'Repairing the compilation error.');
          continue;
        }
        await this.store.saveOutput(generationId, await workspace.readAll(), validationSummary);
        await advance('PUBLISHING', 'PUBLISHING_REVISION', 90, 'Publishing a new immutable project revision.');
        await this.store.publish(generationId, context.job.createdBy);
        return;
      }
    } catch (error) {
      if (await this.store.isCancellationRequested(generationId)) {
        await this.finishCancellation(generationId, progress);
        return;
      }
      if (signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError') {
        const failure = new GenerationFailure('GENERATION_TIMEOUT', 'Generation exceeded its total execution time limit.');
        await this.store.fail(generationId, failure.code, failure.message);
        throw failure;
      }
      if (signal.aborted) throw signal.reason ?? new Error('Generation worker interrupted.');
      const failure = normalizeFailure(error);
      await this.store.fail(generationId, failure.code, failure.message, failure.details);
      throw error;
    } finally {
      clearInterval(cancellationPoll);
      if (workspacePath) await rm(workspacePath, { recursive: true, force: true });
    }
  }

  private async runToolLoop(
    model: string,
    systemInstructions: string,
    history: ModelMessage[],
    tools: GenerationToolRegistry,
    budget: { tokens: number; toolCalls: number },
    audit: { generationId: string; attemptId: string; sequence: number },
    signal: AbortSignal,
  ) {
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = 'STOP';
    let providerRequestId: string | undefined;
    for (let turn = 0; turn < (this.options.maxToolTurns ?? 24); turn += 1) {
      const events: ModelEvent[] = [];
      for await (const event of this.provider.runTurn({
        model,
        systemInstructions,
        messages: history,
        tools: SOURCE_TOOL_DEFINITIONS,
        limits: { maxOutputTokens: this.options.maxOutputTokens ?? 16_000, timeoutMs: this.options.modelTimeoutMs },
      }, signal)) events.push(event);
      const text = events.filter((event): event is Extract<ModelEvent, { type: 'text' }> => event.type === 'text').map((event) => event.text).join('');
      const calls = events.filter((event): event is Extract<ModelEvent, { type: 'tool_call' }> => event.type === 'tool_call');
      for (const usage of events.filter((event): event is Extract<ModelEvent, { type: 'usage' }> => event.type === 'usage')) {
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;
        budget.tokens += usage.totalTokens;
        if (budget.tokens > (this.options.maxTotalTokens ?? 200_000)) {
          throw new GenerationFailure('MODEL_TOKEN_BUDGET_EXHAUSTED', 'The generation exceeded its model token budget.');
        }
      }
      const completion = [...events].reverse().find((event): event is Extract<ModelEvent, { type: 'completed' }> => event.type === 'completed');
      if (completion) {
        finishReason = completion.finishReason;
        providerRequestId = completion.providerRequestId ?? providerRequestId;
      }
      const assistantContent: ModelContent[] = [
        ...(text ? [{ type: 'text' as const, text }] : []),
        ...calls.map((call) => ({ type: 'tool_call' as const, id: call.id, name: call.name, arguments: call.arguments, ...(call.providerState ? { providerState: call.providerState } : {}) })),
      ];
      if (assistantContent.length) history.push({ role: 'assistant', content: assistantContent });
      if (!calls.length) return { inputTokens, outputTokens, finishReason, providerRequestId, submitted: true };
      budget.toolCalls += calls.length;
      if (budget.toolCalls > (this.options.maxToolCalls ?? 100)) {
        throw new GenerationFailure('MODEL_TOOL_BUDGET_EXHAUSTED', 'The generation exceeded its source tool-call budget.');
      }
      const results: ModelContent[] = [];
      for (const call of calls) {
        const startedAt = performance.now();
        audit.sequence += 1;
        let result: Record<string, unknown>;
        try {
          result = await tools.execute(call.name, call.arguments);
        } catch (error) {
          await this.store.recordToolCall({
            generationId: audit.generationId,
            attemptId: audit.attemptId,
            sequence: audit.sequence,
            toolName: auditedToolName(call.name),
            status: 'FAILED',
            inputSummary: summarizeToolInput(call.name, call.arguments),
            errorCode: toolErrorCode(error),
            durationMs: performance.now() - startedAt,
          });
          throw error;
        }
        await this.store.recordToolCall({
          generationId: audit.generationId,
          attemptId: audit.attemptId,
          sequence: audit.sequence,
          toolName: auditedToolName(call.name),
          status: 'SUCCEEDED',
          inputSummary: summarizeToolInput(call.name, call.arguments),
          outputSummary: summarizeToolOutput(result),
          durationMs: performance.now() - startedAt,
        });
        results.push({ type: 'tool_result', id: call.id, name: call.name, result });
      }
      history.push({ role: 'user', content: results });
    }
    throw new GenerationFailure('PROVIDER_OUTPUT_INVALID', 'The model exceeded the tool-turn budget.');
  }


  private async throwIfCancelled(context: GenerationJobContext, progress: number, signal: AbortSignal) {
    if (await this.store.isCancellationRequested(context.job.id)) {
      await this.finishCancellation(context.job.id, progress);
      throw new Error('Generation cancelled.');
    }
    if (signal.aborted) throw signal.reason ?? new Error('Generation worker interrupted.');
  }

  private async finishCancellation(generationId: string, progress: number) {
    try { await this.store.transition({ generationId, status: 'CANCELLING', stage: 'CANCELLING', progress, message: 'Cancelling generation.' }); } catch { /* already cancelling */ }
    try { await this.store.transition({ generationId, status: 'CANCELLED', stage: 'CANCELLED', progress, type: 'CANCELLED', message: 'Generation cancelled.' }); } catch { /* already terminal */ }
  }
}

class GenerationFailure extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'GenerationFailure';
  }
}

async function writeSourceBundle(workspacePath: string, files: ProjectSourceFiles) {
  await Promise.all(Object.entries(files).map(([file, content]) => writeFile(path.join(workspacePath, file), content, 'utf8')));
}

async function loadPinnedSkillBundle(version: string) {
  const match = /^(\d+)\.\d+\.\d+$/.exec(version);
  if (!match?.[1]) throw new GenerationFailure('SKILL_BUNDLE_UNAVAILABLE', 'The queued skill bundle version is invalid.');
  let bundle: Awaited<ReturnType<typeof loadSkillBundle>>;
  try {
    bundle = await loadSkillBundle(`v${match[1]}`);
  } catch {
    throw new GenerationFailure('SKILL_BUNDLE_UNAVAILABLE', 'The queued skill bundle is not available or failed integrity verification.');
  }
  if (bundle.manifest.version !== version) {
    throw new GenerationFailure('SKILL_BUNDLE_UNAVAILABLE', 'The queued skill bundle version does not match the installed catalog.', {
      requested: version,
      available: bundle.manifest.version,
    });
  }
  return bundle;
}

function sameSourceFiles(left: ProjectSourceFiles, right: ProjectSourceFiles) {
  return Object.entries(left).every(([path, content]) => right[path as keyof ProjectSourceFiles] === content);
}

function normalizeFailure(error: unknown) {
  if (error instanceof GenerationFailure) return error;
  if (error instanceof ModelProviderError) return new GenerationFailure(error.code, error.message, { retryable: error.retryable });
  return new GenerationFailure('GENERATION_FAILED', error instanceof Error ? error.message : 'Generation failed.');
}

function summarizeToolInput(toolName: string, value: unknown): Record<string, unknown> {
  const safeToolName = auditedToolName(toolName);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { tool: safeToolName };
  const input = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  if (typeof input.path === 'string') summary.path = auditedSourcePaths.has(input.path) ? input.path : 'INVALID_PATH';
  if (Number.isInteger(input.offset) && Number(input.offset) >= 0) summary.offset = Number(input.offset);
  if (Number.isInteger(input.limit) && Number(input.limit) > 0) summary.limit = Number(input.limit);
  if (typeof input.content === 'string') summary.contentBytes = Buffer.byteLength(input.content, 'utf8');
  if (Array.isArray(input.edits)) {
    summary.editCount = input.edits.length;
    summary.searchBytes = input.edits.reduce((total, edit) => total + textBytes(edit, 'search'), 0);
    summary.replaceBytes = input.edits.reduce((total, edit) => total + textBytes(edit, 'replace'), 0);
  }
  summary.tool = safeToolName;
  return summary;
}

function summarizeToolOutput(value: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const key of ['path', 'bytes', 'edits', 'accepted', 'valid', 'offset', 'totalCharacters', 'truncated', 'nextOffset']) {
    const current = value[key];
    if (current === null || typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') summary[key] = current;
  }
  if (Array.isArray(value.files)) summary.fileCount = value.files.length;
  const report = value.report;
  if (report && typeof report === 'object' && !Array.isArray(report)) {
    const diagnostics = (report as Record<string, unknown>).diagnostics;
    if (Array.isArray(diagnostics)) summary.diagnosticCount = diagnostics.length;
  }
  return summary;
}

function textBytes(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const text = (value as Record<string, unknown>)[key];
  return typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0;
}

function toolErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.name.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_').slice(0, 120) : 'TOOL_ERROR';
}

function auditedToolName(value: string) {
  return auditedToolNames.has(value) ? value : 'UNKNOWN_TOOL';
}

function sampleEvenly<T>(values: T[], maximum: number): T[] {
  if (values.length <= maximum) return [...values];
  const selected: T[] = [];
  for (let index = 0; index < maximum; index += 1) {
    selected.push(values[Math.round(index * (values.length - 1) / (maximum - 1))]!);
  }
  return selected;
}

function boundedModelHistory<T extends { content: string }>(messages: T[]): T[] {
  const selected: T[] = [];
  let remaining = MAX_MODEL_HISTORY_CHARACTERS;
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = messages[index]!;
    if (message.content.length > remaining) continue;
    selected.push(message);
    remaining -= message.content.length;
  }
  return selected.reverse();
}
