export type JsonSchema = Record<string, unknown>;

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ModelTurnInput {
  model: string;
  systemInstructions: string;
  prompt: string;
  tools: ModelToolDefinition[];
  limits: { maxOutputTokens: number; timeoutMs: number };
}

export interface ModelResponse {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  finishReason: string;
  providerRequestId?: string;
}

export type ProviderErrorCode =
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_OUTPUT_INVALID'
  | 'PROVIDER_MODEL_UNAVAILABLE'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_ERROR';

export class ModelProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

export interface GenerationModelProvider {
  readonly name: 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';
  generate(input: ModelTurnInput, signal: AbortSignal): Promise<ModelResponse>;
}
