import type { OpenAICompatibleAdapterConfig } from './adapter.js';

/**
 * Presets are pre-configured base URLs + recommended-model defaults for popular
 * OpenAI-compatible providers. They are NOT defaults in code — users still
 * choose which preset (or BYO config) to use.
 *
 * Real implementations land in issue #7.
 */
export type PresetFactory = (
  overrides?: Partial<OpenAICompatibleAdapterConfig>,
) => OpenAICompatibleAdapterConfig;

export const presets: Record<string, PresetFactory> = {
  groq: (_o) => {
    throw new Error('groq preset is not yet implemented — see issue #7');
  },
  deepseek: (_o) => {
    throw new Error('deepseek preset is not yet implemented — see issue #7');
  },
  openai: (_o) => {
    throw new Error('openai preset is not yet implemented — see issue #7');
  },
  cerebras: (_o) => {
    throw new Error('cerebras preset is not yet implemented — see issue #7');
  },
  openrouter: (_o) => {
    throw new Error('openrouter preset is not yet implemented — see issue #7');
  },
};
