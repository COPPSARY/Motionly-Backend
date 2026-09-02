import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PROJECT_SOURCE_PATHS, type ProjectSourceFiles, type ProjectSourcePath } from '../../../apps/api/src/services/project.service.js';

export const MAX_SOURCE_FILE_BYTES = 1_000_000;
const allowedPaths = new Set<string>(PROJECT_SOURCE_PATHS);

export interface SourceEdit {
  search: string;
  replace: string;
}

export class SourceWorkspace {
  private constructor(private readonly root: string) {}

  static async open(root: string) {
    const resolved = await realpath(root);
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) throw new Error('Source workspace must be a directory.');
    return new SourceWorkspace(resolved);
  }

  list(): readonly ProjectSourcePath[] {
    return PROJECT_SOURCE_PATHS;
  }

  async read(filePath: string): Promise<string> {
    const resolved = this.resolve(filePath);
    await assertRegularFile(resolved);
    return readFile(resolved, 'utf8');
  }

  async readAll(): Promise<ProjectSourceFiles> {
    const values = await Promise.all(PROJECT_SOURCE_PATHS.map(async (filePath) => [filePath, await this.read(filePath)] as const));
    return Object.fromEntries(values) as ProjectSourceFiles;
  }

  async replace(filePath: string, content: string): Promise<void> {
    assertContentSize(content);
    const resolved = this.resolve(filePath);
    await assertRegularFile(resolved);
    await writeFile(resolved, content, { encoding: 'utf8', flag: 'w' });
  }

  async applyEdits(filePath: string, edits: SourceEdit[]): Promise<string> {
    if (!edits.length || edits.length > 100) throw new Error('A source patch must contain between 1 and 100 edits.');
    let content = await this.read(filePath);
    for (const edit of edits) {
      if (!edit.search) throw new Error('Patch search text cannot be empty.');
      const first = content.indexOf(edit.search);
      if (first < 0) throw new Error('Patch search text was not found.');
      if (content.indexOf(edit.search, first + edit.search.length) >= 0) {
        throw new Error('Patch search text is ambiguous.');
      }
      content = `${content.slice(0, first)}${edit.replace}${content.slice(first + edit.search.length)}`;
      assertContentSize(content);
    }
    await this.replace(filePath, content);
    return content;
  }

  private resolve(filePath: string): string {
    if (!allowedPaths.has(filePath)) throw new Error(`Source path is not allowed: ${filePath}`);
    const resolved = path.resolve(this.root, filePath);
    if (path.dirname(resolved) !== this.root) throw new Error('Source path escaped the workspace.');
    return resolved;
  }
}

function assertContentSize(content: string) {
  if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes.`);
  }
}

async function assertRegularFile(filePath: string) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Source entry must be a regular file.');
}
