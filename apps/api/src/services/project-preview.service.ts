import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Plugin } from 'esbuild';

import type { ProjectSourceFiles } from './project.service.js';

const namespace = 'motionly-project';
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = path.resolve(sourceDirectory, '../../../../packages/motionly-runtime/src');
const runtimeEntry = path.join(runtimeDirectory, 'index.ts');
const presetsEntry = path.join(runtimeDirectory, 'presets.ts');
const gsapEntry = fileURLToPath(import.meta.resolve('gsap/dist/gsap.js'));
const compatibilityNamespace = 'motionly-project-compatibility';

const compatibilityModules: Record<string, string> = {
  'timing.ts': `
export const MOTIONLY_PROMO_SOURCE_DURATION = 39;
export const MOTIONLY_PROMO_DURATION = 58.5;
export const MOTIONLY_PROMO_TIME_SCALE = MOTIONLY_PROMO_SOURCE_DURATION / MOTIONLY_PROMO_DURATION;
export const MOTIONLY_PROMO_RETIME_FACTOR = MOTIONLY_PROMO_DURATION / MOTIONLY_PROMO_SOURCE_DURATION;
`,
  'logo.svg': 'export default "__MOTIONLY_BUILTIN_ASSET_LOGO__";',
  'ui-screenshot.png': 'export default "__MOTIONLY_BUILTIN_ASSET_UI_SCREENSHOT__";',
};

export async function bundleProjectPreview(files: ProjectSourceFiles): Promise<{ bundle: string; styles: string }> {
  const plugin: Plugin = {
    name: 'motionly-project-source',
    setup(context) {
      context.onResolve({ filter: /^motionly:entry$/ }, () => ({ path: 'entry.ts', namespace }));
      context.onResolve({ filter: /^@motionly\/runtime$/ }, () => ({ path: runtimeEntry }));
      context.onResolve({ filter: /^@motionly\/presets$/ }, () => ({ path: presetsEntry }));
      context.onResolve({ filter: /^gsap$/ }, () => ({ path: gsapEntry }));
      context.onResolve({ filter: /^\.\/(types|runtime|presets)\.js$/ }, (args) => {
        if (path.dirname(args.importer) !== runtimeDirectory) return null;
        return { path: path.resolve(runtimeDirectory, args.path.replace(/\.js$/, '.ts')) };
      });
      context.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/composition\/types$/, namespace }, () => ({ path: runtimeEntry }));
      context.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/composition\/presets$/, namespace }, () => ({ path: presetsEntry }));
      context.onResolve({ filter: /^\.\/timing$/, namespace }, () => ({ path: 'timing.ts', namespace: compatibilityNamespace }));
      context.onResolve({ filter: /^\.\/logo\.svg\?url$/, namespace }, () => ({ path: 'logo.svg', namespace: compatibilityNamespace }));
      context.onResolve({ filter: /^\.\/ui-screenshot\.png\?url$/, namespace }, () => ({ path: 'ui-screenshot.png', namespace: compatibilityNamespace }));
      context.onResolve({ filter: /^\.\//, namespace }, (args) => {
        const requested = args.path.slice(2);
        const file = requested.endsWith('?raw') ? requested.slice(0, -4) : requested;
        if (!(file in files)) return null;
        return { path: requested, namespace };
      });
      context.onResolve({ filter: /.*/, namespace }, (args) => {
        throw new Error(`Unsupported project preview import: ${args.path}`);
      });
      context.onLoad({ filter: /.*/, namespace }, (args) => {
        if (args.path === 'entry.ts') {
          return {
            contents: `
import * as project from './index.ts';
const projectExports = project as Record<string, unknown>;
const composition = projectExports['default'] ?? projectExports['composition'] ?? projectExports['motionlyPromoPreset'] ??
  Object.values(project).find((value) => value && typeof value === 'object' &&
    typeof value.build === 'function' && Array.isArray(value.scenes));
export default composition;
`,
            loader: 'ts',
          };
        }
        const raw = args.path.endsWith('?raw');
        const file = (raw ? args.path.slice(0, -4) : args.path) as keyof ProjectSourceFiles;
        const contents = files[file];
        if (contents === undefined) return null;
        if (raw) return { contents, loader: 'text' };
        return {
          contents,
          loader: file.endsWith('.ts') ? 'ts' : file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : 'text',
        };
      });
      context.onLoad({ filter: /.*/, namespace: compatibilityNamespace }, (args) => {
        const contents = compatibilityModules[args.path];
        if (contents === undefined) return null;
        return { contents, loader: 'js' };
      });
    },
  };

  const result = await build({
    entryPoints: ['motionly:entry'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    outdir: 'out',
    treeShaking: true,
    write: false,
    plugins: [plugin],
  });
  const script = result.outputFiles.find((output) => output.path.endsWith('.js'));
  if (!script) throw new Error('The project preview bundle was not produced.');
  const stylesheet = result.outputFiles.find((output) => output.path.endsWith('.css'));
  return { bundle: script.text, styles: stylesheet?.text ?? '' };
}
