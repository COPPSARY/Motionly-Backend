import OpenAI from 'openai';
import type {
    ChatCompletion,
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { z } from 'zod';

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

export const CLAUDEROUTER_BASE_URL = 'https://clauderouter.app/v1';

interface ClaudeRouterClient {
    chat: {
        completions: {
            create(
                body: ChatCompletionCreateParamsNonStreaming,
                options?: { signal?: AbortSignal },
            ): Promise<ChatCompletion>;
        };
    };
}

export interface ClaudeRouterProviderOptions {
    apiKey: string;
    client?: ClaudeRouterClient;
}

/**
 * ClaudeRouter is an OpenAI-compatible gateway in front of Claude models. It speaks
 * `/v1/chat/completions` rather than the Responses API, so this provider constrains
 * output with `response_format` instead of `text.format`.
 */
export class ClaudeRouterMotionModelProvider implements MotionModelProvider {
    readonly name = 'clauderouter' as const;
    private readonly client: ClaudeRouterClient;

    constructor(options: ClaudeRouterProviderOptions) {
        if (!options.apiKey.trim()) throw new Error('ClaudeRouter API key is required.');
        this.client = options.client ?? new OpenAI({
            apiKey: options.apiKey,
            baseURL: CLAUDEROUTER_BASE_URL,
        });
    }

    async generate(request: MotionModelRequest): Promise<ModelGenerationResult> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.chat.completions.create({
                model: request.model,
                messages: promptMessages(request.systemInstructions, request.prompt),
                max_completion_tokens: request.limits.maxOutputTokens,

                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'motionly_generation',
                        strict: true,
                        schema: motionlyGenerationJsonSchema,
                    },
                },
            }, { signal });
            return {
                generation: parseMotionlyGeneration(extractText(response)),
                usage: tokenUsage(response.usage?.prompt_tokens, response.usage?.completion_tokens),
            };
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.chat.completions.create({
                model: request.model,
                messages: promptMessages(request.systemInstructions, request.prompt),
                max_completion_tokens: request.limits.maxOutputTokens,

                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: request.schemaName,
                        strict: true,
                        schema: z.toJSONSchema(request.schema, { target: 'draft-7' }),
                    },
                },
            }, { signal });
            return parseStructured(extractText(response), request.schema);
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async chat(request: ChatRequest): Promise<string> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.chat.completions.create({
                model: request.model,
                messages: [
                    { role: 'system', content: request.systemInstructions },
                    ...request.messages,
                ],
                max_completion_tokens: request.limits.maxOutputTokens,

            }, { signal });
            return extractText(response);
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }
}

function promptMessages(systemInstructions: string, prompt: string): ChatCompletionMessageParam[] {
    return [
        { role: 'system', content: systemInstructions },
        { role: 'user', content: prompt },
    ];
}

function extractText(response: ChatCompletion): string {
    return requireModelText(response.choices[0]?.message?.content ?? undefined);
}
