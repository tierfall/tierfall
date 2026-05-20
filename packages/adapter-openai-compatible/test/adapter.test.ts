import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
} from '@tierfall/core';
import { OpenAICompatibleAdapter } from '../src/adapter.js';

function mockFetchResponse(opts: {
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
  id: 'chatcmpl-test',
  object: 'chat.completion',
  model: 'gpt-5-mini',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'pong' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

describe('OpenAICompatibleAdapter (closes #6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #6: happy path — returns text, usage, computed cost, Bearer header', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      capability: { costPerMillionInputTokens: 1, costPerMillionOutputTokens: 4 },
    });

    const result = await adapter.complete({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const firstCall = spy.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to have been called');
    expect(firstCall[0]).toBe('https://api.openai.com/v1/chat/completions');
    const init = firstCall[1];
    if (!init) throw new Error('expected fetch to have been called with init');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    expect(result.text).toBe('pong');
    expect(result.tier).toBe('cheap-cloud');
    expect(result.model).toBe('gpt-5-mini');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(3);
    expect(result.usage.estimatedCostUSD).toBeCloseTo(0.000017, 10);
    expect(result.fallChain).toEqual([]);
  });

  it('closes #6: system messages stay in messages array (not extracted)', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    await adapter.complete({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'ping' },
      ],
    });

    const firstCall = spy.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to have been called');
    const init = firstCall[1];
    if (!init) throw new Error('expected fetch to have been called with init');
    const body = JSON.parse(init.body as string) as {
      system?: string;
      messages: { role: string; content: string }[];
    };
    expect(body.system).toBeUndefined();
    expect(body.messages).toEqual([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'ping' },
    ]);
  });

  it('closes #6: tier comes from config', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new OpenAICompatibleAdapter({
      apiKey: 'sk-test',
      model: 'gpt-5-pro',
      tier: 'premium-cloud',
    });
    const result = await adapter.complete({
      model: 'gpt-5-pro',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.tier).toBe('premium-cloud');
  });

  it('closes #6: content === null coalesces to empty string (tool_calls finish_reason)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: {
          ...okBody,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null },
              finish_reason: 'tool_calls',
            },
          ],
        },
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });
    const result = await adapter.complete({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.text).toBe('');
  });

  it('closes #6: HTTP 401 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 401,
        statusText: 'Unauthorized',
        text: '{"error":{"message":"Incorrect API key provided"}}',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-bogus', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('401');
    expect((caught as Error).message).toContain('Incorrect API key');
  });

  it('closes #6: HTTP 429 maps to BudgetExceededError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 429,
        statusText: 'Too Many Requests',
        text: '{"error":{"message":"You exceeded your current quota"}}',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as Error).message).toContain('429');
    expect((caught as Error).message).toContain('quota');
  });

  it('closes #6: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 503,
        statusText: 'Service Unavailable',
        text: 'overloaded',
      }),
    );
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #6: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    const caught = await adapter
      .complete({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #6: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new OpenAICompatibleAdapter({ apiKey: 'sk-test', model: 'gpt-5-mini' });

    await expect(
      adapter.complete({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #6: missing apiKey → constructor throws', () => {
    expect(() => new OpenAICompatibleAdapter({ model: 'gpt-5-mini' })).toThrow(/requires `apiKey`/);
    expect(() => new OpenAICompatibleAdapter({ apiKey: '', model: 'gpt-5-mini' })).toThrow(
      /requires `apiKey`/,
    );
  });
});
