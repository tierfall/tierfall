import type { Adapter } from './adapter.js';
import type { LLMRequest } from './types.js';

/**
 * Declarative policy evaluator: matches a request against available adapters
 * and produces the ordered fallback sequence the Router will attempt.
 *
 * Real implementation tracked in issue #3.
 */
export interface Policy {
  evaluate(request: LLMRequest, adapters: readonly Adapter[]): readonly Adapter[];
}

export class DefaultPolicy implements Policy {
  evaluate(_request: LLMRequest, _adapters: readonly Adapter[]): readonly Adapter[] {
    throw new Error('DefaultPolicy.evaluate is not yet implemented — see issue #3');
  }
}
