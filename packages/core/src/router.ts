import type { Adapter } from './adapter.js';
import type { FallDiagnostic, LLMRequest, LLMResponse } from './types.js';
import {
  BudgetExceededError,
  CapabilityMismatchError,
  NoTierAvailableError,
  ProviderUnavailableError,
} from './errors.js';

/**
 * Maps a caught error to the corresponding `FallDiagnostic.reason`.
 *
 * Uses both `instanceof` (the fast path for normal in-process throws) and a
 * `name`-string fallback. The fallback matters when an error crosses package
 * boundaries in dual-package-hazard environments — `instanceof` can fail
 * silently when two installs of `@tierfall/core` produce two distinct
 * `Error` subclasses with the same name. Both checks are cheap; doing both
 * is defense in depth.
 */
function reasonOf(err: unknown): FallDiagnostic['reason'] {
  if (err instanceof BudgetExceededError) return 'budget';
  if (err instanceof CapabilityMismatchError) return 'capability';
  if (err instanceof ProviderUnavailableError) return 'provider-unavailable';
  if (err instanceof Error) {
    switch (err.name) {
      case 'BudgetExceededError':
        return 'budget';
      case 'CapabilityMismatchError':
        return 'capability';
      case 'ProviderUnavailableError':
        return 'provider-unavailable';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

function detailOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first; on any thrown error, it records a `FallDiagnostic` and tries the
 * next. Climbing toward a more expensive tier requires an explicit policy
 * override and is not implemented in v0.1.
 *
 * The router OVERRIDES `LLMResponse.tier` and `LLMResponse.fallChain` so that
 * the returned values reflect the router's view of the world — the adapter
 * that actually served the request, and the chain of attempts it made.
 *
 * @example
 * Basic three-tier setup (premium → cheap → local):
 * ```ts
 * import { Router } from '@tierfall/core';
 * import { AnthropicAdapter } from '@tierfall/adapter-anthropic';
 * import { OpenAICompatibleAdapter } from '@tierfall/adapter-openai-compatible';
 * import { OllamaAdapter } from '@tierfall/adapter-ollama';
 *
 * const router = new Router([
 *   new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-sonnet-4-7' }),
 *   new OpenAICompatibleAdapter({ baseUrl: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY!, model: 'deepseek-chat' }),
 *   new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2:3b' }),
 * ]);
 *
 * const response = await router.complete({
 *   model: 'auto',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * console.log(response.text);             // adapter-produced content
 * console.log(response.tier);             // tier of the adapter that served
 * console.log(response.fallChain.length); // 0 if first adapter succeeded
 * ```
 *
 * @example
 * Inspecting a fall chain after a failure cascade:
 * ```ts
 * try {
 *   const response = await router.complete(request);
 *   for (const fall of response.fallChain) {
 *     console.warn(`fell from ${fall.tier} (${fall.adapterName}): ${fall.reason} — ${fall.detail}`);
 *   }
 * } catch (err) {
 *   if (err instanceof NoTierAvailableError) {
 *     console.error('All adapters failed:', err.fallChain);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 */
export class Router {
  readonly adapters: readonly Adapter[];

  constructor(adapters: readonly Adapter[]) {
    if (adapters.length === 0) {
      throw new Error('Router requires at least one adapter');
    }
    this.adapters = adapters;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const fallChain: FallDiagnostic[] = [];
    for (const adapter of this.adapters) {
      try {
        const response = await adapter.complete(request);
        return {
          ...response,
          tier: adapter.tier,
          fallChain: [...fallChain],
        };
      } catch (err: unknown) {
        fallChain.push({
          tier: adapter.tier,
          adapterName: adapter.name,
          reason: reasonOf(err),
          detail: detailOf(err),
        });
      }
    }
    throw new NoTierAvailableError('All adapters failed; see fallChain for diagnostics', fallChain);
  }
}
