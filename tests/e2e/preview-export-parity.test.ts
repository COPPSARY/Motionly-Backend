import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { captureFrames, configureCompositionViewport, exportVideo, inspectRuntime, withBrowser } from '../../apps/renderer/src/browser.js';
import { buildPreview } from '../../apps/renderer/src/build.js';
import { PROJECT_SOURCE_PATHS } from '../../apps/api/src/services/project.service.js';
import { createStarterSource } from '../../packages/motionly-runtime/src/starter.js';

const chrome = process.env.CHROMIUM_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

const hasEncoder = spawnSync(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
  && spawnSync(process.env.FFPROBE_PATH ?? 'ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;

describe.skipIf(!existsSync(chrome) || !hasEncoder)('preview/export source parity', () => {
  it('renders byte-identical pre-encoding frames from the same mounted runtime', async () => {
    process.env.CHROMIUM_PATH = chrome;
    const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-parity-e2e-'));
    directories.push(workspace);
    const source = createStarterSource({ name: 'Parity', width: 320, height: 180, fps: 5, duration: 0.4 });
    await Promise.all(PROJECT_SOURCE_PATHS.map((file) => writeFile(path.join(workspace, file), source[file], 'utf8')));
    const preview = await buildPreview(workspace);

    const result = await withBrowser(preview.htmlPath, async (page) => {
      const inspection = await inspectRuntime(page);
      await configureCompositionViewport(page, inspection.definition);
      const first = await captureFrames(page, workspace, [0]);
      const firstBytes = await readFile(path.join(workspace, first[0]!.file));
      const second = await captureFrames(page, workspace, [0]);
      const secondBytes = await readFile(path.join(workspace, second[0]!.file));
      const hashes = [firstBytes, secondBytes].map((bytes) => createHash('sha256').update(bytes).digest('hex'));
      const video = await exportVideo(page, workspace, inspection.definition);
      return { hashes, video };
    });

    expect(result.hashes[0]).toBe(result.hashes[1]);
    expect(result.video.frameHashes[0]).toBe(result.hashes[0]);
    expect(result.video.metadata).toMatchObject({ codec: 'h264', width: 320, height: 180, frameCount: 2 });
  }, 60_000);
});
