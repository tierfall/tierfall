import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface OpenAICompatibleAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly tier?: Tier;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Adapter for any OpenAI-compatible Chat Completions API.
 *
 * Covers Groq, DeepSeek, OpenAI itself, Cerebras, OpenRouter, and most
 * self-hosted gateways (vLLM, LM Studio, etc.). The exact tier varies by
 * provider; consumers either pass `tier` explicitly or use a preset from
 * `@tierfall/adapter-openai-compatible/presets`.
 *
 * Skeleton at scaffold; real implementation tracked in issue #6.
 */
export class OpenAICompatibleAdapter implements Adapter {
  readonly name = 'openai-compatible';
  readonly tier: Tier;
  readonly capability: AdapterCapability;

  constructor(config: OpenAICompatibleAdapterConfig) {
    this.tier = config.tier ?? 'cheap-cloud';
    this.capability = {
      contextWindowTokens: 32768,
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
      new Error('OpenAICompatibleAdapter.complete is not yet implemented — see issue #6'),
    );
  }
}
