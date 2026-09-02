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
    expect(report.registeredIds).toContain('title');
    expect(report.editableIds).toContain('title');
  });

  it.each([
    ['timeline.js', "fetch('https://evil.example')", 'REMOTE_SOURCE_FORBIDDEN'],
    ['timeline.js', "import fs from 'node:fs/promises'", 'NODE_API_FORBIDDEN'],
    ['index.ts', "document.createElement('div')", 'THIN_ADAPTER_VIOLATION'],
    ['composition.html', '<div>.motion</div>', 'MOTION_FILE_FORBIDDEN'],
    ['timeline.js', 'const jsonTimeline = {}', 'JSON_ANIMATION_DSL_FORBIDDEN'],
    ['composition.html', '<img src="//tracker.example/pixel">', 'REMOTE_SOURCE_FORBIDDEN'],
    ['timeline.js', "navigator.sendBeacon('/collect', document.body.textContent)", 'BROWSER_ESCAPE_API_FORBIDDEN'],
    ['timeline.js', "const saved = localStorage.getItem('token')", 'BROWSER_DATA_ACCESS_FORBIDDEN'],
    ['composition.html', '<form action="/collect"><input name="secret"></form>', 'ACTIVE_HTML_FORBIDDEN'],
    ['composition.html', '<style>@import "//tracker.example/style";</style>', 'ACTIVE_CSS_FORBIDDEN'],
  ] as const)('rejects forbidden %s source', (file, addition, code) => {
    const files: ProjectSourceFiles = { ...STARTER_SOURCE_FILES, [file]: `${STARTER_SOURCE_FILES[file]}\n${addition}` };
    expect(validateMotionlySource(files).diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it('allows reviewed runtime/helper/asset imports and rejects arbitrary packages', () => {
    const allowed: ProjectSourceFiles = {
      ...STARTER_SOURCE_FILES,
      'timeline.js': `import { reveal } from '@motionly/presets';\n${STARTER_SOURCE_FILES['timeline.js']}`,
      'index.ts': `import heroUrl from './assets/00000000-0000-4000-8000-000000000001.png?url';\n${STARTER_SOURCE_FILES['index.ts']}`,
    };
    expect(validateMotionlySource(allowed).diagnostics.filter((item) => item.code === 'SOURCE_IMPORT_FORBIDDEN')).toEqual([]);

    const forbidden: ProjectSourceFiles = {
      ...STARTER_SOURCE_FILES,
      'timeline.js': `import lodash from 'lodash';\n${STARTER_SOURCE_FILES['timeline.js']}`,
    };
    expect(validateMotionlySource(forbidden).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_IMPORT_FORBIDDEN', file: 'timeline.js' }),
    ]));
  });

  it('allows exact patches and rejects traversal, unknown tools, and ambiguous patches', async () => {
    const source = await workspace();
    const tools = new GenerationToolRegistry(source);
    await expect(tools.execute('apply_project_patch', {
      path: 'composition.html',
      edits: [{ search: 'Make your product move.', replace: 'Ship a better launch.' }],
    })).resolves.toMatchObject({ edits: 1 });
    await expect(source.read('composition.html')).resolves.toContain('Ship a better launch.');
    await expect(source.read('../secret')).rejects.toThrow('not allowed');
    await expect(tools.execute('shell', { command: 'whoami' })).rejects.toThrow('Unknown generation tool');
    await expect(source.applyEdits('composition.html', [{ search: 'motionly', replace: 'x' }])).rejects.toThrow('ambiguous');
  });
});
