import {
  ModelProviderError,
  type GenerationModelProvider,
  type ModelResponse,
  type ModelTurnInput,
  type ProviderErrorCode,
} from './types.js';

export class OpenAICompatibleProvider implements GenerationModelProvider {
  readonly name = 'openai-compatible' as const;
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generate(input: ModelTurnInput, signal: AbortSignal): Promise<ModelResponse> {
    const tools = input.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(input.limits.timeoutMs)]);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: input.model,
          messages: [
            { role: 'system', content: input.systemInstructions },
            { role: 'user', content: input.prompt },
          ],
          stream: false,
          max_tokens: input.limits.maxOutputTokens,
          ...(tools.length ? {
            tools,
            tool_choice: tools.length === 1
              ? { type: 'function', function: { name: tools[0]!.function.name } }
              : 'required',
          } : {}),
        }),
        signal: requestSignal,
      });
    } catch (error) {
      if (requestSignal.aborted) throw new ModelProviderError('PROVIDER_TIMEOUT', 'Provider request timed out or was cancelled.', false);
      throw error;
    }

    if (!response.ok) {
      let message = `Provider request failed with HTTP ${response.status}.`;
      try { message = JSON.stringify(await response.json()).slice(0, 1_000); } catch { /* keep status message */ }
      const code: ProviderErrorCode = response.status === 429
        ? 'PROVIDER_RATE_LIMITED'
        : response.status === 401 || response.status === 403
          ? 'PROVIDER_AUTH_FAILED'
          : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_ERROR';
      throw new ModelProviderError(code, message, false);
    }

    const payload = await response.json() as {
      id?: string;
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }> };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = payload.choices?.[0];
    const toolCalls = (choice?.message?.tool_calls ?? []).map((call) => ({
      id: call.id ?? `tool-${crypto.randomUUID()}`,
      name: call.function?.name ?? '',
      arguments: parseArguments(call.function?.arguments),
    }));
    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? 'stop',
      ...(payload.id ? { providerRequestId: payload.id } : {}),
    };
  }
}

function parseArguments(value: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ModelProviderError('PROVIDER_OUTPUT_INVALID', 'Provider returned invalid changed-file arguments.', false);
  }
}
