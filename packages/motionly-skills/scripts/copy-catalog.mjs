import { cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function copyMotionlySkillCatalog(root = process.cwd()) {
  const source = path.join(root, 'packages', 'motionly-skills', 'catalog');
  const destination = path.join(root, 'dist', 'packages', 'motionly-skills', 'catalog');

  await stat(source);
  await cp(source, destination, { recursive: true, force: true });
}

const entryFile = process.argv[1];
if (entryFile && import.meta.url === pathToFileURL(path.resolve(entryFile)).href) {
  await copyMotionlySkillCatalog();
}
