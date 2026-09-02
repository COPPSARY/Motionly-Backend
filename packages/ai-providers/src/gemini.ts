import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from '@google/genai';

import {
  ModelProviderError,
  type GenerationModelProvider,
  type ModelResponse,
  type ModelTurnInput,
} from './types.js';

export interface GeminiProviderOptions {
  apiKey: string;
  client?: GoogleGenAI;
}

export class GeminiModelProvider implements GenerationModelProvider {
  readonly name = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey.trim()) throw new Error('Gemini API key is required.');
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
  }

  async generate(input: ModelTurnInput, signal: AbortSignal): Promise<ModelResponse> {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(input.limits.timeoutMs)]);
    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: input.model,
        contents: input.prompt,
        config: {
          abortSignal: requestSignal,
          httpOptions: { timeout: input.limits.timeoutMs },
          systemInstruction: input.systemInstructions,
          maxOutputTokens: input.limits.maxOutputTokens,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          ...(input.tools.length ? {
            tools: [{ functionDeclarations: input.tools.map(toFunctionDeclaration) }],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
          } : {}),
        },
      });
    } catch (error) {
      throw normalizeGeminiError(error, requestSignal.aborted);
    }

    const toolCalls = extractFunctionCalls(response).map((call) => {
      if (!call.name) throw new ModelProviderError('PROVIDER_OUTPUT_INVALID', 'Gemini returned an unnamed tool call.', false);
      return {
        id: call.id ?? `${call.name}-${crypto.randomUUID()}`,
        name: call.name,
        arguments: call.args ?? {},
      };
    });
    return {
      text: response.text ?? '',
      toolCalls,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: String(response.candidates?.[0]?.finishReason ?? 'STOP'),
      ...(response.responseId ? { providerRequestId: response.responseId } : {}),
    };
  }
}

interface GeminiFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

function extractFunctionCalls(response: GenerateContentResponse): GeminiFunctionCall[] {
  const calls = (response.candidates ?? []).flatMap((candidate) => (candidate.content?.parts ?? []).flatMap((part) => (
    part.functionCall ? [{ ...part.functionCall }] : []
  )));
  return calls.length ? calls : (response.functionCalls ?? []).map((call) => ({ ...call }));
}

function toFunctionDeclaration(tool: ModelTurnInput['tools'][number]): FunctionDeclaration {
  return { name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters };
}

function normalizeGeminiError(error: unknown, aborted: boolean): ModelProviderError {
  if (aborted) return new ModelProviderError('PROVIDER_TIMEOUT', 'The model request timed out or was cancelled.', false);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
  if (status === 401 || status === 403) return new ModelProviderError('PROVIDER_AUTH_FAILED', 'Gemini rejected the configured API key.', false);
  if (status === 404) return new ModelProviderError('PROVIDER_MODEL_UNAVAILABLE', providerMessage(error, 'The configured Gemini model is unavailable.'), false);
  if (status === 429) return new ModelProviderError('PROVIDER_RATE_LIMITED', 'The model provider rate limit was reached.', false);
  if (status !== undefined && status >= 500) return new ModelProviderError('PROVIDER_UNAVAILABLE', 'The model provider is temporarily unavailable.', false);
  return new ModelProviderError('PROVIDER_ERROR', providerMessage(error, 'The model provider request failed.'), false);
}

function providerMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const message = (JSON.parse(error.message) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string' && message.length <= 1_000) return message;
  } catch { /* plain-text provider error */ }
  return error.message.length <= 1_000 ? error.message : fallback;
}
