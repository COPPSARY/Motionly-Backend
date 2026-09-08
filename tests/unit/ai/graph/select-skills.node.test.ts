import { describe, expect, it, vi } from 'vitest';

import type { ResolvedMotionGraphDependencies } from '../../../../packages/ai/graph/dependencies.js';
import { MAX_SKILL_PROMPT_CHARACTERS, createSelectSkillsNode } from '../../../../packages/ai/graph/nodes/select-skills.node.js';
import type { MotionGraphState } from '../../../../packages/ai/graph/state.js';
import type { RoutedSkill } from '../../../../packages/motionly-skills/router.js';

describe('createSelectSkillsNode', () => {
    it('keeps selected skill guidance within the generation prompt budget', async () => {
        const onSkillsSelected = vi.fn();
        const node = createSelectSkillsNode({
            loadSkills: async () => ({
                manifest: { version: 'test' },
                skills: [
                    { id: 'kinetic', tags: ['kinetic'], content: 'a'.repeat(40_000) },
                    { id: 'promo', tags: ['promo'], content: 'b'.repeat(20_000) },
                ],
            }),
            onSkillsSelected,
        } as unknown as ResolvedMotionGraphDependencies);

        const update = await node({ intent: 'CREATE', message: 'kinetic promo' } as MotionGraphState);

        const selectedSkills = update.selectedSkills as RoutedSkill[];
        expect(selectedSkills.map((skill) => skill.id)).toEqual(['kinetic']);
        expect(onSkillsSelected).toHaveBeenCalledWith(expect.objectContaining({
            totalCharacters: 40_000,
        }));
        expect(selectedSkills.reduce((total, skill) => total + skill.content.length, 0)).toBeLessThanOrEqual(
            MAX_SKILL_PROMPT_CHARACTERS,
        );
    });
});
