import { Router } from '../src/router.js';
import type { Adapter } from '../src/adapter.js';

function fakeAdapter(name: string, tier: Adapter['tier']): Adapter {
  return {
    name,
    tier,
    capability: {
      contextWindowTokens: 8192,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: null,
      costPerMillionOutputTokens: null,
    },
    complete: () =>
      Promise.resolve({
        text: `from ${name}`,
        tier,
        model: name,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
        fallChain: [],
      }),
  };
}

describe('Router (issue #2 — currently failing TDD)', () => {
  it('completes via the first adapter when it succeeds', async () => {
    const router = new Router([fakeAdapter('premium', 'premium-cloud')]);
    const result = await router.complete({
      model: 'whatever',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.text).toBe('from premium');
  });
});
