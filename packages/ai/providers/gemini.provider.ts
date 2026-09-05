import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';

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

interface GeminiClient {
    models: {
        generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse>;
    };
}

export interface GeminiProviderOptions {
    apiKey: string;
    client?: GeminiClient;
}

export class GeminiMotionModelProvider implements MotionModelProvider {
    readonly name = 'gemini' as const;
    private readonly client: GeminiClient;

    constructor(options: GeminiProviderOptions) {
        if (!options.apiKey.trim()) throw new Error('Gemini API key is required.');
        this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    }

    async generate(request: MotionModelRequest): Promise<MotionlyGeneration> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.models.generateContent({
                model: request.model,
                contents: request.prompt,
                config: {
                    abortSignal: signal,
                    httpOptions: { timeout: request.limits.timeoutMs },
                    systemInstruction: request.systemInstructions,
                    maxOutputTokens: request.limits.maxOutputTokens,
                    responseMimeType: 'application/json',
                    responseJsonSchema: motionlyGenerationJsonSchema,
                },
            });
            return parseMotionlyGeneration(requireModelText(response.text));
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.models.generateContent({
                model: request.model, contents: request.prompt,
                config: {
                    abortSignal: signal, httpOptions: { timeout: request.limits.timeoutMs },
                    systemInstruction: request.systemInstructions, maxOutputTokens: request.limits.maxOutputTokens,
                    responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(request.schema, { target: 'draft-7' }),
                },
            });
            return parseStructured(requireModelText(response.text), request.schema);
        } catch (error) { throw normalizeProviderError(this.name, error, signal); }
    }

    async chat(request: ChatRequest): Promise<string> {
        const signal = createRequestSignal(request.signal, request.limits.timeoutMs);
        try {
            const response = await this.client.models.generateContent({
                model: request.model,
                contents: request.messages.map((message) => ({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }],
                })),
                config: {
                    abortSignal: signal,
                    httpOptions: { timeout: request.limits.timeoutMs },
                    systemInstruction: request.systemInstructions,
                    maxOutputTokens: request.limits.maxOutputTokens,
                },
            });
            return requireModelText(response.text);
        } catch (error) {
            throw normalizeProviderError(this.name, error, signal);
        }
    }
}
