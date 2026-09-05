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
    type ChatRequest,
    type MotionlyGeneration,
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

    async generate(request: MotionModelRequest): Promise<MotionlyGeneration> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.messages.create({
                model: request.model,
                system: request.systemInstructions,
                max_tokens: request.limits.maxOutputTokens,
                messages: [{ role: 'user', content: request.prompt }],
                output_config: {
                    format: { type: 'json_schema', schema: motionlyGenerationJsonSchema },
                },
            }, { signal });
            return parseMotionlyGeneration(extractText(response));
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.messages.create({
                model: request.model, system: request.systemInstructions, max_tokens: request.limits.maxOutputTokens,
                messages: [{ role: 'user', content: request.prompt }],
                output_config: { format: { type: 'json_schema', schema: z.toJSONSchema(request.schema, { target: 'draft-7' }) } },
            }, { signal });
            return parseStructured(extractText(response), request.schema);
        } catch (error) { throw normalizeProviderError(this.name, error, signal); }
    }

    async chat(request: ChatRequest): Promise<string> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
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

function extractText(response: Message): string {
    return requireModelText(response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''));
}
