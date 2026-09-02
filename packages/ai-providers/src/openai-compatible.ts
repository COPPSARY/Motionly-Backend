import type { GenerationModelProvider, ModelEvent, ModelTurnInput, ModelMessage, ModelContent, ModelProviderError } from './types.js';

export class OpenAICompatibleProvider implements GenerationModelProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    // Ensure base URL does not have trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  async *runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const messages = this.buildMessages(input);
    
    // Map tool definitions if any (standard OpenAI function calling)
    const tools = input.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

    const requestBody: any = {
      model: input.model,
      messages: messages,
      stream: false,
      max_tokens: input.limits.maxOutputTokens
    };
    
    if (tools.length > 0) {
      requestBody.tools = tools;
    }

    // DEBUG: Log the exact request being sent to the AI proxy
    console.log('\n--- AI REQUEST TO PROXY ---');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('---------------------------\n');

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(input.limits.timeoutMs)
      });

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}`;
        try {
          const errBody = await response.json();
          errorMsg = JSON.stringify(errBody);
        } catch { /* ignore */ }
        
        let code = 'PROVIDER_ERROR';
        if (response.status === 429) code = 'PROVIDER_RATE_LIMITED';
        if (response.status === 401 || response.status === 403) code = 'PROVIDER_AUTH_FAILED';
        if (response.status >= 500) code = 'PROVIDER_UNAVAILABLE';
        
        // @ts-ignore (we know ModelProviderError exists from types.ts)
        const { ModelProviderError } = await import('./types.js');
        throw new ModelProviderError(code as any, errorMsg, response.status === 429 || response.status >= 500);
      }

      const payload = await response.json() as any;
      
      // DEBUG: Log the exact response received from the AI proxy
      console.log('\n--- AI RESPONSE FROM PROXY ---');
      console.log(JSON.stringify(payload, null, 2));
      console.log('------------------------------\n');
      
      const choice = payload.choices?.[0];
      const message = choice?.message;
      if (message?.content) yield { type: 'text', text: String(message.content) };
      for (const call of message?.tool_calls ?? []) {
        const args = typeof call.function?.arguments === 'string'
          ? JSON.parse(call.function.arguments || '{}')
          : (call.function?.arguments ?? {});
        yield { type: 'tool_call', id: call.id || `tool-${crypto.randomUUID()}`, name: call.function?.name || 'unknown', arguments: args };
      }
      if (payload.usage) yield {
        type: 'usage',
        inputTokens: payload.usage.prompt_tokens || 0,
        outputTokens: payload.usage.completion_tokens || 0,
        totalTokens: payload.usage.total_tokens || 0,
      };
      yield { type: 'completed', finishReason: choice?.finish_reason || 'stop', providerRequestId: payload.id };
      
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        const { ModelProviderError } = await import('./types.js');
        throw new ModelProviderError('PROVIDER_TIMEOUT', 'Provider request timed out', true);
      }
      throw err;
    }
  }

  private buildMessages(input: ModelTurnInput): any[] {
    const messages: any[] = [];
    
    if (input.systemInstructions) {
      messages.push({
        role: 'system',
        content: input.systemInstructions
      });
    }

    for (const msg of input.messages) {
      const role = msg.role;
      const toolCalls = msg.content.filter((content) => content.type === 'tool_call');
      const toolResults = msg.content.filter((content) => content.type === 'tool_result');
      if (role === 'assistant' && toolCalls.length) {
        messages.push({
          role: 'assistant',
          ...(msg.content.find((content) => content.type === 'text')?.type === 'text'
            ? { content: (msg.content.find((content) => content.type === 'text') as any).text }
            : { content: null }),
          tool_calls: toolCalls.map((content: any) => ({ id: content.id, type: 'function', function: { name: content.name, arguments: JSON.stringify(content.arguments) } })),
        });
        continue;
      }
      if (role === 'user' && toolResults.length) {
        for (const content of toolResults as any[]) messages.push({ role: 'tool', tool_call_id: content.id, name: content.name, content: JSON.stringify(content.result) });
        continue;
      }
      if (msg.content.length === 1 && msg.content[0] && msg.content[0].type === 'text') {
        messages.push({ role, content: (msg.content[0] as any).text });
      } else {
        const contentArr = msg.content.map(c => {
          if (!c) return { type: 'text', text: '' };
          if (c.type === 'text') return { type: 'text', text: (c as any).text || '' };
          if (c.type === 'image') return { type: 'image_url', image_url: { url: `data:${(c as any).mimeType};base64,${(c as any).data}` } };
          return { type: 'text', text: '' };
        });
        messages.push({ role, content: contentArr });
      }
    }
    return messages;
  }
}
