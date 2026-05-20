import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { CapabilityMismatchError, ProviderUnavailableError } from '@tierfall/core';
import { OllamaAdapter } from '../src/adapter.js';

function mockFetchResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
}): Response {
  const status = opts.status ?? 200;
  const statusText = opts.statusText ?? 'OK';
  if (opts.text !== undefined) {
    return new Response(opts.text, { status, statusText });
  }
  return new Response(JSON.stringify(opts.body ?? {}), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okBody = {
  message: { role: 'assistant', content: 'pong' },
  prompt_eval_count: 5,
  eval_count: 3,
  done_reason: 'stop',
};

describe('OllamaAdapter (closes #5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #5: happy path — returns text and usage', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b', baseUrl: 'http://localhost:11434' });

    const result = await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/chat');
    expect(result.text).toBe('pong');
    expect(result.tier).toBe('on-device');
    expect(result.model).toBe('llama3.2:3b');
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3, estimatedCostUSD: 0 });
    expect(result.fallChain).toEqual([]);
  });

  it('closes #5: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    await expect(
      adapter.complete({
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #5: HTTP 404 maps to ProviderUnavailableError with body detail', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: 'model "missing-model" not found',
      }),
    );
    const adapter = new OllamaAdapter({ model: 'missing-model' });

    const caught = await adapter
      .complete({ model: 'missing-model', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('404');
    expect((caught as Error).message).toContain('Not Found');
    expect((caught as Error).message).toContain('missing-model');
  });

  it('closes #5: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: 'overloaded',
      }),
    );
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #5: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #5: unexpected response shape maps to ProviderUnavailableError', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockFetchResponse({ body: { unrelated: 'shape' } }));
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });

    const caught = await adapter
      .complete({ model: 'llama3.2:3b', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('unexpected shape');
  });

  it('closes #5: missing prompt_eval_count coalesces to 0', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: { message: { role: 'assistant', content: 'cached' } },
      }),
    );
    const adapter = new OllamaAdapter({ model: 'llama3.2:3b' });
    const result = await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(Number.isNaN(result.usage.inputTokens)).toBe(false);
  });

  it('closes #5: baseUrl trailing slash is normalized', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OllamaAdapter({
      model: 'llama3.2:3b',
      baseUrl: 'http://localhost:11434/',
    });
    await adapter.complete({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(spy.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/chat');
  });
});
