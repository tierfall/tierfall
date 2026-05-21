import type { Tier } from './tier.js';

/**
 * A single message in a multi-turn conversation. `system` messages set the
 * model's instructions; `user` carries the human input; `assistant` is the
 * model's prior reply.
 *
 * @example
 * ```ts
 * import type { LLMMessage } from '@tierfall/core';
 *
 * const messages: LLMMessage[] = [
 *   { role: 'system', content: 'You are a concise assistant.' },
 *   { role: 'user', content: 'Summarize the four-tier model.' },
 * ];
 * ```
 */
export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * A single LLM request. Adapters consume this verbatim; the Router passes the
 * same object to every adapter in the fall chain. `maxCostUSD` is the budget
 * ceiling enforced by the policy filter and by adapters at request time.
 * `requires` is the hard-capability gate — adapters that can't honor it are
 * filtered out before any HTTP call.
 *
 * @example
 * ```ts
 * import type { LLMRequest } from '@tierfall/core';
 *
 * const request: LLMRequest = {
 *   model: 'auto',
 *   messages: [{ role: 'user', content: 'Hello, world.' }],
 *   maxOutputTokens: 256,
 *   temperature: 0.2,
 *   maxCostUSD: 0.01,
 *   requires: { minContextWindowTokens: 8_000 },
 * };
 * ```
 */
export interface LLMRequest {
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Hard cap on USD for this single request across any tier. */
  readonly maxCostUSD?: number;
  /** Required capabilities; the router uses these to evaluate fits. */
  readonly requires?: Partial<{
    tools: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    minContextWindowTokens: number;
  }>;
}

/**
 * Usage and cost record attached to every successful `LLMResponse`. Token
 * counts come from the provider when available; `estimatedCostUSD` is the
 * adapter's best-effort post-hoc estimate using its declared per-token rates.
 *
 * @example
 * ```ts
 * import type { LLMUsage } from '@tierfall/core';
 *
 * function loggable(usage: LLMUsage): string {
 *   return `${usage.inputTokens}+${usage.outputTokens} tokens, ~$${usage.estimatedCostUSD.toFixed(4)}`;
 * }
 * ```
 */
export interface LLMUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUSD: number;
}

/**
 * The Router's return shape. `tier` and `fallChain` are the Router's view of
 * the world — the tier that actually served the request, and the ordered list
 * of failed attempts before this one succeeded. The Router OVERRIDES whatever
 * the adapter put on these fields.
 *
 * @example
 * ```ts
 * import type { LLMResponse } from '@tierfall/core';
 *
 * function summarize(response: LLMResponse): string {
 *   const tail = response.fallChain.length > 0
 *     ? ` (after ${response.fallChain.length} falls)`
 *     : '';
 *   return `Served by ${response.tier}${tail}: ${response.text}`;
 * }
 * ```
 */
export interface LLMResponse {
  readonly text: string;
  readonly tier: Tier;
  readonly model: string;
  readonly usage: LLMUsage;
  readonly fallChain: readonly FallDiagnostic[];
}

/**
 * One entry in a fall chain. Captures which adapter failed, on what tier, with
 * what classified reason. The chain is the Router's audit trail; in production
 * telemetry, sample on `reason` to spot adapter trends.
 *
 * @example
 * ```ts
 * import type { FallDiagnostic } from '@tierfall/core';
 *
 * const diag: FallDiagnostic = {
 *   tier: 'premium-cloud',
 *   adapterName: 'anthropic',
 *   reason: 'provider-unavailable',
 *   detail: 'HTTP 503 from api.anthropic.com',
 * };
 * ```
 */
export interface FallDiagnostic {
  readonly tier: Tier;
  readonly adapterName: string;
  readonly reason: 'budget' | 'capability' | 'provider-unavailable' | 'unknown';
  readonly detail: string;
}
