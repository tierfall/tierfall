import { Router, DefaultPolicy, type LLMRequest } from '@tierfall/core';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';
import { printScenarioHeader, printSuccess, printFailure } from '../banner.js';

/**
 * Scenario 2: budget filter (NOT a fall — teaching moment).
 *
 * With maxCostUSD=0.0001, the policy filters premium and cheap out at
 * pre-flight (both cost more than that per 500+500 token estimate). The
 * router never sees them — fallChain is empty even though they were excluded.
 *
 * This is a *filter*, not a *fall*: the policy filtered them silently
 * before the router got a chance to try them. A fall is something the
 * router records when an adapter throws.
 */
export async function runBudgetFallScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    2,
    'Budget filter (silent — not a fall)',
    'all available adapters; request maxCostUSD=$0.0001',
    'policy filters premium and cheap; local serves; fallChain empty',
  );

  const chain = tierOrderedChain(adapters);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
    maxCostUSD: 0.0001,
  };
  const ordered = new DefaultPolicy().evaluate(request, chain);
  console.log(
    `(policy filtered to ${String(ordered.length)} of ${String(chain.length)} adapter${chain.length === 1 ? '' : 's'}; ` +
      `survivor${ordered.length === 1 ? '' : 's'}: ${ordered.map((a) => a.name).join(', ') || '(none)'})`,
  );
  console.log('');
  if (ordered.length === 0) {
    printFailure(new Error('no survivors — at least Ollama (free) should pass the cost filter'));
    return false;
  }
  const router = new Router(ordered);

  try {
    const response = await router.complete(request);
    printSuccess(response, '(empty — filter pre-empted; not a fall)');
    return response.fallChain.length === 0;
  } catch (err) {
    printFailure(err);
    return false;
  }
}
