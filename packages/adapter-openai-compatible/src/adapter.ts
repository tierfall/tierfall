import {
  CapabilityMismatchError,
  type Adapter,
  type AdapterCapability,
  type LLMRequest,
  type LLMResponse,
  type Tier,
} from '@tierfall/core';
import { postChatCompletions } from './http.js';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAICompatibleAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly tier?: Tier;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Adapter for any OpenAI-compatible Chat Completions API: OpenAI, Groq,
 * DeepSeek, Cerebras, OpenRouter, vLLM, LM Studio, and most self-hosted
 * inference servers.
 *
 * Unlike Anthropic, system messages stay in the `messages` array — OpenAI
 * accepts `role: 'system'` natively.
 *
 * **Tier is per-instance.** Defaults to `'cheap-cloud'`; pass `config.tier`
 * to override, or use a preset from `@tierfall/adapter-openai-compatible/presets`
 * (issue #7) for blessed provider configurations.
 *
 * **API key required.** OpenAI-compatible endpoints authenticate via Bearer.
 * The constructor throws if `config.apiKey` is missing.
 *
 * **v0.1 capability conservatism.** `supportsTools`, `supportsStreaming`,
 * and `supportsStructuredOutput` are `false` by default. The adapter doesn't
 * yet implement wire-level support for any of them; those land in v0.4. A
 * `requires.tools === true` request rejects pre-HTTP with
 * `CapabilityMismatchError`. Override per-instance via `config.capability`
 * if you know your provider supports a feature AND understand the adapter
 * limitation.
 */
export class OpenAICompatibleAdapter implements Adapter {
  readonly name = 'openai-compatible';
  readonly tier: Tier;
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(config: OpenAICompatibleAdapterConfig) {
    if (config.apiKey === undefined || config.apiKey === '') {
      throw new Error(
        'OpenAICompatibleAdapter requires `apiKey` in config (authenticated via Authorization: Bearer header).',
      );
    }
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.tier = config.tier ?? 'cheap-cloud';
    this.capability = {
      contextWindowTokens: 32_768,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: 0,
      costPerMillionOutputTokens: 0,
      ...config.capability,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'OpenAI-compatible adapter does not support tool calling yet — landing in v0.4',
      );
    }

    const data = await postChatCompletions(this.baseUrl, this.apiKey, {
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      stream: false,
    });

    const firstChoice = data.choices[0];
    const text = firstChoice?.message.content ?? '';

    const inputCost =
      ((this.capability.costPerMillionInputTokens ?? 0) / 1_000_000) * data.usage.prompt_tokens;
    const outputCost =
      ((this.capability.costPerMillionOutputTokens ?? 0) / 1_000_000) *
      data.usage.completion_tokens;

    return {
      text,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        estimatedCostUSD: inputCost + outputCost,
      },
      fallChain: [],
    };
  }
}
