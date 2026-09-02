import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { GeminiModelProvider } from '../../../packages/ai-providers/src/gemini.js';

const input = {
  model: 'gemini-test',
  systemInstructions: 'Motionly core rules',
  messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Edit the title' }] }],
  tools: [{ name: 'read_project_file', description: 'Read source', parameters: { type: 'object' } }],
  limits: { maxOutputTokens: 2_000, timeoutMs: 5_000 },
};

describe('GeminiModelProvider', () => {
  it('normalizes official SDK text, tool calls, usage, and completion', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'Inspecting source.',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
      candidates: [{ finishReason: 'STOP', content: { parts: [{
        functionCall: { id: 'call-1', name: 'read_project_file', args: { path: 'composition.html' } },
        thoughtSignature: 'opaque-provider-state',
      }] } }],
      responseId: 'response-1',
    });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const provider = new GeminiModelProvider({ apiKey: 'server-only-test-key', client, maxTransientRetries: 0 });
    const events = [];
    for await (const event of provider.runTurn(input, new AbortController().signal)) events.push(event);

    expect(events).toContainEqual({ type: 'text', text: 'Inspecting source.' });
    expect(events).toContainEqual({
      type: 'tool_call', id: 'call-1', name: 'read_project_file', arguments: { path: 'composition.html' }, providerState: 'opaque-provider-state',
    });
    expect(events).toContainEqual({ type: 'usage', inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    expect(events).toContainEqual({ type: 'completed', finishReason: 'STOP', providerRequestId: 'response-1' });
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-test',
      config: expect.objectContaining({ systemInstruction: 'Motionly core rules', maxOutputTokens: 2_000 }),
    }));
  });

  it('maps rate limits to a stable retryable error without leaking provider bodies', async () => {
    const client = { models: { generateContent: vi.fn().mockRejectedValue({ status: 429, message: 'raw secret provider body' }) } } as unknown as GoogleGenAI;
    const provider = new GeminiModelProvider({ apiKey: 'server-only-test-key', client, maxTransientRetries: 0 });
    const consume = async () => { for await (const _event of provider.runTurn(input, new AbortController().signal)) { /* consume */ } };
    await expect(consume()).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED', retryable: true });
    await expect(consume()).rejects.not.toThrow('raw secret provider body');
  });

  it('retries transient failures with bounded backoff', async () => {
    const generateContent = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue({ text: 'Recovered.', candidates: [{ finishReason: 'STOP' }] });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const provider = new GeminiModelProvider({
      apiKey: 'server-only-test-key', client, maxTransientRetries: 2, retryBaseDelayMs: 25, sleep, random: () => 0.5,
    });
    const events = [];
    for await (const event of provider.runTurn(input, new AbortController().signal)) events.push(event);

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(25, expect.any(AbortSignal));
    expect(events).toContainEqual({ type: 'text', text: 'Recovered.' });
  });
});
