/**
 * The four routing tiers TierFall recognizes.
 * Order is significant: lower index = "more expensive / more capable".
 * Falling moves toward higher index. Climbing moves toward lower index
 * and requires explicit policy override.
 */
export const TIERS = ['premium-cloud', 'cheap-cloud', 'self-hosted-edge', 'on-device'] as const;

export type Tier = (typeof TIERS)[number];

/**
 * The capabilities an adapter declares it can satisfy.
 * Used by the Router to match a request's needs against available adapters
 * and to detect capability mismatches that trigger a fall.
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
