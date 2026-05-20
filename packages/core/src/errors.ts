import type { FallDiagnostic } from './types.js';

export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError';
}

export class CapabilityMismatchError extends Error {
  override readonly name = 'CapabilityMismatchError';
}

export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class NoTierAvailableError extends Error {
  override readonly name = 'NoTierAvailableError';
  constructor(
    message: string,
    readonly fallChain: readonly FallDiagnostic[],
  ) {
    super(message);
  }
}
