import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateMotionlySource } from '../../../packages/generation-tools/src/source-policy.js';
import { MOTIONLY_RUNTIME_VERSION } from '../../../packages/motionly-runtime/src/starter.js';
import { assertRepresentativeFrames, withBrowser, captureFrames, configureCompositionViewport, exportVideo, inspectRuntime, representativeTimes } from './browser.js';
import { buildPreview, readSourceBundle } from './build.js';

async function main() {
  const operation = process.argv[2];
  if (operation !== 'validate' && operation !== 'capture' && operation !== 'export') {
    throw new Error('Renderer operation must be validate, capture, or export.');
  }
  const workspace = process.cwd();
  const files = await readSourceBundle(workspace);
  const sourceReport = validateMotionlySource(files);
  if (!sourceReport.valid) {
    process.stdout.write(`${JSON.stringify({ ok: false, operation, sourceReport })}\n`);
    process.exitCode = 2;
    return;
  }
  const sourceHash = createHash('sha256').update(Object.values(files).join('\0')).digest('hex');
  const preview = await buildPreview(workspace);
  const consoleErrors: string[] = [];
  const result = await withBrowser(preview.htmlPath, async (page, browser) => {
    let runtime = await inspectRuntime(page);
    await configureCompositionViewport(page, runtime.definition);
    runtime = await inspectRuntime(page);
    if (!runtime.stateChanged) throw new Error('Registered visual target did not change during playback.');
    const frames = operation === 'validate' ? [] : await captureFrames(page, workspace, representativeTimes(runtime.definition));
    if (frames.length) assertRepresentativeFrames(runtime.definition, frames);
    const video = operation === 'export' ? await exportVideo(page, workspace, runtime.definition) : null;
    return { runtime, frames, video, chromiumVersion: await browser.version() };
  }, (page) => {
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 1_000)); });
    page.on('pageerror', (error) => consoleErrors.push((error instanceof Error ? error.message : String(error)).slice(0, 1_000)));
    page.on('requestfailed', (request) => consoleErrors.push(`Asset request failed: ${request.url().slice(0, 500)}`));
  });
  if (consoleErrors.length) throw new Error(`Composition emitted browser errors: ${consoleErrors.join('; ')}`);
  const report = {
    ok: true,
    operation,
    sourceHash,
    runtimeVersion: MOTIONLY_RUNTIME_VERSION,
    toolchain: {
      node: process.version,
      chromium: result.chromiumVersion,
      ...(result.video?.toolchain ? result.video.toolchain : {}),
    },
    sourceReport,
    runtime: result.runtime,
    frames: result.frames,
    video: result.video,
  };
  await writeFile(path.join(workspace, 'artifacts-manifest.json'), JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Renderer failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
