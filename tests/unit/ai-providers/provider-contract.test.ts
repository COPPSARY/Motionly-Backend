import { describe, expect, it } from 'vitest';

import { FakeModelProvider } from '../../../packages/ai-providers/src/fake-provider.js';

const input = {
  model: 'fake-model',
  systemInstructions: 'Follow Motionly rules.',
  messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Change the title.' }] }],
  tools: [{
    name: 'replace_project_file',
    description: 'Replace an allowed source file.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  }],
  limits: { maxOutputTokens: 2_000, timeoutMs: 10_000 },
};

describe('model provider contract', () => {
  it('supports sequential tool turns without exposing a provider response shape', async () => {
    const provider = new FakeModelProvider([
      [
        { type: 'tool_call', id: 'call-1', name: 'replace_project_file', arguments: { path: 'composition.html' } },
        { type: 'usage', inputTokens: 100, outputTokens: 10, totalTokens: 110 },
        { type: 'completed', finishReason: 'TOOL_CALL' },
      ],
      [{ type: 'text', text: 'Done.' }, { type: 'completed', finishReason: 'STOP' }],
    ]);

    const first = [];
    for await (const event of provider.runTurn(input, new AbortController().signal)) first.push(event);
    const second = [];
    for await (const event of provider.runTurn(input, new AbortController().signal)) second.push(event);

    expect(first).toContainEqual(expect.objectContaining({ type: 'tool_call', name: 'replace_project_file' }));
    expect(second).toContainEqual({ type: 'text', text: 'Done.' });
    expect(provider.inputs).toHaveLength(2);
  });

  it('honors an already-aborted request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const provider = new FakeModelProvider([[{ type: 'completed', finishReason: 'STOP' }]]);
    const collect = async () => {
      for await (const _event of provider.runTurn(input, controller.signal)) { /* consume */ }
    };
    await expect(collect()).rejects.toThrow('cancelled');
  });
});
