import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Plugin } from 'esbuild';

import type { ProjectSourceFiles } from './project.service.js';

const namespace = 'motionly-project';
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const isCompiled = import.meta.url.endsWith('.js');
const ext = isCompiled ? '.js' : '.ts';
const runtimeEntry = path.resolve(sourceDirectory, `../../../../packages/motionly-runtime/src/index${ext}`);
const presetsEntry = path.resolve(sourceDirectory, `../../../../packages/motionly-runtime/src/presets${ext}`);
const runtimeSourceDirectory = path.dirname(runtimeEntry);
const gsapEntry = fileURLToPath(import.meta.resolve('gsap'));

export async function bundleProjectPreview(files: ProjectSourceFiles): Promise<{ bundle: string; styles: string }> {
  const plugin: Plugin = {
    name: 'motionly-project-source',
    setup(context) {
      context.onResolve({ filter: /^motionly:entry$/ }, () => ({ path: 'entry.ts', namespace }));
      context.onResolve({ filter: /^@motionly\/runtime$/ }, () => ({ path: runtimeEntry }));
      context.onResolve({ filter: /^@motionly\/presets$/ }, () => ({ path: presetsEntry }));
      context.onResolve({ filter: /^gsap$/ }, () => ({ path: gsapEntry }));
      context.onResolve({ filter: /^\.\// }, (args) => {
        if (!args.importer.startsWith(runtimeSourceDirectory) || !args.path.endsWith('.js')) return null;
        if (isCompiled) return null;
        return { path: path.resolve(path.dirname(args.importer), args.path.replace(/\.js$/, '.ts')) };
      });
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
          return { contents: "export { default } from './index.ts';", loader: 'ts' };
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
