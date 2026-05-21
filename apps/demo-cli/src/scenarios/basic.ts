import { DefaultPolicy, Router, type LLMRequest } from '@tierfall/core';
import { printFailure, printScenarioHeader, printSuccess } from '../banner.js';
import { tierOrderedChain, type AvailableAdapters } from '../build-adapters.js';

/**
 * Scenario 1: basic chat (happy path).
 *
 * Sends a plain request through whatever adapters are available. The policy
 * orders them by tier; the router lands on the highest-priority one.
 */
export async function runBasicScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    1,
    'Basic chat (happy path)',
    'all available adapters in the chain',
    'first available tier serves; fallChain empty',
  );

  const chain = tierOrderedChain(adapters);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
  };
  const ordered = new DefaultPolicy().evaluate(request, chain);
  if (ordered.length === 0) {
    printFailure(new Error('no adapters available — at least Ollama should be present'));
    return false;
  }
  const router = new Router(ordered);

  try {
    const response = await router.complete(request);
    printSuccess(response);
    return response.fallChain.length === 0;
  } catch (err) {
    printFailure(err);
    return false;
  }
}
