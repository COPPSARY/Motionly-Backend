import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
    Message,
    MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';

import {
    createRequestSignal,
    motionlyGenerationJsonSchema,
    normalizeProviderError,
    parseMotionlyGeneration,
    parseStructured,
    requireModelText,
    tokenUsage,
    type ChatRequest,
    type ModelGenerationResult,
    type MotionModelProvider,
    type MotionModelRequest,
    type StructuredModelRequest,
} from './model.provider.js';

interface AnthropicClient {
    messages: {
        create(body: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Message>;
    };
}

export interface AnthropicProviderOptions {
    apiKey: string;
    client?: AnthropicClient;
}

export class AnthropicMotionModelProvider implements MotionModelProvider {
    readonly name = 'anthropic' as const;
    private readonly client: AnthropicClient;

    constructor(options: AnthropicProviderOptions) {
        if (!options.apiKey.trim()) throw new Error('Anthropic API key is required.');
        this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
    }

    async generate(request: MotionModelRequest): Promise<ModelGenerationResult> {
        const signal = createAnthropicRequestSignal(request);
        try {
            const response = await this.client.messages.create({
                model: request.model,
                system: request.systemInstructions,
                max_tokens: request.limits.maxOutputTokens,
                messages: [{ role: 'user', content: request.prompt }],
                output_config: {
                    format: { type: 'json_schema', schema: toAnthropicJsonSchema(motionlyGenerationJsonSchema) },
                },
            }, { signal });
            return {
                generation: parseMotionlyGeneration(extractText(response)),
                usage: tokenUsage(response.usage.input_tokens, response.usage.output_tokens),
            };
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        const signal = createAnthropicRequestSignal(request);
        try {
            const response = await this.client.messages.create({
                model: request.model, system: request.systemInstructions, max_tokens: request.limits.maxOutputTokens,
                messages: [{ role: 'user', content: request.prompt }],
                output_config: {
                    format: {
                        type: 'json_schema',
                        schema: toAnthropicJsonSchema(z.toJSONSchema(request.schema, { target: 'draft-7' })),
                    },
                },
            }, { signal });
            return parseStructured(extractText(response), request.schema);
        } catch (error) { throw normalizeProviderError(this.name, error, signal); }
    }

    async chat(request: ChatRequest): Promise<string> {
        const signal = createAnthropicRequestSignal(request);
        try {
            const response = await this.client.messages.create({
                model: request.model,
                system: request.systemInstructions,
                max_tokens: request.limits.maxOutputTokens,
                messages: request.messages,
            }, { signal });
            return extractText(response);
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }
}

const ANTHROPIC_MAX_TIMEOUT_MS = 90_000;

function createAnthropicRequestSignal(request: { signal?: AbortSignal; limits: { timeoutMs: number } }): AbortSignal {
    return createRequestSignal(request.signal, Math.min(request.limits.timeoutMs, ANTHROPIC_MAX_TIMEOUT_MS));
}

function extractText(response: Message): string {
    return requireModelText(response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''));
}

const ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength', 'minItems', 'maxItems',
]);

/**
 * Anthropic rejects JSON Schema numeric, string, and array constraints in
 * structured output requests. Keep the full Zod schema for post-response
 * validation, but omit those unsupported transport-only constraints.
 */
function toAnthropicJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
    return stripUnsupportedSchemaKeywords(schema) as Record<string, unknown>;
}

function stripUnsupportedSchemaKeywords(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripUnsupportedSchemaKeywords);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
            .map(([key, child]) => [key, stripUnsupportedSchemaKeywords(child)]),
    );
}
