# FallDiagnostic Format Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `formatFallChain(chain): string` to `@tierfall/core`. Add `@example` blocks to the four existing error classes. Single commit, ~30 lines of impl + 4 tests + changeset.

**Architecture:** Pure stateless function in `packages/core/src/errors.ts`. Indented numbered-list format. Empty array → empty string. Exported from package index. Tested in a new `test/errors.test.ts`.

**Tech Stack:** TypeScript 6.0.3, Jest 29.7.0, ts-jest 29.4.10. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-20-fall-diagnostic-format-helper-design.md`
**Tracked issue:** [#4](https://github.com/tierfall/tierfall/issues/4)
**Branch:** `feat/error-helper`

---

## File map

| File                                   | Operation | Responsibility                                               |
| -------------------------------------- | --------- | ------------------------------------------------------------ |
| `packages/core/src/errors.ts`          | Modify    | Add `formatFallChain` + `@example` blocks on 4 error classes |
| `packages/core/src/index.ts`           | Modify    | Export `formatFallChain`                                     |
| `packages/core/test/errors.test.ts`    | Create    | 4 tests covering empty, single, 3-deep, all-reason coverage  |
| `.changeset/feat-format-fall-chain.md` | Create    | `@tierfall/core` minor bump                                  |

---

## Constraints recap

- No `any` outside test files. No `// eslint-disable*`. No `// @ts-*`.
- Sign commit (`git commit -s`). Never `--no-verify`.
- `core:test` must end with all tests green (was 24 before — 6 router + 11 policy + 6 integration + 1 adapter shape; now 28 with 4 new error tests).
- Core test file uses global Jest (per `@types/jest` + tsconfig `"types": ["jest", "node"]`). New `errors.test.ts` follows this — no `@jest/globals` import needed in this package.

---

## Task 1 — Implement `formatFallChain` + `@example` blocks

**Files:**

- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Replace `packages/core/src/errors.ts` contents**

````ts
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
 *   const res = await fetch(url, { ... });
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
````

- [ ] **Step 2: Update `packages/core/src/index.ts`**

Find the existing block exporting from `./errors.js`:

```ts
export {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
  NoTierAvailableError,
} from './errors.js';
```

Add `formatFallChain` to the same export:

```ts
export {
  BudgetExceededError,
  CapabilityMismatchError,
  ProviderUnavailableError,
  NoTierAvailableError,
  formatFallChain,
} from './errors.js';
```

- [ ] **Step 3: Build + lint + typecheck**

```bash
pnpm exec nx run-many --target=build --projects=core
pnpm exec eslint --max-warnings=0 packages/core
pnpm --filter @tierfall/core typecheck
```

All: exit 0. The build should produce updated `.d.ts` with `formatFallChain` in `packages/core/dist/index.d.ts`.

Verify the export appears:

```bash
grep -c 'formatFallChain' packages/core/dist/index.d.ts
```

Expected: at least `2` (declaration + the `@example` block referencing it from `NoTierAvailableError`).

---

## Task 2 — Add tests

**Files:**

- Create: `packages/core/test/errors.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { formatFallChain, type FallDiagnostic } from '../src/index.js';

describe('formatFallChain (closes #4)', () => {
  it('closes #4: empty chain returns empty string', () => {
    expect(formatFallChain([])).toBe('');
  });

  it('closes #4: single-fall chain returns one indented line with correct shape', () => {
    const chain: readonly FallDiagnostic[] = [
      {
        tier: 'premium-cloud',
        adapterName: 'premium',
        reason: 'budget',
        detail: 'over budget',
      },
    ];
    expect(formatFallChain(chain)).toBe('  1. premium-cloud / premium — budget: over budget');
  });

  it('closes #4: 3-deep chain returns three lines in attempt order, no trailing newline', () => {
    const chain: readonly FallDiagnostic[] = [
      {
        tier: 'premium-cloud',
        adapterName: 'premium',
        reason: 'provider-unavailable',
        detail: 'p down',
      },
      {
        tier: 'cheap-cloud',
        adapterName: 'cheap',
        reason: 'budget',
        detail: 'cheap over',
      },
      {
        tier: 'on-device',
        adapterName: 'local',
        reason: 'capability',
        detail: 'no tools',
      },
    ];
    const result = formatFallChain(chain);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('  1. premium-cloud / premium — provider-unavailable: p down');
    expect(lines[1]).toBe('  2. cheap-cloud / cheap — budget: cheap over');
    expect(lines[2]).toBe('  3. on-device / local — capability: no tools');
    expect(result.endsWith('\n')).toBe(false);
  });

  it('closes #4: every reason value renders verbatim', () => {
    const reasons: FallDiagnostic['reason'][] = [
      'budget',
      'capability',
      'provider-unavailable',
      'unknown',
    ];
    for (const reason of reasons) {
      const out = formatFallChain([{ tier: 'cheap-cloud', adapterName: 'x', reason, detail: 'd' }]);
      expect(out).toBe(`  1. cheap-cloud / x — ${reason}: d`);
    }
  });
});
```

- [ ] **Step 2: Build core (so its dist has the new export) + run tests**

```bash
pnpm exec nx run-many --target=build --projects=core
pnpm --filter @tierfall/core test 2>&1 | grep -E "(PASS|FAIL|Tests:)"
```

Expected: `Tests: 28 passed, 28 total` (24 existing + 4 new).

If any of the 4 new tests fail, **stop** and inspect — the output string is the most likely culprit (em-dash vs hyphen, single vs double space, etc.).

---

## Task 3 — Add changeset + commit

**Files:**

- Create: `.changeset/feat-format-fall-chain.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
'@tierfall/core': minor
---

Add `formatFallChain(chain)` helper for rendering `FallDiagnostic[]` as a multi-line string suitable for demo logs. Indented numbered-list format; empty chain returns empty string. Useful when surfacing fall chains via `console.log` or in error messages.

Each of the four error classes (`BudgetExceededError`, `CapabilityMismatchError`, `ProviderUnavailableError`, `NoTierAvailableError`) gains a TSDoc `@example` block showing the typical throw site.

Closes #4.
```

- [ ] **Step 2: Verify changeset status**

```bash
pnpm exec changeset status 2>&1 | head -10
```

Expected: `@tierfall/core` and the three adapter packages listed at minor (linked-mode).

- [ ] **Step 3: Final local check**

```bash
pnpm run check
```

Expected: all green. **Workspace-wide green for the second consecutive PR** (the first was #7).

- [ ] **Step 4: Single commit**

```bash
git add packages/core/src/errors.ts \
        packages/core/src/index.ts \
        packages/core/test/errors.test.ts \
        .changeset/feat-format-fall-chain.md
git commit -s -m "feat(core): add formatFallChain helper + @example blocks on error classes

formatFallChain(chain) renders a FallDiagnostic[] as a multi-line
indented numbered list, one entry per line. Empty chain returns
empty string. Order preserved (entry index 0 = first attempt).

Format example:
    1. premium-cloud / premium — budget: estimated cost 0.01 exceeds cap 0.005
    2. cheap-cloud / cheap — provider-unavailable: 503 Service Unavailable

Plus @example blocks on the four error classes showing their
typical throw sites: BudgetExceededError, CapabilityMismatchError,
ProviderUnavailableError, NoTierAvailableError. NoTierAvailableError's
example demonstrates pairing with formatFallChain.

4 new tests in test/errors.test.ts: empty, single, 3-deep ordering,
all-reason-value coverage.

Closes #4."
```

---

## Final verification before opening the PR

- [ ] **Step 1: Branch state**

```bash
git log --oneline develop..HEAD
```

Expected: 2 commits (spec + implementation).

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/error-helper
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --base develop \
  --head feat/error-helper \
  --title "feat(core): formatFallChain helper + error class @example blocks" \
  --body-file - <<'BODY'
## Summary

Implements `formatFallChain(chain): string` in `@tierfall/core` and adds TSDoc `@example` blocks to all four error classes. Closes #4.

This is supporting work for #9 (demo scenarios) — gives the demo a one-liner to render fall chains in console output.

## Acceptance criteria

- [x] `formatFallChain(chain): string` returns a multi-line table-like string
- [x] Each error class has a TSDoc `@example` block
- [x] Tests cover empty chain, single-fall, 3-deep
- [x] Changeset added (`@tierfall/core` minor)

## Format

Indented numbered list, one entry per line. Two-space indent. `tier / adapter — reason: detail`. Empty chain returns empty string.

```

1. premium-cloud / premium — budget: estimated cost 0.01 exceeds cap 0.005
2. cheap-cloud / cheap — provider-unavailable: 503 Service Unavailable

````

## How to validate locally

```bash
pnpm install
pnpm --filter @tierfall/core test    # 28 green (24 existing + 4 new)
pnpm run check                       # workspace-wide green
````

BODY

````

- [ ] **Step 4: Watch CI**

Use Monitor on `gh pr checks <PR#>` until all checks complete. Expect all 13 checks green.

- [ ] **Step 5: Merge**

```bash
gh pr merge <PR#> --merge --delete-branch --admin
````

- [ ] **Step 6: Move board card to Done; pull develop**

```bash
source "$CLAUDE_JOB_DIR/project-ids.sh"
ITEM_ID=$(gh api graphql -f query='{ organization(login: "tierfall") { projectV2(number: 1) { items(first: 50) { nodes { id content { ... on Issue { number } } } } } } }' --jq '.data.organization.projectV2.items.nodes[] | select(.content.number==4) | .id')
gh project item-edit --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_DONE_ID" --project-id "$PROJECT_ID" > /dev/null

git checkout develop
git pull --ff-only origin develop
git log --oneline -5
```
