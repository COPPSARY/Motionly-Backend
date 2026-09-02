import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const skillSchema = z.strictObject({
  id: z.string().min(1),
  file: z.string().regex(/^[a-z0-9-]+\.md$/),
  tags: z.array(z.string().min(1)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z.strictObject({
  version: z.string().min(1),
  runtimeRange: z.string().min(1),
  source: z.string().min(1),
  sourceVersion: z.string().min(1),
  skills: z.array(skillSchema).min(1),
});

export type SkillManifest = z.infer<typeof manifestSchema>;

export interface LoadedSkill {
  id: string;
  tags: string[];
  content: string;
  sha256: string;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadSkillBundle(version = 'v1', root = packageRoot) {
  if (!/^v\d+$/.test(version)) throw new Error('Invalid Motionly skill bundle version.');
  const catalog = path.resolve(root, 'catalog', version);
  if (!catalog.startsWith(path.resolve(root, 'catalog') + path.sep)) throw new Error('Invalid skill catalogue path.');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(catalog, 'manifest.json'), 'utf8')));
  const skills: LoadedSkill[] = [];
  for (const entry of manifest.skills) {
    const content = await readFile(path.join(catalog, entry.file), 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== entry.sha256) throw new Error(`Motionly skill hash mismatch: ${entry.id}`);
    skills.push({ id: entry.id, tags: entry.tags, content, sha256 });
  }
  return { manifest, skills };
}
