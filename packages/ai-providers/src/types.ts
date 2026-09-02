export type JsonSchema = Record<string, unknown>;

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export type ModelContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown>; providerState?: unknown }
  | { type: 'tool_result'; id: string; name: string; result: Record<string, unknown> };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: ModelContent[];
}

export interface ModelTurnInput {
  model: string;
  systemInstructions: string;
  messages: ModelMessage[];
  tools: ModelToolDefinition[];
  limits: { maxOutputTokens: number; timeoutMs: number };
}

export type ModelEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown>; providerState?: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: 'completed'; finishReason: string; providerRequestId?: string };

export type ProviderErrorCode =
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_OUTPUT_INVALID'
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
  runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent>;
}
