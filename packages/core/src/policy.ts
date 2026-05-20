import type { Adapter } from './adapter.js';
import type { AdapterCapability } from './tier.js';
import { TIERS } from './tier.js';
import type { LLMRequest } from './types.js';

/**
 * Declarative policy evaluator: matches a request against available adapters
 * and produces the ordered fallback sequence the Router will attempt.
 */
export interface Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[];
}

/**
 * Estimate the USD cost of a single request given an adapter's per-token pricing.
 * Uses a fixed 500 input + 500 output token budget for v0.1 — a deliberate
 * simplification. A future issue can introduce per-request tokenizer-based
 * estimation. `null` cost (free tier, typically on-device) maps to zero.
 */
function estimateCost(capability: AdapterCapability): number {
  const inputCost = ((capability.costPerMillionInputTokens ?? 0) / 1_000_000) * 500;
  const outputCost = ((capability.costPerMillionOutputTokens ?? 0) / 1_000_000) * 500;
  return inputCost + outputCost;
}

function passesFilters(adapter: Adapter, request: LLMRequest): boolean {
  const { capability } = adapter;
  const requires = request.requires;

  if (requires !== undefined) {
    if (
      requires.minContextWindowTokens !== undefined &&
      capability.contextWindowTokens < requires.minContextWindowTokens
    ) {
      return false;
    }
    if (requires.tools === true && !capability.supportsTools) {
      return false;
    }
    if (requires.streaming === true && !capability.supportsStreaming) {
      return false;
    }
    if (requires.structuredOutput === true && !capability.supportsStructuredOutput) {
      return false;
    }
  }

  if (request.maxCostUSD !== undefined && estimateCost(capability) > request.maxCostUSD) {
    return false;
  }

  return true;
}

/**
 * Default policy: filter by `request.requires` and `request.maxCostUSD`, then
 * stable-sort survivors by tier-index ascending (premium-cloud first, on-device
 * last). Result is pure — no I/O, no mutation of inputs.
 */
export class DefaultPolicy implements Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[] {
    const filtered = adapters.filter((adapter) => passesFilters(adapter, request));
    return [...filtered].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  }
}
