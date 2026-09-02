import { describe, expect, it } from 'vitest';

import { FakeModelProvider } from '../../../packages/ai-providers/src/fake-provider.js';

const input = {
  model: 'fake-model',
  systemInstructions: 'Follow Motionly rules.',
  prompt: 'Change the title.',
  tools: [{
    name: 'return_changed_files',
    description: 'Return changed files.',
    parameters: { type: 'object', properties: { changes: { type: 'array' } }, required: ['changes'] },
  }],
  limits: { maxOutputTokens: 2_000, timeoutMs: 10_000 },
};

describe('model provider contract', () => {
  it('returns one normalized model response', async () => {
    const provider = new FakeModelProvider({
      text: '',
      toolCalls: [{ id: 'call-1', name: 'return_changed_files', arguments: { changes: [] } }],
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      finishReason: 'tool_calls',
    });

    const response = await provider.generate(input, new AbortController().signal);

    expect(response.toolCalls).toContainEqual(expect.objectContaining({ name: 'return_changed_files' }));
    expect(provider.inputs).toHaveLength(1);
  });

  it('honors an already-aborted request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const provider = new FakeModelProvider({
      text: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: 'stop',
    });

    await expect(provider.generate(input, controller.signal)).rejects.toThrow('cancelled');
  });
});
