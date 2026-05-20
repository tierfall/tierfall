import type { Adapter } from './adapter.js';
import type { LLMRequest, LLMResponse } from './types.js';

/**
 * Router state machine: "Fall, never climb."
 *
 * Given an ordered list of adapters (premium → on-device), the router attempts
 * the first adapter; on failure / budget / capability mismatch, it falls to
 * the next cheaper one. Climbing toward premium requires explicit policy
 * override (not yet implemented; tracked in issue #2).
 */
export class Router {
  readonly adapters: readonly Adapter[];

  constructor(adapters: readonly Adapter[]) {
    if (adapters.length === 0) {
      throw new Error('Router requires at least one adapter');
    }
    this.adapters = adapters;
  }

  complete(_request: LLMRequest): Promise<LLMResponse> {
    return Promise.reject(new Error('Router.complete is not yet implemented — see issue #2'));
  }
}
