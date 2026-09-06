import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSkillBundle } from '../../../packages/motionly-skills/loader.js';
import { routeSkills } from '../../../packages/motionly-skills/router.js';

describe('Motionly skill bundle', () => {
  it('loads the catalog declared by the manifest', async () => {
    const bundle = await loadSkillBundle();
    expect(bundle.manifest).toMatchObject({ version: '1.0.0', sourceVersion: '2.0.0' });
    expect(bundle.skills.map((skill) => skill.id)).toContain('core');
  });

  it.each([
    ['Make the title typography larger', ['core', 'typography']],
    ['Retime the timeline and duration', ['core', 'timeline']],
    ['Morph the logo SVG into the next scene', ['core', 'svg', 'quality-reference']],
    ['Push the camera into the product screenshot', ['core', 'camera', 'assets']],
    ['Fix preview export frames in Chromium', ['core', 'rendering']],
    ['Create a high-converting marketing promo video for our product launch', ['core', 'marketing']],
  ])('routes "%s" to focused skills', async (prompt, expected) => {
    const selected = routeSkills(await loadSkillBundle(), { prompt, intent: 'EDIT' });
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining(expected));
  });

  it('always gives new compositions writing, quality, authoring, typography, and editor guidance', async () => {
    const selected = routeSkills(await loadSkillBundle(), {
      prompt: 'Create a product launch animation',
      intent: 'CREATE',
    });
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'core',
      'write-motionly',
      'quality-reference',
      'code-authoring',
      'typography',
      'editor-controls',
    ]));
  });

  it.each(['CREATE', 'EDIT', 'FIX'] as const)(
    'includes website editor and code authoring guidance in the %s baseline',
    async (intent) => {
      const selected = routeSkills(await loadSkillBundle(), {
        prompt: 'Keep the project editable',
        intent,
      });

      expect(selected.map((skill) => skill.id)).toContain('editor-controls');
      expect(selected.map((skill) => skill.id)).toContain('code-authoring');
    },
  );

  it('routes scale and rotation requests to website editor guidance', async () => {
    const selected = routeSkills(await loadSkillBundle(), {
      prompt: 'Increase the logo scale and rotation',
      intent: 'EDIT',
    });

    expect(selected.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['core', 'editor-controls']),
    );
  });

  it('contains only website-compatible source guidance', async () => {
    const bundle = await loadSkillBundle();
    const generationGuidance = bundle.skills
      .map((skill) => skill.content)
      .join('\n');

    expect(generationGuidance).toContain('compositionHtml');
    expect(generationGuidance).toContain('timelineJs');
    expect(generationGuidance).toContain('import-free');
    expect(generationGuidance).toContain('embedded');
    expect(generationGuidance).not.toContain('index.ts');
    expect(generationGuidance).not.toContain('styles.css');
    expect(generationGuidance).not.toContain('@motionly/presets');
    expect(generationGuidance).not.toContain('return_changed_files');
  });

  it('can route every declared skill when its tags are requested', async () => {
    const bundle = await loadSkillBundle();
    const prompt = bundle.manifest.skills.flatMap((skill) => skill.tags).join(' ');
    const selected = routeSkills(bundle, { prompt, intent: 'CREATE' });

    expect(selected.map((skill) => skill.id).sort()).toEqual(
      bundle.skills.map((skill) => skill.id).sort(),
    );
  });

  it('verifies every skill hash before loading prompt content', async () => {
    const bundle = await loadSkillBundle();

    expect(bundle.skills).toHaveLength(bundle.manifest.skills.length);
    expect(bundle.manifest.skills.every((skill) => /^[a-f0-9]{64}$/.test(skill.sha256))).toBe(true);
  });

  it('rejects modified skill content', async () => {
    const sourceRoot = path.resolve('packages/motionly-skills');
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'motionly-skills-'));
    const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8')) as {
      skills: Array<{ file: string }>;
    };

    try {
      await writeFile(path.join(temporaryRoot, 'manifest.json'), await readFile(path.join(sourceRoot, 'manifest.json')));
      for (const skill of manifest.skills) {
        const destination = path.join(temporaryRoot, skill.file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, await readFile(path.join(sourceRoot, skill.file)));
      }
      await writeFile(path.join(temporaryRoot, manifest.skills[0]!.file), 'modified');

      await expect(loadSkillBundle('v1', temporaryRoot)).rejects.toThrow('Motionly skill hash mismatch');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('respects the bundle character budget', async () => {
    const bundle = await loadSkillBundle();
    const requiredLength = bundle.skills.filter((skill) => ['core', 'assets', 'camera'].includes(skill.id))
      .reduce((total, skill) => total + skill.content.length, 0);
    const selected = routeSkills(bundle, {
      prompt: 'camera timeline typography svg assets transition render code',
      intent: 'CREATE',
      maxCharacters: requiredLength,
    });
    expect(selected.map((skill) => skill.id)).toContain('core');
    expect(selected.reduce((total, skill) => total + skill.content.length, 0)).toBeLessThanOrEqual(requiredLength);
  });
});
