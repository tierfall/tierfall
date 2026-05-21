import {
  NoTierAvailableError,
  ProviderUnavailableError,
  Router,
  type Adapter,
  type LLMRequest,
} from '@tierfall/core';
import { printExpectedThrow, printFailure, printScenarioHeader, printSuccess } from '../banner.js';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';

/**
 * Wrap an adapter so its `complete` always rejects with ProviderUnavailableError.
 * Lets the demo simulate the highest-priority provider being offline.
 */
function wrapWithProviderDown(adapter: Adapter): Adapter {
  return {
    name: adapter.name,
    tier: adapter.tier,
    capability: adapter.capability,
    complete: () =>
      Promise.reject(new ProviderUnavailableError(`${adapter.name} simulated as offline`)),
  };
}

/**
 * Scenario 4: provider down (router falls past).
 *
 * Wraps the highest-priority adapter to throw ProviderUnavailableError on
 * every request. Router catches, records a FallDiagnostic, advances to the
 * next adapter, which serves.
 *
 * Degenerate case: if only local is available, wrap local — the result is
 * NoTierAvailableError with a 1-deep chain. Still demonstrates the fall.
 */
export async function runProviderDownScenario(adapters: AvailableAdapters): Promise<boolean> {
  const baseChain = tierOrderedChain(adapters);
  if (baseChain.length === 0) {
    printScenarioHeader(4, 'Provider down', 'no adapters available', 'cannot run');
    printFailure(new Error('no adapters available'));
    return false;
  }

  const firstAdapter = baseChain[0];
  if (firstAdapter === undefined) {
    printFailure(new Error('unreachable: baseChain.length > 0 but [0] is undefined'));
    return false;
  }
  const patchedFirst = wrapWithProviderDown(firstAdapter);
  const patchedChain = [patchedFirst, ...baseChain.slice(1)];

  const isDegenerate = baseChain.length === 1;
  printScenarioHeader(
    4,
    'Provider down (router falls past)',
    `chain: [${baseChain.map((a) => a.name).join(', ')}]; wrapping ${firstAdapter.name} to throw ProviderUnavailable`,
    isDegenerate
      ? "single-adapter degenerate case → NoTierAvailableError with reason='provider-unavailable'"
      : "router falls past wrapped adapter; fallChain[0].reason='provider-unavailable'",
  );

  const router = new Router(patchedChain);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
  };

  try {
    const response = await router.complete(request);
    printSuccess(response);
    return (
      response.fallChain.length >= 1 && response.fallChain[0]?.reason === 'provider-unavailable'
    );
  } catch (err) {
    if (err instanceof NoTierAvailableError && isDegenerate) {
      printExpectedThrow(err.fallChain);
      return err.fallChain.length === 1 && err.fallChain[0]?.reason === 'provider-unavailable';
    }
    printFailure(err);
    return false;
  }
}
