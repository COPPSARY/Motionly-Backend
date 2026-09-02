import type { GenerationModelProvider, ModelResponse, ModelTurnInput } from './types.js';

export type FakeProviderScript = ModelResponse | ((input: ModelTurnInput) => ModelResponse | Promise<ModelResponse>);

export class FakeModelProvider implements GenerationModelProvider {
  readonly name = 'gemini' as const;
  readonly inputs: ModelTurnInput[] = [];

  constructor(private readonly script: FakeProviderScript) {}

  async generate(input: ModelTurnInput, signal: AbortSignal): Promise<ModelResponse> {
    if (signal.aborted) throw signal.reason;
    this.inputs.push(input);
    return typeof this.script === 'function' ? this.script(input) : this.script;
  }
}
