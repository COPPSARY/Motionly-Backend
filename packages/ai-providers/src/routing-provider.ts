
import type { GenerationModelProvider, ModelEvent, ModelTurnInput, ModelProviderError } from './types.js';

export class RoutingProvider implements GenerationModelProvider {
  readonly name = 'gemini'; // satisfy interface

  constructor(
    private readonly primary: GenerationModelProvider,
    private readonly secondary?: GenerationModelProvider
  ) {}

  async *runTurn(input: ModelTurnInput, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const isPrimary = !input.provider || input.provider === this.primary.name || !this.secondary;
    const target = isPrimary ? this.primary : this.secondary!;
    
    try {
      yield* target.runTurn(input, signal);
    } catch (error: any) {
      if (isPrimary && this.secondary && error && typeof error === 'object' && 'retryable' in error && error.retryable) {
        console.warn('Primary provider failed, falling back to secondary', error);
        yield* this.secondary.runTurn(input, signal);
      } else {
        throw error;
      }
    }
  }
}
