import { describe, expect, it } from 'vitest';

import { createModelProvider } from '../../../../packages/ai/providers/factory.js';

describe('createModelProvider', () => {
    it('builds the Gemini provider from the Gemini key', () => {
        const provider = createModelProvider({ aiProvider: 'gemini', geminiApiKey: 'gemini-key' });

        expect(provider.name).toBe('gemini');
    });

    it('builds the OpenAI provider from the OpenAI key', () => {
        const provider = createModelProvider({ aiProvider: 'openai', openAiApiKey: 'openai-key' });

        expect(provider.name).toBe('openai');
    });

    it('builds the Anthropic provider from the Anthropic key', () => {
        const provider = createModelProvider({ aiProvider: 'anthropic', anthropicApiKey: 'anthropic-key' });

        expect(provider.name).toBe('anthropic');
    });

    it('names the missing variable when the selected provider has no key', () => {
        expect(() => createModelProvider({ aiProvider: 'openai', geminiApiKey: 'gemini-key' }))
            .toThrowError(/OPENAI_API_KEY/);
    });

    it('rejects a key that is only whitespace', () => {
        expect(() => createModelProvider({ aiProvider: 'gemini', geminiApiKey: '   ' }))
            .toThrowError(/GEMINI_API_KEY/);
    });
});
