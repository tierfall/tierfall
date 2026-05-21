import {
  CapabilityMismatchError,
  type Adapter,
  type AdapterCapability,
  type LLMRequest,
  type LLMResponse,
  type Tier,
} from '@tierfall/core';
import { postMessages } from './http.js';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_INPUT_COST_PER_MTOK = 3;
const DEFAULT_OUTPUT_COST_PER_MTOK = 15;

export interface AnthropicAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * Premium-cloud adapter targeting Anthropic's Messages API. Translates
 * `LLMRequest` to Anthropic's `POST /v1/messages` shape and back:
 *
 * - **System messages** are extracted from `request.messages` and concatenated
 *   into the top-level `system` field (Anthropic forbids `role: 'system'` in
 *   `messages`).
 * - **Content blocks** in the response are filtered to `type: 'text'`; the
 *   `text` fields are concatenated. `tool_use` and other block types are
 *   silently ignored in v0.1.
 * - **`max_tokens`** is required by Anthropic. Defaults to 4096; override via
 *   `request.maxOutputTokens`.
 *
 * **API key required.** Anthropic authenticates via `x-api-key`. The
 * constructor throws if `config.apiKey` is missing — that's a config bug,
 * not a runtime fall.
 *
 * **v0.1 capability conservatism.** `supportsTools`, `supportsStreaming`,
 * and `supportsStructuredOutput` are set to `false` even though the
 * underlying Claude Sonnet 4.7 model supports them. The adapter doesn't
 * yet implement wire-level tool calling, streaming, or structured output;
 * those land in v0.4. A `requires.tools === true` request is rejected
 * pre-HTTP with `CapabilityMismatchError`.
 */
export class AnthropicAdapter implements Adapter {
  readonly name = 'anthropic';
  readonly tier: Tier = 'premium-cloud';
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string;

  constructor(config: AnthropicAdapterConfig) {
    if (config.apiKey === undefined || config.apiKey === '') {
      throw new Error(
        "AnthropicAdapter requires `apiKey` in config (Anthropic's Messages API authenticates via x-api-key header).",
      );
    }
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.capability = {
      contextWindowTokens: 200_000,
      supportsTools: false,
      supportsStreaming: false,
      supportsStructuredOutput: false,
      costPerMillionInputTokens: DEFAULT_INPUT_COST_PER_MTOK,
      costPerMillionOutputTokens: DEFAULT_OUTPUT_COST_PER_MTOK,
      ...config.capability,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'Anthropic adapter does not support tool calling yet — landing in v0.4 alongside wire-level integration',
      );
    }

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const otherMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const data = await postMessages(this.baseUrl, this.apiKey, {
      model: this.model,
      messages: otherMessages,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      ...(systemMessages.length > 0
        ? { system: systemMessages.map((m) => m.content).join('\n\n') }
        : {}),
    });

    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    const inputCost =
      ((this.capability.costPerMillionInputTokens ?? 0) / 1_000_000) * data.usage.input_tokens;
    const outputCost =
      ((this.capability.costPerMillionOutputTokens ?? 0) / 1_000_000) * data.usage.output_tokens;

    return {
      text,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        estimatedCostUSD: inputCost + outputCost,
      },
      fallChain: [],
    };
  }
}
