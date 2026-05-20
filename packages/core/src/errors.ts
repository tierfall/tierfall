import type { FallDiagnostic } from './types.js';

/**
 * Thrown by an adapter when executing the request would exceed
 * `request.maxCostUSD`. The Router catches this and records a
 * `FallDiagnostic` with `reason: 'budget'` before trying the next adapter.
 *
 * @example
 * ```ts
 * if (estimatedCost > (request.maxCostUSD ?? Infinity)) {
 *   throw new BudgetExceededError(
 *     `estimated cost ${estimatedCost} exceeds cap ${request.maxCostUSD}`,
 *   );
 * }
 * ```
 */
export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError';
}

/**
 * Thrown by an adapter when the request's `requires.*` flags can't be
 * satisfied by this adapter (e.g. tools support, structured output). The
 * Router catches this and records a `FallDiagnostic` with
 * `reason: 'capability'` before trying the next adapter.
 *
 * @example
 * ```ts
 * if (request.requires?.tools === true) {
 *   throw new CapabilityMismatchError(
 *     'this adapter does not support tool calling',
 *   );
 * }
 * ```
 */
export class CapabilityMismatchError extends Error {
  override readonly name = 'CapabilityMismatchError';
}

/**
 * Thrown by an adapter when the provider is unreachable or returns a
 * non-rate-limit failure (network, 4xx, 5xx, malformed response). The
 * Router catches this and records a `FallDiagnostic` with
 * `reason: 'provider-unavailable'` before trying the next adapter.
 *
 * @example
 * ```ts
 * try {
 *   const res = await fetch(url, { method: 'POST' });
 *   if (!res.ok) {
 *     throw new ProviderUnavailableError(
 *       `provider returned ${res.status}: ${await res.text()}`,
 *     );
 *   }
 * } catch (err) {
 *   throw new ProviderUnavailableError(`network failure: ${String(err)}`, err);
 * }
 * ```
 */
export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Thrown by the Router when all adapters in the chain have failed. Carries
 * the full `FallDiagnostic[]` chain so callers can inspect what was tried
 * and why each failed.
 *
 * @example
 * ```ts
 * try {
 *   const response = await router.complete(request);
 *   return response;
 * } catch (err) {
 *   if (err instanceof NoTierAvailableError) {
 *     console.error('All adapters failed:');
 *     console.error(formatFallChain(err.fallChain));
 *   }
 *   throw err;
 * }
 * ```
 */
export class NoTierAvailableError extends Error {
  override readonly name = 'NoTierAvailableError';
  constructor(
    message: string,
    readonly fallChain: readonly FallDiagnostic[],
  ) {
    super(message);
  }
}

/**
 * Render a `FallDiagnostic` chain as a multi-line string suitable for
 * demo logging.
 *
 * Format: indented numbered list, one entry per line. Two leading spaces
 * make the output indent naturally under a parent log line. Empty input
 * returns the empty string — the caller decides whether to print
 * "(no falls)" or nothing at all.
 *
 * Order is preserved: entry index 0 is the first attempt; the highest
 * index is the last failure before either successful fall-through or
 * `NoTierAvailableError`.
 *
 * @example
 * ```ts
 * const response = await router.complete(request);
 * if (response.fallChain.length > 0) {
 *   console.log('Falls before success:');
 *   console.log(formatFallChain(response.fallChain));
 * }
 * // Output:
 * //   1. premium-cloud / premium — budget: estimated cost 0.01 exceeds cap 0.005
 * //   2. cheap-cloud / cheap — provider-unavailable: 503 Service Unavailable
 * ```
 */
export function formatFallChain(chain: readonly FallDiagnostic[]): string {
  return chain
    .map((d, i) => `  ${String(i + 1)}. ${d.tier} / ${d.adapterName} — ${d.reason}: ${d.detail}`)
    .join('\n');
}
