import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
} from '@tierfall/core';
import { AnthropicAdapter } from '../src/adapter.js';

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
  id: 'msg_01abc',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-7',
  content: [{ type: 'text', text: 'pong' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 5, output_tokens: 3 },
};

describe('AnthropicAdapter (closes #8)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes #8: happy path — returns text, usage, and computed cost', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new AnthropicAdapter({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-7',
    });

    const result = await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const firstCall = spy.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch to have been called');
    expect(firstCall[0]).toBe('https://api.anthropic.com/v1/messages');
    const init = firstCall[1];
    if (!init) throw new Error('expected fetch to have been called with init');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');

    expect(result.text).toBe('pong');
    expect(result.tier).toBe('premium-cloud');
    expect(result.model).toBe('claude-sonnet-4-7');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(3);
    expect(result.usage.estimatedCostUSD).toBeCloseTo(0.00006, 10);
    expect(result.fallChain).toEqual([]);
  });

  it('closes #8: system messages are extracted to top-level system field', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse({ body: okBody }));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'system', content: 'Reply with one word.' },
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
    expect(body.system).toBe('You are concise.\n\nReply with one word.');
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
    expect(body.messages.some((m) => m.role === 'system')).toBe(false);
  });

  it('closes #8: multiple text blocks concatenated; tool_use blocks ignored', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        body: {
          ...okBody,
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'tool_use', id: 'tu_01', name: 'lookup', input: { x: 1 } },
            { type: 'text', text: 'world!' },
          ],
        },
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const result = await adapter.complete({
      model: 'claude-sonnet-4-7',
      messages: [{ role: 'user', content: 'ping' }],
    });
    expect(result.text).toBe('Hello, world!');
  });

  it('closes #8: HTTP 401 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 401,
        statusText: 'Unauthorized',
        text: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-bogus', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('401');
    expect((caught as Error).message).toContain('invalid x-api-key');
  });

  it('closes #8: HTTP 429 maps to BudgetExceededError (not ProviderUnavailableError)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 429,
        statusText: 'Too Many Requests',
        text: '{"type":"error","error":{"type":"rate_limit_error","message":"rate limit hit"}}',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as Error).message).toContain('429');
    expect((caught as Error).message).toContain('rate limit');
  });

  it('closes #8: HTTP 503 maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockFetchResponse({
        status: 503,
        statusText: 'Service Unavailable',
        text: 'service unavailable',
      }),
    );
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('503');
  });

  it('closes #8: network error maps to ProviderUnavailableError', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    const caught = await adapter
      .complete({ model: 'claude-sonnet-4-7', messages: [{ role: 'user', content: 'ping' }] })
      .catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    expect((caught as Error).message).toContain('failed');
  });

  it('closes #8: requires.tools === true → CapabilityMismatchError before any HTTP', async () => {
    const spy = jest.spyOn(global, 'fetch');
    const adapter = new AnthropicAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-7' });

    await expect(
      adapter.complete({
        model: 'claude-sonnet-4-7',
        messages: [{ role: 'user', content: 'ping' }],
        requires: { tools: true },
      }),
    ).rejects.toBeInstanceOf(CapabilityMismatchError);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes #8: missing apiKey → constructor throws', () => {
    expect(() => new AnthropicAdapter({ model: 'claude-sonnet-4-7' })).toThrow(/requires `apiKey`/);
    expect(() => new AnthropicAdapter({ apiKey: '', model: 'claude-sonnet-4-7' })).toThrow(
      /requires `apiKey`/,
    );
  });
});
