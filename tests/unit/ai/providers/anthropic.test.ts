import { describe, expect, it, vi } from 'vitest';

import { AnthropicMotionModelProvider } from '../../../../packages/ai/providers/anthropic.provider.js';
import { intentSchema } from '../../../../packages/ai/schemas/intent.schema.js';

const generation = {
    title: 'Launch', duration: 8, width: 1920, height: 1080, fps: 30,
    scenes: [{ id: 'intro', label: 'Intro', start: 0, duration: 8, accent: '#7c3aed' }],
    compositionHtml: '<main>Launch</main>', timelineJs: 'timeline.play();', reply: 'Created it.',
};

describe('AnthropicMotionModelProvider', () => {
    it('uses Messages structured output and validates the composition', async () => {
        const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(generation) }] });
        const provider = new AnthropicMotionModelProvider({ apiKey: 'test-key', client: { messages: { create } } });

        await expect(provider.generate({
            model: 'claude-test', systemInstructions: 'Motionly rules', prompt: 'Create it',
            limits: { maxOutputTokens: 2_000, timeoutMs: 5_000 },
        })).resolves.toEqual(generation);
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            model: 'claude-test', system: 'Motionly rules', max_tokens: 2_000,
            messages: [{ role: 'user', content: 'Create it' }],
            output_config: { format: expect.objectContaining({ type: 'json_schema' }) },
        }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    });

    it('joins text blocks returned for chat', async () => {
        const create = vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Start with the logo.' }, { type: 'text', text: ' Then reveal the title.' }],
        });
        const provider = new AnthropicMotionModelProvider({ apiKey: 'test-key', client: { messages: { create } } });

        await expect(provider.chat({
            model: 'claude-test', systemInstructions: 'Plan motion',
            messages: [{ role: 'user', content: 'How should it start?' }], limits: { maxOutputTokens: 500, timeoutMs: 5_000 },
        })).resolves.toBe('Start with the logo. Then reveal the title.');
    });

    it('uses JSON Schema for structured intent output', async () => {
        const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"intent":"EDIT"}' }] });
        const provider = new AnthropicMotionModelProvider({ apiKey: 'test-key', client: { messages: { create } } });
        await expect(provider.structured({ model: 'claude-test', systemInstructions: 'Classify.', prompt: 'Change it', schemaName: 'motionly_intent', schema: intentSchema, limits: { maxOutputTokens: 128, timeoutMs: 5_000 } })).resolves.toEqual({ intent: 'EDIT' });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ output_config: { format: expect.objectContaining({ type: 'json_schema' }) } }), expect.anything());
    });
});
