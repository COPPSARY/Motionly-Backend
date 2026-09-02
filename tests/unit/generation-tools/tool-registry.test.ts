import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROJECT_SOURCE_PATHS } from '../../../apps/api/src/services/project.service.js';
import { GenerationToolRegistry } from '../../../packages/generation-tools/src/tool-registry.js';
import { SourceWorkspace } from '../../../packages/generation-tools/src/source-workspace.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/src/starter.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('GenerationToolRegistry', () => {
  it('pages large source reads without making the remainder inaccessible', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'motionly-tools-'));
    directories.push(workspacePath);
    const largeComposition = `${STARTER_SOURCE_FILES['composition.html']}<!--${'x'.repeat(210_000)}-->`;
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(
      path.join(workspacePath, file),
      file === 'composition.html' ? largeComposition : STARTER_SOURCE_FILES[file],
      'utf8',
    )));
    const tools = new GenerationToolRegistry(await SourceWorkspace.open(workspacePath));

    const first = await tools.execute('read_project_file', { path: 'composition.html' });
    const second = await tools.execute('read_project_file', { path: 'composition.html', offset: first.nextOffset, limit: 20_000 });

    expect(first).toMatchObject({ offset: 0, truncated: true, nextOffset: 200_000 });
    expect(String(first.content)).toHaveLength(200_000);
    expect(second).toMatchObject({ offset: 200_000, truncated: false, nextOffset: null, totalCharacters: largeComposition.length });
    expect(`${String(first.content)}${String(second.content)}`).toBe(largeComposition);
  });
});
