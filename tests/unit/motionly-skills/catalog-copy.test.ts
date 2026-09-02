import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { copyMotionlySkillCatalog } from '../../../packages/motionly-skills/scripts/copy-catalog.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('copyMotionlySkillCatalog', () => {
  it('copies the versioned catalog into the compiled distribution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'motionly-skill-catalog-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'packages', 'motionly-skills', 'catalog', 'v1');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'manifest.json'), '{"version":"1.0.0"}', 'utf8');
    await writeFile(path.join(source, 'core.md'), '# Core', 'utf8');

    await copyMotionlySkillCatalog(root);

    const destination = path.join(root, 'dist', 'packages', 'motionly-skills', 'catalog', 'v1');
    await expect(readFile(path.join(destination, 'manifest.json'), 'utf8')).resolves.toBe('{"version":"1.0.0"}');
    await expect(readFile(path.join(destination, 'core.md'), 'utf8')).resolves.toBe('# Core');
  });
});
