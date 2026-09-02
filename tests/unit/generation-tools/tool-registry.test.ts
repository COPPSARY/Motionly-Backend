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
  it('replaces a file successfully', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'motionly-tools-'));
    directories.push(workspacePath);
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(
      path.join(workspacePath, file),
      STARTER_SOURCE_FILES[file],
      'utf8',
    )));
    const tools = new GenerationToolRegistry(await SourceWorkspace.open(workspacePath));

    const result = await tools.execute('replace_project_file', { path: 'composition.html', content: 'hello' });

    expect(result).toMatchObject({ path: 'composition.html', bytes: 5 });
  });
});
