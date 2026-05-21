import {
  CapabilityMismatchError,
  type Adapter,
  type AdapterCapability,
  type LLMRequest,
  type LLMResponse,
  type Tier,
} from '@tierfall/core';
import { postChat } from './http.js';

export interface OllamaAdapterConfig {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly capability?: Partial<AdapterCapability>;
}

/**
 * On-device adapter targeting an Ollama daemon. Translates `LLMRequest` to
 * Ollama's `POST /api/chat` shape and back. Free (cost is null); availability
 * depends on the daemon.
 *
 * Default `baseUrl` is `http://localhost:11434`. `apiKey` is accepted in the
 * config for parity with cloud adapters but is ignored — Ollama doesn't
 * authenticate.
 *
 * Tool calling is **not** supported in v0.1; a request with
 * `requires.tools === true` rejects with `CapabilityMismatchError` before any
 * HTTP traffic. Streaming and structured output also unsupported in v0.1.
 */
export class OllamaAdapter implements Adapter {
  readonly name = 'ollama';
  readonly tier: Tier = 'on-device';
  readonly capability: AdapterCapability;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaAdapterConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model;
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

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (request.requires?.tools === true) {
      throw new CapabilityMismatchError(
        'Ollama does not support tool calling yet — landing in v0.4',
      );
    }

    const data = await postChat(this.baseUrl, {
      model: this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    });

    return {
      text: data.message.content,
      tier: this.tier,
      model: this.model,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        estimatedCostUSD: 0,
      },
      fallChain: [],
    };
  }
}
