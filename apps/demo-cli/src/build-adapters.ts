import { AnthropicAdapter } from '@tierfall/adapter-anthropic';
import { OllamaAdapter } from '@tierfall/adapter-ollama';
import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
import { presets } from '@tierfall/adapter-openai-compatible/presets';
import type { Adapter } from '@tierfall/core';
import type { AdapterStatus } from './banner.js';

export interface AvailableAdapters {
  readonly premium: Adapter | undefined;
  readonly cheap: Adapter | undefined;
  readonly local: Adapter;
}

export interface BuildResult {
  readonly adapters: AvailableAdapters;
  readonly status: readonly AdapterStatus[];
}

/**
 * Construct the demo's adapter set from env vars.
 *
 * Precedence: if both ANTHROPIC_API_KEY and OPENAI_API_KEY are set,
 * Anthropic wins as premium.
 */
export function buildAdapters(env: NodeJS.ProcessEnv): BuildResult {
  const status: AdapterStatus[] = [];
  let premium: Adapter | undefined;

  const anthropicKey = env.ANTHROPIC_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;
  if (anthropicKey !== undefined && anthropicKey !== '') {
    premium = new AnthropicAdapter({ apiKey: anthropicKey, model: 'claude-sonnet-4-7' });
    status.push({
      tier: 'premium-cloud',
      impl: 'anthropic',
      note: '(ANTHROPIC_API_KEY set)',
    });
    if (openaiKey !== undefined && openaiKey !== '') {
      status.push({
        tier: 'premium-cloud',
        impl: undefined,
        note: '— OpenAI ignored: Anthropic takes precedence when both keys set',
      });
    }
  } else if (openaiKey !== undefined && openaiKey !== '') {
    premium = new OpenAICompatibleAdapter(presets.openai({ apiKey: openaiKey }));
    status.push({
      tier: 'premium-cloud',
      impl: 'openai',
      note: '(OPENAI_API_KEY set)',
    });
  } else {
    status.push({
      tier: 'premium-cloud',
      impl: undefined,
      note: '— ANTHROPIC_API_KEY / OPENAI_API_KEY not set',
    });
    console.log('[tierfall] anthropic adapter skipped — ANTHROPIC_API_KEY not set');
    console.log('[tierfall] openai adapter skipped — OPENAI_API_KEY not set');
  }

  let cheap: Adapter | undefined;
  const deepseekKey = env.DEEPSEEK_API_KEY;
  if (deepseekKey !== undefined && deepseekKey !== '') {
    cheap = new OpenAICompatibleAdapter(presets.deepseek({ apiKey: deepseekKey }));
    status.push({
      tier: 'cheap-cloud',
      impl: 'deepseek',
      note: '(DEEPSEEK_API_KEY set)',
    });
  } else {
    status.push({
      tier: 'cheap-cloud',
      impl: undefined,
      note: '— DEEPSEEK_API_KEY not set',
    });
    console.log('[tierfall] deepseek adapter skipped — DEEPSEEK_API_KEY not set');
  }

  const ollamaBaseUrl = env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const local = new OllamaAdapter({ baseUrl: ollamaBaseUrl, model: 'llama3.2:3b' });
  status.push({
    tier: 'on-device',
    impl: 'ollama',
    note: `(${ollamaBaseUrl})`,
  });

  return { adapters: { premium, cheap, local }, status };
}

/** Helper to collect available adapters in tier order (premium → cheap → local). */
export function tierOrderedChain(adapters: AvailableAdapters): readonly Adapter[] {
  const chain: Adapter[] = [];
  if (adapters.premium) chain.push(adapters.premium);
  if (adapters.cheap) chain.push(adapters.cheap);
  chain.push(adapters.local);
  return chain;
}
