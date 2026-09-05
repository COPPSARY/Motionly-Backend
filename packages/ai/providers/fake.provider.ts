import {
    createRequestSignal,
    ModelProviderError,
    motionlyGenerationSchema,
    type ChatRequest,
    type MotionlyGeneration,
    type MotionModelProvider,
    type MotionModelRequest,
    parseStructured,
    type StructuredModelRequest,
} from './model.provider.js';

export interface FakeProviderScript {
    generation: unknown | ((request: MotionModelRequest) => unknown | Promise<unknown>);
    chat: string | ((request: ChatRequest) => string | Promise<string>);
    structured?: unknown | ((request: StructuredModelRequest<unknown>) => unknown | Promise<unknown>);
}

export class FakeMotionModelProvider implements MotionModelProvider {
    readonly name = 'gemini' as const;

    constructor(private readonly script: FakeProviderScript) {}

    async generate(request: MotionModelRequest): Promise<MotionlyGeneration> {
        requireActive(request.signal, request.limits.timeoutMs);
        const value = typeof this.script.generation === 'function'
            ? await this.script.generation(request)
            : this.script.generation;
        const parsed = motionlyGenerationSchema.safeParse(value);
        if (!parsed.success) {
            throw new ModelProviderError(
                'PROVIDER_OUTPUT_INVALID',
                'The fake model output does not match the Motionly generation schema.',
                false,
            );
        }
        return parsed.data;
    }

    async structured<T>(request: StructuredModelRequest<T>): Promise<T> {
        requireActive(request.signal, request.limits.timeoutMs);
        const value = typeof this.script.structured === 'function'
            ? await this.script.structured(request)
            : this.script.structured;
        return parseStructured(JSON.stringify(value), request.schema);
    }

    async chat(request: ChatRequest): Promise<string> {
        requireActive(request.signal, request.limits.timeoutMs);
        return typeof this.script.chat === 'function' ? this.script.chat(request) : this.script.chat;
    }
}

function requireActive(signal: AbortSignal | undefined, timeoutMs: number): void {
    if (createRequestSignal(signal, timeoutMs).aborted) {
        throw new ModelProviderError('PROVIDER_TIMEOUT', 'The model request timed out or was cancelled.', false);
    }
}
