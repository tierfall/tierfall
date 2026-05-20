import type { Adapter, AdapterCapability, LLMRequest, LLMResponse, Tier } from '@tierfall/core';

export interface OllamaAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * On-device adapter targeting an Ollama daemon.
 *
 * Skeleton at scaffold; real implementation tracked in issue #5.
 * Defaults reflect typical local-quantized models (e.g., llama3.2:3b) running
 * on the daemon described at `OllamaAdapterConfig.baseUrl` (default
 * `http://localhost:11434`).
 */
export class OllamaAdapter implements Adapter {
  readonly name = 'ollama';
  readonly tier: Tier;
  readonly capability: AdapterCapability;

  constructor(config: OllamaAdapterConfig) {
    this.tier = 'on-device';
    this.capability = {
      contextWindowTokens: 8192,
      supportsTools: false,
      supportsStreaming: true,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: null,
      costPerMillionOutputTokens: null,
      ...config.capability,
    };
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(
      new Error('OllamaAdapter.complete is not yet implemented — see issue #5'),
    );
  }
}
