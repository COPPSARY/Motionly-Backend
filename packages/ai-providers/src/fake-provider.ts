import type { GenerationModelProvider, ModelEvent, ModelTurnInput } from './types.js';

export type FakeProviderScript = ModelEvent[] | ((input: ModelTurnInput) => ModelEvent[] | Promise<ModelEvent[]>);

export class FakeModelProvider implements GenerationModelProvider {
  readonly name = 'gemini' as const;
  readonly inputs: ModelTurnInput[] = [];
  private index = 0;

  constructor(private readonly scripts: FakeProviderScript[]) {}

  async *runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent> {
    if (signal.aborted) throw signal.reason;
    this.inputs.push(input);
    const script = this.scripts[this.index++];
    if (!script) throw new Error('Fake provider script exhausted.');
    const events = typeof script === 'function' ? await script(input) : script;
    for (const event of events) {
      if (signal.aborted) throw signal.reason;
      yield event;
    }
  }
}
