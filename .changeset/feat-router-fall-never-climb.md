---
'@tierfall/core': minor
---

Implement the Router fall-never-climb state machine. Adapters in the constructor's list are attempted in order; on `BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, or any unexpected error, the router falls to the next adapter and records a `FallDiagnostic` on the response's `fallChain`. When all adapters fail, throws `NoTierAvailableError` carrying the full chain.

Closes #2.
