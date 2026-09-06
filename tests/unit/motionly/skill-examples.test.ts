import { describe, expect, it } from 'vitest';
import { loadSkillBundle } from '../../../packages/motionly-skills/loader.js';
import { validateMotionlyGeneration } from '../../../packages/ai/validation/generation-validator.js';

function extractCodeBlocks(markdown: string): { html: string | undefined; js: string | undefined } {
  const htmlMatch = markdown.match(/```html\s*\n([\s\S]*?)\n```/);
  const jsMatch = markdown.match(/```js(?:cript)?\s*\n([\s\S]*?)\n```/);
  return {
    html: htmlMatch?.[1],
    js: jsMatch?.[1],
  };
}

describe('Motionly Skill Code Examples', () => {
  it('validates all canonical HTML and JS examples in core skills', async () => {
    const bundle = await loadSkillBundle();
    const skillsWithCode = ['code-authoring', 'write-motionly', 'editor-controls', 'timeline', 'typography', 'svg', 'marketing'];

    for (const skillId of skillsWithCode) {
      const skill = bundle.skills.find((s) => s.id === skillId);
      expect(skill, `Skill ${skillId} should exist`).toBeDefined();

      const { html, js } = extractCodeBlocks(skill!.content);
      if (html && js) {
        const result = validateMotionlyGeneration({
          title: `Testing ${skillId}`,
          duration: 5,
          width: 1920,
          height: 1080,
          fps: 60,
          scenes: [
            {
              id: 'main',
              label: 'Main Scene',
              start: 0,
              duration: 5,
              accent: '#38bdf8',
            },
          ],
          reply: `Testing ${skillId}`,
          compositionHtml: html,
          timelineJs: js,
        });

        expect(
          result.errors,
          `Skill ${skillId} code example failed validation: ${result.errors.map((e) => e.message).join(', ')}`,
        ).toEqual([]);
      }
    }
  });

  it('ensures editor-controls documents all frontend element and animation override properties', async () => {
    const bundle = await loadSkillBundle();
    const editorSkill = bundle.skills.find((s) => s.id === 'editor-controls');
    expect(editorSkill).toBeDefined();

    const content = editorSkill!.content.toLowerCase();
    expect(content).toContain('scale');
    expect(content).toContain('opacity');
    expect(content).toContain('color');
    expect(content).toContain('backgroundcolor');
    expect(content).toContain('fontsize');
    expect(content).toContain('borderradius');
    expect(content).toContain('hidden');
    expect(content).toContain('speed');
    expect(content).toContain('ease');
  });
});
