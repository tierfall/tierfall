import { describe, expect, it } from '@jest/globals';
import { ProviderUnavailableError } from '@tierfall/core';
import { OllamaAdapter } from '../src/adapter.js';

const OLLAMA_URL = process.env.TIERFALL_OLLAMA_TEST_URL;
const OLLAMA_MODEL = process.env.TIERFALL_OLLAMA_TEST_MODEL ?? 'qwen2.5:0.5b';
const describeIntegration =
  OLLAMA_URL !== undefined && OLLAMA_URL !== '' ? describe : describe.skip;

describeIntegration('OllamaAdapter integration (closes #5)', () => {
  it('completes a basic request against a real Ollama', async () => {
    const adapter = new OllamaAdapter({
      ...(OLLAMA_URL !== undefined ? { baseUrl: OLLAMA_URL } : {}),
      model: OLLAMA_MODEL,
    });

    const result = await adapter.complete({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
    });

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.tier).toBe('on-device');
    expect(result.model).toBe(OLLAMA_MODEL);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCostUSD).toBe(0);
  }, 60_000);

  it('model-not-found returns ProviderUnavailableError', async () => {
    const adapter = new OllamaAdapter({
      ...(OLLAMA_URL !== undefined ? { baseUrl: OLLAMA_URL } : {}),
      model: 'definitely-not-a-real-model:0b',
    });

    const caught = await adapter
      .complete({
        model: 'definitely-not-a-real-model:0b',
        messages: [{ role: 'user', content: 'ping' }],
      })
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
  }, 30_000);

  it('connection refused (closed port) returns ProviderUnavailableError', async () => {
    const adapter = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:1',
      model: OLLAMA_MODEL,
    });

    const caught = await adapter
      .complete({
        model: OLLAMA_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
      })
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
  }, 15_000);
});
