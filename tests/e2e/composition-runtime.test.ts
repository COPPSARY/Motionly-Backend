import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { captureFrames, inspectRuntime, representativeTimes, withBrowser } from '../../apps/renderer/src/browser.js';
import { buildPreview } from '../../apps/renderer/src/build.js';
import { PROJECT_SOURCE_PATHS } from '../../apps/api/src/services/project.service.js';
import { STARTER_SOURCE_FILES } from '../../packages/motionly-runtime/src/starter.js';

const chrome = process.env.CHROMIUM_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe.skipIf(!existsSync(chrome))('Motionly renderer browser harness', () => {
  it('builds, mounts, seeks a real target, registers layers, and captures deterministic frames', async () => {
    process.env.CHROMIUM_PATH = chrome;
    const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-renderer-e2e-'));
    directories.push(workspace);
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => {
      const content = file === 'timeline.js'
        ? `import { reveal } from '@motionly/presets';\n${STARTER_SOURCE_FILES[file].replace(
          "register('title', title);",
          "register('title', title);\n  reveal(timeline, title, { at: 0, duration: 0.3 });",
        )}`
        : STARTER_SOURCE_FILES[file];
      return writeFile(path.join(workspace, file), content, 'utf8');
    }));
    const preview = await buildPreview(workspace);
    const browserErrors: string[] = [];

    let result;
    try {
      result = await withBrowser(preview.htmlPath, async (page) => {
        const inspection = await inspectRuntime(page);
        const times = representativeTimes(inspection.definition);
        const frames = await captureFrames(page, workspace, times.slice(0, 3));
        return { inspection, frames };
      }, (page) => {
        page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
        page.on('pageerror', (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
      });
    } catch (error) {
      throw new Error(`Renderer mount failed: ${error instanceof Error ? error.message : String(error)}; ${browserErrors.join('; ')}`);
    }

    expect(result.inspection.registeredIds).toContain('title');
    expect(result.inspection.stateChanged).toBe(true);
    expect(result.frames).toHaveLength(3);
    expect(result.frames[0]?.file).toMatch(/^artifacts\/frames\/frame-/);
  }, 60_000);

  it('rejects an authored editable layer that is missing from runtime registration', async () => {
    process.env.CHROMIUM_PATH = chrome;
    const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-renderer-unregistered-'));
    directories.push(workspace);
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(
      path.join(workspace, file),
      file === 'composition.html'
        ? STARTER_SOURCE_FILES[file].replace('</main>', '<div data-edit="orphan">Orphan</div></main>')
        : STARTER_SOURCE_FILES[file],
      'utf8',
    )));
    const preview = await buildPreview(workspace);

    await expect(withBrowser(preview.htmlPath, inspectRuntime)).rejects.toThrow('Editable Motionly layer is not registered: orphan');
  }, 60_000);
});
