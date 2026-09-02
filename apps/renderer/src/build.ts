import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const rendererSourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function buildPreview(workspace: string) {
  const harnessDirectory = path.join(workspace, '.motionly');
  const outputDirectory = path.join(workspace, 'preview');
  await mkdir(harnessDirectory, { recursive: true });
  await writeFile(path.join(harnessDirectory, 'harness.ts'), harnessSource, 'utf8');
  await writeFile(path.join(workspace, 'preview-entry.html'), htmlSource, 'utf8');
  const runtimeEntry = path.resolve(rendererSourceDirectory, '../../../packages/motionly-runtime/src/index.js');
  const presetsEntry = path.resolve(rendererSourceDirectory, '../../../packages/motionly-runtime/src/presets.js');
  // Generated workspaces deliberately have no node_modules. Resolve the only
  // approved third-party source import from the trusted renderer image instead.
  const gsapEntry = fileURLToPath(import.meta.resolve('gsap'));
  await build({
    root: workspace,
    configFile: false,
    base: './',
    logLevel: 'silent',
    resolve: { alias: { '@motionly/runtime': runtimeEntry, '@motionly/presets': presetsEntry, gsap: gsapEntry } },
    build: {
      outDir: outputDirectory,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: { input: path.join(workspace, 'preview-entry.html') },
    },
  });
  return { outputDirectory, htmlPath: path.join(outputDirectory, 'preview-entry.html') };
}

export async function readSourceBundle(workspace: string) {
  const entries = await Promise.all(['composition.html', 'styles.css', 'timeline.js', 'index.ts'].map(async (file) => [file, await readFile(path.join(workspace, file), 'utf8')]));
  return Object.fromEntries(entries) as Record<'composition.html' | 'styles.css' | 'timeline.js' | 'index.ts', string>;
}

const htmlSource = `<!doctype html>
<html><head><meta charset="UTF-8"><style>html,body{margin:0;background:#000;overflow:hidden}#motionly-root{transform-origin:top left}</style></head>
<body><div id="motionly-root"></div><script type="module" src="/.motionly/harness.ts"></script></body></html>`;

const harnessSource = `import composition from '../index.ts';
import { CompositionRuntime } from '@motionly/runtime';
const root = document.querySelector('#motionly-root');
if (!(root instanceof HTMLElement)) throw new Error('Motionly render root was not found.');
const runtime = new CompositionRuntime(composition, root);
window.__MOTIONLY_RENDER__ = { ready: true, runtime, definition: composition };
`;
