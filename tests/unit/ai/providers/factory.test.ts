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

    it('builds the SP Cambodia provider from its key', () => {
        const provider = createModelProvider({
            aiProvider: 'sp-cambodia',
            spCambodiaApiKey: 'sp-cambodia-key',
        });

        expect(provider.name).toBe('sp-cambodia');
    });

    it('builds the ClaudeRouter provider from its key', () => {
        const provider = createModelProvider({
            aiProvider: 'clauderouter',
            claudeRouterApiKey: 'clauderouter-key',
        });

        expect(provider.name).toBe('clauderouter');
    });

    it('builds the hashn0de provider from its key', () => {
        const provider = createModelProvider({
            aiProvider: 'hashn0de',
            hashn0deApiKey: 'hashn0de-key',
        });

        expect(provider.name).toBe('hashn0de');
    });

    it('names the missing variable when the selected provider has no key', () => {
        expect(() => createModelProvider({ aiProvider: 'openai', geminiApiKey: 'gemini-key' }))
            .toThrowError(/OPENAI_API_KEY/);
    });

    it('rejects a key that is only whitespace', () => {
        expect(() => createModelProvider({ aiProvider: 'gemini', geminiApiKey: '   ' }))
            .toThrowError(/GEMINI_API_KEY/);
    });

    it('names the SP Cambodia variable when its selected key is missing', () => {
        expect(() => createModelProvider({ aiProvider: 'sp-cambodia' }))
            .toThrowError(/SP_CAMBO_API_KEY/);
    });

    it('names the ClaudeRouter variable when its selected key is missing', () => {
        expect(() => createModelProvider({ aiProvider: 'clauderouter' }))
            .toThrowError(/CLAUDEROUTER_API_KEY/);
    });

    it('names the hashn0de variable when its selected key is missing', () => {
        expect(() => createModelProvider({ aiProvider: 'hashn0de' }))
            .toThrowError(/HASHN0DE_API_KEY/);
    });
});
