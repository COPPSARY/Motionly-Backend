import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildPreview } from '../../../apps/renderer/src/build.js';
import { PROJECT_SOURCE_PATHS } from '../../../apps/api/src/services/project.service.js';
import { STARTER_SOURCE_FILES } from '../../../packages/motionly-runtime/src/starter.js';

const directories: string[] = [];

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('isolated renderer build', () => {
  it('resolves an approved direct GSAP import without workspace node_modules', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-isolated-build-'));
    directories.push(workspace);
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(
      path.join(workspace, file),
      file === 'timeline.js'
        ? `import gsap from 'gsap';\n${STARTER_SOURCE_FILES[file].replace(
          "timeline.fromTo(title, { opacity: 0, scale: 1.35 },",
          "timeline.fromTo(title, { opacity: 0, scale: gsap.utils.clamp(1, 2, 1.35) },",
        )}`
        : STARTER_SOURCE_FILES[file],
      'utf8',
    )));

    const preview = await buildPreview(workspace);

    await expect(access(preview.htmlPath)).resolves.toBeUndefined();
    await expect(readFile(preview.htmlPath, 'utf8')).resolves.toContain('<script');
  });
});
