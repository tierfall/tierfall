---
'@tierfall/core': minor
---

Add `formatFallChain(chain)` helper for rendering `FallDiagnostic[]` as a multi-line string suitable for demo logs. Indented numbered-list format; empty chain returns empty string. Useful when surfacing fall chains via `console.log` or in error messages.

Each of the four error classes (`BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, `NoTierAvailableError`) gains a TSDoc `@example` block showing the typical throw site.

Closes #4.
