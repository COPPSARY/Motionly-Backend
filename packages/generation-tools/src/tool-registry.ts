import { z } from 'zod';

import type { ModelToolDefinition } from '../../ai-providers/src/types.js';
import { SourceWorkspace } from './source-workspace.js';
import { validateMotionlySource } from './source-policy.js';

const sourcePath = z.enum(['composition.html', 'styles.css', 'timeline.js', 'index.ts']);
const MAX_READ_CHARACTERS = 200_000;
const readSchema = z.strictObject({
  path: sourcePath,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(MAX_READ_CHARACTERS).default(MAX_READ_CHARACTERS),
});
const replaceSchema = z.strictObject({ path: sourcePath, content: z.string().max(1_000_000) });
const patchSchema = z.strictObject({
  path: sourcePath,
  edits: z.array(z.strictObject({ search: z.string().min(1).max(200_000), replace: z.string().max(200_000) })).min(1).max(100),
});

export const SOURCE_TOOL_DEFINITIONS: ModelToolDefinition[] = [
  { name: 'list_project_files', description: 'List the canonical Motionly source files.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'read_project_file',
    description: 'Read a bounded page from one canonical Motionly source file. Continue from nextOffset when truncated is true.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', enum: sourcePath.options },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_READ_CHARACTERS },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  { name: 'replace_project_file', description: 'Replace one canonical Motionly source file.', parameters: { type: 'object', properties: { path: { type: 'string', enum: sourcePath.options }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'apply_project_patch', description: 'Apply unambiguous exact search/replace edits to one source file.', parameters: { type: 'object', properties: { path: { type: 'string', enum: sourcePath.options }, edits: { type: 'array', items: { type: 'object', properties: { search: { type: 'string' }, replace: { type: 'string' } }, required: ['search', 'replace'], additionalProperties: false } } }, required: ['path', 'edits'], additionalProperties: false } },
  { name: 'run_source_checks', description: 'Validate the complete source against Motionly architecture and safety rules.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'submit_candidate', description: 'Submit the current workspace as the candidate after source checks pass.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
];

export class GenerationToolRegistry {
  constructor(private readonly workspace: SourceWorkspace) {}

  async execute(name: string, rawArguments: unknown): Promise<Record<string, unknown>> {
    switch (name) {
      case 'list_project_files':
        z.strictObject({}).parse(rawArguments);
        return { files: this.workspace.list() };
      case 'read_project_file': {
        const { path, offset, limit } = readSchema.parse(rawArguments);
        const source = await this.workspace.read(path);
        const end = Math.min(source.length, offset + limit);
        return {
          path,
          offset,
          content: source.slice(offset, end),
          totalCharacters: source.length,
          truncated: end < source.length,
          nextOffset: end < source.length ? end : null,
        };
      }
      case 'replace_project_file': {
        const { path, content } = replaceSchema.parse(rawArguments);
        await this.workspace.replace(path, content);
        return { path, bytes: Buffer.byteLength(content, 'utf8') };
      }
      case 'apply_project_patch': {
        const { path, edits } = patchSchema.parse(rawArguments);
        const content = await this.workspace.applyEdits(path, edits);
        return { path, bytes: Buffer.byteLength(content, 'utf8'), edits: edits.length };
      }
      case 'run_source_checks': {
        z.strictObject({}).parse(rawArguments);
        return validateMotionlySource(await this.workspace.readAll()) as unknown as Record<string, unknown>;
      }
      case 'submit_candidate': {
        z.strictObject({}).parse(rawArguments);
        const report = validateMotionlySource(await this.workspace.readAll());
        if (!report.valid) return { accepted: false, report };
        return { accepted: true, report };
      }
      default:
        throw new Error(`Unknown generation tool: ${name}`);
    }
  }
}
