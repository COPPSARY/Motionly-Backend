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
  ])('routes "%s" to focused skills', async (prompt, expected) => {
    const selected = routeSkills(await loadSkillBundle(), { prompt, intent: 'EDIT' });
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining(expected));
  });

  it('always gives new compositions writing, quality, authoring, and typography guidance', async () => {
    const selected = routeSkills(await loadSkillBundle(), {
      prompt: 'Create a product launch animation',
      intent: 'CREATE',
    });
    expect(selected.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      'core', 'write-motionly', 'quality-reference', 'code-authoring', 'typography',
    ]));
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
    expect(selected.map((skill) => skill.id)).toEqual(['core', 'assets', 'camera']);
  });
});
