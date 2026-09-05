import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { GeminiModelProvider } from '../../../packages/ai-providers/gemini.js';

const input = {
  model: 'gemini-test',
  systemInstructions: 'Motionly core rules',
  prompt: 'Edit the title',
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
      }] } }],
      responseId: 'response-1',
    });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const provider = new GeminiModelProvider({ apiKey: 'server-only-test-key', client });
    
    const response = await provider.generate(input, new AbortController().signal);

    expect(response.text).toBe('Inspecting source.');
    expect(response.toolCalls).toContainEqual({
      id: 'call-1', name: 'read_project_file', arguments: { path: 'composition.html' }
    });
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    expect(response.finishReason).toBe('STOP');
    expect(response.providerRequestId).toBe('response-1');
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-test',
      contents: 'Edit the title',
      config: expect.objectContaining({ systemInstruction: 'Motionly core rules', maxOutputTokens: 2_000 }),
    }));
  });

  it('maps rate limits to a stable retryable error without leaking provider bodies', async () => {
    const client = { models: { generateContent: vi.fn().mockRejectedValue({ status: 429, message: 'raw secret provider body' }) } } as unknown as GoogleGenAI;
    const provider = new GeminiModelProvider({ apiKey: 'server-only-test-key', client });
    
    await expect(provider.generate(input, new AbortController().signal)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED', retryable: false });
    await expect(provider.generate(input, new AbortController().signal)).rejects.not.toThrow('raw secret provider body');
  });
});
