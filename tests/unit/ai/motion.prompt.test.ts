import { describe, expect, it } from 'vitest';

import { buildMotionSystemPrompt } from '../../../packages/ai/prompts/motion.prompt.js';

describe('buildMotionSystemPrompt', () => {
    it('requires timeline source that the Motionly runtime can mount', () => {
        const prompt = buildMotionSystemPrompt([]);

        expect(prompt).toContain('export function buildTimeline({ root, timeline, register })');
        expect(prompt).toContain('only call register with an element that was found');
    });

    it('includes selected website editor guidance', () => {
        const prompt = buildMotionSystemPrompt([{
            id: 'editor-controls',
            version: '1.0.0',
            reason: 'Baseline guidance for this generation intent.',
            content: 'Register each stable data-edit layer for scale and rotation controls.',
        }]);

        expect(prompt).toContain('--- skill: editor-controls');
        expect(prompt).toContain('Register each stable data-edit layer for scale and rotation controls.');
    });

    it('keeps user-facing replies focused on the creative outcome instead of internal implementation', () => {
        const prompt = buildMotionSystemPrompt([]);

        expect(prompt).toContain('Do not mention Motionly, the platform, the frontend, GSAP, code, skills, rendering, previews, exports, or internal process unless the user explicitly asks.');
    });
});
