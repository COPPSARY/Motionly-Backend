import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROJECT_SOURCE_PATHS, type ProjectSourceFiles } from '../../../apps/api/src/services/project.service.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/src/starter.js';
import { SourceWorkspace } from '../../../packages/generation-tools/src/source-workspace.js';
import { validateMotionlySource } from '../../../packages/generation-tools/src/source-policy.js';
import { GenerationToolRegistry } from '../../../packages/generation-tools/src/tool-registry.js';

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function workspace() {
  const directory = await mkdtemp(path.join(tmpdir(), 'motionly-source-test-'));
  temporaryDirectories.push(directory);
  await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(path.join(directory, file), STARTER_SOURCE_FILES[file], 'utf8')));
  return SourceWorkspace.open(directory);
}

describe('Motionly source policy and tools', () => {
  it('accepts the backend starter and reports registered/editable layers', () => {
    const report = validateMotionlySource({ ...STARTER_SOURCE_FILES });
    expect(report.valid).toBe(true);
    expect(report.registeredIds).toContain('stage');
    expect(report.editableIds).toContain('stage');
  });

  it('allows exact patches and rejects traversal, unknown tools, and ambiguous patches', async () => {
    const source = await workspace();
    const tools = new GenerationToolRegistry(source);
    await expect(tools.execute('apply_project_patch', {
      path: 'composition.html',
      edits: [{ search: '<main class="motionly-stage" data-edit="stage"></main>', replace: '<main class="motionly-stage" data-edit="stage">Changed</main>' }],
    })).resolves.toMatchObject({ edits: 1 });
    await expect(source.read('composition.html')).resolves.toContain('Changed</main>');
    await expect(source.read('../secret')).rejects.toThrow('not allowed');
    await expect(tools.execute('shell', { command: 'whoami' })).rejects.toThrow('Unknown generation tool');
    await expect(source.applyEdits('composition.html', [{ search: 'motionly', replace: 'x' }])).rejects.toThrow('ambiguous');
  });
});
