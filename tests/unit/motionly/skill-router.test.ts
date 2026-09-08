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
    ['Make the title typography larger', ['typography']],
    ['Retime the timeline and duration', ['timeline']],
    ['Morph the logo SVG into the next scene', ['svg', 'quality-reference']],
    ['Push the camera into the product screenshot', ['camera', 'assets']],
    ['Fix preview export frames in Chromium', ['rendering']],
    ['Create a high-converting marketing promo video for our product launch', ['marketing']],
  ])('routes "%s" to focused skills', async (prompt, expected) => {
    const selected = routeSkills(await loadSkillBundle(), { prompt, intent: 'EDIT' });
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining(expected));
  });

  it('routes purely by tag match — nothing is forced when no tag matches', async () => {
    const selected = routeSkills(await loadSkillBundle(), {
      prompt: 'Create a product launch animation',
      intent: 'CREATE',
    });
    // "create" and "animation" are tags on both write-motionly and quality-reference,
    // so those match; code-authoring/typography/editor-controls/core are not forced
    // and have no matching tag in this prompt, so they're correctly absent here.
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'write-motionly',
      'quality-reference',
    ]));
  });

  it.each(['CREATE', 'EDIT', 'FIX'] as const)(
    'routes editor and code-authoring guidance when the prompt names them (%s)',
    async (intent) => {
      const selected = routeSkills(await loadSkillBundle(), {
        prompt: 'Keep the editor controls working — edit the html and gsap code directly',
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
      expect.arrayContaining(['editor-controls']),
    );
  });

  it('contains only website-compatible source guidance in the native Motionly baseline', async () => {
    // Scoped to the skills Motionly authored for this backend's own output contract.
    // The bundle also carries imported third-party creative-tooling skills (gsap-*,
    // hyperframes-*, and similar) that may legitimately reference other stacks' file
    // layouts; those are excluded here rather than edited, since the contract this
    // test protects is Motionly's own, not theirs.
    const nativeSkillIds = new Set([
      'core', 'write-motionly', 'helpers', 'quality-reference', 'code-authoring',
      'timeline', 'editor-controls', 'typography', 'transitions', 'camera', 'svg',
      'assets', 'rendering', 'marketing', 'story-timing',
      'transitions-camera', 'typography-backgrounds',
    ]);
    const bundle = await loadSkillBundle();
    const generationGuidance = bundle.skills
      .filter((skill) => nativeSkillIds.has(skill.id))
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
    const requiredLength = bundle.skills.filter((skill) => ['assets', 'camera'].includes(skill.id))
      .reduce((total, skill) => total + skill.content.length, 0);
    const selected = routeSkills(bundle, {
      prompt: 'camera timeline typography svg assets transition render code',
      intent: 'CREATE',
      maxCharacters: requiredLength,
    });
    expect(selected.map((skill) => skill.id)).toContain('camera');
    expect(selected.reduce((total, skill) => total + skill.content.length, 0)).toBeLessThanOrEqual(requiredLength);
  });
});
