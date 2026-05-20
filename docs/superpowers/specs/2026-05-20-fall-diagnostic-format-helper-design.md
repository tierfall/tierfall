# FallDiagnostic Format Helper — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Issue:** [#4 — feat(core): error taxonomy + FallDiagnostic helper](https://github.com/tierfall/tierfall/issues/4)
**Scope:** Add `formatFallChain(chain): string` to `@tierfall/core`. Add `@example` blocks to the four existing error classes. Single commit.

---

## 1. Goal

Provide a one-call helper that turns a `readonly FallDiagnostic[]` into a multi-line string for demo logs. Demo scenarios (#9) consume this; users can use it directly when surfacing fall chains in their own logging.

## 2. Output format

Indented numbered list. Two leading spaces, slash-separated `tier/adapter`, em-dash, `reason: detail`:

```
  1. premium-cloud / premium — budget: over budget
  2. cheap-cloud / cheap — provider-unavailable: connection refused
  3. on-device / local — capability: tool support required
```

**Empty chain → empty string** `""`. Caller adds "(no falls)" if they want.

**Order preserved** — entry index 0 is the first attempt (premium), highest index is the last attempt before fallout.

## 3. Implementation

````ts
// in packages/core/src/errors.ts

/**
 * Renders a `FallDiagnostic` chain as a multi-line string for demo logs.
 *
 * Format: indented numbered list, one entry per line. Empty input returns
 * the empty string (the caller chooses whether to print "(no falls)" or
 * nothing at all).
 *
 * @example
 * ```ts
 * const response = await router.complete(request);
 * if (response.fallChain.length > 0) {
 *   console.log('Falls before success:');
 *   console.log(formatFallChain(response.fallChain));
 * }
 * ```
 */
export function formatFallChain(chain: readonly FallDiagnostic[]): string {
  return chain
    .map((d, i) => `  ${String(i + 1)}. ${d.tier} / ${d.adapterName} — ${d.reason}: ${d.detail}`)
    .join('\n');
}
````

## 4. TSDoc `@example` blocks on error classes

Each of the 4 error classes in `packages/core/src/errors.ts` gets an `@example` block showing the typical throw-site:

| Error                      | Example shows                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `BudgetExceededError`      | adapter checking estimated cost against `request.maxCostUSD`                                                    |
| `CapabilityMismatchError`  | adapter rejecting `requires.tools` when not implemented                                                         |
| `ProviderUnavailableError` | network failure caught and rethrown with cause                                                                  |
| `NoTierAvailableError`     | Router-side construction with fallChain (the error already carries `fallChain` so the example shows passing it) |

## 5. Tests — 4 in new `packages/core/test/errors.test.ts`

| #   | Name                                                          | Shape                                                                        |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | empty chain → empty string                                    | `formatFallChain([]) === ''`                                                 |
| 2   | single-fall chain → one line with correct format              | check the exact string                                                       |
| 3   | 3-deep chain → three lines in attempt order, joined by `'\n'` | line count + order                                                           |
| 4   | each `reason` value renders verbatim                          | iterates over `'budget' / 'capability' / 'provider-unavailable' / 'unknown'` |

Tests import `formatFallChain` + `FallDiagnostic` type from `../src/index.js` (which re-exports both). Use `@jest/globals` import (consistent with other test files in the package, though core's other tests don't use it — adopt the explicit-import pattern here for new files).

Actually wait — `packages/core/test/router.test.ts` uses `describe/it/expect` from global Jest types (via `@types/jest` per the package's tsconfig.json `"types": ["jest", "node"]`). The core package doesn't import from `@jest/globals` in its existing tests because `@types/jest` globals work fine under its ESLint config. **Skip the `@jest/globals` import — use global jest helpers** to match the package's existing pattern.

## 6. Files changed

| File                                   | Operation                                            |
| -------------------------------------- | ---------------------------------------------------- |
| `packages/core/src/errors.ts`          | Add `formatFallChain` function + 4 `@example` blocks |
| `packages/core/src/index.ts`           | Export `formatFallChain`                             |
| `packages/core/test/errors.test.ts`    | Create (4 tests)                                     |
| `.changeset/feat-format-fall-chain.md` | Create (minor bump)                                  |

## 7. Commit plan

**Single commit:** `feat(core): add formatFallChain helper + @example blocks on error classes`.

A multi-commit ceremony for ~30 lines of code is overkill. All four file changes are conceptually one unit (the helper + its docs + its tests + its changeset).

## 8. Acceptance criteria mapping

| AC from issue #4                                                        | How met                                     |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `formatFallChain(chain): string` returns a multi-line table-like string | §2 format; §3 implementation                |
| Each error class has TSDoc `@example` block                             | §4 — 4 error classes, 4 example blocks      |
| Tests cover empty chain, single-fall, 3-deep                            | §5 — tests #1, #2, #3                       |
| Changeset added                                                         | §6 — `.changeset/feat-format-fall-chain.md` |

## 9. Out of scope

- Color-coded output (ANSI escapes) — terminal-specific, future
- JSON / structured logging variant — adapter consumers can map manually
- Diagnostic summary statistics (counts per reason) — future if useful
- Width-aligned ASCII table — explicitly rejected during brainstorm (option B)
