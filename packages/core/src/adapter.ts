import type { AdapterCapability, Tier } from './tier.js';
import type { LLMRequest, LLMResponse } from './types.js';

/**
 * The contract every TierFall adapter implements.
 *
 * An adapter:
 * - Declares the tier(s) it can serve via `tier`
 * - Declares its capabilities via `capability`
 * - Executes requests via `complete()`
 *
 * Adapters MUST throw `ProviderUnavailableError` on network/auth failures,
 * `CapabilityMismatchError` if the request's `requires` cannot be satisfied,
 * and `BudgetExceededError` if execution would exceed the request's `maxCostUSD`.
 *
 * Implementations live in their own packages (`@tierfall/adapter-*`).
 * `@tierfall/core` exports this interface only; it never imports any adapter.
 */
export interface Adapter {
  readonly name: string;
  readonly tier: Tier;
  readonly capability: AdapterCapability;
  complete(request: LLMRequest): Promise<LLMResponse>;
}
