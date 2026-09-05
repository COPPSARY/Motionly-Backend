import { GeminiModelProvider } from '../../packages/ai-providers/gemini.js';
import type { ModelEvent, ModelToolDefinition } from '../../packages/ai-providers/types.js';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) throw new Error('GEMINI_API_KEY is required for the opt-in Gemini smoke evaluation.');

const model = process.env.AI_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-pro';
const tool: ModelToolDefinition = {
  name: 'list_project_files',
  description: 'List the canonical Motionly source files.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};
// A synthetic 1x1 PNG proves the configured model/API path accepts visual input
// without sending customer source, assets, prompts, or screenshots.
const syntheticPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const provider = new GeminiModelProvider({ apiKey });
const events: ModelEvent[] = [];
const startedAt = performance.now();

for await (const event of provider.runTurn({
  model,
  systemInstructions: 'This is a synthetic capability probe. Call list_project_files exactly once. Do not reproduce or describe the image.',
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'Confirm tool and image-input capability by calling the declared tool.' },
    { type: 'image', mimeType: 'image/png', data: syntheticPng },
  ] }],
  tools: [tool],
  limits: { maxOutputTokens: 512, timeoutMs: 30_000 },
}, new AbortController().signal)) events.push(event);

const calls = events.filter((event): event is Extract<ModelEvent, { type: 'tool_call' }> => event.type === 'tool_call');
const usage = events.filter((event): event is Extract<ModelEvent, { type: 'usage' }> => event.type === 'usage')
  .reduce((total, event) => ({
    inputTokens: total.inputTokens + event.inputTokens,
    outputTokens: total.outputTokens + event.outputTokens,
    totalTokens: total.totalTokens + event.totalTokens,
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
const completion = events.findLast((event): event is Extract<ModelEvent, { type: 'completed' }> => event.type === 'completed');
const passed = calls.length === 1 && calls[0]?.name === tool.name && Boolean(completion);
const report = {
  version: 1,
  passed,
  provider: provider.name,
  model,
  capabilities: { functionCalling: calls.length === 1 && calls[0]?.name === tool.name, imageInput: true },
  toolCalls: calls.map((call) => call.name),
  textBytes: events.filter((event): event is Extract<ModelEvent, { type: 'text' }> => event.type === 'text')
    .reduce((total, event) => total + Buffer.byteLength(event.text, 'utf8'), 0),
  usage,
  finishReason: completion?.finishReason ?? null,
  providerRequestId: completion?.providerRequestId ?? null,
  elapsedMs: Math.round(performance.now() - startedAt),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
