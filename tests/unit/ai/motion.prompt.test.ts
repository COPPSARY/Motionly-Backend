import { describe, expect, it } from 'vitest';

import { buildMotionSystemPrompt } from '../../../packages/ai/prompts/motion.prompt.js';

describe('buildMotionSystemPrompt', () => {
    it('requires timeline source that the Motionly runtime can mount', () => {
        const prompt = buildMotionSystemPrompt([]);

        expect(prompt).toContain('export function buildTimeline({ root, timeline, register })');
        expect(prompt).toContain('only call register with an element that was found');
    });
});
