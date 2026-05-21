import { NoTierAvailableError, Router, type LLMRequest } from '@tierfall/core';
import { printExpectedThrow, printFailure, printScenarioHeader } from '../banner.js';
import { type AvailableAdapters } from '../build-adapters.js';

/**
 * Scenario 3: capability mismatch (force-isolate to local).
 *
 * To hit NoTierAvailableError (the AC), we construct Router with only
 * the local adapter — bypassing the policy. If we used the policy, it
 * would filter Ollama out (capability `supportsTools: false`), return
 * `[]`, and `new Router([])` would throw the wrong error type.
 *
 * Going adapter-direct lets the request reach the adapter, where Ollama's
 * pre-HTTP check throws CapabilityMismatchError. The router catches it and
 * builds the NoTierAvailableError. fallChain has one entry with
 * reason: 'capability'.
 */
export async function runCapabilityScenario(adapters: AvailableAdapters): Promise<boolean> {
  printScenarioHeader(
    3,
    'Capability mismatch (NoTierAvailableError expected)',
    'force-isolated chain: [local only]; request requires.tools=true',
    "ollama rejects pre-HTTP; router throws NoTierAvailableError with reason='capability'",
  );

  const router = new Router([adapters.local]);
  const request: LLMRequest = {
    model: 'auto',
    messages: [{ role: 'user', content: "Reply with exactly 'ok'." }],
    requires: { tools: true },
  };

  try {
    const response = await router.complete(request);
    printFailure(new Error(`expected throw, got response: tier=${response.tier}`));
    return false;
  } catch (err) {
    if (err instanceof NoTierAvailableError) {
      printExpectedThrow(err.fallChain);
      return err.fallChain.length === 1 && err.fallChain[0]?.reason === 'capability';
    }
    printFailure(err);
    return false;
  }
}
