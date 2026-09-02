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
  { name: 'replace_project_file', description: 'Replace one canonical Motionly source file.', parameters: { type: 'object', properties: { path: { type: 'string', enum: sourcePath.options }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'apply_project_patch', description: 'Apply unambiguous exact search/replace edits to one source file.', parameters: { type: 'object', properties: { path: { type: 'string', enum: sourcePath.options }, edits: { type: 'array', items: { type: 'object', properties: { search: { type: 'string' }, replace: { type: 'string' } }, required: ['search', 'replace'], additionalProperties: false } } }, required: ['path', 'edits'], additionalProperties: false } },
];

export class GenerationToolRegistry {
  constructor(private readonly workspace: SourceWorkspace, private readonly strictValidation = true) {}

  async execute(name: string, rawArguments: unknown): Promise<Record<string, unknown>> {
    switch (name) {
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
      default:
        throw new Error(`Unknown generation tool: ${name}`);
    }
  }
}
