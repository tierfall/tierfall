import type { Adapter, AdapterCapability, Tier } from '../../src/index.js';

/**
 * Test-only helper. Constructs an `Adapter` with sensible defaults. Override
 * any field via `overrides`. The default `complete` resolves to a response
 * whose `text` is `"from ${name}"` and whose `tier` matches the adapter — this
 * lets tests assert which adapter actually served the request.
 */
export function fakeAdapter(
  name: string,
  tier: Tier,
  overrides: {
    capability?: Partial<AdapterCapability>;
    complete?: Adapter['complete'];
  } = {},
): Adapter {
  const baseCapability: AdapterCapability = {
    contextWindowTokens: 8192,
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    costPerMillionInputTokens: null,
    costPerMillionOutputTokens: null,
  };
  const capability: AdapterCapability = {
    ...baseCapability,
    ...overrides.capability,
  };
  const complete: Adapter['complete'] =
    overrides.complete ??
    (() =>
      Promise.resolve({
        text: `from ${name}`,
        tier,
        model: name,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 },
        fallChain: [],
      }));
  return { name, tier, capability, complete };
}

/**
 * Test-only helper. Constructs an `Adapter` whose `complete()` always rejects
 * with the given error. Used to assert the router's fall behavior on each
 * thrown error class.
 */
export function throwingAdapter(name: string, tier: Tier, error: Error): Adapter {
  return fakeAdapter(name, tier, {
    complete: () => Promise.reject(error),
  });
}
