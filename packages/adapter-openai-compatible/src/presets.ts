import type { AdapterCapability } from '@tierfall/core';
import type { OpenAICompatibleAdapterConfig } from './adapter.js';

/**
 * A preset factory bundles a `baseUrl`, default `model`, default `tier`, and
 * `capability` block for a specific OpenAI-compatible provider. The caller
 * supplies `apiKey` (and any overrides) at invocation time.
 *
 * Override merging: top-level fields use shallow merge (override wins);
 * `capability` deep-merges one level (preset's other capability fields are
 * preserved when the user only overrides a subset).
 */
export type PresetFactory = (
  overrides?: Partial<OpenAICompatibleAdapterConfig>,
) => OpenAICompatibleAdapterConfig;

/**
 * The set of v0.1 blessed presets. Explicit interface (not `Record<>`) so that
 * `presets.groq()` returns `OpenAICompatibleAdapterConfig` cleanly under
 * `noUncheckedIndexedAccess: true`.
 */
export interface OpenAICompatiblePresets {
  readonly groq: PresetFactory;
  readonly deepseek: PresetFactory;
  readonly openai: PresetFactory;
  readonly cerebras: PresetFactory;
  readonly openrouter: PresetFactory;
}

function mergePreset(
  base: OpenAICompatibleAdapterConfig,
  overrides?: Partial<OpenAICompatibleAdapterConfig>,
): OpenAICompatibleAdapterConfig {
  const mergedCapability: Partial<AdapterCapability> | undefined =
    base.capability !== undefined || overrides?.capability !== undefined
      ? {
          ...(base.capability ?? {}),
          ...(overrides?.capability ?? {}),
        }
      : undefined;
  return {
    ...base,
    ...overrides,
    ...(mergedCapability !== undefined ? { capability: mergedCapability } : {}),
  };
}

export const presets: OpenAICompatiblePresets = {
  /**
   * Groq — fast inference for Llama / Mixtral / Gemma models.
   *
   * @see https://console.groq.com/docs/models for current model catalog
   * @see https://groq.com/pricing for current rate card
   */
  groq: (overrides) =>
    mergePreset(
      {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        tier: 'cheap-cloud',
        capability: {
          contextWindowTokens: 128_000,
          supportsTools: false,
          supportsStreaming: false,
          supportsStructuredOutput: false,
          costPerMillionInputTokens: 0.59,
          costPerMillionOutputTokens: 0.79,
        },
      },
      overrides,
    ),

  /**
   * DeepSeek — DeepSeek-V3 (`deepseek-chat`) and DeepSeek-R1 (`deepseek-reasoner`).
   *
   * @see https://api-docs.deepseek.com/quick_start/pricing for current rate card
   */
  deepseek: (overrides) =>
    mergePreset(
      {
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        tier: 'cheap-cloud',
        capability: {
          contextWindowTokens: 64_000,
          supportsTools: false,
          supportsStreaming: false,
          supportsStructuredOutput: false,
          costPerMillionInputTokens: 0.27,
          costPerMillionOutputTokens: 1.1,
        },
      },
      overrides,
    ),

  /**
   * OpenAI — the original. Default model is `gpt-5-mini`.
   *
   * @see https://openai.com/api/pricing for current rate card
   */
  openai: (overrides) =>
    mergePreset(
      {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5-mini',
        tier: 'premium-cloud',
        capability: {
          contextWindowTokens: 200_000,
          supportsTools: false,
          supportsStreaming: false,
          supportsStructuredOutput: false,
          costPerMillionInputTokens: 0.15,
          costPerMillionOutputTokens: 0.6,
        },
      },
      overrides,
    ),

  /**
   * Cerebras — wafer-scale inference for Llama models.
   *
   * @see https://inference.cerebras.ai/pricing for current rate card
   */
  cerebras: (overrides) =>
    mergePreset(
      {
        baseUrl: 'https://api.cerebras.ai/v1',
        model: 'llama3.3-70b',
        tier: 'cheap-cloud',
        capability: {
          contextWindowTokens: 8_192,
          supportsTools: false,
          supportsStreaming: false,
          supportsStructuredOutput: false,
          costPerMillionInputTokens: 0.85,
          costPerMillionOutputTokens: 1.2,
        },
      },
      overrides,
    ),

  /**
   * OpenRouter — aggregator routing across many models. Default `model` uses
   * the `provider/model` slug format OpenRouter requires.
   *
   * @see https://openrouter.ai/docs/models for catalog + per-model pricing
   */
  openrouter: (overrides) =>
    mergePreset(
      {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-5-mini',
        tier: 'cheap-cloud',
        capability: {
          contextWindowTokens: 128_000,
          supportsTools: false,
          supportsStreaming: false,
          supportsStructuredOutput: false,
          costPerMillionInputTokens: 0.15,
          costPerMillionOutputTokens: 0.6,
        },
      },
      overrides,
    ),
};
