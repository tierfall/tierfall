/**
 * The four routing tiers TierFall recognizes.
 * Order is significant: lower index = "more expensive / more capable".
 * Falling moves toward higher index. Climbing moves toward lower index
 * and requires explicit policy override.
 *
 * @example
 * Iterate from cheapest to most expensive (reverse) to display tier badges:
 * ```ts
 * import { TIERS } from '@tierfall/core';
 *
 * for (const tier of [...TIERS].reverse()) {
 *   console.log(`tier badge: ${tier}`);
 * }
 * // on-device
 * // self-hosted-edge
 * // cheap-cloud
 * // premium-cloud
 * ```
 */
export const TIERS = ['premium-cloud', 'cheap-cloud', 'self-hosted-edge', 'on-device'] as const;

/**
 * One of the four routing tiers. Derived from {@link TIERS} so the union
 * stays in sync with the array.
 *
 * @example
 * ```ts
 * import type { Tier } from '@tierfall/core';
 *
 * function badge(tier: Tier): string {
 *   return tier === 'on-device' ? '🏠' : tier === 'premium-cloud' ? '🚀' : '☁️';
 * }
 * ```
 */
export type Tier = (typeof TIERS)[number];

/**
 * The capabilities an adapter declares it can satisfy.
 * Used by the Router to match a request's needs against available adapters
 * and to detect capability mismatches that trigger a fall.
 *
 * @example
 * A typical cheap-cloud adapter's declared capability:
 * ```ts
 * import type { AdapterCapability } from '@tierfall/core';
 *
 * const groqCapability: AdapterCapability = {
 *   contextWindowTokens: 128_000,
 *   supportsTools: false,           // v0.1 conservative default
 *   supportsStreaming: false,
 *   supportsStructuredOutput: false,
 *   costPerMillionInputTokens: 0.59,
 *   costPerMillionOutputTokens: 0.79,
 * };
 * ```
 *
 * @example
 * A free on-device adapter uses `null` cost:
 * ```ts
 * const ollamaCapability: AdapterCapability = {
 *   contextWindowTokens: 8_192,
 *   supportsTools: false,
 *   supportsStreaming: false,
 *   supportsStructuredOutput: false,
 *   costPerMillionInputTokens: null,
 *   costPerMillionOutputTokens: null,
 * };
 * ```
 */
export interface AdapterCapability {
  readonly contextWindowTokens: number;
  readonly supportsTools: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsStructuredOutput: boolean;
  /** Estimated USD per million input tokens. `null` for free (e.g., on-device). */
  readonly costPerMillionInputTokens: number | null;
  /** Estimated USD per million output tokens. `null` for free. */
  readonly costPerMillionOutputTokens: number | null;
}
