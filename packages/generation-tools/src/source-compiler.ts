import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import type { ProjectSourceFiles } from '../../../apps/api/src/services/project.service.js';
import { validateMotionlySource } from './source-policy.js';

export type SourceCompileResult = { valid: true } | { valid: false; diagnostics: string };

const compilerDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function compileMotionlySource(files: ProjectSourceFiles): Promise<SourceCompileResult> {
  const sourceReport = validateMotionlySource(files);
  if (!sourceReport.valid) return { valid: false, diagnostics: formatDiagnostics(sourceReport.diagnostics.map((diagnostic) => diagnostic.message).join('\n')) };

  const workspace = await mkdtemp(path.join(tmpdir(), 'motionly-compile-'));
  try {
    await Promise.all(Object.entries(files).map(([file, content]) => writeFile(path.join(workspace, file), content, 'utf8')));
    const runtimeEntry = path.resolve(compilerDirectory, '../../motionly-runtime/src/index.js');
    const presetsEntry = path.resolve(compilerDirectory, '../../motionly-runtime/src/presets.js');
    const gsapEntry = fileURLToPath(import.meta.resolve('gsap'));
    await build({
      root: workspace,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias: { '@motionly/runtime': runtimeEntry, '@motionly/presets': presetsEntry, gsap: gsapEntry } },
      build: { write: false, rollupOptions: { input: path.join(workspace, 'index.ts') } },
    });
    return { valid: true };
  } catch (error) {
    return { valid: false, diagnostics: formatDiagnostics(error instanceof Error ? error.message : 'Source compilation failed.') };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function formatDiagnostics(value: string) {
  return value
    .replaceAll(/(?:[A-Za-z]:\\|\/)(?:[^\s:'"]+[\\/])+/g, '<path>/')
    .replaceAll(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s]+/gi, '$1=<redacted>')
    .slice(0, 20_000);
}
