import type { Adapter, LLMRequest, LLMResponse } from '../src/index.js';

describe('Adapter interface', () => {
  it('can be implemented with the required shape', () => {
    const fake: Adapter = {
      name: 'fake',
      tier: 'on-device',
      capability: {
        contextWindowTokens: 8192,
        supportsTools: false,
        supportsStreaming: false,
        supportsStructuredOutput: false,
        costPerMillionInputTokens: null,
        costPerMillionOutputTokens: null,
      },
      complete: (_request: LLMRequest): Promise<LLMResponse> =>
        Promise.resolve({
          text: 'ok',
          tier: 'on-device',
          model: 'fake',
          usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
          fallChain: [],
        }),
    };
    expect(fake.name).toBe('fake');
    expect(fake.tier).toBe('on-device');
  });
});
