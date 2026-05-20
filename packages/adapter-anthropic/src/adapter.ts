import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface AnthropicAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Premium-cloud adapter targeting Anthropic's Messages API.
 *
 * Skeleton at scaffold; real implementation tracked in issue #8.
 * Defaults reflect the public Claude 3.5+ models — large context windows,
 * tool calls, streaming, and structured output all supported. Costs are
 * placeholder zeros at scaffold; the issue #8 implementation populates
 * real per-model pricing.
 */
export class AnthropicAdapter implements Adapter {
  readonly name = 'anthropic';
  readonly tier: Tier;
  readonly capability: AdapterCapability;

  constructor(config: AnthropicAdapterConfig) {
    this.tier = 'premium-cloud';
    this.capability = {
      contextWindowTokens: 200_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsStructuredOutput: true,
      costPerMillionInputTokens: 0,
      costPerMillionOutputTokens: 0,
      ...config.capability,
    };
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(
      new Error('AnthropicAdapter.complete is not yet implemented — see issue #8'),
    );
  }
}
