import OpenAI from 'openai';
import { z } from 'zod';
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

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

interface OpenAIClient {
    responses: {
        create(body: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Response>;
    };
}

export interface OpenAIProviderOptions {
    apiKey: string;
    client?: OpenAIClient;
}

export class OpenAIMotionModelProvider implements MotionModelProvider {
    readonly name = 'openai' as const;
    private readonly client: OpenAIClient;

    constructor(options: OpenAIProviderOptions) {
        if (!options.apiKey.trim()) throw new Error('OpenAI API key is required.');
        this.client = options.client ?? new OpenAI({ apiKey: options.apiKey });
    }

    async generate(request: MotionModelRequest): Promise<MotionlyGeneration> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.responses.create({
                model: request.model,
                instructions: request.systemInstructions,
                input: request.prompt,
                max_output_tokens: request.limits.maxOutputTokens,
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'motionly_generation',
                        strict: true,
                        schema: motionlyGenerationJsonSchema,
                    },
                },
            }, { signal });
            return parseMotionlyGeneration(requireModelText(response.output_text));
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.responses.create({
                model: request.model, instructions: request.systemInstructions, input: request.prompt, max_output_tokens: request.limits.maxOutputTokens,
                text: { format: { type: 'json_schema', name: request.schemaName, strict: true, schema: z.toJSONSchema(request.schema, { target: 'draft-7' }) } },
            }, { signal });
            return parseStructured(requireModelText(response.output_text), request.schema);
        } catch (error) { throw normalizeProviderError(this.name, error, signal); }
    }

    async chat(request: ChatRequest): Promise<string> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.responses.create({
                model: request.model,
                instructions: request.systemInstructions,
                input: request.messages,
                max_output_tokens: request.limits.maxOutputTokens,
            }, { signal });
            return requireModelText(response.output_text);
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }
}
