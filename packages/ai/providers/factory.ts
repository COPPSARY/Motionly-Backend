import { AnthropicMotionModelProvider } from './anthropic.provider.js';
import { GeminiMotionModelProvider } from './gemini.provider.js';
import type { ModelProviderName, MotionModelProvider } from './model.provider.js';
import { OpenAIMotionModelProvider } from './openai.provider.js';

/** The provider-selection slice of the parsed environment. */
export interface ModelProviderConfig {
    aiProvider: ModelProviderName;
    geminiApiKey?: string | undefined;
    openAiApiKey?: string | undefined;
    anthropicApiKey?: string | undefined;
}

const KEY_VARIABLES: Record<ModelProviderName, string> = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * Builds the single provider named by `AI_PROVIDER`. Only that provider's key is
 * required, so a deployment configures one vendor rather than all three.
 */
export function createModelProvider(config: ModelProviderConfig): MotionModelProvider {
    switch (config.aiProvider) {
        case 'gemini':
            return new GeminiMotionModelProvider({ apiKey: requireKey(config.aiProvider, config.geminiApiKey) });
        case 'openai':
            return new OpenAIMotionModelProvider({ apiKey: requireKey(config.aiProvider, config.openAiApiKey) });
        case 'anthropic':
            return new AnthropicMotionModelProvider({ apiKey: requireKey(config.aiProvider, config.anthropicApiKey) });
    }
}

function requireKey(provider: ModelProviderName, key: string | undefined): string {
    if (!key?.trim()) {
        throw new Error(`${KEY_VARIABLES[provider]} is required when AI_PROVIDER is "${provider}".`);
    }
    return key;
}
