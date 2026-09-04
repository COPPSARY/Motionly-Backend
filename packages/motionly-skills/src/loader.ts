import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const skillSchema = z.strictObject({
  id: z.string().min(1),
  file: z.string().regex(/^[a-z0-9-]+\/SKILL\.md$/),
  tags: z.array(z.string().min(1)),
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
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadSkillBundle(version = 'v1', root = packageRoot) {
  if (version !== 'v1') throw new Error('Unsupported Motionly skill bundle version.');
  const skillRoot = path.resolve(root);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(skillRoot, 'manifest.json'), 'utf8')));
  const skills: LoadedSkill[] = [];
  for (const entry of manifest.skills) {
    const skillFile = path.resolve(skillRoot, entry.file);
    if (!skillFile.startsWith(skillRoot + path.sep)) throw new Error('Invalid Motionly skill path.');
    const content = await readFile(skillFile, 'utf8');
    // Git may check these Markdown files out with CRLF on Windows. Normalise to
    // LF so prompt content is identical across platforms.
    skills.push({ id: entry.id, tags: entry.tags, content: content.replace(/\r\n?/g, '\n') });
  }
  return { manifest, skills };
}
