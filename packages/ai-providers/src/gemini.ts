import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Part } from '@google/genai';

import {
  ModelProviderError,
  type GenerationModelProvider,
  type ModelContent,
  type ModelEvent,
  type ModelTurnInput,
} from './types.js';

export interface GeminiProviderOptions {
  apiKey: string;
  client?: GoogleGenAI;
  maxTransientRetries?: number;
  retryBaseDelayMs?: number;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}

export class GeminiModelProvider implements GenerationModelProvider {
  readonly name = 'gemini' as const;
  private readonly client: GoogleGenAI;
  private readonly maxTransientRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey.trim()) throw new Error('Gemini API key is required.');
    // Official SDK initialization: https://googleapis.github.io/js-genai/#initialization
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    this.maxTransientRetries = options.maxTransientRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.sleep = options.sleep ?? abortableDelay;
    this.random = options.random ?? Math.random;
    if (!Number.isInteger(this.maxTransientRetries) || this.maxTransientRetries < 0 || this.maxTransientRetries > 5) {
      throw new Error('Gemini transient retries must be between 0 and 5.');
    }
  }

  async *runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const response = await this.generateWithRetry(input, signal);
    try {
      if (response.text) yield { type: 'text', text: response.text };
      for (const call of extractFunctionCalls(response)) {
        if (!call.name) throw new ModelProviderError('PROVIDER_OUTPUT_INVALID', 'Gemini returned an unnamed tool call.', false);
        yield {
          type: 'tool_call',
          id: call.id ?? `${call.name}-${crypto.randomUUID()}`,
          name: call.name,
          arguments: call.args ?? {},
          ...(call.thoughtSignature ? { providerState: call.thoughtSignature } : {}),
        };
      }
      if (response.usageMetadata) {
        yield {
          type: 'usage',
          inputTokens: response.usageMetadata.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        };
      }
      yield {
        type: 'completed',
        finishReason: String(response.candidates?.[0]?.finishReason ?? 'STOP'),
        ...(response.responseId ? { providerRequestId: response.responseId } : {}),
      };
    } catch (error) {
      if (error instanceof ModelProviderError) throw error;
      throw normalizeGeminiError(error, signal.aborted);
    }
  }

  private async generateWithRetry(input: ModelTurnInput, signal: AbortSignal) {
    for (let attempt = 0; ; attempt += 1) {
      const timeout = AbortSignal.timeout(input.limits.timeoutMs);
      const requestSignal = AbortSignal.any([signal, timeout]);
      try {
        return await this.client.models.generateContent({
          model: input.model,
          contents: input.messages.map(toGeminiContent),
          config: {
            abortSignal: requestSignal,
            systemInstruction: input.systemInstructions,
            maxOutputTokens: input.limits.maxOutputTokens,
            ...(input.tools.length ? { tools: [{ functionDeclarations: input.tools.map(toFunctionDeclaration) }] } : {}),
          },
        });
      } catch (error) {
        const normalized = normalizeGeminiError(error, requestSignal.aborted);
        if (signal.aborted || !normalized.retryable || attempt >= this.maxTransientRetries) throw normalized;
        const exponentialDelay = Math.min(this.retryBaseDelayMs * (2 ** attempt), 10_000);
        const delayMs = normalized.retryAfterMs ?? Math.round(exponentialDelay * (0.75 + this.random() * 0.5));
        await this.sleep(delayMs, signal);
      }
    }
  }
}

interface GeminiFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  thoughtSignature?: string;
}

function extractFunctionCalls(response: GenerateContentResponse): GeminiFunctionCall[] {
  const calls = (response.candidates ?? []).flatMap((candidate) => (candidate.content?.parts ?? []).flatMap((part) => {
    if (!part.functionCall) return [];
    return [{ ...part.functionCall, ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}) }];
  }));
  return calls.length ? calls : (response.functionCalls ?? []).map((call) => ({ ...call }));
}

function toFunctionDeclaration(tool: ModelTurnInput['tools'][number]): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  };
}

function toGeminiContent(message: ModelTurnInput['messages'][number]): Content {
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: message.content.map(toGeminiPart),
  };
}

function toGeminiPart(content: ModelContent): Part {
  switch (content.type) {
    case 'text':
      return { text: content.text };
    case 'image':
      return { inlineData: { mimeType: content.mimeType, data: content.data } };
    case 'tool_call':
      return {
        functionCall: { id: content.id, name: content.name, args: content.arguments },
        ...(typeof content.providerState === 'string' ? { thoughtSignature: content.providerState } : {}),
      };
    case 'tool_result':
      return { functionResponse: { id: content.id, name: content.name, response: { output: content.result } } };
  }
}

function normalizeGeminiError(error: unknown, aborted: boolean): ModelProviderError {
  if (aborted) return new ModelProviderError('PROVIDER_TIMEOUT', 'The model request timed out or was cancelled.', true);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
  if (status === 401 || status === 403) return new ModelProviderError('PROVIDER_AUTH_FAILED', 'The model provider rejected its credentials.', false);
  if (status === 429) return new ModelProviderError('PROVIDER_RATE_LIMITED', 'The model provider rate limit was reached.', true, retryAfterMs(error));
  if (status !== undefined && status >= 500) return new ModelProviderError('PROVIDER_UNAVAILABLE', 'The model provider is temporarily unavailable.', true);
  return new ModelProviderError('PROVIDER_ERROR', 'The model provider request failed.', false);
}

function retryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = 'retryAfterMs' in error ? Number(error.retryAfterMs) : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 60_000) : undefined;
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Request cancelled.'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error('Request cancelled.'));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
